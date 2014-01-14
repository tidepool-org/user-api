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

var expect = require('chai').expect;
var dbmongo = require('../lib/db_mongo.js')({
        mongoConnectionString: 'mongodb://localhost/test',
          // the special config value we pass for testing will enable us to wipe the database
          _wipeTheEntireDatabase: true,
          adminKey: 'specialkey',
          saltDeploy: 'randomsaltvalue',
          logger: { error: console.log, warn: console.log, info: console.log}
        });

var shouldSucceed = function(err, result, code) {
  if (err) {
    console.log(err);
  }
  expect(err).to.not.exist;
  expect(result).to.exist;
  expect(result.statuscode).to.equal(code);
};

var shouldFail = function(err, result, code) {
  if (result) {
    console.log(result);
  }
  expect(result).to.not.exist;
  expect(err).to.exist;
  expect(err.statuscode).to.equal(code);
  expect(err.msg).to.exist;
};



describe('dbmongo:', function() {
  describe('db_mongo basics', function() {
    it('should have an app', function() {
      expect(dbmongo).to.exist;
    });
    it('should have status method', function() {
      expect(dbmongo).to.respondTo('status');
    });
    it('should have addUser method', function() {
      expect(dbmongo).to.respondTo('addUser');
    });
    it('should have getUser method', function() {
      expect(dbmongo).to.respondTo('getUser');
    });
    it('should have deleteUser method', function() {
      expect(dbmongo).to.respondTo('deleteUser');
    });
  });

  describe('db_mongo', function() {

    before(function(done) {
      expect(dbmongo).to.respondTo('_wipeTheEntireDatabase');
      dbmongo._wipeTheEntireDatabase(done);
    });

    var user1 = {username: 'Testy', emails: ['mctesty@mctester.com'], password: 'test2'};
    var user2 = {username: 'McTesty', emails: ['mctesty@tester.com'], password: 'test'};

    var checkResult = function(user, ref) {
      expect(user).to.have.property('userid');
      expect(user).to.have.property('userhash');
      expect(user).to.have.property('username');
      expect(user).to.have.property('emails');
      expect(user).to.not.have.property('password');
      expect(user).to.not.have.property('pwhash');

      if (ref.userid) expect(user.userid).to.equal(ref.userid);

      expect(user.emails.length).to.equal(1);
      expect(user.emails[0]).to.equal(ref.emails[0]);
      expect(user.userid.length).to.equal(10);
    };

    it('should have a good status return', function(done) {
      dbmongo.status(function(err, result) {
        shouldSucceed(err, result, 200);
        expect(result.running).to.be.true;
        expect(result.deps.down).to.be.empty;
        done();
      });
    });

    it('should create a user', function(done) {
      dbmongo.addUser(user1, function(err, result) {
        shouldSucceed(err, result, 201);
        checkResult(result.detail, user1);
        user1.userid = result.detail.userid;
        user1.userhash = result.detail.userhash;
        done();
      });
    });

    it('should fail trying to recreate existing user', function(done) {
      dbmongo.addUser(user1, function(err, result){
        shouldFail(err, result, 400);
        done();
      });
    });

    it('should create a second user', function(done) {
      dbmongo.addUser(user2, function(err, result){
        shouldSucceed(err, result, 201);
        checkResult(result.detail, user2);
        user2.userid = result.detail.userid;
        user2.userhash = result.detail.userhash;
        done();
      });
    });

    it('should find a user by username', function(done) {
      dbmongo.getUser({user: user1.username}, function(err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.length).to.equal(1);
        checkResult(result.detail[0], user1);
        done();
      });
    });

    it('should find a user by email', function(done) {
      dbmongo.getUser({user: user2.emails[0]}, function(err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.length).to.equal(1);
        checkResult(result.detail[0], user2);
        done();
      });
    });

    it('should find a user by email with a correct password', function(done) {
      dbmongo.getUser({user: user2.emails[0], password: user2.password}, function(err, result) {
        shouldSucceed(err, result, 200);
        expect(result.detail.length).to.equal(1);
        checkResult(result.detail[0], user2);
        done();
      });
    });

    it('should fail to find a user by email with an incorrect password', function(done) {
      dbmongo.getUser({user: user2.emails[0], password: user2.password + 'z'}, function(err, result) {
        shouldSucceed(err, result, 204);
        done();
      });
    });

    it('should error but not die when given an empty query', function(done) {
      dbmongo.getUser({user: undefined}, function(err, result) {
        shouldFail(err, result, 400);
        done();
      });
    });

    it('should fail to find a nonexistent user by email', function(done) {
      dbmongo.getUser({user: 't@mctester.com'}, function(err, result) {
        shouldSucceed(err, result, 204);
        done();
      });
    });

    it('should fail to find a nonexistent user by name', function(done) {
      dbmongo.getUser({user: 'foo'}, function(err, result) {
        shouldSucceed(err, result, 204);
        done();
      });
    });


    it('should fail to delete multiple users with wildcards', function(done) {
      // wildcards don't work with mongo like this, but I want to be sure
      dbmongo.deleteUser({userid: '.*', password: '.*'}, function(err, result) {
        shouldFail(err, result, 400);
        done();
      });
    });

    it('should fail to do anything if the userid is null', function(done) {
      dbmongo.deleteUser({userid: null, password: 'zzz'}, function(err, result) {
        shouldFail(err, result, 401);
        done();
      });
    });

    it('should fail to delete a user with an invalid password', function(done) {
      dbmongo.deleteUser({userid: user1.userid, password: 'zzz'}, function(err, result) {
        shouldFail(err, result, 400);
        done();
      });
    });

    it('should delete a user with a valid password', function(done) {
      dbmongo.deleteUser({userid: user1.userid, password: user1.password}, function(err, result) {
        shouldSucceed(err, result, 200);
        done();
      });
    });

    it('should fail to delete a user with an invalid administrative key', function(done) {
      dbmongo.deleteUser({userid: user2.userid, adminKey: 'zzz'}, function(err, result) {
        shouldFail(err, result, 401);
        done();
      });
    });

    it('should delete a user with a valid administrative key', function(done) {
      dbmongo.deleteUser({userid: user2.userid, adminKey: 'specialkey'}, function(err, result) {
        shouldSucceed(err, result, 200);
        done();
      });
    });

  });

  describe('testing token store', function() {

    it('should store a token', function(done) {
      dbmongo.storeToken({token: 'whatever'}, function(err, result) {
        shouldSucceed(err, result, 201);
        done();
      });
    });

    it('should find a token', function(done) {
      dbmongo.findToken({token: 'whatever'}, function(err, result) {
        shouldSucceed(err, result, 200);
        done();
      });
    });
      
    it('should fail to find a nonexistent token', function(done) {
      dbmongo.findToken({token: 'missing'}, function(err, result) {
        shouldSucceed(err, result, 404);
        done();
      });
    });

    it('should delete a token', function(done) {
      dbmongo.deleteToken({token: 'whatever'}, function(err, result) {
        shouldSucceed(err, result, 200);
        done();
      });
    });
      
    it('should fail to delete a deleted token', function(done) {
      dbmongo.deleteToken({token: 'whatever'}, function(err, result) {
        shouldSucceed(err, result, 404);
        done();
      });
    });

    it('should fail to delete a nonexistent token', function(done) {
      dbmongo.deleteToken({token: 'missing'}, function(err, result) {
        shouldSucceed(err, result, 404);
        done();
      });
    });
      
  });
});