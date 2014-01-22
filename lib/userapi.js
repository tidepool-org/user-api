// userapi.js
// --------
// This is the user API module.
// 

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


module.exports = function (envConfig, userService) {
  // We use strict because we're only worried about modern browsers and we should be strict.
  // JSHint actually insists on this and it's a good idea.
  'use strict';

  // It's also a good idea to predeclare all variables at the top of a scope. Javascript doesn't
  // support block scoping so putting them all at the beginning helps make it obvious which vars
  // are intended to be module-level.
  var
  _,
    crypto,
    echo,
    jwt,
    log,
    moment,
    saltDeploy,
    secret;

  saltDeploy = envConfig.saltDeploy;
  secret = envConfig.secret;

  // and we need a functional logging service, and we
  // tell it what file we're using (or just supply a logger)
  log = envConfig.logger || require('./log.js').createLogger(envConfig.logName);

  // helpful utilities
  _ = require('lodash');
  moment = require('moment');

  crypto = require('crypto-js');

  // JWT-simple is an implementation of the Java Web Token standard
  jwt = require('jwt-simple');

  ////////////// HELPER FUNCTIONS ///////////////////

  var setSalt = function (salt) {
    log.info('deployment salt value was set');
    saltDeploy = salt;
  };

  // this generates a temporary hash code that is good for a specific
  // period of time
  // we need the ability to limit app usage to certain groups; it probably has to
  // do with matching metadata in an app token to metadata on a user
  var getSessionToken = function (userid, isServer) {
    if (!userid) return null;

    // duration is in seconds
    var duration = 60 * 60 * 1; // token lasts for 1 hour
    // unless you're a server
    if (isServer) {
      duration = 60 * 60 * 24;
    } // server tokens last a day
    // someday we'll allow configurable durations based on user id
    if (duration > 0) {
      var sessiontoken = jwt.encode({
        usr: userid,
        exp: moment().add('seconds', duration).valueOf(),
        svr: isServer ? 'yes' : 'no'
      }, secret);

      return sessiontoken;
    } else {
      return null;
    }
  };

  var unpackSessionToken = function (token) {
    var unpacked = jwt.decode(token, secret);
    if (parseInt(unpacked.exp, 10) > parseInt(moment().valueOf(), 10)) {
      return unpacked;
    } else {
      return null;
    }
  };

  var verifyToken = function (req, done) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (sessiontoken) {
      // This makes sure the token is in the database
      userService.findToken(sessiontoken, function (err, result) {
        if (result.statuscode == 200) {
          // and this makes sure it's still valid
          var data = unpackSessionToken(sessiontoken);
          done(null, {
            statuscode: 200,
            data: data,
            token: sessiontoken
          });
        } else {
          done(null, {
            statuscode: 401,
            msg: 'Session token required'
          });
        }
      });
    } else {
      done(null, {
        statuscode: 401,
        msg: 'Session token required'
      });
    }
  };

  var upsertToken = function ( /* newtoken, oldtoken, done */ ) {
    var newtoken = arguments[0];
    var oldtoken = null;
    var done = null;
    if (arguments.length == 3) {
      oldtoken = arguments[1];
      done = arguments[2];
    } else {
      done = arguments[1];
    }

    userService.storeToken(newtoken, function (err, stored) {
      if (oldtoken !== null) {
        userService.deleteToken(oldtoken, function (err, deleted) {
          return done();
        });
      } else {
        return done();
      }
    });
  };

  var hasall = function (object, keys) {
    var retval = true;
    _.each(keys, function (k) {
      if (!_.has(object, k)) {
        retval = false;
      }
    });
    return retval;
  };


  //////////////////// ENDPOINT IMPLEMENTATIONS ////////////////////

  // This function merely echoes everything it got as a block of text. Useful for debugging.
  echo = function (req, res, next) {
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

  // all our apis have a status function; this one lets you force a status code
  // with a parameter so we can test error handling
  var status = function (req, res, next) {
    if (req.params.status) {
      var statuscode = parseInt(req.params.status, 10);
      log.info('returning status ' + statuscode + ' by request');
      res.send(statuscode);
    } else {
      userService.status(function (err, result) {
        log.info('returning status ' + result.statuscode);
        res.send(result.statuscode, result.deps);
      });
    }
    return next();
  };

  var createUser = function (req, res, next) {
    // TODO: add owned accounts
    if (!hasall(req.params, ['username', 'emails', 'password'])) {
      res.send(400, 'Missing data fields');
      return next();
    }

    userService.addUser(req.params, function (err, result) {
      if (result.statuscode == 201) {
        var sessiontoken = getSessionToken(result.detail.userid);
        upsertToken(sessiontoken, function (err, stored) {
          res.header('x-tidepool-session-token', sessiontoken);
          res.send(result.statuscode, result.detail);
          return next();
        });
      } else {
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  var getUserInfo = function (req, res, next) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (sessiontoken) {
      var data = unpackSessionToken(sessiontoken);
      var uid = req.params.userid || data.usr; // userid if specified, current user if not
      userService.getUser({
        userid: uid
      }, function (err, result) {
        if (result.statuscode == 200) {
          // something was found, let's make sure it's unique
          if (result.detail.length != 1) {
            log.info(result.detail);
            res.send(500, 'failed to find logged in user!');
          } else {
            res.send(result.statuscode, result.detail[0]);
          }
        } else {
          log.info('should never get here! in getUserInfo method');
          res.send(result.statuscode, result.msg);
        }
        return next();
      });
    } else {
      res.send(401, 'Unauthorized'); // not authorized
    }
    return next();
  };

  // login endpoint for humans
  var login = function (req, res, next) {
    var user = req.headers['x-tidepool-userid'];
    var pw = req.headers['x-tidepool-password'];

    if (!(user && pw)) {
      res.send(400, 'Missing login information');
      return next();
    }

    var userinfo = {
      user: user,
      password: pw
    };
    userService.getUser(userinfo, function (err, result) {
      if (result.statuscode == 200) {
        // something was found, let's make sure it's unique
        if (result.detail.length != 1) {
          log.info('login failed because it returned more than one result for user ', user.userinfo);
          res.send(401, 'login failed');
        } else {
          // we're good, create a token
          var sessiontoken = getSessionToken(result.detail[0].userid);
          upsertToken(sessiontoken, function (err, stored) {
            res.header('x-tidepool-session-token', sessiontoken);
            res.send(result.statuscode, result.msg);
            return next();
          });
        }
      } else if (result.statuscode == 204) {
        res.send(401, 'login failed');
      } else {
        log.info('should never get here! in login method');
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  // login endpoint for machines
  var serverLogin = function (req, res, next) {
    if (!envConfig.serverSecret) {
      log.warn('Machine login attempted but not supported');
      res.send(400, 'Machine login not supported!');
      return next();
    }

    var server = req.headers['x-tidepool-server-name'];
    var pw = req.headers['x-tidepool-server-secret'];

    if (!(server && pw)) {
      log.warn('Machine login attempted with missing information');
      res.send(400, 'Missing login information');
      return next();
    }

    if (pw === envConfig.serverSecret) {
      // we're good, create a token
      var sessiontoken = getSessionToken(server, true);
      upsertToken(sessiontoken, function (err, stored) {
        res.header('x-tidepool-session-token', sessiontoken);
        res.send(200, 'machine login');
        return next();
      });
    } else {
      log.warn('Machine login attempted with bad login info');
      res.send(401, 'Server identity not validated!');
      return next();
    }
  };

  var checkSession = function (req, res, next) {
    verifyToken(req, function (err, result) {
      if (result.statuscode == 200) {
        var response = {
          userid: result.data.usr
        };
        var newtoken = getSessionToken(result.data.usr);
        upsertToken(newtoken, result.token, function (err, stored) {
          res.header('x-tidepool-session-token', newtoken);
          res.send(200, response);
          return next();
        });
      } else {
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  // check token endpoint for machines
  var serverCheckToken = function (req, res, next) {
    log.info('serverCheckToken', req.method);

    var servertoken = req.headers['x-tidepool-session-token'];
    if (servertoken) {
      var server = unpackSessionToken(servertoken);
      if (server && (server.svr === 'yes')) {
        var data = unpackSessionToken(req.params.token);
        if (data) {
          res.send(200, {
            userid: data.usr
          });
          return next();
        } else {
          res.send(404, 'Token not found');
          return next();
        }
      }
    }

    res.send(401, 'Unauthorized');
    return next();

  };

  var logout = function (req, res, next) {
    verifyToken(req, function (err, result) {
      if (result.statuscode == 200) {
        userService.deleteToken(result.token, function (err, result) {
          res.send(result.statuscode);
          return next();
        });
      } else {
        res.send(result.statuscode, result.msg);
        return next();
      }
    });
  };

  // We need to have sensible responses for all the standard verbs, so we've got a system that makes
  // it easy to reuse the same handlers for different verbs.

  // API
  // every individual is a user. users have a unique id which they normally don't see; they
  // identify with their username. Users may have the doctor bit set; if so, they'll see
  // any doctor-specific features, and they can be searched for when a patient is setting
  // up an account.
  // Users may also have the patient bit set; if they do, there is an event stream set up for them.
  var v01api = [
    { path: '/echo', verbs: ['get', 'post', 'put', 'del', 'head'], func: echo },
    { path: '/status', verb: 'get', func: status },
    { path: '/user', verb: 'post', func: createUser },
    { path: '/user', verb: 'get', func: getUserInfo },
    { path: '/user/:userid', verb: 'get', func: getUserInfo },
    { path: '/login', verb: 'post', func: login },
    { path: '/login', verb: 'get', func: checkSession },
    { path: '/serverlogin', verb: 'post', func: serverLogin },
    { path: '/token/:token', verb: 'get', func: serverCheckToken },
    { path: '/logout', verbs: ['post'], func: logout }
  ];

  // helper function to set up one endpoint for one verb
  var doVerb = function (server, verb, path, version, func) {
    server[verb]({
      path: path,
      version: version
    }, func);
  };

  // installs all the items defined in a version of the API
  var installAPI = function (server, api, version) {
    _.each(api, function (elt, idx, list) {
      if (elt.verbs) {
        _.each(elt.verbs, function (verb) {
          doVerb(server, verb, elt.path, version, elt.func);
        });
      } else if (elt.verb) {
        doVerb(server, elt.verb, elt.path, version, elt.func);
      }
    });
  };

  return {
    attachToServer: function (restifyServer) {
      installAPI(restifyServer, v01api, '0.1.2');
    },
    secret: secret, // this is set by the client
    salt: setSalt // this is set by the client
    /*,
    installAPI: installAPI
    */
  };
};