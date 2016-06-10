var OS = require('os');
var path = require('path');
var REPL = require('repl');
var Module = require('module');

var _empty = '(' + OS.EOL + ')';
var exit = process.exit.bind(process);

/* global Neonode */
if (!Neonode) {
  throw new Error('missing Neonode instance');
}

console.log([
  '',
  '# type `.server [on|off|start|stop]` to manage Express',
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

repl.defineCommand('reload', {
  help: 'Reload modules from the current Neonode instance',
  action: function(name) {
    var files = 0;

    Object.keys(Module._cache).forEach(function(key) {
      if (name) {
        if (path.relative(process.cwd(), key).indexOf(name) > -1) {
          delete Module._cache[key];
          files += 1;
        }

        return;
      }

      if (key.indexOf('node_modules') === -1) {
        delete Module._cache[key];
        files += 1;
      }
    });

    setTimeout(reload);

    process.stdout.write(files + ' file'
      + (files !== 1 ? 's were' : ' was') + ' reloaded\n');
  }
});
