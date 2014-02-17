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

var util = require('util');

var restify = require('restify');

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
    jwt,
    log,
    moment,
    saltDeploy,
    secret;

  saltDeploy = envConfig.saltDeploy;
  secret = envConfig.apiSecret;

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
    if (!userid) {
      return null;
    }

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
      userService.getUser(
        { userid: uid },
        function (err, result) {
          if (result.statuscode == 200) {
            // something was found, let's make sure it's unique
            if (result.detail.length != 1) {
              res.send(500, 'failed to find logged in user!');
            } else {
              res.send(result.statuscode, result.detail[0]);
            }
          } else {
            log.info('should never get here! in getUserInfo method');
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
          log.info('login failed because it returned more than one result for user ', user.userinfo);
          res.send(401, 'login failed');
        } else {
          // we're good, create a token
          var sessiontoken = getSessionToken(result.detail[0].userid);
          upsertToken(sessiontoken, function (err, stored) {
            res.header('x-tidepool-session-token', sessiontoken);
            res.send(result.statuscode, _.pick(result.detail[0], 'userid', 'username', 'emails'));
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
        var newtoken = getSessionToken(result.data.usr, (result.data.svr === 'yes'));
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

  var _sendRecoveryEmail = function (emailaddr, userid, scramblecode, done) {
    var email   = require('emailjs/email');
    var emailserver  = email.server.connect({
      user:    envConfig.email_sender,
      password: envConfig.email_password,
      host:    envConfig.email_host,
      ssl:     true
    });

    var message = '' +
      'Hello. This message is being sent to you because this email address was used to \n' +
      'start the password recovery process at Tidepool.org. If you wish to create a\n' +
      'new password for your account, please click the link below, or cut and paste\n' +
      'it into a web browser:\n' +
      '\n' +
      'http://api.tidepool.io/passwordrecovery2/' + userid + '/' + scramblecode + '/\n' +
      '\n' +
      'This link expires automatically in 3 days. If you did not wish to change your\n' +
      'password, you can just ignore this message.\n' +
      '\n' +
      'Best regards,\n' +
      '    The Tidepool Robot\n';


    // send the message and get a callback with an error or details of the message that was sent
    emailserver.send({
      text:    message,
      from:    'Tidepool Robot <donotreply@tidepool.org>',
      to:      emailaddr,
      subject: 'Password Recovery message from Tidepool.org'
    }, done);
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

  var sendEmail = function(req, res, next) {
    _sendRecoveryEmail('kentquirk@gmail.com', function (err, message) {
      console.log(err || message);
      if (err) {
        res.send(400, message);
      } else {
        res.send(200, message);
      }
      return next();
    });
  };

  /*
  Password recovery:
    Here's the design thinking:

      * [x] The endpoint can't require a login to do this (or they wouldn't need it)
      * [x] It has to be self-contained within the user-api. We don't want to be accessing metadata.
      * [x] There's a password recovery endpoint that expects some sort of userid (email or username)
      * [ ] Hitting the password recovery endpoint should:
        * [x] Accept a userid or email address.
        * [x] Generate a password recovery email with a one-time link
        * [x] The ID for the one-time link should not be predictable
        * [x] If you used an email address for recovery, the email should go to the email address you used
          (which had to have already been in the user record). This allows password recovery if you 
          have primary and backup email and lose access to the primary.
        * [x] If you used a userid, the email will go to the primary email address.
        * [ ] The PW recovery link also can't require a login
        * [ ] Response to hitting the PW recovery link should indicate whether a user was found corresponding
          to that ID. (This can leak information about Tidepool account ownership but often, people 
          are using PW recovery to try to remember their account information.)
        * [ ] The link will expire if it's not used in a short period of time (3 days feels about right)
      * [ ] There must be some sort of record on the user account that a password recovery was attempted and when.
      * [ ] Logging in with the existing username/password will invalidate the PW recovery link
      * [ ] Clicking the PW recovery link should:
        * [ ] Force the user to create a new password
        * [ ] Store the password in the user record
        * [ ] Log the user in with it
        * [ ] Invalidate the recovery link
      * [ ] An invalid link should generate an "invalid link" message.
      * [ ] If PW recovery is attempted without having clicked a previous link, the previous link is invalidated.
      * [ ] If the user clicks the link but fails to complete the new password process, the link 
      is not invalidated. (user can try again later).
      * [ ] There should be a mechanism for Tidepool to force a user to create a new password (in case of
        a security breach). This should probably be something like deleting the password hash entirely and 
        returning a specific return code from a login (perhaps a 302, redirecting login attempts to the
        recovery screen).

    All of this has to go into the user-api because we don't want to be accessing metadata until we've
    validated a user.

    This means we need to add a new field. The pwrecovery field, if it exists, stores an object that 
    contains two subfields: key is the random recovery key that was generated by the first part of the recovery
    process, and expires is the last date/time for which the key is still valid.

  */

  var passwordRecovery = function (req, res, next) {
    userService.getUser({
        user: req.params.user
      },
      function (err, result) {
        if (result.statuscode == 200) {
          // something was found, let's make sure it's unique
          if (result.detail.length != 1) {
            res.send(400, 'user was not uniquely identified');
          } else {
            // we need a unique ID we can put in the link
            userService.generateUniqueHash([req.params.user, envConfig.saltDeploy, moment().valueOf()],
              8, function (linkid) {
                // now figure out what email address to use
                var idx = result.detail.emails.indexOf(req.params.user);
                if (idx === -1) idx = 0;
                var email = result.detail.emails[idx];
                _sendRecoveryEmail(email, result.detail.userid, linkid, function (err, message) {
                  console.log(err || message);
                  if (err) {
                    res.send(400, message);
                  } else {
                    res.send(200, message);
                  }
                  return next();
                });
              });
          }
        }
        return next();
      }
    );
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
    { path: '/status', verb: 'get', func: status },
    { path: '/sendemail/:address', verb: 'get', func: sendEmail },
    { path: '/passwordrecovery/:user', verb: 'get', func: passwordRecovery },
    { path: '/user', verb: 'post', func: createUser },
    { path: '/user', verb: 'get', func: getUserInfo },
    { path: '/user/:userid', verb: 'get', func: getUserInfo },
    { path: '/login', verb: 'post', func: [ restify.authorizationParser(), login ] },
    { path: '/login', verb: 'get', func: refreshSession },
    { path: '/serverlogin', verb: 'post', func: serverLogin },
    { path: '/token/:token', verb: 'get', func: [requireServerToken, serverCheckToken] },
    { path: '/logout', verb: 'post', func: logout },
    { path: '/private', verb: 'get', func: anonymousIdHashPair },
    { path: '/private/:userid/:key/', verbs: ['get', 'post', 'del', 'put'],
      func: [requireServerToken, manageIdHashPair] }
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