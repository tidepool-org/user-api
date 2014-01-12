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
var supertest = require('supertest');

// in the test module, because require returns the same result for the same request,
// we can override bits of the environment for the userapi
var env = require('../env');
env.userAdminKey = 'specialkey';
env.logger = { error: console.log, warn: console.log, info: console.log };
env.saltDeploy = '1234';

var userapi = require('../lib/userapi.js');

describe('userapi basics', function() {
    it('should have user test', function() {
        var isTrue = true;
        expect(isTrue).to.exist;
    });
    it('should have an app', function() {
        expect(userapi).to.exist;
    });
    it('should have server object', function() {
        expect(userapi.server).to.exist;
    });
    it.skip('should have installAPI method', function() {
        expect(userapi).to.respondTo('installAPI');
    });
});

describe('GET /status', function() {

    it('should respond with 200 "Ok" ', function() {
        supertest(userapi.server)
        .get('/status')
        .expect(200)
        .end(function(err, obj) {
            expect(err).to.not.exist;
            // console.log(obj);
            expect(obj.res.body.down).to.eql([]);
            expect(obj.res.body.up).to.eql(['mongo']);
        });
    });

    it('should respond with 404 if you set status to 404', function() {
        supertest(userapi.server)
        .get('/status?status=404')
        .expect(404);
    });

    it('should ignore extra query parameters', function() {
        supertest(userapi.server)
        .get('/status?bogus=whatever')
        .expect(200)
    });

});

describe('GET /nonexistent', function() {

    it('should respond with 404', function() {
        supertest(userapi.server)
        .get('/nonexistent')
        .expect(404);
    });

});

describe('POST /status', function() {

    it('should respond with 404', function() {
        supertest(userapi.server)
        .post('/status')
        .expect(404);
    });

});

describe('POST /user with a garbage payload', function() {

    it('should respond with 400', function() {
        supertest(userapi.server)
        .post('/user')
        .send('junk')
        .expect(400)
        .end(function(err, res) {
            expect(err).to.not.exist;
        });
    });

});

describe('POST /login with an invalid userid/pw', function() {

    it('should respond with 401', function() {
        supertest(userapi.server)
        .post('/login')
        .set('X-Tidepool-UserID', 'badid')
        .set('X-Tidepool-Password', 'abcdef1234567890')
        .expect(401)
        .end(function(err, res) {
            expect(err).to.not.exist;
        });
    });

});

describe('Create and manage a user', function() {
    var user = {
        username: 'realid',
        emails: ['foo@bar.com'],
        password: 'R6LvLQ$=aTBgfj&4jqAq'
    };

    var token = null;

    describe('POST /user with a complete payload to create a new user', function() {

        it('should respond with 200', function() {
            supertest(userapi.server)
            .post('/user')
            .send(user)
            .expect(200)
            .end(function(err, obj) {
                expect(err).to.not.exist;
                expect(obj.res.body.username).to.equal(user.username);
                expect(obj.res.body.emails).to.equal(user.emails);
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.match(/[a-f0-9]{10}/);
                user.userid = obj.res.body.userid;
            });
        });
    });

    describe('POST /login for that user with bad password', function() {
        it('should respond with 401', function() {
            supertest(userapi.server)
            .post('/login')
            .set('X-Tidepool-UserID', user.username)
            .set('X-Tidepool-Password', user.password + 'x')
            .expect(403)
            .expect('X-Tidepool-Session-Token').to.not.exist
            .end(function(err, obj) {
                expect(err).to.not.exist;
            });
        });
    });

    describe('POST /login with good PW to log in to that user', function() {

        it('should respond with 200 and a session token', function() {
            supertest(userapi.server)
            .post('/login')
            .set('X-Tidepool-UserID', user.username)
            .set('X-Tidepool-Password', user.password)
            .expect(200)
            .expect('X-Tidepool-Session-Token', /[a-zA-Z0-9.]+/)
            .end(function(err, obj) {
                expect(err).to.not.exist;
                token = obj.res.header['X-Tidepool-Session-Token'];
            });
        });
    });

    describe('GET /user while logged in', function() {

        it('should respond with 200 and user info', function() {
            supertest(userapi.server)
            .get('/user')
            .set('X-Tidepool-SessionToken', token)
            .expect(200)
            .end(function(err, obj) {
                expect(err).to.not.exist;
                expect(obj.res.body.username).to.exist;
                expect(obj.res.body.username).to.equal(user.username);
                expect(obj.res.body.emails).to.exist;
                expect(obj.res.body.emails).to.equal(user.emails);
                expect(obj.res.body.userid).to.exist;
                expect(obj.res.body.userid).to.equal(user.userid);
            });
        });
    });

    describe('GET /logout without a session token', function() {

        it('should respond with 401', function() {
            supertest(userapi.server)
            .post('/logout')
            .expect(401)
            .end(function(err, res) {
                expect(err).to.not.exist;
            });
        });

    });

    describe('GET /logout', function() {

        it('should respond with 200', function() {
            supertest(userapi.server)
            .set('X-Tidepool-SessionToken', token)
            .post('/logout')
            .expect(200)
            .end(function(err, res) {
                expect(err).to.not.exist;
            });
        });

    });

    describe('GET /user with a valid id but not logged in', function() {

        it('should respond with 401', function() {
            supertest(userapi.server)
            .post('/user/' + user.userid)
            .expect(400)
            .end(function(err, res) {
                expect(err).to.not.exist;
            });
        });

    });

    describe('GET /user without token', function() {

        it('should respond with 401 and no user info', function() {
            supertest(userapi.server)
            .get('/user')
            .expect(401)
            .end(function(err, obj) {
                expect(err).to.not.exist;
                expect(obj.res.body.username).to.not.exist;
                expect(obj.res.body.emails).to.not.exist;
                expect(obj.res.body.userid).to.not.exist;
            });
        });
    });


});


describe('GET /login', function() {

    it('should respond with 404', function() {
        supertest(userapi.server)
        .get('/login')
        .expect(404);
     });

});

describe('POST /user without any data', function() {

    it('should respond with 400', function() {
        supertest(userapi.server)
        .post('/status')
        .expect(400);
     });

});

describe('GET /login', function() {

    it('should respond with 404', function() {
        supertest(userapi.server)
        .get('/login')
        .expect(404);
     });

});

describe('POST /user for a new user minimal fields and no conflict', function() {

    it.skip('should respond with 200', function() {
        supertest(userapi.server)
        .post('/status')
        .send({
            username: 'newuser',
            password: 'newuser'
        })
        .accept('application/json')
        .expect(200)
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
        });
     });

});


describe('POST /login', function() {

    it.skip('guest with no PW should respond with 200', function() {
        supertest(userapi.server)
        .post('/status')
        .send({ username: 'guest', password: '' })
        .expect(200)
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
        });
     });

});
