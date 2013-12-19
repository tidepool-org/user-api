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
