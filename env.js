// Loads the environment and makes it accessible,
// and also has sensible defaults

// == BSD2 LICENSE ==
// Copyright (c) 2014, Tidepool Project
// 
// This program is free software; you can redistribute it and/or modify it under
// the terms of the associated License, which is identical to the BSD 2-Clause
// License as published by the Open Source Initiative at opensource.org.
// 
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the License for more details.
// 
// You should have received a copy of the License along with this program; if
// not, you can obtain one from Tidepool Project at tidepool.org.
// == BSD2 LICENSE ==

var fs = require('fs');

function maybeReplaceWithContentsOfFile(obj, field)
{
  var potentialFile = obj[field];
  if (potentialFile != null && fs.existsSync(potentialFile)) {
    obj[field] = fs.readFileSync(potentialFile).toString();
  }
}

'use strict';
module.exports = (function() {
  var env = {};

  // The port to attach an HTTP listener, if null, no HTTP listener will be attached
  env.httpPort = process.env.PORT || null;

  // The port to attach an HTTPS listener, if null, no HTTPS listener will be attached
  env.httpsPort = process.env.HTTPS_PORT || null;

  // The https config to pass along to https.createServer.
  var theConfig = process.env.HTTPS_CONFIG || null;
  env.httpsConfig = null;
  if (theConfig != null) {
    env.httpsConfig = JSON.parse(theConfig);
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'key');
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'cert');
    maybeReplaceWithContentsOfFile(env.httpsConfig, 'pfx');
  }
  if (env.httpsPort != null && env.httpsConfig == null) {
    throw new Error('No https config provided, please set HTTPS_CONFIG with at least the certificate to use.');
  }

  if (env.httpPort == null && env.httpsPort == null) {
    throw new Error('Must specify either PORT or HTTPS_PORT in your environment.');
  }

  env.mongoConnectionString = process.env.MONGO_CONNECTION_STRING || 'mongodb://localhost/user';
  env.userAdminKey = process.env.ADMIN_KEY || ''; // if the admin key isn't specified, disable admin mode.
  env.logName = process.env.LOG_NAME || 'userapi';


  // Encryption secret, keep it safe!
  env.apiSecret = process.env.API_SECRET;
  if (env.apiSecret == null) {
    throw new Error('Must specify an API_SECRET in your environment.');
  }

  // Configurable salt for password encryption
  env.saltDeploy = process.env.SALT_DEPLOY;
  if (env.saltDeploy == null) {
    throw new Error('Must specify SALT_DEPLOY in your environment.');
  }

  // The host to contact for discovery
  if (process.env.DISCOVERY_HOST != null) {
    env.discovery = {};
    env.discovery.host = process.env.DISCOVERY_HOST;

    env.serviceName = process.env.SERVICE_NAME;
    if (env.serviceName == null) {
      throw new Error('Environment variable SERVICE_NAME must be set if DISCOVERY_HOST is set.');
    }

    // The local host to expose to discovery
    env.publishHost = process.env.PUBLISH_HOST;
    if (env.publishHost == null) {
      throw new Error('Environment variable PUBLISH_HOST must be set if DISCOVERY_HOST is set.');
    }
  }

  return env;
})();
