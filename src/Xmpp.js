/* global Y */
'use strict'

var NXMPP = require('node-xmpp-client')
var ltx = require('ltx')

function extend (Y) {
  function extract_resource_from_jid (jid) {
    return jid.split('/')[1]
  }

  class XMPP extends Y.AbstractConnector {
    constructor (y, options) {
      if (options === undefined) {
        throw new Error('Options must not be undefined!')
      }
      if (options.room == null) {
        throw new Error('You must define a room name!')
      }
      options.defaultRoomComponent = options.defaultRoomComponent || '@conference.yatta.ninja'
      options.role = 'slave'
      super(y, options)
      this.creds = options.credentials || {
        jid: '@yatta.ninja',
        preferred: 'ANONYMOUS'
      }
      this.room = options.room
      if (this.room.indexOf('@') === -1) {
        this.room += options.defaultRoomComponent
      }
      if (options.host != null) {
        this.creds.host = options.host
        this.creds.port = options.port
      } else {
        this.creds.websocket = options.websocket || { url: 'wss:yatta.ninja:5281/xmpp-websocket' }
      }
      var xmpp = new NXMPP.Client(this.creds)
      this.xmpp = xmpp
      var self = this

      xmpp.on('online', function () {
        self.setUserId(self.xmpp.jid.resource)
        self.room_jid = self.room + '/' + self.xmpp.jid.resource // set your jid in the room
        var room_subscription = new ltx.Element('presence', {
          to: self.room_jid
        }).c('x', {})
          .up()
          .c('role', {xmlns: 'http://y.ninja/role'})
          .t(options.role)
        self.xmpp.send(room_subscription)
      })
      xmpp.on('error', function (m) {
        throw new Error('XMPP error', m)
      })
      xmpp.on('stanza', function (stanza) {
        if (stanza.getAttr('type') === 'error') {
          console.error(stanza.toString())
          return
        }
        var sender = extract_resource_from_jid(stanza.getAttr('from'))
        if (stanza.is('presence')) {
          // a new user joined or leaved the room
          if (sender === self.userId) {
            // this client received information that it successfully joined the room
            // nop
          } else if (stanza.getAttr('type') === 'unavailable') {
            // a user left the room
            self.userLeft(sender)
          } else {
            var sender_role = stanza
              .getChild('role', 'http://y.ninja/role')
              .getText()
            self.userJoined(sender, sender_role)
          }
        } else {
          // it is some message that was sent into the room (could also be a private chat or whatever)
          if (sender === self.userId) {
            return true
          }
          var m = JSON.parse(stanza.attrs['value'])
          if (self.debug) {
            console.log('RECEIVED: ', m)
          }
          self.receiveMessage(sender, m)
        }
      })
    }
    disconnect () {
      throw new Error('XMPPConnector.disconnect is not supported!')
    }
    reconnect () {
      throw new Error('XMPPConnector.reconnect is not supported!')
    }

    send (user, json, type) {
      var m = new ltx.Element('message', {
        to: user === '' ? this.room : this.room + '/' + user,
        type: type || 'message' // or chat??
      })
      m.setAttribute('value', JSON.stringify(json)) // this.encodeMessageToXml(m, json)
      if (this.debug) {
        console.log('SENDING: ', json)
      }
      this.xmpp.send(m.root())
    }
    broadcast (json) {
      this.send('', json, 'groupchat')
    }
    isDisconnected () {
      return false
    }
  }
  Y.extend('xmpp', XMPP)
}

module.exports = extend
if (typeof Y !== 'undefined') {
  extend(Y)
}
