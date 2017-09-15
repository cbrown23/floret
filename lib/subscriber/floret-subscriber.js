let FloretSubscriber;

{
    const _name = Symbol('name');
    const _pubName = Symbol('pubName');
    const _pubChannelName = Symbol('pubChannel');

    const _upstreamURL = Symbol('upstreamURL');
    const _baseURI = Symbol('baseURI');
    const _handlerURI = Symbol('handlerURI');
    const _handler = Symbol('handler');
    const _router = Symbol('router');
    const _gateway = Symbol('gateway');
    const _apiName = Symbol('apiName');
    const _apiURI = Symbol('apiURI');
    const _apiUpstreamURL = Symbol('apiUpstreamURL');


    FloretSubscriber = class FloretSubscriber {

        constructor(name, publisherName, channelName, subscription) {

            console.log('constructor started');
            this[_name] = name;
            this[_pubName] = publisherName;
            this[_pubChannelName] = channelName;
            this[_upstreamURL] = `${subscription.baseURL}/`;
            this[_baseURI] = subscription.service.routePrefix;
            this[_handlerURI] = subscription.uri;
            this[_handler] = subscription.handler.run;
            this[_router] = subscription.router;
            this[_gateway] = subscription.gateway;
            this[_upstreamURL] = subscription.service.baseURL;
            this[_apiName] = `${this[_name]}_${this[_pubName]}_${this[_pubChannelName]}`;
            this[_apiURI] = `/${this[_name]}/subscriber/${this[_pubName]}/${this[_pubChannelName]}`;
            this[_apiUpstreamURL] = `${this[_upstreamURL]}${this[_baseURI]}${this[_handlerURI]}`;
        }

        async init() {
            // add the route for receiving published content
            this.createRoutes(this[_router]);
            await this.subscribe();

            return this;
        }

        createRoutes(router){
            router.get(this[_handlerURI], (ctx) => {
                console.log('get request to subscription: ' + ctx.body);
            });
            router.post(this[_handlerURI], this[_handler]);
        }

        get name(){
            return this[_name];
        }

        set name(name){
            this[_name] = name;
        }

        get publisherName(){
            return this[_pubName];
        }

        set publisherName(name){
            this[_pubName] = name;
        }

        get publisherChannelName(){
            return this[_pubChannelName];
        }

        set publisherChannelName(channelName){
            this[_pubChannelName] = channelName;
        }

        get handler(){
            return this[_handler];
        }

        set handler(fn){
            this[_handler] = fn;
        }

        get uri(){
            return this[_handlerURI];
        }

        set uri(uri){
            this[_handlerURI] = uri;
        }

        async subscribe(){

            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: {
                    "name": this[_name],
                    "url": this[_upstreamURL] +  this[_handlerURI],
                    "channel": this[_pubChannelName]
                },
                uri: this[_gateway].proxyURI + '/' + this[_pubName] + '/subscribers'
            };
            console.log("Sending new subscriber request: " + JSON.stringify(options));
            await this[_gateway].send(options);
            console.log('Subscribed.')
        }

    }

}

module.exports = FloretSubscriber;