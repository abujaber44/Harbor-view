import openpyxl
import pandas as pd
import subprocess
from datetime import datetime
from collections import defaultdict
import webbrowser
import os
import sys
import json
import requests


def process_days(from_day, to_day):
    # Sample processing: Just return the values received in a formatted string.
    print (f"You selected from {from_day} to {to_day}")
    global sheets_to_process  # Declare it as global 

    day_to_sheets = {
    "Monday": ["Mon AM", "Mon PM"],
    "Tuesday": ["Tues AM", "Tues PM"],
    "Wednesday": ["Wed AM", "Wed PM"],
    "Thursday": ["Thurs AM", "Thurs PM"],
    "Friday": ["Fri AM", "Fri PM"],
    "Sarurday": ["Sat AM", "Sat PM"],
    "Sunday": ["Sun AM", "Sun PM"] 
    }

    days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Sarurday", "Sunday"]

    # Get the indices of from_day and to_day
    try:
        start_index = days_of_week.index(from_day)
        end_index = days_of_week.index(to_day)
    except ValueError:
        print("Invalid day range provided.")
        exit()

    # Get the list of sheets to process based on the day range
    sheets_to_process = []
    for day in days_of_week[start_index:end_index + 1]:
        sheets_to_process.extend(day_to_sheets[day])

if __name__ == "__main__":
    # Receive JSON data from stdin
    input_data = sys.stdin.read()
    data = json.loads(input_data)
    
    from_day = data['fromDay']
    to_day = data['toDay']
    
    # Process the data
    process_days(from_day, to_day)

  

# Load the workbook
wb = openpyxl.load_workbook('Daily Sheet.xlsx', data_only=True)

# Create an empty list to store the results
results = []

# Process each sheet in the list of sheets to process
for sheet_name in sheets_to_process:
    # Access the sheet by name directly
    sheet = wb[sheet_name]

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

# filename = 'file:///'+os.getcwd()+'/' + 'index.html'

# print('New Chrome tab...')

# webbrowser.open_new_tab(filename)

# print('Starting express server...')

# subprocess.run(["node", "app.js"])



# def upload_file():
#     # Define the URL of your Express server's /upload route
#     upload_url = 'http://localhost:3004/upload'

#     # Define the path to the output file you want to upload
#     file_path = 'output.xlsx'

#     # Open the file in binary mode and send it in a POST request
#     with open(file_path, 'rb') as f:
#         files = {'excel': f}  # The form field name in your express route is 'excel'
#         try:
#             response = requests.post(upload_url, files=files)
#             if response.status_code == 200:
#                 print('File uploaded successfully!')
#                 print('Response data:', response.json())  # Assuming the response is in JSON
#             else:
#                 print(f"Failed to upload file. Status code: {response.status_code}")
#                 print("Response:", response.text)
#         except Exception as e:
#             print(f"An error occurred while uploading the file: {e}")

# # After generating the output.xlsx file, call the upload_file function
# if __name__ == "__main__":
#     # Your existing logic to process the sheets and save output.xlsx
    
#     # Call upload_file to send the generated file to the Express server
#     upload_file()

filename = 'file:///'+os.getcwd()+'/' + 'index.html'

print('New Chrome tab...')

webbrowser.open_new_tab(filename)