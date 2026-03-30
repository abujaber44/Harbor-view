const form = document.getElementById('payroll-form');
const statusEl = document.getElementById('status');
const warningsEl = document.getElementById('warnings');
const groupedBody = document.getElementById('grouped-body');
const rowsBody = document.getElementById('rows-body');
const submitButton = document.getElementById('submit-btn');
const reportButton = document.getElementById('report-btn');
const reportPreview = document.getElementById('report-preview');
const reportPeriod = document.getElementById('report-period');
const reportSlips = document.getElementById('report-slips');

let latestReportData = null;
let latestRange = null;

function formatMoney(amount) {
  return `$${Number(amount || 0).toFixed(2)}`;
}

function clearResults() {
  groupedBody.innerHTML = '';
  rowsBody.innerHTML = '';
  warningsEl.innerHTML = '';
  reportSlips.innerHTML = '';
  reportPeriod.textContent = '';
  reportPreview.classList.add('hidden');
  latestReportData = null;
  latestRange = null;
  reportButton.disabled = true;
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
        pieces.push(`adj ${formatMoney(entry.adj)}`);
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

function buildReportHtml({ groupedTotals, range }) {
  reportPeriod.textContent = `Period: ${range.fromDay} to ${range.toDay}`;
  reportSlips.innerHTML = groupedTotals.map((group) => {
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
  }).join('');

  reportPreview.classList.remove('hidden');
}

function generateReport() {
  if (!latestReportData || latestReportData.length === 0 || !latestRange) {
    setStatus('Run payroll first before generating a report.', 'error');
    return;
  }

  buildReportHtml({
    groupedTotals: latestReportData,
    range: latestRange
  });
  setStatus('Generating print preview...', 'success');
  window.print();
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

    setStatus(
      `Done. ${data.rows.length} rows processed across ${data.groupedTotals.length} drivers. Output: ${data.outputFile}`,
      'success'
    );

    latestReportData = data.groupedTotals;
    latestRange = data.range;
    reportButton.disabled = data.groupedTotals.length === 0;

    renderWarnings(data.warnings);
    renderGroupedTotals(data.groupedTotals);
    renderRows(data.rows);
  } catch (error) {
    setStatus(`Request failed: ${error.message}`, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

reportButton.addEventListener('click', generateReport);
