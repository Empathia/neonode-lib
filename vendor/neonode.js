var path  = require('path');
var express  = require('express');
var http     = require('http');
var morgan   = require('morgan');
var clc      = require('cli-color');

var routeMappings = require('route-mappings');

function getProp(key, from, value) {
  var obj = from;
  var keys = key.split('.');

  try {
    while (keys.length) {
      obj = obj[keys.shift()];
    }
  } catch (e) {
    obj = value;
  }

  if (typeof obj === 'undefined') {
    return value;
  }

  return obj;
}

/* global config, logger, Class, NotFoundError, NotImplemented, UndefinedRoleError, Promise, Sc */
var Neonode = Class({}, 'Neonode')({
  prototype : {
    express           : null,
    http              : null,
    server            : null,
    io                : null,
    router            : null,
    env               : config('environment'),

    _requiredFiles: [],
    _initializers: [],

    controllers : {},
    models : {},
    acl : {},

    init : function (cwd){
      // logger.info(clc.bold('Initializing application...'));

      // read only
      Object.defineProperty(this, 'cwd', {
        get: function () {
          return cwd;
        }
      });

      this._util = require('..')(cwd);

      return this;
    },

    _require: function(file) {
      try {
        var _module = require(file);

        if (file.indexOf(this.cwd) === 0 &&
          file.indexOf('node_modules') === -1 &&
          this._requiredFiles.indexOf(file) === -1) {
          this._requiredFiles.push(path.relative(this.cwd, file));
        }

        return _module;
      } catch (e) {
        logger.error(e.stack || e.message || e.toString());
      }
    },

    _initializeApp: function() {
      this._initializers.forEach(function(cb) {
        cb();
      });

      return this;
    },

    _initialize: function (cb) {
      if (cb) {
        this._initializers.push(cb.bind(this));
      }

      return this;
    },

    _drawRoutes: function(routes) {
      this.router = routes(routeMappings());

      this._fixedRoutes = this.router.routes;
      this._fixedMappings = this.router.mappings;
      this._fixedResources = {};

      // compile all known resources for other purposes
      this._fixedRoutes.forEach(function (route) {
        if (route._isAction) {
          // TODO: what about the handler namespacing?
          var key = route.handler[route.handler.length - 2];

          if (!this._fixedResources[key]) {
            this._fixedResources[key] = {};
          }

          var obj = this._fixedResources[key];

          if (!obj[route._actionName]) {
            obj[route._actionName] = route;
          }
        }
      }, this);

      return this;
    },

    _configureApp : function(){
      this.express = express;
      this.http = http;
      this.app = this.express();
      this.server = this.http.createServer(this.app);

      // *************************************************************************
      //                  Setup Thulium engine for Express
      // *************************************************************************
      logger.info(clc.bold('Setting Thulium Engine for Express...'));
      this.app.engine('html', require('thulium-express'));
      this.app.set('view engine', 'html');

      this.app.set('views', ['views', 'views/build']);

      this.app.enable('trust proxy');

      // *************************************************************************
      //                            Static routes
      // *************************************************************************
      this.app.use('/', this.express.static('public'));

      // *************************************************************************
      //                            Request Logging
      // *************************************************************************

      if (config('environment') !== 'test') {
        this.app.use(morgan('combined', {stream: logger.stream}));
      }

      return this;
    },

    _bindRouteMappings : function() {
      logger.info(clc.bold('Registering routes...'));

      var matchers = [];

      this._fixedRoutes.forEach(function(route) {
        var _handler = route.handler.slice();

        var action     = route._actionName || _handler.pop();
        var controller = route._resourceName || _handler.pop();

        matchers.push({
          controller: controller,
          action: action,
          route: route
        });
      }, this);

      var _isDebug = config('debug') === false ? false :
        config('environment') === 'development' || config('debug');

      var _handlers = {};
      var fixedACL = this.acl;
      var findHandler = this.router.map(matchers);
      var fixedControllers = this.controllers;
      var fixedMiddlewares = config('middlewares') || {};
      var requireMiddlewares = this._requireMiddlewares.bind(this);

      function bindRoute(params) {
        var Controller = fixedControllers[params.controller];

        if (!Controller) {
          throw new Error('handler for `' + params.controller + '` is missing');
        }

        function dispatchRoute(req, res, next) {
          if (!_handlers[params.controller]) {
            _handlers[params.controller] = typeof Controller === 'function' ? new Controller() : Controller;
          }

          var controllerInstance = _handlers[params.controller],
              controllerMethod = controllerInstance[params.action];

          if (params.route.action && !controllerMethod) {
            return next(new NotImplemented('handler for `' + params.controller + '.' + params.action + '` is missing'));
          }

          // attach router info
          req.handler = params;

          // always merge some locals regardless of loaded middlewares
          res.locals.layout = res.locals.layout || Controller.layout || controllerInstance.layout || controllerInstance.constructor.layout;

          // disable cache
          if (Controller.nocache || controllerInstance.nocache || controllerInstance.constructor.nocache) {
            res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
            res.header('Expires', '-1');
            res.header('Pragma', 'no-cache');
          }

          if (req.headers['x-requested-with'] === 'XMLHttpRequest') {
            res.locals.layout = false;
            req.isXMLHttpRequest = true;
            res.locals.isXMLHttpRequest = true;
          }

          if (!req.session) {
            throw new Error('Sessions are required');
          }

          if (!req.isXMLHttpRequest && req.method === 'GET') {
            req.session._refererUrl = req.headers.referer;
            req.session._previousUrl = req.url;
          }

          var _url;
          var _next;
          var _result;

          if (req.body._url) {
            _url = req.body._url;
            delete req.body._url;
          }

          if (!req.isXMLHttpRequest && req.session._back) {
            _url = req.session._back;
            delete req.session._back;
          }

          var _failure = req.session._failure || {};
          var _old = _failure.old || {};
          var _err;

          delete _failure.old;
          delete req.session._failure;

          function _get(prop, value) {
            if (!prop) {
              return _old;
            }

            return getProp(prop, _old, value || '');
          }

          // normalize all given errors
          function _fix(error) {
            if (error.errors) {
              if (!Array.isArray(error.errors)) {
                error.errors = Object.keys(error.errors)
                  .map(function (_key) {
                    return { field: _key, failure: error.errors[_key] };
                  });
              }

              return error.errors.map(function (err) {
                return _fix(err)[0];
              });
            }

            return [{
              stack: _isDebug && error.stack || undefined,
              field: error.field || undefined,
              failure: error.failure || undefined,
              message: error.message || error.description || error
            }];
          }

          if (_failure.description || (_failure.errors && _failure.errors.length)) {
            _err = _failure;
          }

          // shortcuts
          req.old = _get;
          req.failure = _err;
          req.redirectUrl = _url;

          res.locals.old = _get;
          res.locals.failure = _err;
          res.locals.redirectUrl = _url;

          res.locals.currentUrl = req.url; // query is required
          res.locals.previousUrl = req.session._previousUrl;

          try {
            _result = controllerMethod.call(controllerInstance, req, res, function (e) {
              _next = e;
            });
          } catch (e) {
            if (!controllerMethod) {
              _next = new NotImplemented('expecting method for ' + params.controller + '.' + params.action + ', given `' + controllerMethod + '`');
            } else {
              _next = e;
            }
          }

          return (_next ? Promise.reject(_next) : Promise.resolve(_result))
            .catch(function (error) {
              req.session._failure = {
                description: error.label || error.name,
                errors: _fix(error),
                old: req.body
              };

              if (!req.redirectUrl) {
                next(error);
              } else {
                res.redirect(req.redirectUrl);
              }
            });
        }

        var fixedPipeline = requireMiddlewares(params.route.middleware || [], fixedMiddlewares, params.route.skip);

        // append built middleware for this resource
        if (fixedACL.resources && fixedACL.resources[params.route._resourceName]) {
          fixedPipeline.push(function (req, res, next) {
            // health-check
            if (typeof req.role === 'undefined') {
              next(new UndefinedRoleError('missing `req.role` when accessing `' + params.route._resourceName + '` resource'));
            } else {
              next();
            }
          });

          var _acl = fixedACL.middlewares[params.route._resourceName][params.route._actionName];

          if (_acl) {
            fixedPipeline.push(_acl);
          }
        }

        // prepend custom middlewares per route
        return fixedPipeline.concat(dispatchRoute);
      }

      // default middleware for Express
      if (fixedMiddlewares.http) {
        var _appMiddleware = requireMiddlewares(['http'], fixedMiddlewares);

        if (_appMiddleware.length) {
          this.app.use(_appMiddleware);
        }
      }

      // IoC for route-mappings and controllers
      findHandler().forEach(function(cb) {
        this.app[cb.route.verb](cb.route.path, bindRoute(cb));
      }, this);

      this.app.use(function (req, res, next) {
        next(new NotFoundError('cannot resolve `' + req.method.toUpperCase() + ' ' + req.path + '` path'));
      });

      return this;
    },

    _bindCatchAllHandler: function() {
      var fixedErrors = {
        NotImplemented: 501,
        ForbiddenError: 403,
        NotFoundError: 404,
        ServerError: 500
      };

      var errorHandler;
      var fixedControllers = this.controllers;

      // built-in error handling
      this.app.use(function(err, req, res, next) {
        var status = fixedErrors[err.name] || 500;
        var type = status.toString().charAt() === '5' ? 'error' : 'warn';

        logger[type](err.message || err.toString());

        if (!err.status) {
          err.status = status;
        }

        if (err.stack) {
          logger[type](err.stack);
        }

        if (req.session) {
          delete req.session._failure;
        }

        function fail(_err) {
          res.status(status).render('shared/error.html', {
            statusCode: status,
            layout: false,
            _next: next,
            error: _err
          });
        }

        if (fixedControllers.Error) {
          var ErrorController = fixedControllers.Error;

          if (!errorHandler) {
            errorHandler = typeof ErrorController === 'function' ? new ErrorController() : ErrorController;
          }

          if (typeof errorHandler.render === 'function') {
            try {
              Promise
                .resolve(errorHandler.render(err, req, res, function (_err) {
                  if (_err) {
                    fail(_err);
                  } else {
                    next();
                  }
                }))
                .catch(fail);
            } catch (_e) {
              fail(_e);
            }
          }
        } else {
          fail(err);
        }
      });

      return this;
    },

    _loadFiles : function(pattern, label, cb) {
      var files = this._util.glob(pattern);

      if (files.length) {
        logger.info(clc.bold(label));
        files.forEach(cb || function(file) {
          this._require(file);
          logger.info('  ' + this._util.relative(file));
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
        this
          ._configureApp()
          ._loadFiles('lib/boot/**/*.js', 'Loading boot files...')
          ._loadFiles('models/**/*.js', 'Loading models...')
          ._loadMailers()
          ._initializeApp()
          ._loadControllers()
          ._setupMiddlewares()
          ._setupScandiumACL()
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
      require('../core/controllers/BaseController');
      require('../core/controllers/RestfulController');

      this._loadFiles('controllers/**/*.js', 'Loading Controllers...', function(file) {
        var fixedFile = this._util.relative(file);
        var fileNameArray = fixedFile.split('/');

        var ClassOrController = this._require(file);
        var controllerName;

        // Neon support
        if ((ClassOrController.className || ClassOrController.constructor.className) && typeof ClassOrController.constructor === 'function') {
          controllerName = ClassOrController.className || ClassOrController.constructor.className;
        } else {
          controllerName = ClassOrController.name || ClassOrController.constructor.name;
        }

        if (!controllerName) {
          throw new Error('controller `' + fixedFile + '` cannot be anonymous');
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
    _requireMiddlewares: function (map, middlewares, skippedMiddlewares) {
      var list = [];

      map.forEach(function (name) {
        if (skippedMiddlewares && skippedMiddlewares.indexOf(name) > -1) {
          return;
        }

        if (middlewares[name]) {
          Array.prototype.push.apply(list, this._requireMiddlewares(middlewares[name], middlewares, skippedMiddlewares));
        } else if (list.indexOf(name) === -1) {
          if (!this._middlewares[name]) {
            throw new Error('unknown `' + name + '` middleware');
          }

          var middleware = this._require(this._middlewares[name]);

          if (Array.isArray(middleware)) {
            Array.prototype.push.apply(list, middleware);
          } else {
            list.push(middleware);
          }
        }
      }, this);

      return list;
    },

    _setupMiddlewares : function(){
      logger.info(clc.bold('Loading Middlewares...'));

      this._middlewares = this._require('../core/middlewares');

      this._util.glob('middlewares/**/*.js').forEach(function (file) {
        // override middlewares
        this._middlewares[this._util.basename(file, '.js')] = file;

        logger.info('  ' + this._util.relative(file));
      }, this);

      return this;
    },

    _setupScandiumACL: function () {
      var _acl = require('../support/acl');

      // main ACL setup
      var aclIndex = this._util.filepath('lib/ACL/index.js');

      if (this._util.isFile(aclIndex)) {
        logger.info(clc.bold('Loading ACL support...'));

        var roles = this._require(aclIndex);

        logger.info('  ' + this._util.relative(aclIndex));

        // expand arrays to Sc => GrandParent.Parent.Child
        if (Array.isArray(roles)) {
          var seen = {};

          roles.forEach(function (role) {
            var lastRole;

            role.split('.').forEach(function (subRole) {
              if (!seen[subRole]) {
                Sc.ACL.addRole(new Sc.Role(subRole), lastRole || []);
                seen[subRole] = 1;
              }

              lastRole = [subRole];
            });
          });
        }

        var resources = {};

        // load resources
        this._util.glob('lib/ACL/**/index.js').forEach(function (file) {
          var _basename = this._util.relative(file)
            .replace(/^lib\/ACL\/|\/?index\.js$/g, '')
            .replace(/\//g, '.');

          if (_basename) {
            logger.info('  ' + this._util.relative(file));
            resources[_basename] = this._require(file);
          }
        }, this);

        var fixedResources = _acl.buildResources(resources);
        var fixedMiddlewares = _acl.buildMiddlewares(fixedResources);

        this.acl = {
          resources: fixedResources,
          middlewares: fixedMiddlewares
        };
      }

      return this;
    },

    _loadMailers: function() {
      require('../core/mailers/BaseMailer');
      return this._loadFiles('lib/mailers/**/*.js', 'Loading mailers...');
    },
  }
});

//Startup (factory)
module.exports = function(cwd) {
  return new Neonode(cwd);
};
