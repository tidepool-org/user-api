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
