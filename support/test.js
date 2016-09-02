/* globals config, Promise */

var sa = require('superagent');
var expect = require('chai').expect;

global.sa = sa;
global.mock = mock;
global.fetch = fetch;
global.expect = expect;

// krypton-orm
function _new(Model, defs) {
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

  // new instances with defaults
  Model.new = Model.prototype.new = function (params) {
    return new Model(_props(params));
  };

  // assertion helpers
  Model.prototype.ok = function () {
    return this.save()
      .catch(function (e) {
        if (e.errors) {
          throw new Error(e.toString());
        } else {
          throw e;
        }
      });
  };

  Model.prototype.err = function (length) {
    return this.save()
      .then(function () {
        throw new Error('should have rejected');
      })
      .catch(function (error) {
        if (length !== null && typeof length === 'object') {
          Object.keys(length).forEach(function (key) {
            if (!error.errors[key]) {
              throw new Error('missing error message for ' + key);
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
            expect(_message).to.contain((length || 1) + ' invalid values');
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

function mock(Model, defs) {
  return typeof Model.new !== 'function'
    ? _new(Model, defs)
    : Model.new(defs);
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
      _promise = new Promise(function (resolve) {
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
