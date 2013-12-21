// userapi.js
// --------
// This is the user API module.
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


module.exports = (function() {
  // We use strict because we're only worried about modern browsers and we should be strict.
  // JSHint actually insists on this and it's a good idea.
  'use strict';

  // It's also a good idea to predeclare all variables at the top of a scope. Javascript doesn't
  // support block scoping so putting them all at the beginning is a smart move.
  var
    _,
    crypto,
    echo,
    envConfig,
    jwt,
    moment,
    restify,
    secret,
    server;

  secret = 'this is a secret that should be replaced by the owner of this module';

  // Server code needs the environment.
  envConfig = require('../env');

  // and we need a functional logging service, and we
  // tell it what file we're using
  var log = require('./log.js').createLogger('user-api.js');

  // Restify helps us with building a RESTful API.
  restify = require('restify');

  // helpful utilities
  _ = require('lodash');
  moment = require('moment');

// KJQ -- delete crypto if we don't need it
  crypto = require('crypto-js');

  // JWT-simple is an implementation of the Java Web Token standard
  jwt = require('jwt-simple');

  server = restify.createServer({
    // The name is sent as one of the server headers
    name: 'TidepoolUser'
  });

  // Two standard restify handler plugins:
  server.use(restify.queryParser());
  server.use(restify.bodyParser());

  // This function merely echoes everything it got as a block of text. Useful for debugging.
  echo = function(req, res, next) {
    log.info('request', req.params, req.url, req.method);
    res.send([
      'Echo!', {
        params: req.params,
        headers: req.headers,
        method: req.method
      }
    ]);
    return next();
  };

  var status = function(req, res, next) {
    log.info('status', req.params, req.url, req.method);
    res.send(req.params.status || 200, 'Ok');
    return next();
  };

  // validates username and password against the database -- returns the authorization period for this key
  var checkUser = function(userid, password) {
    if (userid == 'badid') {
      return 0;
    } else {
      var hash = crypto.algo.SHA1.create();
      hash.update(password);
      var pwhash = hash.finalize().toString();
      log.warn('user %s %s', userid, pwhash);
      return 60*5;    // validate any token for 5 minutes
    }
  };

  // this generates a temporary hash code that is good for a configurable
  // period of time
  // we need the ability to limit app usage to certain groups; it probably has to
  // do with matching metadata in an app token to metadata on a user
  var getSessionToken = function(userid, password) {
    var duration = checkUser(userid, password);
    // duration is in seconds
    if (duration > 0) {
      var sessiontoken = jwt.encode(
        {
          app: userid,
          exp: moment().add('seconds', duration).valueOf()
        }, secret);
      return sessiontoken;
    }
    else
    {
      return null;
    }
  };

  var unpackSessionToken = function(token) {
    var unpacked = jwt.decode(token, secret);
    if (unpacked.exp < moment().valueOf()) {
      return unpacked;
    } else {
      return {};
    }
  };


  var authPost = function(req, res, next) {
    log.info('authPost %s %s %s', '(parameters masked)', req.url, req.method);
    // this could be header fields or post parameters
    var userid = req.header('X-Tidepool-UserID');
    var password = req.header('X-Tidepool-Password');
    if ((userid === undefined) || (password === undefined))
    {
      res.send(400, 'Both X-Tidepool-UserID and X-Tidepool-Password headers are required.');
    }
    else
    {
      var token = getSessionToken(userid, password);
      if (token) {
        res.set('X-Tidepool-Session-Token', token);
        res.send(200);
      } else {
        res.send(401, {response:'Authentication failed.'});
      }
    }
    return next();
  };


  var checkSession = function(req, res, next) {
    log.info('checkSession %s %s %s', '(parameters masked)', req.url, req.method);
    // this could be header fields or post parameters
    var sessiontoken = req.header('X-Tidepool-Session-Token');
    if (sessiontoken === undefined)
    {
      res.send(400, 'X-Tidepool-Session-Token header is required.');
    }
    else
    {
      var token = unpackSessionToken(sessiontoken);
      if (token) {
        res.send(200);
      } else {
        res.send(400, {response:'Token invalid or expired.'});
      }
    }
    return next();
  };


  // this is a stupid simple userid generation by creating a hash from the username
  // and password given. If either one changes, it will be a different hash. 
  var login = function(req, res, next) {
    log.info('login', '(parameters masked)', req.url, req.method);
    if (!(req.params.username && req.params.password))
    {
      res.send(400, 'Both username and password are required.');
    }
    else
    {
      var hash = crypto.algo.SHA1.create();
      hash.update(req.params.username);
      hash.update(req.params.password);
      res.send({username: req.params.username, userid: hash.finalize().toString()});
    }
    return next();
  };


  // We need to have sensible responses for all the standard verbs, so we've got a system that makes
  // it easy to reuse the same handlers for different verbs.

  // API
  // every individual is a user. users have a unique id which they normally don't see; they
  // identify with their username. Users may have the doctor bit set; if so, they'll see
  // any doctor-specific features, and they can be searched for when a patient is setting
  // up an account.
  // Users may also have the patient bit set; if they do, there is an event stream set up for them.

  // /login -- returns token, must be sent back in headers for maintaining connection
  // /profile -- gets/sets user profile data for logged-in user
  // /profile/:username -- gets public profile info from other user
  // /users/:namepat -- gets list of public usernames that match a pattern
  // /users/adduser


  var v01api = [
    { verbs: ['get', 'post', 'put', 'del', 'head'], path: '/echo', func: echo },
    { verb: 'get', path: '/status', func: status },
    //{ verbs: ['get', 'post'], path: '/login', func: login },
    { verb: 'post', path: '/user/login', func: authPost },
    { verb: 'get', path: '/user/login', func: checkSession }
  ];

  // helper function to set up one endpoint for one verb
  var doVerb = function(verb, path, version, func) {
    server[verb]({path: path, version: version }, func);
  };

  // installs all the items defined in a version of the API
  var installAPI = function(api, version) {
    _.each(api, function(elt, idx, list) {
      if (elt.verbs) {
        _.each(elt.verbs, function(verb) {
          doVerb(verb, elt.path, version, elt.func);
        });
      }
      else if (elt.verb) {
        doVerb(elt.verb, elt.path, version, elt.func);
      }
    });
  };
  installAPI(v01api, '0.1.1');

  return {
    server: server,
    secret: secret
    /*,
    installAPI: installAPI
    */
  };

// Wrap up the javascript namespacing model.
})();

