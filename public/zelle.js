const form = document.getElementById('zelle-form');
const statusEl = document.getElementById('zelle-status');
const saveButton = document.getElementById('save-zelle-btn');
const searchInput = document.getElementById('zelle-search');
const countEl = document.getElementById('zelle-count');
const dirtyEl = document.getElementById('zelle-dirty');
const workbookList = document.getElementById('zelle-workbook-list');
const workbookNote = document.getElementById('zelle-workbook-note');
const otherGroup = document.getElementById('zelle-other-group');
const otherList = document.getElementById('zelle-other-list');
const addInput = document.getElementById('zelle-add-input');
const addButton = document.getElementById('zelle-add-btn');

// key -> display name
let workbookDrivers = new Map();
let otherNames = new Map();
let selected = new Set();
let savedKeys = new Set();

function setStatus(message, type = 'neutral') {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function normalizeName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function cleanName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function isDirty() {
  if (selected.size !== savedKeys.size) {
    return true;
  }
  return Array.from(selected).some((key) => !savedKeys.has(key));
}

function selectedNames() {
  return Array.from(selected)
    .map((key) => workbookDrivers.get(key) || otherNames.get(key))
    .filter(Boolean);
}

function buildCheckItem(key, name) {
  const label = document.createElement('label');
  label.className = 'check-item';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(key);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) {
      selected.add(key);
    } else {
      selected.delete(key);
    }
    label.classList.toggle('is-checked', checkbox.checked);
    renderCounts();
  });

  const text = document.createElement('span');
  text.textContent = name;

  label.classList.toggle('is-checked', checkbox.checked);
  label.appendChild(checkbox);
  label.appendChild(text);
  return label;
}

function renderCounts() {
  countEl.textContent = `${selected.size} Zelle driver${selected.size === 1 ? '' : 's'} selected`;
  dirtyEl.textContent = isDirty() ? 'Unsaved changes' : '';
}

function renderLists() {
  const query = normalizeName(searchInput.value);
  const matches = (key) => !query || key.includes(query);

  workbookList.innerHTML = '';
  let shown = 0;
  workbookDrivers.forEach((name, key) => {
    if (matches(key)) {
      workbookList.appendChild(buildCheckItem(key, name));
      shown += 1;
    }
  });

  if (workbookDrivers.size === 0) {
    workbookNote.textContent = 'No drivers could be read from the workbook. You can still add names below.';
    workbookNote.classList.remove('hidden');
  } else if (shown === 0) {
    workbookNote.textContent = 'No workbook drivers match the search.';
    workbookNote.classList.remove('hidden');
  } else {
    workbookNote.classList.add('hidden');
  }

  otherList.innerHTML = '';
  otherNames.forEach((name, key) => {
    if (matches(key)) {
      otherList.appendChild(buildCheckItem(key, name));
    }
  });
  otherGroup.classList.toggle('hidden', otherNames.size === 0);

  renderCounts();
}

function applySavedDrivers(drivers) {
  selected = new Set();
  otherNames = new Map();

  drivers.forEach((name) => {
    const key = normalizeName(name);
    if (!key) {
      return;
    }
    selected.add(key);
    if (!workbookDrivers.has(key)) {
      otherNames.set(key, cleanName(name));
    }
  });

  savedKeys = new Set(selected);
  renderLists();
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(`${data.message || 'Request failed.'} (${data.code || 'UNKNOWN'})`);
  }
  return data;
}

async function loadDrivers() {
  setStatus('Loading saved drivers...', 'neutral');

  try {
    workbookDrivers = new Map();
    try {
      const workbookData = await fetchJson('/api/workbook/drivers');
      (workbookData.drivers || []).forEach((name) => {
        const key = normalizeName(name);
        if (key) {
          workbookDrivers.set(key, cleanName(name));
        }
      });
    } catch (_error) {
      // The saved list is still editable when the workbook cannot be read.
    }

    const data = await fetchJson('/api/zelle-drivers');
    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    applySavedDrivers(drivers);

    const unmatched = otherNames.size;
    setStatus(
      unmatched > 0
        ? `Loaded ${drivers.length} Zelle driver(s). ${unmatched} saved name(s) are not in the current workbook.`
        : `Loaded ${drivers.length} Zelle driver(s).`,
      unmatched > 0 ? 'neutral' : 'success'
    );
  } catch (error) {
    setStatus(`Failed to load drivers: ${error.message}`, 'error');
  }
}

function addManualName() {
  const name = cleanName(addInput.value);
  const key = normalizeName(name);
  if (!key) {
    return;
  }

  if (!workbookDrivers.has(key) && !otherNames.has(key)) {
    otherNames.set(key, name);
  }
  selected.add(key);
  addInput.value = '';
  searchInput.value = '';
  renderLists();
}

searchInput.addEventListener('input', renderLists);
addButton.addEventListener('click', addManualName);
addInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    addManualName();
  }
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  saveButton.disabled = true;
  setStatus('Saving drivers...', 'neutral');

  try {
    const data = await fetchJson('/api/zelle-drivers', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ drivers: selectedNames() })
    });

    const drivers = Array.isArray(data.drivers) ? data.drivers : [];
    applySavedDrivers(drivers);
    setStatus(`Saved ${drivers.length} Zelle driver(s).`, 'success');
  } catch (error) {
    setStatus(`Save failed: ${error.message}`, 'error');
  } finally {
    saveButton.disabled = false;
  }
});

window.addEventListener('beforeunload', (event) => {
  if (isDirty()) {
    event.preventDefault();
  }
});

loadDrivers();
