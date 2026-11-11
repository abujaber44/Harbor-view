const { APP_CONFIG } = require('../config/constants');
const { readZelleDrivers } = require('./zelleDriversStore');
const { buildSortedDriverPay } = require('./sortedDriverPay');
const { readWeeklyGrossM41 } = require('./weeklyGrossValue');
const { saveRun } = require('./historyStore');

// Captures what the reports need at run time (Zelle list and cash-to-keep figures),
// so a saved run can be reopened later exactly as it was.
async function buildReportSnapshot(groupedTotals) {
  let zelleDrivers = [];
  try {
    zelleDrivers = await readZelleDrivers();
  } catch (_error) {
    zelleDrivers = [];
  }

  let cashSummary = null;
  try {
    const weeklyGrossM41 = readWeeklyGrossM41(APP_CONFIG.workbookPath);
    if (weeklyGrossM41.ok) {
      const zelleTotal = buildSortedDriverPay(groupedTotals, zelleDrivers)
        .filter((driver) => driver.isZelle)
        .reduce((sum, driver) => sum + Number(driver.totalAmount || 0), 0);
      cashSummary = {
        weeklyGrossM41: weeklyGrossM41.amount,
        zelleTotal,
        cashToKeep: Number(weeklyGrossM41.amount || 0) + zelleTotal
      };
    }
  } catch (_error) {
    cashSummary = null;
  }

  return { zelleDrivers, cashSummary };
}

async function saveRunSnapshot(result) {
  const snapshot = await buildReportSnapshot(result.groupedTotals);
  return saveRun(APP_CONFIG.historyDir, {
    range: result.range,
    rows: result.rows,
    groupedTotals: result.groupedTotals,
    warnings: result.warnings,
    zelleDrivers: snapshot.zelleDrivers,
    cashSummary: snapshot.cashSummary
  });
}

module.exports = {
  buildReportSnapshot,
  saveRunSnapshot
};
