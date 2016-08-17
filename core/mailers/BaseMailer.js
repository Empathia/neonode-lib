var fs = require('fs');
var path = require('path');

module.exports = Class('BaseMailer')({
  _transport: null,
  _options: null,
  _templates: null,
  _renderer: {
    renderFile: function (file, vars) {
      // default renderer is thulium
      var partial = new Thulium({
        template : fs.readFileSync(file).toString()
      });

      partial.parseSync().renderSync(vars || {});

      return partial.view;
    }
  },
  _extension: '.html',

  transport: function (transport) {
    if (transport) {
      this._transport = transport;

      return transport;
    }

    var _klass = this;
    var _transport;

    do {
      _transport = _klass._transport || _klass.prototype._transport || _klass.prototype.constructor._transport;
    } while (_klass && _klass !== this && !_transport)

    return _transport;
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

    if (extName) {
      this._extension = (extName.indexOf('.') > -1 ? '' : '.') + extName;
    }

    return this;
  },

  _send: function (methodName, recipients, localVars) {
    recipients = recipients || [];
    localVars = localVars || {};

    var defaultOptions = this._options || {};
    var localOptions = localVars.options || {};
    var options = {};
    var template;

    Object.keys(defaultOptions).forEach(function (key) {
      options[key] = typeof localOptions[key] === 'undefined' ? defaultOptions[key] : localOptions[key];
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

    var self = this;

    return new Promise(function (resolve) {
      var _transport = self.transport();

      if (!_transport) {
        throw new Error((self.className || self.name || 'BaseMailer') + ' can\'t find a nodemailer transport');
      }

      try {
        fs.accessSync(conventionalTemplate, fs.F_OK);
        template = conventionalTemplate;
      } catch (e) {
        throw new Error('Method ' + methodName + ' in ' + this.className + ' doesn\'t have a template');
      }

      var html = self._renderer.renderFile(template, localVars);

      options.html = html;
      options.to = recipients;

      resolve(_transport.sendMail(options));
    });
  },
});
