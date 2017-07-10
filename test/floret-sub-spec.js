const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');
let Floret, floret;

describe('As a Subscriber, it ', () => {

    beforeEach(()=> {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
    });


    it('should create a new Subscriber when constructed', () => {

    });

    it('should fail if not all arguments passed to constructor', () => {

    });

    it('should create an endpoint for publisher to send to', () => {

    });

    it('should register endpoint with api gateway', () => {

    });

    it('should subscribe to api events', () => {

    });

    it('should subscribe to channels', () => {

    });

    it('should remove a subscription', () => {

    });

    it('should update a subscription', () => {

    });

    it('should send subscription ms new subscriber message', () => {

    });

    it('should send subscription ms an update subscriber message', () => {

    });

    it('should send subscription ms an remove subscriber message', () => {

    });

});