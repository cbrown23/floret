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
const Gateway = require('floret-gateway');
const Service = require('floret-service');
const Channel = require('floret-channel');
const Subscriber = require('floret-subscriber');
const Handler = require('floret-handler');

let Floret, gatewayLib, subscriberLib, publisherLib;
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
    const _channelPublishers = Symbol('channelPublishers');
    const _routePrefix = Symbol('routePrefix');
    const _service = Symbol('service');
    const _baseURL = Symbol('baseURL');
    const _baseURI = Symbol('baseURI');
    const _handlers = Symbol('handlers');
    
    // overridable classes
    const _gatewayClass = Symbol('gatewayClass');
    const _subscriberClass = Symbol('subscriberClass');
    const _channelClass = Symbol('channelClass');
    const _serviceClass = Symbol('serviceClass');
    const _handlerClass = Symbol('handlerClass');

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
            this[_handlers] = [];

            this[_routePrefix] = routePrefix || '/' + this[_name];
            this[_gateway] = new Gateway('foo', gatewayURI , gatewayAdminPort, gatewayProxyPort);
            this[_service] = new Service(this[_name], this[_host], this[_port], this[_uri], this[_routePrefix]);

            this[_baseURL] = this[_host] + ':' + this[_port] + this[_routePrefix];
            this[_baseURI] = this[_routePrefix];

            // overrides
            this[_gatewayClass] = options[0] || Gateway;
            this[_channelClass] = options[1] || Channel;
            this[_subscriberClass] = options[2] || Subscriber;
            this[_serviceClass] = options[3] || Service;
            this[_handlerClass] = options[4] || Handler;
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
                console.log('All routes prefixed with: ' + this[_routePrefix])
                this.router.prefix(this[_routePrefix]);
                await this[_gateway].gatewayHealthCheck();

                // register service with gateway
                await this[_gateway].register(this[_service]);
                
                // init all explicit/implicit channels
                await this.initChannels();

                // find and attach subscribers to our service, and subscriptions to others
                await this.initSubscribers();
                await this.initSubscriptions();

                await this.createHealthCheck();

                console.log(`floret service ${this[_name]} initialized`);
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
        async apiRequest(uri, method, payload, gateway) {
            let gw = gateway || this[_gateway];

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

            this[_channels].filter( (chan) => {
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
                        "hostURL": this[_host],
                        "hostPort": this[_port],
                        "uri": channel.uris[0]
                    };

                    // just need to set an appropriate handler
                    let newChannel = new this.Channel(config);
                    this[_channels].push(newChannel);
                }
            }

            for (let i=0; i< this[_channels].length; i++){
                console.log('initializing channel: ' + this[_channels][i].name);
                this.initChannel(this[_channels][i]);
            }
        }
        /**
         *
         * @param channel
         */
        async initChannel(channel){

            this[_channelPublishers][channel.name] = channel.observable;
            await this.createChannelRoutes(channel);
            await this.createChannelAPI(channel);
            this[_channels].push(channel);
            this[_channelPublishers][channel.name].subscribe((msg) => {
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
            let channels = await this[_gateway].discover(prefix);

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
            channel.apiName = this[_name] + '_channels_' + channel.name;

            await this[_gateway].createChannelAPI(channel.apiName, `/${this[_name]}/channels/${channel.name}/`, `${this[_service].baseURL}${channel.uri}` , 'GET, POST')
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
        /**
         *
         * @param channel
         */
        createChannelRoutes(channel){
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
        }
        /**
         *
         * @param name
         * @returns {*}
         */
        getChannelByName(name){
            return this[_channels].filter(() => {
                return this[_channels][i].config().name === name
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
        async refreshSubscribers(){
            this[_subscribers] = await this.discoverSubscribers();
            return this[_subscribers];
        }
        /**
         *
         * @returns {*}
         */
        async discoverSubscribers() {
            let subscribers = await this[_gateway].discover(`${this.name}_subscribers_`);
            subscribers = subscribers.filter((sub) => {
                if (sub.name.indexOf(`${this.name}_subscribers_`) === 0) {
                    return true;
                }
                return false;
            });

            return subscribers;
        }
        /**
         *
         */
        async attachSubscribers() {
            this[_subscribers].map( (sub) => {
                let uri = sub.uris[0];
                let channel = (uri.split('channels/')[1]).split('/')[0];
                let publisher = this.getPublisher(channel);

                if (publisher) {
                    // creates the handler function
                    publisher.subscribe((msg) => {

                        this[_gateway].send({
                            header: {
                                'Content-Type': 'application/json'
                            },
                            method: 'POST',
                            body: {
                                from: this[_name],
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

            console.log('Adding Subscriber API ' + this[_name]);
            subscriberApi = await this[_gateway].addAPI(this[_name] + '_subscribers', this[_uri] + '/subscribers', this[_host] + ':' + this[_port] + '/' + this[_name] + '/subscribers', 'GET,POST,OPTIONS').then(() => {
                console.log('New Subscriber API created.');
            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                }
                console.log("Using existing Subscriber API")
            });

            // creates a subscriber endpoint.
            this[_appRouter].post('/subscribers/', async(ctx, next) => {
                let subscriber = ctx.request.body;
                let subscriberName = this[_name] + '_subscribers' + '_' + subscriber.name + '_' + subscriber.channel;

                let existing = this[_subscribers].filter((sub) => sub.name === subscriberName).length > 0;

                if (!existing) {
                    let subURI = `\/${this[_name]}\/channels\/${subscriber.channel || 'default'}\/subscribers\/${subscriber.name}`;

                    ctx.body = await this[_gateway].addAPI(subscriberName, subURI, subscriber.url, 'GET,POST,OPTIONS')
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
                        this[_channelPublishers][subscriber.channel] = channel.observable;
                    }

                    // creates the handler function
                    pub.subscribe((msg) => {
                        this[_gateway].send({
                            header: {
                                'Content-Type': 'application/json'
                            },
                            method: 'POST',
                            body: {
                                from: this[_name],
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
                    ctx.body = this[_subscribers];
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
            this[_subscribers].filter((sub) => {
                return sub.channel === channelName;
            })
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
            // find service subscribed to
            await this.discoverSubscriptions();
            await this.createServiceSubscriptions();
        }
        /**
         *
         */
        async discoverSubscriptions() {
            let subscriptions = await this[_gateway].discover(`_subscribers_${this.name}`);

            // further filtering
            subscriptions = subscriptions.filter((sub) => {
                return sub.name.split(`_subscribers_${this.name}`)[1] === "";
            });


            subscriptions.map((sub) => {
                let existingSub = this[_subscriptions].filter( (existing) => {
                    return existing.name === sub.name;
                });

                if (existingSub.length === 0) {
                    this[_subscriptions].push(sub);
                }
            });
        }
        /**
         *
         */
        async createServiceSubscriptions() {
            await this[_subscriptions].map( (sub) => {
                // let sub = new this.Subscriber(this.name, 'floret-chat', room, hostURL + ':' + hostPort, serviceBaseURI, '/subscriptions/floret-chat', incomingMessage, floret.router, floret.gateway);

                // this.subscribeToService(sub.publisherName, sub.publisherChannelName, sub.uri)
            });
        }
        /**
         *
         * @param name
         * @param channelName
         * @param returnURI
         */
        async createSubscriptions(name, channelName, returnURI){
            console.log("subscribing to a service: " + name + ' ' + channelName + ' '+ returnURI);
            // get the uri
            let api = await this[_gateway].getAPI(name).then((msg) => {
                return msg;
            }).catch((e) =>{
                if (e.statusCode !== 404){
                    throw e;
                } else {
                    console.log('api not found: ' + name + '_' + channelName);
                }

            });

            if (api) {
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
                this[_gateway].send(options);
            } else {
                console.log('Channel not found');
            }
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
            console.log('subscriptions are set: ' + this[_subscriptions].length)
        }

        /** Handlers **********************************/
        /**
         *
         * @param handlers
         * @constructor
         */
        set Handler(handlers){
            this[_handlerCLass] = handlers;
        }

        /**
         *
         * @returns {*}
         * @constructor
         */
        get Handler(){
            return this[_handlerClass];
        }

        /**
         *
         * @returns {*}
         */
        get handlers(){
            return this[_handlers];
        }

        /**
         *
         * @param obj
         */
        set handlers(obj){
            this[_handlers] = obj;
        }

        /** Publishing *******************************

        /**
         *
         * @param name
         * @returns {*}
         */
        getPublisher(name){
            return this[_channelPublishers][name];
        }

        /**
         *
         * @param channelName
         * @param message
         */
        broadcast(channelName, message){
            this[_channelPublishers][channelName].next(message);
        }

        /**
         *
         */
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