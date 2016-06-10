var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var clc      = require('cli-color');

var dim = clc.blackBright,
    section = clc.bold,
    highlight = clc.yellow;

/* global config, logger, Class */
var Neonode = Class({}, 'Neonode')({
  prototype : {
    express           : null,
    http              : null,
    server            : null,
    io                : null,
    router            : null,
    env               : config('environment'),

    controllers : {},
    models : {},

    init : function (cwd){
      logger.info(section('Initializing application...'));

      this.util = require('../../')(cwd);
      this.express = express;
      this.http = http;

      this.app = this.express();

      this.server = this.http.createServer(this.app);

      if (process.env.NODE_REPL) {
        logger.info(dim('REPL: type .server [on|off|start|stop] to manage Express'));
      } else {
        logger.info(dim('Execute `Neonode._serverStart()` to start the server'));
      }

      return this;
    },

    _configureApp : function(){
      // *************************************************************************
      //                  Setup Thulium engine for Express
      // *************************************************************************
      logger.info(section('Setting Thulium Engine for Express...'));
      this.app.engine('html', require('thulium-express'));
      this.app.set('view engine', 'html');

      this.app.set('views', 'views');

      this.app.enable('trust proxy');

      // *************************************************************************
      //                            Static routes
      // *************************************************************************
      this.app.use('/', this.express.static('public'));

      // *************************************************************************
      //                            Request Logging
      // *************************************************************************
      this.app.use(morgan('combined', {stream: logger.stream}));

      return this;
    },

    _drawRoutes : function(routes, dispatch) {
      var router = this.express.Router();

      routes.forEach(function(route) {
        // append given Foo#bar
        if (route.to) {
          route.handler.push(route.to);
        }

        var _handler   = route.handler.join('.').split('#');
        var controller = _handler[0];
        var action     = _handler[1] || route.action;

        logger.info((route.verb.toUpperCase() + '      ').substr(0, 7) + ' ' + highlight(route.path));
        logger.info(dim('        ' + controller + '#' + action + '   -> ' + route.as + '.url()'));

        var args = dispatch ? dispatch(controller, action) : [this.controllers[controller][action]];

        // TODO: catch-all or reverse-routing
        router.route(route.path)[route.verb](args);
      }, this);

      return router;
    },

    _loadFiles : function(pattern, label, cb) {
      var files = this.util.glob(pattern);

      if (files.length) {
        logger.info(section(label));
        files.forEach(cb || function(file) {
          logger.info('  ' + this.util.relative(file));
          require(file);
        }, this);
      }

      return this;
    },

    _serverStop : function(){
      this.server.close();
      return this;
    },

    _serverStart : function(){
      this._configureApp()
          ._loadFiles('config/initializers/**/*.js', 'Loading initializers...')
          ._loadFiles('models/**/*.js', 'Loading models...')
          ._loadControllers()
          ._setupMiddlewares();

      this.server.listen(config('port'));
      logger.info(dim('Server started listening on ') + 'http://localhost:' + config('port'));
      return this;
    },

    _loadControllers : function(){
      var fixedControllers = [];

      require('../controllers/BaseController');
      require('../controllers/RestfulController');

      this._loadFiles('controllers/**/*.js', 'Loading Controllers...', function(file) {
        var fixedFile = this.util.relative(file);

        var fileNameArray = fixedFile.split('/');

        logger.info('  ' + fixedFile);

        var controller = require(file);
        var controllerName = controller.name;

        if (fileNameArray.length > 2) {
          fileNameArray.shift(1); // remove the first item of the array (controllers)
          fileNameArray.pop(1); // remove the last item of the array (filename)

          controllerName = fileNameArray.join('.') + '.' + controller.name;
        }

        fixedControllers[controllerName] = controller;
      });

      this.controllers = fixedControllers;

      return this;
    },

    _setupMiddlewares : function(){
      var middlewares = config('middlewares') || [];

      if (middlewares.length) {
        logger.info(section('Registering middlewares...'));

        middlewares.forEach(function(middleware) {
          logger.info('  ' + middleware.path + ' -> ' + middleware.name);

          var middlewareModule = require(this.util.filepath(middleware.path));

          if (typeof middlewareModule === 'function') {
            this.app.use(middlewareModule);
          }
        }, this);
      }

      return this;
    }
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
