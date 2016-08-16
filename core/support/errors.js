// Custom Errors
function makeError(errorName, defaultMessage) {
  function CustomError(message, previousError) {
    var _data;

    if (typeof message === 'object' && message !== null) {
      _data = message || {};
      message = null;
    }

    this.name = errorName;
    this.label = defaultMessage;
    this.message = message || defaultMessage;

    if (previousError && previousError.stack) {
      this.stack = previousError.stack;
    }

    // allow plain objects to extend only
    if (_data) {
      Object.keys(_data).forEach(function (key) {
        this[key] = _data[key];
      }, this);
    }
  }

  CustomError.prototype = Object.create(Error.prototype);
  CustomError.prototype.constructor = CustomError;

  global[errorName] = CustomError;
}

Error.define = makeError;
Error.define('Failure', 'An error was ocurred');
Error.define('NotFoundError', 'Not Found');
Error.define('UndefinedRoleError', 'Missing role');
