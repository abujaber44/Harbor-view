const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const jsFiles = [
  'app.js',
  'src/createApp.js',
  'src/config/constants.js',
  'src/routes/submitRoute.js',
  'src/services/pythonRunner.js',
  'src/services/payrollResults.js',
  'src/validation/dayRange.js'
];

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    shell: false
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
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

for (const file of jsFiles) {
  const ok = run(process.execPath, ['--check', path.resolve(file)]);
  if (!ok) {
    process.exit(1);
  }
}

const pythonSnippet = "import ast, pathlib; ast.parse(pathlib.Path('pay.py').read_text()); print('python-ok')";
let pythonCheckPassed = false;

for (const pythonCommand of resolvePythonCandidates()) {
  const pyArgs = pythonCommand === 'py'
    ? ['-3', '-c', pythonSnippet]
    : ['-c', pythonSnippet];
  if (run(pythonCommand, pyArgs)) {
    pythonCheckPassed = true;
    break;
  }
}

if (!pythonCheckPassed) {
  process.exit(1);
}

console.log('Checks passed.');
