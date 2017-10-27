
let FloretConfig;

{
    let _config = Symbol('config');

    FloretConfig = class FloretConfig {

        /**
         *
         * @param envObj
         * @param configObj
         * @param serviceName
         * @param serviceHost
         * @param servicePort
         * @param serviceURI
         * @param gatewayHost
         * @param gatewayAdminPort
         * @param gatewayProxyPort
         */
        constructor(envObj, configObj, ...[serviceName, serviceHost, servicePort, serviceURI, gatewayHost, gatewayAdminPort, gatewayProxyPort]) {

            let env_key, config;
            this[_config] = {};

            if (envObj){
                env_key = envObj.FLORET_ENV_KEY;
                this[_config].host = envObj.FLORET_HOST;
                this[_config].port = envObj.FLORET_PORT;
                this[_config].service = envObj.FLORET_NAME;
                this[_config].uri = envObj.FLORET_URI;
            } else {
                envObj = {};
            }

            if (configObj){
                config = configObj[env_key] || configObj || {};
            }

            this[_config].serviceName = envObj.FLORET_NAME || config.serviceName || serviceName;
            this[_config].serviceHost = envObj.FLORET_HOST || config.serviceHost || serviceHost;
            this[_config].servicePort = envObj.FLORET_PORT || config.servicePort || servicePort;
            this[_config].serviceURI =  envObj.FLORET_URI || config.serviceURI || serviceURI;
            this[_config].gatewayHost =  envObj.FLORET_GATEWAY_HOST || config.gatewayHost || gatewayHost;
            this[_config].gatewayAdminPort =  envObj.FLORET_GATEWAY_ADMIN_PORT || config.gatewayAdminPort || gatewayAdminPort;
            this[_config].gatewayProxyPort =  envObj.FLORET_GATEWAY_PROXY_PORT || config.gatewayProxyPort || gatewayProxyPort;
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