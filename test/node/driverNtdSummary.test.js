const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const { summarizeDriverNtdByDay } = require('../../src/services/driverNtdSummary');

function buildSheet(entries = []) {
  const rows = Array.from({ length: 50 }, () => Array(15).fill(null));

  entries.forEach((entry) => {
    const row = entry.row - 1;
    rows[row][2] = entry.driver; // Column C
    rows[row][11] = entry.ntd; // Column L
  });

  return xlsx.utils.aoa_to_sheet(rows);
}

function createWorkbook(filePath, sheetEntriesMap) {
  const workbook = xlsx.utils.book_new();
  Object.entries(sheetEntriesMap).forEach(([sheetName, entries]) => {
    xlsx.utils.book_append_sheet(workbook, buildSheet(entries), sheetName);
  });
  xlsx.writeFile(workbook, filePath);
}

test('summarizeDriverNtdByDay keeps non-zero NTD and ignores zero for same day AM/PM', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Driver One', ntd: 0 }],
    'Mon PM': [{ row: 4, driver: 'Driver One', ntd: 100 }],
    'Tues AM': [{ row: 5, driver: 'Driver One', ntd: -54 }],
    'Tues PM': [{ row: 5, driver: 'Driver One', ntd: 0 }],
    'Wed AM': [{ row: 6, driver: 'Driver One', ntd: 1 }],
    'Wed PM': [],
    'Thurs AM': [],
    'Thurs PM': [],
    'Fri AM': [],
    'Fri PM': [],
    'Sat AM': [],
    'Sat PM': [],
    'Sun AM': [],
    'Sun PM': []
  });

  const result = summarizeDriverNtdByDay({
    workbookPath,
    driver: 'Driver One'
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.days.map((entry) => [entry.day, entry.amount]),
    [
      ['Monday', 100],
      ['Tuesday', -54],
      ['Wednesday', 1],
      ['Thursday', 0],
      ['Friday', 0],
      ['Saturday', 0],
      ['Sunday', 0]
    ]
  );
  assert.equal(result.total, 47);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('summarizeDriverNtdByDay returns input invalid when driver is missing', () => {
  const result = summarizeDriverNtdByDay({
    workbookPath: '/tmp/missing.xlsx',
    driver: ''
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'INPUT_INVALID');
});
