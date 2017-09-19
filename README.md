# Floret.js
## A reactive microservice framework

*floret - Noun: one of the small flowers making up a composite flower head.* 

![Floret Pattern](images/floret.png)

## Description
Floret is a lightweight microservice framework.  Its event-driven architecture facilitates the orchestration
of services to produce desired outcomes.  Each Floret service has a small scope of responsibility,
and communicate directly with other Floret services via their REST APIs or with a built-in Pub/Sub system.

![Event Flow](images/floret-illustration.png)

### Rapid service development
Enjoy the ease of standing up deployable services in minutes. With a few lines of code your service
will:

* register with the api gateway
* create healthcheck and new subscriber apis at the gateway and web server
* create an admin api for managing pub/sub operations


    const floretConfig = {
        "gatewayHost": "http://127.0.0.1", // api gateway host url
        "gatewayProxyPort": 8000, // proxy port for service requests
        "gatewayAdminPort": 8001, // api gateway administration api
        "serviceName": "example-service", // floret service name
        "serviceHost": "http://10.19.184.44", // floret service url
        "servicePort": 8084, // floret service port
        "serviceURI": "/example-service" // floret service base uri
    }

    const Floret = require('floret');
    const floret = new Floret(floretConfig);

    floret.listen( (ctx)=>{
        console.log('Floret Service started on port ' + floretConfig.servicePort);
    });

#### Custom APIs
Add apis to your web server.


    // app/routes/routes.js
    module.exports = (app) => {
        app.router.get('/hello-world', async(ctx, next) => {
            ctx.body = "Hello World";
        });
        
        app.router.post('/hello-world', async(ctx, next) => {
            console.log('Incoming message to /hello-world');
            console.log(ctx.body);
        });
    }
    
    // index.js
    ...
    const floret = new Floret(floretConfig);
    ...
    // include any apis (routes) your web api will serve
    const routes = require('./app/routes/routes')(floret);
    
    floret.listen(() => {
        // make your api public by registering it at the gateway
        floret.registerAPI(`hello-world`, '/hello-world', 'GET,POST').then( (res) => {
            console.log('api hello-world created at the api gateway');
        })
    });
    

    
### Pub/Sub
Floret has a built-in pub/sub model for event-driven communication with other floret services.

#### Channels
Channels are the means by which messages are published.  Channels can be built programatically or real-time with the admin api.
    
    const soapboxConfig = {
        "name": "soapbox",
        "description": "a channel for rants",
        "hostURL": floretConfig.serviceHost,
        "hostPort": floretConfig.servicePort,
        "uri": "/soapbox"
    };
    
    
Authored channel
    
    ...
    let soapboxChannel = new floret.Channel(soapboxConfig);
    floret.channels = [soapboxChannel];
    floret.listen(()=>{});
    ...
    
 
    
Dynamic channel -- web server already started    
    
    ...
    let soapboxChannel = new floret.Channel(soapboxConfig);
    floret.initChannel(soapboxChannel);
    ...
    
    
Typical uses:

* Abstraction of service implementations
* Tighly scoped API services
* Connector services binding services together
* Simple event handlers and emitters


## Floret Ecosystem
Floret services are event driven, publishing and subscribing to event data via a central API Gateway.  The illustration
below is an example of a floret.  Each floret service provide specific functionality.

![Ecosystem](images/floret-ecosystem-ex.png)

## Examples
You can find full example projects at [floret-examples](https://stash.acxiom.com/projects/ACXM/repos/floret-examples/browse).



## Installation
Floret is a node module, and is installed to your project via npm or similar package manager.  

npm install --save git+ssh://git@stash.acxiom.com:7999/acxm/floret.git#develop

## Author
[clint brown - clint.brown.atx@gmail.com](mailto:clint.brown.atx@gmail.com) | [github - cbrown23](https://github.com/cbrown23)

