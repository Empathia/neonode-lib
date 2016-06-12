// Custom Errors
function makeError(errorName, defaultMessage) {
  function CustomError(message) {
    this.name = errorName;
    this.message = defaultMessage;
  }

  CustomError.prototype = Object.create(Error.prototype);
  CustomError.prototype.constructor = CustomError;

  global[errorName] = CustomError;
}

Error.define = makeError;
Error.define('NotFoundError', 'Not Found');
