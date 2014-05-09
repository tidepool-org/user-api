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
'use strict';

var fs = require('fs');
var config = require('amoeba').config;

function maybeReplaceWithContentsOfFile(obj, field)
{
  var potentialFile = obj[field];
  if (potentialFile != null && fs.existsSync(potentialFile)) {
    obj[field] = fs.readFileSync(potentialFile).toString();
  }
}

module.exports = (function() {
  var env = {};

  env.metrics = {
    // The config object to discover highwater (the metrics API).  
    // This is just passed through to hakken.watchFromConfig()
    serviceSpec: JSON.parse(config.fromEnvironment('METRICS_SERVICE'))
  };

  // The port to attach an HTTP listener, if null, no HTTP listener will be attached
  env.httpPort = config.fromEnvironment('PORT', null);

  // The port to attach an HTTPS listener, if null, no HTTPS listener will be attached
  env.httpsPort = config.fromEnvironment('HTTPS_PORT', null);

  // The https config to pass along to https.createServer.
  var theConfig = config.fromEnvironment('HTTPS_CONFIG', null);
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

  env.mongoConnectionString = config.fromEnvironment('MONGO_CONNECTION_STRING', 'mongodb://localhost/user');
  env.userAdminKey = config.fromEnvironment('ADMIN_KEY', ''); // if the admin key isn't specified, disable admin mode.
  env.logName = config.fromEnvironment('LOG_NAME', 'userapi');

  env.metrics = {
    // The config object to discover highwater (the metrics API).  
    // This is just passed through to hakken.watchFromConfig()
    serviceSpec: JSON.parse(config.fromEnvironment('METRICS_SERVICE'))
  };

  // Encryption secret, keep it safe!
  env.apiSecret = config.fromEnvironment('API_SECRET');
  if (env.apiSecret == null) {
    throw new Error('Must specify an API_SECRET in your environment.');
  }

  // Shared secret for servers, keep it safe!
  env.serverSecret = config.fromEnvironment('SERVER_SECRET');
  if (env.serverSecret == null) {
    throw new Error('Must specify a SERVER_SECRET in your environment.');
  }

  // Configurable salt for password encryption
  env.saltDeploy = config.fromEnvironment('SALT_DEPLOY');
  if (env.saltDeploy == null) {
    throw new Error('Must specify SALT_DEPLOY in your environment.');
  }

  // This is the key to use if you want to create a longterm token. 
  // It's ok for this to be missing; if not here, then you can't 
  // create a longerm token.
  env.longtermkey = process.env.LONGTERM_KEY;

  // The host to contact for discovery
  env.discovery = {
    // The host to connect to for discovery
    host: config.fromEnvironment('DISCOVERY_HOST')
  };

  // The service name to publish on discovery
  env.serviceName = config.fromEnvironment('SERVICE_NAME');
  env.metricsSource = env.serviceName;
  env.metricsVersion = require('./package.json').version;

  // The local host to publish to discovery
  env.publishHost = config.fromEnvironment('PUBLISH_HOST');

  return env;
})();
