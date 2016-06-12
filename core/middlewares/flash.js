/* global config */
module.exports = (function() {
  if (!config('sessions')) {
    return function (req, res, next) {
      next();
    };
  }

  return require('req-flash')({ locals: 'flash' });
})();
