const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');
let Floret, floret, pub;

describe('As a Publisher, it ', () => {

    beforeEach(()=> {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
        pub = new floret.pub('foo');
    });

    it('should fail if not all arguments passed to constructor', () => {

        expect(() => {let f = new floret.pub()}).to.throw();
    });

    it('should create a new publisher object', () => {
        assert.isTrue(typeof pub === 'object');
    });

    it('should have a name', () => {
        assert.isTrue(pub.name === 'foo');
    });

    describe('connects to the Publishing Service, and it ', () => {
        let publisherName;

        beforeEach(() => {
            name = 'fooPublisher';

        });

        it('should register a new Publisher', () => {

            //let api = floret.gateway.proxyURI + '/' + name + '/subscriberEvents';
            //pub.register(name, api);

        });

        it('should update a Publisher', () => {


        });

        it('should remove a Publisher', () => {

        });

        it('should send name, type (channel, api), and content', () => {

        });

    });

    it('should remove a publisher', () => {

    });

    it('should update a publisher', () => {

    });
});