(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var XMPP;

XMPP = require('./y-xmpp');

new Polymer('y-xmpp', {
  xmpp: new XMPP(),
  ready: function() {
    this.is_initialized = false;
    return this.initialize();
  },
  initialize: function() {
    var options;
    if (!this.is_initialized && (this.room != null)) {
      this.is_initialized = true;
      options = {};
      if (this.syncMethod != null) {
        options.syncMethod = this.syncMethod;
      }
      this.connector = this.xmpp.join(this.room, options);
      if (this.debug != null) {
        return this.connector.debug = this.debug;
      }
    }
  },
  roomChanged: function() {
    return this.initialize();
  }
});



},{"./y-xmpp":2}],2:[function(require,module,exports){
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



},{"ltx":25,"node-xmpp-client":29}],3:[function(require,module,exports){

},{}],4:[function(require,module,exports){
// http://wiki.commonjs.org/wiki/Unit_Testing/1.0
//
// THIS IS NOT TESTED NOR LIKELY TO WORK OUTSIDE V8!
//
// Originally from narwhal.js (http://narwhaljs.org)
// Copyright (c) 2009 Thomas Robinson <280north.com>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the 'Software'), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN
// ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
// WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// when used in node, this will actually load the util module we depend on
// versus loading the builtin util module as happens otherwise
// this is a bug in node module loading as far as I am concerned
var util = require('util/');

var pSlice = Array.prototype.slice;
var hasOwn = Object.prototype.hasOwnProperty;

// 1. The assert module provides functions that throw
// AssertionError's when particular conditions are not met. The
// assert module must conform to the following interface.

var assert = module.exports = ok;

// 2. The AssertionError is defined in assert.
// new assert.AssertionError({ message: message,
//                             actual: actual,
//                             expected: expected })

assert.AssertionError = function AssertionError(options) {
  this.name = 'AssertionError';
  this.actual = options.actual;
  this.expected = options.expected;
  this.operator = options.operator;
  if (options.message) {
    this.message = options.message;
    this.generatedMessage = false;
  } else {
    this.message = getMessage(this);
    this.generatedMessage = true;
  }
  var stackStartFunction = options.stackStartFunction || fail;

  if (Error.captureStackTrace) {
    Error.captureStackTrace(this, stackStartFunction);
  }
  else {
    // non v8 browsers so we can have a stacktrace
    var err = new Error();
    if (err.stack) {
      var out = err.stack;

      // try to strip useless frames
      var fn_name = stackStartFunction.name;
      var idx = out.indexOf('\n' + fn_name);
      if (idx >= 0) {
        // once we have located the function frame
        // we need to strip out everything before it (and its line)
        var next_line = out.indexOf('\n', idx + 1);
        out = out.substring(next_line + 1);
      }

      this.stack = out;
    }
  }
};

// assert.AssertionError instanceof Error
util.inherits(assert.AssertionError, Error);

function replacer(key, value) {
  if (util.isUndefined(value)) {
    return '' + value;
  }
  if (util.isNumber(value) && (isNaN(value) || !isFinite(value))) {
    return value.toString();
  }
  if (util.isFunction(value) || util.isRegExp(value)) {
    return value.toString();
  }
  return value;
}

function truncate(s, n) {
  if (util.isString(s)) {
    return s.length < n ? s : s.slice(0, n);
  } else {
    return s;
  }
}

function getMessage(self) {
  return truncate(JSON.stringify(self.actual, replacer), 128) + ' ' +
         self.operator + ' ' +
         truncate(JSON.stringify(self.expected, replacer), 128);
}

// At present only the three keys mentioned above are used and
// understood by the spec. Implementations or sub modules can pass
// other keys to the AssertionError's constructor - they will be
// ignored.

// 3. All of the following functions must throw an AssertionError
// when a corresponding condition is not met, with a message that
// may be undefined if not provided.  All assertion methods provide
// both the actual and expected values to the assertion error for
// display purposes.

function fail(actual, expected, message, operator, stackStartFunction) {
  throw new assert.AssertionError({
    message: message,
    actual: actual,
    expected: expected,
    operator: operator,
    stackStartFunction: stackStartFunction
  });
}

// EXTENSION! allows for well behaved errors defined elsewhere.
assert.fail = fail;

// 4. Pure assertion tests whether a value is truthy, as determined
// by !!guard.
// assert.ok(guard, message_opt);
// This statement is equivalent to assert.equal(true, !!guard,
// message_opt);. To test strictly for the value true, use
// assert.strictEqual(true, guard, message_opt);.

function ok(value, message) {
  if (!value) fail(value, true, message, '==', assert.ok);
}
assert.ok = ok;

// 5. The equality assertion tests shallow, coercive equality with
// ==.
// assert.equal(actual, expected, message_opt);

assert.equal = function equal(actual, expected, message) {
  if (actual != expected) fail(actual, expected, message, '==', assert.equal);
};

// 6. The non-equality assertion tests for whether two objects are not equal
// with != assert.notEqual(actual, expected, message_opt);

assert.notEqual = function notEqual(actual, expected, message) {
  if (actual == expected) {
    fail(actual, expected, message, '!=', assert.notEqual);
  }
};

// 7. The equivalence assertion tests a deep equality relation.
// assert.deepEqual(actual, expected, message_opt);

assert.deepEqual = function deepEqual(actual, expected, message) {
  if (!_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'deepEqual', assert.deepEqual);
  }
};

function _deepEqual(actual, expected) {
  // 7.1. All identical values are equivalent, as determined by ===.
  if (actual === expected) {
    return true;

  } else if (util.isBuffer(actual) && util.isBuffer(expected)) {
    if (actual.length != expected.length) return false;

    for (var i = 0; i < actual.length; i++) {
      if (actual[i] !== expected[i]) return false;
    }

    return true;

  // 7.2. If the expected value is a Date object, the actual value is
  // equivalent if it is also a Date object that refers to the same time.
  } else if (util.isDate(actual) && util.isDate(expected)) {
    return actual.getTime() === expected.getTime();

  // 7.3 If the expected value is a RegExp object, the actual value is
  // equivalent if it is also a RegExp object with the same source and
  // properties (`global`, `multiline`, `lastIndex`, `ignoreCase`).
  } else if (util.isRegExp(actual) && util.isRegExp(expected)) {
    return actual.source === expected.source &&
           actual.global === expected.global &&
           actual.multiline === expected.multiline &&
           actual.lastIndex === expected.lastIndex &&
           actual.ignoreCase === expected.ignoreCase;

  // 7.4. Other pairs that do not both pass typeof value == 'object',
  // equivalence is determined by ==.
  } else if (!util.isObject(actual) && !util.isObject(expected)) {
    return actual == expected;

  // 7.5 For all other Object pairs, including Array objects, equivalence is
  // determined by having the same number of owned properties (as verified
  // with Object.prototype.hasOwnProperty.call), the same set of keys
  // (although not necessarily the same order), equivalent values for every
  // corresponding key, and an identical 'prototype' property. Note: this
  // accounts for both named and indexed properties on Arrays.
  } else {
    return objEquiv(actual, expected);
  }
}

function isArguments(object) {
  return Object.prototype.toString.call(object) == '[object Arguments]';
}

function objEquiv(a, b) {
  if (util.isNullOrUndefined(a) || util.isNullOrUndefined(b))
    return false;
  // an identical 'prototype' property.
  if (a.prototype !== b.prototype) return false;
  //~~~I've managed to break Object.keys through screwy arguments passing.
  //   Converting to array solves the problem.
  if (isArguments(a)) {
    if (!isArguments(b)) {
      return false;
    }
    a = pSlice.call(a);
    b = pSlice.call(b);
    return _deepEqual(a, b);
  }
  try {
    var ka = objectKeys(a),
        kb = objectKeys(b),
        key, i;
  } catch (e) {//happens when one is a string literal and the other isn't
    return false;
  }
  // having the same number of owned properties (keys incorporates
  // hasOwnProperty)
  if (ka.length != kb.length)
    return false;
  //the same set of keys (although not necessarily the same order),
  ka.sort();
  kb.sort();
  //~~~cheap key test
  for (i = ka.length - 1; i >= 0; i--) {
    if (ka[i] != kb[i])
      return false;
  }
  //equivalent values for every corresponding key, and
  //~~~possibly expensive deep test
  for (i = ka.length - 1; i >= 0; i--) {
    key = ka[i];
    if (!_deepEqual(a[key], b[key])) return false;
  }
  return true;
}

// 8. The non-equivalence assertion tests for any deep inequality.
// assert.notDeepEqual(actual, expected, message_opt);

assert.notDeepEqual = function notDeepEqual(actual, expected, message) {
  if (_deepEqual(actual, expected)) {
    fail(actual, expected, message, 'notDeepEqual', assert.notDeepEqual);
  }
};

// 9. The strict equality assertion tests strict equality, as determined by ===.
// assert.strictEqual(actual, expected, message_opt);

assert.strictEqual = function strictEqual(actual, expected, message) {
  if (actual !== expected) {
    fail(actual, expected, message, '===', assert.strictEqual);
  }
};

// 10. The strict non-equality assertion tests for strict inequality, as
// determined by !==.  assert.notStrictEqual(actual, expected, message_opt);

assert.notStrictEqual = function notStrictEqual(actual, expected, message) {
  if (actual === expected) {
    fail(actual, expected, message, '!==', assert.notStrictEqual);
  }
};

function expectedException(actual, expected) {
  if (!actual || !expected) {
    return false;
  }

  if (Object.prototype.toString.call(expected) == '[object RegExp]') {
    return expected.test(actual);
  } else if (actual instanceof expected) {
    return true;
  } else if (expected.call({}, actual) === true) {
    return true;
  }

  return false;
}

function _throws(shouldThrow, block, expected, message) {
  var actual;

  if (util.isString(expected)) {
    message = expected;
    expected = null;
  }

  try {
    block();
  } catch (e) {
    actual = e;
  }

  message = (expected && expected.name ? ' (' + expected.name + ').' : '.') +
            (message ? ' ' + message : '.');

  if (shouldThrow && !actual) {
    fail(actual, expected, 'Missing expected exception' + message);
  }

  if (!shouldThrow && expectedException(actual, expected)) {
    fail(actual, expected, 'Got unwanted exception' + message);
  }

  if ((shouldThrow && actual && expected &&
      !expectedException(actual, expected)) || (!shouldThrow && actual)) {
    throw actual;
  }
}

// 11. Expected to throw an error:
// assert.throws(block, Error_opt, message_opt);

assert.throws = function(block, /*optional*/error, /*optional*/message) {
  _throws.apply(this, [true].concat(pSlice.call(arguments)));
};

// EXTENSION! This is annoying to write outside this module.
assert.doesNotThrow = function(block, /*optional*/message) {
  _throws.apply(this, [false].concat(pSlice.call(arguments)));
};

assert.ifError = function(err) { if (err) {throw err;}};

var objectKeys = Object.keys || function (obj) {
  var keys = [];
  for (var key in obj) {
    if (hasOwn.call(obj, key)) keys.push(key);
  }
  return keys;
};

},{"util/":22}],5:[function(require,module,exports){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <feross@feross.org> <http://feross.org>
 * @license  MIT
 */

var base64 = require('base64-js')
var ieee754 = require('ieee754')

exports.Buffer = Buffer
exports.SlowBuffer = Buffer
exports.INSPECT_MAX_BYTES = 50
Buffer.poolSize = 8192

/**
 * If `Buffer._useTypedArrays`:
 *   === true    Use Uint8Array implementation (fastest)
 *   === false   Use Object implementation (compatible down to IE6)
 */
Buffer._useTypedArrays = (function () {
  // Detect if browser supports Typed Arrays. Supported browsers are IE 10+, Firefox 4+,
  // Chrome 7+, Safari 5.1+, Opera 11.6+, iOS 4.2+. If the browser does not support adding
  // properties to `Uint8Array` instances, then that's the same as no `Uint8Array` support
  // because we need to be able to add all the node Buffer API methods. This is an issue
  // in Firefox 4-29. Now fixed: https://bugzilla.mozilla.org/show_bug.cgi?id=695438
  try {
    var buf = new ArrayBuffer(0)
    var arr = new Uint8Array(buf)
    arr.foo = function () { return 42 }
    return 42 === arr.foo() &&
        typeof arr.subarray === 'function' // Chrome 9-10 lack `subarray`
  } catch (e) {
    return false
  }
})()

/**
 * Class: Buffer
 * =============
 *
 * The Buffer constructor returns instances of `Uint8Array` that are augmented
 * with function properties for all the node `Buffer` API functions. We use
 * `Uint8Array` so that square bracket notation works as expected -- it returns
 * a single octet.
 *
 * By augmenting the instances, we can avoid modifying the `Uint8Array`
 * prototype.
 */
function Buffer (subject, encoding, noZero) {
  if (!(this instanceof Buffer))
    return new Buffer(subject, encoding, noZero)

  var type = typeof subject

  // Workaround: node's base64 implementation allows for non-padded strings
  // while base64-js does not.
  if (encoding === 'base64' && type === 'string') {
    subject = stringtrim(subject)
    while (subject.length % 4 !== 0) {
      subject = subject + '='
    }
  }

  // Find the length
  var length
  if (type === 'number')
    length = coerce(subject)
  else if (type === 'string')
    length = Buffer.byteLength(subject, encoding)
  else if (type === 'object')
    length = coerce(subject.length) // assume that object is array-like
  else
    throw new Error('First argument needs to be a number, array or string.')

  var buf
  if (Buffer._useTypedArrays) {
    // Preferred: Return an augmented `Uint8Array` instance for best performance
    buf = Buffer._augment(new Uint8Array(length))
  } else {
    // Fallback: Return THIS instance of Buffer (created by `new`)
    buf = this
    buf.length = length
    buf._isBuffer = true
  }

  var i
  if (Buffer._useTypedArrays && typeof subject.byteLength === 'number') {
    // Speed optimization -- use set if we're copying from a typed array
    buf._set(subject)
  } else if (isArrayish(subject)) {
    // Treat array-ish objects as a byte array
    for (i = 0; i < length; i++) {
      if (Buffer.isBuffer(subject))
        buf[i] = subject.readUInt8(i)
      else
        buf[i] = subject[i]
    }
  } else if (type === 'string') {
    buf.write(subject, 0, encoding)
  } else if (type === 'number' && !Buffer._useTypedArrays && !noZero) {
    for (i = 0; i < length; i++) {
      buf[i] = 0
    }
  }

  return buf
}

// STATIC METHODS
// ==============

Buffer.isEncoding = function (encoding) {
  switch (String(encoding).toLowerCase()) {
    case 'hex':
    case 'utf8':
    case 'utf-8':
    case 'ascii':
    case 'binary':
    case 'base64':
    case 'raw':
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return true
    default:
      return false
  }
}

Buffer.isBuffer = function (b) {
  return !!(b !== null && b !== undefined && b._isBuffer)
}

Buffer.byteLength = function (str, encoding) {
  var ret
  str = str + ''
  switch (encoding || 'utf8') {
    case 'hex':
      ret = str.length / 2
      break
    case 'utf8':
    case 'utf-8':
      ret = utf8ToBytes(str).length
      break
    case 'ascii':
    case 'binary':
    case 'raw':
      ret = str.length
      break
    case 'base64':
      ret = base64ToBytes(str).length
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = str.length * 2
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.concat = function (list, totalLength) {
  assert(isArray(list), 'Usage: Buffer.concat(list, [totalLength])\n' +
      'list should be an Array.')

  if (list.length === 0) {
    return new Buffer(0)
  } else if (list.length === 1) {
    return list[0]
  }

  var i
  if (typeof totalLength !== 'number') {
    totalLength = 0
    for (i = 0; i < list.length; i++) {
      totalLength += list[i].length
    }
  }

  var buf = new Buffer(totalLength)
  var pos = 0
  for (i = 0; i < list.length; i++) {
    var item = list[i]
    item.copy(buf, pos)
    pos += item.length
  }
  return buf
}

// BUFFER INSTANCE METHODS
// =======================

function _hexWrite (buf, string, offset, length) {
  offset = Number(offset) || 0
  var remaining = buf.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }

  // must be an even number of digits
  var strLen = string.length
  assert(strLen % 2 === 0, 'Invalid hex string')

  if (length > strLen / 2) {
    length = strLen / 2
  }
  for (var i = 0; i < length; i++) {
    var byte = parseInt(string.substr(i * 2, 2), 16)
    assert(!isNaN(byte), 'Invalid hex string')
    buf[offset + i] = byte
  }
  Buffer._charsWritten = i * 2
  return i
}

function _utf8Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf8ToBytes(string), buf, offset, length)
  return charsWritten
}

function _asciiWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(asciiToBytes(string), buf, offset, length)
  return charsWritten
}

function _binaryWrite (buf, string, offset, length) {
  return _asciiWrite(buf, string, offset, length)
}

function _base64Write (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(base64ToBytes(string), buf, offset, length)
  return charsWritten
}

function _utf16leWrite (buf, string, offset, length) {
  var charsWritten = Buffer._charsWritten =
    blitBuffer(utf16leToBytes(string), buf, offset, length)
  return charsWritten
}

Buffer.prototype.write = function (string, offset, length, encoding) {
  // Support both (string, offset, length, encoding)
  // and the legacy (string, encoding, offset, length)
  if (isFinite(offset)) {
    if (!isFinite(length)) {
      encoding = length
      length = undefined
    }
  } else {  // legacy
    var swap = encoding
    encoding = offset
    offset = length
    length = swap
  }

  offset = Number(offset) || 0
  var remaining = this.length - offset
  if (!length) {
    length = remaining
  } else {
    length = Number(length)
    if (length > remaining) {
      length = remaining
    }
  }
  encoding = String(encoding || 'utf8').toLowerCase()

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexWrite(this, string, offset, length)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Write(this, string, offset, length)
      break
    case 'ascii':
      ret = _asciiWrite(this, string, offset, length)
      break
    case 'binary':
      ret = _binaryWrite(this, string, offset, length)
      break
    case 'base64':
      ret = _base64Write(this, string, offset, length)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leWrite(this, string, offset, length)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toString = function (encoding, start, end) {
  var self = this

  encoding = String(encoding || 'utf8').toLowerCase()
  start = Number(start) || 0
  end = (end !== undefined)
    ? Number(end)
    : end = self.length

  // Fastpath empty strings
  if (end === start)
    return ''

  var ret
  switch (encoding) {
    case 'hex':
      ret = _hexSlice(self, start, end)
      break
    case 'utf8':
    case 'utf-8':
      ret = _utf8Slice(self, start, end)
      break
    case 'ascii':
      ret = _asciiSlice(self, start, end)
      break
    case 'binary':
      ret = _binarySlice(self, start, end)
      break
    case 'base64':
      ret = _base64Slice(self, start, end)
      break
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      ret = _utf16leSlice(self, start, end)
      break
    default:
      throw new Error('Unknown encoding')
  }
  return ret
}

Buffer.prototype.toJSON = function () {
  return {
    type: 'Buffer',
    data: Array.prototype.slice.call(this._arr || this, 0)
  }
}

// copy(targetBuffer, targetStart=0, sourceStart=0, sourceEnd=buffer.length)
Buffer.prototype.copy = function (target, target_start, start, end) {
  var source = this

  if (!start) start = 0
  if (!end && end !== 0) end = this.length
  if (!target_start) target_start = 0

  // Copy 0 bytes; we're done
  if (end === start) return
  if (target.length === 0 || source.length === 0) return

  // Fatal error conditions
  assert(end >= start, 'sourceEnd < sourceStart')
  assert(target_start >= 0 && target_start < target.length,
      'targetStart out of bounds')
  assert(start >= 0 && start < source.length, 'sourceStart out of bounds')
  assert(end >= 0 && end <= source.length, 'sourceEnd out of bounds')

  // Are we oob?
  if (end > this.length)
    end = this.length
  if (target.length - target_start < end - start)
    end = target.length - target_start + start

  var len = end - start

  if (len < 100 || !Buffer._useTypedArrays) {
    for (var i = 0; i < len; i++)
      target[i + target_start] = this[i + start]
  } else {
    target._set(this.subarray(start, start + len), target_start)
  }
}

function _base64Slice (buf, start, end) {
  if (start === 0 && end === buf.length) {
    return base64.fromByteArray(buf)
  } else {
    return base64.fromByteArray(buf.slice(start, end))
  }
}

function _utf8Slice (buf, start, end) {
  var res = ''
  var tmp = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++) {
    if (buf[i] <= 0x7F) {
      res += decodeUtf8Char(tmp) + String.fromCharCode(buf[i])
      tmp = ''
    } else {
      tmp += '%' + buf[i].toString(16)
    }
  }

  return res + decodeUtf8Char(tmp)
}

function _asciiSlice (buf, start, end) {
  var ret = ''
  end = Math.min(buf.length, end)

  for (var i = start; i < end; i++)
    ret += String.fromCharCode(buf[i])
  return ret
}

function _binarySlice (buf, start, end) {
  return _asciiSlice(buf, start, end)
}

function _hexSlice (buf, start, end) {
  var len = buf.length

  if (!start || start < 0) start = 0
  if (!end || end < 0 || end > len) end = len

  var out = ''
  for (var i = start; i < end; i++) {
    out += toHex(buf[i])
  }
  return out
}

function _utf16leSlice (buf, start, end) {
  var bytes = buf.slice(start, end)
  var res = ''
  for (var i = 0; i < bytes.length; i += 2) {
    res += String.fromCharCode(bytes[i] + bytes[i+1] * 256)
  }
  return res
}

Buffer.prototype.slice = function (start, end) {
  var len = this.length
  start = clamp(start, len, 0)
  end = clamp(end, len, len)

  if (Buffer._useTypedArrays) {
    return Buffer._augment(this.subarray(start, end))
  } else {
    var sliceLen = end - start
    var newBuf = new Buffer(sliceLen, undefined, true)
    for (var i = 0; i < sliceLen; i++) {
      newBuf[i] = this[i + start]
    }
    return newBuf
  }
}

// `get` will be removed in Node 0.13+
Buffer.prototype.get = function (offset) {
  console.log('.get() is deprecated. Access using array indexes instead.')
  return this.readUInt8(offset)
}

// `set` will be removed in Node 0.13+
Buffer.prototype.set = function (v, offset) {
  console.log('.set() is deprecated. Access using array indexes instead.')
  return this.writeUInt8(v, offset)
}

Buffer.prototype.readUInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  return this[offset]
}

function _readUInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    val = buf[offset]
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
  } else {
    val = buf[offset] << 8
    if (offset + 1 < len)
      val |= buf[offset + 1]
  }
  return val
}

Buffer.prototype.readUInt16LE = function (offset, noAssert) {
  return _readUInt16(this, offset, true, noAssert)
}

Buffer.prototype.readUInt16BE = function (offset, noAssert) {
  return _readUInt16(this, offset, false, noAssert)
}

function _readUInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val
  if (littleEndian) {
    if (offset + 2 < len)
      val = buf[offset + 2] << 16
    if (offset + 1 < len)
      val |= buf[offset + 1] << 8
    val |= buf[offset]
    if (offset + 3 < len)
      val = val + (buf[offset + 3] << 24 >>> 0)
  } else {
    if (offset + 1 < len)
      val = buf[offset + 1] << 16
    if (offset + 2 < len)
      val |= buf[offset + 2] << 8
    if (offset + 3 < len)
      val |= buf[offset + 3]
    val = val + (buf[offset] << 24 >>> 0)
  }
  return val
}

Buffer.prototype.readUInt32LE = function (offset, noAssert) {
  return _readUInt32(this, offset, true, noAssert)
}

Buffer.prototype.readUInt32BE = function (offset, noAssert) {
  return _readUInt32(this, offset, false, noAssert)
}

Buffer.prototype.readInt8 = function (offset, noAssert) {
  if (!noAssert) {
    assert(offset !== undefined && offset !== null,
        'missing offset')
    assert(offset < this.length, 'Trying to read beyond buffer length')
  }

  if (offset >= this.length)
    return

  var neg = this[offset] & 0x80
  if (neg)
    return (0xff - this[offset] + 1) * -1
  else
    return this[offset]
}

function _readInt16 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt16(buf, offset, littleEndian, true)
  var neg = val & 0x8000
  if (neg)
    return (0xffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt16LE = function (offset, noAssert) {
  return _readInt16(this, offset, true, noAssert)
}

Buffer.prototype.readInt16BE = function (offset, noAssert) {
  return _readInt16(this, offset, false, noAssert)
}

function _readInt32 (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  var len = buf.length
  if (offset >= len)
    return

  var val = _readUInt32(buf, offset, littleEndian, true)
  var neg = val & 0x80000000
  if (neg)
    return (0xffffffff - val + 1) * -1
  else
    return val
}

Buffer.prototype.readInt32LE = function (offset, noAssert) {
  return _readInt32(this, offset, true, noAssert)
}

Buffer.prototype.readInt32BE = function (offset, noAssert) {
  return _readInt32(this, offset, false, noAssert)
}

function _readFloat (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 3 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 23, 4)
}

Buffer.prototype.readFloatLE = function (offset, noAssert) {
  return _readFloat(this, offset, true, noAssert)
}

Buffer.prototype.readFloatBE = function (offset, noAssert) {
  return _readFloat(this, offset, false, noAssert)
}

function _readDouble (buf, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset + 7 < buf.length, 'Trying to read beyond buffer length')
  }

  return ieee754.read(buf, offset, littleEndian, 52, 8)
}

Buffer.prototype.readDoubleLE = function (offset, noAssert) {
  return _readDouble(this, offset, true, noAssert)
}

Buffer.prototype.readDoubleBE = function (offset, noAssert) {
  return _readDouble(this, offset, false, noAssert)
}

Buffer.prototype.writeUInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'trying to write beyond buffer length')
    verifuint(value, 0xff)
  }

  if (offset >= this.length) return

  this[offset] = value
}

function _writeUInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 2); i < j; i++) {
    buf[offset + i] =
        (value & (0xff << (8 * (littleEndian ? i : 1 - i)))) >>>
            (littleEndian ? i : 1 - i) * 8
  }
}

Buffer.prototype.writeUInt16LE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt16BE = function (value, offset, noAssert) {
  _writeUInt16(this, value, offset, false, noAssert)
}

function _writeUInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'trying to write beyond buffer length')
    verifuint(value, 0xffffffff)
  }

  var len = buf.length
  if (offset >= len)
    return

  for (var i = 0, j = Math.min(len - offset, 4); i < j; i++) {
    buf[offset + i] =
        (value >>> (littleEndian ? i : 3 - i) * 8) & 0xff
  }
}

Buffer.prototype.writeUInt32LE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeUInt32BE = function (value, offset, noAssert) {
  _writeUInt32(this, value, offset, false, noAssert)
}

Buffer.prototype.writeInt8 = function (value, offset, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset < this.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7f, -0x80)
  }

  if (offset >= this.length)
    return

  if (value >= 0)
    this.writeUInt8(value, offset, noAssert)
  else
    this.writeUInt8(0xff + value + 1, offset, noAssert)
}

function _writeInt16 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 1 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fff, -0x8000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt16(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt16(buf, 0xffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt16LE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt16BE = function (value, offset, noAssert) {
  _writeInt16(this, value, offset, false, noAssert)
}

function _writeInt32 (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifsint(value, 0x7fffffff, -0x80000000)
  }

  var len = buf.length
  if (offset >= len)
    return

  if (value >= 0)
    _writeUInt32(buf, value, offset, littleEndian, noAssert)
  else
    _writeUInt32(buf, 0xffffffff + value + 1, offset, littleEndian, noAssert)
}

Buffer.prototype.writeInt32LE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, true, noAssert)
}

Buffer.prototype.writeInt32BE = function (value, offset, noAssert) {
  _writeInt32(this, value, offset, false, noAssert)
}

function _writeFloat (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 3 < buf.length, 'Trying to write beyond buffer length')
    verifIEEE754(value, 3.4028234663852886e+38, -3.4028234663852886e+38)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 23, 4)
}

Buffer.prototype.writeFloatLE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, true, noAssert)
}

Buffer.prototype.writeFloatBE = function (value, offset, noAssert) {
  _writeFloat(this, value, offset, false, noAssert)
}

function _writeDouble (buf, value, offset, littleEndian, noAssert) {
  if (!noAssert) {
    assert(value !== undefined && value !== null, 'missing value')
    assert(typeof littleEndian === 'boolean', 'missing or invalid endian')
    assert(offset !== undefined && offset !== null, 'missing offset')
    assert(offset + 7 < buf.length,
        'Trying to write beyond buffer length')
    verifIEEE754(value, 1.7976931348623157E+308, -1.7976931348623157E+308)
  }

  var len = buf.length
  if (offset >= len)
    return

  ieee754.write(buf, value, offset, littleEndian, 52, 8)
}

Buffer.prototype.writeDoubleLE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, true, noAssert)
}

Buffer.prototype.writeDoubleBE = function (value, offset, noAssert) {
  _writeDouble(this, value, offset, false, noAssert)
}

// fill(value, start=0, end=buffer.length)
Buffer.prototype.fill = function (value, start, end) {
  if (!value) value = 0
  if (!start) start = 0
  if (!end) end = this.length

  if (typeof value === 'string') {
    value = value.charCodeAt(0)
  }

  assert(typeof value === 'number' && !isNaN(value), 'value is not a number')
  assert(end >= start, 'end < start')

  // Fill 0 bytes; we're done
  if (end === start) return
  if (this.length === 0) return

  assert(start >= 0 && start < this.length, 'start out of bounds')
  assert(end >= 0 && end <= this.length, 'end out of bounds')

  for (var i = start; i < end; i++) {
    this[i] = value
  }
}

Buffer.prototype.inspect = function () {
  var out = []
  var len = this.length
  for (var i = 0; i < len; i++) {
    out[i] = toHex(this[i])
    if (i === exports.INSPECT_MAX_BYTES) {
      out[i + 1] = '...'
      break
    }
  }
  return '<Buffer ' + out.join(' ') + '>'
}

/**
 * Creates a new `ArrayBuffer` with the *copied* memory of the buffer instance.
 * Added in Node 0.12. Only available in browsers that support ArrayBuffer.
 */
Buffer.prototype.toArrayBuffer = function () {
  if (typeof Uint8Array !== 'undefined') {
    if (Buffer._useTypedArrays) {
      return (new Buffer(this)).buffer
    } else {
      var buf = new Uint8Array(this.length)
      for (var i = 0, len = buf.length; i < len; i += 1)
        buf[i] = this[i]
      return buf.buffer
    }
  } else {
    throw new Error('Buffer.toArrayBuffer not supported in this browser')
  }
}

// HELPER FUNCTIONS
// ================

function stringtrim (str) {
  if (str.trim) return str.trim()
  return str.replace(/^\s+|\s+$/g, '')
}

var BP = Buffer.prototype

/**
 * Augment a Uint8Array *instance* (not the Uint8Array class!) with Buffer methods
 */
Buffer._augment = function (arr) {
  arr._isBuffer = true

  // save reference to original Uint8Array get/set methods before overwriting
  arr._get = arr.get
  arr._set = arr.set

  // deprecated, will be removed in node 0.13+
  arr.get = BP.get
  arr.set = BP.set

  arr.write = BP.write
  arr.toString = BP.toString
  arr.toLocaleString = BP.toString
  arr.toJSON = BP.toJSON
  arr.copy = BP.copy
  arr.slice = BP.slice
  arr.readUInt8 = BP.readUInt8
  arr.readUInt16LE = BP.readUInt16LE
  arr.readUInt16BE = BP.readUInt16BE
  arr.readUInt32LE = BP.readUInt32LE
  arr.readUInt32BE = BP.readUInt32BE
  arr.readInt8 = BP.readInt8
  arr.readInt16LE = BP.readInt16LE
  arr.readInt16BE = BP.readInt16BE
  arr.readInt32LE = BP.readInt32LE
  arr.readInt32BE = BP.readInt32BE
  arr.readFloatLE = BP.readFloatLE
  arr.readFloatBE = BP.readFloatBE
  arr.readDoubleLE = BP.readDoubleLE
  arr.readDoubleBE = BP.readDoubleBE
  arr.writeUInt8 = BP.writeUInt8
  arr.writeUInt16LE = BP.writeUInt16LE
  arr.writeUInt16BE = BP.writeUInt16BE
  arr.writeUInt32LE = BP.writeUInt32LE
  arr.writeUInt32BE = BP.writeUInt32BE
  arr.writeInt8 = BP.writeInt8
  arr.writeInt16LE = BP.writeInt16LE
  arr.writeInt16BE = BP.writeInt16BE
  arr.writeInt32LE = BP.writeInt32LE
  arr.writeInt32BE = BP.writeInt32BE
  arr.writeFloatLE = BP.writeFloatLE
  arr.writeFloatBE = BP.writeFloatBE
  arr.writeDoubleLE = BP.writeDoubleLE
  arr.writeDoubleBE = BP.writeDoubleBE
  arr.fill = BP.fill
  arr.inspect = BP.inspect
  arr.toArrayBuffer = BP.toArrayBuffer

  return arr
}

// slice(start, end)
function clamp (index, len, defaultValue) {
  if (typeof index !== 'number') return defaultValue
  index = ~~index;  // Coerce to integer.
  if (index >= len) return len
  if (index >= 0) return index
  index += len
  if (index >= 0) return index
  return 0
}

function coerce (length) {
  // Coerce length to a number (possibly NaN), round up
  // in case it's fractional (e.g. 123.456) then do a
  // double negate to coerce a NaN to 0. Easy, right?
  length = ~~Math.ceil(+length)
  return length < 0 ? 0 : length
}

function isArray (subject) {
  return (Array.isArray || function (subject) {
    return Object.prototype.toString.call(subject) === '[object Array]'
  })(subject)
}

function isArrayish (subject) {
  return isArray(subject) || Buffer.isBuffer(subject) ||
      subject && typeof subject === 'object' &&
      typeof subject.length === 'number'
}

function toHex (n) {
  if (n < 16) return '0' + n.toString(16)
  return n.toString(16)
}

function utf8ToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    var b = str.charCodeAt(i)
    if (b <= 0x7F)
      byteArray.push(str.charCodeAt(i))
    else {
      var start = i
      if (b >= 0xD800 && b <= 0xDFFF) i++
      var h = encodeURIComponent(str.slice(start, i+1)).substr(1).split('%')
      for (var j = 0; j < h.length; j++)
        byteArray.push(parseInt(h[j], 16))
    }
  }
  return byteArray
}

function asciiToBytes (str) {
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    // Node's code seems to be doing this and not & 0x7F..
    byteArray.push(str.charCodeAt(i) & 0xFF)
  }
  return byteArray
}

function utf16leToBytes (str) {
  var c, hi, lo
  var byteArray = []
  for (var i = 0; i < str.length; i++) {
    c = str.charCodeAt(i)
    hi = c >> 8
    lo = c % 256
    byteArray.push(lo)
    byteArray.push(hi)
  }

  return byteArray
}

function base64ToBytes (str) {
  return base64.toByteArray(str)
}

function blitBuffer (src, dst, offset, length) {
  var pos
  for (var i = 0; i < length; i++) {
    if ((i + offset >= dst.length) || (i >= src.length))
      break
    dst[i + offset] = src[i]
  }
  return i
}

function decodeUtf8Char (str) {
  try {
    return decodeURIComponent(str)
  } catch (err) {
    return String.fromCharCode(0xFFFD) // UTF 8 invalid char
  }
}

/*
 * We have to make sure that the value is a valid integer. This means that it
 * is non-negative. It has no fractional component and that it does not
 * exceed the maximum allowed value.
 */
function verifuint (value, max) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value >= 0, 'specified a negative value for writing an unsigned value')
  assert(value <= max, 'value is larger than maximum value for type')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifsint (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
  assert(Math.floor(value) === value, 'value has a fractional component')
}

function verifIEEE754 (value, max, min) {
  assert(typeof value === 'number', 'cannot write a non-number as a number')
  assert(value <= max, 'value larger than maximum allowed value')
  assert(value >= min, 'value smaller than minimum allowed value')
}

function assert (test, message) {
  if (!test) throw new Error(message || 'Failed assertion')
}

},{"base64-js":6,"ieee754":7}],6:[function(require,module,exports){
var lookup = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

;(function (exports) {
	'use strict';

  var Arr = (typeof Uint8Array !== 'undefined')
    ? Uint8Array
    : Array

	var PLUS   = '+'.charCodeAt(0)
	var SLASH  = '/'.charCodeAt(0)
	var NUMBER = '0'.charCodeAt(0)
	var LOWER  = 'a'.charCodeAt(0)
	var UPPER  = 'A'.charCodeAt(0)
	var PLUS_URL_SAFE = '-'.charCodeAt(0)
	var SLASH_URL_SAFE = '_'.charCodeAt(0)

	function decode (elt) {
		var code = elt.charCodeAt(0)
		if (code === PLUS ||
		    code === PLUS_URL_SAFE)
			return 62 // '+'
		if (code === SLASH ||
		    code === SLASH_URL_SAFE)
			return 63 // '/'
		if (code < NUMBER)
			return -1 //no match
		if (code < NUMBER + 10)
			return code - NUMBER + 26 + 26
		if (code < UPPER + 26)
			return code - UPPER
		if (code < LOWER + 26)
			return code - LOWER + 26
	}

	function b64ToByteArray (b64) {
		var i, j, l, tmp, placeHolders, arr

		if (b64.length % 4 > 0) {
			throw new Error('Invalid string. Length must be a multiple of 4')
		}

		// the number of equal signs (place holders)
		// if there are two placeholders, than the two characters before it
		// represent one byte
		// if there is only one, then the three characters before it represent 2 bytes
		// this is just a cheap hack to not do indexOf twice
		var len = b64.length
		placeHolders = '=' === b64.charAt(len - 2) ? 2 : '=' === b64.charAt(len - 1) ? 1 : 0

		// base64 is 4/3 + up to two characters of the original data
		arr = new Arr(b64.length * 3 / 4 - placeHolders)

		// if there are placeholders, only get up to the last complete 4 chars
		l = placeHolders > 0 ? b64.length - 4 : b64.length

		var L = 0

		function push (v) {
			arr[L++] = v
		}

		for (i = 0, j = 0; i < l; i += 4, j += 3) {
			tmp = (decode(b64.charAt(i)) << 18) | (decode(b64.charAt(i + 1)) << 12) | (decode(b64.charAt(i + 2)) << 6) | decode(b64.charAt(i + 3))
			push((tmp & 0xFF0000) >> 16)
			push((tmp & 0xFF00) >> 8)
			push(tmp & 0xFF)
		}

		if (placeHolders === 2) {
			tmp = (decode(b64.charAt(i)) << 2) | (decode(b64.charAt(i + 1)) >> 4)
			push(tmp & 0xFF)
		} else if (placeHolders === 1) {
			tmp = (decode(b64.charAt(i)) << 10) | (decode(b64.charAt(i + 1)) << 4) | (decode(b64.charAt(i + 2)) >> 2)
			push((tmp >> 8) & 0xFF)
			push(tmp & 0xFF)
		}

		return arr
	}

	function uint8ToBase64 (uint8) {
		var i,
			extraBytes = uint8.length % 3, // if we have 1 byte left, pad 2 bytes
			output = "",
			temp, length

		function encode (num) {
			return lookup.charAt(num)
		}

		function tripletToBase64 (num) {
			return encode(num >> 18 & 0x3F) + encode(num >> 12 & 0x3F) + encode(num >> 6 & 0x3F) + encode(num & 0x3F)
		}

		// go through the array every three bytes, we'll deal with trailing stuff later
		for (i = 0, length = uint8.length - extraBytes; i < length; i += 3) {
			temp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])
			output += tripletToBase64(temp)
		}

		// pad the end with zeros, but make sure to not forget the extra bytes
		switch (extraBytes) {
			case 1:
				temp = uint8[uint8.length - 1]
				output += encode(temp >> 2)
				output += encode((temp << 4) & 0x3F)
				output += '=='
				break
			case 2:
				temp = (uint8[uint8.length - 2] << 8) + (uint8[uint8.length - 1])
				output += encode(temp >> 10)
				output += encode((temp >> 4) & 0x3F)
				output += encode((temp << 2) & 0x3F)
				output += '='
				break
		}

		return output
	}

	exports.toByteArray = b64ToByteArray
	exports.fromByteArray = uint8ToBase64
}(typeof exports === 'undefined' ? (this.base64js = {}) : exports))

},{}],7:[function(require,module,exports){
exports.read = function(buffer, offset, isLE, mLen, nBytes) {
  var e, m,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      nBits = -7,
      i = isLE ? (nBytes - 1) : 0,
      d = isLE ? -1 : 1,
      s = buffer[offset + i];

  i += d;

  e = s & ((1 << (-nBits)) - 1);
  s >>= (-nBits);
  nBits += eLen;
  for (; nBits > 0; e = e * 256 + buffer[offset + i], i += d, nBits -= 8);

  m = e & ((1 << (-nBits)) - 1);
  e >>= (-nBits);
  nBits += mLen;
  for (; nBits > 0; m = m * 256 + buffer[offset + i], i += d, nBits -= 8);

  if (e === 0) {
    e = 1 - eBias;
  } else if (e === eMax) {
    return m ? NaN : ((s ? -1 : 1) * Infinity);
  } else {
    m = m + Math.pow(2, mLen);
    e = e - eBias;
  }
  return (s ? -1 : 1) * m * Math.pow(2, e - mLen);
};

exports.write = function(buffer, value, offset, isLE, mLen, nBytes) {
  var e, m, c,
      eLen = nBytes * 8 - mLen - 1,
      eMax = (1 << eLen) - 1,
      eBias = eMax >> 1,
      rt = (mLen === 23 ? Math.pow(2, -24) - Math.pow(2, -77) : 0),
      i = isLE ? 0 : (nBytes - 1),
      d = isLE ? 1 : -1,
      s = value < 0 || (value === 0 && 1 / value < 0) ? 1 : 0;

  value = Math.abs(value);

  if (isNaN(value) || value === Infinity) {
    m = isNaN(value) ? 1 : 0;
    e = eMax;
  } else {
    e = Math.floor(Math.log(value) / Math.LN2);
    if (value * (c = Math.pow(2, -e)) < 1) {
      e--;
      c *= 2;
    }
    if (e + eBias >= 1) {
      value += rt / c;
    } else {
      value += rt * Math.pow(2, 1 - eBias);
    }
    if (value * c >= 2) {
      e++;
      c /= 2;
    }

    if (e + eBias >= eMax) {
      m = 0;
      e = eMax;
    } else if (e + eBias >= 1) {
      m = (value * c - 1) * Math.pow(2, mLen);
      e = e + eBias;
    } else {
      m = value * Math.pow(2, eBias - 1) * Math.pow(2, mLen);
      e = 0;
    }
  }

  for (; mLen >= 8; buffer[offset + i] = m & 0xff, i += d, m /= 256, mLen -= 8);

  e = (e << mLen) | m;
  eLen += mLen;
  for (; eLen > 0; buffer[offset + i] = e & 0xff, i += d, e /= 256, eLen -= 8);

  buffer[offset + i - d] |= s * 128;
};

},{}],8:[function(require,module,exports){
var Buffer = require('buffer').Buffer;
var intSize = 4;
var zeroBuffer = new Buffer(intSize); zeroBuffer.fill(0);
var chrsz = 8;

function toArray(buf, bigEndian) {
  if ((buf.length % intSize) !== 0) {
    var len = buf.length + (intSize - (buf.length % intSize));
    buf = Buffer.concat([buf, zeroBuffer], len);
  }

  var arr = [];
  var fn = bigEndian ? buf.readInt32BE : buf.readInt32LE;
  for (var i = 0; i < buf.length; i += intSize) {
    arr.push(fn.call(buf, i));
  }
  return arr;
}

function toBuffer(arr, size, bigEndian) {
  var buf = new Buffer(size);
  var fn = bigEndian ? buf.writeInt32BE : buf.writeInt32LE;
  for (var i = 0; i < arr.length; i++) {
    fn.call(buf, arr[i], i * 4, true);
  }
  return buf;
}

function hash(buf, fn, hashSize, bigEndian) {
  if (!Buffer.isBuffer(buf)) buf = new Buffer(buf);
  var arr = fn(toArray(buf, bigEndian), buf.length * chrsz);
  return toBuffer(arr, hashSize, bigEndian);
}

module.exports = { hash: hash };

},{"buffer":5}],9:[function(require,module,exports){
var Buffer = require('buffer').Buffer
var sha = require('./sha')
var sha256 = require('./sha256')
var rng = require('./rng')
var md5 = require('./md5')

var algorithms = {
  sha1: sha,
  sha256: sha256,
  md5: md5
}

var blocksize = 64
var zeroBuffer = new Buffer(blocksize); zeroBuffer.fill(0)
function hmac(fn, key, data) {
  if(!Buffer.isBuffer(key)) key = new Buffer(key)
  if(!Buffer.isBuffer(data)) data = new Buffer(data)

  if(key.length > blocksize) {
    key = fn(key)
  } else if(key.length < blocksize) {
    key = Buffer.concat([key, zeroBuffer], blocksize)
  }

  var ipad = new Buffer(blocksize), opad = new Buffer(blocksize)
  for(var i = 0; i < blocksize; i++) {
    ipad[i] = key[i] ^ 0x36
    opad[i] = key[i] ^ 0x5C
  }

  var hash = fn(Buffer.concat([ipad, data]))
  return fn(Buffer.concat([opad, hash]))
}

function hash(alg, key) {
  alg = alg || 'sha1'
  var fn = algorithms[alg]
  var bufs = []
  var length = 0
  if(!fn) error('algorithm:', alg, 'is not yet supported')
  return {
    update: function (data) {
      if(!Buffer.isBuffer(data)) data = new Buffer(data)
        
      bufs.push(data)
      length += data.length
      return this
    },
    digest: function (enc) {
      var buf = Buffer.concat(bufs)
      var r = key ? hmac(fn, key, buf) : fn(buf)
      bufs = null
      return enc ? r.toString(enc) : r
    }
  }
}

function error () {
  var m = [].slice.call(arguments).join(' ')
  throw new Error([
    m,
    'we accept pull requests',
    'http://github.com/dominictarr/crypto-browserify'
    ].join('\n'))
}

exports.createHash = function (alg) { return hash(alg) }
exports.createHmac = function (alg, key) { return hash(alg, key) }
exports.randomBytes = function(size, callback) {
  if (callback && callback.call) {
    try {
      callback.call(this, undefined, new Buffer(rng(size)))
    } catch (err) { callback(err) }
  } else {
    return new Buffer(rng(size))
  }
}

function each(a, f) {
  for(var i in a)
    f(a[i], i)
}

// the least I can do is make error messages for the rest of the node.js/crypto api.
each(['createCredentials'
, 'createCipher'
, 'createCipheriv'
, 'createDecipher'
, 'createDecipheriv'
, 'createSign'
, 'createVerify'
, 'createDiffieHellman'
, 'pbkdf2'], function (name) {
  exports[name] = function () {
    error('sorry,', name, 'is not implemented yet')
  }
})

},{"./md5":10,"./rng":11,"./sha":12,"./sha256":13,"buffer":5}],10:[function(require,module,exports){
/*
 * A JavaScript implementation of the RSA Data Security, Inc. MD5 Message
 * Digest Algorithm, as defined in RFC 1321.
 * Version 2.1 Copyright (C) Paul Johnston 1999 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for more info.
 */

var helpers = require('./helpers');

/*
 * Perform a simple self-test to see if the VM is working
 */
function md5_vm_test()
{
  return hex_md5("abc") == "900150983cd24fb0d6963f7d28e17f72";
}

/*
 * Calculate the MD5 of an array of little-endian words, and a bit length
 */
function core_md5(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << ((len) % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;

    a = md5_ff(a, b, c, d, x[i+ 0], 7 , -680876936);
    d = md5_ff(d, a, b, c, x[i+ 1], 12, -389564586);
    c = md5_ff(c, d, a, b, x[i+ 2], 17,  606105819);
    b = md5_ff(b, c, d, a, x[i+ 3], 22, -1044525330);
    a = md5_ff(a, b, c, d, x[i+ 4], 7 , -176418897);
    d = md5_ff(d, a, b, c, x[i+ 5], 12,  1200080426);
    c = md5_ff(c, d, a, b, x[i+ 6], 17, -1473231341);
    b = md5_ff(b, c, d, a, x[i+ 7], 22, -45705983);
    a = md5_ff(a, b, c, d, x[i+ 8], 7 ,  1770035416);
    d = md5_ff(d, a, b, c, x[i+ 9], 12, -1958414417);
    c = md5_ff(c, d, a, b, x[i+10], 17, -42063);
    b = md5_ff(b, c, d, a, x[i+11], 22, -1990404162);
    a = md5_ff(a, b, c, d, x[i+12], 7 ,  1804603682);
    d = md5_ff(d, a, b, c, x[i+13], 12, -40341101);
    c = md5_ff(c, d, a, b, x[i+14], 17, -1502002290);
    b = md5_ff(b, c, d, a, x[i+15], 22,  1236535329);

    a = md5_gg(a, b, c, d, x[i+ 1], 5 , -165796510);
    d = md5_gg(d, a, b, c, x[i+ 6], 9 , -1069501632);
    c = md5_gg(c, d, a, b, x[i+11], 14,  643717713);
    b = md5_gg(b, c, d, a, x[i+ 0], 20, -373897302);
    a = md5_gg(a, b, c, d, x[i+ 5], 5 , -701558691);
    d = md5_gg(d, a, b, c, x[i+10], 9 ,  38016083);
    c = md5_gg(c, d, a, b, x[i+15], 14, -660478335);
    b = md5_gg(b, c, d, a, x[i+ 4], 20, -405537848);
    a = md5_gg(a, b, c, d, x[i+ 9], 5 ,  568446438);
    d = md5_gg(d, a, b, c, x[i+14], 9 , -1019803690);
    c = md5_gg(c, d, a, b, x[i+ 3], 14, -187363961);
    b = md5_gg(b, c, d, a, x[i+ 8], 20,  1163531501);
    a = md5_gg(a, b, c, d, x[i+13], 5 , -1444681467);
    d = md5_gg(d, a, b, c, x[i+ 2], 9 , -51403784);
    c = md5_gg(c, d, a, b, x[i+ 7], 14,  1735328473);
    b = md5_gg(b, c, d, a, x[i+12], 20, -1926607734);

    a = md5_hh(a, b, c, d, x[i+ 5], 4 , -378558);
    d = md5_hh(d, a, b, c, x[i+ 8], 11, -2022574463);
    c = md5_hh(c, d, a, b, x[i+11], 16,  1839030562);
    b = md5_hh(b, c, d, a, x[i+14], 23, -35309556);
    a = md5_hh(a, b, c, d, x[i+ 1], 4 , -1530992060);
    d = md5_hh(d, a, b, c, x[i+ 4], 11,  1272893353);
    c = md5_hh(c, d, a, b, x[i+ 7], 16, -155497632);
    b = md5_hh(b, c, d, a, x[i+10], 23, -1094730640);
    a = md5_hh(a, b, c, d, x[i+13], 4 ,  681279174);
    d = md5_hh(d, a, b, c, x[i+ 0], 11, -358537222);
    c = md5_hh(c, d, a, b, x[i+ 3], 16, -722521979);
    b = md5_hh(b, c, d, a, x[i+ 6], 23,  76029189);
    a = md5_hh(a, b, c, d, x[i+ 9], 4 , -640364487);
    d = md5_hh(d, a, b, c, x[i+12], 11, -421815835);
    c = md5_hh(c, d, a, b, x[i+15], 16,  530742520);
    b = md5_hh(b, c, d, a, x[i+ 2], 23, -995338651);

    a = md5_ii(a, b, c, d, x[i+ 0], 6 , -198630844);
    d = md5_ii(d, a, b, c, x[i+ 7], 10,  1126891415);
    c = md5_ii(c, d, a, b, x[i+14], 15, -1416354905);
    b = md5_ii(b, c, d, a, x[i+ 5], 21, -57434055);
    a = md5_ii(a, b, c, d, x[i+12], 6 ,  1700485571);
    d = md5_ii(d, a, b, c, x[i+ 3], 10, -1894986606);
    c = md5_ii(c, d, a, b, x[i+10], 15, -1051523);
    b = md5_ii(b, c, d, a, x[i+ 1], 21, -2054922799);
    a = md5_ii(a, b, c, d, x[i+ 8], 6 ,  1873313359);
    d = md5_ii(d, a, b, c, x[i+15], 10, -30611744);
    c = md5_ii(c, d, a, b, x[i+ 6], 15, -1560198380);
    b = md5_ii(b, c, d, a, x[i+13], 21,  1309151649);
    a = md5_ii(a, b, c, d, x[i+ 4], 6 , -145523070);
    d = md5_ii(d, a, b, c, x[i+11], 10, -1120210379);
    c = md5_ii(c, d, a, b, x[i+ 2], 15,  718787259);
    b = md5_ii(b, c, d, a, x[i+ 9], 21, -343485551);

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
  }
  return Array(a, b, c, d);

}

/*
 * These functions implement the four basic operations the algorithm uses.
 */
function md5_cmn(q, a, b, x, s, t)
{
  return safe_add(bit_rol(safe_add(safe_add(a, q), safe_add(x, t)), s),b);
}
function md5_ff(a, b, c, d, x, s, t)
{
  return md5_cmn((b & c) | ((~b) & d), a, b, x, s, t);
}
function md5_gg(a, b, c, d, x, s, t)
{
  return md5_cmn((b & d) | (c & (~d)), a, b, x, s, t);
}
function md5_hh(a, b, c, d, x, s, t)
{
  return md5_cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5_ii(a, b, c, d, x, s, t)
{
  return md5_cmn(c ^ (b | (~d)), a, b, x, s, t);
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function bit_rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function md5(buf) {
  return helpers.hash(buf, core_md5, 16);
};

},{"./helpers":8}],11:[function(require,module,exports){
// Original code adapted from Robert Kieffer.
// details at https://github.com/broofa/node-uuid
(function() {
  var _global = this;

  var mathRNG, whatwgRNG;

  // NOTE: Math.random() does not guarantee "cryptographic quality"
  mathRNG = function(size) {
    var bytes = new Array(size);
    var r;

    for (var i = 0, r; i < size; i++) {
      if ((i & 0x03) == 0) r = Math.random() * 0x100000000;
      bytes[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return bytes;
  }

  if (_global.crypto && crypto.getRandomValues) {
    whatwgRNG = function(size) {
      var bytes = new Uint8Array(size);
      crypto.getRandomValues(bytes);
      return bytes;
    }
  }

  module.exports = whatwgRNG || mathRNG;

}())

},{}],12:[function(require,module,exports){
/*
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-1, as defined
 * in FIPS PUB 180-1
 * Version 2.1a Copyright Paul Johnston 2000 - 2002.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 * Distributed under the BSD License
 * See http://pajhome.org.uk/crypt/md5 for details.
 */

var helpers = require('./helpers');

/*
 * Calculate the SHA-1 of an array of big-endian words, and a bit length
 */
function core_sha1(x, len)
{
  /* append padding */
  x[len >> 5] |= 0x80 << (24 - len % 32);
  x[((len + 64 >> 9) << 4) + 15] = len;

  var w = Array(80);
  var a =  1732584193;
  var b = -271733879;
  var c = -1732584194;
  var d =  271733878;
  var e = -1009589776;

  for(var i = 0; i < x.length; i += 16)
  {
    var olda = a;
    var oldb = b;
    var oldc = c;
    var oldd = d;
    var olde = e;

    for(var j = 0; j < 80; j++)
    {
      if(j < 16) w[j] = x[i + j];
      else w[j] = rol(w[j-3] ^ w[j-8] ^ w[j-14] ^ w[j-16], 1);
      var t = safe_add(safe_add(rol(a, 5), sha1_ft(j, b, c, d)),
                       safe_add(safe_add(e, w[j]), sha1_kt(j)));
      e = d;
      d = c;
      c = rol(b, 30);
      b = a;
      a = t;
    }

    a = safe_add(a, olda);
    b = safe_add(b, oldb);
    c = safe_add(c, oldc);
    d = safe_add(d, oldd);
    e = safe_add(e, olde);
  }
  return Array(a, b, c, d, e);

}

/*
 * Perform the appropriate triplet combination function for the current
 * iteration
 */
function sha1_ft(t, b, c, d)
{
  if(t < 20) return (b & c) | ((~b) & d);
  if(t < 40) return b ^ c ^ d;
  if(t < 60) return (b & c) | (b & d) | (c & d);
  return b ^ c ^ d;
}

/*
 * Determine the appropriate additive constant for the current iteration
 */
function sha1_kt(t)
{
  return (t < 20) ?  1518500249 : (t < 40) ?  1859775393 :
         (t < 60) ? -1894007588 : -899497514;
}

/*
 * Add integers, wrapping at 2^32. This uses 16-bit operations internally
 * to work around bugs in some JS interpreters.
 */
function safe_add(x, y)
{
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
}

/*
 * Bitwise rotate a 32-bit number to the left.
 */
function rol(num, cnt)
{
  return (num << cnt) | (num >>> (32 - cnt));
}

module.exports = function sha1(buf) {
  return helpers.hash(buf, core_sha1, 20, true);
};

},{"./helpers":8}],13:[function(require,module,exports){

/**
 * A JavaScript implementation of the Secure Hash Algorithm, SHA-256, as defined
 * in FIPS 180-2
 * Version 2.2-beta Copyright Angel Marin, Paul Johnston 2000 - 2009.
 * Other contributors: Greg Holt, Andrew Kepert, Ydnar, Lostinet
 *
 */

var helpers = require('./helpers');

var safe_add = function(x, y) {
  var lsw = (x & 0xFFFF) + (y & 0xFFFF);
  var msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return (msw << 16) | (lsw & 0xFFFF);
};

var S = function(X, n) {
  return (X >>> n) | (X << (32 - n));
};

var R = function(X, n) {
  return (X >>> n);
};

var Ch = function(x, y, z) {
  return ((x & y) ^ ((~x) & z));
};

var Maj = function(x, y, z) {
  return ((x & y) ^ (x & z) ^ (y & z));
};

var Sigma0256 = function(x) {
  return (S(x, 2) ^ S(x, 13) ^ S(x, 22));
};

var Sigma1256 = function(x) {
  return (S(x, 6) ^ S(x, 11) ^ S(x, 25));
};

var Gamma0256 = function(x) {
  return (S(x, 7) ^ S(x, 18) ^ R(x, 3));
};

var Gamma1256 = function(x) {
  return (S(x, 17) ^ S(x, 19) ^ R(x, 10));
};

var core_sha256 = function(m, l) {
  var K = new Array(0x428A2F98,0x71374491,0xB5C0FBCF,0xE9B5DBA5,0x3956C25B,0x59F111F1,0x923F82A4,0xAB1C5ED5,0xD807AA98,0x12835B01,0x243185BE,0x550C7DC3,0x72BE5D74,0x80DEB1FE,0x9BDC06A7,0xC19BF174,0xE49B69C1,0xEFBE4786,0xFC19DC6,0x240CA1CC,0x2DE92C6F,0x4A7484AA,0x5CB0A9DC,0x76F988DA,0x983E5152,0xA831C66D,0xB00327C8,0xBF597FC7,0xC6E00BF3,0xD5A79147,0x6CA6351,0x14292967,0x27B70A85,0x2E1B2138,0x4D2C6DFC,0x53380D13,0x650A7354,0x766A0ABB,0x81C2C92E,0x92722C85,0xA2BFE8A1,0xA81A664B,0xC24B8B70,0xC76C51A3,0xD192E819,0xD6990624,0xF40E3585,0x106AA070,0x19A4C116,0x1E376C08,0x2748774C,0x34B0BCB5,0x391C0CB3,0x4ED8AA4A,0x5B9CCA4F,0x682E6FF3,0x748F82EE,0x78A5636F,0x84C87814,0x8CC70208,0x90BEFFFA,0xA4506CEB,0xBEF9A3F7,0xC67178F2);
  var HASH = new Array(0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A, 0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19);
    var W = new Array(64);
    var a, b, c, d, e, f, g, h, i, j;
    var T1, T2;
  /* append padding */
  m[l >> 5] |= 0x80 << (24 - l % 32);
  m[((l + 64 >> 9) << 4) + 15] = l;
  for (var i = 0; i < m.length; i += 16) {
    a = HASH[0]; b = HASH[1]; c = HASH[2]; d = HASH[3]; e = HASH[4]; f = HASH[5]; g = HASH[6]; h = HASH[7];
    for (var j = 0; j < 64; j++) {
      if (j < 16) {
        W[j] = m[j + i];
      } else {
        W[j] = safe_add(safe_add(safe_add(Gamma1256(W[j - 2]), W[j - 7]), Gamma0256(W[j - 15])), W[j - 16]);
      }
      T1 = safe_add(safe_add(safe_add(safe_add(h, Sigma1256(e)), Ch(e, f, g)), K[j]), W[j]);
      T2 = safe_add(Sigma0256(a), Maj(a, b, c));
      h = g; g = f; f = e; e = safe_add(d, T1); d = c; c = b; b = a; a = safe_add(T1, T2);
    }
    HASH[0] = safe_add(a, HASH[0]); HASH[1] = safe_add(b, HASH[1]); HASH[2] = safe_add(c, HASH[2]); HASH[3] = safe_add(d, HASH[3]);
    HASH[4] = safe_add(e, HASH[4]); HASH[5] = safe_add(f, HASH[5]); HASH[6] = safe_add(g, HASH[6]); HASH[7] = safe_add(h, HASH[7]);
  }
  return HASH;
};

module.exports = function sha256(buf) {
  return helpers.hash(buf, core_sha256, 32, true);
};

},{"./helpers":8}],14:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

function EventEmitter() {
  this._events = this._events || {};
  this._maxListeners = this._maxListeners || undefined;
}
module.exports = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
EventEmitter.defaultMaxListeners = 10;

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function(n) {
  if (!isNumber(n) || n < 0 || isNaN(n))
    throw TypeError('n must be a positive number');
  this._maxListeners = n;
  return this;
};

EventEmitter.prototype.emit = function(type) {
  var er, handler, len, args, i, listeners;

  if (!this._events)
    this._events = {};

  // If there is no 'error' event listener then throw.
  if (type === 'error') {
    if (!this._events.error ||
        (isObject(this._events.error) && !this._events.error.length)) {
      er = arguments[1];
      if (er instanceof Error) {
        throw er; // Unhandled 'error' event
      }
      throw TypeError('Uncaught, unspecified "error" event.');
    }
  }

  handler = this._events[type];

  if (isUndefined(handler))
    return false;

  if (isFunction(handler)) {
    switch (arguments.length) {
      // fast cases
      case 1:
        handler.call(this);
        break;
      case 2:
        handler.call(this, arguments[1]);
        break;
      case 3:
        handler.call(this, arguments[1], arguments[2]);
        break;
      // slower
      default:
        len = arguments.length;
        args = new Array(len - 1);
        for (i = 1; i < len; i++)
          args[i - 1] = arguments[i];
        handler.apply(this, args);
    }
  } else if (isObject(handler)) {
    len = arguments.length;
    args = new Array(len - 1);
    for (i = 1; i < len; i++)
      args[i - 1] = arguments[i];

    listeners = handler.slice();
    len = listeners.length;
    for (i = 0; i < len; i++)
      listeners[i].apply(this, args);
  }

  return true;
};

EventEmitter.prototype.addListener = function(type, listener) {
  var m;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events)
    this._events = {};

  // To avoid recursion in the case that type === "newListener"! Before
  // adding it to the listeners, first emit "newListener".
  if (this._events.newListener)
    this.emit('newListener', type,
              isFunction(listener.listener) ?
              listener.listener : listener);

  if (!this._events[type])
    // Optimize the case of one listener. Don't need the extra array object.
    this._events[type] = listener;
  else if (isObject(this._events[type]))
    // If we've already got an array, just append.
    this._events[type].push(listener);
  else
    // Adding the second element, need to change to array.
    this._events[type] = [this._events[type], listener];

  // Check for listener leak
  if (isObject(this._events[type]) && !this._events[type].warned) {
    var m;
    if (!isUndefined(this._maxListeners)) {
      m = this._maxListeners;
    } else {
      m = EventEmitter.defaultMaxListeners;
    }

    if (m && m > 0 && this._events[type].length > m) {
      this._events[type].warned = true;
      console.error('(node) warning: possible EventEmitter memory ' +
                    'leak detected. %d listeners added. ' +
                    'Use emitter.setMaxListeners() to increase limit.',
                    this._events[type].length);
      if (typeof console.trace === 'function') {
        // not supported in IE 10
        console.trace();
      }
    }
  }

  return this;
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.once = function(type, listener) {
  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  var fired = false;

  function g() {
    this.removeListener(type, g);

    if (!fired) {
      fired = true;
      listener.apply(this, arguments);
    }
  }

  g.listener = listener;
  this.on(type, g);

  return this;
};

// emits a 'removeListener' event iff the listener was removed
EventEmitter.prototype.removeListener = function(type, listener) {
  var list, position, length, i;

  if (!isFunction(listener))
    throw TypeError('listener must be a function');

  if (!this._events || !this._events[type])
    return this;

  list = this._events[type];
  length = list.length;
  position = -1;

  if (list === listener ||
      (isFunction(list.listener) && list.listener === listener)) {
    delete this._events[type];
    if (this._events.removeListener)
      this.emit('removeListener', type, listener);

  } else if (isObject(list)) {
    for (i = length; i-- > 0;) {
      if (list[i] === listener ||
          (list[i].listener && list[i].listener === listener)) {
        position = i;
        break;
      }
    }

    if (position < 0)
      return this;

    if (list.length === 1) {
      list.length = 0;
      delete this._events[type];
    } else {
      list.splice(position, 1);
    }

    if (this._events.removeListener)
      this.emit('removeListener', type, listener);
  }

  return this;
};

EventEmitter.prototype.removeAllListeners = function(type) {
  var key, listeners;

  if (!this._events)
    return this;

  // not listening for removeListener, no need to emit
  if (!this._events.removeListener) {
    if (arguments.length === 0)
      this._events = {};
    else if (this._events[type])
      delete this._events[type];
    return this;
  }

  // emit removeListener for all listeners on all events
  if (arguments.length === 0) {
    for (key in this._events) {
      if (key === 'removeListener') continue;
      this.removeAllListeners(key);
    }
    this.removeAllListeners('removeListener');
    this._events = {};
    return this;
  }

  listeners = this._events[type];

  if (isFunction(listeners)) {
    this.removeListener(type, listeners);
  } else {
    // LIFO order
    while (listeners.length)
      this.removeListener(type, listeners[listeners.length - 1]);
  }
  delete this._events[type];

  return this;
};

EventEmitter.prototype.listeners = function(type) {
  var ret;
  if (!this._events || !this._events[type])
    ret = [];
  else if (isFunction(this._events[type]))
    ret = [this._events[type]];
  else
    ret = this._events[type].slice();
  return ret;
};

EventEmitter.listenerCount = function(emitter, type) {
  var ret;
  if (!emitter._events || !emitter._events[type])
    ret = 0;
  else if (isFunction(emitter._events[type]))
    ret = 1;
  else
    ret = emitter._events[type].length;
  return ret;
};

function isFunction(arg) {
  return typeof arg === 'function';
}

function isNumber(arg) {
  return typeof arg === 'number';
}

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}

function isUndefined(arg) {
  return arg === void 0;
}

},{}],15:[function(require,module,exports){
if (typeof Object.create === 'function') {
  // implementation from standard node.js 'util' module
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    ctor.prototype = Object.create(superCtor.prototype, {
      constructor: {
        value: ctor,
        enumerable: false,
        writable: true,
        configurable: true
      }
    });
  };
} else {
  // old school shim for old browsers
  module.exports = function inherits(ctor, superCtor) {
    ctor.super_ = superCtor
    var TempCtor = function () {}
    TempCtor.prototype = superCtor.prototype
    ctor.prototype = new TempCtor()
    ctor.prototype.constructor = ctor
  }
}

},{}],16:[function(require,module,exports){
(function (process){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// resolves . and .. elements in a path array with directory names there
// must be no slashes, empty elements, or device names (c:\) in the array
// (so also no leading and trailing slashes - it does not distinguish
// relative and absolute paths)
function normalizeArray(parts, allowAboveRoot) {
  // if the path tries to go above the root, `up` ends up > 0
  var up = 0;
  for (var i = parts.length - 1; i >= 0; i--) {
    var last = parts[i];
    if (last === '.') {
      parts.splice(i, 1);
    } else if (last === '..') {
      parts.splice(i, 1);
      up++;
    } else if (up) {
      parts.splice(i, 1);
      up--;
    }
  }

  // if the path is allowed to go above the root, restore leading ..s
  if (allowAboveRoot) {
    for (; up--; up) {
      parts.unshift('..');
    }
  }

  return parts;
}

// Split a filename into [root, dir, basename, ext], unix version
// 'root' is just a slash, or nothing.
var splitPathRe =
    /^(\/?|)([\s\S]*?)((?:\.{1,2}|[^\/]+?|)(\.[^.\/]*|))(?:[\/]*)$/;
var splitPath = function(filename) {
  return splitPathRe.exec(filename).slice(1);
};

// path.resolve([from ...], to)
// posix version
exports.resolve = function() {
  var resolvedPath = '',
      resolvedAbsolute = false;

  for (var i = arguments.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    var path = (i >= 0) ? arguments[i] : process.cwd();

    // Skip empty and invalid entries
    if (typeof path !== 'string') {
      throw new TypeError('Arguments to path.resolve must be strings');
    } else if (!path) {
      continue;
    }

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charAt(0) === '/';
  }

  // At this point the path should be resolved to a full absolute path, but
  // handle relative paths to be safe (might happen when process.cwd() fails)

  // Normalize the path
  resolvedPath = normalizeArray(filter(resolvedPath.split('/'), function(p) {
    return !!p;
  }), !resolvedAbsolute).join('/');

  return ((resolvedAbsolute ? '/' : '') + resolvedPath) || '.';
};

// path.normalize(path)
// posix version
exports.normalize = function(path) {
  var isAbsolute = exports.isAbsolute(path),
      trailingSlash = substr(path, -1) === '/';

  // Normalize the path
  path = normalizeArray(filter(path.split('/'), function(p) {
    return !!p;
  }), !isAbsolute).join('/');

  if (!path && !isAbsolute) {
    path = '.';
  }
  if (path && trailingSlash) {
    path += '/';
  }

  return (isAbsolute ? '/' : '') + path;
};

// posix version
exports.isAbsolute = function(path) {
  return path.charAt(0) === '/';
};

// posix version
exports.join = function() {
  var paths = Array.prototype.slice.call(arguments, 0);
  return exports.normalize(filter(paths, function(p, index) {
    if (typeof p !== 'string') {
      throw new TypeError('Arguments to path.join must be strings');
    }
    return p;
  }).join('/'));
};


// path.relative(from, to)
// posix version
exports.relative = function(from, to) {
  from = exports.resolve(from).substr(1);
  to = exports.resolve(to).substr(1);

  function trim(arr) {
    var start = 0;
    for (; start < arr.length; start++) {
      if (arr[start] !== '') break;
    }

    var end = arr.length - 1;
    for (; end >= 0; end--) {
      if (arr[end] !== '') break;
    }

    if (start > end) return [];
    return arr.slice(start, end - start + 1);
  }

  var fromParts = trim(from.split('/'));
  var toParts = trim(to.split('/'));

  var length = Math.min(fromParts.length, toParts.length);
  var samePartsLength = length;
  for (var i = 0; i < length; i++) {
    if (fromParts[i] !== toParts[i]) {
      samePartsLength = i;
      break;
    }
  }

  var outputParts = [];
  for (var i = samePartsLength; i < fromParts.length; i++) {
    outputParts.push('..');
  }

  outputParts = outputParts.concat(toParts.slice(samePartsLength));

  return outputParts.join('/');
};

exports.sep = '/';
exports.delimiter = ':';

exports.dirname = function(path) {
  var result = splitPath(path),
      root = result[0],
      dir = result[1];

  if (!root && !dir) {
    // No dirname whatsoever
    return '.';
  }

  if (dir) {
    // It has a dirname, strip trailing slash
    dir = dir.substr(0, dir.length - 1);
  }

  return root + dir;
};


exports.basename = function(path, ext) {
  var f = splitPath(path)[2];
  // TODO: make this comparison case-insensitive on windows?
  if (ext && f.substr(-1 * ext.length) === ext) {
    f = f.substr(0, f.length - ext.length);
  }
  return f;
};


exports.extname = function(path) {
  return splitPath(path)[3];
};

function filter (xs, f) {
    if (xs.filter) return xs.filter(f);
    var res = [];
    for (var i = 0; i < xs.length; i++) {
        if (f(xs[i], i, xs)) res.push(xs[i]);
    }
    return res;
}

// String.prototype.substr - negative index don't work in IE8
var substr = 'ab'.substr(-1) === 'b'
    ? function (str, start, len) { return str.substr(start, len) }
    : function (str, start, len) {
        if (start < 0) start = str.length + start;
        return str.substr(start, len);
    }
;

}).call(this,require("1YiZ5S"))
},{"1YiZ5S":17}],17:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};

process.nextTick = (function () {
    var canSetImmediate = typeof window !== 'undefined'
    && window.setImmediate;
    var canPost = typeof window !== 'undefined'
    && window.postMessage && window.addEventListener
    ;

    if (canSetImmediate) {
        return function (f) { return window.setImmediate(f) };
    }

    if (canPost) {
        var queue = [];
        window.addEventListener('message', function (ev) {
            var source = ev.source;
            if ((source === window || source === null) && ev.data === 'process-tick') {
                ev.stopPropagation();
                if (queue.length > 0) {
                    var fn = queue.shift();
                    fn();
                }
            }
        }, true);

        return function nextTick(fn) {
            queue.push(fn);
            window.postMessage('process-tick', '*');
        };
    }

    return function nextTick(fn) {
        setTimeout(fn, 0);
    };
})();

process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
}

// TODO(shtylman)
process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};

},{}],18:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

// If obj.hasOwnProperty has been overridden, then calling
// obj.hasOwnProperty(prop) will break.
// See: https://github.com/joyent/node/issues/1707
function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

module.exports = function(qs, sep, eq, options) {
  sep = sep || '&';
  eq = eq || '=';
  var obj = {};

  if (typeof qs !== 'string' || qs.length === 0) {
    return obj;
  }

  var regexp = /\+/g;
  qs = qs.split(sep);

  var maxKeys = 1000;
  if (options && typeof options.maxKeys === 'number') {
    maxKeys = options.maxKeys;
  }

  var len = qs.length;
  // maxKeys <= 0 means that we should not limit keys count
  if (maxKeys > 0 && len > maxKeys) {
    len = maxKeys;
  }

  for (var i = 0; i < len; ++i) {
    var x = qs[i].replace(regexp, '%20'),
        idx = x.indexOf(eq),
        kstr, vstr, k, v;

    if (idx >= 0) {
      kstr = x.substr(0, idx);
      vstr = x.substr(idx + 1);
    } else {
      kstr = x;
      vstr = '';
    }

    k = decodeURIComponent(kstr);
    v = decodeURIComponent(vstr);

    if (!hasOwnProperty(obj, k)) {
      obj[k] = v;
    } else if (isArray(obj[k])) {
      obj[k].push(v);
    } else {
      obj[k] = [obj[k], v];
    }
  }

  return obj;
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

},{}],19:[function(require,module,exports){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

'use strict';

var stringifyPrimitive = function(v) {
  switch (typeof v) {
    case 'string':
      return v;

    case 'boolean':
      return v ? 'true' : 'false';

    case 'number':
      return isFinite(v) ? v : '';

    default:
      return '';
  }
};

module.exports = function(obj, sep, eq, name) {
  sep = sep || '&';
  eq = eq || '=';
  if (obj === null) {
    obj = undefined;
  }

  if (typeof obj === 'object') {
    return map(objectKeys(obj), function(k) {
      var ks = encodeURIComponent(stringifyPrimitive(k)) + eq;
      if (isArray(obj[k])) {
        return obj[k].map(function(v) {
          return ks + encodeURIComponent(stringifyPrimitive(v));
        }).join(sep);
      } else {
        return ks + encodeURIComponent(stringifyPrimitive(obj[k]));
      }
    }).join(sep);

  }

  if (!name) return '';
  return encodeURIComponent(stringifyPrimitive(name)) + eq +
         encodeURIComponent(stringifyPrimitive(obj));
};

var isArray = Array.isArray || function (xs) {
  return Object.prototype.toString.call(xs) === '[object Array]';
};

function map (xs, f) {
  if (xs.map) return xs.map(f);
  var res = [];
  for (var i = 0; i < xs.length; i++) {
    res.push(f(xs[i], i));
  }
  return res;
}

var objectKeys = Object.keys || function (obj) {
  var res = [];
  for (var key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) res.push(key);
  }
  return res;
};

},{}],20:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":18,"./encode":19}],21:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],22:[function(require,module,exports){
(function (process,global){
// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var formatRegExp = /%[sdj%]/g;
exports.format = function(f) {
  if (!isString(f)) {
    var objects = [];
    for (var i = 0; i < arguments.length; i++) {
      objects.push(inspect(arguments[i]));
    }
    return objects.join(' ');
  }

  var i = 1;
  var args = arguments;
  var len = args.length;
  var str = String(f).replace(formatRegExp, function(x) {
    if (x === '%%') return '%';
    if (i >= len) return x;
    switch (x) {
      case '%s': return String(args[i++]);
      case '%d': return Number(args[i++]);
      case '%j':
        try {
          return JSON.stringify(args[i++]);
        } catch (_) {
          return '[Circular]';
        }
      default:
        return x;
    }
  });
  for (var x = args[i]; i < len; x = args[++i]) {
    if (isNull(x) || !isObject(x)) {
      str += ' ' + x;
    } else {
      str += ' ' + inspect(x);
    }
  }
  return str;
};


// Mark that a method should not be used.
// Returns a modified function which warns once by default.
// If --no-deprecation is set, then it is a no-op.
exports.deprecate = function(fn, msg) {
  // Allow for deprecating things in the process of starting up.
  if (isUndefined(global.process)) {
    return function() {
      return exports.deprecate(fn, msg).apply(this, arguments);
    };
  }

  if (process.noDeprecation === true) {
    return fn;
  }

  var warned = false;
  function deprecated() {
    if (!warned) {
      if (process.throwDeprecation) {
        throw new Error(msg);
      } else if (process.traceDeprecation) {
        console.trace(msg);
      } else {
        console.error(msg);
      }
      warned = true;
    }
    return fn.apply(this, arguments);
  }

  return deprecated;
};


var debugs = {};
var debugEnviron;
exports.debuglog = function(set) {
  if (isUndefined(debugEnviron))
    debugEnviron = process.env.NODE_DEBUG || '';
  set = set.toUpperCase();
  if (!debugs[set]) {
    if (new RegExp('\\b' + set + '\\b', 'i').test(debugEnviron)) {
      var pid = process.pid;
      debugs[set] = function() {
        var msg = exports.format.apply(exports, arguments);
        console.error('%s %d: %s', set, pid, msg);
      };
    } else {
      debugs[set] = function() {};
    }
  }
  return debugs[set];
};


/**
 * Echos the value of a value. Trys to print the value out
 * in the best way possible given the different types.
 *
 * @param {Object} obj The object to print out.
 * @param {Object} opts Optional options object that alters the output.
 */
/* legacy: obj, showHidden, depth, colors*/
function inspect(obj, opts) {
  // default options
  var ctx = {
    seen: [],
    stylize: stylizeNoColor
  };
  // legacy...
  if (arguments.length >= 3) ctx.depth = arguments[2];
  if (arguments.length >= 4) ctx.colors = arguments[3];
  if (isBoolean(opts)) {
    // legacy...
    ctx.showHidden = opts;
  } else if (opts) {
    // got an "options" object
    exports._extend(ctx, opts);
  }
  // set default options
  if (isUndefined(ctx.showHidden)) ctx.showHidden = false;
  if (isUndefined(ctx.depth)) ctx.depth = 2;
  if (isUndefined(ctx.colors)) ctx.colors = false;
  if (isUndefined(ctx.customInspect)) ctx.customInspect = true;
  if (ctx.colors) ctx.stylize = stylizeWithColor;
  return formatValue(ctx, obj, ctx.depth);
}
exports.inspect = inspect;


// http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
inspect.colors = {
  'bold' : [1, 22],
  'italic' : [3, 23],
  'underline' : [4, 24],
  'inverse' : [7, 27],
  'white' : [37, 39],
  'grey' : [90, 39],
  'black' : [30, 39],
  'blue' : [34, 39],
  'cyan' : [36, 39],
  'green' : [32, 39],
  'magenta' : [35, 39],
  'red' : [31, 39],
  'yellow' : [33, 39]
};

// Don't use 'blue' not visible on cmd.exe
inspect.styles = {
  'special': 'cyan',
  'number': 'yellow',
  'boolean': 'yellow',
  'undefined': 'grey',
  'null': 'bold',
  'string': 'green',
  'date': 'magenta',
  // "name": intentionally not styling
  'regexp': 'red'
};


function stylizeWithColor(str, styleType) {
  var style = inspect.styles[styleType];

  if (style) {
    return '\u001b[' + inspect.colors[style][0] + 'm' + str +
           '\u001b[' + inspect.colors[style][1] + 'm';
  } else {
    return str;
  }
}


function stylizeNoColor(str, styleType) {
  return str;
}


function arrayToHash(array) {
  var hash = {};

  array.forEach(function(val, idx) {
    hash[val] = true;
  });

  return hash;
}


function formatValue(ctx, value, recurseTimes) {
  // Provide a hook for user-specified inspect functions.
  // Check that value is an object with an inspect function on it
  if (ctx.customInspect &&
      value &&
      isFunction(value.inspect) &&
      // Filter out the util module, it's inspect function is special
      value.inspect !== exports.inspect &&
      // Also filter out any prototype objects using the circular check.
      !(value.constructor && value.constructor.prototype === value)) {
    var ret = value.inspect(recurseTimes, ctx);
    if (!isString(ret)) {
      ret = formatValue(ctx, ret, recurseTimes);
    }
    return ret;
  }

  // Primitive types cannot have properties
  var primitive = formatPrimitive(ctx, value);
  if (primitive) {
    return primitive;
  }

  // Look up the keys of the object.
  var keys = Object.keys(value);
  var visibleKeys = arrayToHash(keys);

  if (ctx.showHidden) {
    keys = Object.getOwnPropertyNames(value);
  }

  // IE doesn't make error fields non-enumerable
  // http://msdn.microsoft.com/en-us/library/ie/dww52sbt(v=vs.94).aspx
  if (isError(value)
      && (keys.indexOf('message') >= 0 || keys.indexOf('description') >= 0)) {
    return formatError(value);
  }

  // Some type of object without properties can be shortcutted.
  if (keys.length === 0) {
    if (isFunction(value)) {
      var name = value.name ? ': ' + value.name : '';
      return ctx.stylize('[Function' + name + ']', 'special');
    }
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    }
    if (isDate(value)) {
      return ctx.stylize(Date.prototype.toString.call(value), 'date');
    }
    if (isError(value)) {
      return formatError(value);
    }
  }

  var base = '', array = false, braces = ['{', '}'];

  // Make Array say that they are Array
  if (isArray(value)) {
    array = true;
    braces = ['[', ']'];
  }

  // Make functions say that they are functions
  if (isFunction(value)) {
    var n = value.name ? ': ' + value.name : '';
    base = ' [Function' + n + ']';
  }

  // Make RegExps say that they are RegExps
  if (isRegExp(value)) {
    base = ' ' + RegExp.prototype.toString.call(value);
  }

  // Make dates with properties first say the date
  if (isDate(value)) {
    base = ' ' + Date.prototype.toUTCString.call(value);
  }

  // Make error with message first say the error
  if (isError(value)) {
    base = ' ' + formatError(value);
  }

  if (keys.length === 0 && (!array || value.length == 0)) {
    return braces[0] + base + braces[1];
  }

  if (recurseTimes < 0) {
    if (isRegExp(value)) {
      return ctx.stylize(RegExp.prototype.toString.call(value), 'regexp');
    } else {
      return ctx.stylize('[Object]', 'special');
    }
  }

  ctx.seen.push(value);

  var output;
  if (array) {
    output = formatArray(ctx, value, recurseTimes, visibleKeys, keys);
  } else {
    output = keys.map(function(key) {
      return formatProperty(ctx, value, recurseTimes, visibleKeys, key, array);
    });
  }

  ctx.seen.pop();

  return reduceToSingleString(output, base, braces);
}


function formatPrimitive(ctx, value) {
  if (isUndefined(value))
    return ctx.stylize('undefined', 'undefined');
  if (isString(value)) {
    var simple = '\'' + JSON.stringify(value).replace(/^"|"$/g, '')
                                             .replace(/'/g, "\\'")
                                             .replace(/\\"/g, '"') + '\'';
    return ctx.stylize(simple, 'string');
  }
  if (isNumber(value))
    return ctx.stylize('' + value, 'number');
  if (isBoolean(value))
    return ctx.stylize('' + value, 'boolean');
  // For some reason typeof null is "object", so special case here.
  if (isNull(value))
    return ctx.stylize('null', 'null');
}


function formatError(value) {
  return '[' + Error.prototype.toString.call(value) + ']';
}


function formatArray(ctx, value, recurseTimes, visibleKeys, keys) {
  var output = [];
  for (var i = 0, l = value.length; i < l; ++i) {
    if (hasOwnProperty(value, String(i))) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          String(i), true));
    } else {
      output.push('');
    }
  }
  keys.forEach(function(key) {
    if (!key.match(/^\d+$/)) {
      output.push(formatProperty(ctx, value, recurseTimes, visibleKeys,
          key, true));
    }
  });
  return output;
}


function formatProperty(ctx, value, recurseTimes, visibleKeys, key, array) {
  var name, str, desc;
  desc = Object.getOwnPropertyDescriptor(value, key) || { value: value[key] };
  if (desc.get) {
    if (desc.set) {
      str = ctx.stylize('[Getter/Setter]', 'special');
    } else {
      str = ctx.stylize('[Getter]', 'special');
    }
  } else {
    if (desc.set) {
      str = ctx.stylize('[Setter]', 'special');
    }
  }
  if (!hasOwnProperty(visibleKeys, key)) {
    name = '[' + key + ']';
  }
  if (!str) {
    if (ctx.seen.indexOf(desc.value) < 0) {
      if (isNull(recurseTimes)) {
        str = formatValue(ctx, desc.value, null);
      } else {
        str = formatValue(ctx, desc.value, recurseTimes - 1);
      }
      if (str.indexOf('\n') > -1) {
        if (array) {
          str = str.split('\n').map(function(line) {
            return '  ' + line;
          }).join('\n').substr(2);
        } else {
          str = '\n' + str.split('\n').map(function(line) {
            return '   ' + line;
          }).join('\n');
        }
      }
    } else {
      str = ctx.stylize('[Circular]', 'special');
    }
  }
  if (isUndefined(name)) {
    if (array && key.match(/^\d+$/)) {
      return str;
    }
    name = JSON.stringify('' + key);
    if (name.match(/^"([a-zA-Z_][a-zA-Z_0-9]*)"$/)) {
      name = name.substr(1, name.length - 2);
      name = ctx.stylize(name, 'name');
    } else {
      name = name.replace(/'/g, "\\'")
                 .replace(/\\"/g, '"')
                 .replace(/(^"|"$)/g, "'");
      name = ctx.stylize(name, 'string');
    }
  }

  return name + ': ' + str;
}


function reduceToSingleString(output, base, braces) {
  var numLinesEst = 0;
  var length = output.reduce(function(prev, cur) {
    numLinesEst++;
    if (cur.indexOf('\n') >= 0) numLinesEst++;
    return prev + cur.replace(/\u001b\[\d\d?m/g, '').length + 1;
  }, 0);

  if (length > 60) {
    return braces[0] +
           (base === '' ? '' : base + '\n ') +
           ' ' +
           output.join(',\n  ') +
           ' ' +
           braces[1];
  }

  return braces[0] + base + ' ' + output.join(', ') + ' ' + braces[1];
}


// NOTE: These type checking functions intentionally don't use `instanceof`
// because it is fragile and can be easily faked with `Object.create()`.
function isArray(ar) {
  return Array.isArray(ar);
}
exports.isArray = isArray;

function isBoolean(arg) {
  return typeof arg === 'boolean';
}
exports.isBoolean = isBoolean;

function isNull(arg) {
  return arg === null;
}
exports.isNull = isNull;

function isNullOrUndefined(arg) {
  return arg == null;
}
exports.isNullOrUndefined = isNullOrUndefined;

function isNumber(arg) {
  return typeof arg === 'number';
}
exports.isNumber = isNumber;

function isString(arg) {
  return typeof arg === 'string';
}
exports.isString = isString;

function isSymbol(arg) {
  return typeof arg === 'symbol';
}
exports.isSymbol = isSymbol;

function isUndefined(arg) {
  return arg === void 0;
}
exports.isUndefined = isUndefined;

function isRegExp(re) {
  return isObject(re) && objectToString(re) === '[object RegExp]';
}
exports.isRegExp = isRegExp;

function isObject(arg) {
  return typeof arg === 'object' && arg !== null;
}
exports.isObject = isObject;

function isDate(d) {
  return isObject(d) && objectToString(d) === '[object Date]';
}
exports.isDate = isDate;

function isError(e) {
  return isObject(e) &&
      (objectToString(e) === '[object Error]' || e instanceof Error);
}
exports.isError = isError;

function isFunction(arg) {
  return typeof arg === 'function';
}
exports.isFunction = isFunction;

function isPrimitive(arg) {
  return arg === null ||
         typeof arg === 'boolean' ||
         typeof arg === 'number' ||
         typeof arg === 'string' ||
         typeof arg === 'symbol' ||  // ES6 symbol
         typeof arg === 'undefined';
}
exports.isPrimitive = isPrimitive;

exports.isBuffer = require('./support/isBuffer');

function objectToString(o) {
  return Object.prototype.toString.call(o);
}


function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
              'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
  var d = new Date();
  var time = [pad(d.getHours()),
              pad(d.getMinutes()),
              pad(d.getSeconds())].join(':');
  return [d.getDate(), months[d.getMonth()], time].join(' ');
}


// log is just a thin wrapper to console.log that prepends a timestamp
exports.log = function() {
  console.log('%s - %s', timestamp(), exports.format.apply(exports, arguments));
};


/**
 * Inherit the prototype methods from one constructor into another.
 *
 * The Function.prototype.inherits from lang.js rewritten as a standalone
 * function (not on Function.prototype). NOTE: If this file is to be loaded
 * during bootstrapping this function needs to be rewritten using some native
 * functions as prototype setup using normal JavaScript does not work as
 * expected during bootstrapping (see mirror.js in r114903).
 *
 * @param {function} ctor Constructor function which needs to inherit the
 *     prototype.
 * @param {function} superCtor Constructor function to inherit prototype from.
 */
exports.inherits = require('inherits');

exports._extend = function(origin, add) {
  // Don't do anything if add isn't an object
  if (!add || !isObject(add)) return origin;

  var keys = Object.keys(add);
  var i = keys.length;
  while (i--) {
    origin[keys[i]] = add[keys[i]];
  }
  return origin;
};

function hasOwnProperty(obj, prop) {
  return Object.prototype.hasOwnProperty.call(obj, prop);
}

}).call(this,require("1YiZ5S"),typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"./support/isBuffer":21,"1YiZ5S":17,"inherits":15}],23:[function(require,module,exports){
'use strict';

var util = require('util')
  , Element = require('./element').Element

function DOMElement(name, attrs) {
    Element.call(this, name, attrs)

    this.nodeType = 1
    this.nodeName = this.localName
}

util.inherits(DOMElement, Element)

DOMElement.prototype._getElement = function(name, attrs) {
    var element = new DOMElement(name, attrs)
    return element
}

Object.defineProperty(DOMElement.prototype, 'localName', {
    get: function () {
        return this.getName()
    }
})

Object.defineProperty(DOMElement.prototype, 'namespaceURI', {
    get: function () {
        return this.getNS()
    }
})

Object.defineProperty(DOMElement.prototype, 'parentNode', {
    get: function () {
        return this.parent
    }
})

Object.defineProperty(DOMElement.prototype, 'childNodes', {
    get: function () {
        return this.children
    }
})

Object.defineProperty(DOMElement.prototype, 'textContent', {
    get: function () {
        return this.getText()
    },
    set: function (value) {
        this.children.push(value)
    }
})

DOMElement.prototype.getElementsByTagName = function (name) {
    return this.getChildren(name)
}

DOMElement.prototype.getAttribute = function (name) {
    return this.getAttr(name)
}

DOMElement.prototype.setAttribute = function (name, value) {
    this.attr(name, value)
}

DOMElement.prototype.getAttributeNS = function (ns, name) {
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        return this.getAttr(['xml', name].join(':'))
    }
    return this.getAttr(name, ns)
}

DOMElement.prototype.setAttributeNS = function (ns, name, value) {
    var prefix
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        prefix = 'xml'
    } else {
        var nss = this.getXmlns()
        prefix = nss[ns] || ''
    }
    if (prefix) {
        this.attr([prefix, name].join(':'), value)
    }
}

DOMElement.prototype.removeAttribute = function (name) {
    this.attr(name, null)
}

DOMElement.prototype.removeAttributeNS = function (ns, name) {
    var prefix
    if (ns === 'http://www.w3.org/XML/1998/namespace') {
        prefix = 'xml'
    } else {
        var nss = this.getXmlns()
        prefix = nss[ns] || ''
    }
    if (prefix) {
        this.attr([prefix, name].join(':'), null)
    }
}

DOMElement.prototype.appendChild = function (el) {
    this.cnode(el)
}

DOMElement.prototype.removeChild = function (el) {
    this.remove(el)
}

module.exports = DOMElement

},{"./element":24,"util":22}],24:[function(require,module,exports){
'use strict';

/**
 * This cheap replica of DOM/Builder puts me to shame :-)
 *
 * Attributes are in the element.attrs object. Children is a list of
 * either other Elements or Strings for text content.
 **/
function Element(name, attrs) {
    this.name = name
    this.parent = null
    this.children = []
    this.setAttrs(attrs)
}

/*** Accessors ***/

/**
 * if (element.is('message', 'jabber:client')) ...
 **/
Element.prototype.is = function(name, xmlns) {
    return (this.getName() === name) &&
        (!xmlns || (this.getNS() === xmlns))
}

/* without prefix */
Element.prototype.getName = function() {
    if (this.name.indexOf(':') >= 0)
        return this.name.substr(this.name.indexOf(':') + 1)
    else
        return this.name
}

/**
 * retrieves the namespace of the current element, upwards recursively
 **/
Element.prototype.getNS = function() {
    if (this.name.indexOf(':') >= 0) {
        var prefix = this.name.substr(0, this.name.indexOf(':'))
        return this.findNS(prefix)
    } else {
        return this.findNS()
    }
}

/**
 * find the namespace to the given prefix, upwards recursively
 **/
Element.prototype.findNS = function(prefix) {
    if (!prefix) {
        /* default namespace */
        if (this.attrs.xmlns)
            return this.attrs.xmlns
        else if (this.parent)
            return this.parent.findNS()
    } else {
        /* prefixed namespace */
        var attr = 'xmlns:' + prefix
        if (this.attrs[attr])
            return this.attrs[attr]
        else if (this.parent)
            return this.parent.findNS(prefix)
    }
}

/**
 * Recursiverly gets all xmlns defined, in the form of {url:prefix}
 **/
Element.prototype.getXmlns = function() {
    var namespaces = {}

    if (this.parent)
        namespaces = this.parent.getXmlns()

    for (var attr in this.attrs) {
        var m = attr.match('xmlns:?(.*)')
        if (this.attrs.hasOwnProperty(attr) && m) {
            namespaces[this.attrs[attr]] = m[1]
        }
    }
    return namespaces
}

Element.prototype.setAttrs = function(attrs) {
    this.attrs = {}
    Object.keys(attrs || {}).forEach(function(key) {
        this.attrs[key] = attrs[key]
    }, this)
}

/**
 * xmlns can be null, returns the matching attribute.
 **/
Element.prototype.getAttr = function(name, xmlns) {
    if (!xmlns)
        return this.attrs[name]

    var namespaces = this.getXmlns()

    if (!namespaces[xmlns])
        return null

    return this.attrs[[namespaces[xmlns], name].join(':')]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChild = function(name, xmlns) {
    return this.getChildren(name, xmlns)[0]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChildren = function(name, xmlns) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.getName &&
            (child.getName() === name) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
    }
    return result
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildByAttr = function(attr, val, xmlns, recursive) {
    return this.getChildrenByAttr(attr, val, xmlns, recursive)[0]
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildrenByAttr = function(attr, val, xmlns, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.attrs &&
            (child.attrs[attr] === val) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
        if (recursive && child.getChildrenByAttr) {
            result.push(child.getChildrenByAttr(attr, val, xmlns, true))
        }
    }
    if (recursive) result = [].concat.apply([], result)
    return result
}

Element.prototype.getChildrenByFilter = function(filter, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (filter(child))
            result.push(child)
        if (recursive && child.getChildrenByFilter){
            result.push(child.getChildrenByFilter(filter, true))
        }
    }
    if (recursive) {
        result = [].concat.apply([], result)
    }
    return result
}

Element.prototype.getText = function() {
    var text = ''
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if ((typeof child === 'string') || (typeof child === 'number')) {
            text += child
        }
    }
    return text
}

Element.prototype.getChildText = function(name, xmlns) {
    var child = this.getChild(name, xmlns)
    return child ? child.getText() : null
}

/**
 * Return all direct descendents that are Elements.
 * This differs from `getChildren` in that it will exclude text nodes,
 * processing instructions, etc.
 */
Element.prototype.getChildElements = function() {
    return this.getChildrenByFilter(function(child) {
        return child instanceof Element
    })
}

/*** Builder ***/

/** returns uppermost parent */
Element.prototype.root = function() {
    if (this.parent)
        return this.parent.root()
    else
        return this
}
Element.prototype.tree = Element.prototype.root

/** just parent or itself */
Element.prototype.up = function() {
    if (this.parent)
        return this.parent
    else
        return this
}

Element.prototype._getElement = function(name, attrs) {
    var element = new Element(name, attrs)
    return element
}

/** create child node and return it */
Element.prototype.c = function(name, attrs) {
    return this.cnode(this._getElement(name, attrs))
}

Element.prototype.cnode = function(child) {
    this.children.push(child)
    child.parent = this
    return child
}

/** add text node and return element */
Element.prototype.t = function(text) {
    this.children.push(text)
    return this
}

/*** Manipulation ***/

/**
 * Either:
 *   el.remove(childEl)
 *   el.remove('author', 'urn:...')
 */
Element.prototype.remove = function(el, xmlns) {
    var filter
    if (typeof el === 'string') {
        /* 1st parameter is tag name */
        filter = function(child) {
            return !(child.is &&
                 child.is(el, xmlns))
        }
    } else {
        /* 1st parameter is element */
        filter = function(child) {
            return child !== el
        }
    }

    this.children = this.children.filter(filter)

    return this
}

/**
 * To use in case you want the same XML data for separate uses.
 * Please refrain from this practise unless you know what you are
 * doing. Building XML with ltx is easy!
 */
Element.prototype.clone = function() {
    var clone = this._getElement(this.name, this.attrs)
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

Element.prototype.text = function(val) {
    if (val && this.children.length === 1) {
        this.children[0] = val
        return this
    }
    return this.getText()
}

Element.prototype.attr = function(attr, val) {
    if (((typeof val !== 'undefined') || (val === null))) {
        if (!this.attrs) {
            this.attrs = {}
        }
        this.attrs[attr] = val
        return this
    }
    return this.attrs[attr]
}

/*** Serialization ***/

Element.prototype.toString = function() {
    var s = ''
    this.write(function(c) {
        s += c
    })
    return s
}

Element.prototype.toJSON = function() {
    return {
        name: this.name,
        attrs: this.attrs,
        children: this.children.map(function(child) {
            return child && child.toJSON ? child.toJSON() : child
        })
    }
}

Element.prototype._addChildren = function(writer) {
    writer('>')
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        /* Skip null/undefined */
        if (child || (child === 0)) {
            if (child.write) {
                child.write(writer)
            } else if (typeof child === 'string') {
                writer(escapeXmlText(child))
            } else if (child.toString) {
                writer(escapeXmlText(child.toString(10)))
            }
        }
    }
    writer('</')
    writer(this.name)
    writer('>')
}

Element.prototype.write = function(writer) {
    writer('<')
    writer(this.name)
    for (var k in this.attrs) {
        var v = this.attrs[k]
        if (v || (v === '') || (v === 0)) {
            writer(' ')
            writer(k)
            writer('="')
            if (typeof v !== 'string') {
                v = v.toString(10)
            }
            writer(escapeXml(v))
            writer('"')
        }
    }
    if (this.children.length === 0) {
        writer('/>')
    } else {
        this._addChildren(writer)
    }
}

function escapeXml(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;').
        replace(/"/g, '&quot;').
        replace(/"/g, '&apos;')
}

function escapeXmlText(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;')
}

exports.Element = Element
exports.escapeXml = escapeXml

},{}],25:[function(require,module,exports){
'use strict';

/* Cause browserify to bundle SAX parsers: */
var parse = require('./parse')

parse.availableSaxParsers.push(parse.bestSaxParser = require('./sax/sax_ltx'))

/* SHIM */
module.exports = require('./index')
},{"./index":26,"./parse":27,"./sax/sax_ltx":28}],26:[function(require,module,exports){
'use strict';

var parse = require('./parse')

/**
 * The only (relevant) data structure
 */
exports.Element = require('./dom-element')

/**
 * Helper
 */
exports.escapeXml = require('./element').escapeXml

/**
 * DOM parser interface
 */
exports.parse = parse.parse
exports.Parser = parse.Parser

/**
 * SAX parser interface
 */
exports.availableSaxParsers = parse.availableSaxParsers
exports.bestSaxParser = parse.bestSaxParser

},{"./dom-element":23,"./element":24,"./parse":27}],27:[function(require,module,exports){
'use strict';

var events = require('events')
  , util = require('util')
  , DOMElement = require('./dom-element')


exports.availableSaxParsers = []
exports.bestSaxParser = null

var saxParsers = [
    './sax/sax_expat.js',
    './sax/sax_ltx.js',
    /*'./sax_easysax.js', './sax_node-xml.js',*/
    './sax/sax_saxjs.js'
]

saxParsers.forEach(function(modName) {
    var mod
    try {
        mod = require(modName)
    } catch (e) {
        /* Silently missing libraries drop for debug:
        console.error(e.stack || e)
         */
    }
    if (mod) {
        exports.availableSaxParsers.push(mod)
        if (!exports.bestSaxParser) {
            exports.bestSaxParser = mod
        }
    }
})

exports.Parser = function(saxParser) {
    events.EventEmitter.call(this)
    var self = this

    var ParserMod = saxParser || exports.bestSaxParser
    if (!ParserMod) {
        throw new Error('No SAX parser available')
    }
    this.parser = new ParserMod()

    var el
    this.parser.addListener('startElement', function(name, attrs) {
        var child = new DOMElement(name, attrs)
        if (!el) {
            el = child
        } else {
            el = el.cnode(child)
        }
    })
    this.parser.addListener('endElement', function(name) {
        /* jshint -W035 */
        if (!el) {
            /* Err */
        } else if (name === el.name) {
            if (el.parent) {
                el = el.parent
            } else if (!self.tree) {
                self.tree = el
                el = undefined
            }
        }
        /* jshint +W035 */
    })
    this.parser.addListener('text', function(str) {
        if (el) {
            el.t(str)
        }
    })
    this.parser.addListener('error', function(e) {
        self.error = e
        self.emit('error', e)
    })
}

util.inherits(exports.Parser, events.EventEmitter)

exports.Parser.prototype.write = function(data) {
    this.parser.write(data)
}

exports.Parser.prototype.end = function(data) {
    this.parser.end(data)

    if (!this.error) {
        if (this.tree) {
            this.emit('tree', this.tree)
        } else {
            this.emit('error', new Error('Incomplete document'))
        }
    }
}

exports.parse = function(data, saxParser) {
    var p = new exports.Parser(saxParser)
    var result = null
      , error = null

    p.on('tree', function(tree) {
        result = tree
    })
    p.on('error', function(e) {
        error = e
    })

    p.write(data)
    p.end()

    if (error) {
        throw error
    } else {
        return result
    }
}

},{"./dom-element":23,"events":14,"util":22}],28:[function(require,module,exports){
'use strict';

var util = require('util')
  , events = require('events')

var STATE_TEXT = 0,
    STATE_IGNORE_TAG = 1,
    STATE_TAG_NAME = 2,
    STATE_TAG = 3,
    STATE_ATTR_NAME = 4,
    STATE_ATTR_EQ = 5,
    STATE_ATTR_QUOT = 6,
    STATE_ATTR_VALUE = 7

var SaxLtx = module.exports = function SaxLtx() {
    events.EventEmitter.call(this)

    var state = STATE_TEXT, remainder
    var tagName, attrs, endTag, selfClosing, attrQuote
    var recordStart = 0
    var attrName

    this._handleTagOpening = function(endTag, tagName, attrs) {
        if (!endTag) {
            this.emit('startElement', tagName, attrs)
            if (selfClosing) {
                this.emit('endElement', tagName)
            }
        } else {
            this.emit('endElement', tagName)
        }
    }

    this.write = function(data) {
        /* jshint -W071 */
        /* jshint -W074 */
        if (typeof data !== 'string') {
            data = data.toString()
        }
        var pos = 0

        /* Anything from previous write()? */
        if (remainder) {
            data = remainder + data
            pos += remainder.length
            remainder = null
        }

        function endRecording() {
            if (typeof recordStart === 'number') {
                var recorded = data.slice(recordStart, pos)
                recordStart = undefined
                return recorded
            }
        }

        for(; pos < data.length; pos++) {
            var c = data.charCodeAt(pos)
            //console.log("state", state, "c", c, data[pos])
            switch(state) {
            case STATE_TEXT:
                if (c === 60 /* < */) {
                    var text = endRecording()
                    if (text) {
                        this.emit('text', unescapeXml(text))
                    }
                    state = STATE_TAG_NAME
                    recordStart = pos + 1
                    attrs = {}
                }
                break
            case STATE_TAG_NAME:
                if (c === 47 /* / */ && recordStart === pos) {
                    recordStart = pos + 1
                    endTag = true
                } else if (c === 33 /* ! */ || c === 63 /* ? */) {
                    recordStart = undefined
                    state = STATE_IGNORE_TAG
                } else if (c <= 32 || c === 47 /* / */ || c === 62 /* > */) {
                    tagName = endRecording()
                    pos--
                    state = STATE_TAG
                }
                break
            case STATE_IGNORE_TAG:
                if (c === 62 /* > */) {
                    state = STATE_TEXT
                }
                break
            case STATE_TAG:
                if (c === 62 /* > */) {
                    this._handleTagOpening(endTag, tagName, attrs)
                    tagName = undefined
                    attrs = undefined
                    endTag = undefined
                    selfClosing = undefined
                    state = STATE_TEXT
                    recordStart = pos + 1
                } else if (c === 47 /* / */) {
                    selfClosing = true
                } else if (c > 32) {
                    recordStart = pos
                    state = STATE_ATTR_NAME
                }
                break
            case STATE_ATTR_NAME:
                if (c <= 32 || c === 61 /* = */) {
                    attrName = endRecording()
                    pos--
                    state = STATE_ATTR_EQ
                }
                break
            case STATE_ATTR_EQ:
                if (c === 61 /* = */) {
                    state = STATE_ATTR_QUOT
                }
                break
            case STATE_ATTR_QUOT:
                if (c === 34 /* " */ || c === 39 /* ' */) {
                    attrQuote = c
                    state = STATE_ATTR_VALUE
                    recordStart = pos + 1
                }
                break
            case STATE_ATTR_VALUE:
                if (c === attrQuote) {
                    var value = unescapeXml(endRecording())
                    attrs[attrName] = value
                    attrName = undefined
                    state = STATE_TAG
                }
                break
            }
        }

        if (typeof recordStart === 'number' &&
            recordStart <= data.length) {

            remainder = data.slice(recordStart)
            recordStart = 0
        }
    }

    /*var origEmit = this.emit
    this.emit = function() {
    console.log('ltx', arguments)
    origEmit.apply(this, arguments)
    }*/
}
util.inherits(SaxLtx, events.EventEmitter)


SaxLtx.prototype.end = function(data) {
    if (data) {
        this.write(data)
    }

    /* Uh, yeah */
    this.write = function() {}
}

function unescapeXml(s) {
    return s.
        replace(/\&(amp|#38);/g, '&').
        replace(/\&(lt|#60);/g, '<').
        replace(/\&(gt|#62);/g, '>').
        replace(/\&(quot|#34);/g, '"').
        replace(/\&(apos|#39);/g, '\'').
        replace(/\&(nbsp|#160);/g, '\n')
}

},{"events":14,"util":22}],29:[function(require,module,exports){
(function (__dirname){
'use strict';

var Session = require('./lib/session')
  , Connection = require('node-xmpp-core').Connection
  , JID = require('node-xmpp-core').JID
  , Stanza = require ('node-xmpp-core').Stanza
  , sasl = require('./lib/sasl')
  , Anonymous = require('./lib/authentication/anonymous')
  , Plain = require('./lib/authentication/plain')
  , DigestMD5 = require('./lib/authentication/digestmd5')
  , XOAuth2 = require('./lib/authentication/xoauth2')
  , XFacebookPlatform = require('./lib/authentication/xfacebook')
  , External = require('./lib/authentication/external')
  , exec = require('child_process').exec
  , util = require('util')
  , debug = require('debug')('xmpp:client')
  , ltx = require('node-xmpp-core').ltx

var NS_CLIENT = 'jabber:client'
var NS_REGISTER = 'jabber:iq:register'
var NS_XMPP_SASL = 'urn:ietf:params:xml:ns:xmpp-sasl'
var NS_XMPP_BIND = 'urn:ietf:params:xml:ns:xmpp-bind'
var NS_XMPP_SESSION = 'urn:ietf:params:xml:ns:xmpp-session'

var STATE_PREAUTH = 0
  , STATE_AUTH = 1
  , STATE_AUTHED = 2
  , STATE_BIND = 3
  , STATE_SESSION = 4
  , STATE_ONLINE = 5

var IQID_SESSION = 'sess'
  , IQID_BIND = 'bind'

/* jshint latedef: false */
/* jshint -W079 */
/* jshint -W020 */
var decode64, encode64, Buffer
if (typeof btoa === 'undefined') {
    var btoa = null
    var atob = null
}

if (typeof btoa === 'function') {
    decode64 = function(encoded) {
        return atob(encoded)
    }
} else {
    Buffer = require('buffer').Buffer
    decode64 = function(encoded) {
        return (new Buffer(encoded, 'base64')).toString('utf8')
    }
}
if (typeof atob === 'function') {
    encode64 = function(decoded) {
        return btoa(decoded)
    }
} else {
    Buffer = require('buffer').Buffer
    encode64 = function(decoded) {
        return (new Buffer(decoded, 'utf8')).toString('base64')
    }
}

/**
 * params object:
 *   jid: String (required)
 *   password: String (required)
 *   host: String (optional)
 *   port: Number (optional)
 *   reconnect: Boolean (optional)
 *   autostart: Boolean (optional) - if we start connecting to a given port
 *   register: Boolean (option) - register account before authentication
 *   legacySSL: Boolean (optional) - connect to the legacy SSL port, requires at least the host to be specified
 *   credentials: Dictionary (optional) - TLS or SSL key and certificate credentials
 *   actAs: String (optional) - if admin user act on behalf of another user (just user)
 *   disallowTLS: Boolean (optional) - prevent upgrading the connection to a secure one via TLS
 *   preferred: String (optional) - Preferred SASL mechanism to use
 *   bosh.url: String (optional) - BOSH endpoint to use
 *   bosh.prebind: Function(error, data) (optional) - Just prebind a new BOSH session for browser client use
 *            error String - Result of XMPP error. Ex : [Error: XMPP authentication failure]
 *            data Object - Result of XMPP BOSH connection.
 *
 * Examples:
 *   var cl = new xmpp.Client({
 *       jid: "me@example.com",
 *       password: "secret"
 *   })
 *   var facebook = new xmpp.Client({
 *       jid: '-' + fbUID + '@chat.facebook.com',
 *       api_key: '54321', // api key of your facebook app
 *       access_token: 'abcdefg', // user access token
 *       host: 'chat.facebook.com'
 *   })
 *   var gtalk = new xmpp.Client({
 *       jid: 'me@gmail.com',
 *       oauth2_token: 'xxxx.xxxxxxxxxxx', // from OAuth2
 *       oauth2_auth: 'http://www.google.com/talk/protocol/auth',
 *       host: 'talk.google.com'
 *   })
 *   var prebind = new xmpp.Client({
 *       jid: "me@example.com",
 *       password: "secret",
 *       bosh: {
 *           url: "http://example.com/http-bind",
 *           prebind: function(error, data) {
 *               if (error) {}
 *               res.send({ rid: data.rid, sid: data.sid })
 *           }
 *       }
 *   })
 *
 * Example SASL EXTERNAL:
 *
 * var myCredentials = {
 *   // These are necessary only if using the client certificate authentication
 *   key: fs.readFileSync('key.pem'),
 *   cert: fs.readFileSync('cert.pem'),
 *   // passphrase: 'optional'
 * }
 * var cl = new xmppClient({
 *     jid: "me@example.com",
 *     credentials: myCredentials
 *     preferred: 'EXTERNAL' // not really required, but possible
 * })
 *
 */
function Client(options) {
    this.options = {}
    if (options) this.options = options
    this.availableSaslMechanisms = [
        XOAuth2, XFacebookPlatform, External, DigestMD5, Plain, Anonymous
    ]

    if (this.options.autostart !== false)
        this.connect()
}

util.inherits(Client, Session)

Client.NS_CLIENT = NS_CLIENT

Client.prototype.connect = function() {
    if (this.options.bosh && this.options.bosh.prebind) {
        debug('load bosh prebind')
        var cb = this.options.bosh.prebind
        delete this.options.bosh.prebind
        var cmd = 'node ' + __dirname +
            '/lib/prebind.js '
        delete this.options.bosh.prebind
        cmd += encodeURI(JSON.stringify(this.options))
        exec(
            cmd,
            function (error, stdout, stderr) {
                if (error) {
                    cb(error, null)
                } else {
                    var r = stdout.match(/rid:+[ 0-9]*/i)
                    r = (r[0].split(':'))[1].trim()
                    var s = stdout.match(/sid:+[ a-z+'"-_A-Z+0-9]*/i)
                    s = (s[0].split(':'))[1]
                        .replace('\'','')
                        .replace('\'','')
                        .trim()
                    if (r && s) {
                        return cb(null, { rid: r, sid: s })
                    }
                    cb(stderr)
                }
            }
        )
    } else {
        this.options.xmlns = NS_CLIENT
        /* jshint camelcase: false */
        delete this.did_bind
        delete this.did_session

        this.state = STATE_PREAUTH
        this.on('end', function() {
            this.state = STATE_PREAUTH
            delete this.did_bind
            delete this.did_session
        })

        Session.call(this, this.options)
        this.options.jid = this.jid

        this.connection.on('disconnect', function(error) {
            this.state = STATE_PREAUTH
            if (!this.connection.reconnect) {
                if (error) this.emit('error', error)
                this.emit('offline')
            }
            delete this.did_bind
            delete this.did_session
        }.bind(this))

        // If server and client have multiple possible auth mechanisms
        // we try to select the preferred one
        if (this.options.preferred) {
            this.preferredSaslMechanism = this.options.preferred
        } else {
            this.preferredSaslMechanism = 'DIGEST-MD5'
        }

        var mechs = sasl.detectMechanisms(this.options, this.availableSaslMechanisms)
        this.availableSaslMechanisms = mechs
    }
}

Client.prototype.onStanza = function(stanza) {
    /* Actually, we shouldn't wait for <stream:features/> if
       this.streamAttrs.version is missing, but who uses pre-XMPP-1.0
       these days anyway? */
    if ((this.state !== STATE_ONLINE) && stanza.is('features')) {
        this.streamFeatures = stanza
        this.useFeatures()
    } else if (this.state === STATE_PREAUTH) {
        this.emit('stanza:preauth', stanza)
    } else if (this.state === STATE_AUTH) {
        this._handleAuthState(stanza)
    } else if ((this.state === STATE_BIND) && stanza.is('iq') && (stanza.attrs.id === IQID_BIND)) {
        this._handleBindState(stanza)
    } else if ((this.state === STATE_SESSION) && (true === stanza.is('iq')) &&
        (stanza.attrs.id === IQID_SESSION)) {
        this._handleSessionState(stanza)
    } else if (stanza.name === 'stream:error') {
        if (!this.reconnect)
            this.emit('error', stanza)
    } else if (this.state === STATE_ONLINE) {
        this.emit('stanza', stanza)
    }
}

Client.prototype._handleSessionState = function(stanza) {
    if (stanza.attrs.type === 'result') {
        this.state = STATE_AUTHED
        /* jshint camelcase: false */
        this.did_session = true

        /* no stream restart, but next feature (most probably
           we'll go online next) */
        this.useFeatures()
    } else {
        this.emit('error', 'Cannot bind resource')
    }
}

Client.prototype._handleBindState = function(stanza) {
    if (stanza.attrs.type === 'result') {
        this.state = STATE_AUTHED
        /*jshint camelcase: false */
        this.did_bind = true

        var bindEl = stanza.getChild('bind', NS_XMPP_BIND)
        if (bindEl && bindEl.getChild('jid')) {
            this.jid = new JID(bindEl.getChild('jid').getText())
        }

        /* no stream restart, but next feature */
        this.useFeatures()
    } else {
        this.emit('error', 'Cannot bind resource')
    }
}

Client.prototype._handleAuthState = function(stanza) {
    if (stanza.is('challenge', NS_XMPP_SASL)) {
        var challengeMsg = decode64(stanza.getText())
        var responseMsg = encode64(this.mech.challenge(challengeMsg))
        var response = new Stanza.Element(
            'response', { xmlns: NS_XMPP_SASL }
        ).t(responseMsg)
        this.send(response)
    } else if (stanza.is('success', NS_XMPP_SASL)) {
        this.mech = null
        this.state = STATE_AUTHED
        this.emit('auth')
    } else {
        this.emit('error', 'XMPP authentication failure')
    }
}

Client.prototype._handlePreAuthState = function() {
    this.state = STATE_AUTH
    var offeredMechs = this.streamFeatures.
        getChild('mechanisms', NS_XMPP_SASL).
        getChildren('mechanism', NS_XMPP_SASL).
        map(function(el) { return el.getText() })
    this.mech = sasl.selectMechanism(
        offeredMechs,
        this.preferredSaslMechanism,
        this.availableSaslMechanisms
    )
    if (this.mech) {
        this.mech.authzid = this.jid.bare().toString()
        this.mech.authcid = this.jid.user
        this.mech.password = this.password
        /*jshint camelcase: false */
        this.mech.api_key = this.api_key
        this.mech.access_token = this.access_token
        this.mech.oauth2_token = this.oauth2_token
        this.mech.oauth2_auth = this.oauth2_auth
        this.mech.realm = this.jid.domain  // anything?
        if (this.actAs) this.mech.actAs = this.actAs.user
        this.mech.digest_uri = 'xmpp/' + this.jid.domain
        var authMsg = encode64(this.mech.auth())
        var attrs = this.mech.authAttrs()
        attrs.xmlns = NS_XMPP_SASL
        attrs.mechanism = this.mech.name
        this.send(new Stanza.Element('auth', attrs)
            .t(authMsg))
    } else {
        this.emit('error', 'No usable SASL mechanism')
    }
}

/**
 * Either we just received <stream:features/>, or we just enabled a
 * feature and are looking for the next.
 */
Client.prototype.useFeatures = function() {
    /* jshint camelcase: false */
    if ((this.state === STATE_PREAUTH) && this.register) {
        delete this.register
        this.doRegister()
    } else if ((this.state === STATE_PREAUTH) &&
        this.streamFeatures.getChild('mechanisms', NS_XMPP_SASL)) {
        this._handlePreAuthState()
    } else if ((this.state === STATE_AUTHED) &&
               !this.did_bind &&
               this.streamFeatures.getChild('bind', NS_XMPP_BIND)) {
        this.state = STATE_BIND
        var bindEl = new Stanza.Element(
            'iq',
            { type: 'set', id: IQID_BIND }
        ).c('bind', { xmlns: NS_XMPP_BIND })
        if (this.jid.resource)
            bindEl.c('resource').t(this.jid.resource)
        this.send(bindEl)
    } else if ((this.state === STATE_AUTHED) &&
               !this.did_session &&
               this.streamFeatures.getChild('session', NS_XMPP_SESSION)) {
        this.state = STATE_SESSION
        var stanza = new Stanza.Element(
          'iq',
          { type: 'set', to: this.jid.domain, id: IQID_SESSION  }
        ).c('session', { xmlns: NS_XMPP_SESSION })
        this.send(stanza)
    } else if (this.state === STATE_AUTHED) {
        /* Ok, we're authenticated and all features have been
           processed */
        this.state = STATE_ONLINE
        this.emit('online', { jid: this.jid })
    }
}

Client.prototype.doRegister = function() {
    var id = 'register' + Math.ceil(Math.random() * 99999)
    var iq = new Stanza.Element(
        'iq',
        { type: 'set', id: id, to: this.jid.domain }
    ).c('query', { xmlns: NS_REGISTER })
    .c('username').t(this.jid.user).up()
    .c('password').t(this.password)
    this.send(iq)

    var self = this
    var onReply = function(reply) {
        if (reply.is('iq') && (reply.attrs.id === id)) {
            self.removeListener('stanza', onReply)

            if (reply.attrs.type === 'result') {
                /* Registration successful, proceed to auth */
                self.useFeatures()
            } else {
                self.emit('error', new Error('Registration error'))
            }
        }
    }
    this.on('stanza:preauth', onReply)
}

/**
 * returns all registered sasl mechanisms
 */
Client.prototype.getSaslMechanisms = function() {
    return this.availableSaslMechanisms
}

/**
 * removes all registered sasl mechanisms
 */
Client.prototype.clearSaslMechanism = function() {
    this.availableSaslMechanisms = []
}

/**
 * register a new sasl mechanism
 */
Client.prototype.registerSaslMechanism = function(method) {
    // check if method is registered
    if (this.availableSaslMechanisms.indexOf(method) === -1 ) {
        this.availableSaslMechanisms.push(method)
    }
}

/**
 * unregister an existing sasl mechanism
 */
Client.prototype.unregisterSaslMechanism = function(method) {
    // check if method is registered
    var index = this.availableSaslMechanisms.indexOf(method)
    if (index >= 0) {
        this.availableSaslMechanisms = this.availableSaslMechanisms.splice(index, 1)
    }
}

Client.SASL = sasl
Client.Client = Client
Client.Stanza = Stanza
Client.ltx = ltx
module.exports = Client
}).call(this,"/../node_modules/node-xmpp-client")
},{"./lib/authentication/anonymous":30,"./lib/authentication/digestmd5":31,"./lib/authentication/external":32,"./lib/authentication/plain":34,"./lib/authentication/xfacebook":35,"./lib/authentication/xoauth2":36,"./lib/sasl":38,"./lib/session":39,"buffer":5,"child_process":3,"debug":42,"node-xmpp-core":45,"util":22}],30:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see http://tools.ietf.org/html/rfc4505
 * @see http://xmpp.org/extensions/xep-0175.html
 */
function Anonymous() {}

util.inherits(Anonymous, Mechanism)

Anonymous.prototype.name = 'ANONYMOUS'

Anonymous.prototype.auth = function() {
    return this.authzid
};

Anonymous.prototype.match = function() {
    return true
}

module.exports = Anonymous
},{"./mechanism":33,"util":22}],31:[function(require,module,exports){
'use strict';

var util = require('util')
  , crypto = require('crypto')
  , Mechanism = require('./mechanism')


/**
 * Hash a string
 */
function md5(s, encoding) {
    var hash = crypto.createHash('md5')
    hash.update(s)
    return hash.digest(encoding || 'binary')
}
function md5Hex(s) {
    return md5(s, 'hex')
}

/**
 * Parse SASL serialization
 */
function parseDict(s) {
    var result = {}
    while (s) {
        var m
        if ((m = /^(.+?)=(.*?[^\\]),\s*(.*)/.exec(s))) {
            result[m[1]] = m[2].replace(/\"/g, '')
            s = m[3]
        } else if ((m = /^(.+?)=(.+?),\s*(.*)/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else if ((m = /^(.+?)="(.*?[^\\])"$/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else if ((m = /^(.+?)=(.+?)$/.exec(s))) {
            result[m[1]] = m[2]
            s = m[3]
        } else {
            s = null
        }
    }
    return result
}

/**
 * SASL serialization
 */
function encodeDict(dict) {
    var s = ''
    for (var k in dict) {
        var v = dict[k]
        if (v) s += ',' + k + '="' + v + '"'
    }
    return s.substr(1) // without first ','
}

/**
 * Right-justify a string,
 * eg. pad with 0s
 */
function rjust(s, targetLen, padding) {
    while (s.length < targetLen)
        s = padding + s
    return s
}

/**
 * Generate a string of 8 digits
 * (number used once)
 */
function generateNonce() {
    var result = ''
    for (var i = 0; i < 8; i++)
        result += String.fromCharCode(48 +
            Math.ceil(Math.random() * 10))
    return result
}

/**
 * @see http://tools.ietf.org/html/rfc2831
 * @see http://wiki.xmpp.org/web/SASLandDIGEST-MD5
 */
function DigestMD5() {
    /*jshint camelcase: false */
    this.nonce_count = 0
    this.cnonce = generateNonce()
    this.authcid = null
    this.actAs = null
    this.realm = null
    this.password = null
}

util.inherits(DigestMD5, Mechanism)

DigestMD5.prototype.name = 'DIGEST-MD5'

DigestMD5.prototype.auth = function() {
    return ''
}

DigestMD5.prototype.getNC = function() {
    /*jshint camelcase: false */
    return rjust(this.nonce_count.toString(), 8, '0')
}

DigestMD5.prototype.responseValue = function(s) {
    var dict = parseDict(s)
    if (dict.realm)
        this.realm = dict.realm

    var value
    /*jshint camelcase: false */
    if (dict.nonce && dict.qop) {
        this.nonce_count++
        var a1 = md5(this.authcid + ':' +
            this.realm + ':' +
            this.password) + ':' +
            dict.nonce + ':' +
            this.cnonce
        if (this.actAs) a1 += ':' + this.actAs

        var a2 = 'AUTHENTICATE:' + this.digest_uri
        if ((dict.qop === 'auth-int') || (dict.qop === 'auth-conf'))
            a2 += ':00000000000000000000000000000000'

        value = md5Hex(md5Hex(a1) + ':' +
            dict.nonce + ':' +
            this.getNC() + ':' +
            this.cnonce + ':' +
            dict.qop + ':' +
            md5Hex(a2))
    }
    return value
}

DigestMD5.prototype.challenge = function(s) {
    var dict = parseDict(s)
    if (dict.realm)
        this.realm = dict.realm

    var response
    /*jshint camelcase: false */
    if (dict.nonce && dict.qop) {
        var responseValue = this.responseValue(s)
        response = {
            username: this.authcid,
            realm: this.realm,
            nonce: dict.nonce,
            cnonce: this.cnonce,
            nc: this.getNC(),
            qop: dict.qop,
            'digest-uri': this.digest_uri,
            response: responseValue,
            charset: 'utf-8'
        }
        if (this.actAs) response.authzid = this.actAs
    } else if (dict.rspauth) {
        return ''
    }
    return encodeDict(response)
}

DigestMD5.prototype.serverChallenge = function() {
    var dict = {}
    dict.realm = ''
    this.nonce = dict.nonce = generateNonce()
    dict.qop = 'auth'
    this.charset = dict.charset = 'utf-8'
    dict.algorithm = 'md5-sess'
    return encodeDict(dict)
}

// Used on the server to check for auth!
DigestMD5.prototype.response = function(s) {
    var dict = parseDict(s)
    this.authcid = dict.username

    if (dict.nonce !== this.nonce) return false
    if (!dict.cnonce) return false

    this.cnonce = dict.cnonce
    if (this.charset !== dict.charset) return false

    this.response = dict.response
    return true
}

DigestMD5.prototype.match = function(options) {
    if (options.password) return true
    return false
}

module.exports = DigestMD5

},{"./mechanism":33,"crypto":9,"util":22}],32:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see http://xmpp.org/extensions/xep-0178.html
 */
function External() {}

util.inherits(External, Mechanism)

External.prototype.name = 'EXTERNAL'

External.prototype.auth = function() {
    return (this.authzid)
}

External.prototype.match = function(options) {
    if (options.credentials) return true
    return false
}

module.exports = External
},{"./mechanism":33,"util":22}],33:[function(require,module,exports){
'use strict';

/**
 * Each implemented mechanism offers multiple methods
 * - name : name of the auth method
 * - auth :
 * - match: checks if the client has enough options to
 *          offer this mechanis to xmpp servers
 * - authServer: takes a stanza and extracts the information
 */

var util = require('util')
  , EventEmitter = require('events').EventEmitter

// Mechanisms
function Mechanism() {}

util.inherits(Mechanism, EventEmitter)

Mechanism.prototype.authAttrs = function() {
    return {}
}

module.exports = Mechanism
},{"events":14,"util":22}],34:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

function Plain() {}

util.inherits(Plain, Mechanism)

Plain.prototype.name = 'PLAIN'

Plain.prototype.auth = function() {
    return this.authzid + '\0' +
        this.authcid + '\0' +
        this.password;
}

Plain.prototype.match = function(options) {
    if (options.password) return true
    return false
}

module.exports = Plain
},{"./mechanism":33,"util":22}],35:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')
  , querystring = require('querystring')

/**
 * @see https://developers.facebook.com/docs/chat/#platauth
 */
var XFacebookPlatform = function() {}

util.inherits(XFacebookPlatform, Mechanism)

XFacebookPlatform.prototype.name = 'X-FACEBOOK-PLATFORM'
XFacebookPlatform.prototype.host = 'chat.facebook.com'

XFacebookPlatform.prototype.auth = function() {
    return ''
}

XFacebookPlatform.prototype.challenge = function(s) {
    var dict = querystring.parse(s)

    /*jshint camelcase: false */
    var response = {
        api_key: this.api_key,
        call_id: new Date().getTime(),
        method: dict.method,
        nonce: dict.nonce,
        access_token: this.access_token,
        v: '1.0'
    }

    return querystring.stringify(response)
}

XFacebookPlatform.prototype.match = function(options) {
    var host = XFacebookPlatform.prototype.host
    if ((options.host === host) ||
        (options.jid && (options.jid.getDomain() === host))) {
        return true
    }
    return false
}

module.exports = XFacebookPlatform
},{"./mechanism":33,"querystring":20,"util":22}],36:[function(require,module,exports){
'use strict';

var util = require('util')
  , Mechanism = require('./mechanism')

/**
 * @see https://developers.google.com/talk/jep_extensions/oauth
 */
/*jshint camelcase: false */
function XOAuth2() {
    this.oauth2_auth = null
    this.authzid = null
}

util.inherits(XOAuth2, Mechanism)

XOAuth2.prototype.name = 'X-OAUTH2'
XOAuth2.prototype.NS_GOOGLE_AUTH = 'http://www.google.com/talk/protocol/auth'

XOAuth2.prototype.auth = function() {
    return '\0' + this.authzid + '\0' + this.oauth2_token
}

XOAuth2.prototype.authAttrs = function() {
    return {
        'auth:service': 'oauth2',
        'xmlns:auth': this.oauth2_auth
    }
}

XOAuth2.prototype.match = function(options) {
    return (options.oauth2_auth === XOAuth2.prototype.NS_GOOGLE_AUTH)
}

module.exports = XOAuth2

},{"./mechanism":33,"util":22}],37:[function(require,module,exports){
(function (process){
'use strict';

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , request = require('request')
  , ltx = require('node-xmpp-core').ltx
  , debug = require('debug')('xmpp:client:bosh')

function BOSHConnection(opts) {
    var that = this
    EventEmitter.call(this)

    this.boshURL = opts.bosh.url
    this.jid = opts.jid
    this.wait = opts.bosh.wait || 10;
    this.xmlnsAttrs = {
        xmlns: 'http://jabber.org/protocol/httpbind',
        'xmlns:xmpp': 'urn:xmpp:xbosh',
        'xmlns:stream': 'http://etherx.jabber.org/streams'
    }
    if (opts.xmlns) {
        for (var prefix in opts.xmlns) {
            if (prefix) {
                this.xmlnsAttrs['xmlns:' + prefix] = opts.xmlns[prefix]
            } else {
                this.xmlnsAttrs.xmlns = opts.xmlns[prefix]
            }
        }
    }
    this.currentRequests = 0
    this.queue = []
    this.rid = Math.ceil(Math.random() * 9999999999)

    this.request({
            to: this.jid.domain,
            ver: '1.6',
            wait: this.wait,
            hold: '1',
            content: this.contentType,
            'xmpp:version': '1.0'
        },
        [],
        function(err, bodyEl) {
            if (err) {
                that.emit('error', err)
            } else if (bodyEl && bodyEl.attrs) {
                that.sid = bodyEl.attrs.sid
                that.maxRequests = parseInt(bodyEl.attrs.requests, 10) || 2
                if (that.sid && (that.maxRequests > 0)) {
                    that.emit('connect')
                    that.processResponse(bodyEl)
                    process.nextTick(that.mayRequest.bind(that))
                } else {
                    that.emit('error', 'Invalid parameters')
                }
            }
        })

}

util.inherits(BOSHConnection, EventEmitter)

BOSHConnection.prototype.contentType = 'text/xml; charset=utf-8'

BOSHConnection.prototype.send = function(stanza) {
    this.queue.push(stanza.root())
    process.nextTick(this.mayRequest.bind(this))
}

BOSHConnection.prototype.startStream = function() {
    var that = this

    this.rid++
    this.request({
        to: this.jid.domain,
        'xmpp:restart': 'true'
    },
    [],
    function (err, bodyEl) {
        if (err) {
            that.emit('error', err)
            that.emit('disconnect')
            that.emit('end')
            delete that.sid
            that.emit('close')
        } else {
            that.streamOpened = true
            if (bodyEl) that.processResponse(bodyEl)

            process.nextTick(that.mayRequest.bind(that))
        }
    })
}

BOSHConnection.prototype.processResponse = function(bodyEl) {
    debug('process bosh server response ' + bodyEl.toString())
    if (bodyEl && bodyEl.children) {
        for(var i = 0; i < bodyEl.children.length; i++) {
            var child = bodyEl.children[i]
            if (child.name && child.attrs && child.children)
                this.emit('stanza', child)
        }
    }
    if (bodyEl && (bodyEl.attrs.type === 'terminate')) {
        if (!this.shutdown || bodyEl.attrs.condition)
            this.emit('error',
                      new Error(bodyEl.attrs.condition || 'Session terminated'))
        this.emit('disconnect')
        this.emit('end')
        this.emit('close')
    }
}

BOSHConnection.prototype.mayRequest = function() {
    var canRequest =
        /* Must have a session already */
        this.sid &&
        /* We can only receive when one request is in flight */
        ((this.currentRequests === 0) ||
         /* Is there something to send, and are we allowed? */
         (((this.queue.length > 0) && (this.currentRequests < this.maxRequests)))
        )

    if (!canRequest) return

    var stanzas = this.queue
    this.queue = []
    this.rid++
    this.request({}, stanzas, function(err, bodyEl) {
        if (err) {
            this.emit('error', err)
            this.emit('disconnect')
            this.emit('end')
            delete this.sid
            this.emit('close')
        } else {
            if (bodyEl) this.processResponse(bodyEl)

            process.nextTick(this.mayRequest.bind(this))
        }
    }.bind(this))
}

BOSHConnection.prototype.end = function(stanzas) {
    stanzas = stanzas || []
    if (typeof stanzas !== Array) stanzas = [stanzas]

    stanzas = this.queue.concat(stanzas)
    this.shutdown = true
    this.queue = []
    this.rid++
    this.request({ type: 'terminate' }, stanzas, function(err, bodyEl) {
        if (bodyEl) this.processResponse(bodyEl)

        this.emit('disconnect')
        this.emit('end')
        delete this.sid
        this.emit('close')
    }.bind(this))
}

BOSHConnection.prototype.maxHTTPRetries = 5

BOSHConnection.prototype.request = function(attrs, children, cb, retry) {
    var that = this
    retry = retry || 0

    attrs.rid = this.rid.toString()
    if (this.sid) attrs.sid = this.sid

    for (var k in this.xmlnsAttrs) {
        attrs[k] = this.xmlnsAttrs[k]
    }
    var boshEl = new ltx.Element('body', attrs)
    for (var i = 0; i < children.length; i++) {
        boshEl.cnode(children[i])
    }

    debug('send bosh request:' + boshEl.toString());

    request({
            uri: this.boshURL,
            method: 'POST',
            headers: { 'Content-Type': this.contentType },
            body: boshEl.toString()
        },
        function(err, res, body) {
            that.currentRequests--

            if (err) {
                if (retry < that.maxHTTPRetries) {
                    return that.request(attrs, children, cb, retry + 1)
                } else {
                    return cb(err)
                }
            }
            if ((res.statusCode < 200) || (res.statusCode >= 400)) {
                return cb(new Error('HTTP status ' + res.statusCode))
            }

            var bodyEl
            try {
                bodyEl = ltx.parse(body)
            } catch(e) {
                return cb(e)
            }

            if (bodyEl &&
                (bodyEl.attrs.type === 'terminate') &&
                bodyEl.attrs.condition) {
                cb(new Error(bodyEl.attrs.condition))
            } else if (bodyEl) {
                cb(null, bodyEl)
            } else {
                cb(new Error('no <body/>'))
            }
        }
    )
    this.currentRequests++
}

module.exports = BOSHConnection

}).call(this,require("1YiZ5S"))
},{"1YiZ5S":17,"debug":42,"events":14,"node-xmpp-core":45,"request":41,"util":22}],38:[function(require,module,exports){
'use strict';

var Mechanism = require('./authentication/mechanism')

/**
 * Available methods for client-side authentication (Client)
 * @param  Array offeredMechs  methods offered by server
 * @param  Array preferredMech preferred methods by client
 * @param  Array availableMech available methods on client
 */
function selectMechanism(offeredMechs, preferredMech, availableMech) {
    var mechClasses = []
    var byName = {}
    var Mech
    if (Array.isArray(availableMech)) {
        mechClasses = mechClasses.concat(availableMech)
    }
    mechClasses.forEach(function(mechClass) {
        byName[mechClass.prototype.name] = mechClass
    })
    /* Any preferred? */
    if (byName[preferredMech] &&
        (offeredMechs.indexOf(preferredMech) >= 0)) {
        Mech = byName[preferredMech]
    }
    /* By priority */
    mechClasses.forEach(function(mechClass) {
        if (!Mech &&
            (offeredMechs.indexOf(mechClass.prototype.name) >= 0))
            Mech = mechClass
    })

    return Mech ? new Mech() : null
}

/**
 * Will detect the available mechanisms based on the given options
 * @param  {[type]} options client configuration
 * @param  Array availableMech available methods on client
 * @return {[type]}         available options
 */
function detectMechanisms(options, availableMech) {
    var mechClasses = availableMech ? availableMech : []

    var detect = []
    mechClasses.forEach(function(mechClass) {
        var match = mechClass.prototype.match
        if (match(options)) detect.push(mechClass)
    })
    return detect
}

exports.selectMechanism = selectMechanism
exports.detectMechanisms = detectMechanisms
exports.AbstractMechanism = Mechanism

},{"./authentication/mechanism":33}],39:[function(require,module,exports){
(function (process){
'use strict';

var util = require('util')
  , tls = require('tls')
  , crypto = require('crypto')
  , EventEmitter = require('events').EventEmitter
  , Connection = require('node-xmpp-core').Connection
  , JID = require('node-xmpp-core').JID
  , SRV = require('node-xmpp-core').SRV
  , BOSHConnection = require('./bosh')
  , WSConnection = require('./websockets')
  , debug = require('debug')('xmpp:client:session')

function Session(opts) {
    EventEmitter.call(this)

    this.setOptions(opts)

    if (opts.websocket && opts.websocket.url) {
        debug('start websocket connection')
        this._setupWebsocketConnection(opts)
    } else if (opts.bosh && opts.bosh.url) {
        debug('start bosh connection')
        this._setupBoshConnection(opts)
    } else {
        debug('start socket connection')
        this._setupSocketConnection(opts)
    }
}

util.inherits(Session, EventEmitter)

Session.prototype._setupSocketConnection = function(opts) {
    var params = {
        xmlns: { '': opts.xmlns },
        streamAttrs: {
            version: '1.0',
            to: this.jid.domain
        },
        serialized: opts.serialized
    }
    for (var  key in opts)
        if (!(key in params))
            params[key] = opts[key]

    this.connection = new Connection(params)
    this._addConnectionListeners()

    if (opts.host) {
        this._socketConnectionToHost(opts)
    } else if (!SRV) {
        throw 'Cannot load SRV'
    } else {
        this._performSrvLookup(opts)
    }
}

Session.prototype._socketConnectionToHost = function(opts) {
    if (opts.legacySSL) {
        this.connection.allowTLS = false
        this.connection.connect({
            socket:function () {
                return tls.connect(
                    opts.port || 5223,
                    opts.host,
                    opts.credentials || {},
                    function() {
                        if (this.socket.authorized)
                            this.emit('connect', this.socket)
                        else
                            this.emit('error', 'unauthorized')
                    }.bind(this)
                )
            }
        })
    } else {
        if (opts.credentials) {
            this.connection.credentials = crypto
                .createCredentials(opts.credentials)
        }
        if (opts.disallowTLS) this.connection.allowTLS = false
        this.connection.listen({
            socket:function () {
                // wait for connect event listeners
                process.nextTick(function () {
                    this.socket.connect(opts.port || 5222, opts.host)
                }.bind(this))
                var socket = opts.socket
                opts.socket = null
                return socket // maybe create new socket
            }
        })
    }
}

Session.prototype._performSrvLookup = function(opts) {
    if (opts.legacySSL) {
        throw 'LegacySSL mode does not support DNS lookups'
    }
    if (opts.credentials)
        this.connection.credentials = crypto.createCredentials(opts.credentials)
    if (opts.disallowTLS)
        this.connection.allowTLS = false
    this.connection.listen({socket:SRV.connect({
        socket:      opts.socket,
        services:    ['_xmpp-client._tcp'],
        domain:      this.jid.domain,
        defaultPort: 5222
    })})
}

Session.prototype._setupBoshConnection = function(opts) {
    this.connection = new BOSHConnection({
        jid: this.jid,
        bosh: opts.bosh
    })
    this._addConnectionListeners()
    this.connection.on('connected', function() {
        // Clients start <stream:stream>, servers reply
        if (this.connection.startStream)
            this.connection.startStream()
    }.bind(this))
}

Session.prototype._setupWebsocketConnection = function(opts) {
    this.connection = new WSConnection({
        jid: this.jid,
        websocket: opts.websocket
    })
    this._addConnectionListeners()
    this.connection.on('connected', function() {
        // Clients start <stream:stream>, servers reply
        if (this.connection.startStream)
            this.connection.startStream()
    }.bind(this))
}

Session.prototype.setOptions = function(opts) {
    /* jshint camelcase: false */
    this.jid = (typeof opts.jid === 'string') ? new JID(opts.jid) : opts.jid
    this.password = opts.password
    this.preferredSaslMechanism = opts.preferredSaslMechanism
    this.api_key = opts.api_key
    this.access_token = opts.access_token
    this.oauth2_token = opts.oauth2_token
    this.oauth2_auth = opts.oauth2_auth
    this.register = opts.register
    if (typeof opts.actAs === 'string') {
        this.actAs = new JID(opts.actAs)
    } else {
        this.actAs = opts.actAs
    }
}

Session.prototype._addConnectionListeners = function (con) {
    con = con || this.connection
    con.on('stanza', this.onStanza.bind(this))
    con.on('drain', this.emit.bind(this, 'drain'))
    con.on('end', this.emit.bind(this, 'end'))
    con.on('close', this.emit.bind(this, 'close'))
    con.on('error', this.emit.bind(this, 'error'))
    con.on('connect', this.emit.bind(this, 'connect'))
    con.on('reconnect', this.emit.bind(this, 'reconnect'))
    con.on('disconnect', this.emit.bind(this, 'disconnect'))
    if (con.startStream) {
        con.on('connect', function () {
            // Clients start <stream:stream>, servers reply
            con.startStream()
        })
        this.on('auth', function () {
            con.startStream()
        })
    }
}

Session.prototype.pause = function() {
    if (this.connection && this.connection.pause)
        this.connection.pause()
}

Session.prototype.resume = function() {
    if (this.connection && this.connection.resume)
        this.connection.resume()
}

Session.prototype.send = function(stanza) {
    return this.connection ? this.connection.send(stanza) : false
}

Session.prototype.end = function() {
    if (this.connection)
        this.connection.end()
}

Session.prototype.onStanza = function() {}

module.exports = Session

}).call(this,require("1YiZ5S"))
},{"./bosh":37,"./websockets":40,"1YiZ5S":17,"crypto":9,"debug":42,"events":14,"node-xmpp-core":45,"tls":3,"util":22}],40:[function(require,module,exports){
'use strict';

var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , ltx = require('node-xmpp-core').ltx
  , StreamParser = require('node-xmpp-core').StreamParser
  , WebSocket = require('faye-websocket') && require('faye-websocket').Client ?
      require('faye-websocket').Client : window.WebSocket
  , Connection = require('node-xmpp-core').Connection
  , debug = require('debug')('xmpp:client:websockets')

function WSConnection(opts) {
    EventEmitter.call(this)

    this.url = opts.websocket.url
    this.jid = opts.jid
    this.xmlns = {}
    this.websocket = new WebSocket(this.url, ['xmpp'])
    this.websocket.onopen = this.onopen.bind(this)
    this.websocket.onmessage = this.onmessage.bind(this)
    this.websocket.onclose = this.onclose.bind(this)
    this.websocket.onerror = this.onerror.bind(this)
}

util.inherits(WSConnection, EventEmitter)

WSConnection.prototype.maxStanzaSize = 65535
WSConnection.prototype.xmppVersion = '1.0'

WSConnection.prototype.onopen = function() {
    this.startParser()
    this.emit('connected')
}

WSConnection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('start', function(attrs) {
        self.streamAttrs = attrs
        /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if ((k === 'xmlns') ||
                (k.substr(0, 6) === 'xmlns:')) {
                self.streamNsAttrs[k] = attrs[k]
            }
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        //self.onStanza(self.addStreamNs(stanza))
        self.onStanza(stanza)
    })
    this.parser.on('error', this.onerror.bind(this))
    this.parser.on('end', function() {
        self.stopParser()
        self.end()
    })
}

WSConnection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        /* Get GC'ed */
        delete this.parser
    }
}

WSConnection.prototype.onmessage = function(msg) {
    debug('ws msg <--', msg.data)
    if (msg && msg.data && this.parser)
        this.parser.write(msg.data)
}

WSConnection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', Connection.NS_STREAM)) {
        /* TODO: extract error text */
        this.emit('error', stanza)
    } else {
        this.emit('stanza', stanza)
    }
}

WSConnection.prototype.startStream = function() {
    var attrs = {}
    for(var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k) {
                attrs.xmlns = this.xmlns[k]
            } else {
                attrs['xmlns:' + k] = this.xmlns[k]
            }
        }
    }
    if (this.xmppVersion)
        attrs.version = this.xmppVersion
    if (this.streamTo)
        attrs.to = this.streamTo
    if (this.streamId)
        attrs.id = this.streamId
    if (this.jid)
        attrs.to = this.jid.domain
    attrs.xmlns = 'jabber:client'
    attrs['xmlns:stream'] = Connection.NS_STREAM

    var el = new ltx.Element('stream:stream', attrs)
    // make it non-empty to cut the closing tag
    el.t(' ')
    var s = el.toString()
    this.send(s.substr(0, s.indexOf(' </stream:stream>')))

    this.streamOpened = true
}

WSConnection.prototype.send = function(stanza) {
    if (stanza.root) stanza = stanza.root()
    stanza = stanza.toString()
    debug('ws send -->', stanza)
    this.websocket.send(stanza)
}

WSConnection.prototype.onclose = function() {
    this.emit('disconnect')
    this.emit('close')
}

WSConnection.prototype.end = function() {
    this.send('</stream:stream>')
    this.emit('disconnect')
    this.emit('end')
    if (this.websocket)
        this.websocket.close()
}

WSConnection.prototype.onerror = function(e) {
    this.emit('error', e)
}

module.exports = WSConnection

},{"debug":42,"events":14,"faye-websocket":3,"node-xmpp-core":45,"util":22}],41:[function(require,module,exports){
// Browser Request
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// UMD HEADER START 
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], factory);
    } else if (typeof exports === 'object') {
        // Node. Does not work with strict CommonJS, but
        // only CommonJS-like enviroments that support module.exports,
        // like Node.
        module.exports = factory();
    } else {
        // Browser globals (root is window)
        root.returnExports = factory();
  }
}(this, function () {
// UMD HEADER END

var XHR = XMLHttpRequest
if (!XHR) throw new Error('missing XMLHttpRequest')
request.log = {
  'trace': noop, 'debug': noop, 'info': noop, 'warn': noop, 'error': noop
}

var DEFAULT_TIMEOUT = 3 * 60 * 1000 // 3 minutes

//
// request
//

function request(options, callback) {
  // The entry-point to the API: prep the options object and pass the real work to run_xhr.
  if(typeof callback !== 'function')
    throw new Error('Bad callback given: ' + callback)

  if(!options)
    throw new Error('No options given')

  var options_onResponse = options.onResponse; // Save this for later.

  if(typeof options === 'string')
    options = {'uri':options};
  else
    options = JSON.parse(JSON.stringify(options)); // Use a duplicate for mutating.

  options.onResponse = options_onResponse // And put it back.

  if (options.verbose) request.log = getLogger();

  if(options.url) {
    options.uri = options.url;
    delete options.url;
  }

  if(!options.uri && options.uri !== "")
    throw new Error("options.uri is a required argument");

  if(typeof options.uri != "string")
    throw new Error("options.uri must be a string");

  var unsupported_options = ['proxy', '_redirectsFollowed', 'maxRedirects', 'followRedirect']
  for (var i = 0; i < unsupported_options.length; i++)
    if(options[ unsupported_options[i] ])
      throw new Error("options." + unsupported_options[i] + " is not supported")

  options.callback = callback
  options.method = options.method || 'GET';
  options.headers = options.headers || {};
  options.body    = options.body || null
  options.timeout = options.timeout || request.DEFAULT_TIMEOUT

  if(options.headers.host)
    throw new Error("Options.headers.host is not supported");

  if(options.json) {
    options.headers.accept = options.headers.accept || 'application/json'
    if(options.method !== 'GET')
      options.headers['content-type'] = 'application/json'

    if(typeof options.json !== 'boolean')
      options.body = JSON.stringify(options.json)
    else if(typeof options.body !== 'string')
      options.body = JSON.stringify(options.body)
  }
  
  //BEGIN QS Hack
  var serialize = function(obj) {
    var str = [];
    for(var p in obj)
      if (obj.hasOwnProperty(p)) {
        str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
      }
    return str.join("&");
  }
  
  if(options.qs){
    var qs = (typeof options.qs == 'string')? options.qs : serialize(options.qs);
    if(options.uri.indexOf('?') !== -1){ //no get params
        options.uri = options.uri+'&'+qs;
    }else{ //existing get params
        options.uri = options.uri+'?'+qs;
    }
  }
  //END QS Hack
  
  //BEGIN FORM Hack
  var multipart = function(obj) {
    //todo: support file type (useful?)
    var result = {};
    result.boundry = '-------------------------------'+Math.floor(Math.random()*1000000000);
    var lines = [];
    for(var p in obj){
        if (obj.hasOwnProperty(p)) {
            lines.push(
                '--'+result.boundry+"\n"+
                'Content-Disposition: form-data; name="'+p+'"'+"\n"+
                "\n"+
                obj[p]+"\n"
            );
        }
    }
    lines.push( '--'+result.boundry+'--' );
    result.body = lines.join('');
    result.length = result.body.length;
    result.type = 'multipart/form-data; boundary='+result.boundry;
    return result;
  }
  
  if(options.form){
    if(typeof options.form == 'string') throw('form name unsupported');
    if(options.method === 'POST'){
        var encoding = (options.encoding || 'application/x-www-form-urlencoded').toLowerCase();
        options.headers['content-type'] = encoding;
        switch(encoding){
            case 'application/x-www-form-urlencoded':
                options.body = serialize(options.form).replace(/%20/g, "+");
                break;
            case 'multipart/form-data':
                var multi = multipart(options.form);
                //options.headers['content-length'] = multi.length;
                options.body = multi.body;
                options.headers['content-type'] = multi.type;
                break;
            default : throw new Error('unsupported encoding:'+encoding);
        }
    }
  }
  //END FORM Hack

  // If onResponse is boolean true, call back immediately when the response is known,
  // not when the full request is complete.
  options.onResponse = options.onResponse || noop
  if(options.onResponse === true) {
    options.onResponse = callback
    options.callback = noop
  }

  // XXX Browsers do not like this.
  //if(options.body)
  //  options.headers['content-length'] = options.body.length;

  // HTTP basic authentication
  if(!options.headers.authorization && options.auth)
    options.headers.authorization = 'Basic ' + b64_enc(options.auth.username + ':' + options.auth.password);

  return run_xhr(options)
}

var req_seq = 0
function run_xhr(options) {
  var xhr = new XHR
    , timed_out = false
    , is_cors = is_crossDomain(options.uri)
    , supports_cors = ('withCredentials' in xhr)

  req_seq += 1
  xhr.seq_id = req_seq
  xhr.id = req_seq + ': ' + options.method + ' ' + options.uri
  xhr._id = xhr.id // I know I will type "_id" from habit all the time.

  if(is_cors && !supports_cors) {
    var cors_err = new Error('Browser does not support cross-origin request: ' + options.uri)
    cors_err.cors = 'unsupported'
    return options.callback(cors_err, xhr)
  }

  xhr.timeoutTimer = setTimeout(too_late, options.timeout)
  function too_late() {
    timed_out = true
    var er = new Error('ETIMEDOUT')
    er.code = 'ETIMEDOUT'
    er.duration = options.timeout

    request.log.error('Timeout', { 'id':xhr._id, 'milliseconds':options.timeout })
    return options.callback(er, xhr)
  }

  // Some states can be skipped over, so remember what is still incomplete.
  var did = {'response':false, 'loading':false, 'end':false}

  xhr.onreadystatechange = on_state_change
  xhr.open(options.method, options.uri, true) // asynchronous
  if(is_cors)
    xhr.withCredentials = !! options.withCredentials
  xhr.send(options.body)
  return xhr

  function on_state_change(event) {
    if(timed_out)
      return request.log.debug('Ignoring timed out state change', {'state':xhr.readyState, 'id':xhr.id})

    request.log.debug('State change', {'state':xhr.readyState, 'id':xhr.id, 'timed_out':timed_out})

    if(xhr.readyState === XHR.OPENED) {
      request.log.debug('Request started', {'id':xhr.id})
      for (var key in options.headers)
        xhr.setRequestHeader(key, options.headers[key])
    }

    else if(xhr.readyState === XHR.HEADERS_RECEIVED)
      on_response()

    else if(xhr.readyState === XHR.LOADING) {
      on_response()
      on_loading()
    }

    else if(xhr.readyState === XHR.DONE) {
      on_response()
      on_loading()
      on_end()
    }
  }

  function on_response() {
    if(did.response)
      return

    did.response = true
    request.log.debug('Got response', {'id':xhr.id, 'status':xhr.status})
    clearTimeout(xhr.timeoutTimer)
    xhr.statusCode = xhr.status // Node request compatibility

    // Detect failed CORS requests.
    if(is_cors && xhr.statusCode == 0) {
      var cors_err = new Error('CORS request rejected: ' + options.uri)
      cors_err.cors = 'rejected'

      // Do not process this request further.
      did.loading = true
      did.end = true

      return options.callback(cors_err, xhr)
    }

    options.onResponse(null, xhr)
  }

  function on_loading() {
    if(did.loading)
      return

    did.loading = true
    request.log.debug('Response body loading', {'id':xhr.id})
    // TODO: Maybe simulate "data" events by watching xhr.responseText
  }

  function on_end() {
    if(did.end)
      return

    did.end = true
    request.log.debug('Request done', {'id':xhr.id})

    xhr.body = xhr.responseText
    if(options.json) {
      try        { xhr.body = JSON.parse(xhr.responseText) }
      catch (er) { return options.callback(er, xhr)        }
    }

    options.callback(null, xhr, xhr.body)
  }

} // request

request.withCredentials = false;
request.DEFAULT_TIMEOUT = DEFAULT_TIMEOUT;

//
// defaults
//

request.defaults = function(options, requester) {
  var def = function (method) {
    var d = function (params, callback) {
      if(typeof params === 'string')
        params = {'uri': params};
      else {
        params = JSON.parse(JSON.stringify(params));
      }
      for (var i in options) {
        if (params[i] === undefined) params[i] = options[i]
      }
      return method(params, callback)
    }
    return d
  }
  var de = def(request)
  de.get = def(request.get)
  de.post = def(request.post)
  de.put = def(request.put)
  de.head = def(request.head)
  return de
}

//
// HTTP method shortcuts
//

var shortcuts = [ 'get', 'put', 'post', 'head' ];
shortcuts.forEach(function(shortcut) {
  var method = shortcut.toUpperCase();
  var func   = shortcut.toLowerCase();

  request[func] = function(opts) {
    if(typeof opts === 'string')
      opts = {'method':method, 'uri':opts};
    else {
      opts = JSON.parse(JSON.stringify(opts));
      opts.method = method;
    }

    var args = [opts].concat(Array.prototype.slice.apply(arguments, [1]));
    return request.apply(this, args);
  }
})

//
// CouchDB shortcut
//

request.couch = function(options, callback) {
  if(typeof options === 'string')
    options = {'uri':options}

  // Just use the request API to do JSON.
  options.json = true
  if(options.body)
    options.json = options.body
  delete options.body

  callback = callback || noop

  var xhr = request(options, couch_handler)
  return xhr

  function couch_handler(er, resp, body) {
    if(er)
      return callback(er, resp, body)

    if((resp.statusCode < 200 || resp.statusCode > 299) && body.error) {
      // The body is a Couch JSON object indicating the error.
      er = new Error('CouchDB error: ' + (body.error.reason || body.error.error))
      for (var key in body)
        er[key] = body[key]
      return callback(er, resp, body);
    }

    return callback(er, resp, body);
  }
}

//
// Utility
//

function noop() {}

function getLogger() {
  var logger = {}
    , levels = ['trace', 'debug', 'info', 'warn', 'error']
    , level, i

  for(i = 0; i < levels.length; i++) {
    level = levels[i]

    logger[level] = noop
    if(typeof console !== 'undefined' && console && console[level])
      logger[level] = formatted(console, level)
  }

  return logger
}

function formatted(obj, method) {
  return formatted_logger

  function formatted_logger(str, context) {
    if(typeof context === 'object')
      str += ' ' + JSON.stringify(context)

    return obj[method].call(obj, str)
  }
}

// Return whether a URL is a cross-domain request.
function is_crossDomain(url) {
  var rurl = /^([\w\+\.\-]+:)(?:\/\/([^\/?#:]*)(?::(\d+))?)?/

  // jQuery #8138, IE may throw an exception when accessing
  // a field from window.location if document.domain has been set
  var ajaxLocation
  try { ajaxLocation = location.href }
  catch (e) {
    // Use the href attribute of an A element since IE will modify it given document.location
    ajaxLocation = document.createElement( "a" );
    ajaxLocation.href = "";
    ajaxLocation = ajaxLocation.href;
  }

  var ajaxLocParts = rurl.exec(ajaxLocation.toLowerCase()) || []
    , parts = rurl.exec(url.toLowerCase() )

  var result = !!(
    parts &&
    (  parts[1] != ajaxLocParts[1]
    || parts[2] != ajaxLocParts[2]
    || (parts[3] || (parts[1] === "http:" ? 80 : 443)) != (ajaxLocParts[3] || (ajaxLocParts[1] === "http:" ? 80 : 443))
    )
  )

  //console.debug('is_crossDomain('+url+') -> ' + result)
  return result
}

// MIT License from http://phpjs.org/functions/base64_encode:358
function b64_enc (data) {
    // Encodes string using MIME base64 algorithm
    var b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    var o1, o2, o3, h1, h2, h3, h4, bits, i = 0, ac = 0, enc="", tmp_arr = [];

    if (!data) {
        return data;
    }

    // assume utf8 data
    // data = this.utf8_encode(data+'');

    do { // pack three octets into four hexets
        o1 = data.charCodeAt(i++);
        o2 = data.charCodeAt(i++);
        o3 = data.charCodeAt(i++);

        bits = o1<<16 | o2<<8 | o3;

        h1 = bits>>18 & 0x3f;
        h2 = bits>>12 & 0x3f;
        h3 = bits>>6 & 0x3f;
        h4 = bits & 0x3f;

        // use hexets to index into b64, and append result to encoded string
        tmp_arr[ac++] = b64.charAt(h1) + b64.charAt(h2) + b64.charAt(h3) + b64.charAt(h4);
    } while (i < data.length);

    enc = tmp_arr.join('');

    switch (data.length % 3) {
        case 1:
            enc = enc.slice(0, -2) + '==';
        break;
        case 2:
            enc = enc.slice(0, -1) + '=';
        break;
    }

    return enc;
}
    return request;
//UMD FOOTER START
}));
//UMD FOOTER END

},{}],42:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // This hackery is required for IE8,
  // where the `console.log` function doesn't have 'apply'
  return 'object' == typeof console
    && 'function' == typeof console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      localStorage.removeItem('debug');
    } else {
      localStorage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = localStorage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

},{"./debug":43}],43:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = debug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lowercased letter, i.e. "n".
 */

exports.formatters = {};

/**
 * Previously assigned color.
 */

var prevColor = 0;

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 *
 * @return {Number}
 * @api private
 */

function selectColor() {
  return exports.colors[prevColor++ % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function debug(namespace) {

  // define the `disabled` version
  function disabled() {
  }
  disabled.enabled = false;

  // define the `enabled` version
  function enabled() {

    var self = enabled;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // add the `color` if not set
    if (null == self.useColors) self.useColors = exports.useColors();
    if (null == self.color && self.useColors) self.color = selectColor();

    var args = Array.prototype.slice.call(arguments);

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %o
      args = ['%o'].concat(args);
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    if ('function' === typeof exports.formatArgs) {
      args = exports.formatArgs.apply(self, args);
    }
    var logFn = enabled.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }
  enabled.enabled = true;

  var fn = exports.enabled(namespace) ? enabled : disabled;

  fn.namespace = namespace;

  return fn;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  var split = (namespaces || '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":44}],44:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(ms|seconds?|s|minutes?|m|hours?|h|days?|d|years?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 's':
      return n * s;
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],45:[function(require,module,exports){
var extend = require('util')._extend

exports.Stanza = {}
extend(exports.Stanza, require('./lib/stanza'))
exports.JID = require('./lib/jid')
exports.Connection = require('./lib/connection')
exports.SRV = require('./lib/srv')
exports.StreamParser = require('./lib/stream_parser')
exports.ltx = require('ltx')
},{"./lib/connection":46,"./lib/jid":47,"./lib/srv":48,"./lib/stanza":49,"./lib/stream_parser":50,"ltx":56,"util":22}],46:[function(require,module,exports){
'use strict';

var net = require('net')
  , EventEmitter = require('events').EventEmitter
  , util = require('util')
  , ltx = require('ltx')
  , reconnect = require('reconnect-core')
  , StreamParser = require('./stream_parser')
  , starttls = require('tls-connect')
  , debug = require('debug')('xmpp:connection')
  , extend = require('util')._extend

var NS_XMPP_TLS = 'urn:ietf:params:xml:ns:xmpp-tls'
var NS_STREAM = 'http://etherx.jabber.org/streams'
var NS_XMPP_STREAMS = 'urn:ietf:params:xml:ns:xmpp-streams'

var INITIAL_RECONNECT_DELAY = 1e3
var MAX_RECONNECT_DELAY     = 30e3

function defaultInjection(emitter, opts) {
    // clone opts
    var options = extend({}, opts)

    // add computed options
    /* jshint -W014 */
    options.initialDelay = (opts && (opts.initialReconnectDelay
                            ||  opts.reconnectDelay)) || INITIAL_RECONNECT_DELAY
    options.maxDelay = (opts && opts.maxReconnectDelay) || MAX_RECONNECT_DELAY
    options.immediate = opts && opts.socket && (typeof opts.socket !== 'function')
    options.type = opts && opts.delayType
    options.emitter = emitter

    // return calculated options
    return options
}

/**
 Base class for connection-based streams (TCP).
 The socket parameter is optional for incoming connections.
*/
function Connection(opts) {
    
    EventEmitter.call(this)

    this.streamAttrs = (opts && opts.streamAttrs) || {}
    this.xmlns = (opts && opts.xmlns) || {}
    this.xmlns.stream = NS_STREAM

    this.rejectUnauthorized = (opts && opts.rejectUnauthorized) ? true : false
    this.serialized = (opts && opts.serialized) ? true : false
    this.requestCert = (opts && opts.requestCert) ? true : false

    this.servername = (opts && opts.servername)

    this._setupSocket(defaultInjection(this, opts))
    this.once('reconnect', function() {
        this.reconnect = opts && opts.reconnect
    })
}

util.inherits(Connection, EventEmitter)

Connection.prototype.NS_XMPP_TLS = NS_XMPP_TLS
Connection.NS_STREAM = NS_STREAM
Connection.prototype.NS_XMPP_STREAMS = NS_XMPP_STREAMS
// Defaults
Connection.prototype.allowTLS = true

Connection.prototype._setupSocket = function(options) {
    debug('setup socket')
    var previousOptions = {}
    var inject = reconnect(function(opts) {
        var previousSocket = this.socket
        /* if this opts.preserve is on
         * the previous options are stored until next time.
         * this is needed to restore from a setSecure call.
         */
        if (opts.preserve === 'on') {
            opts.preserve = previousOptions
            previousOptions = opts
        } else if (opts.preserve) {
            // switch back to the preversed options
            opts = previousOptions = opts.preserve
        } else {
            // keep some state for eg SRV.connect
            opts = previousOptions = opts || previousOptions
        }

        if (typeof opts.socket === 'function') {
            debug('use lazy socket')
            /* lazy evaluation
             * (can be retriggered by calling connection.connect()
             *  without arguments after a previous
             *  connection.connect({socket:function() { … }})) */
            this.socket = opts.socket.call(this)
        } else {
            debug('use standard socket')
            // only use this socket once
            this.socket = opts.socket
            opts.socket = null
            if (this.socket) {
                this.once('connect', function () {
                    inject.options.immediate = false
                })
            }
        }
        this.socket = this.socket || new net.Socket()
        if (previousSocket !== this.socket) {
            this.setupStream()
        }
        return this.socket
    }.bind(this))

    inject(inject.options = options)

    //wrap the end function provided by reconnect-core to trigger the stream end logic
    var end = this.end
    this.end = this.disconnect = function() {
        this.endStream()
        end()
    }

    this.on('connection', function () {
        if (!this.parser)
            this.startParser()
    })
    this.on('end', function () {
        previousOptions = {}
    })
}

/**
 Used by both the constructor and by reinitialization in setSecure().
*/
Connection.prototype.setupStream = function() {
    debug('setup stream')
    this.socket.on('end', this.onEnd.bind(this))
    this.socket.on('data', this.onData.bind(this))
    this.socket.on('close', this.onClose.bind(this))
    // let them sniff unparsed XML
    this.socket.on('data',  this.emit.bind(this, 'data'))
    this.socket.on('drain', this.emit.bind(this, 'drain'))
    // ignore errors after disconnect
    this.socket.on('error', function () { })

    if (!this.socket.serializeStanza) {
        /**
        * This is optimized for continuous TCP streams. If your "socket"
        * actually transports frames (WebSockets) and you can't have
        * stanzas split across those, use:
        *     cb(el.toString())
        */
        if (this.serialized) {
            this.socket.serializeStanza = function(el, cb) {
                // Continuously write out
                el.write(function(s) {
                    cb(s)
                })
            }
        } else {
            this.socket.serializeStanza = function(el, cb) {
                cb(el.toString())
            }
        }
    }
}

Connection.prototype.pause = function() {
    if (this.socket.pause) this.socket.pause()
}

Connection.prototype.resume = function() {
    if (this.socket.resume) this.socket.resume()
}

/** Climbs the stanza up if a child was passed,
    but you can send strings and buffers too.

    Returns whether the socket flushed data.
*/
Connection.prototype.send = function(stanza) {
    var flushed = true
    if (!this.socket) {
        return // Doh!
    }
    if (!this.socket.writable) {
        this.socket.end()
        return
    }

    debug('send: ' + stanza.toString())
    if (stanza.root) {
        var el = this.rmXmlns(stanza.root())
        this.socket.serializeStanza(el, function(s) {
            flushed = this.write(s)
        }.bind(this.socket))
    } else {
        flushed = this.socket.write(stanza)
    }
    return flushed
}

Connection.prototype.startParser = function() {
    var self = this
    this.parser = new StreamParser.StreamParser(this.maxStanzaSize)

    this.parser.on('streamStart', function(attrs) {
        /* We need those xmlns often, store them extra */
        self.streamNsAttrs = {}
        for (var k in attrs) {
            if (k === 'xmlns' || (k.substr(0, 6) === 'xmlns:'))
                self.streamNsAttrs[k] = attrs[k]
        }

        /* Notify in case we don't wait for <stream:features/>
           (Component or non-1.0 streams)
         */
        self.emit('streamStart', attrs)
    })
    this.parser.on('stanza', function(stanza) {
        self.onStanza(self.addStreamNs(stanza))
    })
    this.parser.on('error', function(e) {
        self.error(e.condition || 'internal-server-error', e.message)
    })
    this.parser.once('end', function() {
        self.stopParser()
        if (self.reconnect) {
            self.once('reconnect', self.startParser.bind(self))
        } else {
            self.end()
        }
    })
}

Connection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        var parser = this.parser
        /* Get GC'ed */
        this.parser = null
        parser.end()
    }
}

Connection.prototype.startStream = function() {
    var attrs = {}
    for (var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k) {
                attrs.xmlns = this.xmlns[k]
            } else {
                attrs['xmlns:' + k] = this.xmlns[k]
            }
        }
    }
    for (k in this.streamAttrs) {
        if (this.streamAttrs.hasOwnProperty(k)) {
            attrs[k] = this.streamAttrs[k]
        }
    }

    if (this.streamTo) { // in case of a component connecting
        attrs.to = this.streamTo
    }

    var el = new ltx.Element('stream:stream', attrs)
    // make it non-empty to cut the closing tag
    el.t(' ')
    var s = el.toString()
    this.send(s.substr(0, s.indexOf(' </stream:stream>')))

    this.streamOpened = true
}

Connection.prototype.endStream = function() {
    if (this.socket && this.socket.writable) {
        if (this.streamOpened) {
            this.socket.write('</stream:stream>')
            this.streamOpened = false
        }
    }
}

Connection.prototype.onData = function(data) {
    debug('receive: ' + data.toString('utf8'))
    if (this.parser) {
        this.parser.write(data)
    }
}

Connection.prototype.setSecure = function(credentials, isServer) {
    // Remove old event listeners
    this.socket.removeAllListeners('data')
    // retain socket 'end' listeners because ssl layer doesn't support it
    this.socket.removeAllListeners('drain')
    this.socket.removeAllListeners('close')
    // remove idle_timeout
    if (this.socket.clearTimer) {
        this.socket.clearTimer()
    }

    var cleartext = starttls({
        socket: this.socket,
        rejectUnauthorized: this.rejectUnauthorized,
        credentials: credentials || this.credentials,
        requestCert: this.requestCert,
        isServer: !!isServer
    }, function() {
        this.isSecure = true
        this.once('disconnect', function () {
            this.isSecure = false
        })
        cleartext.emit('connect', cleartext)
    }.bind(this))
    cleartext.on('clientError', this.emit.bind(this, 'error'))
    if (!this.reconnect) {
        this.reconnect = true // need this so stopParser works properly
        this.once('reconnect', function() { this.reconnect = false })
    }
    this.stopParser()
    // if we reconnect we need to get back to the previous socket creation
    this.listen({ socket: cleartext, preserve:'on' })
}

function getAllText(el) {
    return !el.children ? el : el.children.reduce(function(text, child) {
        return text + getAllText(child)
    }, '')
}

/**
 * This is not an event listener, but takes care of the TLS handshake
 * before 'stanza' events are emitted to the derived classes.
 */
Connection.prototype.onStanza = function(stanza) {
    if (stanza.is('error', NS_STREAM)) {
        var error = new Error('' + getAllText(stanza))
        error.stanza = stanza
        this.socket.emit('error', error)
    } else if (stanza.is('features', this.NS_STREAM) &&
        this.allowTLS &&
        !this.isSecure &&
        stanza.getChild('starttls', this.NS_XMPP_TLS)) {
        /* Signal willingness to perform TLS handshake */
        this.send(new ltx.Element('starttls', { xmlns: this.NS_XMPP_TLS }))
    } else if (this.allowTLS &&
        stanza.is('proceed', this.NS_XMPP_TLS)) {
        /* Server is waiting for TLS handshake */
        this.setSecure()
    } else {
        this.emit('stanza', stanza)
    }
}

/**
 * Add stream xmlns to a stanza
 *
 * Does not add our default xmlns as it is different for
 * C2S/S2S/Component connections.
 */
Connection.prototype.addStreamNs = function(stanza) {
    for (var attr in this.streamNsAttrs) {
        if (!stanza.attrs[attr] &&
            !((attr === 'xmlns') && (this.streamNsAttrs[attr] === this.xmlns['']))
           ) {
            stanza.attrs[attr] = this.streamNsAttrs[attr]
        }
    }
    return stanza
}

/**
 * Remove superfluous xmlns that were aleady declared in
 * our <stream:stream>
 */
Connection.prototype.rmXmlns = function(stanza) {
    for (var prefix in this.xmlns) {
        var attr = prefix ? 'xmlns:' + prefix : 'xmlns'
        if (stanza.attrs[attr] === this.xmlns[prefix]) {
            stanza.attrs[attr] = null
        }
    }
    return stanza
}

/**
 * XMPP-style end connection for user
 */
Connection.prototype.onEnd = function() {
    this.endStream()
    if (!this.reconnect) {
        this.emit('end')
    }
}

Connection.prototype.onClose = function() {
    if (!this.reconnect) {
        this.emit('close')
    }
}

/**
 * End connection with stream error.
 * Emits 'error' event too.
 *
 * @param {String} condition XMPP error condition, see RFC3920 4.7.3. Defined Conditions
 * @param {String} text Optional error message
 */
Connection.prototype.error = function(condition, message) {
    this.emit('error', new Error(message))

    if (!this.socket || !this.socket.writable) return

    /* RFC 3920, 4.7.1 stream-level errors rules */
    if (!this.streamOpened) this.startStream()

    var error = new ltx.Element('stream:error')
    error.c(condition, { xmlns: NS_XMPP_STREAMS })
    if (message) {
        error.c( 'text', {
            xmlns: NS_XMPP_STREAMS,
            'xml:lang': 'en'
        }).t(message)
    }

    this.send(error)
    this.end()
}

module.exports = Connection

},{"./stream_parser":50,"debug":51,"events":14,"ltx":56,"net":3,"reconnect-core":66,"tls-connect":73,"util":22}],47:[function(require,module,exports){
var StringPrep = require('node-stringprep').StringPrep
  , toUnicode = require('node-stringprep').toUnicode


/**
 * JID implements 
 * - Xmpp addresses according to RFC6122
 * - XEP-0106: JID Escaping
 *
 * @see http://tools.ietf.org/html/rfc6122#section-2
 * @see http://xmpp.org/extensions/xep-0106.html
 */
function JID(a, b, c) {
    this.local = null
    this.domain = null
    this.resource = null

    if (a && (!b) && (!c)) {
        this.parseJID(a)
    } else if (b) {
        this.setLocal(a)
        this.setDomain(b)
        this.setResource(c)
    } else {
        throw new Error('Argument error')
    }
}

JID.prototype.parseJID = function(s) {
    if (s.indexOf('@') >= 0) {
        this.setLocal(s.substr(0, s.lastIndexOf('@')))
        s = s.substr(s.lastIndexOf('@') + 1)
    }
    if (s.indexOf('/') >= 0) {
        this.setResource(s.substr(s.indexOf('/') + 1))
        s = s.substr(0, s.indexOf('/'))
    }
    this.setDomain(s)
}

JID.prototype.toString = function(unescape) {
    var s = this.domain
    if (this.local) s = this.getLocal(unescape) + '@' + s
    if (this.resource) s = s + '/' + this.resource
    return s
}

/**
 * Convenience method to distinguish users
 **/
JID.prototype.bare = function() {
    if (this.resource) {
        return new JID(this.local, this.domain, null)
    } else {
        return this
    }
}

/**
 * Comparison function
 **/
JID.prototype.equals = function(other) {
    return (this.local === other.local) &&
        (this.domain === other.domain) &&
        (this.resource === other.resource)
}

/* Deprecated, use setLocal() [see RFC6122] */
JID.prototype.setUser = function(user) {
    return this.setLocal(user)
}

/**
 * Setters that do stringprep normalization.
 **/
JID.prototype.setLocal = function(local, escape) {
    escape = escape || this.detectEscape(local)

    if (escape) {
        local = this.escapeLocal(local)
    }

    this.local = this.user = local && this.prep('nodeprep', local)
    return this
}

/**
 * http://xmpp.org/rfcs/rfc6122.html#addressing-domain
 */
JID.prototype.setDomain = function(domain) {
    this.domain = domain &&
        this.prep('nameprep', domain.split('.').map(toUnicode).join('.'))
    return this
}

JID.prototype.setResource = function(resource) {
    this.resource = resource && this.prep('resourceprep', resource)
    return this
}

JID.prototype.getLocal = function(unescape) {
    unescape = unescape || false
    var local = null
    
    if (unescape) {
        local = this.unescapeLocal(this.local)
    } else {
        local = this.local
    }

    return local;
}

JID.prototype.prep = function(operation, value) {
    var p = new StringPrep(operation)
    return p.prepare(value)
}

/* Deprecated, use getLocal() [see RFC6122] */
JID.prototype.getUser = function() {
    return this.getLocal()
}

JID.prototype.getDomain = function() {
    return this.domain
}

JID.prototype.getResource = function() {
    return this.resource
}

JID.prototype.detectEscape = function (local) {
    if (!local) return false

    // remove all escaped secquences
    var tmp = local.replace(/\\20/g, '')
        .replace(/\\22/g, '')
        .replace(/\\26/g, '')
        .replace(/\\27/g, '')
        .replace(/\\2f/g, '')
        .replace(/\\3a/g, '')
        .replace(/\\3c/g, '')
        .replace(/\\3e/g, '')
        .replace(/\\40/g, '')
        .replace(/\\5c/g, '')

    // detect if we have unescaped sequences
    var search = tmp.search(/\\| |\"|\&|\'|\/|:|<|>|@/g);
    if (search === -1) {
        return false
    } else {
        return true
    }
}

/** 
 * Escape the local part of a JID.
 *
 * @see http://xmpp.org/extensions/xep-0106.html
 * @param String local local part of a jid
 * @return An escaped local part
 */
JID.prototype.escapeLocal = function (local) {
    if (local === null) return null

    /* jshint -W044 */
    return local.replace(/^\s+|\s+$/g, '')
        .replace(/\\/g, '\\5c')
        .replace(/ /g, '\\20')
        .replace(/\"/g, '\\22')
        .replace(/\&/g, '\\26')
        .replace(/\'/g, '\\27')
        .replace(/\//g, '\\2f')
        .replace(/:/g, '\\3a')
        .replace(/</g, '\\3c')
        .replace(/>/g, '\\3e')
        .replace(/@/g, '\\40')
        .replace(/\3a/g, '\5c3a')
       
    
}

/** 
 * Unescape a local part of a JID.
 *
 * @see http://xmpp.org/extensions/xep-0106.html
 * @param String local local part of a jid
 * @return unescaped local part
 */
JID.prototype.unescapeLocal = function (local) {
    if (local === null) return null

    return local.replace(/\\20/g, ' ')
        .replace(/\\22/g, '\"')
        .replace(/\\26/g, '&')
        .replace(/\\27/g, '\'')
        .replace(/\\2f/g, '/')
        .replace(/\\3a/g, ':')
        .replace(/\\3c/g, '<')
        .replace(/\\3e/g, '>')
        .replace(/\\40/g, '@')
        .replace(/\\5c/g, '\\')
}

if ((typeof exports !== 'undefined') && (exports !== null)) {
    module.exports = JID
} else if ((typeof window !== 'undefined') && (window !== null)) {
    window.JID = JID
}

},{"node-stringprep":60}],48:[function(require,module,exports){
'use strict';


var dns = require('dns')

function compareNumbers(a, b) {
    a = parseInt(a, 10)
    b = parseInt(b, 10)
    if (a < b)
        return -1
    if (a > b)
        return 1
    return 0
}

function groupSrvRecords(addrs) {
    var groups = {}  // by priority
    addrs.forEach(function(addr) {
        if (!groups.hasOwnProperty(addr.priority))
            groups[addr.priority] = []

        groups[addr.priority].push(addr)
    })

    var result = []
    Object.keys(groups).sort(compareNumbers).forEach(function(priority) {
        var group = groups[priority]
        var totalWeight = 0
        group.forEach(function(addr) {
            totalWeight += addr.weight
        })
        var w = Math.floor(Math.random() * totalWeight)
        totalWeight = 0
        var candidate = group[0]
        group.forEach(function(addr) {
            totalWeight += addr.weight
            if (w < totalWeight)
                candidate = addr
        })
        if (candidate)
            result.push(candidate)
    })
    return result
}

function resolveSrv(name, cb) {
    dns.resolveSrv(name, function(err, addrs) {
        if (err) {
            /* no SRV record, try domain as A */
            cb(err)
        } else {
            var pending = 0, error, results = []
            var cb1 = function(e, addrs1) {
                error = error || e
                results = results.concat(addrs1)
                pending--
                if (pending < 1) {
                    cb(results ? null : error, results)
                }
            }
            var gSRV = groupSrvRecords(addrs)
            pending = gSRV.length
            gSRV.forEach(function(addr) {
                resolveHost(addr.name, function(e, a) {
                    if (a) {
                        a = a.map(function(a1) {
                            return { name: a1, port: addr.port }
                        })
                    }
                    cb1(e, a)
                })
            })
        }
    })
}

// one of both A & AAAA, in case of broken tunnels
function resolveHost(name, cb) {
    var error, results = []
    var cb1 = function(e, addr) {
        error = error || e
        if (addr)
            results.push(addr)

        cb((results.length > 0) ? null : error, results)
    }

    dns.lookup(name, cb1)
}

// connection attempts to multiple addresses in a row
function tryConnect(connection, addrs) {
    connection.on('connect', cleanup)
    connection.on('disconnect', connectNext)
    return connectNext()

    function cleanup() {
        connection.removeListener('connect', cleanup)
        connection.removeListener('disconnect', connectNext)
    }

    function connectNext() {
        var addr = addrs.shift()
        if (addr)
            connection.socket.connect(addr.port, addr.name)
        else
            cleanup()
    }
}

// returns a lazy iterator which can be restarted via connection.connect()
exports.connect = function connect(opts) {
    var services = opts.services.slice()
    // lazy evaluation to determine endpoint
    function tryServices(retry) {
        /* jshint -W040 */
        var connection = this
        if (!connection.socket && opts.socket) {
            if (typeof opts.socket === 'function') {
                connection.socket = opts.socket.call(this)
            } else {
                connection.socket = opts.socket
            }
            opts.socket = null
        } else if (!retry) {
            connection.socket = null
        }
        var service = services.shift()
        if (service) {
            resolveSrv(service + '.' + opts.domain, function(error, addrs) {
                if (addrs)
                    tryConnect(connection, addrs)
                // call tryServices again
                else {
                    tryServices.call(connection, 'retry')
                }
            })
        } else {
            resolveHost(opts.domain, function(error, addrs) {
                if (addrs && addrs.length > 0) {
                    addrs = addrs.map(function(addr) {
                        return { name: addr,
                                 port: opts.defaultPort }
                    })
                    tryConnect(connection, addrs)
                } else if (connection.reconnect)  {
                    // retry from the beginning
                    services = opts.services.slice()
                    // get a new socket
                    connection.socket = null
                } else {
                    error = error || new Error('No addresses resolved for ' +
                                                opts.domain)
                    connection.emit('error', error)
                }
            })
        }
        return connection.socket
    }
    return tryServices
}

},{"dns":3}],49:[function(require,module,exports){
'use strict';

var util = require('util')
  , ltx = require('ltx')

function Stanza(name, attrs) {
    ltx.Element.call(this, name, attrs)
}

util.inherits(Stanza, ltx.Element)

Stanza.prototype.clone = function() {
    var clone = new Stanza(this.name, {})
    for (var k in this.attrs) {
        if (this.attrs.hasOwnProperty(k))
            clone.attrs[k] = this.attrs[k]
    }
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

/**
 * Common attribute getters/setters for all stanzas
 */

Object.defineProperty(Stanza.prototype, 'from', {
    get: function() {
        return this.attrs.from
    },

    set: function(from) {
        this.attrs.from = from
    }
});

Object.defineProperty(Stanza.prototype, 'to', {
    get: function() {
        return this.attrs.to
    },

    set: function(to) {
        this.attrs.to = to
    }
});

Object.defineProperty(Stanza.prototype, 'id', {
    get: function() {
        return this.attrs.id
    },

    set: function(id) {
        this.attrs.id = id
    }
});

Object.defineProperty(Stanza.prototype, 'type', {
    get: function() {
        return this.attrs.type
    },

    set: function(type) {
        this.attrs.type = type
    }
});

/**
 * Stanza kinds
 */

function Message(attrs) {
    Stanza.call(this, 'message', attrs)
}

util.inherits(Message, Stanza)

function Presence(attrs) {
    Stanza.call(this, 'presence', attrs)
}

util.inherits(Presence, Stanza)

function Iq(attrs) {
    Stanza.call(this, 'iq', attrs)
}

util.inherits(Iq, Stanza)

exports.Element = ltx.Element
exports.Stanza = Stanza
exports.Message = Message
exports.Presence = Presence
exports.Iq = Iq

},{"ltx":56,"util":22}],50:[function(require,module,exports){
'use strict';

var util = require('util')
  , EventEmitter = require('events').EventEmitter
  , ltx = require('ltx')
  , Stanza = require('./stanza').Stanza

/**
 * Recognizes <stream:stream> and collects stanzas used for ordinary
 * TCP streams and Websockets.
 *
 * API: write(data) & end(data)
 * Events: streamStart, stanza, end, error
 */
function StreamParser(maxStanzaSize) {
    EventEmitter.call(this)

    var self = this
    this.parser = new ltx.bestSaxParser()

    /* Count traffic for entire life-time */
    this.bytesParsed = 0
    this.maxStanzaSize = maxStanzaSize
    /* Will be reset upon first stanza, but enforce maxStanzaSize until it is parsed */
    this.bytesParsedOnStanzaBegin = 0

    this.parser.on('startElement', function(name, attrs) {
            // TODO: refuse anything but <stream:stream>
            if (!self.element && (name === 'stream:stream')) {
                self.emit('streamStart', attrs)
            } else {
                var child
                if (!self.element) {
                    /* A new stanza */
                    child = new Stanza(name, attrs)
                    self.element = child
                      /* For maxStanzaSize enforcement */
                    self.bytesParsedOnStanzaBegin = self.bytesParsed
                } else {
                    /* A child element of a stanza */
                    child = new ltx.Element(name, attrs)
                    self.element = self.element.cnode(child)
                }
            }
        }
    )

    this.parser.on('endElement', function(name) {
        if (!self.element && (name === 'stream:stream')) {
            self.end()
        } else if (self.element && (name === self.element.name)) {
            if (self.element.parent) {
                self.element = self.element.parent
            } else {
                /* Stanza complete */
                self.emit('stanza', self.element)
                delete self.element
                /* maxStanzaSize doesn't apply until next startElement */
                delete self.bytesParsedOnStanzaBegin
            }
        } else {
            self.error('xml-not-well-formed', 'XML parse error')
        }
    })

    this.parser.on('text', function(str) {
        if (self.element)
            self.element.t(str)
    })

    this.parser.on('entityDecl', function() {
        /* Entity declarations are forbidden in XMPP. We must abort to
         * avoid a billion laughs.
         */
        self.error('xml-not-well-formed', 'No entity declarations allowed')
        self.end()
    })

    this.parser.on('error', this.emit.bind(this, 'error'))
}

util.inherits(StreamParser, EventEmitter)


/* 
 * hack for most usecases, do we have a better idea?
 *   catch the following:
 *   <?xml version="1.0"?>
 *   <?xml version="1.0" encoding="UTF-8"?>
 *   <?xml version="1.0" encoding="UTF-16" standalone="yes"?>
 */
StreamParser.prototype.checkXMLHeader = function (data) {
    // check for xml tag
    var index = data.indexOf('<?xml');

    if (index !== -1) {
        var end = data.indexOf('?>');
        if (index >= 0 && end >= 0 && index < end+2) {
            var search = data.substring(index,end+2);
            data = data.replace(search, '');
        }
    }

    return data;
}

StreamParser.prototype.write = function(data) {
    /*if (/^<stream:stream [^>]+\/>$/.test(data)) {
    data = data.replace(/\/>$/, ">")
    }*/
    if (this.parser) {
        
        data = data.toString('utf8')
        data = this.checkXMLHeader(data)

    /* If a maxStanzaSize is configured, the current stanza must consist only of this many bytes */
        if (this.bytesParsedOnStanzaBegin && this.maxStanzaSize &&
            this.bytesParsed > this.bytesParsedOnStanzaBegin + this.maxStanzaSize) {

            this.error('policy-violation', 'Maximum stanza size exceeded')
            return
        }
        this.bytesParsed += data.length

        this.parser.write(data)
    }
}

StreamParser.prototype.end = function(data) {
    if (data) {
        this.write(data)
    }
    /* Get GC'ed */
    delete this.parser
    this.emit('end')
}

StreamParser.prototype.error = function(condition, message) {
    var e = new Error(message)
    e.condition = condition
    this.emit('error', e)
}

exports.StreamParser = StreamParser
},{"./stanza":49,"events":14,"ltx":56,"util":22}],51:[function(require,module,exports){

/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;

/**
 * Use chrome.storage.local if we are in an app
 */

var storage;

if (typeof chrome !== 'undefined' && typeof chrome.storage !== 'undefined')
  storage = chrome.storage.local;
else
  storage = localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // is webkit? http://stackoverflow.com/a/16459606/376773
  return ('WebkitAppearance' in document.documentElement.style) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (window.console && (console.firebug || (console.exception && console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31);
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  return JSON.stringify(v);
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs() {
  var args = arguments;
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return args;

  var c = 'color: ' + this.color;
  args = [args[0], c, 'color: inherit'].concat(Array.prototype.slice.call(args, 1));

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
  return args;
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      storage.removeItem('debug');
    } else {
      storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = storage.debug;
  } catch(e) {}
  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage(){
  try {
    return window.localStorage;
  } catch (e) {}
}

},{"./debug":52}],52:[function(require,module,exports){
arguments[4][43][0].apply(exports,arguments)
},{"ms":53}],53:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} options
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options){
  options = options || {};
  if ('string' == typeof val) return parse(val);
  return options.long
    ? long(val)
    : short(val);
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
  if (!match) return;
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function short(ms) {
  if (ms >= d) return Math.round(ms / d) + 'd';
  if (ms >= h) return Math.round(ms / h) + 'h';
  if (ms >= m) return Math.round(ms / m) + 'm';
  if (ms >= s) return Math.round(ms / s) + 's';
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function long(ms) {
  return plural(ms, d, 'day')
    || plural(ms, h, 'hour')
    || plural(ms, m, 'minute')
    || plural(ms, s, 'second')
    || ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) return;
  if (ms < n * 1.5) return Math.floor(ms / n) + ' ' + name;
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],54:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"./element":55,"util":22}],55:[function(require,module,exports){
'use strict';

/**
 * This cheap replica of DOM/Builder puts me to shame :-)
 *
 * Attributes are in the element.attrs object. Children is a list of
 * either other Elements or Strings for text content.
 **/
function Element(name, attrs) {
    this.name = name
    this.parent = null
    this.children = []
    this.setAttrs(attrs)
}

/*** Accessors ***/

/**
 * if (element.is('message', 'jabber:client')) ...
 **/
Element.prototype.is = function(name, xmlns) {
    return (this.getName() === name) &&
        (!xmlns || (this.getNS() === xmlns))
}

/* without prefix */
Element.prototype.getName = function() {
    if (this.name.indexOf(':') >= 0) {
        return this.name.substr(this.name.indexOf(':') + 1)
    } else {
        return this.name
    }
}

/**
 * retrieves the namespace of the current element, upwards recursively
 **/
Element.prototype.getNS = function() {
    if (this.name.indexOf(':') >= 0) {
        var prefix = this.name.substr(0, this.name.indexOf(':'))
        return this.findNS(prefix)
    }
    return this.findNS()
}

/**
 * find the namespace to the given prefix, upwards recursively
 **/
Element.prototype.findNS = function(prefix) {
    if (!prefix) {
        /* default namespace */
        if (this.attrs.xmlns) {
            return this.attrs.xmlns
        } else if (this.parent) {
            return this.parent.findNS()
        }
    } else {
        /* prefixed namespace */
        var attr = 'xmlns:' + prefix
        if (this.attrs[attr]) {
            return this.attrs[attr]
        } else if (this.parent) {
            return this.parent.findNS(prefix)
        }
    }
}

/**
 * Recursiverly gets all xmlns defined, in the form of {url:prefix}
 **/
Element.prototype.getXmlns = function() {
    var namespaces = {}

    if (this.parent) {
        namespaces = this.parent.getXmlns()
    }

    for (var attr in this.attrs) {
        var m = attr.match('xmlns:?(.*)')
        if (this.attrs.hasOwnProperty(attr) && m) {
            namespaces[this.attrs[attr]] = m[1]
        }
    }
    return namespaces
}

Element.prototype.setAttrs = function(attrs) {
    this.attrs = {}

    if (typeof attrs === 'string')
        this.attrs.xmlns = attrs
    else if (attrs) {
        Object.keys(attrs).forEach(function(key) {
            this.attrs[key] = attrs[key]
        }, this)
    }
}

/**
 * xmlns can be null, returns the matching attribute.
 **/
Element.prototype.getAttr = function(name, xmlns) {
    if (!xmlns) {
        return this.attrs[name]
    }

    var namespaces = this.getXmlns()

    if (!namespaces[xmlns]) {
        return null
    }

    return this.attrs[[namespaces[xmlns], name].join(':')]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChild = function(name, xmlns) {
    return this.getChildren(name, xmlns)[0]
}

/**
 * xmlns can be null
 **/
Element.prototype.getChildren = function(name, xmlns) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.getName &&
            (child.getName() === name) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
    }
    return result
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildByAttr = function(attr, val, xmlns, recursive) {
    return this.getChildrenByAttr(attr, val, xmlns, recursive)[0]
}

/**
 * xmlns and recursive can be null
 **/
Element.prototype.getChildrenByAttr = function(attr, val, xmlns, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (child.attrs &&
            (child.attrs[attr] === val) &&
            (!xmlns || (child.getNS() === xmlns)))
            result.push(child)
        if (recursive && child.getChildrenByAttr) {
            result.push(child.getChildrenByAttr(attr, val, xmlns, true))
        }
    }
    if (recursive) {
        result = [].concat.apply([], result)
    }
    return result
}

Element.prototype.getChildrenByFilter = function(filter, recursive) {
    var result = []
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if (filter(child))
            result.push(child)
        if (recursive && child.getChildrenByFilter){
            result.push(child.getChildrenByFilter(filter, true))
        }
    }
    if (recursive) {
        result = [].concat.apply([], result)
    }
    return result
}

Element.prototype.getText = function() {
    var text = ''
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        if ((typeof child === 'string') || (typeof child === 'number')) {
            text += child
        }
    }
    return text
}

Element.prototype.getChildText = function(name, xmlns) {
    var child = this.getChild(name, xmlns)
    return child ? child.getText() : null
}

/**
 * Return all direct descendents that are Elements.
 * This differs from `getChildren` in that it will exclude text nodes,
 * processing instructions, etc.
 */
Element.prototype.getChildElements = function() {
    return this.getChildrenByFilter(function(child) {
        return child instanceof Element
    })
}

/*** Builder ***/

/** returns uppermost parent */
Element.prototype.root = function() {
    if (this.parent) {
        return this.parent.root()
    }
    return this
}
Element.prototype.tree = Element.prototype.root

/** just parent or itself */
Element.prototype.up = function() {
    if (this.parent) {
        return this.parent
    }
    return this
}

Element.prototype._getElement = function(name, attrs) {
    var element = new Element(name, attrs)
    return element
}

/** create child node and return it */
Element.prototype.c = function(name, attrs) {
    return this.cnode(this._getElement(name, attrs))
}

Element.prototype.cnode = function(child) {
    this.children.push(child)
    if (typeof child === 'object') {
        child.parent = this
    }
    return child
}

/** add text node and return element */
Element.prototype.t = function(text) {
    this.children.push(text)
    return this
}

/*** Manipulation ***/

/**
 * Either:
 *   el.remove(childEl)
 *   el.remove('author', 'urn:...')
 */
Element.prototype.remove = function(el, xmlns) {
    var filter
    if (typeof el === 'string') {
        /* 1st parameter is tag name */
        filter = function(child) {
            return !(child.is &&
                 child.is(el, xmlns))
        }
    } else {
        /* 1st parameter is element */
        filter = function(child) {
            return child !== el
        }
    }

    this.children = this.children.filter(filter)

    return this
}

/**
 * To use in case you want the same XML data for separate uses.
 * Please refrain from this practise unless you know what you are
 * doing. Building XML with ltx is easy!
 */
Element.prototype.clone = function() {
    var clone = this._getElement(this.name, this.attrs)
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        clone.cnode(child.clone ? child.clone() : child)
    }
    return clone
}

Element.prototype.text = function(val) {
    if (val && this.children.length === 1) {
        this.children[0] = val
        return this
    }
    return this.getText()
}

Element.prototype.attr = function(attr, val) {
    if (((typeof val !== 'undefined') || (val === null))) {
        if (!this.attrs) {
            this.attrs = {}
        }
        this.attrs[attr] = val
        return this
    }
    return this.attrs[attr]
}

/*** Serialization ***/

Element.prototype.toString = function() {
    var s = ''
    this.write(function(c) {
        s += c
    })
    return s
}

Element.prototype.toJSON = function() {
    return {
        name: this.name,
        attrs: this.attrs,
        children: this.children.map(function(child) {
            return child && child.toJSON ? child.toJSON() : child
        })
    }
}

Element.prototype._addChildren = function(writer) {
    writer('>')
    for (var i = 0; i < this.children.length; i++) {
        var child = this.children[i]
        /* Skip null/undefined */
        if (child || (child === 0)) {
            if (child.write) {
                child.write(writer)
            } else if (typeof child === 'string') {
                writer(escapeXmlText(child))
            } else if (child.toString) {
                writer(escapeXmlText(child.toString(10)))
            }
        }
    }
    writer('</')
    writer(this.name)
    writer('>')
}

Element.prototype.write = function(writer) {
    writer('<')
    writer(this.name)
    for (var k in this.attrs) {
        var v = this.attrs[k]
        if (v || (v === '') || (v === 0)) {
            writer(' ')
            writer(k)
            writer('="')
            if (typeof v !== 'string') {
                v = v.toString(10)
            }
            writer(escapeXml(v))
            writer('"')
        }
    }
    if (this.children.length === 0) {
        writer('/>')
    } else {
        this._addChildren(writer)
    }
}

function escapeXml(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;').
        replace(/"/g, '&quot;').
        replace(/"/g, '&apos;')
}

function escapeXmlText(s) {
    return s.
        replace(/\&/g, '&amp;').
        replace(/</g, '&lt;').
        replace(/>/g, '&gt;')
}

exports.Element = Element
exports.escapeXml = escapeXml

},{}],56:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./index":57,"./parse":58,"./sax/sax_ltx":59}],57:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"./dom-element":54,"./element":55,"./parse":58}],58:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"./dom-element":54,"events":14,"util":22}],59:[function(require,module,exports){
module.exports=require(28)
},{"events":14,"util":22}],60:[function(require,module,exports){
(function (process){
'use strict';

var log = require('debug')('node-stringprep')

// from unicode/uidna.h
var UIDNA_ALLOW_UNASSIGNED = 1
var UIDNA_USE_STD3_RULES = 2

try {
    var bindings = require('bindings')('node_stringprep.node')
} catch (ex) {
    if (process.title !== 'browser') {
        console.log(
            'Cannot load StringPrep-' +
            require('./package.json').version +
            ' bindings (using fallback). You may need to ' +
            '`npm install node-stringprep`'
        )
        log(ex)
    }
}

var toUnicode = function(value, options) {
    options = options || {}
    try {
        return bindings.toUnicode(value,
            (options.allowUnassigned && UIDNA_ALLOW_UNASSIGNED) | 0)
    } catch (e) {
        return value
    }
}

var toASCII = function(value, options) {
    options = options || {}
    try {
        return bindings.toASCII(value,
            (options.allowUnassigned && UIDNA_ALLOW_UNASSIGNED) |
            (options.useSTD3Rules && UIDNA_USE_STD3_RULES))
    } catch (e) {
        if (options.throwIfError) {
            throw e
        } else {
            return value
        }
    }
}

var StringPrep = function(operation) {
    this.operation = operation
    try {
        this.stringPrep = new bindings.StringPrep(this.operation)
    } catch (e) {
        this.stringPrep = null
        log('Operation does not exist', operation, e)
    }
}

StringPrep.prototype.UNKNOWN_PROFILE_TYPE = 'Unknown profile type'
StringPrep.prototype.UNHANDLED_FALLBACK = 'Unhandled JS fallback'
StringPrep.prototype.LIBICU_NOT_AVAILABLE = 'libicu unavailable'

StringPrep.prototype.useJsFallbacks = true

StringPrep.prototype.prepare = function(value) {
    this.value = value
    try {
        if (this.stringPrep) {
            return this.stringPrep.prepare(this.value)
        }
    } catch (e) {}
    if (false === this.useJsFallbacks) {
        throw new Error(this.LIBICU_NOT_AVAILABLE)
    }
    return this.jsFallback()
}

StringPrep.prototype.isNative = function() {
    return (null !== this.stringPrep)
}

StringPrep.prototype.jsFallback = function() {
    switch (this.operation) {
        case 'nameprep':
        case 'nodeprep':
            return this.value.toLowerCase()
        case 'resourceprep':
            return this.value
        case 'nfs4_cs_prep':
        case 'nfs4_cis_prep':
        case 'nfs4_mixed_prep prefix':
        case 'nfs4_mixed_prep suffix':
        case 'iscsi':
        case 'mib':
        case 'saslprep':
        case 'trace':
        case 'ldap':
        case 'ldapci':
            throw new Error(this.UNHANDLED_FALLBACK)
        default:
            throw new Error(this.UNKNOWN_PROFILE_TYPE)
    }
}

StringPrep.prototype.disableJsFallbacks = function() {
    this.useJsFallbacks = false
}

StringPrep.prototype.enableJsFallbacks = function() {
    this.useJsFallbacks = true
}

module.exports = {
    toUnicode: toUnicode,
    toASCII: toASCII,
    StringPrep: StringPrep
}

}).call(this,require("1YiZ5S"))
},{"./package.json":65,"1YiZ5S":17,"bindings":61,"debug":62}],61:[function(require,module,exports){
(function (process,__filename){

/**
 * Module dependencies.
 */

var fs = require('fs')
  , path = require('path')
  , join = path.join
  , dirname = path.dirname
  , exists = fs.existsSync || path.existsSync
  , defaults = {
        arrow: process.env.NODE_BINDINGS_ARROW || ' → '
      , compiled: process.env.NODE_BINDINGS_COMPILED_DIR || 'compiled'
      , platform: process.platform
      , arch: process.arch
      , version: process.versions.node
      , bindings: 'bindings.node'
      , try: [
          // node-gyp's linked version in the "build" dir
          [ 'module_root', 'build', 'bindings' ]
          // node-waf and gyp_addon (a.k.a node-gyp)
        , [ 'module_root', 'build', 'Debug', 'bindings' ]
        , [ 'module_root', 'build', 'Release', 'bindings' ]
          // Debug files, for development (legacy behavior, remove for node v0.9)
        , [ 'module_root', 'out', 'Debug', 'bindings' ]
        , [ 'module_root', 'Debug', 'bindings' ]
          // Release files, but manually compiled (legacy behavior, remove for node v0.9)
        , [ 'module_root', 'out', 'Release', 'bindings' ]
        , [ 'module_root', 'Release', 'bindings' ]
          // Legacy from node-waf, node <= 0.4.x
        , [ 'module_root', 'build', 'default', 'bindings' ]
          // Production "Release" buildtype binary (meh...)
        , [ 'module_root', 'compiled', 'version', 'platform', 'arch', 'bindings' ]
        ]
    }

/**
 * The main `bindings()` function loads the compiled bindings for a given module.
 * It uses V8's Error API to determine the parent filename that this function is
 * being invoked from, which is then used to find the root directory.
 */

function bindings (opts) {

  // Argument surgery
  if (typeof opts == 'string') {
    opts = { bindings: opts }
  } else if (!opts) {
    opts = {}
  }
  opts.__proto__ = defaults

  // Get the module root
  if (!opts.module_root) {
    opts.module_root = exports.getRoot(exports.getFileName())
  }

  // Ensure the given bindings name ends with .node
  if (path.extname(opts.bindings) != '.node') {
    opts.bindings += '.node'
  }

  var tries = []
    , i = 0
    , l = opts.try.length
    , n
    , b
    , err

  for (; i<l; i++) {
    n = join.apply(null, opts.try[i].map(function (p) {
      return opts[p] || p
    }))
    tries.push(n)
    try {
      b = opts.path ? require.resolve(n) : require(n)
      if (!opts.path) {
        b.path = n
      }
      return b
    } catch (e) {
      if (!/not find/i.test(e.message)) {
        throw e
      }
    }
  }

  err = new Error('Could not locate the bindings file. Tried:\n'
    + tries.map(function (a) { return opts.arrow + a }).join('\n'))
  err.tries = tries
  throw err
}
module.exports = exports = bindings


/**
 * Gets the filename of the JavaScript file that invokes this function.
 * Used to help find the root directory of a module.
 * Optionally accepts an filename argument to skip when searching for the invoking filename
 */

exports.getFileName = function getFileName (calling_file) {
  var origPST = Error.prepareStackTrace
    , origSTL = Error.stackTraceLimit
    , dummy = {}
    , fileName

  Error.stackTraceLimit = 10

  Error.prepareStackTrace = function (e, st) {
    for (var i=0, l=st.length; i<l; i++) {
      fileName = st[i].getFileName()
      if (fileName !== __filename) {
        if (calling_file) {
            if (fileName !== calling_file) {
              return
            }
        } else {
          return
        }
      }
    }
  }

  // run the 'prepareStackTrace' function above
  Error.captureStackTrace(dummy)
  dummy.stack

  // cleanup
  Error.prepareStackTrace = origPST
  Error.stackTraceLimit = origSTL

  return fileName
}

/**
 * Gets the root directory of a module, given an arbitrary filename
 * somewhere in the module tree. The "root directory" is the directory
 * containing the `package.json` file.
 *
 *   In:  /home/nate/node-native-module/lib/index.js
 *   Out: /home/nate/node-native-module
 */

exports.getRoot = function getRoot (file) {
  var dir = dirname(file)
    , prev
  while (true) {
    if (dir === '.') {
      // Avoids an infinite loop in rare cases, like the REPL
      dir = process.cwd()
    }
    if (exists(join(dir, 'package.json')) || exists(join(dir, 'node_modules'))) {
      // Found the 'package.json' file or 'node_modules' dir; we're done
      return dir
    }
    if (prev === dir) {
      // Got to the top
      throw new Error('Could not find module root given file: "' + file
                    + '". Do you have a `package.json` file? ')
    }
    // Try the parent dir next
    prev = dir
    dir = join(dir, '..')
  }
}

}).call(this,require("1YiZ5S"),"/../node_modules/node-xmpp-client/node_modules/node-xmpp-core/node_modules/node-stringprep/node_modules/bindings/bindings.js")
},{"1YiZ5S":17,"fs":3,"path":16}],62:[function(require,module,exports){
module.exports=require(42)
},{"./debug":63}],63:[function(require,module,exports){
module.exports=require(43)
},{"ms":64}],64:[function(require,module,exports){
module.exports=require(44)
},{}],65:[function(require,module,exports){
module.exports={
  "name": "node-stringprep",
  "version": "0.7.0",
  "main": "index.js",
  "description": "ICU StringPrep profiles",
  "keywords": [
    "unicode",
    "stringprep",
    "icu"
  ],
  "scripts": {
    "test": "grunt test",
    "install": "node-gyp rebuild"
  },
  "dependencies": {
    "bindings": "^1.2.1",
    "debug": "~2.0.0",
    "nan": "^1.5.1"
  },
  "devDependencies": {
    "grunt": "~0.4.2",
    "grunt-cli": "^0.1.13",
    "grunt-contrib-jshint": "~0.7.2",
    "grunt-mocha-cli": "~1.3.0",
    "proxyquire": "~0.5.2",
    "should": "~2.1.1"
  },
  "repository": {
    "type": "git",
    "path": "git://github.com/node-xmpp/node-stringprep.git"
  },
  "homepage": "http://github.com/node-xmpp/node-stringprep",
  "bugs": {
    "url": "http://github.com/node-xmpp/node-stringprep/issues"
  },
  "author": {
    "name": "Lloyd Watkin",
    "email": "lloyd@evilprofessor.co.uk",
    "url": "http://evilprofessor.co.uk"
  },
  "licenses": [
    {
      "type": "MIT"
    }
  ],
  "engines": {
    "node": ">=0.8"
  },
  "gypfile": true,
  "gitHead": "de3b45ec215e592331b9b80c053b3322656907a4",
  "_id": "node-stringprep@0.7.0",
  "_shasum": "c8a8deac9217db97ef3eb20dfa817d7e716f56b5",
  "_from": "node-stringprep@^0.7.0",
  "_npmVersion": "2.2.0",
  "_nodeVersion": "1.0.3",
  "_npmUser": {
    "name": "lloydwatkin",
    "email": "lloyd@evilprofessor.co.uk"
  },
  "maintainers": [
    {
      "name": "astro",
      "email": "astro@spaceboyz.net"
    },
    {
      "name": "lloydwatkin",
      "email": "lloyd@evilprofessor.co.uk"
    }
  ],
  "dist": {
    "shasum": "c8a8deac9217db97ef3eb20dfa817d7e716f56b5",
    "tarball": "http://registry.npmjs.org/node-stringprep/-/node-stringprep-0.7.0.tgz"
  },
  "directories": {},
  "_resolved": "https://registry.npmjs.org/node-stringprep/-/node-stringprep-0.7.0.tgz"
}

},{}],66:[function(require,module,exports){
var EventEmitter = require('events').EventEmitter
var backoff = require('backoff')
var noop = function () {}

module.exports =
function (createConnection) {
  return function (opts, onConnect) {
    onConnect = 'function' == typeof opts ? opts : onConnect
    opts = 'object' == typeof opts ? opts : {initialDelay: 1e3, maxDelay: 30e3}
    if(!onConnect)
      onConnect = opts.onConnect

    var emitter = opts.emitter || new EventEmitter()
    emitter.connected = false
    emitter.reconnect = true

    if(onConnect)
      emitter.on('connect', onConnect)

    var backoffMethod = (backoff[opts.type] || backoff.fibonacci) (opts)

    backoffMethod.on('backoff', function (n, d) {
      emitter.emit('backoff', n, d)
    })

    var args
    var cleanup = noop
    backoffMethod.on('ready', attempt)
    function attempt (n, delay) {
      if(!emitter.reconnect) return

      cleanup()
      emitter.emit('reconnect', n, delay)
      var con = createConnection.apply(null, args)
      if (con !== emitter._connection)
        emitter.emit('connection', con)
      emitter._connection = con

      cleanup = onCleanup
      function onCleanup(err) {
        cleanup = noop
        con.removeListener('connect', connect)
        con.removeListener('error', onDisconnect)
        con.removeListener('close', onDisconnect)
        con.removeListener('end'  , onDisconnect)

        //hack to make http not crash.
        //HTTP IS THE WORST PROTOCOL.
        if(con.constructor.name == 'Request')
          con.on('error', noop)

      }

      function onDisconnect (err) {
        emitter.connected = false
        onCleanup(err)

        //emit disconnect before checking reconnect, so user has a chance to decide not to.
        emitter.emit('disconnect', err)

        if(!emitter.reconnect) return
        try { backoffMethod.backoff() } catch (_) { }
      }

      function connect() {
        backoffMethod.reset()
        emitter.connected = true
        if(onConnect)
          con.removeListener('connect', onConnect)
        emitter.emit('connect', con)
      }

      con
        .on('error', onDisconnect)
        .on('close', onDisconnect)
        .on('end'  , onDisconnect)

      if(opts.immediate || con.constructor.name == 'Request') {
        emitter.connected = true
        emitter.emit('connect', con)
        con.once('data', function () {
          //this is the only way to know for sure that data is coming...
          backoffMethod.reset()
        })
      } else {
        con.on('connect', connect)
      }
    }

    emitter.connect =
    emitter.listen = function () {
      this.reconnect = true
      backoffMethod.reset()
      args = [].slice.call(arguments)
      attempt(0, 0)
      return emitter
    }

    //force reconnection

    emitter.end =
    emitter.disconnect = function () {
      emitter.reconnect = false

      if(emitter._connection)
        emitter._connection.end()

      emitter.emit('disconnect')
      return emitter
    }

    return emitter
  }

}

},{"backoff":67,"events":14}],67:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var Backoff = require('./lib/backoff');
var ExponentialBackoffStrategy = require('./lib/strategy/exponential');
var FibonacciBackoffStrategy = require('./lib/strategy/fibonacci');
var FunctionCall = require('./lib/function_call.js');

module.exports.Backoff = Backoff;
module.exports.FunctionCall = FunctionCall;
module.exports.FibonacciStrategy = FibonacciBackoffStrategy;
module.exports.ExponentialStrategy = ExponentialBackoffStrategy;

/**
 * Constructs a Fibonacci backoff.
 * @param options Fibonacci backoff strategy arguments.
 * @return The fibonacci backoff.
 * @see FibonacciBackoffStrategy
 */
module.exports.fibonacci = function(options) {
    return new Backoff(new FibonacciBackoffStrategy(options));
};

/**
 * Constructs an exponential backoff.
 * @param options Exponential strategy arguments.
 * @return The exponential backoff.
 * @see ExponentialBackoffStrategy
 */
module.exports.exponential = function(options) {
    return new Backoff(new ExponentialBackoffStrategy(options));
};

/**
 * Constructs a FunctionCall for the given function and arguments.
 * @param fn The function to wrap in a backoff handler.
 * @param vargs The function's arguments (var args).
 * @param callback The function's callback.
 * @return The FunctionCall instance.
 */
module.exports.call = function(fn, vargs, callback) {
    var args = Array.prototype.slice.call(arguments);
    fn = args[0];
    vargs = args.slice(1, args.length - 1);
    callback = args[args.length - 1];
    return new FunctionCall(fn, vargs, callback);
};

},{"./lib/backoff":68,"./lib/function_call.js":69,"./lib/strategy/exponential":70,"./lib/strategy/fibonacci":71}],68:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

/**
 * Backoff driver.
 * @param backoffStrategy Backoff delay generator/strategy.
 * @constructor
 */
function Backoff(backoffStrategy) {
    events.EventEmitter.call(this);

    this.backoffStrategy_ = backoffStrategy;
    this.maxNumberOfRetry_ = -1;
    this.backoffNumber_ = 0;
    this.backoffDelay_ = 0;
    this.timeoutID_ = -1;

    this.handlers = {
        backoff: this.onBackoff_.bind(this)
    };
}
util.inherits(Backoff, events.EventEmitter);

/**
 * Sets a limit, greater than 0, on the maximum number of backoffs. A 'fail'
 * event will be emitted when the limit is reached.
 * @param maxNumberOfRetry The maximum number of backoffs.
 */
Backoff.prototype.failAfter = function(maxNumberOfRetry) {
    if (maxNumberOfRetry < 1) {
        throw new Error('Maximum number of retry must be greater than 0. ' +
                        'Actual: ' + maxNumberOfRetry);
    }

    this.maxNumberOfRetry_ = maxNumberOfRetry;
};

/**
 * Starts a backoff operation.
 * @param err Optional paramater to let the listeners know why the backoff
 *     operation was started.
 */
Backoff.prototype.backoff = function(err) {
    if (this.timeoutID_ !== -1) {
        throw new Error('Backoff in progress.');
    }

    if (this.backoffNumber_ === this.maxNumberOfRetry_) {
        this.emit('fail', err);
        this.reset();
    } else {
        this.backoffDelay_ = this.backoffStrategy_.next();
        this.timeoutID_ = setTimeout(this.handlers.backoff, this.backoffDelay_);
        this.emit('backoff', this.backoffNumber_, this.backoffDelay_, err);
    }
};

/**
 * Handles the backoff timeout completion.
 * @private
 */
Backoff.prototype.onBackoff_ = function() {
    this.timeoutID_ = -1;
    this.emit('ready', this.backoffNumber_, this.backoffDelay_);
    this.backoffNumber_++;
};

/**
 * Stops any backoff operation and resets the backoff delay to its inital
 * value.
 */
Backoff.prototype.reset = function() {
    this.backoffNumber_ = 0;
    this.backoffStrategy_.reset();
    clearTimeout(this.timeoutID_);
    this.timeoutID_ = -1;
};

module.exports = Backoff;

},{"events":14,"util":22}],69:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

var Backoff = require('./backoff');
var FibonacciBackoffStrategy = require('./strategy/fibonacci');

/**
 * Returns true if the specified value is a function
 * @param val Variable to test.
 * @return Whether variable is a function.
 */
function isFunction(val) {
    return typeof val == 'function';
}

/**
 * Manages the calling of a function in a backoff loop.
 * @param fn Function to wrap in a backoff handler.
 * @param args Array of function's arguments.
 * @param callback Function's callback.
 * @constructor
 */
function FunctionCall(fn, args, callback) {
    events.EventEmitter.call(this);

    if (!isFunction(fn)) {
        throw new Error('fn should be a function.' +
                        'Actual: ' + typeof fn);
    }

    if (!isFunction(callback)) {
        throw new Error('callback should be a function.' +
                        'Actual: ' + typeof fn);
    }

    this.function_ = fn;
    this.arguments_ = args;
    this.callback_ = callback;
    this.results_ = [];

    this.backoff_ = null;
    this.strategy_ = null;
    this.failAfter_ = -1;

    this.state_ = FunctionCall.State_.PENDING;
}
util.inherits(FunctionCall, events.EventEmitter);

/**
 * Enum of states in which the FunctionCall can be.
 * @private
 */
FunctionCall.State_ = {
    PENDING: 0,
    RUNNING: 1,
    COMPLETED: 2,
    ABORTED: 3
};

/**
 * @return Whether the call is pending.
 */
FunctionCall.prototype.isPending = function() {
    return this.state_ == FunctionCall.State_.PENDING;
};

/**
 * @return Whether the call is in progress.
 */
FunctionCall.prototype.isRunning = function() {
    return this.state_ == FunctionCall.State_.RUNNING;
};

/**
 * @return Whether the call is completed.
 */
FunctionCall.prototype.isCompleted = function() {
    return this.state_ == FunctionCall.State_.COMPLETED;
};

/**
 * @return Whether the call is aborted.
 */
FunctionCall.prototype.isAborted = function() {
    return this.state_ == FunctionCall.State_.ABORTED;
};

/**
 * Sets the backoff strategy.
 * @param strategy The backoff strategy to use.
 * @return Itself for chaining.
 */
FunctionCall.prototype.setStrategy = function(strategy) {
    if (!this.isPending()) {
        throw new Error('FunctionCall in progress.');
    }
    this.strategy_ = strategy;
    return this;
};

/**
 * Returns all intermediary results returned by the wrapped function since
 * the initial call.
 * @return An array of intermediary results.
 */
FunctionCall.prototype.getResults = function() {
    return this.results_.concat();
};

/**
 * Sets the backoff limit.
 * @param maxNumberOfRetry The maximum number of backoffs.
 * @return Itself for chaining.
 */
FunctionCall.prototype.failAfter = function(maxNumberOfRetry) {
    if (!this.isPending()) {
        throw new Error('FunctionCall in progress.');
    }
    this.failAfter_ = maxNumberOfRetry;
    return this;
};

/**
 * Aborts the call.
 */
FunctionCall.prototype.abort = function() {
    if (this.isCompleted()) {
        throw new Error('FunctionCall already completed.');
    }

    if (this.isRunning()) {
        this.backoff_.reset();
    }

    this.state_ = FunctionCall.State_.ABORTED;
};

/**
 * Initiates the call to the wrapped function.
 * @param backoffFactory Optional factory function used to create the backoff
 *     instance.
 */
FunctionCall.prototype.start = function(backoffFactory) {
    if (this.isAborted()) {
        throw new Error('FunctionCall aborted.');
    } else if (!this.isPending()) {
        throw new Error('FunctionCall already started.');
    }

    var strategy = this.strategy_ || new FibonacciBackoffStrategy();

    this.backoff_ = backoffFactory ?
        backoffFactory(strategy) :
        new Backoff(strategy);

    this.backoff_.on('ready', this.doCall_.bind(this));
    this.backoff_.on('fail', this.doCallback_.bind(this));
    this.backoff_.on('backoff', this.handleBackoff_.bind(this));

    if (this.failAfter_ > 0) {
        this.backoff_.failAfter(this.failAfter_);
    }

    this.state_ = FunctionCall.State_.RUNNING;
    this.doCall_();
};

/**
 * Calls the wrapped function.
 * @private
 */
FunctionCall.prototype.doCall_ = function() {
    var eventArgs = ['call'].concat(this.arguments_);
    events.EventEmitter.prototype.emit.apply(this, eventArgs);
    var callback = this.handleFunctionCallback_.bind(this);
    this.function_.apply(null, this.arguments_.concat(callback));
};

/**
 * Calls the wrapped function's callback with the last result returned by the
 * wrapped function.
 * @private
 */
FunctionCall.prototype.doCallback_ = function() {
    var args = this.results_[this.results_.length - 1];
    this.callback_.apply(null, args);
};

/**
 * Handles wrapped function's completion. This method acts as a replacement
 * for the original callback function.
 * @private
 */
FunctionCall.prototype.handleFunctionCallback_ = function() {
    if (this.isAborted()) {
        return;
    }

    var args = Array.prototype.slice.call(arguments);
    this.results_.push(args); // Save callback arguments.
    events.EventEmitter.prototype.emit.apply(this, ['callback'].concat(args));

    if (args[0]) {
        this.backoff_.backoff(args[0]);
    } else {
        this.state_ = FunctionCall.State_.COMPLETED;
        this.doCallback_();
    }
};

/**
 * Handles backoff event.
 * @param number Backoff number.
 * @param delay Backoff delay.
 * @param err The error that caused the backoff.
 * @private
 */
FunctionCall.prototype.handleBackoff_ = function(number, delay, err) {
    this.emit('backoff', number, delay, err);
};

module.exports = FunctionCall;

},{"./backoff":68,"./strategy/fibonacci":71,"events":14,"util":22}],70:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var util = require('util');

var BackoffStrategy = require('./strategy');

/**
 * Exponential backoff strategy.
 * @extends BackoffStrategy
 */
function ExponentialBackoffStrategy(options) {
    BackoffStrategy.call(this, options);
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
}
util.inherits(ExponentialBackoffStrategy, BackoffStrategy);

/** @inheritDoc */
ExponentialBackoffStrategy.prototype.next_ = function() {
    this.backoffDelay_ = Math.min(this.nextBackoffDelay_, this.getMaxDelay());
    this.nextBackoffDelay_ = this.backoffDelay_ * 2;
    return this.backoffDelay_;
};

/** @inheritDoc */
ExponentialBackoffStrategy.prototype.reset_ = function() {
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
};

module.exports = ExponentialBackoffStrategy;

},{"./strategy":72,"util":22}],71:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var util = require('util');

var BackoffStrategy = require('./strategy');

/**
 * Fibonacci backoff strategy.
 * @extends BackoffStrategy
 */
function FibonacciBackoffStrategy(options) {
    BackoffStrategy.call(this, options);
    this.backoffDelay_ = 0;
    this.nextBackoffDelay_ = this.getInitialDelay();
}
util.inherits(FibonacciBackoffStrategy, BackoffStrategy);

/** @inheritDoc */
FibonacciBackoffStrategy.prototype.next_ = function() {
    var backoffDelay = Math.min(this.nextBackoffDelay_, this.getMaxDelay());
    this.nextBackoffDelay_ += this.backoffDelay_;
    this.backoffDelay_ = backoffDelay;
    return backoffDelay;
};

/** @inheritDoc */
FibonacciBackoffStrategy.prototype.reset_ = function() {
    this.nextBackoffDelay_ = this.getInitialDelay();
    this.backoffDelay_ = 0;
};

module.exports = FibonacciBackoffStrategy;

},{"./strategy":72,"util":22}],72:[function(require,module,exports){
/*
 * Copyright (c) 2012 Mathieu Turcotte
 * Licensed under the MIT license.
 */

var events = require('events');
var util = require('util');

function isDef(value) {
    return value !== undefined && value !== null;
}

/**
 * Abstract class defining the skeleton for all backoff strategies.
 * @param options Backoff strategy options.
 * @param options.randomisationFactor The randomisation factor, must be between
 * 0 and 1.
 * @param options.initialDelay The backoff initial delay, in milliseconds.
 * @param options.maxDelay The backoff maximal delay, in milliseconds.
 * @constructor
 */
function BackoffStrategy(options) {
    options = options || {};

    if (isDef(options.initialDelay) && options.initialDelay < 1) {
        throw new Error('The initial timeout must be greater than 0.');
    } else if (isDef(options.maxDelay) && options.maxDelay < 1) {
        throw new Error('The maximal timeout must be greater than 0.');
    }

    this.initialDelay_ = options.initialDelay || 100;
    this.maxDelay_ = options.maxDelay || 10000;

    if (this.maxDelay_ <= this.initialDelay_) {
        throw new Error('The maximal backoff delay must be ' +
                        'greater than the initial backoff delay.');
    }

    if (isDef(options.randomisationFactor) &&
        (options.randomisationFactor < 0 || options.randomisationFactor > 1)) {
        throw new Error('The randomisation factor must be between 0 and 1.');
    }

    this.randomisationFactor_ = options.randomisationFactor || 0;
}

/**
 * Retrieves the maximal backoff delay.
 * @return The maximal backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.getMaxDelay = function() {
    return this.maxDelay_;
};

/**
 * Retrieves the initial backoff delay.
 * @return The initial backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.getInitialDelay = function() {
    return this.initialDelay_;
};

/**
 * Template method that computes the next backoff delay.
 * @return The backoff delay, in milliseconds.
 */
BackoffStrategy.prototype.next = function() {
    var backoffDelay = this.next_();
    var randomisationMultiple = 1 + Math.random() * this.randomisationFactor_;
    var randomizedDelay = Math.round(backoffDelay * randomisationMultiple);
    return randomizedDelay;
};

/**
 * Computes the next backoff delay.
 * @return The backoff delay, in milliseconds.
 * @protected
 */
BackoffStrategy.prototype.next_ = function() {
    throw new Error('BackoffStrategy.next_() unimplemented.');
};

/**
 * Template method that resets the backoff delay to its initial value.
 */
BackoffStrategy.prototype.reset = function() {
    this.reset_();
};

/**
 * Resets the backoff delay to its initial value.
 * @protected
 */
BackoffStrategy.prototype.reset_ = function() {
    throw new Error('BackoffStrategy.reset_() unimplemented.');
};

module.exports = BackoffStrategy;

},{"events":14,"util":22}],73:[function(require,module,exports){
(function (process){
'use strict';

module.exports = connect;
connect.connect = connect;

/* this whole file only exists because tls.start
 * doens't exists and tls.connect cannot start server
 * connections
 *
 * copied from _tls_wrap.js
 */

// Target API:
//
//  var s = require('net').createStream(25, 'smtp.example.com')
//  s.on('connect', function() {
//   require('tls-connect')(s, {credentials:creds, isServer:false}, function() {
//      if (!s.authorized) {
//        s.destroy()
//        return
//      }
//
//      s.end("hello world\n")
//    })
//  })

var net = require('net')
var tls = require('tls')
var util = require('util')
var assert = require('assert')
var crypto = require('crypto')

// Returns an array [options] or [options, cb]
// It is the same as the argument of Socket.prototype.connect().
function __normalizeConnectArgs(args) {
  var options = {};

  if (typeof(args[0]) == 'object') {
    // connect(options, [cb])
    options = args[0];
  } else if (isPipeName(args[0])) {
    // connect(path, [cb]);
    options.path = args[0];
  } else {
    // connect(port, [host], [cb])
    options.port = args[0];
    if (typeof(args[1]) === 'string') {
      options.host = args[1];
    }
  }

  var cb = args[args.length - 1];
  return typeof(cb) === 'function' ? [options, cb] : [options];
}

function __checkServerIdentity(host, cert) {
  // Create regexp to much hostnames
  function regexpify(host, wildcards) {
    // Add trailing dot (make hostnames uniform)
    if (!/\.$/.test(host)) host += '.';

    // The same applies to hostname with more than one wildcard,
    // if hostname has wildcard when wildcards are not allowed,
    // or if there are less than two dots after wildcard (i.e. *.com or *d.com)
    //
    // also
    //
    // "The client SHOULD NOT attempt to match a presented identifier in
    // which the wildcard character comprises a label other than the
    // left-most label (e.g., do not match bar.*.example.net)."
    // RFC6125
    if (!wildcards && /\*/.test(host) || /[\.\*].*\*/.test(host) ||
        /\*/.test(host) && !/\*.*\..+\..+/.test(host)) {
      return /$./;
    }

    // Replace wildcard chars with regexp's wildcard and
    // escape all characters that have special meaning in regexps
    // (i.e. '.', '[', '{', '*', and others)
    var re = host.replace(
        /\*([a-z0-9\\-_\.])|[\.,\-\\\^\$+?*\[\]\(\):!\|{}]/g,
        function(all, sub) {
          if (sub) return '[a-z0-9\\-_]*' + (sub === '-' ? '\\-' : sub);
          return '\\' + all;
        });

    return new RegExp('^' + re + '$', 'i');
  }

  var dnsNames = [],
      uriNames = [],
      ips = [],
      matchCN = true,
      valid = false;

  // There're several names to perform check against:
  // CN and altnames in certificate extension
  // (DNS names, IP addresses, and URIs)
  //
  // Walk through altnames and generate lists of those names
  if (cert.subjectaltname) {
    cert.subjectaltname.split(/, /g).forEach(function(altname) {
      if (/^DNS:/.test(altname)) {
        dnsNames.push(altname.slice(4));
      } else if (/^IP Address:/.test(altname)) {
        ips.push(altname.slice(11));
      } else if (/^URI:/.test(altname)) {
        var uri = url.parse(altname.slice(4));
        if (uri) uriNames.push(uri.hostname);
      }
    });
  }

  // If hostname is an IP address, it should be present in the list of IP
  // addresses.
  if (net.isIP(host)) {
    valid = ips.some(function(ip) {
      return ip === host;
    });
  } else {
    // Transform hostname to canonical form
    if (!/\.$/.test(host)) host += '.';

    // Otherwise check all DNS/URI records from certificate
    // (with allowed wildcards)
    dnsNames = dnsNames.map(function(name) {
      return regexpify(name, true);
    });

    // Wildcards ain't allowed in URI names
    uriNames = uriNames.map(function(name) {
      return regexpify(name, false);
    });

    dnsNames = dnsNames.concat(uriNames);

    if (dnsNames.length > 0) matchCN = false;


    // Match against Common Name (CN) only if no supported identifiers are
    // present.
    //
    // "As noted, a client MUST NOT seek a match for a reference identifier
    //  of CN-ID if the presented identifiers include a DNS-ID, SRV-ID,
    //  URI-ID, or any application-specific identifier types supported by the
    //  client."
    // RFC6125
    if (matchCN) {
      var commonNames = cert.subject.CN;
      if (util.isArray(commonNames)) {
        for (var i = 0, k = commonNames.length; i < k; ++i) {
          dnsNames.push(regexpify(commonNames[i], true));
        }
      } else {
        dnsNames.push(regexpify(commonNames, true));
      }
    }

    valid = dnsNames.some(function(re) {
      return re.test(host);
    });
  }

  return valid;
};

// Target API:
//
//  var s = tls.connect({port: 8000, host: "google.com"}, function() {
//    if (!s.authorized) {
//      s.destroy();
//      return;
//    }
//
//    // s.socket;
//
//    s.end("hello world\n");
//  });
//
//
function normalizeConnectArgs(listArgs) {
  var args = __normalizeConnectArgs(listArgs);
  var options = args[0];
  var cb = args[1];

  if (typeof(listArgs[1]) === 'object') {
    options = util._extend(options, listArgs[1]);
  } else if (typeof(listArgs[2]) === 'object') {
    options = util._extend(options, listArgs[2]);
  }

  return (cb) ? [options, cb] : [options];
}

function legacyConnect(hostname, options, NPN, credentials) {
  assert(options.socket);
  var pair = tls.createSecurePair(credentials,
                                  !!options.isServer,
                                  !!options.requestCert,
                                  !!options.rejectUnauthorized,
                                  {
                                    NPNProtocols: NPN.NPNProtocols,
                                    servername: hostname
                                  });
  legacyPipe(pair, options.socket);
  pair.cleartext._controlReleased = true;
  pair.on('error', function(err) {
    pair.cleartext.emit('error', err);
  });

  return pair;
}

function connect(/* [port, host], options, cb */) {
  var args = normalizeConnectArgs(arguments);
  var options = args[0];
  var cb = args[1];

  var defaults = {
    rejectUnauthorized: '0' !== process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    requestCert: true,
    isServer: false
  };
  options = util._extend(defaults, options || {});

  var hostname = options.servername ||
                 options.host ||
                 options.socket && options.socket._host ||
                 '127.0.0.1',
      NPN = {},
      credentials = options.credentials || crypto.createCredentials(options);
  if (tls.convertNPNProtocols)
    tls.convertNPNProtocols(options.NPNProtocols, NPN);

  // Wrapping TLS socket inside another TLS socket was requested -
  // create legacy secure pair
  var socket;
  var legacy;
  var result;
  if (typeof tls.TLSSocket === 'undefined') {
    legacy = true;
    socket = legacyConnect(hostname, options, NPN, credentials);
    result = socket.cleartext;
  } else {
    legacy = false;
    socket = new tls.TLSSocket(options.socket, {
      credentials: credentials,
      isServer: !!options.isServer,
      requestCert: !!options.requestCert,
      rejectUnauthorized: !!options.rejectUnauthorized,
      NPNProtocols: NPN.NPNProtocols
    });
    result = socket;
  }

  if (socket._handle && !socket._connecting) {
    onHandle();
  } else {
    // Not even started connecting yet (or probably resolving dns address),
    // catch socket errors and assign handle.
    if (!legacy && options.socket) {
      options.socket.once('connect', function() {
        assert(options.socket._handle);
        socket._handle = options.socket._handle;
        socket._handle.owner = socket;

        socket.emit('connect');
      });
    }
    socket.once('connect', onHandle);
  }

  if (cb)
    result.once('secureConnect', cb);

  if (!options.socket) {
    assert(!legacy);
    var connect_opt;
    if (options.path && !options.port) {
      connect_opt = { path: options.path };
    } else {
      connect_opt = {
        port: options.port,
        host: options.host,
        localAddress: options.localAddress
      };
    }
    socket.connect(connect_opt);
  }

  return result;

  function onHandle() {
    if (!legacy)
      socket._releaseControl();

    if (options.session)
      socket.setSession(options.session);

    if (!legacy) {
      if (options.servername)
        socket.setServername(options.servername);

      if (!options.isServer)
        socket._start();
    }
    socket.on('secure', function() {
      var ssl = socket._ssl || socket.ssl;
      var verifyError = ssl.verifyError();

      // Verify that server's identity matches it's certificate's names
      if (!verifyError) {
        var cert = result.getPeerCertificate();
        var validCert = __checkServerIdentity(hostname, cert);
        if (!validCert) {
          verifyError = new Error('Hostname/IP doesn\'t match certificate\'s ' +
                                  'altnames');
        }
      }

      if (verifyError) {
        result.authorized = false;
        result.authorizationError = verifyError.message;

        if (options.rejectUnauthorized) {
          result.emit('error', verifyError);
          result.destroy();
          return;
        } else {
          result.emit('secureConnect');
        }
      } else {
        result.authorized = true;
        result.emit('secureConnect');
      }

      // Uncork incoming data
      result.removeListener('end', onHangUp);
    });

    function onHangUp() {
      // NOTE: This logic is shared with _http_client.js
      if (!socket._hadError) {
        socket._hadError = true;
        var error = new Error('socket hang up');
        error.code = 'ECONNRESET';
        socket.destroy();
        socket.emit('error', error);
      }
    }
    result.once('end', onHangUp);
  }
};

function legacyPipe(pair, socket) {
  pair.encrypted.pipe(socket);
  socket.pipe(pair.encrypted);

  pair.encrypted.on('close', function() {
    process.nextTick(function() {
      // Encrypted should be unpiped from socket to prevent possible
      // write after destroy.
      if (pair.encrypted.unpipe)
        pair.encrypted.unpipe(socket);
      socket.destroySoon();
    });
  });

  pair.fd = socket.fd;
  pair._handle = socket._handle;
  var cleartext = pair.cleartext;
  cleartext.socket = socket;
  cleartext.encrypted = pair.encrypted;
  cleartext.authorized = false;

  // cycle the data whenever the socket drains, so that
  // we can pull some more into it.  normally this would
  // be handled by the fact that pipe() triggers read() calls
  // on writable.drain, but CryptoStreams are a bit more
  // complicated.  Since the encrypted side actually gets
  // its data from the cleartext side, we have to give it a
  // light kick to get in motion again.
  socket.on('drain', function() {
    if (pair.encrypted._pending && pair.encrypted._writePending)
      pair.encrypted._writePending();
    if (pair.cleartext._pending && pair.cleartext._writePending)
      pair.cleartext._writePending();
    if (pair.encrypted.read)
      pair.encrypted.read(0);
    if (pair.cleartext.read)
      pair.cleartext.read(0);
  });

  function onerror(e) {
    if (cleartext._controlReleased) {
      cleartext.emit('error', e);
    }
  }

  function onclose() {
    socket.removeListener('error', onerror);
    socket.removeListener('timeout', ontimeout);
  }

  function ontimeout() {
    cleartext.emit('timeout');
  }

  socket.on('error', onerror);
  socket.on('close', onclose);
  socket.on('timeout', ontimeout);

  return cleartext;
};

}).call(this,require("1YiZ5S"))
},{"1YiZ5S":17,"assert":4,"crypto":9,"net":3,"tls":3,"util":22}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL2xpYi95LXhtcHAtcG9seW1lci5jb2ZmZWUiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9saWIveS14bXBwLmNvZmZlZSIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbGliL19lbXB0eS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Fzc2VydC9hc3NlcnQuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2Jhc2U2NC1qcy9saWIvYjY0LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnVmZmVyL25vZGVfbW9kdWxlcy9pZWVlNzU0L2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvaGVscGVycy5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2NyeXB0by1icm93c2VyaWZ5L2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvbWQ1LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvcm5nLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvc2hhLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvc2hhMjU2LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvZXZlbnRzL2V2ZW50cy5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2luaGVyaXRzL2luaGVyaXRzX2Jyb3dzZXIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wYXRoLWJyb3dzZXJpZnkvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZGVjb2RlLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2VuY29kZS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvc3VwcG9ydC9pc0J1ZmZlckJyb3dzZXIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy91dGlsL3V0aWwuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9kb20tZWxlbWVudC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL2VsZW1lbnQuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC1icm93c2VyaWZ5LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9wYXJzZS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL3NheC9zYXhfbHR4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24vYW5vbnltb3VzLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL2RpZ2VzdG1kNS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9leHRlcm5hbC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9tZWNoYW5pc20uanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24vcGxhaW4uanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24veGZhY2Vib29rLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL3hvYXV0aDIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYm9zaC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9zYXNsLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL3Nlc3Npb24uanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvd2Vic29ja2V0cy5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9icm93c2VyLXJlcXVlc3QvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvZGVidWcvYnJvd3Nlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9kZWJ1Zy5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9ub2RlX21vZHVsZXMvbXMvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL2Nvbm5lY3Rpb24uanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL2ppZC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvc3J2LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL2xpYi9zdGFuemEuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL3N0cmVhbV9wYXJzZXIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2RlYnVnL2Jyb3dzZXIuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2RlYnVnL2RlYnVnLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9kZWJ1Zy9ub2RlX21vZHVsZXMvbXMvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvZG9tLWVsZW1lbnQuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvZWxlbWVudC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC1icm93c2VyaWZ5LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL3BhcnNlLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL25vZGUtc3RyaW5ncHJlcC9ub2RlX21vZHVsZXMvYmluZGluZ3MvYmluZGluZ3MuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL25vZGUtc3RyaW5ncHJlcC9wYWNrYWdlLmpzb24iLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvbGliL2JhY2tvZmYuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9mdW5jdGlvbl9jYWxsLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvc3RyYXRlZ3kvZXhwb25lbnRpYWwuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9zdHJhdGVneS9maWJvbmFjY2kuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9zdHJhdGVneS9zdHJhdGVneS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvdGxzLWNvbm5lY3Qvc3RhcnR0bHMuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQSxJQUFBLElBQUE7O0FBQUEsSUFBQSxHQUFPLE9BQUEsQ0FBUSxVQUFSLENBQVAsQ0FBQTs7QUFBQSxJQUVJLE9BQUEsQ0FBUSxRQUFSLEVBQ0Y7QUFBQSxFQUFBLElBQUEsRUFBVSxJQUFBLElBQUEsQ0FBQSxDQUFWO0FBQUEsRUFDQSxLQUFBLEVBQU8sU0FBQSxHQUFBO0FBQ0wsSUFBQSxJQUFDLENBQUEsY0FBRCxHQUFrQixLQUFsQixDQUFBO1dBQ0EsSUFBQyxDQUFBLFVBQUQsQ0FBQSxFQUZLO0VBQUEsQ0FEUDtBQUFBLEVBS0EsVUFBQSxFQUFZLFNBQUEsR0FBQTtBQUNWLFFBQUEsT0FBQTtBQUFBLElBQUEsSUFBRyxDQUFBLElBQUssQ0FBQSxjQUFMLElBQXdCLG1CQUEzQjtBQUNFLE1BQUEsSUFBQyxDQUFBLGNBQUQsR0FBa0IsSUFBbEIsQ0FBQTtBQUFBLE1BQ0EsT0FBQSxHQUFVLEVBRFYsQ0FBQTtBQUVBLE1BQUEsSUFBRyx1QkFBSDtBQUNFLFFBQUEsT0FBTyxDQUFDLFVBQVIsR0FBcUIsSUFBQyxDQUFBLFVBQXRCLENBREY7T0FGQTtBQUFBLE1BSUEsSUFBSSxDQUFDLFNBQUwsR0FBaUIsSUFBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQVcsSUFBQyxDQUFBLElBQVosRUFBa0IsT0FBbEIsQ0FKakIsQ0FBQTtBQUtBLE1BQUEsSUFBRyxrQkFBSDtlQUNFLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBZixHQUF1QixJQUFDLENBQUEsTUFEMUI7T0FORjtLQURVO0VBQUEsQ0FMWjtBQUFBLEVBZUEsV0FBQSxFQUFhLFNBQUEsR0FBQTtXQUNYLElBQUMsQ0FBQSxVQUFELENBQUEsRUFEVztFQUFBLENBZmI7Q0FERSxDQUZKLENBQUE7Ozs7O0FDQ0EsSUFBQSx3RkFBQTs7QUFBQSxLQUFBLEdBQVEsT0FBQSxDQUFRLGtCQUFSLENBQVIsQ0FBQTs7QUFBQSxHQUNBLEdBQU0sT0FBQSxDQUFRLEtBQVIsQ0FETixDQUFBOztBQUFBLHlCQUdBLEdBQTRCLFNBQUMsR0FBRCxHQUFBO1NBQzFCLEdBQUcsQ0FBQyxLQUFKLENBQVUsR0FBVixDQUFlLENBQUEsQ0FBQSxFQURXO0FBQUEsQ0FINUIsQ0FBQTs7QUFBQSxxQkFNQSxHQUF3QixTQUFDLEdBQUQsR0FBQTtTQUN0QixHQUFHLENBQUMsS0FBSixDQUFVLEdBQVYsQ0FBZSxDQUFBLENBQUEsRUFETztBQUFBLENBTnhCLENBQUE7O0FBQUE7QUFjZSxFQUFBLHFCQUFDLElBQUQsR0FBQTtBQUVYLFFBQUEsS0FBQTs7TUFGWSxPQUFPO0tBRW5CO0FBQUEsSUFBQSxJQUFDLENBQUEsS0FBRCxHQUFTLEVBQVQsQ0FBQTtBQUNBLElBQUEsSUFBRyw2QkFBSDtBQUNFLE1BQUEsSUFBQyxDQUFBLElBQUQsR0FBUSxJQUFJLENBQUMsZ0JBQWIsQ0FERjtLQUFBLE1BQUE7QUFHRSxNQUFBLElBQUcsaUNBQUg7QUFDRSxRQUFBLElBQUMsQ0FBQSxvQkFBRCxHQUF3QixJQUFJLENBQUMsb0JBQTdCLENBREY7T0FBQSxNQUFBO0FBR0UsUUFBQSxJQUFDLENBQUEsb0JBQUQsR0FBd0IseUJBQXhCLENBSEY7T0FBQTtBQUFBLE1BS0EsS0FBQSxHQUFRLEVBTFIsQ0FBQTtBQU1BLE1BQUEsSUFBRyxnQkFBSDtBQUNFLFFBQUEsS0FBSyxDQUFDLEdBQU4sR0FBWSxJQUFJLENBQUMsR0FBakIsQ0FBQTtBQUFBLFFBQ0EsS0FBSyxDQUFDLFFBQU4sR0FBaUIsSUFBSSxDQUFDLFFBRHRCLENBREY7T0FBQSxNQUFBO0FBSUUsUUFBQSxLQUFLLENBQUMsR0FBTixHQUFZLGNBQVosQ0FBQTtBQUFBLFFBQ0EsS0FBSyxDQUFDLFNBQU4sR0FBa0IsV0FEbEIsQ0FKRjtPQU5BO0FBYUEsTUFBQSxJQUFHLGlCQUFIO0FBQ0UsUUFBQSxLQUFLLENBQUMsSUFBTixHQUFhLElBQUksQ0FBQyxJQUFsQixDQUFBO0FBQUEsUUFDQSxLQUFLLENBQUMsSUFBTixHQUFhLElBQUksQ0FBQyxJQURsQixDQURGO09BQUEsTUFBQTs7VUFJRSxJQUFJLENBQUMsWUFBYTtTQUFsQjtBQUFBLFFBQ0EsS0FBSyxDQUFDLFNBQU4sR0FDRTtBQUFBLFVBQUEsR0FBQSxFQUFLLElBQUksQ0FBQyxTQUFWO1NBRkYsQ0FKRjtPQWJBO0FBQUEsTUFxQkEsSUFBQyxDQUFBLElBQUQsR0FBWSxJQUFBLEtBQUssQ0FBQyxNQUFOLENBQWEsS0FBYixDQXJCWixDQUhGO0tBREE7QUFBQSxJQTRCQSxJQUFDLENBQUEsU0FBRCxHQUFhLEtBNUJiLENBQUE7QUFBQSxJQTZCQSxJQUFDLENBQUEsV0FBRCxHQUFlLEVBN0JmLENBQUE7QUFBQSxJQThCQSxJQUFDLENBQUEscUJBQUQsR0FBeUIsRUE5QnpCLENBQUE7QUFBQSxJQStCQSxJQUFDLENBQUEsSUFBSSxDQUFDLEVBQU4sQ0FBUyxRQUFULEVBQW1CLENBQUEsU0FBQSxLQUFBLEdBQUE7YUFBQSxTQUFBLEdBQUE7ZUFDakIsS0FBQyxDQUFBLFdBQUQsQ0FBQSxFQURpQjtNQUFBLEVBQUE7SUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQW5CLENBL0JBLENBQUE7QUFBQSxJQWlDQSxJQUFDLENBQUEsSUFBSSxDQUFDLEVBQU4sQ0FBUyxRQUFULEVBQW1CLENBQUEsU0FBQSxLQUFBLEdBQUE7YUFBQSxTQUFDLE1BQUQsR0FBQTtBQUNqQixZQUFBLElBQUE7QUFBQSxRQUFBLElBQUcsTUFBTSxDQUFDLFlBQVAsQ0FBb0IsTUFBQSxLQUFVLE9BQTlCLENBQUg7QUFDRSxVQUFBLE9BQU8sQ0FBQyxLQUFSLENBQWMsTUFBTSxDQUFDLFFBQVAsQ0FBQSxDQUFkLENBQUEsQ0FERjtTQUFBO0FBQUEsUUFJQSxJQUFBLEdBQU8scUJBQUEsQ0FBc0IsTUFBTSxDQUFDLFlBQVAsQ0FBb0IsTUFBcEIsQ0FBdEIsQ0FKUCxDQUFBO0FBS0EsUUFBQSxJQUFHLHlCQUFIO2lCQUNFLEtBQUMsQ0FBQSxLQUFNLENBQUEsSUFBQSxDQUFLLENBQUMsUUFBYixDQUFzQixNQUF0QixFQURGO1NBTmlCO01BQUEsRUFBQTtJQUFBLENBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBbkIsQ0FqQ0EsQ0FBQTtBQUFBLElBMkNBLElBQUMsQ0FBQSxLQUFELEdBQVMsS0EzQ1QsQ0FGVztFQUFBLENBQWI7O0FBQUEsd0JBZ0RBLFVBQUEsR0FBWSxTQUFDLENBQUQsR0FBQTtBQUNWLElBQUEsSUFBRyxJQUFDLENBQUEsU0FBSjthQUNFLENBQUEsQ0FBQSxFQURGO0tBQUEsTUFBQTthQUdFLElBQUMsQ0FBQSxxQkFBcUIsQ0FBQyxJQUF2QixDQUE0QixDQUE1QixFQUhGO0tBRFU7RUFBQSxDQWhEWixDQUFBOztBQUFBLHdCQXVEQSxXQUFBLEdBQWEsU0FBQSxHQUFBO0FBQ1gsUUFBQSxjQUFBO0FBQUE7QUFBQSxTQUFBLHFDQUFBO2lCQUFBO0FBQ0UsTUFBQSxDQUFBLENBQUEsQ0FBQSxDQURGO0FBQUEsS0FBQTtXQUVBLElBQUMsQ0FBQSxTQUFELEdBQWEsS0FIRjtFQUFBLENBdkRiLENBQUE7O0FBQUEsd0JBa0VBLElBQUEsR0FBTSxTQUFDLElBQUQsRUFBTyxPQUFQLEdBQUE7QUFDSixRQUFBLFNBQUE7O01BRFcsVUFBVTtLQUNyQjs7TUFBQSxPQUFPLENBQUMsT0FBUTtLQUFoQjs7TUFDQSxPQUFPLENBQUMsYUFBYztLQUR0QjtBQUVBLElBQUEsSUFBTyxZQUFQO0FBQ0UsWUFBVSxJQUFBLEtBQUEsQ0FBTSwwQkFBTixDQUFWLENBREY7S0FGQTtBQUlBLElBQUEsSUFBRyxJQUFJLENBQUMsT0FBTCxDQUFhLEdBQWIsQ0FBQSxLQUFxQixDQUFBLENBQXhCO0FBQ0UsTUFBQSxJQUFBLElBQVEsSUFBQyxDQUFBLG9CQUFULENBREY7S0FKQTtBQU1BLElBQUEsSUFBTyx3QkFBUDtBQUNFLE1BQUEsU0FBQSxHQUFnQixJQUFBLGFBQUEsQ0FBQSxDQUFoQixDQUFBO0FBQUEsTUFDQSxJQUFDLENBQUEsS0FBTSxDQUFBLElBQUEsQ0FBUCxHQUFlLFNBRGYsQ0FBQTtBQUFBLE1BRUEsSUFBQyxDQUFBLFVBQUQsQ0FBWSxDQUFBLFNBQUEsS0FBQSxHQUFBO2VBQUEsU0FBQSxHQUFBO0FBS1YsY0FBQSxhQUFBO0FBQUEsVUFBQSxhQUFBLEdBQWdCLFNBQUEsR0FBQTtBQUNkLGdCQUFBLGlCQUFBO0FBQUEsWUFBQSxTQUFTLENBQUMsSUFBVixDQUNFO0FBQUEsY0FBQSxVQUFBLEVBQVksT0FBTyxDQUFDLFVBQXBCO0FBQUEsY0FDQSxJQUFBLEVBQU0sT0FBTyxDQUFDLElBRGQ7QUFBQSxjQUVBLE9BQUEsRUFBUyxLQUFDLENBQUEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUZuQjthQURGLENBQUEsQ0FBQTtBQUFBLFlBSUEsU0FBUyxDQUFDLElBQVYsR0FBaUIsSUFKakIsQ0FBQTtBQUFBLFlBS0EsU0FBUyxDQUFDLFFBQVYsR0FBcUIsSUFBQSxHQUFPLEdBQVAsR0FBYSxLQUFDLENBQUEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUw1QyxDQUFBO0FBQUEsWUFNQSxTQUFTLENBQUMsSUFBVixHQUFpQixLQUFDLENBQUEsSUFObEIsQ0FBQTtBQUFBLFlBT0EsU0FBUyxDQUFDLFlBQVYsR0FBeUIsS0FQekIsQ0FBQTtBQUFBLFlBUUEsaUJBQUEsR0FBd0IsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFZLFVBQVosRUFDcEI7QUFBQSxjQUFBLEVBQUEsRUFBSSxTQUFTLENBQUMsUUFBZDthQURvQixDQUV0QixDQUFDLENBRnFCLENBRW5CLEdBRm1CLEVBRWQsRUFGYyxDQUd0QixDQUFDLEVBSHFCLENBQUEsQ0FJdEIsQ0FBQyxDQUpxQixDQUluQixNQUptQixFQUlYO0FBQUEsY0FBQyxLQUFBLEVBQU8scUJBQVI7YUFKVyxDQUt0QixDQUFDLENBTHFCLENBS25CLFNBQVMsQ0FBQyxJQUxTLENBUnhCLENBQUE7bUJBY0EsS0FBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQVcsaUJBQVgsRUFmYztVQUFBLENBQWhCLENBQUE7QUFpQkEsVUFBQSxJQUFHLFNBQVMsQ0FBQyxhQUFiO21CQUNFLGFBQUEsQ0FBQSxFQURGO1dBQUEsTUFBQTttQkFHRSxTQUFTLENBQUMsYUFBVixHQUEwQixjQUg1QjtXQXRCVTtRQUFBLEVBQUE7TUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQVosQ0FGQSxDQURGO0tBTkE7V0FvQ0EsSUFBQyxDQUFBLEtBQU0sQ0FBQSxJQUFBLEVBckNIO0VBQUEsQ0FsRU4sQ0FBQTs7cUJBQUE7O0lBZEYsQ0FBQTs7QUFBQTs2QkE0SEU7O0FBQUEsMEJBQUEsSUFBQSxHQUFNLFNBQUEsR0FBQTtBQUNKLElBQUEsSUFBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQWUsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFZLFVBQVosRUFDYjtBQUFBLE1BQUEsRUFBQSxFQUFJLElBQUMsQ0FBQSxRQUFMO0FBQUEsTUFDQSxJQUFBLEVBQU0sYUFETjtLQURhLENBQWYsQ0FBQSxDQUFBO1dBR0EsTUFBQSxDQUFBLElBQVEsQ0FBQSxZQUFZLENBQUMsS0FBTSxDQUFBLElBQUMsQ0FBQSxJQUFELEVBSnZCO0VBQUEsQ0FBTixDQUFBOztBQUFBLDBCQU1BLFFBQUEsR0FBVSxTQUFDLE1BQUQsR0FBQTtBQUNSLFFBQUEsd0JBQUE7QUFBQSxJQUFBLElBQUcsSUFBQyxDQUFBLEtBQUo7QUFDRSxNQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksWUFBQSxHQUFhLE1BQU0sQ0FBQyxRQUFQLENBQUEsQ0FBekIsQ0FBQSxDQURGO0tBQUE7QUFBQSxJQUVBLE1BQUEsR0FBUyx5QkFBQSxDQUEwQixNQUFNLENBQUMsWUFBUCxDQUFvQixNQUFwQixDQUExQixDQUZULENBQUE7QUFHQSxJQUFBLElBQUcsTUFBTSxDQUFDLEVBQVAsQ0FBVSxVQUFWLENBQUg7QUFFRSxNQUFBLElBQUcsTUFBQSxLQUFVLElBQUMsQ0FBQSxPQUFkO0FBQUE7T0FBQSxNQUdLLElBQUcsTUFBTSxDQUFDLFlBQVAsQ0FBb0IsTUFBcEIsQ0FBQSxLQUErQixhQUFsQztlQUVILElBQUMsQ0FBQSxRQUFELENBQVUsTUFBVixFQUZHO09BQUEsTUFBQTtBQUlILFFBQUEsV0FBQSxHQUFjLE1BQ1osQ0FBQyxRQURXLENBQ0YsTUFERSxFQUNLLHFCQURMLENBRVosQ0FBQyxPQUZXLENBQUEsQ0FBZCxDQUFBO2VBR0EsSUFBQyxDQUFBLFVBQUQsQ0FBWSxNQUFaLEVBQW9CLFdBQXBCLEVBUEc7T0FMUDtLQUFBLE1BQUE7QUFlRSxNQUFBLElBQUcsTUFBQSxLQUFVLElBQUMsQ0FBQSxRQUFkO0FBQ0UsZUFBTyxJQUFQLENBREY7T0FBQTtBQUFBLE1BRUEsR0FBQSxHQUFNLE1BQU0sQ0FBQyxRQUFQLENBQWdCLEdBQWhCLEVBQXFCLGlDQUFyQixDQUZOLENBQUE7QUFJQSxNQUFBLElBQUcsV0FBSDtlQUVFLElBQUMsQ0FBQSxjQUFELENBQWdCLE1BQWhCLEVBQXdCLElBQUMsQ0FBQSxtQkFBRCxDQUFxQixHQUFyQixDQUF4QixFQUZGO09BbkJGO0tBSlE7RUFBQSxDQU5WLENBQUE7O0FBQUEsMEJBaUNBLElBQUEsR0FBTSxTQUFDLElBQUQsRUFBTyxJQUFQLEVBQWEsSUFBYixHQUFBO0FBSUosUUFBQSxVQUFBOztNQUppQixPQUFPO0tBSXhCO0FBQUEsSUFBQSxDQUFBLEdBQVEsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFZLFNBQVosRUFDTjtBQUFBLE1BQUEsRUFBQSxFQUFPLElBQUEsS0FBUSxFQUFYLEdBQW1CLElBQUMsQ0FBQSxJQUFwQixHQUE4QixJQUFDLENBQUEsSUFBRCxHQUFRLEdBQVIsR0FBYyxJQUFoRDtBQUFBLE1BQ0EsSUFBQSxFQUFTLFlBQUgsR0FBYyxJQUFkLEdBQXdCLE1BRDlCO0tBRE0sQ0FBUixDQUFBO0FBQUEsSUFHQSxPQUFBLEdBQVUsSUFBQyxDQUFBLGtCQUFELENBQW9CLENBQXBCLEVBQXVCLElBQXZCLENBSFYsQ0FBQTtBQUlBLElBQUEsSUFBRyxJQUFDLENBQUEsS0FBSjtBQUNFLE1BQUEsT0FBTyxDQUFDLEdBQVIsQ0FBWSxXQUFBLEdBQVksT0FBTyxDQUFDLElBQVIsQ0FBQSxDQUFjLENBQUMsUUFBZixDQUFBLENBQXhCLENBQUEsQ0FERjtLQUpBO1dBTUEsSUFBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQVcsT0FBTyxDQUFDLElBQVIsQ0FBQSxDQUFYLEVBVkk7RUFBQSxDQWpDTixDQUFBOztBQUFBLDBCQTZDQSxTQUFBLEdBQVcsU0FBQyxJQUFELEdBQUE7V0FDVCxJQUFDLENBQUEsSUFBRCxDQUFNLEVBQU4sRUFBVSxJQUFWLEVBQWdCLFdBQWhCLEVBRFM7RUFBQSxDQTdDWCxDQUFBOzt1QkFBQTs7SUE1SEYsQ0FBQTs7QUE2S0EsSUFBRyxzQkFBSDtBQUNFLEVBQUEsTUFBTSxDQUFDLE9BQVAsR0FBaUIsV0FBakIsQ0FERjtDQTdLQTs7QUFnTEEsSUFBRyxnREFBSDtBQUNFLEVBQUEsSUFBTyxzQ0FBUDtBQUNFLFVBQVUsSUFBQSxLQUFBLENBQU0sMEJBQU4sQ0FBVixDQURGO0dBQUEsTUFBQTtBQUdFLElBQUEsQ0FBQyxDQUFDLElBQUYsR0FBUyxXQUFULENBSEY7R0FERjtDQWhMQTs7Ozs7QUNEQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4YUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdk1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOWVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25KQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDck1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9HQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9hQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDak5BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0lBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0tBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNIQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFlBOztBQ0FBOztBQ0FBOzs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7Ozs7O0FDeEtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakRBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbk9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKX12YXIgZj1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwoZi5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxmLGYuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiWE1QUCA9IHJlcXVpcmUgJy4veS14bXBwJ1xuXG5uZXcgUG9seW1lciAneS14bXBwJyxcbiAgeG1wcDogbmV3IFhNUFAoKSwgIyB0aGlzIGlzIGEgc2hhcmVkIHByb3BlcnR5IGluZGVlZCFcbiAgcmVhZHk6ICgpLT5cbiAgICBAaXNfaW5pdGlhbGl6ZWQgPSBmYWxzZVxuICAgIEBpbml0aWFsaXplKClcblxuICBpbml0aWFsaXplOiAoKS0+XG4gICAgaWYgbm90IEBpc19pbml0aWFsaXplZCBhbmQgQHJvb20/XG4gICAgICBAaXNfaW5pdGlhbGl6ZWQgPSB0cnVlXG4gICAgICBvcHRpb25zID0ge31cbiAgICAgIGlmIEBzeW5jTWV0aG9kP1xuICAgICAgICBvcHRpb25zLnN5bmNNZXRob2QgPSBAc3luY01ldGhvZFxuICAgICAgdGhpcy5jb25uZWN0b3IgPSBAeG1wcC5qb2luKEByb29tLCBvcHRpb25zKVxuICAgICAgaWYgQGRlYnVnP1xuICAgICAgICB0aGlzLmNvbm5lY3Rvci5kZWJ1ZyA9IEBkZWJ1Z1xuXG4gIHJvb21DaGFuZ2VkOiAoKS0+XG4gICAgQGluaXRpYWxpemUoKVxuIiwiXG5OWE1QUCA9IHJlcXVpcmUgXCJub2RlLXhtcHAtY2xpZW50XCJcbmx0eCA9IHJlcXVpcmUgXCJsdHhcIlxuXG5leHRyYWN0X3Jlc291cmNlX2Zyb21famlkID0gKGppZCktPlxuICBqaWQuc3BsaXQoXCIvXCIpWzFdXG5cbmV4dHJhY3RfYmFyZV9mcm9tX2ppZCA9IChqaWQpLT5cbiAgamlkLnNwbGl0KFwiL1wiKVswXVxuXG4jIFRoaXMgSGFuZGxlciBoYW5kbGVzIGEgc2V0IG9mIGNvbm5lY3Rpb25zXG5jbGFzcyBYTVBQSGFuZGxlclxuICAjXG4gICMgU2VlIGRvY3VtZW50YXRpb24gZm9yIHBhcmFtZXRlcnNcbiAgI1xuICBjb25zdHJ1Y3RvcjogKG9wdHMgPSB7fSktPlxuICAgICMgSW5pdGlhbGl6ZSBOWE1QUC5DbGllbnRcbiAgICBAcm9vbXMgPSB7fVxuICAgIGlmIG9wdHMubm9kZV94bXBwX2NsaWVudD9cbiAgICAgIEB4bXBwID0gb3B0cy5ub2RlX3htcHBfY2xpZW50XG4gICAgZWxzZVxuICAgICAgaWYgb3B0cy5kZWZhdWx0Um9vbUNvbXBvbmVudD9cbiAgICAgICAgQGRlZmF1bHRSb29tQ29tcG9uZW50ID0gb3B0cy5kZWZhdWx0Um9vbUNvbXBvbmVudFxuICAgICAgZWxzZVxuICAgICAgICBAZGVmYXVsdFJvb21Db21wb25lbnQgPSBcIkBjb25mZXJlbmNlLnlhdHRhLm5pbmphXCJcblxuICAgICAgY3JlZHMgPSB7fVxuICAgICAgaWYgb3B0cy5qaWQ/XG4gICAgICAgIGNyZWRzLmppZCA9IG9wdHMuamlkXG4gICAgICAgIGNyZWRzLnBhc3N3b3JkID0gb3B0cy5wYXNzd29yZFxuICAgICAgZWxzZVxuICAgICAgICBjcmVkcy5qaWQgPSAnQHlhdHRhLm5pbmphJ1xuICAgICAgICBjcmVkcy5wcmVmZXJyZWQgPSAnQU5PTllNT1VTJ1xuXG4gICAgICBpZiBvcHRzLmhvc3Q/XG4gICAgICAgIGNyZWRzLmhvc3QgPSBvcHRzLmhvc3RcbiAgICAgICAgY3JlZHMucG9ydCA9IG9wdHMucG9ydFxuICAgICAgZWxzZVxuICAgICAgICBvcHRzLndlYnNvY2tldCA/PSAnd3NzOnlhdHRhLm5pbmphOjUyODEveG1wcC13ZWJzb2NrZXQnXG4gICAgICAgIGNyZWRzLndlYnNvY2tldCA9XG4gICAgICAgICAgdXJsOiBvcHRzLndlYnNvY2tldFxuXG4gICAgICBAeG1wcCA9IG5ldyBOWE1QUC5DbGllbnQgY3JlZHNcblxuICAgICMgV2hhdCBoYXBwZW5zIHdoZW4geW91IGdvIG9ubGluZVxuICAgIEBpc19vbmxpbmUgPSBmYWxzZVxuICAgIEBjb25uZWN0aW9ucyA9IHt9XG4gICAgQHdoZW5fb25saW5lX2xpc3RlbmVycyA9IFtdXG4gICAgQHhtcHAub24gJ29ubGluZScsID0+XG4gICAgICBAc2V0SXNPbmxpbmUoKVxuICAgIEB4bXBwLm9uICdzdGFuemEnLCAoc3RhbnphKT0+XG4gICAgICBpZiBzdGFuemEuZ2V0QXR0cmlidXRlIFwidHlwZVwiIGlzIFwiZXJyb3JcIlxuICAgICAgICBjb25zb2xlLmVycm9yKHN0YW56YS50b1N0cmluZygpKVxuXG4gICAgICAjIHdoZW4gYSBzdGFuemEgaXMgcmVjZWl2ZWQsIHNlbmQgaXQgdG8gdGhlIGNvcnJlc3BvbmRpbmcgY29ubmVjdG9yXG4gICAgICByb29tID0gZXh0cmFjdF9iYXJlX2Zyb21famlkIHN0YW56YS5nZXRBdHRyaWJ1dGUgXCJmcm9tXCJcbiAgICAgIGlmIEByb29tc1tyb29tXT9cbiAgICAgICAgQHJvb21zW3Jvb21dLm9uU3RhbnphKHN0YW56YSlcblxuXG4gICAgQGRlYnVnID0gZmFsc2VcblxuICAjIEV4ZWN1dGUgYSBmdW5jdGlvbiB3aGVuIHhtcHAgaXMgb25saW5lIChpZiBpdCBpcyBub3QgeWV0IG9ubGluZSwgd2FpdCB1bnRpbCBpdCBpcylcbiAgd2hlbk9ubGluZTogKGYpLT5cbiAgICBpZiBAaXNfb25saW5lXG4gICAgICBmKClcbiAgICBlbHNlXG4gICAgICBAd2hlbl9vbmxpbmVfbGlzdGVuZXJzLnB1c2ggZlxuXG4gICMgQHhtcHAgaXMgb25saW5lIGZyb20gbm93IG9uLiBUaGVyZWZvcmUgdGhpcyBleGVjdXRlZCBhbGwgbGlzdGVuZXJzIHRoYXQgZGVwZW5kIG9uIHRoaXMgZXZlbnRcbiAgc2V0SXNPbmxpbmU6ICgpLT5cbiAgICBmb3IgZiBpbiBAd2hlbl9vbmxpbmVfbGlzdGVuZXJzXG4gICAgICBmKClcbiAgICBAaXNfb25saW5lID0gdHJ1ZVxuXG4gICNcbiAgIyBKb2luIGEgc3BlY2lmaWMgcm9vbVxuICAjIEBwYXJhbXMgam9pbihyb29tLCBzeW5jTWV0aG9kKVxuICAjICAgcm9vbSB7U3RyaW5nfSBUaGUgcm9vbSBuYW1lXG4gICMgICBvcHRpb25zLnJvbGUge1N0cmluZ30gXCJtYXN0ZXJcIiBvciBcInNsYXZlXCIgKGRlZmF1bHRzIHRvIHNsYXZlKVxuICAjICAgb3B0aW9ucy5zeW5jTWV0aG9kIHtTdHJpbmd9IFRoZSBtb2RlIGluIHdoaWNoIHRvIHN5bmMgdG8gdGhlIG90aGVyIGNsaWVudHMgKFwic3luY0FsbFwiIG9yIFwibWFzdGVyLXNsYXZlXCIpXG4gIGpvaW46IChyb29tLCBvcHRpb25zID0ge30pLT5cbiAgICBvcHRpb25zLnJvbGUgPz0gXCJzbGF2ZVwiXG4gICAgb3B0aW9ucy5zeW5jTWV0aG9kID89IFwic3luY0FsbFwiXG4gICAgaWYgbm90IHJvb20/XG4gICAgICB0aHJvdyBuZXcgRXJyb3IgXCJ5b3UgbXVzdCBzcGVjaWZ5IGEgcm9vbSFcIlxuICAgIGlmIHJvb20uaW5kZXhPZihcIkBcIikgaXMgLTFcbiAgICAgIHJvb20gKz0gQGRlZmF1bHRSb29tQ29tcG9uZW50XG4gICAgaWYgbm90IEByb29tc1tyb29tXT9cbiAgICAgIHJvb21fY29ubiA9IG5ldyBYTVBQQ29ubmVjdG9yKClcbiAgICAgIEByb29tc1tyb29tXSA9IHJvb21fY29ublxuICAgICAgQHdoZW5PbmxpbmUgKCk9PlxuICAgICAgICAjIGxvZ2luIHRvIHJvb21cbiAgICAgICAgIyBXYW50IHRvIGJlIGxpa2UgdGhpczpcbiAgICAgICAgIyA8cHJlc2VuY2UgZnJvbT0nYTMzYjk3NTgtNjJmOC00MmUxLWE4MjctODNlZjA0Zjg4N2M1QHlhdHRhLm5pbmphL2M0OWViN2ZiLTE5MjMtNDJmMi05Y2NhLTRjOTc0NzdlYTdhOCcgdG89J3RoaW5nQGNvbmZlcmVuY2UueWF0dGEubmluamEvYzQ5ZWI3ZmItMTkyMy00MmYyLTljY2EtNGM5NzQ3N2VhN2E4JyB4bWxucz0namFiYmVyOmNsaWVudCc+XG4gICAgICAgICMgPHggeG1sbnM9J2h0dHA6Ly9qYWJiZXIub3JnL3Byb3RvY29sL211YycvPjwvcHJlc2VuY2U+XG4gICAgICAgIG9uX2JvdW5kX3RvX3kgPSAoKT0+XG4gICAgICAgICAgcm9vbV9jb25uLmluaXRcbiAgICAgICAgICAgIHN5bmNNZXRob2Q6IG9wdGlvbnMuc3luY01ldGhvZFxuICAgICAgICAgICAgcm9sZTogb3B0aW9ucy5yb2xlXG4gICAgICAgICAgICB1c2VyX2lkOiBAeG1wcC5qaWQucmVzb3VyY2VcbiAgICAgICAgICByb29tX2Nvbm4ucm9vbSA9IHJvb20gIyBzZXQgdGhlIHJvb20gamlkXG4gICAgICAgICAgcm9vbV9jb25uLnJvb21famlkID0gcm9vbSArIFwiL1wiICsgQHhtcHAuamlkLnJlc291cmNlICMgc2V0IHlvdXIgamlkIGluIHRoZSByb29tXG4gICAgICAgICAgcm9vbV9jb25uLnhtcHAgPSBAeG1wcFxuICAgICAgICAgIHJvb21fY29ubi54bXBwX2hhbmRsZXIgPSBAXG4gICAgICAgICAgcm9vbV9zdWJzY3JpcHRpb24gPSBuZXcgbHR4LkVsZW1lbnQgJ3ByZXNlbmNlJyxcbiAgICAgICAgICAgICAgdG86IHJvb21fY29ubi5yb29tX2ppZFxuICAgICAgICAgICAgLmMgJ3gnLCB7fVxuICAgICAgICAgICAgLnVwKClcbiAgICAgICAgICAgIC5jICdyb2xlJywge3htbG5zOiBcImh0dHA6Ly95Lm5pbmphL3JvbGVcIn1cbiAgICAgICAgICAgIC50IHJvb21fY29ubi5yb2xlXG4gICAgICAgICAgQHhtcHAuc2VuZCByb29tX3N1YnNjcmlwdGlvblxuXG4gICAgICAgIGlmIHJvb21fY29ubi5pc19ib3VuZF90b195XG4gICAgICAgICAgb25fYm91bmRfdG9feSgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICByb29tX2Nvbm4ub25fYm91bmRfdG9feSA9IG9uX2JvdW5kX3RvX3lcblxuICAgIEByb29tc1tyb29tXVxuXG5jbGFzcyBYTVBQQ29ubmVjdG9yXG5cbiAgI1xuICAjIGNsb3NlcyBhIGNvbm5lY3Rpb24gdG8gYSByb29tXG4gICNcbiAgZXhpdDogKCktPlxuICAgIEB4bXBwLnNlbmQgbmV3IGx0eC5FbGVtZW50ICdwcmVzZW5jZScsXG4gICAgICB0bzogQHJvb21famlkXG4gICAgICB0eXBlOiBcInVuYXZhaWxhYmxlXCJcbiAgICBkZWxldGUgQHhtcHBfaGFuZGxlci5yb29tc1tAcm9vbV1cblxuICBvblN0YW56YTogKHN0YW56YSktPlxuICAgIGlmIEBkZWJ1Z1xuICAgICAgY29uc29sZS5sb2cgXCJSRUNFSVZFRDogXCIrc3RhbnphLnRvU3RyaW5nKClcbiAgICBzZW5kZXIgPSBleHRyYWN0X3Jlc291cmNlX2Zyb21famlkIHN0YW56YS5nZXRBdHRyaWJ1dGUgXCJmcm9tXCJcbiAgICBpZiBzdGFuemEuaXMgXCJwcmVzZW5jZVwiXG4gICAgICAjIGEgbmV3IHVzZXIgam9pbmVkIG9yIGxlYXZlZCB0aGUgcm9vbVxuICAgICAgaWYgc2VuZGVyIGlzIEB1c2VyX2lkXG4gICAgICAgICMgdGhpcyBjbGllbnQgcmVjZWl2ZWQgaW5mb3JtYXRpb24gdGhhdCBpdCBzdWNjZXNzZnVsbHkgam9pbmVkIHRoZSByb29tXG4gICAgICAgICMgbm9wXG4gICAgICBlbHNlIGlmIHN0YW56YS5nZXRBdHRyaWJ1dGUoXCJ0eXBlXCIpIGlzIFwidW5hdmFpbGFibGVcIlxuICAgICAgICAjIGEgdXNlciBsZWZ0IHRoZSByb29tXG4gICAgICAgIEB1c2VyTGVmdCBzZW5kZXJcbiAgICAgIGVsc2VcbiAgICAgICAgc2VuZGVyX3JvbGUgPSBzdGFuemFcbiAgICAgICAgICAuZ2V0Q2hpbGQoXCJyb2xlXCIsXCJodHRwOi8veS5uaW5qYS9yb2xlXCIpXG4gICAgICAgICAgLmdldFRleHQoKVxuICAgICAgICBAdXNlckpvaW5lZCBzZW5kZXIsIHNlbmRlcl9yb2xlXG4gICAgZWxzZVxuICAgICAgIyBpdCBpcyBzb21lIG1lc3NhZ2UgdGhhdCB3YXMgc2VudCBpbnRvIHRoZSByb29tIChjb3VsZCBhbHNvIGJlIGEgcHJpdmF0ZSBjaGF0IG9yIHdoYXRldmVyKVxuICAgICAgaWYgc2VuZGVyIGlzIEByb29tX2ppZFxuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgICAgcmVzID0gc3RhbnphLmdldENoaWxkIFwieVwiLCBcImh0dHA6Ly95Lm5pbmphL2Nvbm5lY3Rvci1zdGFuemFcIlxuICAgICAgIyBjb3VsZCBiZSBzb21lIHNpbXBsZSB0ZXh0IG1lc3NhZ2UgKG9yIHdoYXRldmVyKVxuICAgICAgaWYgcmVzP1xuICAgICAgICAjIHRoaXMgaXMgZGVmaW5pdGVseSBhIG1lc3NhZ2UgaW50ZW5kZWQgZm9yIFlqc1xuICAgICAgICBAcmVjZWl2ZU1lc3NhZ2Uoc2VuZGVyLCBAcGFyc2VNZXNzYWdlRnJvbVhtbCByZXMpXG5cbiAgc2VuZDogKHVzZXIsIGpzb24sIHR5cGUgPSBcIm1lc3NhZ2VcIiktPlxuICAgICMgZG8gbm90IHNlbmQgeS1vcGVyYXRpb25zIGlmIG5vdCBzeW5jZWQsXG4gICAgIyBzZW5kIHN5bmMgbWVzc2FnZXMgdGhvdWdoXG4gICAgI2lmIEBpc19zeW5jZWQgb3IganNvbi5zeW5jX3N0ZXA/ICMjIG9yIEBpc19zeW5jaW5nXG4gICAgbSA9IG5ldyBsdHguRWxlbWVudCBcIm1lc3NhZ2VcIixcbiAgICAgIHRvOiBpZiB1c2VyIGlzIFwiXCIgdGhlbiBAcm9vbSBlbHNlIEByb29tICsgXCIvXCIgKyB1c2VyXG4gICAgICB0eXBlOiBpZiB0eXBlPyB0aGVuIHR5cGUgZWxzZSBcImNoYXRcIlxuICAgIG1lc3NhZ2UgPSBAZW5jb2RlTWVzc2FnZVRvWG1sKG0sIGpzb24pXG4gICAgaWYgQGRlYnVnXG4gICAgICBjb25zb2xlLmxvZyBcIlNFTkRJTkc6IFwiK21lc3NhZ2Uucm9vdCgpLnRvU3RyaW5nKClcbiAgICBAeG1wcC5zZW5kIG1lc3NhZ2Uucm9vdCgpXG5cbiAgYnJvYWRjYXN0OiAoanNvbiktPlxuICAgIEBzZW5kIFwiXCIsIGpzb24sIFwiZ3JvdXBjaGF0XCJcblxuXG5pZiBtb2R1bGUuZXhwb3J0cz9cbiAgbW9kdWxlLmV4cG9ydHMgPSBYTVBQSGFuZGxlclxuXG5pZiB3aW5kb3c/XG4gIGlmIG5vdCBZP1xuICAgIHRocm93IG5ldyBFcnJvciBcIllvdSBtdXN0IGltcG9ydCBZIGZpcnN0IVwiXG4gIGVsc2VcbiAgICBZLlhNUFAgPSBYTVBQSGFuZGxlclxuIixudWxsLCIvLyBodHRwOi8vd2lraS5jb21tb25qcy5vcmcvd2lraS9Vbml0X1Rlc3RpbmcvMS4wXG4vL1xuLy8gVEhJUyBJUyBOT1QgVEVTVEVEIE5PUiBMSUtFTFkgVE8gV09SSyBPVVRTSURFIFY4IVxuLy9cbi8vIE9yaWdpbmFsbHkgZnJvbSBuYXJ3aGFsLmpzIChodHRwOi8vbmFyd2hhbGpzLm9yZylcbi8vIENvcHlyaWdodCAoYykgMjAwOSBUaG9tYXMgUm9iaW5zb24gPDI4MG5vcnRoLmNvbT5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYSBjb3B5XG4vLyBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZSAnU29mdHdhcmUnKSwgdG9cbi8vIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZyB3aXRob3V0IGxpbWl0YXRpb24gdGhlXG4vLyByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLCBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Jcbi8vIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdCBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzXG4vLyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkIGluXG4vLyBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgJ0FTIElTJywgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTUyBPUlxuLy8gSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRiBNRVJDSEFOVEFCSUxJVFksXG4vLyBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTiBOTyBFVkVOVCBTSEFMTCBUSEVcbi8vIEFVVEhPUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOXG4vLyBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1IgT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OXG4vLyBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEUgVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gd2hlbiB1c2VkIGluIG5vZGUsIHRoaXMgd2lsbCBhY3R1YWxseSBsb2FkIHRoZSB1dGlsIG1vZHVsZSB3ZSBkZXBlbmQgb25cbi8vIHZlcnN1cyBsb2FkaW5nIHRoZSBidWlsdGluIHV0aWwgbW9kdWxlIGFzIGhhcHBlbnMgb3RoZXJ3aXNlXG4vLyB0aGlzIGlzIGEgYnVnIGluIG5vZGUgbW9kdWxlIGxvYWRpbmcgYXMgZmFyIGFzIEkgYW0gY29uY2VybmVkXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwvJyk7XG5cbnZhciBwU2xpY2UgPSBBcnJheS5wcm90b3R5cGUuc2xpY2U7XG52YXIgaGFzT3duID0gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eTtcblxuLy8gMS4gVGhlIGFzc2VydCBtb2R1bGUgcHJvdmlkZXMgZnVuY3Rpb25zIHRoYXQgdGhyb3dcbi8vIEFzc2VydGlvbkVycm9yJ3Mgd2hlbiBwYXJ0aWN1bGFyIGNvbmRpdGlvbnMgYXJlIG5vdCBtZXQuIFRoZVxuLy8gYXNzZXJ0IG1vZHVsZSBtdXN0IGNvbmZvcm0gdG8gdGhlIGZvbGxvd2luZyBpbnRlcmZhY2UuXG5cbnZhciBhc3NlcnQgPSBtb2R1bGUuZXhwb3J0cyA9IG9rO1xuXG4vLyAyLiBUaGUgQXNzZXJ0aW9uRXJyb3IgaXMgZGVmaW5lZCBpbiBhc3NlcnQuXG4vLyBuZXcgYXNzZXJ0LkFzc2VydGlvbkVycm9yKHsgbWVzc2FnZTogbWVzc2FnZSxcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICBhY3R1YWw6IGFjdHVhbCxcbi8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICBleHBlY3RlZDogZXhwZWN0ZWQgfSlcblxuYXNzZXJ0LkFzc2VydGlvbkVycm9yID0gZnVuY3Rpb24gQXNzZXJ0aW9uRXJyb3Iob3B0aW9ucykge1xuICB0aGlzLm5hbWUgPSAnQXNzZXJ0aW9uRXJyb3InO1xuICB0aGlzLmFjdHVhbCA9IG9wdGlvbnMuYWN0dWFsO1xuICB0aGlzLmV4cGVjdGVkID0gb3B0aW9ucy5leHBlY3RlZDtcbiAgdGhpcy5vcGVyYXRvciA9IG9wdGlvbnMub3BlcmF0b3I7XG4gIGlmIChvcHRpb25zLm1lc3NhZ2UpIHtcbiAgICB0aGlzLm1lc3NhZ2UgPSBvcHRpb25zLm1lc3NhZ2U7XG4gICAgdGhpcy5nZW5lcmF0ZWRNZXNzYWdlID0gZmFsc2U7XG4gIH0gZWxzZSB7XG4gICAgdGhpcy5tZXNzYWdlID0gZ2V0TWVzc2FnZSh0aGlzKTtcbiAgICB0aGlzLmdlbmVyYXRlZE1lc3NhZ2UgPSB0cnVlO1xuICB9XG4gIHZhciBzdGFja1N0YXJ0RnVuY3Rpb24gPSBvcHRpb25zLnN0YWNrU3RhcnRGdW5jdGlvbiB8fCBmYWlsO1xuXG4gIGlmIChFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSkge1xuICAgIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKHRoaXMsIHN0YWNrU3RhcnRGdW5jdGlvbik7XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gbm9uIHY4IGJyb3dzZXJzIHNvIHdlIGNhbiBoYXZlIGEgc3RhY2t0cmFjZVxuICAgIHZhciBlcnIgPSBuZXcgRXJyb3IoKTtcbiAgICBpZiAoZXJyLnN0YWNrKSB7XG4gICAgICB2YXIgb3V0ID0gZXJyLnN0YWNrO1xuXG4gICAgICAvLyB0cnkgdG8gc3RyaXAgdXNlbGVzcyBmcmFtZXNcbiAgICAgIHZhciBmbl9uYW1lID0gc3RhY2tTdGFydEZ1bmN0aW9uLm5hbWU7XG4gICAgICB2YXIgaWR4ID0gb3V0LmluZGV4T2YoJ1xcbicgKyBmbl9uYW1lKTtcbiAgICAgIGlmIChpZHggPj0gMCkge1xuICAgICAgICAvLyBvbmNlIHdlIGhhdmUgbG9jYXRlZCB0aGUgZnVuY3Rpb24gZnJhbWVcbiAgICAgICAgLy8gd2UgbmVlZCB0byBzdHJpcCBvdXQgZXZlcnl0aGluZyBiZWZvcmUgaXQgKGFuZCBpdHMgbGluZSlcbiAgICAgICAgdmFyIG5leHRfbGluZSA9IG91dC5pbmRleE9mKCdcXG4nLCBpZHggKyAxKTtcbiAgICAgICAgb3V0ID0gb3V0LnN1YnN0cmluZyhuZXh0X2xpbmUgKyAxKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5zdGFjayA9IG91dDtcbiAgICB9XG4gIH1cbn07XG5cbi8vIGFzc2VydC5Bc3NlcnRpb25FcnJvciBpbnN0YW5jZW9mIEVycm9yXG51dGlsLmluaGVyaXRzKGFzc2VydC5Bc3NlcnRpb25FcnJvciwgRXJyb3IpO1xuXG5mdW5jdGlvbiByZXBsYWNlcihrZXksIHZhbHVlKSB7XG4gIGlmICh1dGlsLmlzVW5kZWZpbmVkKHZhbHVlKSkge1xuICAgIHJldHVybiAnJyArIHZhbHVlO1xuICB9XG4gIGlmICh1dGlsLmlzTnVtYmVyKHZhbHVlKSAmJiAoaXNOYU4odmFsdWUpIHx8ICFpc0Zpbml0ZSh2YWx1ZSkpKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gIH1cbiAgaWYgKHV0aWwuaXNGdW5jdGlvbih2YWx1ZSkgfHwgdXRpbC5pc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gdmFsdWUudG9TdHJpbmcoKTtcbiAgfVxuICByZXR1cm4gdmFsdWU7XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlKHMsIG4pIHtcbiAgaWYgKHV0aWwuaXNTdHJpbmcocykpIHtcbiAgICByZXR1cm4gcy5sZW5ndGggPCBuID8gcyA6IHMuc2xpY2UoMCwgbik7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHM7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0TWVzc2FnZShzZWxmKSB7XG4gIHJldHVybiB0cnVuY2F0ZShKU09OLnN0cmluZ2lmeShzZWxmLmFjdHVhbCwgcmVwbGFjZXIpLCAxMjgpICsgJyAnICtcbiAgICAgICAgIHNlbGYub3BlcmF0b3IgKyAnICcgK1xuICAgICAgICAgdHJ1bmNhdGUoSlNPTi5zdHJpbmdpZnkoc2VsZi5leHBlY3RlZCwgcmVwbGFjZXIpLCAxMjgpO1xufVxuXG4vLyBBdCBwcmVzZW50IG9ubHkgdGhlIHRocmVlIGtleXMgbWVudGlvbmVkIGFib3ZlIGFyZSB1c2VkIGFuZFxuLy8gdW5kZXJzdG9vZCBieSB0aGUgc3BlYy4gSW1wbGVtZW50YXRpb25zIG9yIHN1YiBtb2R1bGVzIGNhbiBwYXNzXG4vLyBvdGhlciBrZXlzIHRvIHRoZSBBc3NlcnRpb25FcnJvcidzIGNvbnN0cnVjdG9yIC0gdGhleSB3aWxsIGJlXG4vLyBpZ25vcmVkLlxuXG4vLyAzLiBBbGwgb2YgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnMgbXVzdCB0aHJvdyBhbiBBc3NlcnRpb25FcnJvclxuLy8gd2hlbiBhIGNvcnJlc3BvbmRpbmcgY29uZGl0aW9uIGlzIG5vdCBtZXQsIHdpdGggYSBtZXNzYWdlIHRoYXRcbi8vIG1heSBiZSB1bmRlZmluZWQgaWYgbm90IHByb3ZpZGVkLiAgQWxsIGFzc2VydGlvbiBtZXRob2RzIHByb3ZpZGVcbi8vIGJvdGggdGhlIGFjdHVhbCBhbmQgZXhwZWN0ZWQgdmFsdWVzIHRvIHRoZSBhc3NlcnRpb24gZXJyb3IgZm9yXG4vLyBkaXNwbGF5IHB1cnBvc2VzLlxuXG5mdW5jdGlvbiBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsIG9wZXJhdG9yLCBzdGFja1N0YXJ0RnVuY3Rpb24pIHtcbiAgdGhyb3cgbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7XG4gICAgbWVzc2FnZTogbWVzc2FnZSxcbiAgICBhY3R1YWw6IGFjdHVhbCxcbiAgICBleHBlY3RlZDogZXhwZWN0ZWQsXG4gICAgb3BlcmF0b3I6IG9wZXJhdG9yLFxuICAgIHN0YWNrU3RhcnRGdW5jdGlvbjogc3RhY2tTdGFydEZ1bmN0aW9uXG4gIH0pO1xufVxuXG4vLyBFWFRFTlNJT04hIGFsbG93cyBmb3Igd2VsbCBiZWhhdmVkIGVycm9ycyBkZWZpbmVkIGVsc2V3aGVyZS5cbmFzc2VydC5mYWlsID0gZmFpbDtcblxuLy8gNC4gUHVyZSBhc3NlcnRpb24gdGVzdHMgd2hldGhlciBhIHZhbHVlIGlzIHRydXRoeSwgYXMgZGV0ZXJtaW5lZFxuLy8gYnkgISFndWFyZC5cbi8vIGFzc2VydC5vayhndWFyZCwgbWVzc2FnZV9vcHQpO1xuLy8gVGhpcyBzdGF0ZW1lbnQgaXMgZXF1aXZhbGVudCB0byBhc3NlcnQuZXF1YWwodHJ1ZSwgISFndWFyZCxcbi8vIG1lc3NhZ2Vfb3B0KTsuIFRvIHRlc3Qgc3RyaWN0bHkgZm9yIHRoZSB2YWx1ZSB0cnVlLCB1c2Vcbi8vIGFzc2VydC5zdHJpY3RFcXVhbCh0cnVlLCBndWFyZCwgbWVzc2FnZV9vcHQpOy5cblxuZnVuY3Rpb24gb2sodmFsdWUsIG1lc3NhZ2UpIHtcbiAgaWYgKCF2YWx1ZSkgZmFpbCh2YWx1ZSwgdHJ1ZSwgbWVzc2FnZSwgJz09JywgYXNzZXJ0Lm9rKTtcbn1cbmFzc2VydC5vayA9IG9rO1xuXG4vLyA1LiBUaGUgZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIHNoYWxsb3csIGNvZXJjaXZlIGVxdWFsaXR5IHdpdGhcbi8vID09LlxuLy8gYXNzZXJ0LmVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LmVxdWFsID0gZnVuY3Rpb24gZXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsICE9IGV4cGVjdGVkKSBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICc9PScsIGFzc2VydC5lcXVhbCk7XG59O1xuXG4vLyA2LiBUaGUgbm9uLWVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBmb3Igd2hldGhlciB0d28gb2JqZWN0cyBhcmUgbm90IGVxdWFsXG4vLyB3aXRoICE9IGFzc2VydC5ub3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3RFcXVhbCA9IGZ1bmN0aW9uIG5vdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCA9PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJyE9JywgYXNzZXJ0Lm5vdEVxdWFsKTtcbiAgfVxufTtcblxuLy8gNy4gVGhlIGVxdWl2YWxlbmNlIGFzc2VydGlvbiB0ZXN0cyBhIGRlZXAgZXF1YWxpdHkgcmVsYXRpb24uXG4vLyBhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LmRlZXBFcXVhbCA9IGZ1bmN0aW9uIGRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmICghX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJ2RlZXBFcXVhbCcsIGFzc2VydC5kZWVwRXF1YWwpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpIHtcbiAgLy8gNy4xLiBBbGwgaWRlbnRpY2FsIHZhbHVlcyBhcmUgZXF1aXZhbGVudCwgYXMgZGV0ZXJtaW5lZCBieSA9PT0uXG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgcmV0dXJuIHRydWU7XG5cbiAgfSBlbHNlIGlmICh1dGlsLmlzQnVmZmVyKGFjdHVhbCkgJiYgdXRpbC5pc0J1ZmZlcihleHBlY3RlZCkpIHtcbiAgICBpZiAoYWN0dWFsLmxlbmd0aCAhPSBleHBlY3RlZC5sZW5ndGgpIHJldHVybiBmYWxzZTtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYWN0dWFsLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoYWN0dWFsW2ldICE9PSBleHBlY3RlZFtpXSkgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0cnVlO1xuXG4gIC8vIDcuMi4gSWYgdGhlIGV4cGVjdGVkIHZhbHVlIGlzIGEgRGF0ZSBvYmplY3QsIHRoZSBhY3R1YWwgdmFsdWUgaXNcbiAgLy8gZXF1aXZhbGVudCBpZiBpdCBpcyBhbHNvIGEgRGF0ZSBvYmplY3QgdGhhdCByZWZlcnMgdG8gdGhlIHNhbWUgdGltZS5cbiAgfSBlbHNlIGlmICh1dGlsLmlzRGF0ZShhY3R1YWwpICYmIHV0aWwuaXNEYXRlKGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwuZ2V0VGltZSgpID09PSBleHBlY3RlZC5nZXRUaW1lKCk7XG5cbiAgLy8gNy4zIElmIHRoZSBleHBlY3RlZCB2YWx1ZSBpcyBhIFJlZ0V4cCBvYmplY3QsIHRoZSBhY3R1YWwgdmFsdWUgaXNcbiAgLy8gZXF1aXZhbGVudCBpZiBpdCBpcyBhbHNvIGEgUmVnRXhwIG9iamVjdCB3aXRoIHRoZSBzYW1lIHNvdXJjZSBhbmRcbiAgLy8gcHJvcGVydGllcyAoYGdsb2JhbGAsIGBtdWx0aWxpbmVgLCBgbGFzdEluZGV4YCwgYGlnbm9yZUNhc2VgKS5cbiAgfSBlbHNlIGlmICh1dGlsLmlzUmVnRXhwKGFjdHVhbCkgJiYgdXRpbC5pc1JlZ0V4cChleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsLnNvdXJjZSA9PT0gZXhwZWN0ZWQuc291cmNlICYmXG4gICAgICAgICAgIGFjdHVhbC5nbG9iYWwgPT09IGV4cGVjdGVkLmdsb2JhbCAmJlxuICAgICAgICAgICBhY3R1YWwubXVsdGlsaW5lID09PSBleHBlY3RlZC5tdWx0aWxpbmUgJiZcbiAgICAgICAgICAgYWN0dWFsLmxhc3RJbmRleCA9PT0gZXhwZWN0ZWQubGFzdEluZGV4ICYmXG4gICAgICAgICAgIGFjdHVhbC5pZ25vcmVDYXNlID09PSBleHBlY3RlZC5pZ25vcmVDYXNlO1xuXG4gIC8vIDcuNC4gT3RoZXIgcGFpcnMgdGhhdCBkbyBub3QgYm90aCBwYXNzIHR5cGVvZiB2YWx1ZSA9PSAnb2JqZWN0JyxcbiAgLy8gZXF1aXZhbGVuY2UgaXMgZGV0ZXJtaW5lZCBieSA9PS5cbiAgfSBlbHNlIGlmICghdXRpbC5pc09iamVjdChhY3R1YWwpICYmICF1dGlsLmlzT2JqZWN0KGV4cGVjdGVkKSkge1xuICAgIHJldHVybiBhY3R1YWwgPT0gZXhwZWN0ZWQ7XG5cbiAgLy8gNy41IEZvciBhbGwgb3RoZXIgT2JqZWN0IHBhaXJzLCBpbmNsdWRpbmcgQXJyYXkgb2JqZWN0cywgZXF1aXZhbGVuY2UgaXNcbiAgLy8gZGV0ZXJtaW5lZCBieSBoYXZpbmcgdGhlIHNhbWUgbnVtYmVyIG9mIG93bmVkIHByb3BlcnRpZXMgKGFzIHZlcmlmaWVkXG4gIC8vIHdpdGggT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKSwgdGhlIHNhbWUgc2V0IG9mIGtleXNcbiAgLy8gKGFsdGhvdWdoIG5vdCBuZWNlc3NhcmlseSB0aGUgc2FtZSBvcmRlciksIGVxdWl2YWxlbnQgdmFsdWVzIGZvciBldmVyeVxuICAvLyBjb3JyZXNwb25kaW5nIGtleSwgYW5kIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS4gTm90ZTogdGhpc1xuICAvLyBhY2NvdW50cyBmb3IgYm90aCBuYW1lZCBhbmQgaW5kZXhlZCBwcm9wZXJ0aWVzIG9uIEFycmF5cy5cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gb2JqRXF1aXYoYWN0dWFsLCBleHBlY3RlZCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gaXNBcmd1bWVudHMob2JqZWN0KSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwob2JqZWN0KSA9PSAnW29iamVjdCBBcmd1bWVudHNdJztcbn1cblxuZnVuY3Rpb24gb2JqRXF1aXYoYSwgYikge1xuICBpZiAodXRpbC5pc051bGxPclVuZGVmaW5lZChhKSB8fCB1dGlsLmlzTnVsbE9yVW5kZWZpbmVkKGIpKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy8gYW4gaWRlbnRpY2FsICdwcm90b3R5cGUnIHByb3BlcnR5LlxuICBpZiAoYS5wcm90b3R5cGUgIT09IGIucHJvdG90eXBlKSByZXR1cm4gZmFsc2U7XG4gIC8vfn5+SSd2ZSBtYW5hZ2VkIHRvIGJyZWFrIE9iamVjdC5rZXlzIHRocm91Z2ggc2NyZXd5IGFyZ3VtZW50cyBwYXNzaW5nLlxuICAvLyAgIENvbnZlcnRpbmcgdG8gYXJyYXkgc29sdmVzIHRoZSBwcm9ibGVtLlxuICBpZiAoaXNBcmd1bWVudHMoYSkpIHtcbiAgICBpZiAoIWlzQXJndW1lbnRzKGIpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGEgPSBwU2xpY2UuY2FsbChhKTtcbiAgICBiID0gcFNsaWNlLmNhbGwoYik7XG4gICAgcmV0dXJuIF9kZWVwRXF1YWwoYSwgYik7XG4gIH1cbiAgdHJ5IHtcbiAgICB2YXIga2EgPSBvYmplY3RLZXlzKGEpLFxuICAgICAgICBrYiA9IG9iamVjdEtleXMoYiksXG4gICAgICAgIGtleSwgaTtcbiAgfSBjYXRjaCAoZSkgey8vaGFwcGVucyB3aGVuIG9uZSBpcyBhIHN0cmluZyBsaXRlcmFsIGFuZCB0aGUgb3RoZXIgaXNuJ3RcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy8gaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChrZXlzIGluY29ycG9yYXRlc1xuICAvLyBoYXNPd25Qcm9wZXJ0eSlcbiAgaWYgKGthLmxlbmd0aCAhPSBrYi5sZW5ndGgpXG4gICAgcmV0dXJuIGZhbHNlO1xuICAvL3RoZSBzYW1lIHNldCBvZiBrZXlzIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLFxuICBrYS5zb3J0KCk7XG4gIGtiLnNvcnQoKTtcbiAgLy9+fn5jaGVhcCBrZXkgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGlmIChrYVtpXSAhPSBrYltpXSlcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICAvL2VxdWl2YWxlbnQgdmFsdWVzIGZvciBldmVyeSBjb3JyZXNwb25kaW5nIGtleSwgYW5kXG4gIC8vfn5+cG9zc2libHkgZXhwZW5zaXZlIGRlZXAgdGVzdFxuICBmb3IgKGkgPSBrYS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgIGtleSA9IGthW2ldO1xuICAgIGlmICghX2RlZXBFcXVhbChhW2tleV0sIGJba2V5XSkpIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuLy8gOC4gVGhlIG5vbi1lcXVpdmFsZW5jZSBhc3NlcnRpb24gdGVzdHMgZm9yIGFueSBkZWVwIGluZXF1YWxpdHkuXG4vLyBhc3NlcnQubm90RGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0Lm5vdERlZXBFcXVhbCA9IGZ1bmN0aW9uIG5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChfZGVlcEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnbm90RGVlcEVxdWFsJywgYXNzZXJ0Lm5vdERlZXBFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDkuIFRoZSBzdHJpY3QgZXF1YWxpdHkgYXNzZXJ0aW9uIHRlc3RzIHN0cmljdCBlcXVhbGl0eSwgYXMgZGV0ZXJtaW5lZCBieSA9PT0uXG4vLyBhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQuc3RyaWN0RXF1YWwgPSBmdW5jdGlvbiBzdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgIT09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnPT09JywgYXNzZXJ0LnN0cmljdEVxdWFsKTtcbiAgfVxufTtcblxuLy8gMTAuIFRoZSBzdHJpY3Qgbm9uLWVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBmb3Igc3RyaWN0IGluZXF1YWxpdHksIGFzXG4vLyBkZXRlcm1pbmVkIGJ5ICE9PS4gIGFzc2VydC5ub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3RTdHJpY3RFcXVhbCA9IGZ1bmN0aW9uIG5vdFN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCA9PT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICchPT0nLCBhc3NlcnQubm90U3RyaWN0RXF1YWwpO1xuICB9XG59O1xuXG5mdW5jdGlvbiBleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSB7XG4gIGlmICghYWN0dWFsIHx8ICFleHBlY3RlZCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoZXhwZWN0ZWQpID09ICdbb2JqZWN0IFJlZ0V4cF0nKSB7XG4gICAgcmV0dXJuIGV4cGVjdGVkLnRlc3QoYWN0dWFsKTtcbiAgfSBlbHNlIGlmIChhY3R1YWwgaW5zdGFuY2VvZiBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuICB9IGVsc2UgaWYgKGV4cGVjdGVkLmNhbGwoe30sIGFjdHVhbCkgPT09IHRydWUpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gX3Rocm93cyhzaG91bGRUaHJvdywgYmxvY2ssIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIHZhciBhY3R1YWw7XG5cbiAgaWYgKHV0aWwuaXNTdHJpbmcoZXhwZWN0ZWQpKSB7XG4gICAgbWVzc2FnZSA9IGV4cGVjdGVkO1xuICAgIGV4cGVjdGVkID0gbnVsbDtcbiAgfVxuXG4gIHRyeSB7XG4gICAgYmxvY2soKTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGFjdHVhbCA9IGU7XG4gIH1cblxuICBtZXNzYWdlID0gKGV4cGVjdGVkICYmIGV4cGVjdGVkLm5hbWUgPyAnICgnICsgZXhwZWN0ZWQubmFtZSArICcpLicgOiAnLicpICtcbiAgICAgICAgICAgIChtZXNzYWdlID8gJyAnICsgbWVzc2FnZSA6ICcuJyk7XG5cbiAgaWYgKHNob3VsZFRocm93ICYmICFhY3R1YWwpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsICdNaXNzaW5nIGV4cGVjdGVkIGV4Y2VwdGlvbicgKyBtZXNzYWdlKTtcbiAgfVxuXG4gIGlmICghc2hvdWxkVGhyb3cgJiYgZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsICdHb3QgdW53YW50ZWQgZXhjZXB0aW9uJyArIG1lc3NhZ2UpO1xuICB9XG5cbiAgaWYgKChzaG91bGRUaHJvdyAmJiBhY3R1YWwgJiYgZXhwZWN0ZWQgJiZcbiAgICAgICFleHBlY3RlZEV4Y2VwdGlvbihhY3R1YWwsIGV4cGVjdGVkKSkgfHwgKCFzaG91bGRUaHJvdyAmJiBhY3R1YWwpKSB7XG4gICAgdGhyb3cgYWN0dWFsO1xuICB9XG59XG5cbi8vIDExLiBFeHBlY3RlZCB0byB0aHJvdyBhbiBlcnJvcjpcbi8vIGFzc2VydC50aHJvd3MoYmxvY2ssIEVycm9yX29wdCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQudGhyb3dzID0gZnVuY3Rpb24oYmxvY2ssIC8qb3B0aW9uYWwqL2Vycm9yLCAvKm9wdGlvbmFsKi9tZXNzYWdlKSB7XG4gIF90aHJvd3MuYXBwbHkodGhpcywgW3RydWVdLmNvbmNhdChwU2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG59O1xuXG4vLyBFWFRFTlNJT04hIFRoaXMgaXMgYW5ub3lpbmcgdG8gd3JpdGUgb3V0c2lkZSB0aGlzIG1vZHVsZS5cbmFzc2VydC5kb2VzTm90VGhyb3cgPSBmdW5jdGlvbihibG9jaywgLypvcHRpb25hbCovbWVzc2FnZSkge1xuICBfdGhyb3dzLmFwcGx5KHRoaXMsIFtmYWxzZV0uY29uY2F0KHBTbGljZS5jYWxsKGFyZ3VtZW50cykpKTtcbn07XG5cbmFzc2VydC5pZkVycm9yID0gZnVuY3Rpb24oZXJyKSB7IGlmIChlcnIpIHt0aHJvdyBlcnI7fX07XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIga2V5cyA9IFtdO1xuICBmb3IgKHZhciBrZXkgaW4gb2JqKSB7XG4gICAgaWYgKGhhc093bi5jYWxsKG9iaiwga2V5KSkga2V5cy5wdXNoKGtleSk7XG4gIH1cbiAgcmV0dXJuIGtleXM7XG59O1xuIiwiLyohXG4gKiBUaGUgYnVmZmVyIG1vZHVsZSBmcm9tIG5vZGUuanMsIGZvciB0aGUgYnJvd3Nlci5cbiAqXG4gKiBAYXV0aG9yICAgRmVyb3NzIEFib3VraGFkaWplaCA8ZmVyb3NzQGZlcm9zcy5vcmc+IDxodHRwOi8vZmVyb3NzLm9yZz5cbiAqIEBsaWNlbnNlICBNSVRcbiAqL1xuXG52YXIgYmFzZTY0ID0gcmVxdWlyZSgnYmFzZTY0LWpzJylcbnZhciBpZWVlNzU0ID0gcmVxdWlyZSgnaWVlZTc1NCcpXG5cbmV4cG9ydHMuQnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLlNsb3dCdWZmZXIgPSBCdWZmZXJcbmV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMgPSA1MFxuQnVmZmVyLnBvb2xTaXplID0gODE5MlxuXG4vKipcbiAqIElmIGBCdWZmZXIuX3VzZVR5cGVkQXJyYXlzYDpcbiAqICAgPT09IHRydWUgICAgVXNlIFVpbnQ4QXJyYXkgaW1wbGVtZW50YXRpb24gKGZhc3Rlc3QpXG4gKiAgID09PSBmYWxzZSAgIFVzZSBPYmplY3QgaW1wbGVtZW50YXRpb24gKGNvbXBhdGlibGUgZG93biB0byBJRTYpXG4gKi9cbkJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgPSAoZnVuY3Rpb24gKCkge1xuICAvLyBEZXRlY3QgaWYgYnJvd3NlciBzdXBwb3J0cyBUeXBlZCBBcnJheXMuIFN1cHBvcnRlZCBicm93c2VycyBhcmUgSUUgMTArLCBGaXJlZm94IDQrLFxuICAvLyBDaHJvbWUgNyssIFNhZmFyaSA1LjErLCBPcGVyYSAxMS42KywgaU9TIDQuMisuIElmIHRoZSBicm93c2VyIGRvZXMgbm90IHN1cHBvcnQgYWRkaW5nXG4gIC8vIHByb3BlcnRpZXMgdG8gYFVpbnQ4QXJyYXlgIGluc3RhbmNlcywgdGhlbiB0aGF0J3MgdGhlIHNhbWUgYXMgbm8gYFVpbnQ4QXJyYXlgIHN1cHBvcnRcbiAgLy8gYmVjYXVzZSB3ZSBuZWVkIHRvIGJlIGFibGUgdG8gYWRkIGFsbCB0aGUgbm9kZSBCdWZmZXIgQVBJIG1ldGhvZHMuIFRoaXMgaXMgYW4gaXNzdWVcbiAgLy8gaW4gRmlyZWZveCA0LTI5LiBOb3cgZml4ZWQ6IGh0dHBzOi8vYnVnemlsbGEubW96aWxsYS5vcmcvc2hvd19idWcuY2dpP2lkPTY5NTQzOFxuICB0cnkge1xuICAgIHZhciBidWYgPSBuZXcgQXJyYXlCdWZmZXIoMClcbiAgICB2YXIgYXJyID0gbmV3IFVpbnQ4QXJyYXkoYnVmKVxuICAgIGFyci5mb28gPSBmdW5jdGlvbiAoKSB7IHJldHVybiA0MiB9XG4gICAgcmV0dXJuIDQyID09PSBhcnIuZm9vKCkgJiZcbiAgICAgICAgdHlwZW9mIGFyci5zdWJhcnJheSA9PT0gJ2Z1bmN0aW9uJyAvLyBDaHJvbWUgOS0xMCBsYWNrIGBzdWJhcnJheWBcbiAgfSBjYXRjaCAoZSkge1xuICAgIHJldHVybiBmYWxzZVxuICB9XG59KSgpXG5cbi8qKlxuICogQ2xhc3M6IEJ1ZmZlclxuICogPT09PT09PT09PT09PVxuICpcbiAqIFRoZSBCdWZmZXIgY29uc3RydWN0b3IgcmV0dXJucyBpbnN0YW5jZXMgb2YgYFVpbnQ4QXJyYXlgIHRoYXQgYXJlIGF1Z21lbnRlZFxuICogd2l0aCBmdW5jdGlvbiBwcm9wZXJ0aWVzIGZvciBhbGwgdGhlIG5vZGUgYEJ1ZmZlcmAgQVBJIGZ1bmN0aW9ucy4gV2UgdXNlXG4gKiBgVWludDhBcnJheWAgc28gdGhhdCBzcXVhcmUgYnJhY2tldCBub3RhdGlvbiB3b3JrcyBhcyBleHBlY3RlZCAtLSBpdCByZXR1cm5zXG4gKiBhIHNpbmdsZSBvY3RldC5cbiAqXG4gKiBCeSBhdWdtZW50aW5nIHRoZSBpbnN0YW5jZXMsIHdlIGNhbiBhdm9pZCBtb2RpZnlpbmcgdGhlIGBVaW50OEFycmF5YFxuICogcHJvdG90eXBlLlxuICovXG5mdW5jdGlvbiBCdWZmZXIgKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pIHtcbiAgaWYgKCEodGhpcyBpbnN0YW5jZW9mIEJ1ZmZlcikpXG4gICAgcmV0dXJuIG5ldyBCdWZmZXIoc3ViamVjdCwgZW5jb2RpbmcsIG5vWmVybylcblxuICB2YXIgdHlwZSA9IHR5cGVvZiBzdWJqZWN0XG5cbiAgLy8gV29ya2Fyb3VuZDogbm9kZSdzIGJhc2U2NCBpbXBsZW1lbnRhdGlvbiBhbGxvd3MgZm9yIG5vbi1wYWRkZWQgc3RyaW5nc1xuICAvLyB3aGlsZSBiYXNlNjQtanMgZG9lcyBub3QuXG4gIGlmIChlbmNvZGluZyA9PT0gJ2Jhc2U2NCcgJiYgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBzdWJqZWN0ID0gc3RyaW5ndHJpbShzdWJqZWN0KVxuICAgIHdoaWxlIChzdWJqZWN0Lmxlbmd0aCAlIDQgIT09IDApIHtcbiAgICAgIHN1YmplY3QgPSBzdWJqZWN0ICsgJz0nXG4gICAgfVxuICB9XG5cbiAgLy8gRmluZCB0aGUgbGVuZ3RoXG4gIHZhciBsZW5ndGhcbiAgaWYgKHR5cGUgPT09ICdudW1iZXInKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0KVxuICBlbHNlIGlmICh0eXBlID09PSAnc3RyaW5nJylcbiAgICBsZW5ndGggPSBCdWZmZXIuYnl0ZUxlbmd0aChzdWJqZWN0LCBlbmNvZGluZylcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ29iamVjdCcpXG4gICAgbGVuZ3RoID0gY29lcmNlKHN1YmplY3QubGVuZ3RoKSAvLyBhc3N1bWUgdGhhdCBvYmplY3QgaXMgYXJyYXktbGlrZVxuICBlbHNlXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGaXJzdCBhcmd1bWVudCBuZWVkcyB0byBiZSBhIG51bWJlciwgYXJyYXkgb3Igc3RyaW5nLicpXG5cbiAgdmFyIGJ1ZlxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIC8vIFByZWZlcnJlZDogUmV0dXJuIGFuIGF1Z21lbnRlZCBgVWludDhBcnJheWAgaW5zdGFuY2UgZm9yIGJlc3QgcGVyZm9ybWFuY2VcbiAgICBidWYgPSBCdWZmZXIuX2F1Z21lbnQobmV3IFVpbnQ4QXJyYXkobGVuZ3RoKSlcbiAgfSBlbHNlIHtcbiAgICAvLyBGYWxsYmFjazogUmV0dXJuIFRISVMgaW5zdGFuY2Ugb2YgQnVmZmVyIChjcmVhdGVkIGJ5IGBuZXdgKVxuICAgIGJ1ZiA9IHRoaXNcbiAgICBidWYubGVuZ3RoID0gbGVuZ3RoXG4gICAgYnVmLl9pc0J1ZmZlciA9IHRydWVcbiAgfVxuXG4gIHZhciBpXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmIHR5cGVvZiBzdWJqZWN0LmJ5dGVMZW5ndGggPT09ICdudW1iZXInKSB7XG4gICAgLy8gU3BlZWQgb3B0aW1pemF0aW9uIC0tIHVzZSBzZXQgaWYgd2UncmUgY29weWluZyBmcm9tIGEgdHlwZWQgYXJyYXlcbiAgICBidWYuX3NldChzdWJqZWN0KVxuICB9IGVsc2UgaWYgKGlzQXJyYXlpc2goc3ViamVjdCkpIHtcbiAgICAvLyBUcmVhdCBhcnJheS1pc2ggb2JqZWN0cyBhcyBhIGJ5dGUgYXJyYXlcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGlmIChCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkpXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3QucmVhZFVJbnQ4KGkpXG4gICAgICBlbHNlXG4gICAgICAgIGJ1ZltpXSA9IHN1YmplY3RbaV1cbiAgICB9XG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICBidWYud3JpdGUoc3ViamVjdCwgMCwgZW5jb2RpbmcpXG4gIH0gZWxzZSBpZiAodHlwZSA9PT0gJ251bWJlcicgJiYgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMgJiYgIW5vWmVybykge1xuICAgIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgYnVmW2ldID0gMFxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBidWZcbn1cblxuLy8gU1RBVElDIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09XG5cbkJ1ZmZlci5pc0VuY29kaW5nID0gZnVuY3Rpb24gKGVuY29kaW5nKSB7XG4gIHN3aXRjaCAoU3RyaW5nKGVuY29kaW5nKS50b0xvd2VyQ2FzZSgpKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICBjYXNlICdyYXcnOlxuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXR1cm4gdHJ1ZVxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gZmFsc2VcbiAgfVxufVxuXG5CdWZmZXIuaXNCdWZmZXIgPSBmdW5jdGlvbiAoYikge1xuICByZXR1cm4gISEoYiAhPT0gbnVsbCAmJiBiICE9PSB1bmRlZmluZWQgJiYgYi5faXNCdWZmZXIpXG59XG5cbkJ1ZmZlci5ieXRlTGVuZ3RoID0gZnVuY3Rpb24gKHN0ciwgZW5jb2RpbmcpIHtcbiAgdmFyIHJldFxuICBzdHIgPSBzdHIgKyAnJ1xuICBzd2l0Y2ggKGVuY29kaW5nIHx8ICd1dGY4Jykge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgICByZXQgPSBzdHIubGVuZ3RoIC8gMlxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSB1dGY4VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdhc2NpaSc6XG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICBjYXNlICdyYXcnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gYmFzZTY0VG9CeXRlcyhzdHIpLmxlbmd0aFxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAqIDJcbiAgICAgIGJyZWFrXG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93IG5ldyBFcnJvcignVW5rbm93biBlbmNvZGluZycpXG4gIH1cbiAgcmV0dXJuIHJldFxufVxuXG5CdWZmZXIuY29uY2F0ID0gZnVuY3Rpb24gKGxpc3QsIHRvdGFsTGVuZ3RoKSB7XG4gIGFzc2VydChpc0FycmF5KGxpc3QpLCAnVXNhZ2U6IEJ1ZmZlci5jb25jYXQobGlzdCwgW3RvdGFsTGVuZ3RoXSlcXG4nICtcbiAgICAgICdsaXN0IHNob3VsZCBiZSBhbiBBcnJheS4nKVxuXG4gIGlmIChsaXN0Lmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKDApXG4gIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPT09IDEpIHtcbiAgICByZXR1cm4gbGlzdFswXVxuICB9XG5cbiAgdmFyIGlcbiAgaWYgKHR5cGVvZiB0b3RhbExlbmd0aCAhPT0gJ251bWJlcicpIHtcbiAgICB0b3RhbExlbmd0aCA9IDBcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGlzdC5sZW5ndGg7IGkrKykge1xuICAgICAgdG90YWxMZW5ndGggKz0gbGlzdFtpXS5sZW5ndGhcbiAgICB9XG4gIH1cblxuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcih0b3RhbExlbmd0aClcbiAgdmFyIHBvcyA9IDBcbiAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgaXRlbSA9IGxpc3RbaV1cbiAgICBpdGVtLmNvcHkoYnVmLCBwb3MpXG4gICAgcG9zICs9IGl0ZW0ubGVuZ3RoXG4gIH1cbiAgcmV0dXJuIGJ1ZlxufVxuXG4vLyBCVUZGRVIgSU5TVEFOQ0UgTUVUSE9EU1xuLy8gPT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gX2hleFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gYnVmLmxlbmd0aCAtIG9mZnNldFxuICBpZiAoIWxlbmd0aCkge1xuICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICB9IGVsc2Uge1xuICAgIGxlbmd0aCA9IE51bWJlcihsZW5ndGgpXG4gICAgaWYgKGxlbmd0aCA+IHJlbWFpbmluZykge1xuICAgICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gICAgfVxuICB9XG5cbiAgLy8gbXVzdCBiZSBhbiBldmVuIG51bWJlciBvZiBkaWdpdHNcbiAgdmFyIHN0ckxlbiA9IHN0cmluZy5sZW5ndGhcbiAgYXNzZXJ0KHN0ckxlbiAlIDIgPT09IDAsICdJbnZhbGlkIGhleCBzdHJpbmcnKVxuXG4gIGlmIChsZW5ndGggPiBzdHJMZW4gLyAyKSB7XG4gICAgbGVuZ3RoID0gc3RyTGVuIC8gMlxuICB9XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYnl0ZSA9IHBhcnNlSW50KHN0cmluZy5zdWJzdHIoaSAqIDIsIDIpLCAxNilcbiAgICBhc3NlcnQoIWlzTmFOKGJ5dGUpLCAnSW52YWxpZCBoZXggc3RyaW5nJylcbiAgICBidWZbb2Zmc2V0ICsgaV0gPSBieXRlXG4gIH1cbiAgQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPSBpICogMlxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBfdXRmOFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjhUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2FzY2lpV3JpdGUgKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgY2hhcnNXcml0dGVuID0gQnVmZmVyLl9jaGFyc1dyaXR0ZW4gPVxuICAgIGJsaXRCdWZmZXIoYXNjaWlUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX2JpbmFyeVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgcmV0dXJuIF9hc2NpaVdyaXRlKGJ1Ziwgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGJhc2U2NFRvQnl0ZXMoc3RyaW5nKSwgYnVmLCBvZmZzZXQsIGxlbmd0aClcbiAgcmV0dXJuIGNoYXJzV3JpdHRlblxufVxuXG5mdW5jdGlvbiBfdXRmMTZsZVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKHV0ZjE2bGVUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZykge1xuICAvLyBTdXBwb3J0IGJvdGggKHN0cmluZywgb2Zmc2V0LCBsZW5ndGgsIGVuY29kaW5nKVxuICAvLyBhbmQgdGhlIGxlZ2FjeSAoc3RyaW5nLCBlbmNvZGluZywgb2Zmc2V0LCBsZW5ndGgpXG4gIGlmIChpc0Zpbml0ZShvZmZzZXQpKSB7XG4gICAgaWYgKCFpc0Zpbml0ZShsZW5ndGgpKSB7XG4gICAgICBlbmNvZGluZyA9IGxlbmd0aFxuICAgICAgbGVuZ3RoID0gdW5kZWZpbmVkXG4gICAgfVxuICB9IGVsc2UgeyAgLy8gbGVnYWN5XG4gICAgdmFyIHN3YXAgPSBlbmNvZGluZ1xuICAgIGVuY29kaW5nID0gb2Zmc2V0XG4gICAgb2Zmc2V0ID0gbGVuZ3RoXG4gICAgbGVuZ3RoID0gc3dhcFxuICB9XG5cbiAgb2Zmc2V0ID0gTnVtYmVyKG9mZnNldCkgfHwgMFxuICB2YXIgcmVtYWluaW5nID0gdGhpcy5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpV3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uIChlbmNvZGluZywgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VsZiA9IHRoaXNcblxuICBlbmNvZGluZyA9IFN0cmluZyhlbmNvZGluZyB8fCAndXRmOCcpLnRvTG93ZXJDYXNlKClcbiAgc3RhcnQgPSBOdW1iZXIoc3RhcnQpIHx8IDBcbiAgZW5kID0gKGVuZCAhPT0gdW5kZWZpbmVkKVxuICAgID8gTnVtYmVyKGVuZClcbiAgICA6IGVuZCA9IHNlbGYubGVuZ3RoXG5cbiAgLy8gRmFzdHBhdGggZW1wdHkgc3RyaW5nc1xuICBpZiAoZW5kID09PSBzdGFydClcbiAgICByZXR1cm4gJydcblxuICB2YXIgcmV0XG4gIHN3aXRjaCAoZW5jb2RpbmcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gX2hleFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3V0ZjgnOlxuICAgIGNhc2UgJ3V0Zi04JzpcbiAgICAgIHJldCA9IF91dGY4U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgICAgcmV0ID0gX2FzY2lpU2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmluYXJ5JzpcbiAgICAgIHJldCA9IF9iaW5hcnlTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICdiYXNlNjQnOlxuICAgICAgcmV0ID0gX2Jhc2U2NFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ3VjczInOlxuICAgIGNhc2UgJ3Vjcy0yJzpcbiAgICBjYXNlICd1dGYxNmxlJzpcbiAgICBjYXNlICd1dGYtMTZsZSc6XG4gICAgICByZXQgPSBfdXRmMTZsZVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbiAoKSB7XG4gIHJldHVybiB7XG4gICAgdHlwZTogJ0J1ZmZlcicsXG4gICAgZGF0YTogQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwodGhpcy5fYXJyIHx8IHRoaXMsIDApXG4gIH1cbn1cblxuLy8gY29weSh0YXJnZXRCdWZmZXIsIHRhcmdldFN0YXJ0PTAsIHNvdXJjZVN0YXJ0PTAsIHNvdXJjZUVuZD1idWZmZXIubGVuZ3RoKVxuQnVmZmVyLnByb3RvdHlwZS5jb3B5ID0gZnVuY3Rpb24gKHRhcmdldCwgdGFyZ2V0X3N0YXJ0LCBzdGFydCwgZW5kKSB7XG4gIHZhciBzb3VyY2UgPSB0aGlzXG5cbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kICYmIGVuZCAhPT0gMCkgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKCF0YXJnZXRfc3RhcnQpIHRhcmdldF9zdGFydCA9IDBcblxuICAvLyBDb3B5IDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGFyZ2V0Lmxlbmd0aCA9PT0gMCB8fCBzb3VyY2UubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICAvLyBGYXRhbCBlcnJvciBjb25kaXRpb25zXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdzb3VyY2VFbmQgPCBzb3VyY2VTdGFydCcpXG4gIGFzc2VydCh0YXJnZXRfc3RhcnQgPj0gMCAmJiB0YXJnZXRfc3RhcnQgPCB0YXJnZXQubGVuZ3RoLFxuICAgICAgJ3RhcmdldFN0YXJ0IG91dCBvZiBib3VuZHMnKVxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHNvdXJjZS5sZW5ndGgsICdzb3VyY2VTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSBzb3VyY2UubGVuZ3RoLCAnc291cmNlRW5kIG91dCBvZiBib3VuZHMnKVxuXG4gIC8vIEFyZSB3ZSBvb2I/XG4gIGlmIChlbmQgPiB0aGlzLmxlbmd0aClcbiAgICBlbmQgPSB0aGlzLmxlbmd0aFxuICBpZiAodGFyZ2V0Lmxlbmd0aCAtIHRhcmdldF9zdGFydCA8IGVuZCAtIHN0YXJ0KVxuICAgIGVuZCA9IHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgKyBzdGFydFxuXG4gIHZhciBsZW4gPSBlbmQgLSBzdGFydFxuXG4gIGlmIChsZW4gPCAxMDAgfHwgIUJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgdGFyZ2V0W2kgKyB0YXJnZXRfc3RhcnRdID0gdGhpc1tpICsgc3RhcnRdXG4gIH0gZWxzZSB7XG4gICAgdGFyZ2V0Ll9zZXQodGhpcy5zdWJhcnJheShzdGFydCwgc3RhcnQgKyBsZW4pLCB0YXJnZXRfc3RhcnQpXG4gIH1cbn1cblxuZnVuY3Rpb24gX2Jhc2U2NFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKHN0YXJ0ID09PSAwICYmIGVuZCA9PT0gYnVmLmxlbmd0aCkge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYpXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIGJhc2U2NC5mcm9tQnl0ZUFycmF5KGJ1Zi5zbGljZShzdGFydCwgZW5kKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBfdXRmOFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJlcyA9ICcnXG4gIHZhciB0bXAgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBpZiAoYnVmW2ldIDw9IDB4N0YpIHtcbiAgICAgIHJlcyArPSBkZWNvZGVVdGY4Q2hhcih0bXApICsgU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gICAgICB0bXAgPSAnJ1xuICAgIH0gZWxzZSB7XG4gICAgICB0bXAgKz0gJyUnICsgYnVmW2ldLnRvU3RyaW5nKDE2KVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiByZXMgKyBkZWNvZGVVdGY4Q2hhcih0bXApXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHJldCA9ICcnXG4gIGVuZCA9IE1hdGgubWluKGJ1Zi5sZW5ndGgsIGVuZClcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKylcbiAgICByZXQgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShidWZbaV0pXG4gIHJldHVybiByZXRcbn1cblxuZnVuY3Rpb24gX2JpbmFyeVNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgcmV0dXJuIF9hc2NpaVNsaWNlKGJ1Ziwgc3RhcnQsIGVuZClcbn1cblxuZnVuY3Rpb24gX2hleFNsaWNlIChidWYsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcblxuICBpZiAoIXN0YXJ0IHx8IHN0YXJ0IDwgMCkgc3RhcnQgPSAwXG4gIGlmICghZW5kIHx8IGVuZCA8IDAgfHwgZW5kID4gbGVuKSBlbmQgPSBsZW5cblxuICB2YXIgb3V0ID0gJydcbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICBvdXQgKz0gdG9IZXgoYnVmW2ldKVxuICB9XG4gIHJldHVybiBvdXRcbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBieXRlcyA9IGJ1Zi5zbGljZShzdGFydCwgZW5kKVxuICB2YXIgcmVzID0gJydcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlcyArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldICsgYnl0ZXNbaSsxXSAqIDI1NilcbiAgfVxuICByZXR1cm4gcmVzXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuc2xpY2UgPSBmdW5jdGlvbiAoc3RhcnQsIGVuZCkge1xuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgc3RhcnQgPSBjbGFtcChzdGFydCwgbGVuLCAwKVxuICBlbmQgPSBjbGFtcChlbmQsIGxlbiwgbGVuKVxuXG4gIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgcmV0dXJuIEJ1ZmZlci5fYXVnbWVudCh0aGlzLnN1YmFycmF5KHN0YXJ0LCBlbmQpKVxuICB9IGVsc2Uge1xuICAgIHZhciBzbGljZUxlbiA9IGVuZCAtIHN0YXJ0XG4gICAgdmFyIG5ld0J1ZiA9IG5ldyBCdWZmZXIoc2xpY2VMZW4sIHVuZGVmaW5lZCwgdHJ1ZSlcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHNsaWNlTGVuOyBpKyspIHtcbiAgICAgIG5ld0J1ZltpXSA9IHRoaXNbaSArIHN0YXJ0XVxuICAgIH1cbiAgICByZXR1cm4gbmV3QnVmXG4gIH1cbn1cblxuLy8gYGdldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuZ2V0ID0gZnVuY3Rpb24gKG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLmdldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMucmVhZFVJbnQ4KG9mZnNldClcbn1cblxuLy8gYHNldGAgd2lsbCBiZSByZW1vdmVkIGluIE5vZGUgMC4xMytcbkJ1ZmZlci5wcm90b3R5cGUuc2V0ID0gZnVuY3Rpb24gKHYsIG9mZnNldCkge1xuICBjb25zb2xlLmxvZygnLnNldCgpIGlzIGRlcHJlY2F0ZWQuIEFjY2VzcyB1c2luZyBhcnJheSBpbmRleGVzIGluc3RlYWQuJylcbiAgcmV0dXJuIHRoaXMud3JpdGVVSW50OCh2LCBvZmZzZXQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkVUludDE2IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbFxuICBpZiAobGl0dGxlRW5kaWFuKSB7XG4gICAgdmFsID0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV0gPDwgOFxuICB9IGVsc2Uge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMSA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMV1cbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQzMiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIGlmIChvZmZzZXQgKyAyIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDJdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgICB2YWwgfD0gYnVmW29mZnNldF1cbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0ICsgM10gPDwgMjQgPj4+IDApXG4gIH0gZWxzZSB7XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgPSBidWZbb2Zmc2V0ICsgMV0gPDwgMTZcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgMl0gPDwgOFxuICAgIGlmIChvZmZzZXQgKyAzIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAzXVxuICAgIHZhbCA9IHZhbCArIChidWZbb2Zmc2V0XSA8PCAyNCA+Pj4gMClcbiAgfVxuICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZFVJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkVUludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQ4ID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsXG4gICAgICAgICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICB2YXIgbmVnID0gdGhpc1tvZmZzZXRdICYgMHg4MFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZiAtIHRoaXNbb2Zmc2V0XSArIDEpICogLTFcbiAgZWxzZVxuICAgIHJldHVybiB0aGlzW29mZnNldF1cbn1cblxuZnVuY3Rpb24gX3JlYWRJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWwgPSBfcmVhZFVJbnQxNihidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCB0cnVlKVxuICB2YXIgbmVnID0gdmFsICYgMHg4MDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDE2TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MzIoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMDAwMDBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmZmZmZmZmYgLSB2YWwgKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdmFsXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEludDMyTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRmxvYXQgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCAyMywgNClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRmxvYXRMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEZsb2F0KHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0QkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWREb3VibGUgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCArIDcgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgcmV0dXJuIGllZWU3NTQucmVhZChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCA1MiwgOClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlTEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkRG91YmxlQkUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWREb3VibGUodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aCkgcmV0dXJuXG5cbiAgdGhpc1tvZmZzZXRdID0gdmFsdWVcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZilcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGZvciAodmFyIGkgPSAwLCBqID0gTWF0aC5taW4obGVuIC0gb2Zmc2V0LCAyKTsgaSA8IGo7IGkrKykge1xuICAgIGJ1ZltvZmZzZXQgKyBpXSA9XG4gICAgICAgICh2YWx1ZSAmICgweGZmIDw8ICg4ICogKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkpKSkgPj4+XG4gICAgICAgICAgICAobGl0dGxlRW5kaWFuID8gaSA6IDEgLSBpKSAqIDhcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlVUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlVUludDMyIChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAndHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnVpbnQodmFsdWUsIDB4ZmZmZmZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgNCk7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgPj4+IChsaXR0bGVFbmRpYW4gPyBpIDogMyAtIGkpICogOCkgJiAweGZmXG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQzMkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQ4ID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCA8IHRoaXMubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2YsIC0weDgwKVxuICB9XG5cbiAgaWYgKG9mZnNldCA+PSB0aGlzLmxlbmd0aClcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICB0aGlzLndyaXRlVUludDgodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICB0aGlzLndyaXRlVUludDgoMHhmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MTYgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmLCAtMHg4MDAwKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgX3dyaXRlVUludDE2KGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbiAgZWxzZVxuICAgIF93cml0ZVVJbnQxNihidWYsIDB4ZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MTZMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmZmZmZmZmLCAtMHg4MDAwMDAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQzMihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MzIoYnVmLCAweGZmZmZmZmZmICsgdmFsdWUgKyAxLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQzMkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDMyKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUZsb2F0IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZklFRUU3NTQodmFsdWUsIDMuNDAyODIzNDY2Mzg1Mjg4NmUrMzgsIC0zLjQwMjgyMzQ2NjM4NTI4ODZlKzM4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVGbG9hdExFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUZsb2F0KHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZURvdWJsZSAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCxcbiAgICAgICAgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAxLjc5NzY5MzEzNDg2MjMxNTdFKzMwOCwgLTEuNzk3NjkzMTM0ODYyMzE1N0UrMzA4KVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgaWVlZTc1NC53cml0ZShidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVEb3VibGVCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVEb3VibGUodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG4vLyBmaWxsKHZhbHVlLCBzdGFydD0wLCBlbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuZmlsbCA9IGZ1bmN0aW9uICh2YWx1ZSwgc3RhcnQsIGVuZCkge1xuICBpZiAoIXZhbHVlKSB2YWx1ZSA9IDBcbiAgaWYgKCFzdGFydCkgc3RhcnQgPSAwXG4gIGlmICghZW5kKSBlbmQgPSB0aGlzLmxlbmd0aFxuXG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgdmFsdWUgPSB2YWx1ZS5jaGFyQ29kZUF0KDApXG4gIH1cblxuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiAhaXNOYU4odmFsdWUpLCAndmFsdWUgaXMgbm90IGEgbnVtYmVyJylcbiAgYXNzZXJ0KGVuZCA+PSBzdGFydCwgJ2VuZCA8IHN0YXJ0JylcblxuICAvLyBGaWxsIDAgYnl0ZXM7IHdlJ3JlIGRvbmVcbiAgaWYgKGVuZCA9PT0gc3RhcnQpIHJldHVyblxuICBpZiAodGhpcy5sZW5ndGggPT09IDApIHJldHVyblxuXG4gIGFzc2VydChzdGFydCA+PSAwICYmIHN0YXJ0IDwgdGhpcy5sZW5ndGgsICdzdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KGVuZCA+PSAwICYmIGVuZCA8PSB0aGlzLmxlbmd0aCwgJ2VuZCBvdXQgb2YgYm91bmRzJylcblxuICBmb3IgKHZhciBpID0gc3RhcnQ7IGkgPCBlbmQ7IGkrKykge1xuICAgIHRoaXNbaV0gPSB2YWx1ZVxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUuaW5zcGVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgdmFyIG91dCA9IFtdXG4gIHZhciBsZW4gPSB0aGlzLmxlbmd0aFxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgb3V0W2ldID0gdG9IZXgodGhpc1tpXSlcbiAgICBpZiAoaSA9PT0gZXhwb3J0cy5JTlNQRUNUX01BWF9CWVRFUykge1xuICAgICAgb3V0W2kgKyAxXSA9ICcuLi4nXG4gICAgICBicmVha1xuICAgIH1cbiAgfVxuICByZXR1cm4gJzxCdWZmZXIgJyArIG91dC5qb2luKCcgJykgKyAnPidcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmV3IGBBcnJheUJ1ZmZlcmAgd2l0aCB0aGUgKmNvcGllZCogbWVtb3J5IG9mIHRoZSBidWZmZXIgaW5zdGFuY2UuXG4gKiBBZGRlZCBpbiBOb2RlIDAuMTIuIE9ubHkgYXZhaWxhYmxlIGluIGJyb3dzZXJzIHRoYXQgc3VwcG9ydCBBcnJheUJ1ZmZlci5cbiAqL1xuQnVmZmVyLnByb3RvdHlwZS50b0FycmF5QnVmZmVyID0gZnVuY3Rpb24gKCkge1xuICBpZiAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAgIHJldHVybiAobmV3IEJ1ZmZlcih0aGlzKSkuYnVmZmVyXG4gICAgfSBlbHNlIHtcbiAgICAgIHZhciBidWYgPSBuZXcgVWludDhBcnJheSh0aGlzLmxlbmd0aClcbiAgICAgIGZvciAodmFyIGkgPSAwLCBsZW4gPSBidWYubGVuZ3RoOyBpIDwgbGVuOyBpICs9IDEpXG4gICAgICAgIGJ1ZltpXSA9IHRoaXNbaV1cbiAgICAgIHJldHVybiBidWYuYnVmZmVyXG4gICAgfVxuICB9IGVsc2Uge1xuICAgIHRocm93IG5ldyBFcnJvcignQnVmZmVyLnRvQXJyYXlCdWZmZXIgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXInKVxuICB9XG59XG5cbi8vIEhFTFBFUiBGVU5DVElPTlNcbi8vID09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gc3RyaW5ndHJpbSAoc3RyKSB7XG4gIGlmIChzdHIudHJpbSkgcmV0dXJuIHN0ci50cmltKClcbiAgcmV0dXJuIHN0ci5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbn1cblxudmFyIEJQID0gQnVmZmVyLnByb3RvdHlwZVxuXG4vKipcbiAqIEF1Z21lbnQgYSBVaW50OEFycmF5ICppbnN0YW5jZSogKG5vdCB0aGUgVWludDhBcnJheSBjbGFzcyEpIHdpdGggQnVmZmVyIG1ldGhvZHNcbiAqL1xuQnVmZmVyLl9hdWdtZW50ID0gZnVuY3Rpb24gKGFycikge1xuICBhcnIuX2lzQnVmZmVyID0gdHJ1ZVxuXG4gIC8vIHNhdmUgcmVmZXJlbmNlIHRvIG9yaWdpbmFsIFVpbnQ4QXJyYXkgZ2V0L3NldCBtZXRob2RzIGJlZm9yZSBvdmVyd3JpdGluZ1xuICBhcnIuX2dldCA9IGFyci5nZXRcbiAgYXJyLl9zZXQgPSBhcnIuc2V0XG5cbiAgLy8gZGVwcmVjYXRlZCwgd2lsbCBiZSByZW1vdmVkIGluIG5vZGUgMC4xMytcbiAgYXJyLmdldCA9IEJQLmdldFxuICBhcnIuc2V0ID0gQlAuc2V0XG5cbiAgYXJyLndyaXRlID0gQlAud3JpdGVcbiAgYXJyLnRvU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvTG9jYWxlU3RyaW5nID0gQlAudG9TdHJpbmdcbiAgYXJyLnRvSlNPTiA9IEJQLnRvSlNPTlxuICBhcnIuY29weSA9IEJQLmNvcHlcbiAgYXJyLnNsaWNlID0gQlAuc2xpY2VcbiAgYXJyLnJlYWRVSW50OCA9IEJQLnJlYWRVSW50OFxuICBhcnIucmVhZFVJbnQxNkxFID0gQlAucmVhZFVJbnQxNkxFXG4gIGFyci5yZWFkVUludDE2QkUgPSBCUC5yZWFkVUludDE2QkVcbiAgYXJyLnJlYWRVSW50MzJMRSA9IEJQLnJlYWRVSW50MzJMRVxuICBhcnIucmVhZFVJbnQzMkJFID0gQlAucmVhZFVJbnQzMkJFXG4gIGFyci5yZWFkSW50OCA9IEJQLnJlYWRJbnQ4XG4gIGFyci5yZWFkSW50MTZMRSA9IEJQLnJlYWRJbnQxNkxFXG4gIGFyci5yZWFkSW50MTZCRSA9IEJQLnJlYWRJbnQxNkJFXG4gIGFyci5yZWFkSW50MzJMRSA9IEJQLnJlYWRJbnQzMkxFXG4gIGFyci5yZWFkSW50MzJCRSA9IEJQLnJlYWRJbnQzMkJFXG4gIGFyci5yZWFkRmxvYXRMRSA9IEJQLnJlYWRGbG9hdExFXG4gIGFyci5yZWFkRmxvYXRCRSA9IEJQLnJlYWRGbG9hdEJFXG4gIGFyci5yZWFkRG91YmxlTEUgPSBCUC5yZWFkRG91YmxlTEVcbiAgYXJyLnJlYWREb3VibGVCRSA9IEJQLnJlYWREb3VibGVCRVxuICBhcnIud3JpdGVVSW50OCA9IEJQLndyaXRlVUludDhcbiAgYXJyLndyaXRlVUludDE2TEUgPSBCUC53cml0ZVVJbnQxNkxFXG4gIGFyci53cml0ZVVJbnQxNkJFID0gQlAud3JpdGVVSW50MTZCRVxuICBhcnIud3JpdGVVSW50MzJMRSA9IEJQLndyaXRlVUludDMyTEVcbiAgYXJyLndyaXRlVUludDMyQkUgPSBCUC53cml0ZVVJbnQzMkJFXG4gIGFyci53cml0ZUludDggPSBCUC53cml0ZUludDhcbiAgYXJyLndyaXRlSW50MTZMRSA9IEJQLndyaXRlSW50MTZMRVxuICBhcnIud3JpdGVJbnQxNkJFID0gQlAud3JpdGVJbnQxNkJFXG4gIGFyci53cml0ZUludDMyTEUgPSBCUC53cml0ZUludDMyTEVcbiAgYXJyLndyaXRlSW50MzJCRSA9IEJQLndyaXRlSW50MzJCRVxuICBhcnIud3JpdGVGbG9hdExFID0gQlAud3JpdGVGbG9hdExFXG4gIGFyci53cml0ZUZsb2F0QkUgPSBCUC53cml0ZUZsb2F0QkVcbiAgYXJyLndyaXRlRG91YmxlTEUgPSBCUC53cml0ZURvdWJsZUxFXG4gIGFyci53cml0ZURvdWJsZUJFID0gQlAud3JpdGVEb3VibGVCRVxuICBhcnIuZmlsbCA9IEJQLmZpbGxcbiAgYXJyLmluc3BlY3QgPSBCUC5pbnNwZWN0XG4gIGFyci50b0FycmF5QnVmZmVyID0gQlAudG9BcnJheUJ1ZmZlclxuXG4gIHJldHVybiBhcnJcbn1cblxuLy8gc2xpY2Uoc3RhcnQsIGVuZClcbmZ1bmN0aW9uIGNsYW1wIChpbmRleCwgbGVuLCBkZWZhdWx0VmFsdWUpIHtcbiAgaWYgKHR5cGVvZiBpbmRleCAhPT0gJ251bWJlcicpIHJldHVybiBkZWZhdWx0VmFsdWVcbiAgaW5kZXggPSB+fmluZGV4OyAgLy8gQ29lcmNlIHRvIGludGVnZXIuXG4gIGlmIChpbmRleCA+PSBsZW4pIHJldHVybiBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICBpbmRleCArPSBsZW5cbiAgaWYgKGluZGV4ID49IDApIHJldHVybiBpbmRleFxuICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBjb2VyY2UgKGxlbmd0aCkge1xuICAvLyBDb2VyY2UgbGVuZ3RoIHRvIGEgbnVtYmVyIChwb3NzaWJseSBOYU4pLCByb3VuZCB1cFxuICAvLyBpbiBjYXNlIGl0J3MgZnJhY3Rpb25hbCAoZS5nLiAxMjMuNDU2KSB0aGVuIGRvIGFcbiAgLy8gZG91YmxlIG5lZ2F0ZSB0byBjb2VyY2UgYSBOYU4gdG8gMC4gRWFzeSwgcmlnaHQ/XG4gIGxlbmd0aCA9IH5+TWF0aC5jZWlsKCtsZW5ndGgpXG4gIHJldHVybiBsZW5ndGggPCAwID8gMCA6IGxlbmd0aFxufVxuXG5mdW5jdGlvbiBpc0FycmF5IChzdWJqZWN0KSB7XG4gIHJldHVybiAoQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoc3ViamVjdCkge1xuICAgIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoc3ViamVjdCkgPT09ICdbb2JqZWN0IEFycmF5XSdcbiAgfSkoc3ViamVjdClcbn1cblxuZnVuY3Rpb24gaXNBcnJheWlzaCAoc3ViamVjdCkge1xuICByZXR1cm4gaXNBcnJheShzdWJqZWN0KSB8fCBCdWZmZXIuaXNCdWZmZXIoc3ViamVjdCkgfHxcbiAgICAgIHN1YmplY3QgJiYgdHlwZW9mIHN1YmplY3QgPT09ICdvYmplY3QnICYmXG4gICAgICB0eXBlb2Ygc3ViamVjdC5sZW5ndGggPT09ICdudW1iZXInXG59XG5cbmZ1bmN0aW9uIHRvSGV4IChuKSB7XG4gIGlmIChuIDwgMTYpIHJldHVybiAnMCcgKyBuLnRvU3RyaW5nKDE2KVxuICByZXR1cm4gbi50b1N0cmluZygxNilcbn1cblxuZnVuY3Rpb24gdXRmOFRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICB2YXIgYiA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaWYgKGIgPD0gMHg3RilcbiAgICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpKVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHN0YXJ0ID0gaVxuICAgICAgaWYgKGIgPj0gMHhEODAwICYmIGIgPD0gMHhERkZGKSBpKytcbiAgICAgIHZhciBoID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0ci5zbGljZShzdGFydCwgaSsxKSkuc3Vic3RyKDEpLnNwbGl0KCclJylcbiAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgaC5sZW5ndGg7IGorKylcbiAgICAgICAgYnl0ZUFycmF5LnB1c2gocGFyc2VJbnQoaFtqXSwgMTYpKVxuICAgIH1cbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIGFzY2lpVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBieXRlQXJyYXkgPSBbXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHN0ci5sZW5ndGg7IGkrKykge1xuICAgIC8vIE5vZGUncyBjb2RlIHNlZW1zIHRvIGJlIGRvaW5nIHRoaXMgYW5kIG5vdCAmIDB4N0YuLlxuICAgIGJ5dGVBcnJheS5wdXNoKHN0ci5jaGFyQ29kZUF0KGkpICYgMHhGRilcbiAgfVxuICByZXR1cm4gYnl0ZUFycmF5XG59XG5cbmZ1bmN0aW9uIHV0ZjE2bGVUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGMsIGhpLCBsb1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICBjID0gc3RyLmNoYXJDb2RlQXQoaSlcbiAgICBoaSA9IGMgPj4gOFxuICAgIGxvID0gYyAlIDI1NlxuICAgIGJ5dGVBcnJheS5wdXNoKGxvKVxuICAgIGJ5dGVBcnJheS5wdXNoKGhpKVxuICB9XG5cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBiYXNlNjRUb0J5dGVzIChzdHIpIHtcbiAgcmV0dXJuIGJhc2U2NC50b0J5dGVBcnJheShzdHIpXG59XG5cbmZ1bmN0aW9uIGJsaXRCdWZmZXIgKHNyYywgZHN0LCBvZmZzZXQsIGxlbmd0aCkge1xuICB2YXIgcG9zXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoKGkgKyBvZmZzZXQgPj0gZHN0Lmxlbmd0aCkgfHwgKGkgPj0gc3JjLmxlbmd0aCkpXG4gICAgICBicmVha1xuICAgIGRzdFtpICsgb2Zmc2V0XSA9IHNyY1tpXVxuICB9XG4gIHJldHVybiBpXG59XG5cbmZ1bmN0aW9uIGRlY29kZVV0ZjhDaGFyIChzdHIpIHtcbiAgdHJ5IHtcbiAgICByZXR1cm4gZGVjb2RlVVJJQ29tcG9uZW50KHN0cilcbiAgfSBjYXRjaCAoZXJyKSB7XG4gICAgcmV0dXJuIFN0cmluZy5mcm9tQ2hhckNvZGUoMHhGRkZEKSAvLyBVVEYgOCBpbnZhbGlkIGNoYXJcbiAgfVxufVxuXG4vKlxuICogV2UgaGF2ZSB0byBtYWtlIHN1cmUgdGhhdCB0aGUgdmFsdWUgaXMgYSB2YWxpZCBpbnRlZ2VyLiBUaGlzIG1lYW5zIHRoYXQgaXRcbiAqIGlzIG5vbi1uZWdhdGl2ZS4gSXQgaGFzIG5vIGZyYWN0aW9uYWwgY29tcG9uZW50IGFuZCB0aGF0IGl0IGRvZXMgbm90XG4gKiBleGNlZWQgdGhlIG1heGltdW0gYWxsb3dlZCB2YWx1ZS5cbiAqL1xuZnVuY3Rpb24gdmVyaWZ1aW50ICh2YWx1ZSwgbWF4KSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA+PSAwLCAnc3BlY2lmaWVkIGEgbmVnYXRpdmUgdmFsdWUgZm9yIHdyaXRpbmcgYW4gdW5zaWduZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgaXMgbGFyZ2VyIHRoYW4gbWF4aW11bSB2YWx1ZSBmb3IgdHlwZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmc2ludCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG4gIGFzc2VydChNYXRoLmZsb29yKHZhbHVlKSA9PT0gdmFsdWUsICd2YWx1ZSBoYXMgYSBmcmFjdGlvbmFsIGNvbXBvbmVudCcpXG59XG5cbmZ1bmN0aW9uIHZlcmlmSUVFRTc1NCAodmFsdWUsIG1heCwgbWluKSB7XG4gIGFzc2VydCh0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInLCAnY2Fubm90IHdyaXRlIGEgbm9uLW51bWJlciBhcyBhIG51bWJlcicpXG4gIGFzc2VydCh2YWx1ZSA8PSBtYXgsICd2YWx1ZSBsYXJnZXIgdGhhbiBtYXhpbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQodmFsdWUgPj0gbWluLCAndmFsdWUgc21hbGxlciB0aGFuIG1pbmltdW0gYWxsb3dlZCB2YWx1ZScpXG59XG5cbmZ1bmN0aW9uIGFzc2VydCAodGVzdCwgbWVzc2FnZSkge1xuICBpZiAoIXRlc3QpIHRocm93IG5ldyBFcnJvcihtZXNzYWdlIHx8ICdGYWlsZWQgYXNzZXJ0aW9uJylcbn1cbiIsInZhciBsb29rdXAgPSAnQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLyc7XG5cbjsoZnVuY3Rpb24gKGV4cG9ydHMpIHtcblx0J3VzZSBzdHJpY3QnO1xuXG4gIHZhciBBcnIgPSAodHlwZW9mIFVpbnQ4QXJyYXkgIT09ICd1bmRlZmluZWQnKVxuICAgID8gVWludDhBcnJheVxuICAgIDogQXJyYXlcblxuXHR2YXIgUExVUyAgID0gJysnLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIICA9ICcvJy5jaGFyQ29kZUF0KDApXG5cdHZhciBOVU1CRVIgPSAnMCcuY2hhckNvZGVBdCgwKVxuXHR2YXIgTE9XRVIgID0gJ2EnLmNoYXJDb2RlQXQoMClcblx0dmFyIFVQUEVSICA9ICdBJy5jaGFyQ29kZUF0KDApXG5cdHZhciBQTFVTX1VSTF9TQUZFID0gJy0nLmNoYXJDb2RlQXQoMClcblx0dmFyIFNMQVNIX1VSTF9TQUZFID0gJ18nLmNoYXJDb2RlQXQoMClcblxuXHRmdW5jdGlvbiBkZWNvZGUgKGVsdCkge1xuXHRcdHZhciBjb2RlID0gZWx0LmNoYXJDb2RlQXQoMClcblx0XHRpZiAoY29kZSA9PT0gUExVUyB8fFxuXHRcdCAgICBjb2RlID09PSBQTFVTX1VSTF9TQUZFKVxuXHRcdFx0cmV0dXJuIDYyIC8vICcrJ1xuXHRcdGlmIChjb2RlID09PSBTTEFTSCB8fFxuXHRcdCAgICBjb2RlID09PSBTTEFTSF9VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MyAvLyAnLydcblx0XHRpZiAoY29kZSA8IE5VTUJFUilcblx0XHRcdHJldHVybiAtMSAvL25vIG1hdGNoXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIgKyAxMClcblx0XHRcdHJldHVybiBjb2RlIC0gTlVNQkVSICsgMjYgKyAyNlxuXHRcdGlmIChjb2RlIDwgVVBQRVIgKyAyNilcblx0XHRcdHJldHVybiBjb2RlIC0gVVBQRVJcblx0XHRpZiAoY29kZSA8IExPV0VSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIExPV0VSICsgMjZcblx0fVxuXG5cdGZ1bmN0aW9uIGI2NFRvQnl0ZUFycmF5IChiNjQpIHtcblx0XHR2YXIgaSwgaiwgbCwgdG1wLCBwbGFjZUhvbGRlcnMsIGFyclxuXG5cdFx0aWYgKGI2NC5sZW5ndGggJSA0ID4gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIHN0cmluZy4gTGVuZ3RoIG11c3QgYmUgYSBtdWx0aXBsZSBvZiA0Jylcblx0XHR9XG5cblx0XHQvLyB0aGUgbnVtYmVyIG9mIGVxdWFsIHNpZ25zIChwbGFjZSBob2xkZXJzKVxuXHRcdC8vIGlmIHRoZXJlIGFyZSB0d28gcGxhY2Vob2xkZXJzLCB0aGFuIHRoZSB0d28gY2hhcmFjdGVycyBiZWZvcmUgaXRcblx0XHQvLyByZXByZXNlbnQgb25lIGJ5dGVcblx0XHQvLyBpZiB0aGVyZSBpcyBvbmx5IG9uZSwgdGhlbiB0aGUgdGhyZWUgY2hhcmFjdGVycyBiZWZvcmUgaXQgcmVwcmVzZW50IDIgYnl0ZXNcblx0XHQvLyB0aGlzIGlzIGp1c3QgYSBjaGVhcCBoYWNrIHRvIG5vdCBkbyBpbmRleE9mIHR3aWNlXG5cdFx0dmFyIGxlbiA9IGI2NC5sZW5ndGhcblx0XHRwbGFjZUhvbGRlcnMgPSAnPScgPT09IGI2NC5jaGFyQXQobGVuIC0gMikgPyAyIDogJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDEpID8gMSA6IDBcblxuXHRcdC8vIGJhc2U2NCBpcyA0LzMgKyB1cCB0byB0d28gY2hhcmFjdGVycyBvZiB0aGUgb3JpZ2luYWwgZGF0YVxuXHRcdGFyciA9IG5ldyBBcnIoYjY0Lmxlbmd0aCAqIDMgLyA0IC0gcGxhY2VIb2xkZXJzKVxuXG5cdFx0Ly8gaWYgdGhlcmUgYXJlIHBsYWNlaG9sZGVycywgb25seSBnZXQgdXAgdG8gdGhlIGxhc3QgY29tcGxldGUgNCBjaGFyc1xuXHRcdGwgPSBwbGFjZUhvbGRlcnMgPiAwID8gYjY0Lmxlbmd0aCAtIDQgOiBiNjQubGVuZ3RoXG5cblx0XHR2YXIgTCA9IDBcblxuXHRcdGZ1bmN0aW9uIHB1c2ggKHYpIHtcblx0XHRcdGFycltMKytdID0gdlxuXHRcdH1cblxuXHRcdGZvciAoaSA9IDAsIGogPSAwOyBpIDwgbDsgaSArPSA0LCBqICs9IDMpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTgpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgMTIpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPDwgNikgfCBkZWNvZGUoYjY0LmNoYXJBdChpICsgMykpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDAwMCkgPj4gMTYpXG5cdFx0XHRwdXNoKCh0bXAgJiAweEZGMDApID4+IDgpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0aWYgKHBsYWNlSG9sZGVycyA9PT0gMikge1xuXHRcdFx0dG1wID0gKGRlY29kZShiNjQuY2hhckF0KGkpKSA8PCAyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpID4+IDQpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fSBlbHNlIGlmIChwbGFjZUhvbGRlcnMgPT09IDEpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMTApIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAxKSkgPDwgNCkgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDIpKSA+PiAyKVxuXHRcdFx0cHVzaCgodG1wID4+IDgpICYgMHhGRilcblx0XHRcdHB1c2godG1wICYgMHhGRilcblx0XHR9XG5cblx0XHRyZXR1cm4gYXJyXG5cdH1cblxuXHRmdW5jdGlvbiB1aW50OFRvQmFzZTY0ICh1aW50OCkge1xuXHRcdHZhciBpLFxuXHRcdFx0ZXh0cmFCeXRlcyA9IHVpbnQ4Lmxlbmd0aCAlIDMsIC8vIGlmIHdlIGhhdmUgMSBieXRlIGxlZnQsIHBhZCAyIGJ5dGVzXG5cdFx0XHRvdXRwdXQgPSBcIlwiLFxuXHRcdFx0dGVtcCwgbGVuZ3RoXG5cblx0XHRmdW5jdGlvbiBlbmNvZGUgKG51bSkge1xuXHRcdFx0cmV0dXJuIGxvb2t1cC5jaGFyQXQobnVtKVxuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRyaXBsZXRUb0Jhc2U2NCAobnVtKSB7XG5cdFx0XHRyZXR1cm4gZW5jb2RlKG51bSA+PiAxOCAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiAxMiAmIDB4M0YpICsgZW5jb2RlKG51bSA+PiA2ICYgMHgzRikgKyBlbmNvZGUobnVtICYgMHgzRilcblx0XHR9XG5cblx0XHQvLyBnbyB0aHJvdWdoIHRoZSBhcnJheSBldmVyeSB0aHJlZSBieXRlcywgd2UnbGwgZGVhbCB3aXRoIHRyYWlsaW5nIHN0dWZmIGxhdGVyXG5cdFx0Zm9yIChpID0gMCwgbGVuZ3RoID0gdWludDgubGVuZ3RoIC0gZXh0cmFCeXRlczsgaSA8IGxlbmd0aDsgaSArPSAzKSB7XG5cdFx0XHR0ZW1wID0gKHVpbnQ4W2ldIDw8IDE2KSArICh1aW50OFtpICsgMV0gPDwgOCkgKyAodWludDhbaSArIDJdKVxuXHRcdFx0b3V0cHV0ICs9IHRyaXBsZXRUb0Jhc2U2NCh0ZW1wKVxuXHRcdH1cblxuXHRcdC8vIHBhZCB0aGUgZW5kIHdpdGggemVyb3MsIGJ1dCBtYWtlIHN1cmUgdG8gbm90IGZvcmdldCB0aGUgZXh0cmEgYnl0ZXNcblx0XHRzd2l0Y2ggKGV4dHJhQnl0ZXMpIHtcblx0XHRcdGNhc2UgMTpcblx0XHRcdFx0dGVtcCA9IHVpbnQ4W3VpbnQ4Lmxlbmd0aCAtIDFdXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAyKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wIDw8IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9ICc9PSdcblx0XHRcdFx0YnJlYWtcblx0XHRcdGNhc2UgMjpcblx0XHRcdFx0dGVtcCA9ICh1aW50OFt1aW50OC5sZW5ndGggLSAyXSA8PCA4KSArICh1aW50OFt1aW50OC5sZW5ndGggLSAxXSlcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSh0ZW1wID4+IDEwKVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKCh0ZW1wID4+IDQpICYgMHgzRilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCAyKSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPSdcblx0XHRcdFx0YnJlYWtcblx0XHR9XG5cblx0XHRyZXR1cm4gb3V0cHV0XG5cdH1cblxuXHRleHBvcnRzLnRvQnl0ZUFycmF5ID0gYjY0VG9CeXRlQXJyYXlcblx0ZXhwb3J0cy5mcm9tQnl0ZUFycmF5ID0gdWludDhUb0Jhc2U2NFxufSh0eXBlb2YgZXhwb3J0cyA9PT0gJ3VuZGVmaW5lZCcgPyAodGhpcy5iYXNlNjRqcyA9IHt9KSA6IGV4cG9ydHMpKVxuIiwiZXhwb3J0cy5yZWFkID0gZnVuY3Rpb24oYnVmZmVyLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBuQml0cyA9IC03LFxuICAgICAgaSA9IGlzTEUgPyAobkJ5dGVzIC0gMSkgOiAwLFxuICAgICAgZCA9IGlzTEUgPyAtMSA6IDEsXG4gICAgICBzID0gYnVmZmVyW29mZnNldCArIGldO1xuXG4gIGkgKz0gZDtcblxuICBlID0gcyAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgcyA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IGVMZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IGUgPSBlICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIG0gPSBlICYgKCgxIDw8ICgtbkJpdHMpKSAtIDEpO1xuICBlID4+PSAoLW5CaXRzKTtcbiAgbkJpdHMgKz0gbUxlbjtcbiAgZm9yICg7IG5CaXRzID4gMDsgbSA9IG0gKiAyNTYgKyBidWZmZXJbb2Zmc2V0ICsgaV0sIGkgKz0gZCwgbkJpdHMgLT0gOCk7XG5cbiAgaWYgKGUgPT09IDApIHtcbiAgICBlID0gMSAtIGVCaWFzO1xuICB9IGVsc2UgaWYgKGUgPT09IGVNYXgpIHtcbiAgICByZXR1cm4gbSA/IE5hTiA6ICgocyA/IC0xIDogMSkgKiBJbmZpbml0eSk7XG4gIH0gZWxzZSB7XG4gICAgbSA9IG0gKyBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICBlID0gZSAtIGVCaWFzO1xuICB9XG4gIHJldHVybiAocyA/IC0xIDogMSkgKiBtICogTWF0aC5wb3coMiwgZSAtIG1MZW4pO1xufTtcblxuZXhwb3J0cy53cml0ZSA9IGZ1bmN0aW9uKGJ1ZmZlciwgdmFsdWUsIG9mZnNldCwgaXNMRSwgbUxlbiwgbkJ5dGVzKSB7XG4gIHZhciBlLCBtLCBjLFxuICAgICAgZUxlbiA9IG5CeXRlcyAqIDggLSBtTGVuIC0gMSxcbiAgICAgIGVNYXggPSAoMSA8PCBlTGVuKSAtIDEsXG4gICAgICBlQmlhcyA9IGVNYXggPj4gMSxcbiAgICAgIHJ0ID0gKG1MZW4gPT09IDIzID8gTWF0aC5wb3coMiwgLTI0KSAtIE1hdGgucG93KDIsIC03NykgOiAwKSxcbiAgICAgIGkgPSBpc0xFID8gMCA6IChuQnl0ZXMgLSAxKSxcbiAgICAgIGQgPSBpc0xFID8gMSA6IC0xLFxuICAgICAgcyA9IHZhbHVlIDwgMCB8fCAodmFsdWUgPT09IDAgJiYgMSAvIHZhbHVlIDwgMCkgPyAxIDogMDtcblxuICB2YWx1ZSA9IE1hdGguYWJzKHZhbHVlKTtcblxuICBpZiAoaXNOYU4odmFsdWUpIHx8IHZhbHVlID09PSBJbmZpbml0eSkge1xuICAgIG0gPSBpc05hTih2YWx1ZSkgPyAxIDogMDtcbiAgICBlID0gZU1heDtcbiAgfSBlbHNlIHtcbiAgICBlID0gTWF0aC5mbG9vcihNYXRoLmxvZyh2YWx1ZSkgLyBNYXRoLkxOMik7XG4gICAgaWYgKHZhbHVlICogKGMgPSBNYXRoLnBvdygyLCAtZSkpIDwgMSkge1xuICAgICAgZS0tO1xuICAgICAgYyAqPSAyO1xuICAgIH1cbiAgICBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIHZhbHVlICs9IHJ0IC8gYztcbiAgICB9IGVsc2Uge1xuICAgICAgdmFsdWUgKz0gcnQgKiBNYXRoLnBvdygyLCAxIC0gZUJpYXMpO1xuICAgIH1cbiAgICBpZiAodmFsdWUgKiBjID49IDIpIHtcbiAgICAgIGUrKztcbiAgICAgIGMgLz0gMjtcbiAgICB9XG5cbiAgICBpZiAoZSArIGVCaWFzID49IGVNYXgpIHtcbiAgICAgIG0gPSAwO1xuICAgICAgZSA9IGVNYXg7XG4gICAgfSBlbHNlIGlmIChlICsgZUJpYXMgPj0gMSkge1xuICAgICAgbSA9ICh2YWx1ZSAqIGMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IGUgKyBlQmlhcztcbiAgICB9IGVsc2Uge1xuICAgICAgbSA9IHZhbHVlICogTWF0aC5wb3coMiwgZUJpYXMgLSAxKSAqIE1hdGgucG93KDIsIG1MZW4pO1xuICAgICAgZSA9IDA7XG4gICAgfVxuICB9XG5cbiAgZm9yICg7IG1MZW4gPj0gODsgYnVmZmVyW29mZnNldCArIGldID0gbSAmIDB4ZmYsIGkgKz0gZCwgbSAvPSAyNTYsIG1MZW4gLT0gOCk7XG5cbiAgZSA9IChlIDw8IG1MZW4pIHwgbTtcbiAgZUxlbiArPSBtTGVuO1xuICBmb3IgKDsgZUxlbiA+IDA7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IGUgJiAweGZmLCBpICs9IGQsIGUgLz0gMjU2LCBlTGVuIC09IDgpO1xuXG4gIGJ1ZmZlcltvZmZzZXQgKyBpIC0gZF0gfD0gcyAqIDEyODtcbn07XG4iLCJ2YXIgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyO1xudmFyIGludFNpemUgPSA0O1xudmFyIHplcm9CdWZmZXIgPSBuZXcgQnVmZmVyKGludFNpemUpOyB6ZXJvQnVmZmVyLmZpbGwoMCk7XG52YXIgY2hyc3ogPSA4O1xuXG5mdW5jdGlvbiB0b0FycmF5KGJ1ZiwgYmlnRW5kaWFuKSB7XG4gIGlmICgoYnVmLmxlbmd0aCAlIGludFNpemUpICE9PSAwKSB7XG4gICAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGggKyAoaW50U2l6ZSAtIChidWYubGVuZ3RoICUgaW50U2l6ZSkpO1xuICAgIGJ1ZiA9IEJ1ZmZlci5jb25jYXQoW2J1ZiwgemVyb0J1ZmZlcl0sIGxlbik7XG4gIH1cblxuICB2YXIgYXJyID0gW107XG4gIHZhciBmbiA9IGJpZ0VuZGlhbiA/IGJ1Zi5yZWFkSW50MzJCRSA6IGJ1Zi5yZWFkSW50MzJMRTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBidWYubGVuZ3RoOyBpICs9IGludFNpemUpIHtcbiAgICBhcnIucHVzaChmbi5jYWxsKGJ1ZiwgaSkpO1xuICB9XG4gIHJldHVybiBhcnI7XG59XG5cbmZ1bmN0aW9uIHRvQnVmZmVyKGFyciwgc2l6ZSwgYmlnRW5kaWFuKSB7XG4gIHZhciBidWYgPSBuZXcgQnVmZmVyKHNpemUpO1xuICB2YXIgZm4gPSBiaWdFbmRpYW4gPyBidWYud3JpdGVJbnQzMkJFIDogYnVmLndyaXRlSW50MzJMRTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICBmbi5jYWxsKGJ1ZiwgYXJyW2ldLCBpICogNCwgdHJ1ZSk7XG4gIH1cbiAgcmV0dXJuIGJ1Zjtcbn1cblxuZnVuY3Rpb24gaGFzaChidWYsIGZuLCBoYXNoU2l6ZSwgYmlnRW5kaWFuKSB7XG4gIGlmICghQnVmZmVyLmlzQnVmZmVyKGJ1ZikpIGJ1ZiA9IG5ldyBCdWZmZXIoYnVmKTtcbiAgdmFyIGFyciA9IGZuKHRvQXJyYXkoYnVmLCBiaWdFbmRpYW4pLCBidWYubGVuZ3RoICogY2hyc3opO1xuICByZXR1cm4gdG9CdWZmZXIoYXJyLCBoYXNoU2l6ZSwgYmlnRW5kaWFuKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7IGhhc2g6IGhhc2ggfTtcbiIsInZhciBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXJcbnZhciBzaGEgPSByZXF1aXJlKCcuL3NoYScpXG52YXIgc2hhMjU2ID0gcmVxdWlyZSgnLi9zaGEyNTYnKVxudmFyIHJuZyA9IHJlcXVpcmUoJy4vcm5nJylcbnZhciBtZDUgPSByZXF1aXJlKCcuL21kNScpXG5cbnZhciBhbGdvcml0aG1zID0ge1xuICBzaGExOiBzaGEsXG4gIHNoYTI1Njogc2hhMjU2LFxuICBtZDU6IG1kNVxufVxuXG52YXIgYmxvY2tzaXplID0gNjRcbnZhciB6ZXJvQnVmZmVyID0gbmV3IEJ1ZmZlcihibG9ja3NpemUpOyB6ZXJvQnVmZmVyLmZpbGwoMClcbmZ1bmN0aW9uIGhtYWMoZm4sIGtleSwgZGF0YSkge1xuICBpZighQnVmZmVyLmlzQnVmZmVyKGtleSkpIGtleSA9IG5ldyBCdWZmZXIoa2V5KVxuICBpZighQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSBkYXRhID0gbmV3IEJ1ZmZlcihkYXRhKVxuXG4gIGlmKGtleS5sZW5ndGggPiBibG9ja3NpemUpIHtcbiAgICBrZXkgPSBmbihrZXkpXG4gIH0gZWxzZSBpZihrZXkubGVuZ3RoIDwgYmxvY2tzaXplKSB7XG4gICAga2V5ID0gQnVmZmVyLmNvbmNhdChba2V5LCB6ZXJvQnVmZmVyXSwgYmxvY2tzaXplKVxuICB9XG5cbiAgdmFyIGlwYWQgPSBuZXcgQnVmZmVyKGJsb2Nrc2l6ZSksIG9wYWQgPSBuZXcgQnVmZmVyKGJsb2Nrc2l6ZSlcbiAgZm9yKHZhciBpID0gMDsgaSA8IGJsb2Nrc2l6ZTsgaSsrKSB7XG4gICAgaXBhZFtpXSA9IGtleVtpXSBeIDB4MzZcbiAgICBvcGFkW2ldID0ga2V5W2ldIF4gMHg1Q1xuICB9XG5cbiAgdmFyIGhhc2ggPSBmbihCdWZmZXIuY29uY2F0KFtpcGFkLCBkYXRhXSkpXG4gIHJldHVybiBmbihCdWZmZXIuY29uY2F0KFtvcGFkLCBoYXNoXSkpXG59XG5cbmZ1bmN0aW9uIGhhc2goYWxnLCBrZXkpIHtcbiAgYWxnID0gYWxnIHx8ICdzaGExJ1xuICB2YXIgZm4gPSBhbGdvcml0aG1zW2FsZ11cbiAgdmFyIGJ1ZnMgPSBbXVxuICB2YXIgbGVuZ3RoID0gMFxuICBpZighZm4pIGVycm9yKCdhbGdvcml0aG06JywgYWxnLCAnaXMgbm90IHlldCBzdXBwb3J0ZWQnKVxuICByZXR1cm4ge1xuICAgIHVwZGF0ZTogZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAgIGlmKCFCdWZmZXIuaXNCdWZmZXIoZGF0YSkpIGRhdGEgPSBuZXcgQnVmZmVyKGRhdGEpXG4gICAgICAgIFxuICAgICAgYnVmcy5wdXNoKGRhdGEpXG4gICAgICBsZW5ndGggKz0gZGF0YS5sZW5ndGhcbiAgICAgIHJldHVybiB0aGlzXG4gICAgfSxcbiAgICBkaWdlc3Q6IGZ1bmN0aW9uIChlbmMpIHtcbiAgICAgIHZhciBidWYgPSBCdWZmZXIuY29uY2F0KGJ1ZnMpXG4gICAgICB2YXIgciA9IGtleSA/IGhtYWMoZm4sIGtleSwgYnVmKSA6IGZuKGJ1ZilcbiAgICAgIGJ1ZnMgPSBudWxsXG4gICAgICByZXR1cm4gZW5jID8gci50b1N0cmluZyhlbmMpIDogclxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBlcnJvciAoKSB7XG4gIHZhciBtID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpLmpvaW4oJyAnKVxuICB0aHJvdyBuZXcgRXJyb3IoW1xuICAgIG0sXG4gICAgJ3dlIGFjY2VwdCBwdWxsIHJlcXVlc3RzJyxcbiAgICAnaHR0cDovL2dpdGh1Yi5jb20vZG9taW5pY3RhcnIvY3J5cHRvLWJyb3dzZXJpZnknXG4gICAgXS5qb2luKCdcXG4nKSlcbn1cblxuZXhwb3J0cy5jcmVhdGVIYXNoID0gZnVuY3Rpb24gKGFsZykgeyByZXR1cm4gaGFzaChhbGcpIH1cbmV4cG9ydHMuY3JlYXRlSG1hYyA9IGZ1bmN0aW9uIChhbGcsIGtleSkgeyByZXR1cm4gaGFzaChhbGcsIGtleSkgfVxuZXhwb3J0cy5yYW5kb21CeXRlcyA9IGZ1bmN0aW9uKHNpemUsIGNhbGxiYWNrKSB7XG4gIGlmIChjYWxsYmFjayAmJiBjYWxsYmFjay5jYWxsKSB7XG4gICAgdHJ5IHtcbiAgICAgIGNhbGxiYWNrLmNhbGwodGhpcywgdW5kZWZpbmVkLCBuZXcgQnVmZmVyKHJuZyhzaXplKSkpXG4gICAgfSBjYXRjaCAoZXJyKSB7IGNhbGxiYWNrKGVycikgfVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBuZXcgQnVmZmVyKHJuZyhzaXplKSlcbiAgfVxufVxuXG5mdW5jdGlvbiBlYWNoKGEsIGYpIHtcbiAgZm9yKHZhciBpIGluIGEpXG4gICAgZihhW2ldLCBpKVxufVxuXG4vLyB0aGUgbGVhc3QgSSBjYW4gZG8gaXMgbWFrZSBlcnJvciBtZXNzYWdlcyBmb3IgdGhlIHJlc3Qgb2YgdGhlIG5vZGUuanMvY3J5cHRvIGFwaS5cbmVhY2goWydjcmVhdGVDcmVkZW50aWFscydcbiwgJ2NyZWF0ZUNpcGhlcidcbiwgJ2NyZWF0ZUNpcGhlcml2J1xuLCAnY3JlYXRlRGVjaXBoZXInXG4sICdjcmVhdGVEZWNpcGhlcml2J1xuLCAnY3JlYXRlU2lnbidcbiwgJ2NyZWF0ZVZlcmlmeSdcbiwgJ2NyZWF0ZURpZmZpZUhlbGxtYW4nXG4sICdwYmtkZjInXSwgZnVuY3Rpb24gKG5hbWUpIHtcbiAgZXhwb3J0c1tuYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICBlcnJvcignc29ycnksJywgbmFtZSwgJ2lzIG5vdCBpbXBsZW1lbnRlZCB5ZXQnKVxuICB9XG59KVxuIiwiLypcclxuICogQSBKYXZhU2NyaXB0IGltcGxlbWVudGF0aW9uIG9mIHRoZSBSU0EgRGF0YSBTZWN1cml0eSwgSW5jLiBNRDUgTWVzc2FnZVxyXG4gKiBEaWdlc3QgQWxnb3JpdGhtLCBhcyBkZWZpbmVkIGluIFJGQyAxMzIxLlxyXG4gKiBWZXJzaW9uIDIuMSBDb3B5cmlnaHQgKEMpIFBhdWwgSm9obnN0b24gMTk5OSAtIDIwMDIuXHJcbiAqIE90aGVyIGNvbnRyaWJ1dG9yczogR3JlZyBIb2x0LCBBbmRyZXcgS2VwZXJ0LCBZZG5hciwgTG9zdGluZXRcclxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBMaWNlbnNlXHJcbiAqIFNlZSBodHRwOi8vcGFqaG9tZS5vcmcudWsvY3J5cHQvbWQ1IGZvciBtb3JlIGluZm8uXHJcbiAqL1xyXG5cclxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcclxuXHJcbi8qXHJcbiAqIFBlcmZvcm0gYSBzaW1wbGUgc2VsZi10ZXN0IHRvIHNlZSBpZiB0aGUgVk0gaXMgd29ya2luZ1xyXG4gKi9cclxuZnVuY3Rpb24gbWQ1X3ZtX3Rlc3QoKVxyXG57XHJcbiAgcmV0dXJuIGhleF9tZDUoXCJhYmNcIikgPT0gXCI5MDAxNTA5ODNjZDI0ZmIwZDY5NjNmN2QyOGUxN2Y3MlwiO1xyXG59XHJcblxyXG4vKlxyXG4gKiBDYWxjdWxhdGUgdGhlIE1ENSBvZiBhbiBhcnJheSBvZiBsaXR0bGUtZW5kaWFuIHdvcmRzLCBhbmQgYSBiaXQgbGVuZ3RoXHJcbiAqL1xyXG5mdW5jdGlvbiBjb3JlX21kNSh4LCBsZW4pXHJcbntcclxuICAvKiBhcHBlbmQgcGFkZGluZyAqL1xyXG4gIHhbbGVuID4+IDVdIHw9IDB4ODAgPDwgKChsZW4pICUgMzIpO1xyXG4gIHhbKCgobGVuICsgNjQpID4+PiA5KSA8PCA0KSArIDE0XSA9IGxlbjtcclxuXHJcbiAgdmFyIGEgPSAgMTczMjU4NDE5MztcclxuICB2YXIgYiA9IC0yNzE3MzM4Nzk7XHJcbiAgdmFyIGMgPSAtMTczMjU4NDE5NDtcclxuICB2YXIgZCA9ICAyNzE3MzM4Nzg7XHJcblxyXG4gIGZvcih2YXIgaSA9IDA7IGkgPCB4Lmxlbmd0aDsgaSArPSAxNilcclxuICB7XHJcbiAgICB2YXIgb2xkYSA9IGE7XHJcbiAgICB2YXIgb2xkYiA9IGI7XHJcbiAgICB2YXIgb2xkYyA9IGM7XHJcbiAgICB2YXIgb2xkZCA9IGQ7XHJcblxyXG4gICAgYSA9IG1kNV9mZihhLCBiLCBjLCBkLCB4W2krIDBdLCA3ICwgLTY4MDg3NjkzNik7XHJcbiAgICBkID0gbWQ1X2ZmKGQsIGEsIGIsIGMsIHhbaSsgMV0sIDEyLCAtMzg5NTY0NTg2KTtcclxuICAgIGMgPSBtZDVfZmYoYywgZCwgYSwgYiwgeFtpKyAyXSwgMTcsICA2MDYxMDU4MTkpO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krIDNdLCAyMiwgLTEwNDQ1MjUzMzApO1xyXG4gICAgYSA9IG1kNV9mZihhLCBiLCBjLCBkLCB4W2krIDRdLCA3ICwgLTE3NjQxODg5Nyk7XHJcbiAgICBkID0gbWQ1X2ZmKGQsIGEsIGIsIGMsIHhbaSsgNV0sIDEyLCAgMTIwMDA4MDQyNik7XHJcbiAgICBjID0gbWQ1X2ZmKGMsIGQsIGEsIGIsIHhbaSsgNl0sIDE3LCAtMTQ3MzIzMTM0MSk7XHJcbiAgICBiID0gbWQ1X2ZmKGIsIGMsIGQsIGEsIHhbaSsgN10sIDIyLCAtNDU3MDU5ODMpO1xyXG4gICAgYSA9IG1kNV9mZihhLCBiLCBjLCBkLCB4W2krIDhdLCA3ICwgIDE3NzAwMzU0MTYpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krIDldLCAxMiwgLTE5NTg0MTQ0MTcpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krMTBdLCAxNywgLTQyMDYzKTtcclxuICAgIGIgPSBtZDVfZmYoYiwgYywgZCwgYSwgeFtpKzExXSwgMjIsIC0xOTkwNDA0MTYyKTtcclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKzEyXSwgNyAsICAxODA0NjAzNjgyKTtcclxuICAgIGQgPSBtZDVfZmYoZCwgYSwgYiwgYywgeFtpKzEzXSwgMTIsIC00MDM0MTEwMSk7XHJcbiAgICBjID0gbWQ1X2ZmKGMsIGQsIGEsIGIsIHhbaSsxNF0sIDE3LCAtMTUwMjAwMjI5MCk7XHJcbiAgICBiID0gbWQ1X2ZmKGIsIGMsIGQsIGEsIHhbaSsxNV0sIDIyLCAgMTIzNjUzNTMyOSk7XHJcblxyXG4gICAgYSA9IG1kNV9nZyhhLCBiLCBjLCBkLCB4W2krIDFdLCA1ICwgLTE2NTc5NjUxMCk7XHJcbiAgICBkID0gbWQ1X2dnKGQsIGEsIGIsIGMsIHhbaSsgNl0sIDkgLCAtMTA2OTUwMTYzMik7XHJcbiAgICBjID0gbWQ1X2dnKGMsIGQsIGEsIGIsIHhbaSsxMV0sIDE0LCAgNjQzNzE3NzEzKTtcclxuICAgIGIgPSBtZDVfZ2coYiwgYywgZCwgYSwgeFtpKyAwXSwgMjAsIC0zNzM4OTczMDIpO1xyXG4gICAgYSA9IG1kNV9nZyhhLCBiLCBjLCBkLCB4W2krIDVdLCA1ICwgLTcwMTU1ODY5MSk7XHJcbiAgICBkID0gbWQ1X2dnKGQsIGEsIGIsIGMsIHhbaSsxMF0sIDkgLCAgMzgwMTYwODMpO1xyXG4gICAgYyA9IG1kNV9nZyhjLCBkLCBhLCBiLCB4W2krMTVdLCAxNCwgLTY2MDQ3ODMzNSk7XHJcbiAgICBiID0gbWQ1X2dnKGIsIGMsIGQsIGEsIHhbaSsgNF0sIDIwLCAtNDA1NTM3ODQ4KTtcclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKyA5XSwgNSAsICA1Njg0NDY0MzgpO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krMTRdLCA5ICwgLTEwMTk4MDM2OTApO1xyXG4gICAgYyA9IG1kNV9nZyhjLCBkLCBhLCBiLCB4W2krIDNdLCAxNCwgLTE4NzM2Mzk2MSk7XHJcbiAgICBiID0gbWQ1X2dnKGIsIGMsIGQsIGEsIHhbaSsgOF0sIDIwLCAgMTE2MzUzMTUwMSk7XHJcbiAgICBhID0gbWQ1X2dnKGEsIGIsIGMsIGQsIHhbaSsxM10sIDUgLCAtMTQ0NDY4MTQ2Nyk7XHJcbiAgICBkID0gbWQ1X2dnKGQsIGEsIGIsIGMsIHhbaSsgMl0sIDkgLCAtNTE0MDM3ODQpO1xyXG4gICAgYyA9IG1kNV9nZyhjLCBkLCBhLCBiLCB4W2krIDddLCAxNCwgIDE3MzUzMjg0NzMpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krMTJdLCAyMCwgLTE5MjY2MDc3MzQpO1xyXG5cclxuICAgIGEgPSBtZDVfaGgoYSwgYiwgYywgZCwgeFtpKyA1XSwgNCAsIC0zNzg1NTgpO1xyXG4gICAgZCA9IG1kNV9oaChkLCBhLCBiLCBjLCB4W2krIDhdLCAxMSwgLTIwMjI1NzQ0NjMpO1xyXG4gICAgYyA9IG1kNV9oaChjLCBkLCBhLCBiLCB4W2krMTFdLCAxNiwgIDE4MzkwMzA1NjIpO1xyXG4gICAgYiA9IG1kNV9oaChiLCBjLCBkLCBhLCB4W2krMTRdLCAyMywgLTM1MzA5NTU2KTtcclxuICAgIGEgPSBtZDVfaGgoYSwgYiwgYywgZCwgeFtpKyAxXSwgNCAsIC0xNTMwOTkyMDYwKTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKyA0XSwgMTEsICAxMjcyODkzMzUzKTtcclxuICAgIGMgPSBtZDVfaGgoYywgZCwgYSwgYiwgeFtpKyA3XSwgMTYsIC0xNTU0OTc2MzIpO1xyXG4gICAgYiA9IG1kNV9oaChiLCBjLCBkLCBhLCB4W2krMTBdLCAyMywgLTEwOTQ3MzA2NDApO1xyXG4gICAgYSA9IG1kNV9oaChhLCBiLCBjLCBkLCB4W2krMTNdLCA0ICwgIDY4MTI3OTE3NCk7XHJcbiAgICBkID0gbWQ1X2hoKGQsIGEsIGIsIGMsIHhbaSsgMF0sIDExLCAtMzU4NTM3MjIyKTtcclxuICAgIGMgPSBtZDVfaGgoYywgZCwgYSwgYiwgeFtpKyAzXSwgMTYsIC03MjI1MjE5NzkpO1xyXG4gICAgYiA9IG1kNV9oaChiLCBjLCBkLCBhLCB4W2krIDZdLCAyMywgIDc2MDI5MTg5KTtcclxuICAgIGEgPSBtZDVfaGgoYSwgYiwgYywgZCwgeFtpKyA5XSwgNCAsIC02NDAzNjQ0ODcpO1xyXG4gICAgZCA9IG1kNV9oaChkLCBhLCBiLCBjLCB4W2krMTJdLCAxMSwgLTQyMTgxNTgzNSk7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsxNV0sIDE2LCAgNTMwNzQyNTIwKTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKyAyXSwgMjMsIC05OTUzMzg2NTEpO1xyXG5cclxuICAgIGEgPSBtZDVfaWkoYSwgYiwgYywgZCwgeFtpKyAwXSwgNiAsIC0xOTg2MzA4NDQpO1xyXG4gICAgZCA9IG1kNV9paShkLCBhLCBiLCBjLCB4W2krIDddLCAxMCwgIDExMjY4OTE0MTUpO1xyXG4gICAgYyA9IG1kNV9paShjLCBkLCBhLCBiLCB4W2krMTRdLCAxNSwgLTE0MTYzNTQ5MDUpO1xyXG4gICAgYiA9IG1kNV9paShiLCBjLCBkLCBhLCB4W2krIDVdLCAyMSwgLTU3NDM0MDU1KTtcclxuICAgIGEgPSBtZDVfaWkoYSwgYiwgYywgZCwgeFtpKzEyXSwgNiAsICAxNzAwNDg1NTcxKTtcclxuICAgIGQgPSBtZDVfaWkoZCwgYSwgYiwgYywgeFtpKyAzXSwgMTAsIC0xODk0OTg2NjA2KTtcclxuICAgIGMgPSBtZDVfaWkoYywgZCwgYSwgYiwgeFtpKzEwXSwgMTUsIC0xMDUxNTIzKTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKyAxXSwgMjEsIC0yMDU0OTIyNzk5KTtcclxuICAgIGEgPSBtZDVfaWkoYSwgYiwgYywgZCwgeFtpKyA4XSwgNiAsICAxODczMzEzMzU5KTtcclxuICAgIGQgPSBtZDVfaWkoZCwgYSwgYiwgYywgeFtpKzE1XSwgMTAsIC0zMDYxMTc0NCk7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsgNl0sIDE1LCAtMTU2MDE5ODM4MCk7XHJcbiAgICBiID0gbWQ1X2lpKGIsIGMsIGQsIGEsIHhbaSsxM10sIDIxLCAgMTMwOTE1MTY0OSk7XHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsgNF0sIDYgLCAtMTQ1NTIzMDcwKTtcclxuICAgIGQgPSBtZDVfaWkoZCwgYSwgYiwgYywgeFtpKzExXSwgMTAsIC0xMTIwMjEwMzc5KTtcclxuICAgIGMgPSBtZDVfaWkoYywgZCwgYSwgYiwgeFtpKyAyXSwgMTUsICA3MTg3ODcyNTkpO1xyXG4gICAgYiA9IG1kNV9paShiLCBjLCBkLCBhLCB4W2krIDldLCAyMSwgLTM0MzQ4NTU1MSk7XHJcblxyXG4gICAgYSA9IHNhZmVfYWRkKGEsIG9sZGEpO1xyXG4gICAgYiA9IHNhZmVfYWRkKGIsIG9sZGIpO1xyXG4gICAgYyA9IHNhZmVfYWRkKGMsIG9sZGMpO1xyXG4gICAgZCA9IHNhZmVfYWRkKGQsIG9sZGQpO1xyXG4gIH1cclxuICByZXR1cm4gQXJyYXkoYSwgYiwgYywgZCk7XHJcblxyXG59XHJcblxyXG4vKlxyXG4gKiBUaGVzZSBmdW5jdGlvbnMgaW1wbGVtZW50IHRoZSBmb3VyIGJhc2ljIG9wZXJhdGlvbnMgdGhlIGFsZ29yaXRobSB1c2VzLlxyXG4gKi9cclxuZnVuY3Rpb24gbWQ1X2NtbihxLCBhLCBiLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIHNhZmVfYWRkKGJpdF9yb2woc2FmZV9hZGQoc2FmZV9hZGQoYSwgcSksIHNhZmVfYWRkKHgsIHQpKSwgcyksYik7XHJcbn1cclxuZnVuY3Rpb24gbWQ1X2ZmKGEsIGIsIGMsIGQsIHgsIHMsIHQpXHJcbntcclxuICByZXR1cm4gbWQ1X2NtbigoYiAmIGMpIHwgKCh+YikgJiBkKSwgYSwgYiwgeCwgcywgdCk7XHJcbn1cclxuZnVuY3Rpb24gbWQ1X2dnKGEsIGIsIGMsIGQsIHgsIHMsIHQpXHJcbntcclxuICByZXR1cm4gbWQ1X2NtbigoYiAmIGQpIHwgKGMgJiAofmQpKSwgYSwgYiwgeCwgcywgdCk7XHJcbn1cclxuZnVuY3Rpb24gbWQ1X2hoKGEsIGIsIGMsIGQsIHgsIHMsIHQpXHJcbntcclxuICByZXR1cm4gbWQ1X2NtbihiIF4gYyBeIGQsIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9paShhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oYyBeIChiIHwgKH5kKSksIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcblxyXG4vKlxyXG4gKiBBZGQgaW50ZWdlcnMsIHdyYXBwaW5nIGF0IDJeMzIuIFRoaXMgdXNlcyAxNi1iaXQgb3BlcmF0aW9ucyBpbnRlcm5hbGx5XHJcbiAqIHRvIHdvcmsgYXJvdW5kIGJ1Z3MgaW4gc29tZSBKUyBpbnRlcnByZXRlcnMuXHJcbiAqL1xyXG5mdW5jdGlvbiBzYWZlX2FkZCh4LCB5KVxyXG57XHJcbiAgdmFyIGxzdyA9ICh4ICYgMHhGRkZGKSArICh5ICYgMHhGRkZGKTtcclxuICB2YXIgbXN3ID0gKHggPj4gMTYpICsgKHkgPj4gMTYpICsgKGxzdyA+PiAxNik7XHJcbiAgcmV0dXJuIChtc3cgPDwgMTYpIHwgKGxzdyAmIDB4RkZGRik7XHJcbn1cclxuXHJcbi8qXHJcbiAqIEJpdHdpc2Ugcm90YXRlIGEgMzItYml0IG51bWJlciB0byB0aGUgbGVmdC5cclxuICovXHJcbmZ1bmN0aW9uIGJpdF9yb2wobnVtLCBjbnQpXHJcbntcclxuICByZXR1cm4gKG51bSA8PCBjbnQpIHwgKG51bSA+Pj4gKDMyIC0gY250KSk7XHJcbn1cclxuXHJcbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gbWQ1KGJ1Zikge1xyXG4gIHJldHVybiBoZWxwZXJzLmhhc2goYnVmLCBjb3JlX21kNSwgMTYpO1xyXG59O1xyXG4iLCIvLyBPcmlnaW5hbCBjb2RlIGFkYXB0ZWQgZnJvbSBSb2JlcnQgS2llZmZlci5cbi8vIGRldGFpbHMgYXQgaHR0cHM6Ly9naXRodWIuY29tL2Jyb29mYS9ub2RlLXV1aWRcbihmdW5jdGlvbigpIHtcbiAgdmFyIF9nbG9iYWwgPSB0aGlzO1xuXG4gIHZhciBtYXRoUk5HLCB3aGF0d2dSTkc7XG5cbiAgLy8gTk9URTogTWF0aC5yYW5kb20oKSBkb2VzIG5vdCBndWFyYW50ZWUgXCJjcnlwdG9ncmFwaGljIHF1YWxpdHlcIlxuICBtYXRoUk5HID0gZnVuY3Rpb24oc2l6ZSkge1xuICAgIHZhciBieXRlcyA9IG5ldyBBcnJheShzaXplKTtcbiAgICB2YXIgcjtcblxuICAgIGZvciAodmFyIGkgPSAwLCByOyBpIDwgc2l6ZTsgaSsrKSB7XG4gICAgICBpZiAoKGkgJiAweDAzKSA9PSAwKSByID0gTWF0aC5yYW5kb20oKSAqIDB4MTAwMDAwMDAwO1xuICAgICAgYnl0ZXNbaV0gPSByID4+PiAoKGkgJiAweDAzKSA8PCAzKSAmIDB4ZmY7XG4gICAgfVxuXG4gICAgcmV0dXJuIGJ5dGVzO1xuICB9XG5cbiAgaWYgKF9nbG9iYWwuY3J5cHRvICYmIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMpIHtcbiAgICB3aGF0d2dSTkcgPSBmdW5jdGlvbihzaXplKSB7XG4gICAgICB2YXIgYnl0ZXMgPSBuZXcgVWludDhBcnJheShzaXplKTtcbiAgICAgIGNyeXB0by5nZXRSYW5kb21WYWx1ZXMoYnl0ZXMpO1xuICAgICAgcmV0dXJuIGJ5dGVzO1xuICAgIH1cbiAgfVxuXG4gIG1vZHVsZS5leHBvcnRzID0gd2hhdHdnUk5HIHx8IG1hdGhSTkc7XG5cbn0oKSlcbiIsIi8qXG4gKiBBIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgdGhlIFNlY3VyZSBIYXNoIEFsZ29yaXRobSwgU0hBLTEsIGFzIGRlZmluZWRcbiAqIGluIEZJUFMgUFVCIDE4MC0xXG4gKiBWZXJzaW9uIDIuMWEgQ29weXJpZ2h0IFBhdWwgSm9obnN0b24gMjAwMCAtIDIwMDIuXG4gKiBPdGhlciBjb250cmlidXRvcnM6IEdyZWcgSG9sdCwgQW5kcmV3IEtlcGVydCwgWWRuYXIsIExvc3RpbmV0XG4gKiBEaXN0cmlidXRlZCB1bmRlciB0aGUgQlNEIExpY2Vuc2VcbiAqIFNlZSBodHRwOi8vcGFqaG9tZS5vcmcudWsvY3J5cHQvbWQ1IGZvciBkZXRhaWxzLlxuICovXG5cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbi8qXG4gKiBDYWxjdWxhdGUgdGhlIFNIQS0xIG9mIGFuIGFycmF5IG9mIGJpZy1lbmRpYW4gd29yZHMsIGFuZCBhIGJpdCBsZW5ndGhcbiAqL1xuZnVuY3Rpb24gY29yZV9zaGExKHgsIGxlbilcbntcbiAgLyogYXBwZW5kIHBhZGRpbmcgKi9cbiAgeFtsZW4gPj4gNV0gfD0gMHg4MCA8PCAoMjQgLSBsZW4gJSAzMik7XG4gIHhbKChsZW4gKyA2NCA+PiA5KSA8PCA0KSArIDE1XSA9IGxlbjtcblxuICB2YXIgdyA9IEFycmF5KDgwKTtcbiAgdmFyIGEgPSAgMTczMjU4NDE5MztcbiAgdmFyIGIgPSAtMjcxNzMzODc5O1xuICB2YXIgYyA9IC0xNzMyNTg0MTk0O1xuICB2YXIgZCA9ICAyNzE3MzM4Nzg7XG4gIHZhciBlID0gLTEwMDk1ODk3NzY7XG5cbiAgZm9yKHZhciBpID0gMDsgaSA8IHgubGVuZ3RoOyBpICs9IDE2KVxuICB7XG4gICAgdmFyIG9sZGEgPSBhO1xuICAgIHZhciBvbGRiID0gYjtcbiAgICB2YXIgb2xkYyA9IGM7XG4gICAgdmFyIG9sZGQgPSBkO1xuICAgIHZhciBvbGRlID0gZTtcblxuICAgIGZvcih2YXIgaiA9IDA7IGogPCA4MDsgaisrKVxuICAgIHtcbiAgICAgIGlmKGogPCAxNikgd1tqXSA9IHhbaSArIGpdO1xuICAgICAgZWxzZSB3W2pdID0gcm9sKHdbai0zXSBeIHdbai04XSBeIHdbai0xNF0gXiB3W2otMTZdLCAxKTtcbiAgICAgIHZhciB0ID0gc2FmZV9hZGQoc2FmZV9hZGQocm9sKGEsIDUpLCBzaGExX2Z0KGosIGIsIGMsIGQpKSxcbiAgICAgICAgICAgICAgICAgICAgICAgc2FmZV9hZGQoc2FmZV9hZGQoZSwgd1tqXSksIHNoYTFfa3QoaikpKTtcbiAgICAgIGUgPSBkO1xuICAgICAgZCA9IGM7XG4gICAgICBjID0gcm9sKGIsIDMwKTtcbiAgICAgIGIgPSBhO1xuICAgICAgYSA9IHQ7XG4gICAgfVxuXG4gICAgYSA9IHNhZmVfYWRkKGEsIG9sZGEpO1xuICAgIGIgPSBzYWZlX2FkZChiLCBvbGRiKTtcbiAgICBjID0gc2FmZV9hZGQoYywgb2xkYyk7XG4gICAgZCA9IHNhZmVfYWRkKGQsIG9sZGQpO1xuICAgIGUgPSBzYWZlX2FkZChlLCBvbGRlKTtcbiAgfVxuICByZXR1cm4gQXJyYXkoYSwgYiwgYywgZCwgZSk7XG5cbn1cblxuLypcbiAqIFBlcmZvcm0gdGhlIGFwcHJvcHJpYXRlIHRyaXBsZXQgY29tYmluYXRpb24gZnVuY3Rpb24gZm9yIHRoZSBjdXJyZW50XG4gKiBpdGVyYXRpb25cbiAqL1xuZnVuY3Rpb24gc2hhMV9mdCh0LCBiLCBjLCBkKVxue1xuICBpZih0IDwgMjApIHJldHVybiAoYiAmIGMpIHwgKCh+YikgJiBkKTtcbiAgaWYodCA8IDQwKSByZXR1cm4gYiBeIGMgXiBkO1xuICBpZih0IDwgNjApIHJldHVybiAoYiAmIGMpIHwgKGIgJiBkKSB8IChjICYgZCk7XG4gIHJldHVybiBiIF4gYyBeIGQ7XG59XG5cbi8qXG4gKiBEZXRlcm1pbmUgdGhlIGFwcHJvcHJpYXRlIGFkZGl0aXZlIGNvbnN0YW50IGZvciB0aGUgY3VycmVudCBpdGVyYXRpb25cbiAqL1xuZnVuY3Rpb24gc2hhMV9rdCh0KVxue1xuICByZXR1cm4gKHQgPCAyMCkgPyAgMTUxODUwMDI0OSA6ICh0IDwgNDApID8gIDE4NTk3NzUzOTMgOlxuICAgICAgICAgKHQgPCA2MCkgPyAtMTg5NDAwNzU4OCA6IC04OTk0OTc1MTQ7XG59XG5cbi8qXG4gKiBBZGQgaW50ZWdlcnMsIHdyYXBwaW5nIGF0IDJeMzIuIFRoaXMgdXNlcyAxNi1iaXQgb3BlcmF0aW9ucyBpbnRlcm5hbGx5XG4gKiB0byB3b3JrIGFyb3VuZCBidWdzIGluIHNvbWUgSlMgaW50ZXJwcmV0ZXJzLlxuICovXG5mdW5jdGlvbiBzYWZlX2FkZCh4LCB5KVxue1xuICB2YXIgbHN3ID0gKHggJiAweEZGRkYpICsgKHkgJiAweEZGRkYpO1xuICB2YXIgbXN3ID0gKHggPj4gMTYpICsgKHkgPj4gMTYpICsgKGxzdyA+PiAxNik7XG4gIHJldHVybiAobXN3IDw8IDE2KSB8IChsc3cgJiAweEZGRkYpO1xufVxuXG4vKlxuICogQml0d2lzZSByb3RhdGUgYSAzMi1iaXQgbnVtYmVyIHRvIHRoZSBsZWZ0LlxuICovXG5mdW5jdGlvbiByb2wobnVtLCBjbnQpXG57XG4gIHJldHVybiAobnVtIDw8IGNudCkgfCAobnVtID4+PiAoMzIgLSBjbnQpKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzaGExKGJ1Zikge1xuICByZXR1cm4gaGVscGVycy5oYXNoKGJ1ZiwgY29yZV9zaGExLCAyMCwgdHJ1ZSk7XG59O1xuIiwiXG4vKipcbiAqIEEgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgU2VjdXJlIEhhc2ggQWxnb3JpdGhtLCBTSEEtMjU2LCBhcyBkZWZpbmVkXG4gKiBpbiBGSVBTIDE4MC0yXG4gKiBWZXJzaW9uIDIuMi1iZXRhIENvcHlyaWdodCBBbmdlbCBNYXJpbiwgUGF1bCBKb2huc3RvbiAyMDAwIC0gMjAwOS5cbiAqIE90aGVyIGNvbnRyaWJ1dG9yczogR3JlZyBIb2x0LCBBbmRyZXcgS2VwZXJ0LCBZZG5hciwgTG9zdGluZXRcbiAqXG4gKi9cblxudmFyIGhlbHBlcnMgPSByZXF1aXJlKCcuL2hlbHBlcnMnKTtcblxudmFyIHNhZmVfYWRkID0gZnVuY3Rpb24oeCwgeSkge1xuICB2YXIgbHN3ID0gKHggJiAweEZGRkYpICsgKHkgJiAweEZGRkYpO1xuICB2YXIgbXN3ID0gKHggPj4gMTYpICsgKHkgPj4gMTYpICsgKGxzdyA+PiAxNik7XG4gIHJldHVybiAobXN3IDw8IDE2KSB8IChsc3cgJiAweEZGRkYpO1xufTtcblxudmFyIFMgPSBmdW5jdGlvbihYLCBuKSB7XG4gIHJldHVybiAoWCA+Pj4gbikgfCAoWCA8PCAoMzIgLSBuKSk7XG59O1xuXG52YXIgUiA9IGZ1bmN0aW9uKFgsIG4pIHtcbiAgcmV0dXJuIChYID4+PiBuKTtcbn07XG5cbnZhciBDaCA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgcmV0dXJuICgoeCAmIHkpIF4gKCh+eCkgJiB6KSk7XG59O1xuXG52YXIgTWFqID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICByZXR1cm4gKCh4ICYgeSkgXiAoeCAmIHopIF4gKHkgJiB6KSk7XG59O1xuXG52YXIgU2lnbWEwMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgMikgXiBTKHgsIDEzKSBeIFMoeCwgMjIpKTtcbn07XG5cbnZhciBTaWdtYTEyNTYgPSBmdW5jdGlvbih4KSB7XG4gIHJldHVybiAoUyh4LCA2KSBeIFMoeCwgMTEpIF4gUyh4LCAyNSkpO1xufTtcblxudmFyIEdhbW1hMDI1NiA9IGZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIChTKHgsIDcpIF4gUyh4LCAxOCkgXiBSKHgsIDMpKTtcbn07XG5cbnZhciBHYW1tYTEyNTYgPSBmdW5jdGlvbih4KSB7XG4gIHJldHVybiAoUyh4LCAxNykgXiBTKHgsIDE5KSBeIFIoeCwgMTApKTtcbn07XG5cbnZhciBjb3JlX3NoYTI1NiA9IGZ1bmN0aW9uKG0sIGwpIHtcbiAgdmFyIEsgPSBuZXcgQXJyYXkoMHg0MjhBMkY5OCwweDcxMzc0NDkxLDB4QjVDMEZCQ0YsMHhFOUI1REJBNSwweDM5NTZDMjVCLDB4NTlGMTExRjEsMHg5MjNGODJBNCwweEFCMUM1RUQ1LDB4RDgwN0FBOTgsMHgxMjgzNUIwMSwweDI0MzE4NUJFLDB4NTUwQzdEQzMsMHg3MkJFNUQ3NCwweDgwREVCMUZFLDB4OUJEQzA2QTcsMHhDMTlCRjE3NCwweEU0OUI2OUMxLDB4RUZCRTQ3ODYsMHhGQzE5REM2LDB4MjQwQ0ExQ0MsMHgyREU5MkM2RiwweDRBNzQ4NEFBLDB4NUNCMEE5REMsMHg3NkY5ODhEQSwweDk4M0U1MTUyLDB4QTgzMUM2NkQsMHhCMDAzMjdDOCwweEJGNTk3RkM3LDB4QzZFMDBCRjMsMHhENUE3OTE0NywweDZDQTYzNTEsMHgxNDI5Mjk2NywweDI3QjcwQTg1LDB4MkUxQjIxMzgsMHg0RDJDNkRGQywweDUzMzgwRDEzLDB4NjUwQTczNTQsMHg3NjZBMEFCQiwweDgxQzJDOTJFLDB4OTI3MjJDODUsMHhBMkJGRThBMSwweEE4MUE2NjRCLDB4QzI0QjhCNzAsMHhDNzZDNTFBMywweEQxOTJFODE5LDB4RDY5OTA2MjQsMHhGNDBFMzU4NSwweDEwNkFBMDcwLDB4MTlBNEMxMTYsMHgxRTM3NkMwOCwweDI3NDg3NzRDLDB4MzRCMEJDQjUsMHgzOTFDMENCMywweDRFRDhBQTRBLDB4NUI5Q0NBNEYsMHg2ODJFNkZGMywweDc0OEY4MkVFLDB4NzhBNTYzNkYsMHg4NEM4NzgxNCwweDhDQzcwMjA4LDB4OTBCRUZGRkEsMHhBNDUwNkNFQiwweEJFRjlBM0Y3LDB4QzY3MTc4RjIpO1xuICB2YXIgSEFTSCA9IG5ldyBBcnJheSgweDZBMDlFNjY3LCAweEJCNjdBRTg1LCAweDNDNkVGMzcyLCAweEE1NEZGNTNBLCAweDUxMEU1MjdGLCAweDlCMDU2ODhDLCAweDFGODNEOUFCLCAweDVCRTBDRDE5KTtcbiAgICB2YXIgVyA9IG5ldyBBcnJheSg2NCk7XG4gICAgdmFyIGEsIGIsIGMsIGQsIGUsIGYsIGcsIGgsIGksIGo7XG4gICAgdmFyIFQxLCBUMjtcbiAgLyogYXBwZW5kIHBhZGRpbmcgKi9cbiAgbVtsID4+IDVdIHw9IDB4ODAgPDwgKDI0IC0gbCAlIDMyKTtcbiAgbVsoKGwgKyA2NCA+PiA5KSA8PCA0KSArIDE1XSA9IGw7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbS5sZW5ndGg7IGkgKz0gMTYpIHtcbiAgICBhID0gSEFTSFswXTsgYiA9IEhBU0hbMV07IGMgPSBIQVNIWzJdOyBkID0gSEFTSFszXTsgZSA9IEhBU0hbNF07IGYgPSBIQVNIWzVdOyBnID0gSEFTSFs2XTsgaCA9IEhBU0hbN107XG4gICAgZm9yICh2YXIgaiA9IDA7IGogPCA2NDsgaisrKSB7XG4gICAgICBpZiAoaiA8IDE2KSB7XG4gICAgICAgIFdbal0gPSBtW2ogKyBpXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIFdbal0gPSBzYWZlX2FkZChzYWZlX2FkZChzYWZlX2FkZChHYW1tYTEyNTYoV1tqIC0gMl0pLCBXW2ogLSA3XSksIEdhbW1hMDI1NihXW2ogLSAxNV0pKSwgV1tqIC0gMTZdKTtcbiAgICAgIH1cbiAgICAgIFQxID0gc2FmZV9hZGQoc2FmZV9hZGQoc2FmZV9hZGQoc2FmZV9hZGQoaCwgU2lnbWExMjU2KGUpKSwgQ2goZSwgZiwgZykpLCBLW2pdKSwgV1tqXSk7XG4gICAgICBUMiA9IHNhZmVfYWRkKFNpZ21hMDI1NihhKSwgTWFqKGEsIGIsIGMpKTtcbiAgICAgIGggPSBnOyBnID0gZjsgZiA9IGU7IGUgPSBzYWZlX2FkZChkLCBUMSk7IGQgPSBjOyBjID0gYjsgYiA9IGE7IGEgPSBzYWZlX2FkZChUMSwgVDIpO1xuICAgIH1cbiAgICBIQVNIWzBdID0gc2FmZV9hZGQoYSwgSEFTSFswXSk7IEhBU0hbMV0gPSBzYWZlX2FkZChiLCBIQVNIWzFdKTsgSEFTSFsyXSA9IHNhZmVfYWRkKGMsIEhBU0hbMl0pOyBIQVNIWzNdID0gc2FmZV9hZGQoZCwgSEFTSFszXSk7XG4gICAgSEFTSFs0XSA9IHNhZmVfYWRkKGUsIEhBU0hbNF0pOyBIQVNIWzVdID0gc2FmZV9hZGQoZiwgSEFTSFs1XSk7IEhBU0hbNl0gPSBzYWZlX2FkZChnLCBIQVNIWzZdKTsgSEFTSFs3XSA9IHNhZmVfYWRkKGgsIEhBU0hbN10pO1xuICB9XG4gIHJldHVybiBIQVNIO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBzaGEyNTYoYnVmKSB7XG4gIHJldHVybiBoZWxwZXJzLmhhc2goYnVmLCBjb3JlX3NoYTI1NiwgMzIsIHRydWUpO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG5mdW5jdGlvbiBFdmVudEVtaXR0ZXIoKSB7XG4gIHRoaXMuX2V2ZW50cyA9IHRoaXMuX2V2ZW50cyB8fCB7fTtcbiAgdGhpcy5fbWF4TGlzdGVuZXJzID0gdGhpcy5fbWF4TGlzdGVuZXJzIHx8IHVuZGVmaW5lZDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRFbWl0dGVyO1xuXG4vLyBCYWNrd2FyZHMtY29tcGF0IHdpdGggbm9kZSAwLjEwLnhcbkV2ZW50RW1pdHRlci5FdmVudEVtaXR0ZXIgPSBFdmVudEVtaXR0ZXI7XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX2V2ZW50cyA9IHVuZGVmaW5lZDtcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuX21heExpc3RlbmVycyA9IHVuZGVmaW5lZDtcblxuLy8gQnkgZGVmYXVsdCBFdmVudEVtaXR0ZXJzIHdpbGwgcHJpbnQgYSB3YXJuaW5nIGlmIG1vcmUgdGhhbiAxMCBsaXN0ZW5lcnMgYXJlXG4vLyBhZGRlZCB0byBpdC4gVGhpcyBpcyBhIHVzZWZ1bCBkZWZhdWx0IHdoaWNoIGhlbHBzIGZpbmRpbmcgbWVtb3J5IGxlYWtzLlxuRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnMgPSAxMDtcblxuLy8gT2J2aW91c2x5IG5vdCBhbGwgRW1pdHRlcnMgc2hvdWxkIGJlIGxpbWl0ZWQgdG8gMTAuIFRoaXMgZnVuY3Rpb24gYWxsb3dzXG4vLyB0aGF0IHRvIGJlIGluY3JlYXNlZC4gU2V0IHRvIHplcm8gZm9yIHVubGltaXRlZC5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuc2V0TWF4TGlzdGVuZXJzID0gZnVuY3Rpb24obikge1xuICBpZiAoIWlzTnVtYmVyKG4pIHx8IG4gPCAwIHx8IGlzTmFOKG4pKVxuICAgIHRocm93IFR5cGVFcnJvcignbiBtdXN0IGJlIGEgcG9zaXRpdmUgbnVtYmVyJyk7XG4gIHRoaXMuX21heExpc3RlbmVycyA9IG47XG4gIHJldHVybiB0aGlzO1xufTtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0ID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgZXIsIGhhbmRsZXIsIGxlbiwgYXJncywgaSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIElmIHRoZXJlIGlzIG5vICdlcnJvcicgZXZlbnQgbGlzdGVuZXIgdGhlbiB0aHJvdy5cbiAgaWYgKHR5cGUgPT09ICdlcnJvcicpIHtcbiAgICBpZiAoIXRoaXMuX2V2ZW50cy5lcnJvciB8fFxuICAgICAgICAoaXNPYmplY3QodGhpcy5fZXZlbnRzLmVycm9yKSAmJiAhdGhpcy5fZXZlbnRzLmVycm9yLmxlbmd0aCkpIHtcbiAgICAgIGVyID0gYXJndW1lbnRzWzFdO1xuICAgICAgaWYgKGVyIGluc3RhbmNlb2YgRXJyb3IpIHtcbiAgICAgICAgdGhyb3cgZXI7IC8vIFVuaGFuZGxlZCAnZXJyb3InIGV2ZW50XG4gICAgICB9XG4gICAgICB0aHJvdyBUeXBlRXJyb3IoJ1VuY2F1Z2h0LCB1bnNwZWNpZmllZCBcImVycm9yXCIgZXZlbnQuJyk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlciA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNVbmRlZmluZWQoaGFuZGxlcikpXG4gICAgcmV0dXJuIGZhbHNlO1xuXG4gIGlmIChpc0Z1bmN0aW9uKGhhbmRsZXIpKSB7XG4gICAgc3dpdGNoIChhcmd1bWVudHMubGVuZ3RoKSB7XG4gICAgICAvLyBmYXN0IGNhc2VzXG4gICAgICBjYXNlIDE6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDI6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0pO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgMzpcbiAgICAgICAgaGFuZGxlci5jYWxsKHRoaXMsIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICAvLyBzbG93ZXJcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIGxlbiA9IGFyZ3VtZW50cy5sZW5ndGg7XG4gICAgICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgICAgICBhcmdzW2kgLSAxXSA9IGFyZ3VtZW50c1tpXTtcbiAgICAgICAgaGFuZGxlci5hcHBseSh0aGlzLCBhcmdzKTtcbiAgICB9XG4gIH0gZWxzZSBpZiAoaXNPYmplY3QoaGFuZGxlcikpIHtcbiAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgIGFyZ3MgPSBuZXcgQXJyYXkobGVuIC0gMSk7XG4gICAgZm9yIChpID0gMTsgaSA8IGxlbjsgaSsrKVxuICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG5cbiAgICBsaXN0ZW5lcnMgPSBoYW5kbGVyLnNsaWNlKCk7XG4gICAgbGVuID0gbGlzdGVuZXJzLmxlbmd0aDtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuOyBpKyspXG4gICAgICBsaXN0ZW5lcnNbaV0uYXBwbHkodGhpcywgYXJncyk7XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuYWRkTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgdGhpcy5fZXZlbnRzID0ge307XG5cbiAgLy8gVG8gYXZvaWQgcmVjdXJzaW9uIGluIHRoZSBjYXNlIHRoYXQgdHlwZSA9PT0gXCJuZXdMaXN0ZW5lclwiISBCZWZvcmVcbiAgLy8gYWRkaW5nIGl0IHRvIHRoZSBsaXN0ZW5lcnMsIGZpcnN0IGVtaXQgXCJuZXdMaXN0ZW5lclwiLlxuICBpZiAodGhpcy5fZXZlbnRzLm5ld0xpc3RlbmVyKVxuICAgIHRoaXMuZW1pdCgnbmV3TGlzdGVuZXInLCB0eXBlLFxuICAgICAgICAgICAgICBpc0Z1bmN0aW9uKGxpc3RlbmVyLmxpc3RlbmVyKSA/XG4gICAgICAgICAgICAgIGxpc3RlbmVyLmxpc3RlbmVyIDogbGlzdGVuZXIpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIC8vIE9wdGltaXplIHRoZSBjYXNlIG9mIG9uZSBsaXN0ZW5lci4gRG9uJ3QgbmVlZCB0aGUgZXh0cmEgYXJyYXkgb2JqZWN0LlxuICAgIHRoaXMuX2V2ZW50c1t0eXBlXSA9IGxpc3RlbmVyO1xuICBlbHNlIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIC8vIElmIHdlJ3ZlIGFscmVhZHkgZ290IGFuIGFycmF5LCBqdXN0IGFwcGVuZC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0ucHVzaChsaXN0ZW5lcik7XG4gIGVsc2VcbiAgICAvLyBBZGRpbmcgdGhlIHNlY29uZCBlbGVtZW50LCBuZWVkIHRvIGNoYW5nZSB0byBhcnJheS5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBbdGhpcy5fZXZlbnRzW3R5cGVdLCBsaXN0ZW5lcl07XG5cbiAgLy8gQ2hlY2sgZm9yIGxpc3RlbmVyIGxlYWtcbiAgaWYgKGlzT2JqZWN0KHRoaXMuX2V2ZW50c1t0eXBlXSkgJiYgIXRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQpIHtcbiAgICB2YXIgbTtcbiAgICBpZiAoIWlzVW5kZWZpbmVkKHRoaXMuX21heExpc3RlbmVycykpIHtcbiAgICAgIG0gPSB0aGlzLl9tYXhMaXN0ZW5lcnM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSBFdmVudEVtaXR0ZXIuZGVmYXVsdE1heExpc3RlbmVycztcbiAgICB9XG5cbiAgICBpZiAobSAmJiBtID4gMCAmJiB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoID4gbSkge1xuICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLndhcm5lZCA9IHRydWU7XG4gICAgICBjb25zb2xlLmVycm9yKCcobm9kZSkgd2FybmluZzogcG9zc2libGUgRXZlbnRFbWl0dGVyIG1lbW9yeSAnICtcbiAgICAgICAgICAgICAgICAgICAgJ2xlYWsgZGV0ZWN0ZWQuICVkIGxpc3RlbmVycyBhZGRlZC4gJyArXG4gICAgICAgICAgICAgICAgICAgICdVc2UgZW1pdHRlci5zZXRNYXhMaXN0ZW5lcnMoKSB0byBpbmNyZWFzZSBsaW1pdC4nLFxuICAgICAgICAgICAgICAgICAgICB0aGlzLl9ldmVudHNbdHlwZV0ubGVuZ3RoKTtcbiAgICAgIGlmICh0eXBlb2YgY29uc29sZS50cmFjZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAvLyBub3Qgc3VwcG9ydGVkIGluIElFIDEwXG4gICAgICAgIGNvbnNvbGUudHJhY2UoKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUub24gPSBFdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgdmFyIGZpcmVkID0gZmFsc2U7XG5cbiAgZnVuY3Rpb24gZygpIHtcbiAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGcpO1xuXG4gICAgaWYgKCFmaXJlZCkge1xuICAgICAgZmlyZWQgPSB0cnVlO1xuICAgICAgbGlzdGVuZXIuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9XG4gIH1cblxuICBnLmxpc3RlbmVyID0gbGlzdGVuZXI7XG4gIHRoaXMub24odHlwZSwgZyk7XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG4vLyBlbWl0cyBhICdyZW1vdmVMaXN0ZW5lcicgZXZlbnQgaWZmIHRoZSBsaXN0ZW5lciB3YXMgcmVtb3ZlZFxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5yZW1vdmVMaXN0ZW5lciA9IGZ1bmN0aW9uKHR5cGUsIGxpc3RlbmVyKSB7XG4gIHZhciBsaXN0LCBwb3NpdGlvbiwgbGVuZ3RoLCBpO1xuXG4gIGlmICghaXNGdW5jdGlvbihsaXN0ZW5lcikpXG4gICAgdGhyb3cgVHlwZUVycm9yKCdsaXN0ZW5lciBtdXN0IGJlIGEgZnVuY3Rpb24nKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIGxpc3QgPSB0aGlzLl9ldmVudHNbdHlwZV07XG4gIGxlbmd0aCA9IGxpc3QubGVuZ3RoO1xuICBwb3NpdGlvbiA9IC0xO1xuXG4gIGlmIChsaXN0ID09PSBsaXN0ZW5lciB8fFxuICAgICAgKGlzRnVuY3Rpb24obGlzdC5saXN0ZW5lcikgJiYgbGlzdC5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICBpZiAodGhpcy5fZXZlbnRzLnJlbW92ZUxpc3RlbmVyKVxuICAgICAgdGhpcy5lbWl0KCdyZW1vdmVMaXN0ZW5lcicsIHR5cGUsIGxpc3RlbmVyKTtcblxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGxpc3QpKSB7XG4gICAgZm9yIChpID0gbGVuZ3RoOyBpLS0gPiAwOykge1xuICAgICAgaWYgKGxpc3RbaV0gPT09IGxpc3RlbmVyIHx8XG4gICAgICAgICAgKGxpc3RbaV0ubGlzdGVuZXIgJiYgbGlzdFtpXS5saXN0ZW5lciA9PT0gbGlzdGVuZXIpKSB7XG4gICAgICAgIHBvc2l0aW9uID0gaTtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHBvc2l0aW9uIDwgMClcbiAgICAgIHJldHVybiB0aGlzO1xuXG4gICAgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgICBsaXN0Lmxlbmd0aCA9IDA7XG4gICAgICBkZWxldGUgdGhpcy5fZXZlbnRzW3R5cGVdO1xuICAgIH0gZWxzZSB7XG4gICAgICBsaXN0LnNwbGljZShwb3NpdGlvbiwgMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG4gIH1cblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlQWxsTGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIga2V5LCBsaXN0ZW5lcnM7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMpXG4gICAgcmV0dXJuIHRoaXM7XG5cbiAgLy8gbm90IGxpc3RlbmluZyBmb3IgcmVtb3ZlTGlzdGVuZXIsIG5vIG5lZWQgdG8gZW1pdFxuICBpZiAoIXRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcikge1xuICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAwKVxuICAgICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgZWxzZSBpZiAodGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIC8vIGVtaXQgcmVtb3ZlTGlzdGVuZXIgZm9yIGFsbCBsaXN0ZW5lcnMgb24gYWxsIGV2ZW50c1xuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIGZvciAoa2V5IGluIHRoaXMuX2V2ZW50cykge1xuICAgICAgaWYgKGtleSA9PT0gJ3JlbW92ZUxpc3RlbmVyJykgY29udGludWU7XG4gICAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycyhrZXkpO1xuICAgIH1cbiAgICB0aGlzLnJlbW92ZUFsbExpc3RlbmVycygncmVtb3ZlTGlzdGVuZXInKTtcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcbiAgICByZXR1cm4gdGhpcztcbiAgfVxuXG4gIGxpc3RlbmVycyA9IHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICBpZiAoaXNGdW5jdGlvbihsaXN0ZW5lcnMpKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBsaXN0ZW5lcnMpO1xuICB9IGVsc2Uge1xuICAgIC8vIExJRk8gb3JkZXJcbiAgICB3aGlsZSAobGlzdGVuZXJzLmxlbmd0aClcbiAgICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzW2xpc3RlbmVycy5sZW5ndGggLSAxXSk7XG4gIH1cbiAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcblxuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUubGlzdGVuZXJzID0gZnVuY3Rpb24odHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIXRoaXMuX2V2ZW50cyB8fCAhdGhpcy5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IFtdO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKHRoaXMuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gW3RoaXMuX2V2ZW50c1t0eXBlXV07XG4gIGVsc2VcbiAgICByZXQgPSB0aGlzLl9ldmVudHNbdHlwZV0uc2xpY2UoKTtcbiAgcmV0dXJuIHJldDtcbn07XG5cbkV2ZW50RW1pdHRlci5saXN0ZW5lckNvdW50ID0gZnVuY3Rpb24oZW1pdHRlciwgdHlwZSkge1xuICB2YXIgcmV0O1xuICBpZiAoIWVtaXR0ZXIuX2V2ZW50cyB8fCAhZW1pdHRlci5fZXZlbnRzW3R5cGVdKVxuICAgIHJldCA9IDA7XG4gIGVsc2UgaWYgKGlzRnVuY3Rpb24oZW1pdHRlci5fZXZlbnRzW3R5cGVdKSlcbiAgICByZXQgPSAxO1xuICBlbHNlXG4gICAgcmV0ID0gZW1pdHRlci5fZXZlbnRzW3R5cGVdLmxlbmd0aDtcbiAgcmV0dXJuIHJldDtcbn07XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbiIsImlmICh0eXBlb2YgT2JqZWN0LmNyZWF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAvLyBpbXBsZW1lbnRhdGlvbiBmcm9tIHN0YW5kYXJkIG5vZGUuanMgJ3V0aWwnIG1vZHVsZVxuICBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGluaGVyaXRzKGN0b3IsIHN1cGVyQ3Rvcikge1xuICAgIGN0b3Iuc3VwZXJfID0gc3VwZXJDdG9yXG4gICAgY3Rvci5wcm90b3R5cGUgPSBPYmplY3QuY3JlYXRlKHN1cGVyQ3Rvci5wcm90b3R5cGUsIHtcbiAgICAgIGNvbnN0cnVjdG9yOiB7XG4gICAgICAgIHZhbHVlOiBjdG9yLFxuICAgICAgICBlbnVtZXJhYmxlOiBmYWxzZSxcbiAgICAgICAgd3JpdGFibGU6IHRydWUsXG4gICAgICAgIGNvbmZpZ3VyYWJsZTogdHJ1ZVxuICAgICAgfVxuICAgIH0pO1xuICB9O1xufSBlbHNlIHtcbiAgLy8gb2xkIHNjaG9vbCBzaGltIGZvciBvbGQgYnJvd3NlcnNcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIHZhciBUZW1wQ3RvciA9IGZ1bmN0aW9uICgpIHt9XG4gICAgVGVtcEN0b3IucHJvdG90eXBlID0gc3VwZXJDdG9yLnByb3RvdHlwZVxuICAgIGN0b3IucHJvdG90eXBlID0gbmV3IFRlbXBDdG9yKClcbiAgICBjdG9yLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGN0b3JcbiAgfVxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4vLyByZXNvbHZlcyAuIGFuZCAuLiBlbGVtZW50cyBpbiBhIHBhdGggYXJyYXkgd2l0aCBkaXJlY3RvcnkgbmFtZXMgdGhlcmVcbi8vIG11c3QgYmUgbm8gc2xhc2hlcywgZW1wdHkgZWxlbWVudHMsIG9yIGRldmljZSBuYW1lcyAoYzpcXCkgaW4gdGhlIGFycmF5XG4vLyAoc28gYWxzbyBubyBsZWFkaW5nIGFuZCB0cmFpbGluZyBzbGFzaGVzIC0gaXQgZG9lcyBub3QgZGlzdGluZ3Vpc2hcbi8vIHJlbGF0aXZlIGFuZCBhYnNvbHV0ZSBwYXRocylcbmZ1bmN0aW9uIG5vcm1hbGl6ZUFycmF5KHBhcnRzLCBhbGxvd0Fib3ZlUm9vdCkge1xuICAvLyBpZiB0aGUgcGF0aCB0cmllcyB0byBnbyBhYm92ZSB0aGUgcm9vdCwgYHVwYCBlbmRzIHVwID4gMFxuICB2YXIgdXAgPSAwO1xuICBmb3IgKHZhciBpID0gcGFydHMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICB2YXIgbGFzdCA9IHBhcnRzW2ldO1xuICAgIGlmIChsYXN0ID09PSAnLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICB9IGVsc2UgaWYgKGxhc3QgPT09ICcuLicpIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwKys7XG4gICAgfSBlbHNlIGlmICh1cCkge1xuICAgICAgcGFydHMuc3BsaWNlKGksIDEpO1xuICAgICAgdXAtLTtcbiAgICB9XG4gIH1cblxuICAvLyBpZiB0aGUgcGF0aCBpcyBhbGxvd2VkIHRvIGdvIGFib3ZlIHRoZSByb290LCByZXN0b3JlIGxlYWRpbmcgLi5zXG4gIGlmIChhbGxvd0Fib3ZlUm9vdCkge1xuICAgIGZvciAoOyB1cC0tOyB1cCkge1xuICAgICAgcGFydHMudW5zaGlmdCgnLi4nKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcGFydHM7XG59XG5cbi8vIFNwbGl0IGEgZmlsZW5hbWUgaW50byBbcm9vdCwgZGlyLCBiYXNlbmFtZSwgZXh0XSwgdW5peCB2ZXJzaW9uXG4vLyAncm9vdCcgaXMganVzdCBhIHNsYXNoLCBvciBub3RoaW5nLlxudmFyIHNwbGl0UGF0aFJlID1cbiAgICAvXihcXC8/fCkoW1xcc1xcU10qPykoKD86XFwuezEsMn18W15cXC9dKz98KShcXC5bXi5cXC9dKnwpKSg/OltcXC9dKikkLztcbnZhciBzcGxpdFBhdGggPSBmdW5jdGlvbihmaWxlbmFtZSkge1xuICByZXR1cm4gc3BsaXRQYXRoUmUuZXhlYyhmaWxlbmFtZSkuc2xpY2UoMSk7XG59O1xuXG4vLyBwYXRoLnJlc29sdmUoW2Zyb20gLi4uXSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlc29sdmUgPSBmdW5jdGlvbigpIHtcbiAgdmFyIHJlc29sdmVkUGF0aCA9ICcnLFxuICAgICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IGZhbHNlO1xuXG4gIGZvciAodmFyIGkgPSBhcmd1bWVudHMubGVuZ3RoIC0gMTsgaSA+PSAtMSAmJiAhcmVzb2x2ZWRBYnNvbHV0ZTsgaS0tKSB7XG4gICAgdmFyIHBhdGggPSAoaSA+PSAwKSA/IGFyZ3VtZW50c1tpXSA6IHByb2Nlc3MuY3dkKCk7XG5cbiAgICAvLyBTa2lwIGVtcHR5IGFuZCBpbnZhbGlkIGVudHJpZXNcbiAgICBpZiAodHlwZW9mIHBhdGggIT09ICdzdHJpbmcnKSB7XG4gICAgICB0aHJvdyBuZXcgVHlwZUVycm9yKCdBcmd1bWVudHMgdG8gcGF0aC5yZXNvbHZlIG11c3QgYmUgc3RyaW5ncycpO1xuICAgIH0gZWxzZSBpZiAoIXBhdGgpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIHJlc29sdmVkUGF0aCA9IHBhdGggKyAnLycgKyByZXNvbHZlZFBhdGg7XG4gICAgcmVzb2x2ZWRBYnNvbHV0ZSA9IHBhdGguY2hhckF0KDApID09PSAnLyc7XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50IHRoZSBwYXRoIHNob3VsZCBiZSByZXNvbHZlZCB0byBhIGZ1bGwgYWJzb2x1dGUgcGF0aCwgYnV0XG4gIC8vIGhhbmRsZSByZWxhdGl2ZSBwYXRocyB0byBiZSBzYWZlIChtaWdodCBoYXBwZW4gd2hlbiBwcm9jZXNzLmN3ZCgpIGZhaWxzKVxuXG4gIC8vIE5vcm1hbGl6ZSB0aGUgcGF0aFxuICByZXNvbHZlZFBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocmVzb2x2ZWRQYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIXJlc29sdmVkQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICByZXR1cm4gKChyZXNvbHZlZEFic29sdXRlID8gJy8nIDogJycpICsgcmVzb2x2ZWRQYXRoKSB8fCAnLic7XG59O1xuXG4vLyBwYXRoLm5vcm1hbGl6ZShwYXRoKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5ub3JtYWxpemUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciBpc0Fic29sdXRlID0gZXhwb3J0cy5pc0Fic29sdXRlKHBhdGgpLFxuICAgICAgdHJhaWxpbmdTbGFzaCA9IHN1YnN0cihwYXRoLCAtMSkgPT09ICcvJztcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcGF0aCA9IG5vcm1hbGl6ZUFycmF5KGZpbHRlcihwYXRoLnNwbGl0KCcvJyksIGZ1bmN0aW9uKHApIHtcbiAgICByZXR1cm4gISFwO1xuICB9KSwgIWlzQWJzb2x1dGUpLmpvaW4oJy8nKTtcblxuICBpZiAoIXBhdGggJiYgIWlzQWJzb2x1dGUpIHtcbiAgICBwYXRoID0gJy4nO1xuICB9XG4gIGlmIChwYXRoICYmIHRyYWlsaW5nU2xhc2gpIHtcbiAgICBwYXRoICs9ICcvJztcbiAgfVxuXG4gIHJldHVybiAoaXNBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHBhdGg7XG59O1xuXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLmlzQWJzb2x1dGUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHJldHVybiBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5qb2luID0gZnVuY3Rpb24oKSB7XG4gIHZhciBwYXRocyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMCk7XG4gIHJldHVybiBleHBvcnRzLm5vcm1hbGl6ZShmaWx0ZXIocGF0aHMsIGZ1bmN0aW9uKHAsIGluZGV4KSB7XG4gICAgaWYgKHR5cGVvZiBwICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGguam9pbiBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9XG4gICAgcmV0dXJuIHA7XG4gIH0pLmpvaW4oJy8nKSk7XG59O1xuXG5cbi8vIHBhdGgucmVsYXRpdmUoZnJvbSwgdG8pXG4vLyBwb3NpeCB2ZXJzaW9uXG5leHBvcnRzLnJlbGF0aXZlID0gZnVuY3Rpb24oZnJvbSwgdG8pIHtcbiAgZnJvbSA9IGV4cG9ydHMucmVzb2x2ZShmcm9tKS5zdWJzdHIoMSk7XG4gIHRvID0gZXhwb3J0cy5yZXNvbHZlKHRvKS5zdWJzdHIoMSk7XG5cbiAgZnVuY3Rpb24gdHJpbShhcnIpIHtcbiAgICB2YXIgc3RhcnQgPSAwO1xuICAgIGZvciAoOyBzdGFydCA8IGFyci5sZW5ndGg7IHN0YXJ0KyspIHtcbiAgICAgIGlmIChhcnJbc3RhcnRdICE9PSAnJykgYnJlYWs7XG4gICAgfVxuXG4gICAgdmFyIGVuZCA9IGFyci5sZW5ndGggLSAxO1xuICAgIGZvciAoOyBlbmQgPj0gMDsgZW5kLS0pIHtcbiAgICAgIGlmIChhcnJbZW5kXSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChzdGFydCA+IGVuZCkgcmV0dXJuIFtdO1xuICAgIHJldHVybiBhcnIuc2xpY2Uoc3RhcnQsIGVuZCAtIHN0YXJ0ICsgMSk7XG4gIH1cblxuICB2YXIgZnJvbVBhcnRzID0gdHJpbShmcm9tLnNwbGl0KCcvJykpO1xuICB2YXIgdG9QYXJ0cyA9IHRyaW0odG8uc3BsaXQoJy8nKSk7XG5cbiAgdmFyIGxlbmd0aCA9IE1hdGgubWluKGZyb21QYXJ0cy5sZW5ndGgsIHRvUGFydHMubGVuZ3RoKTtcbiAgdmFyIHNhbWVQYXJ0c0xlbmd0aCA9IGxlbmd0aDtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGlmIChmcm9tUGFydHNbaV0gIT09IHRvUGFydHNbaV0pIHtcbiAgICAgIHNhbWVQYXJ0c0xlbmd0aCA9IGk7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICB2YXIgb3V0cHV0UGFydHMgPSBbXTtcbiAgZm9yICh2YXIgaSA9IHNhbWVQYXJ0c0xlbmd0aDsgaSA8IGZyb21QYXJ0cy5sZW5ndGg7IGkrKykge1xuICAgIG91dHB1dFBhcnRzLnB1c2goJy4uJyk7XG4gIH1cblxuICBvdXRwdXRQYXJ0cyA9IG91dHB1dFBhcnRzLmNvbmNhdCh0b1BhcnRzLnNsaWNlKHNhbWVQYXJ0c0xlbmd0aCkpO1xuXG4gIHJldHVybiBvdXRwdXRQYXJ0cy5qb2luKCcvJyk7XG59O1xuXG5leHBvcnRzLnNlcCA9ICcvJztcbmV4cG9ydHMuZGVsaW1pdGVyID0gJzonO1xuXG5leHBvcnRzLmRpcm5hbWUgPSBmdW5jdGlvbihwYXRoKSB7XG4gIHZhciByZXN1bHQgPSBzcGxpdFBhdGgocGF0aCksXG4gICAgICByb290ID0gcmVzdWx0WzBdLFxuICAgICAgZGlyID0gcmVzdWx0WzFdO1xuXG4gIGlmICghcm9vdCAmJiAhZGlyKSB7XG4gICAgLy8gTm8gZGlybmFtZSB3aGF0c29ldmVyXG4gICAgcmV0dXJuICcuJztcbiAgfVxuXG4gIGlmIChkaXIpIHtcbiAgICAvLyBJdCBoYXMgYSBkaXJuYW1lLCBzdHJpcCB0cmFpbGluZyBzbGFzaFxuICAgIGRpciA9IGRpci5zdWJzdHIoMCwgZGlyLmxlbmd0aCAtIDEpO1xuICB9XG5cbiAgcmV0dXJuIHJvb3QgKyBkaXI7XG59O1xuXG5cbmV4cG9ydHMuYmFzZW5hbWUgPSBmdW5jdGlvbihwYXRoLCBleHQpIHtcbiAgdmFyIGYgPSBzcGxpdFBhdGgocGF0aClbMl07XG4gIC8vIFRPRE86IG1ha2UgdGhpcyBjb21wYXJpc29uIGNhc2UtaW5zZW5zaXRpdmUgb24gd2luZG93cz9cbiAgaWYgKGV4dCAmJiBmLnN1YnN0cigtMSAqIGV4dC5sZW5ndGgpID09PSBleHQpIHtcbiAgICBmID0gZi5zdWJzdHIoMCwgZi5sZW5ndGggLSBleHQubGVuZ3RoKTtcbiAgfVxuICByZXR1cm4gZjtcbn07XG5cblxuZXhwb3J0cy5leHRuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gc3BsaXRQYXRoKHBhdGgpWzNdO1xufTtcblxuZnVuY3Rpb24gZmlsdGVyICh4cywgZikge1xuICAgIGlmICh4cy5maWx0ZXIpIHJldHVybiB4cy5maWx0ZXIoZik7XG4gICAgdmFyIHJlcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgaWYgKGYoeHNbaV0sIGksIHhzKSkgcmVzLnB1c2goeHNbaV0pO1xuICAgIH1cbiAgICByZXR1cm4gcmVzO1xufVxuXG4vLyBTdHJpbmcucHJvdG90eXBlLnN1YnN0ciAtIG5lZ2F0aXZlIGluZGV4IGRvbid0IHdvcmsgaW4gSUU4XG52YXIgc3Vic3RyID0gJ2FiJy5zdWJzdHIoLTEpID09PSAnYidcbiAgICA/IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHsgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbikgfVxuICAgIDogZnVuY3Rpb24gKHN0ciwgc3RhcnQsIGxlbikge1xuICAgICAgICBpZiAoc3RhcnQgPCAwKSBzdGFydCA9IHN0ci5sZW5ndGggKyBzdGFydDtcbiAgICAgICAgcmV0dXJuIHN0ci5zdWJzdHIoc3RhcnQsIGxlbik7XG4gICAgfVxuO1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xuXG5wcm9jZXNzLm5leHRUaWNrID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgY2FuU2V0SW1tZWRpYXRlID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cuc2V0SW1tZWRpYXRlO1xuICAgIHZhciBjYW5Qb3N0ID0gdHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCdcbiAgICAmJiB3aW5kb3cucG9zdE1lc3NhZ2UgJiYgd2luZG93LmFkZEV2ZW50TGlzdGVuZXJcbiAgICA7XG5cbiAgICBpZiAoY2FuU2V0SW1tZWRpYXRlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAoZikgeyByZXR1cm4gd2luZG93LnNldEltbWVkaWF0ZShmKSB9O1xuICAgIH1cblxuICAgIGlmIChjYW5Qb3N0KSB7XG4gICAgICAgIHZhciBxdWV1ZSA9IFtdO1xuICAgICAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcignbWVzc2FnZScsIGZ1bmN0aW9uIChldikge1xuICAgICAgICAgICAgdmFyIHNvdXJjZSA9IGV2LnNvdXJjZTtcbiAgICAgICAgICAgIGlmICgoc291cmNlID09PSB3aW5kb3cgfHwgc291cmNlID09PSBudWxsKSAmJiBldi5kYXRhID09PSAncHJvY2Vzcy10aWNrJykge1xuICAgICAgICAgICAgICAgIGV2LnN0b3BQcm9wYWdhdGlvbigpO1xuICAgICAgICAgICAgICAgIGlmIChxdWV1ZS5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmbiA9IHF1ZXVlLnNoaWZ0KCk7XG4gICAgICAgICAgICAgICAgICAgIGZuKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9LCB0cnVlKTtcblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgICAgIHF1ZXVlLnB1c2goZm4pO1xuICAgICAgICAgICAgd2luZG93LnBvc3RNZXNzYWdlKCdwcm9jZXNzLXRpY2snLCAnKicpO1xuICAgICAgICB9O1xuICAgIH1cblxuICAgIHJldHVybiBmdW5jdGlvbiBuZXh0VGljayhmbikge1xuICAgICAgICBzZXRUaW1lb3V0KGZuLCAwKTtcbiAgICB9O1xufSkoKTtcblxucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5wcm9jZXNzLm9uID0gbm9vcDtcbnByb2Nlc3MuYWRkTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5vbmNlID0gbm9vcDtcbnByb2Nlc3Mub2ZmID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlTGlzdGVuZXIgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVBbGxMaXN0ZW5lcnMgPSBub29wO1xucHJvY2Vzcy5lbWl0ID0gbm9vcDtcblxucHJvY2Vzcy5iaW5kaW5nID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuYmluZGluZyBpcyBub3Qgc3VwcG9ydGVkJyk7XG59XG5cbi8vIFRPRE8oc2h0eWxtYW4pXG5wcm9jZXNzLmN3ZCA9IGZ1bmN0aW9uICgpIHsgcmV0dXJuICcvJyB9O1xucHJvY2Vzcy5jaGRpciA9IGZ1bmN0aW9uIChkaXIpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Byb2Nlc3MuY2hkaXIgaXMgbm90IHN1cHBvcnRlZCcpO1xufTtcbiIsIi8vIENvcHlyaWdodCBKb3llbnQsIEluYy4gYW5kIG90aGVyIE5vZGUgY29udHJpYnV0b3JzLlxuLy9cbi8vIFBlcm1pc3Npb24gaXMgaGVyZWJ5IGdyYW50ZWQsIGZyZWUgb2YgY2hhcmdlLCB0byBhbnkgcGVyc29uIG9idGFpbmluZyBhXG4vLyBjb3B5IG9mIHRoaXMgc29mdHdhcmUgYW5kIGFzc29jaWF0ZWQgZG9jdW1lbnRhdGlvbiBmaWxlcyAodGhlXG4vLyBcIlNvZnR3YXJlXCIpLCB0byBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmdcbi8vIHdpdGhvdXQgbGltaXRhdGlvbiB0aGUgcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCxcbi8vIGRpc3RyaWJ1dGUsIHN1YmxpY2Vuc2UsIGFuZC9vciBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXRcbi8vIHBlcnNvbnMgdG8gd2hvbSB0aGUgU29mdHdhcmUgaXMgZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZVxuLy8gZm9sbG93aW5nIGNvbmRpdGlvbnM6XG4vL1xuLy8gVGhlIGFib3ZlIGNvcHlyaWdodCBub3RpY2UgYW5kIHRoaXMgcGVybWlzc2lvbiBub3RpY2Ugc2hhbGwgYmUgaW5jbHVkZWRcbi8vIGluIGFsbCBjb3BpZXMgb3Igc3Vic3RhbnRpYWwgcG9ydGlvbnMgb2YgdGhlIFNvZnR3YXJlLlxuLy9cbi8vIFRIRSBTT0ZUV0FSRSBJUyBQUk9WSURFRCBcIkFTIElTXCIsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1Ncbi8vIE9SIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0Zcbi8vIE1FUkNIQU5UQUJJTElUWSwgRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU5cbi8vIE5PIEVWRU5UIFNIQUxMIFRIRSBBVVRIT1JTIE9SIENPUFlSSUdIVCBIT0xERVJTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLFxuLy8gREFNQUdFUyBPUiBPVEhFUiBMSUFCSUxJVFksIFdIRVRIRVIgSU4gQU4gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SXG4vLyBPVEhFUldJU0UsIEFSSVNJTkcgRlJPTSwgT1VUIE9GIE9SIElOIENPTk5FQ1RJT04gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFXG4vLyBVU0UgT1IgT1RIRVIgREVBTElOR1MgSU4gVEhFIFNPRlRXQVJFLlxuXG4ndXNlIHN0cmljdCc7XG5cbi8vIElmIG9iai5oYXNPd25Qcm9wZXJ0eSBoYXMgYmVlbiBvdmVycmlkZGVuLCB0aGVuIGNhbGxpbmdcbi8vIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wKSB3aWxsIGJyZWFrLlxuLy8gU2VlOiBodHRwczovL2dpdGh1Yi5jb20vam95ZW50L25vZGUvaXNzdWVzLzE3MDdcbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ocXMsIHNlcCwgZXEsIG9wdGlvbnMpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIHZhciBvYmogPSB7fTtcblxuICBpZiAodHlwZW9mIHFzICE9PSAnc3RyaW5nJyB8fCBxcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gb2JqO1xuICB9XG5cbiAgdmFyIHJlZ2V4cCA9IC9cXCsvZztcbiAgcXMgPSBxcy5zcGxpdChzZXApO1xuXG4gIHZhciBtYXhLZXlzID0gMTAwMDtcbiAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMubWF4S2V5cyA9PT0gJ251bWJlcicpIHtcbiAgICBtYXhLZXlzID0gb3B0aW9ucy5tYXhLZXlzO1xuICB9XG5cbiAgdmFyIGxlbiA9IHFzLmxlbmd0aDtcbiAgLy8gbWF4S2V5cyA8PSAwIG1lYW5zIHRoYXQgd2Ugc2hvdWxkIG5vdCBsaW1pdCBrZXlzIGNvdW50XG4gIGlmIChtYXhLZXlzID4gMCAmJiBsZW4gPiBtYXhLZXlzKSB7XG4gICAgbGVuID0gbWF4S2V5cztcbiAgfVxuXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuOyArK2kpIHtcbiAgICB2YXIgeCA9IHFzW2ldLnJlcGxhY2UocmVnZXhwLCAnJTIwJyksXG4gICAgICAgIGlkeCA9IHguaW5kZXhPZihlcSksXG4gICAgICAgIGtzdHIsIHZzdHIsIGssIHY7XG5cbiAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgIGtzdHIgPSB4LnN1YnN0cigwLCBpZHgpO1xuICAgICAgdnN0ciA9IHguc3Vic3RyKGlkeCArIDEpO1xuICAgIH0gZWxzZSB7XG4gICAgICBrc3RyID0geDtcbiAgICAgIHZzdHIgPSAnJztcbiAgICB9XG5cbiAgICBrID0gZGVjb2RlVVJJQ29tcG9uZW50KGtzdHIpO1xuICAgIHYgPSBkZWNvZGVVUklDb21wb25lbnQodnN0cik7XG5cbiAgICBpZiAoIWhhc093blByb3BlcnR5KG9iaiwgaykpIHtcbiAgICAgIG9ialtrXSA9IHY7XG4gICAgfSBlbHNlIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgIG9ialtrXS5wdXNoKHYpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvYmpba10gPSBbb2JqW2tdLCB2XTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gb2JqO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG52YXIgc3RyaW5naWZ5UHJpbWl0aXZlID0gZnVuY3Rpb24odikge1xuICBzd2l0Y2ggKHR5cGVvZiB2KSB7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiB2O1xuXG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gdiA/ICd0cnVlJyA6ICdmYWxzZSc7XG5cbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuIGlzRmluaXRlKHYpID8gdiA6ICcnO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiAnJztcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbihvYmosIHNlcCwgZXEsIG5hbWUpIHtcbiAgc2VwID0gc2VwIHx8ICcmJztcbiAgZXEgPSBlcSB8fCAnPSc7XG4gIGlmIChvYmogPT09IG51bGwpIHtcbiAgICBvYmogPSB1bmRlZmluZWQ7XG4gIH1cblxuICBpZiAodHlwZW9mIG9iaiA9PT0gJ29iamVjdCcpIHtcbiAgICByZXR1cm4gbWFwKG9iamVjdEtleXMob2JqKSwgZnVuY3Rpb24oaykge1xuICAgICAgdmFyIGtzID0gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShrKSkgKyBlcTtcbiAgICAgIGlmIChpc0FycmF5KG9ialtrXSkpIHtcbiAgICAgICAgcmV0dXJuIG9ialtrXS5tYXAoZnVuY3Rpb24odikge1xuICAgICAgICAgIHJldHVybiBrcyArIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUodikpO1xuICAgICAgICB9KS5qb2luKHNlcCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9ialtrXSkpO1xuICAgICAgfVxuICAgIH0pLmpvaW4oc2VwKTtcblxuICB9XG5cbiAgaWYgKCFuYW1lKSByZXR1cm4gJyc7XG4gIHJldHVybiBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG5hbWUpKSArIGVxICtcbiAgICAgICAgIGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUob2JqKSk7XG59O1xuXG52YXIgaXNBcnJheSA9IEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHhzKSB7XG4gIHJldHVybiBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwoeHMpID09PSAnW29iamVjdCBBcnJheV0nO1xufTtcblxuZnVuY3Rpb24gbWFwICh4cywgZikge1xuICBpZiAoeHMubWFwKSByZXR1cm4geHMubWFwKGYpO1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgeHMubGVuZ3RoOyBpKyspIHtcbiAgICByZXMucHVzaChmKHhzW2ldLCBpKSk7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn1cblxudmFyIG9iamVjdEtleXMgPSBPYmplY3Qua2V5cyB8fCBmdW5jdGlvbiAob2JqKSB7XG4gIHZhciByZXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBrZXkpKSByZXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuIiwiJ3VzZSBzdHJpY3QnO1xuXG5leHBvcnRzLmRlY29kZSA9IGV4cG9ydHMucGFyc2UgPSByZXF1aXJlKCcuL2RlY29kZScpO1xuZXhwb3J0cy5lbmNvZGUgPSBleHBvcnRzLnN0cmluZ2lmeSA9IHJlcXVpcmUoJy4vZW5jb2RlJyk7XG4iLCJtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIGlzQnVmZmVyKGFyZykge1xuICByZXR1cm4gYXJnICYmIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnXG4gICAgJiYgdHlwZW9mIGFyZy5jb3B5ID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5maWxsID09PSAnZnVuY3Rpb24nXG4gICAgJiYgdHlwZW9mIGFyZy5yZWFkVUludDggPT09ICdmdW5jdGlvbic7XG59IiwiKGZ1bmN0aW9uIChwcm9jZXNzLGdsb2JhbCl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxudmFyIGZvcm1hdFJlZ0V4cCA9IC8lW3NkaiVdL2c7XG5leHBvcnRzLmZvcm1hdCA9IGZ1bmN0aW9uKGYpIHtcbiAgaWYgKCFpc1N0cmluZyhmKSkge1xuICAgIHZhciBvYmplY3RzID0gW107XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgIG9iamVjdHMucHVzaChpbnNwZWN0KGFyZ3VtZW50c1tpXSkpO1xuICAgIH1cbiAgICByZXR1cm4gb2JqZWN0cy5qb2luKCcgJyk7XG4gIH1cblxuICB2YXIgaSA9IDE7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgbGVuID0gYXJncy5sZW5ndGg7XG4gIHZhciBzdHIgPSBTdHJpbmcoZikucmVwbGFjZShmb3JtYXRSZWdFeHAsIGZ1bmN0aW9uKHgpIHtcbiAgICBpZiAoeCA9PT0gJyUlJykgcmV0dXJuICclJztcbiAgICBpZiAoaSA+PSBsZW4pIHJldHVybiB4O1xuICAgIHN3aXRjaCAoeCkge1xuICAgICAgY2FzZSAnJXMnOiByZXR1cm4gU3RyaW5nKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclZCc6IHJldHVybiBOdW1iZXIoYXJnc1tpKytdKTtcbiAgICAgIGNhc2UgJyVqJzpcbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoYXJnc1tpKytdKTtcbiAgICAgICAgfSBjYXRjaCAoXykge1xuICAgICAgICAgIHJldHVybiAnW0NpcmN1bGFyXSc7XG4gICAgICAgIH1cbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiB4O1xuICAgIH1cbiAgfSk7XG4gIGZvciAodmFyIHggPSBhcmdzW2ldOyBpIDwgbGVuOyB4ID0gYXJnc1srK2ldKSB7XG4gICAgaWYgKGlzTnVsbCh4KSB8fCAhaXNPYmplY3QoeCkpIHtcbiAgICAgIHN0ciArPSAnICcgKyB4O1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgKz0gJyAnICsgaW5zcGVjdCh4KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHN0cjtcbn07XG5cblxuLy8gTWFyayB0aGF0IGEgbWV0aG9kIHNob3VsZCBub3QgYmUgdXNlZC5cbi8vIFJldHVybnMgYSBtb2RpZmllZCBmdW5jdGlvbiB3aGljaCB3YXJucyBvbmNlIGJ5IGRlZmF1bHQuXG4vLyBJZiAtLW5vLWRlcHJlY2F0aW9uIGlzIHNldCwgdGhlbiBpdCBpcyBhIG5vLW9wLlxuZXhwb3J0cy5kZXByZWNhdGUgPSBmdW5jdGlvbihmbiwgbXNnKSB7XG4gIC8vIEFsbG93IGZvciBkZXByZWNhdGluZyB0aGluZ3MgaW4gdGhlIHByb2Nlc3Mgb2Ygc3RhcnRpbmcgdXAuXG4gIGlmIChpc1VuZGVmaW5lZChnbG9iYWwucHJvY2VzcykpIHtcbiAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICByZXR1cm4gZXhwb3J0cy5kZXByZWNhdGUoZm4sIG1zZykuYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICB9O1xuICB9XG5cbiAgaWYgKHByb2Nlc3Mubm9EZXByZWNhdGlvbiA9PT0gdHJ1ZSkge1xuICAgIHJldHVybiBmbjtcbiAgfVxuXG4gIHZhciB3YXJuZWQgPSBmYWxzZTtcbiAgZnVuY3Rpb24gZGVwcmVjYXRlZCgpIHtcbiAgICBpZiAoIXdhcm5lZCkge1xuICAgICAgaWYgKHByb2Nlc3MudGhyb3dEZXByZWNhdGlvbikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IobXNnKTtcbiAgICAgIH0gZWxzZSBpZiAocHJvY2Vzcy50cmFjZURlcHJlY2F0aW9uKSB7XG4gICAgICAgIGNvbnNvbGUudHJhY2UobXNnKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IobXNnKTtcbiAgICAgIH1cbiAgICAgIHdhcm5lZCA9IHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmbi5hcHBseSh0aGlzLCBhcmd1bWVudHMpO1xuICB9XG5cbiAgcmV0dXJuIGRlcHJlY2F0ZWQ7XG59O1xuXG5cbnZhciBkZWJ1Z3MgPSB7fTtcbnZhciBkZWJ1Z0Vudmlyb247XG5leHBvcnRzLmRlYnVnbG9nID0gZnVuY3Rpb24oc2V0KSB7XG4gIGlmIChpc1VuZGVmaW5lZChkZWJ1Z0Vudmlyb24pKVxuICAgIGRlYnVnRW52aXJvbiA9IHByb2Nlc3MuZW52Lk5PREVfREVCVUcgfHwgJyc7XG4gIHNldCA9IHNldC50b1VwcGVyQ2FzZSgpO1xuICBpZiAoIWRlYnVnc1tzZXRdKSB7XG4gICAgaWYgKG5ldyBSZWdFeHAoJ1xcXFxiJyArIHNldCArICdcXFxcYicsICdpJykudGVzdChkZWJ1Z0Vudmlyb24pKSB7XG4gICAgICB2YXIgcGlkID0gcHJvY2Vzcy5waWQ7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB2YXIgbXNnID0gZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKTtcbiAgICAgICAgY29uc29sZS5lcnJvcignJXMgJWQ6ICVzJywgc2V0LCBwaWQsIG1zZyk7XG4gICAgICB9O1xuICAgIH0gZWxzZSB7XG4gICAgICBkZWJ1Z3Nbc2V0XSA9IGZ1bmN0aW9uKCkge307XG4gICAgfVxuICB9XG4gIHJldHVybiBkZWJ1Z3Nbc2V0XTtcbn07XG5cblxuLyoqXG4gKiBFY2hvcyB0aGUgdmFsdWUgb2YgYSB2YWx1ZS4gVHJ5cyB0byBwcmludCB0aGUgdmFsdWUgb3V0XG4gKiBpbiB0aGUgYmVzdCB3YXkgcG9zc2libGUgZ2l2ZW4gdGhlIGRpZmZlcmVudCB0eXBlcy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gb2JqIFRoZSBvYmplY3QgdG8gcHJpbnQgb3V0LlxuICogQHBhcmFtIHtPYmplY3R9IG9wdHMgT3B0aW9uYWwgb3B0aW9ucyBvYmplY3QgdGhhdCBhbHRlcnMgdGhlIG91dHB1dC5cbiAqL1xuLyogbGVnYWN5OiBvYmosIHNob3dIaWRkZW4sIGRlcHRoLCBjb2xvcnMqL1xuZnVuY3Rpb24gaW5zcGVjdChvYmosIG9wdHMpIHtcbiAgLy8gZGVmYXVsdCBvcHRpb25zXG4gIHZhciBjdHggPSB7XG4gICAgc2VlbjogW10sXG4gICAgc3R5bGl6ZTogc3R5bGl6ZU5vQ29sb3JcbiAgfTtcbiAgLy8gbGVnYWN5Li4uXG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDMpIGN0eC5kZXB0aCA9IGFyZ3VtZW50c1syXTtcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPj0gNCkgY3R4LmNvbG9ycyA9IGFyZ3VtZW50c1szXTtcbiAgaWYgKGlzQm9vbGVhbihvcHRzKSkge1xuICAgIC8vIGxlZ2FjeS4uLlxuICAgIGN0eC5zaG93SGlkZGVuID0gb3B0cztcbiAgfSBlbHNlIGlmIChvcHRzKSB7XG4gICAgLy8gZ290IGFuIFwib3B0aW9uc1wiIG9iamVjdFxuICAgIGV4cG9ydHMuX2V4dGVuZChjdHgsIG9wdHMpO1xuICB9XG4gIC8vIHNldCBkZWZhdWx0IG9wdGlvbnNcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5zaG93SGlkZGVuKSkgY3R4LnNob3dIaWRkZW4gPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5kZXB0aCkpIGN0eC5kZXB0aCA9IDI7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguY29sb3JzKSkgY3R4LmNvbG9ycyA9IGZhbHNlO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmN1c3RvbUluc3BlY3QpKSBjdHguY3VzdG9tSW5zcGVjdCA9IHRydWU7XG4gIGlmIChjdHguY29sb3JzKSBjdHguc3R5bGl6ZSA9IHN0eWxpemVXaXRoQ29sb3I7XG4gIHJldHVybiBmb3JtYXRWYWx1ZShjdHgsIG9iaiwgY3R4LmRlcHRoKTtcbn1cbmV4cG9ydHMuaW5zcGVjdCA9IGluc3BlY3Q7XG5cblxuLy8gaHR0cDovL2VuLndpa2lwZWRpYS5vcmcvd2lraS9BTlNJX2VzY2FwZV9jb2RlI2dyYXBoaWNzXG5pbnNwZWN0LmNvbG9ycyA9IHtcbiAgJ2JvbGQnIDogWzEsIDIyXSxcbiAgJ2l0YWxpYycgOiBbMywgMjNdLFxuICAndW5kZXJsaW5lJyA6IFs0LCAyNF0sXG4gICdpbnZlcnNlJyA6IFs3LCAyN10sXG4gICd3aGl0ZScgOiBbMzcsIDM5XSxcbiAgJ2dyZXknIDogWzkwLCAzOV0sXG4gICdibGFjaycgOiBbMzAsIDM5XSxcbiAgJ2JsdWUnIDogWzM0LCAzOV0sXG4gICdjeWFuJyA6IFszNiwgMzldLFxuICAnZ3JlZW4nIDogWzMyLCAzOV0sXG4gICdtYWdlbnRhJyA6IFszNSwgMzldLFxuICAncmVkJyA6IFszMSwgMzldLFxuICAneWVsbG93JyA6IFszMywgMzldXG59O1xuXG4vLyBEb24ndCB1c2UgJ2JsdWUnIG5vdCB2aXNpYmxlIG9uIGNtZC5leGVcbmluc3BlY3Quc3R5bGVzID0ge1xuICAnc3BlY2lhbCc6ICdjeWFuJyxcbiAgJ251bWJlcic6ICd5ZWxsb3cnLFxuICAnYm9vbGVhbic6ICd5ZWxsb3cnLFxuICAndW5kZWZpbmVkJzogJ2dyZXknLFxuICAnbnVsbCc6ICdib2xkJyxcbiAgJ3N0cmluZyc6ICdncmVlbicsXG4gICdkYXRlJzogJ21hZ2VudGEnLFxuICAvLyBcIm5hbWVcIjogaW50ZW50aW9uYWxseSBub3Qgc3R5bGluZ1xuICAncmVnZXhwJzogJ3JlZCdcbn07XG5cblxuZnVuY3Rpb24gc3R5bGl6ZVdpdGhDb2xvcihzdHIsIHN0eWxlVHlwZSkge1xuICB2YXIgc3R5bGUgPSBpbnNwZWN0LnN0eWxlc1tzdHlsZVR5cGVdO1xuXG4gIGlmIChzdHlsZSkge1xuICAgIHJldHVybiAnXFx1MDAxYlsnICsgaW5zcGVjdC5jb2xvcnNbc3R5bGVdWzBdICsgJ20nICsgc3RyICtcbiAgICAgICAgICAgJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVsxXSArICdtJztcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gc3RyO1xuICB9XG59XG5cblxuZnVuY3Rpb24gc3R5bGl6ZU5vQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgcmV0dXJuIHN0cjtcbn1cblxuXG5mdW5jdGlvbiBhcnJheVRvSGFzaChhcnJheSkge1xuICB2YXIgaGFzaCA9IHt9O1xuXG4gIGFycmF5LmZvckVhY2goZnVuY3Rpb24odmFsLCBpZHgpIHtcbiAgICBoYXNoW3ZhbF0gPSB0cnVlO1xuICB9KTtcblxuICByZXR1cm4gaGFzaDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRWYWx1ZShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMpIHtcbiAgLy8gUHJvdmlkZSBhIGhvb2sgZm9yIHVzZXItc3BlY2lmaWVkIGluc3BlY3QgZnVuY3Rpb25zLlxuICAvLyBDaGVjayB0aGF0IHZhbHVlIGlzIGFuIG9iamVjdCB3aXRoIGFuIGluc3BlY3QgZnVuY3Rpb24gb24gaXRcbiAgaWYgKGN0eC5jdXN0b21JbnNwZWN0ICYmXG4gICAgICB2YWx1ZSAmJlxuICAgICAgaXNGdW5jdGlvbih2YWx1ZS5pbnNwZWN0KSAmJlxuICAgICAgLy8gRmlsdGVyIG91dCB0aGUgdXRpbCBtb2R1bGUsIGl0J3MgaW5zcGVjdCBmdW5jdGlvbiBpcyBzcGVjaWFsXG4gICAgICB2YWx1ZS5pbnNwZWN0ICE9PSBleHBvcnRzLmluc3BlY3QgJiZcbiAgICAgIC8vIEFsc28gZmlsdGVyIG91dCBhbnkgcHJvdG90eXBlIG9iamVjdHMgdXNpbmcgdGhlIGNpcmN1bGFyIGNoZWNrLlxuICAgICAgISh2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5wcm90b3R5cGUgPT09IHZhbHVlKSkge1xuICAgIHZhciByZXQgPSB2YWx1ZS5pbnNwZWN0KHJlY3Vyc2VUaW1lcywgY3R4KTtcbiAgICBpZiAoIWlzU3RyaW5nKHJldCkpIHtcbiAgICAgIHJldCA9IGZvcm1hdFZhbHVlKGN0eCwgcmV0LCByZWN1cnNlVGltZXMpO1xuICAgIH1cbiAgICByZXR1cm4gcmV0O1xuICB9XG5cbiAgLy8gUHJpbWl0aXZlIHR5cGVzIGNhbm5vdCBoYXZlIHByb3BlcnRpZXNcbiAgdmFyIHByaW1pdGl2ZSA9IGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKTtcbiAgaWYgKHByaW1pdGl2ZSkge1xuICAgIHJldHVybiBwcmltaXRpdmU7XG4gIH1cblxuICAvLyBMb29rIHVwIHRoZSBrZXlzIG9mIHRoZSBvYmplY3QuXG4gIHZhciBrZXlzID0gT2JqZWN0LmtleXModmFsdWUpO1xuICB2YXIgdmlzaWJsZUtleXMgPSBhcnJheVRvSGFzaChrZXlzKTtcblxuICBpZiAoY3R4LnNob3dIaWRkZW4pIHtcbiAgICBrZXlzID0gT2JqZWN0LmdldE93blByb3BlcnR5TmFtZXModmFsdWUpO1xuICB9XG5cbiAgLy8gSUUgZG9lc24ndCBtYWtlIGVycm9yIGZpZWxkcyBub24tZW51bWVyYWJsZVxuICAvLyBodHRwOi8vbXNkbi5taWNyb3NvZnQuY29tL2VuLXVzL2xpYnJhcnkvaWUvZHd3NTJzYnQodj12cy45NCkuYXNweFxuICBpZiAoaXNFcnJvcih2YWx1ZSlcbiAgICAgICYmIChrZXlzLmluZGV4T2YoJ21lc3NhZ2UnKSA+PSAwIHx8IGtleXMuaW5kZXhPZignZGVzY3JpcHRpb24nKSA+PSAwKSkge1xuICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICAvLyBTb21lIHR5cGUgb2Ygb2JqZWN0IHdpdGhvdXQgcHJvcGVydGllcyBjYW4gYmUgc2hvcnRjdXR0ZWQuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCkge1xuICAgIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgICAgdmFyIG5hbWUgPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZSgnW0Z1bmN0aW9uJyArIG5hbWUgKyAnXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICAgIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBjdHguc3R5bGl6ZShSZWdFeHAucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAncmVnZXhwJyk7XG4gICAgfVxuICAgIGlmIChpc0RhdGUodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoRGF0ZS5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdkYXRlJyk7XG4gICAgfVxuICAgIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgICB9XG4gIH1cblxuICB2YXIgYmFzZSA9ICcnLCBhcnJheSA9IGZhbHNlLCBicmFjZXMgPSBbJ3snLCAnfSddO1xuXG4gIC8vIE1ha2UgQXJyYXkgc2F5IHRoYXQgdGhleSBhcmUgQXJyYXlcbiAgaWYgKGlzQXJyYXkodmFsdWUpKSB7XG4gICAgYXJyYXkgPSB0cnVlO1xuICAgIGJyYWNlcyA9IFsnWycsICddJ107XG4gIH1cblxuICAvLyBNYWtlIGZ1bmN0aW9ucyBzYXkgdGhhdCB0aGV5IGFyZSBmdW5jdGlvbnNcbiAgaWYgKGlzRnVuY3Rpb24odmFsdWUpKSB7XG4gICAgdmFyIG4gPSB2YWx1ZS5uYW1lID8gJzogJyArIHZhbHVlLm5hbWUgOiAnJztcbiAgICBiYXNlID0gJyBbRnVuY3Rpb24nICsgbiArICddJztcbiAgfVxuXG4gIC8vIE1ha2UgUmVnRXhwcyBzYXkgdGhhdCB0aGV5IGFyZSBSZWdFeHBzXG4gIGlmIChpc1JlZ0V4cCh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZGF0ZXMgd2l0aCBwcm9wZXJ0aWVzIGZpcnN0IHNheSB0aGUgZGF0ZVxuICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBEYXRlLnByb3RvdHlwZS50b1VUQ1N0cmluZy5jYWxsKHZhbHVlKTtcbiAgfVxuXG4gIC8vIE1ha2UgZXJyb3Igd2l0aCBtZXNzYWdlIGZpcnN0IHNheSB0aGUgZXJyb3JcbiAgaWYgKGlzRXJyb3IodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIGZvcm1hdEVycm9yKHZhbHVlKTtcbiAgfVxuXG4gIGlmIChrZXlzLmxlbmd0aCA9PT0gMCAmJiAoIWFycmF5IHx8IHZhbHVlLmxlbmd0aCA9PSAwKSkge1xuICAgIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgYnJhY2VzWzFdO1xuICB9XG5cbiAgaWYgKHJlY3Vyc2VUaW1lcyA8IDApIHtcbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tPYmplY3RdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cblxuICBjdHguc2Vlbi5wdXNoKHZhbHVlKTtcblxuICB2YXIgb3V0cHV0O1xuICBpZiAoYXJyYXkpIHtcbiAgICBvdXRwdXQgPSBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKTtcbiAgfSBlbHNlIHtcbiAgICBvdXRwdXQgPSBrZXlzLm1hcChmdW5jdGlvbihrZXkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KTtcbiAgICB9KTtcbiAgfVxuXG4gIGN0eC5zZWVuLnBvcCgpO1xuXG4gIHJldHVybiByZWR1Y2VUb1NpbmdsZVN0cmluZyhvdXRwdXQsIGJhc2UsIGJyYWNlcyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0UHJpbWl0aXZlKGN0eCwgdmFsdWUpIHtcbiAgaWYgKGlzVW5kZWZpbmVkKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ3VuZGVmaW5lZCcsICd1bmRlZmluZWQnKTtcbiAgaWYgKGlzU3RyaW5nKHZhbHVlKSkge1xuICAgIHZhciBzaW1wbGUgPSAnXFwnJyArIEpTT04uc3RyaW5naWZ5KHZhbHVlKS5yZXBsYWNlKC9eXCJ8XCIkL2csICcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKSArICdcXCcnO1xuICAgIHJldHVybiBjdHguc3R5bGl6ZShzaW1wbGUsICdzdHJpbmcnKTtcbiAgfVxuICBpZiAoaXNOdW1iZXIodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnbnVtYmVyJyk7XG4gIGlmIChpc0Jvb2xlYW4odmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnJyArIHZhbHVlLCAnYm9vbGVhbicpO1xuICAvLyBGb3Igc29tZSByZWFzb24gdHlwZW9mIG51bGwgaXMgXCJvYmplY3RcIiwgc28gc3BlY2lhbCBjYXNlIGhlcmUuXG4gIGlmIChpc051bGwodmFsdWUpKVxuICAgIHJldHVybiBjdHguc3R5bGl6ZSgnbnVsbCcsICdudWxsJyk7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0RXJyb3IodmFsdWUpIHtcbiAgcmV0dXJuICdbJyArIEVycm9yLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSArICddJztcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRBcnJheShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXlzKSB7XG4gIHZhciBvdXRwdXQgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDAsIGwgPSB2YWx1ZS5sZW5ndGg7IGkgPCBsOyArK2kpIHtcbiAgICBpZiAoaGFzT3duUHJvcGVydHkodmFsdWUsIFN0cmluZyhpKSkpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAgU3RyaW5nKGkpLCB0cnVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dHB1dC5wdXNoKCcnKTtcbiAgICB9XG4gIH1cbiAga2V5cy5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgIGlmICgha2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgb3V0cHV0LnB1c2goZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cyxcbiAgICAgICAgICBrZXksIHRydWUpKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0cHV0O1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsIGtleSwgYXJyYXkpIHtcbiAgdmFyIG5hbWUsIHN0ciwgZGVzYztcbiAgZGVzYyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IodmFsdWUsIGtleSkgfHwgeyB2YWx1ZTogdmFsdWVba2V5XSB9O1xuICBpZiAoZGVzYy5nZXQpIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbR2V0dGVyL1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAoZGVzYy5zZXQpIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbU2V0dGVyXScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG4gIGlmICghaGFzT3duUHJvcGVydHkodmlzaWJsZUtleXMsIGtleSkpIHtcbiAgICBuYW1lID0gJ1snICsga2V5ICsgJ10nO1xuICB9XG4gIGlmICghc3RyKSB7XG4gICAgaWYgKGN0eC5zZWVuLmluZGV4T2YoZGVzYy52YWx1ZSkgPCAwKSB7XG4gICAgICBpZiAoaXNOdWxsKHJlY3Vyc2VUaW1lcykpIHtcbiAgICAgICAgc3RyID0gZm9ybWF0VmFsdWUoY3R4LCBkZXNjLnZhbHVlLCBudWxsKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgcmVjdXJzZVRpbWVzIC0gMSk7XG4gICAgICB9XG4gICAgICBpZiAoc3RyLmluZGV4T2YoJ1xcbicpID4gLTEpIHtcbiAgICAgICAgaWYgKGFycmF5KSB7XG4gICAgICAgICAgc3RyID0gc3RyLnNwbGl0KCdcXG4nKS5tYXAoZnVuY3Rpb24obGluZSkge1xuICAgICAgICAgICAgcmV0dXJuICcgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpLnN1YnN0cigyKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBzdHIgPSAnXFxuJyArIHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAgJyArIGxpbmU7XG4gICAgICAgICAgfSkuam9pbignXFxuJyk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tDaXJjdWxhcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoaXNVbmRlZmluZWQobmFtZSkpIHtcbiAgICBpZiAoYXJyYXkgJiYga2V5Lm1hdGNoKC9eXFxkKyQvKSkge1xuICAgICAgcmV0dXJuIHN0cjtcbiAgICB9XG4gICAgbmFtZSA9IEpTT04uc3RyaW5naWZ5KCcnICsga2V5KTtcbiAgICBpZiAobmFtZS5tYXRjaCgvXlwiKFthLXpBLVpfXVthLXpBLVpfMC05XSopXCIkLykpIHtcbiAgICAgIG5hbWUgPSBuYW1lLnN1YnN0cigxLCBuYW1lLmxlbmd0aCAtIDIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICduYW1lJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hbWUgPSBuYW1lLnJlcGxhY2UoLycvZywgXCJcXFxcJ1wiKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvXFxcXFwiL2csICdcIicpXG4gICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8oXlwifFwiJCkvZywgXCInXCIpO1xuICAgICAgbmFtZSA9IGN0eC5zdHlsaXplKG5hbWUsICdzdHJpbmcnKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmFtZSArICc6ICcgKyBzdHI7XG59XG5cblxuZnVuY3Rpb24gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpIHtcbiAgdmFyIG51bUxpbmVzRXN0ID0gMDtcbiAgdmFyIGxlbmd0aCA9IG91dHB1dC5yZWR1Y2UoZnVuY3Rpb24ocHJldiwgY3VyKSB7XG4gICAgbnVtTGluZXNFc3QrKztcbiAgICBpZiAoY3VyLmluZGV4T2YoJ1xcbicpID49IDApIG51bUxpbmVzRXN0Kys7XG4gICAgcmV0dXJuIHByZXYgKyBjdXIucmVwbGFjZSgvXFx1MDAxYlxcW1xcZFxcZD9tL2csICcnKS5sZW5ndGggKyAxO1xuICB9LCAwKTtcblxuICBpZiAobGVuZ3RoID4gNjApIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICtcbiAgICAgICAgICAgKGJhc2UgPT09ICcnID8gJycgOiBiYXNlICsgJ1xcbiAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIG91dHB1dC5qb2luKCcsXFxuICAnKSArXG4gICAgICAgICAgICcgJyArXG4gICAgICAgICAgIGJyYWNlc1sxXTtcbiAgfVxuXG4gIHJldHVybiBicmFjZXNbMF0gKyBiYXNlICsgJyAnICsgb3V0cHV0LmpvaW4oJywgJykgKyAnICcgKyBicmFjZXNbMV07XG59XG5cblxuLy8gTk9URTogVGhlc2UgdHlwZSBjaGVja2luZyBmdW5jdGlvbnMgaW50ZW50aW9uYWxseSBkb24ndCB1c2UgYGluc3RhbmNlb2ZgXG4vLyBiZWNhdXNlIGl0IGlzIGZyYWdpbGUgYW5kIGNhbiBiZSBlYXNpbHkgZmFrZWQgd2l0aCBgT2JqZWN0LmNyZWF0ZSgpYC5cbmZ1bmN0aW9uIGlzQXJyYXkoYXIpIHtcbiAgcmV0dXJuIEFycmF5LmlzQXJyYXkoYXIpO1xufVxuZXhwb3J0cy5pc0FycmF5ID0gaXNBcnJheTtcblxuZnVuY3Rpb24gaXNCb29sZWFuKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Jvb2xlYW4nO1xufVxuZXhwb3J0cy5pc0Jvb2xlYW4gPSBpc0Jvb2xlYW47XG5cbmZ1bmN0aW9uIGlzTnVsbChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsID0gaXNOdWxsO1xuXG5mdW5jdGlvbiBpc051bGxPclVuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PSBudWxsO1xufVxuZXhwb3J0cy5pc051bGxPclVuZGVmaW5lZCA9IGlzTnVsbE9yVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc051bWJlcihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdudW1iZXInO1xufVxuZXhwb3J0cy5pc051bWJlciA9IGlzTnVtYmVyO1xuXG5mdW5jdGlvbiBpc1N0cmluZyhhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnO1xufVxuZXhwb3J0cy5pc1N0cmluZyA9IGlzU3RyaW5nO1xuXG5mdW5jdGlvbiBpc1N5bWJvbChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdzeW1ib2wnO1xufVxuZXhwb3J0cy5pc1N5bWJvbCA9IGlzU3ltYm9sO1xuXG5mdW5jdGlvbiBpc1VuZGVmaW5lZChhcmcpIHtcbiAgcmV0dXJuIGFyZyA9PT0gdm9pZCAwO1xufVxuZXhwb3J0cy5pc1VuZGVmaW5lZCA9IGlzVW5kZWZpbmVkO1xuXG5mdW5jdGlvbiBpc1JlZ0V4cChyZSkge1xuICByZXR1cm4gaXNPYmplY3QocmUpICYmIG9iamVjdFRvU3RyaW5nKHJlKSA9PT0gJ1tvYmplY3QgUmVnRXhwXSc7XG59XG5leHBvcnRzLmlzUmVnRXhwID0gaXNSZWdFeHA7XG5cbmZ1bmN0aW9uIGlzT2JqZWN0KGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ29iamVjdCcgJiYgYXJnICE9PSBudWxsO1xufVxuZXhwb3J0cy5pc09iamVjdCA9IGlzT2JqZWN0O1xuXG5mdW5jdGlvbiBpc0RhdGUoZCkge1xuICByZXR1cm4gaXNPYmplY3QoZCkgJiYgb2JqZWN0VG9TdHJpbmcoZCkgPT09ICdbb2JqZWN0IERhdGVdJztcbn1cbmV4cG9ydHMuaXNEYXRlID0gaXNEYXRlO1xuXG5mdW5jdGlvbiBpc0Vycm9yKGUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGUpICYmXG4gICAgICAob2JqZWN0VG9TdHJpbmcoZSkgPT09ICdbb2JqZWN0IEVycm9yXScgfHwgZSBpbnN0YW5jZW9mIEVycm9yKTtcbn1cbmV4cG9ydHMuaXNFcnJvciA9IGlzRXJyb3I7XG5cbmZ1bmN0aW9uIGlzRnVuY3Rpb24oYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnZnVuY3Rpb24nO1xufVxuZXhwb3J0cy5pc0Z1bmN0aW9uID0gaXNGdW5jdGlvbjtcblxuZnVuY3Rpb24gaXNQcmltaXRpdmUoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGwgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ251bWJlcicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdzdHJpbmcnIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3ltYm9sJyB8fCAgLy8gRVM2IHN5bWJvbFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3VuZGVmaW5lZCc7XG59XG5leHBvcnRzLmlzUHJpbWl0aXZlID0gaXNQcmltaXRpdmU7XG5cbmV4cG9ydHMuaXNCdWZmZXIgPSByZXF1aXJlKCcuL3N1cHBvcnQvaXNCdWZmZXInKTtcblxuZnVuY3Rpb24gb2JqZWN0VG9TdHJpbmcobykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG8pO1xufVxuXG5cbmZ1bmN0aW9uIHBhZChuKSB7XG4gIHJldHVybiBuIDwgMTAgPyAnMCcgKyBuLnRvU3RyaW5nKDEwKSA6IG4udG9TdHJpbmcoMTApO1xufVxuXG5cbnZhciBtb250aHMgPSBbJ0phbicsICdGZWInLCAnTWFyJywgJ0FwcicsICdNYXknLCAnSnVuJywgJ0p1bCcsICdBdWcnLCAnU2VwJyxcbiAgICAgICAgICAgICAgJ09jdCcsICdOb3YnLCAnRGVjJ107XG5cbi8vIDI2IEZlYiAxNjoxOTozNFxuZnVuY3Rpb24gdGltZXN0YW1wKCkge1xuICB2YXIgZCA9IG5ldyBEYXRlKCk7XG4gIHZhciB0aW1lID0gW3BhZChkLmdldEhvdXJzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRNaW51dGVzKCkpLFxuICAgICAgICAgICAgICBwYWQoZC5nZXRTZWNvbmRzKCkpXS5qb2luKCc6Jyk7XG4gIHJldHVybiBbZC5nZXREYXRlKCksIG1vbnRoc1tkLmdldE1vbnRoKCldLCB0aW1lXS5qb2luKCcgJyk7XG59XG5cblxuLy8gbG9nIGlzIGp1c3QgYSB0aGluIHdyYXBwZXIgdG8gY29uc29sZS5sb2cgdGhhdCBwcmVwZW5kcyBhIHRpbWVzdGFtcFxuZXhwb3J0cy5sb2cgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS5sb2coJyVzIC0gJXMnLCB0aW1lc3RhbXAoKSwgZXhwb3J0cy5mb3JtYXQuYXBwbHkoZXhwb3J0cywgYXJndW1lbnRzKSk7XG59O1xuXG5cbi8qKlxuICogSW5oZXJpdCB0aGUgcHJvdG90eXBlIG1ldGhvZHMgZnJvbSBvbmUgY29uc3RydWN0b3IgaW50byBhbm90aGVyLlxuICpcbiAqIFRoZSBGdW5jdGlvbi5wcm90b3R5cGUuaW5oZXJpdHMgZnJvbSBsYW5nLmpzIHJld3JpdHRlbiBhcyBhIHN0YW5kYWxvbmVcbiAqIGZ1bmN0aW9uIChub3Qgb24gRnVuY3Rpb24ucHJvdG90eXBlKS4gTk9URTogSWYgdGhpcyBmaWxlIGlzIHRvIGJlIGxvYWRlZFxuICogZHVyaW5nIGJvb3RzdHJhcHBpbmcgdGhpcyBmdW5jdGlvbiBuZWVkcyB0byBiZSByZXdyaXR0ZW4gdXNpbmcgc29tZSBuYXRpdmVcbiAqIGZ1bmN0aW9ucyBhcyBwcm90b3R5cGUgc2V0dXAgdXNpbmcgbm9ybWFsIEphdmFTY3JpcHQgZG9lcyBub3Qgd29yayBhc1xuICogZXhwZWN0ZWQgZHVyaW5nIGJvb3RzdHJhcHBpbmcgKHNlZSBtaXJyb3IuanMgaW4gcjExNDkwMykuXG4gKlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB3aGljaCBuZWVkcyB0byBpbmhlcml0IHRoZVxuICogICAgIHByb3RvdHlwZS5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IHN1cGVyQ3RvciBDb25zdHJ1Y3RvciBmdW5jdGlvbiB0byBpbmhlcml0IHByb3RvdHlwZSBmcm9tLlxuICovXG5leHBvcnRzLmluaGVyaXRzID0gcmVxdWlyZSgnaW5oZXJpdHMnKTtcblxuZXhwb3J0cy5fZXh0ZW5kID0gZnVuY3Rpb24ob3JpZ2luLCBhZGQpIHtcbiAgLy8gRG9uJ3QgZG8gYW55dGhpbmcgaWYgYWRkIGlzbid0IGFuIG9iamVjdFxuICBpZiAoIWFkZCB8fCAhaXNPYmplY3QoYWRkKSkgcmV0dXJuIG9yaWdpbjtcblxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKGFkZCk7XG4gIHZhciBpID0ga2V5cy5sZW5ndGg7XG4gIHdoaWxlIChpLS0pIHtcbiAgICBvcmlnaW5ba2V5c1tpXV0gPSBhZGRba2V5c1tpXV07XG4gIH1cbiAgcmV0dXJuIG9yaWdpbjtcbn07XG5cbmZ1bmN0aW9uIGhhc093blByb3BlcnR5KG9iaiwgcHJvcCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwgcHJvcCk7XG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpLHR5cGVvZiBzZWxmICE9PSBcInVuZGVmaW5lZFwiID8gc2VsZiA6IHR5cGVvZiB3aW5kb3cgIT09IFwidW5kZWZpbmVkXCIgPyB3aW5kb3cgOiB7fSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgRWxlbWVudCA9IHJlcXVpcmUoJy4vZWxlbWVudCcpLkVsZW1lbnRcblxuZnVuY3Rpb24gRE9NRWxlbWVudChuYW1lLCBhdHRycykge1xuICAgIEVsZW1lbnQuY2FsbCh0aGlzLCBuYW1lLCBhdHRycylcblxuICAgIHRoaXMubm9kZVR5cGUgPSAxXG4gICAgdGhpcy5ub2RlTmFtZSA9IHRoaXMubG9jYWxOYW1lXG59XG5cbnV0aWwuaW5oZXJpdHMoRE9NRWxlbWVudCwgRWxlbWVudClcblxuRE9NRWxlbWVudC5wcm90b3R5cGUuX2dldEVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHZhciBlbGVtZW50ID0gbmV3IERPTUVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgcmV0dXJuIGVsZW1lbnRcbn1cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAnbG9jYWxOYW1lJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXROYW1lKClcbiAgICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICduYW1lc3BhY2VVUkknLCB7XG4gICAgZ2V0OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldE5TKClcbiAgICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICdwYXJlbnROb2RlJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnRcbiAgICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICdjaGlsZE5vZGVzJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5jaGlsZHJlblxuICAgIH1cbn0pXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ3RleHRDb250ZW50Jywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRUZXh0KClcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24gKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuY2hpbGRyZW4ucHVzaCh2YWx1ZSlcbiAgICB9XG59KVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5nZXRFbGVtZW50c0J5VGFnTmFtZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW4obmFtZSlcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUuZ2V0QXR0cmlidXRlID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRBdHRyKG5hbWUpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnNldEF0dHJpYnV0ZSA9IGZ1bmN0aW9uIChuYW1lLCB2YWx1ZSkge1xuICAgIHRoaXMuYXR0cihuYW1lLCB2YWx1ZSlcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUuZ2V0QXR0cmlidXRlTlMgPSBmdW5jdGlvbiAobnMsIG5hbWUpIHtcbiAgICBpZiAobnMgPT09ICdodHRwOi8vd3d3LnczLm9yZy9YTUwvMTk5OC9uYW1lc3BhY2UnKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmdldEF0dHIoWyd4bWwnLCBuYW1lXS5qb2luKCc6JykpXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmdldEF0dHIobmFtZSwgbnMpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnNldEF0dHJpYnV0ZU5TID0gZnVuY3Rpb24gKG5zLCBuYW1lLCB2YWx1ZSkge1xuICAgIHZhciBwcmVmaXhcbiAgICBpZiAobnMgPT09ICdodHRwOi8vd3d3LnczLm9yZy9YTUwvMTk5OC9uYW1lc3BhY2UnKSB7XG4gICAgICAgIHByZWZpeCA9ICd4bWwnXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG5zcyA9IHRoaXMuZ2V0WG1sbnMoKVxuICAgICAgICBwcmVmaXggPSBuc3NbbnNdIHx8ICcnXG4gICAgfVxuICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgdGhpcy5hdHRyKFtwcmVmaXgsIG5hbWVdLmpvaW4oJzonKSwgdmFsdWUpXG4gICAgfVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5yZW1vdmVBdHRyaWJ1dGUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRoaXMuYXR0cihuYW1lLCBudWxsKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5yZW1vdmVBdHRyaWJ1dGVOUyA9IGZ1bmN0aW9uIChucywgbmFtZSkge1xuICAgIHZhciBwcmVmaXhcbiAgICBpZiAobnMgPT09ICdodHRwOi8vd3d3LnczLm9yZy9YTUwvMTk5OC9uYW1lc3BhY2UnKSB7XG4gICAgICAgIHByZWZpeCA9ICd4bWwnXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdmFyIG5zcyA9IHRoaXMuZ2V0WG1sbnMoKVxuICAgICAgICBwcmVmaXggPSBuc3NbbnNdIHx8ICcnXG4gICAgfVxuICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgdGhpcy5hdHRyKFtwcmVmaXgsIG5hbWVdLmpvaW4oJzonKSwgbnVsbClcbiAgICB9XG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmFwcGVuZENoaWxkID0gZnVuY3Rpb24gKGVsKSB7XG4gICAgdGhpcy5jbm9kZShlbClcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlQ2hpbGQgPSBmdW5jdGlvbiAoZWwpIHtcbiAgICB0aGlzLnJlbW92ZShlbClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBET01FbGVtZW50XG4iLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogVGhpcyBjaGVhcCByZXBsaWNhIG9mIERPTS9CdWlsZGVyIHB1dHMgbWUgdG8gc2hhbWUgOi0pXG4gKlxuICogQXR0cmlidXRlcyBhcmUgaW4gdGhlIGVsZW1lbnQuYXR0cnMgb2JqZWN0LiBDaGlsZHJlbiBpcyBhIGxpc3Qgb2ZcbiAqIGVpdGhlciBvdGhlciBFbGVtZW50cyBvciBTdHJpbmdzIGZvciB0ZXh0IGNvbnRlbnQuXG4gKiovXG5mdW5jdGlvbiBFbGVtZW50KG5hbWUsIGF0dHJzKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMucGFyZW50ID0gbnVsbFxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXVxuICAgIHRoaXMuc2V0QXR0cnMoYXR0cnMpXG59XG5cbi8qKiogQWNjZXNzb3JzICoqKi9cblxuLyoqXG4gKiBpZiAoZWxlbWVudC5pcygnbWVzc2FnZScsICdqYWJiZXI6Y2xpZW50JykpIC4uLlxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuaXMgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHJldHVybiAodGhpcy5nZXROYW1lKCkgPT09IG5hbWUpICYmXG4gICAgICAgICgheG1sbnMgfHwgKHRoaXMuZ2V0TlMoKSA9PT0geG1sbnMpKVxufVxuXG4vKiB3aXRob3V0IHByZWZpeCAqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0TmFtZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApXG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUuc3Vic3RyKHRoaXMubmFtZS5pbmRleE9mKCc6JykgKyAxKVxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZVxufVxuXG4vKipcbiAqIHJldHJpZXZlcyB0aGUgbmFtZXNwYWNlIG9mIHRoZSBjdXJyZW50IGVsZW1lbnQsIHVwd2FyZHMgcmVjdXJzaXZlbHlcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldE5TID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMubmFtZS5pbmRleE9mKCc6JykgPj0gMCkge1xuICAgICAgICB2YXIgcHJlZml4ID0gdGhpcy5uYW1lLnN1YnN0cigwLCB0aGlzLm5hbWUuaW5kZXhPZignOicpKVxuICAgICAgICByZXR1cm4gdGhpcy5maW5kTlMocHJlZml4KVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLmZpbmROUygpXG4gICAgfVxufVxuXG4vKipcbiAqIGZpbmQgdGhlIG5hbWVzcGFjZSB0byB0aGUgZ2l2ZW4gcHJlZml4LCB1cHdhcmRzIHJlY3Vyc2l2ZWx5XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5maW5kTlMgPSBmdW5jdGlvbihwcmVmaXgpIHtcbiAgICBpZiAoIXByZWZpeCkge1xuICAgICAgICAvKiBkZWZhdWx0IG5hbWVzcGFjZSAqL1xuICAgICAgICBpZiAodGhpcy5hdHRycy54bWxucylcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmF0dHJzLnhtbG5zXG4gICAgICAgIGVsc2UgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LmZpbmROUygpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgLyogcHJlZml4ZWQgbmFtZXNwYWNlICovXG4gICAgICAgIHZhciBhdHRyID0gJ3htbG5zOicgKyBwcmVmaXhcbiAgICAgICAgaWYgKHRoaXMuYXR0cnNbYXR0cl0pXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRyc1thdHRyXVxuICAgICAgICBlbHNlIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMocHJlZml4KVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZWN1cnNpdmVybHkgZ2V0cyBhbGwgeG1sbnMgZGVmaW5lZCwgaW4gdGhlIGZvcm0gb2Yge3VybDpwcmVmaXh9XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRYbWxucyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuYW1lc3BhY2VzID0ge31cblxuICAgIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgbmFtZXNwYWNlcyA9IHRoaXMucGFyZW50LmdldFhtbG5zKClcblxuICAgIGZvciAodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICB2YXIgbSA9IGF0dHIubWF0Y2goJ3htbG5zOj8oLiopJylcbiAgICAgICAgaWYgKHRoaXMuYXR0cnMuaGFzT3duUHJvcGVydHkoYXR0cikgJiYgbSkge1xuICAgICAgICAgICAgbmFtZXNwYWNlc1t0aGlzLmF0dHJzW2F0dHJdXSA9IG1bMV1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmFtZXNwYWNlc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRycyA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgdGhpcy5hdHRycyA9IHt9XG4gICAgT2JqZWN0LmtleXMoYXR0cnMgfHwge30pLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIHRoaXMuYXR0cnNba2V5XSA9IGF0dHJzW2tleV1cbiAgICB9LCB0aGlzKVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsLCByZXR1cm5zIHRoZSBtYXRjaGluZyBhdHRyaWJ1dGUuXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRBdHRyID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICBpZiAoIXhtbG5zKVxuICAgICAgICByZXR1cm4gdGhpcy5hdHRyc1tuYW1lXVxuXG4gICAgdmFyIG5hbWVzcGFjZXMgPSB0aGlzLmdldFhtbG5zKClcblxuICAgIGlmICghbmFtZXNwYWNlc1t4bWxuc10pXG4gICAgICAgIHJldHVybiBudWxsXG5cbiAgICByZXR1cm4gdGhpcy5hdHRyc1tbbmFtZXNwYWNlc1t4bWxuc10sIG5hbWVdLmpvaW4oJzonKV1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuKG5hbWUsIHhtbG5zKVswXVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbiA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGNoaWxkLmdldE5hbWUgJiZcbiAgICAgICAgICAgIChjaGlsZC5nZXROYW1lKCkgPT09IG5hbWUpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZEJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSlbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbkJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5hdHRycyAmJlxuICAgICAgICAgICAgKGNoaWxkLmF0dHJzW2F0dHJdID09PSB2YWwpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUF0dHIpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHRydWUpKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUpIHJlc3VsdCA9IFtdLmNvbmNhdC5hcHBseShbXSwgcmVzdWx0KVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUZpbHRlciA9IGZ1bmN0aW9uKGZpbHRlciwgcmVjdXJzaXZlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGZpbHRlcihjaGlsZCkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKXtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlGaWx0ZXIoZmlsdGVyLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSB7XG4gICAgICAgIHJlc3VsdCA9IFtdLmNvbmNhdC5hcHBseShbXSwgcmVzdWx0KVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldFRleHQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGV4dCA9ICcnXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKCh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIGNoaWxkID09PSAnbnVtYmVyJykpIHtcbiAgICAgICAgICAgIHRleHQgKz0gY2hpbGRcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGV4dFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZFRleHQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciBjaGlsZCA9IHRoaXMuZ2V0Q2hpbGQobmFtZSwgeG1sbnMpXG4gICAgcmV0dXJuIGNoaWxkID8gY2hpbGQuZ2V0VGV4dCgpIDogbnVsbFxufVxuXG4vKipcbiAqIFJldHVybiBhbGwgZGlyZWN0IGRlc2NlbmRlbnRzIHRoYXQgYXJlIEVsZW1lbnRzLlxuICogVGhpcyBkaWZmZXJzIGZyb20gYGdldENoaWxkcmVuYCBpbiB0aGF0IGl0IHdpbGwgZXhjbHVkZSB0ZXh0IG5vZGVzLFxuICogcHJvY2Vzc2luZyBpbnN0cnVjdGlvbnMsIGV0Yy5cbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRFbGVtZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlGaWx0ZXIoZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudFxuICAgIH0pXG59XG5cbi8qKiogQnVpbGRlciAqKiovXG5cbi8qKiByZXR1cm5zIHVwcGVybW9zdCBwYXJlbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnJvb3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5yb290KClcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzXG59XG5FbGVtZW50LnByb3RvdHlwZS50cmVlID0gRWxlbWVudC5wcm90b3R5cGUucm9vdFxuXG4vKioganVzdCBwYXJlbnQgb3IgaXRzZWxmICovXG5FbGVtZW50LnByb3RvdHlwZS51cCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS5fZ2V0RWxlbWVudCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBuZXcgRWxlbWVudChuYW1lLCBhdHRycylcbiAgICByZXR1cm4gZWxlbWVudFxufVxuXG4vKiogY3JlYXRlIGNoaWxkIG5vZGUgYW5kIHJldHVybiBpdCAqL1xuRWxlbWVudC5wcm90b3R5cGUuYyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgcmV0dXJuIHRoaXMuY25vZGUodGhpcy5fZ2V0RWxlbWVudChuYW1lLCBhdHRycykpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmNub2RlID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2goY2hpbGQpXG4gICAgY2hpbGQucGFyZW50ID0gdGhpc1xuICAgIHJldHVybiBjaGlsZFxufVxuXG4vKiogYWRkIHRleHQgbm9kZSBhbmQgcmV0dXJuIGVsZW1lbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnQgPSBmdW5jdGlvbih0ZXh0KSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKHRleHQpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqKiBNYW5pcHVsYXRpb24gKioqL1xuXG4vKipcbiAqIEVpdGhlcjpcbiAqICAgZWwucmVtb3ZlKGNoaWxkRWwpXG4gKiAgIGVsLnJlbW92ZSgnYXV0aG9yJywgJ3VybjouLi4nKVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihlbCwgeG1sbnMpIHtcbiAgICB2YXIgZmlsdGVyXG4gICAgaWYgKHR5cGVvZiBlbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLyogMXN0IHBhcmFtZXRlciBpcyB0YWcgbmFtZSAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuICEoY2hpbGQuaXMgJiZcbiAgICAgICAgICAgICAgICAgY2hpbGQuaXMoZWwsIHhtbG5zKSlcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgZWxlbWVudCAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICE9PSBlbFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4uZmlsdGVyKGZpbHRlcilcblxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogVG8gdXNlIGluIGNhc2UgeW91IHdhbnQgdGhlIHNhbWUgWE1MIGRhdGEgZm9yIHNlcGFyYXRlIHVzZXMuXG4gKiBQbGVhc2UgcmVmcmFpbiBmcm9tIHRoaXMgcHJhY3Rpc2UgdW5sZXNzIHlvdSBrbm93IHdoYXQgeW91IGFyZVxuICogZG9pbmcuIEJ1aWxkaW5nIFhNTCB3aXRoIGx0eCBpcyBlYXN5IVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbG9uZSA9IHRoaXMuX2dldEVsZW1lbnQodGhpcy5uYW1lLCB0aGlzLmF0dHJzKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGNsb25lLmNub2RlKGNoaWxkLmNsb25lID8gY2hpbGQuY2xvbmUoKSA6IGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gY2xvbmVcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudGV4dCA9IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmICh2YWwgJiYgdGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlblswXSA9IHZhbFxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXRUZXh0KClcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCkge1xuICAgIGlmICgoKHR5cGVvZiB2YWwgIT09ICd1bmRlZmluZWQnKSB8fCAodmFsID09PSBudWxsKSkpIHtcbiAgICAgICAgaWYgKCF0aGlzLmF0dHJzKSB7XG4gICAgICAgICAgICB0aGlzLmF0dHJzID0ge31cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmF0dHJzW2F0dHJdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG59XG5cbi8qKiogU2VyaWFsaXphdGlvbiAqKiovXG5cbkVsZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHMgPSAnJ1xuICAgIHRoaXMud3JpdGUoZnVuY3Rpb24oYykge1xuICAgICAgICBzICs9IGNcbiAgICB9KVxuICAgIHJldHVybiBzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgYXR0cnM6IHRoaXMuYXR0cnMsXG4gICAgICAgIGNoaWxkcmVuOiB0aGlzLmNoaWxkcmVuLm1hcChmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICYmIGNoaWxkLnRvSlNPTiA/IGNoaWxkLnRvSlNPTigpIDogY2hpbGRcbiAgICAgICAgfSlcbiAgICB9XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLl9hZGRDaGlsZHJlbiA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPicpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgLyogU2tpcCBudWxsL3VuZGVmaW5lZCAqL1xuICAgICAgICBpZiAoY2hpbGQgfHwgKGNoaWxkID09PSAwKSkge1xuICAgICAgICAgICAgaWYgKGNoaWxkLndyaXRlKSB7XG4gICAgICAgICAgICAgICAgY2hpbGQud3JpdGUod3JpdGVyKVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbFRleHQoY2hpbGQpKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaGlsZC50b1N0cmluZykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkLnRvU3RyaW5nKDEwKSkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgd3JpdGVyKCc8LycpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICB3cml0ZXIoJz4nKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPCcpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzLmF0dHJzW2tdXG4gICAgICAgIGlmICh2IHx8ICh2ID09PSAnJykgfHwgKHYgPT09IDApKSB7XG4gICAgICAgICAgICB3cml0ZXIoJyAnKVxuICAgICAgICAgICAgd3JpdGVyKGspXG4gICAgICAgICAgICB3cml0ZXIoJz1cIicpXG4gICAgICAgICAgICBpZiAodHlwZW9mIHYgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdiA9IHYudG9TdHJpbmcoMTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sKHYpKVxuICAgICAgICAgICAgd3JpdGVyKCdcIicpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHdyaXRlcignLz4nKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2FkZENoaWxkcmVuKHdyaXRlcilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJi9nLCAnJmFtcDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPC9nLCAnJmx0OycpLlxuICAgICAgICByZXBsYWNlKC8+L2csICcmZ3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmcXVvdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvXCIvZywgJyZhcG9zOycpXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbFRleHQocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpXG59XG5cbmV4cG9ydHMuRWxlbWVudCA9IEVsZW1lbnRcbmV4cG9ydHMuZXNjYXBlWG1sID0gZXNjYXBlWG1sXG4iLCIndXNlIHN0cmljdCc7XG5cbi8qIENhdXNlIGJyb3dzZXJpZnkgdG8gYnVuZGxlIFNBWCBwYXJzZXJzOiAqL1xudmFyIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZScpXG5cbnBhcnNlLmF2YWlsYWJsZVNheFBhcnNlcnMucHVzaChwYXJzZS5iZXN0U2F4UGFyc2VyID0gcmVxdWlyZSgnLi9zYXgvc2F4X2x0eCcpKVxuXG4vKiBTSElNICovXG5tb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vaW5kZXgnKSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHBhcnNlID0gcmVxdWlyZSgnLi9wYXJzZScpXG5cbi8qKlxuICogVGhlIG9ubHkgKHJlbGV2YW50KSBkYXRhIHN0cnVjdHVyZVxuICovXG5leHBvcnRzLkVsZW1lbnQgPSByZXF1aXJlKCcuL2RvbS1lbGVtZW50JylcblxuLyoqXG4gKiBIZWxwZXJcbiAqL1xuZXhwb3J0cy5lc2NhcGVYbWwgPSByZXF1aXJlKCcuL2VsZW1lbnQnKS5lc2NhcGVYbWxcblxuLyoqXG4gKiBET00gcGFyc2VyIGludGVyZmFjZVxuICovXG5leHBvcnRzLnBhcnNlID0gcGFyc2UucGFyc2VcbmV4cG9ydHMuUGFyc2VyID0gcGFyc2UuUGFyc2VyXG5cbi8qKlxuICogU0FYIHBhcnNlciBpbnRlcmZhY2VcbiAqL1xuZXhwb3J0cy5hdmFpbGFibGVTYXhQYXJzZXJzID0gcGFyc2UuYXZhaWxhYmxlU2F4UGFyc2Vyc1xuZXhwb3J0cy5iZXN0U2F4UGFyc2VyID0gcGFyc2UuYmVzdFNheFBhcnNlclxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJylcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgRE9NRWxlbWVudCA9IHJlcXVpcmUoJy4vZG9tLWVsZW1lbnQnKVxuXG5cbmV4cG9ydHMuYXZhaWxhYmxlU2F4UGFyc2VycyA9IFtdXG5leHBvcnRzLmJlc3RTYXhQYXJzZXIgPSBudWxsXG5cbnZhciBzYXhQYXJzZXJzID0gW1xuICAgICcuL3NheC9zYXhfZXhwYXQuanMnLFxuICAgICcuL3NheC9zYXhfbHR4LmpzJyxcbiAgICAvKicuL3NheF9lYXN5c2F4LmpzJywgJy4vc2F4X25vZGUteG1sLmpzJywqL1xuICAgICcuL3NheC9zYXhfc2F4anMuanMnXG5dXG5cbnNheFBhcnNlcnMuZm9yRWFjaChmdW5jdGlvbihtb2ROYW1lKSB7XG4gICAgdmFyIG1vZFxuICAgIHRyeSB7XG4gICAgICAgIG1vZCA9IHJlcXVpcmUobW9kTmFtZSlcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIC8qIFNpbGVudGx5IG1pc3NpbmcgbGlicmFyaWVzIGRyb3AgZm9yIGRlYnVnOlxuICAgICAgICBjb25zb2xlLmVycm9yKGUuc3RhY2sgfHwgZSlcbiAgICAgICAgICovXG4gICAgfVxuICAgIGlmIChtb2QpIHtcbiAgICAgICAgZXhwb3J0cy5hdmFpbGFibGVTYXhQYXJzZXJzLnB1c2gobW9kKVxuICAgICAgICBpZiAoIWV4cG9ydHMuYmVzdFNheFBhcnNlcikge1xuICAgICAgICAgICAgZXhwb3J0cy5iZXN0U2F4UGFyc2VyID0gbW9kXG4gICAgICAgIH1cbiAgICB9XG59KVxuXG5leHBvcnRzLlBhcnNlciA9IGZ1bmN0aW9uKHNheFBhcnNlcikge1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuICAgIHZhciBzZWxmID0gdGhpc1xuXG4gICAgdmFyIFBhcnNlck1vZCA9IHNheFBhcnNlciB8fCBleHBvcnRzLmJlc3RTYXhQYXJzZXJcbiAgICBpZiAoIVBhcnNlck1vZCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIFNBWCBwYXJzZXIgYXZhaWxhYmxlJylcbiAgICB9XG4gICAgdGhpcy5wYXJzZXIgPSBuZXcgUGFyc2VyTW9kKClcblxuICAgIHZhciBlbFxuICAgIHRoaXMucGFyc2VyLmFkZExpc3RlbmVyKCdzdGFydEVsZW1lbnQnLCBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgICAgICB2YXIgY2hpbGQgPSBuZXcgRE9NRWxlbWVudChuYW1lLCBhdHRycylcbiAgICAgICAgaWYgKCFlbCkge1xuICAgICAgICAgICAgZWwgPSBjaGlsZFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZWwgPSBlbC5jbm9kZShjaGlsZClcbiAgICAgICAgfVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIuYWRkTGlzdGVuZXIoJ2VuZEVsZW1lbnQnLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIC8qIGpzaGludCAtVzAzNSAqL1xuICAgICAgICBpZiAoIWVsKSB7XG4gICAgICAgICAgICAvKiBFcnIgKi9cbiAgICAgICAgfSBlbHNlIGlmIChuYW1lID09PSBlbC5uYW1lKSB7XG4gICAgICAgICAgICBpZiAoZWwucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgZWwgPSBlbC5wYXJlbnRcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIXNlbGYudHJlZSkge1xuICAgICAgICAgICAgICAgIHNlbGYudHJlZSA9IGVsXG4gICAgICAgICAgICAgICAgZWwgPSB1bmRlZmluZWRcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICAvKiBqc2hpbnQgK1cwMzUgKi9cbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLmFkZExpc3RlbmVyKCd0ZXh0JywgZnVuY3Rpb24oc3RyKSB7XG4gICAgICAgIGlmIChlbCkge1xuICAgICAgICAgICAgZWwudChzdHIpXG4gICAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLmFkZExpc3RlbmVyKCdlcnJvcicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgc2VsZi5lcnJvciA9IGVcbiAgICAgICAgc2VsZi5lbWl0KCdlcnJvcicsIGUpXG4gICAgfSlcbn1cblxudXRpbC5pbmhlcml0cyhleHBvcnRzLlBhcnNlciwgZXZlbnRzLkV2ZW50RW1pdHRlcilcblxuZXhwb3J0cy5QYXJzZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIHRoaXMucGFyc2VyLndyaXRlKGRhdGEpXG59XG5cbmV4cG9ydHMuUGFyc2VyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgdGhpcy5wYXJzZXIuZW5kKGRhdGEpXG5cbiAgICBpZiAoIXRoaXMuZXJyb3IpIHtcbiAgICAgICAgaWYgKHRoaXMudHJlZSkge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCd0cmVlJywgdGhpcy50cmVlKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignSW5jb21wbGV0ZSBkb2N1bWVudCcpKVxuICAgICAgICB9XG4gICAgfVxufVxuXG5leHBvcnRzLnBhcnNlID0gZnVuY3Rpb24oZGF0YSwgc2F4UGFyc2VyKSB7XG4gICAgdmFyIHAgPSBuZXcgZXhwb3J0cy5QYXJzZXIoc2F4UGFyc2VyKVxuICAgIHZhciByZXN1bHQgPSBudWxsXG4gICAgICAsIGVycm9yID0gbnVsbFxuXG4gICAgcC5vbigndHJlZScsIGZ1bmN0aW9uKHRyZWUpIHtcbiAgICAgICAgcmVzdWx0ID0gdHJlZVxuICAgIH0pXG4gICAgcC5vbignZXJyb3InLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIGVycm9yID0gZVxuICAgIH0pXG5cbiAgICBwLndyaXRlKGRhdGEpXG4gICAgcC5lbmQoKVxuXG4gICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHRocm93IGVycm9yXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHJlc3VsdFxuICAgIH1cbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKVxuXG52YXIgU1RBVEVfVEVYVCA9IDAsXG4gICAgU1RBVEVfSUdOT1JFX1RBRyA9IDEsXG4gICAgU1RBVEVfVEFHX05BTUUgPSAyLFxuICAgIFNUQVRFX1RBRyA9IDMsXG4gICAgU1RBVEVfQVRUUl9OQU1FID0gNCxcbiAgICBTVEFURV9BVFRSX0VRID0gNSxcbiAgICBTVEFURV9BVFRSX1FVT1QgPSA2LFxuICAgIFNUQVRFX0FUVFJfVkFMVUUgPSA3XG5cbnZhciBTYXhMdHggPSBtb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIFNheEx0eCgpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHZhciBzdGF0ZSA9IFNUQVRFX1RFWFQsIHJlbWFpbmRlclxuICAgIHZhciB0YWdOYW1lLCBhdHRycywgZW5kVGFnLCBzZWxmQ2xvc2luZywgYXR0clF1b3RlXG4gICAgdmFyIHJlY29yZFN0YXJ0ID0gMFxuICAgIHZhciBhdHRyTmFtZVxuXG4gICAgdGhpcy5faGFuZGxlVGFnT3BlbmluZyA9IGZ1bmN0aW9uKGVuZFRhZywgdGFnTmFtZSwgYXR0cnMpIHtcbiAgICAgICAgaWYgKCFlbmRUYWcpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnc3RhcnRFbGVtZW50JywgdGFnTmFtZSwgYXR0cnMpXG4gICAgICAgICAgICBpZiAoc2VsZkNsb3NpbmcpIHtcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ2VuZEVsZW1lbnQnLCB0YWdOYW1lKVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCdlbmRFbGVtZW50JywgdGFnTmFtZSlcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMud3JpdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgICAgIC8qIGpzaGludCAtVzA3MSAqL1xuICAgICAgICAvKiBqc2hpbnQgLVcwNzQgKi9cbiAgICAgICAgaWYgKHR5cGVvZiBkYXRhICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGF0YSA9IGRhdGEudG9TdHJpbmcoKVxuICAgICAgICB9XG4gICAgICAgIHZhciBwb3MgPSAwXG5cbiAgICAgICAgLyogQW55dGhpbmcgZnJvbSBwcmV2aW91cyB3cml0ZSgpPyAqL1xuICAgICAgICBpZiAocmVtYWluZGVyKSB7XG4gICAgICAgICAgICBkYXRhID0gcmVtYWluZGVyICsgZGF0YVxuICAgICAgICAgICAgcG9zICs9IHJlbWFpbmRlci5sZW5ndGhcbiAgICAgICAgICAgIHJlbWFpbmRlciA9IG51bGxcbiAgICAgICAgfVxuXG4gICAgICAgIGZ1bmN0aW9uIGVuZFJlY29yZGluZygpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgcmVjb3JkU3RhcnQgPT09ICdudW1iZXInKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlY29yZGVkID0gZGF0YS5zbGljZShyZWNvcmRTdGFydCwgcG9zKVxuICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlY29yZGVkXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IoOyBwb3MgPCBkYXRhLmxlbmd0aDsgcG9zKyspIHtcbiAgICAgICAgICAgIHZhciBjID0gZGF0YS5jaGFyQ29kZUF0KHBvcylcbiAgICAgICAgICAgIC8vY29uc29sZS5sb2coXCJzdGF0ZVwiLCBzdGF0ZSwgXCJjXCIsIGMsIGRhdGFbcG9zXSlcbiAgICAgICAgICAgIHN3aXRjaChzdGF0ZSkge1xuICAgICAgICAgICAgY2FzZSBTVEFURV9URVhUOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA2MCAvKiA8ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciB0ZXh0ID0gZW5kUmVjb3JkaW5nKClcbiAgICAgICAgICAgICAgICAgICAgaWYgKHRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgndGV4dCcsIHVuZXNjYXBlWG1sKHRleHQpKVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEFHX05BTUVcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzID0ge31cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfVEFHX05BTUU6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDQ3IC8qIC8gKi8gJiYgcmVjb3JkU3RhcnQgPT09IHBvcykge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHBvcyArIDFcbiAgICAgICAgICAgICAgICAgICAgZW5kVGFnID0gdHJ1ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gMzMgLyogISAqLyB8fCBjID09PSA2MyAvKiA/ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfSUdOT1JFX1RBR1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA8PSAzMiB8fCBjID09PSA0NyAvKiAvICovIHx8IGMgPT09IDYyIC8qID4gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGFnTmFtZSA9IGVuZFJlY29yZGluZygpXG4gICAgICAgICAgICAgICAgICAgIHBvcy0tXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEFHXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0lHTk9SRV9UQUc6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYyIC8qID4gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9URVhUXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX1RBRzpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNjIgLyogPiAqLykge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9oYW5kbGVUYWdPcGVuaW5nKGVuZFRhZywgdGFnTmFtZSwgYXR0cnMpXG4gICAgICAgICAgICAgICAgICAgIHRhZ05hbWUgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgYXR0cnMgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgZW5kVGFnID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHNlbGZDbG9zaW5nID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEVYVFxuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHBvcyArIDFcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09IDQ3IC8qIC8gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZkNsb3NpbmcgPSB0cnVlXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID4gMzIpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3NcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX05BTUVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfQVRUUl9OQU1FOlxuICAgICAgICAgICAgICAgIGlmIChjIDw9IDMyIHx8IGMgPT09IDYxIC8qID0gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgYXR0ck5hbWUgPSBlbmRSZWNvcmRpbmcoKVxuICAgICAgICAgICAgICAgICAgICBwb3MtLVxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0FUVFJfRVFcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfQVRUUl9FUTpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNjEgLyogPSAqLykge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0FUVFJfUVVPVFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9BVFRSX1FVT1Q6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDM0IC8qIFwiICovIHx8IGMgPT09IDM5IC8qICcgKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgYXR0clF1b3RlID0gY1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0FUVFJfVkFMVUVcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfVkFMVUU6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IGF0dHJRdW90ZSkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSB1bmVzY2FwZVhtbChlbmRSZWNvcmRpbmcoKSlcbiAgICAgICAgICAgICAgICAgICAgYXR0cnNbYXR0ck5hbWVdID0gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgYXR0ck5hbWUgPSB1bmRlZmluZWRcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9UQUdcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2YgcmVjb3JkU3RhcnQgPT09ICdudW1iZXInICYmXG4gICAgICAgICAgICByZWNvcmRTdGFydCA8PSBkYXRhLmxlbmd0aCkge1xuXG4gICAgICAgICAgICByZW1haW5kZXIgPSBkYXRhLnNsaWNlKHJlY29yZFN0YXJ0KVxuICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSAwXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKnZhciBvcmlnRW1pdCA9IHRoaXMuZW1pdFxuICAgIHRoaXMuZW1pdCA9IGZ1bmN0aW9uKCkge1xuICAgIGNvbnNvbGUubG9nKCdsdHgnLCBhcmd1bWVudHMpXG4gICAgb3JpZ0VtaXQuYXBwbHkodGhpcywgYXJndW1lbnRzKVxuICAgIH0qL1xufVxudXRpbC5pbmhlcml0cyhTYXhMdHgsIGV2ZW50cy5FdmVudEVtaXR0ZXIpXG5cblxuU2F4THR4LnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgdGhpcy53cml0ZShkYXRhKVxuICAgIH1cblxuICAgIC8qIFVoLCB5ZWFoICovXG4gICAgdGhpcy53cml0ZSA9IGZ1bmN0aW9uKCkge31cbn1cblxuZnVuY3Rpb24gdW5lc2NhcGVYbWwocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYoYW1wfCMzOCk7L2csICcmJykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihsdHwjNjApOy9nLCAnPCcpLlxuICAgICAgICByZXBsYWNlKC9cXCYoZ3R8IzYyKTsvZywgJz4nKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKHF1b3R8IzM0KTsvZywgJ1wiJykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihhcG9zfCMzOSk7L2csICdcXCcnKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKG5ic3B8IzE2MCk7L2csICdcXG4nKVxufVxuIiwiKGZ1bmN0aW9uIChfX2Rpcm5hbWUpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgU2Vzc2lvbiA9IHJlcXVpcmUoJy4vbGliL3Nlc3Npb24nKVxuICAsIENvbm5lY3Rpb24gPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLkNvbm5lY3Rpb25cbiAgLCBKSUQgPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLkpJRFxuICAsIFN0YW56YSA9IHJlcXVpcmUgKCdub2RlLXhtcHAtY29yZScpLlN0YW56YVxuICAsIHNhc2wgPSByZXF1aXJlKCcuL2xpYi9zYXNsJylcbiAgLCBBbm9ueW1vdXMgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9hbm9ueW1vdXMnKVxuICAsIFBsYWluID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24vcGxhaW4nKVxuICAsIERpZ2VzdE1ENSA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL2RpZ2VzdG1kNScpXG4gICwgWE9BdXRoMiA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL3hvYXV0aDInKVxuICAsIFhGYWNlYm9va1BsYXRmb3JtID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24veGZhY2Vib29rJylcbiAgLCBFeHRlcm5hbCA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL2V4dGVybmFsJylcbiAgLCBleGVjID0gcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWNcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCd4bXBwOmNsaWVudCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5sdHhcblxudmFyIE5TX0NMSUVOVCA9ICdqYWJiZXI6Y2xpZW50J1xudmFyIE5TX1JFR0lTVEVSID0gJ2phYmJlcjppcTpyZWdpc3RlcidcbnZhciBOU19YTVBQX1NBU0wgPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLXNhc2wnXG52YXIgTlNfWE1QUF9CSU5EID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1iaW5kJ1xudmFyIE5TX1hNUFBfU0VTU0lPTiA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtc2Vzc2lvbidcblxudmFyIFNUQVRFX1BSRUFVVEggPSAwXG4gICwgU1RBVEVfQVVUSCA9IDFcbiAgLCBTVEFURV9BVVRIRUQgPSAyXG4gICwgU1RBVEVfQklORCA9IDNcbiAgLCBTVEFURV9TRVNTSU9OID0gNFxuICAsIFNUQVRFX09OTElORSA9IDVcblxudmFyIElRSURfU0VTU0lPTiA9ICdzZXNzJ1xuICAsIElRSURfQklORCA9ICdiaW5kJ1xuXG4vKiBqc2hpbnQgbGF0ZWRlZjogZmFsc2UgKi9cbi8qIGpzaGludCAtVzA3OSAqL1xuLyoganNoaW50IC1XMDIwICovXG52YXIgZGVjb2RlNjQsIGVuY29kZTY0LCBCdWZmZXJcbmlmICh0eXBlb2YgYnRvYSA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICB2YXIgYnRvYSA9IG51bGxcbiAgICB2YXIgYXRvYiA9IG51bGxcbn1cblxuaWYgKHR5cGVvZiBidG9hID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZGVjb2RlNjQgPSBmdW5jdGlvbihlbmNvZGVkKSB7XG4gICAgICAgIHJldHVybiBhdG9iKGVuY29kZWQpXG4gICAgfVxufSBlbHNlIHtcbiAgICBCdWZmZXIgPSByZXF1aXJlKCdidWZmZXInKS5CdWZmZXJcbiAgICBkZWNvZGU2NCA9IGZ1bmN0aW9uKGVuY29kZWQpIHtcbiAgICAgICAgcmV0dXJuIChuZXcgQnVmZmVyKGVuY29kZWQsICdiYXNlNjQnKSkudG9TdHJpbmcoJ3V0ZjgnKVxuICAgIH1cbn1cbmlmICh0eXBlb2YgYXRvYiA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGVuY29kZTY0ID0gZnVuY3Rpb24oZGVjb2RlZCkge1xuICAgICAgICByZXR1cm4gYnRvYShkZWNvZGVkKVxuICAgIH1cbn0gZWxzZSB7XG4gICAgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyXG4gICAgZW5jb2RlNjQgPSBmdW5jdGlvbihkZWNvZGVkKSB7XG4gICAgICAgIHJldHVybiAobmV3IEJ1ZmZlcihkZWNvZGVkLCAndXRmOCcpKS50b1N0cmluZygnYmFzZTY0JylcbiAgICB9XG59XG5cbi8qKlxuICogcGFyYW1zIG9iamVjdDpcbiAqICAgamlkOiBTdHJpbmcgKHJlcXVpcmVkKVxuICogICBwYXNzd29yZDogU3RyaW5nIChyZXF1aXJlZClcbiAqICAgaG9zdDogU3RyaW5nIChvcHRpb25hbClcbiAqICAgcG9ydDogTnVtYmVyIChvcHRpb25hbClcbiAqICAgcmVjb25uZWN0OiBCb29sZWFuIChvcHRpb25hbClcbiAqICAgYXV0b3N0YXJ0OiBCb29sZWFuIChvcHRpb25hbCkgLSBpZiB3ZSBzdGFydCBjb25uZWN0aW5nIHRvIGEgZ2l2ZW4gcG9ydFxuICogICByZWdpc3RlcjogQm9vbGVhbiAob3B0aW9uKSAtIHJlZ2lzdGVyIGFjY291bnQgYmVmb3JlIGF1dGhlbnRpY2F0aW9uXG4gKiAgIGxlZ2FjeVNTTDogQm9vbGVhbiAob3B0aW9uYWwpIC0gY29ubmVjdCB0byB0aGUgbGVnYWN5IFNTTCBwb3J0LCByZXF1aXJlcyBhdCBsZWFzdCB0aGUgaG9zdCB0byBiZSBzcGVjaWZpZWRcbiAqICAgY3JlZGVudGlhbHM6IERpY3Rpb25hcnkgKG9wdGlvbmFsKSAtIFRMUyBvciBTU0wga2V5IGFuZCBjZXJ0aWZpY2F0ZSBjcmVkZW50aWFsc1xuICogICBhY3RBczogU3RyaW5nIChvcHRpb25hbCkgLSBpZiBhZG1pbiB1c2VyIGFjdCBvbiBiZWhhbGYgb2YgYW5vdGhlciB1c2VyIChqdXN0IHVzZXIpXG4gKiAgIGRpc2FsbG93VExTOiBCb29sZWFuIChvcHRpb25hbCkgLSBwcmV2ZW50IHVwZ3JhZGluZyB0aGUgY29ubmVjdGlvbiB0byBhIHNlY3VyZSBvbmUgdmlhIFRMU1xuICogICBwcmVmZXJyZWQ6IFN0cmluZyAob3B0aW9uYWwpIC0gUHJlZmVycmVkIFNBU0wgbWVjaGFuaXNtIHRvIHVzZVxuICogICBib3NoLnVybDogU3RyaW5nIChvcHRpb25hbCkgLSBCT1NIIGVuZHBvaW50IHRvIHVzZVxuICogICBib3NoLnByZWJpbmQ6IEZ1bmN0aW9uKGVycm9yLCBkYXRhKSAob3B0aW9uYWwpIC0gSnVzdCBwcmViaW5kIGEgbmV3IEJPU0ggc2Vzc2lvbiBmb3IgYnJvd3NlciBjbGllbnQgdXNlXG4gKiAgICAgICAgICAgIGVycm9yIFN0cmluZyAtIFJlc3VsdCBvZiBYTVBQIGVycm9yLiBFeCA6IFtFcnJvcjogWE1QUCBhdXRoZW50aWNhdGlvbiBmYWlsdXJlXVxuICogICAgICAgICAgICBkYXRhIE9iamVjdCAtIFJlc3VsdCBvZiBYTVBQIEJPU0ggY29ubmVjdGlvbi5cbiAqXG4gKiBFeGFtcGxlczpcbiAqICAgdmFyIGNsID0gbmV3IHhtcHAuQ2xpZW50KHtcbiAqICAgICAgIGppZDogXCJtZUBleGFtcGxlLmNvbVwiLFxuICogICAgICAgcGFzc3dvcmQ6IFwic2VjcmV0XCJcbiAqICAgfSlcbiAqICAgdmFyIGZhY2Vib29rID0gbmV3IHhtcHAuQ2xpZW50KHtcbiAqICAgICAgIGppZDogJy0nICsgZmJVSUQgKyAnQGNoYXQuZmFjZWJvb2suY29tJyxcbiAqICAgICAgIGFwaV9rZXk6ICc1NDMyMScsIC8vIGFwaSBrZXkgb2YgeW91ciBmYWNlYm9vayBhcHBcbiAqICAgICAgIGFjY2Vzc190b2tlbjogJ2FiY2RlZmcnLCAvLyB1c2VyIGFjY2VzcyB0b2tlblxuICogICAgICAgaG9zdDogJ2NoYXQuZmFjZWJvb2suY29tJ1xuICogICB9KVxuICogICB2YXIgZ3RhbGsgPSBuZXcgeG1wcC5DbGllbnQoe1xuICogICAgICAgamlkOiAnbWVAZ21haWwuY29tJyxcbiAqICAgICAgIG9hdXRoMl90b2tlbjogJ3h4eHgueHh4eHh4eHh4eHgnLCAvLyBmcm9tIE9BdXRoMlxuICogICAgICAgb2F1dGgyX2F1dGg6ICdodHRwOi8vd3d3Lmdvb2dsZS5jb20vdGFsay9wcm90b2NvbC9hdXRoJyxcbiAqICAgICAgIGhvc3Q6ICd0YWxrLmdvb2dsZS5jb20nXG4gKiAgIH0pXG4gKiAgIHZhciBwcmViaW5kID0gbmV3IHhtcHAuQ2xpZW50KHtcbiAqICAgICAgIGppZDogXCJtZUBleGFtcGxlLmNvbVwiLFxuICogICAgICAgcGFzc3dvcmQ6IFwic2VjcmV0XCIsXG4gKiAgICAgICBib3NoOiB7XG4gKiAgICAgICAgICAgdXJsOiBcImh0dHA6Ly9leGFtcGxlLmNvbS9odHRwLWJpbmRcIixcbiAqICAgICAgICAgICBwcmViaW5kOiBmdW5jdGlvbihlcnJvciwgZGF0YSkge1xuICogICAgICAgICAgICAgICBpZiAoZXJyb3IpIHt9XG4gKiAgICAgICAgICAgICAgIHJlcy5zZW5kKHsgcmlkOiBkYXRhLnJpZCwgc2lkOiBkYXRhLnNpZCB9KVxuICogICAgICAgICAgIH1cbiAqICAgICAgIH1cbiAqICAgfSlcbiAqXG4gKiBFeGFtcGxlIFNBU0wgRVhURVJOQUw6XG4gKlxuICogdmFyIG15Q3JlZGVudGlhbHMgPSB7XG4gKiAgIC8vIFRoZXNlIGFyZSBuZWNlc3Nhcnkgb25seSBpZiB1c2luZyB0aGUgY2xpZW50IGNlcnRpZmljYXRlIGF1dGhlbnRpY2F0aW9uXG4gKiAgIGtleTogZnMucmVhZEZpbGVTeW5jKCdrZXkucGVtJyksXG4gKiAgIGNlcnQ6IGZzLnJlYWRGaWxlU3luYygnY2VydC5wZW0nKSxcbiAqICAgLy8gcGFzc3BocmFzZTogJ29wdGlvbmFsJ1xuICogfVxuICogdmFyIGNsID0gbmV3IHhtcHBDbGllbnQoe1xuICogICAgIGppZDogXCJtZUBleGFtcGxlLmNvbVwiLFxuICogICAgIGNyZWRlbnRpYWxzOiBteUNyZWRlbnRpYWxzXG4gKiAgICAgcHJlZmVycmVkOiAnRVhURVJOQUwnIC8vIG5vdCByZWFsbHkgcmVxdWlyZWQsIGJ1dCBwb3NzaWJsZVxuICogfSlcbiAqXG4gKi9cbmZ1bmN0aW9uIENsaWVudChvcHRpb25zKSB7XG4gICAgdGhpcy5vcHRpb25zID0ge31cbiAgICBpZiAob3B0aW9ucykgdGhpcy5vcHRpb25zID0gb3B0aW9uc1xuICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMgPSBbXG4gICAgICAgIFhPQXV0aDIsIFhGYWNlYm9va1BsYXRmb3JtLCBFeHRlcm5hbCwgRGlnZXN0TUQ1LCBQbGFpbiwgQW5vbnltb3VzXG4gICAgXVxuXG4gICAgaWYgKHRoaXMub3B0aW9ucy5hdXRvc3RhcnQgIT09IGZhbHNlKVxuICAgICAgICB0aGlzLmNvbm5lY3QoKVxufVxuXG51dGlsLmluaGVyaXRzKENsaWVudCwgU2Vzc2lvbilcblxuQ2xpZW50Lk5TX0NMSUVOVCA9IE5TX0NMSUVOVFxuXG5DbGllbnQucHJvdG90eXBlLmNvbm5lY3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5vcHRpb25zLmJvc2ggJiYgdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZCkge1xuICAgICAgICBkZWJ1ZygnbG9hZCBib3NoIHByZWJpbmQnKVxuICAgICAgICB2YXIgY2IgPSB0aGlzLm9wdGlvbnMuYm9zaC5wcmViaW5kXG4gICAgICAgIGRlbGV0ZSB0aGlzLm9wdGlvbnMuYm9zaC5wcmViaW5kXG4gICAgICAgIHZhciBjbWQgPSAnbm9kZSAnICsgX19kaXJuYW1lICtcbiAgICAgICAgICAgICcvbGliL3ByZWJpbmQuanMgJ1xuICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZFxuICAgICAgICBjbWQgKz0gZW5jb2RlVVJJKEpTT04uc3RyaW5naWZ5KHRoaXMub3B0aW9ucykpXG4gICAgICAgIGV4ZWMoXG4gICAgICAgICAgICBjbWQsXG4gICAgICAgICAgICBmdW5jdGlvbiAoZXJyb3IsIHN0ZG91dCwgc3RkZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKGVycm9yLCBudWxsKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciByID0gc3Rkb3V0Lm1hdGNoKC9yaWQ6K1sgMC05XSovaSlcbiAgICAgICAgICAgICAgICAgICAgciA9IChyWzBdLnNwbGl0KCc6JykpWzFdLnRyaW0oKVxuICAgICAgICAgICAgICAgICAgICB2YXIgcyA9IHN0ZG91dC5tYXRjaCgvc2lkOitbIGEteisnXCItX0EtWiswLTldKi9pKVxuICAgICAgICAgICAgICAgICAgICBzID0gKHNbMF0uc3BsaXQoJzonKSlbMV1cbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKCdcXCcnLCcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnJlcGxhY2UoJ1xcJycsJycpXG4gICAgICAgICAgICAgICAgICAgICAgICAudHJpbSgpXG4gICAgICAgICAgICAgICAgICAgIGlmIChyICYmIHMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBjYihudWxsLCB7IHJpZDogciwgc2lkOiBzIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2Ioc3RkZXJyKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMub3B0aW9ucy54bWxucyA9IE5TX0NMSUVOVFxuICAgICAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgICAgICBkZWxldGUgdGhpcy5kaWRfYmluZFxuICAgICAgICBkZWxldGUgdGhpcy5kaWRfc2Vzc2lvblxuXG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QUkVBVVRIXG4gICAgICAgIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BSRUFVVEhcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9iaW5kXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfc2Vzc2lvblxuICAgICAgICB9KVxuXG4gICAgICAgIFNlc3Npb24uY2FsbCh0aGlzLCB0aGlzLm9wdGlvbnMpXG4gICAgICAgIHRoaXMub3B0aW9ucy5qaWQgPSB0aGlzLmppZFxuXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5vbignZGlzY29ubmVjdCcsIGZ1bmN0aW9uKGVycm9yKSB7XG4gICAgICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfUFJFQVVUSFxuICAgICAgICAgICAgaWYgKCF0aGlzLmNvbm5lY3Rpb24ucmVjb25uZWN0KSB7XG4gICAgICAgICAgICAgICAgaWYgKGVycm9yKSB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyb3IpXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdvZmZsaW5lJylcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLmRpZF9iaW5kXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfc2Vzc2lvblxuICAgICAgICB9LmJpbmQodGhpcykpXG5cbiAgICAgICAgLy8gSWYgc2VydmVyIGFuZCBjbGllbnQgaGF2ZSBtdWx0aXBsZSBwb3NzaWJsZSBhdXRoIG1lY2hhbmlzbXNcbiAgICAgICAgLy8gd2UgdHJ5IHRvIHNlbGVjdCB0aGUgcHJlZmVycmVkIG9uZVxuICAgICAgICBpZiAodGhpcy5vcHRpb25zLnByZWZlcnJlZCkge1xuICAgICAgICAgICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtID0gdGhpcy5vcHRpb25zLnByZWZlcnJlZFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtID0gJ0RJR0VTVC1NRDUnXG4gICAgICAgIH1cblxuICAgICAgICB2YXIgbWVjaHMgPSBzYXNsLmRldGVjdE1lY2hhbmlzbXModGhpcy5vcHRpb25zLCB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zKVxuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zID0gbWVjaHNcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICAvKiBBY3R1YWxseSwgd2Ugc2hvdWxkbid0IHdhaXQgZm9yIDxzdHJlYW06ZmVhdHVyZXMvPiBpZlxuICAgICAgIHRoaXMuc3RyZWFtQXR0cnMudmVyc2lvbiBpcyBtaXNzaW5nLCBidXQgd2hvIHVzZXMgcHJlLVhNUFAtMS4wXG4gICAgICAgdGhlc2UgZGF5cyBhbnl3YXk/ICovXG4gICAgaWYgKCh0aGlzLnN0YXRlICE9PSBTVEFURV9PTkxJTkUpICYmIHN0YW56YS5pcygnZmVhdHVyZXMnKSkge1xuICAgICAgICB0aGlzLnN0cmVhbUZlYXR1cmVzID0gc3RhbnphXG4gICAgICAgIHRoaXMudXNlRmVhdHVyZXMoKVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU1RBVEVfUFJFQVVUSCkge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YTpwcmVhdXRoJywgc3RhbnphKVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSCkge1xuICAgICAgICB0aGlzLl9oYW5kbGVBdXRoU3RhdGUoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX0JJTkQpICYmIHN0YW56YS5pcygnaXEnKSAmJiAoc3RhbnphLmF0dHJzLmlkID09PSBJUUlEX0JJTkQpKSB7XG4gICAgICAgIHRoaXMuX2hhbmRsZUJpbmRTdGF0ZShzdGFuemEpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfU0VTU0lPTikgJiYgKHRydWUgPT09IHN0YW56YS5pcygnaXEnKSkgJiZcbiAgICAgICAgKHN0YW56YS5hdHRycy5pZCA9PT0gSVFJRF9TRVNTSU9OKSkge1xuICAgICAgICB0aGlzLl9oYW5kbGVTZXNzaW9uU3RhdGUoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAoc3RhbnphLm5hbWUgPT09ICdzdHJlYW06ZXJyb3InKSB7XG4gICAgICAgIGlmICghdGhpcy5yZWNvbm5lY3QpXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgc3RhbnphKVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU1RBVEVfT05MSU5FKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnc3RhbnphJywgc3RhbnphKVxuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5faGFuZGxlU2Vzc2lvblN0YXRlID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5hdHRycy50eXBlID09PSAncmVzdWx0Jykge1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfQVVUSEVEXG4gICAgICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIHRoaXMuZGlkX3Nlc3Npb24gPSB0cnVlXG5cbiAgICAgICAgLyogbm8gc3RyZWFtIHJlc3RhcnQsIGJ1dCBuZXh0IGZlYXR1cmUgKG1vc3QgcHJvYmFibHlcbiAgICAgICAgICAgd2UnbGwgZ28gb25saW5lIG5leHQpICovXG4gICAgICAgIHRoaXMudXNlRmVhdHVyZXMoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAnQ2Fubm90IGJpbmQgcmVzb3VyY2UnKVxuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5faGFuZGxlQmluZFN0YXRlID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5hdHRycy50eXBlID09PSAncmVzdWx0Jykge1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfQVVUSEVEXG4gICAgICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgICAgdGhpcy5kaWRfYmluZCA9IHRydWVcblxuICAgICAgICB2YXIgYmluZEVsID0gc3RhbnphLmdldENoaWxkKCdiaW5kJywgTlNfWE1QUF9CSU5EKVxuICAgICAgICBpZiAoYmluZEVsICYmIGJpbmRFbC5nZXRDaGlsZCgnamlkJykpIHtcbiAgICAgICAgICAgIHRoaXMuamlkID0gbmV3IEpJRChiaW5kRWwuZ2V0Q2hpbGQoJ2ppZCcpLmdldFRleHQoKSlcbiAgICAgICAgfVxuXG4gICAgICAgIC8qIG5vIHN0cmVhbSByZXN0YXJ0LCBidXQgbmV4dCBmZWF0dXJlICovXG4gICAgICAgIHRoaXMudXNlRmVhdHVyZXMoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAnQ2Fubm90IGJpbmQgcmVzb3VyY2UnKVxuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5faGFuZGxlQXV0aFN0YXRlID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5pcygnY2hhbGxlbmdlJywgTlNfWE1QUF9TQVNMKSkge1xuICAgICAgICB2YXIgY2hhbGxlbmdlTXNnID0gZGVjb2RlNjQoc3RhbnphLmdldFRleHQoKSlcbiAgICAgICAgdmFyIHJlc3BvbnNlTXNnID0gZW5jb2RlNjQodGhpcy5tZWNoLmNoYWxsZW5nZShjaGFsbGVuZ2VNc2cpKVxuICAgICAgICB2YXIgcmVzcG9uc2UgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICAgICAncmVzcG9uc2UnLCB7IHhtbG5zOiBOU19YTVBQX1NBU0wgfVxuICAgICAgICApLnQocmVzcG9uc2VNc2cpXG4gICAgICAgIHRoaXMuc2VuZChyZXNwb25zZSlcbiAgICB9IGVsc2UgaWYgKHN0YW56YS5pcygnc3VjY2VzcycsIE5TX1hNUFBfU0FTTCkpIHtcbiAgICAgICAgdGhpcy5tZWNoID0gbnVsbFxuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfQVVUSEVEXG4gICAgICAgIHRoaXMuZW1pdCgnYXV0aCcpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICdYTVBQIGF1dGhlbnRpY2F0aW9uIGZhaWx1cmUnKVxuICAgIH1cbn1cblxuQ2xpZW50LnByb3RvdHlwZS5faGFuZGxlUHJlQXV0aFN0YXRlID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhcbiAgICB2YXIgb2ZmZXJlZE1lY2hzID0gdGhpcy5zdHJlYW1GZWF0dXJlcy5cbiAgICAgICAgZ2V0Q2hpbGQoJ21lY2hhbmlzbXMnLCBOU19YTVBQX1NBU0wpLlxuICAgICAgICBnZXRDaGlsZHJlbignbWVjaGFuaXNtJywgTlNfWE1QUF9TQVNMKS5cbiAgICAgICAgbWFwKGZ1bmN0aW9uKGVsKSB7IHJldHVybiBlbC5nZXRUZXh0KCkgfSlcbiAgICB0aGlzLm1lY2ggPSBzYXNsLnNlbGVjdE1lY2hhbmlzbShcbiAgICAgICAgb2ZmZXJlZE1lY2hzLFxuICAgICAgICB0aGlzLnByZWZlcnJlZFNhc2xNZWNoYW5pc20sXG4gICAgICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXNcbiAgICApXG4gICAgaWYgKHRoaXMubWVjaCkge1xuICAgICAgICB0aGlzLm1lY2guYXV0aHppZCA9IHRoaXMuamlkLmJhcmUoKS50b1N0cmluZygpXG4gICAgICAgIHRoaXMubWVjaC5hdXRoY2lkID0gdGhpcy5qaWQudXNlclxuICAgICAgICB0aGlzLm1lY2gucGFzc3dvcmQgPSB0aGlzLnBhc3N3b3JkXG4gICAgICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgICAgdGhpcy5tZWNoLmFwaV9rZXkgPSB0aGlzLmFwaV9rZXlcbiAgICAgICAgdGhpcy5tZWNoLmFjY2Vzc190b2tlbiA9IHRoaXMuYWNjZXNzX3Rva2VuXG4gICAgICAgIHRoaXMubWVjaC5vYXV0aDJfdG9rZW4gPSB0aGlzLm9hdXRoMl90b2tlblxuICAgICAgICB0aGlzLm1lY2gub2F1dGgyX2F1dGggPSB0aGlzLm9hdXRoMl9hdXRoXG4gICAgICAgIHRoaXMubWVjaC5yZWFsbSA9IHRoaXMuamlkLmRvbWFpbiAgLy8gYW55dGhpbmc/XG4gICAgICAgIGlmICh0aGlzLmFjdEFzKSB0aGlzLm1lY2guYWN0QXMgPSB0aGlzLmFjdEFzLnVzZXJcbiAgICAgICAgdGhpcy5tZWNoLmRpZ2VzdF91cmkgPSAneG1wcC8nICsgdGhpcy5qaWQuZG9tYWluXG4gICAgICAgIHZhciBhdXRoTXNnID0gZW5jb2RlNjQodGhpcy5tZWNoLmF1dGgoKSlcbiAgICAgICAgdmFyIGF0dHJzID0gdGhpcy5tZWNoLmF1dGhBdHRycygpXG4gICAgICAgIGF0dHJzLnhtbG5zID0gTlNfWE1QUF9TQVNMXG4gICAgICAgIGF0dHJzLm1lY2hhbmlzbSA9IHRoaXMubWVjaC5uYW1lXG4gICAgICAgIHRoaXMuc2VuZChuZXcgU3RhbnphLkVsZW1lbnQoJ2F1dGgnLCBhdHRycylcbiAgICAgICAgICAgIC50KGF1dGhNc2cpKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAnTm8gdXNhYmxlIFNBU0wgbWVjaGFuaXNtJylcbiAgICB9XG59XG5cbi8qKlxuICogRWl0aGVyIHdlIGp1c3QgcmVjZWl2ZWQgPHN0cmVhbTpmZWF0dXJlcy8+LCBvciB3ZSBqdXN0IGVuYWJsZWQgYVxuICogZmVhdHVyZSBhbmQgYXJlIGxvb2tpbmcgZm9yIHRoZSBuZXh0LlxuICovXG5DbGllbnQucHJvdG90eXBlLnVzZUZlYXR1cmVzID0gZnVuY3Rpb24oKSB7XG4gICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX1BSRUFVVEgpICYmIHRoaXMucmVnaXN0ZXIpIHtcbiAgICAgICAgZGVsZXRlIHRoaXMucmVnaXN0ZXJcbiAgICAgICAgdGhpcy5kb1JlZ2lzdGVyKClcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9QUkVBVVRIKSAmJlxuICAgICAgICB0aGlzLnN0cmVhbUZlYXR1cmVzLmdldENoaWxkKCdtZWNoYW5pc21zJywgTlNfWE1QUF9TQVNMKSkge1xuICAgICAgICB0aGlzLl9oYW5kbGVQcmVBdXRoU3RhdGUoKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX0FVVEhFRCkgJiZcbiAgICAgICAgICAgICAgICF0aGlzLmRpZF9iaW5kICYmXG4gICAgICAgICAgICAgICB0aGlzLnN0cmVhbUZlYXR1cmVzLmdldENoaWxkKCdiaW5kJywgTlNfWE1QUF9CSU5EKSkge1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfQklORFxuICAgICAgICB2YXIgYmluZEVsID0gbmV3IFN0YW56YS5FbGVtZW50KFxuICAgICAgICAgICAgJ2lxJyxcbiAgICAgICAgICAgIHsgdHlwZTogJ3NldCcsIGlkOiBJUUlEX0JJTkQgfVxuICAgICAgICApLmMoJ2JpbmQnLCB7IHhtbG5zOiBOU19YTVBQX0JJTkQgfSlcbiAgICAgICAgaWYgKHRoaXMuamlkLnJlc291cmNlKVxuICAgICAgICAgICAgYmluZEVsLmMoJ3Jlc291cmNlJykudCh0aGlzLmppZC5yZXNvdXJjZSlcbiAgICAgICAgdGhpcy5zZW5kKGJpbmRFbClcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9BVVRIRUQpICYmXG4gICAgICAgICAgICAgICAhdGhpcy5kaWRfc2Vzc2lvbiAmJlxuICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcy5nZXRDaGlsZCgnc2Vzc2lvbicsIE5TX1hNUFBfU0VTU0lPTikpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1NFU1NJT05cbiAgICAgICAgdmFyIHN0YW56YSA9IG5ldyBTdGFuemEuRWxlbWVudChcbiAgICAgICAgICAnaXEnLFxuICAgICAgICAgIHsgdHlwZTogJ3NldCcsIHRvOiB0aGlzLmppZC5kb21haW4sIGlkOiBJUUlEX1NFU1NJT04gIH1cbiAgICAgICAgKS5jKCdzZXNzaW9uJywgeyB4bWxuczogTlNfWE1QUF9TRVNTSU9OIH0pXG4gICAgICAgIHRoaXMuc2VuZChzdGFuemEpXG4gICAgfSBlbHNlIGlmICh0aGlzLnN0YXRlID09PSBTVEFURV9BVVRIRUQpIHtcbiAgICAgICAgLyogT2ssIHdlJ3JlIGF1dGhlbnRpY2F0ZWQgYW5kIGFsbCBmZWF0dXJlcyBoYXZlIGJlZW5cbiAgICAgICAgICAgcHJvY2Vzc2VkICovXG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9PTkxJTkVcbiAgICAgICAgdGhpcy5lbWl0KCdvbmxpbmUnLCB7IGppZDogdGhpcy5qaWQgfSlcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuZG9SZWdpc3RlciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBpZCA9ICdyZWdpc3RlcicgKyBNYXRoLmNlaWwoTWF0aC5yYW5kb20oKSAqIDk5OTk5KVxuICAgIHZhciBpcSA9IG5ldyBTdGFuemEuRWxlbWVudChcbiAgICAgICAgJ2lxJyxcbiAgICAgICAgeyB0eXBlOiAnc2V0JywgaWQ6IGlkLCB0bzogdGhpcy5qaWQuZG9tYWluIH1cbiAgICApLmMoJ3F1ZXJ5JywgeyB4bWxuczogTlNfUkVHSVNURVIgfSlcbiAgICAuYygndXNlcm5hbWUnKS50KHRoaXMuamlkLnVzZXIpLnVwKClcbiAgICAuYygncGFzc3dvcmQnKS50KHRoaXMucGFzc3dvcmQpXG4gICAgdGhpcy5zZW5kKGlxKVxuXG4gICAgdmFyIHNlbGYgPSB0aGlzXG4gICAgdmFyIG9uUmVwbHkgPSBmdW5jdGlvbihyZXBseSkge1xuICAgICAgICBpZiAocmVwbHkuaXMoJ2lxJykgJiYgKHJlcGx5LmF0dHJzLmlkID09PSBpZCkpIHtcbiAgICAgICAgICAgIHNlbGYucmVtb3ZlTGlzdGVuZXIoJ3N0YW56YScsIG9uUmVwbHkpXG5cbiAgICAgICAgICAgIGlmIChyZXBseS5hdHRycy50eXBlID09PSAncmVzdWx0Jykge1xuICAgICAgICAgICAgICAgIC8qIFJlZ2lzdHJhdGlvbiBzdWNjZXNzZnVsLCBwcm9jZWVkIHRvIGF1dGggKi9cbiAgICAgICAgICAgICAgICBzZWxmLnVzZUZlYXR1cmVzKClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcignUmVnaXN0cmF0aW9uIGVycm9yJykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5vbignc3RhbnphOnByZWF1dGgnLCBvblJlcGx5KVxufVxuXG4vKipcbiAqIHJldHVybnMgYWxsIHJlZ2lzdGVyZWQgc2FzbCBtZWNoYW5pc21zXG4gKi9cbkNsaWVudC5wcm90b3R5cGUuZ2V0U2FzbE1lY2hhbmlzbXMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtc1xufVxuXG4vKipcbiAqIHJlbW92ZXMgYWxsIHJlZ2lzdGVyZWQgc2FzbCBtZWNoYW5pc21zXG4gKi9cbkNsaWVudC5wcm90b3R5cGUuY2xlYXJTYXNsTWVjaGFuaXNtID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IFtdXG59XG5cbi8qKlxuICogcmVnaXN0ZXIgYSBuZXcgc2FzbCBtZWNoYW5pc21cbiAqL1xuQ2xpZW50LnByb3RvdHlwZS5yZWdpc3RlclNhc2xNZWNoYW5pc20gPSBmdW5jdGlvbihtZXRob2QpIHtcbiAgICAvLyBjaGVjayBpZiBtZXRob2QgaXMgcmVnaXN0ZXJlZFxuICAgIGlmICh0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zLmluZGV4T2YobWV0aG9kKSA9PT0gLTEgKSB7XG4gICAgICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMucHVzaChtZXRob2QpXG4gICAgfVxufVxuXG4vKipcbiAqIHVucmVnaXN0ZXIgYW4gZXhpc3Rpbmcgc2FzbCBtZWNoYW5pc21cbiAqL1xuQ2xpZW50LnByb3RvdHlwZS51bnJlZ2lzdGVyU2FzbE1lY2hhbmlzbSA9IGZ1bmN0aW9uKG1ldGhvZCkge1xuICAgIC8vIGNoZWNrIGlmIG1ldGhvZCBpcyByZWdpc3RlcmVkXG4gICAgdmFyIGluZGV4ID0gdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcy5pbmRleE9mKG1ldGhvZClcbiAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zID0gdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcy5zcGxpY2UoaW5kZXgsIDEpXG4gICAgfVxufVxuXG5DbGllbnQuU0FTTCA9IHNhc2xcbkNsaWVudC5DbGllbnQgPSBDbGllbnRcbkNsaWVudC5TdGFuemEgPSBTdGFuemFcbkNsaWVudC5sdHggPSBsdHhcbm1vZHVsZS5leHBvcnRzID0gQ2xpZW50XG59KS5jYWxsKHRoaXMsXCIvLi4vbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnRcIikiLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG4vKipcbiAqIEBzZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNDUwNVxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDE3NS5odG1sXG4gKi9cbmZ1bmN0aW9uIEFub255bW91cygpIHt9XG5cbnV0aWwuaW5oZXJpdHMoQW5vbnltb3VzLCBNZWNoYW5pc20pXG5cbkFub255bW91cy5wcm90b3R5cGUubmFtZSA9ICdBTk9OWU1PVVMnXG5cbkFub255bW91cy5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmF1dGh6aWRcbn07XG5cbkFub255bW91cy5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdHJ1ZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEFub255bW91cyIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBjcnlwdG8gPSByZXF1aXJlKCdjcnlwdG8nKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuXG4vKipcbiAqIEhhc2ggYSBzdHJpbmdcbiAqL1xuZnVuY3Rpb24gbWQ1KHMsIGVuY29kaW5nKSB7XG4gICAgdmFyIGhhc2ggPSBjcnlwdG8uY3JlYXRlSGFzaCgnbWQ1JylcbiAgICBoYXNoLnVwZGF0ZShzKVxuICAgIHJldHVybiBoYXNoLmRpZ2VzdChlbmNvZGluZyB8fCAnYmluYXJ5Jylcbn1cbmZ1bmN0aW9uIG1kNUhleChzKSB7XG4gICAgcmV0dXJuIG1kNShzLCAnaGV4Jylcbn1cblxuLyoqXG4gKiBQYXJzZSBTQVNMIHNlcmlhbGl6YXRpb25cbiAqL1xuZnVuY3Rpb24gcGFyc2VEaWN0KHMpIHtcbiAgICB2YXIgcmVzdWx0ID0ge31cbiAgICB3aGlsZSAocykge1xuICAgICAgICB2YXIgbVxuICAgICAgICBpZiAoKG0gPSAvXiguKz8pPSguKj9bXlxcXFxdKSxcXHMqKC4qKS8uZXhlYyhzKSkpIHtcbiAgICAgICAgICAgIHJlc3VsdFttWzFdXSA9IG1bMl0ucmVwbGFjZSgvXFxcIi9nLCAnJylcbiAgICAgICAgICAgIHMgPSBtWzNdXG4gICAgICAgIH0gZWxzZSBpZiAoKG0gPSAvXiguKz8pPSguKz8pLFxccyooLiopLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIGlmICgobSA9IC9eKC4rPyk9XCIoLio/W15cXFxcXSlcIiQvLmV4ZWMocykpKSB7XG4gICAgICAgICAgICByZXN1bHRbbVsxXV0gPSBtWzJdXG4gICAgICAgICAgICBzID0gbVszXVxuICAgICAgICB9IGVsc2UgaWYgKChtID0gL14oLis/KT0oLis/KSQvLmV4ZWMocykpKSB7XG4gICAgICAgICAgICByZXN1bHRbbVsxXV0gPSBtWzJdXG4gICAgICAgICAgICBzID0gbVszXVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcyA9IG51bGxcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogU0FTTCBzZXJpYWxpemF0aW9uXG4gKi9cbmZ1bmN0aW9uIGVuY29kZURpY3QoZGljdCkge1xuICAgIHZhciBzID0gJydcbiAgICBmb3IgKHZhciBrIGluIGRpY3QpIHtcbiAgICAgICAgdmFyIHYgPSBkaWN0W2tdXG4gICAgICAgIGlmICh2KSBzICs9ICcsJyArIGsgKyAnPVwiJyArIHYgKyAnXCInXG4gICAgfVxuICAgIHJldHVybiBzLnN1YnN0cigxKSAvLyB3aXRob3V0IGZpcnN0ICcsJ1xufVxuXG4vKipcbiAqIFJpZ2h0LWp1c3RpZnkgYSBzdHJpbmcsXG4gKiBlZy4gcGFkIHdpdGggMHNcbiAqL1xuZnVuY3Rpb24gcmp1c3QocywgdGFyZ2V0TGVuLCBwYWRkaW5nKSB7XG4gICAgd2hpbGUgKHMubGVuZ3RoIDwgdGFyZ2V0TGVuKVxuICAgICAgICBzID0gcGFkZGluZyArIHNcbiAgICByZXR1cm4gc1xufVxuXG4vKipcbiAqIEdlbmVyYXRlIGEgc3RyaW5nIG9mIDggZGlnaXRzXG4gKiAobnVtYmVyIHVzZWQgb25jZSlcbiAqL1xuZnVuY3Rpb24gZ2VuZXJhdGVOb25jZSgpIHtcbiAgICB2YXIgcmVzdWx0ID0gJydcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IDg7IGkrKylcbiAgICAgICAgcmVzdWx0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoNDggK1xuICAgICAgICAgICAgTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiAxMCkpXG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIEBzZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjMjgzMVxuICogQHNlZSBodHRwOi8vd2lraS54bXBwLm9yZy93ZWIvU0FTTGFuZERJR0VTVC1NRDVcbiAqL1xuZnVuY3Rpb24gRGlnZXN0TUQ1KCkge1xuICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICB0aGlzLm5vbmNlX2NvdW50ID0gMFxuICAgIHRoaXMuY25vbmNlID0gZ2VuZXJhdGVOb25jZSgpXG4gICAgdGhpcy5hdXRoY2lkID0gbnVsbFxuICAgIHRoaXMuYWN0QXMgPSBudWxsXG4gICAgdGhpcy5yZWFsbSA9IG51bGxcbiAgICB0aGlzLnBhc3N3b3JkID0gbnVsbFxufVxuXG51dGlsLmluaGVyaXRzKERpZ2VzdE1ENSwgTWVjaGFuaXNtKVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLm5hbWUgPSAnRElHRVNULU1ENSdcblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICcnXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUuZ2V0TkMgPSBmdW5jdGlvbigpIHtcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgcmV0dXJuIHJqdXN0KHRoaXMubm9uY2VfY291bnQudG9TdHJpbmcoKSwgOCwgJzAnKVxufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLnJlc3BvbnNlVmFsdWUgPSBmdW5jdGlvbihzKSB7XG4gICAgdmFyIGRpY3QgPSBwYXJzZURpY3QocylcbiAgICBpZiAoZGljdC5yZWFsbSlcbiAgICAgICAgdGhpcy5yZWFsbSA9IGRpY3QucmVhbG1cblxuICAgIHZhciB2YWx1ZVxuICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICBpZiAoZGljdC5ub25jZSAmJiBkaWN0LnFvcCkge1xuICAgICAgICB0aGlzLm5vbmNlX2NvdW50KytcbiAgICAgICAgdmFyIGExID0gbWQ1KHRoaXMuYXV0aGNpZCArICc6JyArXG4gICAgICAgICAgICB0aGlzLnJlYWxtICsgJzonICtcbiAgICAgICAgICAgIHRoaXMucGFzc3dvcmQpICsgJzonICtcbiAgICAgICAgICAgIGRpY3Qubm9uY2UgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5jbm9uY2VcbiAgICAgICAgaWYgKHRoaXMuYWN0QXMpIGExICs9ICc6JyArIHRoaXMuYWN0QXNcblxuICAgICAgICB2YXIgYTIgPSAnQVVUSEVOVElDQVRFOicgKyB0aGlzLmRpZ2VzdF91cmlcbiAgICAgICAgaWYgKChkaWN0LnFvcCA9PT0gJ2F1dGgtaW50JykgfHwgKGRpY3QucW9wID09PSAnYXV0aC1jb25mJykpXG4gICAgICAgICAgICBhMiArPSAnOjAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwJ1xuXG4gICAgICAgIHZhbHVlID0gbWQ1SGV4KG1kNUhleChhMSkgKyAnOicgK1xuICAgICAgICAgICAgZGljdC5ub25jZSArICc6JyArXG4gICAgICAgICAgICB0aGlzLmdldE5DKCkgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5jbm9uY2UgKyAnOicgK1xuICAgICAgICAgICAgZGljdC5xb3AgKyAnOicgK1xuICAgICAgICAgICAgbWQ1SGV4KGEyKSlcbiAgICB9XG4gICAgcmV0dXJuIHZhbHVlXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUuY2hhbGxlbmdlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcGFyc2VEaWN0KHMpXG4gICAgaWYgKGRpY3QucmVhbG0pXG4gICAgICAgIHRoaXMucmVhbG0gPSBkaWN0LnJlYWxtXG5cbiAgICB2YXIgcmVzcG9uc2VcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgaWYgKGRpY3Qubm9uY2UgJiYgZGljdC5xb3ApIHtcbiAgICAgICAgdmFyIHJlc3BvbnNlVmFsdWUgPSB0aGlzLnJlc3BvbnNlVmFsdWUocylcbiAgICAgICAgcmVzcG9uc2UgPSB7XG4gICAgICAgICAgICB1c2VybmFtZTogdGhpcy5hdXRoY2lkLFxuICAgICAgICAgICAgcmVhbG06IHRoaXMucmVhbG0sXG4gICAgICAgICAgICBub25jZTogZGljdC5ub25jZSxcbiAgICAgICAgICAgIGNub25jZTogdGhpcy5jbm9uY2UsXG4gICAgICAgICAgICBuYzogdGhpcy5nZXROQygpLFxuICAgICAgICAgICAgcW9wOiBkaWN0LnFvcCxcbiAgICAgICAgICAgICdkaWdlc3QtdXJpJzogdGhpcy5kaWdlc3RfdXJpLFxuICAgICAgICAgICAgcmVzcG9uc2U6IHJlc3BvbnNlVmFsdWUsXG4gICAgICAgICAgICBjaGFyc2V0OiAndXRmLTgnXG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuYWN0QXMpIHJlc3BvbnNlLmF1dGh6aWQgPSB0aGlzLmFjdEFzXG4gICAgfSBlbHNlIGlmIChkaWN0LnJzcGF1dGgpIHtcbiAgICAgICAgcmV0dXJuICcnXG4gICAgfVxuICAgIHJldHVybiBlbmNvZGVEaWN0KHJlc3BvbnNlKVxufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLnNlcnZlckNoYWxsZW5nZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBkaWN0ID0ge31cbiAgICBkaWN0LnJlYWxtID0gJydcbiAgICB0aGlzLm5vbmNlID0gZGljdC5ub25jZSA9IGdlbmVyYXRlTm9uY2UoKVxuICAgIGRpY3QucW9wID0gJ2F1dGgnXG4gICAgdGhpcy5jaGFyc2V0ID0gZGljdC5jaGFyc2V0ID0gJ3V0Zi04J1xuICAgIGRpY3QuYWxnb3JpdGhtID0gJ21kNS1zZXNzJ1xuICAgIHJldHVybiBlbmNvZGVEaWN0KGRpY3QpXG59XG5cbi8vIFVzZWQgb24gdGhlIHNlcnZlciB0byBjaGVjayBmb3IgYXV0aCFcbkRpZ2VzdE1ENS5wcm90b3R5cGUucmVzcG9uc2UgPSBmdW5jdGlvbihzKSB7XG4gICAgdmFyIGRpY3QgPSBwYXJzZURpY3QocylcbiAgICB0aGlzLmF1dGhjaWQgPSBkaWN0LnVzZXJuYW1lXG5cbiAgICBpZiAoZGljdC5ub25jZSAhPT0gdGhpcy5ub25jZSkgcmV0dXJuIGZhbHNlXG4gICAgaWYgKCFkaWN0LmNub25jZSkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLmNub25jZSA9IGRpY3QuY25vbmNlXG4gICAgaWYgKHRoaXMuY2hhcnNldCAhPT0gZGljdC5jaGFyc2V0KSByZXR1cm4gZmFsc2VcblxuICAgIHRoaXMucmVzcG9uc2UgPSBkaWN0LnJlc3BvbnNlXG4gICAgcmV0dXJuIHRydWVcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5wYXNzd29yZCkgcmV0dXJuIHRydWVcbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBEaWdlc3RNRDVcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cbi8qKlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDE3OC5odG1sXG4gKi9cbmZ1bmN0aW9uIEV4dGVybmFsKCkge31cblxudXRpbC5pbmhlcml0cyhFeHRlcm5hbCwgTWVjaGFuaXNtKVxuXG5FeHRlcm5hbC5wcm90b3R5cGUubmFtZSA9ICdFWFRFUk5BTCdcblxuRXh0ZXJuYWwucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gKHRoaXMuYXV0aHppZClcbn1cblxuRXh0ZXJuYWwucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLmNyZWRlbnRpYWxzKSByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEV4dGVybmFsIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIEVhY2ggaW1wbGVtZW50ZWQgbWVjaGFuaXNtIG9mZmVycyBtdWx0aXBsZSBtZXRob2RzXG4gKiAtIG5hbWUgOiBuYW1lIG9mIHRoZSBhdXRoIG1ldGhvZFxuICogLSBhdXRoIDpcbiAqIC0gbWF0Y2g6IGNoZWNrcyBpZiB0aGUgY2xpZW50IGhhcyBlbm91Z2ggb3B0aW9ucyB0b1xuICogICAgICAgICAgb2ZmZXIgdGhpcyBtZWNoYW5pcyB0byB4bXBwIHNlcnZlcnNcbiAqIC0gYXV0aFNlcnZlcjogdGFrZXMgYSBzdGFuemEgYW5kIGV4dHJhY3RzIHRoZSBpbmZvcm1hdGlvblxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG5cbi8vIE1lY2hhbmlzbXNcbmZ1bmN0aW9uIE1lY2hhbmlzbSgpIHt9XG5cbnV0aWwuaW5oZXJpdHMoTWVjaGFuaXNtLCBFdmVudEVtaXR0ZXIpXG5cbk1lY2hhbmlzbS5wcm90b3R5cGUuYXV0aEF0dHJzID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHt9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gTWVjaGFuaXNtIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuZnVuY3Rpb24gUGxhaW4oKSB7fVxuXG51dGlsLmluaGVyaXRzKFBsYWluLCBNZWNoYW5pc20pXG5cblBsYWluLnByb3RvdHlwZS5uYW1lID0gJ1BMQUlOJ1xuXG5QbGFpbi5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmF1dGh6aWQgKyAnXFwwJyArXG4gICAgICAgIHRoaXMuYXV0aGNpZCArICdcXDAnICtcbiAgICAgICAgdGhpcy5wYXNzd29yZDtcbn1cblxuUGxhaW4ucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGlmIChvcHRpb25zLnBhc3N3b3JkKSByZXR1cm4gdHJ1ZVxuICAgIHJldHVybiBmYWxzZVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYWluIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcbiAgLCBxdWVyeXN0cmluZyA9IHJlcXVpcmUoJ3F1ZXJ5c3RyaW5nJylcblxuLyoqXG4gKiBAc2VlIGh0dHBzOi8vZGV2ZWxvcGVycy5mYWNlYm9vay5jb20vZG9jcy9jaGF0LyNwbGF0YXV0aFxuICovXG52YXIgWEZhY2Vib29rUGxhdGZvcm0gPSBmdW5jdGlvbigpIHt9XG5cbnV0aWwuaW5oZXJpdHMoWEZhY2Vib29rUGxhdGZvcm0sIE1lY2hhbmlzbSlcblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLm5hbWUgPSAnWC1GQUNFQk9PSy1QTEFURk9STSdcblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5ob3N0ID0gJ2NoYXQuZmFjZWJvb2suY29tJ1xuXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnJ1xufVxuXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuY2hhbGxlbmdlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcXVlcnlzdHJpbmcucGFyc2UocylcblxuICAgIC8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICB2YXIgcmVzcG9uc2UgPSB7XG4gICAgICAgIGFwaV9rZXk6IHRoaXMuYXBpX2tleSxcbiAgICAgICAgY2FsbF9pZDogbmV3IERhdGUoKS5nZXRUaW1lKCksXG4gICAgICAgIG1ldGhvZDogZGljdC5tZXRob2QsXG4gICAgICAgIG5vbmNlOiBkaWN0Lm5vbmNlLFxuICAgICAgICBhY2Nlc3NfdG9rZW46IHRoaXMuYWNjZXNzX3Rva2VuLFxuICAgICAgICB2OiAnMS4wJ1xuICAgIH1cblxuICAgIHJldHVybiBxdWVyeXN0cmluZy5zdHJpbmdpZnkocmVzcG9uc2UpXG59XG5cblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICB2YXIgaG9zdCA9IFhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5ob3N0XG4gICAgaWYgKChvcHRpb25zLmhvc3QgPT09IGhvc3QpIHx8XG4gICAgICAgIChvcHRpb25zLmppZCAmJiAob3B0aW9ucy5qaWQuZ2V0RG9tYWluKCkgPT09IGhvc3QpKSkge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBYRmFjZWJvb2tQbGF0Zm9ybSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cbi8qKlxuICogQHNlZSBodHRwczovL2RldmVsb3BlcnMuZ29vZ2xlLmNvbS90YWxrL2plcF9leHRlbnNpb25zL29hdXRoXG4gKi9cbi8qanNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbmZ1bmN0aW9uIFhPQXV0aDIoKSB7XG4gICAgdGhpcy5vYXV0aDJfYXV0aCA9IG51bGxcbiAgICB0aGlzLmF1dGh6aWQgPSBudWxsXG59XG5cbnV0aWwuaW5oZXJpdHMoWE9BdXRoMiwgTWVjaGFuaXNtKVxuXG5YT0F1dGgyLnByb3RvdHlwZS5uYW1lID0gJ1gtT0FVVEgyJ1xuWE9BdXRoMi5wcm90b3R5cGUuTlNfR09PR0xFX0FVVEggPSAnaHR0cDovL3d3dy5nb29nbGUuY29tL3RhbGsvcHJvdG9jb2wvYXV0aCdcblxuWE9BdXRoMi5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnXFwwJyArIHRoaXMuYXV0aHppZCArICdcXDAnICsgdGhpcy5vYXV0aDJfdG9rZW5cbn1cblxuWE9BdXRoMi5wcm90b3R5cGUuYXV0aEF0dHJzID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgJ2F1dGg6c2VydmljZSc6ICdvYXV0aDInLFxuICAgICAgICAneG1sbnM6YXV0aCc6IHRoaXMub2F1dGgyX2F1dGhcbiAgICB9XG59XG5cblhPQXV0aDIucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHJldHVybiAob3B0aW9ucy5vYXV0aDJfYXV0aCA9PT0gWE9BdXRoMi5wcm90b3R5cGUuTlNfR09PR0xFX0FVVEgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gWE9BdXRoMlxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCByZXF1ZXN0ID0gcmVxdWlyZSgncmVxdWVzdCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5sdHhcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50OmJvc2gnKVxuXG5mdW5jdGlvbiBCT1NIQ29ubmVjdGlvbihvcHRzKSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMuYm9zaFVSTCA9IG9wdHMuYm9zaC51cmxcbiAgICB0aGlzLmppZCA9IG9wdHMuamlkXG4gICAgdGhpcy53YWl0ID0gb3B0cy5ib3NoLndhaXQgfHwgMTA7XG4gICAgdGhpcy54bWxuc0F0dHJzID0ge1xuICAgICAgICB4bWxuczogJ2h0dHA6Ly9qYWJiZXIub3JnL3Byb3RvY29sL2h0dHBiaW5kJyxcbiAgICAgICAgJ3htbG5zOnhtcHAnOiAndXJuOnhtcHA6eGJvc2gnLFxuICAgICAgICAneG1sbnM6c3RyZWFtJzogJ2h0dHA6Ly9ldGhlcnguamFiYmVyLm9yZy9zdHJlYW1zJ1xuICAgIH1cbiAgICBpZiAob3B0cy54bWxucykge1xuICAgICAgICBmb3IgKHZhciBwcmVmaXggaW4gb3B0cy54bWxucykge1xuICAgICAgICAgICAgaWYgKHByZWZpeCkge1xuICAgICAgICAgICAgICAgIHRoaXMueG1sbnNBdHRyc1sneG1sbnM6JyArIHByZWZpeF0gPSBvcHRzLnhtbG5zW3ByZWZpeF1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy54bWxuc0F0dHJzLnhtbG5zID0gb3B0cy54bWxuc1twcmVmaXhdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgdGhpcy5jdXJyZW50UmVxdWVzdHMgPSAwXG4gICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgdGhpcy5yaWQgPSBNYXRoLmNlaWwoTWF0aC5yYW5kb20oKSAqIDk5OTk5OTk5OTkpXG5cbiAgICB0aGlzLnJlcXVlc3Qoe1xuICAgICAgICAgICAgdG86IHRoaXMuamlkLmRvbWFpbixcbiAgICAgICAgICAgIHZlcjogJzEuNicsXG4gICAgICAgICAgICB3YWl0OiB0aGlzLndhaXQsXG4gICAgICAgICAgICBob2xkOiAnMScsXG4gICAgICAgICAgICBjb250ZW50OiB0aGlzLmNvbnRlbnRUeXBlLFxuICAgICAgICAgICAgJ3htcHA6dmVyc2lvbic6ICcxLjAnXG4gICAgICAgIH0sXG4gICAgICAgIFtdLFxuICAgICAgICBmdW5jdGlvbihlcnIsIGJvZHlFbCkge1xuICAgICAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgICAgIHRoYXQuZW1pdCgnZXJyb3InLCBlcnIpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJvZHlFbCAmJiBib2R5RWwuYXR0cnMpIHtcbiAgICAgICAgICAgICAgICB0aGF0LnNpZCA9IGJvZHlFbC5hdHRycy5zaWRcbiAgICAgICAgICAgICAgICB0aGF0Lm1heFJlcXVlc3RzID0gcGFyc2VJbnQoYm9keUVsLmF0dHJzLnJlcXVlc3RzLCAxMCkgfHwgMlxuICAgICAgICAgICAgICAgIGlmICh0aGF0LnNpZCAmJiAodGhhdC5tYXhSZXF1ZXN0cyA+IDApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuZW1pdCgnY29ubmVjdCcpXG4gICAgICAgICAgICAgICAgICAgIHRoYXQucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcbiAgICAgICAgICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayh0aGF0Lm1heVJlcXVlc3QuYmluZCh0aGF0KSlcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0aGF0LmVtaXQoJ2Vycm9yJywgJ0ludmFsaWQgcGFyYW1ldGVycycpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuXG59XG5cbnV0aWwuaW5oZXJpdHMoQk9TSENvbm5lY3Rpb24sIEV2ZW50RW1pdHRlcilcblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLmNvbnRlbnRUeXBlID0gJ3RleHQveG1sOyBjaGFyc2V0PXV0Zi04J1xuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIHRoaXMucXVldWUucHVzaChzdGFuemEucm9vdCgpKVxuICAgIHByb2Nlc3MubmV4dFRpY2sodGhpcy5tYXlSZXF1ZXN0LmJpbmQodGhpcykpXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuXG4gICAgdGhpcy5yaWQrK1xuICAgIHRoaXMucmVxdWVzdCh7XG4gICAgICAgIHRvOiB0aGlzLmppZC5kb21haW4sXG4gICAgICAgICd4bXBwOnJlc3RhcnQnOiAndHJ1ZSdcbiAgICB9LFxuICAgIFtdLFxuICAgIGZ1bmN0aW9uIChlcnIsIGJvZHlFbCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICB0aGF0LmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgICAgICAgdGhhdC5lbWl0KCdkaXNjb25uZWN0JylcbiAgICAgICAgICAgIHRoYXQuZW1pdCgnZW5kJylcbiAgICAgICAgICAgIGRlbGV0ZSB0aGF0LnNpZFxuICAgICAgICAgICAgdGhhdC5lbWl0KCdjbG9zZScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aGF0LnN0cmVhbU9wZW5lZCA9IHRydWVcbiAgICAgICAgICAgIGlmIChib2R5RWwpIHRoYXQucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcblxuICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayh0aGF0Lm1heVJlcXVlc3QuYmluZCh0aGF0KSlcbiAgICAgICAgfVxuICAgIH0pXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5wcm9jZXNzUmVzcG9uc2UgPSBmdW5jdGlvbihib2R5RWwpIHtcbiAgICBkZWJ1ZygncHJvY2VzcyBib3NoIHNlcnZlciByZXNwb25zZSAnICsgYm9keUVsLnRvU3RyaW5nKCkpXG4gICAgaWYgKGJvZHlFbCAmJiBib2R5RWwuY2hpbGRyZW4pIHtcbiAgICAgICAgZm9yKHZhciBpID0gMDsgaSA8IGJvZHlFbC5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgdmFyIGNoaWxkID0gYm9keUVsLmNoaWxkcmVuW2ldXG4gICAgICAgICAgICBpZiAoY2hpbGQubmFtZSAmJiBjaGlsZC5hdHRycyAmJiBjaGlsZC5jaGlsZHJlbilcbiAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIGNoaWxkKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChib2R5RWwgJiYgKGJvZHlFbC5hdHRycy50eXBlID09PSAndGVybWluYXRlJykpIHtcbiAgICAgICAgaWYgKCF0aGlzLnNodXRkb3duIHx8IGJvZHlFbC5hdHRycy5jb25kaXRpb24pXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJyxcbiAgICAgICAgICAgICAgICAgICAgICBuZXcgRXJyb3IoYm9keUVsLmF0dHJzLmNvbmRpdGlvbiB8fCAnU2Vzc2lvbiB0ZXJtaW5hdGVkJykpXG4gICAgICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICAgICAgdGhpcy5lbWl0KCdjbG9zZScpXG4gICAgfVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUubWF5UmVxdWVzdCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjYW5SZXF1ZXN0ID1cbiAgICAgICAgLyogTXVzdCBoYXZlIGEgc2Vzc2lvbiBhbHJlYWR5ICovXG4gICAgICAgIHRoaXMuc2lkICYmXG4gICAgICAgIC8qIFdlIGNhbiBvbmx5IHJlY2VpdmUgd2hlbiBvbmUgcmVxdWVzdCBpcyBpbiBmbGlnaHQgKi9cbiAgICAgICAgKCh0aGlzLmN1cnJlbnRSZXF1ZXN0cyA9PT0gMCkgfHxcbiAgICAgICAgIC8qIElzIHRoZXJlIHNvbWV0aGluZyB0byBzZW5kLCBhbmQgYXJlIHdlIGFsbG93ZWQ/ICovXG4gICAgICAgICAoKCh0aGlzLnF1ZXVlLmxlbmd0aCA+IDApICYmICh0aGlzLmN1cnJlbnRSZXF1ZXN0cyA8IHRoaXMubWF4UmVxdWVzdHMpKSlcbiAgICAgICAgKVxuXG4gICAgaWYgKCFjYW5SZXF1ZXN0KSByZXR1cm5cblxuICAgIHZhciBzdGFuemFzID0gdGhpcy5xdWV1ZVxuICAgIHRoaXMucXVldWUgPSBbXVxuICAgIHRoaXMucmlkKytcbiAgICB0aGlzLnJlcXVlc3Qoe30sIHN0YW56YXMsIGZ1bmN0aW9uKGVyciwgYm9keUVsKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlcnIpXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuc2lkXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGlmIChib2R5RWwpIHRoaXMucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcblxuICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayh0aGlzLm1heVJlcXVlc3QuYmluZCh0aGlzKSlcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKHN0YW56YXMpIHtcbiAgICBzdGFuemFzID0gc3RhbnphcyB8fCBbXVxuICAgIGlmICh0eXBlb2Ygc3RhbnphcyAhPT0gQXJyYXkpIHN0YW56YXMgPSBbc3Rhbnphc11cblxuICAgIHN0YW56YXMgPSB0aGlzLnF1ZXVlLmNvbmNhdChzdGFuemFzKVxuICAgIHRoaXMuc2h1dGRvd24gPSB0cnVlXG4gICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgdGhpcy5yaWQrK1xuICAgIHRoaXMucmVxdWVzdCh7IHR5cGU6ICd0ZXJtaW5hdGUnIH0sIHN0YW56YXMsIGZ1bmN0aW9uKGVyciwgYm9keUVsKSB7XG4gICAgICAgIGlmIChib2R5RWwpIHRoaXMucHJvY2Vzc1Jlc3BvbnNlKGJvZHlFbClcblxuICAgICAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG4gICAgICAgIGRlbGV0ZSB0aGlzLnNpZFxuICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICB9LmJpbmQodGhpcykpXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5tYXhIVFRQUmV0cmllcyA9IDVcblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLnJlcXVlc3QgPSBmdW5jdGlvbihhdHRycywgY2hpbGRyZW4sIGNiLCByZXRyeSkge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgIHJldHJ5ID0gcmV0cnkgfHwgMFxuXG4gICAgYXR0cnMucmlkID0gdGhpcy5yaWQudG9TdHJpbmcoKVxuICAgIGlmICh0aGlzLnNpZCkgYXR0cnMuc2lkID0gdGhpcy5zaWRcblxuICAgIGZvciAodmFyIGsgaW4gdGhpcy54bWxuc0F0dHJzKSB7XG4gICAgICAgIGF0dHJzW2tdID0gdGhpcy54bWxuc0F0dHJzW2tdXG4gICAgfVxuICAgIHZhciBib3NoRWwgPSBuZXcgbHR4LkVsZW1lbnQoJ2JvZHknLCBhdHRycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGJvc2hFbC5jbm9kZShjaGlsZHJlbltpXSlcbiAgICB9XG5cbiAgICBkZWJ1Zygnc2VuZCBib3NoIHJlcXVlc3Q6JyArIGJvc2hFbC50b1N0cmluZygpKTtcblxuICAgIHJlcXVlc3Qoe1xuICAgICAgICAgICAgdXJpOiB0aGlzLmJvc2hVUkwsXG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6IHRoaXMuY29udGVudFR5cGUgfSxcbiAgICAgICAgICAgIGJvZHk6IGJvc2hFbC50b1N0cmluZygpXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uKGVyciwgcmVzLCBib2R5KSB7XG4gICAgICAgICAgICB0aGF0LmN1cnJlbnRSZXF1ZXN0cy0tXG5cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAocmV0cnkgPCB0aGF0Lm1heEhUVFBSZXRyaWVzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGF0LnJlcXVlc3QoYXR0cnMsIGNoaWxkcmVuLCBjYiwgcmV0cnkgKyAxKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYihlcnIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKChyZXMuc3RhdHVzQ29kZSA8IDIwMCkgfHwgKHJlcy5zdGF0dXNDb2RlID49IDQwMCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IobmV3IEVycm9yKCdIVFRQIHN0YXR1cyAnICsgcmVzLnN0YXR1c0NvZGUpKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgYm9keUVsXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHlFbCA9IGx0eC5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChib2R5RWwgJiZcbiAgICAgICAgICAgICAgICAoYm9keUVsLmF0dHJzLnR5cGUgPT09ICd0ZXJtaW5hdGUnKSAmJlxuICAgICAgICAgICAgICAgIGJvZHlFbC5hdHRycy5jb25kaXRpb24pIHtcbiAgICAgICAgICAgICAgICBjYihuZXcgRXJyb3IoYm9keUVsLmF0dHJzLmNvbmRpdGlvbikpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJvZHlFbCkge1xuICAgICAgICAgICAgICAgIGNiKG51bGwsIGJvZHlFbClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2IobmV3IEVycm9yKCdubyA8Ym9keS8+JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICApXG4gICAgdGhpcy5jdXJyZW50UmVxdWVzdHMrK1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJPU0hDb25uZWN0aW9uXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpKSIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vYXV0aGVudGljYXRpb24vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBBdmFpbGFibGUgbWV0aG9kcyBmb3IgY2xpZW50LXNpZGUgYXV0aGVudGljYXRpb24gKENsaWVudClcbiAqIEBwYXJhbSAgQXJyYXkgb2ZmZXJlZE1lY2hzICBtZXRob2RzIG9mZmVyZWQgYnkgc2VydmVyXG4gKiBAcGFyYW0gIEFycmF5IHByZWZlcnJlZE1lY2ggcHJlZmVycmVkIG1ldGhvZHMgYnkgY2xpZW50XG4gKiBAcGFyYW0gIEFycmF5IGF2YWlsYWJsZU1lY2ggYXZhaWxhYmxlIG1ldGhvZHMgb24gY2xpZW50XG4gKi9cbmZ1bmN0aW9uIHNlbGVjdE1lY2hhbmlzbShvZmZlcmVkTWVjaHMsIHByZWZlcnJlZE1lY2gsIGF2YWlsYWJsZU1lY2gpIHtcbiAgICB2YXIgbWVjaENsYXNzZXMgPSBbXVxuICAgIHZhciBieU5hbWUgPSB7fVxuICAgIHZhciBNZWNoXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYXZhaWxhYmxlTWVjaCkpIHtcbiAgICAgICAgbWVjaENsYXNzZXMgPSBtZWNoQ2xhc3Nlcy5jb25jYXQoYXZhaWxhYmxlTWVjaClcbiAgICB9XG4gICAgbWVjaENsYXNzZXMuZm9yRWFjaChmdW5jdGlvbihtZWNoQ2xhc3MpIHtcbiAgICAgICAgYnlOYW1lW21lY2hDbGFzcy5wcm90b3R5cGUubmFtZV0gPSBtZWNoQ2xhc3NcbiAgICB9KVxuICAgIC8qIEFueSBwcmVmZXJyZWQ/ICovXG4gICAgaWYgKGJ5TmFtZVtwcmVmZXJyZWRNZWNoXSAmJlxuICAgICAgICAob2ZmZXJlZE1lY2hzLmluZGV4T2YocHJlZmVycmVkTWVjaCkgPj0gMCkpIHtcbiAgICAgICAgTWVjaCA9IGJ5TmFtZVtwcmVmZXJyZWRNZWNoXVxuICAgIH1cbiAgICAvKiBCeSBwcmlvcml0eSAqL1xuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIGlmICghTWVjaCAmJlxuICAgICAgICAgICAgKG9mZmVyZWRNZWNocy5pbmRleE9mKG1lY2hDbGFzcy5wcm90b3R5cGUubmFtZSkgPj0gMCkpXG4gICAgICAgICAgICBNZWNoID0gbWVjaENsYXNzXG4gICAgfSlcblxuICAgIHJldHVybiBNZWNoID8gbmV3IE1lY2goKSA6IG51bGxcbn1cblxuLyoqXG4gKiBXaWxsIGRldGVjdCB0aGUgYXZhaWxhYmxlIG1lY2hhbmlzbXMgYmFzZWQgb24gdGhlIGdpdmVuIG9wdGlvbnNcbiAqIEBwYXJhbSAge1t0eXBlXX0gb3B0aW9ucyBjbGllbnQgY29uZmlndXJhdGlvblxuICogQHBhcmFtICBBcnJheSBhdmFpbGFibGVNZWNoIGF2YWlsYWJsZSBtZXRob2RzIG9uIGNsaWVudFxuICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgIGF2YWlsYWJsZSBvcHRpb25zXG4gKi9cbmZ1bmN0aW9uIGRldGVjdE1lY2hhbmlzbXMob3B0aW9ucywgYXZhaWxhYmxlTWVjaCkge1xuICAgIHZhciBtZWNoQ2xhc3NlcyA9IGF2YWlsYWJsZU1lY2ggPyBhdmFpbGFibGVNZWNoIDogW11cblxuICAgIHZhciBkZXRlY3QgPSBbXVxuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IG1lY2hDbGFzcy5wcm90b3R5cGUubWF0Y2hcbiAgICAgICAgaWYgKG1hdGNoKG9wdGlvbnMpKSBkZXRlY3QucHVzaChtZWNoQ2xhc3MpXG4gICAgfSlcbiAgICByZXR1cm4gZGV0ZWN0XG59XG5cbmV4cG9ydHMuc2VsZWN0TWVjaGFuaXNtID0gc2VsZWN0TWVjaGFuaXNtXG5leHBvcnRzLmRldGVjdE1lY2hhbmlzbXMgPSBkZXRlY3RNZWNoYW5pc21zXG5leHBvcnRzLkFic3RyYWN0TWVjaGFuaXNtID0gTWVjaGFuaXNtXG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIHRscyA9IHJlcXVpcmUoJ3RscycpXG4gICwgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCBDb25uZWN0aW9uID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5Db25uZWN0aW9uXG4gICwgSklEID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5KSURcbiAgLCBTUlYgPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLlNSVlxuICAsIEJPU0hDb25uZWN0aW9uID0gcmVxdWlyZSgnLi9ib3NoJylcbiAgLCBXU0Nvbm5lY3Rpb24gPSByZXF1aXJlKCcuL3dlYnNvY2tldHMnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQ6c2Vzc2lvbicpXG5cbmZ1bmN0aW9uIFNlc3Npb24ob3B0cykge1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnNldE9wdGlvbnMob3B0cylcblxuICAgIGlmIChvcHRzLndlYnNvY2tldCAmJiBvcHRzLndlYnNvY2tldC51cmwpIHtcbiAgICAgICAgZGVidWcoJ3N0YXJ0IHdlYnNvY2tldCBjb25uZWN0aW9uJylcbiAgICAgICAgdGhpcy5fc2V0dXBXZWJzb2NrZXRDb25uZWN0aW9uKG9wdHMpXG4gICAgfSBlbHNlIGlmIChvcHRzLmJvc2ggJiYgb3B0cy5ib3NoLnVybCkge1xuICAgICAgICBkZWJ1Zygnc3RhcnQgYm9zaCBjb25uZWN0aW9uJylcbiAgICAgICAgdGhpcy5fc2V0dXBCb3NoQ29ubmVjdGlvbihvcHRzKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdzdGFydCBzb2NrZXQgY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwU29ja2V0Q29ubmVjdGlvbihvcHRzKVxuICAgIH1cbn1cblxudXRpbC5pbmhlcml0cyhTZXNzaW9uLCBFdmVudEVtaXR0ZXIpXG5cblNlc3Npb24ucHJvdG90eXBlLl9zZXR1cFNvY2tldENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgeG1sbnM6IHsgJyc6IG9wdHMueG1sbnMgfSxcbiAgICAgICAgc3RyZWFtQXR0cnM6IHtcbiAgICAgICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICAgICAgdG86IHRoaXMuamlkLmRvbWFpblxuICAgICAgICB9LFxuICAgICAgICBzZXJpYWxpemVkOiBvcHRzLnNlcmlhbGl6ZWRcbiAgICB9XG4gICAgZm9yICh2YXIgIGtleSBpbiBvcHRzKVxuICAgICAgICBpZiAoIShrZXkgaW4gcGFyYW1zKSlcbiAgICAgICAgICAgIHBhcmFtc1trZXldID0gb3B0c1trZXldXG5cbiAgICB0aGlzLmNvbm5lY3Rpb24gPSBuZXcgQ29ubmVjdGlvbihwYXJhbXMpXG4gICAgdGhpcy5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycygpXG5cbiAgICBpZiAob3B0cy5ob3N0KSB7XG4gICAgICAgIHRoaXMuX3NvY2tldENvbm5lY3Rpb25Ub0hvc3Qob3B0cylcbiAgICB9IGVsc2UgaWYgKCFTUlYpIHtcbiAgICAgICAgdGhyb3cgJ0Nhbm5vdCBsb2FkIFNSVidcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9wZXJmb3JtU3J2TG9va3VwKG9wdHMpXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc29ja2V0Q29ubmVjdGlvblRvSG9zdCA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZiAob3B0cy5sZWdhY3lTU0wpIHtcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmNvbm5lY3Qoe1xuICAgICAgICAgICAgc29ja2V0OmZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGxzLmNvbm5lY3QoXG4gICAgICAgICAgICAgICAgICAgIG9wdHMucG9ydCB8fCA1MjIzLFxuICAgICAgICAgICAgICAgICAgICBvcHRzLmhvc3QsXG4gICAgICAgICAgICAgICAgICAgIG9wdHMuY3JlZGVudGlhbHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc29ja2V0LmF1dGhvcml6ZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdjb25uZWN0JywgdGhpcy5zb2NrZXQpXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICd1bmF1dGhvcml6ZWQnKVxuICAgICAgICAgICAgICAgICAgICB9LmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG9wdHMuY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvbi5jcmVkZW50aWFscyA9IGNyeXB0b1xuICAgICAgICAgICAgICAgIC5jcmVhdGVDcmVkZW50aWFscyhvcHRzLmNyZWRlbnRpYWxzKVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmRpc2FsbG93VExTKSB0aGlzLmNvbm5lY3Rpb24uYWxsb3dUTFMgPSBmYWxzZVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ubGlzdGVuKHtcbiAgICAgICAgICAgIHNvY2tldDpmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgLy8gd2FpdCBmb3IgY29ubmVjdCBldmVudCBsaXN0ZW5lcnNcbiAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdChvcHRzLnBvcnQgfHwgNTIyMiwgb3B0cy5ob3N0KVxuICAgICAgICAgICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICB2YXIgc29ja2V0ID0gb3B0cy5zb2NrZXRcbiAgICAgICAgICAgICAgICBvcHRzLnNvY2tldCA9IG51bGxcbiAgICAgICAgICAgICAgICByZXR1cm4gc29ja2V0IC8vIG1heWJlIGNyZWF0ZSBuZXcgc29ja2V0XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fcGVyZm9ybVNydkxvb2t1cCA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZiAob3B0cy5sZWdhY3lTU0wpIHtcbiAgICAgICAgdGhyb3cgJ0xlZ2FjeVNTTCBtb2RlIGRvZXMgbm90IHN1cHBvcnQgRE5TIGxvb2t1cHMnXG4gICAgfVxuICAgIGlmIChvcHRzLmNyZWRlbnRpYWxzKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24uY3JlZGVudGlhbHMgPSBjcnlwdG8uY3JlYXRlQ3JlZGVudGlhbHMob3B0cy5jcmVkZW50aWFscylcbiAgICBpZiAob3B0cy5kaXNhbGxvd1RMUylcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICB0aGlzLmNvbm5lY3Rpb24ubGlzdGVuKHtzb2NrZXQ6U1JWLmNvbm5lY3Qoe1xuICAgICAgICBzb2NrZXQ6ICAgICAgb3B0cy5zb2NrZXQsXG4gICAgICAgIHNlcnZpY2VzOiAgICBbJ194bXBwLWNsaWVudC5fdGNwJ10sXG4gICAgICAgIGRvbWFpbjogICAgICB0aGlzLmppZC5kb21haW4sXG4gICAgICAgIGRlZmF1bHRQb3J0OiA1MjIyXG4gICAgfSl9KVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc2V0dXBCb3NoQ29ubmVjdGlvbiA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICB0aGlzLmNvbm5lY3Rpb24gPSBuZXcgQk9TSENvbm5lY3Rpb24oe1xuICAgICAgICBqaWQ6IHRoaXMuamlkLFxuICAgICAgICBib3NoOiBvcHRzLmJvc2hcbiAgICB9KVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxuICAgIHRoaXMuY29ubmVjdGlvbi5vbignY29ubmVjdGVkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIENsaWVudHMgc3RhcnQgPHN0cmVhbTpzdHJlYW0+LCBzZXJ2ZXJzIHJlcGx5XG4gICAgICAgIGlmICh0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0pXG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0oKVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3NldHVwV2Vic29ja2V0Q29ubmVjdGlvbiA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICB0aGlzLmNvbm5lY3Rpb24gPSBuZXcgV1NDb25uZWN0aW9uKHtcbiAgICAgICAgamlkOiB0aGlzLmppZCxcbiAgICAgICAgd2Vic29ja2V0OiBvcHRzLndlYnNvY2tldFxuICAgIH0pXG4gICAgdGhpcy5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycygpXG4gICAgdGhpcy5jb25uZWN0aW9uLm9uKCdjb25uZWN0ZWQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgLy8gQ2xpZW50cyBzdGFydCA8c3RyZWFtOnN0cmVhbT4sIHNlcnZlcnMgcmVwbHlcbiAgICAgICAgaWYgKHRoaXMuY29ubmVjdGlvbi5zdGFydFN0cmVhbSlcbiAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvbi5zdGFydFN0cmVhbSgpXG4gICAgfS5iaW5kKHRoaXMpKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5zZXRPcHRpb25zID0gZnVuY3Rpb24ob3B0cykge1xuICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdGhpcy5qaWQgPSAodHlwZW9mIG9wdHMuamlkID09PSAnc3RyaW5nJykgPyBuZXcgSklEKG9wdHMuamlkKSA6IG9wdHMuamlkXG4gICAgdGhpcy5wYXNzd29yZCA9IG9wdHMucGFzc3dvcmRcbiAgICB0aGlzLnByZWZlcnJlZFNhc2xNZWNoYW5pc20gPSBvcHRzLnByZWZlcnJlZFNhc2xNZWNoYW5pc21cbiAgICB0aGlzLmFwaV9rZXkgPSBvcHRzLmFwaV9rZXlcbiAgICB0aGlzLmFjY2Vzc190b2tlbiA9IG9wdHMuYWNjZXNzX3Rva2VuXG4gICAgdGhpcy5vYXV0aDJfdG9rZW4gPSBvcHRzLm9hdXRoMl90b2tlblxuICAgIHRoaXMub2F1dGgyX2F1dGggPSBvcHRzLm9hdXRoMl9hdXRoXG4gICAgdGhpcy5yZWdpc3RlciA9IG9wdHMucmVnaXN0ZXJcbiAgICBpZiAodHlwZW9mIG9wdHMuYWN0QXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRoaXMuYWN0QXMgPSBuZXcgSklEKG9wdHMuYWN0QXMpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hY3RBcyA9IG9wdHMuYWN0QXNcbiAgICB9XG59XG5cblNlc3Npb24ucHJvdG90eXBlLl9hZGRDb25uZWN0aW9uTGlzdGVuZXJzID0gZnVuY3Rpb24gKGNvbikge1xuICAgIGNvbiA9IGNvbiB8fCB0aGlzLmNvbm5lY3Rpb25cbiAgICBjb24ub24oJ3N0YW56YScsIHRoaXMub25TdGFuemEuYmluZCh0aGlzKSlcbiAgICBjb24ub24oJ2RyYWluJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2RyYWluJykpXG4gICAgY29uLm9uKCdlbmQnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZW5kJykpXG4gICAgY29uLm9uKCdjbG9zZScsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdjbG9zZScpKVxuICAgIGNvbi5vbignZXJyb3InLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSlcbiAgICBjb24ub24oJ2Nvbm5lY3QnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnY29ubmVjdCcpKVxuICAgIGNvbi5vbigncmVjb25uZWN0JywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlY29ubmVjdCcpKVxuICAgIGNvbi5vbignZGlzY29ubmVjdCcsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkaXNjb25uZWN0JykpXG4gICAgaWYgKGNvbi5zdGFydFN0cmVhbSkge1xuICAgICAgICBjb24ub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBDbGllbnRzIHN0YXJ0IDxzdHJlYW06c3RyZWFtPiwgc2VydmVycyByZXBseVxuICAgICAgICAgICAgY29uLnN0YXJ0U3RyZWFtKClcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5vbignYXV0aCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbi5zdGFydFN0cmVhbSgpXG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb24gJiYgdGhpcy5jb25uZWN0aW9uLnBhdXNlKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ucGF1c2UoKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uICYmIHRoaXMuY29ubmVjdGlvbi5yZXN1bWUpXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5yZXN1bWUoKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvbiA/IHRoaXMuY29ubmVjdGlvbi5zZW5kKHN0YW56YSkgOiBmYWxzZVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24uZW5kKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbigpIHt9XG5cbm1vZHVsZS5leHBvcnRzID0gU2Vzc2lvblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5sdHhcbiAgLCBTdHJlYW1QYXJzZXIgPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLlN0cmVhbVBhcnNlclxuICAsIFdlYlNvY2tldCA9IHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykgJiYgcmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKS5DbGllbnQgP1xuICAgICAgcmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKS5DbGllbnQgOiB3aW5kb3cuV2ViU29ja2V0XG4gICwgQ29ubmVjdGlvbiA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuQ29ubmVjdGlvblxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQ6d2Vic29ja2V0cycpXG5cbmZ1bmN0aW9uIFdTQ29ubmVjdGlvbihvcHRzKSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMudXJsID0gb3B0cy53ZWJzb2NrZXQudXJsXG4gICAgdGhpcy5qaWQgPSBvcHRzLmppZFxuICAgIHRoaXMueG1sbnMgPSB7fVxuICAgIHRoaXMud2Vic29ja2V0ID0gbmV3IFdlYlNvY2tldCh0aGlzLnVybCwgWyd4bXBwJ10pXG4gICAgdGhpcy53ZWJzb2NrZXQub25vcGVuID0gdGhpcy5vbm9wZW4uYmluZCh0aGlzKVxuICAgIHRoaXMud2Vic29ja2V0Lm9ubWVzc2FnZSA9IHRoaXMub25tZXNzYWdlLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbmNsb3NlID0gdGhpcy5vbmNsb3NlLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbmVycm9yID0gdGhpcy5vbmVycm9yLmJpbmQodGhpcylcbn1cblxudXRpbC5pbmhlcml0cyhXU0Nvbm5lY3Rpb24sIEV2ZW50RW1pdHRlcilcblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5tYXhTdGFuemFTaXplID0gNjU1MzVcbldTQ29ubmVjdGlvbi5wcm90b3R5cGUueG1wcFZlcnNpb24gPSAnMS4wJ1xuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3RhcnRQYXJzZXIoKVxuICAgIHRoaXMuZW1pdCgnY29ubmVjdGVkJylcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IFN0cmVhbVBhcnNlci5TdHJlYW1QYXJzZXIodGhpcy5tYXhTdGFuemFTaXplKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oYXR0cnMpIHtcbiAgICAgICAgc2VsZi5zdHJlYW1BdHRycyA9IGF0dHJzXG4gICAgICAgIC8qIFdlIG5lZWQgdGhvc2UgeG1sbnMgb2Z0ZW4sIHN0b3JlIHRoZW0gZXh0cmEgKi9cbiAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzID0ge31cbiAgICAgICAgZm9yICh2YXIgayBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKChrID09PSAneG1sbnMnKSB8fFxuICAgICAgICAgICAgICAgIChrLnN1YnN0cigwLCA2KSA9PT0gJ3htbG5zOicpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzW2tdID0gYXR0cnNba11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qIE5vdGlmeSBpbiBjYXNlIHdlIGRvbid0IHdhaXQgZm9yIDxzdHJlYW06ZmVhdHVyZXMvPlxuICAgICAgICAgICAoQ29tcG9uZW50IG9yIG5vbi0xLjAgc3RyZWFtcylcbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZW1pdCgnc3RyZWFtU3RhcnQnLCBhdHRycylcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFuemEnLCBmdW5jdGlvbihzdGFuemEpIHtcbiAgICAgICAgLy9zZWxmLm9uU3RhbnphKHNlbGYuYWRkU3RyZWFtTnMoc3RhbnphKSlcbiAgICAgICAgc2VsZi5vblN0YW56YShzdGFuemEpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCB0aGlzLm9uZXJyb3IuYmluZCh0aGlzKSlcbiAgICB0aGlzLnBhcnNlci5vbignZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuc3RvcFBhcnNlcigpXG4gICAgICAgIHNlbGYuZW5kKClcbiAgICB9KVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnN0b3BQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICAvKiBObyBtb3JlIGV2ZW50cywgcGxlYXNlIChtYXkgaGFwcGVuIGhvd2V2ZXIpICovXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIC8qIEdldCBHQydlZCAqL1xuICAgICAgICBkZWxldGUgdGhpcy5wYXJzZXJcbiAgICB9XG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25tZXNzYWdlID0gZnVuY3Rpb24obXNnKSB7XG4gICAgZGVidWcoJ3dzIG1zZyA8LS0nLCBtc2cuZGF0YSlcbiAgICBpZiAobXNnICYmIG1zZy5kYXRhICYmIHRoaXMucGFyc2VyKVxuICAgICAgICB0aGlzLnBhcnNlci53cml0ZShtc2cuZGF0YSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vblN0YW56YSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuaXMoJ2Vycm9yJywgQ29ubmVjdGlvbi5OU19TVFJFQU0pKSB7XG4gICAgICAgIC8qIFRPRE86IGV4dHJhY3QgZXJyb3IgdGV4dCAqL1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgc3RhbnphKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnc3RhbnphJywgc3RhbnphKVxuICAgIH1cbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhdHRycyA9IHt9XG4gICAgZm9yKHZhciBrIGluIHRoaXMueG1sbnMpIHtcbiAgICAgICAgaWYgKHRoaXMueG1sbnMuaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgIGlmICghaykge1xuICAgICAgICAgICAgICAgIGF0dHJzLnhtbG5zID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyc1sneG1sbnM6JyArIGtdID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh0aGlzLnhtcHBWZXJzaW9uKVxuICAgICAgICBhdHRycy52ZXJzaW9uID0gdGhpcy54bXBwVmVyc2lvblxuICAgIGlmICh0aGlzLnN0cmVhbVRvKVxuICAgICAgICBhdHRycy50byA9IHRoaXMuc3RyZWFtVG9cbiAgICBpZiAodGhpcy5zdHJlYW1JZClcbiAgICAgICAgYXR0cnMuaWQgPSB0aGlzLnN0cmVhbUlkXG4gICAgaWYgKHRoaXMuamlkKVxuICAgICAgICBhdHRycy50byA9IHRoaXMuamlkLmRvbWFpblxuICAgIGF0dHJzLnhtbG5zID0gJ2phYmJlcjpjbGllbnQnXG4gICAgYXR0cnNbJ3htbG5zOnN0cmVhbSddID0gQ29ubmVjdGlvbi5OU19TVFJFQU1cblxuICAgIHZhciBlbCA9IG5ldyBsdHguRWxlbWVudCgnc3RyZWFtOnN0cmVhbScsIGF0dHJzKVxuICAgIC8vIG1ha2UgaXQgbm9uLWVtcHR5IHRvIGN1dCB0aGUgY2xvc2luZyB0YWdcbiAgICBlbC50KCcgJylcbiAgICB2YXIgcyA9IGVsLnRvU3RyaW5nKClcbiAgICB0aGlzLnNlbmQocy5zdWJzdHIoMCwgcy5pbmRleE9mKCcgPC9zdHJlYW06c3RyZWFtPicpKSlcblxuICAgIHRoaXMuc3RyZWFtT3BlbmVkID0gdHJ1ZVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLnJvb3QpIHN0YW56YSA9IHN0YW56YS5yb290KClcbiAgICBzdGFuemEgPSBzdGFuemEudG9TdHJpbmcoKVxuICAgIGRlYnVnKCd3cyBzZW5kIC0tPicsIHN0YW56YSlcbiAgICB0aGlzLndlYnNvY2tldC5zZW5kKHN0YW56YSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JylcbiAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnNlbmQoJzwvc3RyZWFtOnN0cmVhbT4nKVxuICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgIGlmICh0aGlzLndlYnNvY2tldClcbiAgICAgICAgdGhpcy53ZWJzb2NrZXQuY2xvc2UoKVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gICAgdGhpcy5lbWl0KCdlcnJvcicsIGUpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gV1NDb25uZWN0aW9uXG4iLCIvLyBCcm93c2VyIFJlcXVlc3Rcbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8vIFVNRCBIRUFERVIgU1RBUlQgXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyBOb2RlLiBEb2VzIG5vdCB3b3JrIHdpdGggc3RyaWN0IENvbW1vbkpTLCBidXRcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxuICAgICAgICByb290LnJldHVybkV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24gKCkge1xuLy8gVU1EIEhFQURFUiBFTkRcblxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XG5pZiAoIVhIUikgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIFhNTEh0dHBSZXF1ZXN0JylcbnJlcXVlc3QubG9nID0ge1xuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxufVxuXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcblxuLy9cbi8vIHJlcXVlc3Rcbi8vXG5cbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgLy8gVGhlIGVudHJ5LXBvaW50IHRvIHRoZSBBUEk6IHByZXAgdGhlIG9wdGlvbnMgb2JqZWN0IGFuZCBwYXNzIHRoZSByZWFsIHdvcmsgdG8gcnVuX3hoci5cbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXG5cbiAgaWYoIW9wdGlvbnMpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcblxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxuXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xuICBlbHNlXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpOyAvLyBVc2UgYSBkdXBsaWNhdGUgZm9yIG11dGF0aW5nLlxuXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXG5cbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcblxuICBpZihvcHRpb25zLnVybCkge1xuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xuICB9XG5cbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIGlzIGEgcmVxdWlyZWQgYXJndW1lbnRcIik7XG5cbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgbXVzdCBiZSBhIHN0cmluZ1wiKTtcblxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdW5zdXBwb3J0ZWRfb3B0aW9ucy5sZW5ndGg7IGkrKylcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcblxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcbiAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcblxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xuXG4gIGlmKG9wdGlvbnMuanNvbikge1xuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgIGlmKG9wdGlvbnMubWV0aG9kICE9PSAnR0VUJylcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcblxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmpzb24gIT09ICdib29sZWFuJylcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5ib2R5KVxuICB9XG4gIFxuICAvL0JFR0lOIFFTIEhhY2tcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzdHIgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKVxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9XG4gIFxuICBpZihvcHRpb25zLnFzKXtcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xuICAgIGlmKG9wdGlvbnMudXJpLmluZGV4T2YoJz8nKSAhPT0gLTEpeyAvL25vIGdldCBwYXJhbXNcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKyc/JytxcztcbiAgICB9XG4gIH1cbiAgLy9FTkQgUVMgSGFja1xuICBcbiAgLy9CRUdJTiBGT1JNIEhhY2tcbiAgdmFyIG11bHRpcGFydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHJlc3VsdC5ib3VuZHJ5ID0gJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDAwMDAwKTtcbiAgICB2YXIgbGluZXMgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcbiAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICAgICAgbGluZXMucHVzaChcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtRGlzcG9zaXRpb246IGZvcm0tZGF0YTsgbmFtZT1cIicrcCsnXCInK1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBsaW5lcy5wdXNoKCAnLS0nK3Jlc3VsdC5ib3VuZHJ5KyctLScgKTtcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XG4gICAgcmVzdWx0LnR5cGUgPSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JytyZXN1bHQuYm91bmRyeTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIFxuICBpZihvcHRpb25zLmZvcm0pe1xuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcbiAgICBpZihvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnKXtcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcbiAgICAgICAgc3dpdGNoKGVuY29kaW5nKXtcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xuICAgICAgICAgICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gbXVsdGkubGVuZ3RoO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfVxuICAvL0VORCBGT1JNIEhhY2tcblxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2UgfHwgbm9vcFxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xuICAgIG9wdGlvbnMuY2FsbGJhY2sgPSBub29wXG4gIH1cblxuICAvLyBYWFggQnJvd3NlcnMgZG8gbm90IGxpa2UgdGhpcy5cbiAgLy9pZihvcHRpb25zLmJvZHkpXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xuXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcbiAgICBvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9ICdCYXNpYyAnICsgYjY0X2VuYyhvcHRpb25zLmF1dGgudXNlcm5hbWUgKyAnOicgKyBvcHRpb25zLmF1dGgucGFzc3dvcmQpO1xuXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXG59XG5cbnZhciByZXFfc2VxID0gMFxuZnVuY3Rpb24gcnVuX3hocihvcHRpb25zKSB7XG4gIHZhciB4aHIgPSBuZXcgWEhSXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxuICAgICwgaXNfY29ycyA9IGlzX2Nyb3NzRG9tYWluKG9wdGlvbnMudXJpKVxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXG5cbiAgcmVxX3NlcSArPSAxXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxuICB4aHIuX2lkID0geGhyLmlkIC8vIEkga25vdyBJIHdpbGwgdHlwZSBcIl9pZFwiIGZyb20gaGFiaXQgYWxsIHRoZSB0aW1lLlxuXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcbiAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0Jyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBjcm9zcy1vcmlnaW4gcmVxdWVzdDogJyArIG9wdGlvbnMudXJpKVxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcbiAgfVxuXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXG4gIGZ1bmN0aW9uIHRvb19sYXRlKCkge1xuICAgIHRpbWVkX291dCA9IHRydWVcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXG4gICAgZXIuY29kZSA9ICdFVElNRURPVVQnXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcblxuICAgIHJlcXVlc3QubG9nLmVycm9yKCdUaW1lb3V0JywgeyAnaWQnOnhoci5faWQsICdtaWxsaXNlY29uZHMnOm9wdGlvbnMudGltZW91dCB9KVxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXG4gIH1cblxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cblxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXG4gIGlmKGlzX2NvcnMpXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcbiAgcmV0dXJuIHhoclxuXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xuICAgIGlmKHRpbWVkX291dClcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXG5cbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnU3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkLCAndGltZWRfb3V0Jzp0aW1lZF9vdXR9KVxuXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcbiAgICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IHN0YXJ0ZWQnLCB7J2lkJzp4aHIuaWR9KVxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcbiAgICAgIG9uX3Jlc3BvbnNlKClcblxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XG4gICAgICBvbl9yZXNwb25zZSgpXG4gICAgICBvbl9sb2FkaW5nKClcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xuICAgICAgb25fcmVzcG9uc2UoKVxuICAgICAgb25fbG9hZGluZygpXG4gICAgICBvbl9lbmQoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xuICAgIGlmKGRpZC5yZXNwb25zZSlcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLnJlc3BvbnNlID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxuICAgIHhoci5zdGF0dXNDb2RlID0geGhyLnN0YXR1cyAvLyBOb2RlIHJlcXVlc3QgY29tcGF0aWJpbGl0eVxuXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxuICAgIGlmKGlzX2NvcnMgJiYgeGhyLnN0YXR1c0NvZGUgPT0gMCkge1xuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXG5cbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXG4gICAgICBkaWQuZW5kID0gdHJ1ZVxuXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxuICAgIH1cblxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXG4gIH1cblxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xuICAgIGlmKGRpZC5sb2FkaW5nKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQubG9hZGluZyA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxuICB9XG5cbiAgZnVuY3Rpb24gb25fZW5kKCkge1xuICAgIGlmKGRpZC5lbmQpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5lbmQgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXG5cbiAgICB4aHIuYm9keSA9IHhoci5yZXNwb25zZVRleHRcbiAgICBpZihvcHRpb25zLmpzb24pIHtcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxuICAgICAgY2F0Y2ggKGVyKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpICAgICAgICB9XG4gICAgfVxuXG4gICAgb3B0aW9ucy5jYWxsYmFjayhudWxsLCB4aHIsIHhoci5ib2R5KVxuICB9XG5cbn0gLy8gcmVxdWVzdFxuXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xucmVxdWVzdC5ERUZBVUxUX1RJTUVPVVQgPSBERUZBVUxUX1RJTUVPVVQ7XG5cbi8vXG4vLyBkZWZhdWx0c1xuLy9cblxucmVxdWVzdC5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIHJlcXVlc3Rlcikge1xuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcbiAgICAgIGlmKHR5cGVvZiBwYXJhbXMgPT09ICdzdHJpbmcnKVxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XG4gICAgICBlbHNlIHtcbiAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xuICAgICAgICBpZiAocGFyYW1zW2ldID09PSB1bmRlZmluZWQpIHBhcmFtc1tpXSA9IG9wdGlvbnNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcbiAgICB9XG4gICAgcmV0dXJuIGRcbiAgfVxuICB2YXIgZGUgPSBkZWYocmVxdWVzdClcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcbiAgZGUucHV0ID0gZGVmKHJlcXVlc3QucHV0KVxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcbiAgcmV0dXJuIGRlXG59XG5cbi8vXG4vLyBIVFRQIG1ldGhvZCBzaG9ydGN1dHNcbi8vXG5cbnZhciBzaG9ydGN1dHMgPSBbICdnZXQnLCAncHV0JywgJ3Bvc3QnLCAnaGVhZCcgXTtcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xuICB2YXIgZnVuYyAgID0gc2hvcnRjdXQudG9Mb3dlckNhc2UoKTtcblxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xuICAgIGlmKHR5cGVvZiBvcHRzID09PSAnc3RyaW5nJylcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcbiAgICBlbHNlIHtcbiAgICAgIG9wdHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdHMpKTtcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xuICAgIH1cblxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxufSlcblxuLy9cbi8vIENvdWNoREIgc2hvcnRjdXRcbi8vXG5cbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfVxuXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxuICBvcHRpb25zLmpzb24gPSB0cnVlXG4gIGlmKG9wdGlvbnMuYm9keSlcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcbiAgZGVsZXRlIG9wdGlvbnMuYm9keVxuXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxuXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXG4gIHJldHVybiB4aHJcblxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XG4gICAgaWYoZXIpXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpXG5cbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xuICAgICAgLy8gVGhlIGJvZHkgaXMgYSBDb3VjaCBKU09OIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBlcnJvci5cbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXG4gICAgICAgIGVyW2tleV0gPSBib2R5W2tleV1cbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcbiAgfVxufVxuXG4vL1xuLy8gVXRpbGl0eVxuLy9cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcbiAgdmFyIGxvZ2dlciA9IHt9XG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXG4gICAgLCBsZXZlbCwgaVxuXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xuICAgIGxldmVsID0gbGV2ZWxzW2ldXG5cbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxuICAgICAgbG9nZ2VyW2xldmVsXSA9IGZvcm1hdHRlZChjb25zb2xlLCBsZXZlbClcbiAgfVxuXG4gIHJldHVybiBsb2dnZXJcbn1cblxuZnVuY3Rpb24gZm9ybWF0dGVkKG9iaiwgbWV0aG9kKSB7XG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXG5cbiAgZnVuY3Rpb24gZm9ybWF0dGVkX2xvZ2dlcihzdHIsIGNvbnRleHQpIHtcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcblxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxuICB9XG59XG5cbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXG5mdW5jdGlvbiBpc19jcm9zc0RvbWFpbih1cmwpIHtcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xuXG4gIC8vIGpRdWVyeSAjODEzOCwgSUUgbWF5IHRocm93IGFuIGV4Y2VwdGlvbiB3aGVuIGFjY2Vzc2luZ1xuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcbiAgdmFyIGFqYXhMb2NhdGlvblxuICB0cnkgeyBhamF4TG9jYXRpb24gPSBsb2NhdGlvbi5ocmVmIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxuICAgIGFqYXhMb2NhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoIFwiYVwiICk7XG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xuICB9XG5cbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cbiAgICAsIHBhcnRzID0gcnVybC5leGVjKHVybC50b0xvd2VyQ2FzZSgpIClcblxuICB2YXIgcmVzdWx0ID0gISEoXG4gICAgcGFydHMgJiZcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cbiAgICB8fCAocGFydHNbM10gfHwgKHBhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpICE9IChhamF4TG9jUGFydHNbM10gfHwgKGFqYXhMb2NQYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKVxuICAgIClcbiAgKVxuXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XG5mdW5jdGlvbiBiNjRfZW5jIChkYXRhKSB7XG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcbiAgICB2YXIgbzEsIG8yLCBvMywgaDEsIGgyLCBoMywgaDQsIGJpdHMsIGkgPSAwLCBhYyA9IDAsIGVuYz1cIlwiLCB0bXBfYXJyID0gW107XG5cbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuXG4gICAgLy8gYXNzdW1lIHV0ZjggZGF0YVxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xuXG4gICAgZG8geyAvLyBwYWNrIHRocmVlIG9jdGV0cyBpbnRvIGZvdXIgaGV4ZXRzXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8zID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG5cbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XG5cbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xuICAgICAgICBoMyA9IGJpdHM+PjYgJiAweDNmO1xuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xuXG4gICAgICAgIC8vIHVzZSBoZXhldHMgdG8gaW5kZXggaW50byBiNjQsIGFuZCBhcHBlbmQgcmVzdWx0IHRvIGVuY29kZWQgc3RyaW5nXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xuXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcblxuICAgIHN3aXRjaCAoZGF0YS5sZW5ndGggJSAzKSB7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVuYztcbn1cbiAgICByZXR1cm4gcmVxdWVzdDtcbi8vVU1EIEZPT1RFUiBTVEFSVFxufSkpO1xuLy9VTUQgRk9PVEVSIEVORFxuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kZWJ1ZycpO1xuZXhwb3J0cy5sb2cgPSBsb2c7XG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICdsaWdodHNlYWdyZWVuJyxcbiAgJ2ZvcmVzdGdyZWVuJyxcbiAgJ2dvbGRlbnJvZCcsXG4gICdkb2RnZXJibHVlJyxcbiAgJ2RhcmtvcmNoaWQnLFxuICAnY3JpbXNvbidcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuZnVuY3Rpb24gdXNlQ29sb3JzKCkge1xuICAvLyBpcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuICByZXR1cm4gKCdXZWJraXRBcHBlYXJhbmNlJyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh3aW5kb3cuY29uc29sZSAmJiAoY29uc29sZS5maXJlYnVnIHx8IChjb25zb2xlLmV4Y2VwdGlvbiAmJiBjb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKTtcbn1cblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbn07XG5cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIHVzZUNvbG9ycyA9IHRoaXMudXNlQ29sb3JzO1xuXG4gIGFyZ3NbMF0gPSAodXNlQ29sb3JzID8gJyVjJyA6ICcnKVxuICAgICsgdGhpcy5uYW1lc3BhY2VcbiAgICArICh1c2VDb2xvcnMgPyAnICVjJyA6ICcgJylcbiAgICArIGFyZ3NbMF1cbiAgICArICh1c2VDb2xvcnMgPyAnJWMgJyA6ICcgJylcbiAgICArICcrJyArIGV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuICBpZiAoIXVzZUNvbG9ycykgcmV0dXJuIGFyZ3M7XG5cbiAgdmFyIGMgPSAnY29sb3I6ICcgKyB0aGlzLmNvbG9yO1xuICBhcmdzID0gW2FyZ3NbMF0sIGMsICdjb2xvcjogaW5oZXJpdCddLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmdzLCAxKSk7XG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EteiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG4gIHJldHVybiBhcmdzO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUubG9nKClgIHdoZW4gYXZhaWxhYmxlLlxuICogTm8tb3Agd2hlbiBgY29uc29sZS5sb2dgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvZygpIHtcbiAgLy8gVGhpcyBoYWNrZXJ5IGlzIHJlcXVpcmVkIGZvciBJRTgsXG4gIC8vIHdoZXJlIHRoZSBgY29uc29sZS5sb2dgIGZ1bmN0aW9uIGRvZXNuJ3QgaGF2ZSAnYXBwbHknXG4gIHJldHVybiAnb2JqZWN0JyA9PSB0eXBlb2YgY29uc29sZVxuICAgICYmICdmdW5jdGlvbicgPT0gdHlwZW9mIGNvbnNvbGUubG9nXG4gICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbi8qKlxuICogU2F2ZSBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuICB0cnkge1xuICAgIGlmIChudWxsID09IG5hbWVzcGFjZXMpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdkZWJ1ZycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2NhbFN0b3JhZ2UuZGVidWcgPSBuYW1lc3BhY2VzO1xuICAgIH1cbiAgfSBjYXRjaChlKSB7fVxufVxuXG4vKipcbiAqIExvYWQgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gcmV0dXJucyB0aGUgcHJldmlvdXNseSBwZXJzaXN0ZWQgZGVidWcgbW9kZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvYWQoKSB7XG4gIHZhciByO1xuICB0cnkge1xuICAgIHIgPSBsb2NhbFN0b3JhZ2UuZGVidWc7XG4gIH0gY2F0Y2goZSkge31cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIGNvbW1vbiBsb2dpYyBmb3IgYm90aCB0aGUgTm9kZS5qcyBhbmQgd2ViIGJyb3dzZXJcbiAqIGltcGxlbWVudGF0aW9ucyBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuZXhwb3J0cy5jb2VyY2UgPSBjb2VyY2U7XG5leHBvcnRzLmRpc2FibGUgPSBkaXNhYmxlO1xuZXhwb3J0cy5lbmFibGUgPSBlbmFibGU7XG5leHBvcnRzLmVuYWJsZWQgPSBlbmFibGVkO1xuZXhwb3J0cy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcywgYW5kIG5hbWVzIHRvIHNraXAuXG4gKi9cblxuZXhwb3J0cy5uYW1lcyA9IFtdO1xuZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4vKipcbiAqIE1hcCBvZiBzcGVjaWFsIFwiJW5cIiBoYW5kbGluZyBmdW5jdGlvbnMsIGZvciB0aGUgZGVidWcgXCJmb3JtYXRcIiBhcmd1bWVudC5cbiAqXG4gKiBWYWxpZCBrZXkgbmFtZXMgYXJlIGEgc2luZ2xlLCBsb3dlcmNhc2VkIGxldHRlciwgaS5lLiBcIm5cIi5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMgPSB7fTtcblxuLyoqXG4gKiBQcmV2aW91c2x5IGFzc2lnbmVkIGNvbG9yLlxuICovXG5cbnZhciBwcmV2Q29sb3IgPSAwO1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlbGVjdENvbG9yKCkge1xuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbcHJldkNvbG9yKysgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICAvLyBkZWZpbmUgdGhlIGBkaXNhYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBkaXNhYmxlZCgpIHtcbiAgfVxuICBkaXNhYmxlZC5lbmFibGVkID0gZmFsc2U7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZW5hYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBlbmFibGVkKCkge1xuXG4gICAgdmFyIHNlbGYgPSBlbmFibGVkO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyBhZGQgdGhlIGBjb2xvcmAgaWYgbm90IHNldFxuICAgIGlmIChudWxsID09IHNlbGYudXNlQ29sb3JzKSBzZWxmLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gICAgaWYgKG51bGwgPT0gc2VsZi5jb2xvciAmJiBzZWxmLnVzZUNvbG9ycykgc2VsZi5jb2xvciA9IHNlbGVjdENvbG9yKCk7XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICBhcmdzWzBdID0gZXhwb3J0cy5jb2VyY2UoYXJnc1swXSk7XG5cbiAgICBpZiAoJ3N0cmluZycgIT09IHR5cGVvZiBhcmdzWzBdKSB7XG4gICAgICAvLyBhbnl0aGluZyBlbHNlIGxldCdzIGluc3BlY3Qgd2l0aCAlb1xuICAgICAgYXJncyA9IFsnJW8nXS5jb25jYXQoYXJncyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EteiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZXhwb3J0cy5mb3JtYXRBcmdzKSB7XG4gICAgICBhcmdzID0gZXhwb3J0cy5mb3JtYXRBcmdzLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIH1cbiAgICB2YXIgbG9nRm4gPSBlbmFibGVkLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG4gIGVuYWJsZWQuZW5hYmxlZCA9IHRydWU7XG5cbiAgdmFyIGZuID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSkgPyBlbmFibGVkIDogZGlzYWJsZWQ7XG5cbiAgZm4ubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gIHJldHVybiBmbjtcbn1cblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lc3BhY2VzLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZShuYW1lc3BhY2VzKSB7XG4gIGV4cG9ydHMuc2F2ZShuYW1lc3BhY2VzKTtcblxuICB2YXIgc3BsaXQgPSAobmFtZXNwYWNlcyB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZ1xuICAgID8gbG9uZyh2YWwpXG4gICAgOiBzaG9ydCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1zfHNlY29uZHM/fHN8bWludXRlcz98bXxob3Vycz98aHxkYXlzP3xkfHllYXJzP3x5KT8kL2kuZXhlYyhzdHIpO1xuICBpZiAoIW1hdGNoKSByZXR1cm47XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmcobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgndXRpbCcpLl9leHRlbmRcblxuZXhwb3J0cy5TdGFuemEgPSB7fVxuZXh0ZW5kKGV4cG9ydHMuU3RhbnphLCByZXF1aXJlKCcuL2xpYi9zdGFuemEnKSlcbmV4cG9ydHMuSklEID0gcmVxdWlyZSgnLi9saWIvamlkJylcbmV4cG9ydHMuQ29ubmVjdGlvbiA9IHJlcXVpcmUoJy4vbGliL2Nvbm5lY3Rpb24nKVxuZXhwb3J0cy5TUlYgPSByZXF1aXJlKCcuL2xpYi9zcnYnKVxuZXhwb3J0cy5TdHJlYW1QYXJzZXIgPSByZXF1aXJlKCcuL2xpYi9zdHJlYW1fcGFyc2VyJylcbmV4cG9ydHMubHR4ID0gcmVxdWlyZSgnbHR4JykiLCIndXNlIHN0cmljdCc7XG5cbnZhciBuZXQgPSByZXF1aXJlKCduZXQnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBsdHggPSByZXF1aXJlKCdsdHgnKVxuICAsIHJlY29ubmVjdCA9IHJlcXVpcmUoJ3JlY29ubmVjdC1jb3JlJylcbiAgLCBTdHJlYW1QYXJzZXIgPSByZXF1aXJlKCcuL3N0cmVhbV9wYXJzZXInKVxuICAsIHN0YXJ0dGxzID0gcmVxdWlyZSgndGxzLWNvbm5lY3QnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjb25uZWN0aW9uJylcbiAgLCBleHRlbmQgPSByZXF1aXJlKCd1dGlsJykuX2V4dGVuZFxuXG52YXIgTlNfWE1QUF9UTFMgPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLXRscydcbnZhciBOU19TVFJFQU0gPSAnaHR0cDovL2V0aGVyeC5qYWJiZXIub3JnL3N0cmVhbXMnXG52YXIgTlNfWE1QUF9TVFJFQU1TID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1zdHJlYW1zJ1xuXG52YXIgSU5JVElBTF9SRUNPTk5FQ1RfREVMQVkgPSAxZTNcbnZhciBNQVhfUkVDT05ORUNUX0RFTEFZICAgICA9IDMwZTNcblxuZnVuY3Rpb24gZGVmYXVsdEluamVjdGlvbihlbWl0dGVyLCBvcHRzKSB7XG4gICAgLy8gY2xvbmUgb3B0c1xuICAgIHZhciBvcHRpb25zID0gZXh0ZW5kKHt9LCBvcHRzKVxuXG4gICAgLy8gYWRkIGNvbXB1dGVkIG9wdGlvbnNcbiAgICAvKiBqc2hpbnQgLVcwMTQgKi9cbiAgICBvcHRpb25zLmluaXRpYWxEZWxheSA9IChvcHRzICYmIChvcHRzLmluaXRpYWxSZWNvbm5lY3REZWxheVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHx8ICBvcHRzLnJlY29ubmVjdERlbGF5KSkgfHwgSU5JVElBTF9SRUNPTk5FQ1RfREVMQVlcbiAgICBvcHRpb25zLm1heERlbGF5ID0gKG9wdHMgJiYgb3B0cy5tYXhSZWNvbm5lY3REZWxheSkgfHwgTUFYX1JFQ09OTkVDVF9ERUxBWVxuICAgIG9wdGlvbnMuaW1tZWRpYXRlID0gb3B0cyAmJiBvcHRzLnNvY2tldCAmJiAodHlwZW9mIG9wdHMuc29ja2V0ICE9PSAnZnVuY3Rpb24nKVxuICAgIG9wdGlvbnMudHlwZSA9IG9wdHMgJiYgb3B0cy5kZWxheVR5cGVcbiAgICBvcHRpb25zLmVtaXR0ZXIgPSBlbWl0dGVyXG5cbiAgICAvLyByZXR1cm4gY2FsY3VsYXRlZCBvcHRpb25zXG4gICAgcmV0dXJuIG9wdGlvbnNcbn1cblxuLyoqXG4gQmFzZSBjbGFzcyBmb3IgY29ubmVjdGlvbi1iYXNlZCBzdHJlYW1zIChUQ1ApLlxuIFRoZSBzb2NrZXQgcGFyYW1ldGVyIGlzIG9wdGlvbmFsIGZvciBpbmNvbWluZyBjb25uZWN0aW9ucy5cbiovXG5mdW5jdGlvbiBDb25uZWN0aW9uKG9wdHMpIHtcbiAgICBcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5zdHJlYW1BdHRycyA9IChvcHRzICYmIG9wdHMuc3RyZWFtQXR0cnMpIHx8IHt9XG4gICAgdGhpcy54bWxucyA9IChvcHRzICYmIG9wdHMueG1sbnMpIHx8IHt9XG4gICAgdGhpcy54bWxucy5zdHJlYW0gPSBOU19TVFJFQU1cblxuICAgIHRoaXMucmVqZWN0VW5hdXRob3JpemVkID0gKG9wdHMgJiYgb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQpID8gdHJ1ZSA6IGZhbHNlXG4gICAgdGhpcy5zZXJpYWxpemVkID0gKG9wdHMgJiYgb3B0cy5zZXJpYWxpemVkKSA/IHRydWUgOiBmYWxzZVxuICAgIHRoaXMucmVxdWVzdENlcnQgPSAob3B0cyAmJiBvcHRzLnJlcXVlc3RDZXJ0KSA/IHRydWUgOiBmYWxzZVxuXG4gICAgdGhpcy5zZXJ2ZXJuYW1lID0gKG9wdHMgJiYgb3B0cy5zZXJ2ZXJuYW1lKVxuXG4gICAgdGhpcy5fc2V0dXBTb2NrZXQoZGVmYXVsdEluamVjdGlvbih0aGlzLCBvcHRzKSlcbiAgICB0aGlzLm9uY2UoJ3JlY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLnJlY29ubmVjdCA9IG9wdHMgJiYgb3B0cy5yZWNvbm5lY3RcbiAgICB9KVxufVxuXG51dGlsLmluaGVyaXRzKENvbm5lY3Rpb24sIEV2ZW50RW1pdHRlcilcblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuTlNfWE1QUF9UTFMgPSBOU19YTVBQX1RMU1xuQ29ubmVjdGlvbi5OU19TVFJFQU0gPSBOU19TVFJFQU1cbkNvbm5lY3Rpb24ucHJvdG90eXBlLk5TX1hNUFBfU1RSRUFNUyA9IE5TX1hNUFBfU1RSRUFNU1xuLy8gRGVmYXVsdHNcbkNvbm5lY3Rpb24ucHJvdG90eXBlLmFsbG93VExTID0gdHJ1ZVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5fc2V0dXBTb2NrZXQgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgZGVidWcoJ3NldHVwIHNvY2tldCcpXG4gICAgdmFyIHByZXZpb3VzT3B0aW9ucyA9IHt9XG4gICAgdmFyIGluamVjdCA9IHJlY29ubmVjdChmdW5jdGlvbihvcHRzKSB7XG4gICAgICAgIHZhciBwcmV2aW91c1NvY2tldCA9IHRoaXMuc29ja2V0XG4gICAgICAgIC8qIGlmIHRoaXMgb3B0cy5wcmVzZXJ2ZSBpcyBvblxuICAgICAgICAgKiB0aGUgcHJldmlvdXMgb3B0aW9ucyBhcmUgc3RvcmVkIHVudGlsIG5leHQgdGltZS5cbiAgICAgICAgICogdGhpcyBpcyBuZWVkZWQgdG8gcmVzdG9yZSBmcm9tIGEgc2V0U2VjdXJlIGNhbGwuXG4gICAgICAgICAqL1xuICAgICAgICBpZiAob3B0cy5wcmVzZXJ2ZSA9PT0gJ29uJykge1xuICAgICAgICAgICAgb3B0cy5wcmVzZXJ2ZSA9IHByZXZpb3VzT3B0aW9uc1xuICAgICAgICAgICAgcHJldmlvdXNPcHRpb25zID0gb3B0c1xuICAgICAgICB9IGVsc2UgaWYgKG9wdHMucHJlc2VydmUpIHtcbiAgICAgICAgICAgIC8vIHN3aXRjaCBiYWNrIHRvIHRoZSBwcmV2ZXJzZWQgb3B0aW9uc1xuICAgICAgICAgICAgb3B0cyA9IHByZXZpb3VzT3B0aW9ucyA9IG9wdHMucHJlc2VydmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGtlZXAgc29tZSBzdGF0ZSBmb3IgZWcgU1JWLmNvbm5lY3RcbiAgICAgICAgICAgIG9wdHMgPSBwcmV2aW91c09wdGlvbnMgPSBvcHRzIHx8IHByZXZpb3VzT3B0aW9uc1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvcHRzLnNvY2tldCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgZGVidWcoJ3VzZSBsYXp5IHNvY2tldCcpXG4gICAgICAgICAgICAvKiBsYXp5IGV2YWx1YXRpb25cbiAgICAgICAgICAgICAqIChjYW4gYmUgcmV0cmlnZ2VyZWQgYnkgY2FsbGluZyBjb25uZWN0aW9uLmNvbm5lY3QoKVxuICAgICAgICAgICAgICogIHdpdGhvdXQgYXJndW1lbnRzIGFmdGVyIGEgcHJldmlvdXNcbiAgICAgICAgICAgICAqICBjb25uZWN0aW9uLmNvbm5lY3Qoe3NvY2tldDpmdW5jdGlvbigpIHsg4oCmIH19KSkgKi9cbiAgICAgICAgICAgIHRoaXMuc29ja2V0ID0gb3B0cy5zb2NrZXQuY2FsbCh0aGlzKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVidWcoJ3VzZSBzdGFuZGFyZCBzb2NrZXQnKVxuICAgICAgICAgICAgLy8gb25seSB1c2UgdGhpcyBzb2NrZXQgb25jZVxuICAgICAgICAgICAgdGhpcy5zb2NrZXQgPSBvcHRzLnNvY2tldFxuICAgICAgICAgICAgb3B0cy5zb2NrZXQgPSBudWxsXG4gICAgICAgICAgICBpZiAodGhpcy5zb2NrZXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uY2UoJ2Nvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGluamVjdC5vcHRpb25zLmltbWVkaWF0ZSA9IGZhbHNlXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvY2tldCA9IHRoaXMuc29ja2V0IHx8IG5ldyBuZXQuU29ja2V0KClcbiAgICAgICAgaWYgKHByZXZpb3VzU29ja2V0ICE9PSB0aGlzLnNvY2tldCkge1xuICAgICAgICAgICAgdGhpcy5zZXR1cFN0cmVhbSgpXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc29ja2V0XG4gICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgaW5qZWN0KGluamVjdC5vcHRpb25zID0gb3B0aW9ucylcblxuICAgIC8vd3JhcCB0aGUgZW5kIGZ1bmN0aW9uIHByb3ZpZGVkIGJ5IHJlY29ubmVjdC1jb3JlIHRvIHRyaWdnZXIgdGhlIHN0cmVhbSBlbmQgbG9naWNcbiAgICB2YXIgZW5kID0gdGhpcy5lbmRcbiAgICB0aGlzLmVuZCA9IHRoaXMuZGlzY29ubmVjdCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLmVuZFN0cmVhbSgpXG4gICAgICAgIGVuZCgpXG4gICAgfVxuXG4gICAgdGhpcy5vbignY29ubmVjdGlvbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLnBhcnNlcilcbiAgICAgICAgICAgIHRoaXMuc3RhcnRQYXJzZXIoKVxuICAgIH0pXG4gICAgdGhpcy5vbignZW5kJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBwcmV2aW91c09wdGlvbnMgPSB7fVxuICAgIH0pXG59XG5cbi8qKlxuIFVzZWQgYnkgYm90aCB0aGUgY29uc3RydWN0b3IgYW5kIGJ5IHJlaW5pdGlhbGl6YXRpb24gaW4gc2V0U2VjdXJlKCkuXG4qL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuc2V0dXBTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICBkZWJ1Zygnc2V0dXAgc3RyZWFtJylcbiAgICB0aGlzLnNvY2tldC5vbignZW5kJywgdGhpcy5vbkVuZC5iaW5kKHRoaXMpKVxuICAgIHRoaXMuc29ja2V0Lm9uKCdkYXRhJywgdGhpcy5vbkRhdGEuYmluZCh0aGlzKSlcbiAgICB0aGlzLnNvY2tldC5vbignY2xvc2UnLCB0aGlzLm9uQ2xvc2UuYmluZCh0aGlzKSlcbiAgICAvLyBsZXQgdGhlbSBzbmlmZiB1bnBhcnNlZCBYTUxcbiAgICB0aGlzLnNvY2tldC5vbignZGF0YScsICB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZGF0YScpKVxuICAgIHRoaXMuc29ja2V0Lm9uKCdkcmFpbicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkcmFpbicpKVxuICAgIC8vIGlnbm9yZSBlcnJvcnMgYWZ0ZXIgZGlzY29ubmVjdFxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIGZ1bmN0aW9uICgpIHsgfSlcblxuICAgIGlmICghdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAqIFRoaXMgaXMgb3B0aW1pemVkIGZvciBjb250aW51b3VzIFRDUCBzdHJlYW1zLiBJZiB5b3VyIFwic29ja2V0XCJcbiAgICAgICAgKiBhY3R1YWxseSB0cmFuc3BvcnRzIGZyYW1lcyAoV2ViU29ja2V0cykgYW5kIHlvdSBjYW4ndCBoYXZlXG4gICAgICAgICogc3RhbnphcyBzcGxpdCBhY3Jvc3MgdGhvc2UsIHVzZTpcbiAgICAgICAgKiAgICAgY2IoZWwudG9TdHJpbmcoKSlcbiAgICAgICAgKi9cbiAgICAgICAgaWYgKHRoaXMuc2VyaWFsaXplZCkge1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphID0gZnVuY3Rpb24oZWwsIGNiKSB7XG4gICAgICAgICAgICAgICAgLy8gQ29udGludW91c2x5IHdyaXRlIG91dFxuICAgICAgICAgICAgICAgIGVsLndyaXRlKGZ1bmN0aW9uKHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IocylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphID0gZnVuY3Rpb24oZWwsIGNiKSB7XG4gICAgICAgICAgICAgICAgY2IoZWwudG9TdHJpbmcoKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5zb2NrZXQucGF1c2UpIHRoaXMuc29ja2V0LnBhdXNlKClcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuc29ja2V0LnJlc3VtZSkgdGhpcy5zb2NrZXQucmVzdW1lKClcbn1cblxuLyoqIENsaW1icyB0aGUgc3RhbnphIHVwIGlmIGEgY2hpbGQgd2FzIHBhc3NlZCxcbiAgICBidXQgeW91IGNhbiBzZW5kIHN0cmluZ3MgYW5kIGJ1ZmZlcnMgdG9vLlxuXG4gICAgUmV0dXJucyB3aGV0aGVyIHRoZSBzb2NrZXQgZmx1c2hlZCBkYXRhLlxuKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICB2YXIgZmx1c2hlZCA9IHRydWVcbiAgICBpZiAoIXRoaXMuc29ja2V0KSB7XG4gICAgICAgIHJldHVybiAvLyBEb2ghXG4gICAgfVxuICAgIGlmICghdGhpcy5zb2NrZXQud3JpdGFibGUpIHtcbiAgICAgICAgdGhpcy5zb2NrZXQuZW5kKClcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgZGVidWcoJ3NlbmQ6ICcgKyBzdGFuemEudG9TdHJpbmcoKSlcbiAgICBpZiAoc3RhbnphLnJvb3QpIHtcbiAgICAgICAgdmFyIGVsID0gdGhpcy5ybVhtbG5zKHN0YW56YS5yb290KCkpXG4gICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YShlbCwgZnVuY3Rpb24ocykge1xuICAgICAgICAgICAgZmx1c2hlZCA9IHRoaXMud3JpdGUocylcbiAgICAgICAgfS5iaW5kKHRoaXMuc29ja2V0KSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBmbHVzaGVkID0gdGhpcy5zb2NrZXQud3JpdGUoc3RhbnphKVxuICAgIH1cbiAgICByZXR1cm4gZmx1c2hlZFxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IFN0cmVhbVBhcnNlci5TdHJlYW1QYXJzZXIodGhpcy5tYXhTdGFuemFTaXplKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0cmVhbVN0YXJ0JywgZnVuY3Rpb24oYXR0cnMpIHtcbiAgICAgICAgLyogV2UgbmVlZCB0aG9zZSB4bWxucyBvZnRlbiwgc3RvcmUgdGhlbSBleHRyYSAqL1xuICAgICAgICBzZWxmLnN0cmVhbU5zQXR0cnMgPSB7fVxuICAgICAgICBmb3IgKHZhciBrIGluIGF0dHJzKSB7XG4gICAgICAgICAgICBpZiAoayA9PT0gJ3htbG5zJyB8fCAoay5zdWJzdHIoMCwgNikgPT09ICd4bWxuczonKSlcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmVhbU5zQXR0cnNba10gPSBhdHRyc1trXVxuICAgICAgICB9XG5cbiAgICAgICAgLyogTm90aWZ5IGluIGNhc2Ugd2UgZG9uJ3Qgd2FpdCBmb3IgPHN0cmVhbTpmZWF0dXJlcy8+XG4gICAgICAgICAgIChDb21wb25lbnQgb3Igbm9uLTEuMCBzdHJlYW1zKVxuICAgICAgICAgKi9cbiAgICAgICAgc2VsZi5lbWl0KCdzdHJlYW1TdGFydCcsIGF0dHJzKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YW56YScsIGZ1bmN0aW9uKHN0YW56YSkge1xuICAgICAgICBzZWxmLm9uU3RhbnphKHNlbGYuYWRkU3RyZWFtTnMoc3RhbnphKSlcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgc2VsZi5lcnJvcihlLmNvbmRpdGlvbiB8fCAnaW50ZXJuYWwtc2VydmVyLWVycm9yJywgZS5tZXNzYWdlKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub25jZSgnZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuc3RvcFBhcnNlcigpXG4gICAgICAgIGlmIChzZWxmLnJlY29ubmVjdCkge1xuICAgICAgICAgICAgc2VsZi5vbmNlKCdyZWNvbm5lY3QnLCBzZWxmLnN0YXJ0UGFyc2VyLmJpbmQoc2VsZikpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmVuZCgpXG4gICAgICAgIH1cbiAgICB9KVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zdG9wUGFyc2VyID0gZnVuY3Rpb24oKSB7XG4gICAgLyogTm8gbW9yZSBldmVudHMsIHBsZWFzZSAobWF5IGhhcHBlbiBob3dldmVyKSAqL1xuICAgIGlmICh0aGlzLnBhcnNlcikge1xuICAgICAgICB2YXIgcGFyc2VyID0gdGhpcy5wYXJzZXJcbiAgICAgICAgLyogR2V0IEdDJ2VkICovXG4gICAgICAgIHRoaXMucGFyc2VyID0gbnVsbFxuICAgICAgICBwYXJzZXIuZW5kKClcbiAgICB9XG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnN0YXJ0U3RyZWFtID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGF0dHJzID0ge31cbiAgICBmb3IgKHZhciBrIGluIHRoaXMueG1sbnMpIHtcbiAgICAgICAgaWYgKHRoaXMueG1sbnMuaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgIGlmICghaykge1xuICAgICAgICAgICAgICAgIGF0dHJzLnhtbG5zID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyc1sneG1sbnM6JyArIGtdID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGZvciAoayBpbiB0aGlzLnN0cmVhbUF0dHJzKSB7XG4gICAgICAgIGlmICh0aGlzLnN0cmVhbUF0dHJzLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBhdHRyc1trXSA9IHRoaXMuc3RyZWFtQXR0cnNba11cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGlmICh0aGlzLnN0cmVhbVRvKSB7IC8vIGluIGNhc2Ugb2YgYSBjb21wb25lbnQgY29ubmVjdGluZ1xuICAgICAgICBhdHRycy50byA9IHRoaXMuc3RyZWFtVG9cbiAgICB9XG5cbiAgICB2YXIgZWwgPSBuZXcgbHR4LkVsZW1lbnQoJ3N0cmVhbTpzdHJlYW0nLCBhdHRycylcbiAgICAvLyBtYWtlIGl0IG5vbi1lbXB0eSB0byBjdXQgdGhlIGNsb3NpbmcgdGFnXG4gICAgZWwudCgnICcpXG4gICAgdmFyIHMgPSBlbC50b1N0cmluZygpXG4gICAgdGhpcy5zZW5kKHMuc3Vic3RyKDAsIHMuaW5kZXhPZignIDwvc3RyZWFtOnN0cmVhbT4nKSkpXG5cbiAgICB0aGlzLnN0cmVhbU9wZW5lZCA9IHRydWVcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuZW5kU3RyZWFtID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuc29ja2V0ICYmIHRoaXMuc29ja2V0LndyaXRhYmxlKSB7XG4gICAgICAgIGlmICh0aGlzLnN0cmVhbU9wZW5lZCkge1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQud3JpdGUoJzwvc3RyZWFtOnN0cmVhbT4nKVxuICAgICAgICAgICAgdGhpcy5zdHJlYW1PcGVuZWQgPSBmYWxzZVxuICAgICAgICB9XG4gICAgfVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5vbkRhdGEgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgZGVidWcoJ3JlY2VpdmU6ICcgKyBkYXRhLnRvU3RyaW5nKCd1dGY4JykpXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIHRoaXMucGFyc2VyLndyaXRlKGRhdGEpXG4gICAgfVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zZXRTZWN1cmUgPSBmdW5jdGlvbihjcmVkZW50aWFscywgaXNTZXJ2ZXIpIHtcbiAgICAvLyBSZW1vdmUgb2xkIGV2ZW50IGxpc3RlbmVyc1xuICAgIHRoaXMuc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnZGF0YScpXG4gICAgLy8gcmV0YWluIHNvY2tldCAnZW5kJyBsaXN0ZW5lcnMgYmVjYXVzZSBzc2wgbGF5ZXIgZG9lc24ndCBzdXBwb3J0IGl0XG4gICAgdGhpcy5zb2NrZXQucmVtb3ZlQWxsTGlzdGVuZXJzKCdkcmFpbicpXG4gICAgdGhpcy5zb2NrZXQucmVtb3ZlQWxsTGlzdGVuZXJzKCdjbG9zZScpXG4gICAgLy8gcmVtb3ZlIGlkbGVfdGltZW91dFxuICAgIGlmICh0aGlzLnNvY2tldC5jbGVhclRpbWVyKSB7XG4gICAgICAgIHRoaXMuc29ja2V0LmNsZWFyVGltZXIoKVxuICAgIH1cblxuICAgIHZhciBjbGVhcnRleHQgPSBzdGFydHRscyh7XG4gICAgICAgIHNvY2tldDogdGhpcy5zb2NrZXQsXG4gICAgICAgIHJlamVjdFVuYXV0aG9yaXplZDogdGhpcy5yZWplY3RVbmF1dGhvcml6ZWQsXG4gICAgICAgIGNyZWRlbnRpYWxzOiBjcmVkZW50aWFscyB8fCB0aGlzLmNyZWRlbnRpYWxzLFxuICAgICAgICByZXF1ZXN0Q2VydDogdGhpcy5yZXF1ZXN0Q2VydCxcbiAgICAgICAgaXNTZXJ2ZXI6ICEhaXNTZXJ2ZXJcbiAgICB9LCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5pc1NlY3VyZSA9IHRydWVcbiAgICAgICAgdGhpcy5vbmNlKCdkaXNjb25uZWN0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5pc1NlY3VyZSA9IGZhbHNlXG4gICAgICAgIH0pXG4gICAgICAgIGNsZWFydGV4dC5lbWl0KCdjb25uZWN0JywgY2xlYXJ0ZXh0KVxuICAgIH0uYmluZCh0aGlzKSlcbiAgICBjbGVhcnRleHQub24oJ2NsaWVudEVycm9yJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Vycm9yJykpXG4gICAgaWYgKCF0aGlzLnJlY29ubmVjdCkge1xuICAgICAgICB0aGlzLnJlY29ubmVjdCA9IHRydWUgLy8gbmVlZCB0aGlzIHNvIHN0b3BQYXJzZXIgd29ya3MgcHJvcGVybHlcbiAgICAgICAgdGhpcy5vbmNlKCdyZWNvbm5lY3QnLCBmdW5jdGlvbigpIHsgdGhpcy5yZWNvbm5lY3QgPSBmYWxzZSB9KVxuICAgIH1cbiAgICB0aGlzLnN0b3BQYXJzZXIoKVxuICAgIC8vIGlmIHdlIHJlY29ubmVjdCB3ZSBuZWVkIHRvIGdldCBiYWNrIHRvIHRoZSBwcmV2aW91cyBzb2NrZXQgY3JlYXRpb25cbiAgICB0aGlzLmxpc3Rlbih7IHNvY2tldDogY2xlYXJ0ZXh0LCBwcmVzZXJ2ZTonb24nIH0pXG59XG5cbmZ1bmN0aW9uIGdldEFsbFRleHQoZWwpIHtcbiAgICByZXR1cm4gIWVsLmNoaWxkcmVuID8gZWwgOiBlbC5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24odGV4dCwgY2hpbGQpIHtcbiAgICAgICAgcmV0dXJuIHRleHQgKyBnZXRBbGxUZXh0KGNoaWxkKVxuICAgIH0sICcnKVxufVxuXG4vKipcbiAqIFRoaXMgaXMgbm90IGFuIGV2ZW50IGxpc3RlbmVyLCBidXQgdGFrZXMgY2FyZSBvZiB0aGUgVExTIGhhbmRzaGFrZVxuICogYmVmb3JlICdzdGFuemEnIGV2ZW50cyBhcmUgZW1pdHRlZCB0byB0aGUgZGVyaXZlZCBjbGFzc2VzLlxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5vblN0YW56YSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuaXMoJ2Vycm9yJywgTlNfU1RSRUFNKSkge1xuICAgICAgICB2YXIgZXJyb3IgPSBuZXcgRXJyb3IoJycgKyBnZXRBbGxUZXh0KHN0YW56YSkpXG4gICAgICAgIGVycm9yLnN0YW56YSA9IHN0YW56YVxuICAgICAgICB0aGlzLnNvY2tldC5lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgIH0gZWxzZSBpZiAoc3RhbnphLmlzKCdmZWF0dXJlcycsIHRoaXMuTlNfU1RSRUFNKSAmJlxuICAgICAgICB0aGlzLmFsbG93VExTICYmXG4gICAgICAgICF0aGlzLmlzU2VjdXJlICYmXG4gICAgICAgIHN0YW56YS5nZXRDaGlsZCgnc3RhcnR0bHMnLCB0aGlzLk5TX1hNUFBfVExTKSkge1xuICAgICAgICAvKiBTaWduYWwgd2lsbGluZ25lc3MgdG8gcGVyZm9ybSBUTFMgaGFuZHNoYWtlICovXG4gICAgICAgIHRoaXMuc2VuZChuZXcgbHR4LkVsZW1lbnQoJ3N0YXJ0dGxzJywgeyB4bWxuczogdGhpcy5OU19YTVBQX1RMUyB9KSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuYWxsb3dUTFMgJiZcbiAgICAgICAgc3RhbnphLmlzKCdwcm9jZWVkJywgdGhpcy5OU19YTVBQX1RMUykpIHtcbiAgICAgICAgLyogU2VydmVyIGlzIHdhaXRpbmcgZm9yIFRMUyBoYW5kc2hha2UgKi9cbiAgICAgICAgdGhpcy5zZXRTZWN1cmUoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnc3RhbnphJywgc3RhbnphKVxuICAgIH1cbn1cblxuLyoqXG4gKiBBZGQgc3RyZWFtIHhtbG5zIHRvIGEgc3RhbnphXG4gKlxuICogRG9lcyBub3QgYWRkIG91ciBkZWZhdWx0IHhtbG5zIGFzIGl0IGlzIGRpZmZlcmVudCBmb3JcbiAqIEMyUy9TMlMvQ29tcG9uZW50IGNvbm5lY3Rpb25zLlxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5hZGRTdHJlYW1OcyA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGZvciAodmFyIGF0dHIgaW4gdGhpcy5zdHJlYW1Oc0F0dHJzKSB7XG4gICAgICAgIGlmICghc3RhbnphLmF0dHJzW2F0dHJdICYmXG4gICAgICAgICAgICAhKChhdHRyID09PSAneG1sbnMnKSAmJiAodGhpcy5zdHJlYW1Oc0F0dHJzW2F0dHJdID09PSB0aGlzLnhtbG5zWycnXSkpXG4gICAgICAgICAgICkge1xuICAgICAgICAgICAgc3RhbnphLmF0dHJzW2F0dHJdID0gdGhpcy5zdHJlYW1Oc0F0dHJzW2F0dHJdXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0YW56YVxufVxuXG4vKipcbiAqIFJlbW92ZSBzdXBlcmZsdW91cyB4bWxucyB0aGF0IHdlcmUgYWxlYWR5IGRlY2xhcmVkIGluXG4gKiBvdXIgPHN0cmVhbTpzdHJlYW0+XG4gKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnJtWG1sbnMgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBmb3IgKHZhciBwcmVmaXggaW4gdGhpcy54bWxucykge1xuICAgICAgICB2YXIgYXR0ciA9IHByZWZpeCA/ICd4bWxuczonICsgcHJlZml4IDogJ3htbG5zJ1xuICAgICAgICBpZiAoc3RhbnphLmF0dHJzW2F0dHJdID09PSB0aGlzLnhtbG5zW3ByZWZpeF0pIHtcbiAgICAgICAgICAgIHN0YW56YS5hdHRyc1thdHRyXSA9IG51bGxcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gc3RhbnphXG59XG5cbi8qKlxuICogWE1QUC1zdHlsZSBlbmQgY29ubmVjdGlvbiBmb3IgdXNlclxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5vbkVuZCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW5kU3RyZWFtKClcbiAgICBpZiAoIXRoaXMucmVjb25uZWN0KSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICB9XG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLm9uQ2xvc2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMucmVjb25uZWN0KSB7XG4gICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnKVxuICAgIH1cbn1cblxuLyoqXG4gKiBFbmQgY29ubmVjdGlvbiB3aXRoIHN0cmVhbSBlcnJvci5cbiAqIEVtaXRzICdlcnJvcicgZXZlbnQgdG9vLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBjb25kaXRpb24gWE1QUCBlcnJvciBjb25kaXRpb24sIHNlZSBSRkMzOTIwIDQuNy4zLiBEZWZpbmVkIENvbmRpdGlvbnNcbiAqIEBwYXJhbSB7U3RyaW5nfSB0ZXh0IE9wdGlvbmFsIGVycm9yIG1lc3NhZ2VcbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihjb25kaXRpb24sIG1lc3NhZ2UpIHtcbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgbmV3IEVycm9yKG1lc3NhZ2UpKVxuXG4gICAgaWYgKCF0aGlzLnNvY2tldCB8fCAhdGhpcy5zb2NrZXQud3JpdGFibGUpIHJldHVyblxuXG4gICAgLyogUkZDIDM5MjAsIDQuNy4xIHN0cmVhbS1sZXZlbCBlcnJvcnMgcnVsZXMgKi9cbiAgICBpZiAoIXRoaXMuc3RyZWFtT3BlbmVkKSB0aGlzLnN0YXJ0U3RyZWFtKClcblxuICAgIHZhciBlcnJvciA9IG5ldyBsdHguRWxlbWVudCgnc3RyZWFtOmVycm9yJylcbiAgICBlcnJvci5jKGNvbmRpdGlvbiwgeyB4bWxuczogTlNfWE1QUF9TVFJFQU1TIH0pXG4gICAgaWYgKG1lc3NhZ2UpIHtcbiAgICAgICAgZXJyb3IuYyggJ3RleHQnLCB7XG4gICAgICAgICAgICB4bWxuczogTlNfWE1QUF9TVFJFQU1TLFxuICAgICAgICAgICAgJ3htbDpsYW5nJzogJ2VuJ1xuICAgICAgICB9KS50KG1lc3NhZ2UpXG4gICAgfVxuXG4gICAgdGhpcy5zZW5kKGVycm9yKVxuICAgIHRoaXMuZW5kKClcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDb25uZWN0aW9uXG4iLCJ2YXIgU3RyaW5nUHJlcCA9IHJlcXVpcmUoJ25vZGUtc3RyaW5ncHJlcCcpLlN0cmluZ1ByZXBcbiAgLCB0b1VuaWNvZGUgPSByZXF1aXJlKCdub2RlLXN0cmluZ3ByZXAnKS50b1VuaWNvZGVcblxuXG4vKipcbiAqIEpJRCBpbXBsZW1lbnRzIFxuICogLSBYbXBwIGFkZHJlc3NlcyBhY2NvcmRpbmcgdG8gUkZDNjEyMlxuICogLSBYRVAtMDEwNjogSklEIEVzY2FwaW5nXG4gKlxuICogQHNlZSBodHRwOi8vdG9vbHMuaWV0Zi5vcmcvaHRtbC9yZmM2MTIyI3NlY3Rpb24tMlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDEwNi5odG1sXG4gKi9cbmZ1bmN0aW9uIEpJRChhLCBiLCBjKSB7XG4gICAgdGhpcy5sb2NhbCA9IG51bGxcbiAgICB0aGlzLmRvbWFpbiA9IG51bGxcbiAgICB0aGlzLnJlc291cmNlID0gbnVsbFxuXG4gICAgaWYgKGEgJiYgKCFiKSAmJiAoIWMpKSB7XG4gICAgICAgIHRoaXMucGFyc2VKSUQoYSlcbiAgICB9IGVsc2UgaWYgKGIpIHtcbiAgICAgICAgdGhpcy5zZXRMb2NhbChhKVxuICAgICAgICB0aGlzLnNldERvbWFpbihiKVxuICAgICAgICB0aGlzLnNldFJlc291cmNlKGMpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBcmd1bWVudCBlcnJvcicpXG4gICAgfVxufVxuXG5KSUQucHJvdG90eXBlLnBhcnNlSklEID0gZnVuY3Rpb24ocykge1xuICAgIGlmIChzLmluZGV4T2YoJ0AnKSA+PSAwKSB7XG4gICAgICAgIHRoaXMuc2V0TG9jYWwocy5zdWJzdHIoMCwgcy5sYXN0SW5kZXhPZignQCcpKSlcbiAgICAgICAgcyA9IHMuc3Vic3RyKHMubGFzdEluZGV4T2YoJ0AnKSArIDEpXG4gICAgfVxuICAgIGlmIChzLmluZGV4T2YoJy8nKSA+PSAwKSB7XG4gICAgICAgIHRoaXMuc2V0UmVzb3VyY2Uocy5zdWJzdHIocy5pbmRleE9mKCcvJykgKyAxKSlcbiAgICAgICAgcyA9IHMuc3Vic3RyKDAsIHMuaW5kZXhPZignLycpKVxuICAgIH1cbiAgICB0aGlzLnNldERvbWFpbihzKVxufVxuXG5KSUQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24odW5lc2NhcGUpIHtcbiAgICB2YXIgcyA9IHRoaXMuZG9tYWluXG4gICAgaWYgKHRoaXMubG9jYWwpIHMgPSB0aGlzLmdldExvY2FsKHVuZXNjYXBlKSArICdAJyArIHNcbiAgICBpZiAodGhpcy5yZXNvdXJjZSkgcyA9IHMgKyAnLycgKyB0aGlzLnJlc291cmNlXG4gICAgcmV0dXJuIHNcbn1cblxuLyoqXG4gKiBDb252ZW5pZW5jZSBtZXRob2QgdG8gZGlzdGluZ3Vpc2ggdXNlcnNcbiAqKi9cbkpJRC5wcm90b3R5cGUuYmFyZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnJlc291cmNlKSB7XG4gICAgICAgIHJldHVybiBuZXcgSklEKHRoaXMubG9jYWwsIHRoaXMuZG9tYWluLCBudWxsKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxufVxuXG4vKipcbiAqIENvbXBhcmlzb24gZnVuY3Rpb25cbiAqKi9cbkpJRC5wcm90b3R5cGUuZXF1YWxzID0gZnVuY3Rpb24ob3RoZXIpIHtcbiAgICByZXR1cm4gKHRoaXMubG9jYWwgPT09IG90aGVyLmxvY2FsKSAmJlxuICAgICAgICAodGhpcy5kb21haW4gPT09IG90aGVyLmRvbWFpbikgJiZcbiAgICAgICAgKHRoaXMucmVzb3VyY2UgPT09IG90aGVyLnJlc291cmNlKVxufVxuXG4vKiBEZXByZWNhdGVkLCB1c2Ugc2V0TG9jYWwoKSBbc2VlIFJGQzYxMjJdICovXG5KSUQucHJvdG90eXBlLnNldFVzZXIgPSBmdW5jdGlvbih1c2VyKSB7XG4gICAgcmV0dXJuIHRoaXMuc2V0TG9jYWwodXNlcilcbn1cblxuLyoqXG4gKiBTZXR0ZXJzIHRoYXQgZG8gc3RyaW5ncHJlcCBub3JtYWxpemF0aW9uLlxuICoqL1xuSklELnByb3RvdHlwZS5zZXRMb2NhbCA9IGZ1bmN0aW9uKGxvY2FsLCBlc2NhcGUpIHtcbiAgICBlc2NhcGUgPSBlc2NhcGUgfHwgdGhpcy5kZXRlY3RFc2NhcGUobG9jYWwpXG5cbiAgICBpZiAoZXNjYXBlKSB7XG4gICAgICAgIGxvY2FsID0gdGhpcy5lc2NhcGVMb2NhbChsb2NhbClcbiAgICB9XG5cbiAgICB0aGlzLmxvY2FsID0gdGhpcy51c2VyID0gbG9jYWwgJiYgdGhpcy5wcmVwKCdub2RlcHJlcCcsIGxvY2FsKVxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogaHR0cDovL3htcHAub3JnL3JmY3MvcmZjNjEyMi5odG1sI2FkZHJlc3NpbmctZG9tYWluXG4gKi9cbkpJRC5wcm90b3R5cGUuc2V0RG9tYWluID0gZnVuY3Rpb24oZG9tYWluKSB7XG4gICAgdGhpcy5kb21haW4gPSBkb21haW4gJiZcbiAgICAgICAgdGhpcy5wcmVwKCduYW1lcHJlcCcsIGRvbWFpbi5zcGxpdCgnLicpLm1hcCh0b1VuaWNvZGUpLmpvaW4oJy4nKSlcbiAgICByZXR1cm4gdGhpc1xufVxuXG5KSUQucHJvdG90eXBlLnNldFJlc291cmNlID0gZnVuY3Rpb24ocmVzb3VyY2UpIHtcbiAgICB0aGlzLnJlc291cmNlID0gcmVzb3VyY2UgJiYgdGhpcy5wcmVwKCdyZXNvdXJjZXByZXAnLCByZXNvdXJjZSlcbiAgICByZXR1cm4gdGhpc1xufVxuXG5KSUQucHJvdG90eXBlLmdldExvY2FsID0gZnVuY3Rpb24odW5lc2NhcGUpIHtcbiAgICB1bmVzY2FwZSA9IHVuZXNjYXBlIHx8IGZhbHNlXG4gICAgdmFyIGxvY2FsID0gbnVsbFxuICAgIFxuICAgIGlmICh1bmVzY2FwZSkge1xuICAgICAgICBsb2NhbCA9IHRoaXMudW5lc2NhcGVMb2NhbCh0aGlzLmxvY2FsKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGxvY2FsID0gdGhpcy5sb2NhbFxuICAgIH1cblxuICAgIHJldHVybiBsb2NhbDtcbn1cblxuSklELnByb3RvdHlwZS5wcmVwID0gZnVuY3Rpb24ob3BlcmF0aW9uLCB2YWx1ZSkge1xuICAgIHZhciBwID0gbmV3IFN0cmluZ1ByZXAob3BlcmF0aW9uKVxuICAgIHJldHVybiBwLnByZXBhcmUodmFsdWUpXG59XG5cbi8qIERlcHJlY2F0ZWQsIHVzZSBnZXRMb2NhbCgpIFtzZWUgUkZDNjEyMl0gKi9cbkpJRC5wcm90b3R5cGUuZ2V0VXNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldExvY2FsKClcbn1cblxuSklELnByb3RvdHlwZS5nZXREb21haW4gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5kb21haW5cbn1cblxuSklELnByb3RvdHlwZS5nZXRSZXNvdXJjZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnJlc291cmNlXG59XG5cbkpJRC5wcm90b3R5cGUuZGV0ZWN0RXNjYXBlID0gZnVuY3Rpb24gKGxvY2FsKSB7XG4gICAgaWYgKCFsb2NhbCkgcmV0dXJuIGZhbHNlXG5cbiAgICAvLyByZW1vdmUgYWxsIGVzY2FwZWQgc2VjcXVlbmNlc1xuICAgIHZhciB0bXAgPSBsb2NhbC5yZXBsYWNlKC9cXFxcMjAvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjIvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjYvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjcvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMmYvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2EvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2MvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2UvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNDAvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNWMvZywgJycpXG5cbiAgICAvLyBkZXRlY3QgaWYgd2UgaGF2ZSB1bmVzY2FwZWQgc2VxdWVuY2VzXG4gICAgdmFyIHNlYXJjaCA9IHRtcC5zZWFyY2goL1xcXFx8IHxcXFwifFxcJnxcXCd8XFwvfDp8PHw+fEAvZyk7XG4gICAgaWYgKHNlYXJjaCA9PT0gLTEpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG59XG5cbi8qKiBcbiAqIEVzY2FwZSB0aGUgbG9jYWwgcGFydCBvZiBhIEpJRC5cbiAqXG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTA2Lmh0bWxcbiAqIEBwYXJhbSBTdHJpbmcgbG9jYWwgbG9jYWwgcGFydCBvZiBhIGppZFxuICogQHJldHVybiBBbiBlc2NhcGVkIGxvY2FsIHBhcnRcbiAqL1xuSklELnByb3RvdHlwZS5lc2NhcGVMb2NhbCA9IGZ1bmN0aW9uIChsb2NhbCkge1xuICAgIGlmIChsb2NhbCA9PT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgIC8qIGpzaGludCAtVzA0NCAqL1xuICAgIHJldHVybiBsb2NhbC5yZXBsYWNlKC9eXFxzK3xcXHMrJC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFw1YycpXG4gICAgICAgIC5yZXBsYWNlKC8gL2csICdcXFxcMjAnKVxuICAgICAgICAucmVwbGFjZSgvXFxcIi9nLCAnXFxcXDIyJylcbiAgICAgICAgLnJlcGxhY2UoL1xcJi9nLCAnXFxcXDI2JylcbiAgICAgICAgLnJlcGxhY2UoL1xcJy9nLCAnXFxcXDI3JylcbiAgICAgICAgLnJlcGxhY2UoL1xcLy9nLCAnXFxcXDJmJylcbiAgICAgICAgLnJlcGxhY2UoLzovZywgJ1xcXFwzYScpXG4gICAgICAgIC5yZXBsYWNlKC88L2csICdcXFxcM2MnKVxuICAgICAgICAucmVwbGFjZSgvPi9nLCAnXFxcXDNlJylcbiAgICAgICAgLnJlcGxhY2UoL0AvZywgJ1xcXFw0MCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXDNhL2csICdcXDVjM2EnKVxuICAgICAgIFxuICAgIFxufVxuXG4vKiogXG4gKiBVbmVzY2FwZSBhIGxvY2FsIHBhcnQgb2YgYSBKSUQuXG4gKlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDEwNi5odG1sXG4gKiBAcGFyYW0gU3RyaW5nIGxvY2FsIGxvY2FsIHBhcnQgb2YgYSBqaWRcbiAqIEByZXR1cm4gdW5lc2NhcGVkIGxvY2FsIHBhcnRcbiAqL1xuSklELnByb3RvdHlwZS51bmVzY2FwZUxvY2FsID0gZnVuY3Rpb24gKGxvY2FsKSB7XG4gICAgaWYgKGxvY2FsID09PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIGxvY2FsLnJlcGxhY2UoL1xcXFwyMC9nLCAnICcpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjIvZywgJ1xcXCInKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDI2L2csICcmJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyNy9nLCAnXFwnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyZi9nLCAnLycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2EvZywgJzonKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNjL2csICc8JylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzZS9nLCAnPicpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNDAvZywgJ0AnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDVjL2csICdcXFxcJylcbn1cblxuaWYgKCh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpICYmIChleHBvcnRzICE9PSBudWxsKSkge1xuICAgIG1vZHVsZS5leHBvcnRzID0gSklEXG59IGVsc2UgaWYgKCh0eXBlb2Ygd2luZG93ICE9PSAndW5kZWZpbmVkJykgJiYgKHdpbmRvdyAhPT0gbnVsbCkpIHtcbiAgICB3aW5kb3cuSklEID0gSklEXG59XG4iLCIndXNlIHN0cmljdCc7XG5cblxudmFyIGRucyA9IHJlcXVpcmUoJ2RucycpXG5cbmZ1bmN0aW9uIGNvbXBhcmVOdW1iZXJzKGEsIGIpIHtcbiAgICBhID0gcGFyc2VJbnQoYSwgMTApXG4gICAgYiA9IHBhcnNlSW50KGIsIDEwKVxuICAgIGlmIChhIDwgYilcbiAgICAgICAgcmV0dXJuIC0xXG4gICAgaWYgKGEgPiBiKVxuICAgICAgICByZXR1cm4gMVxuICAgIHJldHVybiAwXG59XG5cbmZ1bmN0aW9uIGdyb3VwU3J2UmVjb3JkcyhhZGRycykge1xuICAgIHZhciBncm91cHMgPSB7fSAgLy8gYnkgcHJpb3JpdHlcbiAgICBhZGRycy5mb3JFYWNoKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgaWYgKCFncm91cHMuaGFzT3duUHJvcGVydHkoYWRkci5wcmlvcml0eSkpXG4gICAgICAgICAgICBncm91cHNbYWRkci5wcmlvcml0eV0gPSBbXVxuXG4gICAgICAgIGdyb3Vwc1thZGRyLnByaW9yaXR5XS5wdXNoKGFkZHIpXG4gICAgfSlcblxuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIE9iamVjdC5rZXlzKGdyb3Vwcykuc29ydChjb21wYXJlTnVtYmVycykuZm9yRWFjaChmdW5jdGlvbihwcmlvcml0eSkge1xuICAgICAgICB2YXIgZ3JvdXAgPSBncm91cHNbcHJpb3JpdHldXG4gICAgICAgIHZhciB0b3RhbFdlaWdodCA9IDBcbiAgICAgICAgZ3JvdXAuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICB0b3RhbFdlaWdodCArPSBhZGRyLndlaWdodFxuICAgICAgICB9KVxuICAgICAgICB2YXIgdyA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIHRvdGFsV2VpZ2h0KVxuICAgICAgICB0b3RhbFdlaWdodCA9IDBcbiAgICAgICAgdmFyIGNhbmRpZGF0ZSA9IGdyb3VwWzBdXG4gICAgICAgIGdyb3VwLmZvckVhY2goZnVuY3Rpb24oYWRkcikge1xuICAgICAgICAgICAgdG90YWxXZWlnaHQgKz0gYWRkci53ZWlnaHRcbiAgICAgICAgICAgIGlmICh3IDwgdG90YWxXZWlnaHQpXG4gICAgICAgICAgICAgICAgY2FuZGlkYXRlID0gYWRkclxuICAgICAgICB9KVxuICAgICAgICBpZiAoY2FuZGlkYXRlKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2FuZGlkYXRlKVxuICAgIH0pXG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5mdW5jdGlvbiByZXNvbHZlU3J2KG5hbWUsIGNiKSB7XG4gICAgZG5zLnJlc29sdmVTcnYobmFtZSwgZnVuY3Rpb24oZXJyLCBhZGRycykge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAvKiBubyBTUlYgcmVjb3JkLCB0cnkgZG9tYWluIGFzIEEgKi9cbiAgICAgICAgICAgIGNiKGVycilcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciBwZW5kaW5nID0gMCwgZXJyb3IsIHJlc3VsdHMgPSBbXVxuICAgICAgICAgICAgdmFyIGNiMSA9IGZ1bmN0aW9uKGUsIGFkZHJzMSkge1xuICAgICAgICAgICAgICAgIGVycm9yID0gZXJyb3IgfHwgZVxuICAgICAgICAgICAgICAgIHJlc3VsdHMgPSByZXN1bHRzLmNvbmNhdChhZGRyczEpXG4gICAgICAgICAgICAgICAgcGVuZGluZy0tXG4gICAgICAgICAgICAgICAgaWYgKHBlbmRpbmcgPCAxKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHJlc3VsdHMgPyBudWxsIDogZXJyb3IsIHJlc3VsdHMpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIGdTUlYgPSBncm91cFNydlJlY29yZHMoYWRkcnMpXG4gICAgICAgICAgICBwZW5kaW5nID0gZ1NSVi5sZW5ndGhcbiAgICAgICAgICAgIGdTUlYuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICAgICAgcmVzb2x2ZUhvc3QoYWRkci5uYW1lLCBmdW5jdGlvbihlLCBhKSB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBhID0gYS5tYXAoZnVuY3Rpb24oYTEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lOiBhMSwgcG9ydDogYWRkci5wb3J0IH1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY2IxKGUsIGEpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICB9KVxufVxuXG4vLyBvbmUgb2YgYm90aCBBICYgQUFBQSwgaW4gY2FzZSBvZiBicm9rZW4gdHVubmVsc1xuZnVuY3Rpb24gcmVzb2x2ZUhvc3QobmFtZSwgY2IpIHtcbiAgICB2YXIgZXJyb3IsIHJlc3VsdHMgPSBbXVxuICAgIHZhciBjYjEgPSBmdW5jdGlvbihlLCBhZGRyKSB7XG4gICAgICAgIGVycm9yID0gZXJyb3IgfHwgZVxuICAgICAgICBpZiAoYWRkcilcbiAgICAgICAgICAgIHJlc3VsdHMucHVzaChhZGRyKVxuXG4gICAgICAgIGNiKChyZXN1bHRzLmxlbmd0aCA+IDApID8gbnVsbCA6IGVycm9yLCByZXN1bHRzKVxuICAgIH1cblxuICAgIGRucy5sb29rdXAobmFtZSwgY2IxKVxufVxuXG4vLyBjb25uZWN0aW9uIGF0dGVtcHRzIHRvIG11bHRpcGxlIGFkZHJlc3NlcyBpbiBhIHJvd1xuZnVuY3Rpb24gdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycykge1xuICAgIGNvbm5lY3Rpb24ub24oJ2Nvbm5lY3QnLCBjbGVhbnVwKVxuICAgIGNvbm5lY3Rpb24ub24oJ2Rpc2Nvbm5lY3QnLCBjb25uZWN0TmV4dClcbiAgICByZXR1cm4gY29ubmVjdE5leHQoKVxuXG4gICAgZnVuY3Rpb24gY2xlYW51cCgpIHtcbiAgICAgICAgY29ubmVjdGlvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIGNsZWFudXApXG4gICAgICAgIGNvbm5lY3Rpb24ucmVtb3ZlTGlzdGVuZXIoJ2Rpc2Nvbm5lY3QnLCBjb25uZWN0TmV4dClcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb25uZWN0TmV4dCgpIHtcbiAgICAgICAgdmFyIGFkZHIgPSBhZGRycy5zaGlmdCgpXG4gICAgICAgIGlmIChhZGRyKVxuICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQuY29ubmVjdChhZGRyLnBvcnQsIGFkZHIubmFtZSlcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgY2xlYW51cCgpXG4gICAgfVxufVxuXG4vLyByZXR1cm5zIGEgbGF6eSBpdGVyYXRvciB3aGljaCBjYW4gYmUgcmVzdGFydGVkIHZpYSBjb25uZWN0aW9uLmNvbm5lY3QoKVxuZXhwb3J0cy5jb25uZWN0ID0gZnVuY3Rpb24gY29ubmVjdChvcHRzKSB7XG4gICAgdmFyIHNlcnZpY2VzID0gb3B0cy5zZXJ2aWNlcy5zbGljZSgpXG4gICAgLy8gbGF6eSBldmFsdWF0aW9uIHRvIGRldGVybWluZSBlbmRwb2ludFxuICAgIGZ1bmN0aW9uIHRyeVNlcnZpY2VzKHJldHJ5KSB7XG4gICAgICAgIC8qIGpzaGludCAtVzA0MCAqL1xuICAgICAgICB2YXIgY29ubmVjdGlvbiA9IHRoaXNcbiAgICAgICAgaWYgKCFjb25uZWN0aW9uLnNvY2tldCAmJiBvcHRzLnNvY2tldCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBvcHRzLnNvY2tldCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gb3B0cy5zb2NrZXQuY2FsbCh0aGlzKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG9wdHMuc29ja2V0XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvcHRzLnNvY2tldCA9IG51bGxcbiAgICAgICAgfSBlbHNlIGlmICghcmV0cnkpIHtcbiAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gbnVsbFxuICAgICAgICB9XG4gICAgICAgIHZhciBzZXJ2aWNlID0gc2VydmljZXMuc2hpZnQoKVxuICAgICAgICBpZiAoc2VydmljZSkge1xuICAgICAgICAgICAgcmVzb2x2ZVNydihzZXJ2aWNlICsgJy4nICsgb3B0cy5kb21haW4sIGZ1bmN0aW9uKGVycm9yLCBhZGRycykge1xuICAgICAgICAgICAgICAgIGlmIChhZGRycylcbiAgICAgICAgICAgICAgICAgICAgdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycylcbiAgICAgICAgICAgICAgICAvLyBjYWxsIHRyeVNlcnZpY2VzIGFnYWluXG4gICAgICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRyeVNlcnZpY2VzLmNhbGwoY29ubmVjdGlvbiwgJ3JldHJ5JylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmVzb2x2ZUhvc3Qob3B0cy5kb21haW4sIGZ1bmN0aW9uKGVycm9yLCBhZGRycykge1xuICAgICAgICAgICAgICAgIGlmIChhZGRycyAmJiBhZGRycy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGFkZHJzID0gYWRkcnMubWFwKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG5hbWU6IGFkZHIsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwb3J0OiBvcHRzLmRlZmF1bHRQb3J0IH1cbiAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgdHJ5Q29ubmVjdChjb25uZWN0aW9uLCBhZGRycylcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGNvbm5lY3Rpb24ucmVjb25uZWN0KSAge1xuICAgICAgICAgICAgICAgICAgICAvLyByZXRyeSBmcm9tIHRoZSBiZWdpbm5pbmdcbiAgICAgICAgICAgICAgICAgICAgc2VydmljZXMgPSBvcHRzLnNlcnZpY2VzLnNsaWNlKClcbiAgICAgICAgICAgICAgICAgICAgLy8gZ2V0IGEgbmV3IHNvY2tldFxuICAgICAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG51bGxcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBlcnJvciA9IGVycm9yIHx8IG5ldyBFcnJvcignTm8gYWRkcmVzc2VzIHJlc29sdmVkIGZvciAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9wdHMuZG9tYWluKVxuICAgICAgICAgICAgICAgICAgICBjb25uZWN0aW9uLmVtaXQoJ2Vycm9yJywgZXJyb3IpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gY29ubmVjdGlvbi5zb2NrZXRcbiAgICB9XG4gICAgcmV0dXJuIHRyeVNlcnZpY2VzXG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbHR4JylcblxuZnVuY3Rpb24gU3RhbnphKG5hbWUsIGF0dHJzKSB7XG4gICAgbHR4LkVsZW1lbnQuY2FsbCh0aGlzLCBuYW1lLCBhdHRycylcbn1cblxudXRpbC5pbmhlcml0cyhTdGFuemEsIGx0eC5FbGVtZW50KVxuXG5TdGFuemEucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNsb25lID0gbmV3IFN0YW56YSh0aGlzLm5hbWUsIHt9KVxuICAgIGZvciAodmFyIGsgaW4gdGhpcy5hdHRycykge1xuICAgICAgICBpZiAodGhpcy5hdHRycy5oYXNPd25Qcm9wZXJ0eShrKSlcbiAgICAgICAgICAgIGNsb25lLmF0dHJzW2tdID0gdGhpcy5hdHRyc1trXVxuICAgIH1cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBjbG9uZS5jbm9kZShjaGlsZC5jbG9uZSA/IGNoaWxkLmNsb25lKCkgOiBjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIGNsb25lXG59XG5cbi8qKlxuICogQ29tbW9uIGF0dHJpYnV0ZSBnZXR0ZXJzL3NldHRlcnMgZm9yIGFsbCBzdGFuemFzXG4gKi9cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICdmcm9tJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLmZyb21cbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihmcm9tKSB7XG4gICAgICAgIHRoaXMuYXR0cnMuZnJvbSA9IGZyb21cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICd0bycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy50b1xuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKHRvKSB7XG4gICAgICAgIHRoaXMuYXR0cnMudG8gPSB0b1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbnphLnByb3RvdHlwZSwgJ2lkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLmlkXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24oaWQpIHtcbiAgICAgICAgdGhpcy5hdHRycy5pZCA9IGlkXG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuemEucHJvdG90eXBlLCAndHlwZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy50eXBlXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24odHlwZSkge1xuICAgICAgICB0aGlzLmF0dHJzLnR5cGUgPSB0eXBlXG4gICAgfVxufSk7XG5cbi8qKlxuICogU3RhbnphIGtpbmRzXG4gKi9cblxuZnVuY3Rpb24gTWVzc2FnZShhdHRycykge1xuICAgIFN0YW56YS5jYWxsKHRoaXMsICdtZXNzYWdlJywgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoTWVzc2FnZSwgU3RhbnphKVxuXG5mdW5jdGlvbiBQcmVzZW5jZShhdHRycykge1xuICAgIFN0YW56YS5jYWxsKHRoaXMsICdwcmVzZW5jZScsIGF0dHJzKVxufVxuXG51dGlsLmluaGVyaXRzKFByZXNlbmNlLCBTdGFuemEpXG5cbmZ1bmN0aW9uIElxKGF0dHJzKSB7XG4gICAgU3RhbnphLmNhbGwodGhpcywgJ2lxJywgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoSXEsIFN0YW56YSlcblxuZXhwb3J0cy5FbGVtZW50ID0gbHR4LkVsZW1lbnRcbmV4cG9ydHMuU3RhbnphID0gU3RhbnphXG5leHBvcnRzLk1lc3NhZ2UgPSBNZXNzYWdlXG5leHBvcnRzLlByZXNlbmNlID0gUHJlc2VuY2VcbmV4cG9ydHMuSXEgPSBJcVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIGx0eCA9IHJlcXVpcmUoJ2x0eCcpXG4gICwgU3RhbnphID0gcmVxdWlyZSgnLi9zdGFuemEnKS5TdGFuemFcblxuLyoqXG4gKiBSZWNvZ25pemVzIDxzdHJlYW06c3RyZWFtPiBhbmQgY29sbGVjdHMgc3RhbnphcyB1c2VkIGZvciBvcmRpbmFyeVxuICogVENQIHN0cmVhbXMgYW5kIFdlYnNvY2tldHMuXG4gKlxuICogQVBJOiB3cml0ZShkYXRhKSAmIGVuZChkYXRhKVxuICogRXZlbnRzOiBzdHJlYW1TdGFydCwgc3RhbnphLCBlbmQsIGVycm9yXG4gKi9cbmZ1bmN0aW9uIFN0cmVhbVBhcnNlcihtYXhTdGFuemFTaXplKSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IGx0eC5iZXN0U2F4UGFyc2VyKClcblxuICAgIC8qIENvdW50IHRyYWZmaWMgZm9yIGVudGlyZSBsaWZlLXRpbWUgKi9cbiAgICB0aGlzLmJ5dGVzUGFyc2VkID0gMFxuICAgIHRoaXMubWF4U3RhbnphU2l6ZSA9IG1heFN0YW56YVNpemVcbiAgICAvKiBXaWxsIGJlIHJlc2V0IHVwb24gZmlyc3Qgc3RhbnphLCBidXQgZW5mb3JjZSBtYXhTdGFuemFTaXplIHVudGlsIGl0IGlzIHBhcnNlZCAqL1xuICAgIHRoaXMuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luID0gMFxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YXJ0RWxlbWVudCcsIGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgICAgICAgICAvLyBUT0RPOiByZWZ1c2UgYW55dGhpbmcgYnV0IDxzdHJlYW06c3RyZWFtPlxuICAgICAgICAgICAgaWYgKCFzZWxmLmVsZW1lbnQgJiYgKG5hbWUgPT09ICdzdHJlYW06c3RyZWFtJykpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3N0cmVhbVN0YXJ0JywgYXR0cnMpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHZhciBjaGlsZFxuICAgICAgICAgICAgICAgIGlmICghc2VsZi5lbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIEEgbmV3IHN0YW56YSAqL1xuICAgICAgICAgICAgICAgICAgICBjaGlsZCA9IG5ldyBTdGFuemEobmFtZSwgYXR0cnMpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZWxlbWVudCA9IGNoaWxkXG4gICAgICAgICAgICAgICAgICAgICAgLyogRm9yIG1heFN0YW56YVNpemUgZW5mb3JjZW1lbnQgKi9cbiAgICAgICAgICAgICAgICAgICAgc2VsZi5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gPSBzZWxmLmJ5dGVzUGFyc2VkXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLyogQSBjaGlsZCBlbGVtZW50IG9mIGEgc3RhbnphICovXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkID0gbmV3IGx0eC5FbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVsZW1lbnQgPSBzZWxmLmVsZW1lbnQuY25vZGUoY2hpbGQpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ2VuZEVsZW1lbnQnLCBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIGlmICghc2VsZi5lbGVtZW50ICYmIChuYW1lID09PSAnc3RyZWFtOnN0cmVhbScpKSB7XG4gICAgICAgICAgICBzZWxmLmVuZCgpXG4gICAgICAgIH0gZWxzZSBpZiAoc2VsZi5lbGVtZW50ICYmIChuYW1lID09PSBzZWxmLmVsZW1lbnQubmFtZSkpIHtcbiAgICAgICAgICAgIGlmIChzZWxmLmVsZW1lbnQucGFyZW50KSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbGVtZW50ID0gc2VsZi5lbGVtZW50LnBhcmVudFxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvKiBTdGFuemEgY29tcGxldGUgKi9cbiAgICAgICAgICAgICAgICBzZWxmLmVtaXQoJ3N0YW56YScsIHNlbGYuZWxlbWVudClcbiAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5lbGVtZW50XG4gICAgICAgICAgICAgICAgLyogbWF4U3RhbnphU2l6ZSBkb2Vzbid0IGFwcGx5IHVudGlsIG5leHQgc3RhcnRFbGVtZW50ICovXG4gICAgICAgICAgICAgICAgZGVsZXRlIHNlbGYuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBzZWxmLmVycm9yKCd4bWwtbm90LXdlbGwtZm9ybWVkJywgJ1hNTCBwYXJzZSBlcnJvcicpXG4gICAgICAgIH1cbiAgICB9KVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3RleHQnLCBmdW5jdGlvbihzdHIpIHtcbiAgICAgICAgaWYgKHNlbGYuZWxlbWVudClcbiAgICAgICAgICAgIHNlbGYuZWxlbWVudC50KHN0cilcbiAgICB9KVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ2VudGl0eURlY2wnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgLyogRW50aXR5IGRlY2xhcmF0aW9ucyBhcmUgZm9yYmlkZGVuIGluIFhNUFAuIFdlIG11c3QgYWJvcnQgdG9cbiAgICAgICAgICogYXZvaWQgYSBiaWxsaW9uIGxhdWdocy5cbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZXJyb3IoJ3htbC1ub3Qtd2VsbC1mb3JtZWQnLCAnTm8gZW50aXR5IGRlY2xhcmF0aW9ucyBhbGxvd2VkJylcbiAgICAgICAgc2VsZi5lbmQoKVxuICAgIH0pXG5cbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSlcbn1cblxudXRpbC5pbmhlcml0cyhTdHJlYW1QYXJzZXIsIEV2ZW50RW1pdHRlcilcblxuXG4vKiBcbiAqIGhhY2sgZm9yIG1vc3QgdXNlY2FzZXMsIGRvIHdlIGhhdmUgYSBiZXR0ZXIgaWRlYT9cbiAqICAgY2F0Y2ggdGhlIGZvbGxvd2luZzpcbiAqICAgPD94bWwgdmVyc2lvbj1cIjEuMFwiPz5cbiAqICAgPD94bWwgdmVyc2lvbj1cIjEuMFwiIGVuY29kaW5nPVwiVVRGLThcIj8+XG4gKiAgIDw/eG1sIHZlcnNpb249XCIxLjBcIiBlbmNvZGluZz1cIlVURi0xNlwiIHN0YW5kYWxvbmU9XCJ5ZXNcIj8+XG4gKi9cblN0cmVhbVBhcnNlci5wcm90b3R5cGUuY2hlY2tYTUxIZWFkZXIgPSBmdW5jdGlvbiAoZGF0YSkge1xuICAgIC8vIGNoZWNrIGZvciB4bWwgdGFnXG4gICAgdmFyIGluZGV4ID0gZGF0YS5pbmRleE9mKCc8P3htbCcpO1xuXG4gICAgaWYgKGluZGV4ICE9PSAtMSkge1xuICAgICAgICB2YXIgZW5kID0gZGF0YS5pbmRleE9mKCc/PicpO1xuICAgICAgICBpZiAoaW5kZXggPj0gMCAmJiBlbmQgPj0gMCAmJiBpbmRleCA8IGVuZCsyKSB7XG4gICAgICAgICAgICB2YXIgc2VhcmNoID0gZGF0YS5zdWJzdHJpbmcoaW5kZXgsZW5kKzIpO1xuICAgICAgICAgICAgZGF0YSA9IGRhdGEucmVwbGFjZShzZWFyY2gsICcnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBkYXRhO1xufVxuXG5TdHJlYW1QYXJzZXIucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIC8qaWYgKC9ePHN0cmVhbTpzdHJlYW0gW14+XStcXC8+JC8udGVzdChkYXRhKSkge1xuICAgIGRhdGEgPSBkYXRhLnJlcGxhY2UoL1xcLz4kLywgXCI+XCIpXG4gICAgfSovXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIFxuICAgICAgICBkYXRhID0gZGF0YS50b1N0cmluZygndXRmOCcpXG4gICAgICAgIGRhdGEgPSB0aGlzLmNoZWNrWE1MSGVhZGVyKGRhdGEpXG5cbiAgICAvKiBJZiBhIG1heFN0YW56YVNpemUgaXMgY29uZmlndXJlZCwgdGhlIGN1cnJlbnQgc3RhbnphIG11c3QgY29uc2lzdCBvbmx5IG9mIHRoaXMgbWFueSBieXRlcyAqL1xuICAgICAgICBpZiAodGhpcy5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gJiYgdGhpcy5tYXhTdGFuemFTaXplICYmXG4gICAgICAgICAgICB0aGlzLmJ5dGVzUGFyc2VkID4gdGhpcy5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gKyB0aGlzLm1heFN0YW56YVNpemUpIHtcblxuICAgICAgICAgICAgdGhpcy5lcnJvcigncG9saWN5LXZpb2xhdGlvbicsICdNYXhpbXVtIHN0YW56YSBzaXplIGV4Y2VlZGVkJylcbiAgICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICAgIHRoaXMuYnl0ZXNQYXJzZWQgKz0gZGF0YS5sZW5ndGhcblxuICAgICAgICB0aGlzLnBhcnNlci53cml0ZShkYXRhKVxuICAgIH1cbn1cblxuU3RyZWFtUGFyc2VyLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgaWYgKGRhdGEpIHtcbiAgICAgICAgdGhpcy53cml0ZShkYXRhKVxuICAgIH1cbiAgICAvKiBHZXQgR0MnZWQgKi9cbiAgICBkZWxldGUgdGhpcy5wYXJzZXJcbiAgICB0aGlzLmVtaXQoJ2VuZCcpXG59XG5cblN0cmVhbVBhcnNlci5wcm90b3R5cGUuZXJyb3IgPSBmdW5jdGlvbihjb25kaXRpb24sIG1lc3NhZ2UpIHtcbiAgICB2YXIgZSA9IG5ldyBFcnJvcihtZXNzYWdlKVxuICAgIGUuY29uZGl0aW9uID0gY29uZGl0aW9uXG4gICAgdGhpcy5lbWl0KCdlcnJvcicsIGUpXG59XG5cbmV4cG9ydHMuU3RyZWFtUGFyc2VyID0gU3RyZWFtUGFyc2VyIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kZWJ1ZycpO1xuZXhwb3J0cy5sb2cgPSBsb2c7XG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcblxuLyoqXG4gKiBVc2UgY2hyb21lLnN0b3JhZ2UubG9jYWwgaWYgd2UgYXJlIGluIGFuIGFwcFxuICovXG5cbnZhciBzdG9yYWdlO1xuXG5pZiAodHlwZW9mIGNocm9tZSAhPT0gJ3VuZGVmaW5lZCcgJiYgdHlwZW9mIGNocm9tZS5zdG9yYWdlICE9PSAndW5kZWZpbmVkJylcbiAgc3RvcmFnZSA9IGNocm9tZS5zdG9yYWdlLmxvY2FsO1xuZWxzZVxuICBzdG9yYWdlID0gbG9jYWxzdG9yYWdlKCk7XG5cbi8qKlxuICogQ29sb3JzLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0gW1xuICAnbGlnaHRzZWFncmVlbicsXG4gICdmb3Jlc3RncmVlbicsXG4gICdnb2xkZW5yb2QnLFxuICAnZG9kZ2VyYmx1ZScsXG4gICdkYXJrb3JjaGlkJyxcbiAgJ2NyaW1zb24nXG5dO1xuXG4vKipcbiAqIEN1cnJlbnRseSBvbmx5IFdlYktpdC1iYXNlZCBXZWIgSW5zcGVjdG9ycywgRmlyZWZveCA+PSB2MzEsXG4gKiBhbmQgdGhlIEZpcmVidWcgZXh0ZW5zaW9uIChhbnkgRmlyZWZveCB2ZXJzaW9uKSBhcmUga25vd25cbiAqIHRvIHN1cHBvcnQgXCIlY1wiIENTUyBjdXN0b21pemF0aW9ucy5cbiAqXG4gKiBUT0RPOiBhZGQgYSBgbG9jYWxTdG9yYWdlYCB2YXJpYWJsZSB0byBleHBsaWNpdGx5IGVuYWJsZS9kaXNhYmxlIGNvbG9yc1xuICovXG5cbmZ1bmN0aW9uIHVzZUNvbG9ycygpIHtcbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgcmV0dXJuICgnV2Via2l0QXBwZWFyYW5jZScgaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlKSB8fFxuICAgIC8vIGlzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcbiAgICAod2luZG93LmNvbnNvbGUgJiYgKGNvbnNvbGUuZmlyZWJ1ZyB8fCAoY29uc29sZS5leGNlcHRpb24gJiYgY29uc29sZS50YWJsZSkpKSB8fFxuICAgIC8vIGlzIGZpcmVmb3ggPj0gdjMxP1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuICAgIChuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncygpIHtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybiBhcmdzO1xuXG4gIHZhciBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcbiAgYXJncyA9IFthcmdzWzBdLCBjLCAnY29sb3I6IGluaGVyaXQnXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJncywgMSkpO1xuXG4gIC8vIHRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG4gIC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cbiAgLy8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG4gIHZhciBpbmRleCA9IDA7XG4gIHZhciBsYXN0QyA9IDA7XG4gIGFyZ3NbMF0ucmVwbGFjZSgvJVthLXolXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIGlmICgnJSUnID09PSBtYXRjaCkgcmV0dXJuO1xuICAgIGluZGV4Kys7XG4gICAgaWYgKCclYycgPT09IG1hdGNoKSB7XG4gICAgICAvLyB3ZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcbiAgICAgIC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG4gICAgICBsYXN0QyA9IGluZGV4O1xuICAgIH1cbiAgfSk7XG5cbiAgYXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xuICByZXR1cm4gYXJncztcbn1cblxuLyoqXG4gKiBJbnZva2VzIGBjb25zb2xlLmxvZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUubG9nYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBsb2coKSB7XG4gIC8vIHRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4LzksIHdoZXJlXG4gIC8vIHRoZSBgY29uc29sZS5sb2dgIGZ1bmN0aW9uIGRvZXNuJ3QgaGF2ZSAnYXBwbHknXG4gIHJldHVybiAnb2JqZWN0JyA9PT0gdHlwZW9mIGNvbnNvbGVcbiAgICAmJiBjb25zb2xlLmxvZ1xuICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzYXZlKG5hbWVzcGFjZXMpIHtcbiAgdHJ5IHtcbiAgICBpZiAobnVsbCA9PSBuYW1lc3BhY2VzKSB7XG4gICAgICBzdG9yYWdlLnJlbW92ZUl0ZW0oJ2RlYnVnJyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0b3JhZ2UuZGVidWcgPSBuYW1lc3BhY2VzO1xuICAgIH1cbiAgfSBjYXRjaChlKSB7fVxufVxuXG4vKipcbiAqIExvYWQgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gcmV0dXJucyB0aGUgcHJldmlvdXNseSBwZXJzaXN0ZWQgZGVidWcgbW9kZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvYWQoKSB7XG4gIHZhciByO1xuICB0cnkge1xuICAgIHIgPSBzdG9yYWdlLmRlYnVnO1xuICB9IGNhdGNoKGUpIHt9XG4gIHJldHVybiByO1xufVxuXG4vKipcbiAqIEVuYWJsZSBuYW1lc3BhY2VzIGxpc3RlZCBpbiBgbG9jYWxTdG9yYWdlLmRlYnVnYCBpbml0aWFsbHkuXG4gKi9cblxuZXhwb3J0cy5lbmFibGUobG9hZCgpKTtcblxuLyoqXG4gKiBMb2NhbHN0b3JhZ2UgYXR0ZW1wdHMgdG8gcmV0dXJuIHRoZSBsb2NhbHN0b3JhZ2UuXG4gKlxuICogVGhpcyBpcyBuZWNlc3NhcnkgYmVjYXVzZSBzYWZhcmkgdGhyb3dzXG4gKiB3aGVuIGEgdXNlciBkaXNhYmxlcyBjb29raWVzL2xvY2Fsc3RvcmFnZVxuICogYW5kIHlvdSBhdHRlbXB0IHRvIGFjY2VzcyBpdC5cbiAqXG4gKiBAcmV0dXJuIHtMb2NhbFN0b3JhZ2V9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2NhbHN0b3JhZ2UoKXtcbiAgdHJ5IHtcbiAgICByZXR1cm4gd2luZG93LmxvY2FsU3RvcmFnZTtcbiAgfSBjYXRjaCAoZSkge31cbn1cbiIsImFyZ3VtZW50c1s0XVs0M11bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmdcbiAgICA/IGxvbmcodmFsKVxuICAgIDogc2hvcnQodmFsKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICB2YXIgbWF0Y2ggPSAvXigoPzpcXGQrKT9cXC4/XFxkKykgKihtaWxsaXNlY29uZHM/fG1zZWNzP3xtc3xzZWNvbmRzP3xzZWNzP3xzfG1pbnV0ZXM/fG1pbnM/fG18aG91cnM/fGhycz98aHxkYXlzP3xkfHllYXJzP3x5cnM/fHkpPyQvaS5leGVjKHN0cik7XG4gIGlmICghbWF0Y2gpIHJldHVybjtcbiAgdmFyIG4gPSBwYXJzZUZsb2F0KG1hdGNoWzFdKTtcbiAgdmFyIHR5cGUgPSAobWF0Y2hbMl0gfHwgJ21zJykudG9Mb3dlckNhc2UoKTtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAneWVhcnMnOlxuICAgIGNhc2UgJ3llYXInOlxuICAgIGNhc2UgJ3lycyc6XG4gICAgY2FzZSAneXInOlxuICAgIGNhc2UgJ3knOlxuICAgICAgcmV0dXJuIG4gKiB5O1xuICAgIGNhc2UgJ2RheXMnOlxuICAgIGNhc2UgJ2RheSc6XG4gICAgY2FzZSAnZCc6XG4gICAgICByZXR1cm4gbiAqIGQ7XG4gICAgY2FzZSAnaG91cnMnOlxuICAgIGNhc2UgJ2hvdXInOlxuICAgIGNhc2UgJ2hycyc6XG4gICAgY2FzZSAnaHInOlxuICAgIGNhc2UgJ2gnOlxuICAgICAgcmV0dXJuIG4gKiBoO1xuICAgIGNhc2UgJ21pbnV0ZXMnOlxuICAgIGNhc2UgJ21pbnV0ZSc6XG4gICAgY2FzZSAnbWlucyc6XG4gICAgY2FzZSAnbWluJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3NlY3MnOlxuICAgIGNhc2UgJ3NlYyc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbWlsbGlzZWNvbmRzJzpcbiAgICBjYXNlICdtaWxsaXNlY29uZCc6XG4gICAgY2FzZSAnbXNlY3MnOlxuICAgIGNhc2UgJ21zZWMnOlxuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gZCkgKyAnZCc7XG4gIGlmIChtcyA+PSBoKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICBpZiAobXMgPj0gbSkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBtKSArICdtJztcbiAgaWYgKG1zID49IHMpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gcykgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKVxuICAgIHx8IHBsdXJhbChtcywgaCwgJ2hvdXInKVxuICAgIHx8IHBsdXJhbChtcywgbSwgJ21pbnV0ZScpXG4gICAgfHwgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJylcbiAgICB8fCBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSByZXR1cm47XG4gIGlmIChtcyA8IG4gKiAxLjUpIHJldHVybiBNYXRoLmZsb29yKG1zIC8gbikgKyAnICcgKyBuYW1lO1xuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwiYXJndW1lbnRzWzRdWzIzXVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogVGhpcyBjaGVhcCByZXBsaWNhIG9mIERPTS9CdWlsZGVyIHB1dHMgbWUgdG8gc2hhbWUgOi0pXG4gKlxuICogQXR0cmlidXRlcyBhcmUgaW4gdGhlIGVsZW1lbnQuYXR0cnMgb2JqZWN0LiBDaGlsZHJlbiBpcyBhIGxpc3Qgb2ZcbiAqIGVpdGhlciBvdGhlciBFbGVtZW50cyBvciBTdHJpbmdzIGZvciB0ZXh0IGNvbnRlbnQuXG4gKiovXG5mdW5jdGlvbiBFbGVtZW50KG5hbWUsIGF0dHJzKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMucGFyZW50ID0gbnVsbFxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXVxuICAgIHRoaXMuc2V0QXR0cnMoYXR0cnMpXG59XG5cbi8qKiogQWNjZXNzb3JzICoqKi9cblxuLyoqXG4gKiBpZiAoZWxlbWVudC5pcygnbWVzc2FnZScsICdqYWJiZXI6Y2xpZW50JykpIC4uLlxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuaXMgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHJldHVybiAodGhpcy5nZXROYW1lKCkgPT09IG5hbWUpICYmXG4gICAgICAgICgheG1sbnMgfHwgKHRoaXMuZ2V0TlMoKSA9PT0geG1sbnMpKVxufVxuXG4vKiB3aXRob3V0IHByZWZpeCAqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0TmFtZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZS5zdWJzdHIodGhpcy5uYW1lLmluZGV4T2YoJzonKSArIDEpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubmFtZVxuICAgIH1cbn1cblxuLyoqXG4gKiByZXRyaWV2ZXMgdGhlIG5hbWVzcGFjZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LCB1cHdhcmRzIHJlY3Vyc2l2ZWx5XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROUyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApIHtcbiAgICAgICAgdmFyIHByZWZpeCA9IHRoaXMubmFtZS5zdWJzdHIoMCwgdGhpcy5uYW1lLmluZGV4T2YoJzonKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKHByZWZpeClcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZmluZE5TKClcbn1cblxuLyoqXG4gKiBmaW5kIHRoZSBuYW1lc3BhY2UgdG8gdGhlIGdpdmVuIHByZWZpeCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZmluZE5TID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgLyogZGVmYXVsdCBuYW1lc3BhY2UgKi9cbiAgICAgICAgaWYgKHRoaXMuYXR0cnMueG1sbnMpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmF0dHJzLnhtbG5zXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wYXJlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMoKVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLyogcHJlZml4ZWQgbmFtZXNwYWNlICovXG4gICAgICAgIHZhciBhdHRyID0gJ3htbG5zOicgKyBwcmVmaXhcbiAgICAgICAgaWYgKHRoaXMuYXR0cnNbYXR0cl0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5wYXJlbnQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMocHJlZml4KVxuICAgICAgICB9XG4gICAgfVxufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZXJseSBnZXRzIGFsbCB4bWxucyBkZWZpbmVkLCBpbiB0aGUgZm9ybSBvZiB7dXJsOnByZWZpeH1cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldFhtbG5zID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIG5hbWVzcGFjZXMgPSB7fVxuXG4gICAgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgICAgIG5hbWVzcGFjZXMgPSB0aGlzLnBhcmVudC5nZXRYbWxucygpXG4gICAgfVxuXG4gICAgZm9yICh2YXIgYXR0ciBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciBtID0gYXR0ci5tYXRjaCgneG1sbnM6PyguKiknKVxuICAgICAgICBpZiAodGhpcy5hdHRycy5oYXNPd25Qcm9wZXJ0eShhdHRyKSAmJiBtKSB7XG4gICAgICAgICAgICBuYW1lc3BhY2VzW3RoaXMuYXR0cnNbYXR0cl1dID0gbVsxXVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBuYW1lc3BhY2VzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnNldEF0dHJzID0gZnVuY3Rpb24oYXR0cnMpIHtcbiAgICB0aGlzLmF0dHJzID0ge31cblxuICAgIGlmICh0eXBlb2YgYXR0cnMgPT09ICdzdHJpbmcnKVxuICAgICAgICB0aGlzLmF0dHJzLnhtbG5zID0gYXR0cnNcbiAgICBlbHNlIGlmIChhdHRycykge1xuICAgICAgICBPYmplY3Qua2V5cyhhdHRycykuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgIHRoaXMuYXR0cnNba2V5XSA9IGF0dHJzW2tleV1cbiAgICAgICAgfSwgdGhpcylcbiAgICB9XG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGwsIHJldHVybnMgdGhlIG1hdGNoaW5nIGF0dHJpYnV0ZS5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldEF0dHIgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIGlmICgheG1sbnMpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbbmFtZV1cbiAgICB9XG5cbiAgICB2YXIgbmFtZXNwYWNlcyA9IHRoaXMuZ2V0WG1sbnMoKVxuXG4gICAgaWYgKCFuYW1lc3BhY2VzW3htbG5zXSkge1xuICAgICAgICByZXR1cm4gbnVsbFxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmF0dHJzW1tuYW1lc3BhY2VzW3htbG5zXSwgbmFtZV0uam9pbignOicpXVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZCA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW4obmFtZSwgeG1sbnMpWzBdXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoY2hpbGQuZ2V0TmFtZSAmJlxuICAgICAgICAgICAgKGNoaWxkLmdldE5hbWUoKSA9PT0gbmFtZSkgJiZcbiAgICAgICAgICAgICgheG1sbnMgfHwgKGNoaWxkLmdldE5TKCkgPT09IHhtbG5zKSkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIHhtbG5zIGFuZCByZWN1cnNpdmUgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkQnlBdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5CeUF0dHIoYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKVswXVxufVxuXG4vKipcbiAqIHhtbG5zIGFuZCByZWN1cnNpdmUgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuQnlBdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsLCB4bWxucywgcmVjdXJzaXZlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGNoaWxkLmF0dHJzICYmXG4gICAgICAgICAgICAoY2hpbGQuYXR0cnNbYXR0cl0gPT09IHZhbCkgJiZcbiAgICAgICAgICAgICgheG1sbnMgfHwgKGNoaWxkLmdldE5TKCkgPT09IHhtbG5zKSkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5nZXRDaGlsZHJlbkJ5QXR0cikge1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQuZ2V0Q2hpbGRyZW5CeUF0dHIoYXR0ciwgdmFsLCB4bWxucywgdHJ1ZSkpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSkge1xuICAgICAgICByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbkJ5RmlsdGVyID0gZnVuY3Rpb24oZmlsdGVyLCByZWN1cnNpdmUpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoZmlsdGVyKGNoaWxkKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgICAgICBpZiAocmVjdXJzaXZlICYmIGNoaWxkLmdldENoaWxkcmVuQnlGaWx0ZXIpe1xuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQuZ2V0Q2hpbGRyZW5CeUZpbHRlcihmaWx0ZXIsIHRydWUpKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUpIHtcbiAgICAgICAgcmVzdWx0ID0gW10uY29uY2F0LmFwcGx5KFtdLCByZXN1bHQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0VGV4dCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciB0ZXh0ID0gJydcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoKHR5cGVvZiBjaGlsZCA9PT0gJ3N0cmluZycpIHx8ICh0eXBlb2YgY2hpbGQgPT09ICdudW1iZXInKSkge1xuICAgICAgICAgICAgdGV4dCArPSBjaGlsZFxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0ZXh0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkVGV4dCA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgdmFyIGNoaWxkID0gdGhpcy5nZXRDaGlsZChuYW1lLCB4bWxucylcbiAgICByZXR1cm4gY2hpbGQgPyBjaGlsZC5nZXRUZXh0KCkgOiBudWxsXG59XG5cbi8qKlxuICogUmV0dXJuIGFsbCBkaXJlY3QgZGVzY2VuZGVudHMgdGhhdCBhcmUgRWxlbWVudHMuXG4gKiBUaGlzIGRpZmZlcnMgZnJvbSBgZ2V0Q2hpbGRyZW5gIGluIHRoYXQgaXQgd2lsbCBleGNsdWRlIHRleHQgbm9kZXMsXG4gKiBwcm9jZXNzaW5nIGluc3RydWN0aW9ucywgZXRjLlxuICovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZEVsZW1lbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0Q2hpbGRyZW5CeUZpbHRlcihmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICByZXR1cm4gY2hpbGQgaW5zdGFuY2VvZiBFbGVtZW50XG4gICAgfSlcbn1cblxuLyoqKiBCdWlsZGVyICoqKi9cblxuLyoqIHJldHVybnMgdXBwZXJtb3N0IHBhcmVudCAqL1xuRWxlbWVudC5wcm90b3R5cGUucm9vdCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnBhcmVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQucm9vdCgpXG4gICAgfVxuICAgIHJldHVybiB0aGlzXG59XG5FbGVtZW50LnByb3RvdHlwZS50cmVlID0gRWxlbWVudC5wcm90b3R5cGUucm9vdFxuXG4vKioganVzdCBwYXJlbnQgb3IgaXRzZWxmICovXG5FbGVtZW50LnByb3RvdHlwZS51cCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnBhcmVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnRcbiAgICB9XG4gICAgcmV0dXJuIHRoaXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2dldEVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHZhciBlbGVtZW50ID0gbmV3IEVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgcmV0dXJuIGVsZW1lbnRcbn1cblxuLyoqIGNyZWF0ZSBjaGlsZCBub2RlIGFuZCByZXR1cm4gaXQgKi9cbkVsZW1lbnQucHJvdG90eXBlLmMgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHJldHVybiB0aGlzLmNub2RlKHRoaXMuX2dldEVsZW1lbnQobmFtZSwgYXR0cnMpKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5jbm9kZSA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKVxuICAgIGlmICh0eXBlb2YgY2hpbGQgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIGNoaWxkLnBhcmVudCA9IHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIGNoaWxkXG59XG5cbi8qKiBhZGQgdGV4dCBub2RlIGFuZCByZXR1cm4gZWxlbWVudCAqL1xuRWxlbWVudC5wcm90b3R5cGUudCA9IGZ1bmN0aW9uKHRleHQpIHtcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2godGV4dClcbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKioqIE1hbmlwdWxhdGlvbiAqKiovXG5cbi8qKlxuICogRWl0aGVyOlxuICogICBlbC5yZW1vdmUoY2hpbGRFbClcbiAqICAgZWwucmVtb3ZlKCdhdXRob3InLCAndXJuOi4uLicpXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLnJlbW92ZSA9IGZ1bmN0aW9uKGVsLCB4bWxucykge1xuICAgIHZhciBmaWx0ZXJcbiAgICBpZiAodHlwZW9mIGVsID09PSAnc3RyaW5nJykge1xuICAgICAgICAvKiAxc3QgcGFyYW1ldGVyIGlzIHRhZyBuYW1lICovXG4gICAgICAgIGZpbHRlciA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gIShjaGlsZC5pcyAmJlxuICAgICAgICAgICAgICAgICBjaGlsZC5pcyhlbCwgeG1sbnMpKVxuICAgICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLyogMXN0IHBhcmFtZXRlciBpcyBlbGVtZW50ICovXG4gICAgICAgIGZpbHRlciA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQgIT09IGVsXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLmNoaWxkcmVuID0gdGhpcy5jaGlsZHJlbi5maWx0ZXIoZmlsdGVyKVxuXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBUbyB1c2UgaW4gY2FzZSB5b3Ugd2FudCB0aGUgc2FtZSBYTUwgZGF0YSBmb3Igc2VwYXJhdGUgdXNlcy5cbiAqIFBsZWFzZSByZWZyYWluIGZyb20gdGhpcyBwcmFjdGlzZSB1bmxlc3MgeW91IGtub3cgd2hhdCB5b3UgYXJlXG4gKiBkb2luZy4gQnVpbGRpbmcgWE1MIHdpdGggbHR4IGlzIGVhc3khXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLmNsb25lID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNsb25lID0gdGhpcy5fZ2V0RWxlbWVudCh0aGlzLm5hbWUsIHRoaXMuYXR0cnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgY2xvbmUuY25vZGUoY2hpbGQuY2xvbmUgPyBjaGlsZC5jbG9uZSgpIDogY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiBjbG9uZVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS50ZXh0ID0gZnVuY3Rpb24odmFsKSB7XG4gICAgaWYgKHZhbCAmJiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuWzBdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmdldFRleHQoKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5hdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsKSB7XG4gICAgaWYgKCgodHlwZW9mIHZhbCAhPT0gJ3VuZGVmaW5lZCcpIHx8ICh2YWwgPT09IG51bGwpKSkge1xuICAgICAgICBpZiAoIXRoaXMuYXR0cnMpIHtcbiAgICAgICAgICAgIHRoaXMuYXR0cnMgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXR0cnNbYXR0cl0gPSB2YWxcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbn1cblxuLyoqKiBTZXJpYWxpemF0aW9uICoqKi9cblxuRWxlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgcyA9ICcnXG4gICAgdGhpcy53cml0ZShmdW5jdGlvbihjKSB7XG4gICAgICAgIHMgKz0gY1xuICAgIH0pXG4gICAgcmV0dXJuIHNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxuICAgICAgICBhdHRyczogdGhpcy5hdHRycyxcbiAgICAgICAgY2hpbGRyZW46IHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQgJiYgY2hpbGQudG9KU09OID8gY2hpbGQudG9KU09OKCkgOiBjaGlsZFxuICAgICAgICB9KVxuICAgIH1cbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2FkZENoaWxkcmVuID0gZnVuY3Rpb24od3JpdGVyKSB7XG4gICAgd3JpdGVyKCc+JylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICAvKiBTa2lwIG51bGwvdW5kZWZpbmVkICovXG4gICAgICAgIGlmIChjaGlsZCB8fCAoY2hpbGQgPT09IDApKSB7XG4gICAgICAgICAgICBpZiAoY2hpbGQud3JpdGUpIHtcbiAgICAgICAgICAgICAgICBjaGlsZC53cml0ZSh3cml0ZXIpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBjaGlsZCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sVGV4dChjaGlsZCkpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGNoaWxkLnRvU3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbFRleHQoY2hpbGQudG9TdHJpbmcoMTApKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB3cml0ZXIoJzwvJylcbiAgICB3cml0ZXIodGhpcy5uYW1lKVxuICAgIHdyaXRlcignPicpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLndyaXRlID0gZnVuY3Rpb24od3JpdGVyKSB7XG4gICAgd3JpdGVyKCc8JylcbiAgICB3cml0ZXIodGhpcy5uYW1lKVxuICAgIGZvciAodmFyIGsgaW4gdGhpcy5hdHRycykge1xuICAgICAgICB2YXIgdiA9IHRoaXMuYXR0cnNba11cbiAgICAgICAgaWYgKHYgfHwgKHYgPT09ICcnKSB8fCAodiA9PT0gMCkpIHtcbiAgICAgICAgICAgIHdyaXRlcignICcpXG4gICAgICAgICAgICB3cml0ZXIoaylcbiAgICAgICAgICAgIHdyaXRlcignPVwiJylcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdiAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICB2ID0gdi50b1N0cmluZygxMClcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWwodikpXG4gICAgICAgICAgICB3cml0ZXIoJ1wiJylcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDApIHtcbiAgICAgICAgd3JpdGVyKCcvPicpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fYWRkQ2hpbGRyZW4od3JpdGVyKVxuICAgIH1cbn1cblxuZnVuY3Rpb24gZXNjYXBlWG1sKHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmL2csICcmYW1wOycpLlxuICAgICAgICByZXBsYWNlKC88L2csICcmbHQ7JykuXG4gICAgICAgIHJlcGxhY2UoLz4vZywgJyZndDsnKS5cbiAgICAgICAgcmVwbGFjZSgvXCIvZywgJyZxdW90OycpLlxuICAgICAgICByZXBsYWNlKC9cIi9nLCAnJmFwb3M7Jylcbn1cblxuZnVuY3Rpb24gZXNjYXBlWG1sVGV4dChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJi9nLCAnJmFtcDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPC9nLCAnJmx0OycpLlxuICAgICAgICByZXBsYWNlKC8+L2csICcmZ3Q7Jylcbn1cblxuZXhwb3J0cy5FbGVtZW50ID0gRWxlbWVudFxuZXhwb3J0cy5lc2NhcGVYbWwgPSBlc2NhcGVYbWxcbiIsImFyZ3VtZW50c1s0XVsyNV1bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiYXJndW1lbnRzWzRdWzI2XVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCJhcmd1bWVudHNbNF1bMjddWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBsb2cgPSByZXF1aXJlKCdkZWJ1ZycpKCdub2RlLXN0cmluZ3ByZXAnKVxuXG4vLyBmcm9tIHVuaWNvZGUvdWlkbmEuaFxudmFyIFVJRE5BX0FMTE9XX1VOQVNTSUdORUQgPSAxXG52YXIgVUlETkFfVVNFX1NURDNfUlVMRVMgPSAyXG5cbnRyeSB7XG4gICAgdmFyIGJpbmRpbmdzID0gcmVxdWlyZSgnYmluZGluZ3MnKSgnbm9kZV9zdHJpbmdwcmVwLm5vZGUnKVxufSBjYXRjaCAoZXgpIHtcbiAgICBpZiAocHJvY2Vzcy50aXRsZSAhPT0gJ2Jyb3dzZXInKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKFxuICAgICAgICAgICAgJ0Nhbm5vdCBsb2FkIFN0cmluZ1ByZXAtJyArXG4gICAgICAgICAgICByZXF1aXJlKCcuL3BhY2thZ2UuanNvbicpLnZlcnNpb24gK1xuICAgICAgICAgICAgJyBiaW5kaW5ncyAodXNpbmcgZmFsbGJhY2spLiBZb3UgbWF5IG5lZWQgdG8gJyArXG4gICAgICAgICAgICAnYG5wbSBpbnN0YWxsIG5vZGUtc3RyaW5ncHJlcGAnXG4gICAgICAgIClcbiAgICAgICAgbG9nKGV4KVxuICAgIH1cbn1cblxudmFyIHRvVW5pY29kZSA9IGZ1bmN0aW9uKHZhbHVlLCBvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge31cbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gYmluZGluZ3MudG9Vbmljb2RlKHZhbHVlLFxuICAgICAgICAgICAgKG9wdGlvbnMuYWxsb3dVbmFzc2lnbmVkICYmIFVJRE5BX0FMTE9XX1VOQVNTSUdORUQpIHwgMClcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZVxuICAgIH1cbn1cblxudmFyIHRvQVNDSUkgPSBmdW5jdGlvbih2YWx1ZSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdzLnRvQVNDSUkodmFsdWUsXG4gICAgICAgICAgICAob3B0aW9ucy5hbGxvd1VuYXNzaWduZWQgJiYgVUlETkFfQUxMT1dfVU5BU1NJR05FRCkgfFxuICAgICAgICAgICAgKG9wdGlvbnMudXNlU1REM1J1bGVzICYmIFVJRE5BX1VTRV9TVEQzX1JVTEVTKSlcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmIChvcHRpb25zLnRocm93SWZFcnJvcikge1xuICAgICAgICAgICAgdGhyb3cgZVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIHZhbHVlXG4gICAgICAgIH1cbiAgICB9XG59XG5cbnZhciBTdHJpbmdQcmVwID0gZnVuY3Rpb24ob3BlcmF0aW9uKSB7XG4gICAgdGhpcy5vcGVyYXRpb24gPSBvcGVyYXRpb25cbiAgICB0cnkge1xuICAgICAgICB0aGlzLnN0cmluZ1ByZXAgPSBuZXcgYmluZGluZ3MuU3RyaW5nUHJlcCh0aGlzLm9wZXJhdGlvbilcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRoaXMuc3RyaW5nUHJlcCA9IG51bGxcbiAgICAgICAgbG9nKCdPcGVyYXRpb24gZG9lcyBub3QgZXhpc3QnLCBvcGVyYXRpb24sIGUpXG4gICAgfVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5VTktOT1dOX1BST0ZJTEVfVFlQRSA9ICdVbmtub3duIHByb2ZpbGUgdHlwZSdcblN0cmluZ1ByZXAucHJvdG90eXBlLlVOSEFORExFRF9GQUxMQkFDSyA9ICdVbmhhbmRsZWQgSlMgZmFsbGJhY2snXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5MSUJJQ1VfTk9UX0FWQUlMQUJMRSA9ICdsaWJpY3UgdW5hdmFpbGFibGUnXG5cblN0cmluZ1ByZXAucHJvdG90eXBlLnVzZUpzRmFsbGJhY2tzID0gdHJ1ZVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5wcmVwYXJlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB0aGlzLnZhbHVlID0gdmFsdWVcbiAgICB0cnkge1xuICAgICAgICBpZiAodGhpcy5zdHJpbmdQcmVwKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5zdHJpbmdQcmVwLnByZXBhcmUodGhpcy52YWx1ZSlcbiAgICAgICAgfVxuICAgIH0gY2F0Y2ggKGUpIHt9XG4gICAgaWYgKGZhbHNlID09PSB0aGlzLnVzZUpzRmFsbGJhY2tzKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLkxJQklDVV9OT1RfQVZBSUxBQkxFKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5qc0ZhbGxiYWNrKClcbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuaXNOYXRpdmUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gKG51bGwgIT09IHRoaXMuc3RyaW5nUHJlcClcbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuanNGYWxsYmFjayA9IGZ1bmN0aW9uKCkge1xuICAgIHN3aXRjaCAodGhpcy5vcGVyYXRpb24pIHtcbiAgICAgICAgY2FzZSAnbmFtZXByZXAnOlxuICAgICAgICBjYXNlICdub2RlcHJlcCc6XG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YWx1ZS50b0xvd2VyQ2FzZSgpXG4gICAgICAgIGNhc2UgJ3Jlc291cmNlcHJlcCc6XG4gICAgICAgICAgICByZXR1cm4gdGhpcy52YWx1ZVxuICAgICAgICBjYXNlICduZnM0X2NzX3ByZXAnOlxuICAgICAgICBjYXNlICduZnM0X2Npc19wcmVwJzpcbiAgICAgICAgY2FzZSAnbmZzNF9taXhlZF9wcmVwIHByZWZpeCc6XG4gICAgICAgIGNhc2UgJ25mczRfbWl4ZWRfcHJlcCBzdWZmaXgnOlxuICAgICAgICBjYXNlICdpc2NzaSc6XG4gICAgICAgIGNhc2UgJ21pYic6XG4gICAgICAgIGNhc2UgJ3Nhc2xwcmVwJzpcbiAgICAgICAgY2FzZSAndHJhY2UnOlxuICAgICAgICBjYXNlICdsZGFwJzpcbiAgICAgICAgY2FzZSAnbGRhcGNpJzpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLlVOSEFORExFRF9GQUxMQkFDSylcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcih0aGlzLlVOS05PV05fUFJPRklMRV9UWVBFKVxuICAgIH1cbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuZGlzYWJsZUpzRmFsbGJhY2tzID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy51c2VKc0ZhbGxiYWNrcyA9IGZhbHNlXG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmVuYWJsZUpzRmFsbGJhY2tzID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy51c2VKc0ZhbGxiYWNrcyA9IHRydWVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSB7XG4gICAgdG9Vbmljb2RlOiB0b1VuaWNvZGUsXG4gICAgdG9BU0NJSTogdG9BU0NJSSxcbiAgICBTdHJpbmdQcmVwOiBTdHJpbmdQcmVwXG59XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpKSIsIihmdW5jdGlvbiAocHJvY2VzcyxfX2ZpbGVuYW1lKXtcblxuLyoqXG4gKiBNb2R1bGUgZGVwZW5kZW5jaWVzLlxuICovXG5cbnZhciBmcyA9IHJlcXVpcmUoJ2ZzJylcbiAgLCBwYXRoID0gcmVxdWlyZSgncGF0aCcpXG4gICwgam9pbiA9IHBhdGguam9pblxuICAsIGRpcm5hbWUgPSBwYXRoLmRpcm5hbWVcbiAgLCBleGlzdHMgPSBmcy5leGlzdHNTeW5jIHx8IHBhdGguZXhpc3RzU3luY1xuICAsIGRlZmF1bHRzID0ge1xuICAgICAgICBhcnJvdzogcHJvY2Vzcy5lbnYuTk9ERV9CSU5ESU5HU19BUlJPVyB8fCAnIOKGkiAnXG4gICAgICAsIGNvbXBpbGVkOiBwcm9jZXNzLmVudi5OT0RFX0JJTkRJTkdTX0NPTVBJTEVEX0RJUiB8fCAnY29tcGlsZWQnXG4gICAgICAsIHBsYXRmb3JtOiBwcm9jZXNzLnBsYXRmb3JtXG4gICAgICAsIGFyY2g6IHByb2Nlc3MuYXJjaFxuICAgICAgLCB2ZXJzaW9uOiBwcm9jZXNzLnZlcnNpb25zLm5vZGVcbiAgICAgICwgYmluZGluZ3M6ICdiaW5kaW5ncy5ub2RlJ1xuICAgICAgLCB0cnk6IFtcbiAgICAgICAgICAvLyBub2RlLWd5cCdzIGxpbmtlZCB2ZXJzaW9uIGluIHRoZSBcImJ1aWxkXCIgZGlyXG4gICAgICAgICAgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBub2RlLXdhZiBhbmQgZ3lwX2FkZG9uIChhLmsuYSBub2RlLWd5cClcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdidWlsZCcsICdEZWJ1ZycsICdiaW5kaW5ncycgXVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2J1aWxkJywgJ1JlbGVhc2UnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBEZWJ1ZyBmaWxlcywgZm9yIGRldmVsb3BtZW50IChsZWdhY3kgYmVoYXZpb3IsIHJlbW92ZSBmb3Igbm9kZSB2MC45KVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ291dCcsICdEZWJ1ZycsICdiaW5kaW5ncycgXVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ0RlYnVnJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gUmVsZWFzZSBmaWxlcywgYnV0IG1hbnVhbGx5IGNvbXBpbGVkIChsZWdhY3kgYmVoYXZpb3IsIHJlbW92ZSBmb3Igbm9kZSB2MC45KVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ291dCcsICdSZWxlYXNlJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnUmVsZWFzZScsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIExlZ2FjeSBmcm9tIG5vZGUtd2FmLCBub2RlIDw9IDAuNC54XG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnZGVmYXVsdCcsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIFByb2R1Y3Rpb24gXCJSZWxlYXNlXCIgYnVpbGR0eXBlIGJpbmFyeSAobWVoLi4uKVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2NvbXBpbGVkJywgJ3ZlcnNpb24nLCAncGxhdGZvcm0nLCAnYXJjaCcsICdiaW5kaW5ncycgXVxuICAgICAgICBdXG4gICAgfVxuXG4vKipcbiAqIFRoZSBtYWluIGBiaW5kaW5ncygpYCBmdW5jdGlvbiBsb2FkcyB0aGUgY29tcGlsZWQgYmluZGluZ3MgZm9yIGEgZ2l2ZW4gbW9kdWxlLlxuICogSXQgdXNlcyBWOCdzIEVycm9yIEFQSSB0byBkZXRlcm1pbmUgdGhlIHBhcmVudCBmaWxlbmFtZSB0aGF0IHRoaXMgZnVuY3Rpb24gaXNcbiAqIGJlaW5nIGludm9rZWQgZnJvbSwgd2hpY2ggaXMgdGhlbiB1c2VkIHRvIGZpbmQgdGhlIHJvb3QgZGlyZWN0b3J5LlxuICovXG5cbmZ1bmN0aW9uIGJpbmRpbmdzIChvcHRzKSB7XG5cbiAgLy8gQXJndW1lbnQgc3VyZ2VyeVxuICBpZiAodHlwZW9mIG9wdHMgPT0gJ3N0cmluZycpIHtcbiAgICBvcHRzID0geyBiaW5kaW5nczogb3B0cyB9XG4gIH0gZWxzZSBpZiAoIW9wdHMpIHtcbiAgICBvcHRzID0ge31cbiAgfVxuICBvcHRzLl9fcHJvdG9fXyA9IGRlZmF1bHRzXG5cbiAgLy8gR2V0IHRoZSBtb2R1bGUgcm9vdFxuICBpZiAoIW9wdHMubW9kdWxlX3Jvb3QpIHtcbiAgICBvcHRzLm1vZHVsZV9yb290ID0gZXhwb3J0cy5nZXRSb290KGV4cG9ydHMuZ2V0RmlsZU5hbWUoKSlcbiAgfVxuXG4gIC8vIEVuc3VyZSB0aGUgZ2l2ZW4gYmluZGluZ3MgbmFtZSBlbmRzIHdpdGggLm5vZGVcbiAgaWYgKHBhdGguZXh0bmFtZShvcHRzLmJpbmRpbmdzKSAhPSAnLm5vZGUnKSB7XG4gICAgb3B0cy5iaW5kaW5ncyArPSAnLm5vZGUnXG4gIH1cblxuICB2YXIgdHJpZXMgPSBbXVxuICAgICwgaSA9IDBcbiAgICAsIGwgPSBvcHRzLnRyeS5sZW5ndGhcbiAgICAsIG5cbiAgICAsIGJcbiAgICAsIGVyclxuXG4gIGZvciAoOyBpPGw7IGkrKykge1xuICAgIG4gPSBqb2luLmFwcGx5KG51bGwsIG9wdHMudHJ5W2ldLm1hcChmdW5jdGlvbiAocCkge1xuICAgICAgcmV0dXJuIG9wdHNbcF0gfHwgcFxuICAgIH0pKVxuICAgIHRyaWVzLnB1c2gobilcbiAgICB0cnkge1xuICAgICAgYiA9IG9wdHMucGF0aCA/IHJlcXVpcmUucmVzb2x2ZShuKSA6IHJlcXVpcmUobilcbiAgICAgIGlmICghb3B0cy5wYXRoKSB7XG4gICAgICAgIGIucGF0aCA9IG5cbiAgICAgIH1cbiAgICAgIHJldHVybiBiXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKCEvbm90IGZpbmQvaS50ZXN0KGUubWVzc2FnZSkpIHtcbiAgICAgICAgdGhyb3cgZVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGVyciA9IG5ldyBFcnJvcignQ291bGQgbm90IGxvY2F0ZSB0aGUgYmluZGluZ3MgZmlsZS4gVHJpZWQ6XFxuJ1xuICAgICsgdHJpZXMubWFwKGZ1bmN0aW9uIChhKSB7IHJldHVybiBvcHRzLmFycm93ICsgYSB9KS5qb2luKCdcXG4nKSlcbiAgZXJyLnRyaWVzID0gdHJpZXNcbiAgdGhyb3cgZXJyXG59XG5tb2R1bGUuZXhwb3J0cyA9IGV4cG9ydHMgPSBiaW5kaW5nc1xuXG5cbi8qKlxuICogR2V0cyB0aGUgZmlsZW5hbWUgb2YgdGhlIEphdmFTY3JpcHQgZmlsZSB0aGF0IGludm9rZXMgdGhpcyBmdW5jdGlvbi5cbiAqIFVzZWQgdG8gaGVscCBmaW5kIHRoZSByb290IGRpcmVjdG9yeSBvZiBhIG1vZHVsZS5cbiAqIE9wdGlvbmFsbHkgYWNjZXB0cyBhbiBmaWxlbmFtZSBhcmd1bWVudCB0byBza2lwIHdoZW4gc2VhcmNoaW5nIGZvciB0aGUgaW52b2tpbmcgZmlsZW5hbWVcbiAqL1xuXG5leHBvcnRzLmdldEZpbGVOYW1lID0gZnVuY3Rpb24gZ2V0RmlsZU5hbWUgKGNhbGxpbmdfZmlsZSkge1xuICB2YXIgb3JpZ1BTVCA9IEVycm9yLnByZXBhcmVTdGFja1RyYWNlXG4gICAgLCBvcmlnU1RMID0gRXJyb3Iuc3RhY2tUcmFjZUxpbWl0XG4gICAgLCBkdW1teSA9IHt9XG4gICAgLCBmaWxlTmFtZVxuXG4gIEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IDEwXG5cbiAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBmdW5jdGlvbiAoZSwgc3QpIHtcbiAgICBmb3IgKHZhciBpPTAsIGw9c3QubGVuZ3RoOyBpPGw7IGkrKykge1xuICAgICAgZmlsZU5hbWUgPSBzdFtpXS5nZXRGaWxlTmFtZSgpXG4gICAgICBpZiAoZmlsZU5hbWUgIT09IF9fZmlsZW5hbWUpIHtcbiAgICAgICAgaWYgKGNhbGxpbmdfZmlsZSkge1xuICAgICAgICAgICAgaWYgKGZpbGVOYW1lICE9PSBjYWxsaW5nX2ZpbGUpIHtcbiAgICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBydW4gdGhlICdwcmVwYXJlU3RhY2tUcmFjZScgZnVuY3Rpb24gYWJvdmVcbiAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UoZHVtbXkpXG4gIGR1bW15LnN0YWNrXG5cbiAgLy8gY2xlYW51cFxuICBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9yaWdQU1RcbiAgRXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gb3JpZ1NUTFxuXG4gIHJldHVybiBmaWxlTmFtZVxufVxuXG4vKipcbiAqIEdldHMgdGhlIHJvb3QgZGlyZWN0b3J5IG9mIGEgbW9kdWxlLCBnaXZlbiBhbiBhcmJpdHJhcnkgZmlsZW5hbWVcbiAqIHNvbWV3aGVyZSBpbiB0aGUgbW9kdWxlIHRyZWUuIFRoZSBcInJvb3QgZGlyZWN0b3J5XCIgaXMgdGhlIGRpcmVjdG9yeVxuICogY29udGFpbmluZyB0aGUgYHBhY2thZ2UuanNvbmAgZmlsZS5cbiAqXG4gKiAgIEluOiAgL2hvbWUvbmF0ZS9ub2RlLW5hdGl2ZS1tb2R1bGUvbGliL2luZGV4LmpzXG4gKiAgIE91dDogL2hvbWUvbmF0ZS9ub2RlLW5hdGl2ZS1tb2R1bGVcbiAqL1xuXG5leHBvcnRzLmdldFJvb3QgPSBmdW5jdGlvbiBnZXRSb290IChmaWxlKSB7XG4gIHZhciBkaXIgPSBkaXJuYW1lKGZpbGUpXG4gICAgLCBwcmV2XG4gIHdoaWxlICh0cnVlKSB7XG4gICAgaWYgKGRpciA9PT0gJy4nKSB7XG4gICAgICAvLyBBdm9pZHMgYW4gaW5maW5pdGUgbG9vcCBpbiByYXJlIGNhc2VzLCBsaWtlIHRoZSBSRVBMXG4gICAgICBkaXIgPSBwcm9jZXNzLmN3ZCgpXG4gICAgfVxuICAgIGlmIChleGlzdHMoam9pbihkaXIsICdwYWNrYWdlLmpzb24nKSkgfHwgZXhpc3RzKGpvaW4oZGlyLCAnbm9kZV9tb2R1bGVzJykpKSB7XG4gICAgICAvLyBGb3VuZCB0aGUgJ3BhY2thZ2UuanNvbicgZmlsZSBvciAnbm9kZV9tb2R1bGVzJyBkaXI7IHdlJ3JlIGRvbmVcbiAgICAgIHJldHVybiBkaXJcbiAgICB9XG4gICAgaWYgKHByZXYgPT09IGRpcikge1xuICAgICAgLy8gR290IHRvIHRoZSB0b3BcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgbW9kdWxlIHJvb3QgZ2l2ZW4gZmlsZTogXCInICsgZmlsZVxuICAgICAgICAgICAgICAgICAgICArICdcIi4gRG8geW91IGhhdmUgYSBgcGFja2FnZS5qc29uYCBmaWxlPyAnKVxuICAgIH1cbiAgICAvLyBUcnkgdGhlIHBhcmVudCBkaXIgbmV4dFxuICAgIHByZXYgPSBkaXJcbiAgICBkaXIgPSBqb2luKGRpciwgJy4uJylcbiAgfVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSxcIi8uLi9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL25vZGUtc3RyaW5ncHJlcC9ub2RlX21vZHVsZXMvYmluZGluZ3MvYmluZGluZ3MuanNcIikiLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwibmFtZVwiOiBcIm5vZGUtc3RyaW5ncHJlcFwiLFxuICBcInZlcnNpb25cIjogXCIwLjcuMFwiLFxuICBcIm1haW5cIjogXCJpbmRleC5qc1wiLFxuICBcImRlc2NyaXB0aW9uXCI6IFwiSUNVIFN0cmluZ1ByZXAgcHJvZmlsZXNcIixcbiAgXCJrZXl3b3Jkc1wiOiBbXG4gICAgXCJ1bmljb2RlXCIsXG4gICAgXCJzdHJpbmdwcmVwXCIsXG4gICAgXCJpY3VcIlxuICBdLFxuICBcInNjcmlwdHNcIjoge1xuICAgIFwidGVzdFwiOiBcImdydW50IHRlc3RcIixcbiAgICBcImluc3RhbGxcIjogXCJub2RlLWd5cCByZWJ1aWxkXCJcbiAgfSxcbiAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiYmluZGluZ3NcIjogXCJeMS4yLjFcIixcbiAgICBcImRlYnVnXCI6IFwifjIuMC4wXCIsXG4gICAgXCJuYW5cIjogXCJeMS41LjFcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJncnVudFwiOiBcIn4wLjQuMlwiLFxuICAgIFwiZ3J1bnQtY2xpXCI6IFwiXjAuMS4xM1wiLFxuICAgIFwiZ3J1bnQtY29udHJpYi1qc2hpbnRcIjogXCJ+MC43LjJcIixcbiAgICBcImdydW50LW1vY2hhLWNsaVwiOiBcIn4xLjMuMFwiLFxuICAgIFwicHJveHlxdWlyZVwiOiBcIn4wLjUuMlwiLFxuICAgIFwic2hvdWxkXCI6IFwifjIuMS4xXCJcbiAgfSxcbiAgXCJyZXBvc2l0b3J5XCI6IHtcbiAgICBcInR5cGVcIjogXCJnaXRcIixcbiAgICBcInBhdGhcIjogXCJnaXQ6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXAuZ2l0XCJcbiAgfSxcbiAgXCJob21lcGFnZVwiOiBcImh0dHA6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXBcIixcbiAgXCJidWdzXCI6IHtcbiAgICBcInVybFwiOiBcImh0dHA6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXAvaXNzdWVzXCJcbiAgfSxcbiAgXCJhdXRob3JcIjoge1xuICAgIFwibmFtZVwiOiBcIkxsb3lkIFdhdGtpblwiLFxuICAgIFwiZW1haWxcIjogXCJsbG95ZEBldmlscHJvZmVzc29yLmNvLnVrXCIsXG4gICAgXCJ1cmxcIjogXCJodHRwOi8vZXZpbHByb2Zlc3Nvci5jby51a1wiXG4gIH0sXG4gIFwibGljZW5zZXNcIjogW1xuICAgIHtcbiAgICAgIFwidHlwZVwiOiBcIk1JVFwiXG4gICAgfVxuICBdLFxuICBcImVuZ2luZXNcIjoge1xuICAgIFwibm9kZVwiOiBcIj49MC44XCJcbiAgfSxcbiAgXCJneXBmaWxlXCI6IHRydWUsXG4gIFwiZ2l0SGVhZFwiOiBcImRlM2I0NWVjMjE1ZTU5MjMzMWI5YjgwYzA1M2IzMzIyNjU2OTA3YTRcIixcbiAgXCJfaWRcIjogXCJub2RlLXN0cmluZ3ByZXBAMC43LjBcIixcbiAgXCJfc2hhc3VtXCI6IFwiYzhhOGRlYWM5MjE3ZGI5N2VmM2ViMjBkZmE4MTdkN2U3MTZmNTZiNVwiLFxuICBcIl9mcm9tXCI6IFwibm9kZS1zdHJpbmdwcmVwQF4wLjcuMFwiLFxuICBcIl9ucG1WZXJzaW9uXCI6IFwiMi4yLjBcIixcbiAgXCJfbm9kZVZlcnNpb25cIjogXCIxLjAuM1wiLFxuICBcIl9ucG1Vc2VyXCI6IHtcbiAgICBcIm5hbWVcIjogXCJsbG95ZHdhdGtpblwiLFxuICAgIFwiZW1haWxcIjogXCJsbG95ZEBldmlscHJvZmVzc29yLmNvLnVrXCJcbiAgfSxcbiAgXCJtYWludGFpbmVyc1wiOiBbXG4gICAge1xuICAgICAgXCJuYW1lXCI6IFwiYXN0cm9cIixcbiAgICAgIFwiZW1haWxcIjogXCJhc3Ryb0BzcGFjZWJveXoubmV0XCJcbiAgICB9LFxuICAgIHtcbiAgICAgIFwibmFtZVwiOiBcImxsb3lkd2F0a2luXCIsXG4gICAgICBcImVtYWlsXCI6IFwibGxveWRAZXZpbHByb2Zlc3Nvci5jby51a1wiXG4gICAgfVxuICBdLFxuICBcImRpc3RcIjoge1xuICAgIFwic2hhc3VtXCI6IFwiYzhhOGRlYWM5MjE3ZGI5N2VmM2ViMjBkZmE4MTdkN2U3MTZmNTZiNVwiLFxuICAgIFwidGFyYmFsbFwiOiBcImh0dHA6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvbm9kZS1zdHJpbmdwcmVwLy0vbm9kZS1zdHJpbmdwcmVwLTAuNy4wLnRnelwiXG4gIH0sXG4gIFwiZGlyZWN0b3JpZXNcIjoge30sXG4gIFwiX3Jlc29sdmVkXCI6IFwiaHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcvbm9kZS1zdHJpbmdwcmVwLy0vbm9kZS1zdHJpbmdwcmVwLTAuNy4wLnRnelwiXG59XG4iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgYmFja29mZiA9IHJlcXVpcmUoJ2JhY2tvZmYnKVxudmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9XG5mdW5jdGlvbiAoY3JlYXRlQ29ubmVjdGlvbikge1xuICByZXR1cm4gZnVuY3Rpb24gKG9wdHMsIG9uQ29ubmVjdCkge1xuICAgIG9uQ29ubmVjdCA9ICdmdW5jdGlvbicgPT0gdHlwZW9mIG9wdHMgPyBvcHRzIDogb25Db25uZWN0XG4gICAgb3B0cyA9ICdvYmplY3QnID09IHR5cGVvZiBvcHRzID8gb3B0cyA6IHtpbml0aWFsRGVsYXk6IDFlMywgbWF4RGVsYXk6IDMwZTN9XG4gICAgaWYoIW9uQ29ubmVjdClcbiAgICAgIG9uQ29ubmVjdCA9IG9wdHMub25Db25uZWN0XG5cbiAgICB2YXIgZW1pdHRlciA9IG9wdHMuZW1pdHRlciB8fCBuZXcgRXZlbnRFbWl0dGVyKClcbiAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IGZhbHNlXG4gICAgZW1pdHRlci5yZWNvbm5lY3QgPSB0cnVlXG5cbiAgICBpZihvbkNvbm5lY3QpXG4gICAgICBlbWl0dGVyLm9uKCdjb25uZWN0Jywgb25Db25uZWN0KVxuXG4gICAgdmFyIGJhY2tvZmZNZXRob2QgPSAoYmFja29mZltvcHRzLnR5cGVdIHx8IGJhY2tvZmYuZmlib25hY2NpKSAob3B0cylcblxuICAgIGJhY2tvZmZNZXRob2Qub24oJ2JhY2tvZmYnLCBmdW5jdGlvbiAobiwgZCkge1xuICAgICAgZW1pdHRlci5lbWl0KCdiYWNrb2ZmJywgbiwgZClcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3NcbiAgICB2YXIgY2xlYW51cCA9IG5vb3BcbiAgICBiYWNrb2ZmTWV0aG9kLm9uKCdyZWFkeScsIGF0dGVtcHQpXG4gICAgZnVuY3Rpb24gYXR0ZW1wdCAobiwgZGVsYXkpIHtcbiAgICAgIGlmKCFlbWl0dGVyLnJlY29ubmVjdCkgcmV0dXJuXG5cbiAgICAgIGNsZWFudXAoKVxuICAgICAgZW1pdHRlci5lbWl0KCdyZWNvbm5lY3QnLCBuLCBkZWxheSlcbiAgICAgIHZhciBjb24gPSBjcmVhdGVDb25uZWN0aW9uLmFwcGx5KG51bGwsIGFyZ3MpXG4gICAgICBpZiAoY29uICE9PSBlbWl0dGVyLl9jb25uZWN0aW9uKVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3Rpb24nLCBjb24pXG4gICAgICBlbWl0dGVyLl9jb25uZWN0aW9uID0gY29uXG5cbiAgICAgIGNsZWFudXAgPSBvbkNsZWFudXBcbiAgICAgIGZ1bmN0aW9uIG9uQ2xlYW51cChlcnIpIHtcbiAgICAgICAgY2xlYW51cCA9IG5vb3BcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjb25uZWN0JywgY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgICAvL2hhY2sgdG8gbWFrZSBodHRwIG5vdCBjcmFzaC5cbiAgICAgICAgLy9IVFRQIElTIFRIRSBXT1JTVCBQUk9UT0NPTC5cbiAgICAgICAgaWYoY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKVxuICAgICAgICAgIGNvbi5vbignZXJyb3InLCBub29wKVxuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG9uRGlzY29ubmVjdCAoZXJyKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gZmFsc2VcbiAgICAgICAgb25DbGVhbnVwKGVycilcblxuICAgICAgICAvL2VtaXQgZGlzY29ubmVjdCBiZWZvcmUgY2hlY2tpbmcgcmVjb25uZWN0LCBzbyB1c2VyIGhhcyBhIGNoYW5jZSB0byBkZWNpZGUgbm90IHRvLlxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnLCBlcnIpXG5cbiAgICAgICAgaWYoIWVtaXR0ZXIucmVjb25uZWN0KSByZXR1cm5cbiAgICAgICAgdHJ5IHsgYmFja29mZk1ldGhvZC5iYWNrb2ZmKCkgfSBjYXRjaCAoXykgeyB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGNvbm5lY3QoKSB7XG4gICAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IHRydWVcbiAgICAgICAgaWYob25Db25uZWN0KVxuICAgICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIG9uQ29ubmVjdClcbiAgICAgICAgZW1pdHRlci5lbWl0KCdjb25uZWN0JywgY29uKVxuICAgICAgfVxuXG4gICAgICBjb25cbiAgICAgICAgLm9uKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgaWYob3B0cy5pbW1lZGlhdGUgfHwgY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gdHJ1ZVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3QnLCBjb24pXG4gICAgICAgIGNvbi5vbmNlKCdkYXRhJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIC8vdGhpcyBpcyB0aGUgb25seSB3YXkgdG8ga25vdyBmb3Igc3VyZSB0aGF0IGRhdGEgaXMgY29taW5nLi4uXG4gICAgICAgICAgYmFja29mZk1ldGhvZC5yZXNldCgpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb24ub24oJ2Nvbm5lY3QnLCBjb25uZWN0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGVtaXR0ZXIuY29ubmVjdCA9XG4gICAgZW1pdHRlci5saXN0ZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnJlY29ubmVjdCA9IHRydWVcbiAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxuICAgICAgYXR0ZW1wdCgwLCAwKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICAvL2ZvcmNlIHJlY29ubmVjdGlvblxuXG4gICAgZW1pdHRlci5lbmQgPVxuICAgIGVtaXR0ZXIuZGlzY29ubmVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVtaXR0ZXIucmVjb25uZWN0ID0gZmFsc2VcblxuICAgICAgaWYoZW1pdHRlci5fY29ubmVjdGlvbilcbiAgICAgICAgZW1pdHRlci5fY29ubmVjdGlvbi5lbmQoKVxuXG4gICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICByZXR1cm4gZW1pdHRlclxuICB9XG5cbn1cbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9saWIvYmFja29mZicpO1xudmFyIEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9saWIvc3RyYXRlZ3kvZXhwb25lbnRpYWwnKTtcbnZhciBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL2xpYi9zdHJhdGVneS9maWJvbmFjY2knKTtcbnZhciBGdW5jdGlvbkNhbGwgPSByZXF1aXJlKCcuL2xpYi9mdW5jdGlvbl9jYWxsLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzLkJhY2tvZmYgPSBCYWNrb2ZmO1xubW9kdWxlLmV4cG9ydHMuRnVuY3Rpb25DYWxsID0gRnVuY3Rpb25DYWxsO1xubW9kdWxlLmV4cG9ydHMuRmlib25hY2NpU3RyYXRlZ3kgPSBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3k7XG5tb2R1bGUuZXhwb3J0cy5FeHBvbmVudGlhbFN0cmF0ZWd5ID0gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3k7XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZpYm9uYWNjaSBiYWNrb2ZmLlxuICogQHBhcmFtIG9wdGlvbnMgRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kgYXJndW1lbnRzLlxuICogQHJldHVybiBUaGUgZmlib25hY2NpIGJhY2tvZmYuXG4gKiBAc2VlIEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5maWJvbmFjY2kgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBCYWNrb2ZmKG5ldyBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykpO1xufTtcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGFuIGV4cG9uZW50aWFsIGJhY2tvZmYuXG4gKiBAcGFyYW0gb3B0aW9ucyBFeHBvbmVudGlhbCBzdHJhdGVneSBhcmd1bWVudHMuXG4gKiBAcmV0dXJuIFRoZSBleHBvbmVudGlhbCBiYWNrb2ZmLlxuICogQHNlZSBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5leHBvbmVudGlhbCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IEJhY2tvZmYobmV3IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpKTtcbn07XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZ1bmN0aW9uQ2FsbCBmb3IgdGhlIGdpdmVuIGZ1bmN0aW9uIGFuZCBhcmd1bWVudHMuXG4gKiBAcGFyYW0gZm4gVGhlIGZ1bmN0aW9uIHRvIHdyYXAgaW4gYSBiYWNrb2ZmIGhhbmRsZXIuXG4gKiBAcGFyYW0gdmFyZ3MgVGhlIGZ1bmN0aW9uJ3MgYXJndW1lbnRzICh2YXIgYXJncykuXG4gKiBAcGFyYW0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uJ3MgY2FsbGJhY2suXG4gKiBAcmV0dXJuIFRoZSBGdW5jdGlvbkNhbGwgaW5zdGFuY2UuXG4gKi9cbm1vZHVsZS5leHBvcnRzLmNhbGwgPSBmdW5jdGlvbihmbiwgdmFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIGZuID0gYXJnc1swXTtcbiAgICB2YXJncyA9IGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGggLSAxKTtcbiAgICBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gbmV3IEZ1bmN0aW9uQ2FsbChmbiwgdmFyZ3MsIGNhbGxiYWNrKTtcbn07XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLyoqXG4gKiBCYWNrb2ZmIGRyaXZlci5cbiAqIEBwYXJhbSBiYWNrb2ZmU3RyYXRlZ3kgQmFja29mZiBkZWxheSBnZW5lcmF0b3Ivc3RyYXRlZ3kuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQmFja29mZihiYWNrb2ZmU3RyYXRlZ3kpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLmJhY2tvZmZTdHJhdGVneV8gPSBiYWNrb2ZmU3RyYXRlZ3k7XG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IC0xO1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy50aW1lb3V0SURfID0gLTE7XG5cbiAgICB0aGlzLmhhbmRsZXJzID0ge1xuICAgICAgICBiYWNrb2ZmOiB0aGlzLm9uQmFja29mZl8uYmluZCh0aGlzKVxuICAgIH07XG59XG51dGlsLmluaGVyaXRzKEJhY2tvZmYsIGV2ZW50cy5FdmVudEVtaXR0ZXIpO1xuXG4vKipcbiAqIFNldHMgYSBsaW1pdCwgZ3JlYXRlciB0aGFuIDAsIG9uIHRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy4gQSAnZmFpbCdcbiAqIGV2ZW50IHdpbGwgYmUgZW1pdHRlZCB3aGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLlxuICogQHBhcmFtIG1heE51bWJlck9mUmV0cnkgVGhlIG1heGltdW0gbnVtYmVyIG9mIGJhY2tvZmZzLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKG1heE51bWJlck9mUmV0cnkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF4aW11bSBudW1iZXIgb2YgcmV0cnkgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnQWN0dWFsOiAnICsgbWF4TnVtYmVyT2ZSZXRyeSk7XG4gICAgfVxuXG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IG1heE51bWJlck9mUmV0cnk7XG59O1xuXG4vKipcbiAqIFN0YXJ0cyBhIGJhY2tvZmYgb3BlcmF0aW9uLlxuICogQHBhcmFtIGVyciBPcHRpb25hbCBwYXJhbWF0ZXIgdG8gbGV0IHRoZSBsaXN0ZW5lcnMga25vdyB3aHkgdGhlIGJhY2tvZmZcbiAqICAgICBvcGVyYXRpb24gd2FzIHN0YXJ0ZWQuXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLmJhY2tvZmYgPSBmdW5jdGlvbihlcnIpIHtcbiAgICBpZiAodGhpcy50aW1lb3V0SURfICE9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmYgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuYmFja29mZk51bWJlcl8gPT09IHRoaXMubWF4TnVtYmVyT2ZSZXRyeV8pIHtcbiAgICAgICAgdGhpcy5lbWl0KCdmYWlsJywgZXJyKTtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5uZXh0KCk7XG4gICAgICAgIHRoaXMudGltZW91dElEXyA9IHNldFRpbWVvdXQodGhpcy5oYW5kbGVycy5iYWNrb2ZmLCB0aGlzLmJhY2tvZmZEZWxheV8pO1xuICAgICAgICB0aGlzLmVtaXQoJ2JhY2tvZmYnLCB0aGlzLmJhY2tvZmZOdW1iZXJfLCB0aGlzLmJhY2tvZmZEZWxheV8sIGVycik7XG4gICAgfVxufTtcblxuLyoqXG4gKiBIYW5kbGVzIHRoZSBiYWNrb2ZmIHRpbWVvdXQgY29tcGxldGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLm9uQmFja29mZl8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnRpbWVvdXRJRF8gPSAtMTtcbiAgICB0aGlzLmVtaXQoJ3JlYWR5JywgdGhpcy5iYWNrb2ZmTnVtYmVyXywgdGhpcy5iYWNrb2ZmRGVsYXlfKTtcbiAgICB0aGlzLmJhY2tvZmZOdW1iZXJfKys7XG59O1xuXG4vKipcbiAqIFN0b3BzIGFueSBiYWNrb2ZmIG9wZXJhdGlvbiBhbmQgcmVzZXRzIHRoZSBiYWNrb2ZmIGRlbGF5IHRvIGl0cyBpbml0YWxcbiAqIHZhbHVlLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5yZXNldCgpO1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJRF8pO1xuICAgIHRoaXMudGltZW91dElEXyA9IC0xO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmO1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9iYWNrb2ZmJyk7XG52YXIgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneS9maWJvbmFjY2knKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIHNwZWNpZmllZCB2YWx1ZSBpcyBhIGZ1bmN0aW9uXG4gKiBAcGFyYW0gdmFsIFZhcmlhYmxlIHRvIHRlc3QuXG4gKiBAcmV0dXJuIFdoZXRoZXIgdmFyaWFibGUgaXMgYSBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGNhbGxpbmcgb2YgYSBmdW5jdGlvbiBpbiBhIGJhY2tvZmYgbG9vcC5cbiAqIEBwYXJhbSBmbiBGdW5jdGlvbiB0byB3cmFwIGluIGEgYmFja29mZiBoYW5kbGVyLlxuICogQHBhcmFtIGFyZ3MgQXJyYXkgb2YgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gKiBAcGFyYW0gY2FsbGJhY2sgRnVuY3Rpb24ncyBjYWxsYmFjay5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBGdW5jdGlvbkNhbGwoZm4sIGFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGZuKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ZuIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgdGhpcy5mdW5jdGlvbl8gPSBmbjtcbiAgICB0aGlzLmFyZ3VtZW50c18gPSBhcmdzO1xuICAgIHRoaXMuY2FsbGJhY2tfID0gY2FsbGJhY2s7XG4gICAgdGhpcy5yZXN1bHRzXyA9IFtdO1xuXG4gICAgdGhpcy5iYWNrb2ZmXyA9IG51bGw7XG4gICAgdGhpcy5zdHJhdGVneV8gPSBudWxsO1xuICAgIHRoaXMuZmFpbEFmdGVyXyA9IC0xO1xuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlBFTkRJTkc7XG59XG51dGlsLmluaGVyaXRzKEZ1bmN0aW9uQ2FsbCwgZXZlbnRzLkV2ZW50RW1pdHRlcik7XG5cbi8qKlxuICogRW51bSBvZiBzdGF0ZXMgaW4gd2hpY2ggdGhlIEZ1bmN0aW9uQ2FsbCBjYW4gYmUuXG4gKiBAcHJpdmF0ZVxuICovXG5GdW5jdGlvbkNhbGwuU3RhdGVfID0ge1xuICAgIFBFTkRJTkc6IDAsXG4gICAgUlVOTklORzogMSxcbiAgICBDT01QTEVURUQ6IDIsXG4gICAgQUJPUlRFRDogM1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgcGVuZGluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc1BlbmRpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZV8gPT0gRnVuY3Rpb25DYWxsLlN0YXRlXy5QRU5ESU5HO1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgaW4gcHJvZ3Jlc3MuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNSdW5uaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uUlVOTklORztcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGNvbXBsZXRlZC5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc0NvbXBsZXRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXRlXyA9PSBGdW5jdGlvbkNhbGwuU3RhdGVfLkNPTVBMRVRFRDtcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGFib3J0ZWQuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNBYm9ydGVkID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBzdHJhdGVneS5cbiAqIEBwYXJhbSBzdHJhdGVneSBUaGUgYmFja29mZiBzdHJhdGVneSB0byB1c2UuXG4gKiBAcmV0dXJuIEl0c2VsZiBmb3IgY2hhaW5pbmcuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuc2V0U3RyYXRlZ3kgPSBmdW5jdGlvbihzdHJhdGVneSkge1xuICAgIGlmICghdGhpcy5pc1BlbmRpbmcoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBpbiBwcm9ncmVzcy4nKTtcbiAgICB9XG4gICAgdGhpcy5zdHJhdGVneV8gPSBzdHJhdGVneTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgaW50ZXJtZWRpYXJ5IHJlc3VsdHMgcmV0dXJuZWQgYnkgdGhlIHdyYXBwZWQgZnVuY3Rpb24gc2luY2VcbiAqIHRoZSBpbml0aWFsIGNhbGwuXG4gKiBAcmV0dXJuIEFuIGFycmF5IG9mIGludGVybWVkaWFyeSByZXN1bHRzLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmdldFJlc3VsdHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzXy5jb25jYXQoKTtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBsaW1pdC5cbiAqIEBwYXJhbSBtYXhOdW1iZXJPZlJldHJ5IFRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy5cbiAqIEByZXR1cm4gSXRzZWxmIGZvciBjaGFpbmluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGluIHByb2dyZXNzLicpO1xuICAgIH1cbiAgICB0aGlzLmZhaWxBZnRlcl8gPSBtYXhOdW1iZXJPZlJldHJ5O1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBBYm9ydHMgdGhlIGNhbGwuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc0NvbXBsZXRlZCgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgY29tcGxldGVkLicpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzUnVubmluZygpKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8ucmVzZXQoKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0YXRlXyA9IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogSW5pdGlhdGVzIHRoZSBjYWxsIHRvIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHBhcmFtIGJhY2tvZmZGYWN0b3J5IE9wdGlvbmFsIGZhY3RvcnkgZnVuY3Rpb24gdXNlZCB0byBjcmVhdGUgdGhlIGJhY2tvZmZcbiAqICAgICBpbnN0YW5jZS5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKGJhY2tvZmZGYWN0b3J5KSB7XG4gICAgaWYgKHRoaXMuaXNBYm9ydGVkKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5jdGlvbkNhbGwgYWJvcnRlZC4nKTtcbiAgICB9IGVsc2UgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgc3RhcnRlZC4nKTtcbiAgICB9XG5cbiAgICB2YXIgc3RyYXRlZ3kgPSB0aGlzLnN0cmF0ZWd5XyB8fCBuZXcgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KCk7XG5cbiAgICB0aGlzLmJhY2tvZmZfID0gYmFja29mZkZhY3RvcnkgP1xuICAgICAgICBiYWNrb2ZmRmFjdG9yeShzdHJhdGVneSkgOlxuICAgICAgICBuZXcgQmFja29mZihzdHJhdGVneSk7XG5cbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdyZWFkeScsIHRoaXMuZG9DYWxsXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdmYWlsJywgdGhpcy5kb0NhbGxiYWNrXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdiYWNrb2ZmJywgdGhpcy5oYW5kbGVCYWNrb2ZmXy5iaW5kKHRoaXMpKTtcblxuICAgIGlmICh0aGlzLmZhaWxBZnRlcl8gPiAwKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8uZmFpbEFmdGVyKHRoaXMuZmFpbEFmdGVyXyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlJVTk5JTkc7XG4gICAgdGhpcy5kb0NhbGxfKCk7XG59O1xuXG4vKipcbiAqIENhbGxzIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5kb0NhbGxfID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGV2ZW50QXJncyA9IFsnY2FsbCddLmNvbmNhdCh0aGlzLmFyZ3VtZW50c18pO1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQuYXBwbHkodGhpcywgZXZlbnRBcmdzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmhhbmRsZUZ1bmN0aW9uQ2FsbGJhY2tfLmJpbmQodGhpcyk7XG4gICAgdGhpcy5mdW5jdGlvbl8uYXBwbHkobnVsbCwgdGhpcy5hcmd1bWVudHNfLmNvbmNhdChjYWxsYmFjaykpO1xufTtcblxuLyoqXG4gKiBDYWxscyB0aGUgd3JhcHBlZCBmdW5jdGlvbidzIGNhbGxiYWNrIHdpdGggdGhlIGxhc3QgcmVzdWx0IHJldHVybmVkIGJ5IHRoZVxuICogd3JhcHBlZCBmdW5jdGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuZG9DYWxsYmFja18gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHRoaXMucmVzdWx0c19bdGhpcy5yZXN1bHRzXy5sZW5ndGggLSAxXTtcbiAgICB0aGlzLmNhbGxiYWNrXy5hcHBseShudWxsLCBhcmdzKTtcbn07XG5cbi8qKlxuICogSGFuZGxlcyB3cmFwcGVkIGZ1bmN0aW9uJ3MgY29tcGxldGlvbi4gVGhpcyBtZXRob2QgYWN0cyBhcyBhIHJlcGxhY2VtZW50XG4gKiBmb3IgdGhlIG9yaWdpbmFsIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVGdW5jdGlvbkNhbGxiYWNrXyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmlzQWJvcnRlZCgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdGhpcy5yZXN1bHRzXy5wdXNoKGFyZ3MpOyAvLyBTYXZlIGNhbGxiYWNrIGFyZ3VtZW50cy5cbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0LmFwcGx5KHRoaXMsIFsnY2FsbGJhY2snXS5jb25jYXQoYXJncykpO1xuXG4gICAgaWYgKGFyZ3NbMF0pIHtcbiAgICAgICAgdGhpcy5iYWNrb2ZmXy5iYWNrb2ZmKGFyZ3NbMF0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RhdGVfID0gRnVuY3Rpb25DYWxsLlN0YXRlXy5DT01QTEVURUQ7XG4gICAgICAgIHRoaXMuZG9DYWxsYmFja18oKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgYmFja29mZiBldmVudC5cbiAqIEBwYXJhbSBudW1iZXIgQmFja29mZiBudW1iZXIuXG4gKiBAcGFyYW0gZGVsYXkgQmFja29mZiBkZWxheS5cbiAqIEBwYXJhbSBlcnIgVGhlIGVycm9yIHRoYXQgY2F1c2VkIHRoZSBiYWNrb2ZmLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVCYWNrb2ZmXyA9IGZ1bmN0aW9uKG51bWJlciwgZGVsYXksIGVycikge1xuICAgIHRoaXMuZW1pdCgnYmFja29mZicsIG51bWJlciwgZGVsYXksIGVycik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZ1bmN0aW9uQ2FsbDtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG52YXIgQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneScpO1xuXG4vKipcbiAqIEV4cG9uZW50aWFsIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykge1xuICAgIEJhY2tvZmZTdHJhdGVneS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59XG51dGlsLmluaGVyaXRzKEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LCBCYWNrb2ZmU3RyYXRlZ3kpO1xuXG4vKiogQGluaGVyaXREb2MgKi9cbkV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IE1hdGgubWluKHRoaXMubmV4dEJhY2tvZmZEZWxheV8sIHRoaXMuZ2V0TWF4RGVsYXkoKSk7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZkRlbGF5XyAqIDI7XG4gICAgcmV0dXJuIHRoaXMuYmFja29mZkRlbGF5Xztcbn07XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5O1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL3N0cmF0ZWd5Jyk7XG5cbi8qKlxuICogRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICBCYWNrb2ZmU3RyYXRlZ3kuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xufVxudXRpbC5pbmhlcml0cyhGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3ksIEJhY2tvZmZTdHJhdGVneSk7XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRmlib25hY2NpQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSBNYXRoLm1pbih0aGlzLm5leHRCYWNrb2ZmRGVsYXlfLCB0aGlzLmdldE1heERlbGF5KCkpO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gKz0gdGhpcy5iYWNrb2ZmRGVsYXlfO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IGJhY2tvZmZEZWxheTtcbiAgICByZXR1cm4gYmFja29mZkRlbGF5O1xufTtcblxuLyoqIEBpbmhlcml0RG9jICovXG5GaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneTtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5mdW5jdGlvbiBpc0RlZih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsO1xufVxuXG4vKipcbiAqIEFic3RyYWN0IGNsYXNzIGRlZmluaW5nIHRoZSBza2VsZXRvbiBmb3IgYWxsIGJhY2tvZmYgc3RyYXRlZ2llcy5cbiAqIEBwYXJhbSBvcHRpb25zIEJhY2tvZmYgc3RyYXRlZ3kgb3B0aW9ucy5cbiAqIEBwYXJhbSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yLCBtdXN0IGJlIGJldHdlZW5cbiAqIDAgYW5kIDEuXG4gKiBAcGFyYW0gb3B0aW9ucy5pbml0aWFsRGVsYXkgVGhlIGJhY2tvZmYgaW5pdGlhbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQHBhcmFtIG9wdGlvbnMubWF4RGVsYXkgVGhlIGJhY2tvZmYgbWF4aW1hbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEJhY2tvZmZTdHJhdGVneShvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICBpZiAoaXNEZWYob3B0aW9ucy5pbml0aWFsRGVsYXkpICYmIG9wdGlvbnMuaW5pdGlhbERlbGF5IDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBpbml0aWFsIHRpbWVvdXQgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4nKTtcbiAgICB9IGVsc2UgaWYgKGlzRGVmKG9wdGlvbnMubWF4RGVsYXkpICYmIG9wdGlvbnMubWF4RGVsYXkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgdGltZW91dCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLicpO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbERlbGF5XyA9IG9wdGlvbnMuaW5pdGlhbERlbGF5IHx8IDEwMDtcbiAgICB0aGlzLm1heERlbGF5XyA9IG9wdGlvbnMubWF4RGVsYXkgfHwgMTAwMDA7XG5cbiAgICBpZiAodGhpcy5tYXhEZWxheV8gPD0gdGhpcy5pbml0aWFsRGVsYXlfKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgYmFja29mZiBkZWxheSBtdXN0IGJlICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2dyZWF0ZXIgdGhhbiB0aGUgaW5pdGlhbCBiYWNrb2ZmIGRlbGF5LicpO1xuICAgIH1cblxuICAgIGlmIChpc0RlZihvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IpICYmXG4gICAgICAgIChvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgPCAwIHx8IG9wdGlvbnMucmFuZG9taXNhdGlvbkZhY3RvciA+IDEpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yIG11c3QgYmUgYmV0d2VlbiAwIGFuZCAxLicpO1xuICAgIH1cblxuICAgIHRoaXMucmFuZG9taXNhdGlvbkZhY3Rvcl8gPSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgfHwgMDtcbn1cblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIG1heGltYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIG1heGltYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldE1heERlbGF5ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMubWF4RGVsYXlfO1xufTtcblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIGluaXRpYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIGluaXRpYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldEluaXRpYWxEZWxheSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxEZWxheV87XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IGNvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSB0aGlzLm5leHRfKCk7XG4gICAgdmFyIHJhbmRvbWlzYXRpb25NdWx0aXBsZSA9IDEgKyBNYXRoLnJhbmRvbSgpICogdGhpcy5yYW5kb21pc2F0aW9uRmFjdG9yXztcbiAgICB2YXIgcmFuZG9taXplZERlbGF5ID0gTWF0aC5yb3VuZChiYWNrb2ZmRGVsYXkgKiByYW5kb21pc2F0aW9uTXVsdGlwbGUpO1xuICAgIHJldHVybiByYW5kb21pemVkRGVsYXk7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKiBAcHJvdGVjdGVkXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5uZXh0XygpIHVuaW1wbGVtZW50ZWQuJyk7XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IHJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVzZXRfKCk7XG59O1xuXG4vKipcbiAqIFJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwcm90ZWN0ZWRcbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5yZXNldF8oKSB1bmltcGxlbWVudGVkLicpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmU3RyYXRlZ3k7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbm5lY3Q7XG5jb25uZWN0LmNvbm5lY3QgPSBjb25uZWN0O1xuXG4vKiB0aGlzIHdob2xlIGZpbGUgb25seSBleGlzdHMgYmVjYXVzZSB0bHMuc3RhcnRcbiAqIGRvZW5zJ3QgZXhpc3RzIGFuZCB0bHMuY29ubmVjdCBjYW5ub3Qgc3RhcnQgc2VydmVyXG4gKiBjb25uZWN0aW9uc1xuICpcbiAqIGNvcGllZCBmcm9tIF90bHNfd3JhcC5qc1xuICovXG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gcmVxdWlyZSgnbmV0JykuY3JlYXRlU3RyZWFtKDI1LCAnc210cC5leGFtcGxlLmNvbScpXG4vLyAgcy5vbignY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuLy8gICByZXF1aXJlKCd0bHMtY29ubmVjdCcpKHMsIHtjcmVkZW50aWFsczpjcmVkcywgaXNTZXJ2ZXI6ZmFsc2V9LCBmdW5jdGlvbigpIHtcbi8vICAgICAgaWYgKCFzLmF1dGhvcml6ZWQpIHtcbi8vICAgICAgICBzLmRlc3Ryb3koKVxuLy8gICAgICAgIHJldHVyblxuLy8gICAgICB9XG4vL1xuLy8gICAgICBzLmVuZChcImhlbGxvIHdvcmxkXFxuXCIpXG4vLyAgICB9KVxuLy8gIH0pXG5cbnZhciBuZXQgPSByZXF1aXJlKCduZXQnKVxudmFyIHRscyA9IHJlcXVpcmUoJ3RscycpXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxudmFyIGFzc2VydCA9IHJlcXVpcmUoJ2Fzc2VydCcpXG52YXIgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcblxuLy8gUmV0dXJucyBhbiBhcnJheSBbb3B0aW9uc10gb3IgW29wdGlvbnMsIGNiXVxuLy8gSXQgaXMgdGhlIHNhbWUgYXMgdGhlIGFyZ3VtZW50IG9mIFNvY2tldC5wcm90b3R5cGUuY29ubmVjdCgpLlxuZnVuY3Rpb24gX19ub3JtYWxpemVDb25uZWN0QXJncyhhcmdzKSB7XG4gIHZhciBvcHRpb25zID0ge307XG5cbiAgaWYgKHR5cGVvZihhcmdzWzBdKSA9PSAnb2JqZWN0Jykge1xuICAgIC8vIGNvbm5lY3Qob3B0aW9ucywgW2NiXSlcbiAgICBvcHRpb25zID0gYXJnc1swXTtcbiAgfSBlbHNlIGlmIChpc1BpcGVOYW1lKGFyZ3NbMF0pKSB7XG4gICAgLy8gY29ubmVjdChwYXRoLCBbY2JdKTtcbiAgICBvcHRpb25zLnBhdGggPSBhcmdzWzBdO1xuICB9IGVsc2Uge1xuICAgIC8vIGNvbm5lY3QocG9ydCwgW2hvc3RdLCBbY2JdKVxuICAgIG9wdGlvbnMucG9ydCA9IGFyZ3NbMF07XG4gICAgaWYgKHR5cGVvZihhcmdzWzFdKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9wdGlvbnMuaG9zdCA9IGFyZ3NbMV07XG4gICAgfVxuICB9XG5cbiAgdmFyIGNiID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gdHlwZW9mKGNiKSA9PT0gJ2Z1bmN0aW9uJyA/IFtvcHRpb25zLCBjYl0gOiBbb3B0aW9uc107XG59XG5cbmZ1bmN0aW9uIF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0LCBjZXJ0KSB7XG4gIC8vIENyZWF0ZSByZWdleHAgdG8gbXVjaCBob3N0bmFtZXNcbiAgZnVuY3Rpb24gcmVnZXhwaWZ5KGhvc3QsIHdpbGRjYXJkcykge1xuICAgIC8vIEFkZCB0cmFpbGluZyBkb3QgKG1ha2UgaG9zdG5hbWVzIHVuaWZvcm0pXG4gICAgaWYgKCEvXFwuJC8udGVzdChob3N0KSkgaG9zdCArPSAnLic7XG5cbiAgICAvLyBUaGUgc2FtZSBhcHBsaWVzIHRvIGhvc3RuYW1lIHdpdGggbW9yZSB0aGFuIG9uZSB3aWxkY2FyZCxcbiAgICAvLyBpZiBob3N0bmFtZSBoYXMgd2lsZGNhcmQgd2hlbiB3aWxkY2FyZHMgYXJlIG5vdCBhbGxvd2VkLFxuICAgIC8vIG9yIGlmIHRoZXJlIGFyZSBsZXNzIHRoYW4gdHdvIGRvdHMgYWZ0ZXIgd2lsZGNhcmQgKGkuZS4gKi5jb20gb3IgKmQuY29tKVxuICAgIC8vXG4gICAgLy8gYWxzb1xuICAgIC8vXG4gICAgLy8gXCJUaGUgY2xpZW50IFNIT1VMRCBOT1QgYXR0ZW1wdCB0byBtYXRjaCBhIHByZXNlbnRlZCBpZGVudGlmaWVyIGluXG4gICAgLy8gd2hpY2ggdGhlIHdpbGRjYXJkIGNoYXJhY3RlciBjb21wcmlzZXMgYSBsYWJlbCBvdGhlciB0aGFuIHRoZVxuICAgIC8vIGxlZnQtbW9zdCBsYWJlbCAoZS5nLiwgZG8gbm90IG1hdGNoIGJhci4qLmV4YW1wbGUubmV0KS5cIlxuICAgIC8vIFJGQzYxMjVcbiAgICBpZiAoIXdpbGRjYXJkcyAmJiAvXFwqLy50ZXN0KGhvc3QpIHx8IC9bXFwuXFwqXS4qXFwqLy50ZXN0KGhvc3QpIHx8XG4gICAgICAgIC9cXCovLnRlc3QoaG9zdCkgJiYgIS9cXCouKlxcLi4rXFwuLisvLnRlc3QoaG9zdCkpIHtcbiAgICAgIHJldHVybiAvJC4vO1xuICAgIH1cblxuICAgIC8vIFJlcGxhY2Ugd2lsZGNhcmQgY2hhcnMgd2l0aCByZWdleHAncyB3aWxkY2FyZCBhbmRcbiAgICAvLyBlc2NhcGUgYWxsIGNoYXJhY3RlcnMgdGhhdCBoYXZlIHNwZWNpYWwgbWVhbmluZyBpbiByZWdleHBzXG4gICAgLy8gKGkuZS4gJy4nLCAnWycsICd7JywgJyonLCBhbmQgb3RoZXJzKVxuICAgIHZhciByZSA9IGhvc3QucmVwbGFjZShcbiAgICAgICAgL1xcKihbYS16MC05XFxcXC1fXFwuXSl8W1xcLixcXC1cXFxcXFxeXFwkKz8qXFxbXFxdXFwoXFwpOiFcXHx7fV0vZyxcbiAgICAgICAgZnVuY3Rpb24oYWxsLCBzdWIpIHtcbiAgICAgICAgICBpZiAoc3ViKSByZXR1cm4gJ1thLXowLTlcXFxcLV9dKicgKyAoc3ViID09PSAnLScgPyAnXFxcXC0nIDogc3ViKTtcbiAgICAgICAgICByZXR1cm4gJ1xcXFwnICsgYWxsO1xuICAgICAgICB9KTtcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJlICsgJyQnLCAnaScpO1xuICB9XG5cbiAgdmFyIGRuc05hbWVzID0gW10sXG4gICAgICB1cmlOYW1lcyA9IFtdLFxuICAgICAgaXBzID0gW10sXG4gICAgICBtYXRjaENOID0gdHJ1ZSxcbiAgICAgIHZhbGlkID0gZmFsc2U7XG5cbiAgLy8gVGhlcmUncmUgc2V2ZXJhbCBuYW1lcyB0byBwZXJmb3JtIGNoZWNrIGFnYWluc3Q6XG4gIC8vIENOIGFuZCBhbHRuYW1lcyBpbiBjZXJ0aWZpY2F0ZSBleHRlbnNpb25cbiAgLy8gKEROUyBuYW1lcywgSVAgYWRkcmVzc2VzLCBhbmQgVVJJcylcbiAgLy9cbiAgLy8gV2FsayB0aHJvdWdoIGFsdG5hbWVzIGFuZCBnZW5lcmF0ZSBsaXN0cyBvZiB0aG9zZSBuYW1lc1xuICBpZiAoY2VydC5zdWJqZWN0YWx0bmFtZSkge1xuICAgIGNlcnQuc3ViamVjdGFsdG5hbWUuc3BsaXQoLywgL2cpLmZvckVhY2goZnVuY3Rpb24oYWx0bmFtZSkge1xuICAgICAgaWYgKC9eRE5TOi8udGVzdChhbHRuYW1lKSkge1xuICAgICAgICBkbnNOYW1lcy5wdXNoKGFsdG5hbWUuc2xpY2UoNCkpO1xuICAgICAgfSBlbHNlIGlmICgvXklQIEFkZHJlc3M6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIGlwcy5wdXNoKGFsdG5hbWUuc2xpY2UoMTEpKTtcbiAgICAgIH0gZWxzZSBpZiAoL15VUkk6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIHZhciB1cmkgPSB1cmwucGFyc2UoYWx0bmFtZS5zbGljZSg0KSk7XG4gICAgICAgIGlmICh1cmkpIHVyaU5hbWVzLnB1c2godXJpLmhvc3RuYW1lKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIElmIGhvc3RuYW1lIGlzIGFuIElQIGFkZHJlc3MsIGl0IHNob3VsZCBiZSBwcmVzZW50IGluIHRoZSBsaXN0IG9mIElQXG4gIC8vIGFkZHJlc3Nlcy5cbiAgaWYgKG5ldC5pc0lQKGhvc3QpKSB7XG4gICAgdmFsaWQgPSBpcHMuc29tZShmdW5jdGlvbihpcCkge1xuICAgICAgcmV0dXJuIGlwID09PSBob3N0O1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFRyYW5zZm9ybSBob3N0bmFtZSB0byBjYW5vbmljYWwgZm9ybVxuICAgIGlmICghL1xcLiQvLnRlc3QoaG9zdCkpIGhvc3QgKz0gJy4nO1xuXG4gICAgLy8gT3RoZXJ3aXNlIGNoZWNrIGFsbCBETlMvVVJJIHJlY29yZHMgZnJvbSBjZXJ0aWZpY2F0ZVxuICAgIC8vICh3aXRoIGFsbG93ZWQgd2lsZGNhcmRzKVxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMubWFwKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiByZWdleHBpZnkobmFtZSwgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBXaWxkY2FyZHMgYWluJ3QgYWxsb3dlZCBpbiBVUkkgbmFtZXNcbiAgICB1cmlOYW1lcyA9IHVyaU5hbWVzLm1hcChmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcmVnZXhwaWZ5KG5hbWUsIGZhbHNlKTtcbiAgICB9KTtcblxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMuY29uY2F0KHVyaU5hbWVzKTtcblxuICAgIGlmIChkbnNOYW1lcy5sZW5ndGggPiAwKSBtYXRjaENOID0gZmFsc2U7XG5cblxuICAgIC8vIE1hdGNoIGFnYWluc3QgQ29tbW9uIE5hbWUgKENOKSBvbmx5IGlmIG5vIHN1cHBvcnRlZCBpZGVudGlmaWVycyBhcmVcbiAgICAvLyBwcmVzZW50LlxuICAgIC8vXG4gICAgLy8gXCJBcyBub3RlZCwgYSBjbGllbnQgTVVTVCBOT1Qgc2VlayBhIG1hdGNoIGZvciBhIHJlZmVyZW5jZSBpZGVudGlmaWVyXG4gICAgLy8gIG9mIENOLUlEIGlmIHRoZSBwcmVzZW50ZWQgaWRlbnRpZmllcnMgaW5jbHVkZSBhIEROUy1JRCwgU1JWLUlELFxuICAgIC8vICBVUkktSUQsIG9yIGFueSBhcHBsaWNhdGlvbi1zcGVjaWZpYyBpZGVudGlmaWVyIHR5cGVzIHN1cHBvcnRlZCBieSB0aGVcbiAgICAvLyAgY2xpZW50LlwiXG4gICAgLy8gUkZDNjEyNVxuICAgIGlmIChtYXRjaENOKSB7XG4gICAgICB2YXIgY29tbW9uTmFtZXMgPSBjZXJ0LnN1YmplY3QuQ047XG4gICAgICBpZiAodXRpbC5pc0FycmF5KGNvbW1vbk5hbWVzKSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgayA9IGNvbW1vbk5hbWVzLmxlbmd0aDsgaSA8IGs7ICsraSkge1xuICAgICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzW2ldLCB0cnVlKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzLCB0cnVlKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFsaWQgPSBkbnNOYW1lcy5zb21lKGZ1bmN0aW9uKHJlKSB7XG4gICAgICByZXR1cm4gcmUudGVzdChob3N0KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB2YWxpZDtcbn07XG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gdGxzLmNvbm5lY3Qoe3BvcnQ6IDgwMDAsIGhvc3Q6IFwiZ29vZ2xlLmNvbVwifSwgZnVuY3Rpb24oKSB7XG4vLyAgICBpZiAoIXMuYXV0aG9yaXplZCkge1xuLy8gICAgICBzLmRlc3Ryb3koKTtcbi8vICAgICAgcmV0dXJuO1xuLy8gICAgfVxuLy9cbi8vICAgIC8vIHMuc29ja2V0O1xuLy9cbi8vICAgIHMuZW5kKFwiaGVsbG8gd29ybGRcXG5cIik7XG4vLyAgfSk7XG4vL1xuLy9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvbm5lY3RBcmdzKGxpc3RBcmdzKSB7XG4gIHZhciBhcmdzID0gX19ub3JtYWxpemVDb25uZWN0QXJncyhsaXN0QXJncyk7XG4gIHZhciBvcHRpb25zID0gYXJnc1swXTtcbiAgdmFyIGNiID0gYXJnc1sxXTtcblxuICBpZiAodHlwZW9mKGxpc3RBcmdzWzFdKSA9PT0gJ29iamVjdCcpIHtcbiAgICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKG9wdGlvbnMsIGxpc3RBcmdzWzFdKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YobGlzdEFyZ3NbMl0pID09PSAnb2JqZWN0Jykge1xuICAgIG9wdGlvbnMgPSB1dGlsLl9leHRlbmQob3B0aW9ucywgbGlzdEFyZ3NbMl0pO1xuICB9XG5cbiAgcmV0dXJuIChjYikgPyBbb3B0aW9ucywgY2JdIDogW29wdGlvbnNdO1xufVxuXG5mdW5jdGlvbiBsZWdhY3lDb25uZWN0KGhvc3RuYW1lLCBvcHRpb25zLCBOUE4sIGNyZWRlbnRpYWxzKSB7XG4gIGFzc2VydChvcHRpb25zLnNvY2tldCk7XG4gIHZhciBwYWlyID0gdGxzLmNyZWF0ZVNlY3VyZVBhaXIoY3JlZGVudGlhbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgISFvcHRpb25zLmlzU2VydmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICEhb3B0aW9ucy5yZXF1ZXN0Q2VydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5QTlByb3RvY29sczogTlBOLk5QTlByb3RvY29scyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlcnZlcm5hbWU6IGhvc3RuYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gIGxlZ2FjeVBpcGUocGFpciwgb3B0aW9ucy5zb2NrZXQpO1xuICBwYWlyLmNsZWFydGV4dC5fY29udHJvbFJlbGVhc2VkID0gdHJ1ZTtcbiAgcGFpci5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICBwYWlyLmNsZWFydGV4dC5lbWl0KCdlcnJvcicsIGVycik7XG4gIH0pO1xuXG4gIHJldHVybiBwYWlyO1xufVxuXG5mdW5jdGlvbiBjb25uZWN0KC8qIFtwb3J0LCBob3N0XSwgb3B0aW9ucywgY2IgKi8pIHtcbiAgdmFyIGFyZ3MgPSBub3JtYWxpemVDb25uZWN0QXJncyhhcmd1bWVudHMpO1xuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMF07XG4gIHZhciBjYiA9IGFyZ3NbMV07XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIHJlamVjdFVuYXV0aG9yaXplZDogJzAnICE9PSBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVELFxuICAgIHJlcXVlc3RDZXJ0OiB0cnVlLFxuICAgIGlzU2VydmVyOiBmYWxzZVxuICB9O1xuICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zIHx8IHt9KTtcblxuICB2YXIgaG9zdG5hbWUgPSBvcHRpb25zLnNlcnZlcm5hbWUgfHxcbiAgICAgICAgICAgICAgICAgb3B0aW9ucy5ob3N0IHx8XG4gICAgICAgICAgICAgICAgIG9wdGlvbnMuc29ja2V0ICYmIG9wdGlvbnMuc29ja2V0Ll9ob3N0IHx8XG4gICAgICAgICAgICAgICAgICcxMjcuMC4wLjEnLFxuICAgICAgTlBOID0ge30sXG4gICAgICBjcmVkZW50aWFscyA9IG9wdGlvbnMuY3JlZGVudGlhbHMgfHwgY3J5cHRvLmNyZWF0ZUNyZWRlbnRpYWxzKG9wdGlvbnMpO1xuICBpZiAodGxzLmNvbnZlcnROUE5Qcm90b2NvbHMpXG4gICAgdGxzLmNvbnZlcnROUE5Qcm90b2NvbHMob3B0aW9ucy5OUE5Qcm90b2NvbHMsIE5QTik7XG5cbiAgLy8gV3JhcHBpbmcgVExTIHNvY2tldCBpbnNpZGUgYW5vdGhlciBUTFMgc29ja2V0IHdhcyByZXF1ZXN0ZWQgLVxuICAvLyBjcmVhdGUgbGVnYWN5IHNlY3VyZSBwYWlyXG4gIHZhciBzb2NrZXQ7XG4gIHZhciBsZWdhY3k7XG4gIHZhciByZXN1bHQ7XG4gIGlmICh0eXBlb2YgdGxzLlRMU1NvY2tldCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBsZWdhY3kgPSB0cnVlO1xuICAgIHNvY2tldCA9IGxlZ2FjeUNvbm5lY3QoaG9zdG5hbWUsIG9wdGlvbnMsIE5QTiwgY3JlZGVudGlhbHMpO1xuICAgIHJlc3VsdCA9IHNvY2tldC5jbGVhcnRleHQ7XG4gIH0gZWxzZSB7XG4gICAgbGVnYWN5ID0gZmFsc2U7XG4gICAgc29ja2V0ID0gbmV3IHRscy5UTFNTb2NrZXQob3B0aW9ucy5zb2NrZXQsIHtcbiAgICAgIGNyZWRlbnRpYWxzOiBjcmVkZW50aWFscyxcbiAgICAgIGlzU2VydmVyOiAhIW9wdGlvbnMuaXNTZXJ2ZXIsXG4gICAgICByZXF1ZXN0Q2VydDogISFvcHRpb25zLnJlcXVlc3RDZXJ0LFxuICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgTlBOUHJvdG9jb2xzOiBOUE4uTlBOUHJvdG9jb2xzXG4gICAgfSk7XG4gICAgcmVzdWx0ID0gc29ja2V0O1xuICB9XG5cbiAgaWYgKHNvY2tldC5faGFuZGxlICYmICFzb2NrZXQuX2Nvbm5lY3RpbmcpIHtcbiAgICBvbkhhbmRsZSgpO1xuICB9IGVsc2Uge1xuICAgIC8vIE5vdCBldmVuIHN0YXJ0ZWQgY29ubmVjdGluZyB5ZXQgKG9yIHByb2JhYmx5IHJlc29sdmluZyBkbnMgYWRkcmVzcyksXG4gICAgLy8gY2F0Y2ggc29ja2V0IGVycm9ycyBhbmQgYXNzaWduIGhhbmRsZS5cbiAgICBpZiAoIWxlZ2FjeSAmJiBvcHRpb25zLnNvY2tldCkge1xuICAgICAgb3B0aW9ucy5zb2NrZXQub25jZSgnY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBhc3NlcnQob3B0aW9ucy5zb2NrZXQuX2hhbmRsZSk7XG4gICAgICAgIHNvY2tldC5faGFuZGxlID0gb3B0aW9ucy5zb2NrZXQuX2hhbmRsZTtcbiAgICAgICAgc29ja2V0Ll9oYW5kbGUub3duZXIgPSBzb2NrZXQ7XG5cbiAgICAgICAgc29ja2V0LmVtaXQoJ2Nvbm5lY3QnKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBzb2NrZXQub25jZSgnY29ubmVjdCcsIG9uSGFuZGxlKTtcbiAgfVxuXG4gIGlmIChjYilcbiAgICByZXN1bHQub25jZSgnc2VjdXJlQ29ubmVjdCcsIGNiKTtcblxuICBpZiAoIW9wdGlvbnMuc29ja2V0KSB7XG4gICAgYXNzZXJ0KCFsZWdhY3kpO1xuICAgIHZhciBjb25uZWN0X29wdDtcbiAgICBpZiAob3B0aW9ucy5wYXRoICYmICFvcHRpb25zLnBvcnQpIHtcbiAgICAgIGNvbm5lY3Rfb3B0ID0geyBwYXRoOiBvcHRpb25zLnBhdGggfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29ubmVjdF9vcHQgPSB7XG4gICAgICAgIHBvcnQ6IG9wdGlvbnMucG9ydCxcbiAgICAgICAgaG9zdDogb3B0aW9ucy5ob3N0LFxuICAgICAgICBsb2NhbEFkZHJlc3M6IG9wdGlvbnMubG9jYWxBZGRyZXNzXG4gICAgICB9O1xuICAgIH1cbiAgICBzb2NrZXQuY29ubmVjdChjb25uZWN0X29wdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xuXG4gIGZ1bmN0aW9uIG9uSGFuZGxlKCkge1xuICAgIGlmICghbGVnYWN5KVxuICAgICAgc29ja2V0Ll9yZWxlYXNlQ29udHJvbCgpO1xuXG4gICAgaWYgKG9wdGlvbnMuc2Vzc2lvbilcbiAgICAgIHNvY2tldC5zZXRTZXNzaW9uKG9wdGlvbnMuc2Vzc2lvbik7XG5cbiAgICBpZiAoIWxlZ2FjeSkge1xuICAgICAgaWYgKG9wdGlvbnMuc2VydmVybmFtZSlcbiAgICAgICAgc29ja2V0LnNldFNlcnZlcm5hbWUob3B0aW9ucy5zZXJ2ZXJuYW1lKTtcblxuICAgICAgaWYgKCFvcHRpb25zLmlzU2VydmVyKVxuICAgICAgICBzb2NrZXQuX3N0YXJ0KCk7XG4gICAgfVxuICAgIHNvY2tldC5vbignc2VjdXJlJywgZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc3NsID0gc29ja2V0Ll9zc2wgfHwgc29ja2V0LnNzbDtcbiAgICAgIHZhciB2ZXJpZnlFcnJvciA9IHNzbC52ZXJpZnlFcnJvcigpO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCBzZXJ2ZXIncyBpZGVudGl0eSBtYXRjaGVzIGl0J3MgY2VydGlmaWNhdGUncyBuYW1lc1xuICAgICAgaWYgKCF2ZXJpZnlFcnJvcikge1xuICAgICAgICB2YXIgY2VydCA9IHJlc3VsdC5nZXRQZWVyQ2VydGlmaWNhdGUoKTtcbiAgICAgICAgdmFyIHZhbGlkQ2VydCA9IF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0bmFtZSwgY2VydCk7XG4gICAgICAgIGlmICghdmFsaWRDZXJ0KSB7XG4gICAgICAgICAgdmVyaWZ5RXJyb3IgPSBuZXcgRXJyb3IoJ0hvc3RuYW1lL0lQIGRvZXNuXFwndCBtYXRjaCBjZXJ0aWZpY2F0ZVxcJ3MgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2FsdG5hbWVzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHZlcmlmeUVycm9yKSB7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemVkID0gZmFsc2U7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemF0aW9uRXJyb3IgPSB2ZXJpZnlFcnJvci5tZXNzYWdlO1xuXG4gICAgICAgIGlmIChvcHRpb25zLnJlamVjdFVuYXV0aG9yaXplZCkge1xuICAgICAgICAgIHJlc3VsdC5lbWl0KCdlcnJvcicsIHZlcmlmeUVycm9yKTtcbiAgICAgICAgICByZXN1bHQuZGVzdHJveSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQuZW1pdCgnc2VjdXJlQ29ubmVjdCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQuYXV0aG9yaXplZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5lbWl0KCdzZWN1cmVDb25uZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFVuY29yayBpbmNvbWluZyBkYXRhXG4gICAgICByZXN1bHQucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uSGFuZ1VwKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIG9uSGFuZ1VwKCkge1xuICAgICAgLy8gTk9URTogVGhpcyBsb2dpYyBpcyBzaGFyZWQgd2l0aCBfaHR0cF9jbGllbnQuanNcbiAgICAgIGlmICghc29ja2V0Ll9oYWRFcnJvcikge1xuICAgICAgICBzb2NrZXQuX2hhZEVycm9yID0gdHJ1ZTtcbiAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdzb2NrZXQgaGFuZyB1cCcpO1xuICAgICAgICBlcnJvci5jb2RlID0gJ0VDT05OUkVTRVQnO1xuICAgICAgICBzb2NrZXQuZGVzdHJveSgpO1xuICAgICAgICBzb2NrZXQuZW1pdCgnZXJyb3InLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5vbmNlKCdlbmQnLCBvbkhhbmdVcCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGxlZ2FjeVBpcGUocGFpciwgc29ja2V0KSB7XG4gIHBhaXIuZW5jcnlwdGVkLnBpcGUoc29ja2V0KTtcbiAgc29ja2V0LnBpcGUocGFpci5lbmNyeXB0ZWQpO1xuXG4gIHBhaXIuZW5jcnlwdGVkLm9uKCdjbG9zZScsIGZ1bmN0aW9uKCkge1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAvLyBFbmNyeXB0ZWQgc2hvdWxkIGJlIHVucGlwZWQgZnJvbSBzb2NrZXQgdG8gcHJldmVudCBwb3NzaWJsZVxuICAgICAgLy8gd3JpdGUgYWZ0ZXIgZGVzdHJveS5cbiAgICAgIGlmIChwYWlyLmVuY3J5cHRlZC51bnBpcGUpXG4gICAgICAgIHBhaXIuZW5jcnlwdGVkLnVucGlwZShzb2NrZXQpO1xuICAgICAgc29ja2V0LmRlc3Ryb3lTb29uKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHBhaXIuZmQgPSBzb2NrZXQuZmQ7XG4gIHBhaXIuX2hhbmRsZSA9IHNvY2tldC5faGFuZGxlO1xuICB2YXIgY2xlYXJ0ZXh0ID0gcGFpci5jbGVhcnRleHQ7XG4gIGNsZWFydGV4dC5zb2NrZXQgPSBzb2NrZXQ7XG4gIGNsZWFydGV4dC5lbmNyeXB0ZWQgPSBwYWlyLmVuY3J5cHRlZDtcbiAgY2xlYXJ0ZXh0LmF1dGhvcml6ZWQgPSBmYWxzZTtcblxuICAvLyBjeWNsZSB0aGUgZGF0YSB3aGVuZXZlciB0aGUgc29ja2V0IGRyYWlucywgc28gdGhhdFxuICAvLyB3ZSBjYW4gcHVsbCBzb21lIG1vcmUgaW50byBpdC4gIG5vcm1hbGx5IHRoaXMgd291bGRcbiAgLy8gYmUgaGFuZGxlZCBieSB0aGUgZmFjdCB0aGF0IHBpcGUoKSB0cmlnZ2VycyByZWFkKCkgY2FsbHNcbiAgLy8gb24gd3JpdGFibGUuZHJhaW4sIGJ1dCBDcnlwdG9TdHJlYW1zIGFyZSBhIGJpdCBtb3JlXG4gIC8vIGNvbXBsaWNhdGVkLiAgU2luY2UgdGhlIGVuY3J5cHRlZCBzaWRlIGFjdHVhbGx5IGdldHNcbiAgLy8gaXRzIGRhdGEgZnJvbSB0aGUgY2xlYXJ0ZXh0IHNpZGUsIHdlIGhhdmUgdG8gZ2l2ZSBpdCBhXG4gIC8vIGxpZ2h0IGtpY2sgdG8gZ2V0IGluIG1vdGlvbiBhZ2Fpbi5cbiAgc29ja2V0Lm9uKCdkcmFpbicsIGZ1bmN0aW9uKCkge1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5fcGVuZGluZyAmJiBwYWlyLmVuY3J5cHRlZC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5lbmNyeXB0ZWQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmNsZWFydGV4dC5fcGVuZGluZyAmJiBwYWlyLmNsZWFydGV4dC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5jbGVhcnRleHQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5yZWFkKVxuICAgICAgcGFpci5lbmNyeXB0ZWQucmVhZCgwKTtcbiAgICBpZiAocGFpci5jbGVhcnRleHQucmVhZClcbiAgICAgIHBhaXIuY2xlYXJ0ZXh0LnJlYWQoMCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIG9uZXJyb3IoZSkge1xuICAgIGlmIChjbGVhcnRleHQuX2NvbnRyb2xSZWxlYXNlZCkge1xuICAgICAgY2xlYXJ0ZXh0LmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25jbG9zZSgpIHtcbiAgICBzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25lcnJvcik7XG4gICAgc29ja2V0LnJlbW92ZUxpc3RlbmVyKCd0aW1lb3V0Jywgb250aW1lb3V0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9udGltZW91dCgpIHtcbiAgICBjbGVhcnRleHQuZW1pdCgndGltZW91dCcpO1xuICB9XG5cbiAgc29ja2V0Lm9uKCdlcnJvcicsIG9uZXJyb3IpO1xuICBzb2NrZXQub24oJ2Nsb3NlJywgb25jbG9zZSk7XG4gIHNvY2tldC5vbigndGltZW91dCcsIG9udGltZW91dCk7XG5cbiAgcmV0dXJuIGNsZWFydGV4dDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpKSJdfQ==
