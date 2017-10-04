
let FloretPackage;

{
    let _sender = Symbol('sender');
    let _receiver = Symbol('receiver');
    let _channel = Symbol('channel');
    let _payload = Symbol('payload');

    FloretPackage = class FloretPackage {

        constructor(config) {

            let { sender, receiver, channel, payload } = config;

            this[_sender] = sender;
            this[_receiver] = receiver;
            this[_channel] = channel;
            this[_payload] = payload;
        }

        toJSON() {
            return {
                "sender": this.sender,
                "receiver": this.receiver,
                "channel": this.channel,
                "payload": this.payload
            }
        }

        get sender(){
            return this[_sender];
        }

        set sender(send){
            this[_sender] = send;
        }
        get receiver(){
            return this[_receiver];
        }

        set receiver(rec){
            this[_receiver] = rec;
        }
        get channel(){
            return this[_channel];
        }

        set channel(chan){
            this[_channel] = chan;
        }

        get payload(){
            return this[_payload];
        }

        set payload(pl){
            this[_payload] = pl;
        }
    }
}

module.exports = FloretPackage;