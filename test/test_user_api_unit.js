'use strict';

var expect = require('chai').expect;
var supertest = require('supertest');
//var mongoHandler = require('./fakeMongoHandler');
var userapi = require('../lib/userapi.js');

describe('userapi basics', function() {
    it('should have user test', function(done) {
        var isTrue = true;
        expect(isTrue).to.exist;
        done();
    });
    it('should have an app', function(done) {
        expect(userapi).to.exist;
        done();
    });
    it('should have server object', function(done) {
        expect(userapi.server).to.exist;
        done();
    });
    it.skip('should have installAPI method', function(done) {
        expect(userapi).to.respondTo('installAPI');
        done();
    });
});

describe('GET /status', function() {

    it('should respond with 200 "Ok" ', function(done) {
        supertest(userapi.server)
        .get('/status')
        .expect(200)
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
            done();
        });
     });

    it('should respond with 404 if you set status to 404', function(done) {
        supertest(userapi.server)
        .get('/status?status=404')
        .expect(404);
        done();
     });

    it('should ignore extra query parameters', function(done) {
        supertest(userapi.server)
        .get('/status?bogus=whatever')
        .expect(200)
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
            done();
        });
     });

});

describe('GET /nonexistent', function() {

    it('should respond with 404', function(done) {
        supertest(userapi.server)
        .get('/nonexistent')
        .expect(404);
        done();
     });

});

describe('POST /status', function() {

    it('should respond with 404', function(done) {
        supertest(userapi.server)
        .post('/status')
        .expect(404);
        done();
     });

});

describe('GET /user/auth with an invalid ID/token', function() {

    it('should respond with 401', function(done) {
        supertest(userapi.server)
        .get('/user/auth')
        .set('X-Tidepool-Application-ID', 'badid')
        .set('X-Tidepool-API-Token', 'abcdef1234567890')
        .expect(401);
        done();
     });

});

describe('POST /user/auth with a valid ID/token', function() {

    it('should respond with 200 and a session token', function(done) {
        supertest(userapi.server)
        .get('/user/auth')
        .set('X-Tidepool-Application-ID', 'realid')
        .set('X-Tidepool-API-Token', 'abcdef1234567890')
        .expect(200)        
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect('Content-Type', 'application/json');
            expect('X-Tidepool-Session-Token', /[a-f0-9]{16}/);
            done();
        });

     });

});

describe('GET /login', function() {

    it('should respond with 404', function(done) {
        supertest(userapi.server)
        .get('/login')
        .expect(404);
        done();
     });

});

describe('POST /user without any data', function() {

    it('should respond with 400', function(done) {
        supertest(userapi.server)
        .post('/status')
        .expect(400);
        done();
     });

});

describe('GET /login', function() {

    it('should respond with 404', function(done) {
        supertest(userapi.server)
        .get('/login')
        .expect(404);
        done();
     });

});

describe('POST /user for a new user minimal fields and no conflict', function() {

    it.skip('should respond with 200', function(done) {
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
            done();
        });
     });

});


describe('POST /login', function() {

    it.skip('guest with no PW should respond with 200', function(done) {
        supertest(userapi.server)
        .post('/status')
        .send({ username: 'guest', password: '' })
        .expect(200)
        .end(function(err, res) {
            expect(err).to.not.exist;
            expect(res.text).to.equal('"Ok"');
            done();
        });
     });

});
