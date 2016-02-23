# XMPP Connector for [Yjs](https://github.com/y-js/yjs)

XMPP is a very nice choice as a Connector, because it provides already a lot of functionality.

* Can act as a Connector for thousands of users
* Sophisticated Rights Management
* Federated
* Works with nodejs and in the browser

In production, you may want to implement a master instance (in Node.js), that holds the state of your shared data types, even when all users are disconnected. You can find such a server implementation [here](https://github.com/DadaMonad/meme-together/blob/master/server.js). Note: Yjs itself does not depend on a server instance. The server implementation is just another client in the XMPP chat room. Also: Having (a) master client(s) in the chatroom, can reduce traffic significantly.

## Use it!
Retrieve this with bower or npm.

##### NPM
```
npm install y-xmpp --save
```

##### Bower
```
bower install y-xmpp --save
```

### Example

```
Y({
  db: {
    name: 'memory'
  },
  connector: {
    name: 'xmpp',
	  room: 'my-xmpp-room'
  },
  sourceDir: '/bower_components', // location of the y-* modules
  share: {
    textarea: 'Text' // y.share.textarea is of type Y.Text
  }
  // types: ['Richtext', 'Array'] // optional list of types you want to import
}).then(function (y) {
  // bind the textarea to a shared text element
  y.share.textarea.bind(document.getElementById('textfield'))
}
```

## License
Yjs is licensed under the [MIT License](./LICENSE.txt).

<kevin.jahns@rwth-aachen.de>

