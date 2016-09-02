// Custom Errors
function makeError(errorName, defaultMessage) {
  function CustomError(message) {
    var _data;

    if (typeof message === 'object' && message !== null) {
      _data = message || {};
      message = null;
    }

    this.name = errorName;
    this.label = defaultMessage;
    this.message = message || defaultMessage;

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

// other errors
Error.define('Failure', 'An error was ocurred');
Error.define('UndefinedRoleError', 'Missing role');

Error.define('BadRequest', 'Bad Request'); // 400
Error.define('ServerError', 'Server Failure'); // 500
Error.define('NotFoundError', 'Not Found'); // 404
Error.define('NotImplemented', 'Not Implemented'); // 501
