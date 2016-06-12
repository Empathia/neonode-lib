/* global config */
module.exports = (function() {
  if (!config('sessions')) {
    return function (req, res, next) {
      next();
    };
  }

  var session = require('express-session');
  var RedisStore = require('connect-redis')(session);

  var redisStoreInstance = new RedisStore();

  var sessionMiddleWare = session({
    resave : false,
    saveUninitialized : true,
    key : config('sessions.key'),
    store: redisStoreInstance,
    secret: config('sessions.secret')
  });

  return sessionMiddleWare;
})();
