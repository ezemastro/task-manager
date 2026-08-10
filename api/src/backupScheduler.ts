import { runBackup, readLastLogEntry, writeLogEntry, getMissingR2EnvVars } from './backupService';

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 horas
let warnedMissingR2 = false;

export function startBackupScheduler(): void {
  const missing = getMissingR2EnvVars();
  if (missing.length > 0 && !warnedMissingR2) {
    console.warn(
      `[backup] R2 env vars faltantes: ${missing.join(', ')}. ` +
      'El scheduler seguirá corriendo pero los backups no se subirán hasta configurarlas.'
    );
    warnedMissingR2 = true;
  }

  void reconcileAndSchedule();
}

async function reconcileAndSchedule(): Promise<void> {
  await reconcileStartup();
  const handle = setInterval(() => {
    runBackup().catch((err) => {
      writeLogEntry({
        ts: new Date().toISOString(),
        action: 'backup',
        status: 'failed',
        error: (err as Error).message,
      });
    });
  }, INTERVAL_MS);
  // No bloquear el cierre del proceso
  if (typeof handle.unref === 'function') handle.unref();
}

async function reconcileStartup(): Promise<void> {
  try {
    const last = await readLastLogEntry();
    const shouldRun =
      !last ||
      last.status === 'failed' ||
      Date.now() - new Date(last.ts).getTime() > INTERVAL_MS;
    if (shouldRun) {
      await runBackup();
    }
  } catch (err) {
    writeLogEntry({
      ts: new Date().toISOString(),
      action: 'backup',
      status: 'failed',
      error: `startup reconcile: ${(err as Error).message}`,
    });
  }
}
