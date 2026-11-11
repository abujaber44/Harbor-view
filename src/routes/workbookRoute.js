const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const {
  getWorkbookStatus,
  listWorkbookDrivers,
  inspectWorkbookBuffer,
  replaceWorkbook
} = require('../services/workbookStore');
const { log } = require('../utils/logger');

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function createWorkbookStatusHandler() {
  return function workbookStatusHandler(_req, res) {
    try {
      return res.json({
        ok: true,
        workbook: getWorkbookStatus(APP_CONFIG.workbookPath)
      });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not read workbook status.', error.message);
    }
  };
}

function createWorkbookDriversHandler() {
  return function workbookDriversHandler(_req, res) {
    try {
      const status = getWorkbookStatus(APP_CONFIG.workbookPath);
      if (!status.exists) {
        return res.json({ ok: true, workbookFound: false, drivers: [] });
      }
      return res.json({
        ok: true,
        workbookFound: true,
        drivers: listWorkbookDrivers(APP_CONFIG.workbookPath)
      });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not read drivers from the workbook.', error.message);
    }
  };
}

function createWorkbookUploadHandler() {
  return async function workbookUploadHandler(req, res) {
    const inspection = inspectWorkbookBuffer(req.body);
    if (!inspection.ok) {
      return sendError(res, 400, ERROR_CODES.INPUT_INVALID, inspection.message);
    }

    try {
      const { backupFile } = await replaceWorkbook(req.body, {
        workbookPath: APP_CONFIG.workbookPath,
        backupDir: APP_CONFIG.backupDir
      });

      log('info', 'workbook.replaced', {
        workbookPath: APP_CONFIG.workbookPath,
        sizeBytes: req.body.length,
        backupFile
      });

      return res.json({
        ok: true,
        backupFile,
        workbook: getWorkbookStatus(APP_CONFIG.workbookPath)
      });
    } catch (error) {
      log('error', 'workbook.replace_failed', { message: error.message });
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not save the uploaded workbook.', error.message);
    }
  };
}

// Handles body-parser failures (for example a file over the size limit) for the upload route only.
function workbookUploadErrorHandler(error, _req, res, _next) {
  if (error?.type === 'entity.too.large') {
    return sendError(
      res,
      413,
      ERROR_CODES.INPUT_INVALID,
      `Workbook exceeds max allowed size (${APP_CONFIG.maxWorkbookBytes} bytes).`
    );
  }
  return sendError(res, error?.status || 500, ERROR_CODES.PROCESS_FAILED, 'Upload failed.', error?.message);
}

module.exports = {
  createWorkbookStatusHandler,
  createWorkbookDriversHandler,
  createWorkbookUploadHandler,
  workbookUploadErrorHandler
};
