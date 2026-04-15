const form = document.getElementById('payroll-form');
const statusEl = document.getElementById('status');
const warningsEl = document.getElementById('warnings');
const groupedBody = document.getElementById('grouped-body');
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
  groupedBody.innerHTML = '';
  rowsBody.innerHTML = '';
  reportOverviewBody.innerHTML = '';
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
  updateReportButtonState();
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

function renderGroupedTotals(groupedTotals) {
  groupedBody.innerHTML = '';

  groupedTotals.forEach((group) => {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = group.name;

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(group.totalAmount);

    const detailCell = document.createElement('td');
    detailCell.className = 'details';

    group.pay.forEach((entry, index) => {
      const line = document.createElement('div');
      const pieces = [`${entry.day}: ${formatMoney(entry.amount)}`];
      if (Number(entry.adj) !== 0) {
        pieces.push(`adj ${formatSignedMoney(entry.adj)}`);
      }
      if (entry.notes) {
        pieces.push(entry.notes);
      }
      line.textContent = pieces.join(' | ');
      detailCell.appendChild(line);

      if (index < group.pay.length - 1) {
        const hr = document.createElement('hr');
        detailCell.appendChild(hr);
      }
    });

    row.appendChild(nameCell);
    row.appendChild(totalCell);
    row.appendChild(detailCell);
    groupedBody.appendChild(row);
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

function renderOverview(drivers) {
  reportOverviewBody.innerHTML = '';

  drivers.forEach((driver, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    rankCell.textContent = String(index + 1);

    const nameCell = document.createElement('td');
    nameCell.textContent = driver.name;

    const typeCell = document.createElement('td');
    typeCell.innerHTML = driver.isZelle
      ? '<span class="pill pill-zelle">Zelle</span>'
      : '<span class="pill pill-other">Cash</span>';

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(driver.totalAmount);

    const detailsCell = document.createElement('td');
    detailsCell.className = 'details';
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
      detailsCell.appendChild(line);
      if (idx < driver.pay.length - 1) {
        const hr = document.createElement('hr');
        detailsCell.appendChild(hr);
      }
    });

    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(typeCell);
    row.appendChild(totalCell);
    row.appendChild(detailsCell);

    reportOverviewBody.appendChild(row);
  });
}

function getRecoveryTip(code) {
  if (code === 'DEPENDENCY_MISSING') {
    return 'Install Python dependencies: pip install -r requirements.txt';
  }
  if (code === 'WORKBOOK_MISSING') {
    return 'Place Daily Sheet.xlsx in the project root or set PAYROLL_WORKBOOK_PATH.';
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
  updateReportButtonState();
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
    renderGroupedTotals(latestGroupedTotals);
    renderRows(data.rows || []);

    await refreshReportData();

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
    const response = await fetch('/api/reports/zelle-export');
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

loadZelleDrivers();
clearResults();
