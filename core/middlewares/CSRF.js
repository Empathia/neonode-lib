/* global config */
module.exports = (function() {
  if (!config('sessions')) {
    return function(req, res, next) {
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
      next();
    }
  ];
})();
