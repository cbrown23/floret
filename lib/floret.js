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
         * @returns {boolean}
         */
        async init() {
            try {

                console.log('router prefix: ' + this[_routePrefix])
                this.router.prefix(this[_routePrefix]);

                await this[_gateway].gatewayHealthCheck();
                console.log('gateway is up.');

                await this[_gateway].register(this[_service]);
                console.log('api registration complete');

                await this.initChannels();
                console.log('channels initialized.');
                

                await this.initSubscriptions();


                await this.createHealthCheck();
                console.log('created healthcheck.');
                console.log('init complete.');

                console.log('discovery test')
                console.log('$$$$$$$$$$$$$$$$')
                console.log('finding all subscribers of ' + this.name);

                let subs = this[_gateway].discover(this.name + '_subscribers_').then((res)=> {
                    console.log("found subscribers: " + JSON.stringify(res) )
                });
                
                console.log(subs)
                console.log('$$$$$$$$$$$$$$$$')


            } catch (e) {
                console.log('Error occurred during floret init routine.' );
                console.log(e);
                throw e;
            }
            console.log('finishing init, returning true');
            return true;
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

        async initSubscriptions() {
            // await this.discoverSubscriptions();

            await this.createSubscriptions();
            console.log("subscription channels created.");

            await this.discoverSubscribers();

            await this.subscribeToServices();
            console.log('subscribed to services.');
        }

        async discoverSubscriptions() {
            // await this[_gateway].loadSubscribers(this[_name]);


            let subscriptions = await this[_gateway].discover(`_subscribers_${this.name}`);

            // further filtering
            subscriptions = subscriptions.filter( (sub) => {
                if (sub.name.split(`_subscribers_${this.name}`)[1] === "") {
                    return true;
                }
                return false;
            });


            subscriptions.map( (sub) => {
                let subs = this[_appRouter].routes();

                console.log('subs length is ' + subs);
                console.log('sub 1: ')
                console.log(subs);

                let existingSub = this[_subscriptions].filter( (existing) => {
                    if (existing.name === sub.name) {
                        return true;
                    }
                    return false;
                });

                if (existingSub.length === 0) {
                    console.log('subscription not found.  adding')
                    this[_subscriptions].push(sub);
                }
            });


            for (let i=0; i< subscriptions.length; i++){

                let name = subscriptions[i].name;
                let len = name.length;
                if ( name.split(`_subscribers_${this.name}`)[1] === ""){
                    console.log('discovery: subscribed to ' + JSON.stringify(subscriptions[i]))
                }

            }
            
            console.log('found these subscribers')

            // check each 


            // get all apis, and filter on upstream_url
            // filter based o
        }

        async discoverSubscribers() {


            //sub.init().then( () => {
            //    ctx.body = {msg: 'success'};
            //})


            let subscribers = await this[_gateway].discover(`${this.name}_subscribers_`);
            subscribers = subscribers.filter( (sub) => {
                console.log("sub is ")
                console.log(sub);

                if (sub.name.indexOf(`${this.name}_subscribers_`) === 0){
                    console.log('subscriber found ' );
                    return true;
                }
                return false;
            });

            subscribers.map( (sub) => {

                // let subscribedTo = sub.name.split(`${this.name}_subscribers_`)[1];


                let uri = sub.uris[0];
                console.log('testing uri ' + uri);
                let channel = (uri.split('channels/')[1]).split('/')[0];
                console.log('channel is ' + channel);

                let publisher = this.getPublisher(channel);

                console.log('channel subscribing to si ' + channel);
                if (publisher) {
                    // creates the handler function
                    publisher.subscribe((msg) => {

                        console.log('Forwarding to subscriber: ' + sub.upstream_url);

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
                    console.log('subscription setup');
                }
                //let sub = new floret.Subscriber(this.name, 'floret-chat', room, hostURL + ':' + hostPort, serviceBaseURI, '/subscriptions/floret-chat', incomingMessage, floret.router, floret.gateway);
            })
            
            
        }

        async discoverChannels() {
            // get all apis

            // check name like <serviceName>_channels%
            // check uri like /<serviceName>/channels
            //let channels = await this[_gateway].discover(this[_name] + '_channels_');
            

        }
        
        async getRegisteredChannels() {
               
        }
        
        
        

        /**
         *
         */
        async initChannels() {
            console.log('init channels start');

            console.log('performing channel discovery');
            //let allChannels = await this.discoverChannels();


            console.log('initializing channels');
            for (let i=0; i< this[_channels].length; i++){
                this.initChannel(this[_channels][i]);
            }
        }

        async initChannel(channel){
            
            this[_channelPublishers][channel.name] = channel.observable;
            console.log('channel publishers created ' + this[_channelPublishers])
            await this.createChannelRoutes(channel);
            console.log('routes creatd')
            await this.createChannelAPI(channel);
            console.log('channel api created')
            this[_channels].push(channel);
            console.log('add a channel to _channels')

            this[_channelPublishers][channel.name].subscribe((msg) => {
                console.log('Incoming message, listening with observable:');
                console.log(msg);
            });
        }

        createChannelRoutes(channel){
            console.log('creteing routea for chanel ' + channel.uri)
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
            console.log('routes crearted')

            //return this[_router];
        }

        async createChannelAPI(channel){
            channel.apiName = this[_name] + '_channels_' + channel.name;

            await this[_gateway].createChannelAPI(channel.apiName, `/${this[_name]}/channels/${channel.name}/`, `${this[_service].baseURL}${channel.uri}` , 'GET, POST')
                .then((res) =>{
                    console.log('New channel created: ' + channel.name);
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
        
        deleteSubscribers(channelName) {
            console.log('subscriber count before: ' + this[_subscribers].length )
            this[_subscribers].filter((sub) => {
                return sub.channel === channelName;
            })
            console.log('subscriber count after: ' + this[_subscribers].length )

        }

        getPublisher(name){
            console.log('looking for publisher: ' + name);
            // console.log(JSON.stringify(this[_channelPublishers]));

            for (let key in this[_channelPublishers]) {
                console.log("existing pub: " + key);
            }
            console.log('return publisher ' + this[_channelPublishers][name])
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

            await this[_subscriptions].map( (sub) => {
               // let sub = new this.Subscriber(this.name, 'floret-chat', room, hostURL + ':' + hostPort, serviceBaseURI, '/subscriptions/floret-chat', incomingMessage, floret.router, floret.gateway);

               // this.subscribeToService(sub.publisherName, sub.publisherChannelName, sub.uri)
            });



            //f (this[_subscriptions] && this[_subscriptions].length > 0) {
                //

             //   for (let i = 0; i < this[_subscriptions].length; i++) {
             //       let sub = this[_subscriptions][i];

                    // await sub.init();

                    //await this.subscribeToService(this[_subscriptions][i].publisherName, this[_subscriptions][i].publisherChannelName, this[_subscriptions][i].uri)
               // }
            //}
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
            await this.createSubscriberAPI();
            await this.refreshSubscribers();
            this.attachSubscribers();
        }

        async createSubscriberAPI() {
            
            let subscriberApi;
            
            console.log('Adding Subscriber API ' + this[_name]);
            subscriberApi = await this[_gateway].addAPI(this[_name] + '_subscribers', this[_uri] + '/subscribers', this[_host] + ':' + this[_port]+ '/' + this[_name] + '/subscribers', 'GET,POST,OPTIONS').then( () =>{
                console.log('New Subscriber API created.');
            }).catch((e) => {
                if (e.statusCode !== 409) {
                    throw e;
                }
                console.log("Using existing Subscriber API")
            });

            // Query API info for subscribers to this service
            await this[_gateway].getAPIsWithUpstreamURL(this[_host] + ':' + this[_port] + '/' + this[_name] + '/subscribers/').then((res) => {
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

                if (!pub) {
                    // create a publisher
                    this[_channelPublishers][subscriber.channel] = channel.observable;
                }

                // creates the handler function
                pub.subscribe( (msg) => {

                    console.log('Forwarding to subscriber: ' + subscriber.url);

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
                    }).catch( (e) => {
                        console.log('error: ' + e.message)
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
        
        removeSubscribers(channelName) {
            console.log(" removing subscribers with name " + channelName);
            console.log('before count ' + this[_subscribers].length)
            this[_subscribers] = this[_subscribers].filter( (sub) => {
                if (sub.channel === channelName) {
                    return false;
                }
                return true;
            })
            console.log('after count ' + this[_subscribers].length)
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
            console.log('Number of Channels: ' + this[_channels].length);
        }

        get handlers(){
            return this[_handlers];
        }

        set handlers(obj){
            this[_handlers] = obj;
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

        get service() {
            return this[_service];
        }

        set Channel(channel){
            this[_channelClass] = channel;
        }

        get Channel(){
            return this[_channelClass];
        }

        set Subscriber(subscriber){
            this[_subscriberClass] = subscriber;
        }

        get Subscriber(){
            return this[_subscriberClass];
        }

        set Handler(handlers){
            this[_handlerCLass] = handlers;
        }

        get Handler(){
            console.log('returning ' + this[_handlerClass])
            return this[_handlerClass];
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
            console.log('sending api request')
            console.log(options)
            return await gw.send(options);
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