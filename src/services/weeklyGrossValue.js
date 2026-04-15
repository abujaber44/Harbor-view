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

const SHEET_REF_TOKEN_RE = /([+-]?)\s*(?:(?:'([^']+)'|([A-Za-z0-9_ ]+))!)?\$?([A-Z]{1,3})\$?(\d+)/g;

function parseFormulaText(formula) {
  const text = String(formula || '').trim();
  if (!text) {
    return '';
  }
  return text.startsWith('=') ? text.slice(1).trim() : text;
}

function colToIndex(col) {
  let value = 0;
  for (const ch of String(col || '').toUpperCase()) {
    value = (value * 26) + (ch.charCodeAt(0) - 64);
  }
  return value;
}

function indexToCol(index) {
  let n = index;
  let col = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    col = String.fromCharCode(65 + rem) + col;
    n = Math.floor((n - 1) / 26);
  }
  return col;
}

function parseCellAddress(address) {
  const match = String(address || '').toUpperCase().match(/^([A-Z]{1,3})(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    col: match[1],
    row: Number(match[2])
  };
}

function expandRangeAddresses(startAddress, endAddress) {
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) {
    return [];
  }

  const colStart = Math.min(colToIndex(start.col), colToIndex(end.col));
  const colEnd = Math.max(colToIndex(start.col), colToIndex(end.col));
  const rowStart = Math.min(start.row, end.row);
  const rowEnd = Math.max(start.row, end.row);
  const cells = [];

  for (let col = colStart; col <= colEnd; col += 1) {
    for (let row = rowStart; row <= rowEnd; row += 1) {
      cells.push(`${indexToCol(col)}${row}`);
    }
  }

  return cells;
}

function cellFormulaText(cell) {
  if (typeof cell?.f === 'string') {
    return String(cell.f).trim();
  }
  if (typeof cell?.v === 'string') {
    const text = String(cell.v).trim();
    if (text.startsWith('=')) {
      return text.slice(1).trim();
    }
  }
  return '';
}

function resolveCellValue(workbook, sheetName, cellAddress, visited = new Set()) {
  const normalizedSheetName = String(sheetName || '').trim();
  const normalizedCellAddress = String(cellAddress || '').replace(/\$/g, '').toUpperCase();
  const key = `${normalizedSheetName}!${normalizedCellAddress}`;
  if (!normalizedSheetName || !normalizedCellAddress || visited.has(key)) {
    return 0;
  }

  const sheet = workbook.Sheets[normalizedSheetName];
  if (!sheet) {
    return 0;
  }

  const cell = sheet[normalizedCellAddress];
  if (!cell) {
    return 0;
  }

  const raw = cell.v ?? cell.w;
  const hasDirectValue = cell.t !== 'z'
    && raw !== undefined
    && raw !== null
    && String(raw).trim() !== '';
  if (hasDirectValue) {
    return normalizeMoneyValue(raw);
  }

  const formula = cellFormulaText(cell);
  if (!formula) {
    return 0;
  }

  visited.add(key);
  try {
    return evaluateReferenceFormula(`=${formula}`, workbook, normalizedSheetName, visited) ?? 0;
  } finally {
    visited.delete(key);
  }
}

function evaluateReferenceFormula(formula, workbook, currentSheetName = 'Weekly Gross', visited = new Set()) {
  const body = parseFormulaText(formula);
  if (!body) {
    return null;
  }

  const singleLocalRef = body.match(/^\$?([A-Z]{1,3})\$?(\d+)$/i);
  if (singleLocalRef) {
    return resolveCellValue(workbook, currentSheetName, `${singleLocalRef[1]}${singleLocalRef[2]}`, visited);
  }

  const singleSheetRef = body.match(/^(?:'([^']+)'|([A-Za-z0-9_ ]+))!\$?([A-Z]{1,3})\$?(\d+)$/);
  if (singleSheetRef) {
    const sheetName = (singleSheetRef[1] || singleSheetRef[2] || '').trim();
    return resolveCellValue(workbook, sheetName, `${singleSheetRef[3]}${singleSheetRef[4]}`, visited);
  }

  const sumMatch = body.match(/^SUM\(\s*\$?([A-Z]{1,3})\$?(\d+)\s*:\s*\$?([A-Z]{1,3})\$?(\d+)\s*\)$/i);
  if (sumMatch) {
    const rangeCells = expandRangeAddresses(`${sumMatch[1]}${sumMatch[2]}`, `${sumMatch[3]}${sumMatch[4]}`);
    return rangeCells.reduce(
      (sum, address) => sum + resolveCellValue(workbook, currentSheetName, address, visited),
      0
    );
  }

  let total = 0;
  let matched = 0;
  let cursor = 0;
  for (const token of body.matchAll(SHEET_REF_TOKEN_RE)) {
    const index = token.index ?? 0;
    const inBetween = body.slice(cursor, index).trim();
    if (inBetween) {
      return null;
    }

    const sign = token[1] === '-' ? -1 : 1;
    const sheetName = (token[2] || token[3] || currentSheetName).trim();
    const cellAddress = `${token[4]}${token[5]}`;
    total += sign * resolveCellValue(workbook, sheetName, cellAddress, visited);

    matched += 1;
    cursor = index + token[0].length;
  }

  if (matched === 0 || body.slice(cursor).trim()) {
    return null;
  }

  return total;
}

function readWeeklyGrossM41(workbookPath) {
  if (!fs.existsSync(workbookPath)) {
    return {
      ok: false,
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: `Workbook not found at ${workbookPath}.`
    };
  }

  const workbook = xlsx.readFile(workbookPath, { raw: true, cellFormula: true, sheetStubs: true });
  const sheet = workbook.Sheets['Weekly Gross'];

  if (!sheet) {
    return {
      ok: false,
      code: ERROR_CODES.SHEET_NOT_FOUND,
      message: 'Sheet "Weekly Gross" was not found in workbook.'
    };
  }

  const cell = sheet.M41;
  const rawValue = cell?.v ?? cell?.w;
  const hasDirectValue = cell?.t !== 'z'
    && rawValue !== undefined
    && rawValue !== null
    && String(rawValue).trim() !== '';
  const formula = cellFormulaText(cell);
  const formulaText = formula ? `=${formula}` : '';
  const computedFromFormula = formulaText ? evaluateReferenceFormula(formulaText, workbook) : null;
  const amount = computedFromFormula !== null
    ? computedFromFormula
    : (hasDirectValue ? normalizeMoneyValue(rawValue) : 0);

  return {
    ok: true,
    cellAddress: 'M41',
    sheetName: 'Weekly Gross',
    amount
  };
}

module.exports = {
  readWeeklyGrossM41,
  normalizeMoneyValue,
  evaluateReferenceFormula
};
