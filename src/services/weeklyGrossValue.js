const fs = require('fs');
const xlsx = require('xlsx');
const { ERROR_CODES } = require('../config/constants');

function normalizeMoneyValue(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? '').trim();
  if (!text) {
    return 0;
  }

  const isParenthesesNegative = text.startsWith('(') && text.endsWith(')');
  const stripped = text
    .replace(/[,$\s]/g, '')
    .replace(/[()]/g, '');
  const parsed = Number(stripped);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return isParenthesesNegative ? parsed * -1 : parsed;
}

function readWeeklyGrossM41(workbookPath) {
  if (!fs.existsSync(workbookPath)) {
    return {
      ok: false,
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: `Workbook not found at ${workbookPath}.`
    };
  }

  const workbook = xlsx.readFile(workbookPath, { raw: true });
  const sheet = workbook.Sheets['Weekly Gross'];

  if (!sheet) {
    return {
      ok: false,
      code: ERROR_CODES.SHEET_NOT_FOUND,
      message: 'Sheet "Weekly Gross" was not found in workbook.'
    };
  }

  const cell = sheet.M41;
  const rawValue = cell?.v ?? cell?.w ?? '';

  return {
    ok: true,
    cellAddress: 'M41',
    sheetName: 'Weekly Gross',
    amount: normalizeMoneyValue(rawValue)
  };
}

module.exports = {
  readWeeklyGrossM41,
  normalizeMoneyValue
};
