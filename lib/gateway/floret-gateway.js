const rp = require("request-promise");
let FloretGateway;

{
    const _name = Symbol('name');
    const _url = Symbol('url');
    const _adminPort = Symbol('adminPort');
    const _proxyPort = Symbol('proxyPort');
    const _type = Symbol('type');

    FloretGateway = class FloretGateway {

        /**
         *
         * @param gatewayName
         * @param gatewayURL
         * @param gatewayAdminPort
         * @param gatewayProxyPort
         * @param gatewayType
         */
        constructor(gatewayName, gatewayURL, gatewayAdminPort, gatewayProxyPort, gatewayType) {
            this[_name] = gatewayName;
            this[_url] = gatewayURL;
            this[_adminPort] = gatewayAdminPort;
            this[_proxyPort] = gatewayProxyPort;
            this[_type] = gatewayType;
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
                'uri': this.adminURL + '/apis/' + service.name,
                'simple': false
            };

            await this.send(options).then((msg) => {
                res = msg;
            }).catch((e) => {
                if (!e.statusCode === 409) {
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
                uri: this.adminURL + '/apis/',
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
                uri: this.adminURL + '/apis/' + name
            };
            return await this.send(options);
        }

        async apiRequestByName(name, options) {
            options.uri = this.proxyURL + '/' + name;
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
                uri: this.adminURL + '/apis/?upstream_url=' + upstreamURL
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
                uri: this.adminURL + '/apis'
            };
            return await this.send(options).catch(this.suppress409);
        }

        async deleteAPI(name) {
            let options = {
                header: {
                    'Content-Type': 'application/json'
                },
                method: 'DELETE',
                uri: this.adminURL + '/apis/' + name
            };
            return await this.send(options).catch(this.suppress409);;
        }

        get name() {
            return this[_name];
        }

        get url() {
            return this[_url];
        }

        get adminURL() {
            return this[_url] + ':' + this[_adminPort];
        }

        get adminPort() {
            return this[_adminPort];
        }

        get proxyPort() {
            return this[_proxyPort];
        }

        get proxyURL() {
            return this[_url] + ':' + this[_proxyPort];
        }

        get type() {
            return this[_type];
        }

        isPrimary() {
            return this[_type] === 'primary';
        }

        get subscribers() {
            return this[subscribers];
        }

        async subscribeTo(serviceName, channelName, subscriberName, subscriptionEndpoint){
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
                uri: this.proxyURL + '/' + serviceName + '/subscribe'
            };

            return await this.send(options).catch(this.suppress409);
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
                method: 'DELETE',
                uri: this.proxyURL + '/' + serviceName + '/subscribe'
            };
            return await this.send(options).catch(this.suppress409);
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
                uri: this.adminURL + '/status',
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

        suppress409(e){
            if (e.statusCode !== 409){
                throw e;
            }
        };
    }
}

module.exports = FloretGateway;