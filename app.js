'use strict';

console.log('Launching…');

var meta = require('./package.json');
var express = require('express');
var compression = require('compression');
var bodyParser = require('body-parser');
var path = require('path');
var Fs = require('fs');
var Uuid = require('node-uuid');

var History = require('./lib/history');
var Orchestrator = require('./lib/orchestrator');

// Configuration file
require('./config.js');

// Pseudo-constants:
var STATUS_STARTED = 'started';

var app = express();
var requests = {};
var port = process.argv[4] || global.DEFAULT_PORT;
var argResultLocation = process.argv[5] || global.DEFAULT_RESULT_LOCATION;

app.use(compression());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(corsHandler);

if (process.env.NODE_ENV === 'production') {
  app.set('views', __dirname + '/dist/views');
  app.use(express.static(__dirname + '/dist/assets'));
}
else {
  app.set('views', __dirname + '/views');
  app.use(express.static(__dirname + '/assets'));
}

// Index Page
app.get('/', function (request, response) {
  response.sendFile(__dirname + '/views/index.html');
});

// API methods

app.get('/api/version', function (req, res) {
  res.send(
    meta.name +
    ' version ' + meta.version +
    ' running on ' + process.platform +
    ' and listening on port ' + port +
    '. The server time is ' + new Date().toLocaleTimeString() + '.'
  );
});

app.get('/api/status', function (req, res) {
  var id = req.query ? req.query.id : null;
  var file = argResultLocation + path.sep + id + '.json';

  if (id) {
    Fs.exists(file, function (exists) {
      if (exists) res.status(200).sendFile(file);
      else if (requests && requests[id]) {
        res.status(200).send(JSON.stringify(requests[id], null, 2) + '\n');
      }
      else res.status(404).send('No job found with ID “' + id + '”.');
    });
  }
  else res.status(400).send('Missing required parameter “ID”.');
});

app.post('/api/request', function (req, res) {
  var url = req.body ? req.body.url : null;
  var decision = req.body ? req.body.decision : null;
  var token = req.body ? req.body.token : null;
  var id = Uuid.v4();

  if (!url || !decision || !token) {
    res.status(500).send(
      'Missing required parameters “url”, “decision” and/or “token”.'
    );
  }
  else {
    requests[id] = {
      id: id,
      url: url,
      decision: decision,
      jobs: {},
      history: new History(),
      status: STATUS_STARTED
    };

    new Orchestrator().run(requests[id], token).then(function () {
      console.log(
        'Spec at ' + url + ' (decision: ' + decision + ') has FINISHED.'
      );
    }, function () {
      console.log(
        'Spec at ' + url + ' (decision: ' + decision + ') has FAILED.'
      );
    });
    res.status(202).send(id);
  }
});

/**
* Add CORS headers to responses if the client is explicitly allowed.
*
* First, this ensures that the testbed page on the test server, listening on a different port, can GET and POST to Echidna.
* Most importantly, this is necessary to attend publication requests from third parties, eg GitHub.
*/

function corsHandler(req, res, next) {
  if (req && req.headers && req.headers.origin) {
    if (global.ALLOWED_CLIENTS.some(function (regex) {
      return regex.test(req.headers.origin);
    })) {
      res.header('Access-Control-Allow-Origin', req.headers.origin);
      res.header('Access-Control-Allow-Methods', 'GET,POST');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
    }
  }
  next();
}

app.listen(process.env.PORT || port).on('error', function (err) {
  if (err) {
    console.error('Error while trying to launch the server: “' + err + '”.');
  }
});

console.log(
  meta.name +
  ' version ' + meta.version +
  ' running on ' + process.platform +
  ' and listening on port ' + port +
  '. The server time is ' + new Date().toLocaleTimeString() + '.'
);
