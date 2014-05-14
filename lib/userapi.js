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

// We use strict because we're only worried about modern browsers and we should be strict.
// JSHint actually insists on this and it's a good idea.
'use strict';

module.exports = function (envConfig, userService) {
  // we need a functional logging service, and we
  // tell it what file we're using (or just supply a logger)
  var log = envConfig.logger || require('./log.js').createLogger(envConfig.logName);

  // helpful utilities
  var util = require('util');
  var restify = require('restify');
  var _ = require('lodash');
  var moment = require('moment');

  // JWT-simple is an implementation of the Java Web Token standard
  var jwt = require('jwt-simple');

  ////////////// HELPER FUNCTIONS ///////////////////

  var saltDeploy = envConfig.saltDeploy;
  var secret = envConfig.apiSecret;
  var metrics = null;

  ////////////// HELPER FUNCTIONS ///////////////////

  var setMetrics = function(metrix) {
    metrics = metrix;
  };

  var postThisUser = function(event, parms, token) {
    if (metrics) {
      metrics.postThisUser(event, parms, token);
    }
  };

  var postWithUser = function(userid, event, parms, token) {
    if (metrics) {
      metrics.postWithUser(userid, event, parms, token);
    }
  };

  var postServer = function(event, parms, token) {
    if (metrics) {
      metrics.postServer(event, parms, token);
    }
  };

  var setSalt = function (salt) {
    log.info('deployment salt value was set');
    saltDeploy = salt;
  };

  // this generates a temporary hash code that is good for a specific
  // period of time
  // we need the ability to limit app usage to certain groups; it probably has to
  // do with matching metadata in an app token to metadata on a user
  var getSessionToken = function (userid, duration, isServer) {
    if (!userid) {
      return null;
    }

    // duration is in seconds
    if (duration == null) {
      // if duration wasn't specified
      duration = 60 * 60 * 1; // token lasts for 1 hour
      // unless you're a server
      if (isServer) {
        duration = 60 * 60 * 24;
      } // server tokens last a day
    }
    // NOTE: This log call is required for testing!
    log.info('Creating token with duration of %d seconds.', duration);
    // someday we'll allow configurable durations based on user id
    if (duration > 0) {
      var sessiontoken = jwt.encode({
        usr: userid,
        exp: moment().add('seconds', duration).valueOf(),
        svr: isServer ? 'yes' : 'no',
        dur: duration
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
      log.info('Stale token[%s] for user[%s]!', token, unpacked.usr);
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

  var upsertToken = function (/* newtoken, oldtoken, done */) {
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
    if (!hasall(req.params, ['username', 'emails', 'password'])) {
      res.send(400, 'Missing data fields');
      return next();
    }

    userService.addUser(req.params, function (err, result) {
      if (err != null) {
        if (err.statuscode != null) {
          result = err;
        } else {
          log.warn(err, 'Unable to add user[%s] to mongo!', req.params.username);
          res.send(500);
          return next();
        }
      }
      if (result.statuscode == 201) {
        var sessiontoken = getSessionToken(result.detail.userid, req.tokenduration);
        upsertToken(sessiontoken, function (err, stored) {
          res.header('x-tidepool-session-token', sessiontoken);
          res.send(result.statuscode, result.detail);
          postThisUser('usercreated', {}, sessiontoken);
          return next();
        });
      } else {
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  var updateUser = function (req, res, next) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (!sessiontoken) {
      res.send(401, 'Unauthorized'); // not authorized
      return next();
    }

    var data = unpackSessionToken(sessiontoken);
    var theuser = null;
    if (data.svr === 'yes') { // we have a server token, so allow any userid if specified
      theuser = req.params.userid || data.usr;
      postWithUser(theuser, 'userupdated', {server: true}, sessiontoken);
    } else {  // if it's a user token, only the current user is permitted
      theuser = data.usr;
      postThisUser('userupdated', {server: false}, sessiontoken);
    }

    if (!req.params.updates) {
      res.send(400, 'Missing updates field');
      return next();
    }

    userService.updateUser(theuser, req.params.updates, function (err, result) {
      if (err != null) {
        res.send(err.statuscode, err);
      } else {
        res.send(result.statuscode, result.detail);
      }
      return next();
    });
  };

  var getUserInfo = function (req, res, next) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (sessiontoken) {
      var data = unpackSessionToken(sessiontoken);
      var uid = req.params.userid || data.usr; // userid if specified, current user if not
      var searchparms = {};
      if (data.svr === 'yes') { // we have a server token, so do a general search
        searchparms.user = uid;
        postWithUser(uid, 'getuserinfo', {server: true}, sessiontoken);
      } else {  // if it's a user token, only a user search is permitted
        searchparms.userid = uid;
        postThisUser('getuserinfo', {server: false}, sessiontoken);
      }
      userService.getUser(
        searchparms,
        function (err, result) {
          if (result.statuscode == 200) {
            // something was found, let's make sure it's unique
            if (result.detail.length != 1) {
              res.send(500, 'failed to find logged in user!');
            } else {
              res.send(result.statuscode, result.detail[0]);
            }
          } else {
            res.send(result.statuscode, result.msg);
          }
          return next();
        }
      );
    } else {
      res.send(401, 'Unauthorized'); // not authorized
    }
    return next();
  };

  var setDeleteFlag = function (req, res, next) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (sessiontoken == null) {
      res.send(401, 'Unauthorized'); // not authorized to make changes without a session
    }

    var tokenData = unpackSessionToken(sessiontoken);
    // we can only set a delete flag if we're a server
    // we need to require the password since a user should be able to set only their own delete flag
    var uid = null;
    if (tokenData.srv === 'yes') {
      uid = req.params.userid;
      postWithUser(uid, 'setdeleteflag', {server: true}, sessiontoken);
    } else {
      uid = tokenData.usr;
      postThisUser('setdeleteflag', {server: false}, sessiontoken);
    }

    // let's verify the user's password
    var pw = req.params.password;
    if (pw == null || uid == null) {
      res.send(403);
      return next();
    }

    // TODO: What HTTP methods do we want to utilize here? The POST/PUT scenario is kludgey at best.
    switch (req.method) {
      case 'POST':
        // TODO: Sundial wrapper or moment.js for date? It'll need to stay uniform across the API.
        userService.updateUser(uid, {deleteflag: new Date().toISOString()}, function (err, result) {
          if (err != null) {
            log.error('Unable to set delete flag', err);
            res.send(err.statuscode, err);
          } else {
            log.info('Set delete flag', result);
            res.send(result.statuscode, result.detail);
          }
          return next();
        });
        break;

      case 'PUT':
        userService.updateUser(uid, {deleteflag: ''}, function (err, result) {
          if (err != null) {
            log.error('Unable to unset delete flag', err);
            res.send(err.statuscode, err);
          } else {
            log.info('Unset delete flag', result);
            res.send(204, result.detail);
          }
          return next();
        });
        break;

      default:
        log.warn('Bad HTTP method used', req.method);
        res.send(405); //sending 405 - request method not supported by resource
    }
  };

  var deleteUser = function (req, res, next) {
    var sessiontoken = req.headers['x-tidepool-session-token'];
    if (sessiontoken == null) {
      res.send(401, 'Unauthorized'); // not authorized
      return next();
    }

    var tokenData = unpackSessionToken(sessiontoken);
    // we can delete a specified user only if we're a server
    // we still require a password since only users should be able to delete tokenData
    var uid = null;
    if (tokenData.svr === 'yes') {
      uid = req.params.userid;
      postWithUser(uid, 'deleteuser', {server: true}, sessiontoken);
    } else {
      uid = tokenData.usr;
      postThisUser('deleteuser', {server: false}, sessiontoken);
    }
    var pw = req.params.password;
    if (pw == null || uid == null) {
      res.send(403);
      return next();
    }
    userService.deleteUser({ userid: uid, password: pw }, function (err, result) {
      if (tokenData.svr !== 'yes') {
        // if it was a user token, get rid of it
        userService.deleteToken(sessiontoken, function () {});
      }
      if (err) {
        res.send(err.statuscode, err.msg);
      } else {
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  // login endpoint for humans
  var login = function (req, res, next) {
    if (req.authorization == null || req.authorization.basic == null) {
      res.send(400, 'Missing login information');
    }

    var user = req.authorization.basic.username;
    var pw = req.authorization.basic.password;

    if (!(user && pw)) {
      res.send(400, 'Missing login information');
      return next();
    }

    var userinfo = { user: user, password: pw };
    userService.getUser(userinfo, function (err, result) {
      if (result.statuscode == 200) {
        // something was found, let's make sure it's unique
        if (result.detail.length != 1) {
          log.warn('login failed because it returned more than one result for user ', user.userinfo);
          res.send(401, 'login failed');
        } else {
          // we're good, create a token
          var sessiontoken = getSessionToken(result.detail[0].userid, req.tokenduration);
          upsertToken(sessiontoken, function (err, stored) {
            res.header('x-tidepool-session-token', sessiontoken);
            res.send(result.statuscode, _.pick(result.detail[0], 'userid', 'username', 'emails'));
            postThisUser('userlogin', {}, sessiontoken);
            return next();
          });
        }
      } else if (result.statuscode == 204) {
        res.send(401, 'login failed');
      } else {
        log.warn('should never get here! in login method');
        res.send(result.statuscode, result.msg);
      }
      return next();
    });
  };

  // login endpoint for machines
  var serverLogin = function (req, res, next) {
    if (!envConfig.serverSecret) {
      log.warn('Machine login attempted but not supported in this installation.');
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
      var sessiontoken = getSessionToken(server, req.tokenduration, true);
      upsertToken(sessiontoken, function (err, stored) {
        res.header('x-tidepool-session-token', sessiontoken);
        res.send(200, 'machine login');
        postServer('serverlogin', {}, sessiontoken);
        return next();
      });
    } else {
      log.warn('Machine login attempted with bad login info. server[%s], host[%s]', server, req.connection.remoteAddress);
      res.send(401, 'Server identity not validated!');
      return next();
    }
  };

  var refreshSession = function (req, res, next) {
    verifyToken(req, function (err, result) {
      if (result.statuscode == 200) {
        var response = {
          userid: result.data.usr
        };
        // if a usr token is long-duration, it's not renewable, so just return it
        if (result.data.svr !== 'yes' && result.data.dur > 60 * 60 * 2) {
          res.header('x-tidepool-session-token', result.token);
          res.send(200, response);
          return next();
        }

        var newtoken = getSessionToken(result.data.usr, req.tokenduration, (result.data.svr === 'yes'));
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

  // this is middleware designed to check that the longterm key, if supplied,
  // is valid. If valid, req.tokenduration is set to a duration value in sec
  var validateLongterm = function (req, res, next) {
    if (req.params.longtermkey != null && req.params.longtermkey === envConfig.longtermkey) {
      req.tokenduration = 30 * 24 * 60 * 60; // 30 days
    }
    return next();
  };

  // this is middleware designed to check that the token supplied is a server token
  var requireServerToken = function (req, res, next) {
    var servertoken = req.headers['x-tidepool-session-token'];
    if (servertoken) {
      var server = unpackSessionToken(servertoken);
      if (server && (server.svr === 'yes')) {
        return next();
      } else {
        res.send(401, 'Unauthorized');
        res.end();
        return next(false);
      }
    }
  };


  // check token endpoint for machines
  var serverCheckToken = function (req, res, next) {
    var data = unpackSessionToken(req.params.token);
    if (data) {
      res.send(200, {
        userid: data.usr,
        isserver: (data.svr === 'yes')
      });
      return next();
    } else {
      res.send(404, 'Token not found');
      return next();
    }
  };

  var logout = function (req, res, next) {
    verifyToken(req, function(err, result) {
      if (err != null) {
        log.warn(err, 'Unable to verify token.');
      }
      if (result.statuscode == 200) {
        userService.deleteToken(result.token, function(err, result) {
          if (err != null) {
            log.warn(err, 'Unable to delete token.');
          }
          if (result.statuscode != 200) {
            log.warn('Received non-200 status code [%s] from deleteToken', result.statuscode);
          }
        });
      }
      res.send(200);
      return next();
    });
  };

  var anonymousIdHashPair = function (req, res, next) {
    var strings = [envConfig.saltDeploy];
    _.each(req.query, function (value, key, list) {
      strings.push(key);
      strings.push(value);
    });

    userService.generateUniqueHash(strings, 10, function (result) {
      userService.generateUniqueHash(strings, 24, function (result2) {
        res.send(200, {name: '', id: result, hash: result2});
        return next();
      });
    });
  };

  // GET -- return hash pair previously calculated for this user & name
  // POST -- generate a new hash pair for this user & name; error 422 if it exists
  // PUT -- generate a new hash pair for this user & name and update existing one; error 404 if it doesn't exist
  // DELETE -- remove a hash pair for this user & name
  var manageIdHashPair = function (req, res, next) {
    var strings = [envConfig.saltDeploy, req.params.key, req.params.userid];
    _.each(req.query, function (value, key, list) {
      strings.push(key);
      strings.push(value);
    });

    userService.getUser({userid: req.params.userid }, function (err, item) {
      if (item.statuscode != 200) {
        res.send(item.statuscode, 'getUser failed');
        return;
      }

      function addPair(successStatus) {
        userService.generateUniqueHash(strings, 10, function (result) {
          userService.generateUniqueHash(strings, 24, function (result2) {
            var updates = {};
            var pair = {id: result, hash: result2 };
            updates['private.' + req.params.key] = pair;

            userService.updateUser(userinfo.userid, updates, function (err, updated) {
              if (err != null) {
                res.send(500, 'Update No Good');
                return next();
              }

              res.send(successStatus, updated.detail.private[req.params.key]);
              return next();
            });
          });
        });
      }

      var userinfo = item.detail[0];
      var servertoken = req.headers['x-tidepool-session-token'];
      postWithUser(userinfo.userid, 'manageprivatepair', {verb: req.method}, servertoken);

      switch (req.method) {
        case 'GET':
          if (userinfo.private && userinfo.private[req.params.key]) {
            res.send(200, userinfo.private[req.params.key]);
          } else {
            addPair(200);
          }
          return next();
        case 'POST':
        case 'PUT':
          addPair(201);
          break;
        case 'DELETE':
          res.send(501, 'manageIdHashPair delete case');
          break;
        default:
          res.send(400, util.format('Unknown HTTP method[%s]', req.method));
          break;
      }
      return next();
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
    { path: '/status', verb: 'get', func: status},
    { path: '/user', verb: 'post', func: createUser},
    { path: '/user', verb: 'get', func: getUserInfo},
    { path: '/user', verb: 'del', func: deleteUser},
    { path: '/user', verb: 'put', func: updateUser},
    { path: '/user/:userid', verb: 'get', func: getUserInfo },
    { path: '/user/:userid', verb: 'del', func: deleteUser },
    { path: '/user/:userid', verb: 'put', func: updateUser },
    { path: '/login', verb: 'post', func: [ restify.authorizationParser(), login ] },
    { path: '/login', verb: 'get', func: refreshSession },
    { path: '/login/:longtermkey', verb: 'post', func: [ restify.authorizationParser(), validateLongterm, login ] },
    { path: '/serverlogin', verb: 'post', func: serverLogin },
    { path: '/token/:token', verb: 'get',
      func: [requireServerToken, serverCheckToken] },
    { path: '/logout', verb: 'post', func: logout },
    { path: '/private', verb: 'get', func: anonymousIdHashPair },
    { path: '/private/:userid/:key/', verbs: ['get', 'post', 'del', 'put'],
      func: [requireServerToken, manageIdHashPair] },
    { path: '/user/:userid/deleteflag', verbs: ['post', 'put'], func: setDeleteFlag}
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
    setMetrics: setMetrics,
    secret: secret, // this is set by the client
    salt: setSalt // this is set by the client
  };
};