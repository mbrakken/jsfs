process.env.NODE_ENV = "test";

var assert = require("assert");
var crypto = require("crypto");
var validate = require("../lib/validate.js");

var GOOD_KEY = "testing_key";
var BAD_KEY  = "wrong_key";
var INODE    = { access_key: GOOD_KEY };
var GET      = "GET";

function createToken(data){
  var sha = crypto.createHash("sha1");
  sha.update(data);
  return sha.digest("hex");
}

function setExpire(minutes){
  var d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d.getTime();
}

describe("validation.js", function(){

  describe("#has_key(inode, params)", function() {
    it("should validate an access_key", function() {
      var params = { access_key: GOOD_KEY };

      assert.ok(validate.has_key(INODE, params));
    });

    it("should reject an incorrect access_key", function() {
      var params = { access_key: BAD_KEY };

      assert.equal(validate.has_key(INODE, params), false);
    });

  });

  describe("#is_authorized(inode, method, params)", function() {

    it("should validate an access_key", function() {
      var params = { access_key: GOOD_KEY };

      assert.ok(validate.is_authorized(INODE, GET, params));
    });

    it("should reject an incorrect access key", function(){
      var params = { access_key: BAD_KEY };

      assert.equal(validate.is_authorized(INODE, GET, params), false);
    });

    it("should validate an access token", function(){
      var params = { access_token: createToken(GOOD_KEY + GET) };

      assert.ok(validate.is_authorized(INODE, GET, params));
    });

    it("should reject an access token for wrong method", function(){
      var params = { access_token: createToken(GOOD_KEY + "POST") };

      assert.equal(validate.is_authorized(INODE, GET, params), false);
    });

    it("should reject wrong access token", function(){
      var params = { access_token: createToken(BAD_KEY + GET) };

      assert.equal(validate.is_authorized(INODE, GET, params), false);
    });

    it("should validate a future time token", function() {
      var expires = setExpire(30);
      var params  = {
        access_token : createToken(GOOD_KEY + GET + expires),
        expires      : expires
      };

      assert.ok(validate.is_authorized(INODE, GET, params));
    });

    it("should reject an expired time token", function() {
      var expires = setExpire(-1);
      var params = {
        access_token : createToken(GOOD_KEY + GET + expires),
        expires      : expires
      };

      assert.equal(validate.is_authorized(INODE, GET, params), false);
    });

    it("should validate HEAD requests", function(){
      var params = { access_token: createToken(BAD_KEY + GET) };

      assert.ok(validate.is_authorized(INODE, "HEAD", params));
    });

    it("should validate OPTIONS requests", function(){
      var params = { access_token: createToken(BAD_KEY + GET) };

      assert.ok(validate.is_authorized(INODE, "OPTIONS", params));
    });

  });
});
