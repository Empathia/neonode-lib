/* global config */
module.exports = (function() {
  if (!config('sessions')) {
    return function(req, res, next) {
      next();
    };
  }

  if (config('sessions.csrf') === false) {
    return function (req, res, next) {
      req.csrfToken = 'testToken';
      res.locals.csrfToken = req.csrfToken;
      next();
    };
  }

  return [
    require('csurf')(),
    function (req, res, next) {
      res.locals.csrfToken = req.csrfToken();
      next();
    },
    function (err, req, res, next) {
      logger.error('CSRF', err.toString(), res.locals);
      next(err);
    }
  ];
})();
