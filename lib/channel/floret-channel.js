const Rx = require('rxjs');
const rp = require('request-promise');

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

    FloretChannel = class FloretChannel {
        constructor(config, handler) {

            let { name, endpoint, uri, serviceName, description } = config;
            console.log('in channel constructor: ' + name);
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
                // the problem is that my "this" becomes stale since it is bound at execution time to fire

                let observer = this[subject].subscribe( (msg) => {
                    return this[_handler](msg);
                });
                subscriber['observer'] = observer;
                this[_subscribers][subscriber.name] = subscriber;
                return subscriber;
            }
        }

        unsubscribe(subscriberName){

            console.log('FLORET-CHANNEL: UNSUBSCRIBE: ' + subscriberName)
            if (this[_subscribers][subscriberName]) {
                this[_subscribers][subscriberName].observer.unsubscribe();
                this[_subscribers][subscriberName] = {};
                delete this[_subscribers][subscriberName];
            }

        }

        broadcast(msg) {
            if (msg) {
                console.log("number of observers: " + this.subject.observers.length);

                    let count = 0;
                for (let key in this.subscribers ){
                     count ++;
                }
                console.log("number of subscribers: " + count);
                this.subject.next(msg);
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

        incomingMessages(msg) {
            let ctx = this;
            console.log('INCOMING')
            for(let key in ctx[_subscribers]){
                let name = ctx[_subscribers][key].name;
                let endpoint = ctx[_subscribers][key].endpoint;

                if (endpoint) {

                    let options = {
                        header: {
                            'Content-Type': 'application/json'
                        },
                        method: 'POST',
                        body: {
                            "package": {
                                "from": ctx[_subscribers][key].name,
                                "msg": msg
                            }
                        },
                        uri: endpoint
                    };

                    ctx.send(options).then(() => {
                        console.log('msg sent from subscriber ' + name)
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