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
  logger.debug(clc.blackBright('  -> ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName));
});

Li.Engine.error.push(function errorEngine(data) {
  logger.error(clc.red('Lithium Detected an error...'));

  // try to call next()
  try {
    if (typeof data.args[2] === 'function' && data.args[2].length === 1) {
      data.args[2](data.error.stack || data.error);
    } else {
      console.log(data);
    }
  } catch (e) {
    logger.error(data.error.stack || data.error);
    logger.error(e);
  }
});

Li.Engine.after.push(function afterEngine(data) {
  logger.debug(clc.blackBright('  <- ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName + ' on ') + heat(data.time) + clc.blackBright(' ms'));
});
