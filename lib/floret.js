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
    const channelPublishers = Symbol('channelPublishers');
    const prefix = Symbol('routePrefix');
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

        constructor(serviceName, serviceHost, servicePort, serviceURI, gatewayURI, gatewayAdminPort, gatewayProxyPort, routePrefix, ...options) {
            // koa
            super();

            this[host] = serviceHost;
            this[name] = serviceName;
            this[port] = servicePort;
            this[uri] = serviceURI;
            this[appRouter] = this.context.appRouter = router;
            this[listen] = super.listen;

            this[subscribers] = [];
            this[subscriptions] = [];
            this[channels] = [];
            this[channelPublishers] = {};
            this[handlers] = [];

            this[prefix] = routePrefix || '/' + this[name];
            this[gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[service] = new Service(this[name], this[host], this[port], this[uri], this[prefix]);

            this[baseURL] = this[host] + ':' + this[port] + this[prefix];
            this[baseURI] = this[prefix];

            // overrides
            this[gatewayClass] = options[0] || Gateway;
            this[channelClass] = options[1] || Channel;
            this[subscriberClass] = options[2] || Subscriber;
            this[subscriptionClass] = options[3] || Subscription;
            this[serviceClass] = options[4] || Service;
            this[handlerClass] = options[5] || Handler;
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
                console.log('All routes prefixed with: ' + this[prefix])
                this.router.prefix(this[prefix]);
                await this[gateway].gatewayHealthCheck();

                // register service with gateway
                await this[gateway].register(this[service]);
                
                // init all explicit/implicit channels
                await this.initChannels();

                // find and attach subscribers to our service, and subscriptions to others
                await this.initSubscribers();
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

            this[channels].filter( (chan) => {
                if (gatewayChannels[chan.name]) {
                    delete gatewayChannels[chan.name];
                }
            });

            if (gatewayChannels) {
                // create channel objects
                for (let key in gatewayChannels) {

                    // parse the channel name
                    let channel = gatewayChannels[key];
                    let parts = channel.name.split('_');
                    let chanName = parts[parts.length-1];

                    let config = {
                        "name": chanName,
                        "description": "discovered room",
                        "hostURL": this[host],
                        "hostPort": this[port],
                        "uri": channel.uris[0]
                    };

                    // just need to set an appropriate handler
                    let newChannel = new this.Channel(config);
                    this[channels].push(newChannel);
                }
            }

            for (let i=0; i< this[channels].length; i++){
                console.log('initializing channel: ' + this[channels][i].name);
                this.initChannel(this[channels][i]);
            }
        }
        /**
         *
         * @param channel
         */
        async initChannel(channel){

            this[channelPublishers][channel.name] = channel.observable;
            await this.createChannelRoutes(channel);
            await this.createChannelAPI(channel);
            this[channels].push(channel);
            this[channelPublishers][channel.name].subscribe((msg) => {
                console.log('Incoming message on ' + channel.name + ', listening with observable:');
                console.log(msg);
            });
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
            let channels = await this[gateway].discover(prefix);

            // return channels in object format
            let chanObj = channels.reduce( (obj, chan) => {
                let name = chan.name.split(prefix)[1];
                if (name) {
                    obj[name] = chan;
                }
                return obj;
            }, {});

            return chanObj;
        }
        /**
         *
         * @param channel
         */
        async createChannelAPI(channel){
            channel.apiName = this[name] + '_channels_' + channel.name;

            await this[gateway].createChannelAPI(channel.apiName, `/${this[name]}/channels/${channel.name}/`, `${this[service].baseURL}${channel.uri}` , 'GET, POST')
                .then((res) =>{
                    // update channel
                    this.updateChannel(channel);
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
        /**
         *
         * @param channel
         */
        createChannelRoutes(channel){
            this[appRouter].get(channel.uri, (ctx) => {
                ctx.body = {
                    name: channel.name,
                    description: channel.description
                };
            });

            this[appRouter].post(channel.uri, (ctx) => {
                channel.handler(ctx,  channel.observable);
                ctx.response.status = 200;
                ctx.response.message = ctx.body;
            });
        }
        /**
         *
         * @param name
         * @returns {*}
         */
        getChannelByName(name){
            return this[channels].filter(() => {
                return this[channels][i].config().name === name
            })
        }

        /** Subscribers ***********************************/

        /**
         *
         */
        async initSubscribers(){
            await this.createSubscriberAPI();
            await this.refreshSubscribers();
            await this.attachSubscribers();
        }
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
        async refreshSubscribers(){
            this[subscribers] = await this.discoverSubscribers();
            return this[subscribers];
        }
        /**
         *
         * @returns {*}
         */
        async discoverSubscribers() {
            let subscribers = await this[gateway].discover(`${this.name}_subscribers_`);

            subscribers = subscribers.filter((sub) => {
                if (sub.name.indexOf(`${this.name}_subscribers_`) === 0) {
                    return true;
                }
                return false;
            });
            console.log("found subscribers: " + JSON.stringify(subscribers[0]));
            return subscribers;
        }
        /**
         *
         */
        async attachSubscribers() {
            this[subscribers].map( (sub) => {
                let uri = sub.uris[0];
                console.log('uri found from subscriber objecgt' + sub.uris[0])
                let channel = (uri.split('channels/')[1]).split('/')[0];
                let publisher = this.getPublisher(channel);

                if (publisher) {
                    // creates the handler function
                    publisher.subscribe((msg) => {

                       this[gateway].send({
                            header: {
                                'Content-Type': 'application/json'
                            },
                            method: 'POST',
                            body: {
                                from: this[name],
                                package: msg
                            },
                            uri: sub.upstream_url
                        }).then((res) => {
                            console.log('message sent: ' + JSON.stringify(res))
                        }).catch((e) => {
                            console.log('error: ' + e.message)
                        })
                    });
                }
            })
        }
        /**
         *
         */
        async createSubscriberAPI() {
            // todo: clean up
            let subscriberApi;

            console.log('Adding Subscriber API ' + this[name]);
            subscriberApi = await this[gateway].addAPI(this[name] + '_subscribers', this[uri] + '/subscribers', this[host] + ':' + this[port] + '/' + this[name] + '/subscribers', 'GET,POST,OPTIONS').then(() => {
                console.log('New Subscriber API created.');
            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                }
                console.log("Using existing Subscriber API")
            });

            // creates a subscriber endpoint.
            this[appRouter].post('/subscribers/', async(ctx, next) => {
                let subscriber = ctx.request.body;
                let subscriberName = this[name] + '_subscribers' + '_' + subscriber.name + '_' + subscriber.channel;

                let existing = this[subscribers].filter((sub) => sub.name === subscriberName).length > 0;

                if (!existing) {
                    let subURI = `\/${this[name]}\/channels\/${subscriber.channel || 'default'}\/subscribers\/${subscriber.name}`;

                    ctx.body = await this[gateway].addAPI(subscriberName, subURI, subscriber.url, 'GET,POST,OPTIONS')
                        .then((res) => {
                            return res;
                        }).catch((e) => {
                            if (e.statusCode !== 409) {
                                console.log('error adding new subscriber api. ' + e.message);
                                throw e;
                            } else {
                                console.log('Subscriber endpoint already exists: ' + e.message);

                            }
                        });

                    await this.refreshSubscribers();

                    let pub = this.getPublisher(subscriber.channel);

                    if (!pub) {
                        // create a publisher
                        this[channelPublishers][subscriber.channel] = channel.observable;
                    }

                    // creates the handler function
                    pub.subscribe((msg) => {
                       this[gateway].send({
                            header: {
                                'Content-Type': 'application/json'
                            },
                            method: 'POST',
                            body: {
                                from: this[name],
                                package: msg
                            },
                            uri: subscriber.url
                        }).then((res) => {
                            console.log('message sent: ' + JSON.stringify(res))
                        }).catch((e) => {
                            console.log('error: ' + e.message)
                        })
                    })
                }
            })
                .get('/subscribers/', (ctx, next) => {
                    ctx.body = this[subscribers];
                })
                .patch('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                })
                .put('/subscribers/:name', (ctx, next) => {
                    let event = ctx.body;
                });
            await this.refreshSubscribers();
        }
        /**
         *
         * @param channelName
         */
        // todo: find a way to unhook subscriber
        deleteSubscribers(channelName, subscriber) {
            this[subscribers].filter((sub) => {
                return sub.channel === channelName;
            })
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
                console.log('ran init subscriptions')
                sub.init();
            });
        }
        
        addSubscription(subscription) {
            if ( this[subscriptions].filter( (sub) => sub.name === subscription.name).length < 1) {
                subscription.init();
                this[subscriptions].push(subscription);
            }
        }
        async createSubscriptionAPI(name, handler){
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
            return this[subscriptions];
        }
        
        /**
         *
         */
        async discoverSubscriptions() {
            let subscriptions = await this[gateway].discover(`${this.name}_subscription_`);
            return subscriptions.filter((sub) => sub.name.indexOf(`${this.name}_subscribers_`) === 0);
        }
           
        /**
         *
         */
        async createServiceSubscriptions() {
            await this[subscriptions].map( (sub) => {
                // let sub = new this.Subscriber(this.name, 'floret-chat', room, hostURL + ':' + hostPort, serviceBaseURI, '/subscriptions/floret-chat', incomingMessage, floret.router, floret.gateway);

                // this.subscribeToService(sub.publisherName, sub.publisherChannelName, sub.uri)
            });
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
            console.log('subscriptions are set: ' + this[subscriptions].length)
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

        /** Publishing *******************************

        /**
         *
         * @param name
         * @returns {*}
         */
        getPublisher(name){
            return this[channelPublishers][name];
        }

        /**
         *
         * @param channelName
         * @param message
         */
        broadcast(channelName, message){
            this[channelPublishers][channelName].next(message);
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


        /**
         *
         * @param serviceName
         * @param options
         * @returns {*[]}
         */
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