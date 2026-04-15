const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

function clearModuleCache() {
  [
    '../../src/config/constants',
    '../../src/services/payrollResults',
    '../../src/services/zelleDriversStore',
    '../../src/routes/zelleReportRoute'
  ].forEach((modulePath) => {
    try {
      delete require.cache[require.resolve(modulePath)];
    } catch (_error) {
      // Ignore if not loaded.
    }
  });
}

test('zelle export route returns an excel file with zelle drivers only', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-zelle-export-'));
  const outputPath = path.join(tmpDir, 'output.xlsx');
  const zelleDriversPath = path.join(tmpDir, 'zelle-drivers.json');

  const reportWorkbook = xlsx.utils.book_new();
  const reportSheet = xlsx.utils.aoa_to_sheet([
    ['Day', 'Driver', 'Amount', 'Adj', 'Notes'],
    ['04/06', 'Driver One', 200, 0, ''],
    ['04/06', 'Driver Two', 100, 0, ''],
    ['04/07', 'Driver Two', 50, 0, '']
  ]);
  xlsx.utils.book_append_sheet(reportWorkbook, reportSheet, 'Sheet1');
  xlsx.writeFile(reportWorkbook, outputPath);

  fs.writeFileSync(
    zelleDriversPath,
    `${JSON.stringify({ drivers: ['Driver Two'] }, null, 2)}\n`,
    'utf8'
  );

  const originalOutputPath = process.env.PAYROLL_OUTPUT_PATH;
  const originalZellePath = process.env.PAYROLL_ZELLE_DRIVERS_PATH;

  process.env.PAYROLL_OUTPUT_PATH = outputPath;
  process.env.PAYROLL_ZELLE_DRIVERS_PATH = zelleDriversPath;

  clearModuleCache();
  const { createZelleExportHandler } = require('../../src/routes/zelleReportRoute');
  const handler = createZelleExportHandler();

  t.after(() => {
    if (originalOutputPath === undefined) {
      delete process.env.PAYROLL_OUTPUT_PATH;
    } else {
      process.env.PAYROLL_OUTPUT_PATH = originalOutputPath;
    }

    if (originalZellePath === undefined) {
      delete process.env.PAYROLL_ZELLE_DRIVERS_PATH;
    } else {
      process.env.PAYROLL_ZELLE_DRIVERS_PATH = originalZellePath;
    }

    clearModuleCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const res = {
    statusCode: 200,
    headers: {},
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    }
  };

  await handler({}, res);

  assert.equal(res.statusCode, 200);
  assert.ok(Buffer.isBuffer(res.payload));

  const exportedWorkbook = xlsx.read(res.payload, { type: 'buffer' });
  const firstSheet = exportedWorkbook.Sheets[exportedWorkbook.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(firstSheet, { defval: null });

  assert.equal(rows.length, 2);
  assert.equal(rows[0].Driver, 'Driver Two');
  assert.equal(rows[0]['Total Amount'], 150);
  assert.equal(rows[1].Driver, 'TOTAL');
  assert.equal(rows[1]['Total Amount'], 150);
});
