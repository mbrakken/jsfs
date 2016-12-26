var fs         = require("fs");
var expect     = require('chai').expect
var utils      = require("../lib/utils.js");
var file_types = require("../lib/file-types.js");
var config     = require("../config.js");
var log        = require("../jlog.js");

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

});
