const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('As a Floret, it ', () => {
    let Floret, floret, registerAPIStub;

    it('should instantiate gateway client object', () => {

    });

    it('should instantiate a subscriber object', () => {

    });

    it('should instantiate a publisher object', () => {

    });
    
    
    it('should send messages to a publisher', () => {
        f.send('publisherName', {'messageName': 'messageContent'}, (res) => {
            console.log('message received');
        });
    });

    it('should subscribe to service events', () => {

    });

    it('should create configurable endpoints for each subscription', () => {

    });

    it('should receive messages from a publisher for each subscription', () => {

    });

    it('should create a service', () => {

    });

    it('should provide a heartbeat endpoint', () => {

    });

    it('should register itself with its gateway service', () => {

    });

    it('should allow override of Subscriber module', () => {

    });

    it('should allow override of Publisher module', () => {
        
    });

    beforeEach(() => {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
        registerAPIStub = sinon.stub(floret, 'getRegisteredAPIs');
        registerAPIStub.resolves([{}]);

    });

    it('should be imported with commonjs', () => {
        //let Floret = require('../lib/floret');
        assert.exists(Floret, 'Floret is not null or undefined');

    });

    it('should throw an error without new keyword', () => {
        //let Floret = require('../lib/floret');
        expect(() => {
            let x = Floret()
        }).to.throw('Class constructor Floret cannot be invoked without \'new\'');

    });
    /*
     it('should throw an error if instantiated without params', () => {
     //let Floret = require('../lib/floret');
     expect(() => {
     let x = new Floret()
     }).to.throw('name and gatewayUri required');

     });
     */
    it('should create a new object', () => {
        // let Floret = require('../lib/floret');
        // let floret = new Floret('fooService', 'some.host.service.next');
        assert.exists(() => {
            let x = new floret()

        }, 'Floret is not null or undefined');

    });

    it('should have a name', () => {
        // let Floret = require('../lib/floret');
        //let floret = new Floret('fooService', 'https://some.host.service.next:3000');
        assert.isTrue(floret.name === 'fooService');
    });

    describe('should initialize and then it ', () => {
        beforeEach(() => {
            // floret = new Floret('fooService', 'https://some.host.service.next:3000');
            // floret.initialize();
        });

        it('should have new gateway object', () => {
            assert.exists(floret.gateway, 'floret sub is not null or undefined');
        });

        it('should have new pub object', () => {
            assert.exists(floret.pub, 'floret sub is not null or undefined');
        });

        it('should have new sub object', () => {
            assert.exists(floret.sub, 'floret sub is not null or undefined');
        });

        it('should have new channel object', () => {
           // assert.exists(floret.channel, 'floret sub is not null or undefined');
        });

    });
    /*
    describe('As a channel, it ', () => {

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
    */
});