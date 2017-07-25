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
    const _host = Symbol('host');
    const _name = Symbol('name');
    const _port = Symbol('port');
    const _uri = Symbol('uri');
    const _sub = Symbol('sub');
    const _pub = Symbol('pub');
    const _channel = Symbol('channel');
    const _appRouter = Symbol('router');
    const _gateway = Symbol('gateway');
    const _listen = Symbol('listen');
    const _subscribers = Symbol('subscribers');
    const _channels = Symbol('channels');
    const _channelPublishers = Symbol('channelPublishers');
    // this is retrieved from the container


    Floret = class Floret extends Koa {
        // everything but service name is optional
        constructor(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort, ...options) {
            super();

            this[_host] = serviceHost;
            this[_uri] = serviceURI;
            this[_port] = servicePort;
            this[_appRouter] = this.context.appRouter = router;
            this[_listen] = super.listen;
            this[_name] = serviceName;
            this[_gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[_subscribers] = [];
            this[_channels] = [];
            this[_channelPublishers] = {};
        }

        async init() {
            try {
                this.router.prefix('/' + this[_name]);
                await this[_gateway].gatewayHealthCheck();
                await this[_gateway].register(this[_name], this[_uri], this[_host] + ':' + this[_port]+ '/' + this[_name] + '/healthcheck', 'GET');
                await this.createChannels();
                await this.createSubscriptions();
                await this.createHealthCheck();

            } catch (e) {
                console.log('Error occurred during floret init routine.' );
                console.log(e);
                throw e;
            }
            console.log('finishing init, returning true');
            return true;
        }

        async listen(portOverride) {
            await this.init().then(() => {
                this.use(bodyParser());
                this.use(async (ctx, next) => {
                    ctx.body = ctx.request.body;
                    next();
                });

                this.use(this[_appRouter].routes());
                this[_listen](portOverride || this[_port]);
                console.log('listening on port  ' + (portOverride || this[_port]));
            }).catch((e) => {
                let err = Error("Error occurred while initializing floret.  Service not started. "
                    + e.message, e.stack);
                console.log(err.message);
                throw e;
            });
        }

        async createChannel(channel){

            // create an observable for each channel
            this[_channelPublishers][channel.name] = new Rx.Subject();

            // add the routes
            this.createChannelRoutes(channel);
            
            // create channel at api gateway
            await this.createChannelAPI(channel);

            return this[_channelPublishers][channel.name];
        }

        async createChannels(){
            if (this[_channels] && this[_channels].length > 0) {
                for (let i = 0; i < this[_channels].length; i++) {
                    await this.createChannel(this[_channels][i])
                }
            }
            if (!this[_channelPublishers]['default']){
                let defaultChannel  = new Floret.Channel('default',  'default channel for ' + this[_name] + ' service.', '/', () => {});
                await this.createChannel(defaultChannel);
            }
        }

        async createChannelAPI(channel){
            await this[_gateway].createChannelAPI(this[_name] + '_channels_' + channel.name, `/${this[_name]}/channels/${channel.name}/`, `${this.url}/${this[_name]}/channels/${channel.name}` , 'GET')
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

        createChannelRoutes(channel){
            this[_appRouter].get(channel.uri, (ctx) => {
                ctx.body = {
                    name: channel.name,
                    description: channel.description
                };
            });

            this[_appRouter].post(channel.uri, (ctx) => {
                channel.handler(ctx,  this[_channelPublishers][channel.name]);
                ctx.response.status = 200;
                ctx.response.message = ctx.body;
            });
        }

        async pauseChannel(name){

            this[_appRouter].get('/channels/' + name + '/pause', (ctx) => {
                console.log('channel request ');

                ctx.body = {
                    name: this[_channelPublishers][name].name,
                    paused: this[_channelPublishers][name].pause ? true : false
                };
            });

            this[_appRouter].post('/channels/' + name + '/pause', (ctx) => {
                console.log('channel request ');
                this[_channelPublishers][name].pause = Object.create(this[_channelPublishers][name].handler.prototype);
                this[_channelPublishers][name].handler = () => {};
            });
        }

        async resumeChannel(name){
            this[_channelPublishers][name].handler = Object.create(this[_channelPublishers][name].pause.prototype);
            delete this[_channelPublishers][name].pause;
        }


        getPublisher(name){
            console.log(JSON.stringify(this[_channelPublishers]));
            return this[_channelPublishers][name];
        }

        attachSubscribers(){
            console.log('adding subscriptions')
            if (this[_subscribers] && this[_subscribers].length > 0) {
                this[_subscribers].map((subscriber) => {
                    if (!subscriber.channel || subscriber.channel === 'default') {
                        console.log('subscribing ' + subscriber);

                        this[_channels]['default'].subscribe((msg) => {
                            console.log('default channel broadcast received');
                            this[_gateway].send({
                                header: {
                                    'Content-Type': 'application/json'
                                },
                                method: 'POST',
                                body: {
                                    name: this[_name],
                                    message: msg
                                },
                                uri: subscriber.uri
                            })
                        });

                    }
                });
            }
        }

        async subscribeToServices() {
            if (this[_subscribers] && this[_subscribers].length > 0) {
                for (let i = 0; i < this[_subscribers].length; i++) {
                    await this.subscribeToService(this[_subscribers][i].publisherName, this[_subscribers][i].publisherChannelName)
                }
            }
        }

        async subscribeToService(name, channelName){
            // get the uri 
            let api = this[_gateway].getAPI(name + '_' + channelName);
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: {
                    "name": this[_name],
                    //"url": "http://127.0.0.1:8888/alerts/new",
                    
                    "channel": "pulse"
                },
                uri: subscriber.url
            };
            this.send(options);
        }

        async createSubscriptions(){
            await this.subscriberEventsIn();
            await this.refreshSubscribers();
            this.attachSubscribers();
        }

        async subscriberEventsIn() {
            // await addAPI();
            let subscriberApi;
            console.log('creating subscription endpoints: ' + this[_name]);
            await this[_gateway].getAPIsWithURL(this[_host] + ':' + this[_port] + '/' + this[_name] + '/subscribers/').then((res) => {
                this[_subscribers] =res;
                console.log('subscribers set to : ' + this[_subscribers]);
            });

            // creates a subscriber endpoint.
            this[_appRouter].post('/subscribers/', async (ctx, next) => {
                console.log('new subscriber event');

                // console.log(ctx.body);
                let subscriber = ctx.request.body;

                // register a subscriber at api gateway
                // /fiz3/subscribers/<name>/<uri>/
                console.log('interpolation: ' + `\/${this[_name]}\/subscribers\/${subscriber.name}${subscriber.uri}`);

                let subURI = `\/${this[_name]}\/channels\/${subscriber.channel || 'default'}\/subscribers\/${subscriber.name}`;

                ctx.body = await this[_gateway].addAPI(this[_name] + '_subscribers' + '_' + subscriber.name, subURI, subscriber.url, 'GET,POST,OPTIONS')
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
                await this.refreshSubscribers();

                let pub = this.getPublisher(subscriber.channel);

                let sub = pub.subscribe( (msg) => {
                    console.log("MMESSGE RECEIVED");
                    this[_gateway].send({
                        header: {
                            'Content-Type': 'application/json'
                        },
                        method: 'POST',
                        body: {
                            name: this[_name],
                            message: msg
                        },
                        uri: subscriber.url
                    })


                })

            })
                // references the subscriber endpiont
            .get('/subscribers/', (ctx, next) => {
                console.log('get requst for subscribers');
                ctx.body = this[_subscribers];

               // ctx.body = this[_subscribers];
            })
            .patch('/subscribers/:name', (ctx, next) => {
                let event = ctx.body;
            })
            .put('/subscribers/:name', (ctx, next) => {
                let event = ctx.body;
            });

            console.log('updating gateway with subscribers endpoint.');
            try {
                subscriberApi = await this[_gateway].addAPI(this[_name] + '_subscribers', this[_uri] + '/subscribers', this[_host] + ':' + this[_port]+ '/' + this[_name] + '/subscribers', 'GET,POST,OPTIONS');
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
            this[_channels][channelName].next(message);
        }

        subscribersByChannel(channelName){
            return this[_subscribers].filter((sub) => {
                if (channelName === 'default'){
                    return !sub.channel;
                } else {
                    return sub.channel === channelName;
                }
            })
        }

        createHealthCheck() {
            this[_appRouter].get('/healthcheck/', (ctx, next) => {
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
            return this[_channels];
        }

        set channels(channelArray){
            this[_channels] = channelArray;
            console.log('channels set: ' + this[_channels].length);
        }

        get name() {
            return this[_name];
        }

        get host() {
            return this[_host];
        }

        get port() {
            return this[_port];
        }

        get url() {
            return this[_host] + ':' + this[_port];
        }

        get gateways() {
            return this[gateways];
        }

        get sub() {
            return this[_sub];
        }

        get pub() {
            return this[_pub];
        }

        get channel() {
            return this[_channel];
        }

        get router() {
            return this[_appRouter];
        }

        get serve() {
            return this[serve];

        }

        get gateway() {
            return this[_gateway];
        }

        async deleteAPI(name) {
            return this.gateway.deleteAPI(name);
        }

        async getAPI(name) {
            return this.gateway.getAPI(name);
        }

        async refreshSubscribers(){
            console.log('refreshing subscribers')
            this[_subscribers] = await this[_gateway].loadSubscribers(this[_name]);
            return this[_subscribers];
        }

        static get Channel(){
            return Channel;
        }

        static get Subscriber(){
            return Subscriber;
        }

        static localParams(serviceName, ...[options]) {
            options = options || [];
            //(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort)
            let serviceHost = options[0] || "http://127.0.0.1",
                servicePort = options[1] || 8080,
                serviceURI = options[2] || '/' + serviceName + '/test',
                gateway = options[3] || "http://127.0.0.1",
                gatewayProxyPort = options[4] || 8000,
                gatewayAdminPort = options[5] || 8001;

            return [serviceName, serviceHost, servicePort, serviceURI, gateway, gatewayAdminPort, gatewayProxyPort];
        }
    }

}

module.exports = Floret;