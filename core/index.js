var path  = require('path');
var cwd   = process.cwd();
var fs    = require('fs');
var mkdirp = require('mkdirp');

var configFile = path.join(cwd, '/config/config.js');

global.CONFIG = require(configFile);

if (!fs.existsSync(path.join(cwd, '/log'))) {
    mkdirp.sync(path.join(cwd, '/log'), 0744);
}

global.logger = require('./support/logger');

require('neon');
require('neon/stdlib');
require('thulium'); // Ultra fast templating engine. See https://github.com/escusado/thulium

require('krypton-orm');

// *************************************************************************
//                        Error monitoring for neon
// *************************************************************************
if (CONFIG[CONFIG.environment].enableLithium) {
  require(__dirname, '/vendor/lithium');
}

global.Neonode = require('./vendor/neonode');

// Custom Errors
global.NotFoundError = function NotFoundError(message) {
  this.name = 'NotFoundError';
  this.message = message || 'Not Found';
}

NotFoundError.prototype = Object.create(Error.prototype);
NotFoundError.prototype.constructor = NotFoundError;

// Load LithiumEngine
if (CONFIG[CONFIG.environment].enableLithium) {
  require(path.join(process.cwd(), 'lib', 'LithiumEngine.js'));
}

// Load RouteMapper
CONFIG.router = require(path.join(process.cwd(), 'config', 'RouteMappings.js'));
CONFIG.router.helpers = CONFIG.router.mappings;

// Comment the following 2 lines to disable database access
var knex = require('knex')(CONFIG.database[CONFIG.environment]);
Krypton.Model.knex(knex); // Bind a knex instance to all Krypton Models
