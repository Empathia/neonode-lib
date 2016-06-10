var colorize = process.env.WINSTON_COLORIZE || true;
var winston = require('winston');

/* global config */
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
  transports.push(new winston.transports.Console({
    handleExceptions: false,
    json: false,
    colorize : colorize,
    timestamp : false,
    stringify: true,
    prettyPrint : true,
    depth : null,
    humanReadableUnhandledException : true,
    showLevel : true,
  }));
}

var logger = new winston.Logger({
  transports: transports
});

module.exports = logger;

module.exports.stream = {
  write: function(message){
    logger.info(message);
  }
};
