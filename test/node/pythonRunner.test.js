const test = require('node:test');
const assert = require('node:assert/strict');

const { resolvePythonBinary } = require('../../src/services/pythonRunner');

function preferredCommand() {
  if (process.env.PYTHON_BIN) {
    return process.env.PYTHON_BIN;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

test('resolvePythonBinary falls back to later candidates', async () => {
  const result = await resolvePythonBinary(['definitely-not-a-command-xyz', preferredCommand()]);
  assert.equal(result.ok, true);
  assert.ok(result.command);
});

test('resolvePythonBinary returns PYTHON_NOT_FOUND when no candidates exist', async () => {
  const result = await resolvePythonBinary(['definitely-not-a-command-1', 'definitely-not-a-command-2']);
  assert.equal(result.ok, false);
  assert.equal(result.code, 'PYTHON_NOT_FOUND');
});
