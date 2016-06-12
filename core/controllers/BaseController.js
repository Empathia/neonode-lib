/* global Class, CustomEventSupport */
var BaseController = Class('BaseController').includes(CustomEventSupport)({
  use : ['web'],
  prototype : {
    init : function (){
      this.name = this.constructor.className.replace('Controller', '');
      return this;
    }
  }
});

module.exports = BaseController;
