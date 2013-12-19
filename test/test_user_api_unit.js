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

describe('user API', function() {

    it('should respond to ', function(done) {
        supertest(userapi.server)
        .get('/status')
        .expect(200, done);
    });
});
