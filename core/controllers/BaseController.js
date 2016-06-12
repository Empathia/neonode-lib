/* global Class, CustomEventSupport */
module.exports = Class('BaseController').includes(CustomEventSupport)({
  middleware: ['web']
});
