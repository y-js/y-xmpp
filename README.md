# XMPP Connector for [Yjs](https://github.com/y-js/yjs)

XMPP is a very nice choice as a Connector, because it provides already a lot of functionality.

* Can act as a Connector for thousands of users
* Sophisticated Rights Management
* Very reliable
* Federated
* Works with nodejs and in the browser

In production, you may want to implement a master instance (in Node.js), that holds the state of your shared data types, even when all users are disconnected. You can find such a server implementation [here](https://github.com/DadaMonad/meme-together/blob/master/server.js). Note: Yjs itself does not depend on a server instance. The server implementation is just another client in the XMPP chat room. Also: Having (a) master client(s) in the chatroom, can reduce traffic significantly.

## Use it!
Retrieve this with bower or npm.

##### NPM
```
npm install y-xmpp --save
```
and put it on the `Y` object.

```
Y.XMPP = require("y-xmpp");
```

##### Bower
```
bower install y-xmpp --save
```

### Create the connection object
```
var options = {};
var conn = new Y.XMPP(options); // will connect to the default endpoint
```

On the options object you can put the following properties:
* jid (optional)
  * The users jingle id. If you don't specify login credentials, the XMPP-Connector will connect as a anonymous user. It is your choice to configure the XMPP room in such a way that only registered users, are able to join the multi-user-chat.
* password (optional)
  * Login password</dd>
* host (only for Node.js)
  * If you connect as a Node.js server, then you must set the host property to the domain of your server.
* port (only for Node.js)
  * Port, if you connect as Node.js server.
* websocket (optional)
  * Websocket connection endpoint. E.g. 'wss:yatta.ninja:5281/xmpp-websocket'. Set this if you don't want to connect to the provided XMPP endpoint
* node_xmpp_client (optional)
  * If you want, you can put in here any initialized [node-xmpp-client](https://github.com/node-xmpp/node-xmpp-client). If you specify this parameter, all the other options will be ignored.
* defaultRoomComponent (optional)
  * The default endpoint for XMPP muc rooms. Defaults to "@conference.yatta.ninja" (don't forget the @!)

### Join a room, creating the Connector
```
var options = {
  syncMethod: "syncAll" // does also support "master-slave"
  // , role: "master" // only if this is a master client, and syncMethod is "master-slave"
};
var connector = conn.join("my-new-roomname", options)
```

If you do not want to connect to the default room component (see options.defaultRoomComponent), you can also specify a full jid here. E.g.
```
var connector = conn.join("room@muc.yatta.ninja")
```

## License
Yjs is licensed under the [MIT License](./LICENSE.txt).

<kevin.jahns@rwth-aachen.de>

