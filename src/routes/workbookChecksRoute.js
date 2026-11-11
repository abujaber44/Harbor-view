const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { validateDayRange } = require('../validation/dayRange');
const { checkWorkbook } = require('../services/workbookChecks');
const { summarizeDriversNtdBalance } = require('../services/driverNtdSummary');

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function statusForCode(code) {
  if (code === ERROR_CODES.INPUT_INVALID) return 400;
  if (code === ERROR_CODES.WORKBOOK_MISSING || code === ERROR_CODES.SHEET_NOT_FOUND) return 422;
  return 500;
}

function createWorkbookChecksHandler() {
  return function workbookChecksHandler(req, res) {
    const fromDay = req.query?.fromDay;
    const toDay = req.query?.toDay;

    if (fromDay || toDay) {
      const validation = validateDayRange(fromDay, toDay);
      if (!validation.ok) {
        return sendError(res, 400, ERROR_CODES.INPUT_INVALID, validation.message);
      }
    }

    try {
      const result = checkWorkbook({ workbookPath: APP_CONFIG.workbookPath, fromDay, toDay });
      if (!result.ok) {
        return sendError(res, statusForCode(result.code), result.code, result.message);
      }
      return res.json(result);
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not check the workbook.', error.message);
    }
  };
}

function createDriverNtdHandler() {
  return function driverNtdHandler(req, res) {
    const driver = typeof req.query?.driver === 'string' ? req.query.driver.slice(0, 100) : '';

    try {
      const result = summarizeDriversNtdBalance({ workbookPath: APP_CONFIG.workbookPath, driver });
      if (!result.ok) {
        return sendError(res, statusForCode(result.code), result.code, result.message);
      }
      return res.json(result);
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not read driver balances.', error.message);
    }
  };
}

module.exports = {
  createWorkbookChecksHandler,
  createDriverNtdHandler
};
