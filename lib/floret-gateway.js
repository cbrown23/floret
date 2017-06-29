const rp = require('request-promise');

class FloretGateway {
    // provides methods to instantiate gateway service communications
    constructor(uri, router, name) {
        this.gatewayURI = uri;
        this.route = router;
        this.name = name;
    }

    async isAPIRegistered(name) {
        let options = {
            'uri': this.gatewayURI + '/' + name,
            'method': 'GET'
        };
        return await send(options)
            .then((res) => {console.log('resutl: ' + res); return true})
            .catch((e=> {console.log(e.message); return false}));

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

    async addAPI(options) {
        let result;
        let exists = await this.isAPIRegistered(options.body.name);

        if (!exists){
            options.uri = this.gatewayURI;
            result = await send(options);

        } else {
            console.log('uri already exists');
            result = await this.getAPI(options.body.name);
        }
        return result;
    }

    async deleteAPI(name){
        let options = {
            method: 'DELETE',
            uri: this.gatewayURI + '/' + name
        };
        return send(options);
    }
}

async function send(options){
    options.json = typeof options.body !== 'string';
    return await rp(options);
}


module.exports = FloretGateway;