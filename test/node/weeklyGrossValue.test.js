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
