import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, type S3ClientConfig } from '@aws-sdk/client-s3';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { db } from './apiRouter';

const TMP_DIR = '/app/data/.tmp';
const LOCAL_MIRROR_DIR = '/app/data/backups';
const LOG_FILE = '/app/data/backup.log';
const LOCAL_MAX_AGE_DAYS = 2;

export interface BackupResult {
  key: string;
  size: number;
  durationMs: number;
  uploaded: boolean;
}

export interface BackupObject {
  key: string;
  size: number;
  lastModified: Date;
}

export interface LogEntry {
  ts: string;
  action: 'backup' | 'upload' | 'retention';
  status: 'ok' | 'failed';
  key?: string;
  size?: number;
  error?: string;
}

// sqlite3 Database.backup is not in @types/sqlite3; declare the signature.
type DbWithBackup = sqlite3.Database & {
  backup(filename: string, callback: (err: Error | null) => void): void;
};
const dbBackup = promisify((db as unknown as DbWithBackup).backup.bind(db)) as (filename: string) => Promise<void>;

let _client: S3Client | null = null;
function clientFactory(): S3Client | null {
  const cfg = readR2Config();
  if (!cfg) return null;
  if (_client) return _client;
  const s3Config: S3ClientConfig = {
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: false,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
  };
  _client = new S3Client(s3Config);
  return _client;
}

export function readR2Config(): {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
} | null {
  const endpoint = process.env.R2_ENDPOINT;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const region = process.env.R2_REGION || 'auto';
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, bucket, accessKeyId, secretAccessKey, region };
}

export function getMissingR2EnvVars(): string[] {
  const missing: string[] = [];
  if (!process.env.R2_ENDPOINT) missing.push('R2_ENDPOINT');
  if (!process.env.R2_BUCKET) missing.push('R2_BUCKET');
  if (!process.env.R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!process.env.R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');
  return missing;
}

export function writeLogEntry(entry: LogEntry): void {
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (err) {
    console.error('No se pudo escribir en backup.log:', (err as Error).message);
  }
}

export async function readLastLogEntry(): Promise<LogEntry | null> {
  try {
    if (!fs.existsSync(LOG_FILE)) return null;
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;
    const last = lines[lines.length - 1];
    return JSON.parse(last) as LogEntry;
  } catch (err) {
    console.error('No se pudo leer backup.log:', (err as Error).message);
    return null;
  }
}

export async function listRecentLog(limit = 20): Promise<LogEntry[]> {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().length > 0);
    const entries: LogEntry[] = [];
    for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
      try {
        entries.push(JSON.parse(lines[i]) as LogEntry);
      } catch {
        // skip malformed line
      }
    }
    return entries;
  } catch (err) {
    console.error('No se pudo listar backup.log:', (err as Error).message);
    return [];
  }
}

export async function runBackup(): Promise<BackupResult> {
  const start = Date.now();
  const cfg = readR2Config();
  if (!cfg) {
    const err: BackupResult & { _noR2?: boolean } = {
      key: '',
      size: 0,
      durationMs: 0,
      uploaded: false,
    };
    writeLogEntry({
      ts: new Date().toISOString(),
      action: 'backup',
      status: 'failed',
      error: 'R2 env vars missing',
    });
    throw new Error('R2 env vars missing');
  }

  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.mkdirSync(LOCAL_MIRROR_DIR, { recursive: true });

  const ts = Date.now();
  const datePrefix = new Date(ts).toISOString().slice(0, 10);
  const fileName = `database-${ts}.sqlite`;
  const tmpPath = path.join(TMP_DIR, fileName);
  const localPath = path.join(LOCAL_MIRROR_DIR, datePrefix, fileName);
  const key = `backups/${datePrefix}/${fileName}`;

  // 1. db.backup() → tmp
  try {
    await dbBackup(tmpPath);
  } catch (err) {
    const msg = (err as Error).message;
    writeLogEntry({ ts: new Date().toISOString(), action: 'backup', status: 'failed', error: msg });
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch { /* ignore */ }
    throw err;
  }

  const size = fs.statSync(tmpPath).size;

  // 2. rename → local mirror
  fs.mkdirSync(path.dirname(localPath), { recursive: true });
  fs.renameSync(tmpPath, localPath);

  // 3. PutObject → R2
  let uploaded = false;
  try {
    const client = clientFactory()!;
    const body = fs.readFileSync(localPath);
    await client.send(new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      Body: body,
      ContentType: 'application/x-sqlite3',
    }));
    uploaded = true;
    writeLogEntry({ ts: new Date().toISOString(), action: 'upload', status: 'ok', key, size });
    writeLogEntry({ ts: new Date().toISOString(), action: 'backup', status: 'ok', key, size });
    // retention + prune only on success
    try { await applyRetention(); } catch (e) {
      writeLogEntry({ ts: new Date().toISOString(), action: 'retention', status: 'failed', error: (e as Error).message });
    }
    pruneLocalMirror();
  } catch (err) {
    const msg = (err as Error).message;
    writeLogEntry({ ts: new Date().toISOString(), action: 'upload', status: 'failed', key, size, error: msg });
    writeLogEntry({ ts: new Date().toISOString(), action: 'backup', status: 'failed', key, size, error: msg });
  }

  return { key, size, durationMs: Date.now() - start, uploaded };
}

export async function applyRetention(): Promise<{ deleted: number }> {
  const cfg = readR2Config();
  if (!cfg) return { deleted: 0 };
  const client = clientFactory()!;
  const retentionDays = Number(process.env.BACKUP_RETENTION_DAYS) || 7;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  let deleted = 0;
  let continuationToken: string | undefined;
  do {
    const resp = await client.send(new ListObjectsV2Command({
      Bucket: cfg.bucket,
      Prefix: 'backups/',
      ContinuationToken: continuationToken,
    }));
    const objects = resp.Contents || [];
    for (const obj of objects) {
      if (!obj.Key || !obj.LastModified) continue;
      // key format: backups/YYYY-MM-DD/database-<ms>.sqlite
      const parts = obj.Key.split('/');
      if (parts.length < 3) continue;
      const fileName = parts[parts.length - 1];
      const match = fileName.match(/^database-(\d+)\.sqlite$/);
      if (!match) continue;
      const ts = Number(match[1]);
      if (Number.isFinite(ts) && ts < cutoff) {
        await client.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: obj.Key }));
        deleted++;
      }
    }
    continuationToken = resp.IsTruncated ? resp.NextContinuationToken : undefined;
  } while (continuationToken);

  if (deleted > 0) {
    writeLogEntry({ ts: new Date().toISOString(), action: 'retention', status: 'ok', size: deleted });
  }
  return { deleted };
}

export async function listBackups(limit = 50): Promise<BackupObject[]> {
  const cfg = readR2Config();
  if (!cfg) return [];
  const client = clientFactory()!;
  const resp = await client.send(new ListObjectsV2Command({
    Bucket: cfg.bucket,
    Prefix: 'backups/',
  }));
  const items: BackupObject[] = (resp.Contents || [])
    .filter((o) => o.Key && o.LastModified && o.Size !== undefined)
    .map((o) => ({ key: o.Key!, size: o.Size!, lastModified: o.LastModified! }))
    .sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return items.slice(0, limit);
}

function pruneLocalMirror(): void {
  try {
    if (!fs.existsSync(LOCAL_MIRROR_DIR)) return;
    const cutoff = Date.now() - LOCAL_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    const dateDirs = fs.readdirSync(LOCAL_MIRROR_DIR);
    for (const dateDir of dateDirs) {
      const fullDir = path.join(LOCAL_MIRROR_DIR, dateDir);
      if (!fs.statSync(fullDir).isDirectory()) continue;
      const files = fs.readdirSync(fullDir);
      for (const file of files) {
        const fullPath = path.join(fullDir, file);
        try {
          const mtime = fs.statSync(fullPath).mtime.getTime();
          if (mtime < cutoff) fs.unlinkSync(fullPath);
        } catch { /* skip */ }
      }
      // remove empty date dir
      try {
        if (fs.readdirSync(fullDir).length === 0) fs.rmdirSync(fullDir);
      } catch { /* skip */ }
    }
  } catch (err) {
    console.error('No se pudo podar el espejo local:', (err as Error).message);
  }
}
