let FloretSubscription;

{
    const _name = Symbol('name');
    const _service = Symbol('service');
    const _handler = Symbol('handler');
    const _router = Symbol('router');
    const _gateway = Symbol('gateway');
    const _endpoint = Symbol('endpoint');
    const _uri = Symbol('uri');

    FloretSubscription = class FloretSubscription {
        constructor(name, handler, service, router, gateway) {
            this[_name] = name;
            this[_handler] = handler;
            this[_router] = router;
            this[_gateway] = gateway;
            this[_service] = service;
            this[_endpoint] = '';
            this[_uri] =  `/subscription/${this[_name]}`;
        }

        async init() {
            this.createSubscriptionAPI();
            this.createSubscriptionEndpoint();
        }

        async createSubscriptionAPI(){
            let gatewayAPIName = `${this[_service].name}_subscription_${this[_handler].name}`;
            let url =  `${this[_service].baseURL}/subscription/${this[_name]}`;

            this[_endpoint] = url;

            await this[_gateway].addAPI(gatewayAPIName, [`/${this[_service].name}/subscription/${this[_name]}`], url, 'POST').then(() => {

            }).catch((e) => {
                console.log('error with adding api: ' + e.statusCode);
                if (e.statusCode !== 409) {
                    console.log('api could not be registered. ' + e.message);
                    throw e;
                }
            });

        }

        async createSubscriptionEndpoint() {
            this[_router].post( this[_uri], this[_handler].run.bind(this[_handler]))
        }
        
        async subscribe() {
            
        }

        get subscriptionURL() {
            return `/${this[_uri]}`;
        }
        get name() {
            return this[_name];
        }

        set name(name) {
            this[_name] = name;
        }

        get uri() {
            return this[_uri];
        }

        set uri(uri) {
            this[_uri] = uri;
        }
        get endpoint() {
            return this[_endpoint];
        }

        set endpoint(endpoint) {
            this[_endpoint] = endpoint;
        }

        get service() {
            return this[_service];
        }

        get gateway() {
            return this[_gateway];
        }

        get router() {
            return this[_router];
        }

        get handler() {
            return this[_handler];
        }

    }
}

module.exports = FloretSubscription;