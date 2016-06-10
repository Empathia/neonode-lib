var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

function wrap(fn, args) {
  return function() {
    return fn.apply(null, args.concat(Array.prototype.slice.call(arguments)));
  };
}

function tryCall(fn, next) {
  return function() {
    try {
      return fn.apply(null, arguments)[next]();
    } catch (e) {
      console.log(e);
      // nothing
    }
  };
}

module.exports = function(cwd) {
  var filepath = wrap(path.resolve, [cwd]);

  var _isFile = tryCall(fs.statSync, 'isFile'),
      _isDir = tryCall(fs.statSync, 'isDirectory');

  function isFile() {
    return _isFile(filepath.apply(null, arguments));
  }

  function isDir() {
    return _isDir(filepath.apply(null, arguments));
  }

  function _mkdirp(filename, permissions) {
    return mkdirp.sync(filepath(filename), permissions);
  }

  return {
    dirname: path.dirname,
    filepath: filepath,
    isFile: isFile,
    isDir: isDir,
    mkdirp: _mkdirp,
  };
};
