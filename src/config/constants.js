const path = require('path');

const DAY_ORDER = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];

const DAY_INDEX = Object.freeze(
  DAY_ORDER.reduce((acc, day, idx) => {
    acc[day] = idx;
    return acc;
  }, {})
);

const REPO_ROOT = path.resolve(__dirname, '..', '..');

const APP_CONFIG = Object.freeze({
  port: Number(process.env.PORT || 3004),
  pythonScriptPath: path.join(REPO_ROOT, 'pay.py'),
  workbookPath: process.env.PAYROLL_WORKBOOK_PATH || path.join(REPO_ROOT, 'Daily Sheet.xlsx'),
  outputPath: process.env.PAYROLL_OUTPUT_PATH || path.join(REPO_ROOT, 'output.xlsx'),
  maxWorkbookBytes: Number(process.env.PAYROLL_MAX_WORKBOOK_BYTES || 25 * 1024 * 1024),
  pythonTimeoutMs: Number(process.env.PAYROLL_PYTHON_TIMEOUT_MS || 120000)
});

const ERROR_CODES = Object.freeze({
  PYTHON_NOT_FOUND: 'PYTHON_NOT_FOUND',
  DEPENDENCY_MISSING: 'DEPENDENCY_MISSING',
  INPUT_INVALID: 'INPUT_INVALID',
  WORKBOOK_MISSING: 'WORKBOOK_MISSING',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  PROCESS_FAILED: 'PROCESS_FAILED'
});

module.exports = {
  APP_CONFIG,
  DAY_ORDER,
  DAY_INDEX,
  ERROR_CODES
};
