/* globals config, Neonode */

require('..');

var sa = require('superagent');
var Mocha = require('mocha');
var expect = require('chai').expect;
var Bluebird = require('bluebird');

global.sa = sa;
global.mock = mock;
global.fetch = fetch;
global.expect = expect;
global.Promise = Bluebird;

Neonode._initialize(function () {
  // load all tests and filter out
  var filter = process.argv.slice(2)[0] || '.js';
  var expr = process.argv.slice(3)[0] || '';

  var mocha = new Mocha({
    fgrep: expr || undefined
  });

  mocha.reporter('spec');

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

// krypton-orm
function mock(Model, defs) {
  if (typeof Model.prototype.new === 'function') {
    throw new Error(Model.name + ' model is already mocked, use `Model.new()` or `model.new()` instead');
  }

  function _props(params) {
    params = params || {};

    var data = {};

    if (defs) {
      Object.keys(defs).forEach(function (key) {
        if (params.except || params.only) {
          if (params.except && params.except.indexOf(key) === -1) {
            data[key] = defs[key];
          }

          if (params.only && params.only.indexOf(key) > -1) {
            data[key] = defs[key];
          }
        } else {
          data[key] = defs[key];
        }
      });

      if (!(params.except || params.only)) {
        Object.keys(defs).forEach(function (key) {
          data[key] = typeof params[key] !== 'undefined' ? params[key] : data[key];
        });
      }
    }

    function replace(value) {
      if (typeof value === 'string') {
        return value.replace(/\{(.+?)\}/g, function ($0, key) {
          return typeof params[key] !== 'undefined' ? params[key] : data[key];
        });
      }

      return value;
    }

    Object.keys(data).forEach(function (key) {
      if (Array.isArray(data[key])) {
        data[key] = data[key].map(replace);
      } else {
        data[key] = replace(data[key]);
      }
    });

    return data;
  }

  function factory(params) {
    return new Model(_props(params));
  }

  // new instances with defaults
  Model.new = Model.prototype.new = factory;

  // assertion helpers
  Model.prototype.ok = function () {
    return this.save()
      .catch(function (e) {
        if (e.errors) {
          expect.fail(e.toString());
        } else {
          expect.fail(e);
        }
      });
  };

  Model.prototype.err = function (length) {
    return this.save()
      .then(function () {
        expect.fail('should have rejected');
      })
      .catch(function (error) {
        if (length !== null && typeof length === 'object') {
          Object.keys(length).forEach(function (key) {
            if (!error.errors[key]) {
              expect.fail('missing error message for ' + key);
            } else {
              expect(error.errors[key].message).to[
                length[key] instanceof RegExp ? 'match' : 'contain'
              ](length[key]);
            }
          });
        } else {
          var _message = [error.message].concat(
              error.errors
                ? Object.keys(error.errors)
                  .map(function (e) {
                    return e + ': ' + error.errors[e].message;
                  })
                : error.toString().split('\n')
            ).join('; ');

          if (!length || typeof length === 'number') {
            expect(_message).to.equal((length || 1) + ' invalid values');
          }

          if (typeof length === 'string') {
            expect(_message).to.contain(length);
          }

          if (length instanceof RegExp) {
            expect(_message).to.match(length);
          }
        }
      });
  };

  return new Model(defs);
}

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
          .set('Accept', 'text/html')
          .type('form');

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
        var _message = '`' + resource.verb.toUpperCase() + ' ' + url + '` was not expected to fail';

        throw new Error(_message + (res.text ? ' (' + res.text + ')' : ''));
      }

      expect(res.ok).to.equal(true);
      expect(res.status).to.equal(code || 200);
    });

    return it;
  };

  it.err = function (code) {
    _stack.push(function (res) {
      if (!_failed) {
        var _message = '`' + resource.verb.toUpperCase() + ' ' + url + '` was expected to fail';

        throw new Error(_message + (res.text ? ' (' + res.text + ')' : ''));
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
