/* global Class, CustomEventSupport */
module.exports = Class('BaseController').includes(CustomEventSupport)({
  layout: 'application',
  prototype: {
    getName: function () {
      return this.constructor.className.replace('Controller', '');
    }
  }
});
