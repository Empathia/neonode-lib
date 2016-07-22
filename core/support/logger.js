var colorize = process.env.WINSTON_COLORIZE || true;
var winston = require('winston');
var logger;

var devLogger = new winston.transports.Console({
  handleExceptions: false,
  json: false,
  colorize : colorize,
  timestamp : false,
  stringify: true,
  prettyPrint : true,
  depth : null,
  humanReadableUnhandledException : true,
  showLevel : true,
});

/* global config */
function init() {
  var transports = [
    new winston.transports.File({
      filename: config('logFile'),
      handleExceptions: false,
      colorize: false,
      maxsize : 5242880,
      maxFiles : 10,
      json : true,
    })
  ];

  if (config('environment') !== 'test') {
    transports.push(devLogger);
  }

  logger = new winston.Logger({
    transports: transports
  });
}

logger = new winston.Logger({
  transports: [devLogger]
});

module.exports = function() {
  logger = null;
  init();
};

module.exports.getStream = function() {
  return {
    write: function(message){
      logger.info(message);
    }
  };
};

['info', 'warn', 'error', 'debug'].forEach(function(key) {
  Object.defineProperty(module.exports, key, {
    get: function () {
      return logger[key];
    }
  });
});
