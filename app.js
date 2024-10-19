const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const path = require('path');
const bodyParser = require('body-parser');
const { spawn } = require('child_process'); // To spawn the Python script



const app = express();
const upload = multer({ dest: 'uploads/' });

// Middleware to parse form data
app.use(bodyParser.urlencoded({ extended: false }));

app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

let processedData = [];


app.post('/upload', upload.single('excel'), function(req, res) {
    if (!req.file) {
        return res.status(400).send('No file was uploaded.');
    }

    var workbook = xlsx.readFile(req.file.path);
    var sheet = workbook.Sheets[workbook.SheetNames[0]];
    processedData = xlsx.utils.sheet_to_json(sheet);
    res.send(processedData); // Send the processed data
});


app.get('/uploaded-data', (req, res) => {
  if (processedData.length === 0) {
      return res.status(400).send('No data has been processed yet.');
  }

  res.json(processedData);  // Send the processed data back to the front-end
});


// Handle form submission and pass data to Python script
app.post('/submit', (req, res) => {
    const { fromDay, toDay } = req.body;
    // Prepare data to send to Python
    const data = JSON.stringify({ fromDay, toDay });
    // Spawn the Python process
    const python = spawn('python', [path.join(__dirname, 'pay.py')]);
    // Send data to Python via stdin
    python.stdin.write(data);
    python.stdin.end();
    // Capture the output from Python
    python.stdout.on('data', (data) => {
      const result = data.toString();
      res.send(result);  // Send the result back to the client
    });
    // Handle Python script errors
    python.stderr.on('data', (data) => {
      console.error(`Python error: ${data}`);
    });
    python.on('close', (code) => {
      console.log(`Python script exited with code ${code}`);
    });
  });

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index-1.html'));
  });


app.listen(3004, function() {
    console.log('Listening on port 3004');
});