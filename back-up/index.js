document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    fetch('http://localhost:3001/upload', {
      method: 'POST',
      body: formData
    })
    .then(res => res.json())
    .then(data => {
    let table = document.getElementById('table');
    for (let i = 0; i < data.length; i++) {
      let row = table.insertRow(-1);
      let cell = row.insertCell(-1);
      if (data[i].Notes === undefined) {
        cell.innerHTML = `<br>${data[i].Driver}<br>&nbsp${data[i].Day}<br>$${data[i].Amount}<br><br><br>`
      } else {
        cell.innerHTML = `<br>${data[i].Driver}<br>&nbsp${data[i].Day}<br>$${data[i].Amount}<br>${data[i].Notes}<br><br>`
      }
    }
    })
    .catch(error => {
      document.getElementById('table').innerHTML = `Error: ${error.message}`;
      console.error(error);
    });
});



  