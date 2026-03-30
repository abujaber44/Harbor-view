const fs = require('fs/promises');
const path = require('path');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { validateDayRange } = require('../validation/dayRange');
const { runPayrollPython } = require('../services/pythonRunner');
const { parseOutputWorkbook } = require('../services/payrollResults');
const { log } = require('../utils/logger');

function statusForCode(code) {
  if (code === ERROR_CODES.INPUT_INVALID) return 400;
  if (code === ERROR_CODES.WORKBOOK_MISSING || code === ERROR_CODES.SHEET_NOT_FOUND) return 422;
  if (code === ERROR_CODES.DEPENDENCY_MISSING || code === ERROR_CODES.PYTHON_NOT_FOUND) return 500;
  return 500;
}

function sendError(res, code, message, details) {
  const status = statusForCode(code);
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function createSubmitHandler({ runtime }) {
  return async function submitHandler(req, res) {
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

    log('info', 'payroll.run.start', {
      fromDay,
      toDay,
      workbookPath: APP_CONFIG.workbookPath,
      python: runtime.command
    });

    const pythonResult = await runPayrollPython({
      pythonCommand: runtime.command,
      scriptPath: APP_CONFIG.pythonScriptPath,
      payload: { fromDay, toDay },
      timeoutMs: APP_CONFIG.pythonTimeoutMs,
      extraEnv: {
        PAYROLL_WORKBOOK: APP_CONFIG.workbookPath,
        PAYROLL_OUTPUT: APP_CONFIG.outputPath
      }
    });

    if (!pythonResult.ok) {
      log('error', 'payroll.run.failed', {
        fromDay,
        toDay,
        code: pythonResult.code,
        message: pythonResult.message
      });
      return sendError(res, pythonResult.code, pythonResult.message, pythonResult.details);
    }

    const parsedOutput = parseOutputWorkbook(APP_CONFIG.outputPath);
    if (!parsedOutput.ok) {
      log('error', 'payroll.output.parse_failed', {
        code: parsedOutput.code,
        message: parsedOutput.message
      });
      return sendError(res, parsedOutput.code, parsedOutput.message);
    }

    const warnings = [];
    if (Array.isArray(pythonResult.parsed?.warnings)) {
      warnings.push(...pythonResult.parsed.warnings);
    }

    if (parsedOutput.rows.length === 0) {
      warnings.push('No negative values were found in the selected day range.');
    }

    const response = {
      ok: true,
      range: {
        fromDay,
        toDay
      },
      rows: parsedOutput.rows,
      groupedTotals: parsedOutput.groupedTotals,
      outputFile: path.basename(APP_CONFIG.outputPath),
      warnings
    };

    log('info', 'payroll.run.success', {
      fromDay,
      toDay,
      rowCount: parsedOutput.rows.length,
      driverCount: parsedOutput.groupedTotals.length
    });

    return res.json(response);
  };
}

module.exports = {
  createSubmitHandler,
  statusForCode
};
