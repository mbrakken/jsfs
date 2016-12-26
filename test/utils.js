var fs         = require("fs");
var mock       = require('mock-fs');
var expect     = require('chai').expect
var utils      = require("../lib/utils.js");
var file_types = require("../lib/file-types.js");
var config     = require("../config.js");
var log        = require("../jlog.js");

var DEFAULT_STORAGE = config.STORAGE_LOCATIONS;
var BLOCK_SIZE = config.BLOCK_SIZE;

function load_test_block(file, callback) {
  fs.readFile(file, function(err, data){
    if (err) {
      return callback(err);
    }

    return callback(null, data.slice(0, BLOCK_SIZE));
  });
}

describe("utils.js", function() {

  before(function(){
    // suppress debug log output for tests
    log.level = 4;
  });

  after(function(){
    // restore default log level
    log.level = config.LOG_LEVEL
  });

  describe("#wave_audio_offset(block, data, default_size)", function() {

    it("should return smaller offset for wave", function(done) {
      load_test_block("./test/fixtures/test.wav", function(error, block){
        if (error) {
          done(error);
        } else {
          var offset = utils.wave_audio_offset(block, file_types.analyze(block), BLOCK_SIZE);

          expect(offset).to.be.a("number");
          expect(offset).to.equal(44);
          expect(offset).to.be.at.most(BLOCK_SIZE);
          expect(offset).to.be.below(BLOCK_SIZE);
          done();
        }
      });
    });

    it("should return default offset for not wave", function(done) {
      load_test_block("./test/fixtures/test.mp3", function(error, block){
        if (error) {
          done(error);
        } else {
          var offset = utils.wave_audio_offset(block, file_types.analyze(block), BLOCK_SIZE);

          expect(offset).to.be.a("number");
          expect(offset).to.equal(BLOCK_SIZE);
          expect(offset).to.be.at.most(BLOCK_SIZE);
          done();
        }
      });
    });

  });

  context("inode operations", function(){

    before(function(){
      config.STORAGE_LOCATIONS = [
        {"path":"fake/blocks1/","capacity":4294967296},
        {"path":"fake/blocks2/","capacity":4294967296}
      ];

      var fake_data = {
        fake: {
          "blocks1": {
          },
          "blocks2": {
          }
        }
      };

      var hash_1 = utils.sha1_to_hex("test_inode_1");
      var hash_2 = utils.sha1_to_hex("test_inode_2");
      fake_data.fake.blocks1[hash_1 + ".json"] = "{}";
      fake_data.fake.blocks2[hash_1 + ".json"] = "{}";
      fake_data.fake.blocks2[hash_2 + ".json"] = "{}";

      mock(fake_data);
    });

    after(function(){
      // restore default log level
      mock.restore();
      config.STORAGE_LOCATIONS = DEFAULT_STORAGE;
    });

    describe("#load_inode(url, callback)", function() {

      it("finds an inode", function(done) {
        utils.load_inode("test_inode_1", function(err, inode){
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      });

      it("searches multiple directories and returns found inode", function(done) {
        utils.load_inode("test_inode_2", function(err, inode){
          if (err) {
            done(err);
          } else {
            done();
          }
        });
      });

      it("returns an error for missing inode", function(done) {
        utils.load_inode("test_inode_3", function(err, inode){
          expect(inode).to.be.undefined;
          expect(err).to.be.an.instanceof(Error);
          expect(err).to.have.property("code", "ENOENT");
          expect(err).to.have.property("errno", 34);
          done();
        });
      });

    });

    describe("#save_inode(inode, callback)", function(){

      it("saves an inode", function(done) {
        var path  = "test_inode_4";
        var inode = { fingerprint: utils.sha1_to_hex(path) };

        utils.save_inode(inode, function(found_inode){
          expect(found_inode).to.deep.equal(inode);

          // maybe should do manual inspection of each directory
          utils.load_inode(path, function(err, response){
            expect(err).to.be.null;
            expect(response).to.be.an("object");
            expect(response).to.deep.equal(inode);
            done();
          });
        });
      });
    });

  });

});
