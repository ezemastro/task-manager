import { Router, type Request, type Response } from 'express';
import {
  runBackup,
  listBackups,
  listRecentLog,
  readLastLogEntry,
  getMissingR2EnvVars,
} from './backupService';

export const backupsRouter = Router();

// POST /api/backups — admin manual trigger
backupsRouter.post('/', async (_req: Request, res: Response) => {
  const missing = getMissingR2EnvVars();
  if (missing.length > 0) {
    return res.status(503).json({
      error: 'R2 env vars not configured',
      missing,
    });
  }
  try {
    const result = await runBackup();
    return res.status(200).json({
      ok: true,
      key: result.key,
      size: result.size,
      durationMs: result.durationMs,
      uploaded: result.uploaded,
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: (err as Error).message,
    });
  }
});

// GET /api/backups — list R2 objects + last status
backupsRouter.get('/', async (_req: Request, res: Response) => {
  const last = await readLastLogEntry();
  const lastStatus: 'ok' | 'failed' | 'never' = !last
    ? 'never'
    : last.status === 'ok'
    ? 'ok'
    : 'failed';
  const lastError = last?.status === 'failed' ? last.error ?? null : null;

  const missing = getMissingR2EnvVars();
  if (missing.length > 0) {
    return res.json({
      lastStatus,
      lastError,
      missing,
      objects: [],
    });
  }

  try {
    const objects = await listBackups(50);
    const recentLog = await listRecentLog(20);
    return res.json({
      lastStatus,
      lastError,
      objects,
      recentLog,
    });
  } catch (err) {
    return res.status(500).json({
      error: (err as Error).message,
      lastStatus,
      lastError,
    });
  }
});
