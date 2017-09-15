let FloretHandler;

{
    const _name = Symbol('name');
    const _paths = Symbol('paths');
    const _handlers = Symbol('handlers');
    const _handler = Symbol('handler');


    FloretHandler = class FloretHandler {

        constructor(name, handlerFunction) {

            console.log('constructing handler');
            this[_name] = name;
            this[_handler] = {};
            this[_handler] = handlerFunction;

        }

        async init() {
            console.log('initializing handlers')
            let handlers = {};
            this[_handlers] = this[_paths].reduce( (acc, path) => {
                let newObj = require(path);
                if (newObj){
                    Object.assign(acc, newObj)
                }
            });
            // this.handlers = handlers;
            console.log('handlers created')
            console.log(JSON.stringify(this[_handlers]));
        }

        get name() {
            return this[_name];
        }

        set name(n) {
            this[_name] = n;
        }

        run (...inputs) {
            this[_handler](...inputs);
        }

        get handlers(){
            return this[_handlers];
        }

        set handlers(obj){
            this[_handlers] = obj
        }

        get paths(){
            return this[_paths];
        }

        set paths(p){
            this[_paths] = p;
        }

    }
}

module.exports = FloretHandler;