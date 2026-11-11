const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const xlsx = require('xlsx');
const { EXPECTED_SHEETS, inspectWorkbookBuffer, replaceWorkbook } = require('./workbookStore');

// Columns the settlement pass can change, plus the driver column for labelling.
const COMPARE_ROWS = Object.freeze({ min: 4, max: 47 });
const COMPARE_COLUMNS = Object.freeze([
  { column: 'M', label: 'Cash in/out' },
  { column: 'N', label: 'Adjustment' },
  { column: 'O', label: 'Notes' }
]);
const DRIVER_COLUMN = 'C';
const MAX_DIFF_ROWS = 500;

function isValidBackupName(name) {
  return typeof name === 'string'
    && name.length > 0
    && name.length <= 200
    && !name.startsWith('.')
    && name === path.basename(name)
    && !name.includes('\\')
    && /\.xlsx$/i.test(name);
}

// Backup names end in .YYYYMMDD-HHMMSS.xlsx; that is when the backup was taken.
// (File times are not reliable: the settlement pass keeps the workbook's own modified time.)
function backupTimeFromName(name) {
  const match = String(name).match(/\.(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-\d+)?\.xlsx$/i);
  if (!match) {
    return null;
  }
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function listBackups(backupDir) {
  let entries;
  try {
    entries = await fsp.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const backups = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isValidBackupName(entry.name)) {
      continue;
    }
    const stats = await fsp.stat(path.join(backupDir, entry.name));
    backups.push({
      name: entry.name,
      sizeBytes: stats.size,
      createdAt: (backupTimeFromName(entry.name) || stats.mtime).toISOString()
    });
  }

  // File names carry a sortable timestamp; newest first.
  return backups.sort((a, b) => b.name.localeCompare(a.name));
}

function resolveBackupPath(backupDir, name) {
  if (!isValidBackupName(name)) {
    return null;
  }
  const fullPath = path.join(backupDir, name);
  return fs.existsSync(fullPath) ? fullPath : null;
}

function cellValue(sheet, address) {
  const cell = sheet?.[address];
  if (!cell || cell.t === 'z') {
    return '';
  }
  if (typeof cell.f === 'string' && cell.f.trim()) {
    return `=${cell.f.trim()}`;
  }
  const value = cell.v;
  if (value === undefined || value === null) {
    return '';
  }
  return typeof value === 'string' ? value.trim() : value;
}

function sameValue(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= 1e-9;
  }
  return String(a) === String(b);
}

// Lists the settlement-relevant cells where the backup differs from the current workbook.
function diffBackup(backupPath, workbookPath) {
  const options = { cellFormula: true, sheetRows: COMPARE_ROWS.max };
  const backup = xlsx.readFile(backupPath, options);
  const current = xlsx.readFile(workbookPath, options);

  const changes = [];
  let total = 0;

  EXPECTED_SHEETS.forEach((sheetName) => {
    const backupSheet = backup.Sheets[sheetName];
    const currentSheet = current.Sheets[sheetName];
    if (!backupSheet && !currentSheet) {
      return;
    }

    for (let row = COMPARE_ROWS.min; row <= COMPARE_ROWS.max; row += 1) {
      COMPARE_COLUMNS.forEach(({ column, label }) => {
        const address = `${column}${row}`;
        const inBackup = cellValue(backupSheet, address);
        const inCurrent = cellValue(currentSheet, address);
        if (sameValue(inBackup, inCurrent)) {
          return;
        }

        total += 1;
        if (changes.length < MAX_DIFF_ROWS) {
          const driver = cellValue(currentSheet, `${DRIVER_COLUMN}${row}`)
            || cellValue(backupSheet, `${DRIVER_COLUMN}${row}`);
          changes.push({
            sheetName,
            row,
            driver: String(driver),
            column,
            field: label,
            inBackup,
            inCurrent
          });
        }
      });
    }
  });

  return { total, truncated: total > changes.length, changes };
}

async function restoreBackup(backupPath, { workbookPath, backupDir }) {
  const buffer = await fsp.readFile(backupPath);
  const inspection = inspectWorkbookBuffer(buffer);
  if (!inspection.ok) {
    return { ok: false, message: inspection.message };
  }

  // replaceWorkbook backs up the current workbook first, so a restore can itself be undone.
  const { backupFile } = await replaceWorkbook(buffer, { workbookPath, backupDir });
  return { ok: true, backupFile };
}

module.exports = {
  isValidBackupName,
  listBackups,
  resolveBackupPath,
  diffBackup,
  restoreBackup
};
