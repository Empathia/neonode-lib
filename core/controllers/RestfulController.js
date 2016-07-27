var aliases = {
  form: ['update', 'edit', 'new']
};

function getAlias(name) {
  return Object.keys(aliases).filter(function (key) {
    return aliases[key].indexOf(name) > -1;
  })[0];
}

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

/* global urlFor, Class, BaseController */
module.exports = Class('RestfulController').inherits(BaseController)({
  resources: [],
  template: 'admin/index',
  layout: 'admin',
  scope: '',
  prototype: {
    getResources: function (currentUrl) {
      var keys = this.constructor.scope.split('.');
      var scope = urlFor;

      while (keys.length) {
        scope = urlFor[keys.shift()];
      }

      var fixedResources = [];

      this.constructor.resources.forEach(function (params) {
        var fixedParams = {};

        if (typeof params === 'string') {
          params = { items: [params] };
        }

        Object.keys(params).forEach(function (key) {
          fixedParams[key] = params[key];
        });

        fixedParams.items = fixedParams.items.map(function (resource) {
          var _resource = {};

          _resource.url = scope[resource].url();
          _resource.name = resource;
          _resource.isActive = currentUrl.indexOf(resource.url) === 0;

          return _resource;
        });

        fixedResources.push(fixedParams);
      });

      return fixedResources;
    },
    init: function () {
      var resourceName = this.getName();
      var _resources = [];

      this.constructor.resources.forEach(function (res) {
        Array.prototype.push.apply(_resources, res.items || [res]);
      });

      if (_resources.indexOf(resourceName) === -1) {
        return;
      }

      // decorate default behaviours
      ['index', 'show', 'edit', 'new'].forEach(function (action) {
        if (!this[action]) {
          var fixedAction = getAlias(action) || action;

          this[action] = function (req, res) {
            if (!req.session) {
              throw new Error('Sessions are required');
            }

            var _tpl = this.constructor.template;
            var _res = this.getResources(req.path);

            var _failure = req.session._failure || {};
            var _params = {};
            var _err;

            delete req.session._failure;

            function _get(prop, value) {
              if (!prop) {
                return _failure.old || {};
              }

              return getProp(prop, _failure.old || {}, value || '');
            }

            if (_failure.errors) {
              _err = [];
              _err.message = _failure.message || 'An error ocurred';

              if (!Array.isArray(_failure.errors)) {
                Object.keys(_failure.errors).forEach(function (key) {
                  _err.push({
                    field: key,
                    failure: _failure.errors[key]
                  });
                });
              } else {
                Array.prototype.push.apply(_err, _failure.errors);
              }
            }

            // shortcut
            req.old = _get;

            if (this.getParams) {
              _params = this.getParams(req, action);
            }

            Promise.resolve(_params).then(function (fixedParams) {
              res.render(_tpl, {
                old: _get,
                errors: _err,
                resources: _res,
                resourceUrl: req.url,
                resourceName: resourceName,
                resourceParams: fixedParams,
                resourcePartial: resourceName.toLowerCase() + '/' + fixedAction
              });
            });
          };
        }
      }, this);

      // decorate non-get requests
      ['update', 'create', 'destroy'].forEach(function (action) {
        if (!this[action]) {
          this[action] = function (req, res, next) {
            next(new NotFoundError('handler for `' + resourceName + '.' + action + '` is not implemented'));
          };
        } else {
          var _action = this[action];

          this[action] = function (req, res, next) {
            if (!req.session) {
              throw new Error('Sessions are required');
            }

            delete req.session._failure;

            var _url;

            if (req.body) {
              _url = req.body._url;
              delete req.body._url;
            }

            var _result;

            try {
              _result = _action.call(this, req, res);
            } catch (_e) {
              return next(e);
            }

            Promise.resolve(_result).catch(function (error) {
              req.session._failure = {
                old: req.body,
                errors: error.errors ? error.errors : [error.message || error.toString()],
                message: error.errors ? error.message : 'Unexpected error'
              };

              if (!_url) {
                next(error);
              } else {
                res.redirect(_url);
              }
            });
          };
        }
      }, this);
    }
  }
});
