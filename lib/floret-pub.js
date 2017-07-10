

let FloretPub;

{
    const name = Symbol('name');
    FloretPub = class FloretPub {
        // provides methods to publish messages to subscribers
        constructor(gateway, pubName) {

            if (!pubName || pubName === '') {
                throw Error('Publisher name required');
            }

            this[name] = pubName;

            // todo: return observable
        }

        get name(){
            console.log('return name valu' + this[name]);
            return this[name];
        }
    }
}
module.exports = FloretPub;