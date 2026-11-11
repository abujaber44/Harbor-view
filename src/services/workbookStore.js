const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const xlsx = require('xlsx');
const { DAY_ORDER, DAY_SHEETS } = require('../config/constants');
const { normalizeDriverName } = require('../utils/driverNames');

const EXPECTED_SHEETS = DAY_ORDER.flatMap((day) => DAY_SHEETS[day]);
const DRIVER_ROWS = Object.freeze({ min: 4, max: 47, column: 'C' });
const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function backupTimestamp(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate())
  ].join('') + '-' + [
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join('');
}

function splitSheets(sheetNames) {
  const available = new Set(sheetNames || []);
  return {
    present: EXPECTED_SHEETS.filter((name) => available.has(name)),
    missing: EXPECTED_SHEETS.filter((name) => !available.has(name))
  };
}

function readWeekStartLabel(workbook) {
  for (const sheetName of EXPECTED_SHEETS) {
    const cell = workbook.Sheets?.[sheetName]?.B1;
    if (!cell) {
      continue;
    }
    const text = String(cell.w ?? cell.v ?? '').trim();
    if (text && !text.startsWith('=')) {
      return { sheetName, label: text };
    }
  }
  return null;
}

function getWorkbookStatus(workbookPath) {
  const fileName = path.basename(workbookPath);

  let stats;
  try {
    stats = fs.statSync(workbookPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { exists: false, fileName };
    }
    throw error;
  }

  const status = {
    exists: true,
    fileName,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    sheets: null,
    firstDate: null,
    readable: true
  };

  try {
    // Only the first row of each sheet is needed (sheet list + date cell B1).
    const workbook = xlsx.readFile(workbookPath, { sheetRows: 1 });
    status.sheets = splitSheets(workbook.SheetNames);
    status.firstDate = readWeekStartLabel(workbook);
  } catch (_error) {
    status.readable = false;
  }

  return status;
}

// Distinct driver names found in column C of the day sheets (same rows payroll reads).
function listWorkbookDrivers(workbookPath) {
  const workbook = xlsx.readFile(workbookPath, { sheetRows: DRIVER_ROWS.max });
  const byKey = new Map();

  EXPECTED_SHEETS.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return;
    }

    for (let row = DRIVER_ROWS.min; row <= DRIVER_ROWS.max; row += 1) {
      const value = sheet[`${DRIVER_ROWS.column}${row}`]?.v;
      if (typeof value !== 'string' && typeof value !== 'number') {
        continue;
      }
      const displayName = String(value).trim().replace(/\s+/g, ' ');
      const key = normalizeDriverName(displayName);
      if (key && !byKey.has(key)) {
        byKey.set(key, displayName);
      }
    }
  });

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

function inspectWorkbookBuffer(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { ok: false, message: 'No file was received.' };
  }

  if (buffer.length < XLSX_MAGIC.length || !buffer.subarray(0, XLSX_MAGIC.length).equals(XLSX_MAGIC)) {
    return { ok: false, message: 'The file is not an .xlsx workbook.' };
  }

  let sheetNames;
  try {
    sheetNames = xlsx.read(buffer, { type: 'buffer', bookSheets: true }).SheetNames || [];
  } catch (_error) {
    return { ok: false, message: 'The file could not be opened as an .xlsx workbook.' };
  }

  const sheets = splitSheets(sheetNames);
  if (sheets.present.length === 0) {
    return {
      ok: false,
      message: 'The workbook has none of the expected day sheets (for example "Mon AM"). It does not look like a Daily Sheet.'
    };
  }

  return { ok: true, sheets };
}

async function backupExistingWorkbook(workbookPath, backupDir) {
  try {
    await fsp.access(workbookPath);
  } catch (_error) {
    return null;
  }

  await fsp.mkdir(backupDir, { recursive: true });
  const baseName = path.parse(workbookPath).name;
  const stamp = backupTimestamp();

  let backupPath = path.join(backupDir, `${baseName}.${stamp}.xlsx`);
  for (let attempt = 2; fs.existsSync(backupPath); attempt += 1) {
    backupPath = path.join(backupDir, `${baseName}.${stamp}-${attempt}.xlsx`);
  }

  await fsp.copyFile(workbookPath, backupPath);
  return path.basename(backupPath);
}

async function replaceWorkbook(buffer, { workbookPath, backupDir }) {
  const backupFile = await backupExistingWorkbook(workbookPath, backupDir);

  // Write next to the target and rename so a failed write never leaves a partial workbook.
  const tempPath = path.join(path.dirname(workbookPath), `.upload-${process.pid}-${Date.now()}.tmp`);
  try {
    await fsp.writeFile(tempPath, buffer);
    await fsp.rename(tempPath, workbookPath);
  } catch (error) {
    await fsp.rm(tempPath, { force: true });
    throw error;
  }

  return { backupFile };
}

module.exports = {
  EXPECTED_SHEETS,
  backupTimestamp,
  getWorkbookStatus,
  listWorkbookDrivers,
  inspectWorkbookBuffer,
  replaceWorkbook
};
