const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const xlsx = require('xlsx');

const ENV_KEYS = [
  'PAYROLL_WORKBOOK_PATH',
  'PAYROLL_OUTPUT_PATH',
  'PAYROLL_BACKUP_DIR',
  'PAYROLL_HISTORY_DIR',
  'PAYROLL_ZELLE_DRIVERS_PATH',
  'PAYROLL_MAX_WORKBOOK_BYTES'
];

function clearSrcModuleCache() {
  const srcRoot = path.resolve(__dirname, '..', '..', 'src') + path.sep;
  Object.keys(require.cache)
    .filter((key) => key.startsWith(srcRoot))
    .forEach((key) => delete require.cache[key]);
}

function buildWorkbookBuffer(sheetNames, marker) {
  const workbook = xlsx.utils.book_new();
  sheetNames.forEach((name) => {
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet([[marker, '3/23/2026']]), name);
  });
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

async function startApp(t, overrides = {}) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harbor-view-wb-'));
  const paths = {
    tmpDir,
    workbookPath: path.join(tmpDir, 'Daily Sheet.xlsx'),
    outputPath: path.join(tmpDir, 'output.xlsx'),
    backupDir: path.join(tmpDir, 'backups'),
    historyDir: path.join(tmpDir, 'history'),
    zellePath: path.join(tmpDir, 'zelle-drivers.json')
  };

  const original = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  process.env.PAYROLL_WORKBOOK_PATH = paths.workbookPath;
  process.env.PAYROLL_OUTPUT_PATH = paths.outputPath;
  process.env.PAYROLL_BACKUP_DIR = paths.backupDir;
  process.env.PAYROLL_HISTORY_DIR = paths.historyDir;
  process.env.PAYROLL_ZELLE_DRIVERS_PATH = paths.zellePath;
  Object.entries(overrides).forEach(([key, value]) => {
    process.env[key] = value;
  });

  clearSrcModuleCache();
  const { createApp } = require('../../src/createApp');
  const app = createApp({ runtime: { ok: false, code: 'PYTHON_NOT_FOUND', message: 'not used' } });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });

  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    ENV_KEYS.forEach((key) => {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    });
    clearSrcModuleCache();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  return { ...paths, baseUrl: `http://127.0.0.1:${server.address().port}` };
}

function upload(baseUrl, buffer) {
  return fetch(`${baseUrl}/api/workbook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer
  });
}

test('workbook status reports a missing workbook', async (t) => {
  const ctx = await startApp(t);
  const response = await fetch(`${ctx.baseUrl}/api/workbook`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.workbook.exists, false);
  assert.equal(body.workbook.fileName, 'Daily Sheet.xlsx');
});

test('workbook upload saves the file and reports sheets', async (t) => {
  const ctx = await startApp(t);
  const buffer = buildWorkbookBuffer(['Mon AM', 'Mon PM', 'Weekly Gross'], 'first');

  const response = await upload(ctx.baseUrl, buffer);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.backupFile, null);
  assert.equal(body.workbook.exists, true);
  assert.deepEqual(body.workbook.sheets.present, ['Mon AM', 'Mon PM']);
  assert.equal(body.workbook.sheets.missing.length, 12);
  assert.equal(body.workbook.firstDate.label, '3/23/2026');
  assert.deepEqual(fs.readFileSync(ctx.workbookPath), buffer);
});

test('workbook upload backs up the previous workbook before replacing it', async (t) => {
  const ctx = await startApp(t);
  const first = buildWorkbookBuffer(['Mon AM'], 'first');
  const second = buildWorkbookBuffer(['Mon AM', 'Tues AM'], 'second');

  await upload(ctx.baseUrl, first);
  const response = await upload(ctx.baseUrl, second);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.match(body.backupFile, /^Daily Sheet\.\d{8}-\d{6}(-\d+)?\.xlsx$/);
  assert.deepEqual(fs.readFileSync(path.join(ctx.backupDir, body.backupFile)), first);
  assert.deepEqual(fs.readFileSync(ctx.workbookPath), second);
  assert.deepEqual(
    fs.readdirSync(ctx.tmpDir).filter((name) => name.endsWith('.tmp')),
    []
  );
});

test('workbook upload rejects files that are not a Daily Sheet and keeps the current one', async (t) => {
  const ctx = await startApp(t);
  const good = buildWorkbookBuffer(['Mon AM'], 'good');
  await upload(ctx.baseUrl, good);

  const notExcel = await upload(ctx.baseUrl, Buffer.from('just some text'));
  assert.equal(notExcel.status, 400);
  assert.equal((await notExcel.json()).code, 'INPUT_INVALID');

  const wrongSheets = await upload(ctx.baseUrl, buildWorkbookBuffer(['Sheet1'], 'other'));
  assert.equal(wrongSheets.status, 400);
  assert.equal((await wrongSheets.json()).code, 'INPUT_INVALID');

  const empty = await upload(ctx.baseUrl, Buffer.alloc(0));
  assert.equal(empty.status, 400);

  assert.deepEqual(fs.readFileSync(ctx.workbookPath), good);
  assert.equal(fs.existsSync(ctx.backupDir), false);
});

test('workbook upload rejects files over the size limit', async (t) => {
  const ctx = await startApp(t, { PAYROLL_MAX_WORKBOOK_BYTES: '1024' });
  const response = await upload(ctx.baseUrl, Buffer.alloc(4096, 1));
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.ok, false);
  assert.equal(fs.existsSync(ctx.workbookPath), false);
});

test('history routes list, return, export and delete saved runs', async (t) => {
  const ctx = await startApp(t);
  const { saveRun } = require('../../src/services/historyStore');

  const older = await saveRun(ctx.historyDir, {
    range: { fromDay: 'Monday', toDay: 'Tuesday' },
    rows: [
      { Day: '03/23', Driver: 'Driver One', Amount: 200, Adj: 0, Notes: '' },
      { Day: '03/24', Driver: 'Driver Two', Amount: 150, Adj: 0, Notes: '' }
    ],
    groupedTotals: [
      { name: 'Driver One', totalAmount: 200, pay: [] },
      { name: 'Driver Two', totalAmount: 150, pay: [] }
    ],
    warnings: [],
    zelleDrivers: ['driver two'],
    cashSummary: { weeklyGrossM41: 1000, zelleTotal: 150, cashToKeep: 1150 }
  }, new Date(2026, 2, 25, 9, 0, 0));
  const newer = await saveRun(ctx.historyDir, {
    range: { fromDay: 'Monday', toDay: 'Friday' },
    rows: [],
    groupedTotals: []
  }, new Date(2026, 2, 28, 9, 0, 0));

  const list = await (await fetch(`${ctx.baseUrl}/api/history`)).json();
  assert.equal(list.ok, true);
  assert.deepEqual(list.runs.map((run) => run.id), [newer.id, older.id]);
  assert.equal(list.runs[1].driverCount, 2);
  assert.equal(list.runs[1].totalAmount, 350);
  assert.equal(list.runs[1].firstDay, '03/23');
  assert.equal(list.runs[1].lastDay, '03/24');

  const single = await (await fetch(`${ctx.baseUrl}/api/history/${older.id}`)).json();
  assert.equal(single.ok, true);
  assert.equal(single.run.cashSummary.cashToKeep, 1150);
  assert.deepEqual(single.run.zelleDrivers, ['driver two']);

  // The saved-run export uses the Zelle list stored with the run, not the current one.
  const exportResponse = await fetch(`${ctx.baseUrl}/api/reports/zelle-export?runId=${older.id}`);
  assert.equal(exportResponse.status, 200);
  const exported = xlsx.read(Buffer.from(await exportResponse.arrayBuffer()), { type: 'buffer' });
  const exportedRows = xlsx.utils.sheet_to_json(exported.Sheets['Zelle Report']);
  assert.deepEqual(exportedRows.map((row) => row.Driver), ['Driver Two', 'TOTAL']);
  assert.equal(exportedRows[1]['Total Amount'], 150);

  const badId = await fetch(`${ctx.baseUrl}/api/history/..%2F..%2Fpackage`);
  assert.equal(badId.status, 400);
  const missing = await fetch(`${ctx.baseUrl}/api/history/20260101-000000-abcd`);
  assert.equal(missing.status, 404);

  const removed = await fetch(`${ctx.baseUrl}/api/history/${older.id}`, { method: 'DELETE' });
  assert.equal(removed.status, 200);
  const after = await (await fetch(`${ctx.baseUrl}/api/history`)).json();
  assert.deepEqual(after.runs.map((run) => run.id), [newer.id]);
});

function buildDayWorkbookBuffer(sheets) {
  const workbook = xlsx.utils.book_new();
  Object.entries(sheets).forEach(([sheetName, entries]) => {
    const rows = Array.from({ length: 50 }, () => Array(15).fill(null));
    rows[0][1] = '3/23/2026';
    entries.forEach((entry) => {
      const row = entry.row - 1;
      rows[row][2] = entry.driver;
      rows[row][12] = entry.cash ?? null;
      rows[row][13] = entry.adj ?? null;
      rows[row][14] = entry.notes ?? null;
    });
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), sheetName);
  });
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('workbook drivers endpoint lists distinct driver names from day sheets', async (t) => {
  const ctx = await startApp(t);

  const empty = await (await fetch(`${ctx.baseUrl}/api/workbook/drivers`)).json();
  assert.deepEqual(empty, { ok: true, workbookFound: false, drivers: [] });

  fs.writeFileSync(ctx.workbookPath, buildDayWorkbookBuffer({
    'Mon AM': [
      { row: 3, driver: 'Header Row' },
      { row: 4, driver: 'Zed  Driver' },
      { row: 5, driver: 'Amy' },
      { row: 48, driver: 'Below Range' }
    ],
    'Tues PM': [
      { row: 10, driver: 'amy ' },
      { row: 47, driver: 'Bob' }
    ],
    'Weekly Gross': [{ row: 4, driver: 'Not A Day Sheet' }]
  }));

  const body = await (await fetch(`${ctx.baseUrl}/api/workbook/drivers`)).json();
  assert.equal(body.workbookFound, true);
  assert.deepEqual(body.drivers, ['Amy', 'Bob', 'Zed Driver']);
});

test('backups can be listed, compared with the workbook, and restored', async (t) => {
  const ctx = await startApp(t);
  const original = buildDayWorkbookBuffer({
    'Mon AM': [
      { row: 4, driver: 'Amy', cash: -50, adj: null, notes: null },
      { row: 5, driver: 'Bob', cash: 20, adj: 30, notes: 'short' }
    ]
  });
  const changed = buildDayWorkbookBuffer({
    'Mon AM': [
      { row: 4, driver: 'Amy', cash: -50, adj: -30, notes: 'Deducted $30 for 3/23' },
      { row: 5, driver: 'Bob', cash: 50, adj: 0, notes: 'short' }
    ]
  });

  const none = await (await fetch(`${ctx.baseUrl}/api/backups`)).json();
  assert.deepEqual(none, { ok: true, backups: [] });

  // Uploading the changed workbook over the original leaves the original as a backup.
  await upload(ctx.baseUrl, original);
  const replaced = await (await upload(ctx.baseUrl, changed)).json();
  fs.writeFileSync(path.join(ctx.backupDir, 'notes.txt'), 'not a backup');

  const list = await (await fetch(`${ctx.baseUrl}/api/backups`)).json();
  assert.deepEqual(list.backups.map((backup) => backup.name), [replaced.backupFile]);
  // The listed time comes from the timestamp in the file name.
  const stamp = replaced.backupFile.match(/\.(\d{8})-(\d{6})/);
  const listedAt = new Date(list.backups[0].createdAt);
  const pad = (value) => String(value).padStart(2, '0');
  assert.equal(
    `${listedAt.getFullYear()}${pad(listedAt.getMonth() + 1)}${pad(listedAt.getDate())}`,
    stamp[1]
  );
  assert.equal(`${pad(listedAt.getHours())}${pad(listedAt.getMinutes())}${pad(listedAt.getSeconds())}`, stamp[2]);

  const name = encodeURIComponent(replaced.backupFile);
  const diff = await (await fetch(`${ctx.baseUrl}/api/backups/${name}/diff`)).json();
  assert.equal(diff.ok, true);
  assert.equal(diff.total, 4);
  assert.deepEqual(
    diff.changes.map((change) => [change.driver, change.column, change.inBackup, change.inCurrent]),
    [
      ['Amy', 'N', '', -30],
      ['Amy', 'O', '', 'Deducted $30 for 3/23'],
      ['Bob', 'M', 20, 50],
      ['Bob', 'N', 30, 0]
    ]
  );

  const restored = await fetch(`${ctx.baseUrl}/api/backups/${name}/restore`, { method: 'POST' });
  const restoredBody = await restored.json();
  assert.equal(restored.status, 200);
  assert.equal(restoredBody.restoredFrom, replaced.backupFile);
  assert.deepEqual(fs.readFileSync(ctx.workbookPath), original);

  // The workbook that was replaced by the restore is itself kept as a backup.
  assert.notEqual(restoredBody.backupFile, replaced.backupFile);
  assert.deepEqual(fs.readFileSync(path.join(ctx.backupDir, restoredBody.backupFile)), changed);

  const after = await (await fetch(`${ctx.baseUrl}/api/backups/${name}/diff`)).json();
  assert.equal(after.total, 0);
});

test('backup routes reject unsafe or unknown names', async (t) => {
  const ctx = await startApp(t);
  fs.writeFileSync(ctx.workbookPath, buildDayWorkbookBuffer({ 'Mon AM': [{ row: 4, driver: 'Amy' }] }));
  const before = fs.readFileSync(ctx.workbookPath);

  const traversal = await fetch(`${ctx.baseUrl}/api/backups/..%2FDaily%20Sheet.xlsx/restore`, { method: 'POST' });
  assert.equal(traversal.status, 400);
  const notXlsx = await fetch(`${ctx.baseUrl}/api/backups/notes.txt/diff`);
  assert.equal(notXlsx.status, 400);
  const missing = await fetch(`${ctx.baseUrl}/api/backups/missing.xlsx/restore`, { method: 'POST' });
  assert.equal(missing.status, 404);

  assert.deepEqual(fs.readFileSync(ctx.workbookPath), before);
  assert.equal(fs.existsSync(ctx.backupDir), false);
});

function buildCheckWorkbookBuffer(sheets) {
  const workbook = xlsx.utils.book_new();
  Object.entries(sheets).forEach(([sheetName, entries]) => {
    const rows = Array.from({ length: 50 }, () => Array(15).fill(null));
    entries.forEach((entry) => {
      const row = entry.row - 1;
      rows[row][2] = entry.driver ?? null;
      rows[row][3] = entry.flag ?? null;
      rows[row][11] = entry.ntd ?? null;
      rows[row][12] = entry.cash ?? null;
      rows[row][13] = entry.adj ?? null;
    });
    xlsx.utils.book_append_sheet(workbook, xlsx.utils.aoa_to_sheet(rows), sheetName);
  });
  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

test('workbook checks report data payroll would skip or misread', async (t) => {
  const ctx = await startApp(t);

  const missing = await fetch(`${ctx.baseUrl}/api/workbook/checks`);
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).code, 'WORKBOOK_MISSING');

  fs.writeFileSync(ctx.workbookPath, buildCheckWorkbookBuffer({
    'Mon AM': [
      { row: 4, driver: 'Saddiki 445', cash: -50 },
      { row: 5, driver: 'Sadiki 445', cash: -20 },
      { row: 6, driver: 'Nasser 109', cash: -10 },
      { row: 7, driver: 'Nasser 277', cash: -10 },
      { row: 8, cash: -75 },
      { row: 9, driver: 'Amy Long', cash: 'fifty', adj: 'n/a' },
      { row: 10, driver: 'amy  long', cash: 30 }
    ],
    'Mon PM': [{ row: 4, driver: 'Amy Long', cash: -5 }],
    'Tues AM': [{ row: 4, driver: 'Bob', cash: 'oops' }]
  }));

  const response = await fetch(`${ctx.baseUrl}/api/workbook/checks?fromDay=Monday&toDay=Monday`);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.sheetsChecked, 2);
  assert.equal(body.errorCount, 0);
  assert.deepEqual(
    body.issues.map((issue) => issue.type).sort(),
    ['ADJ_IS_TEXT', 'AMOUNT_IS_TEXT', 'AMOUNT_WITHOUT_DRIVER', 'NAME_SIMILAR', 'NAME_VARIANTS']
  );
  const similar = body.issues.find((issue) => issue.type === 'NAME_SIMILAR');
  assert.match(similar.message, /Saddiki 445.*Sadiki 445/);
  const noDriver = body.issues.find((issue) => issue.type === 'AMOUNT_WITHOUT_DRIVER');
  assert.equal(noDriver.row, 8);
  assert.match(noDriver.message, /\$75\.00/);

  // A wider range reaches sheets that are missing from this workbook.
  const week = await (await fetch(`${ctx.baseUrl}/api/workbook/checks`)).json();
  assert.equal(week.sheetsChecked, 14);
  assert.equal(week.errorCount, 11);
  assert.equal(week.issues[0].type, 'SHEET_MISSING');
  assert.ok(week.issues.some((issue) => issue.type === 'AMOUNT_IS_TEXT' && issue.sheetName === 'Tues AM'));

  const badRange = await fetch(`${ctx.baseUrl}/api/workbook/checks?fromDay=Friday&toDay=Monday`);
  assert.equal(badRange.status, 400);

  // Formulas saved without a calculated result are reported once, not per row.
  const formulaWorkbook = xlsx.utils.book_new();
  const formulaSheet = xlsx.utils.aoa_to_sheet([[null]]);
  formulaSheet.C4 = { t: 's', v: 'Amy Long' };
  formulaSheet.L4 = { t: 'z', f: 'E4+F4' };
  formulaSheet.M4 = { t: 'n', v: -40 };
  formulaSheet.C5 = { t: 's', v: 'Bob' };
  formulaSheet.L5 = { t: 'n', v: 12, f: 'E5+F5' };
  formulaSheet.M5 = { t: 'z', f: 'L5-D5' };
  formulaSheet['!ref'] = 'A1:O47';
  xlsx.utils.book_append_sheet(formulaWorkbook, formulaSheet, 'Mon AM');
  xlsx.utils.book_append_sheet(formulaWorkbook, xlsx.utils.aoa_to_sheet([[null]]), 'Mon PM');
  fs.writeFileSync(ctx.workbookPath, xlsx.write(formulaWorkbook, { type: 'buffer', bookType: 'xlsx', sheetStubs: true }));

  const formulas = await (await fetch(`${ctx.baseUrl}/api/workbook/checks?fromDay=Monday&toDay=Monday`)).json();
  assert.deepEqual(
    formulas.issues.map((issue) => issue.type).sort(),
    ['FORMULAS_NOT_CALCULATED', 'NTD_NOT_CALCULATED']
  );
  assert.match(formulas.issues.find((issue) => issue.type === 'NTD_NOT_CALCULATED').message, /^1 NTD formula/);
});

test('driver lookup endpoint returns the weekly NTD summary', async (t) => {
  const ctx = await startApp(t);
  const sheets = {};
  ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri', 'Sat', 'Sun'].forEach((day) => {
    sheets[`${day} AM`] = [];
    sheets[`${day} PM`] = [];
  });
  sheets['Mon AM'] = [
    { row: 4, driver: 'Amy Long', flag: 'x', ntd: 100, cash: 60 },
    { row: 5, driver: 'Bob', flag: 'x', ntd: 20, cash: 20 }
  ];
  sheets['Tues PM'] = [{ row: 4, driver: 'Amy Long', flag: 'x', ntd: 10, cash: 30 }];
  fs.writeFileSync(ctx.workbookPath, buildCheckWorkbookBuffer(sheets));

  const all = await (await fetch(`${ctx.baseUrl}/api/driver-ntd`)).json();
  assert.equal(all.ok, true);
  assert.deepEqual(all.drivers.map((driver) => driver.driver), ['Amy Long', 'Bob']);

  const one = await (await fetch(`${ctx.baseUrl}/api/driver-ntd?driver=amy`)).json();
  assert.equal(one.drivers.length, 1);
  assert.equal(one.drivers[0].totals.ntd, 110);
  assert.equal(one.drivers[0].totals.cashInOut, 90);
  assert.equal(one.drivers[0].totals.balance, -20);
  assert.equal(one.drivers[0].days[0].balance, -40);
});

test('payroll export returns summary, drivers, and daily rows for a saved run', async (t) => {
  const ctx = await startApp(t);
  const { saveRun } = require('../../src/services/historyStore');
  const run = await saveRun(ctx.historyDir, {
    range: { fromDay: 'Monday', toDay: 'Tuesday' },
    rows: [
      { Day: '03/23', Driver: 'Driver One', Amount: 200, Adj: 0, Notes: '' },
      { Day: '03/24', Driver: 'Driver Two', Amount: 160, Adj: -10, Notes: 'Late' }
    ],
    groupedTotals: [
      { name: 'Driver One', totalAmount: 200, pay: [{ day: '03/23', amount: 200, adj: 0, notes: '' }] },
      { name: 'Driver Two', totalAmount: 150, pay: [{ day: '03/24', amount: 160, adj: -10, notes: 'Late' }] }
    ],
    zelleDrivers: ['Driver Two'],
    cashSummary: { weeklyGrossM41: 1000, zelleTotal: 150, cashToKeep: 1150 }
  });

  const response = await fetch(`${ctx.baseUrl}/api/reports/payroll-export?runId=${run.id}`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), new RegExp(`payroll-report-${run.id}\\.xlsx`));

  const workbook = xlsx.read(Buffer.from(await response.arrayBuffer()), { type: 'buffer' });
  assert.deepEqual(workbook.SheetNames, ['Summary', 'Drivers', 'Daily Rows']);

  const summary = Object.fromEntries(
    xlsx.utils.sheet_to_json(workbook.Sheets.Summary).map((row) => [row.Item, row.Value])
  );
  assert.equal(summary.Range, 'Monday to Tuesday');
  assert.equal(summary['Total payout'], 350);
  assert.equal(summary['Cash drivers total'], 200);
  assert.equal(summary['Zelle drivers total'], 150);
  assert.equal(summary['Cash to keep'], 1150);

  const drivers = xlsx.utils.sheet_to_json(workbook.Sheets.Drivers);
  assert.deepEqual(
    drivers.map((row) => [row.Driver, row.Type, row['Total Amount']]),
    [['Driver One', 'Cash', 200], ['Driver Two', 'Zelle', 150], ['TOTAL', '', 350]]
  );
  assert.equal(xlsx.utils.sheet_to_json(workbook.Sheets['Daily Rows']).length, 2);

  // Without a run id the export reads the latest output workbook, which does not exist here.
  const noOutput = await fetch(`${ctx.baseUrl}/api/reports/payroll-export`);
  assert.equal(noOutput.status, 422);
  const badId = await fetch(`${ctx.baseUrl}/api/reports/payroll-export?runId=nope`);
  assert.equal(badId.status, 400);
});
