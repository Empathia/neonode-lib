Li.Engine.before.push(function beforeEngine(data) {
  logger.info('  -> BEGIN ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName);
});

Li.Engine.error.push(function errorEngine(data) {
  logger.error('Lithium Detected an error...');
  logger.error(data.error.stack);
});

Li.Engine.after.push(function afterEngine(data) {
	logger.info('  <- END ' + (data.spy.targetObject.className || data.spy.targetObject.constructor.className || '')  + '.' + data.spy.methodName + ' on ' + data.time + 'ms');
});
