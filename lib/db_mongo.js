// module to provide access to a database
// this one uses mongo

'use strict';

if (typeof define !== 'function') {
  var define = require('amdefine')(module);
}

define(['lodash', 'mongojs'], function(_, mongojs) {
  var db;
  var cfg;

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
          // if (result.length != 0) {
          if (result.length != 0) {
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

  var getUserFromIdPw = function(id, pwhash) {
    // construct a query where either userid or any one of the emails can match
    var result = db.users.find({
      pwhash:pwhash,
      $or: [
        { userid:id },
        { emails:id }
      ]
    });
    if (result) {
      console.log(result);
      return result;
    } else {
      return null;
    }
  };

  var addUser = function(userdata, done) {
    if (!_.has(userdata, 'userid') || !_.has(userdata, 'pwhash') || !_.has(userdata, 'email'))
    {
      done({ success: false, status: 'Error', message: 'userid, pwhash, and email fields are all required' });
      return;
    }
    var x = db.users.findOne({ userid: userdata.userid }, function(err, result) {
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
    /*
    if (db.users.find({ userid: userdata.userid }).count()) {
      return { status: 'Error', message: 'userid is already in use' };
    }
    if (db.users.find({ emails: userdata.email }).count()) {
      return { status: 'Error', message: 'email is already in use' };
    }
    */

  // collection.insert(docs, {w:1}, function(err, result) {

  //   collection.find().toArray(function(err, items) {});

  //   var stream = collection.find({mykey:{$ne:2}}).stream();
  //   stream.on("data", function(item) {});
  //   stream.on("end", function() {});

  //   collection.findOne({mykey:1}, function(err, item) {});
    //done({ success: false, status: 'Error', message: "shouldn't get here!" });
  };

  var deleteUser = function(userdata, done) {
    var userrecord = null;
    if (userdata.pwhash) {
      userrecord = {userid: userdata.userid, pwhash: userdata.pwhash, };
    } else if (userdata.adminkey == cfg.adminkey && cfg.adminkey != '') {
      userrecord = {userid: userdata.userid };
    }

    if (userrecord == null) {
      done({ success: false, status: 'Error', message: 'Password not properly specified.'});
    } else {
      db.users.remove(userrecord, {w:1}, function(err, result) {
        if (result == 0) {
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

  return {
    init: init,
    getUserFromIdPw: getUserFromIdPw,
    addUser: addUser,
    deleteUser: deleteUser
  };
});
