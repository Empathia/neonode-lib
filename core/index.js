// all files are derived from here
var cwd = process.cwd();

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');

// main process
process.name = 'Neonode';

// configuration file
var configFile = path.join(cwd, 'config/config.js');

if (!fs.existsSync(configFile)) {
  throw new Error('Neonode: missing `config/config.js` file');
}

global.CONFIG = require(configFile);

// directory for logs
if (!fs.existsSync(path.join(cwd, 'log'))) {
  mkdirp.sync(path.join(cwd, 'log'), 0744);
}

global.logger = require('./support/logger');

require('neon');
require('neon/stdlib');
require('thulium'); // Ultra fast templating engine. See https://github.com/escusado/thulium

require('krypton-orm');

// *************************************************************************
//                        Error monitoring for neon
// *************************************************************************
// if (CONFIG[CONFIG.environment].enableLithium) {
//   require(__dirname, '/vendor/lithium');
// }

global.Neonode = require('./vendor/neonode');
global.NotFoundError = require('./support/error');

// Load LithiumEngine
// if (CONFIG[CONFIG.environment].enableLithium) {
//   require(path.join(process.cwd(), 'lib', 'LithiumEngine.js'));
// }

// Load RouteMapper
CONFIG.router = require(path.join(cwd, 'config', 'RouteMappings.js'));
CONFIG.router.helpers = CONFIG.router.mappings;

// Comment the following 2 lines to disable database access
var knex = require('knex')(CONFIG.database[CONFIG.environment]);
Krypton.Model.knex(knex); // Bind a knex instance to all Krypton Models

// make globally
module.exports = Neonode;
