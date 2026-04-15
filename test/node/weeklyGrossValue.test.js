const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const { normalizeMoneyValue, readWeeklyGrossM41 } = require('../../src/services/weeklyGrossValue');

test('normalizeMoneyValue handles currency strings and negatives', () => {
  assert.equal(normalizeMoneyValue('$1,234.50'), 1234.5);
  assert.equal(normalizeMoneyValue('(245.25)'), -245.25);
  assert.equal(normalizeMoneyValue(-50), -50);
});

test('readWeeklyGrossM41 reads M41 from Weekly Gross sheet', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-weekly-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  const workbook = xlsx.utils.book_new();
  const sheet = xlsx.utils.aoa_to_sheet(Array.from({ length: 45 }, () => Array(15).fill(null)));
  sheet.M41 = { t: 'n', v: -120.75 };
  xlsx.utils.book_append_sheet(workbook, sheet, 'Weekly Gross');
  xlsx.writeFile(workbook, workbookPath);

  const result = readWeeklyGrossM41(workbookPath);
  assert.equal(result.ok, true);
  assert.equal(result.amount, -120.75);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('readWeeklyGrossM41 evaluates M41 formula when value cache is missing', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-weekly-formula-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  const workbook = xlsx.utils.book_new();
  const weekly = xlsx.utils.aoa_to_sheet(Array.from({ length: 45 }, () => Array(15).fill(null)));
  const mon = xlsx.utils.aoa_to_sheet(Array.from({ length: 20 }, () => Array(20).fill(null)));
  const tue = xlsx.utils.aoa_to_sheet(Array.from({ length: 20 }, () => Array(20).fill(null)));

  mon.S14 = { t: 'n', v: 120.5 };
  tue.S14 = { t: 'n', v: 99.5 };
  weekly.M41 = { f: "'Mon AM'!S14+'Tues AM'!S14" };

  xlsx.utils.book_append_sheet(workbook, weekly, 'Weekly Gross');
  xlsx.utils.book_append_sheet(workbook, mon, 'Mon AM');
  xlsx.utils.book_append_sheet(workbook, tue, 'Tues AM');
  xlsx.writeFile(workbook, workbookPath);

  const result = readWeeklyGrossM41(workbookPath);
  assert.equal(result.ok, true);
  assert.equal(result.amount, 220);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('readWeeklyGrossM41 resolves nested formula chain like workbook structure', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-weekly-nested-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  const workbook = xlsx.utils.book_new();
  const weekly = xlsx.utils.aoa_to_sheet(Array.from({ length: 45 }, () => Array(15).fill(null)));
  const mon = xlsx.utils.aoa_to_sheet(Array.from({ length: 60 }, () => Array(20).fill(null)));
  const tue = xlsx.utils.aoa_to_sheet(Array.from({ length: 60 }, () => Array(20).fill(null)));

  mon.M4 = { t: 'n', v: 100 };
  mon.M5 = { t: 'n', v: 25 };
  tue.M4 = { t: 'n', v: 50 };

  mon.M48 = { f: 'SUM(M4:M47)' };
  tue.M48 = { f: 'SUM(M4:M47)' };
  mon.S14 = { f: 'M48' };
  tue.S14 = { f: 'M48' };
  weekly.M41 = { f: "'Mon AM'!S14+'Tues AM'!S14" };

  xlsx.utils.book_append_sheet(workbook, weekly, 'Weekly Gross');
  xlsx.utils.book_append_sheet(workbook, mon, 'Mon AM');
  xlsx.utils.book_append_sheet(workbook, tue, 'Tues AM');
  xlsx.writeFile(workbook, workbookPath);

  const result = readWeeklyGrossM41(workbookPath);
  assert.equal(result.ok, true);
  assert.equal(result.amount, 175);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
