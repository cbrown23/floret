
let FloretConfig;

{
    let _config = Symbol('config');

    FloretConfig = class FloretConfig {

        /**
         *
         * @param configObj
         * @param serviceName
         * @param serviceHost
         * @param servicePort
         * @param serviceURI
         * @param gatewayHost
         * @param gatewayAdminPort
         * @param gatewayProxyPort
         */
        constructor(configObj, ...[serviceName, serviceHost, servicePort, serviceURI, gatewayHost, gatewayAdminPort, gatewayProxyPort, disconnected, publishDocs]) {
            this[_config] = {};
            this[_config].serviceName = serviceName ? serviceName : configObj.serviceName;
            this[_config].serviceHost = serviceHost ? serviceHost : configObj.serviceHost;
            this[_config].servicePort = servicePort ? servicePort : configObj.servicePort;
            this[_config].serviceURI = serviceURI ? serviceURI : configObj.serviceURI;
            this[_config].gatewayHost = gatewayHost ? gatewayHost : configObj.gatewayHost;
            this[_config].gatewayAdminPort = gatewayAdminPort ? gatewayAdminPort : configObj.gatewayAdminPort;
            this[_config].gatewayProxyPort = gatewayProxyPort ? gatewayProxyPort : configObj.gatewayProxyPort;
            this[_config].endpoint = `${this[_config].serviceHost}:${this[_config].servicePort}/${this[_config].serviceName}`;
            this[_config].documentationPaths = configObj.documentationPaths;
            this[_config].disconnected = disconnected ? disconnected : configObj.disconnected;

            this[_config].channels = configObj.channels ? configObj.channels : [];
            this[_config].subscriptions = configObj.subscriptions ? configObj.subscriptions : [];
            this[_config].apis = configObj.apis ? configObj.apis : [];
            this[_config].publishDocs = publishDocs ? publishDocs : configObj.publishDocs;
        }

        /**
         *
         * @returns {*}
         */
        get params() {
            return this[_config];
        }

        get serviceName () {
            return this[_config].serviceName;
        }

        get serviceHost () {
            return this[_config].serviceHost;
        }

        get serviceURI () {
            return this[_config].serviceURI;
        }

        get gatewayHost () {
            return this[_config].gatewayHost;
        }

        get gatewayAdminPort () {
            return this[_config].gatewayAdminPort;
        }

        get gatewayProxyPort () {
            return this[_config].gatewayProxyPort;
        }

        get endpoint () {
            return this[_config].endpoint;
        }

        get documentationPaths () {
            return this[_config].documentationPaths;
        }

    }
}

module.exports = FloretConfig;