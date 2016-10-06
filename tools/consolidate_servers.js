"use strict";
/* globals require, console, process */

/*  CONFIGURATION  */
var DB_CONNECT  = process.env.DB || 'postgres://marc:@localhost:5432/murfie_dev';
var SOURCE_HOST = process.env.SOURCE_HOST || 'jsfs4.murfie.com';
var SOURCE_PORT = process.env.SOURCE_PORT || '7302';
var OFFSET      = process.env.OFFSET || 0;
var LIMIT       = process.env.LIMIT || 10000;
var ENV         = process.env.ENV || 'development';

/*  SETUP  */
var http       = require('http');
var url        = require('url');
var query      = require('pg-query');
var log        = require('../jlog.js');
var timer      = require('./timer.js');
var SOURCE_IPS = require('./source_ips.js');
var tracks     = [];
var errors     = [];
var JSFS_HOST  = ENV === 'development' ? 'localhost' : '10.240.0.18';
var JSFS_PORT  = '7302';

process.on('beforeExit', function(){
  console.log('process.beforeExit:', arguments, tracks.length, 'tracks remaining');
});

process.on('exit', function(code){
  log.message(log.DEBUG ,'About to exit with code: ' + code);
});

process.on('uncaughtException', function(err){
  console.log(`Caught exception: ${err}`);
});

process.on('unhandledRejection', function(reason, p){
  console.log("Unhandled Rejection at: Promise ", p, " reason: ", reason);
  // application specific logging, throwing an error, or other logic here
});

log.message(log.INFO, '******* MIGRATING ' + LIMIT + ' FILES FROM ' + SOURCE_HOST + ' OFFSET ' + OFFSET + ' ********');

query.connectionParameters = DB_CONNECT;

var clock = timer('JSFS migration');

function namespacedPath(url_parts){
  var path = url_parts.path;
  if (path.indexOf('/.') === 0) {
    return path;
  } else {
    return '/.' +url_parts.hostname.split('.').reverse().join('.') + path;
  }
}

function logError(e, s){
  s = s || '';
  var message = e.message || e.toString();
  log.message(log.ERROR, s + message);
}

function moveFile(file){
  var path      = namespacedPath(url.parse(file.url));
  var fetch_url = file.url + '?access_key=' + file.access_key;
  var source_ip = ENV === 'development' ? SOURCE_HOST : SOURCE_IPS[SOURCE_HOST];

  if (!source_ip) {
    log.message(log.ERROR, 'NO CONFIGURED IP FOR SOURCE: ' + SOURCE_HOST + '. ABORTING.');
    return;
  }

  var fetch_options = {
    hostname : source_ip,
    port     : SOURCE_PORT,
    path     : path,
    agent    : false,
    headers  : {
      'X-Access-Key' : file.access_key
    }
  };

  var store_options = {
    hostname : JSFS_HOST,
    port     : JSFS_PORT,
    method   : 'POST',
    path     : path,
    agent    : false,
    headers  : {
      'X-Access-Key' : file.access_key,
      'Content-Type' : 'application/octet-stream',
      'X-Private'    : true
    }
  };

  log.message(log.INFO, 'Moving ' + fetch_url + ' to ' + JSFS_HOST + store_options.path);

  /*******

    If no 'response' handler is added, then the response will be entirely discarded.
    However, if you add a 'response' event handler, then you must consume the data
    from the response object, either by calling response.read() whenever there is a
    'readable' event, or by adding a 'data' handler, or by calling the .resume() method.
     Until the data is consumed, the 'end' event will not fire. Also, until the data is
     read it will consume memory that can eventually lead to a 'process out of memory' error.

  */

  var storage_request = http.request(store_options, function(s_res){
    log.message(log.DEBUG, 'starting storage request');
    var data = '';
    s_res.on('data', function(d){
      data += d;
    }).on('error', function(e){
      logError(e, 'ERROR: storage response error for track ' + fetch_url + ': ');
      errors.push(file);
    });
  }).on('error', function(e){
    logError(e, 'ERROR: storage request error for track ' + fetch_url + ': ');
    errors.push(file);
  });

  http.get(fetch_options, function(f_res){
    log.message(log.DEBUG, 'made fetch request');

    f_res.on('data', function(){
      storage_request.write(data);
    }).on('close', function(){
      storage_request.end();
      log.message(log.INFO, 'File stored to ' + JSFS_HOST + store_options.path);
      log.message(log.DEBUG, tracks.length +' tracks remaining');
      return moveNextFile();
    }).on('error', function(e){
      logError(e, 'ERROR: fetch response error for track ' + fetch_url + ': ');
      errors.push(file);
    });

  }).on('error', function(e){
    logError(e, 'ERROR: fetch request error for track ' + fetch_url + ': ');
    errors.push(file);
  });

  /***

    Order of events messages:
    fetch_request.on('finish')
    store_request.on('finish')
    fetch_request.on('close');
    store_request.on('close');
    fetch_response.on('close');

   **/
}

function moveNextFile(){
  if (tracks.length > 0) {
    var next_track = tracks.shift();
    moveFile(next_track);
  } else {
    log.message(log.INFO, '******** ' + SOURCE_HOST + ' MIGRATION OFFSET ' + OFFSET + ' COMPLETED *********');
    clock.stop();
    log.message(log.ERROR, 'The following files experienced errors: ' + JSON.stringify(errors));
  }
}

// function migrateFiles(options){
//   if (!options.source){
//     console.error('Please specify a "source" jsfs, eg. "jsfs3.murfie.com" as part of an options object, ie. {options: "jsfs3.murfie.com", offset: 10000}');
//     return false;
//   }

//   if (!options.offset){
//     console.error('Please specify a "source" jsfs, eg. "jsfs3.murfie.com" as part of an options object, ie. {options: "jsfs3.murfie.com", offset: 10000}');
//     return false;
//   }

  var BASE_SQL = 'SELECT * FROM track_uploads WHERE url LIKE \'%' + SOURCE_HOST + '%\' ORDER BY id ASC OFFSET ' + OFFSET + ' LIMIT ' + LIMIT;

  query(BASE_SQL, function(err, results){
    if (err) {
      log.message(log.ERROR, 'SQL error: ' + err.toString());
      return;
    }

    log.message(log.INFO, results.length + ' tracks will be migrated from ' + SOURCE_HOST + ' starting at ' + OFFSET);
    tracks = results;
    moveNextFile();
  });
// }
