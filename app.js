const { APP_CONFIG } = require('./src/config/constants');
const { createApp } = require('./src/createApp');
const { checkPythonRuntime } = require('./src/services/pythonRunner');
const { log } = require('./src/utils/logger');

async function startServer() {
  const runtime = await checkPythonRuntime();

  if (runtime.ok) {
    log('info', 'runtime.python.ready', {
      command: runtime.command,
      version: runtime.version,
      warnings: runtime.warnings || []
    });
  } else {
    log('error', 'runtime.python.not_ready', {
      code: runtime.code,
      message: runtime.message,
      details: runtime.details || null
    });
  }

  const app = createApp({ runtime });

  app.listen(APP_CONFIG.port, () => {
    log('info', 'server.started', {
      port: APP_CONFIG.port,
      workbookPath: APP_CONFIG.workbookPath,
      outputPath: APP_CONFIG.outputPath
    });
  });
}

startServer().catch((error) => {
  log('error', 'server.start_failed', {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});
