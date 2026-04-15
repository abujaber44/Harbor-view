const path = require('path');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { parseOutputWorkbook } = require('../services/payrollResults');
const { readZelleDrivers } = require('../services/zelleDriversStore');
const { buildSortedDriverPay } = require('../services/sortedDriverPay');
const { readWeeklyGrossM41 } = require('../services/weeklyGrossValue');

function createSortedPayHandler() {
  return async function sortedPayHandler(_req, res) {
    const parsedOutput = parseOutputWorkbook(APP_CONFIG.outputPath);
    if (!parsedOutput.ok) {
      return res.status(422).json({
        ok: false,
        code: parsedOutput.code || ERROR_CODES.PROCESS_FAILED,
        message: parsedOutput.message || 'Could not parse output workbook.',
        details: null
      });
    }

    try {
      const zelleDrivers = await readZelleDrivers();
      const allDrivers = buildSortedDriverPay(parsedOutput.groupedTotals, zelleDrivers);
      const cashDrivers = allDrivers.filter((driver) => !driver.isZelle);
      const zelleDriverRows = allDrivers.filter((driver) => driver.isZelle);
      const weeklyGrossM41 = readWeeklyGrossM41(APP_CONFIG.workbookPath);

      if (!weeklyGrossM41.ok) {
        return res.status(422).json({
          ok: false,
          code: weeklyGrossM41.code || ERROR_CODES.PROCESS_FAILED,
          message: weeklyGrossM41.message || 'Could not read Weekly Gross M41.',
          details: null
        });
      }

      const zelleTotal = zelleDriverRows
        .reduce((sum, driver) => sum + Number(driver.totalAmount || 0), 0);
      const cashToKeep = Number(weeklyGrossM41.amount || 0) + zelleTotal;

      return res.json({
        ok: true,
        outputFile: path.basename(APP_CONFIG.outputPath),
        zelleDrivers,
        sortedDrivers: allDrivers,
        allDrivers,
        cashDrivers,
        zelleDriverRows,
        cashSummary: {
          weeklyGrossM41: weeklyGrossM41.amount,
          zelleTotal,
          cashToKeep
        }
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: ERROR_CODES.PROCESS_FAILED,
        message: 'Could not build sorted driver pay list.',
        details: error.message
      });
    }
  };
}

module.exports = {
  createSortedPayHandler
};
