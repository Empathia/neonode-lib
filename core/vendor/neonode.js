var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var clc      = require('cli-color');

var advisable = require('advisable'),
    routeMappings = require('route-mappings');

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
    advisables : {},
    models : {},

    init : function (cwd){
      logger.info(clc.bold('Initializing application...'));

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
      logger.info(clc.bold('Setting Thulium Engine for Express...'));
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
      logger.info(clc.bold('Registering routes...'));

      var matchers = [];

      this.router.routes.forEach(function(route) {
        // append given Foo#bar
        if (route.to) {
          route.handler.push(route.to);
        }

        var _handler   = route.handler.join('.').split('#');
        var controller = _handler[0];
        var action     = _handler[1] || route.action;

        matchers.push({
          controller: controller,
          action: action,
          route: route
        });
      }, this);

      this._fixedMatchers = matchers;

      var findHandler = this.router.map(matchers);
      var fixedAdvisables = this.advisables;
      var fixedControllers = this.controllers;
      var fixedMiddlewares = config('middlewares') || {};
      var requireMiddlewares = this._requireMiddlewares.bind(this);

      function bindRoute(params) {
        var Controller = fixedControllers[params.controller];

        if (!Controller) {
          return function (req, res, next) {
            next(new NotFoundError('Neonode: controller for `'
              + params.controller + '.' + params.action + '` is missing'));
          };
        }

        function dispatchRoute() {
          if (!Controller.__handler) {
            Controller.__handler = typeof Controller === 'function' ? new Controller() : Controller;

            if (fixedAdvisables[params.controller]) {
              Object.keys(Controller.prototype).forEach(function (prop) {
                // TODO: advisable-prop, blacklist or whitelist?
                if (prop.charAt() !== '_' && prop !== 'constructor' && prop !== 'init') {
                  Controller.__handler[prop] = advisable(Controller.__handler[prop]);
                }
              });

              fixedAdvisables[params.controller](Controller.__handler);
            }
          }

          Controller.__handler[params.action].apply(Controller.__handler, arguments);
        }

        // prepend custom middlewares per route
        return requireMiddlewares(params.route.middleware || [], fixedMiddlewares).concat(dispatchRoute);
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
        logger.info(clc.bold(label));
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
          ._loadFiles('lib/initializers/**/*.js', 'Loading initializers...')
          ._loadFiles('models/**/*.js', 'Loading models...')
          ._loadControllers()
          ._setupMiddlewares()
          ._bindRouteMappings()
          ._bindCatchAllHandler();

        this.server.listen(config('port'));
        logger.info(clc.blackBright('Server started listening on ') + 'http://localhost:' + config('port'));
      } catch (e) {
        logger.error(e);
      }

      return this;
    },

    _loadControllers : function(){
      require('../controllers/BaseController');
      require('../controllers/RestfulController');

      this._loadFiles('controllers/**/*.js', 'Loading Controllers...', function(file) {
        var fixedFile = this.util.relative(file);
        var fileNameArray = fixedFile.split('/');

        logger.info('  ' + fixedFile);

        var ClassOrController = require(file);
        var controllerName;

        // Neon support
        if ((ClassOrController.className || ClassOrController.constructor.className) && typeof ClassOrController.constructor === 'function') {
          controllerName = ClassOrController.className || ClassOrController.constructor.className;
        } else {
          if (!ClassOrController.name) {
            throw new Error('Neonode: controller `' + ClassOrController + '` cannot be anonymous');
          }

          controllerName = ClassOrController.name || ClassOrController.constructor.name;
        }

        if (fileNameArray.length > 2) {
          fileNameArray.shift(1); // remove the first item of the array (controllers)
          fileNameArray.pop(1); // remove the last item of the array (filename)

          controllerName = fileNameArray.join('.') + '.' + controllerName;
        }

        // initializers support
        var initFile = this.util.filepath('lib/initializers', controllerName + '.js');

        controllerName = controllerName.replace(/Controller$/, '');

        if (this.util.isFile(initFile)) {
          this.initializers[controllerName] = require(initFile);
        }

        this.controllers[controllerName] = ClassOrController;
      });

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
      logger.info(clc.bold('Loading middlewares...'));

      this._middlewares = require('../middlewares');

      this.util.glob('middlewares/**/*.js').forEach(function (file) {
        // override middlewares
        this._middlewares[this.util.basename(file, '.js')] = file;

        logger.info('  ' + this.util.relative(file));
      }, this);

      return this;
    }
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
