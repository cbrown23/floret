const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');

describe('floret', () => {
    let Floret, floret, registerAPIStub;

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

    it('should throw an error if instantiated without params', () => {
        //let Floret = require('../lib/floret');
        expect(() => {
            let x = new Floret()
        }).to.throw('name and gatewayUri required');

    });

    it('should create a new object', () => {
       // let Floret = require('../lib/floret');
       // let floret = new Floret('fooService', 'some.host.service.next');
        assert.exists(() => {
            let x = new floret()

        }, 'Floret is not null or undefined');

    });

    it('should have a gatewayUri', () => {
        //let Floret = require('../lib/floret');
        //let floret = new Floret('fooService', 'https://some.host.service.next:3000');
        assert.isTrue(floret.gatewayUri === 'https://some.host.service.next:3000');
    });

    it('should have a name', () => {
       // let Floret = require('../lib/floret');
        //let floret = new Floret('fooService', 'https://some.host.service.next:3000');
        assert.isTrue(floret.name === 'fooService');
    });

    describe('initialize', () => {
        beforeEach(() => {
           // floret.initialize();
        });
        it('should initialize', () => {
            floret.initialize().then(() => {
                expect(registerAPIStub.callCount === 1);
            })
        });

        it('should have new pub object', () => {
            floret.initialize().then(() => {
                assert.exists(floret.pub, 'floret sub is not null or undefined');
            });
        });

        it('should have new sub object', () => {
            floret.initialize().then(() => {
                assert.exists(floret.sub, 'floret sub is not null or undefined');
            });
        });

        it('should have new gateway object', () => {
            floret.initialize().then(() => {
                assert.exists(floret.gateway, 'floret sub is not null or undefined');
            });
        });

        it('should have new channel object', () => {
            //registerAPIStub.restore();
            console.log('here')
            floret.getRegisteredAPIs.restore();
            floret.initialize().then(() => {
                console.log('apis: ' + floret.registeredAPIs);
                assert.exists(floret.channel, 'floret sub is not null or undefined');

            });

        });



    });

    describe('core functions', () => {
        let inst;

        beforeEach(() => {
            inst = floret.initialize()
            registerAPIStub.resolves([{
                'name': ''
            }])
        });

        it('should resolve', () => {
            inst.then(() => console.log('resovled'));
        })

    });

    //  describe('subscribe', () => {

    //});

});