const path = require('path');
const xlsx = require('xlsx');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { parseOutputWorkbook } = require('../services/payrollResults');
const { readZelleDrivers } = require('../services/zelleDriversStore');
const { buildSortedDriverPay } = require('../services/sortedDriverPay');

function createZelleExportHandler() {
  return async function zelleExportHandler(_req, res) {
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
      const sortedDrivers = buildSortedDriverPay(parsedOutput.groupedTotals, zelleDrivers);
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

      const fileName = `zelle-report-${path.parse(APP_CONFIG.outputPath).name}.xlsx`;
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      return res.send(buffer);
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
