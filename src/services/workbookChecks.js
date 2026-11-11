const fs = require('fs');
const xlsx = require('xlsx');
const { DAY_ORDER, DAY_INDEX, DAY_SHEETS, ERROR_CODES } = require('../config/constants');
const { normalizeDriverName } = require('../utils/driverNames');

// Read-only checks that point out data payroll would silently skip or misread.
// Nothing here changes how payroll is calculated.

const ROWS = Object.freeze({ min: 4, max: 47 });
const MAX_ISSUES = 200;

function cellAt(sheet, column, row) {
  return sheet[`${column}${row}`];
}

function hasText(value) {
  return typeof value === 'string' && value.trim() !== '';
}

// A formula whose result was never stored (for example after the workbook was saved by this
// app rather than by Excel). Readers that want the value get nothing for these cells.
function isUncalculatedFormula(cell) {
  if (!cell || typeof cell.f !== 'string' || !cell.f.trim()) {
    return false;
  }
  return cell.t === 'z' || cell.v === undefined || cell.v === null;
}

function formatAmount(value) {
  return `$${Math.abs(Number(value)).toFixed(2)}`;
}

function editDistanceAtMostOne(a, b) {
  if (a === b) {
    return true;
  }
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }

  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) {
    i += 1;
  }

  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1);
  }

  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

function splitName(key) {
  return {
    letters: key.replace(/[^a-z]/g, ''),
    digits: key.replace(/[^0-9]/g, '')
  };
}

function findNameIssues(namesByKey) {
  const issues = [];

  // Same name with different capitalisation or spacing: payroll groups on the exact text.
  namesByKey.forEach((variants) => {
    if (variants.size > 1) {
      const list = Array.from(variants.keys()).map((name) => `"${name}"`).join(', ');
      issues.push({
        severity: 'warning',
        type: 'NAME_VARIANTS',
        message: `The same driver is written ${variants.size} ways: ${list}. Payroll lists each spelling as a separate driver.`
      });
    }
  });

  // Names one letter apart (with the same number, if any) are often typos.
  const keys = Array.from(namesByKey.keys()).sort();
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = splitName(keys[i]);
      const b = splitName(keys[j]);
      if (a.digits !== b.digits || a.letters === b.letters) {
        continue;
      }
      if (Math.min(a.letters.length, b.letters.length) < 5) {
        continue;
      }
      if (editDistanceAtMostOne(a.letters, b.letters)) {
        const first = namesByKey.get(keys[i]).keys().next().value;
        const second = namesByKey.get(keys[j]).keys().next().value;
        issues.push({
          severity: 'warning',
          type: 'NAME_SIMILAR',
          message: `"${first}" and "${second}" are one letter apart. If they are the same driver, fix the spelling so their pay is combined.`
        });
      }
    }
  }

  return issues;
}

function checkWorkbook({ workbookPath, fromDay, toDay }) {
  if (!fs.existsSync(workbookPath)) {
    return {
      ok: false,
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: `Workbook not found at ${workbookPath}.`
    };
  }

  const fromIndex = fromDay ? DAY_INDEX[fromDay] : 0;
  const toIndex = toDay ? DAY_INDEX[toDay] : DAY_ORDER.length - 1;
  const sheetNames = DAY_ORDER.slice(fromIndex, toIndex + 1).flatMap((day) => DAY_SHEETS[day]);

  const workbook = xlsx.readFile(workbookPath, {
    cellFormula: true,
    sheetStubs: true,
    sheetRows: ROWS.max
  });

  const issues = [];
  const namesByKey = new Map();
  let rowsWithDriver = 0;
  const uncalculated = { cash: 0, cashSheets: new Set(), ntd: 0, ntdSheets: new Set() };

  sheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      issues.push({
        severity: 'error',
        type: 'SHEET_MISSING',
        sheetName,
        message: `Sheet "${sheetName}" is missing. Payroll cannot run for a range that includes it.`
      });
      return;
    }

    for (let row = ROWS.min; row <= ROWS.max; row += 1) {
      const driverValue = cellAt(sheet, 'C', row)?.v;
      const driverText = driverValue === undefined || driverValue === null ? '' : String(driverValue);
      const driverKey = normalizeDriverName(driverText);

      if (driverKey) {
        rowsWithDriver += 1;
        if (!namesByKey.has(driverKey)) {
          namesByKey.set(driverKey, new Map());
        }
        namesByKey.get(driverKey).set(driverText, true);
      }

      const amountCell = cellAt(sheet, 'M', row);
      const amount = amountCell?.v;

      if (driverKey && isUncalculatedFormula(cellAt(sheet, 'L', row))) {
        uncalculated.ntd += 1;
        uncalculated.ntdSheets.add(sheetName);
      }

      if (isUncalculatedFormula(amountCell)) {
        uncalculated.cash += 1;
        uncalculated.cashSheets.add(sheetName);
      } else if (hasText(amount)) {
        issues.push({
          severity: 'warning',
          type: 'AMOUNT_IS_TEXT',
          sheetName,
          row,
          message: `${sheetName} row ${row}: cash in/out is text ("${amount.trim()}"), not a number. Payroll skips this row.`
        });
      } else if (typeof amount === 'number' && amount < 0 && !driverKey) {
        issues.push({
          severity: 'warning',
          type: 'AMOUNT_WITHOUT_DRIVER',
          sheetName,
          row,
          message: `${sheetName} row ${row}: a payout of ${formatAmount(amount)} has no driver name. It will appear under "Unknown".`
        });
      }

      const adj = cellAt(sheet, 'N', row)?.v;
      if (hasText(adj)) {
        issues.push({
          severity: 'warning',
          type: 'ADJ_IS_TEXT',
          sheetName,
          row,
          message: `${sheetName} row ${row}: adjustment is text ("${adj.trim()}"), not a number. Payroll treats it as 0.`
        });
      }
    }
  });

  if (uncalculated.cash > 0) {
    issues.push({
      severity: 'warning',
      type: 'FORMULAS_NOT_CALCULATED',
      message: `${uncalculated.cash} cash in/out formula(s) on ${uncalculated.cashSheets.size} sheet(s) have no calculated value, so payroll skips those rows. Open the workbook in Excel, save it, and upload it again.`
    });
  }

  if (uncalculated.ntd > 0) {
    issues.push({
      severity: 'warning',
      type: 'NTD_NOT_CALCULATED',
      message: `${uncalculated.ntd} NTD formula(s) on ${uncalculated.ntdSheets.size} sheet(s) have no calculated value. Payroll is not affected, but Settlement Pass and Driver Lookup read NTD as 0 for those rows. Open the workbook in Excel, save it, and upload it again.`
    });
  }

  issues.push(...findNameIssues(namesByKey));

  const severityRank = { error: 0, warning: 1 };
  issues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);

  return {
    ok: true,
    fromDay: DAY_ORDER[fromIndex],
    toDay: DAY_ORDER[toIndex],
    sheetsChecked: sheetNames.length,
    rowsWithDriver,
    driverCount: namesByKey.size,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    truncated: issues.length > MAX_ISSUES,
    issues: issues.slice(0, MAX_ISSUES)
  };
}

module.exports = {
  checkWorkbook,
  editDistanceAtMostOne
};
