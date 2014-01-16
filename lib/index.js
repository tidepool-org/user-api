// index.js
// --------
// This is the main file for the user API.
// 
// So far, it only returns a key given a username/password

/*
 * == BSD2 LICENSE ==
 * Copyright (c) 2014, Tidepool Project
 * 
 * This program is free software; you can redistribute it and/or modify it under
 * the terms of the associated License, which is identical to the BSD 2-Clause
 * License as published by the Open Source Initiative at opensource.org.
 * 
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
 * FOR A PARTICULAR PURPOSE. See the License for more details.
 * 
 * You should have received a copy of the License along with this program; if
 * not, you can obtain one from Tidepool Project at tidepool.org.
 * == BSD2 LICENSE ==
 */

var _ = require('lodash');
var log = require('./log').createLogger('index.js');

(function() {
  // We use strict because we're only worried about modern browsers and we should be strict.
  // JSHint actually insists on this and it's a good idea.
  'use strict';

  var envConfig, userapi, port;

  // Server code needs the environment.
  envConfig = require('../env');

  var userService = require('./db_mongo.js')(
    {
      mongoConnectionString: envConfig.mongoConnectionString,
      adminKey: envConfig.userAdminKey,
      saltDeploy: envConfig.saltDeploy,
      logger: log
    }
  );

  userapi = require('./userapi.js')(envConfig, userService);

  function createServer(config, port) {
    log.info('Creating server[%s]', config.name);
    var server = require('restify')(config);
    server.use(restify.queryParser());
    server.use(restify.bodyParser());
    userapi.attachToServer(server);
    server.listen(port, function(err){
      if (err != null) {
        throw err;
      }
      log.info("Started server[%s] on port[%s]", config.name, port);
    });
  }

  if (envConfig.httpPort != null) {
    createServer({ name: 'TidepoolUserHttp' }, envConfig.httpPort);
  }

  if (envConfig.httpsPort != null) {
    createServer(_.extend({ name: 'TidepoolUserHttps'}, envConfig.httpsConfig), envConfig.httpsPort);
  }

// Wrap up the javascript namespacing model.
})();
