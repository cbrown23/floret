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



// core floret services
let Sub = require('floret-subscriber');
let Pub = require('floret-publisher');
let Gateway = require('floret-gateway');
let Gatekeeper = require('floret-gatekeeper');

//const Channel = require('floret-channel');
//const Auth = require('./floret-auth');

let Floret, gatewayLib, subscriberLib, publisherLib;
{
    // private
    const host = Symbol('host');
    const name = Symbol('name');
    const gatekeeper = Symbol('gatekeeper');
    const gateways = Symbol('gateways');
    const sub = Symbol('sub');
    const pub = Symbol('pub');
    const channel = Symbol('channel');
    const auth = Symbol('auth');
    const primeSubService = Symbol('subSvc') ;
    const appRouter = Symbol('router');
    const primaryGateway = Symbol('primaryGateway');


    Floret = class Floret extends Koa {

        constructor(serviceName, gatekeeperURI, ...options) {
            // options override the core modules
            // options (Gatekeeper, Gateway, Sub, Pub)
            // todo: will accept the objects constructor(name, gateway, sub, pub, channel, auth)
            super();
            // class overrides
            Gatekeeper = options[0] || Gatekeeper;
            Gateway = options[1] || Gateway;
            Sub = options[2] || Sub;
            Pub = options[3] || Pub;

            this[name] = serviceName;
            this[gatekeeper] = new Gatekeeper(gatekeeperURI);
            this[sub] = Sub.bind(null, this.gateway);
            this[pub] = Pub.bind(null, this.gateway);

            // this[channel] = Channel.bind(null, this.gateway);
            this[primeSubService] = this.gateway;
            this[appRouter] = router;

            // any routes added
            this.use(this[appRouter].routes());
        }

        async init() {
            console.log('floret start')
            // load gateways
            this[gateways] = await this.loadGateways();
            this[primaryGateway] = this.getPrimaryGateway();
            console.log("Primary Gateway: " + this[primaryGateway].name);
        }
        
        async loadGateways(){
            return await this[gatekeeper].getGateways().map(gw => {
                return new Gateway(gw.name, gw.uri, gw.adminPort, gw.proxyPort, gw.type);
            })
        }

        get name() {
            return this[name];
        }

        get host() {
            return this[host];
        }

        get gateways() {
            return this[gateways];
        }
        
        get gatekeeper() {
            console.log('return gatekeeper object');
            return this[gatekeeper];
        }

        get sub() {
            return this[sub];
        }

        get pub() {
            return this[pub];
        }

        get channel() {
            return this[channel];
        }

        //get app(){  console.log('this.koa'); console.log(this.koa);return this.koa};
        get router() {
            return this[appRouter];
        }

        get serve() {
            return this[serve];
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
                body: {
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

        getPrimaryGateway(){
            console.log('looking for primary')
            return this[gateways].filter((gw) => {
                console.log('look ' + gw.type)
                return gw.type === 'primary';
            })[0];
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


};

module.exports = Floret;