'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
// const Rx = require('rxjs');
const fetch = require('node-fetch');
const http = require('http');

// core floret services
// let Sub = require('floret-subscriber');
// let Pub = require('floret-publisher');

let Gateway = require('floret-gateway');
let Service = require('floret-service');
let Channel = require('floret-channel');
let Subscriber = require('floret-subscriber');

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
    const _subscriptions = Symbol('subscriptions');
    const _channels = Symbol('channels');
    const _channelPublishers = Symbol('channelPublishers');
    const _routePrefix = Symbol('routePrefix');
    const _service = Symbol('service');

    Floret = class Floret extends Koa {

        constructor(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort, routePrefix, ...options) {
            // koa
            super();

            this[_host] = serviceHost;
            this[_name] = serviceName;
            this[_port] = servicePort;
            this[_uri] = serviceURI;
            this[_appRouter] = this.context.appRouter = router;
            this[_listen] = super.listen;

            this[_subscribers] = [];
            this[_subscriptions] = [];
            this[_channels] = [];
            this[_channelPublishers] = {};

            this[_routePrefix] = routePrefix || '/' + this[_name];
            this[_gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[_service] = new Service(this[_name], this[_host], this[_port], this[_uri], this[_routePrefix]);

            //todo: (Pub, Sub, Gateway, Channel) should be replaceable via ...options array
        }

        async init() {
            try {
                console.log('router prefix: ' + this[_routePrefix])
                this.router.prefix(this[_routePrefix]);

                await this[_gateway].gatewayHealthCheck();
                console.log('gateway is up.');
                await this[_gateway].register(this[_service]);
                console.log('service is now registered with gateway.');
                await this.initChannels();
                console.log('channels initialized.');
                await this.createSubscriptions();
                console.log("subscription channels created.");
                await this.subscribeToServices();
                console.log('subscribed to services.');
                await this.createHealthCheck();
                console.log('created healthcheck.');
                console.log('init complete.');

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

        async initChannels() {
            console.log('initializing channels')
            for (let i=0; i< this[_channels].length; i++){
                this.initChannel(this[_channels][i]);
            }
        }

        async initChannel(channel){
            console.log('init channel')

            console.log('create channel routes');
            await this.createChannelRoutes(channel);

            console.log('create createChannelAPI');
            await this.createChannelAPI(channel);
            console.log('add channel');
            this.addChannel(channel);
            console.log('create publisher');
            this[_channelPublishers][channel.name] = channel.observable;

            /*
            await channel.init().then(() =>{
                console.log("channel now init" + channel)
                this.addChannel(channel);
                console.log('set observable')
                this[_channelPublishers][channel.name] = channel.observable;
            });
            */
            console.log('init complete')
        }

        createChannelRoutes(channel){

            // /serviceName/channelName
            this[_appRouter].get(channel.uri, (ctx) => {
                ctx.body = {
                    name: channel.name,
                    description: channel.description
                };
            });

            this[_appRouter].post(channel.uri, (ctx) => {
                channel.handler(ctx,  channel.observable);

                ctx.response.status = 200;
                ctx.response.message = ctx.body;
            });

            //return this[_router];
        }

        async createChannelAPI(channel){
            channel.apiName = this[_name] + '_channels_' + channel.name;

            await this[_gateway].createChannelAPI(channel.apiName, `/${this[_name]}/channels/${channel.name}/`, `${this[_service].baseURL}${channel.uri}` , 'GET')
                .then((res) =>{
                    console.log('channel created');
                    // update channel
                    this.updateChannel(channel);

                }).catch((e) => {
                    if (e.statusCode !== 409) {
                        console.log('error adding new subscriber api. ' + e.message);
                        throw e;
                    } else {
                        console.log(e);
                        console.log('Channel endpoint already exists: ');
                    }
                });
            console.log('returning from channel api')
        }
        
        updateChannel(channel) {
            let name = channel.name;
            for (let i=0; i< this[_channels].length; i++){
                console.log('checking with: ' + this[_channels][i].config().name);
                if ( this[_channels][i].config().name === name) {
                    console.log('UPDATEING CHANNEL')
                    this[_channels][i] = channel;
                }

            }
        }

        async deleteChannel(channel){
            let channelInfo = channel.config();

            this[_gateway].deleteChannelAPI(channelInfo.apiName).then( () => {
                for (let i=0; i<this[_channels].length; i++){
                    if (this[_channels][i].name ===  channel.name){
                        console.log('channel deleted from api and local');
                        this[_channels].splice(i,1);
                        i++;
                    }

                }
            });
        }

        getPublisher(name){
            console.log('looking for publisher: ' + name);
            // console.log(JSON.stringify(this[_channelPublishers]));

            for (let key in this[_channelPublishers]) {
                console.log("existing pub: " + key);
            }

            return this[_channelPublishers][name];
        }

        attachSubscribers(){
             console.log('attaching subscribers');
            if (this[_subscribers] && this[_subscribers].length > 0) {
                this[_subscribers].map((subscriber) => {
                    /*
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

                    */
                });
            }
        }

        async subscribeToServices() {
            console.log("subscribing to services" + this[_subscriptions].length);
            if (this[_subscriptions] && this[_subscriptions].length > 0) {
                console.log('2')
                for (let i = 0; i < this[_subscriptions].length; i++) {
                    let sub = this[_subscriptions][i];

                    await sub.init();

                    //await this.subscribeToService(this[_subscriptions][i].publisherName, this[_subscriptions][i].publisherChannelName, this[_subscriptions][i].uri)
                }
            }
        }

        async subscribeToService(name, channelName, returnURI){
            console.log("subscribing to a service: " + name + ' ' + channelName + ' '+ returnURI);
            // get the uri 
            let api = await this[_gateway].getAPI(name).then((msg) => {
               return msg;
            }).catch((e) =>{
                console.log("catching error" + JSON.stringify(e))
                if (e.statusCode !== 404){
                    throw e;
                } else {
                    console.log('api not found: ' + name + '_' + channelName);
                }

            });

            if (api) {
                console.log('api exists')
                let options = {
                    header: {
                        'Content-Type': 'application/json'
                    },
                    method: 'POST',
                    body: {
                        "name": this[_name],
                        "url": this[_host] + ':' + this[_port] + returnURI,
                        "channel": channelName
                    },
                    uri: this[_gateway].proxyURI + '/' + name + '/subscribers'
                };
                console.log("Sending new subscriber request: " + JSON.stringify(options));
                this[_gateway].send(options);
            } else {
                console.log('Channel not found');
            }
        }

        async createSubscriptions(){
            await this.subscriberEventsIn();
            await this.refreshSubscribers();
            this.attachSubscribers();
        }

        async subscriberEventsIn() {
            // await addAPI();
            let subscriberApi;
            console.log('setting up subscription service: ' + this[_name]);
            subscriberApi = await this[_gateway].addAPI(this[_name] + '_subscribers', this[_uri] + '/subscribers', this[_host] + ':' + this[_port]+ '/' + this[_name] + '/subscribers', 'GET,POST,OPTIONS').then( () =>{
                console.log('subscriber endpoint added');

            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                }
            });

            console.log('loading any existing subscribers')
            await this[_gateway].getAPIsWithURL(this[_host] + ':' + this[_port] + '/' + this[_name] + '/subscribers/').then((res) => {
                console.log('existing subscriber found');
                this[_subscribers] = res;
                console.log('subscribers set to : ' + this[_subscribers]);
            });

            // creates a subscriber endpoint.
            console.log('creating subscriber service endpoints.');

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
                        if (e.statusCode !== 409) {
                            console.log('error adding new subscriber api. ' + e.message);
                            throw e;
                        } else {console.log('Subscriber endpoint already exists: ' + e.message);
                        }
                    });
                console.log('refreshing subscribers');
                await this.refreshSubscribers();
                console.log('length of subscribers is now : ' + this[_subscribers].length);

                console.log('getting publisher for ' + subscriber.channel);
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
            await this.refreshSubscribers();
            console.log('updating gateway with subscribers endpoint.');
            try {

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

        addChannel(channel){
            console.log('channel is '  + channel.name)
            console.log('pushing the channel ' + JSON.stringify(channel));
            this[_channels].push(channel);
        }

        getChannelByName(name){
            let res;
            for (let i=0; i< this[_channels].length; i++){
                console.log('checking with: ' + this[_channels][i].config().name);
                if ( this[_channels][i].config().name === name) {
                    res = this[_channels][i];
                }

            }

            return res;
        }

        get subscriptions(){
            return this[_subscriptions]
        }

        set subscriptions(subArray){
            this[_subscriptions] = subArray;
            console.log('subscriptions are set: ' + this[_subscriptions].length)
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

        get service() {
            return this[_service];
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
            let serviceHost = options[0] || "http://10.19.184.44",
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