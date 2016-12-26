"use strict";
/* globals require, module, Buffer */

var crypto = require("crypto");
var config = require("../config.js");
var log    = require("../jlog.js");
var utils  = require("./utils.js");

// global to keep track of storage location rotation
var next_storage_location = 0;

var Inode = {
  init: function(url){
    this.input_buffer = new Buffer("");
    this.block_size = config.BLOCK_SIZE;
    this.file_metadata = {};
    this.file_metadata.url = url;
    this.file_metadata.created = (new Date()).getTime();
    this.file_metadata.version = 0;
    this.file_metadata.private = false;
    this.file_metadata.encrypted = false;
    this.file_metadata.fingerprint = null;
    this.file_metadata.access_key = null;
    this.file_metadata.content_type = "application/octet-stream";
    this.file_metadata.file_size = 0;
    this.file_metadata.block_size = this.block_size;
    this.file_metadata.blocks_replicated = 0;
    this.file_metadata.inode_replicated = 0;
    this.file_metadata.blocks = [];

    // create fingerprint to uniquely identify this file
    var shasum = crypto.createHash("sha1");
    shasum.update(this.file_metadata.url);
    this.file_metadata.fingerprint =  shasum.digest("hex");

    // use fingerprint as default key
    this.file_metadata.access_key = this.file_metadata.fingerprint;
  },
  write: function(chunk, req, callback){
    this.input_buffer = new Buffer.concat([this.input_buffer, chunk]);
    if (this.input_buffer.length > this.block_size) {
      req.pause();
      this.process_buffer(false, function(result){
        req.resume();
        callback(result);
      });
    } else {
      callback(true);
    }
  },
  close: function(callback){
    var self = this;
    log.message(0, "flushing remaining buffer");
    // update original file size
    self.file_metadata.file_size = self.file_metadata.file_size + self.input_buffer.length;

    self.process_buffer(true, function(result){
      if(result){
        // write  inode to disk
        utils.save_inode(self.file_metadata, callback);
      }
    });
  },
  process_buffer: function(flush, callback){
    var self = this;
    var total = flush ? 0 : self.block_size;
    this.store_block(!flush, function(err/*, result*/){
      if (err) {
        log.message(log.DEBUG, "process_buffer result: " + err);
        return callback(false);
      }

      if (self.input_buffer.length > total) {
        self.process_buffer(flush, callback);
      } else {
        callback(true);
      }

    });
  },
  store_block: function(update_file_size, callback){
    var self = this;
    var chunk_size = this.block_size;

    // grab the next block
    var block = this.input_buffer.slice(0, chunk_size);
    if(this.file_metadata.blocks.length === 0){

      // grok known file types
      var analysis_result = utils.analyze_block(block);

      log.message(log.INFO, "block analysis result: " + JSON.stringify(analysis_result));

      // if we found out anything useful, annotate the object's metadata
      this.file_metadata.media_type = analysis_result.type;
      if(analysis_result.type != "unknown"){
        this.file_metadata.media_size = analysis_result.size;
        this.file_metadata.media_channels = analysis_result.channels;
        this.file_metadata.media_bitrate = analysis_result.bitrate;
        this.file_metadata.media_resolution = analysis_result.resolution;
        this.file_metadata.media_duration = analysis_result.duration;
      }

      if (analysis_result.type === 'wave') {
        // Use analyze_block to identify offset until non-zero data, grab just that portion to store
        // In analyze_block we identified the data chunk offset and data block size
        // We'll start the scan at block.readUInt32LE([data chunk offset] + 8) in order to find the
        // start of non-zero audio data, and slice off everything before that point as a seperate block.
        // That way we can deduplicate tracks with slightly different silent leads.

        // If we didn't find a data chunk, skip the entire operation.

        var b_size = analysis_result.data_block_size;

        if (analysis_result.subchunk_id === 'data' && b_size === 4) {
          // Most likely to be 4, but it'd be nice to handle alternate cases.
          // Essentially, (b_size * 8) will be the readUInt_x_LE function we use, eg readUInt32LE.

          // Start of the audio data, beginning of the subchunk + 8 bytes (4 for label, 4 for size)
          var data_offset = analysis_result.subchunk_byte + 8;
          var b_length = block.length;

          // Increment our offset by the byte size, since we're analyzing on the basis of it
          for (data_offset; (data_offset + b_size) < b_length; data_offset = data_offset + b_size) {
            if (block.readUInt32LE(data_offset) !== 0) {
              log.message(log.INFO, "Storing the first " + data_offset + " bytes seperately");
              // Reduce block to the offset
              block = block.slice(0, data_offset);
              chunk_size = data_offset;
              break;
            }
          }
        }
      }
    }

    // if encryption is set, encrypt using the hash above
    if(this.file_metadata.encrypted && this.file_metadata.access_key){
      log.message(log.INFO, "encrypting block");
      block = utils.encrypt(block, this.file_metadata.access_key);
    } else {

      // if even one block can't be encrypted, say so and stop trying
      this.file_metadata.encrypted = false;
    }

    // generate a hash of the block to use as a handle/filename
    var block_hash = null;
    var shasum = crypto.createHash("sha1");
    shasum.update(block);
    block_hash = shasum.digest("hex");

    // store the block
    var block_object = {};
    block_object.block_hash = block_hash;

    utils.commit_block_to_disk(block, block_object, next_storage_location, function(err, result){
      if (err) {
        return callback(err);
      }

      // increment (or reset) storage location (striping)
      next_storage_location++;
      if(next_storage_location === config.STORAGE_LOCATIONS.length){
        next_storage_location = 0;
      }

      // update inode
      self.file_metadata.blocks.push(result);

      // update original file size
      // we need to update filesize here due to truncation at the front,
      // but need the check to avoid double setting during flush
      // is there a better way?
      if (update_file_size) {
        self.file_metadata.file_size = self.file_metadata.file_size + chunk_size;
      }

      // advance buffer
      self.input_buffer = self.input_buffer.slice(chunk_size);
      return callback(null, result);
    });
  }
};

module.exports = Inode;
