const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const RUN_ID_RE = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

function isValidRunId(id) {
  return typeof id === 'string' && RUN_ID_RE.test(id);
}

function createRunId(now = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  const datePart = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const timePart = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `${datePart}-${timePart}-${crypto.randomBytes(2).toString('hex')}`;
}

function runPath(historyDir, id) {
  return path.join(historyDir, `${id}.json`);
}

function summarize(run) {
  const groupedTotals = Array.isArray(run.groupedTotals) ? run.groupedTotals : [];
  const dayLabels = [];
  (Array.isArray(run.rows) ? run.rows : []).forEach((row) => {
    const label = String(row?.Day ?? '').trim();
    if (label && !dayLabels.includes(label)) {
      dayLabels.push(label);
    }
  });

  return {
    id: run.id,
    createdAt: run.createdAt,
    range: run.range || null,
    firstDay: dayLabels[0] || null,
    lastDay: dayLabels[dayLabels.length - 1] || null,
    rowCount: Array.isArray(run.rows) ? run.rows.length : 0,
    driverCount: groupedTotals.length,
    totalAmount: groupedTotals.reduce((sum, group) => sum + Number(group.totalAmount || 0), 0)
  };
}

async function saveRun(historyDir, data, now = new Date()) {
  const run = {
    id: createRunId(now),
    createdAt: now.toISOString(),
    range: data.range || null,
    rows: data.rows || [],
    groupedTotals: data.groupedTotals || [],
    warnings: data.warnings || [],
    zelleDrivers: data.zelleDrivers || [],
    cashSummary: data.cashSummary || null
  };

  await fs.mkdir(historyDir, { recursive: true });
  await fs.writeFile(runPath(historyDir, run.id), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  return run;
}

async function getRun(historyDir, id) {
  if (!isValidRunId(id)) {
    return null;
  }

  try {
    return JSON.parse(await fs.readFile(runPath(historyDir, id), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

async function listRuns(historyDir) {
  let fileNames;
  try {
    fileNames = await fs.readdir(historyDir);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const ids = fileNames
    .filter((name) => name.endsWith('.json'))
    .map((name) => name.slice(0, -'.json'.length))
    .filter(isValidRunId)
    .sort()
    .reverse();

  const summaries = [];
  for (const id of ids) {
    try {
      const run = await getRun(historyDir, id);
      if (run) {
        summaries.push(summarize(run));
      }
    } catch (_error) {
      // Skip unreadable history files rather than failing the whole list.
    }
  }

  return summaries;
}

async function deleteRun(historyDir, id) {
  if (!isValidRunId(id)) {
    return false;
  }

  try {
    await fs.unlink(runPath(historyDir, id));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

module.exports = {
  isValidRunId,
  saveRun,
  getRun,
  listRuns,
  deleteRun,
  summarize
};
