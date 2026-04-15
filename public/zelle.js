const form = document.getElementById('zelle-form');
const input = document.getElementById('zelle-drivers-input');
const statusEl = document.getElementById('zelle-status');
const saveButton = document.getElementById('save-zelle-btn');

function setStatus(message, type = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function parseInput() {
  return String(input.value || '')
    .split(/\r?\n/)
    .map((name) => name.trim())
    .filter(Boolean);
}

async function loadDrivers() {
  setStatus('Loading saved drivers...', 'neutral');

  try {
    const response = await fetch('/api/zelle-drivers');
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not load drivers.'} (${data.code || 'UNKNOWN'})`);
    }

    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    input.value = drivers.join('\n');
    setStatus(`Loaded ${drivers.length} Zelle driver(s).`, 'success');
  } catch (error) {
    setStatus(`Failed to load drivers: ${error.message}`, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus('Saving drivers...', 'neutral');

  try {
    const response = await fetch('/api/zelle-drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ drivers: parseInput() })
    });

    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(`${data.message || 'Could not save drivers.'} (${data.code || 'UNKNOWN'})`);
    }

    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    input.value = drivers.join('\n');
    setStatus(`Saved ${drivers.length} Zelle driver(s).`, 'success');
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
});

loadDrivers();
