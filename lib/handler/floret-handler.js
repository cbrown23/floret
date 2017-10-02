let FloretHandler;

{
    const _name = Symbol('name');
    const _handler = Symbol('handler');

    FloretHandler = class FloretHandler {

        constructor(name, handlerFunction) {

            this[_name] = name;
            this[_handler] = handlerFunction;
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
    }
}

module.exports = FloretHandler;