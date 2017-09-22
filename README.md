# Floret.js
###  A  reactive microservice framework

*floret - Noun: one of the small flowers making up a composite flower head.* 

Floret is a lightweight microservice framework.  Its event-driven architecture facilitates the orchestration  
of services to produce desired outcomes.  Each Floret service has a small scope of responsibility,  
and communicate directly with other Floret services via their REST APIs or with a built-in Pub/Sub system.

### Floret is great for

* Building small, consistent, scalable RESTful APIs
* Proxying existing service apis
* Webhook ingress endpoints
* Self-healing strategies
* Rapid development of POCs
* Data transformations
* Publish and forget strategies
* Lambda implementations
* Orchestrating asynchronous service processes
* ...event-driven processes

![Event Flow](images/floret-illustration.png)

### Rapid service development
Enjoy standing up deployable services in minutes. With just a few lines of code your service
will:

* self-register with the api gateway
* create healthcheck and new subscriber apis at the gateway and web server
* discover channels and their subscribers
* discover subscriptions to other floret services
* create an admin api for managing pub/sub operations


### Installation
Floret is a node module, and is installed to your project via npm or similar package manager.  

    npm install --save git+ssh://git@stash.acxiom.com:7999/acxm/floret.git#develop

#### Creating a floret service

    // keep the config in a separate file or in environment variables
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
        console.log(`Floret Service started on port ${floretConfig.servicePort}`;  
    });  

#### Custom APIs
Add custom API endpoints to the built-in floret http server.

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
Publishers emit messages to specific channels that are subscribed to by 0-n services.  A subscription  
to a channel in effect means that the published messages will be POSTed to the subscriber-provided  
api endpoint.

Subscriptions can be created dynamically after both the Publisher and Subscriber services are active.  

#### Channels
Messages are published to channels, and channels can be subscribed to.  Channels can be built  
at application authoring or dynamically with the admin api.
    
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
    
##### Create a new channel on-demand
This would create a post route for handling new channel requests
    
    ...
    // create a post route for new channels of namespace "foo" 
    floret.router.post('/channel/foo/:name', async(ctx, next) => {
        let channelName = ctx.params.name;
        console.log(`creating on-demand channel ${channelName}`)
        let pub = app.getPublisher(channelName);

        if (!pub) {
            // create a new channel
            let newChannel = new app.Channel({
                "name": channelName,
                "description": "create new foo subject channels",
                "hostURL": floret.host,
                "hostPort": floret.url,
                "uri": "/foo/" + channelName
            });
            await app.initChannel(newChannel);

        } else {
            console.log('channel exists');
        }

        if (ctx.body){
            // first message on channel
            app.broadcast(channelName, ctx.body)
        }
       
    });


#### Subscriptions
Subscribing to another service creates a new Subscription.  The Subscription creates an  
api endpoint to handle new messages from a channel publisher(s). It also contains  
information about how to map incoming REST Posts to appropriate Handler functions.  

##### Create a new subscription
    
    ...
    const floret = new Floret(floretConfig);
    // creates a new handler function    
    let incomingMessageHandler = new floret.Handler('messageHandler', (ctx) => {
        let {user, message, room} = ctx.body.package;
        console.log(`${user}@${room}: ${message}`)
    });
    // create a subscription object    
    let chatSubscription = new floret.Subscription('chatSubscription', incomingMessageHandler, floret.service, floret.router, floret.gateway);
    
    // add to array of subscriptions, which will be invoked during floret initialization
    floret.subscriptions = [chatSubscription];

    floret.listen().then(() =>{
        console.log('client service started');
    }).catch( (e) =>{
        console.log('error init channel foo,' + e.message );
    });


#### Channel and Subscriber discovery process

When a floret service stands up, an immediate survey of the api gateway occurs.  It immediately discovers  
all of its channels registered at the gateway, and builds any it has not already created. When a new channel  
is created, subscribers of each channel are discovered.  They are attached and become observers of the channel.  

Self-discovery of channels and subscribers allows horizontal scaling of floret services that stand up and  
become aware of the services current state.    


## Floret Ecosystem
Floret services are event driven, publishing and subscribing to event data via a central API Gateway.  The illustration  
below is an example of a floret.  Each floret service provide specific functionality.

![Ecosystem](images/floret-ecosystem-ex.png)

## Examples
You can find full example projects at [floret-examples](https://stash.acxiom.com/projects/ACXM/repos/floret-examples/browse).

## Authors
[clint brown - clint.brown.atx@gmail.com](mailto:clint.brown.atx@gmail.com) | [github - cbrown23](https://github.com/cbrown23)