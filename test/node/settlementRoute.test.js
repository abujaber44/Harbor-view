const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const { checkPythonRuntime } = require('../../src/services/pythonRunner');

const ALL_SHEETS = [
  'Mon AM', 'Mon PM',
  'Tues AM', 'Tues PM',
  'Wed AM', 'Wed PM',
  'Thurs AM', 'Thurs PM',
  'Fri AM', 'Fri PM',
  'Sat AM', 'Sat PM',
  'Sun AM', 'Sun PM'
];

const SHEET_DATES = Object.freeze({
  'Mon AM': new Date('2026-03-30T00:00:00Z'),
  'Mon PM': new Date('2026-03-30T00:00:00Z'),
  'Tues AM': new Date('2026-03-31T00:00:00Z'),
  'Tues PM': new Date('2026-03-31T00:00:00Z'),
  'Wed AM': new Date('2026-04-01T00:00:00Z'),
  'Wed PM': new Date('2026-04-01T00:00:00Z'),
  'Thurs AM': new Date('2026-04-02T00:00:00Z'),
  'Thurs PM': new Date('2026-04-02T00:00:00Z'),
  'Fri AM': new Date('2026-04-03T00:00:00Z'),
  'Fri PM': new Date('2026-04-03T00:00:00Z'),
  'Sat AM': new Date('2026-04-04T00:00:00Z'),
  'Sat PM': new Date('2026-04-04T00:00:00Z'),
  'Sun AM': new Date('2026-04-05T00:00:00Z'),
  'Sun PM': new Date('2026-04-05T00:00:00Z')
});

function clearModuleCache() {
  [
    '../../src/config/constants',
    '../../src/routes/settlementRoute'
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // Ignore if module not loaded.
    }
  });
}

function buildSheet(dayDate, entries = []) {
  const rows = Array.from({ length: 50 }, () => Array(15).fill(null));
  rows[0][1] = dayDate;

  entries.forEach((entry) => {
    const row = entry.row - 1;
    rows[row][2] = entry.driver; // C
    rows[row][3] = entry.include ?? 'x'; // D
    rows[row][11] = entry.ntd ?? 0; // L
    rows[row][12] = entry.cash ?? 0; // M
    if (Object.prototype.hasOwnProperty.call(entry, 'adj')) {
      rows[row][13] = entry.adj; // N
    }
    rows[row][14] = entry.notes ?? ''; // O
  });

  return xlsx.utils.aoa_to_sheet(rows);
}

function createWorkbook(filePath, entriesBySheet = {}) {
  const workbook = xlsx.utils.book_new();
  ALL_SHEETS.forEach((sheetName) => {
    xlsx.utils.book_append_sheet(
      workbook,
      buildSheet(SHEET_DATES[sheetName], entriesBySheet[sheetName] || []),
      sheetName
    );
  });
  xlsx.writeFile(workbook, filePath);
}

function createResponseMock() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

test('settlement preview returns structured payload', async (t) => {
  const runtime = await checkPythonRuntime();
  if (!runtime.ok) {
    t.skip(`Python runtime not ready: ${runtime.code}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-settlement-preview-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');
  const backupDir = path.join(tmpDir, 'backups');
  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Gus', ntd: -120, cash: -120 }],
    'Wed AM': [{ row: 4, driver: 'Gus', ntd: 80, cash: 0 }]
  });

  const originalWorkbookPath = process.env.PAYROLL_WORKBOOK_PATH;
  const originalBackupDir = process.env.PAYROLL_BACKUP_DIR;
  process.env.PAYROLL_WORKBOOK_PATH = workbookPath;
  process.env.PAYROLL_BACKUP_DIR = backupDir;

  clearModuleCache();
  const { createSettlementHandler } = require('../../src/routes/settlementRoute');
  const handler = createSettlementHandler({ runtime, apply: false });

  t.after(() => {
    if (originalWorkbookPath === undefined) {
      delete process.env.PAYROLL_WORKBOOK_PATH;
    } else {
      process.env.PAYROLL_WORKBOOK_PATH = originalWorkbookPath;
    }

    if (originalBackupDir === undefined) {
      delete process.env.PAYROLL_BACKUP_DIR;
    } else {
      process.env.PAYROLL_BACKUP_DIR = originalBackupDir;
    }

    clearModuleCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const res = createResponseMock();
  await handler(
    { body: { fromDay: 'Monday', toDay: 'Wednesday' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(res.payload.fromDay, 'Monday');
  assert.equal(res.payload.toDay, 'Wednesday');
  assert.equal(typeof res.payload.totalDeducted, 'number');
  assert.equal(Array.isArray(res.payload.drivers), true);
});

test('settlement apply updates workbook and returns backup metadata', async (t) => {
  const runtime = await checkPythonRuntime();
  if (!runtime.ok) {
    t.skip(`Python runtime not ready: ${runtime.code}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-settlement-apply-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');
  const backupDir = path.join(tmpDir, 'backups');
  createWorkbook(workbookPath, {
    'Mon AM': [{ row: 4, driver: 'Gus', ntd: -120, cash: -120, notes: 'manual' }],
    'Wed AM': [{ row: 4, driver: 'Gus', ntd: 80, cash: 0 }]
  });

  const originalWorkbookPath = process.env.PAYROLL_WORKBOOK_PATH;
  const originalBackupDir = process.env.PAYROLL_BACKUP_DIR;
  process.env.PAYROLL_WORKBOOK_PATH = workbookPath;
  process.env.PAYROLL_BACKUP_DIR = backupDir;

  clearModuleCache();
  const { createSettlementHandler } = require('../../src/routes/settlementRoute');
  const handler = createSettlementHandler({ runtime, apply: true });

  t.after(() => {
    if (originalWorkbookPath === undefined) {
      delete process.env.PAYROLL_WORKBOOK_PATH;
    } else {
      process.env.PAYROLL_WORKBOOK_PATH = originalWorkbookPath;
    }

    if (originalBackupDir === undefined) {
      delete process.env.PAYROLL_BACKUP_DIR;
    } else {
      process.env.PAYROLL_BACKUP_DIR = originalBackupDir;
    }

    clearModuleCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const res = createResponseMock();
  await handler(
    { body: { fromDay: 'Monday', toDay: 'Wednesday' } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.ok, true);
  assert.equal(typeof res.payload.backupFile, 'string');
  assert.equal(fs.existsSync(path.join(backupDir, res.payload.backupFile)), true);

  const workbook = xlsx.readFile(workbookPath, { raw: true });
  const mon = workbook.Sheets['Mon AM'];
  const wed = workbook.Sheets['Wed AM'];
  assert.equal(mon.N4.v, -80);
  assert.equal(wed.M4.v, 80);
  assert.equal(wed.N4.v, 0);
});

test('settlement route returns validation errors with proper status', async (t) => {
  const runtime = await checkPythonRuntime();
  if (!runtime.ok) {
    t.skip(`Python runtime not ready: ${runtime.code}`);
    return;
  }

  clearModuleCache();
  const { createSettlementHandler } = require('../../src/routes/settlementRoute');
  const handler = createSettlementHandler({ runtime, apply: false });

  const badRangeRes = createResponseMock();
  await handler({ body: { fromDay: 'Friday', toDay: 'Monday' } }, badRangeRes);
  assert.equal(badRangeRes.statusCode, 400);
  assert.equal(badRangeRes.payload.ok, false);
  assert.equal(badRangeRes.payload.code, 'INPUT_INVALID');
});
