const { ERROR_CODES } = require('../config/constants');
const { readZelleDrivers, writeZelleDrivers } = require('../services/zelleDriversStore');

function createZelleListHandler() {
  return async function zelleListHandler(_req, res) {
    try {
      const drivers = await readZelleDrivers();
      return res.json({
        ok: true,
        drivers
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: ERROR_CODES.PROCESS_FAILED,
        message: 'Could not read saved Zelle drivers.',
        details: error.message
      });
    }
  };
}

function createZelleSaveHandler() {
  return async function zelleSaveHandler(req, res) {
    if (!Array.isArray(req.body?.drivers)) {
      return res.status(400).json({
        ok: false,
        code: ERROR_CODES.INPUT_INVALID,
        message: 'Expected body format: { drivers: string[] }.',
        details: null
      });
    }

    try {
      const drivers = await writeZelleDrivers(req.body.drivers);
      return res.json({
        ok: true,
        drivers
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        code: ERROR_CODES.PROCESS_FAILED,
        message: 'Could not save Zelle drivers.',
        details: error.message
      });
    }
  };
}

module.exports = {
  createZelleListHandler,
  createZelleSaveHandler
};
