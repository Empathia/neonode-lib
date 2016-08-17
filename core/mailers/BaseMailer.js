var fs = require('fs');
var path = require('path');

module.exports = Class('BaseMailer')({
  _transport: null,
  _options: null,
  _templates: null,
  _renderer: null,
  _extension: '',

  transport: function (transport) {
    if (transport) {
      this._transport = transport;

      return transport;
    }

    var klass = this;

    while (klass && !klass._transport) {
      var proto = klass.prototype;
      klass = proto && proto.constructor;
    }

    if (klass && klass._transport) {
      return klass && klass._transport;
    }

    throw new Error(this.className + ' can\'t find a nodemailer transport');
  },

  setMethodTemplate: function (methodName, templateName) {
    if (!this._templates) {
      this._templates = {};
    }

    this._templates[methodName] = {
      template: path.join(
        Neonode.cwd,
        'views',
        'mailers',
        this.className,
        templateName + this._extension
      ),
    };

    return this;
  },

  setRendererEngine: function (engine, extName) {
    this._renderer = engine;
    this._extension = extName ? '.' + extName : '';
  },

  _send: function (methodName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var template;

    var defaultOptions = this._options;

    var recipients = args[0];
    var localVars = args[1];

    var options = {};

    Object.keys(defaultOptions).forEach(function (key) {
      options[key] = localVars._options[key] || defaultOptions[key];
    });

    if (this._templates && this._templates[methodName].template) {
      template = this._templates[methodName].template;
    }

    var conventionalTemplate = path.join(
      Neonode.cwd,
      'views',
      'mailers',
      this.className,
      methodName + this._extension
    );

    try {
      fs.accessSync(conventionalTemplate, fs.F_OK);
      template = conventionalTemplate;
    } catch (e) {
      throw new Error('Method ' + methodName + ' in ' + this.className + ' doesn\'t have a template');
    }

    var html = this._renderer.renderFile(template, localVars);

    options.html = html;
    options.to = recipients;

    return this.transport().sendMail(options);
  },
});
