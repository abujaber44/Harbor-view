const path = require('path');
const express = require('express');
const { DAY_ORDER } = require('./config/constants');
const { createSubmitHandler } = require('./routes/submitRoute');

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

  app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  return app;
}

module.exports = {
  createApp
};
