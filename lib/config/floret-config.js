
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
        constructor(configObj, ...[serviceName, serviceHost, servicePort, serviceURI, gatewayHost, gatewayAdminPort, gatewayProxyPort]) {
            console.log('serviceHost ' + serviceHost)
            let env_key, config;
            this[_config] = {};

            this[_config].serviceName = serviceName ? serviceName : configObj.serviceName;
            this[_config].serviceHost = serviceHost ? serviceHost : configObj.serviceHost;
            this[_config].servicePort = servicePort ? servicePort : configObj.servicePort;
            this[_config].serviceURI = serviceURI ? serviceURI : configObj.serviceURI;
            this[_config].gatewayHost = gatewayHost ? gatewayHost : configObj.gatewayHost;
            this[_config].gatewayAdminPort = gatewayAdminPort ? gatewayAdminPort : configObj.gatewayAdminPort;
            this[_config].gatewayProxyPort = gatewayProxyPort ? gatewayProxyPort : configObj.gatewayProxyPort;
            this[_config].endpoint = `${this[_config].serviceHost}:${this[_config].servicePort}/${this[_config].serviceName}`;
        }

        /**
         *
         * @returns {*}
         */
        get params() {
            return this[_config];
        }

    }
}

module.exports = FloretConfig;