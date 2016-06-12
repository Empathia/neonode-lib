/* global config */
module.exports = (function() {
  if (!config('sessions')) {
    return function (req, res, next) {
      return next();
    };
  }

  return require('cookie-parser')(config('sessions.secret'));
})();
