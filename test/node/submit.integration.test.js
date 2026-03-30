const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const { checkPythonRuntime } = require('../../src/services/pythonRunner');

function buildSheet(dayDate, entries = []) {
  const rows = Array.from({ length: 50 }, () => Array(15).fill(null));
  rows[0][1] = dayDate;

  entries.forEach((entry) => {
    const row = entry.row - 1;
    rows[row][2] = entry.driver;
    rows[row][12] = entry.amount;
    rows[row][13] = entry.adj;
    rows[row][14] = entry.notes;
  });

  return xlsx.utils.aoa_to_sheet(rows);
}

function clearModuleCache() {
  [
    '../../src/config/constants',
    '../../src/routes/submitRoute',
    '../../src/createApp'
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // Ignore if module not loaded yet.
    }
  });
}

test('POST /submit returns structured success payload', async (t) => {
  const runtime = await checkPythonRuntime();
  if (!runtime.ok) {
    t.skip(`Python runtime not ready: ${runtime.code}`);
    return;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-'));
  const workbookPath = path.join(tmpDir, 'Daily Sheet.xlsx');
  const outputPath = path.join(tmpDir, 'output.xlsx');

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    buildSheet(new Date('2026-03-23T00:00:00Z'), [
      { row: 4, driver: 'Driver One', amount: -120, adj: -10, notes: 'Late' }
    ]),
    'Mon AM'
  );
  xlsx.utils.book_append_sheet(
    workbook,
    buildSheet(new Date('2026-03-23T00:00:00Z'), [
      { row: 5, driver: 'Driver Two', amount: -80, adj: 0, notes: '' }
    ]),
    'Mon PM'
  );
  xlsx.writeFile(workbook, workbookPath);

  const originalWorkbookPath = process.env.PAYROLL_WORKBOOK_PATH;
  const originalOutputPath = process.env.PAYROLL_OUTPUT_PATH;

  process.env.PAYROLL_WORKBOOK_PATH = workbookPath;
  process.env.PAYROLL_OUTPUT_PATH = outputPath;

  clearModuleCache();
  const { createSubmitHandler } = require('../../src/routes/submitRoute');
  const submitHandler = createSubmitHandler({ runtime });

  t.after(() => {
    if (originalWorkbookPath === undefined) {
      delete process.env.PAYROLL_WORKBOOK_PATH;
    } else {
      process.env.PAYROLL_WORKBOOK_PATH = originalWorkbookPath;
    }

    if (originalOutputPath === undefined) {
      delete process.env.PAYROLL_OUTPUT_PATH;
    } else {
      process.env.PAYROLL_OUTPUT_PATH = originalOutputPath;
    }

    clearModuleCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const req = {
    body: {
      fromDay: 'Monday',
      toDay: 'Monday'
    }
  };

  const res = {
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

  await submitHandler(req, res);
  assert.equal(res.statusCode, 200);

  const body = res.payload;
  assert.equal(body.ok, true);
  assert.equal(body.range.fromDay, 'Monday');
  assert.equal(body.range.toDay, 'Monday');
  assert.equal(body.outputFile, 'output.xlsx');
  assert.equal(Array.isArray(body.rows), true);
  assert.equal(Array.isArray(body.groupedTotals), true);
  assert.equal(body.rows.length, 2);

  const driverOne = body.groupedTotals.find((group) => group.name === 'Driver One');
  assert.ok(driverOne);
  assert.equal(driverOne.totalAmount, 110);
});
