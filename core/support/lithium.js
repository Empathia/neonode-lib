var clc = require('cli-color');

var high_level = 100,
    mid_level = 30,
    low_level = 5;

function heat(level) {
  if (level > high_level) {
    return clc.red(level);
  }

  if (level > mid_level) {
    return clc.yellow(level);
  }

  if (level > low_level) {
    return clc.white(level);
  }

  return clc.blackBright(level);
}

/* global logger, Li */
Li.Engine.before.push(function beforeEngine(data) {
  logger.info(clc.blackBright('  -> ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName));
});

Li.Engine.error.push(function errorEngine(data) {
  logger.error(clc.red('Lithium Detected an error...'));
  logger.error(data.error.stack);
});

Li.Engine.after.push(function afterEngine(data) {
  logger.info(clc.blackBright('  <- ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName + ' on ') + heat(data.time) + clc.blackBright(' ms'));
});
