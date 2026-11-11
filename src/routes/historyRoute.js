const { APP_CONFIG, ERROR_CODES } = require('../config/constants');
const { isValidRunId, listRuns, getRun, deleteRun } = require('../services/historyStore');

function sendError(res, status, code, message, details) {
  return res.status(status).json({
    ok: false,
    code,
    message,
    details: details || null
  });
}

function createHistoryListHandler() {
  return async function historyListHandler(_req, res) {
    try {
      return res.json({ ok: true, runs: await listRuns(APP_CONFIG.historyDir) });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not read saved runs.', error.message);
    }
  };
}

function createHistoryGetHandler() {
  return async function historyGetHandler(req, res) {
    const id = req.params?.id;
    if (!isValidRunId(id)) {
      return sendError(res, 400, ERROR_CODES.INPUT_INVALID, 'Invalid run id.');
    }

    try {
      const run = await getRun(APP_CONFIG.historyDir, id);
      if (!run) {
        return sendError(res, 404, ERROR_CODES.INPUT_INVALID, 'Saved run was not found.');
      }
      return res.json({ ok: true, run });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not read the saved run.', error.message);
    }
  };
}

function createHistoryDeleteHandler() {
  return async function historyDeleteHandler(req, res) {
    const id = req.params?.id;
    if (!isValidRunId(id)) {
      return sendError(res, 400, ERROR_CODES.INPUT_INVALID, 'Invalid run id.');
    }

    try {
      const deleted = await deleteRun(APP_CONFIG.historyDir, id);
      if (!deleted) {
        return sendError(res, 404, ERROR_CODES.INPUT_INVALID, 'Saved run was not found.');
      }
      return res.json({ ok: true, id });
    } catch (error) {
      return sendError(res, 500, ERROR_CODES.PROCESS_FAILED, 'Could not delete the saved run.', error.message);
    }
  };
}

module.exports = {
  createHistoryListHandler,
  createHistoryGetHandler,
  createHistoryDeleteHandler
};
