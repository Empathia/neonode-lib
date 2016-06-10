var clc = require('cli-color');

var dim = clc.blackBright,
    yellow = clc.yellow,
    white = clc.white,
    red = clc.red;

var high_level = 100,
    mid_level = 30,
    low_level = 5;

function heat(level) {
  if (level > high_level) {
    return red(level);
  }

  if (level > mid_level) {
    return yellow(level);
  }

  if (level > low_level) {
    return white(level);
  }

  return dim(level);
}

/* global logger, Li */
Li.Engine.before.push(function beforeEngine(data) {
  logger.info(dim('  -> ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName));
});

Li.Engine.error.push(function errorEngine(data) {
  logger.error(red('Lithium Detected an error...'));
  logger.error(data.error.stack);
});

Li.Engine.after.push(function afterEngine(data) {
  logger.info(dim('  <- ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName + ' on ') + heat(data.time) + dim(' ms'));
});
