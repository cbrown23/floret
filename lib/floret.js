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

        //this.initialize();
        /*this.getRegisteredAPIs(this.gatewayUri, obj => obj.name === this.name).then(apis => {
            console.log('apis loaded')
            this.registeredAPIs =apis;
            this.initialize();
        });
        */

        /*
         this.sub = new Sub();
         this.pub = new Pub();
         this.gateway = new Gateway(gatewayUri);
         this.channel = new Channel();
         */
    }

    async initialize() {
        console.log('initializeing');
        this.sub = new Sub();
        this.pub = new Pub();
        this.gateway = new Gateway(this.gatewayUri);
        this.channel = new Channel();

        // load apis
        this.gatewayUri = 'http://10.55.84.91:8001/apis';
        this.registeredAPIs = await this.getRegisteredAPIs(this.gatewayUri, obj => obj.name === this.name).then(apis => apis);
        return true;
    }

    // static getRegisteredAPIs(gatewayUri, obj => obj.name === this.name).then(apis => {
    //     console.log('apis loaded')
    //     this.registeredAPIs(apis);
    // });

    get registeredAPIs() {
        return this.registeredAPIs;
    }

    set registeredAPIs(val) {
        this.registered = val;
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

    addRequestToken(token) {
        this.use(function (ctx, next) {
            ctx.set('api-key', token);
        })
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

    addService(name, uri, methods) {
        this.services[uri] = {methods: methods};

        let svcObj = {
            uri: uri,
            methods: {}
        };
        methods.map((m) => {
            // attach to router
            let newMethod = {
                name: m,
                observable: new Rx.Subject()
            };

            svcObj.methods[m] = newMethod;

            router[m](uri, koaBody, (ctx, next) => {
                newMethod.observable.next(ctx);
                console.log('next');

                if (!this.isApiRegistered(name)) {
                    gateway.register(name, uris, upstream_url, methods)
                }
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

    registerWithGateway() {
        //todo:
        /*

         curl -i -X POST \
         --url  http://10.55.84.91:8001/apis/ \
         --data 'name=vra-api-test' \
         --data 'hosts=vra1.atxlab.acxiom.net' \
         --data 'uris=/vra/auth-test/' \
         --data 'upstream_url=https://vra1.atxlab.acxiom.net/identity/api/tokens' \
         --data 'methods=POST'

         */
    }

    publish(name, msg) {
        this.subscribers.filter((sub) => {
            return sub.name === name;
        }).map((sub) => {
            // send event
            subscriber.post(msg);
        })
    }

    isApiRegistered(apiName, method) {
        // todo: update this registeredApi call
        let api = this.registeredAPIs[apiName];
        return (!!api && !!api.methods.indexOf(method));
    }

    async getRegisteredAPIs(uri) {
        console.log('getRegisteredAPIs async function: ' + uri)
        let apis = [];

        let options = {
            'uri': uri,
            'method': 'GET',
            'headers': {
                'Content-Type': 'application/json'
            }
        };

        return await rp(options)
             .then(apis => {console.log(apis); return apis})
             .catch((e) => {
                console.log('error retrieving apis: ' + e.message);
             })
    }
}
;


module.exports = Floret;