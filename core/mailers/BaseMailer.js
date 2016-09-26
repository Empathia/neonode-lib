/* globals Class */

var fs = require('fs');
var path = require('path');
var pug = require('pug');
var _ = require('lodash');

var BaseMailer = Class('BaseMailer')({
  _transport: null,
  _options: null,
  _templates: null,

  transport: function(transport) {
    if (transport) {
      this._transport = transport;

      return transport;
    }

    var klass = this;

    while (klass && !klass._transport) {
      var proto = Object.getPrototypeOf(klass.prototype);
      klass = proto && proto.constructor;
    }

    if (klass && klass._transport) {
      return klass && klass._transport;
    }

    throw new Error(this.className + ' can\'t find a nodemailer transport');
  },

  setMethodTemplate: function(methodName, templateName) {
    if (!this._templates) {
      this._templates = {};
    }

    this._templates[methodName] = {
      template: path.join(
        process.cwd(),
        'views',
        'mailers',
        `${this.className}`,
        `${templateName}.pug`
      ),
    };

    return this;
  },

  _send: function(methodName) {
    var args = Array.prototype.slice.call(arguments, 1);
    var template;

    var defaultOptions = this._options;

    var recipients = args[0];
    var localVars = args[1];

    var options = _.assign(defaultOptions, localVars._options);

    if (this._templates && this._templates[methodName].template) {
      template = this._templates[methodName].template;
    }

    var conventionalTemplate = path.join(
      process.cwd(),
      'views',
      'mailers',
      this.className,
      methodName + '.pug'
    );

    try {
      fs.accessSync(conventionalTemplate, fs.F_OK);
      template = conventionalTemplate;
    } catch (e) {
      throw new Error('Method ' + methodName + ' in ' + this.className + ' doesn\'t have a template');
    }

    let html;

    try {
      html = pug.renderFile(template, localVars);
    } catch (e) {
      throw new Error(e);
    }

    options.html = html;
    options.to = recipients;

    return this.transport().sendMail(options);
  },
});

module.exports = BaseMailer;
