const form = document.getElementById('zelle-form');
const input = document.getElementById('zelle-drivers-input');
const statusEl = document.getElementById('zelle-status');
const saveButton = document.getElementById('save-zelle-btn');

function setStatus(message, type = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function parseDriverLines(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function toTextareaValue(drivers) {
  return (drivers || []).join('\n');
}

async function loadDrivers() {
  setStatus('Loading saved drivers...');

  try {
    const response = await fetch('/api/zelle-drivers');
    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not load drivers.');
    }

    input.value = toTextareaValue(data.drivers);
    setStatus(`Loaded ${data.drivers.length} saved Zelle driver(s).`, 'success');
  } catch (error) {
    setStatus(`Failed to load: ${error.message}`, 'error');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus('Saving...');

  try {
    const response = await fetch('/api/zelle-drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        drivers: parseDriverLines(input.value)
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'Could not save drivers.');
    }

    input.value = toTextareaValue(data.drivers);
    setStatus(`Saved ${data.drivers.length} Zelle driver(s).`, 'success');
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
});

loadDrivers();
