"use strict";
/* globals require, module */

var config = require("./config.js");
var log    = require("./jlog.js");
var gcs    = require("@google-cloud/storage")(config.GOOGLE_CLOUD_STORAGE.AUTHENTICATION);

// {
//   projectId: 'grape-spaceship-123',
//   keyFilename: '/path/to/keyfile.json'
// }

var bucket = gcs.bucket(config.GOOGLE_CLOUD_STORAGE.BUCKET);

module.exports.read = function(url, callback){
  return bucket.file(url).get(callback);
};

module.exports.exists      = fs.stat;
module.exports.stream_read = fs.createReadStream;
module.exports.write       = fs.writeFile;
module.exports.delete      = fs.unlink;
