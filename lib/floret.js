'use strict';
const logger = require('koa-logger');
const serve = require('koa-static');
const Router = require('koa-router');
const router = new Router();
const Koa = require('koa');
const bodyParser = require('koa-bodyparser');
const fetch = require('node-fetch');
const http = require('http');

// core floret services
const Gateway = require('./gateway/floret-gateway.js');
const Service = require('./service/floret-service.js');
const Channel = require('./channel/floret-channel.js');
const Subscriber = require('./subscriber/floret-subscriber.js');
const Subscription = require('./subscription/floret-subscription.js');
const Handler = require('./handler/floret-handler.js');

let Floret;
{
    // private
    const host = Symbol('host');
    const name = Symbol('name');
    const port = Symbol('port');
    const uri = Symbol('uri');
    const sub = Symbol('sub');
    const pub = Symbol('pub');
    const appRouter = Symbol('router');
    const gateway = Symbol('gateway');
    const listen = Symbol('listen');
    const subscribers = Symbol('subscribers');
    const subscriptions = Symbol('subscriptions');
    const channels = Symbol('channels');
    const service = Symbol('service');
    const baseURL = Symbol('baseURL');
    const baseURI = Symbol('baseURI');
    const handlers = Symbol('handlers');
    
    // overridable classes
    const gatewayClass = Symbol('gatewayClass');
    const subscriberClass = Symbol('subscriberClass');
    const subscriptionClass = Symbol('subscriptionClass');
    const channelClass = Symbol('channelClass');
    const serviceClass = Symbol('serviceClass');
    const handlerClass = Symbol('handlerClass');

    Floret = class Floret extends Koa {

        constructor(config, ...options) {
            // koa
            super();
            let {serviceName, serviceHost, servicePort, serviceURI, gatewayHost, gatewayAdminPort, gatewayProxyPort} = config;

            this[host] = serviceHost;
            this[name] = serviceName;
            this[port] = servicePort;
            this[uri] = serviceURI || '/' + this[name];
            this[appRouter] = this.context.appRouter = router;
            this[listen] = super.listen;

            this[subscribers] = [];
            this[subscriptions] = [];
            this[channels] = {};
            this[handlers] = [];

            this[baseURL] = this[host] + ':' + this[port] + this[uri];
            this[baseURI] = this[uri];

            // overrides
            this[gatewayClass] = options[0] || Gateway;
            this[channelClass] = options[1] || Channel;
            this[subscriberClass] = options[2] || Subscriber;
            this[subscriptionClass] = options[3] || Subscription;
            this[serviceClass] = options[4] || Service;
            this[handlerClass] = options[5] || Handler;

            this[gateway] = new this[gatewayClass]('foo', gatewayHost , gatewayAdminPort, gatewayProxyPort);
            this[service] = new this[serviceClass](this[name], this[host], this[port], this[uri]);
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
                    next();
                });

                this.use(this[appRouter].routes());
                this[listen](portOverride || this[port]);
                console.log('listening on port  ' + (portOverride || this[port]));
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
                console.log('All routes prefixed with: ' + this[uri])
                this.router.prefix(this[uri]);
                await this[gateway].gatewayHealthCheck();
                // register service with gateway
                await this[gateway].register(this[service]);
                await this.createSubscriberAPI();

                // init all explicit/implicit channels
                await this.initChannels();
                // find and attach subscribers to our service, and subscriptions to others
                await this.initSubscriptions();
                await this.createHealthCheck();

                console.log(`floret service ${this[name]} initialized`);
            } catch (e) {
                console.log('Error occurred during floret init routine.' );
                console.log(e);
                throw e;
            }
            return true;
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
            await this[gateway].addAPI(name, [this[baseURI] + uri], this[baseURL] + uri, methods).then(() => {

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
            let gw = gatewayOverride || this[gateway];

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
                if (this[channels][key]){
                    delete gatewayChannels[key];
                } else {
                    this[channels][key] = gatewayChannels[key];
                }
            }

            this[channels] = Object.assign(this[channels], gatewayChannels);

            for (let key in this[channels]) {
                await this.initChannel(this[channels][key]);
            }
        }

        addChannels(channelArray) {
            channelArray.map((chan) => {
                this[channels][chan.name] = chan;
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
            return this[channelClass];
        }

        /**
         *
         * @param channel
         * @constructor
         */
        set Channel(channel){
            this[channelClass] = channel;
        }

        addChannel(channel) {
            this.initChannel(channel);
            this[channels][channel.name] = channel;
            return channel;
        }

        /**
         *
         * @returns {*}
         */
        get channels(){
            return this[channels];
        }

        /**
         *
         * @param channelArray
         */
        set channels(channelArray){
            this[channels] = channelArray;
        }
        /**
         *
         * @returns {*|Observable.<R>|any}
         */
        async discoverChannels() {
            let prefix = this[name] + '_channels_';
            let registeredChannels = await this[gateway].discover(prefix);

            // return channels in object format
            let channelMap = registeredChannels.reduce( (accObj, chan) => {
                // create a channel object
                let chanName = chan.name.split(prefix)[1];

                let chanConfig = {
                    "endpoint": chan.upstream_url,
                    "name": chanName,
                    "description": chan.description,
                    "serviceName": this[name],
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
            channel.apiName = this[name] + '_channels_' + channel.name;

            await this[gateway].createChannelAPI(channel.apiName, `/${this[name]}/channels/${channel.name}/`, `${this[service].baseURL}${channel.uri}` , 'GET, POST')
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
            for (let i=0; i< this[channels].length; i++){
                if ( this[channels][i].config().name === name) {
                    console.log('UPDATEING CHANNEL')
                    this[channels][i] = channel;
                }
            }
        }
        /**
         *
         * @param channel
         */
        async deleteChannel(channel){
            let channelInfo = channel.config();

           this[gateway].deleteChannelAPI(channelInfo.apiName).then( () => {
                for (let i=0; i<this[channels].length; i++){
                    if (this[channels][i].name ===  channel.name){
                        this[channels].splice(i,1);
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
            return this[subscriberClass];
        }
        /**
         *
         * @param subscriber
         * @constructor
         */
        set Subscriber(subscriber){
            this[subscriberClass] = subscriber;
        }
        /**
         *
         * @returns {*}
         */
        async discoverSubscribers(channel) {
            console.log('DISCOVER SUBSCRIBERS')
            let subscribers = await this[gateway].discover(`${this[name]}_subscribers_`);

            subscribers.filter((sub) => {
                // ensure the name starts with serviceName_subscribers
                return sub.name.indexOf(`${this[name]}_subscribers_`) === 0;
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
            console.log('attaching subscriber')
            console.log(JSON.stringify(channel.subscribers));
            if (channel && subscriber) {
                if (!channel.subscribers[subscriber.name]) {
                    channel.subscribe(subscriber);
                }
            }
            console.log(JSON.stringify(channel.subscribers));
        }

        /**
         *
         */
        async createSubscriberAPI() {
            await this[gateway].addAPI(this[name] + '_subscribe', [this[uri] + '/subscribe'], this[host] + ':' + this[port] + '/' + this[name] + '/subscribe', 'GET,POST,OPTIONS').then(() => {

            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                } else {
                    console.log("Using existing Subscriber API")
                }
            });

            await this[gateway].addAPI(this[name] + '_unsubscribe', [this[uri] + '/unsubscribe'], this[host] + ':' + this[port] + '/' + this[name] + '/unsubscribe', 'GET,POST,OPTIONS').then(() => {

            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                } else {
                    console.log("Using existing Subscriber API")
                }
            });


            // creates a subscriber endpoint.
            this[appRouter].post('/subscribe/', async(ctx, next) => {
                console.log('incoming subscription request');
                console.log('trying this[name] ' + this[name])
                let subRequest = ctx.request.body;
                console.log('trying subRequest ' + JSON.stringify(subRequest));
                let subscriberName = this[name] + '_subscribers' + '_' + subRequest.name + '_' + subRequest.channel;
                let newSubscriber = new this.Subscriber(subscriberName, subRequest.url);
                let subURI = `\/${this[name]}\/channels\/${subRequest.channel}\/subscribers\/${subRequest.name}`;
                console.log('current channels')
                console.log(this.channels)
                this.attachSubscriber(this.channels[subRequest.channel], newSubscriber);

                let addApi = await this[gateway].addAPI(subscriberName, [subURI], subRequest.url, 'GET,POST,OPTIONS')
                    .then((res) => {
                        console.log('addAPI returned ');
                         //return res;
                    }).catch((e) => {
                        if (e.statusCode !== 409) {
                            console.log('error adding new subscriber api. ' + e.message);
                            throw e;
                        } else {
                            console.log('Subscriber endpoint already exists: ' + e.message);

                        }
                    });
                console.log('the subscriber name is ' + subscriberName)

                ctx.response.body =  {
                    "name": subscriberName
                };
                return {
                    "name": subscriberName
                };
                console.log('ctx body is ' + JSON.stringify(ctx.body));

                })
                .post('/unsubscribe', async (ctx) =>{
                    console.log("INCOMING /UNSUBSCRIBE")
                    let {channelName, serviceName, subscriberName } = ctx.body;

                    if (channelName && serviceName && subscriberName) {
                        console.log("channelName: " + channelName);
                        console.log("serviceName: " + serviceName);
                        console.log("subscriberName: " + subscriberName);

                        //await this.gateway.unsubscribe(channelName, serviceName, subscriberName);

                        if (this[channels][channelName]) {
                            this[channels][channelName].unsubscribe(subscriberName);
                        }
                        console.log('cleaned subscribers');

                    }

                    ctx.body = {
                        "msg": "unsubscribed"
                    }
                })
                .get('/subscribers/', (ctx, next) => {
                    console.log('incoming request for subscribers');
                    ctx.body = this[subscribers];
                })
                .patch('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                })
                .put('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                });
        }

        async subscribe(serviceName, channelName, subscription){
            console.log('SUBSCRIBING to ' + serviceName)
            // send api request to subscribe
            await this.gateway.subscribeTo(serviceName, channelName, subscription.name, subscription.endpoint);
        }

        async unsubscribe(serviceName, channelName, subscriberName) {
            console.log('UNSUBSCRIBING from ' + serviceName, channelName, subscriberName)
            await this.gateway.unsubscribe(serviceName, channelName, subscriberName);
            await this.gateway.deleteAPI(subscriberName);
        }
        /**
         *
         * @param channelName
         * @returns {Array|Array.<T>|*|Observable|any}
         */
        subscribersByChannel(channelName){
            return this[subscribers].filter((sub) => {
                return sub.channel === channelName;
            })
        }

        /**
         *
         * @param channelName
         */
        removeChannelSubscribers(channelName) {
            this[subscribers] = this[subscribers].filter( (sub) => sub.channel === channelName);
        }

        /** Subscriptions *********************************/

        /**
         *
         */

        async initSubscriptions() {
            this[subscriptions].map((sub) => {
                sub.init();
            });
        }
        
        addSubscription(subscription) {
            console.log('adding subscription')
            if ( this[subscriptions].filter( (sub) => sub.name === subscription.name).length < 1) {
                subscription.init();
                this[subscriptions].push(subscription);
            }
        }

        getSubscriptionByName(name){
            let sub = this[subscriptions].filter((sub) => {
                return sub.name === name;
            });
            return sub[0];
        }

        async createSubscriptionAPI(name, handler){
            console.log('creating subscription api')
            console.log('handler')
            console.log(JSON.stringify(handler))
            let gatewayAPIName = `${this[name]}_subscription_${handler.name}`;
            let url =  `${this[service].baseURL}/subscription/${name}`;
           this[gateway].addAPI(gatewayAPIName, [`/${this[name]}/subscription/${name}`], url, 'POST');
        }

        async createSubscriptionEndpoint(subscriptionName) {
            this[appRouter].post( `/subscription/${subscriptionName}`, async(ctx, next) => {
                console.log('received post to subscription endpoint')
                ctx.body = {
                    'status': 'success'
                }
            })
        }

        async refreshSubscriptions() {
            this[subscriptions] = await this.discoverSubscriptions();
            for(key in this[subscriptions]){
                console.log('initializing ' + key)
                this[subscriptions][key].init();
            }

            return this[subscriptions];

        }
        
        /**
         *
         */
        async discoverSubscriptions() {
            let subscriptions = await this[gateway].discover(`${this[name]}_subscription_`);
            return subscriptions.filter((sub) => sub.name.indexOf(`${this[name]}_subscribers_`) === 0);
        }

        get Subscription() {
            return this[subscriptionClass];
        }

        /**
         *
         * @returns {*}
         */
        get subscriptions(){
            return this[subscriptions]
        }

        /**
         *
         * @param subArray
         */
        set subscriptions(subArray){
            this[subscriptions] = subArray;
        }

        /** Handlers **********************************/
        /**
         *
         * @param handlers
         * @constructor
         */
        set Handler(handlers){
            this[handlerClass] = handlers;
        }

        /**
         *
         * @returns {*}
         * @constructor
         */
        get Handler(){
            return this[handlerClass];
        }

        /**
         *
         * @returns {*}
         */
        get handlers(){
            return this[handlers];
        }

        /**
         *
         * @param obj
         */
        set handlers(obj){
            this[handlers] = obj;
        }

        /**
         *
         */
        createHealthCheck() {
            this[appRouter].get('/healthcheck/', (ctx, next) => {
                ctx.body = {"status": "active"};
            })
        }

        /**
         *
         * @returns {*}
         */
        get name() {
            return this[name];
        }

        /**
         *
         * @returns {*}
         */
        get host() {
            return this[host];
        }

        /**
         *
         * @returns {*}
         */
        get port() {
            return this[port];
        }

        /**
         *
         * @returns {string}
         */
        get url() {
            return this[host] + ':' + this[port];
        }

        /**
         *
         * @returns {*}
         */
        get service() {
            return this[service];
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
            return this[appRouter];
        }

        /**
         *
         * @returns {*}
         */
        get gateway() {
            return this[gateway];
        }
    }
}

module.exports = Floret;