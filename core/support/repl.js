var OS = require('os');
var path = require('path');
var REPL = require('repl');
var Module = require('module');

var clc = require('cli-color');
var http = require('very-tiny-http-client');

var _empty = '(' + OS.EOL + ')';
var exit = process.exit.bind(process);

/* global Neonode */
if (!Neonode) {
  throw new Error('missing Neonode instance');
}

Neonode._REPL = true;

console.log([
  '',
  '# type `.fetch [/path|mapping]` to perform requests',
  '# type `.server [on|off|start|stop]` to manage Express',
  '# type `.routes [pattern]` to display any defined mappings',
  '# type `.reload [pattern]` to restart the current application',
  ''
].join('\n'));

var enableServer = process.argv.indexOf('--server') > -1;

if (enableServer) {
  Neonode._serverStart();
}

function reload() {
  if (enableServer) {
    Neonode._serverStop();
  }

  // intentionally re-required
  Neonode = require('../../core');

  if (enableServer) {
    Neonode._serverStart();
  }
}

var repl = REPL.start({
  stdout: process.stdout,
  stdin: process.stdin,
  prompt: '',
  eval: function (cmd, context, filename, callback) {
    if (cmd === _empty) {
      return callback();
    }

    try {
      callback(null, eval(cmd));
    } catch (e) {
      callback(e);
    }
  }
})
.on('exit', function() {
  console.log('bye bye!');
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
      setTimeout(reload);
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
          throw new Error('Neonode: missing `' + value + '` route');
        }

        method = url.verb;
        url = url.url.apply(null, values.slice(1));
      } catch (e) {
        process.stderr.write(clc.red(e.message || e.toString()) + '\n');
        return;
      }
    }

    url = url || value || '/';

    process.stdout.write(clc.blackBright(url) + '\n');

    http[method || 'get']({
      url: 'http://localhost:' + config('port') + url,
      data: global.data || {}
    }, function (err, res) {
      if (err) {
        process.stderr.write(clc.red(err.message || err.toString()) + '\n');
      } else {
        Object.keys(res).forEach(function (key) {
          var value = typeof res[key] === 'object' ? JSON.stringify(res[key], null, 2) : res[key];

          process.stdout.write(clc.cyan(key) + ': ' + value.toString().split('\n').join('\n' + (new Array(key.length + 3)).join(' ')) + '\n');
        });
      }
    });
  }
});

repl.defineCommand('routes', {
  help: 'Display any registered routes within Neonode',
  action: function(value) {
    Neonode.router.routes.forEach(function (route) {
      value = value.toLowerCase().trim();

      if (!value || (
        route.verb.toLowerCase().indexOf(value) > -1 ||
        route.path.toLowerCase().indexOf(value) > -1
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
  action: function(name) {
    var files = 0;

    Object.keys(require.cache).forEach(function(key) {
      if (name) {
        if (path.relative(Neonode.cwd, key).indexOf(name) > -1) {
          delete require.cache[key];
          files += 1;
        }

        return;
      }

      if (key.indexOf('node_modules') === -1) {
        delete require.cache[key];
        files += 1;
      }
    });

    setTimeout(reload);

    process.stdout.write(files + ' file'
      + (files !== 1 ? 's were' : ' was') + ' reloaded\n');
  }
});
