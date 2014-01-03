// db_mongo.js
// -----------
// module to provide access to a database
// this one uses mongo

/*
 * == TIDEPOOL LICENSE ==
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
  var _status; // status code

  // The init function takes a configuration that specifies the mongo database URL. 
  // If the config also contains a truthy value called "_wipeTheEntireDatabase", it 
  // will also erase the entire contents of the 'users" collection on init. This is 
  // ONLY intended for testing and should never be used on a production database.
  var init = function(config, done) {
    cfg = config;
    db = mongojs(config.mongo_connection_string, ['users'], function(err, result) {
      console.log('error opening mongo');
      _status = false;
      done();
      return;
    });

    _status = true;

    // don't pass this config value in anything but test code
    if (config._wipeTheEntireDatabase)
    {
      db.collectionNames('users', function(err, result) {
        if (err) {
          console.log('collectionNames failed');
          done();
          return;
        } else {
          if (result.length !== 0) {
            db.users.drop(done);
          } else {
            done();
          }
        }
      });
    } else {
      done();
    }
  };

  var status = function() {
    // returns true if init completed properly
    return _status;
  };

  var hashpw = function(userid, pw) {
    var hash = crypto.algo.SHA1.create();
    if (pw) hash.update(pw);
    hash.update(cfg.salt_deploy);
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
      done({ success: false, status: 'Error', message: 'No query specified' });
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
      if (items.length === 0) {
        // if nothing was found
        done({ success: false, status: 'Error',
          message: 'User not found.', userid: userdata.user });
      } else if (items.length == 1) {
        // one thing found, so check if pw was specified
        if (userdata.pw && (userquery.pwhash !== hashpw(userquery.userid, userdata.pw))) {
          // there was a pw and it didn't match
          done({ success: false, status: 'Error',
            message: 'User not found.', userid: userdata.user });
        } else {
          // there was no pw specified, so just return the record
          // after wiping out the password that was returned and the local mongo id field.
          cleanupUserdata(items[0]);
          done({ success: true, status: 'Ok',
            message: 'User found.', user: items[0] });
        }
      } else {
        // There were multiple matches in the database. This is generally a bad thing.
        // But we support it in case you were looking for something kinda like what you have
        // We return success=true to indicate that multiple matches were found
        _.each(items, cleanupUserdata);
        done({ success: true, status: 'Multiple',
          message: 'Multiple matches were found!', userid: userquery.user, result: items });
      }
      return;
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
        console.log('Hash collision in generateUniqueUserID!');
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

    getUser(userdata, function(result) {
      if (result.success) // this is a bad thing, we found matches in the database
      {
        done({ success: false, status: 'Error',
          message: 'userid or emails were not unique -- please try again.'});
      } else {
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
            done({ success: true, status: 'Ok', message: 'User created.', user: user });
            return;
          });
        });
      }
    });
  };

  // This deletes a user -- it requires either the user's password or 
  // a special administrative key that can be put into the configuration
  // The adminkey can't be blank.
  // Also, you MUST do it by userid.
  // We may not want to expose this, or we may want to move deleted records
  // to a 'deleted' container so we have the ability to undo deletions
  var deleteUser = function(userdata, done) {
    var userrecord = null;
    // if we got passed bad data, just quit.
    if (!userdata || !userdata.userid || !(userdata.password || userdata.adminkey)) {
      done({ success: false, status: 'Error', message: 'User/password not properly specified.'});
      return;
    }

    if (userdata.password) {
      userrecord = {userid: userdata.userid, pwhash: hashpw(userdata.userid, userdata.password) };
    } else if (userdata.adminkey == cfg.adminkey && cfg.adminkey !== '') {
      userrecord = {userid: userdata.userid };
    }

    // if neither password check succeeded, abort
    if (userrecord === null) {
      done({ success: false, status: 'Error', message: 'User/password not properly specified.'});
    } else {
      db.users.remove(userrecord, {w:1}, function(err, result) {
        if (result === 0) {
          done({ success: false, status: 'Error',
            message: 'User/password combination not found.', userid: userrecord.userid });
        } else if (result == 1) {
          done({ success: true, status: 'Ok',
            message: 'User permanently deleted.', userid: userrecord.userid });
        } else {
          // should consider throwing in this situation
          done({ success: true, status: 'Error',
            message: 'Multiple users were deleted!', userid: userrecord.userid });
        }
      });
    }
  };


  // Here's the complete list of public members in the module.
  return {
    init: init,
    status: status,
    getUser: getUser,
    addUser: addUser,
    deleteUser: deleteUser
  };
});
