const Rx = require('rxjs');
const rp = require('request-promise');
const Package = require('../package/floret-package');

let FloretChannel;

{
    const _name = Symbol('name');
    const _hostURL = Symbol('hostURL');
    const _hostPort = Symbol('hostPort');
    const _uri = Symbol('uri');
    const _description = Symbol('description');
    const _serviceName = Symbol('serviceName');
    const _gateway = Symbol('gateway');
    const _apiName = Symbol('apiName');
    const subject = Symbol('subject');
    const _subscribers = Symbol('subscribers');
    const channelEndpoint = Symbol('channelEndpoint');
    const _handler = Symbol('handler');
    const _package = Symbol('package');

    FloretChannel = class FloretChannel {
        constructor(config, handler) {

            let { name, endpoint, uri, serviceName, description } = config;
            this[_name] = name;
            this[_description] = description;
            this[channelEndpoint] = endpoint;
            this[_handler] = handler || this.incomingMessages;
            this[_serviceName] = serviceName;
            this[_uri] = uri;
            this[_apiName] = `${serviceName}_channel_${name}`;
            this[subject] = new Rx.Subject();
            this[_subscribers] = {};

        }

        subscribe(subscriber){
            if (!this[_subscribers][subscriber.name] && subscriber.endpoint) {
                subscriber['observer'] = this[subject].subscribe( (msg) => {
                    return this[_handler](msg);
                });

                this[_subscribers][subscriber.name] = subscriber;
                return subscriber;
            }
        }

        unsubscribe(subscriberName){
            if (this[_subscribers][subscriberName]) {
                this[_subscribers][subscriberName].observer.unsubscribe();
                this[_subscribers][subscriberName] = {};
                delete this[_subscribers][subscriberName];
            }
        }

        broadcast(sender, payload) {
            if (sender && payload) {
                if (this.subject.observers.length > 0) {
                    this.subject.next([sender, payload]);
                }
            }

        }

        get name(){
            return this[_name];
        }

        set name(name){
            this[_name] = name;
        }

        get apiName(){
            return this[_apiName];
        }

        set apiName(name) {
            this[_apiName] = name;
        }

        get description(){
            return this[_description];
        }

        set description(desc){
            this[_description] = desc;
        }

        get endpoint() {
            return this[channelEndpoint];
        }

        set endpoint(ep) {
            this[channelEndpoint] = ep;
        }

        get subject(){
            return this[subject];
        }


        get uri(){
            return this[_uri];
        }

        set uri(uri){
            this[_uri] = uri;
        }

        get gateway() {
            return this[_gateway];
        }

        set gateway(gw) {
            this[_gateway] = gw;
        }

        get serviceName() {
            console.log('')
            return this[_serviceName];
        }

        set serviceName(sn) {
            this[_serviceName] = sn;
        }

        get subscribers() {
            return this[_subscribers];
        }

        set subscribers(subs) {
            this[_subscribers] = subs;
        }

        incomingMessages(params) {
            let ctx = this;
            let sender = params[0];
            let payload = params[1];

            for(let key in ctx[_subscribers]){
                let receiver;
                let name = receiver = ctx[_subscribers][key].name;
                let endpoint = ctx[_subscribers][key].endpoint;
                let channel = this.name;

                let pkg = new Package({sender, receiver, channel, payload});
                if (endpoint) {

                    let options = {
                        header: {
                            'Content-Type': 'application/json'
                        },
                        method: 'POST',
                        body: pkg.toJSON(),
                        uri: endpoint
                    };

                    ctx.send(options).then(() => {
                        console.log(`Sending. From: ${sender} To: ${receiver}-${endpoint}`)
                    }).catch((e) => {
                        if (e.statusCode !== 409) {
                            throw e;
                        }
                    });
                }
            }
            return ctx[_subscribers];
        }

        async send(options) {
            options.json = typeof options.body !== 'string';
            return await rp(options);
        }

        openAPISpecTemplate() {

            let template = {
                "get": {
                    "summary": "",
                    "operationId": "",
                    "tags": ["floret", "channel"],
                    "responses": [
                        {
                            "200": { }
                        }]
                }
            }
            return template;
        }
        
        config () {
            return {
                'name': this[_name],
                'serviceName': this[_serviceName],
                'apiName': this[_apiName],
                'description': this[_description],
                'hostURL': this[_hostURL],
                'hostPort': this[_hostPort],
                'uri': this[_uri]
            };
        }
    }

}


module.exports = FloretChannel;