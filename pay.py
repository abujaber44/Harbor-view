import openpyxl
import pandas as pd
import subprocess
from datetime import datetime
from collections import defaultdict
import webbrowser
import os



# Load the workbook
wb = openpyxl.load_workbook('Daily Sheet.xlsx', data_only=True)

# Create an empty list to store the results
results = []

# Iterate through the first 14 sheets
for sheet in wb.worksheets[:14]:
    # Get the result of the formula in B1
    day = sheet['B1'].value
    #print (day, type(day))
    
    # Iterate through the cells in M4:M47
    for row in sheet['M4:M47']:
        for cell in row:
            if cell.value is not None:
                if isinstance(cell.value, int) and cell.value < 0:
                    # Copy the values from columns C and M
                    driver = sheet.cell(row=cell.row, column=3).value
                    short = sheet.cell(row=cell.row, column=14).value
                    notes = sheet.cell(row=cell.row, column=15).value
                    # Append the results to the list
                    results.append([day, driver, -1*(cell.value), short, notes])

# Create a new workbook to store the results
result_wb = openpyxl.Workbook()
result_sheet = result_wb.active

# Write the header row to the new sheet
result_sheet.append(['Day', 'Driver', 'Amount', 'Adj', 'Notes', 'Driver2', 'Sum'])

# Write the results to the new sheet
for result in results:
    result_sheet.append(result)



# Save the result workbook
result_wb.save('output.xlsx')

# Load your Excel file
workbook = openpyxl.load_workbook('output.xlsx')
worksheet = workbook.active


# Create a dictionary to store sums for each unique value in column B
sums = defaultdict(int)

# Iterate through the rows to calculate sums
for row in worksheet.iter_rows(min_row=2, values_only=True):
    value_in_column_B = row[1]  # Assuming column B is the second column (index 1)
    value_in_column_C = row[2]  # Assuming column C is the third column (index 2)

    # Add the value in column C to the corresponding sum in the dictionary
    if value_in_column_B is not None:
        sums[value_in_column_B] += value_in_column_C

# Update the worksheet with the sums in columns E and F

x = 2

for key, values in sums.items():
    restart = False 

    for row in worksheet.iter_rows(min_row=x):
        row[5].value = key
        row[6].value = values
        restart = True
        break
    
    if restart:
        x = x + 1
        continue

for row in worksheet.iter_rows(min_row=2, max_col=1):
    for cell in row:
        # Check if the cell is not empty
        if cell.value is not None:
            if type(cell.value) != str:
                cell.value = cell.value.strftime("%m/%d")


# Save the changes to the same file
workbook.save('output.xlsx')

print('Output has been saved')

filename = 'file:///'+os.getcwd()+'/' + 'index.html'

print('New Chrome tab...')

webbrowser.open_new_tab(filename)

print('Starting express server...')

subprocess.run(["node", "app.js"])



