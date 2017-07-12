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
    const gateway = Symbol('gateway');
    const sub = Symbol('sub');
    const pub = Symbol('pub');
    const channel = Symbol('channel');
    const auth = Symbol('auth');
    const primeSubService = Symbol('subSvc') ;


    Floret = class Floret extends Koa {

        constructor(serviceName, gatekeeperURI, ...options) {

            // todo: will accept the objects constructor(name, gateway, sub, pub, channel, auth)
            super();
            // class overrides
            Gatekeeper = options[0] || Gatekeeper;
            Gateway = options[1] || Gateway;
            Sub = options[2] || Sub;
            Pub = options[3] || Pub;

            this[name] = serviceName;

            this[gatekeeper] = Gatekeeper.bind(null, gatekeeper);
            this[gateway] = Gateway.bind(null, gatekeeper);
            this[sub] = Sub.bind(null, this.gateway);
            this[pub] = Pub.bind(null, this.gateway);

            // this[channel] = Channel.bind(null, this.gateway);
            this[primeSubService] = this.gateway;

            // any routes added
            this.use(router.routes());

        }

        async start() {
            console.log('floret start')
            return true;
            //return await this.gateway.init();
            //await this.sub.init();
            //await this.pub.init();
            //await this.channel.init();
            //return true;
        }

        /*
         need to determine the gateway from the container
         part of the container deployment includes gateway information
         */
        get name() {
            return this[name];
        }

        get host() {
            return this[host];
        }

        get gateway() {
            return this[gateway];
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
            return this[router];
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