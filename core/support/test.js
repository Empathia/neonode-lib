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
  var _failed = null;
  var _stack = [];
  var _data;

  var args = Array.prototype.slice.call(arguments, 1);
  var url = config('siteURL') + resource.url.call(null, args);

  function load() {
    if (!_promise) {
      _promise = new Bluebird(function (resolve) {
        var req = sa.agent()[resource.verb](url)
          .set('Accept', 'text/html');

        if (_data) {
          req.send(typeof _data === 'function' ? _data(req) : _data);
        }

        return req.end(function (err, res) {
          if (err) {
            _failed = err;
          }

          resolve(res);
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
      if (_failed) {
        throw new Error('`' + resource.verb.toUpperCase() + ' ' + url + '` was not expected to fail');
      }

      expect(res.ok).to.equal(true);
      expect(res.status).to.equal(code || 200);
    });

    return it;
  };

  it.err = function (code) {
    _stack.push(function (res) {
      if (!_failed) {
        throw new Error('`' + resource.verb.toUpperCase() + ' ' + url + '` was expected to fail');
      }

      expect(res.ok).to.equal(false);
      expect(res.status).to.equal(code || 500);
    });

    return it;
  };

  it.with = function (data) {
    _data = data;
    return it;
  };

  it.then = function (cb) {
    _stack.push(cb);
    return it;
  };

  return it;
}
