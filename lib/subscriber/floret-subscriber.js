let FloretSubscriber;

{
    const name = Symbol('name');
    const endpoint = Symbol('endpoint');
    const observer = Symbol('observer');

    FloretSubscriber = class FloretSubscriber {
        constructor(subName, subEndpoint) {
            if (subName && subEndpoint) {
                // the endpoint to post to
                this[name] = subName;
                this[endpoint] = subEndpoint;
            } else {
                throw new Error('FloretSubscriber requires name and endpoint arguments');
            }
        }

        get name(){
            return this[name];
        }

        set name(name){
            this[name] = name;
        }

        get observer() {
            return this[observer];
        }

        set observer(ob){
            this[observer] = ob;
        }

        get endpoint(){
            return this[endpoint];
        }

        set endpoint(ep){
            this[endpoint] = ep;
        }

        unsubscribe() {
            this[observer].unsubscribe();

        }
    }
}

module.exports = FloretSubscriber;