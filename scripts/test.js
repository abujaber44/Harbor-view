const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false
  });
  return result.status === 0;
}

function resolvePythonCandidates() {
  if (process.env.PYTHON_BIN) {
    return [process.env.PYTHON_BIN];
  }

  const localVenvPython = process.platform === 'win32'
    ? path.join('.venv', 'Scripts', 'python.exe')
    : path.join('.venv', 'bin', 'python');
  const candidates = [];
  if (fs.existsSync(localVenvPython)) {
    candidates.push(localVenvPython);
  }

  if (process.platform === 'win32') {
    candidates.push('python', 'py');
    return candidates;
  }
  candidates.push('python3', 'python');
  return candidates;
}

if (!run(process.execPath, ['--test', 'test/node/*.test.js'])) {
  process.exit(1);
}

let pythonTestsPassed = false;
for (const pythonCommand of resolvePythonCandidates()) {
  const pyArgs = pythonCommand === 'py'
    ? ['-3', '-m', 'unittest', 'discover', '-s', 'test/python', '-p', 'test_*.py']
    : ['-m', 'unittest', 'discover', '-s', 'test/python', '-p', 'test_*.py'];
  if (run(pythonCommand, pyArgs)) {
    pythonTestsPassed = true;
    break;
  }
}

if (!pythonTestsPassed) {
  process.exit(1);
}

console.log('All tests passed.');
