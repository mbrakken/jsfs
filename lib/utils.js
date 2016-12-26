"use strict";
/* globals require, module */

var crypto     = require("crypto");
var log        = require("../jlog.js");
var config     = require("../config.js");
var file_types = require("./file-types.js");
var operations = require("./" + (config.CONFIGURED_STORAGE || "fs") + "/disk-operations.js");

// simple encrypt-decrypt functions
module.exports.encrypt = function encrypt(block, key){
  var cipher = crypto.createCipher("aes-256-cbc", key);
  cipher.write(block);
  cipher.end();
  return cipher.read();
};

// examine the contents of a block to generate metadata
module.exports.analyze_block = function analyze_block(block){
  var result = {};
  result.type = "unknown";
  try{

    if(file_types.is_wave(block)){
      file_types.analyze.wave(block, result);
    }

    // TODO: test for MP3
    // TODO: test for FLAC
    // TODO: test for AIFF
    // TODO: test for ...
  } catch(ex) {
    log.message(log.WARN, "Exception analyzing media type: " + ex);
  }
  return result;
};

// save inode to disk
module.exports.save_inode = function save_inode(inode, callback){
  var total_locations    = config.STORAGE_LOCATIONS.length;
  var accessed_locations = 0;

  var _cb = function _cb(error){
    accessed_locations++;
    if(error){
      log.message(log.ERROR, "Error saving inode: " + error);
    } else {
      log.message(log.INFO, "Inode saved to disk");
    }
    if (accessed_locations === total_locations) {
      return callback(inode);
    }
  };

  // store a copy of each inode in each storage location for redundancy
  for(var storage_location in config.STORAGE_LOCATIONS){
    var selected_location = config.STORAGE_LOCATIONS[storage_location];
    operations.write(selected_location.path + inode.fingerprint + ".json", JSON.stringify(inode), _cb);
  }
};

// load inode from disk
module.exports.load_inode = function load_inode(url, callback){
  log.message(log.DEBUG, "url: " + url);
  var total_locations   = config.STORAGE_LOCATIONS.length;

  // calculate fingerprint
  var shasum = crypto.createHash("sha1");
  shasum.update(url);
  var inode_fingerprint =  shasum.digest("hex");


  var _load_inode = function _load_inode(idx){
    var selected_path = config.STORAGE_LOCATIONS[idx].path;
    log.message(log.DEBUG, "Loading inode from " + selected_path);

    operations.read(selected_path + inode_fingerprint + ".json", function(err, data){
      var _idx = idx + 1;
      if (err) {
        if (_idx === total_locations) {
          log.message(log.WARN, "Unable to load inode for requested URL: " + url);
          return callback(err);
        } else {
          log.message(log.DEBUG, "Error loading inode from " + selected_path);
          return _load_inode(_idx);
        }
      }

      try {
        var inode = JSON.parse(data);
        log.message(log.INFO, "Inode loaded from " + selected_path);
        return callback(null, inode);
      } catch(ex) {
        if (_idx === total_locations) {
          log.message(log.WARN, "Unable to load inode for requested URL: " + url);
          return callback(ex);
        } else {
          log.message(log.DEBUG, "Error loading inode from " + selected_path);
          return _load_inode(_idx);
        }
      }
    });
  };

  _load_inode(0);
};

module.exports.commit_block_to_disk = function commit_block_to_disk(block, block_object, next_storage_location, callback) {
  // if storage locations exist, save the block to disk
  var total_locations = config.STORAGE_LOCATIONS.length;

  if(total_locations > 0){

    // check all storage locations to see if we already have this block

    var on_complete = function on_complete(found_block){
      // TODO: consider increasing found count to enable block redundancy
      if(!found_block){

        // write new block to next storage location
        // TODO: consider implementing in-band compression here
        var dir = config.STORAGE_LOCATIONS[next_storage_location].path;
        operations.write(dir + block_object.block_hash, block, "binary", function(err){
          if (err) {
            return callback(err);
          }

          block_object.last_seen = dir;
          log.message(log.INFO, "New block " + block_object.block_hash + " written to " + dir);

          return callback(null, block_object);

        });

      } else {
        log.message(log.INFO, "Duplicate block " + block_object.block_hash + " not written to disk");
        return callback(null, block_object);
      }
    };

    var locate_block = function locate_block(idx){
      var location = config.STORAGE_LOCATIONS[idx];
      var file = location.path + block_object.block_hash;
      idx++;

      operations.exists(file + ".gz", function(err, result){

        if (result) {
          log.message(log.INFO, "Duplicate compressed block " + block_object.block_hash + " found in " + location.path);
          block_object.last_seen = location.path;
          return on_complete(true);
        } else {
          operations.exists(file, function(err_2, result_2){

            if (err_2) {
              log.message(log.INFO, "Block " + block_object.block_hash + " not found in " + location.path);
            }

            if (result_2) {
              log.message(log.INFO, "Duplicate block " + block_object.block_hash + " found in " + location.path);
              block_object.last_seen = location.path;
              return on_complete(true);
            } else {
              if (idx >= total_locations) {
                return on_complete(false);
              } else {
                locate_block(idx);
              }
            }
          });
        }

      });


    };

    locate_block(0);

  } else {
    log.message(log.WARN, "No storage locations configured, block not written to disk");
    return callback(null, block_object);
  }
};
