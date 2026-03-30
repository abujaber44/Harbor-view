const statusEl = document.getElementById('sorted-status');
const sortedBody = document.getElementById('sorted-body');
const refreshButton = document.getElementById('refresh-sorted-btn');
const cashReportButton = document.getElementById('cash-report-btn');
const zelleReportButton = document.getElementById('zelle-report-btn');
const cashKeepReportButton = document.getElementById('cash-keep-report-btn');
const reportPreview = document.getElementById('sorted-report-preview');
const reportTitle = document.getElementById('sorted-report-title');
const reportMeta = document.getElementById('sorted-report-meta');
const reportContent = document.getElementById('sorted-report-content');

let latestSortedDrivers = [];
let latestCashSummary = null;

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function setStatus(message, type = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function renderSortedDrivers(drivers) {
  sortedBody.innerHTML = '';

  drivers.forEach((driver, index) => {
    const row = document.createElement('tr');

    const rankCell = document.createElement('td');
    rankCell.textContent = String(index + 1);

    const nameCell = document.createElement('td');
    nameCell.textContent = driver.name;

    const zelleCell = document.createElement('td');
    zelleCell.innerHTML = driver.isZelle
      ? '<span class="pill pill-zelle">Zelle</span>'
      : '<span class="pill pill-other">Cash</span>';

    const totalCell = document.createElement('td');
    totalCell.textContent = formatMoney(driver.totalAmount);

    const detailCell = document.createElement('td');
    detailCell.className = 'details';
    driver.pay.forEach((entry, entryIndex) => {
      const line = document.createElement('div');
      const parts = [`${entry.day}: ${formatMoney(entry.amount)}`];
      if (Number(entry.adj) !== 0) {
        parts.push(`adj ${formatMoney(entry.adj)}`);
      }
      if (entry.notes) {
        parts.push(entry.notes);
      }
      line.textContent = parts.join(' | ');
      detailCell.appendChild(line);

      if (entryIndex < driver.pay.length - 1) {
        const hr = document.createElement('hr');
        detailCell.appendChild(hr);
      }
    });

    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(zelleCell);
    row.appendChild(totalCell);
    row.appendChild(detailCell);

    sortedBody.appendChild(row);
  });
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
  const amount = Number(entry.amount || 0).toFixed(2);
  const ded = Number(entry.adj || 0);
  const notes = entry.notes ? ` ${entry.notes}` : '';
  if (ded !== 0) {
    return `Date ${entry.day}: $${amount} Deducted -$${(ded * -1).toFixed(2)}${notes}`;
  }
  return `Date ${entry.day}: $${amount}`;
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

function openReportAndPrint() {
  reportPreview.classList.remove('hidden');
  window.print();
}

function renderCashReport(drivers) {
  reportTitle.textContent = 'Cash Drivers Report';
  reportMeta.textContent = `Drivers: ${drivers.length}`;

  reportContent.innerHTML = `
    <div class="report-grid">
      ${drivers.map((group) => {
        const details = normalizeSlipLines(group).map((line) => (
          `<div class="report-line${line === '\u00a0' ? ' report-line-empty' : ''}">${escapeHtml(line)}</div>`
        )).join('');

        return `
          <article class="report-slip">
            <div class="report-driver">${escapeHtml(group.name)}</div>
            <div class="report-total">Total: ${escapeHtml(formatMoney(group.totalAmount))}</div>
            <div class="report-details">${details}</div>
          </article>
        `;
      }).join('')}
    </div>
  `;
}

function renderZelleReport(drivers) {
  const total = drivers.reduce((sum, driver) => sum + Number(driver.totalAmount || 0), 0);

  reportTitle.textContent = 'Zelle Drivers Report';
  reportMeta.textContent = `Drivers: ${drivers.length}`;

  reportContent.innerHTML = `
    <div class="table-wrap report-table-wrap">
      <table class="report-table">
        <thead>
          <tr>
            <th>Driver</th>
            <th>Total Amount</th>
          </tr>
        </thead>
        <tbody>
          ${drivers.map((driver) => `
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
}

function renderCashToKeepReport(summary) {
  reportTitle.textContent = 'Cash To Keep Report';
  reportMeta.textContent = 'From Daily Sheet.xlsx - Weekly Gross!M41 + total Zelle pay';

  reportContent.innerHTML = `
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
}

function generateCashReport() {
  const cashDrivers = latestSortedDrivers.filter((driver) => !driver.isZelle);
  if (cashDrivers.length === 0) {
    setStatus('No cash drivers found to print.', 'error');
    return;
  }
  renderCashReport(cashDrivers);
  setStatus(`Generating cash report for ${cashDrivers.length} driver(s)...`, 'success');
  openReportAndPrint();
}

function generateZelleReport() {
  const zelleDrivers = latestSortedDrivers.filter((driver) => driver.isZelle);
  if (zelleDrivers.length === 0) {
    setStatus('No Zelle drivers found to print.', 'error');
    return;
  }
  renderZelleReport(zelleDrivers);
  setStatus(`Generating Zelle report for ${zelleDrivers.length} driver(s)...`, 'success');
  openReportAndPrint();
}

function generateCashToKeepReport() {
  if (!latestCashSummary) {
    setStatus('Cash summary is not loaded yet.', 'error');
    return;
  }
  renderCashToKeepReport(latestCashSummary);
  setStatus('Generating cash-to-keep report...', 'success');
  openReportAndPrint();
}

async function loadSortedPay() {
  setStatus('Loading sorted driver pay...');
  refreshButton.disabled = true;
  cashReportButton.disabled = true;
  zelleReportButton.disabled = true;
  cashKeepReportButton.disabled = true;

  try {
    const response = await fetch('/api/sorted-driver-pay');
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not load sorted data.'} (${data.code || 'UNKNOWN'})`);
    }

    latestSortedDrivers = data.sortedDrivers;
    latestCashSummary = data.cashSummary || null;
    renderSortedDrivers(data.sortedDrivers);
    const cashCount = data.sortedDrivers.filter((driver) => !driver.isZelle).length;
    const zelleCount = data.sortedDrivers.filter((driver) => driver.isZelle).length;
    cashReportButton.disabled = cashCount === 0;
    zelleReportButton.disabled = zelleCount === 0;
    cashKeepReportButton.disabled = !latestCashSummary;

    setStatus(
      `Loaded ${data.sortedDrivers.length} driver(s). Zelle drivers configured: ${data.zelleDrivers.length}. Cash to keep: ${formatMoney(latestCashSummary?.cashToKeep || 0)}.`,
      'success'
    );
  } catch (error) {
    latestSortedDrivers = [];
    latestCashSummary = null;
    sortedBody.innerHTML = '';
    setStatus(`Failed to load: ${error.message}`, 'error');
  } finally {
    refreshButton.disabled = false;
  }
}

refreshButton.addEventListener('click', loadSortedPay);
cashReportButton.addEventListener('click', generateCashReport);
zelleReportButton.addEventListener('click', generateZelleReport);
cashKeepReportButton.addEventListener('click', generateCashToKeepReport);
loadSortedPay();
