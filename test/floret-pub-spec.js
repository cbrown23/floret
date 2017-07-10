const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');
let Floret, floret;

describe('As a Publisher, it ', () => {

    beforeEach(()=> {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
    });


    it('should create a new publisher when constructed', () => {

    });

    it('should fail if not all arguments passed to constructor', () => {

    });

    it('should request subscribers list from subscription ms', () => {

    });
    
    it('should create a new subscriber event endpoint', () => {
        
    });

    it('should construct a list of channel subscribers', () => {

    });

    it('should send messages to subscriber endpoints', () => {

    });

    it('should update subscribers list on incoming request', () => {

    });
    
    it('should remove a publisher', () => {

    });

    it('should update a publisher', () => {

    });
    
    it('should create a subscription to subscription events', () => {
        
    });
    

});