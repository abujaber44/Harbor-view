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
  includeFlagCol: 4, // Column D
  ntdCol: 12, // Column L
  cashInOutCol: 13 // Column M
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

function roundBalanceByRule(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) {
    return 0;
  }

  const sign = amount < 0 ? -1 : 1;
  const absolute = Math.abs(amount);
  const whole = Math.floor(absolute);
  const fraction = absolute - whole;
  const roundedAbsolute = fraction > 0.5 ? whole + 1 : whole;
  return sign * roundedAbsolute;
}

function buildSettlementNote(days, totals) {
  const owedByNegativeNtd = days.reduce((sum, day) => (
    day.ntd < 0 ? sum + Math.abs(day.ntd) : sum
  ), 0);
  const owedByNegativeCash = days.reduce((sum, day) => (
    day.cashInOut < 0 ? sum + Math.abs(day.cashInOut) : sum
  ), 0);
  const owedToDriverRaw = Math.max(owedByNegativeNtd, owedByNegativeCash);
  const owedToDriverRounded = Math.abs(roundBalanceByRule(owedToDriverRaw));
  const driverOwesUsRounded = totals.balance < 0 ? Math.abs(totals.balance) : 0;

  if (owedToDriverRounded <= 0 || driverOwesUsRounded <= 0) {
    return null;
  }

  if (driverOwesUsRounded > owedToDriverRounded) {
    const stillCollect = driverOwesUsRounded - owedToDriverRounded;
    return {
      owedToDriver: owedToDriverRounded,
      driverOwesUs: driverOwesUsRounded,
      stillCollect,
      message: `We owe the driver ${owedToDriverRounded.toFixed(2)} but the driver owes ${driverOwesUsRounded.toFixed(2)}, so we still need to collect ${stillCollect.toFixed(2)}.`
    };
  }

  if (owedToDriverRounded > driverOwesUsRounded) {
    const stillPay = owedToDriverRounded - driverOwesUsRounded;
    return {
      owedToDriver: owedToDriverRounded,
      driverOwesUs: driverOwesUsRounded,
      stillPay,
      message: `We owe the driver ${owedToDriverRounded.toFixed(2)} and the driver owes ${driverOwesUsRounded.toFixed(2)}, so we still need to pay ${stillPay.toFixed(2)}.`
    };
  }

  return {
    owedToDriver: owedToDriverRounded,
    driverOwesUs: driverOwesUsRounded,
    settled: true,
    message: `We owe the driver ${owedToDriverRounded.toFixed(2)} and the driver owes ${driverOwesUsRounded.toFixed(2)}, so it is fully settled.`
  };
}

function getCellValue(sheet, columnNumber, rowNumber) {
  return sheet[xlsx.utils.encode_cell({ c: columnNumber - 1, r: rowNumber - 1 })]?.v;
}

function isNonEmpty(value) {
  return String(value ?? '').trim() !== '';
}

function ensureDriverSummary(map, displayName, normalizedName) {
  if (map[normalizedName]) {
    return map[normalizedName];
  }

  const dayMap = {};
  DAY_SHEET_CONFIG.forEach(({ day }) => {
    dayMap[day] = {
      day,
      ntd: 0,
      cashInOut: 0,
      balance: 0
    };
  });

  map[normalizedName] = {
    driver: displayName,
    daysByName: dayMap
  };
  return map[normalizedName];
}

function summarizeDriversNtdBalance({ workbookPath, driver }) {
  const trimmedDriver = String(driver || '').trim();
  const normalizedFilter = normalizeDriverName(trimmedDriver);

  if (!fs.existsSync(workbookPath)) {
    return {
      ok: false,
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: `Workbook not found at ${workbookPath}.`
    };
  }

  const workbook = xlsx.readFile(workbookPath, { raw: true });
  const driversMap = {};

  for (const dayConfig of DAY_SHEET_CONFIG) {
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
        const rawDriver = getCellValue(sheet, CELL_CONFIG.driverCol, row);
        const rowDriver = normalizeDriverName(rawDriver);
        if (!rowDriver) {
          continue;
        }

        if (normalizedFilter && !rowDriver.includes(normalizedFilter)) {
          continue;
        }

        const includeFlag = getCellValue(sheet, CELL_CONFIG.includeFlagCol, row);
        if (!isNonEmpty(includeFlag)) {
          continue;
        }

        const rawNtd = getCellValue(sheet, CELL_CONFIG.ntdCol, row);
        const rawCashInOut = getCellValue(sheet, CELL_CONFIG.cashInOutCol, row);
        const ntd = normalizeMoneyValue(rawNtd);
        const cashInOut = normalizeMoneyValue(rawCashInOut);

        if (ntd === 0 && cashInOut === 0) {
          continue;
        }

        const summary = ensureDriverSummary(
          driversMap,
          String(rawDriver || '').trim().replace(/\s+/g, ' '),
          rowDriver
        );
        const dayBucket = summary.daysByName[dayConfig.day];
        dayBucket.ntd += ntd;
        dayBucket.cashInOut += cashInOut;
      }
    }
  }

  const drivers = Object.values(driversMap)
    .map((summary) => {
      const days = DAY_SHEET_CONFIG.map(({ day }) => {
        const row = summary.daysByName[day];
        return {
          day: row.day,
          ntd: row.ntd,
          cashInOut: row.cashInOut,
          balance: row.cashInOut - row.ntd
        };
      });

      days.forEach((entry) => {
        entry.balance = roundBalanceByRule(entry.balance);
      });

      const totals = days.reduce(
        (acc, entry) => {
          acc.ntd += entry.ntd;
          acc.cashInOut += entry.cashInOut;
          acc.balance += entry.balance;
          return acc;
        },
        { ntd: 0, cashInOut: 0, balance: 0 }
      );
      const settlementNote = buildSettlementNote(days, totals);

      return {
        driver: summary.driver,
        days,
        totals,
        settlementNote
      };
    })
    .sort((a, b) => a.driver.localeCompare(b.driver));

  const grandTotals = drivers.reduce(
    (acc, entry) => {
      acc.ntd += entry.totals.ntd;
      acc.cashInOut += entry.totals.cashInOut;
      acc.balance += entry.totals.balance;
      return acc;
    },
    { ntd: 0, cashInOut: 0, balance: 0 }
  );

  return {
    ok: true,
    filter: trimmedDriver || null,
    drivers,
    grandTotals
  };
}

module.exports = {
  summarizeDriversNtdBalance,
  normalizeMoneyValue,
  DAY_SHEET_CONFIG,
  roundBalanceByRule
};
