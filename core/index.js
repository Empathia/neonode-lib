// all files are derived from here
var cwd = process.cwd();

var util = require('../')(cwd);

var exit = process.exit.bind(process);

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

function config(key) {
  return (SETTINGS[SETTINGS.environment] || {})[key] || (SETTINGS[key]) || null;
}

try {
  SETTINGS = require(util.filepath(configFile));

  // CONFIG is too verbose
  Object.defineProperty(global, 'CONFIG', {
    get: function() {
      console.warn('CONFIG is deprectaed, use `config()` instead');
      return SETTINGS;
    }
  });
} catch (e) {
  console.error('Error loading `config/config.js` file');
  console.error(e.stack);
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
if (config('enableLithium')) {
  require('./vendor/lithium');
  require('./support/lithium');
}

// standard interfaces
var Neonode = global.Neonode = module.exports = require('./vendor/neonode');

global.NotFoundError = require('./support/error');

// Load RouteMapper
Neonode.router = require(util.filepath('config/RouteMappings.js'));
Neonode.router.helpers = Neonode.router.mappings;
