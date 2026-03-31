const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { summarizeDriversNtdBalance } = require('../services/driverNtdSummary');

function statusForCode(code) {
  if (code === ERROR_CODES.INPUT_INVALID) return 400;
  if (code === ERROR_CODES.WORKBOOK_MISSING || code === ERROR_CODES.SHEET_NOT_FOUND) return 422;
  return 500;
}

function createDriverNtdSummaryHandler() {
  return function driverNtdSummaryHandler(req, res) {
    const driver = req.query?.driver;
    const result = summarizeDriversNtdBalance({
      workbookPath: APP_CONFIG.workbookPath,
      driver
    });

    if (!result.ok) {
      return res.status(statusForCode(result.code)).json({
        ok: false,
        code: result.code || ERROR_CODES.PROCESS_FAILED,
        message: result.message || 'Could not build NTD summary.',
        details: null
      });
    }

    return res.json(result);
  };
}

module.exports = {
  createDriverNtdSummaryHandler
};
