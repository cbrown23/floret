
let FloretService;

{
    const _name = Symbol('name');
    const _host = Symbol('host');
    const _port = Symbol('port');
    const _proxyURI = Symbol('proxyURI');
    const _routePrefix = Symbol('routePrefix');

    FloretService = class FloretService {
        constructor(name, host, port, proxyURI, routePrefix) {
            this[_name] = name;
            this[_host] = host;
            this[_port] = port;
            this[_proxyURI] = proxyURI;
            this[_routePrefix] = routePrefix;
        }

        get baseURL(){
            return this[_host] + ':' + this[_port] + this[_routePrefix];
        }

        get name(){
            return this[_name];
        }

        set name(name){
            this[_name] = name;
        }

        get host() {
            return this[_host];
        }

        set host(host) {
            this[_host] = host;
        }

        get port() {
            return this[_port];
        }
        set port(port){
            this[_port] = port;
        }

        get proxyURI(){
            return this[_proxyURI];
        }

        set proxyURI(uri){
            this[_proxyURI] = uri;
        }

        get routePrefix(){
            return this[_routePrefix];
        }

        set routePrefix(prefix){
            this[_routePrefix] = prefix;
        }
    }

}

module.exports = FloretService;