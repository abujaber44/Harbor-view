const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const { ERROR_CODES } = require('../config/constants');

const execFileAsync = promisify(execFile);

function getPythonCandidates() {
  if (process.env.PYTHON_BIN) {
    return [process.env.PYTHON_BIN];
  }
  const localVenvPython = process.platform === 'win32'
    ? path.join(process.cwd(), '.venv', 'Scripts', 'python.exe')
    : path.join(process.cwd(), '.venv', 'bin', 'python');

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

function getCommandArgs(command, mode, value) {
  if (mode === 'version') {
    return command === 'py' ? ['-3', '--version'] : ['--version'];
  }

  if (mode === 'inline') {
    return command === 'py' ? ['-3', '-c', value] : ['-c', value];
  }

  if (mode === 'script') {
    return command === 'py' ? ['-3', value] : [value];
  }

  throw new Error(`Unsupported command mode: ${mode}`);
}

async function resolvePythonBinary(candidates = getPythonCandidates()) {
  for (const command of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(command, getCommandArgs(command, 'version'));
      const versionText = `${stdout || ''}${stderr || ''}`.trim();
      return { ok: true, command, version: versionText || 'unknown' };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        return {
          ok: false,
          code: ERROR_CODES.PROCESS_FAILED,
          message: `Failed while checking Python executable '${command}'.`,
          details: error.message
        };
      }
    }
  }

  return {
    ok: false,
    code: ERROR_CODES.PYTHON_NOT_FOUND,
    message: 'Could not find a Python executable. Install Python 3.11+ or set PYTHON_BIN.'
  };
}

async function checkPythonRuntime() {
  const resolved = await resolvePythonBinary();
  if (!resolved.ok) {
    return resolved;
  }

  const { command } = resolved;
  const warnings = [];
  const versionMatch = resolved.version.match(/Python\s+(\d+)\.(\d+)/i);
  if (!versionMatch) {
    warnings.push(`Could not parse Python version from '${resolved.version}'.`);
  } else {
    const major = Number(versionMatch[1]);
    const minor = Number(versionMatch[2]);
    if (major < 3 || (major === 3 && minor < 11)) {
      warnings.push(`Python 3.11+ is recommended. Found ${resolved.version}.`);
    }
  }

  try {
    await execFileAsync(command, getCommandArgs(command, 'inline', 'import openpyxl'));
  } catch (error) {
    return {
      ok: false,
      code: ERROR_CODES.DEPENDENCY_MISSING,
      message: `Python dependency check failed for '${command}'. Install requirements.txt.`,
      details: error.stderr || error.message,
      command,
      version: resolved.version
    };
  }

  return {
    ok: true,
    command,
    version: resolved.version,
    warnings
  };
}

function parseJsonFromText(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let i = lines.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(lines[i]);
    } catch (_error) {
      // Ignore non-JSON lines.
    }
  }

  return null;
}

function mapProcessFailure(stderr, parsedError) {
  if (parsedError && parsedError.code) {
    return parsedError;
  }

  const text = String(stderr || '');

  if (text.includes('ModuleNotFoundError') && text.includes('openpyxl')) {
    return {
      code: ERROR_CODES.DEPENDENCY_MISSING,
      message: 'Python package openpyxl is missing. Install requirements.txt.'
    };
  }

  if (text.includes('FileNotFoundError') && text.includes('Daily Sheet.xlsx')) {
    return {
      code: ERROR_CODES.WORKBOOK_MISSING,
      message: 'Daily Sheet.xlsx was not found.'
    };
  }

  if (text.includes('KeyError') && text.includes('sheet')) {
    return {
      code: ERROR_CODES.SHEET_NOT_FOUND,
      message: 'One or more expected worksheet tabs were not found.'
    };
  }

  return {
    code: ERROR_CODES.PROCESS_FAILED,
    message: 'Python process failed while generating payroll output.'
  };
}

async function runPayrollPython({
  pythonCommand,
  scriptPath,
  payload,
  timeoutMs,
  extraEnv
}) {
  const command = pythonCommand || (await resolvePythonBinary()).command;

  if (!command) {
    return {
      ok: false,
      code: ERROR_CODES.PYTHON_NOT_FOUND,
      message: 'Could not resolve a Python executable to run pay.py.'
    };
  }

  return new Promise((resolve) => {
    const child = spawn(command, getCommandArgs(command, 'script', scriptPath), {
      env: {
        ...process.env,
        ...extraEnv
      }
    });

    let stdout = '';
    let stderr = '';
    let timeoutReached = false;

    const timeout = setTimeout(() => {
      timeoutReached = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timeout);
      if (error.code === 'ENOENT') {
        resolve({
          ok: false,
          code: ERROR_CODES.PYTHON_NOT_FOUND,
          message: `Python executable '${command}' is not available.`,
          details: error.message
        });
        return;
      }

      resolve({
        ok: false,
        code: ERROR_CODES.PROCESS_FAILED,
        message: 'Failed to start Python process.',
        details: error.message
      });
    });

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('close', (exitCode) => {
      clearTimeout(timeout);

      if (timeoutReached) {
        resolve({
          ok: false,
          code: ERROR_CODES.PROCESS_FAILED,
          message: `Python processing exceeded timeout (${timeoutMs}ms).`,
          details: stderr || stdout
        });
        return;
      }

      if (exitCode !== 0) {
        const parsedError = parseJsonFromText(stderr) || parseJsonFromText(stdout);
        const mapped = mapProcessFailure(stderr, parsedError);
        resolve({
          ok: false,
          code: mapped.code,
          message: mapped.message,
          details: parsedError?.details || stderr || stdout || `Exit code ${exitCode}`
        });
        return;
      }

      const parsed = parseJsonFromText(stdout);
      resolve({
        ok: true,
        stdout,
        stderr,
        parsed
      });
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

module.exports = {
  checkPythonRuntime,
  resolvePythonBinary,
  runPayrollPython
};
