const fs = require('fs');
const xlsx = require('xlsx');
const { ERROR_CODES } = require('../config/constants');
const { normalizeDriverName } = require('../utils/driverNames');

const DAY_SHEET_CONFIG = Object.freeze([
  { day: 'Monday', sheets: ['Mon AM', 'Mon PM'] },
  { day: 'Tuesday', sheets: ['Tues AM', 'Tues PM'] },
  { day: 'Wednesday', sheets: ['Wed AM', 'Wed PM'] },
  { day: 'Thursday', sheets: ['Thurs AM', 'Thurs PM'] },
  { day: 'Friday', sheets: ['Fri AM', 'Fri PM'] },
  { day: 'Saturday', sheets: ['Sat AM', 'Sat PM'] },
  { day: 'Sunday', sheets: ['Sun AM', 'Sun PM'] }
]);

const CELL_CONFIG = Object.freeze({
  minRow: 4,
  maxRow: 47,
  driverCol: 3, // Column C
  ntdCol: 12 // Column L
});

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

function summarizeDriverNtdByDay({ workbookPath, driver }) {
  const trimmedDriver = String(driver || '').trim();
  if (!trimmedDriver) {
    return {
      ok: false,
      code: ERROR_CODES.INPUT_INVALID,
      message: 'Driver name is required.'
    };
  }

  if (!fs.existsSync(workbookPath)) {
    return {
      ok: false,
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: `Workbook not found at ${workbookPath}.`
    };
  }

  const workbook = xlsx.readFile(workbookPath, { raw: true });
  const targetDriver = normalizeDriverName(trimmedDriver);

  const days = [];

  for (const dayConfig of DAY_SHEET_CONFIG) {
    let dayAmount = 0;

    for (const sheetName of dayConfig.sheets) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return {
          ok: false,
          code: ERROR_CODES.SHEET_NOT_FOUND,
          message: `Worksheet '${sheetName}' was not found.`
        };
      }

      for (let row = CELL_CONFIG.minRow; row <= CELL_CONFIG.maxRow; row += 1) {
        const rawDriver = sheet[xlsx.utils.encode_cell({ c: CELL_CONFIG.driverCol - 1, r: row - 1 })]?.v;
        const rowDriver = normalizeDriverName(rawDriver);
        if (!rowDriver || rowDriver !== targetDriver) {
          continue;
        }

        const rawNtd = sheet[xlsx.utils.encode_cell({ c: CELL_CONFIG.ntdCol - 1, r: row - 1 })]?.v;
        const ntd = normalizeMoneyValue(rawNtd);
        if (ntd !== 0) {
          dayAmount += ntd;
        }
      }
    }

    days.push({
      day: dayConfig.day,
      amount: dayAmount
    });
  }

  const total = days.reduce((sum, entry) => sum + entry.amount, 0);

  return {
    ok: true,
    driver: trimmedDriver,
    days,
    total
  };
}

module.exports = {
  summarizeDriverNtdByDay,
  normalizeMoneyValue,
  DAY_SHEET_CONFIG
};
