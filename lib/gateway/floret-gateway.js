const rp = require("request-promise");
let FloretGateway;

{
    const name = Symbol('name');
    const uri = Symbol('uri');
    const adminPort = Symbol('adminPort');
    const proxyPort = Symbol('proxyPort');
    const type = Symbol('type');

    FloretGateway = class FloretGateway {

        /**
         *
         * @param gatewayName
         * @param gatewayURI
         * @param gatewayAdminPort
         * @param gatewayProxyPort
         * @param gatewayType
         */
        constructor(gatewayName, gatewayURI, gatewayAdminPort, gatewayProxyPort, gatewayType) {
            this[name] = gatewayName;
            this[uri] = gatewayURI;
            this[adminPort] = gatewayAdminPort;
            this[proxyPort] = gatewayProxyPort;
            this[type] = gatewayType;
        }

        /**
         *
         * @param service
         * @returns {{api: *, status: *}}
         */
        async register(service) {
            //check if registered
            let res, api, status;
            var options = {
                'method': 'get',
                'uri': this.adminURI + '/apis/' + service.name,
                'simple': false
            };

            await this.send(options).then((msg) => {
                res = msg;
            }).catch((e) => {
                if (!e.status == 409) {
                    console.log('error adding new subscriber api. ' + e.message);
                    throw e;
                }
            });

            //if not, create the api
            if (res && res.message === "Not found") {
                api = await this.addAPI(service.name, service.proxyURI + '/healthcheck', service.baseURL + '/healthcheck', 'GET,POST,PUT,PATCH,UPDATE,DELETE,OPTIONS');
                status = 'new'
            } else {
                status = 'existing';
                api = await this.getAPI(service.name);
            }

            return {
                api: api,
                status: status
            };

        }

        /**
         *
         * @param name
         */
        async discover(name) {
            // get all api's that's name begins with input
            let apis = await this.getAPIs();

            let filteredAPIs = apis.filter( (api) => {
                if (api.name.indexOf(name) !== -1){
                    return true;
                }
                return false;
            });

            return filteredAPIs;
        }


        // ### API methods
        async getAPIs() {
            let options = {
                method: 'get',
                uri: this.adminURI + '/apis/',
                header: {
                    'Content-Type': 'application/json'
                }
            };
            let apis = await this.send(options).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
            return apis;
        }

        async getAPI(name) {
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'GET',
                uri: this.adminURI + '/apis/' + name
            };
            return await this.send(options);
        }

        async apiRequestByName(name, options) {
            options.uri = this.proxyURI + '/' + name;
            return this.send(options);
        }

        async apiRequestByURI(uri, options) {

        }

        async getAPIsWithUpstreamURL(upstreamURL) {
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'GET',
                uri: this.adminURI + '/apis/?upstream_url=' + upstreamURL
            };
            return await this.send(options);
        }

        async addAPI(name, uris, upstreamURL, methods) {
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: {
                    name: name,
                    uris: uris,
                    upstream_url: upstreamURL,
                    methods: methods
                },
                uri: this.adminURI + '/apis'
            };
            return await this.send(options);
        }

        async deleteAPI(name) {
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'DELETE',
                uri: this.adminURI + '/apis/' + name
            };
            return await this.send(options);
        }

        get name() {
            return this[name];
        }

        get uri() {
            return this[uri];
        }

        get adminURI() {
            return this[uri] + ':' + this[adminPort];
        }

        get adminPort() {
            return this[adminPort];
        }

        get proxyPort() {
            return this[proxyPort];
        }

        get proxyURI() {
            return this[uri] + ':' + this[proxyPort];
        }

        get type() {
            return this[type];
        }

        isPrimary() {
            return this[type] === 'primary';
        }

        get subscribers() {
            return this[subscribers];
        }

        async subscribeTo(serviceName, channelName, subscriberName, subscriptionEndpoint){
            console.log('sending a request to ' + this.proxyURI + '/' + serviceName + '/subscribe')
            let body = {
                "channel": channelName,
                "name": subscriberName,
                "url": subscriptionEndpoint
            };

            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'POST',
                body: body,
                uri: this.proxyURI + '/' + serviceName + '/subscribe'
            };

            return await this.send(options);
        }

        async unsubscribe(serviceName, channelName, subscriberName){
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                body: {
                    "channelName": channelName,
                    "subscriberName": subscriberName
                },
                method: 'POST',
                uri: this.proxyURI + '/' + serviceName + '/unsubscribe'
            };
            return await this.send(options);
        }

        async loadSubscribers(name) {
            let apis = await this.getAPIs();
            let result = [];

            result = apis.filter((api) => {
                let found = false;
                if (api.uris && api.uris.length > 0) {

                    api.uris.map((uri) => {
                        let uriParts = uri.split('/');
                        uriParts.map((part, idx)=> {
                            if (!found) {
                                found = (part === name && uriParts[idx + 3] === 'subscribers' && uriParts[idx + 4]);
                            } else {
                                console.log("**" + found)
                            }

                        });
                    });
                }
                return found;
            });

            if (result && result.length && result.length > 0){
                return result;
            } else {
                return [];
            }
        }

        async createChannelAPI(name, serviceURI, upstreamURL, methods) {
            let channelAPI = await this.addAPI(name, [serviceURI], upstreamURL, methods);
            return channelAPI;
        }

        async createSubscriptionAPI(name, serviceURI, upstreamURL, methods) {
            let subAPI = {};
            try {
                subAPI = await this.addAPI(name, [serviceURI], upstreamURL, methods);

            } catch(e) {
                if (!e.status === 409) {
                    console.log('error adding new subscriber api. ' + e.message);
                    throw e;
                }
            };

            return subAPI;

        }

        async deleteChannelAPI(name){
            return await this.deleteAPI(name);
        }

        async gatewayHealthCheck() {
            // send request

            let options = {
                uri: this.adminURI + '/status',
                method: 'GET'
            };

            let res = await this.send(options).then(() => {
                return {
                    "status": "active"
                }
            });
            console.log('Status: ' + res.status);
            return res;
        }

        async deleteAllAPIs() {
            let apis = await this.getAPIs();
            apis.map( (api) => {
                console.log('Removing api: ' + api.name);
                this.deleteAPI(api.name);
            });
        }

        async send(options) {
            options.json = typeof options.body !== 'string';

            return await rp(options);
        }
    }
}

module.exports = FloretGateway;