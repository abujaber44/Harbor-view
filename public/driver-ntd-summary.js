const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const form = document.getElementById('settlement-form');
const fromDaySelect = document.getElementById('from-day');
const toDaySelect = document.getElementById('to-day');
const statusEl = document.getElementById('settlement-status');
const warningsEl = document.getElementById('settlement-warnings');
const previewButton = document.getElementById('settlement-preview-btn');
const applyButton = document.getElementById('settlement-apply-btn');
const previewRoot = document.getElementById('settlement-preview');

let latestPreview = null;
let latestRange = null;
let busy = false;

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatPreviewDateCell(row) {
  const day = String(row?.day || '').trim();
  const service = String(row?.serviceDate || row?.serviceLabel || '').trim();

  if (!day) return service;
  if (!service) return day;

  const dayLower = day.toLowerCase();
  const serviceLower = service.toLowerCase();

  if (serviceLower === dayLower) {
    return day;
  }

  if (serviceLower.startsWith(`${dayLower} `)) {
    return service;
  }

  const withoutWeekday = service
    .replace(/\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (serviceLower.includes(dayLower) && withoutWeekday) {
    return `${day} ${withoutWeekday}`;
  }

  if (serviceLower.includes(dayLower)) {
    return day;
  }

  return `${day} ${service}`;
}

function setStatus(text, type = 'neutral') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function renderWarnings(warnings) {
  warningsEl.innerHTML = '';
  (warnings || []).forEach((warning) => {
    const li = document.createElement('li');
    li.textContent = warning;
    warningsEl.appendChild(li);
  });
}

function setBusy(nextBusy) {
  busy = Boolean(nextBusy);
  previewButton.disabled = busy;
  applyButton.disabled = busy || !latestPreview;
}

function clearPreview() {
  previewRoot.innerHTML = '';
}

function getSelectedRange() {
  const fromDay = String(fromDaySelect.value || '').trim();
  const toDay = String(toDaySelect.value || '').trim();
  if (!fromDay || !toDay) {
    return { ok: false, message: 'Start day and end day are required.' };
  }

  const fromIndex = DAY_ORDER.indexOf(fromDay);
  const toIndex = DAY_ORDER.indexOf(toDay);
  if (fromIndex < 0 || toIndex < 0 || fromIndex > toIndex) {
    return { ok: false, message: 'Start day must be on or before end day.' };
  }

  return { ok: true, fromDay, toDay };
}

function renderOverview(preview) {
  const overview = document.createElement('div');
  overview.className = 'inline-grid';
  overview.innerHTML = `
    <div class="status-lite">Drivers Reviewed: <strong>${preview.driversReviewed ?? preview.driversProcessed ?? 0}</strong></div>
    <div class="status-lite">Drivers With Open Balance: <strong>${preview.driversWithOpenBalance ?? 0}</strong></div>
    <div class="status-lite">Rows Changing: <strong>${preview.rowsChanged ?? preview.rowsAdjusted ?? 0}</strong></div>
    <div class="status-lite">Total Deducted: <strong>${formatMoney(preview.totalDeducted)}</strong></div>
    <div class="status-lite">Locked Sessions Skipped: <strong>${preview.lockedSessionsSkipped ?? 0}</strong></div>
    <div class="status-lite">Unresolved Shortage: <strong>${formatMoney(preview.unresolvedShortageTotal)}</strong></div>
  `;
  previewRoot.appendChild(overview);
}

function renderDriverRows(driver) {
  const rows = Array.isArray(driver.rows) ? driver.rows : [];
  if (rows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'status-lite';
    empty.textContent = 'No row-level data for this driver.';
    return empty;
  }

  const wrap = document.createElement('div');
  wrap.className = 'settlement-preview-table-wrap';
  const table = document.createElement('table');
  table.className = 'settlement-preview-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Shift</th>
        <th>Row</th>
        <th class="number">Balance Before</th>
        <th class="number">Balance After</th>
        <th class="number">Cash In/Out Before</th>
        <th class="number">Cash In/Out After</th>
        <th class="number">Driver Short Before</th>
        <th class="number">Driver Short After</th>
        <th>Notes Before</th>
        <th>Notes After</th>
        <th>Flags</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((row) => {
        const flags = row.ignored ? 'Ignored' : (row.changed ? 'Changed' : '-');
        return `
          <tr>
            <td>${formatPreviewDateCell(row)}</td>
            <td>${row.period || ''}</td>
            <td>${row.rowNumber ?? ''}</td>
            <td class="number">${formatMoney(row.balanceBefore)}</td>
            <td class="number">${formatMoney(row.balanceAfter)}</td>
            <td class="number">${formatMoney(row.cashInOutBefore)}</td>
            <td class="number">${formatMoney(row.cashInOutAfter)}</td>
            <td class="number">${formatMoney(row.adjBefore ?? row.driverShortBefore)}</td>
            <td class="number">${formatMoney(row.adjAfter ?? row.driverShortAfter)}</td>
            <td>${row.notesBefore || '-'}</td>
            <td>${row.notesAfter || '-'}</td>
            <td>${flags}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;

  wrap.appendChild(table);
  return wrap;
}

function renderDrivers(preview) {
  const drivers = Array.isArray(preview.drivers) ? preview.drivers : [];
  if (drivers.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'status-lite';
    empty.innerHTML = 'No drivers with non-zero balance in the selected range.';
    previewRoot.appendChild(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'settlement-preview-driver-list';

  drivers.forEach((driver) => {
    const card = document.createElement('article');
    card.className = 'settlement-preview-driver-card';
    card.innerHTML = `
      <div class="settlement-preview-driver-head">
        <h4>${driver.driver}</h4>
        <span class="badge">${driver.outcome || 'Preview'}</span>
      </div>
      <div class="inline-grid">
        <div class="status-lite">Open Balance Before: <strong>${formatMoney(driver.startingOpenBalance)}</strong></div>
        <div class="status-lite">Open Balance After: <strong>${formatMoney(driver.endingOpenBalance)}</strong></div>
        <div class="status-lite">Deducted: <strong>${formatMoney(driver.totalDeducted)}</strong></div>
      </div>
    `;
    card.appendChild(renderDriverRows(driver));
    list.appendChild(card);
  });

  previewRoot.appendChild(list);
}

function renderPreview(preview) {
  clearPreview();
  renderOverview(preview);
  renderDrivers(preview);
}

async function runPreview() {
  const range = getSelectedRange();
  if (!range.ok) {
    setStatus(range.message, 'error');
    return;
  }

  latestPreview = null;
  latestRange = null;
  applyButton.disabled = true;
  renderWarnings([]);
  clearPreview();
  setBusy(true);
  setStatus('Generating settlement preview...', 'neutral');

  try {
    const response = await fetch('/api/settlement/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDay: range.fromDay, toDay: range.toDay })
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Failed to preview settlement.'} (${data.code || 'UNKNOWN'})`);
    }

    latestPreview = data;
    latestRange = { fromDay: range.fromDay, toDay: range.toDay };
    renderWarnings(data.warnings || []);
    renderPreview(data);
    applyButton.disabled = false;
    setStatus(`Settlement preview ready for ${range.fromDay} to ${range.toDay}. Review details, then approve to apply.`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

async function runApply() {
  const range = getSelectedRange();
  if (!range.ok) {
    setStatus(range.message, 'error');
    return;
  }

  if (!latestPreview || !latestRange) {
    setStatus('Generate settlement preview first, then approve.', 'error');
    return;
  }

  if (latestRange.fromDay !== range.fromDay || latestRange.toDay !== range.toDay) {
    latestPreview = null;
    latestRange = null;
    applyButton.disabled = true;
    setStatus('Day range changed. Generate a fresh preview before applying.', 'error');
    return;
  }

  setBusy(true);
  setStatus('Applying settlement pass...', 'neutral');

  try {
    const response = await fetch('/api/settlement/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromDay: range.fromDay, toDay: range.toDay })
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Failed to apply settlement.'} (${data.code || 'UNKNOWN'})`);
    }

    renderWarnings(data.warnings || []);
    renderPreview(data);
    latestPreview = null;
    latestRange = null;
    applyButton.disabled = true;
    setStatus(`Settlement pass applied for ${range.fromDay} to ${range.toDay}. Backup: ${data.backupFile || 'created'}.`, 'success');
    loadBackups();
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

// ---- Workbook backups: list, compare, restore ----

const backupsBody = document.getElementById('backups-body');
const backupsEmpty = document.getElementById('backups-empty');
const backupsTableWrap = document.getElementById('backups-table-wrap');
const backupsStatusEl = document.getElementById('backups-status');
const backupDiffEl = document.getElementById('backup-diff');

function setBackupsStatus(text, type = 'neutral') {
  backupsStatusEl.textContent = text;
  backupsStatusEl.className = `status ${type}`;
}

function formatBackupTime(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDiffValue(value) {
  if (value === '' || value === null || value === undefined) {
    return '(empty)';
  }
  return String(value);
}

function addCell(row, text, className) {
  const cell = document.createElement('td');
  cell.textContent = text;
  if (className) {
    cell.className = className;
  }
  row.appendChild(cell);
  return cell;
}

function renderBackups(backups) {
  backupsBody.innerHTML = '';
  const hasBackups = backups.length > 0;
  backupsEmpty.classList.toggle('hidden', hasBackups);
  backupsTableWrap.classList.toggle('hidden', !hasBackups);

  backups.forEach((backup) => {
    const row = document.createElement('tr');
    row.dataset.backupName = backup.name;
    addCell(row, formatBackupTime(backup.createdAt));
    addCell(row, backup.name);
    addCell(row, `${Math.max(1, Math.round(Number(backup.sizeBytes || 0) / 1024))} KB`);

    const actions = addCell(row, '', 'row-actions');

    const compareButton = document.createElement('button');
    compareButton.type = 'button';
    compareButton.className = 'secondary small';
    compareButton.textContent = 'Compare';
    compareButton.addEventListener('click', () => compareBackup(backup));

    const restoreButton = document.createElement('button');
    restoreButton.type = 'button';
    restoreButton.className = 'ghost small';
    restoreButton.textContent = 'Restore';
    restoreButton.addEventListener('click', () => restoreBackup(backup));

    actions.appendChild(compareButton);
    actions.appendChild(restoreButton);
    backupsBody.appendChild(row);
  });
}

async function loadBackups() {
  try {
    const response = await fetch('/api/backups');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not list backups.');
    }
    renderBackups(Array.isArray(data.backups) ? data.backups : []);
  } catch (error) {
    renderBackups([]);
    setBackupsStatus(`Could not load backups: ${error.message}`, 'error');
  }
}

function renderBackupDiff(backup, diff) {
  backupDiffEl.innerHTML = '';
  backupDiffEl.classList.remove('hidden');

  const heading = document.createElement('h3');
  heading.textContent = `Compared with ${backup.name}`;
  backupDiffEl.appendChild(heading);

  const summary = document.createElement('p');
  summary.className = 'subtext';
  summary.textContent = diff.total === 0
    ? 'No differences in cash in/out, adjustment, or notes. Restoring would not change those cells.'
    : `${diff.total} cell(s) differ in cash in/out, adjustment, or notes. Restoring sets them back to the "In backup" value.${diff.truncated ? ` Showing the first ${diff.changes.length}.` : ''}`;
  backupDiffEl.appendChild(summary);

  if (diff.total === 0) {
    return;
  }

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Sheet</th>
        <th>Row</th>
        <th>Driver</th>
        <th>Field</th>
        <th>In backup</th>
        <th>Now</th>
      </tr>
    </thead>
  `;
  const body = document.createElement('tbody');
  diff.changes.forEach((change) => {
    const row = document.createElement('tr');
    addCell(row, change.sheetName);
    addCell(row, String(change.row));
    addCell(row, change.driver || '-');
    addCell(row, change.field);
    addCell(row, formatDiffValue(change.inBackup));
    addCell(row, formatDiffValue(change.inCurrent));
    body.appendChild(row);
  });
  table.appendChild(body);
  wrap.appendChild(table);
  backupDiffEl.appendChild(wrap);
}

async function compareBackup(backup) {
  setBackupsStatus(`Comparing ${backup.name} with the current workbook...`, 'neutral');
  try {
    const response = await fetch(`/api/backups/${encodeURIComponent(backup.name)}/diff`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not compare the backup.'} (${data.code || 'UNKNOWN'})`);
    }
    renderBackupDiff(backup, data);
    setBackupsStatus(`Comparison ready for ${backup.name}.`, 'success');
  } catch (error) {
    setBackupsStatus(error.message, 'error');
  }
}

async function restoreBackup(backup) {
  const question = `Restore the workbook from ${backup.name}?\n\n`
    + 'The whole workbook goes back to that version. The current workbook is backed up first, so this can be undone.';
  if (!window.confirm(question)) {
    return;
  }

  setBackupsStatus(`Restoring ${backup.name}...`, 'neutral');
  try {
    const response = await fetch(`/api/backups/${encodeURIComponent(backup.name)}/restore`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not restore the backup.'} (${data.code || 'UNKNOWN'})`);
    }

    // Any preview on screen was computed from the workbook that was just replaced.
    latestPreview = null;
    latestRange = null;
    applyButton.disabled = true;
    clearPreview();
    renderWarnings([]);
    backupDiffEl.classList.add('hidden');
    setStatus('Workbook restored. Generate a new preview before applying.', 'neutral');
    setBackupsStatus(
      `Workbook restored from ${backup.name}. The previous workbook was saved as ${data.backupFile || 'a new backup'}.`,
      'success'
    );
    await loadBackups();
  } catch (error) {
    setBackupsStatus(error.message, 'error');
  }
}

previewButton.addEventListener('click', runPreview);
applyButton.addEventListener('click', runApply);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  runPreview();
});

fromDaySelect.value = 'Monday';
toDaySelect.value = 'Sunday';
setStatus('Select a range and click Preview Settlement.', 'neutral');
clearPreview();
loadBackups();
