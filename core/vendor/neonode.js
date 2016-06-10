var glob     = require('glob');
var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var path     = require('path');

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
      logger.info('Initializing application...');

      this.util = require('../../')(cwd);
      this.express = express;
      this.http = http;

      this.app = this.express();

      this.server = this.http.createServer(this.app);

      return this;
    },

    _configureApp : function(){
      // *************************************************************************
      //                  Setup Thulium engine for Express
      // *************************************************************************
      logger.info('Setting Thulium Engine for Express...');
      this.app.engine('html', require('thulium-express'));
      this.app.set('view engine', 'html');

      this.app.set('views', 'views');

      this.app.enable("trust proxy");

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

    _loadFiles : function(pattern, label, cb) {
      var files = this.util.glob(pattern);

      if (files.length) {
        logger.info(label);
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
      logger.info('Server started listening on http://localhost:' + config('port'));
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
        logger.info('Registering middlewares...');

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
