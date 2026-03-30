const form = document.getElementById('ntd-form');
const driverInput = document.getElementById('driver-input');
const statusEl = document.getElementById('ntd-status');
const submitButton = document.getElementById('ntd-submit-btn');
const bodyEl = document.getElementById('ntd-body');
const totalEl = document.getElementById('ntd-total');

function formatNumber(value) {
  return Number(value || 0).toFixed(2);
}

function setStatus(text, type = 'neutral') {
  statusEl.textContent = text;
  statusEl.className = `status ${type}`;
}

function clearSummary() {
  bodyEl.innerHTML = '';
  totalEl.textContent = '0.00';
}

function renderSummary(days, total) {
  bodyEl.innerHTML = '';

  days.forEach((entry) => {
    const row = document.createElement('tr');
    const dayCell = document.createElement('td');
    const amountCell = document.createElement('td');
    dayCell.textContent = entry.day;
    amountCell.textContent = formatNumber(entry.amount);
    row.appendChild(dayCell);
    row.appendChild(amountCell);
    bodyEl.appendChild(row);
  });

  totalEl.textContent = formatNumber(total);
}

async function runSummary(driver) {
  clearSummary();

  if (!driver) {
    setStatus('Driver name is required.', 'error');
    return;
  }

  submitButton.disabled = true;
  setStatus('Generating NTD summary...', 'neutral');

  try {
    const response = await fetch(`/api/driver-ntd-summary?driver=${encodeURIComponent(driver)}`);
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Failed to generate summary.'} (${data.code || 'UNKNOWN'})`);
    }

    renderSummary(data.days, data.total);
    setStatus(`Summary generated for ${data.driver}.`, 'success');
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
}
