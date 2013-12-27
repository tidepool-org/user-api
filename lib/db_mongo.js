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
define(['lodash', 'mongojs'], function(_, mongojs) {
  // These are our internal state variables
  var db;
  var cfg;

  // The init function takes a configuration that specifies the mongo database URL. 
  // If the config also contains a truthy value called "_wipeTheEntireDatabase", it 
  // will also erase the entire contents of the 'users" collection on init. This is 
  // ONLY intended for testing and should never be used on a production database.
  var init = function(config, done) {
    cfg = config;
    db = mongojs(config.mongo_connection_string, ['users'], function(err, result) {
      console.log('error opening mongo');
      done();
      return;
    });

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

  // This adds a user, given a block of userdata; the callback gets the created user info
  // (minus the password hash)
  var addUser = function(userdata, done) {
    if (!_.has(userdata, 'userid') || !_.has(userdata, 'pwhash') || !_.has(userdata, 'email'))
    {
      done({ success: false, status: 'Error', message: 'userid, pwhash, and email fields are all required' });
      return;
    }
    db.users.findOne({ userid: userdata.userid }, function(err, result) {
      if (!result) {    // this is the case we actually want -- we don't want there to be a record
        var extras = userdata.extras || {};

        var userrecord = {
          userid: userdata.userid,
          pwhash: userdata.pwhash,
          emails: [ userdata.email ],
          extras: extras
        };
        db.users.insert(userrecord, {w:1}, function(err, result) {
          // we return result[0] because we're only doing 1 thing
          var user = {
            userid: result[0].userid,
            emails: result[0].emails,
            extras: result[0].extras,
            _id: result[0]._id
          };
          done({ success: true, status: 'Ok', message: 'User created.', user: user });
          return;
        });
      } else {
        done({ success: false, status: 'Error', message: 'That userid already exists.' });
        return;
      }
    });
  };

  // This deletes a user -- it requires either the user's password or 
  // a special administrative key that can be put into the configuration
  // The adminkey can't be blank.
  // We may not want to expose this, or we may want to move deleted records
  // to a 'deleted' container so we have the ability to undo deletions
  var deleteUser = function(userdata, done) {
    var userrecord = null;
    if (userdata.pwhash) {
      userrecord = {userid: userdata.userid, pwhash: userdata.pwhash };
    } else if (userdata.adminkey == cfg.adminkey && cfg.adminkey !== '') {
      userrecord = {userid: userdata.userid };
    }

    // if neither password check succeeded, abort
    if (userrecord === null) {
      done({ success: false, status: 'Error', message: 'Password not properly specified.'});
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
        return;
      });
    }
  };

  // This looks up a user and returns user data
  // Currently, it uses a password if specified but
  // if it's NOT specified returns results anyway. Something there
  // needs to change.
  var getUser = function(userdata, done) {
    var userquery = { $or: [
        { userid: userdata.user },
        { emails: userdata.user }
      ]
    };

    if (userdata.pwhash) {
      userquery.pwhash = userdata.pwhash;
    }

    db.users.find(userquery, { pwhash: 0 }, function(err, items) {
      if (items.length === 0) {
        done({ success: false, status: 'Error',
          message: 'User not found.', userid: userquery.user });
      } else if (items.length == 1) {
        done({ success: true, status: 'Ok',
          message: 'User found.', user: items[0] });
      } else {
        // should consider throwing in this situation
        done({ success: true, status: 'Error',
          message: 'Multiple users were found!', userid: userquery.user, result: items });
      }
      return;
    });
  };

  // Here's the complete list of public members in the module.
  return {
    init: init,
    getUser: getUser,
    addUser: addUser,
    deleteUser: deleteUser
  };
});
