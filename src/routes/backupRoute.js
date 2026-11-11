const fs = require('fs');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const {
  isValidBackupName,
  listBackups,
  resolveBackupPath,
  diffBackup,
  restoreBackup
} = require('../services/backupStore');
const { getWorkbookStatus } = require('../services/workbookStore');
const { log } = require('../utils/logger');

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function findBackup(req, res) {
  const name = req.params?.name;
  if (!isValidBackupName(name)) {
    sendError(res, 400, ERROR_CODES.INPUT_INVALID, 'Invalid backup name.');
    return null;
  }

  const backupPath = resolveBackupPath(APP_CONFIG.backupDir, name);
  if (!backupPath) {
    sendError(res, 404, ERROR_CODES.INPUT_INVALID, 'Backup was not found.');
    return null;
  }

  return { name, backupPath };
}

function createBackupListHandler() {
  return async function backupListHandler(_req, res) {
    try {
      return res.json({ ok: true, backups: await listBackups(APP_CONFIG.backupDir) });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not list backups.', error.message);
    }
  };
}

function createBackupDiffHandler() {
  return function backupDiffHandler(req, res) {
    const backup = findBackup(req, res);
    if (!backup) {
      return undefined;
    }

    if (!fs.existsSync(APP_CONFIG.workbookPath)) {
      return sendError(res, 422, ERROR_CODES.WORKBOOK_MISSING, `Workbook not found at ${APP_CONFIG.workbookPath}.`);
    }

    try {
      return res.json({
        ok: true,
        name: backup.name,
        ...diffBackup(backup.backupPath, APP_CONFIG.workbookPath)
      });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not compare the backup.', error.message);
    }
  };
}

function createBackupRestoreHandler() {
  return async function backupRestoreHandler(req, res) {
    const backup = findBackup(req, res);
    if (!backup) {
      return undefined;
    }

    try {
      const result = await restoreBackup(backup.backupPath, {
        workbookPath: APP_CONFIG.workbookPath,
        backupDir: APP_CONFIG.backupDir
      });
      if (!result.ok) {
        return sendError(res, 422, ERROR_CODES.PROCESS_FAILED, `Backup cannot be restored: ${result.message}`);
      }

      log('info', 'workbook.restored', { restoredFrom: backup.name, backupFile: result.backupFile });

      return res.json({
        ok: true,
        restoredFrom: backup.name,
        backupFile: result.backupFile,
        workbook: getWorkbookStatus(APP_CONFIG.workbookPath)
      });
    } catch (error) {
      log('error', 'workbook.restore_failed', { message: error.message });
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not restore the backup.', error.message);
    }
  };
}

module.exports = {
  createBackupListHandler,
  createBackupDiffHandler,
  createBackupRestoreHandler
};
