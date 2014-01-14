// db_mongo.js
// -----------
// module to provide access to a database
// this one uses mongo

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

'use strict';

// This is how you make a module loadable by node as well as require.
if (typeof define !== 'function') {
  var define = require('amdefine')(module);
}

// And now we define our dependencies and give them names
define(['lodash', 'moment', 'mongojs', 'crypto-js'], function(_, moment, mongojs, crypto) {
  // These are our internal state variables
  var db;
  var cfg;
  var _status = { running: false, deps: { up: [], down: [] } };
  var log;

  // this is a special function that is used in testing
  var _wipeTheEntireDatabase = function(done) {
    db.collectionNames('users', function(err, result) {
      if (err) {
        log.error('collectionNames failed');
        done(err, null);
      } else {
        if (result.length !== 0) {
          db.users.drop(done);
        } else {
          done();
        }
      }
    });
  };

  var status = function(done) {
    _status.running = (_status.deps.down.length === 0);
    _status.statuscode = _status.running ? 200 : 500;
    done(null, _status);
  };

  var hashpw = function(userid, pw) {
    var hash = crypto.algo.SHA1.create();
    if (pw) hash.update(pw);
    hash.update(cfg.saltDeploy);
    hash.update(userid);
    return hash.finalize().toString();
  };

  var cleanupUserdata = function(userdata) {
    delete userdata._id;
    delete userdata.pwhash;
  };

  // This looks up a user and returns user data
  // It checks a password if specified but if it's not specified returns results anyway
  // (which lets it be used to query for user records)
  // It's the responsibility of the caller to ensure that login actually does validate
  // the password.
  var getUser = function(userdata, done) {
    var userquery;
    if (!(userdata.user || userdata.userid || userdata.username || userdata.emails)) {
      log.error('userdata query bad -- ', userdata);
      done({statuscode: 400, msg: 'User identifier not provided.' });
      return;
    }
    // if they only specified user, search for any match
    if (userdata.user) {
      userquery = { $or: [
          { userid: userdata.user },
          { username: userdata.user },
          { emails: userdata.user }
        ]};
    } else {
      // if they specified specific fields, return all matches
      userquery = { $or: [] };
      if (userdata.userid) userquery.$or.push({userid: userdata.userid});
      if (userdata.username) userquery.$or.push({username: userdata.username});
      if (userdata.emails) userquery.$or.push({emails: userdata.emails});
    }

    db.users.find(userquery, function(err, items) {
      if (err) {
        done({ statuscode: 500, msg: 'Error from mongodb', detail: err });
        log.error('Error from mongodb: ', err);
        return;
      }

      if (items.length === 0) {
        // if nothing was found
        done(null, { statuscode: 204, msg: 'User not found', detail: userdata.user });
        return;
      }

      if (items.length == 1) {
        // one thing found, so check if pw was specified
        if (userdata.password) {
          if (items[0].pwhash !== hashpw(items[0].userid, userdata.password)) {
            // there was a pw and it didn't match
            done(null, { statuscode: 204, msg: 'User not found', detail: userdata.user });
            return;
          }
        }

        // either there was no pw specified or it successfully matched, so return 
        // the record (in a one-element list)
        // after wiping out the password that was returned and the local mongo id field.
        cleanupUserdata(items[0]);
        done(null, { statuscode: 200, msg: 'User found.', detail: items });
        return;
      } else {
        // There were multiple matches in the database. This should only happen if your query
        // had multiple emails, or you specified email, username, userid from different users.
        // But we support it.
        _.each(items, cleanupUserdata);
        done(null, { statuscode: 200, msg: 'Multiple users found.', detail: items });
        return;
      }
    });
  };

  var generateUniqueHash = function recursiveGenerator(strings, len, key, callback) {
    // use moment to generate a string we can use for helping with the hash if 
    // any fields are empty
    var hash = crypto.algo.SHA1.create();
    _.each(strings, function(s) {
      if (s) hash.update(s);
    });
    hash.update(moment().valueOf().toString());  // this changes every millisecond so should give us a new value if we recur
    var id = hash.finalize().toString().substr(0, len);
    var query = {};
    query[key] = id;
    db.users.findOne(query, function(err, result) {
      if (result) {
        log.info('Hash collision in generateUniqueUserID!');
        recursiveGenerator(strings, len, key, callback);
      } else {
        callback(id);
      }
    });
  };

  var generateUniqueUserData = function(userdata, callback) {
    generateUniqueHash(['id', userdata.username, userdata.password], 10, 'userid', function(id) {
      generateUniqueHash(['hash', userdata.username, userdata.password, id], 24, 'userhash', function(hash) {
        callback(id, hash);
      });
    });
  };

  // This adds a user, given a block of userdata; the callback gets the created user info
  // (minus the password hash)
  var addUser = function(userdata, done) {
    // to create a user, we need a block of userdata that includes at least:
    // userid, emails, pw
    //   OR
    // userid, ownerid
    // if (!_.has(userdata, 'userid') || !_.has(userdata, 'pwhash') || !_.has(userdata, 'email'))
    // {
    //   done({ success: false, status: 'Error', message: 'userid, pwhash, and email fields are all required' });
    //   return;
    // }


    var query = _.pick(userdata, 'username', 'emails');
    getUser(query, function(err, result) {
      if (err) {
        done(err);
        return;
      } else if (result.statuscode == 200) {
        done({ statuscode: 400, msg: 'userid or emails were not unique -- please try again.'});
      } else if (result.statuscode == 204) {
        generateUniqueUserData(userdata, function(userid, userhash) {
          var data = _.clone(userdata);
          delete data.password;
          data.userid = userid;
          data.pwhash = hashpw(userid, userdata.password);
          data.userhash = userhash;
          // we assume that there are values for emails and ownerid

          db.users.insert(data, {w:1}, function(err, result) {
            // we return result[0] because we're only doing 1 thing
            var user = result[0];
            cleanupUserdata(user);
            done(null, { statuscode: 201, msg: 'User created.', detail: user });
          });
        });
      }
    });
  };

  // This deletes a user -- it requires either the user's password or 
  // a special administrative key that can be put into the configuration
  // The adminKey can't be blank.
  // Also, you MUST do it by userid.
  // We may not want to expose this, or we may want to move deleted records
  // to a 'deleted' container so we have the ability to undo deletions
  var deleteUser = function(userdata, done) {
    var userrecord = null;
    // if we got passed bad data, just quit.
    if (!userdata || !userdata.userid || !(userdata.password || userdata.adminKey)) {
      done({ statuscode: 401, msg: 'User/password not properly specified.'});
      return;
    }

    if (userdata.password) {
      userrecord = {userid: userdata.userid, pwhash: hashpw(userdata.userid, userdata.password) };
    } else if (userdata.adminKey == cfg.adminKey && cfg.adminKey !== '') {
      userrecord = {userid: userdata.userid };
    }

    // if neither password check succeeded, abort
    if (userrecord === null) {
      done({ statuscode: 401, msg: 'User/password not properly specified.'});
    } else {
      db.users.remove(userrecord, {w:1}, function(err, result) {
        if (result === 0) {
          done({ statuscode: 400, msg: 'User/password combination not found.', userid: userrecord.userid });
        } else if (result == 1) {
          done(null, { statuscode: 200, msg: 'User permanently deleted.', userid: userrecord.userid });
        } else {
          log.error('Somehow multiple users were deleted with userid ' + userrecord.userid);
          done(null, { statuscode: 200, msg: 'Multiple users were deleted!', userid: userrecord.userid });
        }
      });
    }
  };

  var storeToken = function(token, done) {
    var data = { _id: token, time: moment().valueOf() };
    db.tokens.insert(data, {w:1}, function(err, result) {
      done(null, { statuscode: 201, msg: 'Token saved.' });
    });
  };

  var findToken = function(token, done) {
    var data = { _id: token };
    db.tokens.find(data, {w:1}, function(err, result) {
      if (result.length) {
        done(null, { statuscode: 200, msg: 'Token retrieved.' });
      } else {
        done(null, { statuscode: 404, msg: 'Token not found.' });      
      }
    });
  };

  var deleteToken = function(token, done) {
    var data = { _id: token };
    db.tokens.remove(data, {w:1}, function(err, result) {
      if (result) {
        done(null, { statuscode: 200, msg: 'Token deleted.' });
      } else {
        done(null, { statuscode: 404, msg: 'Token not found.' });      
      }
    });
  };

  var ourexports = {
    status: status,
    getUser: getUser,
    addUser: addUser,
    deleteUser: deleteUser,
    storeToken: storeToken,
    findToken: findToken,
    deleteToken: deleteToken
  };


  // The init function takes a configuration object.
  // Config values supported are:
  //  mongoConnectionString -- a url-style string for mongo connect
  //  logger -- a log system -- expected to have info, error, warn methods 
  //  saltDeploy -- a salt value set in the deploy variables; this provides an additional
  //      layer of secret that must be known to decrypt the data if the database files were to leak.
  //  adminKey -- a key that can be used as a superuser key for managing records instead of the 
  //      user's password
  //  _wipeTheEntireDatabase -- if this is truthy, it will cause the init routine to return a function
  //      of the same name; this exists for testing and should not be used on a production database!
  var init = function(config) {
    log = config.logger;

    if (!config.saltDeploy) {
      throw 'A deploy salt MUST be specified!';
    }

    if (_status.running) {
      var msg = 'db_mongo init function called more than once!';
      log.warn(msg);
      return ourexports;
    }

    cfg = _.clone(config);
    db = mongojs(cfg.mongoConnectionString, ['users', 'tokens'], function(err) {
      log.error('error opening mongo');
      _status.deps.up = _.without(_status.deps.up, 'mongo');
      _status.deps.down = _.union(_status.deps.down, ['mongo']);
      return ourexports;
    });

    _status.deps.down = _.without(_status.deps.down, 'mongo');
    _status.deps.up = _.union(_status.deps.up, ['mongo']);

    // we'll only allow wipe if the connection string contains test
    if (cfg._wipeTheEntireDatabase && cfg.mongoConnectionString.match(/test/)) {
      ourexports._wipeTheEntireDatabase = _wipeTheEntireDatabase;
    }
    return ourexports;
  };

  // this is our constructor function
  return init;
});
