'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');

const bodyParser = require('koa-bodyparser');
const fetch = require('node-fetch');
const http = require('http');
const fs = require('fs');

const apiDoc = require('swagger-jsdoc');

// core floret services
const Config = require('./config/floret-config.js');
const Gateway = require('./gateway/floret-gateway.js');
const Service = require('./service/floret-service.js');
const Channel = require('./channel/floret-channel.js');
const Subscriber = require('./subscriber/floret-subscriber.js');
const Subscription = require('./subscription/floret-subscription.js');
const Package = require('./package/floret-package.js');

let Floret;

{
    // private
    const _host = Symbol('host');
    const _name = Symbol('name');
    const _port = Symbol('port');
    const _uri = Symbol('uri');
    const _sub = Symbol('sub');
    const _pub = Symbol('pub');
    const _appRouter = Symbol('router');
    const _gateway = Symbol('gateway');
    const _listen = Symbol('listen');
    const _subscribers = Symbol('subscribers');
    const _subscriptions = Symbol('subscriptions');
    const _channels = Symbol('channels');
    const _service = Symbol('service');
    const _baseURL = Symbol('baseURL');
    const _baseURI = Symbol('baseURI');

    // overridable classes
    const _gatewayClass = Symbol('gatewayClass');
    const _subscriberClass = Symbol('subscriberClass');
    const _subscriptionClass = Symbol('subscriptionClass');
    const _channelClass = Symbol('channelClass');
    const _serviceClass = Symbol('serviceClass');
    const _packageClass = Symbol('packageClass');
    const _configClass = Symbol('configClass');

    const _apiDoc = Symbol('apiDoc');
    Floret = class Floret extends Koa {

        constructor(config, ...[ConfigOverride, GatewayOverride, ChannelOverride, SubscriberOverride, SubscriptionOverride, ServiceOverride, PackageOverride]) {
            // koa
            super();

            if (config){
                this.configure(config,  ...[ConfigOverride, GatewayOverride, ChannelOverride, SubscriberOverride, SubscriptionOverride, ServiceOverride, PackageOverride])
            }

            this[_configClass] = Config;
            this[_gatewayClass] = Gateway;
            this[_channelClass] = Channel;
            this[_subscriberClass] = Subscriber;
            this[_subscriptionClass] = Subscription;
            this[_serviceClass] = Service;
            this[_packageClass] = Package;

            this[_apiDoc] = apiDoc;
         }

        configure(config, ...[ConfigOverride, GatewayOverride, ChannelOverride, SubscriberOverride, SubscriptionOverride, ServiceOverride, PackageOverride]) {
            let {serviceName, serviceHost, servicePort, serviceURI, gatewayHost, gatewayAdminPort, gatewayProxyPort} = config;

            this[_host] = serviceHost;
            this[_name] = serviceName;
            this[_port] = servicePort;
            this[_uri] = serviceURI || '/' + this[_name];

            this[_appRouter] = this.context.appRouter = router;
            this[_listen] = super.listen;

            this[_subscribers] = [];
            this[_subscriptions] = [];
            this[_channels] = {};

            this[_baseURL] = this[_host] + ':' + this[_port] + this[_uri];
            this[_baseURI] = this[_uri];

            // overrides
            this[_configClass] = ConfigOverride ?  ConfigOverride : Config;
            this[_gatewayClass] = GatewayOverride ? GatewayOverride : Gateway;
            this[_channelClass] = ChannelOverride ? ChannelOverride : Channel;
            this[_subscriberClass] = SubscriberOverride ? SubscriberOverride : Subscriber;
            this[_subscriptionClass] = SubscriptionOverride ? SubscriptionOverride : Subscription;
            this[_serviceClass] = ServiceOverride ? ServiceOverride : Service;
            this[_packageClass] = PackageOverride ? PackageOverride : Package;

            this[_gateway] = new this[_gatewayClass]('foo', gatewayHost , gatewayAdminPort, gatewayProxyPort);
            this[_service] = new this[_serviceClass](this[_name], this[_host], this[_port], this[_uri]);
        }

        /**
         *
         * @param portOverride
         */
        async listen(portOverride) {
            await this.init().then(() => {
                this.use(bodyParser());

                this.use(async (ctx, next) => {
                    ctx.body = ctx.request.body;
                    await next();
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
        /**
         *
         * @returns {boolean}
         */
        async init() {
            try {
                console.log('Initializing floret...')
                console.log('All routes prefixed with: ' + this[_uri])
                this.router.prefix(this[_uri]);
                await this[_gateway].gatewayHealthCheck();
                // register service with gateway
                await this[_gateway].register(this[_service]);
                await this.createSubscriberAPI();

                // init all explicit/implicit channels
                await this.initChannels();
                // find and attach subscribers to our service, and subscriptions to others
                await this.initSubscriptions();
                await this.createHealthCheck();
                await this.publishAPIDocumentation();
                console.log(`floret service ${this[_name]} initialized`);
            } catch (e) {
                console.log('Error occurred during floret init routine.' );
                console.log(e);
                throw e;
            }
            return true;
        }

        async publishAPIDocumentation(newPaths=[]) {

            let apiSpec = this.buildAPISpec(newPaths);
            this.registerAPI(`${this[_name]}_api-spec.json`, '/api-spec.json', 'GET,POST,DELETE').then( (res) => {

            }).catch( (e) =>{
                if (e.statusCode != 409) {
                    console.log('error registering api' + e.message);
                }
            });

            let channel = await this.createAPISpecChannel();

            // subscribe
            channel.broadcast(this.name, {"url": this.apiSpecURL});

            // send a message to the document service
            let options = {
                uri: this.gateway.proxyURL + '/api-doc/specs',
                method: 'GET'
            };

            await this.gateway.send(options).then(() => {
                console.log('refreshed docs');
            }).catch( (e) => {
                console.log('document service not found ' + this.gateway.proxyURL + '/api-doc/specs');
                console.log(e.message)
            });

        }

        async createAPISpecChannel() {
            let channelConfig = 
            {
                "name": `api-spec`,
                "description": "api spec",
                "hostURL": this.host,
                "hostPort": this.port,
                "uri": `/api-spec`,
                "endpoint": `${this.url}${this.uri}/api-spec`
            };
            
            let channel = new this[_channelClass](channelConfig);
            await this.addChannel(channel);
            return this.channels[channelConfig.name]
        }

        get apiSpecURL() {
            return `${this.url}${this.uri}}/api-spec.json`;
        }

        async attachDocService(channel){

        }
        buildAPISpec(newPaths=[]) {
            console.log('setting my route')
            console.log('proxy url is ' + this.gateway.proxyURL)
            var swaggerDefinition = {
                info: { // API informations (required)
                    title: `${this.name}`, // Title (required)
                    version: '1.0.0', // Version (required)
                    description: 'A sample API', // Description (optional)
                },
                host: this.gateway.proxyURL.split('http://')[1], // Host (optional)
                basePath: '/', // Base path (optional)
            };

// Options for the swagger docs
            var options = {
                // Import swaggerDefinitions
                swaggerDefinition: swaggerDefinition,
                // Path to the API docs
                apis: ['./**/*.js'],
            };

            let swaggerSpec = apiDoc(options);

            //swaggerSpec.paths = swaggerSpec.paths ? swaggerSpec.paths : [];

            //swaggerSpec.paths.concat(newPaths);

            // core apis of every floret services

            swaggerSpec.paths[`${this.uri}/subscribe`] = {
                "post": {
                    "summary": "subscribe to channel",
                    "operationId": "subscribe",
                    "tags": ["floret"],
                    "responses": [
                        {
                            "200": {
                                "name": "floret subscription id"
                            },
                            "201": {
                                "description": "Null response"
                            }
                        }]
                },
                "delete": {
                    "summary": "unsubscribe to channel",
                    "operationId": "subscribe",
                    "tags": ["floret"],
                    "responses": [
                        {
                            "200": {
                                "name": "floret subscription id"
                            },
                            "201": {
                                "description": "Null response"
                            }
                        }]
                }
            }

            swaggerSpec.paths[`${this.uri}/healthcheck`] =
            {
                "get": {
                    "summary": "returns an active health status when running",
                    "operationId": "healthcheck",
                    "tags": ["floret"],
                    "responses": [
                        {
                            "200": {
                                "status": "active"
                            }
                        }]
                }
            };

            this.router.get('/api-spec.json', function (ctx) {
                console.log('get route received')
                ctx.set('Content-Type', 'application/json');
                //res.setHeader('Content-Type', 'application/json');

                console.log('created a swagger spec')
                ctx.body = swaggerSpec;
            })
        }

        /** API *******************************************/

        /**
         *
         * @param name
         * @returns {*}
         */
        async getAPI(name) {
            return this.gateway.getAPI(name);
        }

        /**
         *
         * @param name
         * @param uri
         * @param methods
         */
        async registerAPI(name, uri, methods){
            await this[_gateway].addAPI(name, [this[_baseURI] + uri], this[_baseURL] + uri, methods).then(() => {

            }).catch((e) => {

                if (e.statusCode !== 409) {
                    console.log('api could not be registered. ' + e.message);
                    throw e;
                } else {
                    console.log('Channel endpoint already exists: ' + name);
                }
            })
        }

        /**
         *
         * @param name
         * @returns {*}
         */
        async deleteAPI(name) {
            return this.gateway.deleteAPI(name);
        }
        /**
         * @param uri
         * @param method
         * @param payload
         * @param gateway
         * @returns {*|any|XMLHttpRequest}
         */
        async apiRequest(uri, method, payload, gatewayOverride) {
            let gw = gatewayOverride || this[_gateway];

            console.log('teh proxy uri is ' + gw.proxyURI + uri)


            let options = {
                method: method,
                uri: gw.proxyURI + uri,
                header: {
                    'Content-Type': 'application/json'
                }
            };

            if (method.indexOf('post')) {
                options.header['Content-Type'] = 'application/json'
            }
            if (payload){
                options.body = payload;
            }
            return await gw.send(options);
        }

        /** Channels **************************************/
        /**
         *
         */
        async initChannels() {
            let gatewayChannels = await this.discoverChannels();

            for (let key in gatewayChannels){
                if (this[_channels][key]){
                    delete gatewayChannels[key];
                } else {
                    this[_channels][key] = gatewayChannels[key];
                }
            }

            this[_channels] = Object.assign(this[_channels], gatewayChannels);

            for (let key in this[_channels]) {
                await this.initChannel(this[_channels][key]);
            }
        }

        addChannels(channelArray) {
            channelArray.map((chan) => {
                this[_channels][chan.name] = chan;
            });
        }
        /**
         *
         * @param channel
         */
        async initChannel(channel){
            await this.createChannelAPI(channel);
            await this.discoverSubscribers(channel);
        }
        /**
         *
         * @returns {*}
         * @constructor
         */
        get Channel(){
            return this[_channelClass];
        }

        /**
         *
         * @param channel
         * @constructor
         */
        set Channel(channel){
            this[_channelClass] = channel;
        }

        addChannel(channel) {
            this.initChannel(channel);
            this[_channels][channel.name] = channel;
            return channel;
        }

        /**
         *
         * @returns {*}
         */
        get channels(){
            return this[_channels];
        }

        /**
         *
         * @param channelArray
         */
        set channels(channelArray){
            this[_channels] = channelArray;
        }
        /**
         *
         * @returns {*|Observable.<R>|any}
         */
        async discoverChannels() {
            let prefix = this[_name] + '_channels_';
            let registeredChannels = await this[_gateway].discover(prefix);

            // return channels in object format
            let channelMap = registeredChannels.reduce( (accObj, chan) => {
                // create a channel object
                let chanName = chan.name.split(prefix)[1];

                let chanConfig = {
                    "endpoint": chan.upstream_url,
                    "name": chanName,
                    "description": chan.description,
                    "serviceName": this[_name],
                    "uri": chan.uris[0]
                };

                accObj[chanName] = new this.Channel(chanConfig);
                return accObj;
            }, {});
            return channelMap;
        }
        /**
         *
         * @param channel
         */
        async createChannelAPI(channel){
            console.log('creating channel api')
            channel.apiName = this[_name] + '_channels_' + channel.name;

            await this[_gateway].createChannelAPI(channel.apiName, `/${this[_name]}/channels/${channel.name}/`, `${this[_service].baseURL}${channel.uri}` , 'GET, POST')
                .then((res) =>{
                }).catch((e) => {
                    if (e.statusCode !== 409) {
                        console.log('error adding new subscriber api. ' + e.message);
                        throw e;
                    } else {
                        console.log('Channel endpoint already exists: ' + channel.apiName);
                    }
                });
        }
        /**
         *
         * @param channel
         */
        updateChannel(channel) {
            console.log('in update channel')
            let name = channel.name;
            for (let i=0; i< this[_channels].length; i++){
                if ( this[_channels][i].config().name === name) {
                    console.log('UPDATEING CHANNEL')
                    this[_channels][i] = channel;
                }
            }
        }
        /**
         *
         * @param channel
         */
        async deleteChannel(channel){
            let channelInfo = channel.config();

           this[_gateway].deleteChannelAPI(channelInfo.apiName).then( () => {
                for (let i=0; i<this[_channels].length; i++){
                    if (this[_channels][i].name ===  channel.name){
                        this[_channels].splice(i,1);
                        i++;
                    }
                }
            });
        }

        /** Subscribers ***********************************/

        /**
         *
         * @returns {*}
         * @constructor
         */
        get Subscriber(){
            return this[_subscriberClass];
        }
        /**
         *
         * @param subscriber
         * @constructor
         */
        set Subscriber(subscriber){
            this[_subscriberClass] = subscriber;
        }
        /**
         *
         * @returns {*}
         */
        async discoverSubscribers(channel) {
            let subscribers = await this[_gateway].discover(`${this[_name]}_subscribers_`);

            subscribers.filter((sub) => {
                // ensure the name starts with serviceName_subscribers
                return sub.name.indexOf(`${this[_name]}_subscribers_`) === 0;
            }).map((sub) =>{
                let name = sub.name;
                let nameParts = name.split('_');
                let channelName = nameParts[nameParts.length-1];

                if (channel.name === channelName) {
                    let subObj = new this.Subscriber(sub.name, sub.upstream_url)

                    if (!this.channels[channelName].subscribers[name]) {
                        this.attachSubscriber(this.channels[channelName], subObj);
                    }
                }
            });

            return subscribers;
        }

        attachSubscriber(channel, subscriber){
            if (channel && subscriber) {
                if (!channel.subscribers[subscriber.name]) {
                    channel.subscribe(subscriber);
                }
            }
        }

        /**
         *
         */
        async createSubscriberAPI() {
            await this[_gateway].addAPI(this[_name] + '_subscribe', [this[_uri] + '/subscribe'], this[_host] + ':' + this[_port] + '/' + this[_name] + '/subscribe', 'GET,POST, DELETE, OPTIONS').then(() => {

            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                }
            });

            // creates a subscriber endpoint.
            this[_appRouter].post('/subscribe/', async(ctx, next) => {
                console.log('Incoming subscription request.' );
                let subRequest = ctx.request.body;
                console.log('url: ' + subRequest.url);
                let subscriberName = this[_name] + '_subscribers' + '_' + subRequest.name + '_' + subRequest.channel;
                console.log('Subscribed: ' + subscriberName);
                ctx.body =  {
                    "name": subscriberName
                };
                let newSubscriber = new this.Subscriber(subscriberName, subRequest.url);
                let subURI = `\/${this[_name]}\/channels\/${subRequest.channel}\/subscribers\/${subRequest.name}`;
                this.attachSubscriber(this.channels[subRequest.channel], newSubscriber);

                let addApi = await this[_gateway].addAPI(subscriberName, [subURI], subRequest.url, 'GET,POST,OPTIONS')
                    .then((res) => {
                        console.log('addAPI returned ');
                         //return res;
                    }).catch((e) => {
                        if (e.statusCode !== 409) {
                            console.log('error adding new subscriber api. ' + e.message);
                            throw e;
                        } else {
                            console.log('Subscriber endpoint already exists: ');

                        }
                    });



                })
                .delete('/subscribe', async (ctx) =>{
                    let {channelName, subscriberName } = ctx.body;
                    console.log('unsubscribe: ' + channelName, subscriberName)
                    console.log('state of channels ' + this[_channels][channelName].name)
                    if (channelName && subscriberName && this[_channels][channelName]) {
                        this[_channels][channelName].unsubscribe(subscriberName);
                    }
                    // should be empty
                    ctx.body = {
                        "result": this[_channels][channelName].subscribers[subscriberName]
                    }
                })
                .get('/subscribers/', (ctx, next) => {
                    console.log('incoming request for subscribers');
                    ctx.body = this[_subscribers];
                })
                .patch('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                })
                .put('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                });
        }

        async subscribe(serviceName, channelName, subscription) {
            let res = await this.gateway.subscribeTo(serviceName, channelName, subscription.name, subscription.endpoint)
            console.log('subscriber id: ' + res.name)
            return res.name;
        }

        async unsubscribe(serviceName, channelName, subscriberName) {

            await this.gateway.unsubscribe(serviceName, channelName, subscriberName).catch( e=> this.suppress409(e));
            await this.gateway.deleteAPI(subscriberName).catch( e=> this.suppress409(e));
        }
        /**
         *
         * @param channelName
         * @returns {Array|Array.<T>|*|Observable|any}
         */
        subscribersByChannel(channelName){
            return this[_subscribers].filter((sub) => {
                return sub.channel === channelName;
            })
        }

        /**
         *
         * @param channelName
         */
        removeChannelSubscribers(channelName) {
            this[_subscribers] = this[_subscribers].filter( (sub) => sub.channel === channelName);
        }

        /** Subscriptions *********************************/

        /**
         *
         */

        async initSubscriptions() {
            this[_subscriptions].map((sub) => {
                sub.init();
            });
        }
        
        addSubscription(subscription) {
            if ( this[_subscriptions].filter( (sub) => sub.name === subscription.name).length < 1) {
                this[_subscriptions].push(subscription);
            } else {
                console.warn('subscription already exists')
            }
        }

        getSubscriptionByName(name){
            let sub = this[_subscriptions].filter((sub) => {
                return sub.name === name;
            });
            return sub[0];
        }

        async refreshSubscriptions() {
            this[_subscriptions] = await this.discoverSubscriptions();
            for(key in this[_subscriptions]){
                console.log('initializing ' + key)
                this[_subscriptions][key].init();
            }

            return this[_subscriptions];
        }
        
        /**
         *
         */
        async discoverSubscriptions() {
            let subscriptions = await this[_gateway].discover(`${this[_name]}_subscription_`);
            return subscriptions.filter((sub) => sub.name.indexOf(`${this[_name]}_subscribers_`) === 0);
        }

        get Subscription() {
            return this[_subscriptionClass];
        }

        /**
         *
         * @returns {*}
         */
        get subscriptions(){
            return this[_subscriptions]
        }

        /**
         *
         * @param subArray
         */
        set subscriptions(subArray){
            this[_subscriptions] = subArray;
        }

        createHealthCheck() {
            this[_appRouter].get('/healthcheck/', (ctx, next) => {
                ctx.body = {"status": "active"};
            })
        }

        /**
         *
         * @returns {*}
         */
        get name() {
            return this[_name];
        }

        /**
         *
         * @returns {*}
         */
        get host() {
            return this[_host];
        }

        /**
         *
         * @returns {*}
         */
        get port() {
            return this[_port];
        }

        /**
         *
         * @returns {string}
         */
        get url() {
            return this[_host] + ':' + this[_port];
        }

        /**
         *
         * @returns {*}
         */
        get service() {
            return this[_service];
        }

        /**
         *
         * @returns {*}
         */
        get sub() {
            return this[_sub];
        }

        /**
         *
         * @returns {*}
         */
        get pub() {
            return this[_pub];
        }

        /**
         *
         * @returns {*}
         */
        get router() {
            return this[_appRouter];
        }

        /**
         *
         * @returns {*}
         */
        get gateway() {
            return this[_gateway];
        }

        get Package(){
            return this[_packageClass];
        }

        set Package(pkg){
            this[_packageClass] = pkg;
        }

        get Config(){
            return this[_configClass]
        }

        set Config(cfg) {
            this[_configClass] = cfg;
        }

        get apiDoc() {
            return this[_apiDoc];
        }

        get uri() {
            return this[_uri];
        }

        set uri(u){
            this[_uri] = u;
        }

        async discoverAPISpecs() {
            console.log('looking for specs')
            let apis =  await this[_gateway].discover('api-spec.json');
            console.log('apis returned ' + apis);
            return apis;
        }

        suppress409(e){
            console.log('in 409')
            if (e.statusCode !== 409){
                throw e;
            }
        };

        get serve(){
            return serve;
        }
    }
}

module.exports = Floret;