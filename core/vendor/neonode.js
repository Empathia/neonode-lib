var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var clc      = require('cli-color');

var dim = clc.blackBright,
    section = clc.bold,
    highlight = clc.yellow;

var routeMappings = require('route-mappings');

/* global config, logger, Class, NotFoundError */
var Neonode = Class({}, 'Neonode')({
  prototype : {
    express           : null,
    http              : null,
    server            : null,
    io                : null,
    router            : null,
    env               : config('environment'),

    disableLithium: true,
    controllers : {},
    models : {},

    init : function (cwd){
      logger.info(section('Initializing application...'));

      this.util = require('../../')(cwd);
      this.express = express;
      this.http = http;

      this.app = this.express();
      this.server = this.http.createServer(this.app);

      return this;
    },

    _drawRoutes: function(routes) {
      this.router = routes(routeMappings());
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

    _bindRouteMappings : function() {
      logger.info(section('Registering routes...'));

      var matchers = [];

      this.router.routes.forEach(function(route) {
        // append given Foo#bar
        if (route.to) {
          route.handler.push(route.to);
        }

        var _handler   = route.handler.join('.').split('#');
        var controller = _handler[0];
        var action     = _handler[1] || route.action;

        // logger.info((route.verb.toUpperCase() + '      ').substr(0, 7) + ' ' + highlight(route.path));
        // logger.info(dim('        ' + controller + '#' + action + '   -> ' + route.as + '.url()'));

        matchers.push({
          controller: controller,
          action: action,
          route: route
        });
      }, this);

      var findHandler = this.router.map(matchers);
      var fixedControllers = this.controllers;
      var fixedMiddlewares = config('middlewares') || {};
      var requireMiddlewares = this._requireMiddlewares.bind(this);

      function bindRoute(params) {
        var Controller = fixedControllers[params.controller];

        if (!Controller) {
          return function (req, res, next) {
            next(new NotFoundError('Neonode: cannot load `' + params.controller + '` controller'));
          };
        }

        var fixedName = Controller.name || Controller.className;

        // prepend custom middlewares per route
        return requireMiddlewares(params.route.middleware || Controller.middleware || [], fixedMiddlewares)
          .concat(function (req, res, next) {
            var cb = Controller.__handler || (Controller.__handler = fixedName ? new Controller() : Controller)

            cb[params.action].apply(cb, arguments);
          });
      }

      // IoC for route-mappings and controllers
      findHandler().forEach(function(cb) {
        this.app[cb.route.verb](cb.route.path, bindRoute(cb));
      }, this);

      this.app.use(function (req, res, next) {
        next(new NotFoundError('Neonode: cannot resolve `' + req.path + '` path'));
      });

      return this;
    },

    _bindCatchAllHandler: function() {
      // built-in error handling
      this.app.use(function(err, req, res, next) {
        logger.error(err.stack || err.toString());

        switch (err.name) {
          case 'NotFoundError':
            res.status(404).render('shared/404.html', {
              message: err.message,
              layout: false
            });
          break;

          case 'ForbiddenError':
            res.status(403).render('shared/500.html', {
              layout: false,
              error: err.stack
            });
          break;

          default:
            res.status(500).format({
              html: function () {
                res.render('shared/500.html', {
                  layout: false,
                  error: 'Error:\n\n' + JSON.stringify(err) + '\n\nStack:\n\n' + err.stack
                });
              },
              json: function () {
                res.json(err);
              }
            });
          break;
        }
      });

      return this;
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
      try {
        this._configureApp()
          ._loadFiles('config/initializers/**/*.js', 'Loading initializers...')
          ._loadFiles('models/**/*.js', 'Loading models...')
          ._loadControllers()
          ._setupMiddlewares()
          ._bindRouteMappings()
          ._bindCatchAllHandler();

        this.server.listen(config('port'));
        logger.info(dim('Server started listening on ') + 'http://localhost:' + config('port'));
      } catch (e) {
        logger.error(e);
      }

      return this;
    },

    _loadControllers : function(){
      var fixedControllers = {};

      require('../controllers/BaseController');
      require('../controllers/RestfulController');

      this._loadFiles('controllers/**/*.js', 'Loading Controllers...', function(file) {
        var fixedFile = this.util.relative(file);

        var fileNameArray = fixedFile.split('/');

        logger.info('  ' + fixedFile);

        var ClassOrController = require(file);
        var controllerName;

        // Neon support
        if (ClassOrController.className && typeof ClassOrController.constructor === 'function') {
          controllerName = ClassOrController.className;
        } else {
          if (!ClassOrController.name) {
            throw new Error('Neonode: controller `' + ClassOrController + '` cannot be anonymous');
          }

          controllerName = ClassOrController.name;
        }

        if (fileNameArray.length > 2) {
          fileNameArray.shift(1); // remove the first item of the array (controllers)
          fileNameArray.pop(1); // remove the last item of the array (filename)

          controllerName = fileNameArray.join('.') + '.' + controllerName;
        }

        fixedControllers[controllerName.replace(/Controller$/, '')] = ClassOrController;
      });

      this.controllers = fixedControllers;

      return this;
    },

    // flatten and require middleware lists
    _requireMiddlewares: function (map, middlewares) {
      var list = [];

      map.forEach(function (name) {
        if (middlewares[name]) {
          Array.prototype.push.apply(list, this._requireMiddlewares(middlewares[name], middlewares))
        } else if (list.indexOf(name) === -1) {
          if (!this._middlewares[name]) {
            throw new Error('Neonode: unknown `' + name + '` middleware');
          }

          list.push(require(this._middlewares[name]));
        }
      }, this);

      return list;
    },

    _setupMiddlewares : function(){
      logger.info(section('Loading middlewares...'));

      this._middlewares = require('../middlewares');

      this.util.glob('middlewares/**/*.js').forEach(function (file) {
        // override middlewares
        this._middlewares[this.util.basename(file, '.js')] = file;

        logger.info('  ' + this.util.relative(file));
      }, this);

      // main application middlewares
      var middlewares = config('middlewares') || {};

      this.app.use(this._requireMiddlewares(middlewares.http || [], middlewares));

      return this;
    }
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
