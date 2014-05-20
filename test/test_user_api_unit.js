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
// expect violates this jshint thing a lot, so we just suppress it
/* jshint expr: true */

var lastlog = '';
var savelog = function () {
  lastlog = arguments;
};

// in the test module, because require returns the same result for the same request,
// we can override bits of the environment for the userapi
var env = {
  mongoConnectionString: 'mongodb://localhost/test_user_api',
  // the special config value we pass for testing will enable us to wipe the database
  _wipeTheEntireDatabase: true,
  adminKey: 'specialkey',
  saltDeploy: 'randomsaltvalue',
  apiSecret: 'a secret of some sort',
  serverSecret: 'sharedMachineSecret',
  longtermkey: 'thelongtermkey',
  logger: {
    error: savelog,
    warn: savelog,
    info: savelog
  }
};

var dbmongo = require('../lib/db_mongo.js')(env);
var userapi = require('../lib/userapi.js')(env, dbmongo);

var restify = require('restify');
var server = restify.createServer({
  name: 'testUserApi'
});
server.use(restify.queryParser());
server.use(restify.bodyParser());
userapi.attachToServer(server);
server.listen(10000);

var supertest = require('supertest')(server);

describe('userapi', function () {

  describe('basics', function () {
    it('should have user test', function () {
      var isTrue = true;
      expect(isTrue).to.exist;
    });
    it('should have an app', function () {
      expect(userapi).to.exist;
    });
    it('should have server object', function () {
      expect(userapi).to.respondTo('attachToServer');
    });
  });

  describe('GET /status', function () {

    it('should respond with 200', function (done) {
      supertest
        .get('/status')
        .expect(200)
        .end(function (err, obj) {
          if (err) return done(err);
          expect(err).to.not.exist;
          expect(obj.res.body.down).to.eql([]);
          expect(obj.res.body.up).to.eql(['mongo']);
          done();
        });
    });

    it('should respond with 403 if you set status to 403', function (done) {
      supertest
        .get('/status?status=403')
        .expect(403)
        .end(done);
    });

    it('should ignore extra query parameters', function (done) {
      supertest
        .get('/status?bogus=whatever')
        .expect(200)
        .end(done);
    });

  });

  describe('GET /nonexistent', function () {

    it('should respond with 404', function (done) {
      supertest
        .get('/nonexistent')
        .expect(404)
        .end(done);
    });

  });

  describe('POST /status', function () {

    it('should respond with 405', function (done) {
      supertest
        .post('/status')
        .expect(405)
        .end(done);
    });

  });

  describe('POST /user with a garbage payload', function () {

    it('should respond with 400', function (done) {
      supertest
        .post('/user')
        .send('junk')
        .expect(400)
        .end(done);
    });

  });

  describe('POST /login with an invalid userid/pw', function () {

    it('should respond with 401', function (done) {
      supertest
        .post('/login')
        .auth('badid', 'abcdef1234567890')
        .expect(401)
        .end(function (err, res) {
          if (err) return done(err);
          expect(res.body).to.equal('login failed');
          done();
        });
    });

  });

  describe('GET /login with null token', function () {
    var tok = null;
    it('should return 401', function (done) {
      supertest
        .get('/login')
        .set('X-Tidepool-Session-Token', tok)
        .expect(401)
        .end(done);
    });
  });

  describe('Create and manage a user', function () {
    var user = {
      username: 'realname',
      emails: ['foo@bar.com'],
      password: 'R6LvLQ$=aTBgfj&4jqAq'
    };

    var sessionToken = null;
    var oldToken = null;

    describe('POST /user with a complete payload to create a new user and log in', function () {

      it('should respond with 201', function (done) {
        supertest
          .post('/user')
          .send(user)
          .expect(201)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
            user.userid = obj.res.body.userid;
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(3600);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('POST /logout with valid session token #1', function () {

      it('should respond with 200 and log out', function (done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(done);
      });

    });


    describe('POST /login for that user with a slightly bad password', function () {
      it('should respond with 401', function (done) {
        supertest
          .post('/login')
          .auth(user.username, user.password + 'x')
          .expect(401)
          .end(done);
      });
    });

    describe('POST /login with good PW to log in to that user', function () {

      it('should respond with 200 and a session token', function (done) {
        supertest
          .post('/login')
          .auth(user.username, user.password)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(3600);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('GET /user while logged in with update', function () {

      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            done();
          });
      });
    });

    describe('PUT /user while logged in', function () {

      it('should respond with 200 and user info', function (done) {
        var newname = 'myalias';
        supertest
          .put('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .send({updates: {username: newname}})
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(newname);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            user.username = newname;
            done();
          });
      });
    });

    describe('GET /user/:myuserid while logged in', function () {

      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/user/' + user.userid)
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            done();
          });
      });
    });

    describe('GET /user/:email while logged in', function () {

      it('should respond with 204', function (done) {
        supertest
          .get('/user/' + user.emails[0])
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(204)
          .end(function (err, obj) {
            done();
          });
      });
    });


    describe('GET /login for logged in user', function () {

      it('should return 200 with a new token and the user ID', function (done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.equal(user.userid);
            expect(obj.res.headers['x-tidepool-session-token']).to.exist;
            expect(obj.res.headers['x-tidepool-session-token']).to.not.equal(sessionToken);
            expect(lastlog[1]).to.equal(3600);
            oldToken = sessionToken;
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });

    });

    describe('GET /login with old token', function () {

      it('should return 401', function (done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', oldToken)
          .expect(401)
          .end(done);
      });
    });


    describe('POST /logout without a sessionToken', function () {

      it('should respond with 200', function (done) {
        supertest
          .post('/logout')
          .expect(200)
          .end(done);
      });

    });

    describe('POST /logout with valid session token #2', function () {

      it('should respond with 200', function (done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(done);
      });

    });

    describe('POST /login with good PW and bad longterm key', function () {

      it('should respond with 200 and a shortterm session token', function (done) {
        supertest
          .post('/login/badkey')
          .auth(user.username, user.password)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(3600);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('POST /login with good PW and good longterm key', function () {

      it('should respond with 200 and a longterm session token', function (done) {
        supertest
          .post('/login/' + env.longtermkey)
          .auth(user.username, user.password)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(2592000);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('Refreshing a longterm token', function () {

      it('should return 200 with the same token and the user ID', function (done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.equal(user.userid);
            expect(obj.res.headers['x-tidepool-session-token']).to.exist;
            expect(obj.res.headers['x-tidepool-session-token']).to.equal(sessionToken);
            done();
          });
      });

    });

    describe('GET /user with a valid id but not logged in', function () {

      it('should respond with 401', function (done) {
        supertest
          .get('/user/' + user.userid)
          .expect(401)
          .end(done);
      });

    });

    describe('GET /user without token', function () {

      it('should respond with 401 and no user info', function (done) {
        supertest
          .get('/user')
          .expect(401)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body).to.equal('Unauthorized');
            done();
          });
      });
    });


  });

  describe('Create and delete a user:', function () {
    var user = {
      username: 'somename',
      emails: ['bar@bar.com'],
      password: 'R6LvqLQ$=aTBgfj&4jqAq'
    };
    var sessionToken = null;

    describe('POST /user to log in', function () {

      it('should respond with 201', function (done) {
        supertest
          .post('/user')
          .send(user)
          .expect(201)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
            user.userid = obj.res.body.userid;
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(3600);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('DELETE /user without a password', function () {

      it('should respond with 403', function (done) {
        supertest
          .del('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(403)
          .end(done);
      });
    });

    describe('DELETE /user with bad password', function () {

      it('should respond with 400', function (done) {
        supertest
          .del('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .send({password: 'wrong'})
          .expect(400)
          .end(done);
      });
    });

    describe('DELETE /user to get rid of the current user', function () {

      it('should respond with 200', function (done) {
        supertest
          .del('/user')
          .set('X-Tidepool-Session-Token', sessionToken)
          .send({password: user.password})
          .expect(200)
          .end(done);
      });
    });

    describe('Delete logs users out, so GET /login with that token', function () {

      it('should return 401', function (done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(401)
          .end(done);
      });
    });
  });


  describe('Create and manage a user as a machine', function () {
    var user = {
      username: 'anotheruser',
      emails: ['buzz@bazz.com'],
      password: 'R6asd$=aTBgfj&7jqZ7'
    };

    var sessionToken = null;
    var serverToken = null;

    describe('POST /user with a complete payload to create a new user and log in', function () {

      it('should respond with 201', function (done) {
        supertest
          .post('/user')
          .send(user)
          .expect(201)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
            user.userid = obj.res.body.userid;
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            sessionToken = obj.res.headers['x-tidepool-session-token'];
            done();
          });
      });
    });

    describe('POST /serverlogin with good secret', function () {

      it('should respond with 200 and a session token', function (done) {
        supertest
          .post('/serverlogin')
          .set('X-Tidepool-Server-Name', 'Test Server')
          .set('X-Tidepool-Server-Secret', env.serverSecret)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            serverToken = obj.res.headers['x-tidepool-session-token'];
            expect(lastlog[1]).to.equal(86400);
            expect(serverToken).to.not.equal(sessionToken);
            done();
          });
      });
    });

    describe('GET /user/:id as a server', function () {

      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/user/' + user.userid)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            done();
          });
      });
    });

    describe('GET /user/:email as a server', function () {

      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/user/' + user.emails[0])
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            done();
          });
      });
    });

    describe('PUT /user/:userid to update an account', function () {
      var newpw = 'bluebayou';
      it('should respond with 200 and user info', function (done) {
        supertest
          .put('/user/' + user.userid)
          .set('X-Tidepool-Session-Token', serverToken)
          .send({updates: {password: newpw}})
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.username).to.exist;
            expect(obj.res.body.username).to.equal(user.username);
            expect(obj.res.body.emails).to.exist;
            expect(obj.res.body.emails[0]).to.equal(user.emails[0]);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            user.password = newpw;
            done();
          });
      });
    });

    describe('POST /login with good PW to log in to that user', function () {

      it('should respond with 200 and a session token', function (done) {
        supertest
          .post('/login')
          .auth(user.username, user.password)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.headers['x-tidepool-session-token']).to.match(/[a-zA-Z0-9.]+/);
            expect(lastlog[1]).to.equal(3600);
            done();
          });
      });
    });

    describe('GET /token/:token without a valid serverToken', function () {
      it('should respond with 401', function (done) {
        supertest
          .get('/token/' + sessionToken)
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(401)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body).to.equal('Unauthorized');
            done();
          });
      });
    });

    describe('GET /token/:token for sessionToken with valid serverToken', function () {
      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/token/' + sessionToken)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal(user.userid);
            expect(obj.res.body.isserver).to.equal(false);
            done();
          });
      });
    });

    describe('GET /token/:token for serverToken with a valid serverToken', function () {
      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/token/' + serverToken)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal('Test Server');
            expect(obj.res.body.isserver).to.equal(true);
            done();
          });
      });
    });

    describe('GET /login to refresh machine user', function () {

      it('should return 200 with a new token and the user ID', function (done) {
        supertest
          .get('/login')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.equal('Test Server');
            expect(obj.res.headers['x-tidepool-session-token']).to.exist;
            expect(obj.res.headers['x-tidepool-session-token']).to.not.equal(serverToken);
            serverToken = obj.res.headers['x-tidepool-session-token'];
            expect(lastlog[1]).to.equal(86400);
            done();
          });
      });

    });

    describe('GET /token/:token for serverToken with regenerated serverToken', function () {
      it('should respond with 200 and user info', function (done) {
        supertest
          .get('/token/' + serverToken)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(function (err, obj) {
            if (err) return done(err);
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.exist;
            expect(obj.res.body.userid).to.equal('Test Server');
            expect(obj.res.body.isserver).to.equal(true);
            done();
          });
      });
    });

    describe('GET /private with no name to retrieve a randomly generated id/hash pair', function() {

      it('should return 200 with an id/hash in the response', function (done) {
        supertest
          .get('/private?some=data&something=else')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body.name).to.equal('');
            expect(obj.res.body.id).to.match(/[a-zA-Z0-9.]{8,12}/);
            expect(obj.res.body.hash).to.match(/[a-zA-Z0-9.]{20,64}/);
            done();
          });
      });

    });

    describe('Exercise /private/name to retrieve and store id/hash with a name for a user', function () {

      var name1 = {name: 'testname'};
      var name2 = {name: 'differentname'};

      it('GET should return 200 with an id/hash in the response', function (done) {
        supertest
          .get('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body.id).to.exist;
            expect(obj.res.body.id).to.match(/[a-zA-Z0-9.]{8,12}/);
            expect(obj.res.body.hash).to.match(/[a-zA-Z0-9.]{20,64}/);
            name1.id = obj.res.body.id;
            name1.hash = obj.res.body.hash;
            done();
          });
      });

      it('GET should return 200 with the same id/hash in the response when given the same name', function (done) {
        supertest
          .get('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body).to.have.property('id').that.equals(name1.id);
            expect(obj.res.body).to.have.property('hash').that.equals(name1.hash);
            done();
          });
      });

      it('should return 404 if there is no name field', function (done) {
        supertest
          .post('/private/' + user.userid)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(404)
          .end(done);
      });

      it('should return 401 if authorization token is not a server token', function (done) {
        supertest
          .post('/private/' + user.userid + '/validname')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(401)
          .end(done);
      });

      it('should return 201 and a hash if you post to a name that exists', function (done) {
        supertest
          .post('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(201)
          .end(
          function (err, obj) {
            expect(err).to.not.exist;
            expect(obj.res.body).to.have.property('id').that.not.equals(name1.id);
            expect(obj.res.body).to.have.property('hash').that.not.equals(name1.hash);
            name1.id = obj.res.body.id;
            name1.hash = obj.res.body.hash;
            done();
          });
      });

      it('should accept a different name with additional salt', function (done) {
        supertest
          .get('/private/' + user.userid + '/' + name2.name + '?extra=salt')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body.id).to.exist;
            expect(obj.res.body.id).to.match(/[a-zA-Z0-9.]{8,12}/);
            expect(obj.res.body.hash).to.match(/[a-zA-Z0-9.]{20,64}/);
            done();
          });
      });

      it('should fetch a name, return 200 with an id/hash', function (done) {
        supertest
          .get('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body.id).to.exist;
            expect(obj.res.body.id).to.equal(name1.id);
            expect(obj.res.body.hash).to.equal(name1.hash);
            done();
          });
      });

      it('should return 200 and new values for a PUT', function (done) {
        supertest
          .put('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(201)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body.id).to.exist;
            expect(obj.res.body.id).to.not.equal(name1.id);
            expect(obj.res.body.hash).to.not.equal(name1.hash);
            name1.id = obj.res.body.id;
            name1.hash = obj.res.body.hash;
            done();
          });
      });


      // skipping private delete tests for now since I haven't implemented delete
      it.skip('should delete a name, return 204', function (done) {
        supertest
          .del('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(done);
      });

      it.skip('should return a new key/pair because the name no longer exists', function (done) {
        supertest
          .get('/private/' + user.userid + '/' + name1.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(
          function (err, obj) {
            if (err) {
              return done(err);
            }
            expect(obj.res.body).to.have.property('id').that.not.equals(name1.id);
            expect(obj.res.body).to.have.property('hash').that.not.equals(name1.hash);
            name1.id = obj.res.body.id;
            name1.hash = obj.res.body.hash;
            done();
          });
      });

      it.skip('should delete the other name, return 204', function (done) {
        supertest
          .delete('/private/' + name2.name)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(204)
          .end(done);
      });


    });

    describe('POST /logout with valid session token', function () {

      it('should respond with 200 and log out', function (done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', sessionToken)
          .expect(200)
          .end(done);
      });

    });

    describe('DELETE /user/:id for server without password', function () {
      it('should respond with 403', function (done) {
        supertest
          .del('/user/' + user.userid)
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(403)
          .end(done);
      });
    });

    describe('DELETE /user/:id for server with bad userid', function () {
      it('should respond with 403', function (done) {
        supertest
          .del('/user/' + 'a123af')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(403)
          .end(done);
      });
    });

    describe('DELETE /user/:id for server with password', function () {
      it('should respond with 200', function (done) {
        supertest
          .del('/user/' + user.userid)
          .send({password: user.password})
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(done);
      });
    });

    describe('User delete flag set/unset', function() {
      it('should respond with a 401 if no session token is present', function(done) {
        supertest
          .delete('/user/'+ user.userid + '/deleteflag')
          .expect(401, done);
      });

      it('should respond with a 403 if the users password is null', function(done) {
        supertest
          .delete('/user/' + user.userid + '/deleteflag')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(403, done);
      });

      it('should respond with a 403 if the users password is wrong', function(done) {
        supertest
          .delete('/user/' + user.userid + '/deleteflag')
          .send({password: 'abc1234'})
          .set('X-Tidepool-Session-Token')
          .expect(403)
          .end(done);
      });

      it('should respond with a 202 when the flag is set', function(done) {
        supertest
          .delete('/user/' + user.userid + '/deleteflag')
          .send({password: user.password})
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(202)
          .end(done);
      });

      it('should respond with a 204 when the flag is unset', function(done) {
        supertest
          .post('/user/' + user.userid + '/deleteflag')
          .send({password: user.password})
          .set('X-Tidepool-Session-Token')
          .expect(204)
          .end(done);
      });

      it('should respond with a 405 when the http method is GET', function(done) {
        supertest
          .get('/user/' + user.userid + '/deleteflag')
          .send({password: user.password})
          .set('X-Tidepool-Session-Token')
          .expect(405)
          .end(done);
      });

      it('should respond with a 405 when the http method is PUT', function(done) {
        supertest
          .put('/user/' + user.userid + '/deleteflag')
          .send({password: user.password})
          .set('X-Tidepool-Session-Token')
          .expect(405)
          .end(done);
      });
    });

    describe('POST /logout with valid server token', function () {

      it('should respond with 200', function (done) {
        supertest
          .post('/logout')
          .set('X-Tidepool-Session-Token', serverToken)
          .expect(200)
          .end(done);
      });

    });

  });


  describe('GET /login', function () {

    it('should respond with 404', function () {
      supertest
        .get('/login')
        .expect(404);
    });

  });

  describe('POST /user without any data', function () {

    it('should respond with 400', function () {
      supertest
        .post('/status')
        .expect(400);
    });

  });

  describe('GET /login', function () {

    it('should respond with 404', function () {
      supertest
        .get('/login')
        .expect(404);
    });

  });
});