const path = require('path');
const express = require('express');
const { DAY_ORDER } = require('./config/constants');
const { createSubmitHandler } = require('./routes/submitRoute');
const { createZelleListHandler, createZelleSaveHandler } = require('./routes/zelleRoute');
const { createSortedPayHandler } = require('./routes/sortedPayRoute');

function createApp({ runtime }) {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      runtime,
      days: DAY_ORDER
    });
  });

  app.post('/submit', createSubmitHandler({ runtime }));
  app.get('/api/zelle-drivers', createZelleListHandler());
  app.post('/api/zelle-drivers', createZelleSaveHandler());
  app.get('/api/sorted-driver-pay', createSortedPayHandler());

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.get('/zelle', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'zelle.html'));
  });

  app.get('/sorted-pay', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'sorted-pay.html'));
  });

  return app;
}

module.exports = {
  createApp
};
