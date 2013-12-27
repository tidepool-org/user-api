'use strict';

var expect = require('chai').expect;
var dbmongo = require('../lib/db_mongo.js');

describe('db_mongo basics', function() {
    it('should have an app', function() {
        expect(dbmongo).to.exist;
    });
    it('should have init method', function() {
        expect(dbmongo).to.respondTo('init');
    });
    it('should have addUser method', function() {
        expect(dbmongo).to.respondTo('addUser');
    });
    it('should have getUserFromIdPw method', function() {
        expect(dbmongo).to.respondTo('getUserFromIdPw');
    });
    it('should have deleteUser method', function() {
        expect(dbmongo).to.respondTo('deleteUser');
    });
});

describe('db_mongo', function() {

    before(function(done) {
        // the special config value we pass will wipe the database
        dbmongo.init({
            mongo_connection_string: 'mongodb://localhost/test',
            _wipeTheEntireDatabase: true,
            adminkey: 'specialkey'
        }, done);
    });

    it('should create a user', function(done) {
        dbmongo.addUser({userid: 'Testy', email: 'testy@mctester.com', pwhash: 'test', extras: {junk: 'foo'}}, function(result){
            expect(result.success).to.be.true;
            expect(result.user).to.have.property('userid');
            expect(result.user.userid).to.equal('Testy');
            expect(result.user).to.not.have.property('pwhash');
            expect(result.user).to.have.property('emails');
            expect(result.user.emails.length).to.equal(1);
            expect(result.user.emails[0]).to.equal('testy@mctester.com');
            expect(result.user).to.have.property('extras');
            expect(result.user.extras.junk).to.equal('foo');
            done();
        });
    });

    it('should fail trying to recreate existing user', function(done) {
        dbmongo.addUser({userid: 'Testy', email: 'mctesty@mctester.com', pwhash: 'test2', extra: {}}, function(result){
            expect(result.success).to.be.false;
            done();
        });
    });

    it('should create a second user', function(done) {
        dbmongo.addUser({userid: 'McTesty', email: 'mctesty@tester.com', pwhash: 'test', extras: {junk: 'bar'}}, function(result){
            expect(result.success).to.be.true;
            done();
        });
    });

    it('should fail to delete multiple users with wildcards', function(done) {
        // TODO: understand mongo wildcard behavior
        dbmongo.deleteUser({userid: '.*', pwhash: '.*'}, function(result) {
            expect(result.success).to.be.false;
            expect(result.message).to.equal('User/password combination not found.');
            done();
        });
    });

    it('should fail to delete a user with an invalid password', function(done) {
        dbmongo.deleteUser({userid: 'Testy', pwhash: 'zzz'}, function(result) {
            expect(result.success).to.be.false;
            expect(result.message).to.equal('User/password combination not found.');
            done();
        });
    });

    it('should delete a user with a valid password', function(done) {
        dbmongo.deleteUser({userid: 'Testy', pwhash: 'test'}, function(result) {
            expect(result.success).to.be.true;
            expect(result.message).to.equal('User permanently deleted.');
            done();
        });
    });

    it('should fail to delete a user with an invalid administrative key', function(done) {
        dbmongo.deleteUser({userid: 'Testy', adminkey: 'zzz'}, function(result) {
            expect(result.success).to.be.false;
            expect(result.message).to.equal('Password not properly specified.');
            done();
        });
    });

    it('should delete a user with a valid administrative key', function(done) {
        dbmongo.deleteUser({userid: 'McTesty', adminkey: 'specialkey'}, function(result) {
            expect(result.success).to.be.true;
            expect(result.message).to.equal('User permanently deleted.');
            done();
        });
    });

});
