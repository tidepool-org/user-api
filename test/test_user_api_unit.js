'use strict';

var expect = require('chai').expect;
var supertest = require('supertest');
//var mongoHandler = require('./fakeMongoHandler');
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
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
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
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
        });
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

describe('POST /user/login with an invalid userid/pw', function() {

    it('should respond with 401', function() {
        supertest(userapi.server)
        .post('/user/login')
        .set('X-Tidepool-UserID', 'badid')
        .set('X-Tidepool-Password', 'abcdef1234567890')
        .expect(401)
        .end(function(err, res) {
            expect(err).to.not.exist;
        });
     });

});

describe('POST /user/login with a valid userid/pw', function() {

    it('should respond with 200 and a session token', function() {
        supertest(userapi.server)
        .post('/user/login')
        .set('X-Tidepool-UserID', 'realid')
        .set('X-Tidepool-Password', 'abcdef1234567890')
        .expect(200)
        .expect('X-Tidepool-Session-Token', /[a-zA-Z0-9.]+/)
        .end(function(err, res) {
            expect(err).to.not.exist;
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
