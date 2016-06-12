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

    _bindRouteMappings : function(routes) {
      logger.info(section('== RouteMappings'));

      var matchers = [];

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

        matchers.push({
          controller: controller,
          action: action,
          route: route
        });
      }, this);

      return this.router.map(matchers);
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

        var ClassOrController = require(file);
        var controllerName;
        var controller;

        // TODO: lazily load this modules?
        if (ClassOrController.className && typeof ClassOrController.constructor === 'function') {
          controllerName = ClassOrController.className.replace('Controller', '');
          controller = function() {
            if (!controller.__instance) {
              controller.__instance = new ClassOrController();
            }
            return controller.__instance;
          };
        } else {
          if (!ClassOrController.name) {
            throw new Error('Neonode: controller `' + ClassOrController + '` cannot be anonymous');
          }

          controllerName = ClassOrController.name;
          controller = function() {
            return ClassOrController;
          };
        }

        if (fileNameArray.length > 2) {
          fileNameArray.shift(1); // remove the first item of the array (controllers)
          fileNameArray.pop(1); // remove the last item of the array (filename)

          controllerName = fileNameArray.join('.') + '.' + controllerName;
        }

        fixedControllers[controllerName] = controller;
      });

      this.controllers = fixedControllers;

      return this;
    },

    _setupMiddlewares : function(){
      logger.info(section('Loading middlewares...'));

      var fixedMiddlewares = require('../middlewares');

      this.util.glob('middlewares/**/*.js').forEach(function (file) {
        // override middlewares
        fixedMiddlewares[this.util.basename(file, '.js')] = file;

        logger.info('  ' + this.util.relative(file));
      }, this);

      var middlewares = config('middlewares') || {};

      // IoC for route-mappings and controllers
      var findHandler = this._bindRouteMappings(this.router.routes);

      var seen = {},
          self = this,
          app = this.app;

      // flatten and require middleware lists
      function requireMiddlewares(map) {
        var list = [];

        map.forEach(function (name) {
          if (middlewares[name]) {
            Array.prototype.push.apply(list, requireMiddlewares(middlewares[name]))
          } else if (list.indexOf(name) === -1) {
            if (!fixedMiddlewares[name]) {
              throw new Error('Neonode: unknown `' + name + '` middleware');
            }

            list.push(require(fixedMiddlewares[name]));
          }
        });

        return list;
      }

      function bindRoute(params) {
        var factoryController = self.controllers[params.controller];
        var controller = factoryController();

        // prepend custom middlewares per route
        return requireMiddlewares(controller.constructor.use || [])
          .concat(controller[params.action]);
      }

      // app-level middlewares and route-dispatcher
      app.use(requireMiddlewares(middlewares.http || []).concat(function (req, res, next) {
        if (seen[req.path]) {
          return next();
        }

        logger.info(dim('Resolving `' + req.path + '` path...'));

        var matches = findHandler(req.path);

        if (!matches.length) {
          return next(new NotFoundError('Neonode: cannot resolve `' + req.path + '` path'));
        }

        var cb = matches[0];

        if (self.controllers[cb.controller]) {
          var name = cb.controller + '.' + cb.action;

          logger.info(highlight(name) + dim(' was found, binding...'));

          try {
            app[cb.route.verb](cb.route.path, bindRoute(cb));
          } catch (e) {
            logger.error(highlight(name) + dim(' cannot be bound...'));
            return next(e);
          }

          logger.info(highlight(name) + dim(' now responds to ') + highlight(cb.route.path));
        }

        // short-circuit
        seen[req.path] = 1;

        next();
      }));

      // built-in error handling
      app.use(function(err, req, res, next) {
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
    }
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
