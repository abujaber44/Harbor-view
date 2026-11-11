# Harbor View Payroll

Local single-user payroll and reporting app for Harbor View.  
It reads `Daily Sheet.xlsx`, generates `output.xlsx`, and provides browser tools for payroll runs, slips, Zelle/Cash reporting, and driver NTD balance analysis.

## Purpose

This project is designed for a local operator workflow:

1. Select day range.
2. Run payroll extraction/calculation.
3. Review grouped totals.
4. Print reports (full slips, cash-only slips, Zelle summary, cash-to-keep summary).
5. Analyze NTD/Cash-in-out by driver across the week.

## Runtime Requirements

- Node.js `>=20 <26`
- Python `3.11+` recommended
- Python package: `openpyxl`

## Quick Start

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
npm install
PYTHON_BIN="$(pwd)/.venv/bin/python" npm start
```

Windows PowerShell:

```powershell
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
npm install
$env:PYTHON_BIN="$PWD\.venv\Scripts\python.exe"
npm start
```

Open: [http://localhost:3004](http://localhost:3004)

## Optional Environment Variables

- `PORT` (default `3004`)
- `PYTHON_BIN` (preferred Python executable)
- `PAYROLL_WORKBOOK_PATH` (default `./Daily Sheet.xlsx`)
- `PAYROLL_OUTPUT_PATH` (default `./output.xlsx`)
- `PAYROLL_ZELLE_DRIVERS_PATH` (default `./zelle-drivers.json`)
- `PAYROLL_BACKUP_DIR` (default `./backups`)
- `PAYROLL_HISTORY_DIR` (default `history` folder next to the output file)
- `PAYROLL_MAX_WORKBOOK_BYTES` (default `26214400`)
- `PAYROLL_PYTHON_TIMEOUT_MS` (default `120000`)

## NPM Commands

- `npm start` - start server
- `npm run dev` - start with watch mode
- `npm run check` - syntax/runtime checks
- `npm test` - Node + Python tests
- `npm run test:node` - Node tests only
- `npm run test:python` - Python tests only

## Main Pages

- `/` Payroll home
- `/zelle` Manage Zelle driver list
- `/driver-ntd-summary` Settlement Pass preview/apply workflow, plus workbook backups (compare and restore)
- `/driver-lookup` One driver's week: NTD, cash in/out, balance per day

## API Endpoints

### `POST /submit`

Runs Python payroll for selected day range.

Request:

```json
{ "fromDay": "Monday", "toDay": "Friday" }
```

Success:

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

Failure:

```json
{
  "ok": false,
  "code": "INPUT_INVALID",
  "message": "...",
  "details": "..."
}
```

### `GET /api/zelle-drivers`

Returns saved Zelle drivers:

```json
{ "ok": true, "drivers": ["Driver A", "Driver B"] }
```

### `POST /api/zelle-drivers`

Saves Zelle drivers:

```json
{ "drivers": ["Driver A", "Driver B"] }
```

### `GET /api/sorted-driver-pay`

Returns sorted pay info for reporting:

- Higher total pay first
- Includes Zelle/Cash tagging
- Includes split arrays: `allDrivers`, `cashDrivers`, `zelleDriverRows`

Also includes cash summary values used by cash-to-keep report.

### `GET /api/reports/zelle-export`

Generates an Excel download (`.xlsx`) with:

- Zelle drivers only
- Sorted by total amount descending
- Final `TOTAL` row

### `GET /api/workbook`

Returns the current workbook status: whether it exists, size, last-modified time, which expected day sheets are present or missing, and the date text in the first day sheet's `B1`.

### `POST /api/workbook`

Replaces the workbook. Send the `.xlsx` file as the raw request body with `Content-Type: application/octet-stream`.

- The file must be a real `.xlsx` containing at least one expected day sheet.
- The previous workbook is copied to `./backups` before it is replaced.
- Size is limited by `PAYROLL_MAX_WORKBOOK_BYTES`.

### `GET /api/workbook/drivers`

Returns the distinct driver names found in column `C` (rows `4..47`) of the day sheets. The Zelle page uses it to show a checklist instead of free text.

### `GET /api/workbook/checks`

Read-only checks for the selected range (`?fromDay=&toDay=`, default whole week). Reports missing day sheets, cash in/out or adjustment cells that contain text, payouts with no driver name, driver names that look like the same person spelled two ways, and formulas that have no calculated value. It never changes the workbook or blocks a run.

### `GET /api/driver-ntd`

Returns each driver's week (NTD, cash in/out, balance per day). `?driver=` filters by name (case-insensitive contains). Used by the Driver Lookup page.

### `GET /api/reports/payroll-export`

Downloads the full payroll report as Excel with three sheets: `Summary`, `Drivers`, `Daily Rows`. Add `?runId=<id>` to export a saved run.

### `GET /api/backups`, `GET /api/backups/:name/diff`, `POST /api/backups/:name/restore`

- List the workbook backups in `./backups` (newest first).
- `diff` lists the cells in columns `M`, `N`, `O` (rows `4..47` of the day sheets) where the backup differs from the current workbook.
- `restore` replaces the workbook with the backup. The current workbook is backed up first, so a restore can be undone.

### `GET /api/history`, `GET /api/history/:id`, `DELETE /api/history/:id`

Every successful `POST /submit` is saved as a JSON file in `./history` (rows, grouped totals, warnings, plus the Zelle driver list and cash-to-keep figures at that moment). These endpoints list, return, and delete saved runs. `POST /submit` also returns the saved run's `historyId`.

`GET /api/reports/zelle-export?runId=<id>` exports the Zelle report for a saved run instead of the latest output.

### `POST /api/settlement/preview`

Previews settlement allocations without modifying the workbook.

Request:

```json
{ "fromDay": "Monday", "toDay": "Thursday" }
```

Response (shape):

```json
{
  "ok": true,
  "fromDay": "Monday",
  "toDay": "Thursday",
  "driversReviewed": 7,
  "driversWithOpenBalance": 2,
  "driversProcessed": 1,
  "rowsChanged": 3,
  "rowsAdjusted": 3,
  "totalDeducted": 150,
  "lockedSessionsSkipped": 0,
  "unresolvedShortageTotal": 0,
  "warnings": [],
  "drivers": []
}
```

### `POST /api/settlement/apply`

Applies settlement allocations directly to `Daily Sheet.xlsx` and creates a backup copy in `./backups`.

Request:

```json
{ "fromDay": "Monday", "toDay": "Thursday" }
```

Response includes the same summary shape as preview plus:

```json
{
  "backupFile": "Daily Sheet.20260415-101010.xlsx",
  "workbookFile": "Daily Sheet.xlsx"
}
```

## Error Codes

- `PYTHON_NOT_FOUND`
- `DEPENDENCY_MISSING`
- `INPUT_INVALID`
- `WORKBOOK_MISSING`
- `SHEET_NOT_FOUND`
- `PROCESS_FAILED`

## Excel Mapping

### Payroll Extraction (`pay.py`)

- Day sheets:
- Monday: `Mon AM`, `Mon PM`
- Tuesday: `Tues AM`, `Tues PM`
- Wednesday: `Wed AM`, `Wed PM`
- Thursday: `Thurs AM`, `Thurs PM`
- Friday: `Fri AM`, `Fri PM`
- Saturday: `Sat AM`, `Sat PM`
- Sunday: `Sun AM`, `Sun PM`

- Row range: `4..47`
- Columns:
- Driver: `C`
- Amount: `M`
- Adj: `N`
- Notes: `O`
- Day date: `B1`

### Settlement Pass

- Same day sheets and row range `4..47`
- Rows included only when column `D` is not empty
- Columns:
- Driver: `C`
- NTD: `L`
- Cash in/out: `M`
- Adjustment: `N`
- Notes: `O`

## Calculation Rules

### Sorted Pay

- Driver sorting:
- Zelle first
- then total pay descending
- then name ascending

### Cash-to-Keep Summary

- Uses `Weekly Gross` sheet cell `M41` from `Daily Sheet.xlsx`
- Formula:
- `cashToKeep = WeeklyGrossM41 + totalZellePay`

### Settlement Allocation

- Target rows are same-driver rows with `cashInOut >= 0` and short amount from:
- `N` when `N` has a value, otherwise rounded `max(0, ntd - cashInOut)`.
- Source rows are same-driver rows where `cashInOut < 0`.
- Sources/targets are processed FIFO by day, then period (`AM` before `PM`), then row number.
- Available source capacity is:
- `max(0, abs(cashInOut) - max(0, -adj))`
- Apply mutation:
- target `M += amount` (covered shortage increases cash in/out)
- target `N = remaining short` (0 when fully cleared)
- source `N -= amount`
- source `O` appends `Deducted $X for M/D...`
- source negative `M` remains unchanged.

## Reports Available

### Home page

- Full pay slips (print layout)

### Sorted Pay page

- Cash report (slip style, cash-only drivers)
- Zelle report (table with sum)
- Cash-to-keep report (summary table)

## Project Structure

- `app.js` server bootstrap and runtime checks
- `src/createApp.js` express app wiring
- `src/routes/*` API handlers
- `src/services/*` business logic and workbook parsing
- `public/*` browser pages/scripts/styles
- `pay.py` Python payroll extraction/output generation
- `settlement.py` Python settlement preview/apply engine for workbook adjustments
- `test/node/*` Node tests
- `test/python/*` Python tests

## Notes

- This is a local single-user tool (no auth, no multi-user workflow).
- Generated/local artifacts are ignored via `.gitignore` (`node_modules`, `output.xlsx`, `zelle-drivers.json`, local workbook files, etc.).
