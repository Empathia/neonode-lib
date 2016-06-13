var fs = require('fs');
var path = require('path');
var glob = require('glob');
var mkdirp = require('mkdirp');
var clc = require('cli-color');

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
      // nothing
    }
  };
}

module.exports = function(cwd) {
  var filepath = wrap(path.resolve, [cwd]),
      relative = wrap(path.relative, [cwd]);

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

  function _glob(pattern, cb) {
    var files = glob.sync(filepath(pattern));

    if (!cb) {
      return files;
    }

    cb(files);
  }

  return {
    dirname: path.dirname,
    basename: path.basename,
    filepath: filepath,
    relative: relative,
    isFile: isFile,
    isDir: isDir,
    glob: _glob,
    mkdirp: _mkdirp,
    color: clc
  };
};
