const xlsx = require('xlsx');
const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { parseOutputWorkbook } = require('../services/payrollResults');
const { buildSortedDriverPay } = require('../services/sortedDriverPay');
const { buildReportSnapshot } = require('../services/runSnapshot');
const { isValidRunId, getRun } = require('../services/historyStore');

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function sumTotals(drivers) {
  return drivers.reduce((sum, driver) => sum + Number(driver.totalAmount || 0), 0);
}

// Builds the full payroll report workbook from figures payroll already produced.
function buildPayrollWorkbook({ rows, groupedTotals, zelleDrivers, cashSummary, range }) {
  const drivers = buildSortedDriverPay(groupedTotals, zelleDrivers);
  const cashDrivers = drivers.filter((driver) => !driver.isZelle);
  const zelleRows = drivers.filter((driver) => driver.isZelle);

  const driverRows = drivers.map((driver, index) => ({
    Rank: index + 1,
    Driver: driver.name,
    Type: driver.isZelle ? 'Zelle' : 'Cash',
    Entries: Array.isArray(driver.pay) ? driver.pay.length : 0,
    'Total Amount': Number(driver.totalAmount || 0)
  }));
  driverRows.push({ Rank: '', Driver: 'TOTAL', Type: '', Entries: '', 'Total Amount': sumTotals(drivers) });

  const dailyRows = (rows || []).map((row) => ({
    Day: row.Day ?? '',
    Driver: row.Driver ?? '',
    Amount: Number(row.Amount || 0),
    Adj: Number(row.Adj || 0),
    Notes: row.Notes ?? ''
  }));

  const summaryRows = [];
  if (range?.fromDay && range?.toDay) {
    summaryRows.push({ Item: 'Range', Value: `${range.fromDay} to ${range.toDay}` });
  }
  summaryRows.push(
    { Item: 'Drivers', Value: drivers.length },
    { Item: 'Total payout', Value: sumTotals(drivers) },
    { Item: 'Cash drivers total', Value: sumTotals(cashDrivers) },
    { Item: 'Zelle drivers total', Value: sumTotals(zelleRows) }
  );
  if (cashSummary) {
    summaryRows.push(
      { Item: 'Weekly Gross (M41)', Value: Number(cashSummary.weeklyGrossM41 || 0) },
      { Item: 'Cash to keep', Value: Number(cashSummary.cashToKeep || 0) }
    );
  }

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet(summaryRows, { header: ['Item', 'Value'] }),
    'Summary'
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet(driverRows, { header: ['Rank', 'Driver', 'Type', 'Entries', 'Total Amount'] }),
    'Drivers'
  );
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet(dailyRows, { header: ['Day', 'Driver', 'Amount', 'Adj', 'Notes'] }),
    'Daily Rows'
  );

  return xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function sendWorkbook(res, buffer, fileName) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  return res.send(buffer);
}

function createPayrollExportHandler() {
  return async function payrollExportHandler(req, res) {
    const runId = req?.query?.runId;

    try {
      if (runId) {
        if (!isValidRunId(runId)) {
          return sendError(res, 400, ERROR_CODES.INPUT_INVALID, 'Invalid run id.');
        }
        const run = await getRun(APP_CONFIG.historyDir, runId);
        if (!run) {
          return sendError(res, 404, ERROR_CODES.INPUT_INVALID, 'Saved run was not found.');
        }
        return sendWorkbook(res, buildPayrollWorkbook(run), `payroll-report-${run.id}.xlsx`);
      }

      const parsedOutput = parseOutputWorkbook(APP_CONFIG.outputPath);
      if (!parsedOutput.ok) {
        return sendError(
          res,
          422,
          parsedOutput.code || ERROR_CODES.PROCESS_FAILED,
          parsedOutput.message || 'Could not parse output workbook.'
        );
      }

      const snapshot = await buildReportSnapshot(parsedOutput.groupedTotals);
      const buffer = buildPayrollWorkbook({
        rows: parsedOutput.rows,
        groupedTotals: parsedOutput.groupedTotals,
        zelleDrivers: snapshot.zelleDrivers,
        cashSummary: snapshot.cashSummary
      });
      return sendWorkbook(res, buffer, 'payroll-report.xlsx');
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not generate payroll export.', error.message);
    }
  };
}

module.exports = {
  createPayrollExportHandler,
  buildPayrollWorkbook
};
