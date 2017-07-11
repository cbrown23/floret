const assert = require('chai').assert;
const expect = require('chai').expect;
const sinon = require('sinon');
let Floret, floret;

describe('As an API Gateway service, it ', () => {

    beforeEach(()=> {
        Floret = require('../lib/floret');
        floret = new Floret('fooService', 'https://some.host.service.next:3000');
    });

    describe('provides an admin api, which', () => {
        it('should connect to the api gateway', () => {

        });

        it('should retrieve all apis from gateway', () => {

        });

        it('should retrieve a single api from the gateway', () => {

        });

        it('should determine if an api is registered', () => {

        });

        it('should register a new api with the gateway', () => {

        });

        it('should delete an api from the registry', () => {

        });

        it('should update an api in the gateway registry', () => {

        });
    })

    describe('proxy', () => {
        it('should connect to the api gateway', () => {

        });

        it('should retrieve all apis from gateway', () => {

        });

        it('should retrieve a single api from the gateway', () => {

        });

        it('should determine if an api is registered', () => {

        });

        it('should register a new api with the gateway', () => {

        });

        it('should delete an api from the registry', () => {

        });

        it('should update an api in the gateway registry', () => {

        });
    })

});