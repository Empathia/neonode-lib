var path = require('path');

module.exports = {
  CORS: path.join(__dirname, 'CORS.js'),
  CSRF: path.join(__dirname, 'CSRF.js'),
  flash: path.join(__dirname, 'flash.js'),
  session: path.join(__dirname, 'session.js'),
  cookieParser: path.join(__dirname, 'cookieParser.js'),
  bodyParserURL: path.join(__dirname, 'bodyParserURL.js'),
  bodyParserJSON: path.join(__dirname, 'bodyParserJSON.js'),
  HTTPMethodOverride: path.join(__dirname, 'HTTPMethodOverride.js')
};
