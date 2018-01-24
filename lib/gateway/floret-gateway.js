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
            console.log('discovering : ' + name)
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
            console.log('end of discovery')
            return filteredAPIs;
        }

        async discoverChannels() {
            console.log('disocver channels called')
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
            console.log('URI: ' + this.proxyURL + uri)
            var stdOptions = {
                'method': 'get',
                'uri': this.proxyURL + uri,
                'headers': {
                    'Accept': 'application/json'
                },
                'simple': false
            };

            let mergedOptions = Object.assign({}, stdOptions, options);

            console.log('sent get');
            console.log(JSON.stringify(mergedOptions));
            let res = await this.send(mergedOptions).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
            console.log('result was ' + JSON.stringify(res));
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
            console.log('sending for apis')
            let apis = await this.send(options).then((res) => res.data).catch((e) => {console.log('err: ' + e.message)});
            console.log("back from getapis")
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
            console.log('delete api called')
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

            console.log('trying to subscribe. body: ')
            console.log(JSON.stringify(body))

            let options = {
                header: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                method: 'POST',
                body: body,
                uri: this.proxyURL + '/' + serviceName + '/subscribe'
            };
            console.log('options: ')
            console.log(JSON.stringify(options));
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
                                } else {
                                    console.log("**" + found)
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
            console.log('Status: ' + res.status);
            return res;
        }

        async deleteAllAPIs() {
            console.log('ok delete all apis called ' )
            let apis = await this.getAPIs();
            console.log('ok, got some apis ' + apis.data.length)
            apis.data.map( (api) => {
                console.log('Removing api: ' + api.name);
                this.deleteAPI(api.name);
            });
        }

        async publishAPISpec(options){
            await this.send(options).then(() => {
                console.log('refreshed docs');
            }).catch((e) => {
                console.log('document service not found ' + this.proxyURL + '/api-doc/specs');
                console.log(e.message)
            });

        }

        async send(options) {
            console.log('in send')
            if (options) {
                options.json = typeof options.body !== 'string';
                let method = options.method || 'get';
                return await rp[method.toLocaleLowerCase()](options).catch(this.suppress409);
            }
            else {

            }
        }

        suppress409(e){
            console.log('in suppress: ' +JSON.stringify( e))
            if (e.statusCode !== 409){
                throw e;
            }
        };
    }
}

module.exports = FloretGateway;