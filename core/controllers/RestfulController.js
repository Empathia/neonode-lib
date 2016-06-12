/* global Class, BaseController */
module.exports = Class('RestfulController').inherits(BaseController)({
  middleware: ['api']
});
