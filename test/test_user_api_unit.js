'use strict';

var expect = require('chai').expect;
var supertest = require('supertest');
//var mongoHandler = require('./fakeMongoHandler');
var userapi = require('../lib/index.js');

describe('user API', function() {
    it('should have user test', function(done) {
        var isTrue = true;
        expect(isTrue).to.exist;
        done();
    });
    it('should have an app', function(done) {
        expect(userapi).to.exist;
        console.log(userapi);
        done();
    });
    it('should have an app', function(done) {
        expect(userapi).to.exist;
        done();
    });
});
