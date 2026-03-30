const fs = require('fs');
const xlsx = require('xlsx');
const { ERROR_CODES } = require('../config/constants');

function normalizeAmount(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDisplayDay(value) {
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${month}/${day}`;
  }
  return value;
}

function buildGroupedTotals(rows) {
  const grouped = {};

  rows.forEach((row) => {
    const driver = row.Driver || 'Unknown';
    if (!grouped[driver]) {
      grouped[driver] = {
        name: driver,
        totalAmount: 0,
        pay: []
      };
    }

    const amount = normalizeAmount(row.Amount);
    const adj = normalizeAmount(row.Adj);

    grouped[driver].totalAmount += amount + adj;
    grouped[driver].pay.push({
      day: row.Day,
      amount,
      adj,
      notes: row.Notes || ''
    });
  });

  return Object.values(grouped).sort((a, b) => a.name.localeCompare(b.name));
}

function parseOutputWorkbook(outputPath) {
  if (!fs.existsSync(outputPath)) {
    return {
      ok: false,
      code: ERROR_CODES.PROCESS_FAILED,
      message: 'Expected output workbook was not found after processing.'
    };
  }

  const workbook = xlsx.readFile(outputPath, { cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

  const rows = xlsx.utils.sheet_to_json(firstSheet, {
    defval: null,
    raw: false
  }).map((row) => ({
    ...row,
    Day: toDisplayDay(row.Day),
    Amount: normalizeAmount(row.Amount),
    Adj: normalizeAmount(row.Adj),
    Sum: normalizeAmount(row.Sum)
  }));

  return {
    ok: true,
    rows,
    groupedTotals: buildGroupedTotals(rows)
  };
}

module.exports = {
  parseOutputWorkbook,
  buildGroupedTotals
};
