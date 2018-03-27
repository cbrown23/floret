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
            await this.addAPI(service.name, service.proxyURI + '/healthcheck', this.ensureProtocol(service.baseURL) + '/healthcheck', 'GET');
            let api = await this.getAPI(service.name);

            return {
                api: api
            }
        }


        ensureProtocol(str, protocol='http'){
            return str.indexOf('://') < 0 ? `${protocol}://${str}` : str;
        }

        /**
         *
         * @param name
         */
        async discover(name) {
            // get all api's that's name begins with input
            let apis = await this.getAPIs();

            let filteredAPIs = [];

            if (apis && apis.filter) {
                filteredAPIs = apis.filter((api) => {
                    if (api.name.indexOf(name) !== -1) {
                        return true;
                    }
                    return false;
                });
            }
            return filteredAPIs;
        }

        async discoverChannels() {
            return await this.discover('_channels_');
        }

        async discoverSubscribers(name) {
            return await this.discover(`${name}_subscribers_`);
        }
        async discoverServices() {
            // get all api's that's name begins with input
            let apis = await this.getAPIs();
            let services = [];
            if (apis && apis.filter) {
                services = apis.filter((api) => {
                    let uris = api.uris;
                    // todo: make this better.  create a separate service api so detection is easier
                    let parts = uris[0].split('/');

                    if (parts[parts.length - 1] === 'healthcheck') {
                        return true;
                    }
                    return false;
                });
            }
            return services;
        }

        async discoverServiceChannels(serviceName) {
            let prefix = serviceName + '_channels_';
            let channels = await this.discover(prefix);
            return channels;
        }

        async discoverAllChannels() {
            let apis = await this.getAPIs();
            let services = await this.discoverServices();
            let servicesObj = {};

            for (let i=0; i<services.length; i++){
                servicesObj[services[i].name] = {
                    "channels":  await this.discoverServiceChannels(services[i].name)
                }
            }

            return servicesObj;
        }

        async discoverAPISpecs(){
            return await this.discover('api-spec.json');
        }

        async post(uri, payload, options) {
            let stdOptions = {
                method: 'post',
                uri: this.proxyURL + uri,
                header: {
                    'Content-Type': 'application/json'
                },
                body: payload
            };

            let mergedOptions = Object.assign({}, stdOptions, options);

            return await this.send(mergedOptions).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
        }

        async get(uri, options) {
            var stdOptions = {
                'method': 'get',
                'uri': this.proxyURL + uri,
                'headers': {
                    'Accept': 'application/json'
                },
                'simple': false
            };

            let mergedOptions = Object.assign({}, stdOptions, options);
            let res = await this.send(mergedOptions).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
            return res;
        }

        // ### API methods
        async getAPIs(apiName) {
            let options = {
                method: 'get',
                uri: this.adminURL + '/apis/',
                header: {
                    'Accept': 'application/json'
                }
            };

            let apis = await this.send(options).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
            return apis || [];
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
                method: 'PUT',
                body: {
                    name: name,
                    uris: uris,
                    upstream_url: this.ensureProtocol(upstreamURL),
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
            return this.ensureProtocol(this[_url] + ':' + this[_adminPort]);
        }

        get adminPort() {
            return this[_adminPort];
        }

        get proxyPort() {
            return this[_proxyPort];
        }

        get proxyURL() {
            return this.ensureProtocol(this[_url] + ':' + this[_proxyPort]);
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
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
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
            if (apis && apis.filter) {
                result = apis.filter((api) => {
                    let found = false;
                    if (api.uris && api.uris.length > 0) {

                        api.uris.map((uri) => {
                            let uriParts = uri.split('/');
                            uriParts.map((part, idx) => {
                                if (!found) {
                                    found = (part === name && uriParts[idx + 3] === 'subscribers' && uriParts[idx + 4]);
                                }
                            });
                        });
                    }
                    return found;
                });
            }

            return result;
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
            return res;
        }

        async deleteAllAPIs() {
            let apis = await this.getAPIs();


            apis.map( (api) => {
                this.deleteAPI(api.name);
            });
        }

        async publishAPISpec(options){
            return await this.send(options);
        }

        async send(options, protocol='http') {
            if (options && options.uri) {
                if (options.uri.indexOf('://') < 0) {
                    options.uri = `${protocol}://${options.uri}`;
                }
                options.json = typeof options.body !== 'string';
                options.method = options.method || 'get';
                return await rp(options).catch(this.suppress409);
            } else {
                throw new Error('URI not specified');
            }
        }

        suppress409(e){

            if (e.statusCode !== 409){
                throw e;
            }
        };
    }
}

module.exports = FloretGateway;