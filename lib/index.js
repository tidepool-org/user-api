// index.js
// --------
// This is the main file for the user API.
// 
// So far, it only returns a key given a username/password

/*
 * == TIDEPOOL LICENSE ==
 * Copyright (C) 2013 Tidepool Project
 * 
 * This source code is subject to the terms of the Tidepool Open Data License, v. 1.0.
 * If a copy of the license was not provided with this file, you can obtain one at:
 *     http://tidepool.org/license/
 * 
 * == TIDEPOOL LICENSE ==
 */


(function() {
  // We use strict because we're only worried about modern browsers and we should be strict.
  // JSHint actually insists on this and it's a good idea.
  'use strict';

  var envConfig, userapi, port;

  // Server code needs the environment.
  envConfig = require('../env');

  userapi = require('./userapi.js');

  // If the port is specified in the environment we'll use it, but for deploys we 
  // want to run on port 80 and then map it in the router.
  port = envConfig.USER_PORT || 80;
  console.log('user API server serving on port', port);
  secret = envConfig.API_SECRET;
  if (secret) {
    userapi.secret = secret;
  }
  userapi.server.listen(port);

// Wrap up the javascript namespacing model.
}).call(this);
