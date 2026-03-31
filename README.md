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
- `/sorted-pay` Sorted driver pay page + report generation
- `/driver-ntd-summary` Driver NTD/Cash-in-out weekly summary page

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

- Zelle drivers first
- then higher total pay
- then name

Also includes cash summary values used by cash-to-keep report.

### `GET /api/driver-ntd-summary?driver=<optional search>`

Returns driver NTD/Cash-in-out weekly details.

- If `driver` is omitted: returns all drivers.
- If `driver` is present: case-insensitive contains search.

Response shape:

```json
{
  "ok": true,
  "filter": "ali",
  "drivers": [
    {
      "driver": "Ali",
      "days": [
        { "day": "Monday", "ntd": 10, "cashInOut": 0, "balance": -10 }
      ],
      "totals": { "ntd": 10, "cashInOut": 0, "balance": -10 },
      "settlementNote": {
        "owedToDriver": 96,
        "driverOwesUs": 145,
        "stillCollect": 49,
        "message": "We owe the driver 96.00 but the driver owes 145.00, so we still need to collect 49.00."
      }
    }
  ],
  "grandTotals": { "ntd": 10, "cashInOut": 0, "balance": -10 }
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

### Driver NTD Summary

- Same day sheets and row range `4..47`
- Rows included only when column `D` is not empty
- Columns:
- Driver: `C`
- NTD: `L`
- Cash in/out: `M`

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

### Driver NTD Balance

- Per-day balance formula:
- `balance = cashInOut - ntd`

- Rounding:
- decimal part `> 0.50` rounds up
- decimal part `<= 0.50` rounds down

- Settlement note logic:
- no number mutation in daily/total balance
- note compares rounded:
- amount we owe driver
- amount driver owes us
- displays whether to still collect, still pay, or fully settled

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
- `test/node/*` Node tests
- `test/python/*` Python tests

## Notes

- This is a local single-user tool (no auth, no multi-user workflow).
- Generated/local artifacts are ignored via `.gitignore` (`node_modules`, `output.xlsx`, `zelle-drivers.json`, local workbook files, etc.).
