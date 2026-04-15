const fs = require('fs/promises');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { validateDayRange } = require('../validation/dayRange');
const { runPayrollPython } = require('../services/pythonRunner');

function statusForCode(code) {
  if (code === ERROR_CODES.INPUT_INVALID) return 400;
  if (code === ERROR_CODES.WORKBOOK_MISSING || code === ERROR_CODES.SHEET_NOT_FOUND) return 422;
  if (code === ERROR_CODES.DEPENDENCY_MISSING || code === ERROR_CODES.PYTHON_NOT_FOUND) return 500;
  return 500;
}

function sendError(res, code, message, details) {
  return res.status(statusForCode(code)).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function createSettlementHandler({ runtime, apply }) {
  return async function settlementHandler(req, res) {
    const fromDay = req.body?.fromDay;
    const toDay = req.body?.toDay;

    const validation = validateDayRange(fromDay, toDay);
    if (!validation.ok) {
      return sendError(res, ERROR_CODES.INPUT_INVALID, validation.message);
    }

    let workbookStats;
    try {
      workbookStats = await fs.stat(APP_CONFIG.workbookPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return sendError(
          res,
          ERROR_CODES.WORKBOOK_MISSING,
          `Workbook not found at ${APP_CONFIG.workbookPath}.`
        );
      }
      return sendError(res, ERROR_CODES.PROCESS_FAILED, 'Could not access workbook file.', error.message);
    }

    if (workbookStats.size > APP_CONFIG.maxWorkbookBytes) {
      return sendError(
        res,
        ERROR_CODES.PROCESS_FAILED,
        `Workbook exceeds max allowed size (${APP_CONFIG.maxWorkbookBytes} bytes).`
      );
    }

    if (!runtime.ok) {
      return sendError(res, runtime.code, runtime.message, runtime.details);
    }

    const pythonResult = await runPayrollPython({
      pythonCommand: runtime.command,
      scriptPath: APP_CONFIG.settlementScriptPath,
      payload: {
        fromDay,
        toDay,
        apply: Boolean(apply)
      },
      timeoutMs: APP_CONFIG.pythonTimeoutMs,
      extraEnv: {
        PAYROLL_WORKBOOK: APP_CONFIG.workbookPath,
        PAYROLL_BACKUP_DIR: APP_CONFIG.backupDir
      }
    });

    if (!pythonResult.ok) {
      return sendError(
        res,
        pythonResult.code || ERROR_CODES.PROCESS_FAILED,
        pythonResult.message || 'Settlement process failed.',
        pythonResult.details
      );
    }

    if (!pythonResult.parsed || pythonResult.parsed.ok !== true) {
      return sendError(res, ERROR_CODES.PROCESS_FAILED, 'Settlement process returned an invalid response.');
    }

    return res.json(pythonResult.parsed);
  };
}

module.exports = {
  createSettlementHandler
};
