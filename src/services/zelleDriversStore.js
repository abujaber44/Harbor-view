const fs = require('fs/promises');
const { APP_CONFIG } = require('../config/constants');
const { normalizeDriverName } = require('../utils/driverNames');

function sanitizeDrivers(drivers) {
  if (!Array.isArray(drivers)) {
    return [];
  }

  const byKey = new Map();

  drivers.forEach((driver) => {
    const displayName = String(driver || '').trim().replace(/\s+/g, ' ');
    const key = normalizeDriverName(displayName);
    if (!displayName || !key || byKey.has(key)) {
      return;
    }
    byKey.set(key, displayName);
  });

  return Array.from(byKey.values()).sort((a, b) => a.localeCompare(b));
}

async function readZelleDrivers() {
  try {
    const raw = await fs.readFile(APP_CONFIG.zelleDriversPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (Array.isArray(parsed)) {
      return sanitizeDrivers(parsed);
    }

    if (Array.isArray(parsed?.drivers)) {
      return sanitizeDrivers(parsed.drivers);
    }

    return [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

async function writeZelleDrivers(drivers) {
  const sanitized = sanitizeDrivers(drivers);
  const payload = JSON.stringify({ drivers: sanitized }, null, 2);
  await fs.writeFile(APP_CONFIG.zelleDriversPath, `${payload}\n`, 'utf8');
  return sanitized;
}

module.exports = {
  readZelleDrivers,
  writeZelleDrivers,
  sanitizeDrivers
};
