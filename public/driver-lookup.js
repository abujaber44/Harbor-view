const form = document.getElementById('lookup-form');
const input = document.getElementById('lookup-input');
const driverOptions = document.getElementById('lookup-drivers');
const button = document.getElementById('lookup-btn');
const statusEl = document.getElementById('lookup-status');
const resultsPanel = document.getElementById('lookup-results-panel');
const resultsEl = document.getElementById('lookup-results');
const countEl = document.getElementById('lookup-count');

function setStatus(text, type = 'neutral') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  const text = `$${Math.abs(amount).toFixed(2)}`;
  return amount < 0 ? `-${text}` : text;
}

function addMoneyCell(row, value, tag = 'td') {
  const cell = document.createElement(tag);
  cell.className = Number(value) < 0 ? 'number negative' : 'number';
  cell.textContent = formatMoney(value);
  row.appendChild(cell);
}

function buildDriverCard(driver) {
  const card = document.createElement('article');
  card.className = 'driver-summary-card';

  const head = document.createElement('div');
  head.className = 'driver-summary-head';
  const title = document.createElement('h3');
  title.textContent = driver.driver;
  const badge = document.createElement('span');
  const balance = Number(driver.totals.balance || 0);
  badge.className = `badge ${balance < 0 ? 'badge-warn' : 'badge-ok'}`;
  badge.textContent = `Week balance ${formatMoney(balance)}`;
  head.appendChild(title);
  head.appendChild(badge);
  card.appendChild(head);

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th>Day</th>
        <th class="number">NTD</th>
        <th class="number">Cash in/out</th>
        <th class="number">Balance</th>
      </tr>
    </thead>
  `;

  const body = document.createElement('tbody');
  driver.days.forEach((day) => {
    const row = document.createElement('tr');
    const dayCell = document.createElement('td');
    dayCell.textContent = day.day;
    row.appendChild(dayCell);
    addMoneyCell(row, day.ntd);
    addMoneyCell(row, day.cashInOut);
    addMoneyCell(row, day.balance);
    body.appendChild(row);
  });

  const totalRow = document.createElement('tr');
  totalRow.className = 'summary-total-row';
  const totalLabel = document.createElement('th');
  totalLabel.textContent = 'Total';
  totalRow.appendChild(totalLabel);
  addMoneyCell(totalRow, driver.totals.ntd);
  addMoneyCell(totalRow, driver.totals.cashInOut);
  addMoneyCell(totalRow, driver.totals.balance);
  body.appendChild(totalRow);

  table.appendChild(body);
  wrap.appendChild(table);
  card.appendChild(wrap);

  if (driver.settlementNote?.message) {
    const note = document.createElement('p');
    note.className = 'driver-note';
    note.textContent = driver.settlementNote.message;
    card.appendChild(note);
  }

  return card;
}

async function lookup() {
  const query = input.value.trim();
  button.disabled = true;
  button.classList.add('is-busy');
  setStatus('Reading the workbook...', 'neutral');

  try {
    const response = await fetch(`/api/driver-ntd?driver=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not read driver balances.'} (${data.code || 'UNKNOWN'})`);
    }

    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    resultsEl.innerHTML = '';
    drivers.forEach((driver) => resultsEl.appendChild(buildDriverCard(driver)));
    resultsPanel.classList.toggle('hidden', drivers.length === 0);
    countEl.textContent = `${drivers.length} driver${drivers.length === 1 ? '' : 's'} · week balance ${formatMoney(data.grandTotals?.balance)}`;

    const ntdAllZero = drivers.length > 0 && drivers.every((driver) => (
      driver.days.every((day) => Number(day.ntd || 0) === 0)
    ));

    if (ntdAllZero) {
      setStatus(
        'NTD is 0 on every row shown. The workbook\'s NTD formulas may have no calculated values; '
        + 'run Check Workbook on the Payroll page, or open the workbook in Excel and save it.',
        'error'
      );
    } else if (drivers.length === 0) {
      setStatus(query ? `No driver with activity matches "${query}".` : 'No drivers with activity were found.', 'neutral');
    } else {
      setStatus(query ? `Showing drivers matching "${query}".` : 'Showing every driver with activity this week.', 'success');
    }
  } catch (error) {
    resultsPanel.classList.add('hidden');
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

async function loadDriverOptions() {
  try {
    const response = await fetch('/api/workbook/drivers');
    const data = await response.json();
    (data.drivers || []).forEach((name) => {
      const option = document.createElement('option');
      option.value = name;
      driverOptions.appendChild(option);
    });
  } catch (_error) {
    // Suggestions are optional; lookup still works by typing a name.
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  lookup();
});

const initialQuery = new URLSearchParams(window.location.search).get('driver');
if (initialQuery) {
  input.value = initialQuery;
  lookup();
} else {
  setStatus('Type a driver name, or leave it empty to list everyone.', 'neutral');
}
loadDriverOptions();
