/* global urlFor, Class, BaseController, Promise, NotFoundError */

var aliases = {
  form: ['update', 'edit', 'new']
};

function getAlias(name) {
  return Object.keys(aliases).filter(function (key) {
    return aliases[key].indexOf(name) > -1;
  })[0];
}

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

          if (typeof resource === 'string') {
            _resource.url = scope[resource].url();
            _resource.name = resource;
          } else {
            Object.keys(resource).forEach(function (key) {
              _resource[key] = resource[key];
            });

            if (_resource.url.charAt() !== '/') {
              _resource.url = urlFor(_resource.url).url();
            }
          }

          _resource.isActive = currentUrl.indexOf(_resource.url) === 0;

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
            var _tpl = this.constructor.template;
            var _res = this.getResources(req.path);
            var _params = {};

            if (this.getParams) {
              _params = this.getParams(req, action);
            }

            return Promise.resolve(_params).then(function (fixedParams) {
              res.render(_tpl, {
                opts: req.query,
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

            var _result;

            try {
              _result = _action.call(this, req, res);
            } catch (_e) {
              return next(_e);
            }

            return Promise.resolve(_result);
          };
        }
      }, this);
    }
  }
});
