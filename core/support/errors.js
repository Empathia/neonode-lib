// Custom Errors
function makeError(errorName, defaultMessage) {
  function CustomError(message, previousError) {
    this.name = errorName;
    this.message = message || defaultMessage;

    if (previousError && previousError.stack) {
      this.stack = previousError.stack;
    }
  }

  CustomError.prototype = Object.create(Error.prototype);
  CustomError.prototype.constructor = CustomError;

  global[errorName] = CustomError;
}

Error.define = makeError;
Error.define('NotFoundError', 'Not Found');
Error.define('MissingRoleError', 'Missing role');
