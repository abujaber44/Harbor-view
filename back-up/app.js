const express = require('express');
const multer = require('multer');
const xlsx = require('xlsx');
const { exec } = require('child_process');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

exec(`open file:///Users/mzaben/Documents/Pay/index.html`, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }

  console.log(`stdout: ${stdout}`);
  console.log(`stderr: ${stderr}`);
});


app.post('/upload', upload.single('excel'), function (req, res) {
  if (!req.file) {
    return res.status(400).send('No file was uploaded.');
  }

  var workbook = xlsx.readFile(req.file.path);
  var sheet = workbook.Sheets[workbook.SheetNames[0]];
  var data = xlsx.utils.sheet_to_json(sheet);
  res.send(data);
});

app.get('/', function (req, res) {
  res.send("done")
});

app.listen(3001, function () {
  console.log('Listening on port 3001');
});
