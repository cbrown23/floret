const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');
let Floret, floret;

describe('As a channel, it ', () => {

    beforeEach(()=> {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
    });


    it('should create a new channel when constructed', () => {

    });

    it('should fail when constructor missing arguments', () => {

    });

    it('should register (create api) at api gateway', () => {

    });

    it('should fail if unable to register with api gateway', () => {

    });

    it('should create a new channel', () => {

    });

    it('should send messages to its api at the api gateway', () => {

    });

    it('should delete a channel', () => {

    });

    it('should send channel retirement message', () => {

    });

    it('should remove api endpoint', () => {

    });

    it('should update channel name', () => {

    });

    it('should update gateway endpoints', () => {

    });

});