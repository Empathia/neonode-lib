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
        // experimental feedback...
        var source = (new Error()).stack.split('\n')[2].trim().split(' ')[2];

        (logger || console).warn('CONFIG is deprecated, use `config()` instead ' + source);

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

// route definitions factory
Neonode._drawRoutes(require(util.filepath('config/routeMappings.js')));

// shortcut helpers
if (!global.hasOwnProperty('urlFor')) {
  Object.defineProperty(global, 'urlFor', {
    get: function () {
      return Neonode._fixedMappings;
    }
  });
}

// database access
var db = config('database');

if (!global.hasOwnProperty('knex')) {
  Object.defineProperty(global, 'knex', {
    get: function () {
      // always return a fresh connection
      return require('knex')(db);
    }
  });
}

if (!(!db || db.disabled)) {
  // Bind a knex instance to all Krypton Models
  Krypton.Model.knex(knex);
}

// errors
require('./support/errors');
