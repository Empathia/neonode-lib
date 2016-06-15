/* global Class, CustomEventSupport */
module.exports = Class('BaseController').includes(CustomEventSupport)({
  layout: 'application',
  prototype: {
    // custom renderer support
    view: function (res, path, locals, options) {
      var fixedOptions = {
        layout: this.constructor.layout
      };

      Object.keys(options || {}).forEach(function (key) {
        fixedOptions[key] = options[key];
      });

      res.render(path, fixedOptions);
    }
  }
});
