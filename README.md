# Harbor View Payroll

Local single-user payroll processor for Harbor View. The app reads `Daily Sheet.xlsx`, extracts the selected day range, writes `output.xlsx`, and renders grouped driver totals in the browser.

## Runtime

- Node.js LTS (tested with 20+)
- Python 3.11+
- Python package: `openpyxl`

## Bootstrap

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm install
```

Windows (PowerShell):

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
npm install
```

## Run

```bash
PYTHON_BIN="$(pwd)/.venv/bin/python" npm start
```

If your workbook/output paths differ:

```bash
PAYROLL_WORKBOOK_PATH="/path/to/Daily Sheet.xlsx" PAYROLL_OUTPUT_PATH="/path/to/output.xlsx" npm start
```

Then open [http://localhost:3004](http://localhost:3004).

## API Contract

`POST /submit`

Request:

```json
{ "fromDay": "Monday", "toDay": "Friday" }
```

Success response:

```json
{
  "ok": true,
  "range": { "fromDay": "Monday", "toDay": "Friday" },
  "rows": [],
  "groupedTotals": [],
  "outputFile": "output.xlsx",
  "warnings": []
}
```

Failure response:

```json
{
  "ok": false,
  "code": "INPUT_INVALID",
  "message": "...",
  "details": "..."
}
```

Error codes:

- `PYTHON_NOT_FOUND`
- `DEPENDENCY_MISSING`
- `INPUT_INVALID`
- `WORKBOOK_MISSING`
- `SHEET_NOT_FOUND`
- `PROCESS_FAILED`

## Commands

- `npm start` - Start server
- `npm run dev` - Start server in watch mode
- `npm run check` - JS/Python syntax checks
- `npm test` - Node + Python test suites
