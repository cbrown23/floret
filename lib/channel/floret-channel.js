const Rx = require('rxjs');

let FloretChannel;

{
    const _name = Symbol('name');
    const _hostURL = Symbol('hostURL');
    const _hostPort = Symbol('hostPort');
    const _uri = Symbol('uri');
    const _description = Symbol('description');
    const _observable = Symbol('observable');
    const _serviceName = Symbol('serviceName');
    const _gateway = Symbol('gateway');
    const _apiName = Symbol('apiName');

    FloretChannel = class FloretChannel {

        // the floret object knows the

        constructor(config) {

            let {name, description, hostURL, hostPort, uri, appName} = config;

            this[_name] = name;
            this[_description] = description;
            this[_hostURL] = hostURL;
            this[_hostPort] = hostPort;
            this[_uri] = uri;
            this[_observable] = new Rx.Subject();
            this[_serviceName] = `${appName}_channel_${name}`
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

        get uri(){
            return this[_uri];
        }

        set uri(uri){
            this[_uri] = uri;
        }

        get observable(){
            return this[_observable];
        }

        get hostURL() {
            return this[_hostURL];
        }

        set hostURL(url) {
            this[_hostURL] = url;
        }

        get hostPort() {
            return this[_hostPort];
        }

        set hostPort(p) {
            this[_hostPort] = p;
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

        config () {
            return {
                'name': this[_name],
                'serviceName': this[_serviceName],
                'apiName': this[_apiName],
                'description': this[_description],
                'uri': this[_uri],
                'hostURL': this[_hostURL],
                'hostPort': this[_hostPort],
                'gateway': this[_gateway]
            };
        }
    }

}

module.exports = FloretChannel;