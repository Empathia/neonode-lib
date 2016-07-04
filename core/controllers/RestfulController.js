var aliases = {
  form: ['update', 'edit', 'new']
};

function getAlias(name) {
  return Object.keys(aliases).filter(function (key) {
    return aliases[key].indexOf(name) > -1;
  })[0];
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

      var fixedResources = this.constructor.resources.map(function (resourceName) {
        return {
          name: resourceName,
          url: scope[resourceName].url()
        };
      });

      return fixedResources.map(function (resource) {
        resource.isActive = currentUrl.indexOf(resource.url) === 0;
        return resource;
      });
    },
    init: function () {
      var resourceName = this.getName();

      if (this.constructor.resources.indexOf(resourceName) === -1) {
        return;
      }

      // decorate default behaviours
      ['index', 'show', 'edit', 'new'].forEach(function (action) {
        if (!this[action]) {
          var fixedAction = getAlias(action) || action;

          this[action] = function (req, res) {
            var _tpl = this.constructor.template;
            var _res = this.getResources(req.path);
            var _params = this.getParams && this.getParams(req, action);

            var _failure = req.flash && req.flash()._failure || {};
            var _err;

            if (_failure.errors) {
              _err = [];
              _err.message = _failure.message || 'An error ocurred';

              Object.keys(_failure.errors).forEach(function (key) {
                _err.push({
                  field: key,
                  failure: _failure.errors[key]
                });
              });
            }

            Promise.resolve(_params).then(function (fixedParams) {
              res.render(_tpl, {
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
              if (req.flash) {
                req.flash('_failure', {
                  errors: error.errors,
                  message: error.message
                });
              }

              if (!res.finished) {
                if (!_url) {
                  next(error);
                } else {
                  res.redirect(_url);
                }
              }
            });
          };
        }
      }, this);
    }
  }
});
