const rp = require('request-promise');

let FloretGateway;
{
    // private members
    const nodeConfig = Symbol('nodeConfig');
    const adminPort = Symbol('adminPort');
    const proxyPort = Symbol('proxyPort');
    const proxyURI = Symbol('proxyURI');
    const adminURI = Symbol('adminURI');
    const host = Symbol('host');
    const subService = Symbol('subService');

    FloretGateway = class FloretGateway {
        // provides methods to instantiate gateway service communications
        constructor(gatewayHost, port) {
            this[host] = gatewayHost;
            this[adminPort] = port || 8001;
            this[adminURI] = this.host + ':' + this.adminPort;
        }

        async init() {
            await this.getNodeConfig()
                .then((cfg) => {
                    this[nodeConfig] = cfg;
                    this[proxyPort] = cfg.configuration.proxy_port;
                    this[proxyURI] = this.host + ':' + this.proxyPort;
                })
                .catch((e) => {
                    console.log('exception getting node details in constructor');
                    throw new Error('could not load gw config: ' + e.message);
                });
            return this;
        }

        get host() {
            return this[host];
        }

        get adminURI() {
            return this[adminURI];
        }

        get proxyURI() {
            return this[proxyURI];
        }

        get config() {
            return this[nodeConfig];
        }

        get adminPort() {
            return this[adminPort];
        }

        get proxyPort() {
            return this[proxyPort];
        }


        async isAPIRegistered(name) {
            let options = {
                'uri': this.gatewayURI + '/' + name,
                'method': 'GET'
            };
            return send(options)
                .then((res) => {
                    console.log('resutl: ' + res);
                    return true
                })
                .catch((e=> {
                    console.log(e.message);
                    return false
                }));
        }

        addRequestToken(token) {
            this.use(function (ctx, next) {
                ctx.set('api-key', token);
            })
        }

        async getAllAPIs() {
            let options = {
                'uri': this.gatewayURI
            };
            return await send(options).then((res) => {
                return res.data;
            });
        }

        async getAPI(name) {
            let options = {
                uri: this.gatewayURI + '/' + name,
                method: 'GET'
            };
            return await send(options).then((res) => {
                return res;
            });
        }

        async getPublishers(){
            let apis = await this.getAllAPIs();
            apis.filter((api) => {
                return api.type === 'publisher'
            });
        }

        async getPublisher(name){
            return await this.getAllAPIs();

        }

        async getSubscribers(){
            let apis = await this.getAllAPIs();
            apis.filter((api) => {
                return api.type === 'subscriber'
            });
        }

        async getSubscriber(name){
            return await this.getAPI(name);
        }

        async addAPI(options) {
            let result;
            let exists = await this.isAPIRegistered(options.body.name);

            if (!exists) {
                options.uri = this.gatewayURI;
                result = await send(options);

            } else {
                console.log('uri already exists');
                result = await this.getAPI(options.body.name);
            }
            return result;
        }

        async deleteAPI(name) {
            let options = {
                method: 'DELETE',
                uri: this.gatewayURI + '/' + name
            };
            return send(options);
        }

        async getProxyPort() {
            let node = await this.getNodeDetails();
            return node.configuration.admin_port;
        }

        async getNodeConfig() {
            console.log('in get node details');
            if (!this.config) {
                console.log('no node config');
                console.log('adminURI: ' + this.adminURI);
                let options = {
                    method: 'GET',
                    uri: this.adminURI
                };
                console.log('sending ')
                this[nodeConfig] = await send(options);
                console.log('trying to set')
                return this.config;
            } else {
                console.log('returning default');
                return this.config;
            }
        }
    };

    async function send(options) {
        options.json = typeof options.body !== 'string';
        console.log('calling ' + options.uri);
        return await rp(options);
    }
}


module.exports = FloretGateway;