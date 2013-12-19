// module to set up logging

'use strict';

if (typeof define !== 'function') {
    var define = require('amdefine')(module);
}

define(['lodash', 'bunyan'], function(_, bunyan) {

  var baseLog = bunyan.createLogger({name: 'user-api'});

  var createLogger = function(filename, extraObjects) {
    var extras = _.cloneDeep(extraObjects || {});
    extras.srcFile = filename;

    return baseLog.child(extras);
  };

  return {
    createLogger: createLogger
  };
});
