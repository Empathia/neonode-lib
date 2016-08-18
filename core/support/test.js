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
    .forEach((file) => {
      if (file.toLowerCase().indexOf(filter) > -1) {
        mocha.addFile(file);
      }
    });

  // run Mocha
  mocha.run((failures) => {
    process.on('exit', () => {
      process.exit(failures);
    });

    process.exit();
  });

});

// common helper
function fetch(resource) {
  var args = Array.prototype.slice.call(arguments, 1);

  var _promise = new Bluebird(function (resolve, reject) {
    var url = config('siteURL') + resource.url.call(null, args);

    sa.agent()[resource.verb](url)
      .set('Accept', 'text/html')
      .end(function (err, res) {
        if (err) {
          reject(err);
        } else {
          resolve(res);
        }
      });
  });

  var _stack = [];

  var _it = function (done) {
    try {
      _promise.then(function (res) {
        _stack.forEach(function (cb) {
          cb(res);
        });

        done();
      });
    } catch (e) {
      done(e);
    }
  };

  _it.ok = function (_code) {
    _stack.push(function (res) {
      expect(res.ok).to.equal(true);
      expect(res.status).to.equal(_code || 200);
    });

    return _it;
  };

  _it.fail = function (_code) {
    _stack.push(function (res) {
      expect(res.error).to.equal(true);
      expect(res.status).to.equal(_code || 500);
    });

    return _it;
  };

  return _it;
};
