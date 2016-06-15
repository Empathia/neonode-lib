/* global Class, NotFoundError, BaseController */
module.exports = Class('RestfulController').inherits(BaseController)({
  prototype: (function (actions) {
    var props = {};

    actions.forEach(function (action) {
      props[action] = function (req, res, next) {
        next(new NotFoundError('Neonode: handler for `' + this.constructor.className + '.' + action + '` is not implemented'));
      }
    });

    return props;
  })(['index', 'show', 'new', 'edit', 'update', 'create', 'destroy'])
});
