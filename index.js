document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();

    const formData = new FormData(e.target);
    fetch('http://localhost:3004/upload', {
            method: 'POST',
            body: formData
        })
        .then(res => res.json())
        .then(data => {

            const groupedData = {};
            data.forEach(item => {
                if (!groupedData[item.Driver]) {
                    groupedData[item.Driver] = {
                        Name: item.Driver,
                        TotalAmount: 0,
                        Pay: []
                    };
                }
                groupedData[item.Driver].TotalAmount += (item.Amount + (item.Adj || 0));
                groupedData[item.Driver].Pay.push({ Date: item.Day, Amount: item.Amount, Deductions: item.Adj || 0, Notes: item.Notes || "" });
            });

            const driverDataElement = document.getElementById('table');
            driverDataElement.innerHTML = ''; // Clear previous content

            for (const driver in groupedData) {
                const entryDiv = document.createElement('div');
                entryDiv.classList.add('entry');

                const header = document.createElement('h2');
                header.textContent = groupedData[driver].Name;
                entryDiv.appendChild(header);

                const totalAmount = document.createElement('p');
                totalAmount.classList.add('total-amount');
                totalAmount.textContent = "Total Amount: $" + groupedData[driver].TotalAmount;
                entryDiv.appendChild(totalAmount);

                const table = document.createElement('table');

                const headerRow = document.createElement('tr');
                ['Date', 'Amount', 'Deductions', 'Notes'].forEach(text => {
                    const th = document.createElement('th');
                    th.textContent = text;
                    headerRow.appendChild(th);
                });
                table.appendChild(headerRow);

                groupedData[driver].Pay.forEach(pay => {
                    const row = document.createElement('tr');
                    ['Date', 'Amount', 'Deductions', 'Notes'].forEach(key => {
                        const td = document.createElement('td');
                        td.textContent = (key === 'Deductions' && pay[key] === 0) ? '-' : pay[key];
                        row.appendChild(td);
                    });
                    table.appendChild(row);
                });

                entryDiv.appendChild(table);
                driverDataElement.appendChild(entryDiv);
            }
        })
        .catch(error => {
            document.getElementById('table').innerHTML = `Error: ${error.message}`;
            console.error(error);
        });
});
