/* globals config, Neonode */

require('..');

var sa = require('superagent');
var Mocha = require('mocha');
var expect = require('chai').expect;
var Bluebird = require('bluebird');

global.sa = sa;
global.fetch = fetch;
global.expect = expect;
global.Promise = Bluebird;

Neonode._initialize(function () {
  var mocha = new Mocha();

  mocha.reporter('spec');

  // load all tests and filter out
  var filter = process.argv.slice(2)[0] || '.js';

  Neonode._util.glob('test/**/*.js')
    .forEach(function (file) {
      if (file.toLowerCase().indexOf(filter) > -1) {
        mocha.addFile(file);
      }
    });

  // run Mocha
  mocha.run(function (failures) {
    process.on('exit', function () {
      process.exit(failures);
    });

    process.exit();
  });

});

// common helper
function fetch(resource) {
  var _promise = null;
  var _stack = [];
  var _data;

  var args = Array.prototype.slice.call(arguments, 1);
  var url = config('siteURL') + resource.url.call(null, args);

  function load() {
    if (!_promise) {
      _promise = new Bluebird(function (resolve, reject) {
        var req = sa.agent()[resource.verb](url)
          .set('Accept', 'text/html');

        if (_data) {
          req.send(typeof _data === 'function' ? _data(req) : _data);
        }

        return req.end(function (err, res) {
          if (err) {
            reject(err);
          } else {
            resolve(res);
          }
        });
      });
    }

    return _promise;
  }

  function it() {
    return load().then(function (res) {
      _stack.forEach(function (cb) {
        cb(res);
      });

      return res;
    });
  }

  it.ok = function (code) {
    _stack.push(function (res) {
      expect(res.ok).to.equal(true);
      expect(res.status).to.equal(code || 200);
    });

    return it;
  };

  it.err = function (code) {
    _stack.push(function (res) {
      expect(res.error).to.equal(true);
      expect(res.status).to.equal(code || 500);
    });

    return it;
  };

  it.with = function (data) {
    _data = data;
    return it;
  };

  return it;
}
