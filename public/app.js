const form = document.getElementById('payroll-form');
const statusEl = document.getElementById('status');
const warningsEl = document.getElementById('warnings');
const rowsBody = document.getElementById('rows-body');
const submitButton = document.getElementById('submit-btn');
const reportOverviewBody = document.getElementById('report-overview-body');

const allSlipsButton = document.getElementById('all-slips-btn');
const cashSlipsButton = document.getElementById('cash-slips-btn');
const zelleOverviewButton = document.getElementById('zelle-overview-btn');
const zelleExportButton = document.getElementById('zelle-export-btn');
const cashKeepButton = document.getElementById('cash-keep-btn');

const reportPreview = document.getElementById('report-preview');
const reportTitle = document.getElementById('report-title');
const reportPeriod = document.getElementById('report-period');
const reportSlips = document.getElementById('report-slips');

const needsRunSections = Array.from(document.querySelectorAll('.needs-run'));
const stepperItems = Array.from(document.querySelectorAll('#stepper li'));
const rangeLabel = document.getElementById('range-label');
const runBanner = document.getElementById('run-banner');
const runBannerText = document.getElementById('run-banner-text');
const runBannerClose = document.getElementById('run-banner-close');

const sumTotal = document.getElementById('sum-total');
const sumDrivers = document.getElementById('sum-drivers');
const sumCash = document.getElementById('sum-cash');
const sumCashCount = document.getElementById('sum-cash-count');
const sumZelle = document.getElementById('sum-zelle');
const sumZelleCount = document.getElementById('sum-zelle-count');
const sumKeep = document.getElementById('sum-keep');
const sumKeepNote = document.getElementById('sum-keep-note');

const workbookBadge = document.getElementById('workbook-badge');
const workbookFile = document.getElementById('workbook-file');
const workbookModified = document.getElementById('workbook-modified');
const workbookDate = document.getElementById('workbook-date');
const workbookSheets = document.getElementById('workbook-sheets');
const workbookDropzone = document.getElementById('workbook-dropzone');
const workbookChooseButton = document.getElementById('workbook-choose-btn');
const workbookFileInput = document.getElementById('workbook-file-input');
const workbookStatusEl = document.getElementById('workbook-status');

const historyBody = document.getElementById('history-body');
const historyEmpty = document.getElementById('history-empty');
const historyTableWrap = document.getElementById('history-table-wrap');

let workbookReady = false;
let workbookExists = false;
let viewingRunId = null;
let latestRange = null;
let latestGroupedTotals = [];
let latestZelleDrivers = [];
let latestReportData = {
  allDrivers: [],
  cashDrivers: [],
  zelleDriverRows: [],
  cashSummary: null
};

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function formatSignedMoney(amount) {
  const value = Number(amount || 0);
  const sign = value >= 0 ? '+' : '-';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function normalizeDriverName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function sortDriversDesc(drivers) {
  return [...(drivers || [])].sort((a, b) => {
    const aAmount = Number(a.totalAmount || 0);
    const bAmount = Number(b.totalAmount || 0);
    if (aAmount !== bAmount) {
      return bAmount - aAmount;
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function buildLocalReportData(groupedTotals, zelleDrivers) {
  const zelleLookup = new Set((zelleDrivers || []).map((name) => normalizeDriverName(name)).filter(Boolean));
  const allDrivers = sortDriversDesc(
    (groupedTotals || []).map((group) => ({
      ...group,
      isZelle: zelleLookup.has(normalizeDriverName(group.name))
    }))
  );

  return {
    allDrivers,
    cashDrivers: allDrivers.filter((driver) => !driver.isZelle),
    zelleDriverRows: allDrivers.filter((driver) => driver.isZelle),
    cashSummary: null
  };
}

function clearResults() {
  rowsBody.innerHTML = '';
  renderOverview([]);
  warningsEl.innerHTML = '';
  reportPreview.classList.add('hidden');
  reportTitle.textContent = 'Report';
  reportPeriod.textContent = '';
  reportSlips.innerHTML = '';
  latestRange = null;
  latestGroupedTotals = [];
  latestReportData = {
    allDrivers: [],
    cashDrivers: [],
    zelleDriverRows: [],
    cashSummary: null
  };
  viewingRunId = null;
  runBanner.classList.add('hidden');
  setResultsVisible(false);
  updateReportButtonState();
  updateStepper();
  markActiveHistoryRow();
}

function setResultsVisible(visible) {
  needsRunSections.forEach((section) => section.classList.toggle('hidden', !visible));
}

function updateStepper() {
  const hasRun = Boolean(latestRange);
  const done = {
    workbook: workbookReady,
    range: hasRun,
    reports: false
  };
  const current = !workbookReady ? 'workbook' : (hasRun ? 'reports' : 'range');

  stepperItems.forEach((item) => {
    const step = item.dataset.step;
    item.classList.toggle('is-done', Boolean(done[step]));
    item.classList.toggle('is-current', step === current);
  });
}

function sumTotals(drivers) {
  return (drivers || []).reduce((sum, driver) => sum + Number(driver.totalAmount || 0), 0);
}

function countLabel(count, noun) {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function renderSummaryCards() {
  const { allDrivers, cashDrivers, zelleDriverRows, cashSummary } = latestReportData;

  sumTotal.textContent = formatMoney(sumTotals(allDrivers));
  sumDrivers.textContent = countLabel(allDrivers.length, 'driver');
  sumCash.textContent = formatMoney(sumTotals(cashDrivers));
  sumCashCount.textContent = countLabel(cashDrivers.length, 'driver');
  sumZelle.textContent = formatMoney(sumTotals(zelleDriverRows));
  sumZelleCount.textContent = countLabel(zelleDriverRows.length, 'driver');

  if (cashSummary) {
    sumKeep.textContent = formatMoney(cashSummary.cashToKeep);
    sumKeepNote.textContent = `Weekly Gross ${formatMoney(cashSummary.weeklyGrossM41)} + Zelle`;
  } else {
    sumKeep.textContent = '—';
    sumKeepNote.textContent = 'Not available';
  }

  rangeLabel.textContent = latestRange ? `${latestRange.fromDay} to ${latestRange.toDay}` : '';
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

function renderRows(rows) {
  rowsBody.innerHTML = '';

  rows.forEach((item) => {
    const row = document.createElement('tr');
    ['Day', 'Driver', 'Amount', 'Adj', 'Notes'].forEach((field) => {
      const cell = document.createElement('td');
      const value = field === 'Amount' || field === 'Adj'
        ? formatMoney(item[field])
        : (item[field] ?? '');
      cell.textContent = String(value);
      row.appendChild(cell);
    });

    rowsBody.appendChild(row);
  });
}

const driverSearch = document.getElementById('driver-search');
const driverTypeButtons = Array.from(document.querySelectorAll('#driver-type-filter button'));
const driverExpandAll = document.getElementById('driver-expand-all');
const driverSortButtons = Array.from(document.querySelectorAll('button[data-sort]'));
const driverTableFoot = document.getElementById('driver-table-foot');
const driverEmpty = document.getElementById('driver-empty');

let rankedDrivers = [];
const driverView = {
  search: '',
  type: 'all',
  sortKey: 'total',
  sortDir: 'desc',
  expandAll: false,
  expanded: new Set()
};

function compareDrivers(a, b) {
  let result = 0;
  if (driverView.sortKey === 'name') {
    result = String(a.name || '').localeCompare(String(b.name || ''));
  } else if (driverView.sortKey === 'type') {
    result = Number(a.isZelle) - Number(b.isZelle);
  } else if (driverView.sortKey === 'days') {
    result = a.pay.length - b.pay.length;
  } else {
    result = Number(a.totalAmount || 0) - Number(b.totalAmount || 0);
  }

  if (result === 0) {
    // Ties always fall back to payout rank so the order stays stable.
    return a.rank - b.rank;
  }
  return driverView.sortDir === 'asc' ? result : -result;
}

function getVisibleDrivers() {
  const query = normalizeDriverName(driverView.search);
  return rankedDrivers
    .filter((driver) => {
      if (driverView.type === 'zelle' && !driver.isZelle) return false;
      if (driverView.type === 'cash' && driver.isZelle) return false;
      return !query || normalizeDriverName(driver.name).includes(query);
    })
    .sort(compareDrivers);
}

function buildDetailLines(driver) {
  const container = document.createElement('div');
  container.className = 'details';
  driver.pay.forEach((entry, idx) => {
    const line = document.createElement('div');
    const parts = [`${entry.day}: ${formatMoney(entry.amount)}`];
    if (Number(entry.adj) !== 0) {
      parts.push(`adj ${formatSignedMoney(entry.adj)}`);
    }
    if (entry.notes) {
      parts.push(entry.notes);
    }
    line.textContent = parts.join(' | ');
    container.appendChild(line);
    if (idx < driver.pay.length - 1) {
      container.appendChild(document.createElement('hr'));
    }
  });
  return container;
}

function renderDriverTable() {
  const visible = getVisibleDrivers();
  reportOverviewBody.innerHTML = '';

  visible.forEach((driver) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    rankCell.textContent = String(driver.rank);

    const nameCell = document.createElement('td');
    nameCell.textContent = driver.name;

    const typeCell = document.createElement('td');
    typeCell.innerHTML = driver.isZelle
      ? '<span class="pill pill-zelle">Zelle</span>'
      : '<span class="pill pill-other">Cash</span>';

    const totalCell = document.createElement('td');
    totalCell.className = 'number';
    totalCell.textContent = formatMoney(driver.totalAmount);

    const detailsCell = document.createElement('td');
    const isOpen = driverView.expandAll || driverView.expanded.has(driver.name);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'link-button';
    toggle.setAttribute('aria-expanded', String(isOpen));
    toggle.textContent = `${isOpen ? '▾' : '▸'} ${driver.pay.length} ${driver.pay.length === 1 ? 'entry' : 'entries'}`;
    toggle.disabled = driverView.expandAll;
    toggle.addEventListener('click', () => {
      if (driverView.expanded.has(driver.name)) {
        driverView.expanded.delete(driver.name);
      } else {
        driverView.expanded.add(driver.name);
      }
      renderDriverTable();
    });
    detailsCell.appendChild(toggle);
    if (isOpen) {
      detailsCell.appendChild(buildDetailLines(driver));
    }

    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(typeCell);
    row.appendChild(totalCell);
    row.appendChild(detailsCell);
    reportOverviewBody.appendChild(row);
  });

  driverEmpty.classList.toggle('hidden', visible.length > 0 || rankedDrivers.length === 0);
  driverTableFoot.textContent = rankedDrivers.length === 0
    ? ''
    : `Showing ${visible.length} of ${countLabel(rankedDrivers.length, 'driver')} · ${formatMoney(sumTotals(visible))}`;

  driverSortButtons.forEach((button) => {
    const active = button.dataset.sort === driverView.sortKey;
    const th = button.closest('th');
    th.setAttribute('aria-sort', active ? (driverView.sortDir === 'asc' ? 'ascending' : 'descending') : 'none');
    button.querySelector('.sort-arrow').textContent = active ? (driverView.sortDir === 'asc' ? '▲' : '▼') : '';
  });

  driverTypeButtons.forEach((button) => {
    button.classList.toggle('is-active', button.dataset.type === driverView.type);
    button.setAttribute('aria-pressed', String(button.dataset.type === driverView.type));
  });
}

// Drivers arrive sorted by total (highest first); that order is the rank.
function renderOverview(drivers) {
  rankedDrivers = (drivers || []).map((driver, index) => ({ ...driver, rank: index + 1 }));
  driverView.expanded.clear();
  renderDriverTable();
}

driverSearch.addEventListener('input', () => {
  driverView.search = driverSearch.value;
  renderDriverTable();
});

driverTypeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    driverView.type = button.dataset.type;
    renderDriverTable();
  });
});

driverExpandAll.addEventListener('change', () => {
  driverView.expandAll = driverExpandAll.checked;
  renderDriverTable();
});

driverSortButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const key = button.dataset.sort;
    if (driverView.sortKey === key) {
      driverView.sortDir = driverView.sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      driverView.sortKey = key;
      driverView.sortDir = key === 'name' ? 'asc' : 'desc';
    }
    renderDriverTable();
  });
});

function getRecoveryTip(code) {
  if (code === 'DEPENDENCY_MISSING') {
    return 'Install Python dependencies: pip install -r requirements.txt';
  }
  if (code === 'WORKBOOK_MISSING') {
    return 'Upload the workbook in step 1, or place Daily Sheet.xlsx in the project root.';
  }
  if (code === 'INPUT_INVALID') {
    return 'Choose valid weekdays and ensure From Day is before or equal to To Day.';
  }
  return 'Check the server logs for details and retry.';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSlipLine(entry) {
  const amount = formatMoney(entry.amount);
  const adj = Number(entry.adj || 0);
  const noteText = String(entry.notes || '').trim();
  const hasDeductionNote = /\bdeducted\b/i.test(noteText);

  const pieces = [`Date ${entry.day}: ${amount}`];
  if (adj !== 0) {
    if (!hasDeductionNote) {
      pieces.push(`Adj ${formatSignedMoney(adj)}`);
    }
  }
  if (noteText) {
    pieces.push(noteText);
  }

  return pieces.join(' | ');
}

function normalizeSlipLines(group) {
  const maxLines = 7;
  const lines = group.pay.slice(0, maxLines).map((entry) => formatSlipLine(entry));
  if (group.pay.length > maxLines && lines.length > 0) {
    lines[lines.length - 1] = `${lines[lines.length - 1]} | +${group.pay.length - maxLines} more`;
  }
  while (lines.length < maxLines) {
    lines.push('\u00a0');
  }
  return lines;
}

function showReportPreview(title, subtitle, html, shouldPrint = false) {
  reportTitle.textContent = title;
  reportPeriod.textContent = subtitle || '';
  reportSlips.innerHTML = html;
  reportPreview.classList.remove('hidden');

  if (shouldPrint) {
    window.print();
  }
}

function buildPaySlipCards(drivers) {
  return drivers.map((group) => {
    const details = normalizeSlipLines(group).map((line) => (
      `<div class="report-line${line === '\u00a0' ? ' report-line-empty' : ''}">${escapeHtml(line)}</div>`
    )).join('');

    const driverLabel = group.isZelle ? `${group.name} (Zelle)` : group.name;
    return `
      <article class="report-slip">
        <div class="report-driver-row">
          <div class="report-driver">${escapeHtml(driverLabel)}</div>
        </div>
        <div class="report-total">Total: ${escapeHtml(formatMoney(group.totalAmount))}</div>
        <div class="report-details">${details}</div>
      </article>
    `;
  }).join('');
}

function buildPaySlipPrintDocument(drivers, title) {
  const cards = buildPaySlipCards(drivers);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      font-family: "Avenir Next", "Nunito Sans", "Segoe UI", sans-serif;
      color: #0f172a;
      background: #ffffff;
    }
    .report-root {
      padding: 10px;
    }
    .report-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
    }
    .report-slip {
      border: 1.4px solid #0f172a;
      border-radius: 0;
      padding: 6px 8px;
      page-break-inside: avoid;
      break-inside: avoid;
      min-height: 2.42in;
      display: grid;
      grid-template-rows: auto auto 1fr;
      background: #fff;
    }
    .report-driver-row {
      margin: 0 0 2px;
    }
    .report-driver {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: #0f172a;
      text-align: center;
    }
    .report-total {
      font-weight: 700;
      margin-bottom: 5px;
      padding-bottom: 4px;
      border-bottom: 1px solid #cbd5e1;
      font-size: 14px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }
    .report-line {
      min-height: 0.245in;
      padding: 2px 0;
      border-bottom: 1px dashed #aab4c2;
      font-size: 11.3px;
      line-height: 1.18;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      font-variant-numeric: tabular-nums;
    }
    .report-line:last-child {
      border-bottom: none;
    }
    .report-line-empty {
      color: transparent;
    }
    @media print {
      @page {
        size: letter portrait;
        margin: 0.25in;
      }
      body {
        padding: 0;
      }
      .report-root {
        padding: 0;
      }
      .report-grid {
        gap: 6px;
      }
      .report-slip {
        min-height: 2.38in;
        padding: 6px 8px;
      }
    }
  </style>
</head>
<body>
  <div class="report-root">
    <div class="report-grid">${cards}</div>
  </div>
</body>
</html>`;
}

function printStandaloneHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.srcdoc = html;

  iframe.onload = () => {
    const target = iframe.contentWindow;
    if (!target) {
      iframe.remove();
      return;
    }

    target.focus();
    setTimeout(() => {
      target.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 60);
  };

  document.body.appendChild(iframe);
}

function renderPaySlipReport(drivers, title) {
  const subtitle = latestRange ? `Period: ${latestRange.fromDay} to ${latestRange.toDay}` : '';
  const cards = buildPaySlipCards(drivers);
  const html = `<div class="report-grid">${cards}</div>`;

  showReportPreview(title, subtitle, html, false);
  printStandaloneHtml(buildPaySlipPrintDocument(drivers, title));
}

function renderZelleOverview() {
  const zelleRows = latestReportData.zelleDriverRows;
  const total = zelleRows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);

  const html = `
    <div class="table-wrap report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Driver</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${zelleRows.map((driver) => `
            <tr>
              <td>${escapeHtml(driver.name)}</td>
              <td>${escapeHtml(formatMoney(driver.totalAmount))}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Sum</strong></td>
            <td><strong>${escapeHtml(formatMoney(total))}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  showReportPreview('Zelle Report Overview', 'Not pay slips. Use export for Excel download.', html, false);
}

function renderCashToKeepReport() {
  const summary = latestReportData.cashSummary;
  const html = `
    <div class="table-wrap report-table-wrap">
      <table class="report-table">
        <tbody>
          <tr>
            <td>Weekly Gross (M41)</td>
            <td>${escapeHtml(formatMoney(summary.weeklyGrossM41))}</td>
          </tr>
          <tr>
            <td>Zelle Drivers Total Pay</td>
            <td>${escapeHtml(formatMoney(summary.zelleTotal))}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td><strong>Cash To Keep</strong></td>
            <td><strong>${escapeHtml(formatMoney(summary.cashToKeep))}</strong></td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  showReportPreview('Cash To Keep Report', 'From Daily Sheet.xlsx - Weekly Gross!M41 + total Zelle pay', html, true);
}

function updateReportButtonState() {
  const hasRun = Boolean(latestRange);
  const allCount = latestReportData.allDrivers.length;
  const cashCount = latestReportData.cashDrivers.length;
  const zelleCount = latestReportData.zelleDriverRows.length;

  allSlipsButton.disabled = !hasRun || allCount === 0;
  cashSlipsButton.disabled = !hasRun || cashCount === 0;
  zelleOverviewButton.disabled = !hasRun || zelleCount === 0;
  zelleExportButton.disabled = !hasRun || zelleCount === 0;
  cashKeepButton.disabled = !hasRun || !latestReportData.cashSummary;
}

function applyReportData(data) {
  latestReportData = {
    allDrivers: data.allDrivers || [],
    cashDrivers: data.cashDrivers || [],
    zelleDriverRows: data.zelleDriverRows || [],
    cashSummary: data.cashSummary || null
  };
  renderOverview(latestReportData.allDrivers);
  renderSummaryCards();
  setResultsVisible(Boolean(latestRange));
  updateReportButtonState();
  updateStepper();
}

async function loadZelleDrivers() {
  try {
    const response = await fetch('/api/zelle-drivers');
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not load Zelle drivers.');
    }

    latestZelleDrivers = Array.isArray(data.drivers) ? data.drivers : [];
  } catch (_error) {
    latestZelleDrivers = [];
  }
}

async function refreshReportDataFromServer() {
  const response = await fetch('/api/sorted-driver-pay');
  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(`${data.message || 'Could not prepare report data.'} (${data.code || 'UNKNOWN'})`);
  }

  applyReportData({
    allDrivers: data.allDrivers,
    cashDrivers: data.cashDrivers,
    zelleDriverRows: data.zelleDriverRows,
    cashSummary: data.cashSummary
  });
}

async function refreshReportData() {
  try {
    await refreshReportDataFromServer();
  } catch (_error) {
    applyReportData(buildLocalReportData(latestGroupedTotals, latestZelleDrivers));
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearResults();

  const formData = new FormData(form);
  const payload = {
    fromDay: formData.get('fromDay'),
    toDay: formData.get('toDay')
  };

  submitButton.disabled = true;
  setStatus('Running payroll...', 'neutral');

  try {
    const response = await fetch('/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      const tip = getRecoveryTip(data.code);
      const message = `${data.message} (${data.code})`;
      setStatus(`${message}. ${tip}`, 'error');
      return;
    }

    latestGroupedTotals = Array.isArray(data.groupedTotals) ? data.groupedTotals : [];
    latestRange = data.range || null;

    renderWarnings(data.warnings);
    renderRows(data.rows || []);

    await refreshReportData();
    loadHistory();

    setStatus(
      `Done. ${data.rows.length} rows processed across ${latestReportData.allDrivers.length} drivers. Output: ${data.outputFile}`,
      'success'
    );
  } catch (error) {
    setStatus(`Request failed: ${error.message}`, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

allSlipsButton.addEventListener('click', () => {
  if (latestReportData.allDrivers.length === 0) {
    setStatus('No drivers available for pay slips.', 'error');
    return;
  }
  renderPaySlipReport(latestReportData.allDrivers, 'All Driver Pay Slips (Sorted Desc)');
  setStatus(`Generating pay slips for ${latestReportData.allDrivers.length} driver(s)...`, 'success');
});

cashSlipsButton.addEventListener('click', () => {
  if (latestReportData.cashDrivers.length === 0) {
    setStatus('No cash drivers found for cash-only slips.', 'error');
    return;
  }
  renderPaySlipReport(latestReportData.cashDrivers, 'Cash Driver Pay Slips (Sorted Desc)');
  setStatus(`Generating cash-only slips for ${latestReportData.cashDrivers.length} driver(s)...`, 'success');
});

zelleOverviewButton.addEventListener('click', () => {
  if (latestReportData.zelleDriverRows.length === 0) {
    setStatus('No Zelle drivers found for overview.', 'error');
    return;
  }
  renderZelleOverview();
  setStatus(`Showing Zelle overview for ${latestReportData.zelleDriverRows.length} driver(s).`, 'success');
});

zelleExportButton.addEventListener('click', async () => {
  if (latestReportData.zelleDriverRows.length === 0) {
    setStatus('No Zelle drivers found to export.', 'error');
    return;
  }

  setStatus('Generating Zelle Excel export...', 'neutral');
  zelleExportButton.disabled = true;

  try {
    const exportUrl = viewingRunId
      ? `/api/reports/zelle-export?runId=${encodeURIComponent(viewingRunId)}`
      : '/api/reports/zelle-export';
    const response = await fetch(exportUrl);
    if (!response.ok) {
      let errorMessage = 'Could not export Zelle report.';
      try {
        const data = await response.json();
        errorMessage = `${data.message || errorMessage} (${data.code || 'UNKNOWN'})`;
      } catch (_error) {
        // Ignore parse error and keep generic message.
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = disposition.match(/filename="([^"]+)"/i);
    const fileName = match ? match[1] : 'zelle-report.xlsx';

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);

    setStatus(`Zelle report exported: ${fileName}`, 'success');
  } catch (error) {
    setStatus(`Zelle export failed: ${error.message}`, 'error');
  } finally {
    updateReportButtonState();
  }
});

cashKeepButton.addEventListener('click', () => {
  if (!latestReportData.cashSummary) {
    setStatus('Cash-to-keep summary is not available yet.', 'error');
    return;
  }

  renderCashToKeepReport();
  setStatus('Generating cash-to-keep report...', 'success');
});

// ---- Workbook status and upload ----

function formatDateTime(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) {
    return '—';
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

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(value / 1024))} KB`;
}

function setWorkbookBadge(text, type) {
  workbookBadge.textContent = text;
  workbookBadge.className = `badge badge-${type}`;
}

function setWorkbookStatus(text, type = 'neutral') {
  workbookStatusEl.textContent = text;
  workbookStatusEl.className = `status ${type}`;
}

function renderWorkbook(workbook) {
  workbookExists = Boolean(workbook && workbook.exists);
  workbookReady = workbookExists && workbook.readable !== false;

  if (!workbook || !workbook.exists) {
    setWorkbookBadge('Missing', 'error');
    workbookFile.textContent = workbook ? `${workbook.fileName} not found` : '—';
    workbookModified.textContent = '—';
    workbookDate.textContent = '—';
    workbookSheets.textContent = '—';
    updateStepper();
    return;
  }

  workbookFile.textContent = `${workbook.fileName} (${formatFileSize(workbook.sizeBytes)})`;
  workbookModified.textContent = formatDateTime(workbook.modifiedAt);
  workbookDate.textContent = workbook.firstDate
    ? `${workbook.firstDate.label} (${workbook.firstDate.sheetName})`
    : '—';

  if (workbook.readable === false || !workbook.sheets) {
    setWorkbookBadge('Unreadable', 'error');
    workbookSheets.textContent = 'Could not read the sheet list.';
  } else {
    const { present, missing } = workbook.sheets;
    const total = present.length + missing.length;
    if (missing.length === 0) {
      setWorkbookBadge('Loaded', 'ok');
      workbookSheets.textContent = `All ${total} found`;
    } else {
      setWorkbookBadge('Loaded, sheets missing', 'warn');
      workbookSheets.textContent = `${present.length} of ${total} found. Missing: ${missing.join(', ')}`;
    }
  }

  updateStepper();
}

async function loadWorkbookStatus() {
  try {
    const response = await fetch('/api/workbook');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not read workbook status.');
    }
    renderWorkbook(data.workbook);
  } catch (error) {
    setWorkbookBadge('Unknown', 'neutral');
    setWorkbookStatus(`Could not check the workbook: ${error.message}`, 'error');
  }
}

async function uploadWorkbook(file) {
  if (!file) {
    return;
  }

  if (!/\.xlsx$/i.test(file.name)) {
    setWorkbookStatus('Choose an .xlsx file.', 'error');
    return;
  }

  const question = workbookExists
    ? `Replace the current workbook with "${file.name}"?\n\nThe current workbook is backed up first.`
    : `Use "${file.name}" as the workbook?`;
  if (!window.confirm(question)) {
    return;
  }

  workbookChooseButton.disabled = true;
  setWorkbookStatus(`Uploading ${file.name}...`, 'neutral');

  try {
    const response = await fetch('/api/workbook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream'
      },
      body: file
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Upload failed.');
    }

    clearResults();
    setStatus('', 'neutral');
    renderWorkbook(data.workbook);
    setWorkbookStatus(
      data.backupFile
        ? `Workbook replaced with ${file.name}. Previous workbook saved as backups/${data.backupFile}.`
        : `Workbook loaded from ${file.name}.`,
      'success'
    );
  } catch (error) {
    setWorkbookStatus(`Upload failed: ${error.message}`, 'error');
  } finally {
    workbookChooseButton.disabled = false;
    workbookFileInput.value = '';
  }
}

workbookChooseButton.addEventListener('click', () => workbookFileInput.click());
workbookFileInput.addEventListener('change', () => uploadWorkbook(workbookFileInput.files[0]));

['dragenter', 'dragover'].forEach((eventName) => {
  workbookDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    workbookDropzone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  workbookDropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    workbookDropzone.classList.remove('is-dragging');
  });
});

workbookDropzone.addEventListener('drop', (event) => {
  uploadWorkbook(event.dataTransfer?.files?.[0]);
});

// ---- Past runs ----

function markActiveHistoryRow() {
  Array.from(historyBody.querySelectorAll('tr')).forEach((row) => {
    row.classList.toggle('is-active', Boolean(viewingRunId) && row.dataset.runId === viewingRunId);
  });
}

function renderHistory(runs) {
  historyBody.innerHTML = '';
  const hasRuns = runs.length > 0;
  historyEmpty.classList.toggle('hidden', hasRuns);
  historyTableWrap.classList.toggle('hidden', !hasRuns);

  runs.forEach((run) => {
    const row = document.createElement('tr');
    row.dataset.runId = run.id;

    const dates = run.firstDay && run.lastDay && run.firstDay !== run.lastDay
      ? `${run.firstDay} – ${run.lastDay}`
      : (run.firstDay || '—');
    const cells = [
      formatDateTime(run.createdAt),
      run.range ? `${run.range.fromDay} to ${run.range.toDay}` : '—',
      dates,
      String(run.driverCount),
      formatMoney(run.totalAmount)
    ];
    cells.forEach((text) => {
      const cell = document.createElement('td');
      cell.textContent = text;
      row.appendChild(cell);
    });

    const actions = document.createElement('td');
    actions.className = 'row-actions';

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'secondary small';
    openButton.textContent = 'Open';
    openButton.addEventListener('click', () => openSavedRun(run.id));

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'ghost small';
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', () => deleteSavedRun(run));

    actions.appendChild(openButton);
    actions.appendChild(deleteButton);
    row.appendChild(actions);
    historyBody.appendChild(row);
  });

  markActiveHistoryRow();
}

async function loadHistory() {
  try {
    const response = await fetch('/api/history');
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not load saved runs.');
    }
    renderHistory(Array.isArray(data.runs) ? data.runs : []);
  } catch (_error) {
    renderHistory([]);
  }
}

async function openSavedRun(runId) {
  try {
    const response = await fetch(`/api/history/${encodeURIComponent(runId)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not open the saved run.');
    }

    const run = data.run;
    clearResults();

    latestGroupedTotals = Array.isArray(run.groupedTotals) ? run.groupedTotals : [];
    latestRange = run.range || null;
    viewingRunId = run.id;

    renderWarnings(run.warnings);
    renderRows(run.rows || []);

    // Saved runs use the Zelle list and cash figures captured when the run was made.
    const reportData = buildLocalReportData(latestGroupedTotals, run.zelleDrivers || []);
    reportData.cashSummary = run.cashSummary || null;
    applyReportData(reportData);

    runBannerText.textContent = `Viewing saved run from ${formatDateTime(run.createdAt)}. Reports below use this saved data.`;
    runBanner.classList.remove('hidden');
    markActiveHistoryRow();
    setStatus(`Opened saved run: ${(run.rows || []).length} rows across ${latestReportData.allDrivers.length} drivers.`, 'success');
    runBanner.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    setStatus(`Could not open saved run: ${error.message}`, 'error');
  }
}

async function deleteSavedRun(run) {
  if (!window.confirm(`Delete the saved run from ${formatDateTime(run.createdAt)}? This cannot be undone.`)) {
    return;
  }

  try {
    const response = await fetch(`/api/history/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not delete the saved run.');
    }

    if (viewingRunId === run.id) {
      clearResults();
      setStatus('Saved run deleted.', 'neutral');
    }
    await loadHistory();
  } catch (error) {
    setStatus(`Delete failed: ${error.message}`, 'error');
  }
}

runBannerClose.addEventListener('click', () => {
  clearResults();
  setStatus('', 'neutral');
});

loadZelleDrivers();
clearResults();
loadWorkbookStatus();
loadHistory();
