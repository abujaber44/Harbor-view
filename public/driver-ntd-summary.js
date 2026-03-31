const form = document.getElementById('ntd-form');
const driverInput = document.getElementById('driver-input');
const statusEl = document.getElementById('ntd-status');
const submitButton = document.getElementById('ntd-submit-btn');
const summaryListEl = document.getElementById('ntd-summary-list');

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function setStatus(text, type = 'neutral') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function clearSummary() {
  summaryListEl.innerHTML = '';
}

function renderSummary(drivers, grandTotals) {
  summaryListEl.innerHTML = '';

  drivers.forEach((summary) => {
    const card = document.createElement('article');
    card.className = 'driver-summary-card';

    const title = document.createElement('h3');
    title.textContent = summary.driver;
    card.appendChild(title);

    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-wrap';

    const table = document.createElement('table');
    table.innerHTML = `
      <thead>
        <tr>
          <th>Day</th>
          <th>NTD</th>
          <th>Cash In/Out</th>
          <th>Balance</th>
        </tr>
      </thead>
      <tbody>
        ${summary.days.map((day) => `
          <tr>
            <td>${day.day}</td>
            <td>${formatNumber(day.ntd)}</td>
            <td>${formatNumber(day.cashInOut)}</td>
            <td>${formatNumber(day.balance)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr class="summary-total-row">
          <th>Total</th>
          <th>${formatNumber(summary.totals.ntd)}</th>
          <th>${formatNumber(summary.totals.cashInOut)}</th>
          <th>${formatNumber(summary.totals.balance)}</th>
        </tr>
      </tfoot>
    `;

    tableWrap.appendChild(table);
    card.appendChild(tableWrap);

    if (summary.settlementNote?.message) {
      const note = document.createElement('p');
      note.className = 'driver-note';
      note.textContent = summary.settlementNote.message;
      card.appendChild(note);
    }

    summaryListEl.appendChild(card);
  });

  if (drivers.length > 1) {
    const grandCard = document.createElement('article');
    grandCard.className = 'driver-summary-card';
    grandCard.innerHTML = `
      <h3>Grand Total</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>NTD</th>
              <th>Cash In/Out</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr class="summary-total-row">
              <td>${formatNumber(grandTotals.ntd)}</td>
              <td>${formatNumber(grandTotals.cashInOut)}</td>
              <td>${formatNumber(grandTotals.balance)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    summaryListEl.appendChild(grandCard);
  }
}

async function runSummary(driver) {
  clearSummary();

  submitButton.disabled = true;
  setStatus('Generating driver balance summary...', 'neutral');

  try {
    const query = driver ? `?driver=${encodeURIComponent(driver)}` : '';
    const response = await fetch(`/api/driver-ntd-summary${query}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Failed to generate summary.'} (${data.code || 'UNKNOWN'})`);
    }

    if (!Array.isArray(data.drivers) || data.drivers.length === 0) {
      setStatus('No matching drivers found for this search.', 'error');
      return;
    }

    renderSummary(data.drivers, data.grandTotals || { ntd: 0, cashInOut: 0, balance: 0 });
    setStatus(`Summary generated for ${data.drivers.length} driver(s).`, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const driver = String(driverInput.value || '').trim();
  await runSummary(driver);
});

const initialDriver = new URLSearchParams(window.location.search).get('driver');
if (initialDriver && String(initialDriver).trim()) {
  driverInput.value = String(initialDriver).trim();
  runSummary(String(initialDriver).trim());
} else {
  runSummary('');
}
