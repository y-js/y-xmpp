var NXMPP, XMPPConnector, XMPPHandler, extract_bare_from_jid, extract_resource_from_jid, ltx;

NXMPP = require("node-xmpp-client");

ltx = require("ltx");

extract_resource_from_jid = function(jid) {
  return jid.split("/")[1];
};

extract_bare_from_jid = function(jid) {
  return jid.split("/")[0];
};

XMPPHandler = (function() {
  function XMPPHandler(opts) {
    var creds;
    if (opts == null) {
      opts = {};
    }
    this.rooms = {};
    if (opts.node_xmpp_client != null) {
      this.xmpp = opts.node_xmpp_client;
    } else {
      if (opts.defaultRoomComponent != null) {
        this.defaultRoomComponent = opts.defaultRoomComponent;
      } else {
        this.defaultRoomComponent = "@conference.yatta.ninja";
      }
      creds = {};
      if (opts.jid != null) {
        creds.jid = opts.jid;
        creds.password = opts.password;
      } else {
        creds.jid = '@yatta.ninja';
        creds.preferred = 'ANONYMOUS';
      }
      if (opts.host != null) {
        creds.host = opts.host;
        creds.port = opts.port;
      } else {
        if (opts.websocket == null) {
          opts.websocket = 'wss:yatta.ninja:5281/xmpp-websocket';
        }
        creds.websocket = {
          url: opts.websocket
        };
      }
      this.xmpp = new NXMPP.Client(creds);
    }
    this.is_online = false;
    this.connections = {};
    this.when_online_listeners = [];
    this.xmpp.on('online', (function(_this) {
      return function() {
        return _this.setIsOnline();
      };
    })(this));
    this.xmpp.on('stanza', (function(_this) {
      return function(stanza) {
        var room;
        if (stanza.getAttribute("type" === "error")) {
          console.error(stanza.toString());
        }
        room = extract_bare_from_jid(stanza.getAttribute("from"));
        if (_this.rooms[room] != null) {
          return _this.rooms[room].onStanza(stanza);
        }
      };
    })(this));
    this.debug = false;
  }

  XMPPHandler.prototype.whenOnline = function(f) {
    if (this.is_online) {
      return f();
    } else {
      return this.when_online_listeners.push(f);
    }
  };

  XMPPHandler.prototype.setIsOnline = function() {
    var f, i, len, ref;
    ref = this.when_online_listeners;
    for (i = 0, len = ref.length; i < len; i++) {
      f = ref[i];
      f();
    }
    return this.is_online = true;
  };

  XMPPHandler.prototype.join = function(room, options) {
    var room_conn;
    if (options == null) {
      options = {};
    }
    if (options.role == null) {
      options.role = "slave";
    }
    if (options.syncMethod == null) {
      options.syncMethod = "syncAll";
    }
    if (room == null) {
      throw new Error("you must specify a room!");
    }
    if (room.indexOf("@") === -1) {
      room += this.defaultRoomComponent;
    }
    if (this.rooms[room] == null) {
      room_conn = new XMPPConnector();
      this.rooms[room] = room_conn;
      this.whenOnline((function(_this) {
        return function() {
          var on_bound_to_y;
          on_bound_to_y = function() {
            var room_subscription;
            room_conn.init({
              syncMethod: options.syncMethod,
              role: options.role,
              user_id: _this.xmpp.jid.resource
            });
            room_conn.room = room;
            room_conn.room_jid = room + "/" + _this.xmpp.jid.resource;
            room_conn.xmpp = _this.xmpp;
            room_conn.xmpp_handler = _this;
            room_subscription = new ltx.Element('presence', {
              to: room_conn.room_jid
            }).c('x', {}).up().c('role', {
              xmlns: "http://y.ninja/role"
            }).t(room_conn.role);
            return _this.xmpp.send(room_subscription);
          };
          if (room_conn.is_bound_to_y) {
            return on_bound_to_y();
          } else {
            return room_conn.on_bound_to_y = on_bound_to_y;
          }
        };
      })(this));
    }
    return this.rooms[room];
  };

  return XMPPHandler;

})();

XMPPConnector = (function() {
  function XMPPConnector() {}

  XMPPConnector.prototype.exit = function() {
    this.xmpp.send(new ltx.Element('presence', {
      to: this.room_jid,
      type: "unavailable"
    }));
    return delete this.xmpp_handler.rooms[this.room];
  };

  XMPPConnector.prototype.onStanza = function(stanza) {
    var res, sender, sender_role;
    if (this.debug) {
      console.log("RECEIVED: " + stanza.toString());
    }
    sender = extract_resource_from_jid(stanza.getAttribute("from"));
    if (stanza.is("presence")) {
      if (sender === this.user_id) {

      } else if (stanza.getAttribute("type") === "unavailable") {
        return this.userLeft(sender);
      } else {
        sender_role = stanza.getChild("role", "http://y.ninja/role").getText();
        return this.userJoined(sender, sender_role);
      }
    } else {
      if (sender === this.room_jid) {
        return true;
      }
      res = stanza.getChild("y", "http://y.ninja/connector-stanza");
      if (res != null) {
        return this.receiveMessage(sender, this.parseMessageFromXml(res));
      }
    }
  };

  XMPPConnector.prototype.send = function(user, json, type) {
    var m, message;
    if (type == null) {
      type = "message";
    }
    m = new ltx.Element("message", {
      to: user === "" ? this.room : this.room + "/" + user,
      type: type != null ? type : "chat"
    });
    message = this.encodeMessageToXml(m, json);
    if (this.debug) {
      console.log("SENDING: " + message.root().toString());
    }
    return this.xmpp.send(message.root());
  };

  XMPPConnector.prototype.broadcast = function(json) {
    return this.send("", json, "groupchat");
  };

  return XMPPConnector;

})();

if (module.exports != null) {
  module.exports = XMPPHandler;
}

if (typeof window !== "undefined" && window !== null) {
  if (typeof Y === "undefined" || Y === null) {
    throw new Error("You must import Y first!");
  } else {
    Y.XMPP = XMPPHandler;
  }
}
