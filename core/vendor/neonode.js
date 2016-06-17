var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var clc      = require('cli-color');

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

    _disableLithium: true,
    controllers : {},
    models : {},

    init : function (cwd){
      logger.info(clc.bold('Initializing application...'));

      // read only
      Object.defineProperty(this, 'cwd', {
        get: function () {
          return cwd;
        }
      });

      this._util = require('../../')(cwd);
      this.express = express;
      this.http = http;

      return this;
    },

    _drawRoutes: function(routes) {
      this.router = routes(routeMappings());

      this._fixedRoutes = this.router.routes;
      this._fixedMappings = this.router.mappings;
      this._fixedResources = {};

      // compile all known resources for other purposes
      this._fixedRoutes.forEach(function (route) {
        if (route.action) {
          // TODO: what about the handler namespacing?
          var key = route.handler[route.handler.length - 1];

          if (!this._fixedResources[key]) {
            this._fixedResources[key] = {};
          }

          var obj = this._fixedResources[key];

          if (!obj[route.action]) {
            obj[route.action] = route;
          }
        }
      }, this);

      return this;
    },

    _configureApp : function(){
      this.app = this.express();
      this.server = this.http.createServer(this.app);

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

      this._fixedRoutes.forEach(function(route) {
        // append given Foo#bar
        var _handler = route.handler.slice().concat(route.to ? [route.to] : []);

        var _handler   = _handler.join('.').split('#');
        var controller = _handler[0];
        var action     = _handler[1] || route.action;

        matchers.push({
          controller: controller,
          action: action,
          route: route
        });
      }, this);

      var _handlers = {};
      var _isRepl = this._REPL;

      var findHandler = this.router.map(matchers);
      var fixedControllers = this.controllers;
      var fixedMiddlewares = config('middlewares') || {};
      var requireMiddlewares = this._requireMiddlewares.bind(this);

      function bindRoute(params) {
        var Controller = fixedControllers[params.controller];

        if (!Controller) {
          throw new Error('Neonode: handler for `' + params.controller + '` is missing');
        }

        function dispatchRoute(req, res, next) {
          if (!_handlers[params.controller]) {
            _handlers[params.controller] = typeof Controller === 'function' ? new Controller() : Controller;
          }

          var controllerInstance = _handlers[params.controller],
              controllerMethod = controllerInstance[params.action];

          if (params.route.action && !controllerMethod) {
            return next(new NotFoundError('Neonode: handler for `' + params.controller + '.' + params.action + '` is missing'));
          }

          // always merge some locals regardless of loaded middlewares
          res.locals.layout = res.locals.layout || Controller.layout || controllerInstance.layout || controllerInstance.constructor.layout;

          // store references for interactive debug (experimental)
          if (_isRepl) {
            global.req = req;
            global.res = res;
          }

          try {
            controllerMethod.call(controllerInstance, req, res, next);
          } catch (e) {
            next(new NotFoundError('Neonode: handler for `' + params.controller + '.' + params.action + '` cannot be executed', e));
          }
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
      var fixedErrors = {
        NotImplemented: 501,
        ForbiddenError: 403,
        NotFoundError: 404
      };

      // built-in error handling
      this.app.use(function(err, req, res, next) {
        var status = fixedErrors[err.name] || 500;
        var type = status.toString().charAt() === '5' ? 'error' : 'warn';

        logger[type](err.message || err.toString());

        if (err.stack) {
          logger[type](err.stack);
        }

        res.status(status).render('shared/' + status + '.html', {
          layout: false,
          error: err
        });
      });

      return this;
    },

    _loadFiles : function(pattern, label, cb) {
      var files = this._util.glob(pattern);

      if (files.length) {
        logger.info(clc.bold(label));
        files.forEach(cb || function(file) {
          logger.info('  ' + this._util.relative(file));
          require(file);
        }, this);
      }

      return this;
    },

    _serverStop : function(){
      if (this.server) {
        this.server.close();
      }
      return this;
    },

    _serverStart : function(){
      try {
        this._configureApp()
          ._loadFiles('lib/boot/**/*.js', 'Loading boot files...')
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
        var fixedFile = this._util.relative(file);
        var fileNameArray = fixedFile.split('/');

        var ClassOrController = require(file);
        var controllerName;

        // Neon support
        if ((ClassOrController.className || ClassOrController.constructor.className) && typeof ClassOrController.constructor === 'function') {
          controllerName = ClassOrController.className || ClassOrController.constructor.className;
        } else {
          controllerName = ClassOrController.name || ClassOrController.constructor.name;
        }

        if (!controllerName) {
          throw new Error('Neonode: controller `' + fixedFile + '` cannot be anonymous');
        }

        if (controllerName === 'Object') {
          controllerName = fileNameArray[fileNameArray.length - 1].replace('.js', '');
        }

        if (fileNameArray.length > 2) {
          fileNameArray.shift(1); // remove the first item of the array (controllers)
          fileNameArray.pop(1); // remove the last item of the array (filename)

          controllerName = fileNameArray.join('.') + '.' + controllerName;
        }

        controllerName = controllerName.replace(/Controller$/, '');

        this.controllers[controllerName] = ClassOrController;

        logger.info('  ' + fixedFile);
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

      this._util.glob('middlewares/**/*.js').forEach(function (file) {
        // override middlewares
        this._middlewares[this._util.basename(file, '.js')] = file;

        logger.info('  ' + this._util.relative(file));
      }, this);

      return this;
    }
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
