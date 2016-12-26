process.env.NODE_ENV = "test";

var assert     = require("assert");
var fs         = require("fs");
var file_types = require("../lib/file-types.js");
var config     = require("../config.js");

var BLOCK_SIZE = config.BLOCK_SIZE;

var TEST_RESULT = {
  "bitrate": 44100,
  "channels": 2,
  "data_block_size": 4,
  "duration": 302.26666666666665,
  "resolution": 16,
  "size": 53319876,
  "subchunk_byte": 36,
  "subchunk_id": "data",
  "type": "wave"
};

function load_test_block(file, callback) {
  fs.readFile(file, function(err, data){
    if (err) {
      return callback(err);
    }

    return callback(null, data.slice(0, BLOCK_SIZE));
  })
}


describe("file-types.js", function() {

  describe("#is_wave(block)", function() {

    it("should validate wave file", function(done) {
      load_test_block("./test/fixtures/test.wav", function(error, block){
        if (error) {
          done(error);
        } else {
          assert.ok(file_types.is_wave(block));
          done();
        }
      });
    });

    it("should reject mp3 file", function(done) {
      load_test_block("./test/fixtures/test.mp3" , function(error, block){
        if (error) {
          done(error);
        } else {
          assert.equal(file_types.is_wave(block), false);
          done();
        }
      })
    });

  });

  describe("#analyze", function() {

    describe("#wave(block, result)", function() {

      it("should return correct result", function(done) {
        var result = {};
        load_test_block("./test/fixtures/test.wav", function(error, block){
          if (error) {
            done(error);
          } else {
            file_types.analyze.wave(block, result);
            assert.deepEqual(result, TEST_RESULT);
            done();
          }
        });
      });
    });
  });

});
