const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const { summarizeDriversNtdBalance, roundBalanceByRule } = require('../../src/services/driverNtdSummary');

function buildSheet(entries = []) {
  const rows = Array.from({ length: 50 }, () => Array(15).fill(null));

  entries.forEach((entry) => {
    const row = entry.row - 1;
    rows[row][2] = entry.driver; // Column C
    rows[row][3] = entry.includeFlag; // Column D
    rows[row][11] = entry.ntd; // Column L
    rows[row][12] = entry.cashInOut; // Column M
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

test('summarizeDriversNtdBalance returns daily details and totals for all drivers', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [
      { row: 4, driver: 'Driver One', includeFlag: 'x', ntd: 0, cashInOut: 0 },
      { row: 5, driver: 'Driver Two', includeFlag: 'x', ntd: 20, cashInOut: 5 }
    ],
    'Mon PM': [
      { row: 4, driver: 'Driver One', includeFlag: 'x', ntd: 100, cashInOut: 30 },
      { row: 6, driver: 'Driver Two', includeFlag: '', ntd: 200, cashInOut: 200 }
    ],
    'Tues AM': [{ row: 5, driver: 'Driver One', includeFlag: 'y', ntd: -54, cashInOut: 10 }],
    'Tues PM': [{ row: 5, driver: 'Driver One', includeFlag: 'y', ntd: 0, cashInOut: 20 }],
    'Wed AM': [{ row: 6, driver: 'Driver One', includeFlag: '1', ntd: 1, cashInOut: 0 }],
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

  const result = summarizeDriversNtdBalance({
    workbookPath,
    driver: ''
  });

  assert.equal(result.ok, true);
  assert.equal(result.drivers.length, 2);

  const driverOne = result.drivers.find((entry) => entry.driver === 'Driver One');
  assert.ok(driverOne);
  assert.deepEqual(
    driverOne.days.map((entry) => [entry.day, entry.ntd, entry.cashInOut, entry.balance]),
    [
      ['Monday', 100, 30, -70],
      ['Tuesday', -54, 30, 84],
      ['Wednesday', 1, 0, -1],
      ['Thursday', 0, 0, 0],
      ['Friday', 0, 0, 0],
      ['Saturday', 0, 0, 0],
      ['Sunday', 0, 0, 0]
    ]
  );
  assert.deepEqual(driverOne.totals, {
    ntd: 47,
    cashInOut: 60,
    balance: 13
  });
  assert.equal(driverOne.settlementNote, null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('summarizeDriversNtdBalance filters by driver search (case-insensitive contains)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-filter-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Driver Alpha', includeFlag: 'x', ntd: 10, cashInOut: 3 }],
    'Mon PM': [{ row: 4, driver: 'Driver Beta', includeFlag: 'x', ntd: 20, cashInOut: 8 }],
    'Tues AM': [],
    'Tues PM': [],
    'Wed AM': [],
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

  const result = summarizeDriversNtdBalance({
    workbookPath,
    driver: 'alp'
  });

  assert.equal(result.ok, true);
  assert.equal(result.drivers.length, 1);
  assert.equal(result.drivers[0].driver, 'Driver Alpha');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('roundBalanceByRule rounds up only when decimal part is greater than 0.50', () => {
  assert.equal(roundBalanceByRule(10.49), 10);
  assert.equal(roundBalanceByRule(10.5), 10);
  assert.equal(roundBalanceByRule(10.51), 11);
  assert.equal(roundBalanceByRule(-4.5), -4);
  assert.equal(roundBalanceByRule(-4.51), -5);
});

test('summarizeDriversNtdBalance does not add settlement note when driver does not owe us', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-note-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Driver Note', includeFlag: 'x', ntd: -100, cashInOut: 0 }],
    'Mon PM': [],
    'Tues AM': [{ row: 5, driver: 'Driver Note', includeFlag: 'x', ntd: 50, cashInOut: 0 }],
    'Tues PM': [],
    'Wed AM': [],
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

  const result = summarizeDriversNtdBalance({ workbookPath, driver: 'Driver Note' });
  assert.equal(result.ok, true);
  assert.equal(result.drivers.length, 1);

  const summary = result.drivers[0];
  assert.deepEqual(
    summary.days.map((entry) => [entry.day, entry.balance]),
    [
      ['Monday', 100],
      ['Tuesday', -50],
      ['Wednesday', 0],
      ['Thursday', 0],
      ['Friday', 0],
      ['Saturday', 0],
      ['Sunday', 0]
    ]
  );
  assert.equal(summary.totals.balance, 50);
  assert.equal(summary.settlementNote, null);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('summarizeDriversNtdBalance note uses rounded numbers and collect remainder', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-note-rounded-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Alan C', includeFlag: 'x', ntd: 0.66, cashInOut: 0 }],
    'Mon PM': [],
    'Tues AM': [],
    'Tues PM': [],
    'Wed AM': [{ row: 4, driver: 'Alan C', includeFlag: 'x', ntd: 44, cashInOut: 0 }],
    'Wed PM': [],
    'Thurs AM': [{ row: 4, driver: 'Alan C', includeFlag: 'x', ntd: 100, cashInOut: 0 }],
    'Thurs PM': [],
    'Fri AM': [{ row: 4, driver: 'Alan C', includeFlag: 'x', ntd: -96.34, cashInOut: -96 }],
    'Fri PM': [],
    'Sat AM': [],
    'Sat PM': [],
    'Sun AM': [],
    'Sun PM': []
  });

  const result = summarizeDriversNtdBalance({ workbookPath, driver: 'Alan' });
  assert.equal(result.ok, true);
  assert.equal(result.drivers.length, 1);
  const summary = result.drivers[0];

  assert.equal(summary.totals.balance, -145);
  assert.ok(summary.settlementNote);
  assert.equal(summary.settlementNote.owedToDriver, 96);
  assert.equal(summary.settlementNote.driverOwesUs, 145);
  assert.equal(summary.settlementNote.stillCollect, 49);
  assert.match(summary.settlementNote.message, /still need to collect 49\.00/i);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('summarizeDriversNtdBalance note can derive "we owe" from negative cash in/out', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-ntd-note-cash-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');

  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Cash Note', includeFlag: 'x', ntd: 50, cashInOut: 0 }],
    'Mon PM': [],
    'Tues AM': [{ row: 4, driver: 'Cash Note', includeFlag: 'x', ntd: 20, cashInOut: -10 }],
    'Tues PM': [],
    'Wed AM': [],
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

  const result = summarizeDriversNtdBalance({ workbookPath, driver: 'Cash Note' });
  assert.equal(result.ok, true);
  const summary = result.drivers[0];
  assert.equal(summary.totals.balance, -80);
  assert.ok(summary.settlementNote);
  assert.equal(summary.settlementNote.owedToDriver, 10);
  assert.equal(summary.settlementNote.driverOwesUs, 80);
  assert.equal(summary.settlementNote.stillCollect, 70);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
