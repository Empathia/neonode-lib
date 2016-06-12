// all files are derived from here
var cwd = process.cwd();

var util = require('../')(cwd);

var exit = process.exit.bind(process);

// TODO: this value should be used to increase log level?
var hasREPL = typeof window !== 'undefined' || process.argv.indexOf(util.filepath('bin/repl.js')) > -1;

// main process
process.name = 'Neonode';

// configuration file
var configFile = 'config/config.js';

if (!util.isFile(configFile)) {
  console.error('Missing `' + configFile + '` file');
  exit(1);
}

// private
var SETTINGS = {};

/* global logger, Krypton */

function config(key, value) {
  var parts = key.split('.');
  var prop = parts.shift();
  var obj = (SETTINGS[SETTINGS.environment] || {})[prop] || (SETTINGS[prop]) || null;

  try {
    while (parts.length) {
      obj = obj[parts.shift()];
    }
  } catch (e) {
    (logger || console).warn('Cannot read `' + key  + '` from ' + configFile);
  }

  return typeof obj !== 'undefined' ? obj : value;
}

try {
  SETTINGS = require(util.filepath(configFile));

  // CONFIG is too verbose
  if (!global.hasOwnProperty('CONFIG')) {
    Object.defineProperty(global, 'CONFIG', {
      get: function() {
        (logger || console).warn('CONFIG is deprecated, use `config()` instead');
        return SETTINGS;
      }
    });
  }
} catch (e) {
  (logger || console).error('Error loading `' + configFile + '` file');
  (logger || console).error(e.stack);
  exit(1);
}

var logDir = util.dirname(config('logFile'));

if (!util.isDir(logDir)) {
  util.mkdirp(logDir, 0744);
}

// exports global stuff
global.config = config;

// logger interface
global.logger = require('./support/logger');

// neon core
require('neon');
require('neon/stdlib');

// database first
require('krypton-orm');

// support disable database access
var db = config('database');

if (!(!db || db.disabled)) {
  // Bind a knex instance to all Krypton Models
  Krypton.Model.knex(require('knex')(db));
}

// Ultra fast templating engine. See https://github.com/escusado/thulium
require('thulium');

// *************************************************************************
//                        Error monitoring for neon
// *************************************************************************
if (hasREPL || config('enableLithium')) {
  require('./vendor/lithium');
  require('./support/lithium');
}

// standard interfaces
var Neonode = global.Neonode = module.exports = require('./vendor/neonode')(cwd);


// Custom Errors
function NotFoundError(message) {
  this.name = 'NotFoundError';
  this.message = message || 'Not Found';
}

NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.constructor = NotFoundError;

global.NotFoundError = NotFoundError;

// route definitions factory
Neonode._drawRoutes(require(util.filepath('config/routeMappings.js')));
