'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');
const koaBody = require('koa-body')();
const Rx = require('rxjs');
const fetch = require('node-fetch');
const http = require('http');
const rp = require('request-promise');

const Sub = require('./floret-sub');
const Pub = require('./floret-pub');
const Gateway = require('./floret-gateway');
const Channel = require('./floret-channel');
const Auth = require('./floret-auth');

class Floret extends Koa {

    constructor(name, gatewayUri, token) {
        if (!name || !gatewayUri) {
            throw new Error('name and gatewayUri required');
        }

        super();
        this.name = name;
        this.gatewayUri = gatewayUri;
        this.token = token;
        this.services = {};
        this.subscribers = [];
        this.use(router.routes());
        //this.addRequestToken(token);
        this.options = {
            'api-key': token
        };
        this.initialize();
    }

    initialize() {
        this.gateway = new Gateway(this.gatewayUri);
        this.sub = new Sub(this.gateway);
        this.pub = new Pub(this.gateway);
        this.channel = new Channel(this.gateway);
    }

    async getAllAPIs(){
        return await this.gateway.retrieveAllAPIs();
    }

    static gatewayUri() {
        return this.gatewayUri;
    }

    static name() {
        return this.name;
    }

    static sub() {
        return this.sub;
    }

    static pub() {
        return this.pub;
    }

    static gateway() {
        return this.gateway;
    }

    static channel() {
        return this.channel;
    }

    //get app(){  console.log('this.koa'); console.log(this.koa);return this.koa};
    get router() {
        return router;
    }

    get serve() {
        return serve;
    }

    subscribe(service, method, fn) {
        this.sub.subscribe(service, method, fn);
    }

    publish(name, msg) {
        this.subscribers.filter((sub) => {
            return sub.name === name;
        }).map((sub) => {
            // send event
            subscriber.post(msg);
        })
    }

    async addAPI(name, methods, uris, upstreamURL, queryString) {

        let options = {
            header: {
                'Content-Type': 'application/json'
            },
            method: 'POST',
            body:
            {
                name: name,
                uris: uris,
                upstream_url: upstreamURL,
                methods: methods
            }
        };

        return await this.gateway.addAPI(options);
    }

    async deleteAPI(name) {
        return this.gateway.deleteAPI(name);
    }

    async getAPI(name) {
        return this.gateway.getAPI(name);
    }
    /*
    methods.map((m) => {
        // attach to router
        let newMethod = {
            name: name,
            observable: new Rx.Subject()
        };

        svcObj.methods[m] = newMethod;


        router[m](uri, koaBody, (ctx, next) => {
            newMethod.observable.next(ctx);
            console.log('next');

            //if (!this.isApiRegistered(name)) {
            //    gateway.register(name, uris, upstream_url, methods)
            //}

            // next();
        });
    });

    this.services[uri] = svcObj;

    // register with api-gateway
    // check if it exists
    // send it over
    //this.registerWithGateway();

    return svcObj;
}
*/

};



module.exports = Floret;