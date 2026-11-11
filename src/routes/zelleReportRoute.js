const path = require('path');
const xlsx = require('xlsx');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { parseOutputWorkbook } = require('../services/payrollResults');
const { readZelleDrivers } = require('../services/zelleDriversStore');
const { buildSortedDriverPay } = require('../services/sortedDriverPay');
const { isValidRunId, getRun } = require('../services/historyStore');

// Exports a saved run (with the Zelle list saved at that time) instead of the latest output.
async function exportSavedRun(runId, res) {
  if (!isValidRunId(runId)) {
    return res.status(400).json({
      ok: false,
      code: ERROR_CODES.INPUT_INVALID,
      message: 'Invalid run id.',
      details: null
    });
  }

  const run = await getRun(APP_CONFIG.historyDir, runId);
  if (!run) {
    return res.status(404).json({
      ok: false,
      code: ERROR_CODES.INPUT_INVALID,
      message: 'Saved run was not found.',
      details: null
    });
  }

  return sendZelleWorkbook(res, run.groupedTotals, run.zelleDrivers, `zelle-report-${run.id}.xlsx`);
}

function sendZelleWorkbook(res, groupedTotals, zelleDrivers, fileName) {
  const sortedDrivers = buildSortedDriverPay(groupedTotals, zelleDrivers);
  const zelleRows = sortedDrivers.filter((driver) => driver.isZelle);

  const worksheetRows = zelleRows.map((driver, index) => ({
    Rank: index + 1,
    Driver: driver.name,
    'Total Amount': Number(driver.totalAmount || 0)
  }));

  const total = worksheetRows.reduce((sum, row) => sum + Number(row['Total Amount'] || 0), 0);
  worksheetRows.push({
    Rank: '',
    Driver: 'TOTAL',
    'Total Amount': total
  });

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(worksheetRows, {
    header: ['Rank', 'Driver', 'Total Amount']
  });
  xlsx.utils.book_append_sheet(workbook, worksheet, 'Zelle Report');

  const buffer = xlsx.write(workbook, {
    type: 'buffer',
    bookType: 'xlsx'
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
}

function createZelleExportHandler() {
  return async function zelleExportHandler(req, res) {
    const runId = req?.query?.runId;
    if (runId) {
      try {
        return await exportSavedRun(runId, res);
      } catch (error) {
        return res.status(500).json({
          ok: false,
          code: ERROR_CODES.PROCESS_FAILED,
          message: 'Could not generate Zelle report export.',
          details: error.message
        });
      }
    }

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
      const fileName = `zelle-report-${path.parse(APP_CONFIG.outputPath).name}.xlsx`;
      return sendZelleWorkbook(res, parsedOutput.groupedTotals, zelleDrivers, fileName);
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: ERROR_CODES.PROCESS_FAILED,
        message: 'Could not generate Zelle report export.',
        details: error.message
      });
    }
  };
}

module.exports = {
  createZelleExportHandler
};
