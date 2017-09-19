let FloretHandler;

{
    const name = Symbol('name');
    const handler = Symbol('handler');

    FloretHandler = class FloretHandler {

        constructor(name, handlerFunction) {
            console.log('$$$$$$$')
            this[name] = name;
            this[handler] = handlerFunction;
        }

        get name() {
            return this[name];
        }

        set name(n) {
            this[name] = n;
        }

        run (...inputs) {
            this[handler](...inputs);
        }
    }
}

module.exports = FloretHandler;