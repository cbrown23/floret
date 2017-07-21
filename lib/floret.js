'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const Rx = require('rxjs');
const fetch = require('node-fetch');
const http = require('http');
const rp = require('request-promise');

// core floret services
let Sub = require('floret-subscriber');
let Pub = require('floret-publisher');
let Gateway = require('floret-gateway');
let Channel = require('floret-channel');

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
    const channelPublishers = Symbol('channelPublishers');
    // this is retrieved from the container


    Floret = class Floret extends Koa {
        // everything but service name is optional
        constructor(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort, ...options) {
            super();

            this[host] = serviceHost;
            this[uri] = serviceURI;
            this[port] = servicePort;
            this[appRouter] = this.context.appRouter = router;
            this[listen] = super.listen;
            this[name] = serviceName;
            this[gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[subscribers] = [];
            this[channels] = [];
            this[channelPublishers] = {};
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
                let api = await this[gateway].register(this[name], this[uri], this[host] + ':' + this[port]+ '/' + this[name] + '/heartbeat', methods);

                console.log('complete.  api : ' + api.status + ', ' + JSON.stringify(api.api));

                // create subscriber events api
                console.log('creating subscriber events service');
                await this.subscriberEventsIn();
                console.log('subscriber events endpoint now active. accepting new subscribers');

                //console.log('creating default channel');
                // await this.createChannel('default', 'default channel for ' + this[name] + ' service.');

                console.log('constructing subscriber list');
                this[subscribers] = await this.refreshSubscribers();
                console.log('subscribers found: ' + this[subscribers].length);

                console.log('creating channels')
                await this.createChannels();
                console.log('channels created')
                // await createSubscriptions();

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
                this.use(bodyParser());
                this.use(async (ctx, next) => {
                    console.log('here')
                    // the parsed body will store in ctx.request.body
                    // if nothing was parsed, body will be an empty object {}
                    ctx.body = ctx.request.body;
                    console.log('bosy: ' + JSON.stringify(ctx.body));
                    next();
                });

                this.use(this[appRouter].routes());
                console.log('will listen on ' + portOverride);
                this[listen](portOverride || this[port]);
                console.log('listening on port  ' + (portOverride || this[port]));
            }).catch((e) => {
                let err = Error("Error occurred while initializing floret.  Service not started. "
                    + e.message, e.stack);
                console.log(err.message);
                throw e;
            });

        }

        async createChannels(){
            console.log("createChannels functions");
            await this[channels].map( (channel) => {
                this.createChannel(channel).then ( (observable) => {
                    console.log('cCHANNEL CREATED')
                   // observable.subscribe(channel.handler);
                });
            });
        }

        async createChannelAPI(channel){
            await this[gateway].createChannelAPI(this[name] + '_channels_' + channel.name, `/${this[name]}/channels/${channel.name}/`, `${this.url}/${this[name]}/channels/${channel.name}` , 'GET')
                .then((res) =>{
                    console.log('channel created')
                }).catch((e) => {
                    if (!e.status === 409) {
                        console.log('error adding new subscriber api. ' + e.message);
                        throw e;
                    } else {
                        console.log('Channel endpoint already exists: ');
                    }
                })
        }

        async createChannel(channel){
            console.log('CREATE_CHANNEL channel: ' + channel.name);
            console.log('this is ' + this);
            // create endpoint at gateway
            console.log('creating channel api')
            await this.createChannelAPI(channel);

            console.log('creating endpoint')
            // add service
            this[channelPublishers][channel.name] = new Rx.Subject();

            this[appRouter].get(channel.uri, (ctx) => {
                console.log('channel request ');



                ctx.body = {
                    name: channel.name,
                    description: channel.description
                };
            });

            this[appRouter].post(channel.uri, (ctx) => {

                channel.handler(ctx,  this[channelPublishers][channel.name]);
                ctx.response.status = 200;
                ctx.response.message = ctx.body;
            });

            console.log('service added');
            // create an observable

            
            console.log('created a channel called ' + channel.name);
            return this[channelPublishers][channel.name];
        }

        getPublisher(name){
            return this[channelPublishers][name];
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
                subscriberApi = await this[gateway].addAPI(this[name] + '_subscribers', this[uri] + '/subscribers', this[host] + ':' + this[port]+ '/' + this[name] + '/subscribers', 'GET,POST,OPTIONS');
                console.log('new subscriber created : ' + JSON.stringify(subscriberApi) + subscriberApi.status + ', ' + JSON.stringify(subscriberApi.api));
            }catch(e){
                console.log(e.message);
                //console.log(e.stack);
                //console.log('subscriber endpoint already exists')
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
            this[appRouter].get('/', (ctx, next) => {
                console.log('another reives');
                next();
            });

            this[appRouter].get('/heartbeat/', (ctx, next) => {
                console.log('request received');
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

        get channels(){
            return this[channels];
        }

        set channels(channelArray){
            this[channels] = channelArray;
            console.log('channels set: ' + this[channels].length);
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

        static get Channel(){
            return Channel;
        }

        messageSubscribers(){

        }
        
    }

}

module.exports = Floret;