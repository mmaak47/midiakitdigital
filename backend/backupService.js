const fs = require('fs');
const path = require('path');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listBackupFiles(backupDir) {
  return fs.readdirSync(backupDir)
    .filter((name) => name.endsWith('.sqlite'))
    .map((name) => {
      const filePath = path.join(backupDir, name);
      const stat = fs.statSync(filePath);
      return { filePath, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function cleanupOldBackups(backupDir, retentionDays) {
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  const files = listBackupFiles(backupDir);

  for (const file of files) {
    if (file.mtimeMs < cutoff) {
      fs.unlinkSync(file.filePath);
    }
  }
}

function createBackupScheduler(db, options = {}) {
  const intervalMinutes = parsePositiveInt(process.env.SQLITE_BACKUP_INTERVAL_MINUTES, 360);
  const retentionDays = parsePositiveInt(process.env.SQLITE_BACKUP_RETENTION_DAYS, 14);
  const startupDelaySeconds = parsePositiveInt(process.env.SQLITE_BACKUP_STARTUP_DELAY_SECONDS, 15);

  const backupDir = options.backupDir || path.join(__dirname, 'backups');
  const dbName = options.dbName || 'midiakit';
  const intervalMs = intervalMinutes * 60 * 1000;

  ensureDirectory(backupDir);

  let isRunning = false;

  async function runBackup(reason = 'scheduled') {
    if (isRunning) {
      console.warn('[backup] Backup skipped because another backup is already running');
      return null;
    }

    isRunning = true;
    const stamp = formatTimestamp();
    const tempPath = path.join(backupDir, `${dbName}-${stamp}.tmp`);
    const finalPath = path.join(backupDir, `${dbName}-${stamp}.sqlite`);

    try {
      // Flushes recent WAL pages into the database file before creating snapshot.
      db.pragma('wal_checkpoint(PASSIVE)');
      await db.backup(tempPath);
      fs.renameSync(tempPath, finalPath);
      cleanupOldBackups(backupDir, retentionDays);
      console.log(`[backup] SQLite backup created (${reason}): ${finalPath}`);
      return finalPath;
    } catch (error) {
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
      console.error('[backup] Failed to create SQLite backup:', error.message);
      return null;
    } finally {
      isRunning = false;
    }
  }

  const timer = setInterval(() => {
    runBackup('interval').catch((error) => {
      console.error('[backup] Unexpected interval backup error:', error.message);
    });
  }, intervalMs);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  setTimeout(() => {
    runBackup('startup').catch((error) => {
      console.error('[backup] Unexpected startup backup error:', error.message);
    });
  }, startupDelaySeconds * 1000);

  console.log(`[backup] Automatic SQLite backup enabled. Interval: ${intervalMinutes} min, retention: ${retentionDays} days, dir: ${backupDir}`);

  return {
    runBackup,
    stop() {
      clearInterval(timer);
    }
  };
}

module.exports = {
  createBackupScheduler
};
