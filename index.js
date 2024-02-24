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
                groupedData[item.Driver].Pay.push({ Date: item.Day, Amount: item.Amount, Ded: item.Adj || 0, Notes: item.Notes || "" });
            });
            console.log(groupedData)

            const driverDataElement = document.getElementById('table');
            for (const driver in groupedData) {
                const row = document.createElement('tr');

                const cellDriver = document.createElement('td');
                cellDriver.textContent = groupedData[driver].Name;
                cellDriver.style.fontWeight = 'bold';
                cellDriver.style.paddingBottom = '15px';
                cellDriver.style.paddingTop = '15px'

                const cellTotalAmount = document.createElement('td');
                cellTotalAmount.textContent = "Total: $" + groupedData[driver].TotalAmount;
                cellTotalAmount.style.paddingBottom = '15px'
                cellTotalAmount.style.paddingTop = '15px'
                cellTotalAmount.style.fontWeight = 'bold';

                const cellPayDetails = document.createElement('td');
                cellPayDetails.innerHTML = groupedData[driver].Pay.map(pay => {
                    if (pay.Ded !== 0) {
                        return `Date ${pay.Date}: $${pay.Amount} &nbsp Deducted -$${(pay.Ded)*-1} &nbsp ${pay.Notes}`;
                    } else {
                        return `Date ${pay.Date}: $${pay.Amount}`;
                    }
                }).join('<br>');

                row.appendChild(cellDriver);
                row.appendChild(cellPayDetails);
                row.appendChild(cellTotalAmount);
                driverDataElement.appendChild(row);
            }
        })
        .catch(error => {
            document.getElementById('table').innerHTML = `Error: ${error.message}`;
            console.error(error);
        });
});