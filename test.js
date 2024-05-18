const { jsPDF } = require("jspdf"); // will automatically load the node version


function drivers() {
    fetch('http://localhost:3004', {
            method: 'GET',
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
            const alan = groupedData["Alan C"].Name
            const pay = groupedData["Alan C"].TotalAmount
            const doc = new jsPDF();
            doc.text(pay, 10, 10);
            doc.save("a4.pdf"); // will save the file in the current working directory
        })
    }




drivers()

// console.log(drivers())

// const doc = new jsPDF();
// doc.text("Hello world!", 10, 10);
// doc.save("a4.pdf"); // will save the file in the current working directory