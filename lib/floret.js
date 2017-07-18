'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');
var koaBody = require('koa-body')();
const Rx = require('rxjs');
const fetch = require('node-fetch');
const http = require('http');
const rp = require('request-promise');


// environment variables
//const apiGatewayURL = process.env.GATEWAY_URL;
//const apiGatewayProxyPort = process.env.GATEWAY_PROXY_PORT;
//const apiGatewayAdminPort = process.env.GATEWAY_ADMIN_PORT;
//const hostURL = process.env.CONTAINER_HOST;
//const hostPort = process.env.CONTAINER_PORT;
/*
console.log('apiGatewayURL: ' + apiGatewayURL);
console.log('apiGatewayProxyPort: ' + apiGatewayProxyPort);
console.log('apiGatewayAdminPort: ' + apiGatewayAdminPort);
console.log('hostURL: ' + hostURL);
console.log('hostPort: ' + hostPort);
*/

// core floret services
let Sub = require('floret-subscriber');
let Pub = require('floret-publisher');


let Gateway = require('floret-gateway');
// let Gatekeeper = require('floret-gatekeeper');

//const Channel = require('floret-channel');
//const Auth = require('./floret-auth');

let Floret, gatewayLib, subscriberLib, publisherLib;
{
    // private
    const host = Symbol('host');
    const name = Symbol('name');
    const port = Symbol('port');
    const uri = Symbol('uri');
    const sub = Symbol('sub');
    const pub = Symbol('pub');
    const channel = Symbol('channel');
    const auth = Symbol('auth');
    const appRouter = Symbol('router');
    const primaryGateway = Symbol('primaryGateway');
    const gateway = Symbol('gateway');
    const listen = Symbol('listen');
    const subscribers = Symbol('subscribers');
    const channels = Symbol('channels');
    // this is retrieved from the container


    Floret = class Floret extends Koa {
        // everything but service name is optional
        constructor(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort, ...options) {
            console.log('constructor start');

            super();
            this[uri] = this.context.uri = serviceURI;
            this[port] = this.context.port = servicePort;
            this[appRouter] = this.context.appRouter = router;
            this[host] = serviceHost;
            //this[listen] = super.listen;


            // plugin pub and sub classes, or use built-in classes by default
            Sub = options[0] || Sub;
            Pub = options[1] || Pub;

            this[name] = serviceName;
            this[gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[subscribers] = [];
            this[channels] = [];
            this.use(koaBody);
            //this[sub] = new Sub(this[gateway]);
            //this[pub] = new Pub(this[gateway]);

            console.log('constructor complete.')
        }

        async init() {

            
            try {
                console.log('prefixing endpoints: ' + '/' + this[name]);
                this.router.prefix('/' + this[name]);

                console.log('floret service starting');
                this.startHeartbeat();
                console.log('started.');

                console.log('checking for gateway pulse.')
                await this[gateway].heartbeat();
                console.log('gateway is alive.')

                let methods = 'GET,POST,PUT,PATCH,UPDATE,DELETE,OPTIONS';
                // register service with api gateway

                console.log('registering base-level api with gateway')
                let api = await this[gateway].register(this[name], this[uri], this[host] + '/' + this[name] + '/heartbeat', methods);

                console.log('complete.  api : ' + api.status + ', ' + JSON.stringify(api.api));

                // create subscriber events api
                console.log('creating subscriber events service');
                await this.subscriberEventsIn();
                console.log('subscriber events endpoint now active. accepting new subscribers');
                
                console.log('constructing subscriber list');
                this[subscribers] = await this.refreshSubscribers();
                console.log('subscribers found: ' + this[subscribers].length);

                console.log('creating default channel');
                await this.createChannel('default', 'default channel for ' + this[name] + ' service.');

                // attach
                console.log('adding subscriptions')
                if (this[subscribers].length > 0) {
                    console.log('at least 1 subscriber')
                    this[subscribers].map((subscriber) => {
                        console.log('looping subscribers')
                        if (!subscriber.channel || subscriber.channel === 'default') {
                            console.log('subscribing ' + subscriber);
                            this[channels]['default'].subscribe((msg) => {
                                console.log('default channel broadcast received');
                                this[gateway].send({
                                    header: {
                                        'Content-Type': 'application/json'
                                    },
                                    method: 'POST',
                                    body: {
                                        name: this[name],
                                        message: msg
                                    },
                                    uri: subscriber.uri
                                })
                            });
                        }
                    });
                } else {
                    console.log('no subscribers')
                }


                
                // find each subscriber of the default channel 
                
                // create default channel
                    // creates an endpoint at api gateway (allow for channel search)
                    // names the channel
                    // gets an observable
                    // attach each subscriber of the default channel to the observable

            } catch (e) {
                console.log('Error occurred during floret init routine.' );
                console.log(e);
                throw e;
            }
            console.log('finishing init, returning true');
            return true;
        }

        async listen(portOverride) {
            console.log('listen fn')
            await this.init().then(() => {
                console.log('this: ' + this);
                console.log('init resolved: ' + this[appRouter]);
                this.use(this[appRouter].routes());
                console.log('ifailed using routes');
                super.listen(portOverride || this[port]);
                console.log('listening on port  ' + (portOverride || this[port]));
            }).catch((e) => {
                let err = Error("Error occurred while initializing floret.  Service not started. "
                    + e.message, e.stack);
                console.log(err.message);
                throw e;
            });

        }

        async createChannel(channelName, description){
            console.log('creating channel: ' + channelName)
            // create endpoint at gateway
            await this[gateway].createChannelAPI(this[name] + '_channels_' + channelName, `/${this[name]}/channels/${channelName}/`, `${this.url}/${this[name]}/channels/${channelName}` , 'GET').then((res) =>{
                console.log('channel created')
            }).catch((e) => {
                if (!e.status === 409) {
                    console.log('error adding new subscriber api. ' + e.message);
                    throw e;
                } else {
                    console.log('STATUS: ' + e.status)
                    console.log('Subscriber endpoint already exists: ' + e.message);
                }
            });

            // add service
            this[appRouter].get('/channels/' + channelName, (ctx) => {
                console.log('channel request');
                ctx.body = {
                    name: channelName,
                    description: description
                };
            });

            console.log('created channel route ');

            // create an observable

            this[channels][channelName] = new Rx.Subject();
            console.log('created a channel called ' + channelName);

            return this[channels][channelName];
        }

        async subscriberEventsIn() {
            // await addAPI();
            let subscriberApi;
            console.log('creating subscription endpoints: ' + this[name]);
            await this[gateway].getAPIsWithURL(this[host] + ':' + this[port] + '/' + this[name] + '/subscribers').then((res) => {
                this[subscribers] =res;
                console.log('subscribers set to : ' + this[subscribers]);
            });

            // creates a subscriber endpoint.
            this[appRouter].post('/subscribers/', async (ctx, next) => {
                console.log('new subscriber event');

                // console.log(ctx.body);
                let subscriber = ctx.request.body;

                // register a subscriber at api gateway
                // /fiz3/subscribers/<name>/<uri>/
                console.log('interpolation: ' + `\/${this[name]}\/subscribers\/${subscriber.name}${subscriber.uri}`);

                let subURI = `\/${this[name]}\/channels\/${subscriber.channel || 'default'}\/subscribers\/${subscriber.name}`

                ctx.body = await this[gateway].addAPI(this[name] + '_subscribers' + '_' + subscriber.name, subURI, subscriber.url, 'GET,POST,OPTIONS')
                    .then((res) => {
                        console.log('result of adding subscribger: '  + JSON.stringify(res));

                        return res;
                    }).catch((e) => {
                        if (!e.status === 409) {
                            console.log('error adding new subscriber api. ' + e.message);
                            throw e;
                        } else {
                            console.log('STATUS: ' + e.status)
                            console.log('Subscriber endpoint already exists: ' + e.message);
                        }
                    });
                console.log('refreshing subscribers');
                this.refreshSubscribers();

            })
                // references the subscriber endpiont
            .get('/subscribers/', (ctx, next) => {
                console.log('get requst for subscribers');
                ctx.body = this[subscribers];

               // ctx.body = this[subscribers];
            })
            .patch('/subscribers/:name', (ctx, next) => {
                let event = ctx.body;
            })
            .put('/subscribers/:name', (ctx, next) => {
                let event = ctx.body;
            });

            console.log('updating gateway with subscribers endpoint.');
            try {
                subscriberApi = await this[gateway].addAPI(this[name] + '_subscribers', this[uri] + '/subscribers', this[host] + '/' + this[name] + '/subscribers', 'GET,POST,OPTIONS');
                console.log('new subscriber created : ' + JSON.stringify(subscriberApi) + subscriberApi.status + ', ' + JSON.stringify(subscriberApi.api));
            }catch(e){
                console.log(e.message);
                console.log(e.stack);
                console.log('subscriber endpoint already exists')
            }

        }

        broadcast(channelName, message){
            let channel;
            // default
            if (!channelName){
                channel = 'default';
            }

            // broadcast message to channel
            this[channels][channelName].next(message);
        }

        subscribersByChannel(channelName){
            return this[subscribers].filter((sub) => {
                if (channelName === 'default'){
                    return !sub.channel;
                } else {
                    return sub.channel === channelName;
                }
            })
        }

        startHeartbeat() {
            this[appRouter].get('/heartbeat/', (ctx, next) => {
                ctx.body = {"status": "active"};
            })
        }

        async getSubscribers(){
            let options = {
                "method": "get",
                "uri": ''
            }
            return await send(options);
        }

        get name() {
            return this[name];
        }

        get host() {
            return this[host];
        }

        get port() {
            return this[port];
        }

        get url() {
            return this[host] + ':' + this[port];
        }

        get gateways() {
            return this[gateways];
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

        get router() {
            return this[appRouter];
        }

        get serve() {
            return this[serve];

        }

        get gateway() {
            return this[gateway];
        }

        async deleteAPI(name) {
            return this.gateway.deleteAPI(name);
        }

        async getAPI(name) {
            return this.gateway.getAPI(name);
        }

        async refreshSubscribers(){
            console.log('refreshing subscribers')
            this[subscribers] = await this[gateway].loadSubscribers(this[name]);
            return this[subscribers];
        }

        messageSubscribers(){

        }
        
    }

}

module.exports = Floret;