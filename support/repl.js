var OS = require('os');
var REPL = require('repl');
var Module = require('module');

var clc = require('cli-color');
var http = require('very-tiny-http-client');
var chokidar = require('chokidar');

var _empty = '(' + OS.EOL + ')';
var exit = process.exit.bind(process);

/* global config, urlFor, Neonode */
if (!Neonode) {
  throw new Error('missing Neonode instance');
}

process.stdout.write([
  '',
  '# type `.fetch [/path|mapping.url]` to perform requests',
  '# type `.server [on|off|start|stop]` to manage Express',
  '# type `.routes [...]` to display any defined mappings',
  '# type `.reload` to restart the current application',
  '',
].join('\n') + '\n');

var enableServer = process.argv.indexOf('--server') > -1;
var enableWatch = process.argv.indexOf('--watch') > -1;

if (enableServer) {
  Neonode._serverStart();
}

function _reload() {
  if (enableServer) {
    Neonode._serverStop();
  }

  Object.keys(Module._cache)
    .forEach(function(key) {
      if (key.indexOf('node_modules') === -1) {
        delete Module._cache[key];
      }
    });

  // some cleanup
  global.knex.destroy();
  global.Sc.ACL.roles = {};
  global.Sc.ACL.resources = {};

  // intentionally re-required
  global.Neonode = Neonode = require('../core');

  if (enableServer) {
    Neonode._serverStart();
  }
}

enableWatch && chokidar
  .watch('{lib,config,models,controllers,migrations,middlewares}/**/*.{js,json}', { ignoreInitial: true })
  .on('all', function() {
    clearTimeout(_reload.t);
    _reload.t = setTimeout(_reload, 200);
  });

var repl = REPL.start({
  stdout: process.stdout,
  stdin: process.stdin,
  prompt: '',
  eval: function (cmd, context, filename, callback) {
    if (cmd === _empty) {
      return callback();
    }

    try {
      var value = eval(cmd);

      if (typeof value == 'undefined') {
        return callback();
      }

      if (typeof value.then === 'function') {
        return value
          .then(function (result) {
            callback(null, result);
          })
          .catch(function (error) {
            callback(error);
          });
      }

      callback(null, value);
    } catch (e) {
      callback(e);
    }
  }
})
.on('exit', function() {
  process.stdout.write('\rbye bye!\n');
  exit();
});

var _lastStatus;

repl.defineCommand('server', {
  help: 'Starts a new Express server session',
  action: function(value) {
    if (['', 'on', 'start'].indexOf(value) > -1) {
      enableServer = true;
    }

    if (['off', 'stop'].indexOf(value) > -1) {
      enableServer = false;
    }

    if (_lastStatus !== enableServer) {
      _lastStatus = enableServer;
      setTimeout(_reload);
    } else {
      process.stdout.write(clc.blackBright('Already started!\n'));
    }
  }
});

repl.defineCommand('fetch', {
  help: 'Make requests from registered mappings',
  action: function (value) {
    var url;
    var method;

    if (value && value.charAt() !== '/') {
      var values = (value.replace(/\s+/g, ' ') || '').split(' ');
      var keys = values[0].split('.');

      url = urlFor;

      try {
        while (keys.length) {
          url = url[keys.shift()];
        }

        if (!url) {
          throw new Error('missing `' + value + '` route');
        }

        method = url.verb;
        url = url.url.apply(null, values.slice(1));
      } catch (e) {
        process.stderr.write(clc.red(e.message || e.toString()) + '\n');
        return;
      }
    }

    url = url || value || '/';

    process.stdout.write(clc.yellow((method || 'get').toUpperCase()) + ' ' + clc.blackBright(url) + '\n');

    http[method || 'get']({
      url: 'http://localhost:' + config('port') + url,
      data: global.data
    }, function (err, res) {
      if (err) {
        process.stderr.write(clc.red(err.message || err.toString()) + '\n');
      } else {
        Object.keys(res).forEach(function (key) {
          var _value = typeof res[key] === 'object' ? JSON.stringify(res[key], null, 2) : res[key];

          process.stdout.write(clc.cyan(key) + ': ' + _value.toString().split('\n').join('\n' + (new Array(key.length + 3)).join(' ')) + '\n');
        });
      }
    });
  }
});

repl.defineCommand('routes', {
  help: 'Display any registered routes within Neonode',
  action: function(value) {
    (Neonode._fixedRoutes || []).forEach(function (route) {
      value = value.toLowerCase().trim();

      if (!value || (
        route.verb.toLowerCase().indexOf(value) > -1 ||
        route.path.toLowerCase().indexOf(value) > -1 ||
        route.as.toLowerCase().indexOf(value) > -1
      )) {
        var _handler = route.handler.slice()
          .concat(route.to ? [route.to] : [])
          .concat(route.action ? [route.action] : []);

        process.stdout.write(
          (route.verb.toUpperCase() + '      ').substr(0, 7) + '  ' + clc.yellow(route.path)
          + '\n' + clc.blackBright(_handler.join('.').replace('#', '.')) + '  -> ' + route.as + '.url()'
          + '\n');
      }
    });
  }
});

repl.defineCommand('reload', {
  help: 'Reload modules from the current Neonode instance',
  action: function() {
    _reload();
  }
});
