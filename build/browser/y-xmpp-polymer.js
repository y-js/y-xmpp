(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
var XMPP;

XMPP = require('./y-xmpp');

new Polymer('y-xmpp', {
  xmpp: new XMPP(),
  ready: function() {
    var options;
    if (this.room == null) {
      throw new Error("You must define a room attribute in the xmpp-connector!!");
    }
    options = {};
    if (this.syncMode != null) {
      options.syncMode = this.syncMode;
    }
    this.connector = this.xmpp.join(this.room, options);
    if (this.debug != null) {
      return this.connector.debug = this.debug;
    }
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
    var f, _i, _len, _ref;
    _ref = this.when_online_listeners;
    for (_i = 0, _len = _ref.length; _i < _len; _i++) {
      f = _ref[_i];
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
    if (options.syncMode == null) {
      options.syncMode = "syncAll";
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
              syncMode: options.syncMode,
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
        return this.userLeft(sender, sender_role);
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
    this.wait = opts.wait;
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
            content: this.contentType
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

BOSHConnection.prototype.contentType = 'text/xml charset=utf-8'

BOSHConnection.prototype.send = function(stanza) {
    this.queue.push(stanza.root())
    process.nextTick(this.mayRequest.bind(this))
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
        bosh: opts.bosh,
        wait: this.wait
    })
    this._addConnectionListeners()
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
    this.wait = opts.wait || '10'
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
},{"./lib/connection":46,"./lib/jid":47,"./lib/srv":48,"./lib/stanza":49,"./lib/stream_parser":50,"ltx":54,"util":22}],46:[function(require,module,exports){
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

var INITIAL_RECONNECT_DELAY =  1e3
var MAX_RECONNECT_DELAY     = 30e3

function defaultInjection(emitter, opts) {
    // clone opts
    var options = extend({}, opts)

    // add computed options
    /* jshint -W014 */
    options.initialDelay = (opts && (opts.initialReconnectDelay
                            ||  opts.reconnectDelay)) || INITIAL_RECONNECT_DELAY
    options.maxDelay = (opts &&   opts.maxReconnectDelay)  || MAX_RECONNECT_DELAY
    options.immediate = opts && opts.socket && typeof opts.socket !== 'function'
    options.type =      opts && opts.delayType
    options.emitter =   emitter

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
    this.once('reconnect', function () {
        this.reconnect = opts && opts.reconnect
    })
}

util.inherits(Connection, EventEmitter)

Connection.prototype.NS_XMPP_TLS = NS_XMPP_TLS
Connection.NS_STREAM = NS_STREAM
Connection.prototype.NS_XMPP_STREAMS = NS_XMPP_STREAMS
// Defaults
Connection.prototype.allowTLS = true

Connection.prototype._setupSocket = function (options) {
    debug('setup socket')
    var previousOptions = {}
    var inject = reconnect(function (opts) {
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
        if (previousSocket !== this.socket)
            this.setupStream()
        return this.socket
    }.bind(this))

    inject(inject.options = options)

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
        if (self.reconnect)
            self.once('reconnect', self.startParser.bind(self))
        else
            self.end()
    })
}

Connection.prototype.stopParser = function() {
    /* No more events, please (may happen however) */
    if (this.parser) {
        var parser = this.parser
        /* Get GC'ed */
        delete this.parser
        parser.end()
    }
}

Connection.prototype.startStream = function() {
    var attrs = {}
    for (var k in this.xmlns) {
        if (this.xmlns.hasOwnProperty(k)) {
            if (!k)
                attrs.xmlns = this.xmlns[k]
            else
                attrs['xmlns:' + k] = this.xmlns[k]
        }
    }
    for (k in this.streamAttrs) {
        if (this.streamAttrs.hasOwnProperty(k))
            attrs[k] = this.streamAttrs[k]
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

Connection.prototype.onData = function(data) {
    debug('receive: ' + data.toString('utf8'))
    if (this.parser)
        this.parser.write(data)
}

Connection.prototype.setSecure = function(credentials, isServer) {
    // Remove old event listeners
    this.socket.removeAllListeners('data')
    // retain socket 'end' listeners because ssl layer doesn't support it
    this.socket.removeAllListeners('drain')
    this.socket.removeAllListeners('close')
    // remove idle_timeout
    if (this.socket.clearTimer)
        this.socket.clearTimer()

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
        this.once('reconnect', function () {this.reconnect = false})
    }
    this.stopParser()
    // if we reconnect we need to get back to the previous socket creation
    this.listen({socket:cleartext, preserve:'on'})
}

function getAllText(el) {
    return !el.children ? el : el.children.reduce(function (text, child) {
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
        if (stanza.attrs[attr] === this.xmlns[prefix])
            delete stanza.attrs[attr]
    }
    return stanza
}

/**
 * XMPP-style end connection for user
 */
Connection.prototype.onEnd = function() {
    if (this.socket && this.socket.writable) {
        if (this.streamOpened) {
            this.socket.write('</stream:stream>')
            delete this.streamOpened
        }
    }
    if (!this.reconnect)
        this.emit('end')
}

Connection.prototype.onClose = function() {
    if (!this.reconnect)
        this.emit('close')
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

},{"./stream_parser":50,"debug":51,"events":14,"ltx":54,"net":3,"reconnect-core":64,"tls-connect":71,"util":22}],47:[function(require,module,exports){
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

},{"node-stringprep":58}],48:[function(require,module,exports){
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

},{"ltx":54,"util":22}],50:[function(require,module,exports){
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
},{"./stanza":49,"events":14,"ltx":54,"util":22}],51:[function(require,module,exports){

/**
 * Expose `debug()` as the module.
 */

module.exports = debug;

/**
 * Create a debugger with the given `name`.
 *
 * @param {String} name
 * @return {Type}
 * @api public
 */

function debug(name) {
  if (!debug.enabled(name)) return function(){};

  return function(fmt){
    fmt = coerce(fmt);

    var curr = new Date;
    var ms = curr - (debug[name] || curr);
    debug[name] = curr;

    fmt = name
      + ' '
      + fmt
      + ' +' + debug.humanize(ms);

    // This hackery is required for IE8
    // where `console.log` doesn't have 'apply'
    window.console
      && console.log
      && Function.prototype.apply.call(console.log, console, arguments);
  }
}

/**
 * The currently active debug mode names.
 */

debug.names = [];
debug.skips = [];

/**
 * Enables a debug mode by name. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} name
 * @api public
 */

debug.enable = function(name) {
  try {
    localStorage.debug = name;
  } catch(e){}

  var split = (name || '').split(/[\s,]+/)
    , len = split.length;

  for (var i = 0; i < len; i++) {
    name = split[i].replace('*', '.*?');
    if (name[0] === '-') {
      debug.skips.push(new RegExp('^' + name.substr(1) + '$'));
    }
    else {
      debug.names.push(new RegExp('^' + name + '$'));
    }
  }
};

/**
 * Disable debug output.
 *
 * @api public
 */

debug.disable = function(){
  debug.enable('');
};

/**
 * Humanize the given `ms`.
 *
 * @param {Number} m
 * @return {String}
 * @api private
 */

debug.humanize = function(ms) {
  var sec = 1000
    , min = 60 * 1000
    , hour = 60 * min;

  if (ms >= hour) return (ms / hour).toFixed(1) + 'h';
  if (ms >= min) return (ms / min).toFixed(1) + 'm';
  if (ms >= sec) return (ms / sec | 0) + 's';
  return ms + 'ms';
};

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

debug.enabled = function(name) {
  for (var i = 0, len = debug.skips.length; i < len; i++) {
    if (debug.skips[i].test(name)) {
      return false;
    }
  }
  for (var i = 0, len = debug.names.length; i < len; i++) {
    if (debug.names[i].test(name)) {
      return true;
    }
  }
  return false;
};

/**
 * Coerce `val`.
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

// persist

try {
  if (window.localStorage) debug.enable(localStorage.debug);
} catch(e){}

},{}],52:[function(require,module,exports){
arguments[4][23][0].apply(exports,arguments)
},{"./element":53,"util":22}],53:[function(require,module,exports){
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
    this.attrs = attrs || {}
    this.children = []
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
    var clone = this._getElement(this.name, {})
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
            return child && child.toJSON ? child.toJSON() : child;
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

},{}],54:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./index":55,"./parse":56,"./sax/sax_ltx":57}],55:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"./dom-element":52,"./element":53,"./parse":56}],56:[function(require,module,exports){
arguments[4][27][0].apply(exports,arguments)
},{"./dom-element":52,"events":14,"util":22}],57:[function(require,module,exports){
module.exports=require(28)
},{"events":14,"util":22}],58:[function(require,module,exports){
'use strict';

var log = require('debug')('node-stringprep')

// from unicode/uidna.h
var UIDNA_ALLOW_UNASSIGNED = 1
var UIDNA_USE_STD3_RULES = 2

try {
    var bindings = require('bindings')('node_stringprep.node')
} catch (ex) {
    console.warn(
        'Cannot load StringPrep-' +
        require('./package.json').version +
        ' bindings (using fallback). You may need to ' +
        '`npm install node-stringprep`'
    )
    log(ex)
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

},{"./package.json":63,"bindings":59,"debug":60}],59:[function(require,module,exports){
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
 */

exports.getFileName = function getFileName () {
  var origPST = Error.prepareStackTrace
    , origSTL = Error.stackTraceLimit
    , dummy = {}
    , fileName

  Error.stackTraceLimit = 10

  Error.prepareStackTrace = function (e, st) {
    for (var i=0, l=st.length; i<l; i++) {
      fileName = st[i].getFileName()
      if (fileName !== __filename) {
        return
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
},{"1YiZ5S":17,"fs":3,"path":16}],60:[function(require,module,exports){
module.exports=require(42)
},{"./debug":61}],61:[function(require,module,exports){
module.exports=require(43)
},{"ms":62}],62:[function(require,module,exports){
module.exports=require(44)
},{}],63:[function(require,module,exports){
module.exports={
  "name": "node-stringprep",
  "version": "0.5.4",
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
    "nan": "~1.2.0",
    "bindings": "~1.1.1",
    "debug": "~2.0.0"
  },
  "devDependencies": {
    "proxyquire": "~0.5.2",
    "grunt-mocha-cli": "~1.3.0",
    "grunt-contrib-jshint": "~0.7.2",
    "should": "~2.1.1",
    "grunt": "~0.4.2"
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
  "_id": "node-stringprep@0.5.4",
  "dist": {
    "shasum": "dd03b3d8f6f83137754cc1ea1a55675447b0ab92",
    "tarball": "http://registry.npmjs.org/node-stringprep/-/node-stringprep-0.5.4.tgz"
  },
  "_from": "node-stringprep@^0.5.2",
  "_npmVersion": "1.4.3",
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
  "directories": {},
  "_shasum": "dd03b3d8f6f83137754cc1ea1a55675447b0ab92",
  "_resolved": "https://registry.npmjs.org/node-stringprep/-/node-stringprep-0.5.4.tgz",
  "readme": "ERROR: No README data found!"
}

},{}],64:[function(require,module,exports){
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

},{"backoff":65,"events":14}],65:[function(require,module,exports){
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

},{"./lib/backoff":66,"./lib/function_call.js":67,"./lib/strategy/exponential":68,"./lib/strategy/fibonacci":69}],66:[function(require,module,exports){
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

},{"events":14,"util":22}],67:[function(require,module,exports){
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

},{"./backoff":66,"./strategy/fibonacci":69,"events":14,"util":22}],68:[function(require,module,exports){
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

},{"./strategy":70,"util":22}],69:[function(require,module,exports){
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

},{"./strategy":70,"util":22}],70:[function(require,module,exports){
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

},{"events":14,"util":22}],71:[function(require,module,exports){
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3Nlci1wYWNrL19wcmVsdWRlLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9saWIveS14bXBwLXBvbHltZXIuY29mZmVlIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9saWIveS14bXBwLmNvZmZlZSIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9hc3NlcnQvYXNzZXJ0LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvaWVlZTc1NC9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvaGVscGVycy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2NyeXB0by1icm93c2VyaWZ5L21kNS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvcm5nLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9zaGEuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2NyeXB0by1icm93c2VyaWZ5L3NoYTI1Ni5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvZXZlbnRzL2V2ZW50cy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcGF0aC1icm93c2VyaWZ5L2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9wcm9jZXNzL2Jyb3dzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9kZWNvZGUuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9lbmNvZGUuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC91dGlsLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9kb20tZWxlbWVudC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvZWxlbWVudC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXgtYnJvd3NlcmlmeS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL3BhcnNlLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9zYXgvc2F4X2x0eC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9hbm9ueW1vdXMuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9kaWdlc3RtZDUuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9leHRlcm5hbC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL21lY2hhbmlzbS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL3BsYWluLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24veGZhY2Vib29rLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24veG9hdXRoMi5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2Jvc2guanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9zYXNsLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvc2Vzc2lvbi5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL3dlYnNvY2tldHMuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9icm93c2VyLXJlcXVlc3QvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9icm93c2VyLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvZGVidWcvZGVidWcuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9ub2RlX21vZHVsZXMvbXMvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9pbmRleC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL2xpYi9jb25uZWN0aW9uLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL2ppZC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL2xpYi9zcnYuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvc3RhbnphLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL3N0cmVhbV9wYXJzZXIuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvZGVidWcvZGVidWcuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9kb20tZWxlbWVudC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL2VsZW1lbnQuanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC1icm93c2VyaWZ5LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9wYXJzZS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvaW5kZXguanMiLCIvaG9tZS9jb2Rpby93b3Jrc3BhY2UveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbm9kZS1zdHJpbmdwcmVwL25vZGVfbW9kdWxlcy9iaW5kaW5ncy9iaW5kaW5ncy5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvcGFja2FnZS5qc29uIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2luZGV4LmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9iYWNrb2ZmLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9mdW5jdGlvbl9jYWxsLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9zdHJhdGVneS9leHBvbmVudGlhbC5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvc3RyYXRlZ3kvZmlib25hY2NpLmpzIiwiL2hvbWUvY29kaW8vd29ya3NwYWNlL3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9zdHJhdGVneS9zdHJhdGVneS5qcyIsIi9ob21lL2NvZGlvL3dvcmtzcGFjZS95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy90bHMtY29ubmVjdC9zdGFydHRscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBLElBQUEsSUFBQTs7QUFBQSxJQUFBLEdBQU8sT0FBQSxDQUFTLFVBQVQsQ0FBUCxDQUFBOztBQUFBLElBRUksT0FBQSxDQUFTLFFBQVQsRUFDRjtBQUFBLEVBQUEsSUFBQSxFQUFVLElBQUEsSUFBQSxDQUFBLENBQVY7QUFBQSxFQUNBLEtBQUEsRUFBTyxTQUFBLEdBQUE7QUFDTCxRQUFBLE9BQUE7QUFBQSxJQUFBLElBQU8saUJBQVA7QUFDRSxZQUFVLElBQUEsS0FBQSxDQUFPLDBEQUFQLENBQVYsQ0FERjtLQUFBO0FBQUEsSUFFQSxPQUFBLEdBQVUsRUFGVixDQUFBO0FBR0EsSUFBQSxJQUFHLHFCQUFIO0FBQ0UsTUFBQSxPQUFPLENBQUMsUUFBUixHQUFtQixJQUFDLENBQUEsUUFBcEIsQ0FERjtLQUhBO0FBQUEsSUFLQSxJQUFJLENBQUMsU0FBTCxHQUFpQixJQUFDLENBQUEsSUFBSSxDQUFDLElBQU4sQ0FBVyxJQUFDLENBQUEsSUFBWixFQUFrQixPQUFsQixDQUxqQixDQUFBO0FBTUEsSUFBQSxJQUFHLGtCQUFIO2FBQ0UsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFmLEdBQXVCLElBQUMsQ0FBQSxNQUQxQjtLQVBLO0VBQUEsQ0FEUDtDQURFLENBRkosQ0FBQTs7Ozs7QUNDQSxJQUFBLHdGQUFBOztBQUFBLEtBQUEsR0FBUSxPQUFBLENBQVMsa0JBQVQsQ0FBUixDQUFBOztBQUFBLEdBQ0EsR0FBTSxPQUFBLENBQVMsS0FBVCxDQUROLENBQUE7O0FBQUEseUJBR0EsR0FBNEIsU0FBQyxHQUFELEdBQUE7U0FDMUIsR0FBRyxDQUFDLEtBQUosQ0FBVyxHQUFYLENBQWUsQ0FBQSxDQUFBLEVBRFc7QUFBQSxDQUg1QixDQUFBOztBQUFBLHFCQU1BLEdBQXdCLFNBQUMsR0FBRCxHQUFBO1NBQ3RCLEdBQUcsQ0FBQyxLQUFKLENBQVcsR0FBWCxDQUFlLENBQUEsQ0FBQSxFQURPO0FBQUEsQ0FOeEIsQ0FBQTs7QUFBQTtBQWNlLEVBQUEscUJBQUMsSUFBRCxHQUFBO0FBRVgsUUFBQSxLQUFBOztNQUZZLE9BQU87S0FFbkI7QUFBQSxJQUFBLElBQUMsQ0FBQSxLQUFELEdBQVMsRUFBVCxDQUFBO0FBQ0EsSUFBQSxJQUFHLDZCQUFIO0FBQ0UsTUFBQSxJQUFDLENBQUEsSUFBRCxHQUFRLElBQUksQ0FBQyxnQkFBYixDQURGO0tBQUEsTUFBQTtBQUdFLE1BQUEsSUFBRyxpQ0FBSDtBQUNFLFFBQUEsSUFBQyxDQUFBLG9CQUFELEdBQXdCLElBQUksQ0FBQyxvQkFBN0IsQ0FERjtPQUFBLE1BQUE7QUFHRSxRQUFBLElBQUMsQ0FBQSxvQkFBRCxHQUF5Qix5QkFBekIsQ0FIRjtPQUFBO0FBQUEsTUFLQSxLQUFBLEdBQVEsRUFMUixDQUFBO0FBTUEsTUFBQSxJQUFHLGdCQUFIO0FBQ0UsUUFBQSxLQUFLLENBQUMsR0FBTixHQUFZLElBQUksQ0FBQyxHQUFqQixDQUFBO0FBQUEsUUFDQSxLQUFLLENBQUMsUUFBTixHQUFpQixJQUFJLENBQUMsUUFEdEIsQ0FERjtPQUFBLE1BQUE7QUFJRSxRQUFBLEtBQUssQ0FBQyxHQUFOLEdBQWEsY0FBYixDQUFBO0FBQUEsUUFDQSxLQUFLLENBQUMsU0FBTixHQUFtQixXQURuQixDQUpGO09BTkE7QUFhQSxNQUFBLElBQUcsaUJBQUg7QUFDRSxRQUFBLEtBQUssQ0FBQyxJQUFOLEdBQWEsSUFBSSxDQUFDLElBQWxCLENBQUE7QUFBQSxRQUNBLEtBQUssQ0FBQyxJQUFOLEdBQWEsSUFBSSxDQUFDLElBRGxCLENBREY7T0FBQSxNQUFBOztVQUlFLElBQUksQ0FBQyxZQUFjO1NBQW5CO0FBQUEsUUFDQSxLQUFLLENBQUMsU0FBTixHQUNFO0FBQUEsVUFBQSxHQUFBLEVBQUssSUFBSSxDQUFDLFNBQVY7U0FGRixDQUpGO09BYkE7QUFBQSxNQXFCQSxJQUFDLENBQUEsSUFBRCxHQUFZLElBQUEsS0FBSyxDQUFDLE1BQU4sQ0FBYSxLQUFiLENBckJaLENBSEY7S0FEQTtBQUFBLElBNEJBLElBQUMsQ0FBQSxTQUFELEdBQWEsS0E1QmIsQ0FBQTtBQUFBLElBNkJBLElBQUMsQ0FBQSxXQUFELEdBQWUsRUE3QmYsQ0FBQTtBQUFBLElBOEJBLElBQUMsQ0FBQSxxQkFBRCxHQUF5QixFQTlCekIsQ0FBQTtBQUFBLElBK0JBLElBQUMsQ0FBQSxJQUFJLENBQUMsRUFBTixDQUFVLFFBQVYsRUFBbUIsQ0FBQSxTQUFBLEtBQUEsR0FBQTthQUFBLFNBQUEsR0FBQTtlQUNqQixLQUFDLENBQUEsV0FBRCxDQUFBLEVBRGlCO01BQUEsRUFBQTtJQUFBLENBQUEsQ0FBQSxDQUFBLElBQUEsQ0FBbkIsQ0EvQkEsQ0FBQTtBQUFBLElBaUNBLElBQUMsQ0FBQSxJQUFJLENBQUMsRUFBTixDQUFVLFFBQVYsRUFBbUIsQ0FBQSxTQUFBLEtBQUEsR0FBQTthQUFBLFNBQUMsTUFBRCxHQUFBO0FBQ2pCLFlBQUEsSUFBQTtBQUFBLFFBQUEsSUFBRyxNQUFNLENBQUMsWUFBUCxDQUFxQixNQUFBLEtBQVUsT0FBL0IsQ0FBSDtBQUNFLFVBQUEsT0FBTyxDQUFDLEtBQVIsQ0FBYyxNQUFNLENBQUMsUUFBUCxDQUFBLENBQWQsQ0FBQSxDQURGO1NBQUE7QUFBQSxRQUlBLElBQUEsR0FBTyxxQkFBQSxDQUFzQixNQUFNLENBQUMsWUFBUCxDQUFxQixNQUFyQixDQUF0QixDQUpQLENBQUE7QUFLQSxRQUFBLElBQUcseUJBQUg7aUJBQ0UsS0FBQyxDQUFBLEtBQU0sQ0FBQSxJQUFBLENBQUssQ0FBQyxRQUFiLENBQXNCLE1BQXRCLEVBREY7U0FOaUI7TUFBQSxFQUFBO0lBQUEsQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFuQixDQWpDQSxDQUFBO0FBQUEsSUEyQ0EsSUFBQyxDQUFBLEtBQUQsR0FBUyxLQTNDVCxDQUZXO0VBQUEsQ0FBYjs7QUFBQSx3QkFnREEsVUFBQSxHQUFZLFNBQUMsQ0FBRCxHQUFBO0FBQ1YsSUFBQSxJQUFHLElBQUMsQ0FBQSxTQUFKO2FBQ0UsQ0FBQSxDQUFBLEVBREY7S0FBQSxNQUFBO2FBR0UsSUFBQyxDQUFBLHFCQUFxQixDQUFDLElBQXZCLENBQTRCLENBQTVCLEVBSEY7S0FEVTtFQUFBLENBaERaLENBQUE7O0FBQUEsd0JBdURBLFdBQUEsR0FBYSxTQUFBLEdBQUE7QUFDWCxRQUFBLGlCQUFBO0FBQUE7QUFBQSxTQUFBLDJDQUFBO21CQUFBO0FBQ0UsTUFBQSxDQUFBLENBQUEsQ0FBQSxDQURGO0FBQUEsS0FBQTtXQUVBLElBQUMsQ0FBQSxTQUFELEdBQWEsS0FIRjtFQUFBLENBdkRiLENBQUE7O0FBQUEsd0JBa0VBLElBQUEsR0FBTSxTQUFDLElBQUQsRUFBTyxPQUFQLEdBQUE7QUFDSixRQUFBLFNBQUE7O01BRFcsVUFBVTtLQUNyQjs7TUFBQSxPQUFPLENBQUMsT0FBUztLQUFqQjs7TUFDQSxPQUFPLENBQUMsV0FBYTtLQURyQjtBQUVBLElBQUEsSUFBTyxZQUFQO0FBQ0UsWUFBVSxJQUFBLEtBQUEsQ0FBTywwQkFBUCxDQUFWLENBREY7S0FGQTtBQUlBLElBQUEsSUFBRyxJQUFJLENBQUMsT0FBTCxDQUFjLEdBQWQsQ0FBQSxLQUFxQixDQUFBLENBQXhCO0FBQ0UsTUFBQSxJQUFBLElBQVEsSUFBQyxDQUFBLG9CQUFULENBREY7S0FKQTtBQU1BLElBQUEsSUFBTyx3QkFBUDtBQUNFLE1BQUEsU0FBQSxHQUFnQixJQUFBLGFBQUEsQ0FBQSxDQUFoQixDQUFBO0FBQUEsTUFDQSxJQUFDLENBQUEsS0FBTSxDQUFBLElBQUEsQ0FBUCxHQUFlLFNBRGYsQ0FBQTtBQUFBLE1BRUEsSUFBQyxDQUFBLFVBQUQsQ0FBWSxDQUFBLFNBQUEsS0FBQSxHQUFBO2VBQUEsU0FBQSxHQUFBO0FBS1YsY0FBQSxhQUFBO0FBQUEsVUFBQSxhQUFBLEdBQWdCLFNBQUEsR0FBQTtBQUNkLGdCQUFBLGlCQUFBO0FBQUEsWUFBQSxTQUFTLENBQUMsSUFBVixDQUNFO0FBQUEsY0FBQSxRQUFBLEVBQVUsT0FBTyxDQUFDLFFBQWxCO0FBQUEsY0FDQSxJQUFBLEVBQU0sT0FBTyxDQUFDLElBRGQ7QUFBQSxjQUVBLE9BQUEsRUFBUyxLQUFDLENBQUEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUZuQjthQURGLENBQUEsQ0FBQTtBQUFBLFlBSUEsU0FBUyxDQUFDLElBQVYsR0FBaUIsSUFKakIsQ0FBQTtBQUFBLFlBS0EsU0FBUyxDQUFDLFFBQVYsR0FBcUIsSUFBQSxHQUFRLEdBQVIsR0FBYSxLQUFDLENBQUEsSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUw1QyxDQUFBO0FBQUEsWUFNQSxTQUFTLENBQUMsSUFBVixHQUFpQixLQUFDLENBQUEsSUFObEIsQ0FBQTtBQUFBLFlBT0EsU0FBUyxDQUFDLFlBQVYsR0FBeUIsS0FQekIsQ0FBQTtBQUFBLFlBUUEsaUJBQUEsR0FBd0IsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFhLFVBQWIsRUFDcEI7QUFBQSxjQUFBLEVBQUEsRUFBSSxTQUFTLENBQUMsUUFBZDthQURvQixDQUV0QixDQUFDLENBRnFCLENBRWxCLEdBRmtCLEVBRWQsRUFGYyxDQUd0QixDQUFDLEVBSHFCLENBQUEsQ0FJdEIsQ0FBQyxDQUpxQixDQUlsQixNQUprQixFQUlYO0FBQUEsY0FBQyxLQUFBLEVBQVEscUJBQVQ7YUFKVyxDQUt0QixDQUFDLENBTHFCLENBS25CLFNBQVMsQ0FBQyxJQUxTLENBUnhCLENBQUE7bUJBY0EsS0FBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQVcsaUJBQVgsRUFmYztVQUFBLENBQWhCLENBQUE7QUFpQkEsVUFBQSxJQUFHLFNBQVMsQ0FBQyxhQUFiO21CQUNFLGFBQUEsQ0FBQSxFQURGO1dBQUEsTUFBQTttQkFHRSxTQUFTLENBQUMsYUFBVixHQUEwQixjQUg1QjtXQXRCVTtRQUFBLEVBQUE7TUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQVosQ0FGQSxDQURGO0tBTkE7V0FvQ0EsSUFBQyxDQUFBLEtBQU0sQ0FBQSxJQUFBLEVBckNIO0VBQUEsQ0FsRU4sQ0FBQTs7cUJBQUE7O0lBZEYsQ0FBQTs7QUFBQTs2QkE0SEU7O0FBQUEsMEJBQUEsSUFBQSxHQUFNLFNBQUEsR0FBQTtBQUNKLElBQUEsSUFBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQWUsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFhLFVBQWIsRUFDYjtBQUFBLE1BQUEsRUFBQSxFQUFJLElBQUMsQ0FBQSxRQUFMO0FBQUEsTUFDQSxJQUFBLEVBQU8sYUFEUDtLQURhLENBQWYsQ0FBQSxDQUFBO1dBR0EsTUFBQSxDQUFBLElBQVEsQ0FBQSxZQUFZLENBQUMsS0FBTSxDQUFBLElBQUMsQ0FBQSxJQUFELEVBSnZCO0VBQUEsQ0FBTixDQUFBOztBQUFBLDBCQU1BLFFBQUEsR0FBVSxTQUFDLE1BQUQsR0FBQTtBQUNSLFFBQUEsd0JBQUE7QUFBQSxJQUFBLElBQUcsSUFBQyxDQUFBLEtBQUo7QUFDRSxNQUFBLE9BQU8sQ0FBQyxHQUFSLENBQWEsWUFBQSxHQUFZLE1BQU0sQ0FBQyxRQUFQLENBQUEsQ0FBekIsQ0FBQSxDQURGO0tBQUE7QUFBQSxJQUVBLE1BQUEsR0FBUyx5QkFBQSxDQUEwQixNQUFNLENBQUMsWUFBUCxDQUFxQixNQUFyQixDQUExQixDQUZULENBQUE7QUFHQSxJQUFBLElBQUcsTUFBTSxDQUFDLEVBQVAsQ0FBVyxVQUFYLENBQUg7QUFFRSxNQUFBLElBQUcsTUFBQSxLQUFVLElBQUMsQ0FBQSxPQUFkO0FBQUE7T0FBQSxNQUdLLElBQUcsTUFBTSxDQUFDLFlBQVAsQ0FBcUIsTUFBckIsQ0FBQSxLQUFnQyxhQUFuQztlQUVILElBQUMsQ0FBQSxRQUFELENBQVUsTUFBVixFQUFrQixXQUFsQixFQUZHO09BQUEsTUFBQTtBQUlILFFBQUEsV0FBQSxHQUFjLE1BQ1osQ0FBQyxRQURXLENBQ0QsTUFEQyxFQUNNLHFCQUROLENBRVosQ0FBQyxPQUZXLENBQUEsQ0FBZCxDQUFBO2VBR0EsSUFBQyxDQUFBLFVBQUQsQ0FBWSxNQUFaLEVBQW9CLFdBQXBCLEVBUEc7T0FMUDtLQUFBLE1BQUE7QUFlRSxNQUFBLElBQUcsTUFBQSxLQUFVLElBQUMsQ0FBQSxRQUFkO0FBQ0UsZUFBTyxJQUFQLENBREY7T0FBQTtBQUFBLE1BRUEsR0FBQSxHQUFNLE1BQU0sQ0FBQyxRQUFQLENBQWlCLEdBQWpCLEVBQXNCLGlDQUF0QixDQUZOLENBQUE7QUFJQSxNQUFBLElBQUcsV0FBSDtlQUVFLElBQUMsQ0FBQSxjQUFELENBQWdCLE1BQWhCLEVBQXdCLElBQUMsQ0FBQSxtQkFBRCxDQUFxQixHQUFyQixDQUF4QixFQUZGO09BbkJGO0tBSlE7RUFBQSxDQU5WLENBQUE7O0FBQUEsMEJBaUNBLElBQUEsR0FBTSxTQUFDLElBQUQsRUFBTyxJQUFQLEVBQWEsSUFBYixHQUFBO0FBSUosUUFBQSxVQUFBOztNQUppQixPQUFRO0tBSXpCO0FBQUEsSUFBQSxDQUFBLEdBQVEsSUFBQSxHQUFHLENBQUMsT0FBSixDQUFhLFNBQWIsRUFDTjtBQUFBLE1BQUEsRUFBQSxFQUFPLElBQUEsS0FBUyxFQUFaLEdBQW1CLElBQUMsQ0FBQSxJQUFwQixHQUE4QixJQUFDLENBQUEsSUFBRCxHQUFTLEdBQVQsR0FBYyxJQUFoRDtBQUFBLE1BQ0EsSUFBQSxFQUFTLFlBQUgsR0FBYyxJQUFkLEdBQXlCLE1BRC9CO0tBRE0sQ0FBUixDQUFBO0FBQUEsSUFHQSxPQUFBLEdBQVUsSUFBQyxDQUFBLGtCQUFELENBQW9CLENBQXBCLEVBQXVCLElBQXZCLENBSFYsQ0FBQTtBQUlBLElBQUEsSUFBRyxJQUFDLENBQUEsS0FBSjtBQUNFLE1BQUEsT0FBTyxDQUFDLEdBQVIsQ0FBYSxXQUFBLEdBQVcsT0FBTyxDQUFDLElBQVIsQ0FBQSxDQUFjLENBQUMsUUFBZixDQUFBLENBQXhCLENBQUEsQ0FERjtLQUpBO1dBTUEsSUFBQyxDQUFBLElBQUksQ0FBQyxJQUFOLENBQVcsT0FBTyxDQUFDLElBQVIsQ0FBQSxDQUFYLEVBVkk7RUFBQSxDQWpDTixDQUFBOztBQUFBLDBCQTZDQSxTQUFBLEdBQVcsU0FBQyxJQUFELEdBQUE7V0FDVCxJQUFDLENBQUEsSUFBRCxDQUFPLEVBQVAsRUFBVSxJQUFWLEVBQWlCLFdBQWpCLEVBRFM7RUFBQSxDQTdDWCxDQUFBOzt1QkFBQTs7SUE1SEYsQ0FBQTs7QUE2S0EsSUFBRyxzQkFBSDtBQUNFLEVBQUEsTUFBTSxDQUFDLE9BQVAsR0FBaUIsV0FBakIsQ0FERjtDQTdLQTs7QUFnTEEsSUFBRyxnREFBSDtBQUNFLEVBQUEsSUFBTyxzQ0FBUDtBQUNFLFVBQVUsSUFBQSxLQUFBLENBQU8sMEJBQVAsQ0FBVixDQURGO0dBQUEsTUFBQTtBQUdFLElBQUEsQ0FBQyxDQUFDLElBQUYsR0FBUyxXQUFULENBSEY7R0FERjtDQWhMQTs7Ozs7QUNEQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4V0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JsQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1SEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9FQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE9BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9EQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFYQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4YUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3Q0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25DQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2REE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5ZUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0dBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNSQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzWkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeklBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFhBOztBQ0FBOztBQ0FBOzs7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7Ozs7Ozs7QUNqS0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlhNUFAgPSByZXF1aXJlICcuL3kteG1wcCdcblxubmV3IFBvbHltZXIgJ3kteG1wcCcsXG4gIHhtcHA6IG5ldyBYTVBQKCksICMgdGhpcyBpcyBhIHNoYXJlZCBwcm9wZXJ0eSBpbmRlZWQhXG4gIHJlYWR5OiAoKS0+XG4gICAgaWYgbm90IEByb29tP1xuICAgICAgdGhyb3cgbmV3IEVycm9yIFwiWW91IG11c3QgZGVmaW5lIGEgcm9vbSBhdHRyaWJ1dGUgaW4gdGhlIHhtcHAtY29ubmVjdG9yISFcIlxuICAgIG9wdGlvbnMgPSB7fVxuICAgIGlmIEBzeW5jTW9kZT9cbiAgICAgIG9wdGlvbnMuc3luY01vZGUgPSBAc3luY01vZGVcbiAgICB0aGlzLmNvbm5lY3RvciA9IEB4bXBwLmpvaW4oQHJvb20sIG9wdGlvbnMpXG4gICAgaWYgQGRlYnVnP1xuICAgICAgdGhpcy5jb25uZWN0b3IuZGVidWcgPSBAZGVidWdcbiIsIlxuTlhNUFAgPSByZXF1aXJlIFwibm9kZS14bXBwLWNsaWVudFwiXG5sdHggPSByZXF1aXJlIFwibHR4XCJcblxuZXh0cmFjdF9yZXNvdXJjZV9mcm9tX2ppZCA9IChqaWQpLT5cbiAgamlkLnNwbGl0KFwiL1wiKVsxXVxuXG5leHRyYWN0X2JhcmVfZnJvbV9qaWQgPSAoamlkKS0+XG4gIGppZC5zcGxpdChcIi9cIilbMF1cblxuIyBUaGlzIEhhbmRsZXIgaGFuZGxlcyBhIHNldCBvZiBjb25uZWN0aW9uc1xuY2xhc3MgWE1QUEhhbmRsZXJcbiAgI1xuICAjIFNlZSBkb2N1bWVudGF0aW9uIGZvciBwYXJhbWV0ZXJzXG4gICNcbiAgY29uc3RydWN0b3I6IChvcHRzID0ge30pLT5cbiAgICAjIEluaXRpYWxpemUgTlhNUFAuQ2xpZW50XG4gICAgQHJvb21zID0ge31cbiAgICBpZiBvcHRzLm5vZGVfeG1wcF9jbGllbnQ/XG4gICAgICBAeG1wcCA9IG9wdHMubm9kZV94bXBwX2NsaWVudFxuICAgIGVsc2VcbiAgICAgIGlmIG9wdHMuZGVmYXVsdFJvb21Db21wb25lbnQ/XG4gICAgICAgIEBkZWZhdWx0Um9vbUNvbXBvbmVudCA9IG9wdHMuZGVmYXVsdFJvb21Db21wb25lbnRcbiAgICAgIGVsc2VcbiAgICAgICAgQGRlZmF1bHRSb29tQ29tcG9uZW50ID0gXCJAY29uZmVyZW5jZS55YXR0YS5uaW5qYVwiXG5cbiAgICAgIGNyZWRzID0ge31cbiAgICAgIGlmIG9wdHMuamlkP1xuICAgICAgICBjcmVkcy5qaWQgPSBvcHRzLmppZFxuICAgICAgICBjcmVkcy5wYXNzd29yZCA9IG9wdHMucGFzc3dvcmRcbiAgICAgIGVsc2VcbiAgICAgICAgY3JlZHMuamlkID0gJ0B5YXR0YS5uaW5qYSdcbiAgICAgICAgY3JlZHMucHJlZmVycmVkID0gJ0FOT05ZTU9VUydcblxuICAgICAgaWYgb3B0cy5ob3N0P1xuICAgICAgICBjcmVkcy5ob3N0ID0gb3B0cy5ob3N0XG4gICAgICAgIGNyZWRzLnBvcnQgPSBvcHRzLnBvcnRcbiAgICAgIGVsc2VcbiAgICAgICAgb3B0cy53ZWJzb2NrZXQgPz0gJ3dzczp5YXR0YS5uaW5qYTo1MjgxL3htcHAtd2Vic29ja2V0J1xuICAgICAgICBjcmVkcy53ZWJzb2NrZXQgPVxuICAgICAgICAgIHVybDogb3B0cy53ZWJzb2NrZXRcblxuICAgICAgQHhtcHAgPSBuZXcgTlhNUFAuQ2xpZW50IGNyZWRzXG5cbiAgICAjIFdoYXQgaGFwcGVucyB3aGVuIHlvdSBnbyBvbmxpbmVcbiAgICBAaXNfb25saW5lID0gZmFsc2VcbiAgICBAY29ubmVjdGlvbnMgPSB7fVxuICAgIEB3aGVuX29ubGluZV9saXN0ZW5lcnMgPSBbXVxuICAgIEB4bXBwLm9uICdvbmxpbmUnLCA9PlxuICAgICAgQHNldElzT25saW5lKClcbiAgICBAeG1wcC5vbiAnc3RhbnphJywgKHN0YW56YSk9PlxuICAgICAgaWYgc3RhbnphLmdldEF0dHJpYnV0ZSBcInR5cGVcIiBpcyBcImVycm9yXCJcbiAgICAgICAgY29uc29sZS5lcnJvcihzdGFuemEudG9TdHJpbmcoKSlcblxuICAgICAgIyB3aGVuIGEgc3RhbnphIGlzIHJlY2VpdmVkLCBzZW5kIGl0IHRvIHRoZSBjb3JyZXNwb25kaW5nIGNvbm5lY3RvclxuICAgICAgcm9vbSA9IGV4dHJhY3RfYmFyZV9mcm9tX2ppZCBzdGFuemEuZ2V0QXR0cmlidXRlIFwiZnJvbVwiXG4gICAgICBpZiBAcm9vbXNbcm9vbV0/XG4gICAgICAgIEByb29tc1tyb29tXS5vblN0YW56YShzdGFuemEpXG5cblxuICAgIEBkZWJ1ZyA9IGZhbHNlXG5cbiAgIyBFeGVjdXRlIGEgZnVuY3Rpb24gd2hlbiB4bXBwIGlzIG9ubGluZSAoaWYgaXQgaXMgbm90IHlldCBvbmxpbmUsIHdhaXQgdW50aWwgaXQgaXMpXG4gIHdoZW5PbmxpbmU6IChmKS0+XG4gICAgaWYgQGlzX29ubGluZVxuICAgICAgZigpXG4gICAgZWxzZVxuICAgICAgQHdoZW5fb25saW5lX2xpc3RlbmVycy5wdXNoIGZcblxuICAjIEB4bXBwIGlzIG9ubGluZSBmcm9tIG5vdyBvbi4gVGhlcmVmb3JlIHRoaXMgZXhlY3V0ZWQgYWxsIGxpc3RlbmVycyB0aGF0IGRlcGVuZCBvbiB0aGlzIGV2ZW50XG4gIHNldElzT25saW5lOiAoKS0+XG4gICAgZm9yIGYgaW4gQHdoZW5fb25saW5lX2xpc3RlbmVyc1xuICAgICAgZigpXG4gICAgQGlzX29ubGluZSA9IHRydWVcblxuICAjXG4gICMgSm9pbiBhIHNwZWNpZmljIHJvb21cbiAgIyBAcGFyYW1zIGpvaW4ocm9vbSwgc3luY01vZGUpXG4gICMgICByb29tIHtTdHJpbmd9IFRoZSByb29tIG5hbWVcbiAgIyAgIG9wdGlvbnMucm9sZSB7U3RyaW5nfSBcIm1hc3RlclwiIG9yIFwic2xhdmVcIiAoZGVmYXVsdHMgdG8gc2xhdmUpXG4gICMgICBvcHRpb25zLnN5bmNNb2RlIHtTdHJpbmd9IFRoZSBtb2RlIGluIHdoaWNoIHRvIHN5bmMgdG8gdGhlIG90aGVyIGNsaWVudHMgKFwic3luY0FsbFwiIG9yIFwibWFzdGVyLXNsYXZlXCIpXG4gIGpvaW46IChyb29tLCBvcHRpb25zID0ge30pLT5cbiAgICBvcHRpb25zLnJvbGUgPz0gXCJzbGF2ZVwiXG4gICAgb3B0aW9ucy5zeW5jTW9kZSA/PSBcInN5bmNBbGxcIlxuICAgIGlmIG5vdCByb29tP1xuICAgICAgdGhyb3cgbmV3IEVycm9yIFwieW91IG11c3Qgc3BlY2lmeSBhIHJvb20hXCJcbiAgICBpZiByb29tLmluZGV4T2YoXCJAXCIpIGlzIC0xXG4gICAgICByb29tICs9IEBkZWZhdWx0Um9vbUNvbXBvbmVudFxuICAgIGlmIG5vdCBAcm9vbXNbcm9vbV0/XG4gICAgICByb29tX2Nvbm4gPSBuZXcgWE1QUENvbm5lY3RvcigpXG4gICAgICBAcm9vbXNbcm9vbV0gPSByb29tX2Nvbm5cbiAgICAgIEB3aGVuT25saW5lICgpPT5cbiAgICAgICAgIyBsb2dpbiB0byByb29tXG4gICAgICAgICMgV2FudCB0byBiZSBsaWtlIHRoaXM6XG4gICAgICAgICMgPHByZXNlbmNlIGZyb209J2EzM2I5NzU4LTYyZjgtNDJlMS1hODI3LTgzZWYwNGY4ODdjNUB5YXR0YS5uaW5qYS9jNDllYjdmYi0xOTIzLTQyZjItOWNjYS00Yzk3NDc3ZWE3YTgnIHRvPSd0aGluZ0Bjb25mZXJlbmNlLnlhdHRhLm5pbmphL2M0OWViN2ZiLTE5MjMtNDJmMi05Y2NhLTRjOTc0NzdlYTdhOCcgeG1sbnM9J2phYmJlcjpjbGllbnQnPlxuICAgICAgICAjIDx4IHhtbG5zPSdodHRwOi8vamFiYmVyLm9yZy9wcm90b2NvbC9tdWMnLz48L3ByZXNlbmNlPlxuICAgICAgICBvbl9ib3VuZF90b195ID0gKCk9PlxuICAgICAgICAgIHJvb21fY29ubi5pbml0XG4gICAgICAgICAgICBzeW5jTW9kZTogb3B0aW9ucy5zeW5jTW9kZVxuICAgICAgICAgICAgcm9sZTogb3B0aW9ucy5yb2xlXG4gICAgICAgICAgICB1c2VyX2lkOiBAeG1wcC5qaWQucmVzb3VyY2VcbiAgICAgICAgICByb29tX2Nvbm4ucm9vbSA9IHJvb20gIyBzZXQgdGhlIHJvb20gamlkXG4gICAgICAgICAgcm9vbV9jb25uLnJvb21famlkID0gcm9vbSArIFwiL1wiICsgQHhtcHAuamlkLnJlc291cmNlICMgc2V0IHlvdXIgamlkIGluIHRoZSByb29tXG4gICAgICAgICAgcm9vbV9jb25uLnhtcHAgPSBAeG1wcFxuICAgICAgICAgIHJvb21fY29ubi54bXBwX2hhbmRsZXIgPSBAXG4gICAgICAgICAgcm9vbV9zdWJzY3JpcHRpb24gPSBuZXcgbHR4LkVsZW1lbnQgJ3ByZXNlbmNlJyxcbiAgICAgICAgICAgICAgdG86IHJvb21fY29ubi5yb29tX2ppZFxuICAgICAgICAgICAgLmMgJ3gnLCB7fVxuICAgICAgICAgICAgLnVwKClcbiAgICAgICAgICAgIC5jICdyb2xlJywge3htbG5zOiBcImh0dHA6Ly95Lm5pbmphL3JvbGVcIn1cbiAgICAgICAgICAgIC50IHJvb21fY29ubi5yb2xlXG4gICAgICAgICAgQHhtcHAuc2VuZCByb29tX3N1YnNjcmlwdGlvblxuXG4gICAgICAgIGlmIHJvb21fY29ubi5pc19ib3VuZF90b195XG4gICAgICAgICAgb25fYm91bmRfdG9feSgpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICByb29tX2Nvbm4ub25fYm91bmRfdG9feSA9IG9uX2JvdW5kX3RvX3lcblxuICAgIEByb29tc1tyb29tXVxuXG5jbGFzcyBYTVBQQ29ubmVjdG9yXG5cbiAgI1xuICAjIGNsb3NlcyBhIGNvbm5lY3Rpb24gdG8gYSByb29tXG4gICNcbiAgZXhpdDogKCktPlxuICAgIEB4bXBwLnNlbmQgbmV3IGx0eC5FbGVtZW50ICdwcmVzZW5jZScsXG4gICAgICB0bzogQHJvb21famlkXG4gICAgICB0eXBlOiBcInVuYXZhaWxhYmxlXCJcbiAgICBkZWxldGUgQHhtcHBfaGFuZGxlci5yb29tc1tAcm9vbV1cblxuICBvblN0YW56YTogKHN0YW56YSktPlxuICAgIGlmIEBkZWJ1Z1xuICAgICAgY29uc29sZS5sb2cgXCJSRUNFSVZFRDogXCIrc3RhbnphLnRvU3RyaW5nKClcbiAgICBzZW5kZXIgPSBleHRyYWN0X3Jlc291cmNlX2Zyb21famlkIHN0YW56YS5nZXRBdHRyaWJ1dGUgXCJmcm9tXCJcbiAgICBpZiBzdGFuemEuaXMgXCJwcmVzZW5jZVwiXG4gICAgICAjIGEgbmV3IHVzZXIgam9pbmVkIG9yIGxlYXZlZCB0aGUgcm9vbVxuICAgICAgaWYgc2VuZGVyIGlzIEB1c2VyX2lkXG4gICAgICAgICMgdGhpcyBjbGllbnQgcmVjZWl2ZWQgaW5mb3JtYXRpb24gdGhhdCBpdCBzdWNjZXNzZnVsbHkgam9pbmVkIHRoZSByb29tXG4gICAgICAgICMgbm9wXG4gICAgICBlbHNlIGlmIHN0YW56YS5nZXRBdHRyaWJ1dGUoXCJ0eXBlXCIpIGlzIFwidW5hdmFpbGFibGVcIlxuICAgICAgICAjIGEgdXNlciBsZWZ0IHRoZSByb29tXG4gICAgICAgIEB1c2VyTGVmdCBzZW5kZXIsIHNlbmRlcl9yb2xlXG4gICAgICBlbHNlXG4gICAgICAgIHNlbmRlcl9yb2xlID0gc3RhbnphXG4gICAgICAgICAgLmdldENoaWxkKFwicm9sZVwiLFwiaHR0cDovL3kubmluamEvcm9sZVwiKVxuICAgICAgICAgIC5nZXRUZXh0KClcbiAgICAgICAgQHVzZXJKb2luZWQgc2VuZGVyLCBzZW5kZXJfcm9sZVxuICAgIGVsc2VcbiAgICAgICMgaXQgaXMgc29tZSBtZXNzYWdlIHRoYXQgd2FzIHNlbnQgaW50byB0aGUgcm9vbSAoY291bGQgYWxzbyBiZSBhIHByaXZhdGUgY2hhdCBvciB3aGF0ZXZlcilcbiAgICAgIGlmIHNlbmRlciBpcyBAcm9vbV9qaWRcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIHJlcyA9IHN0YW56YS5nZXRDaGlsZCBcInlcIiwgXCJodHRwOi8veS5uaW5qYS9jb25uZWN0b3Itc3RhbnphXCJcbiAgICAgICMgY291bGQgYmUgc29tZSBzaW1wbGUgdGV4dCBtZXNzYWdlIChvciB3aGF0ZXZlcilcbiAgICAgIGlmIHJlcz9cbiAgICAgICAgIyB0aGlzIGlzIGRlZmluaXRlbHkgYSBtZXNzYWdlIGludGVuZGVkIGZvciBZanNcbiAgICAgICAgQHJlY2VpdmVNZXNzYWdlKHNlbmRlciwgQHBhcnNlTWVzc2FnZUZyb21YbWwgcmVzKVxuXG4gIHNlbmQ6ICh1c2VyLCBqc29uLCB0eXBlID0gXCJtZXNzYWdlXCIpLT5cbiAgICAjIGRvIG5vdCBzZW5kIHktb3BlcmF0aW9ucyBpZiBub3Qgc3luY2VkLFxuICAgICMgc2VuZCBzeW5jIG1lc3NhZ2VzIHRob3VnaFxuICAgICNpZiBAaXNfc3luY2VkIG9yIGpzb24uc3luY19zdGVwPyAjIyBvciBAaXNfc3luY2luZ1xuICAgIG0gPSBuZXcgbHR4LkVsZW1lbnQgXCJtZXNzYWdlXCIsXG4gICAgICB0bzogaWYgdXNlciBpcyBcIlwiIHRoZW4gQHJvb20gZWxzZSBAcm9vbSArIFwiL1wiICsgdXNlclxuICAgICAgdHlwZTogaWYgdHlwZT8gdGhlbiB0eXBlIGVsc2UgXCJjaGF0XCJcbiAgICBtZXNzYWdlID0gQGVuY29kZU1lc3NhZ2VUb1htbChtLCBqc29uKVxuICAgIGlmIEBkZWJ1Z1xuICAgICAgY29uc29sZS5sb2cgXCJTRU5ESU5HOiBcIittZXNzYWdlLnJvb3QoKS50b1N0cmluZygpXG4gICAgQHhtcHAuc2VuZCBtZXNzYWdlLnJvb3QoKVxuXG4gIGJyb2FkY2FzdDogKGpzb24pLT5cbiAgICBAc2VuZCBcIlwiLCBqc29uLCBcImdyb3VwY2hhdFwiXG5cblxuaWYgbW9kdWxlLmV4cG9ydHM/XG4gIG1vZHVsZS5leHBvcnRzID0gWE1QUEhhbmRsZXJcblxuaWYgd2luZG93P1xuICBpZiBub3QgWT9cbiAgICB0aHJvdyBuZXcgRXJyb3IgXCJZb3UgbXVzdCBpbXBvcnQgWSBmaXJzdCFcIlxuICBlbHNlXG4gICAgWS5YTVBQID0gWE1QUEhhbmRsZXJcbiIsbnVsbCwiLy8gaHR0cDovL3dpa2kuY29tbW9uanMub3JnL3dpa2kvVW5pdF9UZXN0aW5nLzEuMFxuLy9cbi8vIFRISVMgSVMgTk9UIFRFU1RFRCBOT1IgTElLRUxZIFRPIFdPUksgT1VUU0lERSBWOCFcbi8vXG4vLyBPcmlnaW5hbGx5IGZyb20gbmFyd2hhbC5qcyAoaHR0cDovL25hcndoYWxqcy5vcmcpXG4vLyBDb3B5cmlnaHQgKGMpIDIwMDkgVGhvbWFzIFJvYmluc29uIDwyODBub3J0aC5jb20+XG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuLy8gb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgJ1NvZnR3YXJlJyksIHRvXG4vLyBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZVxuLy8gcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yXG4vLyBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuLy8gZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuLy8gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEICdBUyBJUycsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1Jcbi8vIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuLy8gRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4vLyBBVVRIT1JTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTlxuLy8gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTlxuLy8gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHdoZW4gdXNlZCBpbiBub2RlLCB0aGlzIHdpbGwgYWN0dWFsbHkgbG9hZCB0aGUgdXRpbCBtb2R1bGUgd2UgZGVwZW5kIG9uXG4vLyB2ZXJzdXMgbG9hZGluZyB0aGUgYnVpbHRpbiB1dGlsIG1vZHVsZSBhcyBoYXBwZW5zIG90aGVyd2lzZVxuLy8gdGhpcyBpcyBhIGJ1ZyBpbiBub2RlIG1vZHVsZSBsb2FkaW5nIGFzIGZhciBhcyBJIGFtIGNvbmNlcm5lZFxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsLycpO1xuXG52YXIgcFNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8vIDEuIFRoZSBhc3NlcnQgbW9kdWxlIHByb3ZpZGVzIGZ1bmN0aW9ucyB0aGF0IHRocm93XG4vLyBBc3NlcnRpb25FcnJvcidzIHdoZW4gcGFydGljdWxhciBjb25kaXRpb25zIGFyZSBub3QgbWV0LiBUaGVcbi8vIGFzc2VydCBtb2R1bGUgbXVzdCBjb25mb3JtIHRvIHRoZSBmb2xsb3dpbmcgaW50ZXJmYWNlLlxuXG52YXIgYXNzZXJ0ID0gbW9kdWxlLmV4cG9ydHMgPSBvaztcblxuLy8gMi4gVGhlIEFzc2VydGlvbkVycm9yIGlzIGRlZmluZWQgaW4gYXNzZXJ0LlxuLy8gbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7IG1lc3NhZ2U6IG1lc3NhZ2UsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsOiBhY3R1YWwsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IGV4cGVjdGVkIH0pXG5cbmFzc2VydC5Bc3NlcnRpb25FcnJvciA9IGZ1bmN0aW9uIEFzc2VydGlvbkVycm9yKG9wdGlvbnMpIHtcbiAgdGhpcy5uYW1lID0gJ0Fzc2VydGlvbkVycm9yJztcbiAgdGhpcy5hY3R1YWwgPSBvcHRpb25zLmFjdHVhbDtcbiAgdGhpcy5leHBlY3RlZCA9IG9wdGlvbnMuZXhwZWN0ZWQ7XG4gIHRoaXMub3BlcmF0b3IgPSBvcHRpb25zLm9wZXJhdG9yO1xuICBpZiAob3B0aW9ucy5tZXNzYWdlKSB7XG4gICAgdGhpcy5tZXNzYWdlID0gb3B0aW9ucy5tZXNzYWdlO1xuICAgIHRoaXMuZ2VuZXJhdGVkTWVzc2FnZSA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubWVzc2FnZSA9IGdldE1lc3NhZ2UodGhpcyk7XG4gICAgdGhpcy5nZW5lcmF0ZWRNZXNzYWdlID0gdHJ1ZTtcbiAgfVxuICB2YXIgc3RhY2tTdGFydEZ1bmN0aW9uID0gb3B0aW9ucy5zdGFja1N0YXJ0RnVuY3Rpb24gfHwgZmFpbDtcblxuICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCBzdGFja1N0YXJ0RnVuY3Rpb24pO1xuICB9XG4gIGVsc2Uge1xuICAgIC8vIG5vbiB2OCBicm93c2VycyBzbyB3ZSBjYW4gaGF2ZSBhIHN0YWNrdHJhY2VcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKCk7XG4gICAgaWYgKGVyci5zdGFjaykge1xuICAgICAgdmFyIG91dCA9IGVyci5zdGFjaztcblxuICAgICAgLy8gdHJ5IHRvIHN0cmlwIHVzZWxlc3MgZnJhbWVzXG4gICAgICB2YXIgZm5fbmFtZSA9IHN0YWNrU3RhcnRGdW5jdGlvbi5uYW1lO1xuICAgICAgdmFyIGlkeCA9IG91dC5pbmRleE9mKCdcXG4nICsgZm5fbmFtZSk7XG4gICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgLy8gb25jZSB3ZSBoYXZlIGxvY2F0ZWQgdGhlIGZ1bmN0aW9uIGZyYW1lXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gc3RyaXAgb3V0IGV2ZXJ5dGhpbmcgYmVmb3JlIGl0IChhbmQgaXRzIGxpbmUpXG4gICAgICAgIHZhciBuZXh0X2xpbmUgPSBvdXQuaW5kZXhPZignXFxuJywgaWR4ICsgMSk7XG4gICAgICAgIG91dCA9IG91dC5zdWJzdHJpbmcobmV4dF9saW5lICsgMSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc3RhY2sgPSBvdXQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IgaW5zdGFuY2VvZiBFcnJvclxudXRpbC5pbmhlcml0cyhhc3NlcnQuQXNzZXJ0aW9uRXJyb3IsIEVycm9yKTtcblxuZnVuY3Rpb24gcmVwbGFjZXIoa2V5LCB2YWx1ZSkge1xuICBpZiAodXRpbC5pc1VuZGVmaW5lZCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gJycgKyB2YWx1ZTtcbiAgfVxuICBpZiAodXRpbC5pc051bWJlcih2YWx1ZSkgJiYgKGlzTmFOKHZhbHVlKSB8fCAhaXNGaW5pdGUodmFsdWUpKSkge1xuICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICB9XG4gIGlmICh1dGlsLmlzRnVuY3Rpb24odmFsdWUpIHx8IHV0aWwuaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiB0cnVuY2F0ZShzLCBuKSB7XG4gIGlmICh1dGlsLmlzU3RyaW5nKHMpKSB7XG4gICAgcmV0dXJuIHMubGVuZ3RoIDwgbiA/IHMgOiBzLnNsaWNlKDAsIG4pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldE1lc3NhZ2Uoc2VsZikge1xuICByZXR1cm4gdHJ1bmNhdGUoSlNPTi5zdHJpbmdpZnkoc2VsZi5hY3R1YWwsIHJlcGxhY2VyKSwgMTI4KSArICcgJyArXG4gICAgICAgICBzZWxmLm9wZXJhdG9yICsgJyAnICtcbiAgICAgICAgIHRydW5jYXRlKEpTT04uc3RyaW5naWZ5KHNlbGYuZXhwZWN0ZWQsIHJlcGxhY2VyKSwgMTI4KTtcbn1cblxuLy8gQXQgcHJlc2VudCBvbmx5IHRoZSB0aHJlZSBrZXlzIG1lbnRpb25lZCBhYm92ZSBhcmUgdXNlZCBhbmRcbi8vIHVuZGVyc3Rvb2QgYnkgdGhlIHNwZWMuIEltcGxlbWVudGF0aW9ucyBvciBzdWIgbW9kdWxlcyBjYW4gcGFzc1xuLy8gb3RoZXIga2V5cyB0byB0aGUgQXNzZXJ0aW9uRXJyb3IncyBjb25zdHJ1Y3RvciAtIHRoZXkgd2lsbCBiZVxuLy8gaWdub3JlZC5cblxuLy8gMy4gQWxsIG9mIHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zIG11c3QgdGhyb3cgYW4gQXNzZXJ0aW9uRXJyb3Jcbi8vIHdoZW4gYSBjb3JyZXNwb25kaW5nIGNvbmRpdGlvbiBpcyBub3QgbWV0LCB3aXRoIGEgbWVzc2FnZSB0aGF0XG4vLyBtYXkgYmUgdW5kZWZpbmVkIGlmIG5vdCBwcm92aWRlZC4gIEFsbCBhc3NlcnRpb24gbWV0aG9kcyBwcm92aWRlXG4vLyBib3RoIHRoZSBhY3R1YWwgYW5kIGV4cGVjdGVkIHZhbHVlcyB0byB0aGUgYXNzZXJ0aW9uIGVycm9yIGZvclxuLy8gZGlzcGxheSBwdXJwb3Nlcy5cblxuZnVuY3Rpb24gZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCBvcGVyYXRvciwgc3RhY2tTdGFydEZ1bmN0aW9uKSB7XG4gIHRocm93IG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3Ioe1xuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgYWN0dWFsOiBhY3R1YWwsXG4gICAgZXhwZWN0ZWQ6IGV4cGVjdGVkLFxuICAgIG9wZXJhdG9yOiBvcGVyYXRvcixcbiAgICBzdGFja1N0YXJ0RnVuY3Rpb246IHN0YWNrU3RhcnRGdW5jdGlvblxuICB9KTtcbn1cblxuLy8gRVhURU5TSU9OISBhbGxvd3MgZm9yIHdlbGwgYmVoYXZlZCBlcnJvcnMgZGVmaW5lZCBlbHNld2hlcmUuXG5hc3NlcnQuZmFpbCA9IGZhaWw7XG5cbi8vIDQuIFB1cmUgYXNzZXJ0aW9uIHRlc3RzIHdoZXRoZXIgYSB2YWx1ZSBpcyB0cnV0aHksIGFzIGRldGVybWluZWRcbi8vIGJ5ICEhZ3VhcmQuXG4vLyBhc3NlcnQub2soZ3VhcmQsIG1lc3NhZ2Vfb3B0KTtcbi8vIFRoaXMgc3RhdGVtZW50IGlzIGVxdWl2YWxlbnQgdG8gYXNzZXJ0LmVxdWFsKHRydWUsICEhZ3VhcmQsXG4vLyBtZXNzYWdlX29wdCk7LiBUbyB0ZXN0IHN0cmljdGx5IGZvciB0aGUgdmFsdWUgdHJ1ZSwgdXNlXG4vLyBhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgZ3VhcmQsIG1lc3NhZ2Vfb3B0KTsuXG5cbmZ1bmN0aW9uIG9rKHZhbHVlLCBtZXNzYWdlKSB7XG4gIGlmICghdmFsdWUpIGZhaWwodmFsdWUsIHRydWUsIG1lc3NhZ2UsICc9PScsIGFzc2VydC5vayk7XG59XG5hc3NlcnQub2sgPSBvaztcblxuLy8gNS4gVGhlIGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzaGFsbG93LCBjb2VyY2l2ZSBlcXVhbGl0eSB3aXRoXG4vLyA9PS5cbi8vIGFzc2VydC5lcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5lcXVhbCA9IGZ1bmN0aW9uIGVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCAhPSBleHBlY3RlZCkgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnPT0nLCBhc3NlcnQuZXF1YWwpO1xufTtcblxuLy8gNi4gVGhlIG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHdoZXRoZXIgdHdvIG9iamVjdHMgYXJlIG5vdCBlcXVhbFxuLy8gd2l0aCAhPSBhc3NlcnQubm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90RXF1YWwgPSBmdW5jdGlvbiBub3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICchPScsIGFzc2VydC5ub3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDcuIFRoZSBlcXVpdmFsZW5jZSBhc3NlcnRpb24gdGVzdHMgYSBkZWVwIGVxdWFsaXR5IHJlbGF0aW9uLlxuLy8gYXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5kZWVwRXF1YWwgPSBmdW5jdGlvbiBkZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoIV9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICdkZWVwRXF1YWwnLCBhc3NlcnQuZGVlcEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSB7XG4gIC8vIDcuMS4gQWxsIGlkZW50aWNhbCB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGFzIGRldGVybWluZWQgYnkgPT09LlxuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0J1ZmZlcihhY3R1YWwpICYmIHV0aWwuaXNCdWZmZXIoZXhwZWN0ZWQpKSB7XG4gICAgaWYgKGFjdHVhbC5sZW5ndGggIT0gZXhwZWN0ZWQubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFjdHVhbC5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFjdHVhbFtpXSAhPT0gZXhwZWN0ZWRbaV0pIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcblxuICAvLyA3LjIuIElmIHRoZSBleHBlY3RlZCB2YWx1ZSBpcyBhIERhdGUgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIERhdGUgb2JqZWN0IHRoYXQgcmVmZXJzIHRvIHRoZSBzYW1lIHRpbWUuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0RhdGUoYWN0dWFsKSAmJiB1dGlsLmlzRGF0ZShleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsLmdldFRpbWUoKSA9PT0gZXhwZWN0ZWQuZ2V0VGltZSgpO1xuXG4gIC8vIDcuMyBJZiB0aGUgZXhwZWN0ZWQgdmFsdWUgaXMgYSBSZWdFeHAgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIFJlZ0V4cCBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzb3VyY2UgYW5kXG4gIC8vIHByb3BlcnRpZXMgKGBnbG9iYWxgLCBgbXVsdGlsaW5lYCwgYGxhc3RJbmRleGAsIGBpZ25vcmVDYXNlYCkuXG4gIH0gZWxzZSBpZiAodXRpbC5pc1JlZ0V4cChhY3R1YWwpICYmIHV0aWwuaXNSZWdFeHAoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5zb3VyY2UgPT09IGV4cGVjdGVkLnNvdXJjZSAmJlxuICAgICAgICAgICBhY3R1YWwuZ2xvYmFsID09PSBleHBlY3RlZC5nbG9iYWwgJiZcbiAgICAgICAgICAgYWN0dWFsLm11bHRpbGluZSA9PT0gZXhwZWN0ZWQubXVsdGlsaW5lICYmXG4gICAgICAgICAgIGFjdHVhbC5sYXN0SW5kZXggPT09IGV4cGVjdGVkLmxhc3RJbmRleCAmJlxuICAgICAgICAgICBhY3R1YWwuaWdub3JlQ2FzZSA9PT0gZXhwZWN0ZWQuaWdub3JlQ2FzZTtcblxuICAvLyA3LjQuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIXV0aWwuaXNPYmplY3QoYWN0dWFsKSAmJiAhdXRpbC5pc09iamVjdChleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNSBGb3IgYWxsIG90aGVyIE9iamVjdCBwYWlycywgaW5jbHVkaW5nIEFycmF5IG9iamVjdHMsIGVxdWl2YWxlbmNlIGlzXG4gIC8vIGRldGVybWluZWQgYnkgaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChhcyB2ZXJpZmllZFxuICAvLyB3aXRoIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCksIHRoZSBzYW1lIHNldCBvZiBrZXlzXG4gIC8vIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLCBlcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnlcbiAgLy8gY29ycmVzcG9uZGluZyBrZXksIGFuZCBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuIE5vdGU6IHRoaXNcbiAgLy8gYWNjb3VudHMgZm9yIGJvdGggbmFtZWQgYW5kIGluZGV4ZWQgcHJvcGVydGllcyBvbiBBcnJheXMuXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iakVxdWl2KGFjdHVhbCwgZXhwZWN0ZWQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKG9iamVjdCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iamVjdCkgPT0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG59XG5cbmZ1bmN0aW9uIG9iakVxdWl2KGEsIGIpIHtcbiAgaWYgKHV0aWwuaXNOdWxsT3JVbmRlZmluZWQoYSkgfHwgdXRpbC5pc051bGxPclVuZGVmaW5lZChiKSlcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkgcmV0dXJuIGZhbHNlO1xuICAvL35+fkkndmUgbWFuYWdlZCB0byBicmVhayBPYmplY3Qua2V5cyB0aHJvdWdoIHNjcmV3eSBhcmd1bWVudHMgcGFzc2luZy5cbiAgLy8gICBDb252ZXJ0aW5nIHRvIGFycmF5IHNvbHZlcyB0aGUgcHJvYmxlbS5cbiAgaWYgKGlzQXJndW1lbnRzKGEpKSB7XG4gICAgaWYgKCFpc0FyZ3VtZW50cyhiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBhID0gcFNsaWNlLmNhbGwoYSk7XG4gICAgYiA9IHBTbGljZS5jYWxsKGIpO1xuICAgIHJldHVybiBfZGVlcEVxdWFsKGEsIGIpO1xuICB9XG4gIHRyeSB7XG4gICAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgICAga2IgPSBvYmplY3RLZXlzKGIpLFxuICAgICAgICBrZXksIGk7XG4gIH0gY2F0Y2ggKGUpIHsvL2hhcHBlbnMgd2hlbiBvbmUgaXMgYSBzdHJpbmcgbGl0ZXJhbCBhbmQgdGhlIG90aGVyIGlzbid0XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoa2V5cyBpbmNvcnBvcmF0ZXNcbiAgLy8gaGFzT3duUHJvcGVydHkpXG4gIGlmIChrYS5sZW5ndGggIT0ga2IubGVuZ3RoKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy90aGUgc2FtZSBzZXQgb2Yga2V5cyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSxcbiAga2Euc29ydCgpO1xuICBrYi5zb3J0KCk7XG4gIC8vfn5+Y2hlYXAga2V5IHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoa2FbaV0gIT0ga2JbaV0pXG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy9lcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnkgY29ycmVzcG9uZGluZyBrZXksIGFuZFxuICAvL35+fnBvc3NpYmx5IGV4cGVuc2l2ZSBkZWVwIHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrYVtpXTtcbiAgICBpZiAoIV9kZWVwRXF1YWwoYVtrZXldLCBiW2tleV0pKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIDguIFRoZSBub24tZXF1aXZhbGVuY2UgYXNzZXJ0aW9uIHRlc3RzIGZvciBhbnkgZGVlcCBpbmVxdWFsaXR5LlxuLy8gYXNzZXJ0Lm5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3REZWVwRXF1YWwgPSBmdW5jdGlvbiBub3REZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJ25vdERlZXBFcXVhbCcsIGFzc2VydC5ub3REZWVwRXF1YWwpO1xuICB9XG59O1xuXG4vLyA5LiBUaGUgc3RyaWN0IGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzdHJpY3QgZXF1YWxpdHksIGFzIGRldGVybWluZWQgYnkgPT09LlxuLy8gYXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnN0cmljdEVxdWFsID0gZnVuY3Rpb24gc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJz09PScsIGFzc2VydC5zdHJpY3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDEwLiBUaGUgc3RyaWN0IG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHN0cmljdCBpbmVxdWFsaXR5LCBhc1xuLy8gZGV0ZXJtaW5lZCBieSAhPT0uICBhc3NlcnQubm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90U3RyaWN0RXF1YWwgPSBmdW5jdGlvbiBub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnIT09JywgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkge1xuICBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGV4cGVjdGVkKSA9PSAnW29iamVjdCBSZWdFeHBdJykge1xuICAgIHJldHVybiBleHBlY3RlZC50ZXN0KGFjdHVhbCk7XG4gIH0gZWxzZSBpZiAoYWN0dWFsIGluc3RhbmNlb2YgZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChleHBlY3RlZC5jYWxsKHt9LCBhY3R1YWwpID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIF90aHJvd3Moc2hvdWxkVGhyb3csIGJsb2NrLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICB2YXIgYWN0dWFsO1xuXG4gIGlmICh1dGlsLmlzU3RyaW5nKGV4cGVjdGVkKSkge1xuICAgIG1lc3NhZ2UgPSBleHBlY3RlZDtcbiAgICBleHBlY3RlZCA9IG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIGJsb2NrKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBhY3R1YWwgPSBlO1xuICB9XG5cbiAgbWVzc2FnZSA9IChleHBlY3RlZCAmJiBleHBlY3RlZC5uYW1lID8gJyAoJyArIGV4cGVjdGVkLm5hbWUgKyAnKS4nIDogJy4nKSArXG4gICAgICAgICAgICAobWVzc2FnZSA/ICcgJyArIG1lc3NhZ2UgOiAnLicpO1xuXG4gIGlmIChzaG91bGRUaHJvdyAmJiAhYWN0dWFsKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnTWlzc2luZyBleHBlY3RlZCBleGNlcHRpb24nICsgbWVzc2FnZSk7XG4gIH1cblxuICBpZiAoIXNob3VsZFRocm93ICYmIGV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnR290IHVud2FudGVkIGV4Y2VwdGlvbicgKyBtZXNzYWdlKTtcbiAgfVxuXG4gIGlmICgoc2hvdWxkVGhyb3cgJiYgYWN0dWFsICYmIGV4cGVjdGVkICYmXG4gICAgICAhZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkpIHx8ICghc2hvdWxkVGhyb3cgJiYgYWN0dWFsKSkge1xuICAgIHRocm93IGFjdHVhbDtcbiAgfVxufVxuXG4vLyAxMS4gRXhwZWN0ZWQgdG8gdGhyb3cgYW4gZXJyb3I6XG4vLyBhc3NlcnQudGhyb3dzKGJsb2NrLCBFcnJvcl9vcHQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnRocm93cyA9IGZ1bmN0aW9uKGJsb2NrLCAvKm9wdGlvbmFsKi9lcnJvciwgLypvcHRpb25hbCovbWVzc2FnZSkge1xuICBfdGhyb3dzLmFwcGx5KHRoaXMsIFt0cnVlXS5jb25jYXQocFNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xufTtcblxuLy8gRVhURU5TSU9OISBUaGlzIGlzIGFubm95aW5nIHRvIHdyaXRlIG91dHNpZGUgdGhpcyBtb2R1bGUuXG5hc3NlcnQuZG9lc05vdFRocm93ID0gZnVuY3Rpb24oYmxvY2ssIC8qb3B0aW9uYWwqL21lc3NhZ2UpIHtcbiAgX3Rocm93cy5hcHBseSh0aGlzLCBbZmFsc2VdLmNvbmNhdChwU2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG59O1xuXG5hc3NlcnQuaWZFcnJvciA9IGZ1bmN0aW9uKGVycikgeyBpZiAoZXJyKSB7dGhyb3cgZXJyO319O1xuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChoYXNPd24uY2FsbChvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufTtcbiIsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgQnVmZmVyLl91c2VUeXBlZEFycmF5c2A6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG5CdWZmZXIuX3VzZVR5cGVkQXJyYXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKywgRmlyZWZveCA0KyxcbiAgLy8gQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLiBJZiB0aGUgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGFkZGluZ1xuICAvLyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0XG4gIC8vIGJlY2F1c2Ugd2UgbmVlZCB0byBiZSBhYmxlIHRvIGFkZCBhbGwgdGhlIG5vZGUgQnVmZmVyIEFQSSBtZXRob2RzLiBUaGlzIGlzIGFuIGlzc3VlXG4gIC8vIGluIEZpcmVmb3ggNC0yOS4gTm93IGZpeGVkOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gYXNzdW1lIHRoYXQgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwIHx8ICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0X3N0YXJ0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2krMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiB1dGYxNmxlVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaGkgPSBjID4+IDhcbiAgICBsbyA9IGMgJSAyNTZcbiAgICBieXRlQXJyYXkucHVzaChsbylcbiAgICBieXRlQXJyYXkucHVzaChoaSlcbiAgfVxuXG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCwgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVU19VUkxfU0FGRSA9ICctJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSF9VUkxfU0FGRSA9ICdfJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMgfHxcblx0XHQgICAgY29kZSA9PT0gUExVU19VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0ggfHxcblx0XHQgICAgY29kZSA9PT0gU0xBU0hfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwidmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcbnZhciBpbnRTaXplID0gNDtcbnZhciB6ZXJvQnVmZmVyID0gbmV3IEJ1ZmZlcihpbnRTaXplKTsgemVyb0J1ZmZlci5maWxsKDApO1xudmFyIGNocnN6ID0gODtcblxuZnVuY3Rpb24gdG9BcnJheShidWYsIGJpZ0VuZGlhbikge1xuICBpZiAoKGJ1Zi5sZW5ndGggJSBpbnRTaXplKSAhPT0gMCkge1xuICAgIHZhciBsZW4gPSBidWYubGVuZ3RoICsgKGludFNpemUgLSAoYnVmLmxlbmd0aCAlIGludFNpemUpKTtcbiAgICBidWYgPSBCdWZmZXIuY29uY2F0KFtidWYsIHplcm9CdWZmZXJdLCBsZW4pO1xuICB9XG5cbiAgdmFyIGFyciA9IFtdO1xuICB2YXIgZm4gPSBiaWdFbmRpYW4gPyBidWYucmVhZEludDMyQkUgOiBidWYucmVhZEludDMyTEU7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnVmLmxlbmd0aDsgaSArPSBpbnRTaXplKSB7XG4gICAgYXJyLnB1c2goZm4uY2FsbChidWYsIGkpKTtcbiAgfVxuICByZXR1cm4gYXJyO1xufVxuXG5mdW5jdGlvbiB0b0J1ZmZlcihhcnIsIHNpemUsIGJpZ0VuZGlhbikge1xuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcihzaXplKTtcbiAgdmFyIGZuID0gYmlnRW5kaWFuID8gYnVmLndyaXRlSW50MzJCRSA6IGJ1Zi53cml0ZUludDMyTEU7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgZm4uY2FsbChidWYsIGFycltpXSwgaSAqIDQsIHRydWUpO1xuICB9XG4gIHJldHVybiBidWY7XG59XG5cbmZ1bmN0aW9uIGhhc2goYnVmLCBmbiwgaGFzaFNpemUsIGJpZ0VuZGlhbikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihidWYpKSBidWYgPSBuZXcgQnVmZmVyKGJ1Zik7XG4gIHZhciBhcnIgPSBmbih0b0FycmF5KGJ1ZiwgYmlnRW5kaWFuKSwgYnVmLmxlbmd0aCAqIGNocnN6KTtcbiAgcmV0dXJuIHRvQnVmZmVyKGFyciwgaGFzaFNpemUsIGJpZ0VuZGlhbik7XG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBoYXNoOiBoYXNoIH07XG4iLCJ2YXIgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyXG52YXIgc2hhID0gcmVxdWlyZSgnLi9zaGEnKVxudmFyIHNoYTI1NiA9IHJlcXVpcmUoJy4vc2hhMjU2JylcbnZhciBybmcgPSByZXF1aXJlKCcuL3JuZycpXG52YXIgbWQ1ID0gcmVxdWlyZSgnLi9tZDUnKVxuXG52YXIgYWxnb3JpdGhtcyA9IHtcbiAgc2hhMTogc2hhLFxuICBzaGEyNTY6IHNoYTI1NixcbiAgbWQ1OiBtZDVcbn1cblxudmFyIGJsb2Nrc2l6ZSA9IDY0XG52YXIgemVyb0J1ZmZlciA9IG5ldyBCdWZmZXIoYmxvY2tzaXplKTsgemVyb0J1ZmZlci5maWxsKDApXG5mdW5jdGlvbiBobWFjKGZuLCBrZXksIGRhdGEpIHtcbiAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihrZXkpKSBrZXkgPSBuZXcgQnVmZmVyKGtleSlcbiAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkgZGF0YSA9IG5ldyBCdWZmZXIoZGF0YSlcblxuICBpZihrZXkubGVuZ3RoID4gYmxvY2tzaXplKSB7XG4gICAga2V5ID0gZm4oa2V5KVxuICB9IGVsc2UgaWYoa2V5Lmxlbmd0aCA8IGJsb2Nrc2l6ZSkge1xuICAgIGtleSA9IEJ1ZmZlci5jb25jYXQoW2tleSwgemVyb0J1ZmZlcl0sIGJsb2Nrc2l6ZSlcbiAgfVxuXG4gIHZhciBpcGFkID0gbmV3IEJ1ZmZlcihibG9ja3NpemUpLCBvcGFkID0gbmV3IEJ1ZmZlcihibG9ja3NpemUpXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBibG9ja3NpemU7IGkrKykge1xuICAgIGlwYWRbaV0gPSBrZXlbaV0gXiAweDM2XG4gICAgb3BhZFtpXSA9IGtleVtpXSBeIDB4NUNcbiAgfVxuXG4gIHZhciBoYXNoID0gZm4oQnVmZmVyLmNvbmNhdChbaXBhZCwgZGF0YV0pKVxuICByZXR1cm4gZm4oQnVmZmVyLmNvbmNhdChbb3BhZCwgaGFzaF0pKVxufVxuXG5mdW5jdGlvbiBoYXNoKGFsZywga2V5KSB7XG4gIGFsZyA9IGFsZyB8fCAnc2hhMSdcbiAgdmFyIGZuID0gYWxnb3JpdGhtc1thbGddXG4gIHZhciBidWZzID0gW11cbiAgdmFyIGxlbmd0aCA9IDBcbiAgaWYoIWZuKSBlcnJvcignYWxnb3JpdGhtOicsIGFsZywgJ2lzIG5vdCB5ZXQgc3VwcG9ydGVkJylcbiAgcmV0dXJuIHtcbiAgICB1cGRhdGU6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZighQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSBkYXRhID0gbmV3IEJ1ZmZlcihkYXRhKVxuICAgICAgICBcbiAgICAgIGJ1ZnMucHVzaChkYXRhKVxuICAgICAgbGVuZ3RoICs9IGRhdGEubGVuZ3RoXG4gICAgICByZXR1cm4gdGhpc1xuICAgIH0sXG4gICAgZGlnZXN0OiBmdW5jdGlvbiAoZW5jKSB7XG4gICAgICB2YXIgYnVmID0gQnVmZmVyLmNvbmNhdChidWZzKVxuICAgICAgdmFyIHIgPSBrZXkgPyBobWFjKGZuLCBrZXksIGJ1ZikgOiBmbihidWYpXG4gICAgICBidWZzID0gbnVsbFxuICAgICAgcmV0dXJuIGVuYyA/IHIudG9TdHJpbmcoZW5jKSA6IHJcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZXJyb3IgKCkge1xuICB2YXIgbSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKS5qb2luKCcgJylcbiAgdGhyb3cgbmV3IEVycm9yKFtcbiAgICBtLFxuICAgICd3ZSBhY2NlcHQgcHVsbCByZXF1ZXN0cycsXG4gICAgJ2h0dHA6Ly9naXRodWIuY29tL2RvbWluaWN0YXJyL2NyeXB0by1icm93c2VyaWZ5J1xuICAgIF0uam9pbignXFxuJykpXG59XG5cbmV4cG9ydHMuY3JlYXRlSGFzaCA9IGZ1bmN0aW9uIChhbGcpIHsgcmV0dXJuIGhhc2goYWxnKSB9XG5leHBvcnRzLmNyZWF0ZUhtYWMgPSBmdW5jdGlvbiAoYWxnLCBrZXkpIHsgcmV0dXJuIGhhc2goYWxnLCBrZXkpIH1cbmV4cG9ydHMucmFuZG9tQnl0ZXMgPSBmdW5jdGlvbihzaXplLCBjYWxsYmFjaykge1xuICBpZiAoY2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbCkge1xuICAgIHRyeSB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIHVuZGVmaW5lZCwgbmV3IEJ1ZmZlcihybmcoc2l6ZSkpKVxuICAgIH0gY2F0Y2ggKGVycikgeyBjYWxsYmFjayhlcnIpIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihybmcoc2l6ZSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gZWFjaChhLCBmKSB7XG4gIGZvcih2YXIgaSBpbiBhKVxuICAgIGYoYVtpXSwgaSlcbn1cblxuLy8gdGhlIGxlYXN0IEkgY2FuIGRvIGlzIG1ha2UgZXJyb3IgbWVzc2FnZXMgZm9yIHRoZSByZXN0IG9mIHRoZSBub2RlLmpzL2NyeXB0byBhcGkuXG5lYWNoKFsnY3JlYXRlQ3JlZGVudGlhbHMnXG4sICdjcmVhdGVDaXBoZXInXG4sICdjcmVhdGVDaXBoZXJpdidcbiwgJ2NyZWF0ZURlY2lwaGVyJ1xuLCAnY3JlYXRlRGVjaXBoZXJpdidcbiwgJ2NyZWF0ZVNpZ24nXG4sICdjcmVhdGVWZXJpZnknXG4sICdjcmVhdGVEaWZmaWVIZWxsbWFuJ1xuLCAncGJrZGYyJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gIGV4cG9ydHNbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgZXJyb3IoJ3NvcnJ5LCcsIG5hbWUsICdpcyBub3QgaW1wbGVtZW50ZWQgeWV0JylcbiAgfVxufSlcbiIsIi8qXHJcbiAqIEEgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUlNBIERhdGEgU2VjdXJpdHksIEluYy4gTUQ1IE1lc3NhZ2VcclxuICogRGlnZXN0IEFsZ29yaXRobSwgYXMgZGVmaW5lZCBpbiBSRkMgMTMyMS5cclxuICogVmVyc2lvbiAyLjEgQ29weXJpZ2h0IChDKSBQYXVsIEpvaG5zdG9uIDE5OTkgLSAyMDAyLlxyXG4gKiBPdGhlciBjb250cmlidXRvcnM6IEdyZWcgSG9sdCwgQW5kcmV3IEtlcGVydCwgWWRuYXIsIExvc3RpbmV0XHJcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgTGljZW5zZVxyXG4gKiBTZWUgaHR0cDovL3BhamhvbWUub3JnLnVrL2NyeXB0L21kNSBmb3IgbW9yZSBpbmZvLlxyXG4gKi9cclxuXHJcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XHJcblxyXG4vKlxyXG4gKiBQZXJmb3JtIGEgc2ltcGxlIHNlbGYtdGVzdCB0byBzZWUgaWYgdGhlIFZNIGlzIHdvcmtpbmdcclxuICovXHJcbmZ1bmN0aW9uIG1kNV92bV90ZXN0KClcclxue1xyXG4gIHJldHVybiBoZXhfbWQ1KFwiYWJjXCIpID09IFwiOTAwMTUwOTgzY2QyNGZiMGQ2OTYzZjdkMjhlMTdmNzJcIjtcclxufVxyXG5cclxuLypcclxuICogQ2FsY3VsYXRlIHRoZSBNRDUgb2YgYW4gYXJyYXkgb2YgbGl0dGxlLWVuZGlhbiB3b3JkcywgYW5kIGEgYml0IGxlbmd0aFxyXG4gKi9cclxuZnVuY3Rpb24gY29yZV9tZDUoeCwgbGVuKVxyXG57XHJcbiAgLyogYXBwZW5kIHBhZGRpbmcgKi9cclxuICB4W2xlbiA+PiA1XSB8PSAweDgwIDw8ICgobGVuKSAlIDMyKTtcclxuICB4WygoKGxlbiArIDY0KSA+Pj4gOSkgPDwgNCkgKyAxNF0gPSBsZW47XHJcblxyXG4gIHZhciBhID0gIDE3MzI1ODQxOTM7XHJcbiAgdmFyIGIgPSAtMjcxNzMzODc5O1xyXG4gIHZhciBjID0gLTE3MzI1ODQxOTQ7XHJcbiAgdmFyIGQgPSAgMjcxNzMzODc4O1xyXG5cclxuICBmb3IodmFyIGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkgKz0gMTYpXHJcbiAge1xyXG4gICAgdmFyIG9sZGEgPSBhO1xyXG4gICAgdmFyIG9sZGIgPSBiO1xyXG4gICAgdmFyIG9sZGMgPSBjO1xyXG4gICAgdmFyIG9sZGQgPSBkO1xyXG5cclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyAwXSwgNyAsIC02ODA4NzY5MzYpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krIDFdLCAxMiwgLTM4OTU2NDU4Nik7XHJcbiAgICBjID0gbWQ1X2ZmKGMsIGQsIGEsIGIsIHhbaSsgMl0sIDE3LCAgNjA2MTA1ODE5KTtcclxuICAgIGIgPSBtZDVfZmYoYiwgYywgZCwgYSwgeFtpKyAzXSwgMjIsIC0xMDQ0NTI1MzMwKTtcclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyA0XSwgNyAsIC0xNzY0MTg4OTcpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krIDVdLCAxMiwgIDEyMDAwODA0MjYpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krIDZdLCAxNywgLTE0NzMyMzEzNDEpO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krIDddLCAyMiwgLTQ1NzA1OTgzKTtcclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyA4XSwgNyAsICAxNzcwMDM1NDE2KTtcclxuICAgIGQgPSBtZDVfZmYoZCwgYSwgYiwgYywgeFtpKyA5XSwgMTIsIC0xOTU4NDE0NDE3KTtcclxuICAgIGMgPSBtZDVfZmYoYywgZCwgYSwgYiwgeFtpKzEwXSwgMTcsIC00MjA2Myk7XHJcbiAgICBiID0gbWQ1X2ZmKGIsIGMsIGQsIGEsIHhbaSsxMV0sIDIyLCAtMTk5MDQwNDE2Mik7XHJcbiAgICBhID0gbWQ1X2ZmKGEsIGIsIGMsIGQsIHhbaSsxMl0sIDcgLCAgMTgwNDYwMzY4Mik7XHJcbiAgICBkID0gbWQ1X2ZmKGQsIGEsIGIsIGMsIHhbaSsxM10sIDEyLCAtNDAzNDExMDEpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krMTRdLCAxNywgLTE1MDIwMDIyOTApO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krMTVdLCAyMiwgIDEyMzY1MzUzMjkpO1xyXG5cclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKyAxXSwgNSAsIC0xNjU3OTY1MTApO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krIDZdLCA5ICwgLTEwNjk1MDE2MzIpO1xyXG4gICAgYyA9IG1kNV9nZyhjLCBkLCBhLCBiLCB4W2krMTFdLCAxNCwgIDY0MzcxNzcxMyk7XHJcbiAgICBiID0gbWQ1X2dnKGIsIGMsIGQsIGEsIHhbaSsgMF0sIDIwLCAtMzczODk3MzAyKTtcclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKyA1XSwgNSAsIC03MDE1NTg2OTEpO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krMTBdLCA5ICwgIDM4MDE2MDgzKTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKzE1XSwgMTQsIC02NjA0NzgzMzUpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krIDRdLCAyMCwgLTQwNTUzNzg0OCk7XHJcbiAgICBhID0gbWQ1X2dnKGEsIGIsIGMsIGQsIHhbaSsgOV0sIDUgLCAgNTY4NDQ2NDM4KTtcclxuICAgIGQgPSBtZDVfZ2coZCwgYSwgYiwgYywgeFtpKzE0XSwgOSAsIC0xMDE5ODAzNjkwKTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKyAzXSwgMTQsIC0xODczNjM5NjEpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krIDhdLCAyMCwgIDExNjM1MzE1MDEpO1xyXG4gICAgYSA9IG1kNV9nZyhhLCBiLCBjLCBkLCB4W2krMTNdLCA1ICwgLTE0NDQ2ODE0NjcpO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krIDJdLCA5ICwgLTUxNDAzNzg0KTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKyA3XSwgMTQsICAxNzM1MzI4NDczKTtcclxuICAgIGIgPSBtZDVfZ2coYiwgYywgZCwgYSwgeFtpKzEyXSwgMjAsIC0xOTI2NjA3NzM0KTtcclxuXHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgNV0sIDQgLCAtMzc4NTU4KTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKyA4XSwgMTEsIC0yMDIyNTc0NDYzKTtcclxuICAgIGMgPSBtZDVfaGgoYywgZCwgYSwgYiwgeFtpKzExXSwgMTYsICAxODM5MDMwNTYyKTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKzE0XSwgMjMsIC0zNTMwOTU1Nik7XHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgMV0sIDQgLCAtMTUzMDk5MjA2MCk7XHJcbiAgICBkID0gbWQ1X2hoKGQsIGEsIGIsIGMsIHhbaSsgNF0sIDExLCAgMTI3Mjg5MzM1Myk7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsgN10sIDE2LCAtMTU1NDk3NjMyKTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKzEwXSwgMjMsIC0xMDk0NzMwNjQwKTtcclxuICAgIGEgPSBtZDVfaGgoYSwgYiwgYywgZCwgeFtpKzEzXSwgNCAsICA2ODEyNzkxNzQpO1xyXG4gICAgZCA9IG1kNV9oaChkLCBhLCBiLCBjLCB4W2krIDBdLCAxMSwgLTM1ODUzNzIyMik7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsgM10sIDE2LCAtNzIyNTIxOTc5KTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKyA2XSwgMjMsICA3NjAyOTE4OSk7XHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgOV0sIDQgLCAtNjQwMzY0NDg3KTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKzEyXSwgMTEsIC00MjE4MTU4MzUpO1xyXG4gICAgYyA9IG1kNV9oaChjLCBkLCBhLCBiLCB4W2krMTVdLCAxNiwgIDUzMDc0MjUyMCk7XHJcbiAgICBiID0gbWQ1X2hoKGIsIGMsIGQsIGEsIHhbaSsgMl0sIDIzLCAtOTk1MzM4NjUxKTtcclxuXHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsgMF0sIDYgLCAtMTk4NjMwODQ0KTtcclxuICAgIGQgPSBtZDVfaWkoZCwgYSwgYiwgYywgeFtpKyA3XSwgMTAsICAxMTI2ODkxNDE1KTtcclxuICAgIGMgPSBtZDVfaWkoYywgZCwgYSwgYiwgeFtpKzE0XSwgMTUsIC0xNDE2MzU0OTA1KTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKyA1XSwgMjEsIC01NzQzNDA1NSk7XHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsxMl0sIDYgLCAgMTcwMDQ4NTU3MSk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsgM10sIDEwLCAtMTg5NDk4NjYwNik7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsxMF0sIDE1LCAtMTA1MTUyMyk7XHJcbiAgICBiID0gbWQ1X2lpKGIsIGMsIGQsIGEsIHhbaSsgMV0sIDIxLCAtMjA1NDkyMjc5OSk7XHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsgOF0sIDYgLCAgMTg3MzMxMzM1OSk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsxNV0sIDEwLCAtMzA2MTE3NDQpO1xyXG4gICAgYyA9IG1kNV9paShjLCBkLCBhLCBiLCB4W2krIDZdLCAxNSwgLTE1NjAxOTgzODApO1xyXG4gICAgYiA9IG1kNV9paShiLCBjLCBkLCBhLCB4W2krMTNdLCAyMSwgIDEzMDkxNTE2NDkpO1xyXG4gICAgYSA9IG1kNV9paShhLCBiLCBjLCBkLCB4W2krIDRdLCA2ICwgLTE0NTUyMzA3MCk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsxMV0sIDEwLCAtMTEyMDIxMDM3OSk7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsgMl0sIDE1LCAgNzE4Nzg3MjU5KTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKyA5XSwgMjEsIC0zNDM0ODU1NTEpO1xyXG5cclxuICAgIGEgPSBzYWZlX2FkZChhLCBvbGRhKTtcclxuICAgIGIgPSBzYWZlX2FkZChiLCBvbGRiKTtcclxuICAgIGMgPSBzYWZlX2FkZChjLCBvbGRjKTtcclxuICAgIGQgPSBzYWZlX2FkZChkLCBvbGRkKTtcclxuICB9XHJcbiAgcmV0dXJuIEFycmF5KGEsIGIsIGMsIGQpO1xyXG5cclxufVxyXG5cclxuLypcclxuICogVGhlc2UgZnVuY3Rpb25zIGltcGxlbWVudCB0aGUgZm91ciBiYXNpYyBvcGVyYXRpb25zIHRoZSBhbGdvcml0aG0gdXNlcy5cclxuICovXHJcbmZ1bmN0aW9uIG1kNV9jbW4ocSwgYSwgYiwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBzYWZlX2FkZChiaXRfcm9sKHNhZmVfYWRkKHNhZmVfYWRkKGEsIHEpLCBzYWZlX2FkZCh4LCB0KSksIHMpLGIpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9mZihhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oKGIgJiBjKSB8ICgofmIpICYgZCksIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9nZyhhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oKGIgJiBkKSB8IChjICYgKH5kKSksIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9oaChhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oYiBeIGMgXiBkLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5mdW5jdGlvbiBtZDVfaWkoYSwgYiwgYywgZCwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBtZDVfY21uKGMgXiAoYiB8ICh+ZCkpLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5cclxuLypcclxuICogQWRkIGludGVnZXJzLCB3cmFwcGluZyBhdCAyXjMyLiBUaGlzIHVzZXMgMTYtYml0IG9wZXJhdGlvbnMgaW50ZXJuYWxseVxyXG4gKiB0byB3b3JrIGFyb3VuZCBidWdzIGluIHNvbWUgSlMgaW50ZXJwcmV0ZXJzLlxyXG4gKi9cclxuZnVuY3Rpb24gc2FmZV9hZGQoeCwgeSlcclxue1xyXG4gIHZhciBsc3cgPSAoeCAmIDB4RkZGRikgKyAoeSAmIDB4RkZGRik7XHJcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xyXG4gIHJldHVybiAobXN3IDw8IDE2KSB8IChsc3cgJiAweEZGRkYpO1xyXG59XHJcblxyXG4vKlxyXG4gKiBCaXR3aXNlIHJvdGF0ZSBhIDMyLWJpdCBudW1iZXIgdG8gdGhlIGxlZnQuXHJcbiAqL1xyXG5mdW5jdGlvbiBiaXRfcm9sKG51bSwgY250KVxyXG57XHJcbiAgcmV0dXJuIChudW0gPDwgY250KSB8IChudW0gPj4+ICgzMiAtIGNudCkpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG1kNShidWYpIHtcclxuICByZXR1cm4gaGVscGVycy5oYXNoKGJ1ZiwgY29yZV9tZDUsIDE2KTtcclxufTtcclxuIiwiLy8gT3JpZ2luYWwgY29kZSBhZGFwdGVkIGZyb20gUm9iZXJ0IEtpZWZmZXIuXG4vLyBkZXRhaWxzIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS11dWlkXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBfZ2xvYmFsID0gdGhpcztcblxuICB2YXIgbWF0aFJORywgd2hhdHdnUk5HO1xuXG4gIC8vIE5PVEU6IE1hdGgucmFuZG9tKCkgZG9lcyBub3QgZ3VhcmFudGVlIFwiY3J5cHRvZ3JhcGhpYyBxdWFsaXR5XCJcbiAgbWF0aFJORyA9IGZ1bmN0aW9uKHNpemUpIHtcbiAgICB2YXIgYnl0ZXMgPSBuZXcgQXJyYXkoc2l6ZSk7XG4gICAgdmFyIHI7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgcjsgaSA8IHNpemU7IGkrKykge1xuICAgICAgaWYgKChpICYgMHgwMykgPT0gMCkgciA9IE1hdGgucmFuZG9tKCkgKiAweDEwMDAwMDAwMDtcbiAgICAgIGJ5dGVzW2ldID0gciA+Pj4gKChpICYgMHgwMykgPDwgMykgJiAweGZmO1xuICAgIH1cblxuICAgIHJldHVybiBieXRlcztcbiAgfVxuXG4gIGlmIChfZ2xvYmFsLmNyeXB0byAmJiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gICAgd2hhdHdnUk5HID0gZnVuY3Rpb24oc2l6ZSkge1xuICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSk7XG4gICAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKGJ5dGVzKTtcbiAgICAgIHJldHVybiBieXRlcztcbiAgICB9XG4gIH1cblxuICBtb2R1bGUuZXhwb3J0cyA9IHdoYXR3Z1JORyB8fCBtYXRoUk5HO1xuXG59KCkpXG4iLCIvKlxuICogQSBKYXZhU2NyaXB0IGltcGxlbWVudGF0aW9uIG9mIHRoZSBTZWN1cmUgSGFzaCBBbGdvcml0aG0sIFNIQS0xLCBhcyBkZWZpbmVkXG4gKiBpbiBGSVBTIFBVQiAxODAtMVxuICogVmVyc2lvbiAyLjFhIENvcHlyaWdodCBQYXVsIEpvaG5zdG9uIDIwMDAgLSAyMDAyLlxuICogT3RoZXIgY29udHJpYnV0b3JzOiBHcmVnIEhvbHQsIEFuZHJldyBLZXBlcnQsIFlkbmFyLCBMb3N0aW5ldFxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBMaWNlbnNlXG4gKiBTZWUgaHR0cDovL3BhamhvbWUub3JnLnVrL2NyeXB0L21kNSBmb3IgZGV0YWlscy5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG4vKlxuICogQ2FsY3VsYXRlIHRoZSBTSEEtMSBvZiBhbiBhcnJheSBvZiBiaWctZW5kaWFuIHdvcmRzLCBhbmQgYSBiaXQgbGVuZ3RoXG4gKi9cbmZ1bmN0aW9uIGNvcmVfc2hhMSh4LCBsZW4pXG57XG4gIC8qIGFwcGVuZCBwYWRkaW5nICovXG4gIHhbbGVuID4+IDVdIHw9IDB4ODAgPDwgKDI0IC0gbGVuICUgMzIpO1xuICB4WygobGVuICsgNjQgPj4gOSkgPDwgNCkgKyAxNV0gPSBsZW47XG5cbiAgdmFyIHcgPSBBcnJheSg4MCk7XG4gIHZhciBhID0gIDE3MzI1ODQxOTM7XG4gIHZhciBiID0gLTI3MTczMzg3OTtcbiAgdmFyIGMgPSAtMTczMjU4NDE5NDtcbiAgdmFyIGQgPSAgMjcxNzMzODc4O1xuICB2YXIgZSA9IC0xMDA5NTg5Nzc2O1xuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCB4Lmxlbmd0aDsgaSArPSAxNilcbiAge1xuICAgIHZhciBvbGRhID0gYTtcbiAgICB2YXIgb2xkYiA9IGI7XG4gICAgdmFyIG9sZGMgPSBjO1xuICAgIHZhciBvbGRkID0gZDtcbiAgICB2YXIgb2xkZSA9IGU7XG5cbiAgICBmb3IodmFyIGogPSAwOyBqIDwgODA7IGorKylcbiAgICB7XG4gICAgICBpZihqIDwgMTYpIHdbal0gPSB4W2kgKyBqXTtcbiAgICAgIGVsc2Ugd1tqXSA9IHJvbCh3W2otM10gXiB3W2otOF0gXiB3W2otMTRdIF4gd1tqLTE2XSwgMSk7XG4gICAgICB2YXIgdCA9IHNhZmVfYWRkKHNhZmVfYWRkKHJvbChhLCA1KSwgc2hhMV9mdChqLCBiLCBjLCBkKSksXG4gICAgICAgICAgICAgICAgICAgICAgIHNhZmVfYWRkKHNhZmVfYWRkKGUsIHdbal0pLCBzaGExX2t0KGopKSk7XG4gICAgICBlID0gZDtcbiAgICAgIGQgPSBjO1xuICAgICAgYyA9IHJvbChiLCAzMCk7XG4gICAgICBiID0gYTtcbiAgICAgIGEgPSB0O1xuICAgIH1cblxuICAgIGEgPSBzYWZlX2FkZChhLCBvbGRhKTtcbiAgICBiID0gc2FmZV9hZGQoYiwgb2xkYik7XG4gICAgYyA9IHNhZmVfYWRkKGMsIG9sZGMpO1xuICAgIGQgPSBzYWZlX2FkZChkLCBvbGRkKTtcbiAgICBlID0gc2FmZV9hZGQoZSwgb2xkZSk7XG4gIH1cbiAgcmV0dXJuIEFycmF5KGEsIGIsIGMsIGQsIGUpO1xuXG59XG5cbi8qXG4gKiBQZXJmb3JtIHRoZSBhcHByb3ByaWF0ZSB0cmlwbGV0IGNvbWJpbmF0aW9uIGZ1bmN0aW9uIGZvciB0aGUgY3VycmVudFxuICogaXRlcmF0aW9uXG4gKi9cbmZ1bmN0aW9uIHNoYTFfZnQodCwgYiwgYywgZClcbntcbiAgaWYodCA8IDIwKSByZXR1cm4gKGIgJiBjKSB8ICgofmIpICYgZCk7XG4gIGlmKHQgPCA0MCkgcmV0dXJuIGIgXiBjIF4gZDtcbiAgaWYodCA8IDYwKSByZXR1cm4gKGIgJiBjKSB8IChiICYgZCkgfCAoYyAmIGQpO1xuICByZXR1cm4gYiBeIGMgXiBkO1xufVxuXG4vKlxuICogRGV0ZXJtaW5lIHRoZSBhcHByb3ByaWF0ZSBhZGRpdGl2ZSBjb25zdGFudCBmb3IgdGhlIGN1cnJlbnQgaXRlcmF0aW9uXG4gKi9cbmZ1bmN0aW9uIHNoYTFfa3QodClcbntcbiAgcmV0dXJuICh0IDwgMjApID8gIDE1MTg1MDAyNDkgOiAodCA8IDQwKSA/ICAxODU5Nzc1MzkzIDpcbiAgICAgICAgICh0IDwgNjApID8gLTE4OTQwMDc1ODggOiAtODk5NDk3NTE0O1xufVxuXG4vKlxuICogQWRkIGludGVnZXJzLCB3cmFwcGluZyBhdCAyXjMyLiBUaGlzIHVzZXMgMTYtYml0IG9wZXJhdGlvbnMgaW50ZXJuYWxseVxuICogdG8gd29yayBhcm91bmQgYnVncyBpbiBzb21lIEpTIGludGVycHJldGVycy5cbiAqL1xuZnVuY3Rpb24gc2FmZV9hZGQoeCwgeSlcbntcbiAgdmFyIGxzdyA9ICh4ICYgMHhGRkZGKSArICh5ICYgMHhGRkZGKTtcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcbn1cblxuLypcbiAqIEJpdHdpc2Ugcm90YXRlIGEgMzItYml0IG51bWJlciB0byB0aGUgbGVmdC5cbiAqL1xuZnVuY3Rpb24gcm9sKG51bSwgY250KVxue1xuICByZXR1cm4gKG51bSA8PCBjbnQpIHwgKG51bSA+Pj4gKDMyIC0gY250KSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2hhMShidWYpIHtcbiAgcmV0dXJuIGhlbHBlcnMuaGFzaChidWYsIGNvcmVfc2hhMSwgMjAsIHRydWUpO1xufTtcbiIsIlxuLyoqXG4gKiBBIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgdGhlIFNlY3VyZSBIYXNoIEFsZ29yaXRobSwgU0hBLTI1NiwgYXMgZGVmaW5lZFxuICogaW4gRklQUyAxODAtMlxuICogVmVyc2lvbiAyLjItYmV0YSBDb3B5cmlnaHQgQW5nZWwgTWFyaW4sIFBhdWwgSm9obnN0b24gMjAwMCAtIDIwMDkuXG4gKiBPdGhlciBjb250cmlidXRvcnM6IEdyZWcgSG9sdCwgQW5kcmV3IEtlcGVydCwgWWRuYXIsIExvc3RpbmV0XG4gKlxuICovXG5cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbnZhciBzYWZlX2FkZCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIGxzdyA9ICh4ICYgMHhGRkZGKSArICh5ICYgMHhGRkZGKTtcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcbn07XG5cbnZhciBTID0gZnVuY3Rpb24oWCwgbikge1xuICByZXR1cm4gKFggPj4+IG4pIHwgKFggPDwgKDMyIC0gbikpO1xufTtcblxudmFyIFIgPSBmdW5jdGlvbihYLCBuKSB7XG4gIHJldHVybiAoWCA+Pj4gbik7XG59O1xuXG52YXIgQ2ggPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHJldHVybiAoKHggJiB5KSBeICgofngpICYgeikpO1xufTtcblxudmFyIE1haiA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgcmV0dXJuICgoeCAmIHkpIF4gKHggJiB6KSBeICh5ICYgeikpO1xufTtcblxudmFyIFNpZ21hMDI1NiA9IGZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIChTKHgsIDIpIF4gUyh4LCAxMykgXiBTKHgsIDIyKSk7XG59O1xuXG52YXIgU2lnbWExMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgNikgXiBTKHgsIDExKSBeIFMoeCwgMjUpKTtcbn07XG5cbnZhciBHYW1tYTAyNTYgPSBmdW5jdGlvbih4KSB7XG4gIHJldHVybiAoUyh4LCA3KSBeIFMoeCwgMTgpIF4gUih4LCAzKSk7XG59O1xuXG52YXIgR2FtbWExMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgMTcpIF4gUyh4LCAxOSkgXiBSKHgsIDEwKSk7XG59O1xuXG52YXIgY29yZV9zaGEyNTYgPSBmdW5jdGlvbihtLCBsKSB7XG4gIHZhciBLID0gbmV3IEFycmF5KDB4NDI4QTJGOTgsMHg3MTM3NDQ5MSwweEI1QzBGQkNGLDB4RTlCNURCQTUsMHgzOTU2QzI1QiwweDU5RjExMUYxLDB4OTIzRjgyQTQsMHhBQjFDNUVENSwweEQ4MDdBQTk4LDB4MTI4MzVCMDEsMHgyNDMxODVCRSwweDU1MEM3REMzLDB4NzJCRTVENzQsMHg4MERFQjFGRSwweDlCREMwNkE3LDB4QzE5QkYxNzQsMHhFNDlCNjlDMSwweEVGQkU0Nzg2LDB4RkMxOURDNiwweDI0MENBMUNDLDB4MkRFOTJDNkYsMHg0QTc0ODRBQSwweDVDQjBBOURDLDB4NzZGOTg4REEsMHg5ODNFNTE1MiwweEE4MzFDNjZELDB4QjAwMzI3QzgsMHhCRjU5N0ZDNywweEM2RTAwQkYzLDB4RDVBNzkxNDcsMHg2Q0E2MzUxLDB4MTQyOTI5NjcsMHgyN0I3MEE4NSwweDJFMUIyMTM4LDB4NEQyQzZERkMsMHg1MzM4MEQxMywweDY1MEE3MzU0LDB4NzY2QTBBQkIsMHg4MUMyQzkyRSwweDkyNzIyQzg1LDB4QTJCRkU4QTEsMHhBODFBNjY0QiwweEMyNEI4QjcwLDB4Qzc2QzUxQTMsMHhEMTkyRTgxOSwweEQ2OTkwNjI0LDB4RjQwRTM1ODUsMHgxMDZBQTA3MCwweDE5QTRDMTE2LDB4MUUzNzZDMDgsMHgyNzQ4Nzc0QywweDM0QjBCQ0I1LDB4MzkxQzBDQjMsMHg0RUQ4QUE0QSwweDVCOUNDQTRGLDB4NjgyRTZGRjMsMHg3NDhGODJFRSwweDc4QTU2MzZGLDB4ODRDODc4MTQsMHg4Q0M3MDIwOCwweDkwQkVGRkZBLDB4QTQ1MDZDRUIsMHhCRUY5QTNGNywweEM2NzE3OEYyKTtcbiAgdmFyIEhBU0ggPSBuZXcgQXJyYXkoMHg2QTA5RTY2NywgMHhCQjY3QUU4NSwgMHgzQzZFRjM3MiwgMHhBNTRGRjUzQSwgMHg1MTBFNTI3RiwgMHg5QjA1Njg4QywgMHgxRjgzRDlBQiwgMHg1QkUwQ0QxOSk7XG4gICAgdmFyIFcgPSBuZXcgQXJyYXkoNjQpO1xuICAgIHZhciBhLCBiLCBjLCBkLCBlLCBmLCBnLCBoLCBpLCBqO1xuICAgIHZhciBUMSwgVDI7XG4gIC8qIGFwcGVuZCBwYWRkaW5nICovXG4gIG1bbCA+PiA1XSB8PSAweDgwIDw8ICgyNCAtIGwgJSAzMik7XG4gIG1bKChsICsgNjQgPj4gOSkgPDwgNCkgKyAxNV0gPSBsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG0ubGVuZ3RoOyBpICs9IDE2KSB7XG4gICAgYSA9IEhBU0hbMF07IGIgPSBIQVNIWzFdOyBjID0gSEFTSFsyXTsgZCA9IEhBU0hbM107IGUgPSBIQVNIWzRdOyBmID0gSEFTSFs1XTsgZyA9IEhBU0hbNl07IGggPSBIQVNIWzddO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgNjQ7IGorKykge1xuICAgICAgaWYgKGogPCAxNikge1xuICAgICAgICBXW2pdID0gbVtqICsgaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBXW2pdID0gc2FmZV9hZGQoc2FmZV9hZGQoc2FmZV9hZGQoR2FtbWExMjU2KFdbaiAtIDJdKSwgV1tqIC0gN10pLCBHYW1tYTAyNTYoV1tqIC0gMTVdKSksIFdbaiAtIDE2XSk7XG4gICAgICB9XG4gICAgICBUMSA9IHNhZmVfYWRkKHNhZmVfYWRkKHNhZmVfYWRkKHNhZmVfYWRkKGgsIFNpZ21hMTI1NihlKSksIENoKGUsIGYsIGcpKSwgS1tqXSksIFdbal0pO1xuICAgICAgVDIgPSBzYWZlX2FkZChTaWdtYTAyNTYoYSksIE1haihhLCBiLCBjKSk7XG4gICAgICBoID0gZzsgZyA9IGY7IGYgPSBlOyBlID0gc2FmZV9hZGQoZCwgVDEpOyBkID0gYzsgYyA9IGI7IGIgPSBhOyBhID0gc2FmZV9hZGQoVDEsIFQyKTtcbiAgICB9XG4gICAgSEFTSFswXSA9IHNhZmVfYWRkKGEsIEhBU0hbMF0pOyBIQVNIWzFdID0gc2FmZV9hZGQoYiwgSEFTSFsxXSk7IEhBU0hbMl0gPSBzYWZlX2FkZChjLCBIQVNIWzJdKTsgSEFTSFszXSA9IHNhZmVfYWRkKGQsIEhBU0hbM10pO1xuICAgIEhBU0hbNF0gPSBzYWZlX2FkZChlLCBIQVNIWzRdKTsgSEFTSFs1XSA9IHNhZmVfYWRkKGYsIEhBU0hbNV0pOyBIQVNIWzZdID0gc2FmZV9hZGQoZywgSEFTSFs2XSk7IEhBU0hbN10gPSBzYWZlX2FkZChoLCBIQVNIWzddKTtcbiAgfVxuICByZXR1cm4gSEFTSDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2hhMjU2KGJ1Zikge1xuICByZXR1cm4gaGVscGVycy5oYXNoKGJ1ZiwgY29yZV9zaGEyNTYsIDMyLCB0cnVlKTtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIikpIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0J1xuICAgICYmIHR5cGVvZiBhcmcuY29weSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcuZmlsbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcucmVhZFVJbnQ4ID09PSAnZnVuY3Rpb24nO1xufSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwpe1xuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEVsZW1lbnQgPSByZXF1aXJlKCcuL2VsZW1lbnQnKS5FbGVtZW50XG5cbmZ1bmN0aW9uIERPTUVsZW1lbnQobmFtZSwgYXR0cnMpIHtcbiAgICBFbGVtZW50LmNhbGwodGhpcywgbmFtZSwgYXR0cnMpXG5cbiAgICB0aGlzLm5vZGVUeXBlID0gMVxuICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmxvY2FsTmFtZVxufVxuXG51dGlsLmluaGVyaXRzKERPTUVsZW1lbnQsIEVsZW1lbnQpXG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLl9nZXRFbGVtZW50ID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICB2YXIgZWxlbWVudCA9IG5ldyBET01FbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgIHJldHVybiBlbGVtZW50XG59XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ2xvY2FsTmFtZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0TmFtZSgpXG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAnbmFtZXNwYWNlVVJJJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXROUygpXG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAncGFyZW50Tm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50XG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAnY2hpbGROb2RlcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hpbGRyZW5cbiAgICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICd0ZXh0Q29udGVudCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VGV4dCgpXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuLnB1c2godmFsdWUpXG4gICAgfVxufSlcblxuRE9NRWxlbWVudC5wcm90b3R5cGUuZ2V0RWxlbWVudHNCeVRhZ05hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuKG5hbWUpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmdldEF0dHJpYnV0ZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QXR0cihuYW1lKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRyaWJ1dGUgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgICB0aGlzLmF0dHIobmFtZSwgdmFsdWUpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmdldEF0dHJpYnV0ZU5TID0gZnVuY3Rpb24gKG5zLCBuYW1lKSB7XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRBdHRyKFsneG1sJywgbmFtZV0uam9pbignOicpKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXRBdHRyKG5hbWUsIG5zKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRyaWJ1dGVOUyA9IGZ1bmN0aW9uIChucywgbmFtZSwgdmFsdWUpIHtcbiAgICB2YXIgcHJlZml4XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICBwcmVmaXggPSAneG1sJ1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBuc3MgPSB0aGlzLmdldFhtbG5zKClcbiAgICAgICAgcHJlZml4ID0gbnNzW25zXSB8fCAnJ1xuICAgIH1cbiAgICBpZiAocHJlZml4KSB7XG4gICAgICAgIHRoaXMuYXR0cihbcHJlZml4LCBuYW1lXS5qb2luKCc6JyksIHZhbHVlKVxuICAgIH1cbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlQXR0cmlidXRlID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aGlzLmF0dHIobmFtZSwgbnVsbClcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlQXR0cmlidXRlTlMgPSBmdW5jdGlvbiAobnMsIG5hbWUpIHtcbiAgICB2YXIgcHJlZml4XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICBwcmVmaXggPSAneG1sJ1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBuc3MgPSB0aGlzLmdldFhtbG5zKClcbiAgICAgICAgcHJlZml4ID0gbnNzW25zXSB8fCAnJ1xuICAgIH1cbiAgICBpZiAocHJlZml4KSB7XG4gICAgICAgIHRoaXMuYXR0cihbcHJlZml4LCBuYW1lXS5qb2luKCc6JyksIG51bGwpXG4gICAgfVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5hcHBlbmRDaGlsZCA9IGZ1bmN0aW9uIChlbCkge1xuICAgIHRoaXMuY25vZGUoZWwpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnJlbW92ZUNoaWxkID0gZnVuY3Rpb24gKGVsKSB7XG4gICAgdGhpcy5yZW1vdmUoZWwpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NRWxlbWVudFxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFRoaXMgY2hlYXAgcmVwbGljYSBvZiBET00vQnVpbGRlciBwdXRzIG1lIHRvIHNoYW1lIDotKVxuICpcbiAqIEF0dHJpYnV0ZXMgYXJlIGluIHRoZSBlbGVtZW50LmF0dHJzIG9iamVjdC4gQ2hpbGRyZW4gaXMgYSBsaXN0IG9mXG4gKiBlaXRoZXIgb3RoZXIgRWxlbWVudHMgb3IgU3RyaW5ncyBmb3IgdGV4dCBjb250ZW50LlxuICoqL1xuZnVuY3Rpb24gRWxlbWVudChuYW1lLCBhdHRycykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnBhcmVudCA9IG51bGxcbiAgICB0aGlzLmNoaWxkcmVuID0gW11cbiAgICB0aGlzLnNldEF0dHJzKGF0dHJzKVxufVxuXG4vKioqIEFjY2Vzc29ycyAqKiovXG5cbi8qKlxuICogaWYgKGVsZW1lbnQuaXMoJ21lc3NhZ2UnLCAnamFiYmVyOmNsaWVudCcpKSAuLi5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmlzID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gKHRoaXMuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAoIXhtbG5zIHx8ICh0aGlzLmdldE5TKCkgPT09IHhtbG5zKSlcbn1cblxuLyogd2l0aG91dCBwcmVmaXggKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldE5hbWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKVxuICAgICAgICByZXR1cm4gdGhpcy5uYW1lLnN1YnN0cih0aGlzLm5hbWUuaW5kZXhPZignOicpICsgMSlcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzLm5hbWVcbn1cblxuLyoqXG4gKiByZXRyaWV2ZXMgdGhlIG5hbWVzcGFjZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LCB1cHdhcmRzIHJlY3Vyc2l2ZWx5XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROUyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApIHtcbiAgICAgICAgdmFyIHByZWZpeCA9IHRoaXMubmFtZS5zdWJzdHIoMCwgdGhpcy5uYW1lLmluZGV4T2YoJzonKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKHByZWZpeClcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5maW5kTlMoKVxuICAgIH1cbn1cblxuLyoqXG4gKiBmaW5kIHRoZSBuYW1lc3BhY2UgdG8gdGhlIGdpdmVuIHByZWZpeCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZmluZE5TID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgLyogZGVmYXVsdCBuYW1lc3BhY2UgKi9cbiAgICAgICAgaWYgKHRoaXMuYXR0cnMueG1sbnMpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRycy54bWxuc1xuICAgICAgICBlbHNlIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIHByZWZpeGVkIG5hbWVzcGFjZSAqL1xuICAgICAgICB2YXIgYXR0ciA9ICd4bWxuczonICsgcHJlZml4XG4gICAgICAgIGlmICh0aGlzLmF0dHJzW2F0dHJdKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKHByZWZpeClcbiAgICB9XG59XG5cbi8qKlxuICogUmVjdXJzaXZlcmx5IGdldHMgYWxsIHhtbG5zIGRlZmluZWQsIGluIHRoZSBmb3JtIG9mIHt1cmw6cHJlZml4fVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0WG1sbnMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbmFtZXNwYWNlcyA9IHt9XG5cbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIG5hbWVzcGFjZXMgPSB0aGlzLnBhcmVudC5nZXRYbWxucygpXG5cbiAgICBmb3IgKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIG0gPSBhdHRyLm1hdGNoKCd4bWxuczo/KC4qKScpXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpICYmIG0pIHtcbiAgICAgICAgICAgIG5hbWVzcGFjZXNbdGhpcy5hdHRyc1thdHRyXV0gPSBtWzFdXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzcGFjZXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuc2V0QXR0cnMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIHRoaXMuYXR0cnMgPSB7fVxuICAgIE9iamVjdC5rZXlzKGF0dHJzIHx8IHt9KS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB0aGlzLmF0dHJzW2tleV0gPSBhdHRyc1trZXldXG4gICAgfSwgdGhpcylcbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbCwgcmV0dXJucyB0aGUgbWF0Y2hpbmcgYXR0cmlidXRlLlxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0QXR0ciA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgaWYgKCF4bWxucylcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbbmFtZV1cblxuICAgIHZhciBuYW1lc3BhY2VzID0gdGhpcy5nZXRYbWxucygpXG5cbiAgICBpZiAoIW5hbWVzcGFjZXNbeG1sbnNdKVxuICAgICAgICByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbW25hbWVzcGFjZXNbeG1sbnNdLCBuYW1lXS5qb2luKCc6JyldXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbihuYW1lLCB4bWxucylbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW4gPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5nZXROYW1lICYmXG4gICAgICAgICAgICAoY2hpbGQuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRCeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpWzBdXG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoY2hpbGQuYXR0cnMgJiZcbiAgICAgICAgICAgIChjaGlsZC5hdHRyc1thdHRyXSA9PT0gdmFsKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgICAgICBpZiAocmVjdXJzaXZlICYmIGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuQnlGaWx0ZXIgPSBmdW5jdGlvbihmaWx0ZXIsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChmaWx0ZXIoY2hpbGQpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUZpbHRlcil7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZpbHRlciwgdHJ1ZSkpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSkge1xuICAgICAgICByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRUZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRleHQgPSAnJ1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmICgodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBjaGlsZCA9PT0gJ251bWJlcicpKSB7XG4gICAgICAgICAgICB0ZXh0ICs9IGNoaWxkXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRleHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRUZXh0ID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICB2YXIgY2hpbGQgPSB0aGlzLmdldENoaWxkKG5hbWUsIHhtbG5zKVxuICAgIHJldHVybiBjaGlsZCA/IGNoaWxkLmdldFRleHQoKSA6IG51bGxcbn1cblxuLyoqXG4gKiBSZXR1cm4gYWxsIGRpcmVjdCBkZXNjZW5kZW50cyB0aGF0IGFyZSBFbGVtZW50cy5cbiAqIFRoaXMgZGlmZmVycyBmcm9tIGBnZXRDaGlsZHJlbmAgaW4gdGhhdCBpdCB3aWxsIGV4Y2x1ZGUgdGV4dCBub2RlcyxcbiAqIHByb2Nlc3NpbmcgaW5zdHJ1Y3Rpb25zLCBldGMuXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkRWxlbWVudHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIEVsZW1lbnRcbiAgICB9KVxufVxuXG4vKioqIEJ1aWxkZXIgKioqL1xuXG4vKiogcmV0dXJucyB1cHBlcm1vc3QgcGFyZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS5yb290ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQucm9vdCgpXG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpc1xufVxuRWxlbWVudC5wcm90b3R5cGUudHJlZSA9IEVsZW1lbnQucHJvdG90eXBlLnJvb3RcblxuLyoqIGp1c3QgcGFyZW50IG9yIGl0c2VsZiAqL1xuRWxlbWVudC5wcm90b3R5cGUudXAgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHRoaXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2dldEVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHZhciBlbGVtZW50ID0gbmV3IEVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgcmV0dXJuIGVsZW1lbnRcbn1cblxuLyoqIGNyZWF0ZSBjaGlsZCBub2RlIGFuZCByZXR1cm4gaXQgKi9cbkVsZW1lbnQucHJvdG90eXBlLmMgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHJldHVybiB0aGlzLmNub2RlKHRoaXMuX2dldEVsZW1lbnQobmFtZSwgYXR0cnMpKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5jbm9kZSA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKVxuICAgIGNoaWxkLnBhcmVudCA9IHRoaXNcbiAgICByZXR1cm4gY2hpbGRcbn1cblxuLyoqIGFkZCB0ZXh0IG5vZGUgYW5kIHJldHVybiBlbGVtZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS50ID0gZnVuY3Rpb24odGV4dCkge1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaCh0ZXh0KVxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKiogTWFuaXB1bGF0aW9uICoqKi9cblxuLyoqXG4gKiBFaXRoZXI6XG4gKiAgIGVsLnJlbW92ZShjaGlsZEVsKVxuICogICBlbC5yZW1vdmUoJ2F1dGhvcicsICd1cm46Li4uJylcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oZWwsIHhtbG5zKSB7XG4gICAgdmFyIGZpbHRlclxuICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgdGFnIG5hbWUgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiAhKGNoaWxkLmlzICYmXG4gICAgICAgICAgICAgICAgIGNoaWxkLmlzKGVsLCB4bWxucykpXG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvKiAxc3QgcGFyYW1ldGVyIGlzIGVsZW1lbnQgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZCAhPT0gZWxcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLmZpbHRlcihmaWx0ZXIpXG5cbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFRvIHVzZSBpbiBjYXNlIHlvdSB3YW50IHRoZSBzYW1lIFhNTCBkYXRhIGZvciBzZXBhcmF0ZSB1c2VzLlxuICogUGxlYXNlIHJlZnJhaW4gZnJvbSB0aGlzIHByYWN0aXNlIHVubGVzcyB5b3Uga25vdyB3aGF0IHlvdSBhcmVcbiAqIGRvaW5nLiBCdWlsZGluZyBYTUwgd2l0aCBsdHggaXMgZWFzeSFcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2xvbmUgPSB0aGlzLl9nZXRFbGVtZW50KHRoaXMubmFtZSwgdGhpcy5hdHRycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBjbG9uZS5jbm9kZShjaGlsZC5jbG9uZSA/IGNoaWxkLmNsb25lKCkgOiBjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIGNsb25lXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnRleHQgPSBmdW5jdGlvbih2YWwpIHtcbiAgICBpZiAodmFsICYmIHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHRoaXMuY2hpbGRyZW5bMF0gPSB2YWxcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZ2V0VGV4dCgpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwpIHtcbiAgICBpZiAoKCh0eXBlb2YgdmFsICE9PSAndW5kZWZpbmVkJykgfHwgKHZhbCA9PT0gbnVsbCkpKSB7XG4gICAgICAgIGlmICghdGhpcy5hdHRycykge1xuICAgICAgICAgICAgdGhpcy5hdHRycyA9IHt9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hdHRyc1thdHRyXSA9IHZhbFxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hdHRyc1thdHRyXVxufVxuXG4vKioqIFNlcmlhbGl6YXRpb24gKioqL1xuXG5FbGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzID0gJydcbiAgICB0aGlzLndyaXRlKGZ1bmN0aW9uKGMpIHtcbiAgICAgICAgcyArPSBjXG4gICAgfSlcbiAgICByZXR1cm4gc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiB0aGlzLm5hbWUsXG4gICAgICAgIGF0dHJzOiB0aGlzLmF0dHJzLFxuICAgICAgICBjaGlsZHJlbjogdGhpcy5jaGlsZHJlbi5tYXAoZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZCAmJiBjaGlsZC50b0pTT04gPyBjaGlsZC50b0pTT04oKSA6IGNoaWxkXG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5fYWRkQ2hpbGRyZW4gPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJz4nKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIC8qIFNraXAgbnVsbC91bmRlZmluZWQgKi9cbiAgICAgICAgaWYgKGNoaWxkIHx8IChjaGlsZCA9PT0gMCkpIHtcbiAgICAgICAgICAgIGlmIChjaGlsZC53cml0ZSkge1xuICAgICAgICAgICAgICAgIGNoaWxkLndyaXRlKHdyaXRlcilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkKSlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hpbGQudG9TdHJpbmcpIHtcbiAgICAgICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sVGV4dChjaGlsZC50b1N0cmluZygxMCkpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHdyaXRlcignPC8nKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgd3JpdGVyKCc+Jylcbn1cblxuRWxlbWVudC5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJzwnKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciB2ID0gdGhpcy5hdHRyc1trXVxuICAgICAgICBpZiAodiB8fCAodiA9PT0gJycpIHx8ICh2ID09PSAwKSkge1xuICAgICAgICAgICAgd3JpdGVyKCcgJylcbiAgICAgICAgICAgIHdyaXRlcihrKVxuICAgICAgICAgICAgd3JpdGVyKCc9XCInKVxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHYgPSB2LnRvU3RyaW5nKDEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbCh2KSlcbiAgICAgICAgICAgIHdyaXRlcignXCInKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB3cml0ZXIoJy8+JylcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9hZGRDaGlsZHJlbih3cml0ZXIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWwocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpLlxuICAgICAgICByZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmYXBvczsnKVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWxUZXh0KHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmL2csICcmYW1wOycpLlxuICAgICAgICByZXBsYWNlKC88L2csICcmbHQ7JykuXG4gICAgICAgIHJlcGxhY2UoLz4vZywgJyZndDsnKVxufVxuXG5leHBvcnRzLkVsZW1lbnQgPSBFbGVtZW50XG5leHBvcnRzLmVzY2FwZVhtbCA9IGVzY2FwZVhtbFxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKiBDYXVzZSBicm93c2VyaWZ5IHRvIGJ1bmRsZSBTQVggcGFyc2VyczogKi9cbnZhciBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UnKVxuXG5wYXJzZS5hdmFpbGFibGVTYXhQYXJzZXJzLnB1c2gocGFyc2UuYmVzdFNheFBhcnNlciA9IHJlcXVpcmUoJy4vc2F4L3NheF9sdHgnKSlcblxuLyogU0hJTSAqL1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2luZGV4JykiLCIndXNlIHN0cmljdCc7XG5cbnZhciBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UnKVxuXG4vKipcbiAqIFRoZSBvbmx5IChyZWxldmFudCkgZGF0YSBzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0cy5FbGVtZW50ID0gcmVxdWlyZSgnLi9kb20tZWxlbWVudCcpXG5cbi8qKlxuICogSGVscGVyXG4gKi9cbmV4cG9ydHMuZXNjYXBlWG1sID0gcmVxdWlyZSgnLi9lbGVtZW50JykuZXNjYXBlWG1sXG5cbi8qKlxuICogRE9NIHBhcnNlciBpbnRlcmZhY2VcbiAqL1xuZXhwb3J0cy5wYXJzZSA9IHBhcnNlLnBhcnNlXG5leHBvcnRzLlBhcnNlciA9IHBhcnNlLlBhcnNlclxuXG4vKipcbiAqIFNBWCBwYXJzZXIgaW50ZXJmYWNlXG4gKi9cbmV4cG9ydHMuYXZhaWxhYmxlU2F4UGFyc2VycyA9IHBhcnNlLmF2YWlsYWJsZVNheFBhcnNlcnNcbmV4cG9ydHMuYmVzdFNheFBhcnNlciA9IHBhcnNlLmJlc3RTYXhQYXJzZXJcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIERPTUVsZW1lbnQgPSByZXF1aXJlKCcuL2RvbS1lbGVtZW50JylcblxuXG5leHBvcnRzLmF2YWlsYWJsZVNheFBhcnNlcnMgPSBbXVxuZXhwb3J0cy5iZXN0U2F4UGFyc2VyID0gbnVsbFxuXG52YXIgc2F4UGFyc2VycyA9IFtcbiAgICAnLi9zYXgvc2F4X2V4cGF0LmpzJyxcbiAgICAnLi9zYXgvc2F4X2x0eC5qcycsXG4gICAgLyonLi9zYXhfZWFzeXNheC5qcycsICcuL3NheF9ub2RlLXhtbC5qcycsKi9cbiAgICAnLi9zYXgvc2F4X3NheGpzLmpzJ1xuXVxuXG5zYXhQYXJzZXJzLmZvckVhY2goZnVuY3Rpb24obW9kTmFtZSkge1xuICAgIHZhciBtb2RcbiAgICB0cnkge1xuICAgICAgICBtb2QgPSByZXF1aXJlKG1vZE5hbWUpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiBTaWxlbnRseSBtaXNzaW5nIGxpYnJhcmllcyBkcm9wIGZvciBkZWJ1ZzpcbiAgICAgICAgY29uc29sZS5lcnJvcihlLnN0YWNrIHx8IGUpXG4gICAgICAgICAqL1xuICAgIH1cbiAgICBpZiAobW9kKSB7XG4gICAgICAgIGV4cG9ydHMuYXZhaWxhYmxlU2F4UGFyc2Vycy5wdXNoKG1vZClcbiAgICAgICAgaWYgKCFleHBvcnRzLmJlc3RTYXhQYXJzZXIpIHtcbiAgICAgICAgICAgIGV4cG9ydHMuYmVzdFNheFBhcnNlciA9IG1vZFxuICAgICAgICB9XG4gICAgfVxufSlcblxuZXhwb3J0cy5QYXJzZXIgPSBmdW5jdGlvbihzYXhQYXJzZXIpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcbiAgICB2YXIgc2VsZiA9IHRoaXNcblxuICAgIHZhciBQYXJzZXJNb2QgPSBzYXhQYXJzZXIgfHwgZXhwb3J0cy5iZXN0U2F4UGFyc2VyXG4gICAgaWYgKCFQYXJzZXJNb2QpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBTQVggcGFyc2VyIGF2YWlsYWJsZScpXG4gICAgfVxuICAgIHRoaXMucGFyc2VyID0gbmV3IFBhcnNlck1vZCgpXG5cbiAgICB2YXIgZWxcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcignc3RhcnRFbGVtZW50JywgZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gbmV3IERPTUVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgIGVsID0gY2hpbGRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsID0gZWwuY25vZGUoY2hpbGQpXG4gICAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLmFkZExpc3RlbmVyKCdlbmRFbGVtZW50JywgZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAvKiBqc2hpbnQgLVcwMzUgKi9cbiAgICAgICAgaWYgKCFlbCkge1xuICAgICAgICAgICAgLyogRXJyICovXG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gZWwubmFtZSkge1xuICAgICAgICAgICAgaWYgKGVsLnBhcmVudCkge1xuICAgICAgICAgICAgICAgIGVsID0gZWwucGFyZW50XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFzZWxmLnRyZWUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnRyZWUgPSBlbFxuICAgICAgICAgICAgICAgIGVsID0gdW5kZWZpbmVkXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLyoganNoaW50ICtXMDM1ICovXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcigndGV4dCcsIGZ1bmN0aW9uKHN0cikge1xuICAgICAgICBpZiAoZWwpIHtcbiAgICAgICAgICAgIGVsLnQoc3RyKVxuICAgICAgICB9XG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcignZXJyb3InLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIHNlbGYuZXJyb3IgPSBlXG4gICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlKVxuICAgIH0pXG59XG5cbnV0aWwuaW5oZXJpdHMoZXhwb3J0cy5QYXJzZXIsIGV2ZW50cy5FdmVudEVtaXR0ZXIpXG5cbmV4cG9ydHMuUGFyc2VyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICB0aGlzLnBhcnNlci53cml0ZShkYXRhKVxufVxuXG5leHBvcnRzLlBhcnNlci5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIHRoaXMucGFyc2VyLmVuZChkYXRhKVxuXG4gICAgaWYgKCF0aGlzLmVycm9yKSB7XG4gICAgICAgIGlmICh0aGlzLnRyZWUpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgndHJlZScsIHRoaXMudHJlZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ0luY29tcGxldGUgZG9jdW1lbnQnKSlcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uKGRhdGEsIHNheFBhcnNlcikge1xuICAgIHZhciBwID0gbmV3IGV4cG9ydHMuUGFyc2VyKHNheFBhcnNlcilcbiAgICB2YXIgcmVzdWx0ID0gbnVsbFxuICAgICAgLCBlcnJvciA9IG51bGxcblxuICAgIHAub24oJ3RyZWUnLCBmdW5jdGlvbih0cmVlKSB7XG4gICAgICAgIHJlc3VsdCA9IHRyZWVcbiAgICB9KVxuICAgIHAub24oJ2Vycm9yJywgZnVuY3Rpb24oZSkge1xuICAgICAgICBlcnJvciA9IGVcbiAgICB9KVxuXG4gICAgcC53cml0ZShkYXRhKVxuICAgIHAuZW5kKClcblxuICAgIGlmIChlcnJvcikge1xuICAgICAgICB0aHJvdyBlcnJvclxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJylcblxudmFyIFNUQVRFX1RFWFQgPSAwLFxuICAgIFNUQVRFX0lHTk9SRV9UQUcgPSAxLFxuICAgIFNUQVRFX1RBR19OQU1FID0gMixcbiAgICBTVEFURV9UQUcgPSAzLFxuICAgIFNUQVRFX0FUVFJfTkFNRSA9IDQsXG4gICAgU1RBVEVfQVRUUl9FUSA9IDUsXG4gICAgU1RBVEVfQVRUUl9RVU9UID0gNixcbiAgICBTVEFURV9BVFRSX1ZBTFVFID0gN1xuXG52YXIgU2F4THR4ID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBTYXhMdHgoKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB2YXIgc3RhdGUgPSBTVEFURV9URVhULCByZW1haW5kZXJcbiAgICB2YXIgdGFnTmFtZSwgYXR0cnMsIGVuZFRhZywgc2VsZkNsb3NpbmcsIGF0dHJRdW90ZVxuICAgIHZhciByZWNvcmRTdGFydCA9IDBcbiAgICB2YXIgYXR0ck5hbWVcblxuICAgIHRoaXMuX2hhbmRsZVRhZ09wZW5pbmcgPSBmdW5jdGlvbihlbmRUYWcsIHRhZ05hbWUsIGF0dHJzKSB7XG4gICAgICAgIGlmICghZW5kVGFnKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3N0YXJ0RWxlbWVudCcsIHRhZ05hbWUsIGF0dHJzKVxuICAgICAgICAgICAgaWYgKHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdlbmRFbGVtZW50JywgdGFnTmFtZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZW5kRWxlbWVudCcsIHRhZ05hbWUpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAvKiBqc2hpbnQgLVcwNzEgKi9cbiAgICAgICAgLyoganNoaW50IC1XMDc0ICovXG4gICAgICAgIGlmICh0eXBlb2YgZGF0YSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgfVxuICAgICAgICB2YXIgcG9zID0gMFxuXG4gICAgICAgIC8qIEFueXRoaW5nIGZyb20gcHJldmlvdXMgd3JpdGUoKT8gKi9cbiAgICAgICAgaWYgKHJlbWFpbmRlcikge1xuICAgICAgICAgICAgZGF0YSA9IHJlbWFpbmRlciArIGRhdGFcbiAgICAgICAgICAgIHBvcyArPSByZW1haW5kZXIubGVuZ3RoXG4gICAgICAgICAgICByZW1haW5kZXIgPSBudWxsXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBlbmRSZWNvcmRpbmcoKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHJlY29yZFN0YXJ0ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHZhciByZWNvcmRlZCA9IGRhdGEuc2xpY2UocmVjb3JkU3RhcnQsIHBvcylcbiAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmRlZFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yKDsgcG9zIDwgZGF0YS5sZW5ndGg7IHBvcysrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IGRhdGEuY2hhckNvZGVBdChwb3MpXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwic3RhdGVcIiwgc3RhdGUsIFwiY1wiLCBjLCBkYXRhW3Bvc10pXG4gICAgICAgICAgICBzd2l0Y2goc3RhdGUpIHtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfVEVYVDpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNjAgLyogPCAqLykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IGVuZFJlY29yZGluZygpXG4gICAgICAgICAgICAgICAgICAgIGlmICh0ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ3RleHQnLCB1bmVzY2FwZVhtbCh0ZXh0KSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RBR19OQU1FXG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgICAgICBhdHRycyA9IHt9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX1RBR19OQU1FOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA0NyAvKiAvICovICYmIHJlY29yZFN0YXJ0ID09PSBwb3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgICAgIGVuZFRhZyA9IHRydWVcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09IDMzIC8qICEgKi8gfHwgYyA9PT0gNjMgLyogPyAqLykge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0lHTk9SRV9UQUdcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPD0gMzIgfHwgYyA9PT0gNDcgLyogLyAqLyB8fCBjID09PSA2MiAvKiA+ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhZ05hbWUgPSBlbmRSZWNvcmRpbmcoKVxuICAgICAgICAgICAgICAgICAgICBwb3MtLVxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RBR1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9JR05PUkVfVEFHOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA2MiAvKiA+ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEVYVFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9UQUc6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYyIC8qID4gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faGFuZGxlVGFnT3BlbmluZyhlbmRUYWcsIHRhZ05hbWUsIGF0dHJzKVxuICAgICAgICAgICAgICAgICAgICB0YWdOYW1lID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIGVuZFRhZyA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzZWxmQ2xvc2luZyA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RFWFRcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSA0NyAvKiAvICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGZDbG9zaW5nID0gdHJ1ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA+IDMyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfQVRUUl9OQU1FXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfTkFNRTpcbiAgICAgICAgICAgICAgICBpZiAoYyA8PSAzMiB8fCBjID09PSA2MSAvKiA9ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJOYW1lID0gZW5kUmVjb3JkaW5nKClcbiAgICAgICAgICAgICAgICAgICAgcG9zLS1cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX0VRXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfRVE6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYxIC8qID0gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX1FVT1RcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfQVRUUl9RVU9UOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSAzNCAvKiBcIiAqLyB8fCBjID09PSAzOSAvKiAnICovKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJRdW90ZSA9IGNcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX1ZBTFVFXG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9BVFRSX1ZBTFVFOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSBhdHRyUXVvdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gdW5lc2NhcGVYbWwoZW5kUmVjb3JkaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzW2F0dHJOYW1lXSA9IHZhbHVlXG4gICAgICAgICAgICAgICAgICAgIGF0dHJOYW1lID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEFHXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIHJlY29yZFN0YXJ0ID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgcmVjb3JkU3RhcnQgPD0gZGF0YS5sZW5ndGgpIHtcblxuICAgICAgICAgICAgcmVtYWluZGVyID0gZGF0YS5zbGljZShyZWNvcmRTdGFydClcbiAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gMFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyp2YXIgb3JpZ0VtaXQgPSB0aGlzLmVtaXRcbiAgICB0aGlzLmVtaXQgPSBmdW5jdGlvbigpIHtcbiAgICBjb25zb2xlLmxvZygnbHR4JywgYXJndW1lbnRzKVxuICAgIG9yaWdFbWl0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9Ki9cbn1cbnV0aWwuaW5oZXJpdHMoU2F4THR4LCBldmVudHMuRXZlbnRFbWl0dGVyKVxuXG5cblNheEx0eC5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIHRoaXMud3JpdGUoZGF0YSlcbiAgICB9XG5cbiAgICAvKiBVaCwgeWVhaCAqL1xuICAgIHRoaXMud3JpdGUgPSBmdW5jdGlvbigpIHt9XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlWG1sKHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGFtcHwjMzgpOy9nLCAnJicpLlxuICAgICAgICByZXBsYWNlKC9cXCYobHR8IzYwKTsvZywgJzwnKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGd0fCM2Mik7L2csICc+JykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihxdW90fCMzNCk7L2csICdcIicpLlxuICAgICAgICByZXBsYWNlKC9cXCYoYXBvc3wjMzkpOy9nLCAnXFwnJykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihuYnNwfCMxNjApOy9nLCAnXFxuJylcbn1cbiIsIihmdW5jdGlvbiAoX19kaXJuYW1lKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIFNlc3Npb24gPSByZXF1aXJlKCcuL2xpYi9zZXNzaW9uJylcbiAgLCBDb25uZWN0aW9uID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5Db25uZWN0aW9uXG4gICwgSklEID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5KSURcbiAgLCBTdGFuemEgPSByZXF1aXJlICgnbm9kZS14bXBwLWNvcmUnKS5TdGFuemFcbiAgLCBzYXNsID0gcmVxdWlyZSgnLi9saWIvc2FzbCcpXG4gICwgQW5vbnltb3VzID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24vYW5vbnltb3VzJylcbiAgLCBQbGFpbiA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL3BsYWluJylcbiAgLCBEaWdlc3RNRDUgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9kaWdlc3RtZDUnKVxuICAsIFhPQXV0aDIgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi94b2F1dGgyJylcbiAgLCBYRmFjZWJvb2tQbGF0Zm9ybSA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL3hmYWNlYm9vaycpXG4gICwgRXh0ZXJuYWwgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9leHRlcm5hbCcpXG4gICwgZXhlYyA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5leGVjXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG5cbnZhciBOU19DTElFTlQgPSAnamFiYmVyOmNsaWVudCdcbnZhciBOU19SRUdJU1RFUiA9ICdqYWJiZXI6aXE6cmVnaXN0ZXInXG52YXIgTlNfWE1QUF9TQVNMID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1zYXNsJ1xudmFyIE5TX1hNUFBfQklORCA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtYmluZCdcbnZhciBOU19YTVBQX1NFU1NJT04gPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLXNlc3Npb24nXG5cbnZhciBTVEFURV9QUkVBVVRIID0gMFxuICAsIFNUQVRFX0FVVEggPSAxXG4gICwgU1RBVEVfQVVUSEVEID0gMlxuICAsIFNUQVRFX0JJTkQgPSAzXG4gICwgU1RBVEVfU0VTU0lPTiA9IDRcbiAgLCBTVEFURV9PTkxJTkUgPSA1XG5cbnZhciBJUUlEX1NFU1NJT04gPSAnc2VzcydcbiAgLCBJUUlEX0JJTkQgPSAnYmluZCdcblxuLyoganNoaW50IGxhdGVkZWY6IGZhbHNlICovXG4vKiBqc2hpbnQgLVcwNzkgKi9cbi8qIGpzaGludCAtVzAyMCAqL1xudmFyIGRlY29kZTY0LCBlbmNvZGU2NCwgQnVmZmVyXG5pZiAodHlwZW9mIGJ0b2EgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGJ0b2EgPSBudWxsXG4gICAgdmFyIGF0b2IgPSBudWxsXG59XG5cbmlmICh0eXBlb2YgYnRvYSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGRlY29kZTY0ID0gZnVuY3Rpb24oZW5jb2RlZCkge1xuICAgICAgICByZXR1cm4gYXRvYihlbmNvZGVkKVxuICAgIH1cbn0gZWxzZSB7XG4gICAgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyXG4gICAgZGVjb2RlNjQgPSBmdW5jdGlvbihlbmNvZGVkKSB7XG4gICAgICAgIHJldHVybiAobmV3IEJ1ZmZlcihlbmNvZGVkLCAnYmFzZTY0JykpLnRvU3RyaW5nKCd1dGY4JylcbiAgICB9XG59XG5pZiAodHlwZW9mIGF0b2IgPT09ICdmdW5jdGlvbicpIHtcbiAgICBlbmNvZGU2NCA9IGZ1bmN0aW9uKGRlY29kZWQpIHtcbiAgICAgICAgcmV0dXJuIGJ0b2EoZGVjb2RlZClcbiAgICB9XG59IGVsc2Uge1xuICAgIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlclxuICAgIGVuY29kZTY0ID0gZnVuY3Rpb24oZGVjb2RlZCkge1xuICAgICAgICByZXR1cm4gKG5ldyBCdWZmZXIoZGVjb2RlZCwgJ3V0ZjgnKSkudG9TdHJpbmcoJ2Jhc2U2NCcpXG4gICAgfVxufVxuXG4vKipcbiAqIHBhcmFtcyBvYmplY3Q6XG4gKiAgIGppZDogU3RyaW5nIChyZXF1aXJlZClcbiAqICAgcGFzc3dvcmQ6IFN0cmluZyAocmVxdWlyZWQpXG4gKiAgIGhvc3Q6IFN0cmluZyAob3B0aW9uYWwpXG4gKiAgIHBvcnQ6IE51bWJlciAob3B0aW9uYWwpXG4gKiAgIHJlY29ubmVjdDogQm9vbGVhbiAob3B0aW9uYWwpXG4gKiAgIGF1dG9zdGFydDogQm9vbGVhbiAob3B0aW9uYWwpIC0gaWYgd2Ugc3RhcnQgY29ubmVjdGluZyB0byBhIGdpdmVuIHBvcnRcbiAqICAgcmVnaXN0ZXI6IEJvb2xlYW4gKG9wdGlvbikgLSByZWdpc3RlciBhY2NvdW50IGJlZm9yZSBhdXRoZW50aWNhdGlvblxuICogICBsZWdhY3lTU0w6IEJvb2xlYW4gKG9wdGlvbmFsKSAtIGNvbm5lY3QgdG8gdGhlIGxlZ2FjeSBTU0wgcG9ydCwgcmVxdWlyZXMgYXQgbGVhc3QgdGhlIGhvc3QgdG8gYmUgc3BlY2lmaWVkXG4gKiAgIGNyZWRlbnRpYWxzOiBEaWN0aW9uYXJ5IChvcHRpb25hbCkgLSBUTFMgb3IgU1NMIGtleSBhbmQgY2VydGlmaWNhdGUgY3JlZGVudGlhbHNcbiAqICAgYWN0QXM6IFN0cmluZyAob3B0aW9uYWwpIC0gaWYgYWRtaW4gdXNlciBhY3Qgb24gYmVoYWxmIG9mIGFub3RoZXIgdXNlciAoanVzdCB1c2VyKVxuICogICBkaXNhbGxvd1RMUzogQm9vbGVhbiAob3B0aW9uYWwpIC0gcHJldmVudCB1cGdyYWRpbmcgdGhlIGNvbm5lY3Rpb24gdG8gYSBzZWN1cmUgb25lIHZpYSBUTFNcbiAqICAgcHJlZmVycmVkOiBTdHJpbmcgKG9wdGlvbmFsKSAtIFByZWZlcnJlZCBTQVNMIG1lY2hhbmlzbSB0byB1c2VcbiAqICAgYm9zaC51cmw6IFN0cmluZyAob3B0aW9uYWwpIC0gQk9TSCBlbmRwb2ludCB0byB1c2VcbiAqICAgYm9zaC5wcmViaW5kOiBGdW5jdGlvbihlcnJvciwgZGF0YSkgKG9wdGlvbmFsKSAtIEp1c3QgcHJlYmluZCBhIG5ldyBCT1NIIHNlc3Npb24gZm9yIGJyb3dzZXIgY2xpZW50IHVzZVxuICogICAgICAgICAgICBlcnJvciBTdHJpbmcgLSBSZXN1bHQgb2YgWE1QUCBlcnJvci4gRXggOiBbRXJyb3I6IFhNUFAgYXV0aGVudGljYXRpb24gZmFpbHVyZV1cbiAqICAgICAgICAgICAgZGF0YSBPYmplY3QgLSBSZXN1bHQgb2YgWE1QUCBCT1NIIGNvbm5lY3Rpb24uXG4gKlxuICogRXhhbXBsZXM6XG4gKiAgIHZhciBjbCA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICAgIHBhc3N3b3JkOiBcInNlY3JldFwiXG4gKiAgIH0pXG4gKiAgIHZhciBmYWNlYm9vayA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6ICctJyArIGZiVUlEICsgJ0BjaGF0LmZhY2Vib29rLmNvbScsXG4gKiAgICAgICBhcGlfa2V5OiAnNTQzMjEnLCAvLyBhcGkga2V5IG9mIHlvdXIgZmFjZWJvb2sgYXBwXG4gKiAgICAgICBhY2Nlc3NfdG9rZW46ICdhYmNkZWZnJywgLy8gdXNlciBhY2Nlc3MgdG9rZW5cbiAqICAgICAgIGhvc3Q6ICdjaGF0LmZhY2Vib29rLmNvbSdcbiAqICAgfSlcbiAqICAgdmFyIGd0YWxrID0gbmV3IHhtcHAuQ2xpZW50KHtcbiAqICAgICAgIGppZDogJ21lQGdtYWlsLmNvbScsXG4gKiAgICAgICBvYXV0aDJfdG9rZW46ICd4eHh4Lnh4eHh4eHh4eHh4JywgLy8gZnJvbSBPQXV0aDJcbiAqICAgICAgIG9hdXRoMl9hdXRoOiAnaHR0cDovL3d3dy5nb29nbGUuY29tL3RhbGsvcHJvdG9jb2wvYXV0aCcsXG4gKiAgICAgICBob3N0OiAndGFsay5nb29nbGUuY29tJ1xuICogICB9KVxuICogICB2YXIgcHJlYmluZCA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICAgIHBhc3N3b3JkOiBcInNlY3JldFwiLFxuICogICAgICAgYm9zaDoge1xuICogICAgICAgICAgIHVybDogXCJodHRwOi8vZXhhbXBsZS5jb20vaHR0cC1iaW5kXCIsXG4gKiAgICAgICAgICAgcHJlYmluZDogZnVuY3Rpb24oZXJyb3IsIGRhdGEpIHtcbiAqICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7fVxuICogICAgICAgICAgICAgICByZXMuc2VuZCh7IHJpZDogZGF0YS5yaWQsIHNpZDogZGF0YS5zaWQgfSlcbiAqICAgICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgIH0pXG4gKlxuICogRXhhbXBsZSBTQVNMIEVYVEVSTkFMOlxuICpcbiAqIHZhciBteUNyZWRlbnRpYWxzID0ge1xuICogICAvLyBUaGVzZSBhcmUgbmVjZXNzYXJ5IG9ubHkgaWYgdXNpbmcgdGhlIGNsaWVudCBjZXJ0aWZpY2F0ZSBhdXRoZW50aWNhdGlvblxuICogICBrZXk6IGZzLnJlYWRGaWxlU3luYygna2V5LnBlbScpLFxuICogICBjZXJ0OiBmcy5yZWFkRmlsZVN5bmMoJ2NlcnQucGVtJyksXG4gKiAgIC8vIHBhc3NwaHJhc2U6ICdvcHRpb25hbCdcbiAqIH1cbiAqIHZhciBjbCA9IG5ldyB4bXBwQ2xpZW50KHtcbiAqICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICBjcmVkZW50aWFsczogbXlDcmVkZW50aWFsc1xuICogICAgIHByZWZlcnJlZDogJ0VYVEVSTkFMJyAvLyBub3QgcmVhbGx5IHJlcXVpcmVkLCBidXQgcG9zc2libGVcbiAqIH0pXG4gKlxuICovXG5mdW5jdGlvbiBDbGllbnQob3B0aW9ucykge1xuICAgIHRoaXMub3B0aW9ucyA9IHt9XG4gICAgaWYgKG9wdGlvbnMpIHRoaXMub3B0aW9ucyA9IG9wdGlvbnNcbiAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zID0gW1xuICAgICAgICBYT0F1dGgyLCBYRmFjZWJvb2tQbGF0Zm9ybSwgRXh0ZXJuYWwsIERpZ2VzdE1ENSwgUGxhaW4sIEFub255bW91c1xuICAgIF1cblxuICAgIGlmICh0aGlzLm9wdGlvbnMuYXV0b3N0YXJ0ICE9PSBmYWxzZSlcbiAgICAgICAgdGhpcy5jb25uZWN0KClcbn1cblxudXRpbC5pbmhlcml0cyhDbGllbnQsIFNlc3Npb24pXG5cbkNsaWVudC5OU19DTElFTlQgPSBOU19DTElFTlRcblxuQ2xpZW50LnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMub3B0aW9ucy5ib3NoICYmIHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmQpIHtcbiAgICAgICAgZGVidWcoJ2xvYWQgYm9zaCBwcmViaW5kJylcbiAgICAgICAgdmFyIGNiID0gdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZFxuICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZFxuICAgICAgICB2YXIgY21kID0gJ25vZGUgJyArIF9fZGlybmFtZSArXG4gICAgICAgICAgICAnL2xpYi9wcmViaW5kLmpzICdcbiAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmRcbiAgICAgICAgY21kICs9IGVuY29kZVVSSShKU09OLnN0cmluZ2lmeSh0aGlzLm9wdGlvbnMpKVxuICAgICAgICBleGVjKFxuICAgICAgICAgICAgY21kLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVycm9yLCBzdGRvdXQsIHN0ZGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjYihlcnJvciwgbnVsbClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgciA9IHN0ZG91dC5tYXRjaCgvcmlkOitbIDAtOV0qL2kpXG4gICAgICAgICAgICAgICAgICAgIHIgPSAoclswXS5zcGxpdCgnOicpKVsxXS50cmltKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHMgPSBzdGRvdXQubWF0Y2goL3NpZDorWyBhLXorJ1wiLV9BLVorMC05XSovaSlcbiAgICAgICAgICAgICAgICAgICAgcyA9IChzWzBdLnNwbGl0KCc6JykpWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgnXFwnJywnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKCdcXCcnLCcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRyaW0oKVxuICAgICAgICAgICAgICAgICAgICBpZiAociAmJiBzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgeyByaWQ6IHIsIHNpZDogcyB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNiKHN0ZGVycilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLm9wdGlvbnMueG1sbnMgPSBOU19DTElFTlRcbiAgICAgICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgICAgZGVsZXRlIHRoaXMuZGlkX2JpbmRcbiAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cblxuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfUFJFQVVUSFxuICAgICAgICB0aGlzLm9uKCdlbmQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QUkVBVVRIXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfYmluZFxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cbiAgICAgICAgfSlcblxuICAgICAgICBTZXNzaW9uLmNhbGwodGhpcywgdGhpcy5vcHRpb25zKVxuICAgICAgICB0aGlzLm9wdGlvbnMuamlkID0gdGhpcy5qaWRcblxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ub24oJ2Rpc2Nvbm5lY3QnLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BSRUFVVEhcbiAgICAgICAgICAgIGlmICghdGhpcy5jb25uZWN0aW9uLnJlY29ubmVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgdGhpcy5lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnb2ZmbGluZScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfYmluZFxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cbiAgICAgICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgICAgIC8vIElmIHNlcnZlciBhbmQgY2xpZW50IGhhdmUgbXVsdGlwbGUgcG9zc2libGUgYXV0aCBtZWNoYW5pc21zXG4gICAgICAgIC8vIHdlIHRyeSB0byBzZWxlY3QgdGhlIHByZWZlcnJlZCBvbmVcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5wcmVmZXJyZWQpIHtcbiAgICAgICAgICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSA9IHRoaXMub3B0aW9ucy5wcmVmZXJyZWRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSA9ICdESUdFU1QtTUQ1J1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1lY2hzID0gc2FzbC5kZXRlY3RNZWNoYW5pc21zKHRoaXMub3B0aW9ucywgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcylcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IG1lY2hzXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLm9uU3RhbnphID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgLyogQWN0dWFsbHksIHdlIHNob3VsZG4ndCB3YWl0IGZvciA8c3RyZWFtOmZlYXR1cmVzLz4gaWZcbiAgICAgICB0aGlzLnN0cmVhbUF0dHJzLnZlcnNpb24gaXMgbWlzc2luZywgYnV0IHdobyB1c2VzIHByZS1YTVBQLTEuMFxuICAgICAgIHRoZXNlIGRheXMgYW55d2F5PyAqL1xuICAgIGlmICgodGhpcy5zdGF0ZSAhPT0gU1RBVEVfT05MSU5FKSAmJiBzdGFuemEuaXMoJ2ZlYXR1cmVzJykpIHtcbiAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcyA9IHN0YW56YVxuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX1BSRUFVVEgpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdzdGFuemE6cHJlYXV0aCcsIHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX0FVVEgpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlQXV0aFN0YXRlKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9CSU5EKSAmJiBzdGFuemEuaXMoJ2lxJykgJiYgKHN0YW56YS5hdHRycy5pZCA9PT0gSVFJRF9CSU5EKSkge1xuICAgICAgICB0aGlzLl9oYW5kbGVCaW5kU3RhdGUoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX1NFU1NJT04pICYmICh0cnVlID09PSBzdGFuemEuaXMoJ2lxJykpICYmXG4gICAgICAgIChzdGFuemEuYXR0cnMuaWQgPT09IElRSURfU0VTU0lPTikpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlU2Vzc2lvblN0YXRlKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHN0YW56YS5uYW1lID09PSAnc3RyZWFtOmVycm9yJykge1xuICAgICAgICBpZiAoIXRoaXMucmVjb25uZWN0KVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX09OTElORSkge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZVNlc3Npb25TdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgICAgICB0aGlzLmRpZF9zZXNzaW9uID0gdHJ1ZVxuXG4gICAgICAgIC8qIG5vIHN0cmVhbSByZXN0YXJ0LCBidXQgbmV4dCBmZWF0dXJlIChtb3N0IHByb2JhYmx5XG4gICAgICAgICAgIHdlJ2xsIGdvIG9ubGluZSBuZXh0KSAqL1xuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ0Nhbm5vdCBiaW5kIHJlc291cmNlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZUJpbmRTdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIHRoaXMuZGlkX2JpbmQgPSB0cnVlXG5cbiAgICAgICAgdmFyIGJpbmRFbCA9IHN0YW56YS5nZXRDaGlsZCgnYmluZCcsIE5TX1hNUFBfQklORClcbiAgICAgICAgaWYgKGJpbmRFbCAmJiBiaW5kRWwuZ2V0Q2hpbGQoJ2ppZCcpKSB7XG4gICAgICAgICAgICB0aGlzLmppZCA9IG5ldyBKSUQoYmluZEVsLmdldENoaWxkKCdqaWQnKS5nZXRUZXh0KCkpXG4gICAgICAgIH1cblxuICAgICAgICAvKiBubyBzdHJlYW0gcmVzdGFydCwgYnV0IG5leHQgZmVhdHVyZSAqL1xuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ0Nhbm5vdCBiaW5kIHJlc291cmNlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZUF1dGhTdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuaXMoJ2NoYWxsZW5nZScsIE5TX1hNUFBfU0FTTCkpIHtcbiAgICAgICAgdmFyIGNoYWxsZW5nZU1zZyA9IGRlY29kZTY0KHN0YW56YS5nZXRUZXh0KCkpXG4gICAgICAgIHZhciByZXNwb25zZU1zZyA9IGVuY29kZTY0KHRoaXMubWVjaC5jaGFsbGVuZ2UoY2hhbGxlbmdlTXNnKSlcbiAgICAgICAgdmFyIHJlc3BvbnNlID0gbmV3IFN0YW56YS5FbGVtZW50KFxuICAgICAgICAgICAgJ3Jlc3BvbnNlJywgeyB4bWxuczogTlNfWE1QUF9TQVNMIH1cbiAgICAgICAgKS50KHJlc3BvbnNlTXNnKVxuICAgICAgICB0aGlzLnNlbmQocmVzcG9uc2UpXG4gICAgfSBlbHNlIGlmIChzdGFuemEuaXMoJ3N1Y2Nlc3MnLCBOU19YTVBQX1NBU0wpKSB7XG4gICAgICAgIHRoaXMubWVjaCA9IG51bGxcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICB0aGlzLmVtaXQoJ2F1dGgnKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAnWE1QUCBhdXRoZW50aWNhdGlvbiBmYWlsdXJlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZVByZUF1dGhTdGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3RhdGUgPSBTVEFURV9BVVRIXG4gICAgdmFyIG9mZmVyZWRNZWNocyA9IHRoaXMuc3RyZWFtRmVhdHVyZXMuXG4gICAgICAgIGdldENoaWxkKCdtZWNoYW5pc21zJywgTlNfWE1QUF9TQVNMKS5cbiAgICAgICAgZ2V0Q2hpbGRyZW4oJ21lY2hhbmlzbScsIE5TX1hNUFBfU0FTTCkuXG4gICAgICAgIG1hcChmdW5jdGlvbihlbCkgeyByZXR1cm4gZWwuZ2V0VGV4dCgpIH0pXG4gICAgdGhpcy5tZWNoID0gc2FzbC5zZWxlY3RNZWNoYW5pc20oXG4gICAgICAgIG9mZmVyZWRNZWNocyxcbiAgICAgICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtLFxuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zXG4gICAgKVxuICAgIGlmICh0aGlzLm1lY2gpIHtcbiAgICAgICAgdGhpcy5tZWNoLmF1dGh6aWQgPSB0aGlzLmppZC5iYXJlKCkudG9TdHJpbmcoKVxuICAgICAgICB0aGlzLm1lY2guYXV0aGNpZCA9IHRoaXMuamlkLnVzZXJcbiAgICAgICAgdGhpcy5tZWNoLnBhc3N3b3JkID0gdGhpcy5wYXNzd29yZFxuICAgICAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIHRoaXMubWVjaC5hcGlfa2V5ID0gdGhpcy5hcGlfa2V5XG4gICAgICAgIHRoaXMubWVjaC5hY2Nlc3NfdG9rZW4gPSB0aGlzLmFjY2Vzc190b2tlblxuICAgICAgICB0aGlzLm1lY2gub2F1dGgyX3Rva2VuID0gdGhpcy5vYXV0aDJfdG9rZW5cbiAgICAgICAgdGhpcy5tZWNoLm9hdXRoMl9hdXRoID0gdGhpcy5vYXV0aDJfYXV0aFxuICAgICAgICB0aGlzLm1lY2gucmVhbG0gPSB0aGlzLmppZC5kb21haW4gIC8vIGFueXRoaW5nP1xuICAgICAgICBpZiAodGhpcy5hY3RBcykgdGhpcy5tZWNoLmFjdEFzID0gdGhpcy5hY3RBcy51c2VyXG4gICAgICAgIHRoaXMubWVjaC5kaWdlc3RfdXJpID0gJ3htcHAvJyArIHRoaXMuamlkLmRvbWFpblxuICAgICAgICB2YXIgYXV0aE1zZyA9IGVuY29kZTY0KHRoaXMubWVjaC5hdXRoKCkpXG4gICAgICAgIHZhciBhdHRycyA9IHRoaXMubWVjaC5hdXRoQXR0cnMoKVxuICAgICAgICBhdHRycy54bWxucyA9IE5TX1hNUFBfU0FTTFxuICAgICAgICBhdHRycy5tZWNoYW5pc20gPSB0aGlzLm1lY2gubmFtZVxuICAgICAgICB0aGlzLnNlbmQobmV3IFN0YW56YS5FbGVtZW50KCdhdXRoJywgYXR0cnMpXG4gICAgICAgICAgICAudChhdXRoTXNnKSlcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ05vIHVzYWJsZSBTQVNMIG1lY2hhbmlzbScpXG4gICAgfVxufVxuXG4vKipcbiAqIEVpdGhlciB3ZSBqdXN0IHJlY2VpdmVkIDxzdHJlYW06ZmVhdHVyZXMvPiwgb3Igd2UganVzdCBlbmFibGVkIGFcbiAqIGZlYXR1cmUgYW5kIGFyZSBsb29raW5nIGZvciB0aGUgbmV4dC5cbiAqL1xuQ2xpZW50LnByb3RvdHlwZS51c2VGZWF0dXJlcyA9IGZ1bmN0aW9uKCkge1xuICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9QUkVBVVRIKSAmJiB0aGlzLnJlZ2lzdGVyKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnJlZ2lzdGVyXG4gICAgICAgIHRoaXMuZG9SZWdpc3RlcigpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfUFJFQVVUSCkgJiZcbiAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcy5nZXRDaGlsZCgnbWVjaGFuaXNtcycsIE5TX1hNUFBfU0FTTCkpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlUHJlQXV0aFN0YXRlKClcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9BVVRIRUQpICYmXG4gICAgICAgICAgICAgICAhdGhpcy5kaWRfYmluZCAmJlxuICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcy5nZXRDaGlsZCgnYmluZCcsIE5TX1hNUFBfQklORCkpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0JJTkRcbiAgICAgICAgdmFyIGJpbmRFbCA9IG5ldyBTdGFuemEuRWxlbWVudChcbiAgICAgICAgICAgICdpcScsXG4gICAgICAgICAgICB7IHR5cGU6ICdzZXQnLCBpZDogSVFJRF9CSU5EIH1cbiAgICAgICAgKS5jKCdiaW5kJywgeyB4bWxuczogTlNfWE1QUF9CSU5EIH0pXG4gICAgICAgIGlmICh0aGlzLmppZC5yZXNvdXJjZSlcbiAgICAgICAgICAgIGJpbmRFbC5jKCdyZXNvdXJjZScpLnQodGhpcy5qaWQucmVzb3VyY2UpXG4gICAgICAgIHRoaXMuc2VuZChiaW5kRWwpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSEVEKSAmJlxuICAgICAgICAgICAgICAgIXRoaXMuZGlkX3Nlc3Npb24gJiZcbiAgICAgICAgICAgICAgIHRoaXMuc3RyZWFtRmVhdHVyZXMuZ2V0Q2hpbGQoJ3Nlc3Npb24nLCBOU19YTVBQX1NFU1NJT04pKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9TRVNTSU9OXG4gICAgICAgIHZhciBzdGFuemEgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICAgJ2lxJyxcbiAgICAgICAgICB7IHR5cGU6ICdzZXQnLCB0bzogdGhpcy5qaWQuZG9tYWluLCBpZDogSVFJRF9TRVNTSU9OICB9XG4gICAgICAgICkuYygnc2Vzc2lvbicsIHsgeG1sbnM6IE5TX1hNUFBfU0VTU0lPTiB9KVxuICAgICAgICB0aGlzLnNlbmQoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSEVEKSB7XG4gICAgICAgIC8qIE9rLCB3ZSdyZSBhdXRoZW50aWNhdGVkIGFuZCBhbGwgZmVhdHVyZXMgaGF2ZSBiZWVuXG4gICAgICAgICAgIHByb2Nlc3NlZCAqL1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfT05MSU5FXG4gICAgICAgIHRoaXMuZW1pdCgnb25saW5lJywgeyBqaWQ6IHRoaXMuamlkIH0pXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLmRvUmVnaXN0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaWQgPSAncmVnaXN0ZXInICsgTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiA5OTk5OSlcbiAgICB2YXIgaXEgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICdpcScsXG4gICAgICAgIHsgdHlwZTogJ3NldCcsIGlkOiBpZCwgdG86IHRoaXMuamlkLmRvbWFpbiB9XG4gICAgKS5jKCdxdWVyeScsIHsgeG1sbnM6IE5TX1JFR0lTVEVSIH0pXG4gICAgLmMoJ3VzZXJuYW1lJykudCh0aGlzLmppZC51c2VyKS51cCgpXG4gICAgLmMoJ3Bhc3N3b3JkJykudCh0aGlzLnBhc3N3b3JkKVxuICAgIHRoaXMuc2VuZChpcSlcblxuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHZhciBvblJlcGx5ID0gZnVuY3Rpb24ocmVwbHkpIHtcbiAgICAgICAgaWYgKHJlcGx5LmlzKCdpcScpICYmIChyZXBseS5hdHRycy5pZCA9PT0gaWQpKSB7XG4gICAgICAgICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCdzdGFuemEnLCBvblJlcGx5KVxuXG4gICAgICAgICAgICBpZiAocmVwbHkuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgICAgICAgICAvKiBSZWdpc3RyYXRpb24gc3VjY2Vzc2Z1bCwgcHJvY2VlZCB0byBhdXRoICovXG4gICAgICAgICAgICAgICAgc2VsZi51c2VGZWF0dXJlcygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ1JlZ2lzdHJhdGlvbiBlcnJvcicpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRoaXMub24oJ3N0YW56YTpwcmVhdXRoJywgb25SZXBseSlcbn1cblxuLyoqXG4gKiByZXR1cm5zIGFsbCByZWdpc3RlcmVkIHNhc2wgbWVjaGFuaXNtc1xuICovXG5DbGllbnQucHJvdG90eXBlLmdldFNhc2xNZWNoYW5pc21zID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXNcbn1cblxuLyoqXG4gKiByZW1vdmVzIGFsbCByZWdpc3RlcmVkIHNhc2wgbWVjaGFuaXNtc1xuICovXG5DbGllbnQucHJvdG90eXBlLmNsZWFyU2FzbE1lY2hhbmlzbSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMgPSBbXVxufVxuXG4vKipcbiAqIHJlZ2lzdGVyIGEgbmV3IHNhc2wgbWVjaGFuaXNtXG4gKi9cbkNsaWVudC5wcm90b3R5cGUucmVnaXN0ZXJTYXNsTWVjaGFuaXNtID0gZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgLy8gY2hlY2sgaWYgbWV0aG9kIGlzIHJlZ2lzdGVyZWRcbiAgICBpZiAodGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcy5pbmRleE9mKG1ldGhvZCkgPT09IC0xICkge1xuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zLnB1c2gobWV0aG9kKVxuICAgIH1cbn1cblxuLyoqXG4gKiB1bnJlZ2lzdGVyIGFuIGV4aXN0aW5nIHNhc2wgbWVjaGFuaXNtXG4gKi9cbkNsaWVudC5wcm90b3R5cGUudW5yZWdpc3RlclNhc2xNZWNoYW5pc20gPSBmdW5jdGlvbihtZXRob2QpIHtcbiAgICAvLyBjaGVjayBpZiBtZXRob2QgaXMgcmVnaXN0ZXJlZFxuICAgIHZhciBpbmRleCA9IHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMuaW5kZXhPZihtZXRob2QpXG4gICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMuc3BsaWNlKGluZGV4LCAxKVxuICAgIH1cbn1cblxuQ2xpZW50LlNBU0wgPSBzYXNsXG5DbGllbnQuQ2xpZW50ID0gQ2xpZW50XG5DbGllbnQuU3RhbnphID0gU3RhbnphXG5DbGllbnQubHR4ID0gbHR4XG5tb2R1bGUuZXhwb3J0cyA9IENsaWVudFxufSkuY2FsbCh0aGlzLFwiLy4uL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50XCIpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBAc2VlIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzQ1MDVcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxNzUuaHRtbFxuICovXG5mdW5jdGlvbiBBbm9ueW1vdXMoKSB7fVxuXG51dGlsLmluaGVyaXRzKEFub255bW91cywgTWVjaGFuaXNtKVxuXG5Bbm9ueW1vdXMucHJvdG90eXBlLm5hbWUgPSAnQU5PTllNT1VTJ1xuXG5Bbm9ueW1vdXMucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoemlkXG59O1xuXG5Bbm9ueW1vdXMucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBbm9ueW1vdXMiLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cblxuLyoqXG4gKiBIYXNoIGEgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIG1kNShzLCBlbmNvZGluZykge1xuICAgIHZhciBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ21kNScpXG4gICAgaGFzaC51cGRhdGUocylcbiAgICByZXR1cm4gaGFzaC5kaWdlc3QoZW5jb2RpbmcgfHwgJ2JpbmFyeScpXG59XG5mdW5jdGlvbiBtZDVIZXgocykge1xuICAgIHJldHVybiBtZDUocywgJ2hleCcpXG59XG5cbi8qKlxuICogUGFyc2UgU0FTTCBzZXJpYWxpemF0aW9uXG4gKi9cbmZ1bmN0aW9uIHBhcnNlRGljdChzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9XG4gICAgd2hpbGUgKHMpIHtcbiAgICAgICAgdmFyIG1cbiAgICAgICAgaWYgKChtID0gL14oLis/KT0oLio/W15cXFxcXSksXFxzKiguKikvLmV4ZWMocykpKSB7XG4gICAgICAgICAgICByZXN1bHRbbVsxXV0gPSBtWzJdLnJlcGxhY2UoL1xcXCIvZywgJycpXG4gICAgICAgICAgICBzID0gbVszXVxuICAgICAgICB9IGVsc2UgaWYgKChtID0gL14oLis/KT0oLis/KSxcXHMqKC4qKS8uZXhlYyhzKSkpIHtcbiAgICAgICAgICAgIHJlc3VsdFttWzFdXSA9IG1bMl1cbiAgICAgICAgICAgIHMgPSBtWzNdXG4gICAgICAgIH0gZWxzZSBpZiAoKG0gPSAvXiguKz8pPVwiKC4qP1teXFxcXF0pXCIkLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIGlmICgobSA9IC9eKC4rPyk9KC4rPykkLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMgPSBudWxsXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIFNBU0wgc2VyaWFsaXphdGlvblxuICovXG5mdW5jdGlvbiBlbmNvZGVEaWN0KGRpY3QpIHtcbiAgICB2YXIgcyA9ICcnXG4gICAgZm9yICh2YXIgayBpbiBkaWN0KSB7XG4gICAgICAgIHZhciB2ID0gZGljdFtrXVxuICAgICAgICBpZiAodikgcyArPSAnLCcgKyBrICsgJz1cIicgKyB2ICsgJ1wiJ1xuICAgIH1cbiAgICByZXR1cm4gcy5zdWJzdHIoMSkgLy8gd2l0aG91dCBmaXJzdCAnLCdcbn1cblxuLyoqXG4gKiBSaWdodC1qdXN0aWZ5IGEgc3RyaW5nLFxuICogZWcuIHBhZCB3aXRoIDBzXG4gKi9cbmZ1bmN0aW9uIHJqdXN0KHMsIHRhcmdldExlbiwgcGFkZGluZykge1xuICAgIHdoaWxlIChzLmxlbmd0aCA8IHRhcmdldExlbilcbiAgICAgICAgcyA9IHBhZGRpbmcgKyBzXG4gICAgcmV0dXJuIHNcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHN0cmluZyBvZiA4IGRpZ2l0c1xuICogKG51bWJlciB1c2VkIG9uY2UpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlTm9uY2UoKSB7XG4gICAgdmFyIHJlc3VsdCA9ICcnXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA4OyBpKyspXG4gICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDQ4ICtcbiAgICAgICAgICAgIE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogMTApKVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiBAc2VlIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzI4MzFcbiAqIEBzZWUgaHR0cDovL3dpa2kueG1wcC5vcmcvd2ViL1NBU0xhbmRESUdFU1QtTUQ1XG4gKi9cbmZ1bmN0aW9uIERpZ2VzdE1ENSgpIHtcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdGhpcy5ub25jZV9jb3VudCA9IDBcbiAgICB0aGlzLmNub25jZSA9IGdlbmVyYXRlTm9uY2UoKVxuICAgIHRoaXMuYXV0aGNpZCA9IG51bGxcbiAgICB0aGlzLmFjdEFzID0gbnVsbFxuICAgIHRoaXMucmVhbG0gPSBudWxsXG4gICAgdGhpcy5wYXNzd29yZCA9IG51bGxcbn1cblxudXRpbC5pbmhlcml0cyhEaWdlc3RNRDUsIE1lY2hhbmlzbSlcblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5uYW1lID0gJ0RJR0VTVC1NRDUnXG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnJ1xufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLmdldE5DID0gZnVuY3Rpb24oKSB7XG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHJldHVybiByanVzdCh0aGlzLm5vbmNlX2NvdW50LnRvU3RyaW5nKCksIDgsICcwJylcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5yZXNwb25zZVZhbHVlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcGFyc2VEaWN0KHMpXG4gICAgaWYgKGRpY3QucmVhbG0pXG4gICAgICAgIHRoaXMucmVhbG0gPSBkaWN0LnJlYWxtXG5cbiAgICB2YXIgdmFsdWVcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgaWYgKGRpY3Qubm9uY2UgJiYgZGljdC5xb3ApIHtcbiAgICAgICAgdGhpcy5ub25jZV9jb3VudCsrXG4gICAgICAgIHZhciBhMSA9IG1kNSh0aGlzLmF1dGhjaWQgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5yZWFsbSArICc6JyArXG4gICAgICAgICAgICB0aGlzLnBhc3N3b3JkKSArICc6JyArXG4gICAgICAgICAgICBkaWN0Lm5vbmNlICsgJzonICtcbiAgICAgICAgICAgIHRoaXMuY25vbmNlXG4gICAgICAgIGlmICh0aGlzLmFjdEFzKSBhMSArPSAnOicgKyB0aGlzLmFjdEFzXG5cbiAgICAgICAgdmFyIGEyID0gJ0FVVEhFTlRJQ0FURTonICsgdGhpcy5kaWdlc3RfdXJpXG4gICAgICAgIGlmICgoZGljdC5xb3AgPT09ICdhdXRoLWludCcpIHx8IChkaWN0LnFvcCA9PT0gJ2F1dGgtY29uZicpKVxuICAgICAgICAgICAgYTIgKz0gJzowMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCdcblxuICAgICAgICB2YWx1ZSA9IG1kNUhleChtZDVIZXgoYTEpICsgJzonICtcbiAgICAgICAgICAgIGRpY3Qubm9uY2UgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5nZXROQygpICsgJzonICtcbiAgICAgICAgICAgIHRoaXMuY25vbmNlICsgJzonICtcbiAgICAgICAgICAgIGRpY3QucW9wICsgJzonICtcbiAgICAgICAgICAgIG1kNUhleChhMikpXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZVxufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLmNoYWxsZW5nZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHBhcnNlRGljdChzKVxuICAgIGlmIChkaWN0LnJlYWxtKVxuICAgICAgICB0aGlzLnJlYWxtID0gZGljdC5yZWFsbVxuXG4gICAgdmFyIHJlc3BvbnNlXG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIGlmIChkaWN0Lm5vbmNlICYmIGRpY3QucW9wKSB7XG4gICAgICAgIHZhciByZXNwb25zZVZhbHVlID0gdGhpcy5yZXNwb25zZVZhbHVlKHMpXG4gICAgICAgIHJlc3BvbnNlID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuYXV0aGNpZCxcbiAgICAgICAgICAgIHJlYWxtOiB0aGlzLnJlYWxtLFxuICAgICAgICAgICAgbm9uY2U6IGRpY3Qubm9uY2UsXG4gICAgICAgICAgICBjbm9uY2U6IHRoaXMuY25vbmNlLFxuICAgICAgICAgICAgbmM6IHRoaXMuZ2V0TkMoKSxcbiAgICAgICAgICAgIHFvcDogZGljdC5xb3AsXG4gICAgICAgICAgICAnZGlnZXN0LXVyaSc6IHRoaXMuZGlnZXN0X3VyaSxcbiAgICAgICAgICAgIHJlc3BvbnNlOiByZXNwb25zZVZhbHVlLFxuICAgICAgICAgICAgY2hhcnNldDogJ3V0Zi04J1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmFjdEFzKSByZXNwb25zZS5hdXRoemlkID0gdGhpcy5hY3RBc1xuICAgIH0gZWxzZSBpZiAoZGljdC5yc3BhdXRoKSB7XG4gICAgICAgIHJldHVybiAnJ1xuICAgIH1cbiAgICByZXR1cm4gZW5jb2RlRGljdChyZXNwb25zZSlcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5zZXJ2ZXJDaGFsbGVuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZGljdCA9IHt9XG4gICAgZGljdC5yZWFsbSA9ICcnXG4gICAgdGhpcy5ub25jZSA9IGRpY3Qubm9uY2UgPSBnZW5lcmF0ZU5vbmNlKClcbiAgICBkaWN0LnFvcCA9ICdhdXRoJ1xuICAgIHRoaXMuY2hhcnNldCA9IGRpY3QuY2hhcnNldCA9ICd1dGYtOCdcbiAgICBkaWN0LmFsZ29yaXRobSA9ICdtZDUtc2VzcydcbiAgICByZXR1cm4gZW5jb2RlRGljdChkaWN0KVxufVxuXG4vLyBVc2VkIG9uIHRoZSBzZXJ2ZXIgdG8gY2hlY2sgZm9yIGF1dGghXG5EaWdlc3RNRDUucHJvdG90eXBlLnJlc3BvbnNlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcGFyc2VEaWN0KHMpXG4gICAgdGhpcy5hdXRoY2lkID0gZGljdC51c2VybmFtZVxuXG4gICAgaWYgKGRpY3Qubm9uY2UgIT09IHRoaXMubm9uY2UpIHJldHVybiBmYWxzZVxuICAgIGlmICghZGljdC5jbm9uY2UpIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5jbm9uY2UgPSBkaWN0LmNub25jZVxuICAgIGlmICh0aGlzLmNoYXJzZXQgIT09IGRpY3QuY2hhcnNldCkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLnJlc3BvbnNlID0gZGljdC5yZXNwb25zZVxuICAgIHJldHVybiB0cnVlXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucGFzc3dvcmQpIHJldHVybiB0cnVlXG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGlnZXN0TUQ1XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG4vKipcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxNzguaHRtbFxuICovXG5mdW5jdGlvbiBFeHRlcm5hbCgpIHt9XG5cbnV0aWwuaW5oZXJpdHMoRXh0ZXJuYWwsIE1lY2hhbmlzbSlcblxuRXh0ZXJuYWwucHJvdG90eXBlLm5hbWUgPSAnRVhURVJOQUwnXG5cbkV4dGVybmFsLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICh0aGlzLmF1dGh6aWQpXG59XG5cbkV4dGVybmFsLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5jcmVkZW50aWFscykgcmV0dXJuIHRydWVcbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBFeHRlcm5hbCIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBFYWNoIGltcGxlbWVudGVkIG1lY2hhbmlzbSBvZmZlcnMgbXVsdGlwbGUgbWV0aG9kc1xuICogLSBuYW1lIDogbmFtZSBvZiB0aGUgYXV0aCBtZXRob2RcbiAqIC0gYXV0aCA6XG4gKiAtIG1hdGNoOiBjaGVja3MgaWYgdGhlIGNsaWVudCBoYXMgZW5vdWdoIG9wdGlvbnMgdG9cbiAqICAgICAgICAgIG9mZmVyIHRoaXMgbWVjaGFuaXMgdG8geG1wcCBzZXJ2ZXJzXG4gKiAtIGF1dGhTZXJ2ZXI6IHRha2VzIGEgc3RhbnphIGFuZCBleHRyYWN0cyB0aGUgaW5mb3JtYXRpb25cbiAqL1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuXG4vLyBNZWNoYW5pc21zXG5mdW5jdGlvbiBNZWNoYW5pc20oKSB7fVxuXG51dGlsLmluaGVyaXRzKE1lY2hhbmlzbSwgRXZlbnRFbWl0dGVyKVxuXG5NZWNoYW5pc20ucHJvdG90eXBlLmF1dGhBdHRycyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE1lY2hhbmlzbSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cbmZ1bmN0aW9uIFBsYWluKCkge31cblxudXRpbC5pbmhlcml0cyhQbGFpbiwgTWVjaGFuaXNtKVxuXG5QbGFpbi5wcm90b3R5cGUubmFtZSA9ICdQTEFJTidcblxuUGxhaW4ucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoemlkICsgJ1xcMCcgK1xuICAgICAgICB0aGlzLmF1dGhjaWQgKyAnXFwwJyArXG4gICAgICAgIHRoaXMucGFzc3dvcmQ7XG59XG5cblBsYWluLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5wYXNzd29yZCkgcmV0dXJuIHRydWVcbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQbGFpbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG4gICwgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpXG5cbi8qKlxuICogQHNlZSBodHRwczovL2RldmVsb3BlcnMuZmFjZWJvb2suY29tL2RvY3MvY2hhdC8jcGxhdGF1dGhcbiAqL1xudmFyIFhGYWNlYm9va1BsYXRmb3JtID0gZnVuY3Rpb24oKSB7fVxuXG51dGlsLmluaGVyaXRzKFhGYWNlYm9va1BsYXRmb3JtLCBNZWNoYW5pc20pXG5cblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5uYW1lID0gJ1gtRkFDRUJPT0stUExBVEZPUk0nXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuaG9zdCA9ICdjaGF0LmZhY2Vib29rLmNvbSdcblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJydcbn1cblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmNoYWxsZW5nZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHMpXG5cbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaV9rZXksXG4gICAgICAgIGNhbGxfaWQ6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICBtZXRob2Q6IGRpY3QubWV0aG9kLFxuICAgICAgICBub25jZTogZGljdC5ub25jZSxcbiAgICAgICAgYWNjZXNzX3Rva2VuOiB0aGlzLmFjY2Vzc190b2tlbixcbiAgICAgICAgdjogJzEuMCdcbiAgICB9XG5cbiAgICByZXR1cm4gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHJlc3BvbnNlKVxufVxuXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgdmFyIGhvc3QgPSBYRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuaG9zdFxuICAgIGlmICgob3B0aW9ucy5ob3N0ID09PSBob3N0KSB8fFxuICAgICAgICAob3B0aW9ucy5qaWQgJiYgKG9wdGlvbnMuamlkLmdldERvbWFpbigpID09PSBob3N0KSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gWEZhY2Vib29rUGxhdGZvcm0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vdGFsay9qZXBfZXh0ZW5zaW9ucy9vYXV0aFxuICovXG4vKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG5mdW5jdGlvbiBYT0F1dGgyKCkge1xuICAgIHRoaXMub2F1dGgyX2F1dGggPSBudWxsXG4gICAgdGhpcy5hdXRoemlkID0gbnVsbFxufVxuXG51dGlsLmluaGVyaXRzKFhPQXV0aDIsIE1lY2hhbmlzbSlcblxuWE9BdXRoMi5wcm90b3R5cGUubmFtZSA9ICdYLU9BVVRIMidcblhPQXV0aDIucHJvdG90eXBlLk5TX0dPT0dMRV9BVVRIID0gJ2h0dHA6Ly93d3cuZ29vZ2xlLmNvbS90YWxrL3Byb3RvY29sL2F1dGgnXG5cblhPQXV0aDIucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJ1xcMCcgKyB0aGlzLmF1dGh6aWQgKyAnXFwwJyArIHRoaXMub2F1dGgyX3Rva2VuXG59XG5cblhPQXV0aDIucHJvdG90eXBlLmF1dGhBdHRycyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgICdhdXRoOnNlcnZpY2UnOiAnb2F1dGgyJyxcbiAgICAgICAgJ3htbG5zOmF1dGgnOiB0aGlzLm9hdXRoMl9hdXRoXG4gICAgfVxufVxuXG5YT0F1dGgyLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gKG9wdGlvbnMub2F1dGgyX2F1dGggPT09IFhPQXV0aDIucHJvdG90eXBlLk5TX0dPT0dMRV9BVVRIKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFhPQXV0aDJcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgcmVxdWVzdCA9IHJlcXVpcmUoJ3JlcXVlc3QnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG4gICwgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCd4bXBwOmNsaWVudDpib3NoJylcblxuZnVuY3Rpb24gQk9TSENvbm5lY3Rpb24ob3B0cykge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLmJvc2hVUkwgPSBvcHRzLmJvc2gudXJsXG4gICAgdGhpcy5qaWQgPSBvcHRzLmppZFxuICAgIHRoaXMud2FpdCA9IG9wdHMud2FpdDtcbiAgICB0aGlzLnhtbG5zQXR0cnMgPSB7XG4gICAgICAgIHhtbG5zOiAnaHR0cDovL2phYmJlci5vcmcvcHJvdG9jb2wvaHR0cGJpbmQnLFxuICAgICAgICAneG1sbnM6eG1wcCc6ICd1cm46eG1wcDp4Ym9zaCcsXG4gICAgICAgICd4bWxuczpzdHJlYW0nOiAnaHR0cDovL2V0aGVyeC5qYWJiZXIub3JnL3N0cmVhbXMnXG4gICAgfVxuICAgIGlmIChvcHRzLnhtbG5zKSB7XG4gICAgICAgIGZvciAodmFyIHByZWZpeCBpbiBvcHRzLnhtbG5zKSB7XG4gICAgICAgICAgICBpZiAocHJlZml4KSB7XG4gICAgICAgICAgICAgICAgdGhpcy54bWxuc0F0dHJzWyd4bWxuczonICsgcHJlZml4XSA9IG9wdHMueG1sbnNbcHJlZml4XVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aGlzLnhtbG5zQXR0cnMueG1sbnMgPSBvcHRzLnhtbG5zW3ByZWZpeF1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLmN1cnJlbnRSZXF1ZXN0cyA9IDBcbiAgICB0aGlzLnF1ZXVlID0gW11cbiAgICB0aGlzLnJpZCA9IE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogOTk5OTk5OTk5OSlcblxuICAgIHRoaXMucmVxdWVzdCh7XG4gICAgICAgICAgICB0bzogdGhpcy5qaWQuZG9tYWluLFxuICAgICAgICAgICAgdmVyOiAnMS42JyxcbiAgICAgICAgICAgIHdhaXQ6IHRoaXMud2FpdCxcbiAgICAgICAgICAgIGhvbGQ6ICcxJyxcbiAgICAgICAgICAgIGNvbnRlbnQ6IHRoaXMuY29udGVudFR5cGVcbiAgICAgICAgfSxcbiAgICAgICAgW10sXG4gICAgICAgIGZ1bmN0aW9uKGVyciwgYm9keUVsKSB7XG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgdGhhdC5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYm9keUVsICYmIGJvZHlFbC5hdHRycykge1xuICAgICAgICAgICAgICAgIHRoYXQuc2lkID0gYm9keUVsLmF0dHJzLnNpZFxuICAgICAgICAgICAgICAgIHRoYXQubWF4UmVxdWVzdHMgPSBwYXJzZUludChib2R5RWwuYXR0cnMucmVxdWVzdHMsIDEwKSB8fCAyXG4gICAgICAgICAgICAgICAgaWYgKHRoYXQuc2lkICYmICh0aGF0Lm1heFJlcXVlc3RzID4gMCkpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5lbWl0KCdjb25uZWN0JylcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5wcm9jZXNzUmVzcG9uc2UoYm9keUVsKVxuICAgICAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKHRoYXQubWF5UmVxdWVzdC5iaW5kKHRoYXQpKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHRoYXQuZW1pdCgnZXJyb3InLCAnSW52YWxpZCBwYXJhbWV0ZXJzJylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG59XG5cbnV0aWwuaW5oZXJpdHMoQk9TSENvbm5lY3Rpb24sIEV2ZW50RW1pdHRlcilcblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLmNvbnRlbnRUeXBlID0gJ3RleHQveG1sIGNoYXJzZXQ9dXRmLTgnXG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgdGhpcy5xdWV1ZS5wdXNoKHN0YW56YS5yb290KCkpXG4gICAgcHJvY2Vzcy5uZXh0VGljayh0aGlzLm1heVJlcXVlc3QuYmluZCh0aGlzKSlcbn1cblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLnByb2Nlc3NSZXNwb25zZSA9IGZ1bmN0aW9uKGJvZHlFbCkge1xuICAgIGRlYnVnKCdwcm9jZXNzIGJvc2ggc2VydmVyIHJlc3BvbnNlICcgKyBib2R5RWwudG9TdHJpbmcoKSlcbiAgICBpZiAoYm9keUVsICYmIGJvZHlFbC5jaGlsZHJlbikge1xuICAgICAgICBmb3IodmFyIGkgPSAwOyBpIDwgYm9keUVsLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgY2hpbGQgPSBib2R5RWwuY2hpbGRyZW5baV1cbiAgICAgICAgICAgIGlmIChjaGlsZC5uYW1lICYmIGNoaWxkLmF0dHJzICYmIGNoaWxkLmNoaWxkcmVuKVxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnc3RhbnphJywgY2hpbGQpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKGJvZHlFbCAmJiAoYm9keUVsLmF0dHJzLnR5cGUgPT09ICd0ZXJtaW5hdGUnKSkge1xuICAgICAgICBpZiAoIXRoaXMuc2h1dGRvd24gfHwgYm9keUVsLmF0dHJzLmNvbmRpdGlvbilcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLFxuICAgICAgICAgICAgICAgICAgICAgIG5ldyBFcnJvcihib2R5RWwuYXR0cnMuY29uZGl0aW9uIHx8ICdTZXNzaW9uIHRlcm1pbmF0ZWQnKSlcbiAgICAgICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JylcbiAgICAgICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICB9XG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5tYXlSZXF1ZXN0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGNhblJlcXVlc3QgPVxuICAgICAgICAvKiBNdXN0IGhhdmUgYSBzZXNzaW9uIGFscmVhZHkgKi9cbiAgICAgICAgdGhpcy5zaWQgJiZcbiAgICAgICAgLyogV2UgY2FuIG9ubHkgcmVjZWl2ZSB3aGVuIG9uZSByZXF1ZXN0IGlzIGluIGZsaWdodCAqL1xuICAgICAgICAoKHRoaXMuY3VycmVudFJlcXVlc3RzID09PSAwKSB8fFxuICAgICAgICAgLyogSXMgdGhlcmUgc29tZXRoaW5nIHRvIHNlbmQsIGFuZCBhcmUgd2UgYWxsb3dlZD8gKi9cbiAgICAgICAgICgoKHRoaXMucXVldWUubGVuZ3RoID4gMCkgJiYgKHRoaXMuY3VycmVudFJlcXVlc3RzIDwgdGhpcy5tYXhSZXF1ZXN0cykpKVxuICAgICAgICApXG5cbiAgICBpZiAoIWNhblJlcXVlc3QpIHJldHVyblxuXG4gICAgdmFyIHN0YW56YXMgPSB0aGlzLnF1ZXVlXG4gICAgdGhpcy5xdWV1ZSA9IFtdXG4gICAgdGhpcy5yaWQrK1xuICAgIHRoaXMucmVxdWVzdCh7fSwgc3RhbnphcywgZnVuY3Rpb24oZXJyLCBib2R5RWwpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5zaWRcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGJvZHlFbCkgdGhpcy5wcm9jZXNzUmVzcG9uc2UoYm9keUVsKVxuXG4gICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKHRoaXMubWF5UmVxdWVzdC5iaW5kKHRoaXMpKVxuICAgICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oc3Rhbnphcykge1xuICAgIHN0YW56YXMgPSBzdGFuemFzIHx8IFtdXG4gICAgaWYgKHR5cGVvZiBzdGFuemFzICE9PSBBcnJheSkgc3RhbnphcyA9IFtzdGFuemFzXVxuXG4gICAgc3RhbnphcyA9IHRoaXMucXVldWUuY29uY2F0KHN0YW56YXMpXG4gICAgdGhpcy5zaHV0ZG93biA9IHRydWVcbiAgICB0aGlzLnF1ZXVlID0gW11cbiAgICB0aGlzLnJpZCsrXG4gICAgdGhpcy5yZXF1ZXN0KHsgdHlwZTogJ3Rlcm1pbmF0ZScgfSwgc3RhbnphcywgZnVuY3Rpb24oZXJyLCBib2R5RWwpIHtcbiAgICAgICAgaWYgKGJvZHlFbCkgdGhpcy5wcm9jZXNzUmVzcG9uc2UoYm9keUVsKVxuXG4gICAgICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICAgICAgZGVsZXRlIHRoaXMuc2lkXG4gICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnKVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLm1heEhUVFBSZXRyaWVzID0gNVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUucmVxdWVzdCA9IGZ1bmN0aW9uKGF0dHJzLCBjaGlsZHJlbiwgY2IsIHJldHJ5KSB7XG4gICAgdmFyIHRoYXQgPSB0aGlzXG4gICAgcmV0cnkgPSByZXRyeSB8fCAwXG5cbiAgICBhdHRycy5yaWQgPSB0aGlzLnJpZC50b1N0cmluZygpXG4gICAgaWYgKHRoaXMuc2lkKSBhdHRycy5zaWQgPSB0aGlzLnNpZFxuXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLnhtbG5zQXR0cnMpIHtcbiAgICAgICAgYXR0cnNba10gPSB0aGlzLnhtbG5zQXR0cnNba11cbiAgICB9XG4gICAgdmFyIGJvc2hFbCA9IG5ldyBsdHguRWxlbWVudCgnYm9keScsIGF0dHJzKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgYm9zaEVsLmNub2RlKGNoaWxkcmVuW2ldKVxuICAgIH1cblxuICAgIHJlcXVlc3Qoe1xuICAgICAgICAgICAgdXJpOiB0aGlzLmJvc2hVUkwsXG4gICAgICAgICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgICAgICAgIGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6IHRoaXMuY29udGVudFR5cGUgfSxcbiAgICAgICAgICAgIGJvZHk6IGJvc2hFbC50b1N0cmluZygpXG4gICAgICAgIH0sXG4gICAgICAgIGZ1bmN0aW9uKGVyciwgcmVzLCBib2R5KSB7XG4gICAgICAgICAgICB0aGF0LmN1cnJlbnRSZXF1ZXN0cy0tXG5cbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICBpZiAocmV0cnkgPCB0aGF0Lm1heEhUVFBSZXRyaWVzKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0aGF0LnJlcXVlc3QoYXR0cnMsIGNoaWxkcmVuLCBjYiwgcmV0cnkgKyAxKVxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBjYihlcnIpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKChyZXMuc3RhdHVzQ29kZSA8IDIwMCkgfHwgKHJlcy5zdGF0dXNDb2RlID49IDQwMCkpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gY2IobmV3IEVycm9yKCdIVFRQIHN0YXR1cyAnICsgcmVzLnN0YXR1c0NvZGUpKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgYm9keUVsXG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGJvZHlFbCA9IGx0eC5wYXJzZShib2R5KVxuICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKGUpXG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmIChib2R5RWwgJiZcbiAgICAgICAgICAgICAgICAoYm9keUVsLmF0dHJzLnR5cGUgPT09ICd0ZXJtaW5hdGUnKSAmJlxuICAgICAgICAgICAgICAgIGJvZHlFbC5hdHRycy5jb25kaXRpb24pIHtcbiAgICAgICAgICAgICAgICBjYihuZXcgRXJyb3IoYm9keUVsLmF0dHJzLmNvbmRpdGlvbikpXG4gICAgICAgICAgICB9IGVsc2UgaWYgKGJvZHlFbCkge1xuICAgICAgICAgICAgICAgIGNiKG51bGwsIGJvZHlFbClcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY2IobmV3IEVycm9yKCdubyA8Ym9keS8+JykpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICApXG4gICAgdGhpcy5jdXJyZW50UmVxdWVzdHMrK1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEJPU0hDb25uZWN0aW9uXG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpKSIsIid1c2Ugc3RyaWN0JztcblxudmFyIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vYXV0aGVudGljYXRpb24vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBBdmFpbGFibGUgbWV0aG9kcyBmb3IgY2xpZW50LXNpZGUgYXV0aGVudGljYXRpb24gKENsaWVudClcbiAqIEBwYXJhbSAgQXJyYXkgb2ZmZXJlZE1lY2hzICBtZXRob2RzIG9mZmVyZWQgYnkgc2VydmVyXG4gKiBAcGFyYW0gIEFycmF5IHByZWZlcnJlZE1lY2ggcHJlZmVycmVkIG1ldGhvZHMgYnkgY2xpZW50XG4gKiBAcGFyYW0gIEFycmF5IGF2YWlsYWJsZU1lY2ggYXZhaWxhYmxlIG1ldGhvZHMgb24gY2xpZW50XG4gKi9cbmZ1bmN0aW9uIHNlbGVjdE1lY2hhbmlzbShvZmZlcmVkTWVjaHMsIHByZWZlcnJlZE1lY2gsIGF2YWlsYWJsZU1lY2gpIHtcbiAgICB2YXIgbWVjaENsYXNzZXMgPSBbXVxuICAgIHZhciBieU5hbWUgPSB7fVxuICAgIHZhciBNZWNoXG4gICAgaWYgKEFycmF5LmlzQXJyYXkoYXZhaWxhYmxlTWVjaCkpIHtcbiAgICAgICAgbWVjaENsYXNzZXMgPSBtZWNoQ2xhc3Nlcy5jb25jYXQoYXZhaWxhYmxlTWVjaClcbiAgICB9XG4gICAgbWVjaENsYXNzZXMuZm9yRWFjaChmdW5jdGlvbihtZWNoQ2xhc3MpIHtcbiAgICAgICAgYnlOYW1lW21lY2hDbGFzcy5wcm90b3R5cGUubmFtZV0gPSBtZWNoQ2xhc3NcbiAgICB9KVxuICAgIC8qIEFueSBwcmVmZXJyZWQ/ICovXG4gICAgaWYgKGJ5TmFtZVtwcmVmZXJyZWRNZWNoXSAmJlxuICAgICAgICAob2ZmZXJlZE1lY2hzLmluZGV4T2YocHJlZmVycmVkTWVjaCkgPj0gMCkpIHtcbiAgICAgICAgTWVjaCA9IGJ5TmFtZVtwcmVmZXJyZWRNZWNoXVxuICAgIH1cbiAgICAvKiBCeSBwcmlvcml0eSAqL1xuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIGlmICghTWVjaCAmJlxuICAgICAgICAgICAgKG9mZmVyZWRNZWNocy5pbmRleE9mKG1lY2hDbGFzcy5wcm90b3R5cGUubmFtZSkgPj0gMCkpXG4gICAgICAgICAgICBNZWNoID0gbWVjaENsYXNzXG4gICAgfSlcblxuICAgIHJldHVybiBNZWNoID8gbmV3IE1lY2goKSA6IG51bGxcbn1cblxuLyoqXG4gKiBXaWxsIGRldGVjdCB0aGUgYXZhaWxhYmxlIG1lY2hhbmlzbXMgYmFzZWQgb24gdGhlIGdpdmVuIG9wdGlvbnNcbiAqIEBwYXJhbSAge1t0eXBlXX0gb3B0aW9ucyBjbGllbnQgY29uZmlndXJhdGlvblxuICogQHBhcmFtICBBcnJheSBhdmFpbGFibGVNZWNoIGF2YWlsYWJsZSBtZXRob2RzIG9uIGNsaWVudFxuICogQHJldHVybiB7W3R5cGVdfSAgICAgICAgIGF2YWlsYWJsZSBvcHRpb25zXG4gKi9cbmZ1bmN0aW9uIGRldGVjdE1lY2hhbmlzbXMob3B0aW9ucywgYXZhaWxhYmxlTWVjaCkge1xuICAgIHZhciBtZWNoQ2xhc3NlcyA9IGF2YWlsYWJsZU1lY2ggPyBhdmFpbGFibGVNZWNoIDogW11cblxuICAgIHZhciBkZXRlY3QgPSBbXVxuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIHZhciBtYXRjaCA9IG1lY2hDbGFzcy5wcm90b3R5cGUubWF0Y2hcbiAgICAgICAgaWYgKG1hdGNoKG9wdGlvbnMpKSBkZXRlY3QucHVzaChtZWNoQ2xhc3MpXG4gICAgfSlcbiAgICByZXR1cm4gZGV0ZWN0XG59XG5cbmV4cG9ydHMuc2VsZWN0TWVjaGFuaXNtID0gc2VsZWN0TWVjaGFuaXNtXG5leHBvcnRzLmRldGVjdE1lY2hhbmlzbXMgPSBkZXRlY3RNZWNoYW5pc21zXG5leHBvcnRzLkFic3RyYWN0TWVjaGFuaXNtID0gTWVjaGFuaXNtXG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIHRscyA9IHJlcXVpcmUoJ3RscycpXG4gICwgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCBDb25uZWN0aW9uID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5Db25uZWN0aW9uXG4gICwgSklEID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5KSURcbiAgLCBTUlYgPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLlNSVlxuICAsIEJPU0hDb25uZWN0aW9uID0gcmVxdWlyZSgnLi9ib3NoJylcbiAgLCBXU0Nvbm5lY3Rpb24gPSByZXF1aXJlKCcuL3dlYnNvY2tldHMnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQ6c2Vzc2lvbicpXG5cbmZ1bmN0aW9uIFNlc3Npb24ob3B0cykge1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnNldE9wdGlvbnMob3B0cylcblxuICAgIGlmIChvcHRzLndlYnNvY2tldCAmJiBvcHRzLndlYnNvY2tldC51cmwpIHtcbiAgICAgICAgZGVidWcoJ3N0YXJ0IHdlYnNvY2tldCBjb25uZWN0aW9uJylcbiAgICAgICAgdGhpcy5fc2V0dXBXZWJzb2NrZXRDb25uZWN0aW9uKG9wdHMpXG4gICAgfSBlbHNlIGlmIChvcHRzLmJvc2ggJiYgb3B0cy5ib3NoLnVybCkge1xuICAgICAgICBkZWJ1Zygnc3RhcnQgYm9zaCBjb25uZWN0aW9uJylcbiAgICAgICAgdGhpcy5fc2V0dXBCb3NoQ29ubmVjdGlvbihvcHRzKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGRlYnVnKCdzdGFydCBzb2NrZXQgY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwU29ja2V0Q29ubmVjdGlvbihvcHRzKVxuICAgIH1cbn1cblxudXRpbC5pbmhlcml0cyhTZXNzaW9uLCBFdmVudEVtaXR0ZXIpXG5cblNlc3Npb24ucHJvdG90eXBlLl9zZXR1cFNvY2tldENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdmFyIHBhcmFtcyA9IHtcbiAgICAgICAgeG1sbnM6IHsgJyc6IG9wdHMueG1sbnMgfSxcbiAgICAgICAgc3RyZWFtQXR0cnM6IHtcbiAgICAgICAgICAgIHZlcnNpb246ICcxLjAnLFxuICAgICAgICAgICAgdG86IHRoaXMuamlkLmRvbWFpblxuICAgICAgICB9LFxuICAgICAgICBzZXJpYWxpemVkOiBvcHRzLnNlcmlhbGl6ZWRcbiAgICB9XG4gICAgZm9yICh2YXIgIGtleSBpbiBvcHRzKVxuICAgICAgICBpZiAoIShrZXkgaW4gcGFyYW1zKSlcbiAgICAgICAgICAgIHBhcmFtc1trZXldID0gb3B0c1trZXldXG5cbiAgICB0aGlzLmNvbm5lY3Rpb24gPSBuZXcgQ29ubmVjdGlvbihwYXJhbXMpXG4gICAgdGhpcy5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycygpXG5cbiAgICBpZiAob3B0cy5ob3N0KSB7XG4gICAgICAgIHRoaXMuX3NvY2tldENvbm5lY3Rpb25Ub0hvc3Qob3B0cylcbiAgICB9IGVsc2UgaWYgKCFTUlYpIHtcbiAgICAgICAgdGhyb3cgJ0Nhbm5vdCBsb2FkIFNSVidcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9wZXJmb3JtU3J2TG9va3VwKG9wdHMpXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc29ja2V0Q29ubmVjdGlvblRvSG9zdCA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZiAob3B0cy5sZWdhY3lTU0wpIHtcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmNvbm5lY3Qoe1xuICAgICAgICAgICAgc29ja2V0OmZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGxzLmNvbm5lY3QoXG4gICAgICAgICAgICAgICAgICAgIG9wdHMucG9ydCB8fCA1MjIzLFxuICAgICAgICAgICAgICAgICAgICBvcHRzLmhvc3QsXG4gICAgICAgICAgICAgICAgICAgIG9wdHMuY3JlZGVudGlhbHMgfHwge30sXG4gICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHRoaXMuc29ja2V0LmF1dGhvcml6ZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdjb25uZWN0JywgdGhpcy5zb2NrZXQpXG4gICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsICd1bmF1dGhvcml6ZWQnKVxuICAgICAgICAgICAgICAgICAgICB9LmJpbmQodGhpcylcbiAgICAgICAgICAgICAgICApXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKG9wdHMuY3JlZGVudGlhbHMpIHtcbiAgICAgICAgICAgIHRoaXMuY29ubmVjdGlvbi5jcmVkZW50aWFscyA9IGNyeXB0b1xuICAgICAgICAgICAgICAgIC5jcmVhdGVDcmVkZW50aWFscyhvcHRzLmNyZWRlbnRpYWxzKVxuICAgICAgICB9XG4gICAgICAgIGlmIChvcHRzLmRpc2FsbG93VExTKSB0aGlzLmNvbm5lY3Rpb24uYWxsb3dUTFMgPSBmYWxzZVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ubGlzdGVuKHtcbiAgICAgICAgICAgIHNvY2tldDpmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgLy8gd2FpdCBmb3IgY29ubmVjdCBldmVudCBsaXN0ZW5lcnNcbiAgICAgICAgICAgICAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5zb2NrZXQuY29ubmVjdChvcHRzLnBvcnQgfHwgNTIyMiwgb3B0cy5ob3N0KVxuICAgICAgICAgICAgICAgIH0uYmluZCh0aGlzKSlcbiAgICAgICAgICAgICAgICB2YXIgc29ja2V0ID0gb3B0cy5zb2NrZXRcbiAgICAgICAgICAgICAgICBvcHRzLnNvY2tldCA9IG51bGxcbiAgICAgICAgICAgICAgICByZXR1cm4gc29ja2V0IC8vIG1heWJlIGNyZWF0ZSBuZXcgc29ja2V0XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fcGVyZm9ybVNydkxvb2t1cCA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZiAob3B0cy5sZWdhY3lTU0wpIHtcbiAgICAgICAgdGhyb3cgJ0xlZ2FjeVNTTCBtb2RlIGRvZXMgbm90IHN1cHBvcnQgRE5TIGxvb2t1cHMnXG4gICAgfVxuICAgIGlmIChvcHRzLmNyZWRlbnRpYWxzKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24uY3JlZGVudGlhbHMgPSBjcnlwdG8uY3JlYXRlQ3JlZGVudGlhbHMob3B0cy5jcmVkZW50aWFscylcbiAgICBpZiAob3B0cy5kaXNhbGxvd1RMUylcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICB0aGlzLmNvbm5lY3Rpb24ubGlzdGVuKHtzb2NrZXQ6U1JWLmNvbm5lY3Qoe1xuICAgICAgICBzb2NrZXQ6ICAgICAgb3B0cy5zb2NrZXQsXG4gICAgICAgIHNlcnZpY2VzOiAgICBbJ194bXBwLWNsaWVudC5fdGNwJ10sXG4gICAgICAgIGRvbWFpbjogICAgICB0aGlzLmppZC5kb21haW4sXG4gICAgICAgIGRlZmF1bHRQb3J0OiA1MjIyXG4gICAgfSl9KVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc2V0dXBCb3NoQ29ubmVjdGlvbiA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICB0aGlzLmNvbm5lY3Rpb24gPSBuZXcgQk9TSENvbm5lY3Rpb24oe1xuICAgICAgICBqaWQ6IHRoaXMuamlkLFxuICAgICAgICBib3NoOiBvcHRzLmJvc2gsXG4gICAgICAgIHdhaXQ6IHRoaXMud2FpdFxuICAgIH0pXG4gICAgdGhpcy5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycygpXG59XG5cblNlc3Npb24ucHJvdG90eXBlLl9zZXR1cFdlYnNvY2tldENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IFdTQ29ubmVjdGlvbih7XG4gICAgICAgIGppZDogdGhpcy5qaWQsXG4gICAgICAgIHdlYnNvY2tldDogb3B0cy53ZWJzb2NrZXRcbiAgICB9KVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxuICAgIHRoaXMuY29ubmVjdGlvbi5vbignY29ubmVjdGVkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIENsaWVudHMgc3RhcnQgPHN0cmVhbTpzdHJlYW0+LCBzZXJ2ZXJzIHJlcGx5XG4gICAgICAgIGlmICh0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0pXG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0oKVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuc2V0T3B0aW9ucyA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHRoaXMuamlkID0gKHR5cGVvZiBvcHRzLmppZCA9PT0gJ3N0cmluZycpID8gbmV3IEpJRChvcHRzLmppZCkgOiBvcHRzLmppZFxuICAgIHRoaXMucGFzc3dvcmQgPSBvcHRzLnBhc3N3b3JkXG4gICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtID0gb3B0cy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtXG4gICAgdGhpcy5hcGlfa2V5ID0gb3B0cy5hcGlfa2V5XG4gICAgdGhpcy5hY2Nlc3NfdG9rZW4gPSBvcHRzLmFjY2Vzc190b2tlblxuICAgIHRoaXMub2F1dGgyX3Rva2VuID0gb3B0cy5vYXV0aDJfdG9rZW5cbiAgICB0aGlzLm9hdXRoMl9hdXRoID0gb3B0cy5vYXV0aDJfYXV0aFxuICAgIHRoaXMucmVnaXN0ZXIgPSBvcHRzLnJlZ2lzdGVyXG4gICAgdGhpcy53YWl0ID0gb3B0cy53YWl0IHx8ICcxMCdcbiAgICBpZiAodHlwZW9mIG9wdHMuYWN0QXMgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHRoaXMuYWN0QXMgPSBuZXcgSklEKG9wdHMuYWN0QXMpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5hY3RBcyA9IG9wdHMuYWN0QXNcbiAgICB9XG59XG5cblNlc3Npb24ucHJvdG90eXBlLl9hZGRDb25uZWN0aW9uTGlzdGVuZXJzID0gZnVuY3Rpb24gKGNvbikge1xuICAgIGNvbiA9IGNvbiB8fCB0aGlzLmNvbm5lY3Rpb25cbiAgICBjb24ub24oJ3N0YW56YScsIHRoaXMub25TdGFuemEuYmluZCh0aGlzKSlcbiAgICBjb24ub24oJ2RyYWluJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2RyYWluJykpXG4gICAgY29uLm9uKCdlbmQnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZW5kJykpXG4gICAgY29uLm9uKCdjbG9zZScsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdjbG9zZScpKVxuICAgIGNvbi5vbignZXJyb3InLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZXJyb3InKSlcbiAgICBjb24ub24oJ2Nvbm5lY3QnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnY29ubmVjdCcpKVxuICAgIGNvbi5vbigncmVjb25uZWN0JywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ3JlY29ubmVjdCcpKVxuICAgIGNvbi5vbignZGlzY29ubmVjdCcsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkaXNjb25uZWN0JykpXG4gICAgaWYgKGNvbi5zdGFydFN0cmVhbSkge1xuICAgICAgICBjb24ub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAvLyBDbGllbnRzIHN0YXJ0IDxzdHJlYW06c3RyZWFtPiwgc2VydmVycyByZXBseVxuICAgICAgICAgICAgY29uLnN0YXJ0U3RyZWFtKClcbiAgICAgICAgfSlcbiAgICAgICAgdGhpcy5vbignYXV0aCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGNvbi5zdGFydFN0cmVhbSgpXG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmNvbm5lY3Rpb24gJiYgdGhpcy5jb25uZWN0aW9uLnBhdXNlKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ucGF1c2UoKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uICYmIHRoaXMuY29ubmVjdGlvbi5yZXN1bWUpXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5yZXN1bWUoKVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgcmV0dXJuIHRoaXMuY29ubmVjdGlvbiA/IHRoaXMuY29ubmVjdGlvbi5zZW5kKHN0YW56YSkgOiBmYWxzZVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24uZW5kKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbigpIHt9XG5cbm1vZHVsZS5leHBvcnRzID0gU2Vzc2lvblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5sdHhcbiAgLCBTdHJlYW1QYXJzZXIgPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLlN0cmVhbVBhcnNlclxuICAsIFdlYlNvY2tldCA9IHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykgJiYgcmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKS5DbGllbnQgP1xuICAgICAgcmVxdWlyZSgnZmF5ZS13ZWJzb2NrZXQnKS5DbGllbnQgOiB3aW5kb3cuV2ViU29ja2V0XG4gICwgQ29ubmVjdGlvbiA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuQ29ubmVjdGlvblxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQ6d2Vic29ja2V0cycpXG5cbmZ1bmN0aW9uIFdTQ29ubmVjdGlvbihvcHRzKSB7XG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMudXJsID0gb3B0cy53ZWJzb2NrZXQudXJsXG4gICAgdGhpcy5qaWQgPSBvcHRzLmppZFxuICAgIHRoaXMueG1sbnMgPSB7fVxuICAgIHRoaXMud2Vic29ja2V0ID0gbmV3IFdlYlNvY2tldCh0aGlzLnVybCwgWyd4bXBwJ10pXG4gICAgdGhpcy53ZWJzb2NrZXQub25vcGVuID0gdGhpcy5vbm9wZW4uYmluZCh0aGlzKVxuICAgIHRoaXMud2Vic29ja2V0Lm9ubWVzc2FnZSA9IHRoaXMub25tZXNzYWdlLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbmNsb3NlID0gdGhpcy5vbmNsb3NlLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbmVycm9yID0gdGhpcy5vbmVycm9yLmJpbmQodGhpcylcbn1cblxudXRpbC5pbmhlcml0cyhXU0Nvbm5lY3Rpb24sIEV2ZW50RW1pdHRlcilcblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5tYXhTdGFuemFTaXplID0gNjU1MzVcbldTQ29ubmVjdGlvbi5wcm90b3R5cGUueG1wcFZlcnNpb24gPSAnMS4wJ1xuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9ub3BlbiA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3RhcnRQYXJzZXIoKVxuICAgIHRoaXMuZW1pdCgnY29ubmVjdGVkJylcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IFN0cmVhbVBhcnNlci5TdHJlYW1QYXJzZXIodGhpcy5tYXhTdGFuemFTaXplKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YXJ0JywgZnVuY3Rpb24oYXR0cnMpIHtcbiAgICAgICAgc2VsZi5zdHJlYW1BdHRycyA9IGF0dHJzXG4gICAgICAgIC8qIFdlIG5lZWQgdGhvc2UgeG1sbnMgb2Z0ZW4sIHN0b3JlIHRoZW0gZXh0cmEgKi9cbiAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzID0ge31cbiAgICAgICAgZm9yICh2YXIgayBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKChrID09PSAneG1sbnMnKSB8fFxuICAgICAgICAgICAgICAgIChrLnN1YnN0cigwLCA2KSA9PT0gJ3htbG5zOicpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzW2tdID0gYXR0cnNba11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8qIE5vdGlmeSBpbiBjYXNlIHdlIGRvbid0IHdhaXQgZm9yIDxzdHJlYW06ZmVhdHVyZXMvPlxuICAgICAgICAgICAoQ29tcG9uZW50IG9yIG5vbi0xLjAgc3RyZWFtcylcbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZW1pdCgnc3RyZWFtU3RhcnQnLCBhdHRycylcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFuemEnLCBmdW5jdGlvbihzdGFuemEpIHtcbiAgICAgICAgLy9zZWxmLm9uU3RhbnphKHNlbGYuYWRkU3RyZWFtTnMoc3RhbnphKSlcbiAgICAgICAgc2VsZi5vblN0YW56YShzdGFuemEpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCB0aGlzLm9uZXJyb3IuYmluZCh0aGlzKSlcbiAgICB0aGlzLnBhcnNlci5vbignZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuc3RvcFBhcnNlcigpXG4gICAgICAgIHNlbGYuZW5kKClcbiAgICB9KVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnN0b3BQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICAvKiBObyBtb3JlIGV2ZW50cywgcGxlYXNlIChtYXkgaGFwcGVuIGhvd2V2ZXIpICovXG4gICAgaWYgKHRoaXMucGFyc2VyKSB7XG4gICAgICAgIC8qIEdldCBHQydlZCAqL1xuICAgICAgICBkZWxldGUgdGhpcy5wYXJzZXJcbiAgICB9XG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25tZXNzYWdlID0gZnVuY3Rpb24obXNnKSB7XG4gICAgZGVidWcoJ3dzIG1zZyA8LS0nLCBtc2cuZGF0YSlcbiAgICBpZiAobXNnICYmIG1zZy5kYXRhICYmIHRoaXMucGFyc2VyKVxuICAgICAgICB0aGlzLnBhcnNlci53cml0ZShtc2cuZGF0YSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vblN0YW56YSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuaXMoJ2Vycm9yJywgQ29ubmVjdGlvbi5OU19TVFJFQU0pKSB7XG4gICAgICAgIC8qIFRPRE86IGV4dHJhY3QgZXJyb3IgdGV4dCAqL1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgc3RhbnphKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnc3RhbnphJywgc3RhbnphKVxuICAgIH1cbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhdHRycyA9IHt9XG4gICAgZm9yKHZhciBrIGluIHRoaXMueG1sbnMpIHtcbiAgICAgICAgaWYgKHRoaXMueG1sbnMuaGFzT3duUHJvcGVydHkoaykpIHtcbiAgICAgICAgICAgIGlmICghaykge1xuICAgICAgICAgICAgICAgIGF0dHJzLnhtbG5zID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBhdHRyc1sneG1sbnM6JyArIGtdID0gdGhpcy54bWxuc1trXVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh0aGlzLnhtcHBWZXJzaW9uKVxuICAgICAgICBhdHRycy52ZXJzaW9uID0gdGhpcy54bXBwVmVyc2lvblxuICAgIGlmICh0aGlzLnN0cmVhbVRvKVxuICAgICAgICBhdHRycy50byA9IHRoaXMuc3RyZWFtVG9cbiAgICBpZiAodGhpcy5zdHJlYW1JZClcbiAgICAgICAgYXR0cnMuaWQgPSB0aGlzLnN0cmVhbUlkXG4gICAgaWYgKHRoaXMuamlkKVxuICAgICAgICBhdHRycy50byA9IHRoaXMuamlkLmRvbWFpblxuICAgIGF0dHJzLnhtbG5zID0gJ2phYmJlcjpjbGllbnQnXG4gICAgYXR0cnNbJ3htbG5zOnN0cmVhbSddID0gQ29ubmVjdGlvbi5OU19TVFJFQU1cblxuICAgIHZhciBlbCA9IG5ldyBsdHguRWxlbWVudCgnc3RyZWFtOnN0cmVhbScsIGF0dHJzKVxuICAgIC8vIG1ha2UgaXQgbm9uLWVtcHR5IHRvIGN1dCB0aGUgY2xvc2luZyB0YWdcbiAgICBlbC50KCcgJylcbiAgICB2YXIgcyA9IGVsLnRvU3RyaW5nKClcbiAgICB0aGlzLnNlbmQocy5zdWJzdHIoMCwgcy5pbmRleE9mKCcgPC9zdHJlYW06c3RyZWFtPicpKSlcblxuICAgIHRoaXMuc3RyZWFtT3BlbmVkID0gdHJ1ZVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLnJvb3QpIHN0YW56YSA9IHN0YW56YS5yb290KClcbiAgICBzdGFuemEgPSBzdGFuemEudG9TdHJpbmcoKVxuICAgIGRlYnVnKCd3cyBzZW5kIC0tPicsIHN0YW56YSlcbiAgICB0aGlzLndlYnNvY2tldC5zZW5kKHN0YW56YSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbmNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JylcbiAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnNlbmQoJzwvc3RyZWFtOnN0cmVhbT4nKVxuICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgIGlmICh0aGlzLndlYnNvY2tldClcbiAgICAgICAgdGhpcy53ZWJzb2NrZXQuY2xvc2UoKVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9uZXJyb3IgPSBmdW5jdGlvbihlKSB7XG4gICAgdGhpcy5lbWl0KCdlcnJvcicsIGUpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gV1NDb25uZWN0aW9uXG4iLCIvLyBCcm93c2VyIFJlcXVlc3Rcbi8vXG4vLyBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuLy8geW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuLy8gWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG4vL1xuLy8gICAgIGh0dHA6Ly93d3cuYXBhY2hlLm9yZy9saWNlbnNlcy9MSUNFTlNFLTIuMFxuLy9cbi8vIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbi8vIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbi8vIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuLy8gU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuLy8gbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG5cbi8vIFVNRCBIRUFERVIgU1RBUlQgXG4oZnVuY3Rpb24gKHJvb3QsIGZhY3RvcnkpIHtcbiAgICBpZiAodHlwZW9mIGRlZmluZSA9PT0gJ2Z1bmN0aW9uJyAmJiBkZWZpbmUuYW1kKSB7XG4gICAgICAgIC8vIEFNRC4gUmVnaXN0ZXIgYXMgYW4gYW5vbnltb3VzIG1vZHVsZS5cbiAgICAgICAgZGVmaW5lKFtdLCBmYWN0b3J5KTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiBleHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgICAgICAvLyBOb2RlLiBEb2VzIG5vdCB3b3JrIHdpdGggc3RyaWN0IENvbW1vbkpTLCBidXRcbiAgICAgICAgLy8gb25seSBDb21tb25KUy1saWtlIGVudmlyb21lbnRzIHRoYXQgc3VwcG9ydCBtb2R1bGUuZXhwb3J0cyxcbiAgICAgICAgLy8gbGlrZSBOb2RlLlxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IGZhY3RvcnkoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICAvLyBCcm93c2VyIGdsb2JhbHMgKHJvb3QgaXMgd2luZG93KVxuICAgICAgICByb290LnJldHVybkV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gIH1cbn0odGhpcywgZnVuY3Rpb24gKCkge1xuLy8gVU1EIEhFQURFUiBFTkRcblxudmFyIFhIUiA9IFhNTEh0dHBSZXF1ZXN0XG5pZiAoIVhIUikgdGhyb3cgbmV3IEVycm9yKCdtaXNzaW5nIFhNTEh0dHBSZXF1ZXN0JylcbnJlcXVlc3QubG9nID0ge1xuICAndHJhY2UnOiBub29wLCAnZGVidWcnOiBub29wLCAnaW5mbyc6IG5vb3AsICd3YXJuJzogbm9vcCwgJ2Vycm9yJzogbm9vcFxufVxuXG52YXIgREVGQVVMVF9USU1FT1VUID0gMyAqIDYwICogMTAwMCAvLyAzIG1pbnV0ZXNcblxuLy9cbi8vIHJlcXVlc3Rcbi8vXG5cbmZ1bmN0aW9uIHJlcXVlc3Qob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgLy8gVGhlIGVudHJ5LXBvaW50IHRvIHRoZSBBUEk6IHByZXAgdGhlIG9wdGlvbnMgb2JqZWN0IGFuZCBwYXNzIHRoZSByZWFsIHdvcmsgdG8gcnVuX3hoci5cbiAgaWYodHlwZW9mIGNhbGxiYWNrICE9PSAnZnVuY3Rpb24nKVxuICAgIHRocm93IG5ldyBFcnJvcignQmFkIGNhbGxiYWNrIGdpdmVuOiAnICsgY2FsbGJhY2spXG5cbiAgaWYoIW9wdGlvbnMpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdObyBvcHRpb25zIGdpdmVuJylcblxuICB2YXIgb3B0aW9uc19vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlOyAvLyBTYXZlIHRoaXMgZm9yIGxhdGVyLlxuXG4gIGlmKHR5cGVvZiBvcHRpb25zID09PSAnc3RyaW5nJylcbiAgICBvcHRpb25zID0geyd1cmknOm9wdGlvbnN9O1xuICBlbHNlXG4gICAgb3B0aW9ucyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkob3B0aW9ucykpOyAvLyBVc2UgYSBkdXBsaWNhdGUgZm9yIG11dGF0aW5nLlxuXG4gIG9wdGlvbnMub25SZXNwb25zZSA9IG9wdGlvbnNfb25SZXNwb25zZSAvLyBBbmQgcHV0IGl0IGJhY2suXG5cbiAgaWYgKG9wdGlvbnMudmVyYm9zZSkgcmVxdWVzdC5sb2cgPSBnZXRMb2dnZXIoKTtcblxuICBpZihvcHRpb25zLnVybCkge1xuICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmw7XG4gICAgZGVsZXRlIG9wdGlvbnMudXJsO1xuICB9XG5cbiAgaWYoIW9wdGlvbnMudXJpICYmIG9wdGlvbnMudXJpICE9PSBcIlwiKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIGlzIGEgcmVxdWlyZWQgYXJndW1lbnRcIik7XG5cbiAgaWYodHlwZW9mIG9wdGlvbnMudXJpICE9IFwic3RyaW5nXCIpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy51cmkgbXVzdCBiZSBhIHN0cmluZ1wiKTtcblxuICB2YXIgdW5zdXBwb3J0ZWRfb3B0aW9ucyA9IFsncHJveHknLCAnX3JlZGlyZWN0c0ZvbGxvd2VkJywgJ21heFJlZGlyZWN0cycsICdmb2xsb3dSZWRpcmVjdCddXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdW5zdXBwb3J0ZWRfb3B0aW9ucy5sZW5ndGg7IGkrKylcbiAgICBpZihvcHRpb25zWyB1bnN1cHBvcnRlZF9vcHRpb25zW2ldIF0pXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLlwiICsgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSArIFwiIGlzIG5vdCBzdXBwb3J0ZWRcIilcblxuICBvcHRpb25zLmNhbGxiYWNrID0gY2FsbGJhY2tcbiAgb3B0aW9ucy5tZXRob2QgPSBvcHRpb25zLm1ldGhvZCB8fCAnR0VUJztcbiAgb3B0aW9ucy5oZWFkZXJzID0gb3B0aW9ucy5oZWFkZXJzIHx8IHt9O1xuICBvcHRpb25zLmJvZHkgICAgPSBvcHRpb25zLmJvZHkgfHwgbnVsbFxuICBvcHRpb25zLnRpbWVvdXQgPSBvcHRpb25zLnRpbWVvdXQgfHwgcmVxdWVzdC5ERUZBVUxUX1RJTUVPVVRcblxuICBpZihvcHRpb25zLmhlYWRlcnMuaG9zdClcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJPcHRpb25zLmhlYWRlcnMuaG9zdCBpcyBub3Qgc3VwcG9ydGVkXCIpO1xuXG4gIGlmKG9wdGlvbnMuanNvbikge1xuICAgIG9wdGlvbnMuaGVhZGVycy5hY2NlcHQgPSBvcHRpb25zLmhlYWRlcnMuYWNjZXB0IHx8ICdhcHBsaWNhdGlvbi9qc29uJ1xuICAgIGlmKG9wdGlvbnMubWV0aG9kICE9PSAnR0VUJylcbiAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSAnYXBwbGljYXRpb24vanNvbidcblxuICAgIGlmKHR5cGVvZiBvcHRpb25zLmpzb24gIT09ICdib29sZWFuJylcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuanNvbilcbiAgICBlbHNlIGlmKHR5cGVvZiBvcHRpb25zLmJvZHkgIT09ICdzdHJpbmcnKVxuICAgICAgb3B0aW9ucy5ib2R5ID0gSlNPTi5zdHJpbmdpZnkob3B0aW9ucy5ib2R5KVxuICB9XG4gIFxuICAvL0JFR0lOIFFTIEhhY2tcbiAgdmFyIHNlcmlhbGl6ZSA9IGZ1bmN0aW9uKG9iaikge1xuICAgIHZhciBzdHIgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKVxuICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICBzdHIucHVzaChlbmNvZGVVUklDb21wb25lbnQocCkgKyBcIj1cIiArIGVuY29kZVVSSUNvbXBvbmVudChvYmpbcF0pKTtcbiAgICAgIH1cbiAgICByZXR1cm4gc3RyLmpvaW4oXCImXCIpO1xuICB9XG4gIFxuICBpZihvcHRpb25zLnFzKXtcbiAgICB2YXIgcXMgPSAodHlwZW9mIG9wdGlvbnMucXMgPT0gJ3N0cmluZycpPyBvcHRpb25zLnFzIDogc2VyaWFsaXplKG9wdGlvbnMucXMpO1xuICAgIGlmKG9wdGlvbnMudXJpLmluZGV4T2YoJz8nKSAhPT0gLTEpeyAvL25vIGdldCBwYXJhbXNcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnJicrcXM7XG4gICAgfWVsc2V7IC8vZXhpc3RpbmcgZ2V0IHBhcmFtc1xuICAgICAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJpKyc/JytxcztcbiAgICB9XG4gIH1cbiAgLy9FTkQgUVMgSGFja1xuICBcbiAgLy9CRUdJTiBGT1JNIEhhY2tcbiAgdmFyIG11bHRpcGFydCA9IGZ1bmN0aW9uKG9iaikge1xuICAgIC8vdG9kbzogc3VwcG9ydCBmaWxlIHR5cGUgKHVzZWZ1bD8pXG4gICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgIHJlc3VsdC5ib3VuZHJ5ID0gJy0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0nK01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSoxMDAwMDAwMDAwKTtcbiAgICB2YXIgbGluZXMgPSBbXTtcbiAgICBmb3IodmFyIHAgaW4gb2JqKXtcbiAgICAgICAgaWYgKG9iai5oYXNPd25Qcm9wZXJ0eShwKSkge1xuICAgICAgICAgICAgbGluZXMucHVzaChcbiAgICAgICAgICAgICAgICAnLS0nK3Jlc3VsdC5ib3VuZHJ5K1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgJ0NvbnRlbnQtRGlzcG9zaXRpb246IGZvcm0tZGF0YTsgbmFtZT1cIicrcCsnXCInK1wiXFxuXCIrXG4gICAgICAgICAgICAgICAgXCJcXG5cIitcbiAgICAgICAgICAgICAgICBvYmpbcF0rXCJcXG5cIlxuICAgICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICBsaW5lcy5wdXNoKCAnLS0nK3Jlc3VsdC5ib3VuZHJ5KyctLScgKTtcbiAgICByZXN1bHQuYm9keSA9IGxpbmVzLmpvaW4oJycpO1xuICAgIHJlc3VsdC5sZW5ndGggPSByZXN1bHQuYm9keS5sZW5ndGg7XG4gICAgcmVzdWx0LnR5cGUgPSAnbXVsdGlwYXJ0L2Zvcm0tZGF0YTsgYm91bmRhcnk9JytyZXN1bHQuYm91bmRyeTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9XG4gIFxuICBpZihvcHRpb25zLmZvcm0pe1xuICAgIGlmKHR5cGVvZiBvcHRpb25zLmZvcm0gPT0gJ3N0cmluZycpIHRocm93KCdmb3JtIG5hbWUgdW5zdXBwb3J0ZWQnKTtcbiAgICBpZihvcHRpb25zLm1ldGhvZCA9PT0gJ1BPU1QnKXtcbiAgICAgICAgdmFyIGVuY29kaW5nID0gKG9wdGlvbnMuZW5jb2RpbmcgfHwgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCcpLnRvTG93ZXJDYXNlKCk7XG4gICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBlbmNvZGluZztcbiAgICAgICAgc3dpdGNoKGVuY29kaW5nKXtcbiAgICAgICAgICAgIGNhc2UgJ2FwcGxpY2F0aW9uL3gtd3d3LWZvcm0tdXJsZW5jb2RlZCc6XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5ib2R5ID0gc2VyaWFsaXplKG9wdGlvbnMuZm9ybSkucmVwbGFjZSgvJTIwL2csIFwiK1wiKTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgJ211bHRpcGFydC9mb3JtLWRhdGEnOlxuICAgICAgICAgICAgICAgIHZhciBtdWx0aSA9IG11bHRpcGFydChvcHRpb25zLmZvcm0pO1xuICAgICAgICAgICAgICAgIC8vb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gbXVsdGkubGVuZ3RoO1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IG11bHRpLmJvZHk7XG4gICAgICAgICAgICAgICAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LXR5cGUnXSA9IG11bHRpLnR5cGU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBkZWZhdWx0IDogdGhyb3cgbmV3IEVycm9yKCd1bnN1cHBvcnRlZCBlbmNvZGluZzonK2VuY29kaW5nKTtcbiAgICAgICAgfVxuICAgIH1cbiAgfVxuICAvL0VORCBGT1JNIEhhY2tcblxuICAvLyBJZiBvblJlc3BvbnNlIGlzIGJvb2xlYW4gdHJ1ZSwgY2FsbCBiYWNrIGltbWVkaWF0ZWx5IHdoZW4gdGhlIHJlc3BvbnNlIGlzIGtub3duLFxuICAvLyBub3Qgd2hlbiB0aGUgZnVsbCByZXF1ZXN0IGlzIGNvbXBsZXRlLlxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zLm9uUmVzcG9uc2UgfHwgbm9vcFxuICBpZihvcHRpb25zLm9uUmVzcG9uc2UgPT09IHRydWUpIHtcbiAgICBvcHRpb25zLm9uUmVzcG9uc2UgPSBjYWxsYmFja1xuICAgIG9wdGlvbnMuY2FsbGJhY2sgPSBub29wXG4gIH1cblxuICAvLyBYWFggQnJvd3NlcnMgZG8gbm90IGxpa2UgdGhpcy5cbiAgLy9pZihvcHRpb25zLmJvZHkpXG4gIC8vICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtbGVuZ3RoJ10gPSBvcHRpb25zLmJvZHkubGVuZ3RoO1xuXG4gIC8vIEhUVFAgYmFzaWMgYXV0aGVudGljYXRpb25cbiAgaWYoIW9wdGlvbnMuaGVhZGVycy5hdXRob3JpemF0aW9uICYmIG9wdGlvbnMuYXV0aClcbiAgICBvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9ICdCYXNpYyAnICsgYjY0X2VuYyhvcHRpb25zLmF1dGgudXNlcm5hbWUgKyAnOicgKyBvcHRpb25zLmF1dGgucGFzc3dvcmQpO1xuXG4gIHJldHVybiBydW5feGhyKG9wdGlvbnMpXG59XG5cbnZhciByZXFfc2VxID0gMFxuZnVuY3Rpb24gcnVuX3hocihvcHRpb25zKSB7XG4gIHZhciB4aHIgPSBuZXcgWEhSXG4gICAgLCB0aW1lZF9vdXQgPSBmYWxzZVxuICAgICwgaXNfY29ycyA9IGlzX2Nyb3NzRG9tYWluKG9wdGlvbnMudXJpKVxuICAgICwgc3VwcG9ydHNfY29ycyA9ICgnd2l0aENyZWRlbnRpYWxzJyBpbiB4aHIpXG5cbiAgcmVxX3NlcSArPSAxXG4gIHhoci5zZXFfaWQgPSByZXFfc2VxXG4gIHhoci5pZCA9IHJlcV9zZXEgKyAnOiAnICsgb3B0aW9ucy5tZXRob2QgKyAnICcgKyBvcHRpb25zLnVyaVxuICB4aHIuX2lkID0geGhyLmlkIC8vIEkga25vdyBJIHdpbGwgdHlwZSBcIl9pZFwiIGZyb20gaGFiaXQgYWxsIHRoZSB0aW1lLlxuXG4gIGlmKGlzX2NvcnMgJiYgIXN1cHBvcnRzX2NvcnMpIHtcbiAgICB2YXIgY29yc19lcnIgPSBuZXcgRXJyb3IoJ0Jyb3dzZXIgZG9lcyBub3Qgc3VwcG9ydCBjcm9zcy1vcmlnaW4gcmVxdWVzdDogJyArIG9wdGlvbnMudXJpKVxuICAgIGNvcnNfZXJyLmNvcnMgPSAndW5zdXBwb3J0ZWQnXG4gICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcbiAgfVxuXG4gIHhoci50aW1lb3V0VGltZXIgPSBzZXRUaW1lb3V0KHRvb19sYXRlLCBvcHRpb25zLnRpbWVvdXQpXG4gIGZ1bmN0aW9uIHRvb19sYXRlKCkge1xuICAgIHRpbWVkX291dCA9IHRydWVcbiAgICB2YXIgZXIgPSBuZXcgRXJyb3IoJ0VUSU1FRE9VVCcpXG4gICAgZXIuY29kZSA9ICdFVElNRURPVVQnXG4gICAgZXIuZHVyYXRpb24gPSBvcHRpb25zLnRpbWVvdXRcblxuICAgIHJlcXVlc3QubG9nLmVycm9yKCdUaW1lb3V0JywgeyAnaWQnOnhoci5faWQsICdtaWxsaXNlY29uZHMnOm9wdGlvbnMudGltZW91dCB9KVxuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpXG4gIH1cblxuICAvLyBTb21lIHN0YXRlcyBjYW4gYmUgc2tpcHBlZCBvdmVyLCBzbyByZW1lbWJlciB3aGF0IGlzIHN0aWxsIGluY29tcGxldGUuXG4gIHZhciBkaWQgPSB7J3Jlc3BvbnNlJzpmYWxzZSwgJ2xvYWRpbmcnOmZhbHNlLCAnZW5kJzpmYWxzZX1cblxuICB4aHIub25yZWFkeXN0YXRlY2hhbmdlID0gb25fc3RhdGVfY2hhbmdlXG4gIHhoci5vcGVuKG9wdGlvbnMubWV0aG9kLCBvcHRpb25zLnVyaSwgdHJ1ZSkgLy8gYXN5bmNocm9ub3VzXG4gIGlmKGlzX2NvcnMpXG4gICAgeGhyLndpdGhDcmVkZW50aWFscyA9ICEhIG9wdGlvbnMud2l0aENyZWRlbnRpYWxzXG4gIHhoci5zZW5kKG9wdGlvbnMuYm9keSlcbiAgcmV0dXJuIHhoclxuXG4gIGZ1bmN0aW9uIG9uX3N0YXRlX2NoYW5nZShldmVudCkge1xuICAgIGlmKHRpbWVkX291dClcbiAgICAgIHJldHVybiByZXF1ZXN0LmxvZy5kZWJ1ZygnSWdub3JpbmcgdGltZWQgb3V0IHN0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZH0pXG5cbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnU3RhdGUgY2hhbmdlJywgeydzdGF0ZSc6eGhyLnJlYWR5U3RhdGUsICdpZCc6eGhyLmlkLCAndGltZWRfb3V0Jzp0aW1lZF9vdXR9KVxuXG4gICAgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5PUEVORUQpIHtcbiAgICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IHN0YXJ0ZWQnLCB7J2lkJzp4aHIuaWR9KVxuICAgICAgZm9yICh2YXIga2V5IGluIG9wdGlvbnMuaGVhZGVycylcbiAgICAgICAgeGhyLnNldFJlcXVlc3RIZWFkZXIoa2V5LCBvcHRpb25zLmhlYWRlcnNba2V5XSlcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuSEVBREVSU19SRUNFSVZFRClcbiAgICAgIG9uX3Jlc3BvbnNlKClcblxuICAgIGVsc2UgaWYoeGhyLnJlYWR5U3RhdGUgPT09IFhIUi5MT0FESU5HKSB7XG4gICAgICBvbl9yZXNwb25zZSgpXG4gICAgICBvbl9sb2FkaW5nKClcbiAgICB9XG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuRE9ORSkge1xuICAgICAgb25fcmVzcG9uc2UoKVxuICAgICAgb25fbG9hZGluZygpXG4gICAgICBvbl9lbmQoKVxuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX3Jlc3BvbnNlKCkge1xuICAgIGlmKGRpZC5yZXNwb25zZSlcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLnJlc3BvbnNlID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdHb3QgcmVzcG9uc2UnLCB7J2lkJzp4aHIuaWQsICdzdGF0dXMnOnhoci5zdGF0dXN9KVxuICAgIGNsZWFyVGltZW91dCh4aHIudGltZW91dFRpbWVyKVxuICAgIHhoci5zdGF0dXNDb2RlID0geGhyLnN0YXR1cyAvLyBOb2RlIHJlcXVlc3QgY29tcGF0aWJpbGl0eVxuXG4gICAgLy8gRGV0ZWN0IGZhaWxlZCBDT1JTIHJlcXVlc3RzLlxuICAgIGlmKGlzX2NvcnMgJiYgeGhyLnN0YXR1c0NvZGUgPT0gMCkge1xuICAgICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdDT1JTIHJlcXVlc3QgcmVqZWN0ZWQ6ICcgKyBvcHRpb25zLnVyaSlcbiAgICAgIGNvcnNfZXJyLmNvcnMgPSAncmVqZWN0ZWQnXG5cbiAgICAgIC8vIERvIG5vdCBwcm9jZXNzIHRoaXMgcmVxdWVzdCBmdXJ0aGVyLlxuICAgICAgZGlkLmxvYWRpbmcgPSB0cnVlXG4gICAgICBkaWQuZW5kID0gdHJ1ZVxuXG4gICAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhjb3JzX2VyciwgeGhyKVxuICAgIH1cblxuICAgIG9wdGlvbnMub25SZXNwb25zZShudWxsLCB4aHIpXG4gIH1cblxuICBmdW5jdGlvbiBvbl9sb2FkaW5nKCkge1xuICAgIGlmKGRpZC5sb2FkaW5nKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQubG9hZGluZyA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVzcG9uc2UgYm9keSBsb2FkaW5nJywgeydpZCc6eGhyLmlkfSlcbiAgICAvLyBUT0RPOiBNYXliZSBzaW11bGF0ZSBcImRhdGFcIiBldmVudHMgYnkgd2F0Y2hpbmcgeGhyLnJlc3BvbnNlVGV4dFxuICB9XG5cbiAgZnVuY3Rpb24gb25fZW5kKCkge1xuICAgIGlmKGRpZC5lbmQpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5lbmQgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1JlcXVlc3QgZG9uZScsIHsnaWQnOnhoci5pZH0pXG5cbiAgICB4aHIuYm9keSA9IHhoci5yZXNwb25zZVRleHRcbiAgICBpZihvcHRpb25zLmpzb24pIHtcbiAgICAgIHRyeSAgICAgICAgeyB4aHIuYm9keSA9IEpTT04ucGFyc2UoeGhyLnJlc3BvbnNlVGV4dCkgfVxuICAgICAgY2F0Y2ggKGVyKSB7IHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGVyLCB4aHIpICAgICAgICB9XG4gICAgfVxuXG4gICAgb3B0aW9ucy5jYWxsYmFjayhudWxsLCB4aHIsIHhoci5ib2R5KVxuICB9XG5cbn0gLy8gcmVxdWVzdFxuXG5yZXF1ZXN0LndpdGhDcmVkZW50aWFscyA9IGZhbHNlO1xucmVxdWVzdC5ERUZBVUxUX1RJTUVPVVQgPSBERUZBVUxUX1RJTUVPVVQ7XG5cbi8vXG4vLyBkZWZhdWx0c1xuLy9cblxucmVxdWVzdC5kZWZhdWx0cyA9IGZ1bmN0aW9uKG9wdGlvbnMsIHJlcXVlc3Rlcikge1xuICB2YXIgZGVmID0gZnVuY3Rpb24gKG1ldGhvZCkge1xuICAgIHZhciBkID0gZnVuY3Rpb24gKHBhcmFtcywgY2FsbGJhY2spIHtcbiAgICAgIGlmKHR5cGVvZiBwYXJhbXMgPT09ICdzdHJpbmcnKVxuICAgICAgICBwYXJhbXMgPSB7J3VyaSc6IHBhcmFtc307XG4gICAgICBlbHNlIHtcbiAgICAgICAgcGFyYW1zID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShwYXJhbXMpKTtcbiAgICAgIH1cbiAgICAgIGZvciAodmFyIGkgaW4gb3B0aW9ucykge1xuICAgICAgICBpZiAocGFyYW1zW2ldID09PSB1bmRlZmluZWQpIHBhcmFtc1tpXSA9IG9wdGlvbnNbaV1cbiAgICAgIH1cbiAgICAgIHJldHVybiBtZXRob2QocGFyYW1zLCBjYWxsYmFjaylcbiAgICB9XG4gICAgcmV0dXJuIGRcbiAgfVxuICB2YXIgZGUgPSBkZWYocmVxdWVzdClcbiAgZGUuZ2V0ID0gZGVmKHJlcXVlc3QuZ2V0KVxuICBkZS5wb3N0ID0gZGVmKHJlcXVlc3QucG9zdClcbiAgZGUucHV0ID0gZGVmKHJlcXVlc3QucHV0KVxuICBkZS5oZWFkID0gZGVmKHJlcXVlc3QuaGVhZClcbiAgcmV0dXJuIGRlXG59XG5cbi8vXG4vLyBIVFRQIG1ldGhvZCBzaG9ydGN1dHNcbi8vXG5cbnZhciBzaG9ydGN1dHMgPSBbICdnZXQnLCAncHV0JywgJ3Bvc3QnLCAnaGVhZCcgXTtcbnNob3J0Y3V0cy5mb3JFYWNoKGZ1bmN0aW9uKHNob3J0Y3V0KSB7XG4gIHZhciBtZXRob2QgPSBzaG9ydGN1dC50b1VwcGVyQ2FzZSgpO1xuICB2YXIgZnVuYyAgID0gc2hvcnRjdXQudG9Mb3dlckNhc2UoKTtcblxuICByZXF1ZXN0W2Z1bmNdID0gZnVuY3Rpb24ob3B0cykge1xuICAgIGlmKHR5cGVvZiBvcHRzID09PSAnc3RyaW5nJylcbiAgICAgIG9wdHMgPSB7J21ldGhvZCc6bWV0aG9kLCAndXJpJzpvcHRzfTtcbiAgICBlbHNlIHtcbiAgICAgIG9wdHMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdHMpKTtcbiAgICAgIG9wdHMubWV0aG9kID0gbWV0aG9kO1xuICAgIH1cblxuICAgIHZhciBhcmdzID0gW29wdHNdLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuYXBwbHkoYXJndW1lbnRzLCBbMV0pKTtcbiAgICByZXR1cm4gcmVxdWVzdC5hcHBseSh0aGlzLCBhcmdzKTtcbiAgfVxufSlcblxuLy9cbi8vIENvdWNoREIgc2hvcnRjdXRcbi8vXG5cbnJlcXVlc3QuY291Y2ggPSBmdW5jdGlvbihvcHRpb25zLCBjYWxsYmFjaykge1xuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfVxuXG4gIC8vIEp1c3QgdXNlIHRoZSByZXF1ZXN0IEFQSSB0byBkbyBKU09OLlxuICBvcHRpb25zLmpzb24gPSB0cnVlXG4gIGlmKG9wdGlvbnMuYm9keSlcbiAgICBvcHRpb25zLmpzb24gPSBvcHRpb25zLmJvZHlcbiAgZGVsZXRlIG9wdGlvbnMuYm9keVxuXG4gIGNhbGxiYWNrID0gY2FsbGJhY2sgfHwgbm9vcFxuXG4gIHZhciB4aHIgPSByZXF1ZXN0KG9wdGlvbnMsIGNvdWNoX2hhbmRsZXIpXG4gIHJldHVybiB4aHJcblxuICBmdW5jdGlvbiBjb3VjaF9oYW5kbGVyKGVyLCByZXNwLCBib2R5KSB7XG4gICAgaWYoZXIpXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpXG5cbiAgICBpZigocmVzcC5zdGF0dXNDb2RlIDwgMjAwIHx8IHJlc3Auc3RhdHVzQ29kZSA+IDI5OSkgJiYgYm9keS5lcnJvcikge1xuICAgICAgLy8gVGhlIGJvZHkgaXMgYSBDb3VjaCBKU09OIG9iamVjdCBpbmRpY2F0aW5nIHRoZSBlcnJvci5cbiAgICAgIGVyID0gbmV3IEVycm9yKCdDb3VjaERCIGVycm9yOiAnICsgKGJvZHkuZXJyb3IucmVhc29uIHx8IGJvZHkuZXJyb3IuZXJyb3IpKVxuICAgICAgZm9yICh2YXIga2V5IGluIGJvZHkpXG4gICAgICAgIGVyW2tleV0gPSBib2R5W2tleV1cbiAgICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KTtcbiAgfVxufVxuXG4vL1xuLy8gVXRpbGl0eVxuLy9cblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbmZ1bmN0aW9uIGdldExvZ2dlcigpIHtcbiAgdmFyIGxvZ2dlciA9IHt9XG4gICAgLCBsZXZlbHMgPSBbJ3RyYWNlJywgJ2RlYnVnJywgJ2luZm8nLCAnd2FybicsICdlcnJvciddXG4gICAgLCBsZXZlbCwgaVxuXG4gIGZvcihpID0gMDsgaSA8IGxldmVscy5sZW5ndGg7IGkrKykge1xuICAgIGxldmVsID0gbGV2ZWxzW2ldXG5cbiAgICBsb2dnZXJbbGV2ZWxdID0gbm9vcFxuICAgIGlmKHR5cGVvZiBjb25zb2xlICE9PSAndW5kZWZpbmVkJyAmJiBjb25zb2xlICYmIGNvbnNvbGVbbGV2ZWxdKVxuICAgICAgbG9nZ2VyW2xldmVsXSA9IGZvcm1hdHRlZChjb25zb2xlLCBsZXZlbClcbiAgfVxuXG4gIHJldHVybiBsb2dnZXJcbn1cblxuZnVuY3Rpb24gZm9ybWF0dGVkKG9iaiwgbWV0aG9kKSB7XG4gIHJldHVybiBmb3JtYXR0ZWRfbG9nZ2VyXG5cbiAgZnVuY3Rpb24gZm9ybWF0dGVkX2xvZ2dlcihzdHIsIGNvbnRleHQpIHtcbiAgICBpZih0eXBlb2YgY29udGV4dCA9PT0gJ29iamVjdCcpXG4gICAgICBzdHIgKz0gJyAnICsgSlNPTi5zdHJpbmdpZnkoY29udGV4dClcblxuICAgIHJldHVybiBvYmpbbWV0aG9kXS5jYWxsKG9iaiwgc3RyKVxuICB9XG59XG5cbi8vIFJldHVybiB3aGV0aGVyIGEgVVJMIGlzIGEgY3Jvc3MtZG9tYWluIHJlcXVlc3QuXG5mdW5jdGlvbiBpc19jcm9zc0RvbWFpbih1cmwpIHtcbiAgdmFyIHJ1cmwgPSAvXihbXFx3XFwrXFwuXFwtXSs6KSg/OlxcL1xcLyhbXlxcLz8jOl0qKSg/OjooXFxkKykpPyk/L1xuXG4gIC8vIGpRdWVyeSAjODEzOCwgSUUgbWF5IHRocm93IGFuIGV4Y2VwdGlvbiB3aGVuIGFjY2Vzc2luZ1xuICAvLyBhIGZpZWxkIGZyb20gd2luZG93LmxvY2F0aW9uIGlmIGRvY3VtZW50LmRvbWFpbiBoYXMgYmVlbiBzZXRcbiAgdmFyIGFqYXhMb2NhdGlvblxuICB0cnkgeyBhamF4TG9jYXRpb24gPSBsb2NhdGlvbi5ocmVmIH1cbiAgY2F0Y2ggKGUpIHtcbiAgICAvLyBVc2UgdGhlIGhyZWYgYXR0cmlidXRlIG9mIGFuIEEgZWxlbWVudCBzaW5jZSBJRSB3aWxsIG1vZGlmeSBpdCBnaXZlbiBkb2N1bWVudC5sb2NhdGlvblxuICAgIGFqYXhMb2NhdGlvbiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoIFwiYVwiICk7XG4gICAgYWpheExvY2F0aW9uLmhyZWYgPSBcIlwiO1xuICAgIGFqYXhMb2NhdGlvbiA9IGFqYXhMb2NhdGlvbi5ocmVmO1xuICB9XG5cbiAgdmFyIGFqYXhMb2NQYXJ0cyA9IHJ1cmwuZXhlYyhhamF4TG9jYXRpb24udG9Mb3dlckNhc2UoKSkgfHwgW11cbiAgICAsIHBhcnRzID0gcnVybC5leGVjKHVybC50b0xvd2VyQ2FzZSgpIClcblxuICB2YXIgcmVzdWx0ID0gISEoXG4gICAgcGFydHMgJiZcbiAgICAoICBwYXJ0c1sxXSAhPSBhamF4TG9jUGFydHNbMV1cbiAgICB8fCBwYXJ0c1syXSAhPSBhamF4TG9jUGFydHNbMl1cbiAgICB8fCAocGFydHNbM10gfHwgKHBhcnRzWzFdID09PSBcImh0dHA6XCIgPyA4MCA6IDQ0MykpICE9IChhamF4TG9jUGFydHNbM10gfHwgKGFqYXhMb2NQYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKVxuICAgIClcbiAgKVxuXG4gIC8vY29uc29sZS5kZWJ1ZygnaXNfY3Jvc3NEb21haW4oJyt1cmwrJykgLT4gJyArIHJlc3VsdClcbiAgcmV0dXJuIHJlc3VsdFxufVxuXG4vLyBNSVQgTGljZW5zZSBmcm9tIGh0dHA6Ly9waHBqcy5vcmcvZnVuY3Rpb25zL2Jhc2U2NF9lbmNvZGU6MzU4XG5mdW5jdGlvbiBiNjRfZW5jIChkYXRhKSB7XG4gICAgLy8gRW5jb2RlcyBzdHJpbmcgdXNpbmcgTUlNRSBiYXNlNjQgYWxnb3JpdGhtXG4gICAgdmFyIGI2NCA9IFwiQUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVphYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5ejAxMjM0NTY3ODkrLz1cIjtcbiAgICB2YXIgbzEsIG8yLCBvMywgaDEsIGgyLCBoMywgaDQsIGJpdHMsIGkgPSAwLCBhYyA9IDAsIGVuYz1cIlwiLCB0bXBfYXJyID0gW107XG5cbiAgICBpZiAoIWRhdGEpIHtcbiAgICAgICAgcmV0dXJuIGRhdGE7XG4gICAgfVxuXG4gICAgLy8gYXNzdW1lIHV0ZjggZGF0YVxuICAgIC8vIGRhdGEgPSB0aGlzLnV0ZjhfZW5jb2RlKGRhdGErJycpO1xuXG4gICAgZG8geyAvLyBwYWNrIHRocmVlIG9jdGV0cyBpbnRvIGZvdXIgaGV4ZXRzXG4gICAgICAgIG8xID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8yID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG4gICAgICAgIG8zID0gZGF0YS5jaGFyQ29kZUF0KGkrKyk7XG5cbiAgICAgICAgYml0cyA9IG8xPDwxNiB8IG8yPDw4IHwgbzM7XG5cbiAgICAgICAgaDEgPSBiaXRzPj4xOCAmIDB4M2Y7XG4gICAgICAgIGgyID0gYml0cz4+MTIgJiAweDNmO1xuICAgICAgICBoMyA9IGJpdHM+PjYgJiAweDNmO1xuICAgICAgICBoNCA9IGJpdHMgJiAweDNmO1xuXG4gICAgICAgIC8vIHVzZSBoZXhldHMgdG8gaW5kZXggaW50byBiNjQsIGFuZCBhcHBlbmQgcmVzdWx0IHRvIGVuY29kZWQgc3RyaW5nXG4gICAgICAgIHRtcF9hcnJbYWMrK10gPSBiNjQuY2hhckF0KGgxKSArIGI2NC5jaGFyQXQoaDIpICsgYjY0LmNoYXJBdChoMykgKyBiNjQuY2hhckF0KGg0KTtcbiAgICB9IHdoaWxlIChpIDwgZGF0YS5sZW5ndGgpO1xuXG4gICAgZW5jID0gdG1wX2Fyci5qb2luKCcnKTtcblxuICAgIHN3aXRjaCAoZGF0YS5sZW5ndGggJSAzKSB7XG4gICAgICAgIGNhc2UgMTpcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMikgKyAnPT0nO1xuICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgICAgZW5jID0gZW5jLnNsaWNlKDAsIC0xKSArICc9JztcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGVuYztcbn1cbiAgICByZXR1cm4gcmVxdWVzdDtcbi8vVU1EIEZPT1RFUiBTVEFSVFxufSkpO1xuLy9VTUQgRk9PVEVSIEVORFxuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIHdlYiBicm93c2VyIGltcGxlbWVudGF0aW9uIG9mIGBkZWJ1ZygpYC5cbiAqXG4gKiBFeHBvc2UgYGRlYnVnKClgIGFzIHRoZSBtb2R1bGUuXG4gKi9cblxuZXhwb3J0cyA9IG1vZHVsZS5leHBvcnRzID0gcmVxdWlyZSgnLi9kZWJ1ZycpO1xuZXhwb3J0cy5sb2cgPSBsb2c7XG5leHBvcnRzLmZvcm1hdEFyZ3MgPSBmb3JtYXRBcmdzO1xuZXhwb3J0cy5zYXZlID0gc2F2ZTtcbmV4cG9ydHMubG9hZCA9IGxvYWQ7XG5leHBvcnRzLnVzZUNvbG9ycyA9IHVzZUNvbG9ycztcblxuLyoqXG4gKiBDb2xvcnMuXG4gKi9cblxuZXhwb3J0cy5jb2xvcnMgPSBbXG4gICdsaWdodHNlYWdyZWVuJyxcbiAgJ2ZvcmVzdGdyZWVuJyxcbiAgJ2dvbGRlbnJvZCcsXG4gICdkb2RnZXJibHVlJyxcbiAgJ2RhcmtvcmNoaWQnLFxuICAnY3JpbXNvbidcbl07XG5cbi8qKlxuICogQ3VycmVudGx5IG9ubHkgV2ViS2l0LWJhc2VkIFdlYiBJbnNwZWN0b3JzLCBGaXJlZm94ID49IHYzMSxcbiAqIGFuZCB0aGUgRmlyZWJ1ZyBleHRlbnNpb24gKGFueSBGaXJlZm94IHZlcnNpb24pIGFyZSBrbm93blxuICogdG8gc3VwcG9ydCBcIiVjXCIgQ1NTIGN1c3RvbWl6YXRpb25zLlxuICpcbiAqIFRPRE86IGFkZCBhIGBsb2NhbFN0b3JhZ2VgIHZhcmlhYmxlIHRvIGV4cGxpY2l0bHkgZW5hYmxlL2Rpc2FibGUgY29sb3JzXG4gKi9cblxuZnVuY3Rpb24gdXNlQ29sb3JzKCkge1xuICAvLyBpcyB3ZWJraXQ/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzE2NDU5NjA2LzM3Njc3M1xuICByZXR1cm4gKCdXZWJraXRBcHBlYXJhbmNlJyBpbiBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuc3R5bGUpIHx8XG4gICAgLy8gaXMgZmlyZWJ1Zz8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMzk4MTIwLzM3Njc3M1xuICAgICh3aW5kb3cuY29uc29sZSAmJiAoY29uc29sZS5maXJlYnVnIHx8IChjb25zb2xlLmV4Y2VwdGlvbiAmJiBjb25zb2xlLnRhYmxlKSkpIHx8XG4gICAgLy8gaXMgZmlyZWZveCA+PSB2MzE/XG4gICAgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9Ub29scy9XZWJfQ29uc29sZSNTdHlsaW5nX21lc3NhZ2VzXG4gICAgKG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKS5tYXRjaCgvZmlyZWZveFxcLyhcXGQrKS8pICYmIHBhcnNlSW50KFJlZ0V4cC4kMSwgMTApID49IDMxKTtcbn1cblxuLyoqXG4gKiBNYXAgJWogdG8gYEpTT04uc3RyaW5naWZ5KClgLCBzaW5jZSBubyBXZWIgSW5zcGVjdG9ycyBkbyB0aGF0IGJ5IGRlZmF1bHQuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzLmogPSBmdW5jdGlvbih2KSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2KTtcbn07XG5cblxuLyoqXG4gKiBDb2xvcml6ZSBsb2cgYXJndW1lbnRzIGlmIGVuYWJsZWQuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBmb3JtYXRBcmdzKCkge1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIHVzZUNvbG9ycyA9IHRoaXMudXNlQ29sb3JzO1xuXG4gIGFyZ3NbMF0gPSAodXNlQ29sb3JzID8gJyVjJyA6ICcnKVxuICAgICsgdGhpcy5uYW1lc3BhY2VcbiAgICArICh1c2VDb2xvcnMgPyAnICVjJyA6ICcgJylcbiAgICArIGFyZ3NbMF1cbiAgICArICh1c2VDb2xvcnMgPyAnJWMgJyA6ICcgJylcbiAgICArICcrJyArIGV4cG9ydHMuaHVtYW5pemUodGhpcy5kaWZmKTtcblxuICBpZiAoIXVzZUNvbG9ycykgcmV0dXJuIGFyZ3M7XG5cbiAgdmFyIGMgPSAnY29sb3I6ICcgKyB0aGlzLmNvbG9yO1xuICBhcmdzID0gW2FyZ3NbMF0sIGMsICdjb2xvcjogaW5oZXJpdCddLmNvbmNhdChBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmdzLCAxKSk7XG5cbiAgLy8gdGhlIGZpbmFsIFwiJWNcIiBpcyBzb21ld2hhdCB0cmlja3ksIGJlY2F1c2UgdGhlcmUgY291bGQgYmUgb3RoZXJcbiAgLy8gYXJndW1lbnRzIHBhc3NlZCBlaXRoZXIgYmVmb3JlIG9yIGFmdGVyIHRoZSAlYywgc28gd2UgbmVlZCB0b1xuICAvLyBmaWd1cmUgb3V0IHRoZSBjb3JyZWN0IGluZGV4IHRvIGluc2VydCB0aGUgQ1NTIGludG9cbiAgdmFyIGluZGV4ID0gMDtcbiAgdmFyIGxhc3RDID0gMDtcbiAgYXJnc1swXS5yZXBsYWNlKC8lW2EteiVdL2csIGZ1bmN0aW9uKG1hdGNoKSB7XG4gICAgaWYgKCclJScgPT09IG1hdGNoKSByZXR1cm47XG4gICAgaW5kZXgrKztcbiAgICBpZiAoJyVjJyA9PT0gbWF0Y2gpIHtcbiAgICAgIC8vIHdlIG9ubHkgYXJlIGludGVyZXN0ZWQgaW4gdGhlICpsYXN0KiAlY1xuICAgICAgLy8gKHRoZSB1c2VyIG1heSBoYXZlIHByb3ZpZGVkIHRoZWlyIG93bilcbiAgICAgIGxhc3RDID0gaW5kZXg7XG4gICAgfVxuICB9KTtcblxuICBhcmdzLnNwbGljZShsYXN0QywgMCwgYyk7XG4gIHJldHVybiBhcmdzO1xufVxuXG4vKipcbiAqIEludm9rZXMgYGNvbnNvbGUubG9nKClgIHdoZW4gYXZhaWxhYmxlLlxuICogTm8tb3Agd2hlbiBgY29uc29sZS5sb2dgIGlzIG5vdCBhIFwiZnVuY3Rpb25cIi5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGxvZygpIHtcbiAgLy8gVGhpcyBoYWNrZXJ5IGlzIHJlcXVpcmVkIGZvciBJRTgsXG4gIC8vIHdoZXJlIHRoZSBgY29uc29sZS5sb2dgIGZ1bmN0aW9uIGRvZXNuJ3QgaGF2ZSAnYXBwbHknXG4gIHJldHVybiAnb2JqZWN0JyA9PSB0eXBlb2YgY29uc29sZVxuICAgICYmICdmdW5jdGlvbicgPT0gdHlwZW9mIGNvbnNvbGUubG9nXG4gICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG59XG5cbi8qKlxuICogU2F2ZSBgbmFtZXNwYWNlc2AuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVzcGFjZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNhdmUobmFtZXNwYWNlcykge1xuICB0cnkge1xuICAgIGlmIChudWxsID09IG5hbWVzcGFjZXMpIHtcbiAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKCdkZWJ1ZycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBsb2NhbFN0b3JhZ2UuZGVidWcgPSBuYW1lc3BhY2VzO1xuICAgIH1cbiAgfSBjYXRjaChlKSB7fVxufVxuXG4vKipcbiAqIExvYWQgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEByZXR1cm4ge1N0cmluZ30gcmV0dXJucyB0aGUgcHJldmlvdXNseSBwZXJzaXN0ZWQgZGVidWcgbW9kZXNcbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvYWQoKSB7XG4gIHZhciByO1xuICB0cnkge1xuICAgIHIgPSBsb2NhbFN0b3JhZ2UuZGVidWc7XG4gIH0gY2F0Y2goZSkge31cbiAgcmV0dXJuIHI7XG59XG5cbi8qKlxuICogRW5hYmxlIG5hbWVzcGFjZXMgbGlzdGVkIGluIGBsb2NhbFN0b3JhZ2UuZGVidWdgIGluaXRpYWxseS5cbiAqL1xuXG5leHBvcnRzLmVuYWJsZShsb2FkKCkpO1xuIiwiXG4vKipcbiAqIFRoaXMgaXMgdGhlIGNvbW1vbiBsb2dpYyBmb3IgYm90aCB0aGUgTm9kZS5qcyBhbmQgd2ViIGJyb3dzZXJcbiAqIGltcGxlbWVudGF0aW9ucyBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IGRlYnVnO1xuZXhwb3J0cy5jb2VyY2UgPSBjb2VyY2U7XG5leHBvcnRzLmRpc2FibGUgPSBkaXNhYmxlO1xuZXhwb3J0cy5lbmFibGUgPSBlbmFibGU7XG5leHBvcnRzLmVuYWJsZWQgPSBlbmFibGVkO1xuZXhwb3J0cy5odW1hbml6ZSA9IHJlcXVpcmUoJ21zJyk7XG5cbi8qKlxuICogVGhlIGN1cnJlbnRseSBhY3RpdmUgZGVidWcgbW9kZSBuYW1lcywgYW5kIG5hbWVzIHRvIHNraXAuXG4gKi9cblxuZXhwb3J0cy5uYW1lcyA9IFtdO1xuZXhwb3J0cy5za2lwcyA9IFtdO1xuXG4vKipcbiAqIE1hcCBvZiBzcGVjaWFsIFwiJW5cIiBoYW5kbGluZyBmdW5jdGlvbnMsIGZvciB0aGUgZGVidWcgXCJmb3JtYXRcIiBhcmd1bWVudC5cbiAqXG4gKiBWYWxpZCBrZXkgbmFtZXMgYXJlIGEgc2luZ2xlLCBsb3dlcmNhc2VkIGxldHRlciwgaS5lLiBcIm5cIi5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMgPSB7fTtcblxuLyoqXG4gKiBQcmV2aW91c2x5IGFzc2lnbmVkIGNvbG9yLlxuICovXG5cbnZhciBwcmV2Q29sb3IgPSAwO1xuXG4vKipcbiAqIFByZXZpb3VzIGxvZyB0aW1lc3RhbXAuXG4gKi9cblxudmFyIHByZXZUaW1lO1xuXG4vKipcbiAqIFNlbGVjdCBhIGNvbG9yLlxuICpcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNlbGVjdENvbG9yKCkge1xuICByZXR1cm4gZXhwb3J0cy5jb2xvcnNbcHJldkNvbG9yKysgJSBleHBvcnRzLmNvbG9ycy5sZW5ndGhdO1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGRlYnVnZ2VyIHdpdGggdGhlIGdpdmVuIGBuYW1lc3BhY2VgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VcbiAqIEByZXR1cm4ge0Z1bmN0aW9ufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWJ1ZyhuYW1lc3BhY2UpIHtcblxuICAvLyBkZWZpbmUgdGhlIGBkaXNhYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBkaXNhYmxlZCgpIHtcbiAgfVxuICBkaXNhYmxlZC5lbmFibGVkID0gZmFsc2U7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZW5hYmxlZGAgdmVyc2lvblxuICBmdW5jdGlvbiBlbmFibGVkKCkge1xuXG4gICAgdmFyIHNlbGYgPSBlbmFibGVkO1xuXG4gICAgLy8gc2V0IGBkaWZmYCB0aW1lc3RhbXBcbiAgICB2YXIgY3VyciA9ICtuZXcgRGF0ZSgpO1xuICAgIHZhciBtcyA9IGN1cnIgLSAocHJldlRpbWUgfHwgY3Vycik7XG4gICAgc2VsZi5kaWZmID0gbXM7XG4gICAgc2VsZi5wcmV2ID0gcHJldlRpbWU7XG4gICAgc2VsZi5jdXJyID0gY3VycjtcbiAgICBwcmV2VGltZSA9IGN1cnI7XG5cbiAgICAvLyBhZGQgdGhlIGBjb2xvcmAgaWYgbm90IHNldFxuICAgIGlmIChudWxsID09IHNlbGYudXNlQ29sb3JzKSBzZWxmLnVzZUNvbG9ycyA9IGV4cG9ydHMudXNlQ29sb3JzKCk7XG4gICAgaWYgKG51bGwgPT0gc2VsZi5jb2xvciAmJiBzZWxmLnVzZUNvbG9ycykgc2VsZi5jb2xvciA9IHNlbGVjdENvbG9yKCk7XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG5cbiAgICBhcmdzWzBdID0gZXhwb3J0cy5jb2VyY2UoYXJnc1swXSk7XG5cbiAgICBpZiAoJ3N0cmluZycgIT09IHR5cGVvZiBhcmdzWzBdKSB7XG4gICAgICAvLyBhbnl0aGluZyBlbHNlIGxldCdzIGluc3BlY3Qgd2l0aCAlb1xuICAgICAgYXJncyA9IFsnJW8nXS5jb25jYXQoYXJncyk7XG4gICAgfVxuXG4gICAgLy8gYXBwbHkgYW55IGBmb3JtYXR0ZXJzYCB0cmFuc2Zvcm1hdGlvbnNcbiAgICB2YXIgaW5kZXggPSAwO1xuICAgIGFyZ3NbMF0gPSBhcmdzWzBdLnJlcGxhY2UoLyUoW2EteiVdKS9nLCBmdW5jdGlvbihtYXRjaCwgZm9ybWF0KSB7XG4gICAgICAvLyBpZiB3ZSBlbmNvdW50ZXIgYW4gZXNjYXBlZCAlIHRoZW4gZG9uJ3QgaW5jcmVhc2UgdGhlIGFycmF5IGluZGV4XG4gICAgICBpZiAobWF0Y2ggPT09ICclJScpIHJldHVybiBtYXRjaDtcbiAgICAgIGluZGV4Kys7XG4gICAgICB2YXIgZm9ybWF0dGVyID0gZXhwb3J0cy5mb3JtYXR0ZXJzW2Zvcm1hdF07XG4gICAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGZvcm1hdHRlcikge1xuICAgICAgICB2YXIgdmFsID0gYXJnc1tpbmRleF07XG4gICAgICAgIG1hdGNoID0gZm9ybWF0dGVyLmNhbGwoc2VsZiwgdmFsKTtcblxuICAgICAgICAvLyBub3cgd2UgbmVlZCB0byByZW1vdmUgYGFyZ3NbaW5kZXhdYCBzaW5jZSBpdCdzIGlubGluZWQgaW4gdGhlIGBmb3JtYXRgXG4gICAgICAgIGFyZ3Muc3BsaWNlKGluZGV4LCAxKTtcbiAgICAgICAgaW5kZXgtLTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBtYXRjaDtcbiAgICB9KTtcblxuICAgIGlmICgnZnVuY3Rpb24nID09PSB0eXBlb2YgZXhwb3J0cy5mb3JtYXRBcmdzKSB7XG4gICAgICBhcmdzID0gZXhwb3J0cy5mb3JtYXRBcmdzLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICAgIH1cbiAgICB2YXIgbG9nRm4gPSBlbmFibGVkLmxvZyB8fCBleHBvcnRzLmxvZyB8fCBjb25zb2xlLmxvZy5iaW5kKGNvbnNvbGUpO1xuICAgIGxvZ0ZuLmFwcGx5KHNlbGYsIGFyZ3MpO1xuICB9XG4gIGVuYWJsZWQuZW5hYmxlZCA9IHRydWU7XG5cbiAgdmFyIGZuID0gZXhwb3J0cy5lbmFibGVkKG5hbWVzcGFjZSkgPyBlbmFibGVkIDogZGlzYWJsZWQ7XG5cbiAgZm4ubmFtZXNwYWNlID0gbmFtZXNwYWNlO1xuXG4gIHJldHVybiBmbjtcbn1cblxuLyoqXG4gKiBFbmFibGVzIGEgZGVidWcgbW9kZSBieSBuYW1lc3BhY2VzLiBUaGlzIGNhbiBpbmNsdWRlIG1vZGVzXG4gKiBzZXBhcmF0ZWQgYnkgYSBjb2xvbiBhbmQgd2lsZGNhcmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZShuYW1lc3BhY2VzKSB7XG4gIGV4cG9ydHMuc2F2ZShuYW1lc3BhY2VzKTtcblxuICB2YXIgc3BsaXQgPSAobmFtZXNwYWNlcyB8fCAnJykuc3BsaXQoL1tcXHMsXSsvKTtcbiAgdmFyIGxlbiA9IHNwbGl0Lmxlbmd0aDtcblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKCFzcGxpdFtpXSkgY29udGludWU7IC8vIGlnbm9yZSBlbXB0eSBzdHJpbmdzXG4gICAgbmFtZXNwYWNlcyA9IHNwbGl0W2ldLnJlcGxhY2UoL1xcKi9nLCAnLio/Jyk7XG4gICAgaWYgKG5hbWVzcGFjZXNbMF0gPT09ICctJykge1xuICAgICAgZXhwb3J0cy5za2lwcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcy5zdWJzdHIoMSkgKyAnJCcpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgZXhwb3J0cy5uYW1lcy5wdXNoKG5ldyBSZWdFeHAoJ14nICsgbmFtZXNwYWNlcyArICckJykpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGlzYWJsZSgpIHtcbiAgZXhwb3J0cy5lbmFibGUoJycpO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSBpZiB0aGUgZ2l2ZW4gbW9kZSBuYW1lIGlzIGVuYWJsZWQsIGZhbHNlIG90aGVyd2lzZS5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZVxuICogQHJldHVybiB7Qm9vbGVhbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZW5hYmxlZChuYW1lKSB7XG4gIHZhciBpLCBsZW47XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5za2lwc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIGZvciAoaSA9IDAsIGxlbiA9IGV4cG9ydHMubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZXhwb3J0cy5uYW1lc1tpXS50ZXN0KG5hbWUpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZhbHNlO1xufVxuXG4vKipcbiAqIENvZXJjZSBgdmFsYC5cbiAqXG4gKiBAcGFyYW0ge01peGVkfSB2YWxcbiAqIEByZXR1cm4ge01peGVkfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gY29lcmNlKHZhbCkge1xuICBpZiAodmFsIGluc3RhbmNlb2YgRXJyb3IpIHJldHVybiB2YWwuc3RhY2sgfHwgdmFsLm1lc3NhZ2U7XG4gIHJldHVybiB2YWw7XG59XG4iLCIvKipcbiAqIEhlbHBlcnMuXG4gKi9cblxudmFyIHMgPSAxMDAwO1xudmFyIG0gPSBzICogNjA7XG52YXIgaCA9IG0gKiA2MDtcbnZhciBkID0gaCAqIDI0O1xudmFyIHkgPSBkICogMzY1LjI1O1xuXG4vKipcbiAqIFBhcnNlIG9yIGZvcm1hdCB0aGUgZ2l2ZW4gYHZhbGAuXG4gKlxuICogT3B0aW9uczpcbiAqXG4gKiAgLSBgbG9uZ2AgdmVyYm9zZSBmb3JtYXR0aW5nIFtmYWxzZV1cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ3xOdW1iZXJ9IHZhbFxuICogQHBhcmFtIHtPYmplY3R9IG9wdGlvbnNcbiAqIEByZXR1cm4ge1N0cmluZ3xOdW1iZXJ9XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24odmFsLCBvcHRpb25zKXtcbiAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gIGlmICgnc3RyaW5nJyA9PSB0eXBlb2YgdmFsKSByZXR1cm4gcGFyc2UodmFsKTtcbiAgcmV0dXJuIG9wdGlvbnMubG9uZ1xuICAgID8gbG9uZyh2YWwpXG4gICAgOiBzaG9ydCh2YWwpO1xufTtcblxuLyoqXG4gKiBQYXJzZSB0aGUgZ2l2ZW4gYHN0cmAgYW5kIHJldHVybiBtaWxsaXNlY29uZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IHN0clxuICogQHJldHVybiB7TnVtYmVyfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gcGFyc2Uoc3RyKSB7XG4gIHZhciBtYXRjaCA9IC9eKCg/OlxcZCspP1xcLj9cXGQrKSAqKG1zfHNlY29uZHM/fHN8bWludXRlcz98bXxob3Vycz98aHxkYXlzP3xkfHllYXJzP3x5KT8kL2kuZXhlYyhzdHIpO1xuICBpZiAoIW1hdGNoKSByZXR1cm47XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ20nOlxuICAgICAgcmV0dXJuIG4gKiBtO1xuICAgIGNhc2UgJ3NlY29uZHMnOlxuICAgIGNhc2UgJ3NlY29uZCc6XG4gICAgY2FzZSAncyc6XG4gICAgICByZXR1cm4gbiAqIHM7XG4gICAgY2FzZSAnbXMnOlxuICAgICAgcmV0dXJuIG47XG4gIH1cbn1cblxuLyoqXG4gKiBTaG9ydCBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzaG9ydChtcykge1xuICBpZiAobXMgPj0gZCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBkKSArICdkJztcbiAgaWYgKG1zID49IGgpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gaCkgKyAnaCc7XG4gIGlmIChtcyA+PSBtKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIG0pICsgJ20nO1xuICBpZiAobXMgPj0gcykgcmV0dXJuIE1hdGgucm91bmQobXMgLyBzKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn1cblxuLyoqXG4gKiBMb25nIGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGxvbmcobXMpIHtcbiAgcmV0dXJuIHBsdXJhbChtcywgZCwgJ2RheScpXG4gICAgfHwgcGx1cmFsKG1zLCBoLCAnaG91cicpXG4gICAgfHwgcGx1cmFsKG1zLCBtLCAnbWludXRlJylcbiAgICB8fCBwbHVyYWwobXMsIHMsICdzZWNvbmQnKVxuICAgIHx8IG1zICsgJyBtcyc7XG59XG5cbi8qKlxuICogUGx1cmFsaXphdGlvbiBoZWxwZXIuXG4gKi9cblxuZnVuY3Rpb24gcGx1cmFsKG1zLCBuLCBuYW1lKSB7XG4gIGlmIChtcyA8IG4pIHJldHVybjtcbiAgaWYgKG1zIDwgbiAqIDEuNSkgcmV0dXJuIE1hdGguZmxvb3IobXMgLyBuKSArICcgJyArIG5hbWU7XG4gIHJldHVybiBNYXRoLmNlaWwobXMgLyBuKSArICcgJyArIG5hbWUgKyAncyc7XG59XG4iLCJ2YXIgZXh0ZW5kID0gcmVxdWlyZSgndXRpbCcpLl9leHRlbmRcblxuZXhwb3J0cy5TdGFuemEgPSB7fVxuZXh0ZW5kKGV4cG9ydHMuU3RhbnphLCByZXF1aXJlKCcuL2xpYi9zdGFuemEnKSlcbmV4cG9ydHMuSklEID0gcmVxdWlyZSgnLi9saWIvamlkJylcbmV4cG9ydHMuQ29ubmVjdGlvbiA9IHJlcXVpcmUoJy4vbGliL2Nvbm5lY3Rpb24nKVxuZXhwb3J0cy5TUlYgPSByZXF1aXJlKCcuL2xpYi9zcnYnKVxuZXhwb3J0cy5TdHJlYW1QYXJzZXIgPSByZXF1aXJlKCcuL2xpYi9zdHJlYW1fcGFyc2VyJylcbmV4cG9ydHMubHR4ID0gcmVxdWlyZSgnbHR4JykiLCIndXNlIHN0cmljdCc7XG5cbnZhciBuZXQgPSByZXF1aXJlKCduZXQnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuICAsIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBsdHggPSByZXF1aXJlKCdsdHgnKVxuICAsIHJlY29ubmVjdCA9IHJlcXVpcmUoJ3JlY29ubmVjdC1jb3JlJylcbiAgLCBTdHJlYW1QYXJzZXIgPSByZXF1aXJlKCcuL3N0cmVhbV9wYXJzZXInKVxuICAsIHN0YXJ0dGxzID0gcmVxdWlyZSgndGxzLWNvbm5lY3QnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjb25uZWN0aW9uJylcbiAgLCBleHRlbmQgPSByZXF1aXJlKCd1dGlsJykuX2V4dGVuZFxuXG52YXIgTlNfWE1QUF9UTFMgPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLXRscydcbnZhciBOU19TVFJFQU0gPSAnaHR0cDovL2V0aGVyeC5qYWJiZXIub3JnL3N0cmVhbXMnXG52YXIgTlNfWE1QUF9TVFJFQU1TID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1zdHJlYW1zJ1xuXG52YXIgSU5JVElBTF9SRUNPTk5FQ1RfREVMQVkgPSAgMWUzXG52YXIgTUFYX1JFQ09OTkVDVF9ERUxBWSAgICAgPSAzMGUzXG5cbmZ1bmN0aW9uIGRlZmF1bHRJbmplY3Rpb24oZW1pdHRlciwgb3B0cykge1xuICAgIC8vIGNsb25lIG9wdHNcbiAgICB2YXIgb3B0aW9ucyA9IGV4dGVuZCh7fSwgb3B0cylcblxuICAgIC8vIGFkZCBjb21wdXRlZCBvcHRpb25zXG4gICAgLyoganNoaW50IC1XMDE0ICovXG4gICAgb3B0aW9ucy5pbml0aWFsRGVsYXkgPSAob3B0cyAmJiAob3B0cy5pbml0aWFsUmVjb25uZWN0RGVsYXlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCAgb3B0cy5yZWNvbm5lY3REZWxheSkpIHx8IElOSVRJQUxfUkVDT05ORUNUX0RFTEFZXG4gICAgb3B0aW9ucy5tYXhEZWxheSA9IChvcHRzICYmICAgb3B0cy5tYXhSZWNvbm5lY3REZWxheSkgIHx8IE1BWF9SRUNPTk5FQ1RfREVMQVlcbiAgICBvcHRpb25zLmltbWVkaWF0ZSA9IG9wdHMgJiYgb3B0cy5zb2NrZXQgJiYgdHlwZW9mIG9wdHMuc29ja2V0ICE9PSAnZnVuY3Rpb24nXG4gICAgb3B0aW9ucy50eXBlID0gICAgICBvcHRzICYmIG9wdHMuZGVsYXlUeXBlXG4gICAgb3B0aW9ucy5lbWl0dGVyID0gICBlbWl0dGVyXG5cbiAgICAvLyByZXR1cm4gY2FsY3VsYXRlZCBvcHRpb25zXG4gICAgcmV0dXJuIG9wdGlvbnNcbn1cblxuLyoqXG4gQmFzZSBjbGFzcyBmb3IgY29ubmVjdGlvbi1iYXNlZCBzdHJlYW1zIChUQ1ApLlxuIFRoZSBzb2NrZXQgcGFyYW1ldGVyIGlzIG9wdGlvbmFsIGZvciBpbmNvbWluZyBjb25uZWN0aW9ucy5cbiovXG5mdW5jdGlvbiBDb25uZWN0aW9uKG9wdHMpIHtcbiAgICBcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5zdHJlYW1BdHRycyA9IChvcHRzICYmIG9wdHMuc3RyZWFtQXR0cnMpIHx8IHt9XG4gICAgdGhpcy54bWxucyA9IChvcHRzICYmIG9wdHMueG1sbnMpIHx8IHt9XG4gICAgdGhpcy54bWxucy5zdHJlYW0gPSBOU19TVFJFQU1cblxuICAgIHRoaXMucmVqZWN0VW5hdXRob3JpemVkID0gKG9wdHMgJiYgb3B0cy5yZWplY3RVbmF1dGhvcml6ZWQpID8gdHJ1ZSA6IGZhbHNlXG4gICAgdGhpcy5zZXJpYWxpemVkID0gKG9wdHMgJiYgb3B0cy5zZXJpYWxpemVkKSA/IHRydWUgOiBmYWxzZVxuICAgIHRoaXMucmVxdWVzdENlcnQgPSAob3B0cyAmJiBvcHRzLnJlcXVlc3RDZXJ0KSA/IHRydWUgOiBmYWxzZVxuXG4gICAgdGhpcy5zZXJ2ZXJuYW1lID0gKG9wdHMgJiYgb3B0cy5zZXJ2ZXJuYW1lKVxuXG4gICAgdGhpcy5fc2V0dXBTb2NrZXQoZGVmYXVsdEluamVjdGlvbih0aGlzLCBvcHRzKSlcbiAgICB0aGlzLm9uY2UoJ3JlY29ubmVjdCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdGhpcy5yZWNvbm5lY3QgPSBvcHRzICYmIG9wdHMucmVjb25uZWN0XG4gICAgfSlcbn1cblxudXRpbC5pbmhlcml0cyhDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLk5TX1hNUFBfVExTID0gTlNfWE1QUF9UTFNcbkNvbm5lY3Rpb24uTlNfU1RSRUFNID0gTlNfU1RSRUFNXG5Db25uZWN0aW9uLnByb3RvdHlwZS5OU19YTVBQX1NUUkVBTVMgPSBOU19YTVBQX1NUUkVBTVNcbi8vIERlZmF1bHRzXG5Db25uZWN0aW9uLnByb3RvdHlwZS5hbGxvd1RMUyA9IHRydWVcblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuX3NldHVwU29ja2V0ID0gZnVuY3Rpb24gKG9wdGlvbnMpIHtcbiAgICBkZWJ1Zygnc2V0dXAgc29ja2V0JylcbiAgICB2YXIgcHJldmlvdXNPcHRpb25zID0ge31cbiAgICB2YXIgaW5qZWN0ID0gcmVjb25uZWN0KGZ1bmN0aW9uIChvcHRzKSB7XG4gICAgICAgIHZhciBwcmV2aW91c1NvY2tldCA9IHRoaXMuc29ja2V0XG4gICAgICAgIC8qIGlmIHRoaXMgb3B0cy5wcmVzZXJ2ZSBpcyBvblxuICAgICAgICAgKiB0aGUgcHJldmlvdXMgb3B0aW9ucyBhcmUgc3RvcmVkIHVudGlsIG5leHQgdGltZS5cbiAgICAgICAgICogdGhpcyBpcyBuZWVkZWQgdG8gcmVzdG9yZSBmcm9tIGEgc2V0U2VjdXJlIGNhbGwuXG4gICAgICAgICAqL1xuICAgICAgICBpZiAob3B0cy5wcmVzZXJ2ZSA9PT0gJ29uJykge1xuICAgICAgICAgICAgb3B0cy5wcmVzZXJ2ZSA9IHByZXZpb3VzT3B0aW9uc1xuICAgICAgICAgICAgcHJldmlvdXNPcHRpb25zID0gb3B0c1xuICAgICAgICB9IGVsc2UgaWYgKG9wdHMucHJlc2VydmUpIHtcbiAgICAgICAgICAgIC8vIHN3aXRjaCBiYWNrIHRvIHRoZSBwcmV2ZXJzZWQgb3B0aW9uc1xuICAgICAgICAgICAgb3B0cyA9IHByZXZpb3VzT3B0aW9ucyA9IG9wdHMucHJlc2VydmVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIGtlZXAgc29tZSBzdGF0ZSBmb3IgZWcgU1JWLmNvbm5lY3RcbiAgICAgICAgICAgIG9wdHMgPSBwcmV2aW91c09wdGlvbnMgPSBvcHRzIHx8IHByZXZpb3VzT3B0aW9uc1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHR5cGVvZiBvcHRzLnNvY2tldCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgZGVidWcoJ3VzZSBsYXp5IHNvY2tldCcpXG4gICAgICAgICAgICAvKiBsYXp5IGV2YWx1YXRpb25cbiAgICAgICAgICAgICAqIChjYW4gYmUgcmV0cmlnZ2VyZWQgYnkgY2FsbGluZyBjb25uZWN0aW9uLmNvbm5lY3QoKVxuICAgICAgICAgICAgICogIHdpdGhvdXQgYXJndW1lbnRzIGFmdGVyIGEgcHJldmlvdXNcbiAgICAgICAgICAgICAqICBjb25uZWN0aW9uLmNvbm5lY3Qoe3NvY2tldDpmdW5jdGlvbigpIHsg4oCmIH19KSkgKi9cbiAgICAgICAgICAgIHRoaXMuc29ja2V0ID0gb3B0cy5zb2NrZXQuY2FsbCh0aGlzKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZGVidWcoJ3VzZSBzdGFuZGFyZCBzb2NrZXQnKVxuICAgICAgICAgICAgLy8gb25seSB1c2UgdGhpcyBzb2NrZXQgb25jZVxuICAgICAgICAgICAgdGhpcy5zb2NrZXQgPSBvcHRzLnNvY2tldFxuICAgICAgICAgICAgb3B0cy5zb2NrZXQgPSBudWxsXG4gICAgICAgICAgICBpZiAodGhpcy5zb2NrZXQpIHtcbiAgICAgICAgICAgICAgICB0aGlzLm9uY2UoJ2Nvbm5lY3QnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIGluamVjdC5vcHRpb25zLmltbWVkaWF0ZSA9IGZhbHNlXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgICB0aGlzLnNvY2tldCA9IHRoaXMuc29ja2V0IHx8IG5ldyBuZXQuU29ja2V0KClcbiAgICAgICAgaWYgKHByZXZpb3VzU29ja2V0ICE9PSB0aGlzLnNvY2tldClcbiAgICAgICAgICAgIHRoaXMuc2V0dXBTdHJlYW0oKVxuICAgICAgICByZXR1cm4gdGhpcy5zb2NrZXRcbiAgICB9LmJpbmQodGhpcykpXG5cbiAgICBpbmplY3QoaW5qZWN0Lm9wdGlvbnMgPSBvcHRpb25zKVxuXG4gICAgdGhpcy5vbignY29ubmVjdGlvbicsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgaWYgKCF0aGlzLnBhcnNlcilcbiAgICAgICAgICAgIHRoaXMuc3RhcnRQYXJzZXIoKVxuICAgIH0pXG4gICAgdGhpcy5vbignZW5kJywgZnVuY3Rpb24gKCkge1xuICAgICAgICBwcmV2aW91c09wdGlvbnMgPSB7fVxuICAgIH0pXG59XG5cbi8qKlxuIFVzZWQgYnkgYm90aCB0aGUgY29uc3RydWN0b3IgYW5kIGJ5IHJlaW5pdGlhbGl6YXRpb24gaW4gc2V0U2VjdXJlKCkuXG4qL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuc2V0dXBTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICBkZWJ1Zygnc2V0dXAgc3RyZWFtJylcbiAgICB0aGlzLnNvY2tldC5vbignZW5kJywgdGhpcy5vbkVuZC5iaW5kKHRoaXMpKVxuICAgIHRoaXMuc29ja2V0Lm9uKCdkYXRhJywgdGhpcy5vbkRhdGEuYmluZCh0aGlzKSlcbiAgICB0aGlzLnNvY2tldC5vbignY2xvc2UnLCB0aGlzLm9uQ2xvc2UuYmluZCh0aGlzKSlcbiAgICAvLyBsZXQgdGhlbSBzbmlmZiB1bnBhcnNlZCBYTUxcbiAgICB0aGlzLnNvY2tldC5vbignZGF0YScsICB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZGF0YScpKVxuICAgIHRoaXMuc29ja2V0Lm9uKCdkcmFpbicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkcmFpbicpKVxuICAgIC8vIGlnbm9yZSBlcnJvcnMgYWZ0ZXIgZGlzY29ubmVjdFxuICAgIHRoaXMuc29ja2V0Lm9uKCdlcnJvcicsIGZ1bmN0aW9uICgpIHsgfSlcblxuICAgIGlmICghdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphKSB7XG4gICAgICAgIC8qKlxuICAgICAgICAqIFRoaXMgaXMgb3B0aW1pemVkIGZvciBjb250aW51b3VzIFRDUCBzdHJlYW1zLiBJZiB5b3VyIFwic29ja2V0XCJcbiAgICAgICAgKiBhY3R1YWxseSB0cmFuc3BvcnRzIGZyYW1lcyAoV2ViU29ja2V0cykgYW5kIHlvdSBjYW4ndCBoYXZlXG4gICAgICAgICogc3RhbnphcyBzcGxpdCBhY3Jvc3MgdGhvc2UsIHVzZTpcbiAgICAgICAgKiAgICAgY2IoZWwudG9TdHJpbmcoKSlcbiAgICAgICAgKi9cbiAgICAgICAgaWYgKHRoaXMuc2VyaWFsaXplZCkge1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphID0gZnVuY3Rpb24oZWwsIGNiKSB7XG4gICAgICAgICAgICAgICAgLy8gQ29udGludW91c2x5IHdyaXRlIG91dFxuICAgICAgICAgICAgICAgIGVsLndyaXRlKGZ1bmN0aW9uKHMpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IocylcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5zb2NrZXQuc2VyaWFsaXplU3RhbnphID0gZnVuY3Rpb24oZWwsIGNiKSB7XG4gICAgICAgICAgICAgICAgY2IoZWwudG9TdHJpbmcoKSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5zb2NrZXQucGF1c2UpIHRoaXMuc29ja2V0LnBhdXNlKClcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuc29ja2V0LnJlc3VtZSkgdGhpcy5zb2NrZXQucmVzdW1lKClcbn1cblxuLyoqIENsaW1icyB0aGUgc3RhbnphIHVwIGlmIGEgY2hpbGQgd2FzIHBhc3NlZCxcbiAgICBidXQgeW91IGNhbiBzZW5kIHN0cmluZ3MgYW5kIGJ1ZmZlcnMgdG9vLlxuXG4gICAgUmV0dXJucyB3aGV0aGVyIHRoZSBzb2NrZXQgZmx1c2hlZCBkYXRhLlxuKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICB2YXIgZmx1c2hlZCA9IHRydWVcbiAgICBpZiAoIXRoaXMuc29ja2V0KSB7XG4gICAgICAgIHJldHVybiAvLyBEb2ghXG4gICAgfVxuICAgIGlmICghdGhpcy5zb2NrZXQud3JpdGFibGUpIHtcbiAgICAgICAgdGhpcy5zb2NrZXQuZW5kKClcbiAgICAgICAgcmV0dXJuXG4gICAgfVxuXG4gICAgZGVidWcoJ3NlbmQ6ICcgKyBzdGFuemEudG9TdHJpbmcoKSlcbiAgICBpZiAoc3RhbnphLnJvb3QpIHtcbiAgICAgICAgdmFyIGVsID0gdGhpcy5ybVhtbG5zKHN0YW56YS5yb290KCkpXG4gICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YShlbCwgZnVuY3Rpb24ocykge1xuICAgICAgICAgICAgZmx1c2hlZCA9IHRoaXMud3JpdGUocylcbiAgICAgICAgfS5iaW5kKHRoaXMuc29ja2V0KSlcbiAgICB9IGVsc2Uge1xuICAgICAgICBmbHVzaGVkID0gdGhpcy5zb2NrZXQud3JpdGUoc3RhbnphKVxuICAgIH1cbiAgICByZXR1cm4gZmx1c2hlZFxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHRoaXMucGFyc2VyID0gbmV3IFN0cmVhbVBhcnNlci5TdHJlYW1QYXJzZXIodGhpcy5tYXhTdGFuemFTaXplKVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0cmVhbVN0YXJ0JywgZnVuY3Rpb24oYXR0cnMpIHtcbiAgICAgICAgLyogV2UgbmVlZCB0aG9zZSB4bWxucyBvZnRlbiwgc3RvcmUgdGhlbSBleHRyYSAqL1xuICAgICAgICBzZWxmLnN0cmVhbU5zQXR0cnMgPSB7fVxuICAgICAgICBmb3IgKHZhciBrIGluIGF0dHJzKSB7XG4gICAgICAgICAgICBpZiAoayA9PT0gJ3htbG5zJyB8fCAoay5zdWJzdHIoMCwgNikgPT09ICd4bWxuczonKSlcbiAgICAgICAgICAgICAgICBzZWxmLnN0cmVhbU5zQXR0cnNba10gPSBhdHRyc1trXVxuICAgICAgICB9XG5cbiAgICAgICAgLyogTm90aWZ5IGluIGNhc2Ugd2UgZG9uJ3Qgd2FpdCBmb3IgPHN0cmVhbTpmZWF0dXJlcy8+XG4gICAgICAgICAgIChDb21wb25lbnQgb3Igbm9uLTEuMCBzdHJlYW1zKVxuICAgICAgICAgKi9cbiAgICAgICAgc2VsZi5lbWl0KCdzdHJlYW1TdGFydCcsIGF0dHJzKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub24oJ3N0YW56YScsIGZ1bmN0aW9uKHN0YW56YSkge1xuICAgICAgICBzZWxmLm9uU3RhbnphKHNlbGYuYWRkU3RyZWFtTnMoc3RhbnphKSlcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdlcnJvcicsIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgc2VsZi5lcnJvcihlLmNvbmRpdGlvbiB8fCAnaW50ZXJuYWwtc2VydmVyLWVycm9yJywgZS5tZXNzYWdlKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub25jZSgnZW5kJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIHNlbGYuc3RvcFBhcnNlcigpXG4gICAgICAgIGlmIChzZWxmLnJlY29ubmVjdClcbiAgICAgICAgICAgIHNlbGYub25jZSgncmVjb25uZWN0Jywgc2VsZi5zdGFydFBhcnNlci5iaW5kKHNlbGYpKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBzZWxmLmVuZCgpXG4gICAgfSlcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RvcFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIC8qIE5vIG1vcmUgZXZlbnRzLCBwbGVhc2UgKG1heSBoYXBwZW4gaG93ZXZlcikgKi9cbiAgICBpZiAodGhpcy5wYXJzZXIpIHtcbiAgICAgICAgdmFyIHBhcnNlciA9IHRoaXMucGFyc2VyXG4gICAgICAgIC8qIEdldCBHQydlZCAqL1xuICAgICAgICBkZWxldGUgdGhpcy5wYXJzZXJcbiAgICAgICAgcGFyc2VyLmVuZCgpXG4gICAgfVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhdHRycyA9IHt9XG4gICAgZm9yICh2YXIgayBpbiB0aGlzLnhtbG5zKSB7XG4gICAgICAgIGlmICh0aGlzLnhtbG5zLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBpZiAoIWspXG4gICAgICAgICAgICAgICAgYXR0cnMueG1sbnMgPSB0aGlzLnhtbG5zW2tdXG4gICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgYXR0cnNbJ3htbG5zOicgKyBrXSA9IHRoaXMueG1sbnNba11cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGsgaW4gdGhpcy5zdHJlYW1BdHRycykge1xuICAgICAgICBpZiAodGhpcy5zdHJlYW1BdHRycy5oYXNPd25Qcm9wZXJ0eShrKSlcbiAgICAgICAgICAgIGF0dHJzW2tdID0gdGhpcy5zdHJlYW1BdHRyc1trXVxuICAgIH1cblxuICAgIGlmICh0aGlzLnN0cmVhbVRvKSB7IC8vIGluIGNhc2Ugb2YgYSBjb21wb25lbnQgY29ubmVjdGluZ1xuICAgICAgICBhdHRycy50byA9IHRoaXMuc3RyZWFtVG9cbiAgICB9XG5cbiAgICB2YXIgZWwgPSBuZXcgbHR4LkVsZW1lbnQoJ3N0cmVhbTpzdHJlYW0nLCBhdHRycylcbiAgICAvLyBtYWtlIGl0IG5vbi1lbXB0eSB0byBjdXQgdGhlIGNsb3NpbmcgdGFnXG4gICAgZWwudCgnICcpXG4gICAgdmFyIHMgPSBlbC50b1N0cmluZygpXG4gICAgdGhpcy5zZW5kKHMuc3Vic3RyKDAsIHMuaW5kZXhPZignIDwvc3RyZWFtOnN0cmVhbT4nKSkpXG5cbiAgICB0aGlzLnN0cmVhbU9wZW5lZCA9IHRydWVcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGRlYnVnKCdyZWNlaXZlOiAnICsgZGF0YS50b1N0cmluZygndXRmOCcpKVxuICAgIGlmICh0aGlzLnBhcnNlcilcbiAgICAgICAgdGhpcy5wYXJzZXIud3JpdGUoZGF0YSlcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc2V0U2VjdXJlID0gZnVuY3Rpb24oY3JlZGVudGlhbHMsIGlzU2VydmVyKSB7XG4gICAgLy8gUmVtb3ZlIG9sZCBldmVudCBsaXN0ZW5lcnNcbiAgICB0aGlzLnNvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2RhdGEnKVxuICAgIC8vIHJldGFpbiBzb2NrZXQgJ2VuZCcgbGlzdGVuZXJzIGJlY2F1c2Ugc3NsIGxheWVyIGRvZXNuJ3Qgc3VwcG9ydCBpdFxuICAgIHRoaXMuc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnZHJhaW4nKVxuICAgIHRoaXMuc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnY2xvc2UnKVxuICAgIC8vIHJlbW92ZSBpZGxlX3RpbWVvdXRcbiAgICBpZiAodGhpcy5zb2NrZXQuY2xlYXJUaW1lcilcbiAgICAgICAgdGhpcy5zb2NrZXQuY2xlYXJUaW1lcigpXG5cbiAgICB2YXIgY2xlYXJ0ZXh0ID0gc3RhcnR0bHMoe1xuICAgICAgICBzb2NrZXQ6IHRoaXMuc29ja2V0LFxuICAgICAgICByZWplY3RVbmF1dGhvcml6ZWQ6IHRoaXMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgICBjcmVkZW50aWFsczogY3JlZGVudGlhbHMgfHwgdGhpcy5jcmVkZW50aWFscyxcbiAgICAgICAgcmVxdWVzdENlcnQ6IHRoaXMucmVxdWVzdENlcnQsXG4gICAgICAgIGlzU2VydmVyOiAhIWlzU2VydmVyXG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuaXNTZWN1cmUgPSB0cnVlXG4gICAgICAgIHRoaXMub25jZSgnZGlzY29ubmVjdCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNTZWN1cmUgPSBmYWxzZVxuICAgICAgICB9KVxuICAgICAgICBjbGVhcnRleHQuZW1pdCgnY29ubmVjdCcsIGNsZWFydGV4dClcbiAgICB9LmJpbmQodGhpcykpXG4gICAgY2xlYXJ0ZXh0Lm9uKCdjbGllbnRFcnJvcicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdlcnJvcicpKVxuICAgIGlmICghdGhpcy5yZWNvbm5lY3QpIHtcbiAgICAgICAgdGhpcy5yZWNvbm5lY3QgPSB0cnVlIC8vIG5lZWQgdGhpcyBzbyBzdG9wUGFyc2VyIHdvcmtzIHByb3Blcmx5XG4gICAgICAgIHRoaXMub25jZSgncmVjb25uZWN0JywgZnVuY3Rpb24gKCkge3RoaXMucmVjb25uZWN0ID0gZmFsc2V9KVxuICAgIH1cbiAgICB0aGlzLnN0b3BQYXJzZXIoKVxuICAgIC8vIGlmIHdlIHJlY29ubmVjdCB3ZSBuZWVkIHRvIGdldCBiYWNrIHRvIHRoZSBwcmV2aW91cyBzb2NrZXQgY3JlYXRpb25cbiAgICB0aGlzLmxpc3Rlbih7c29ja2V0OmNsZWFydGV4dCwgcHJlc2VydmU6J29uJ30pXG59XG5cbmZ1bmN0aW9uIGdldEFsbFRleHQoZWwpIHtcbiAgICByZXR1cm4gIWVsLmNoaWxkcmVuID8gZWwgOiBlbC5jaGlsZHJlbi5yZWR1Y2UoZnVuY3Rpb24gKHRleHQsIGNoaWxkKSB7XG4gICAgICAgIHJldHVybiB0ZXh0ICsgZ2V0QWxsVGV4dChjaGlsZClcbiAgICB9LCAnJylcbn1cblxuLyoqXG4gKiBUaGlzIGlzIG5vdCBhbiBldmVudCBsaXN0ZW5lciwgYnV0IHRha2VzIGNhcmUgb2YgdGhlIFRMUyBoYW5kc2hha2VcbiAqIGJlZm9yZSAnc3RhbnphJyBldmVudHMgYXJlIGVtaXR0ZWQgdG8gdGhlIGRlcml2ZWQgY2xhc3Nlcy5cbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmlzKCdlcnJvcicsIE5TX1NUUkVBTSkpIHtcbiAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCcnICsgZ2V0QWxsVGV4dChzdGFuemEpKVxuICAgICAgICBlcnJvci5zdGFuemEgPSBzdGFuemFcbiAgICAgICAgdGhpcy5zb2NrZXQuZW1pdCgnZXJyb3InLCBlcnJvcilcbiAgICB9IGVsc2UgaWYgKHN0YW56YS5pcygnZmVhdHVyZXMnLCB0aGlzLk5TX1NUUkVBTSkgJiZcbiAgICAgICAgdGhpcy5hbGxvd1RMUyAmJlxuICAgICAgICAhdGhpcy5pc1NlY3VyZSAmJlxuICAgICAgICBzdGFuemEuZ2V0Q2hpbGQoJ3N0YXJ0dGxzJywgdGhpcy5OU19YTVBQX1RMUykpIHtcbiAgICAgICAgLyogU2lnbmFsIHdpbGxpbmduZXNzIHRvIHBlcmZvcm0gVExTIGhhbmRzaGFrZSAqL1xuICAgICAgICB0aGlzLnNlbmQobmV3IGx0eC5FbGVtZW50KCdzdGFydHRscycsIHsgeG1sbnM6IHRoaXMuTlNfWE1QUF9UTFMgfSkpXG4gICAgfSBlbHNlIGlmICh0aGlzLmFsbG93VExTICYmXG4gICAgICAgIHN0YW56YS5pcygncHJvY2VlZCcsIHRoaXMuTlNfWE1QUF9UTFMpKSB7XG4gICAgICAgIC8qIFNlcnZlciBpcyB3YWl0aW5nIGZvciBUTFMgaGFuZHNoYWtlICovXG4gICAgICAgIHRoaXMuc2V0U2VjdXJlKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbi8qKlxuICogQWRkIHN0cmVhbSB4bWxucyB0byBhIHN0YW56YVxuICpcbiAqIERvZXMgbm90IGFkZCBvdXIgZGVmYXVsdCB4bWxucyBhcyBpdCBpcyBkaWZmZXJlbnQgZm9yXG4gKiBDMlMvUzJTL0NvbXBvbmVudCBjb25uZWN0aW9ucy5cbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuYWRkU3RyZWFtTnMgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBmb3IgKHZhciBhdHRyIGluIHRoaXMuc3RyZWFtTnNBdHRycykge1xuICAgICAgICBpZiAoIXN0YW56YS5hdHRyc1thdHRyXSAmJlxuICAgICAgICAgICAgISgoYXR0ciA9PT0gJ3htbG5zJykgJiYgKHRoaXMuc3RyZWFtTnNBdHRyc1thdHRyXSA9PT0gdGhpcy54bWxuc1snJ10pKVxuICAgICAgICAgICApIHtcbiAgICAgICAgICAgIHN0YW56YS5hdHRyc1thdHRyXSA9IHRoaXMuc3RyZWFtTnNBdHRyc1thdHRyXVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdGFuemFcbn1cblxuLyoqXG4gKiBSZW1vdmUgc3VwZXJmbHVvdXMgeG1sbnMgdGhhdCB3ZXJlIGFsZWFkeSBkZWNsYXJlZCBpblxuICogb3VyIDxzdHJlYW06c3RyZWFtPlxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5ybVhtbG5zID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgZm9yICh2YXIgcHJlZml4IGluIHRoaXMueG1sbnMpIHtcbiAgICAgICAgdmFyIGF0dHIgPSBwcmVmaXggPyAneG1sbnM6JyArIHByZWZpeCA6ICd4bWxucydcbiAgICAgICAgaWYgKHN0YW56YS5hdHRyc1thdHRyXSA9PT0gdGhpcy54bWxuc1twcmVmaXhdKVxuICAgICAgICAgICAgZGVsZXRlIHN0YW56YS5hdHRyc1thdHRyXVxuICAgIH1cbiAgICByZXR1cm4gc3RhbnphXG59XG5cbi8qKlxuICogWE1QUC1zdHlsZSBlbmQgY29ubmVjdGlvbiBmb3IgdXNlclxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5vbkVuZCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnNvY2tldCAmJiB0aGlzLnNvY2tldC53cml0YWJsZSkge1xuICAgICAgICBpZiAodGhpcy5zdHJlYW1PcGVuZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LndyaXRlKCc8L3N0cmVhbTpzdHJlYW0+JylcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnN0cmVhbU9wZW5lZFxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICghdGhpcy5yZWNvbm5lY3QpXG4gICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUub25DbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5yZWNvbm5lY3QpXG4gICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnKVxufVxuXG4vKipcbiAqIEVuZCBjb25uZWN0aW9uIHdpdGggc3RyZWFtIGVycm9yLlxuICogRW1pdHMgJ2Vycm9yJyBldmVudCB0b28uXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IGNvbmRpdGlvbiBYTVBQIGVycm9yIGNvbmRpdGlvbiwgc2VlIFJGQzM5MjAgNC43LjMuIERlZmluZWQgQ29uZGl0aW9uc1xuICogQHBhcmFtIHtTdHJpbmd9IHRleHQgT3B0aW9uYWwgZXJyb3IgbWVzc2FnZVxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5lcnJvciA9IGZ1bmN0aW9uKGNvbmRpdGlvbiwgbWVzc2FnZSkge1xuICAgIHRoaXMuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IobWVzc2FnZSkpXG5cbiAgICBpZiAoIXRoaXMuc29ja2V0IHx8ICF0aGlzLnNvY2tldC53cml0YWJsZSkgcmV0dXJuXG5cbiAgICAvKiBSRkMgMzkyMCwgNC43LjEgc3RyZWFtLWxldmVsIGVycm9ycyBydWxlcyAqL1xuICAgIGlmICghdGhpcy5zdHJlYW1PcGVuZWQpIHRoaXMuc3RhcnRTdHJlYW0oKVxuXG4gICAgdmFyIGVycm9yID0gbmV3IGx0eC5FbGVtZW50KCdzdHJlYW06ZXJyb3InKVxuICAgIGVycm9yLmMoY29uZGl0aW9uLCB7IHhtbG5zOiBOU19YTVBQX1NUUkVBTVMgfSlcbiAgICBpZiAobWVzc2FnZSkge1xuICAgICAgICBlcnJvci5jKCAndGV4dCcsIHtcbiAgICAgICAgICAgIHhtbG5zOiBOU19YTVBQX1NUUkVBTVMsXG4gICAgICAgICAgICAneG1sOmxhbmcnOiAnZW4nXG4gICAgICAgIH0pLnQobWVzc2FnZSlcbiAgICB9XG5cbiAgICB0aGlzLnNlbmQoZXJyb3IpXG4gICAgdGhpcy5lbmQoKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IENvbm5lY3Rpb25cbiIsInZhciBTdHJpbmdQcmVwID0gcmVxdWlyZSgnbm9kZS1zdHJpbmdwcmVwJykuU3RyaW5nUHJlcFxuICAsIHRvVW5pY29kZSA9IHJlcXVpcmUoJ25vZGUtc3RyaW5ncHJlcCcpLnRvVW5pY29kZVxuXG5cbi8qKlxuICogSklEIGltcGxlbWVudHMgXG4gKiAtIFhtcHAgYWRkcmVzc2VzIGFjY29yZGluZyB0byBSRkM2MTIyXG4gKiAtIFhFUC0wMTA2OiBKSUQgRXNjYXBpbmdcbiAqXG4gKiBAc2VlIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzYxMjIjc2VjdGlvbi0yXG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTA2Lmh0bWxcbiAqL1xuZnVuY3Rpb24gSklEKGEsIGIsIGMpIHtcbiAgICB0aGlzLmxvY2FsID0gbnVsbFxuICAgIHRoaXMuZG9tYWluID0gbnVsbFxuICAgIHRoaXMucmVzb3VyY2UgPSBudWxsXG5cbiAgICBpZiAoYSAmJiAoIWIpICYmICghYykpIHtcbiAgICAgICAgdGhpcy5wYXJzZUpJRChhKVxuICAgIH0gZWxzZSBpZiAoYikge1xuICAgICAgICB0aGlzLnNldExvY2FsKGEpXG4gICAgICAgIHRoaXMuc2V0RG9tYWluKGIpXG4gICAgICAgIHRoaXMuc2V0UmVzb3VyY2UoYylcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0FyZ3VtZW50IGVycm9yJylcbiAgICB9XG59XG5cbkpJRC5wcm90b3R5cGUucGFyc2VKSUQgPSBmdW5jdGlvbihzKSB7XG4gICAgaWYgKHMuaW5kZXhPZignQCcpID49IDApIHtcbiAgICAgICAgdGhpcy5zZXRMb2NhbChzLnN1YnN0cigwLCBzLmxhc3RJbmRleE9mKCdAJykpKVxuICAgICAgICBzID0gcy5zdWJzdHIocy5sYXN0SW5kZXhPZignQCcpICsgMSlcbiAgICB9XG4gICAgaWYgKHMuaW5kZXhPZignLycpID49IDApIHtcbiAgICAgICAgdGhpcy5zZXRSZXNvdXJjZShzLnN1YnN0cihzLmluZGV4T2YoJy8nKSArIDEpKVxuICAgICAgICBzID0gcy5zdWJzdHIoMCwgcy5pbmRleE9mKCcvJykpXG4gICAgfVxuICAgIHRoaXMuc2V0RG9tYWluKHMpXG59XG5cbkpJRC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbih1bmVzY2FwZSkge1xuICAgIHZhciBzID0gdGhpcy5kb21haW5cbiAgICBpZiAodGhpcy5sb2NhbCkgcyA9IHRoaXMuZ2V0TG9jYWwodW5lc2NhcGUpICsgJ0AnICsgc1xuICAgIGlmICh0aGlzLnJlc291cmNlKSBzID0gcyArICcvJyArIHRoaXMucmVzb3VyY2VcbiAgICByZXR1cm4gc1xufVxuXG4vKipcbiAqIENvbnZlbmllbmNlIG1ldGhvZCB0byBkaXN0aW5ndWlzaCB1c2Vyc1xuICoqL1xuSklELnByb3RvdHlwZS5iYXJlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucmVzb3VyY2UpIHtcbiAgICAgICAgcmV0dXJuIG5ldyBKSUQodGhpcy5sb2NhbCwgdGhpcy5kb21haW4sIG51bGwpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG59XG5cbi8qKlxuICogQ29tcGFyaXNvbiBmdW5jdGlvblxuICoqL1xuSklELnByb3RvdHlwZS5lcXVhbHMgPSBmdW5jdGlvbihvdGhlcikge1xuICAgIHJldHVybiAodGhpcy5sb2NhbCA9PT0gb3RoZXIubG9jYWwpICYmXG4gICAgICAgICh0aGlzLmRvbWFpbiA9PT0gb3RoZXIuZG9tYWluKSAmJlxuICAgICAgICAodGhpcy5yZXNvdXJjZSA9PT0gb3RoZXIucmVzb3VyY2UpXG59XG5cbi8qIERlcHJlY2F0ZWQsIHVzZSBzZXRMb2NhbCgpIFtzZWUgUkZDNjEyMl0gKi9cbkpJRC5wcm90b3R5cGUuc2V0VXNlciA9IGZ1bmN0aW9uKHVzZXIpIHtcbiAgICByZXR1cm4gdGhpcy5zZXRMb2NhbCh1c2VyKVxufVxuXG4vKipcbiAqIFNldHRlcnMgdGhhdCBkbyBzdHJpbmdwcmVwIG5vcm1hbGl6YXRpb24uXG4gKiovXG5KSUQucHJvdG90eXBlLnNldExvY2FsID0gZnVuY3Rpb24obG9jYWwsIGVzY2FwZSkge1xuICAgIGVzY2FwZSA9IGVzY2FwZSB8fCB0aGlzLmRldGVjdEVzY2FwZShsb2NhbClcblxuICAgIGlmIChlc2NhcGUpIHtcbiAgICAgICAgbG9jYWwgPSB0aGlzLmVzY2FwZUxvY2FsKGxvY2FsKVxuICAgIH1cblxuICAgIHRoaXMubG9jYWwgPSB0aGlzLnVzZXIgPSBsb2NhbCAmJiB0aGlzLnByZXAoJ25vZGVwcmVwJywgbG9jYWwpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqXG4gKiBodHRwOi8veG1wcC5vcmcvcmZjcy9yZmM2MTIyLmh0bWwjYWRkcmVzc2luZy1kb21haW5cbiAqL1xuSklELnByb3RvdHlwZS5zZXREb21haW4gPSBmdW5jdGlvbihkb21haW4pIHtcbiAgICB0aGlzLmRvbWFpbiA9IGRvbWFpbiAmJlxuICAgICAgICB0aGlzLnByZXAoJ25hbWVwcmVwJywgZG9tYWluLnNwbGl0KCcuJykubWFwKHRvVW5pY29kZSkuam9pbignLicpKVxuICAgIHJldHVybiB0aGlzXG59XG5cbkpJRC5wcm90b3R5cGUuc2V0UmVzb3VyY2UgPSBmdW5jdGlvbihyZXNvdXJjZSkge1xuICAgIHRoaXMucmVzb3VyY2UgPSByZXNvdXJjZSAmJiB0aGlzLnByZXAoJ3Jlc291cmNlcHJlcCcsIHJlc291cmNlKVxuICAgIHJldHVybiB0aGlzXG59XG5cbkpJRC5wcm90b3R5cGUuZ2V0TG9jYWwgPSBmdW5jdGlvbih1bmVzY2FwZSkge1xuICAgIHVuZXNjYXBlID0gdW5lc2NhcGUgfHwgZmFsc2VcbiAgICB2YXIgbG9jYWwgPSBudWxsXG4gICAgXG4gICAgaWYgKHVuZXNjYXBlKSB7XG4gICAgICAgIGxvY2FsID0gdGhpcy51bmVzY2FwZUxvY2FsKHRoaXMubG9jYWwpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgbG9jYWwgPSB0aGlzLmxvY2FsXG4gICAgfVxuXG4gICAgcmV0dXJuIGxvY2FsO1xufVxuXG5KSUQucHJvdG90eXBlLnByZXAgPSBmdW5jdGlvbihvcGVyYXRpb24sIHZhbHVlKSB7XG4gICAgdmFyIHAgPSBuZXcgU3RyaW5nUHJlcChvcGVyYXRpb24pXG4gICAgcmV0dXJuIHAucHJlcGFyZSh2YWx1ZSlcbn1cblxuLyogRGVwcmVjYXRlZCwgdXNlIGdldExvY2FsKCkgW3NlZSBSRkM2MTIyXSAqL1xuSklELnByb3RvdHlwZS5nZXRVc2VyID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0TG9jYWwoKVxufVxuXG5KSUQucHJvdG90eXBlLmdldERvbWFpbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmRvbWFpblxufVxuXG5KSUQucHJvdG90eXBlLmdldFJlc291cmNlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzb3VyY2Vcbn1cblxuSklELnByb3RvdHlwZS5kZXRlY3RFc2NhcGUgPSBmdW5jdGlvbiAobG9jYWwpIHtcbiAgICBpZiAoIWxvY2FsKSByZXR1cm4gZmFsc2VcblxuICAgIC8vIHJlbW92ZSBhbGwgZXNjYXBlZCBzZWNxdWVuY2VzXG4gICAgdmFyIHRtcCA9IGxvY2FsLnJlcGxhY2UoL1xcXFwyMC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyMi9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyNi9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyNy9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyZi9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzYS9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzYy9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzZS9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFw0MC9nLCAnJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFw1Yy9nLCAnJylcblxuICAgIC8vIGRldGVjdCBpZiB3ZSBoYXZlIHVuZXNjYXBlZCBzZXF1ZW5jZXNcbiAgICB2YXIgc2VhcmNoID0gdG1wLnNlYXJjaCgvXFxcXHwgfFxcXCJ8XFwmfFxcJ3xcXC98Onw8fD58QC9nKTtcbiAgICBpZiAoc2VhcmNoID09PSAtMSkge1xuICAgICAgICByZXR1cm4gZmFsc2VcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdHJ1ZVxuICAgIH1cbn1cblxuLyoqIFxuICogRXNjYXBlIHRoZSBsb2NhbCBwYXJ0IG9mIGEgSklELlxuICpcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxMDYuaHRtbFxuICogQHBhcmFtIFN0cmluZyBsb2NhbCBsb2NhbCBwYXJ0IG9mIGEgamlkXG4gKiBAcmV0dXJuIEFuIGVzY2FwZWQgbG9jYWwgcGFydFxuICovXG5KSUQucHJvdG90eXBlLmVzY2FwZUxvY2FsID0gZnVuY3Rpb24gKGxvY2FsKSB7XG4gICAgaWYgKGxvY2FsID09PSBudWxsKSByZXR1cm4gbnVsbFxuXG4gICAgLyoganNoaW50IC1XMDQ0ICovXG4gICAgcmV0dXJuIGxvY2FsLnJlcGxhY2UoL15cXHMrfFxccyskL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXC9nLCAnXFxcXDVjJylcbiAgICAgICAgLnJlcGxhY2UoLyAvZywgJ1xcXFwyMCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXFwiL2csICdcXFxcMjInKVxuICAgICAgICAucmVwbGFjZSgvXFwmL2csICdcXFxcMjYnKVxuICAgICAgICAucmVwbGFjZSgvXFwnL2csICdcXFxcMjcnKVxuICAgICAgICAucmVwbGFjZSgvXFwvL2csICdcXFxcMmYnKVxuICAgICAgICAucmVwbGFjZSgvOi9nLCAnXFxcXDNhJylcbiAgICAgICAgLnJlcGxhY2UoLzwvZywgJ1xcXFwzYycpXG4gICAgICAgIC5yZXBsYWNlKC8+L2csICdcXFxcM2UnKVxuICAgICAgICAucmVwbGFjZSgvQC9nLCAnXFxcXDQwJylcbiAgICAgICAgLnJlcGxhY2UoL1xcM2EvZywgJ1xcNWMzYScpXG4gICAgICAgXG4gICAgXG59XG5cbi8qKiBcbiAqIFVuZXNjYXBlIGEgbG9jYWwgcGFydCBvZiBhIEpJRC5cbiAqXG4gKiBAc2VlIGh0dHA6Ly94bXBwLm9yZy9leHRlbnNpb25zL3hlcC0wMTA2Lmh0bWxcbiAqIEBwYXJhbSBTdHJpbmcgbG9jYWwgbG9jYWwgcGFydCBvZiBhIGppZFxuICogQHJldHVybiB1bmVzY2FwZWQgbG9jYWwgcGFydFxuICovXG5KSUQucHJvdG90eXBlLnVuZXNjYXBlTG9jYWwgPSBmdW5jdGlvbiAobG9jYWwpIHtcbiAgICBpZiAobG9jYWwgPT09IG51bGwpIHJldHVybiBudWxsXG5cbiAgICByZXR1cm4gbG9jYWwucmVwbGFjZSgvXFxcXDIwL2csICcgJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyMi9nLCAnXFxcIicpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjYvZywgJyYnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDI3L2csICdcXCcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDJmL2csICcvJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzYS9nLCAnOicpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2MvZywgJzwnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNlL2csICc+JylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFw0MC9nLCAnQCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcNWMvZywgJ1xcXFwnKVxufVxuXG5pZiAoKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykgJiYgKGV4cG9ydHMgIT09IG51bGwpKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBKSURcbn0gZWxzZSBpZiAoKHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnKSAmJiAod2luZG93ICE9PSBudWxsKSkge1xuICAgIHdpbmRvdy5KSUQgPSBKSURcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxuXG52YXIgZG5zID0gcmVxdWlyZSgnZG5zJylcblxuZnVuY3Rpb24gY29tcGFyZU51bWJlcnMoYSwgYikge1xuICAgIGEgPSBwYXJzZUludChhLCAxMClcbiAgICBiID0gcGFyc2VJbnQoYiwgMTApXG4gICAgaWYgKGEgPCBiKVxuICAgICAgICByZXR1cm4gLTFcbiAgICBpZiAoYSA+IGIpXG4gICAgICAgIHJldHVybiAxXG4gICAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gZ3JvdXBTcnZSZWNvcmRzKGFkZHJzKSB7XG4gICAgdmFyIGdyb3VwcyA9IHt9ICAvLyBieSBwcmlvcml0eVxuICAgIGFkZHJzLmZvckVhY2goZnVuY3Rpb24oYWRkcikge1xuICAgICAgICBpZiAoIWdyb3Vwcy5oYXNPd25Qcm9wZXJ0eShhZGRyLnByaW9yaXR5KSlcbiAgICAgICAgICAgIGdyb3Vwc1thZGRyLnByaW9yaXR5XSA9IFtdXG5cbiAgICAgICAgZ3JvdXBzW2FkZHIucHJpb3JpdHldLnB1c2goYWRkcilcbiAgICB9KVxuXG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgT2JqZWN0LmtleXMoZ3JvdXBzKS5zb3J0KGNvbXBhcmVOdW1iZXJzKS5mb3JFYWNoKGZ1bmN0aW9uKHByaW9yaXR5KSB7XG4gICAgICAgIHZhciBncm91cCA9IGdyb3Vwc1twcmlvcml0eV1cbiAgICAgICAgdmFyIHRvdGFsV2VpZ2h0ID0gMFxuICAgICAgICBncm91cC5mb3JFYWNoKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgICAgIHRvdGFsV2VpZ2h0ICs9IGFkZHIud2VpZ2h0XG4gICAgICAgIH0pXG4gICAgICAgIHZhciB3ID0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogdG90YWxXZWlnaHQpXG4gICAgICAgIHRvdGFsV2VpZ2h0ID0gMFxuICAgICAgICB2YXIgY2FuZGlkYXRlID0gZ3JvdXBbMF1cbiAgICAgICAgZ3JvdXAuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICB0b3RhbFdlaWdodCArPSBhZGRyLndlaWdodFxuICAgICAgICAgICAgaWYgKHcgPCB0b3RhbFdlaWdodClcbiAgICAgICAgICAgICAgICBjYW5kaWRhdGUgPSBhZGRyXG4gICAgICAgIH0pXG4gICAgICAgIGlmIChjYW5kaWRhdGUpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjYW5kaWRhdGUpXG4gICAgfSlcbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVTcnYobmFtZSwgY2IpIHtcbiAgICBkbnMucmVzb2x2ZVNydihuYW1lLCBmdW5jdGlvbihlcnIsIGFkZHJzKSB7XG4gICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgIC8qIG5vIFNSViByZWNvcmQsIHRyeSBkb21haW4gYXMgQSAqL1xuICAgICAgICAgICAgY2IoZXJyKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIHBlbmRpbmcgPSAwLCBlcnJvciwgcmVzdWx0cyA9IFtdXG4gICAgICAgICAgICB2YXIgY2IxID0gZnVuY3Rpb24oZSwgYWRkcnMxKSB7XG4gICAgICAgICAgICAgICAgZXJyb3IgPSBlcnJvciB8fCBlXG4gICAgICAgICAgICAgICAgcmVzdWx0cyA9IHJlc3VsdHMuY29uY2F0KGFkZHJzMSlcbiAgICAgICAgICAgICAgICBwZW5kaW5nLS1cbiAgICAgICAgICAgICAgICBpZiAocGVuZGluZyA8IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgY2IocmVzdWx0cyA/IG51bGwgOiBlcnJvciwgcmVzdWx0cylcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB2YXIgZ1NSViA9IGdyb3VwU3J2UmVjb3JkcyhhZGRycylcbiAgICAgICAgICAgIHBlbmRpbmcgPSBnU1JWLmxlbmd0aFxuICAgICAgICAgICAgZ1NSVi5mb3JFYWNoKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgICAgICAgICByZXNvbHZlSG9zdChhZGRyLm5hbWUsIGZ1bmN0aW9uKGUsIGEpIHtcbiAgICAgICAgICAgICAgICAgICAgaWYgKGEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGEgPSBhLm1hcChmdW5jdGlvbihhMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiB7IG5hbWU6IGExLCBwb3J0OiBhZGRyLnBvcnQgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYjEoZSwgYSlcbiAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgIH0pXG59XG5cbi8vIG9uZSBvZiBib3RoIEEgJiBBQUFBLCBpbiBjYXNlIG9mIGJyb2tlbiB0dW5uZWxzXG5mdW5jdGlvbiByZXNvbHZlSG9zdChuYW1lLCBjYikge1xuICAgIHZhciBlcnJvciwgcmVzdWx0cyA9IFtdXG4gICAgdmFyIGNiMSA9IGZ1bmN0aW9uKGUsIGFkZHIpIHtcbiAgICAgICAgZXJyb3IgPSBlcnJvciB8fCBlXG4gICAgICAgIGlmIChhZGRyKVxuICAgICAgICAgICAgcmVzdWx0cy5wdXNoKGFkZHIpXG5cbiAgICAgICAgY2IoKHJlc3VsdHMubGVuZ3RoID4gMCkgPyBudWxsIDogZXJyb3IsIHJlc3VsdHMpXG4gICAgfVxuXG4gICAgZG5zLmxvb2t1cChuYW1lLCBjYjEpXG59XG5cbi8vIGNvbm5lY3Rpb24gYXR0ZW1wdHMgdG8gbXVsdGlwbGUgYWRkcmVzc2VzIGluIGEgcm93XG5mdW5jdGlvbiB0cnlDb25uZWN0KGNvbm5lY3Rpb24sIGFkZHJzKSB7XG4gICAgY29ubmVjdGlvbi5vbignY29ubmVjdCcsIGNsZWFudXApXG4gICAgY29ubmVjdGlvbi5vbignZGlzY29ubmVjdCcsIGNvbm5lY3ROZXh0KVxuICAgIHJldHVybiBjb25uZWN0TmV4dCgpXG5cbiAgICBmdW5jdGlvbiBjbGVhbnVwKCkge1xuICAgICAgICBjb25uZWN0aW9uLnJlbW92ZUxpc3RlbmVyKCdjb25uZWN0JywgY2xlYW51cClcbiAgICAgICAgY29ubmVjdGlvbi5yZW1vdmVMaXN0ZW5lcignZGlzY29ubmVjdCcsIGNvbm5lY3ROZXh0KVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNvbm5lY3ROZXh0KCkge1xuICAgICAgICB2YXIgYWRkciA9IGFkZHJzLnNoaWZ0KClcbiAgICAgICAgaWYgKGFkZHIpXG4gICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldC5jb25uZWN0KGFkZHIucG9ydCwgYWRkci5uYW1lKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgICBjbGVhbnVwKClcbiAgICB9XG59XG5cbi8vIHJldHVybnMgYSBsYXp5IGl0ZXJhdG9yIHdoaWNoIGNhbiBiZSByZXN0YXJ0ZWQgdmlhIGNvbm5lY3Rpb24uY29ubmVjdCgpXG5leHBvcnRzLmNvbm5lY3QgPSBmdW5jdGlvbiBjb25uZWN0KG9wdHMpIHtcbiAgICB2YXIgc2VydmljZXMgPSBvcHRzLnNlcnZpY2VzLnNsaWNlKClcbiAgICAvLyBsYXp5IGV2YWx1YXRpb24gdG8gZGV0ZXJtaW5lIGVuZHBvaW50XG4gICAgZnVuY3Rpb24gdHJ5U2VydmljZXMocmV0cnkpIHtcbiAgICAgICAgLyoganNoaW50IC1XMDQwICovXG4gICAgICAgIHZhciBjb25uZWN0aW9uID0gdGhpc1xuICAgICAgICBpZiAoIWNvbm5lY3Rpb24uc29ja2V0ICYmIG9wdHMuc29ja2V0KSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIG9wdHMuc29ja2V0ID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQgPSBvcHRzLnNvY2tldC5jYWxsKHRoaXMpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gb3B0cy5zb2NrZXRcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG9wdHMuc29ja2V0ID0gbnVsbFxuICAgICAgICB9IGVsc2UgaWYgKCFyZXRyeSkge1xuICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQgPSBudWxsXG4gICAgICAgIH1cbiAgICAgICAgdmFyIHNlcnZpY2UgPSBzZXJ2aWNlcy5zaGlmdCgpXG4gICAgICAgIGlmIChzZXJ2aWNlKSB7XG4gICAgICAgICAgICByZXNvbHZlU3J2KHNlcnZpY2UgKyAnLicgKyBvcHRzLmRvbWFpbiwgZnVuY3Rpb24oZXJyb3IsIGFkZHJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGFkZHJzKVxuICAgICAgICAgICAgICAgICAgICB0cnlDb25uZWN0KGNvbm5lY3Rpb24sIGFkZHJzKVxuICAgICAgICAgICAgICAgIC8vIGNhbGwgdHJ5U2VydmljZXMgYWdhaW5cbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdHJ5U2VydmljZXMuY2FsbChjb25uZWN0aW9uLCAncmV0cnknKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXNvbHZlSG9zdChvcHRzLmRvbWFpbiwgZnVuY3Rpb24oZXJyb3IsIGFkZHJzKSB7XG4gICAgICAgICAgICAgICAgaWYgKGFkZHJzICYmIGFkZHJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkcnMgPSBhZGRycy5tYXAoZnVuY3Rpb24oYWRkcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgbmFtZTogYWRkcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHBvcnQ6IG9wdHMuZGVmYXVsdFBvcnQgfVxuICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB0cnlDb25uZWN0KGNvbm5lY3Rpb24sIGFkZHJzKVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoY29ubmVjdGlvbi5yZWNvbm5lY3QpICB7XG4gICAgICAgICAgICAgICAgICAgIC8vIHJldHJ5IGZyb20gdGhlIGJlZ2lubmluZ1xuICAgICAgICAgICAgICAgICAgICBzZXJ2aWNlcyA9IG9wdHMuc2VydmljZXMuc2xpY2UoKVxuICAgICAgICAgICAgICAgICAgICAvLyBnZXQgYSBuZXcgc29ja2V0XG4gICAgICAgICAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0ID0gbnVsbFxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yID0gZXJyb3IgfHwgbmV3IEVycm9yKCdObyBhZGRyZXNzZXMgcmVzb2x2ZWQgZm9yICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb3B0cy5kb21haW4pXG4gICAgICAgICAgICAgICAgICAgIGNvbm5lY3Rpb24uZW1pdCgnZXJyb3InLCBlcnJvcilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiBjb25uZWN0aW9uLnNvY2tldFxuICAgIH1cbiAgICByZXR1cm4gdHJ5U2VydmljZXNcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBsdHggPSByZXF1aXJlKCdsdHgnKVxuXG5mdW5jdGlvbiBTdGFuemEobmFtZSwgYXR0cnMpIHtcbiAgICBsdHguRWxlbWVudC5jYWxsKHRoaXMsIG5hbWUsIGF0dHJzKVxufVxuXG51dGlsLmluaGVyaXRzKFN0YW56YSwgbHR4LkVsZW1lbnQpXG5cblN0YW56YS5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2xvbmUgPSBuZXcgU3RhbnphKHRoaXMubmFtZSwge30pXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIGlmICh0aGlzLmF0dHJzLmhhc093blByb3BlcnR5KGspKVxuICAgICAgICAgICAgY2xvbmUuYXR0cnNba10gPSB0aGlzLmF0dHJzW2tdXG4gICAgfVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGNsb25lLmNub2RlKGNoaWxkLmNsb25lID8gY2hpbGQuY2xvbmUoKSA6IGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gY2xvbmVcbn1cblxuLyoqXG4gKiBDb21tb24gYXR0cmlidXRlIGdldHRlcnMvc2V0dGVycyBmb3IgYWxsIHN0YW56YXNcbiAqL1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbnphLnByb3RvdHlwZSwgJ2Zyb20nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMuZnJvbVxuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKGZyb20pIHtcbiAgICAgICAgdGhpcy5hdHRycy5mcm9tID0gZnJvbVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbnphLnByb3RvdHlwZSwgJ3RvJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLnRvXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24odG8pIHtcbiAgICAgICAgdGhpcy5hdHRycy50byA9IHRvXG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuemEucHJvdG90eXBlLCAnaWQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMuaWRcbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbihpZCkge1xuICAgICAgICB0aGlzLmF0dHJzLmlkID0gaWRcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICd0eXBlJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzLnR5cGVcbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbih0eXBlKSB7XG4gICAgICAgIHRoaXMuYXR0cnMudHlwZSA9IHR5cGVcbiAgICB9XG59KTtcblxuLyoqXG4gKiBTdGFuemEga2luZHNcbiAqL1xuXG5mdW5jdGlvbiBNZXNzYWdlKGF0dHJzKSB7XG4gICAgU3RhbnphLmNhbGwodGhpcywgJ21lc3NhZ2UnLCBhdHRycylcbn1cblxudXRpbC5pbmhlcml0cyhNZXNzYWdlLCBTdGFuemEpXG5cbmZ1bmN0aW9uIFByZXNlbmNlKGF0dHJzKSB7XG4gICAgU3RhbnphLmNhbGwodGhpcywgJ3ByZXNlbmNlJywgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoUHJlc2VuY2UsIFN0YW56YSlcblxuZnVuY3Rpb24gSXEoYXR0cnMpIHtcbiAgICBTdGFuemEuY2FsbCh0aGlzLCAnaXEnLCBhdHRycylcbn1cblxudXRpbC5pbmhlcml0cyhJcSwgU3RhbnphKVxuXG5leHBvcnRzLkVsZW1lbnQgPSBsdHguRWxlbWVudFxuZXhwb3J0cy5TdGFuemEgPSBTdGFuemFcbmV4cG9ydHMuTWVzc2FnZSA9IE1lc3NhZ2VcbmV4cG9ydHMuUHJlc2VuY2UgPSBQcmVzZW5jZVxuZXhwb3J0cy5JcSA9IElxXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgbHR4ID0gcmVxdWlyZSgnbHR4JylcbiAgLCBTdGFuemEgPSByZXF1aXJlKCcuL3N0YW56YScpLlN0YW56YVxuXG4vKipcbiAqIFJlY29nbml6ZXMgPHN0cmVhbTpzdHJlYW0+IGFuZCBjb2xsZWN0cyBzdGFuemFzIHVzZWQgZm9yIG9yZGluYXJ5XG4gKiBUQ1Agc3RyZWFtcyBhbmQgV2Vic29ja2V0cy5cbiAqXG4gKiBBUEk6IHdyaXRlKGRhdGEpICYgZW5kKGRhdGEpXG4gKiBFdmVudHM6IHN0cmVhbVN0YXJ0LCBzdGFuemEsIGVuZCwgZXJyb3JcbiAqL1xuZnVuY3Rpb24gU3RyZWFtUGFyc2VyKG1heFN0YW56YVNpemUpIHtcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdmFyIHNlbGYgPSB0aGlzXG4gICAgdGhpcy5wYXJzZXIgPSBuZXcgbHR4LmJlc3RTYXhQYXJzZXIoKVxuXG4gICAgLyogQ291bnQgdHJhZmZpYyBmb3IgZW50aXJlIGxpZmUtdGltZSAqL1xuICAgIHRoaXMuYnl0ZXNQYXJzZWQgPSAwXG4gICAgdGhpcy5tYXhTdGFuemFTaXplID0gbWF4U3RhbnphU2l6ZVxuICAgIC8qIFdpbGwgYmUgcmVzZXQgdXBvbiBmaXJzdCBzdGFuemEsIGJ1dCBlbmZvcmNlIG1heFN0YW56YVNpemUgdW50aWwgaXQgaXMgcGFyc2VkICovXG4gICAgdGhpcy5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW4gPSAwXG5cbiAgICB0aGlzLnBhcnNlci5vbignc3RhcnRFbGVtZW50JywgZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICAgICAgICAgIC8vIFRPRE86IHJlZnVzZSBhbnl0aGluZyBidXQgPHN0cmVhbTpzdHJlYW0+XG4gICAgICAgICAgICBpZiAoIXNlbGYuZWxlbWVudCAmJiAobmFtZSA9PT0gJ3N0cmVhbTpzdHJlYW0nKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnc3RyZWFtU3RhcnQnLCBhdHRycylcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIGNoaWxkXG4gICAgICAgICAgICAgICAgaWYgKCFzZWxmLmVsZW1lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLyogQSBuZXcgc3RhbnphICovXG4gICAgICAgICAgICAgICAgICAgIGNoaWxkID0gbmV3IFN0YW56YShuYW1lLCBhdHRycylcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5lbGVtZW50ID0gY2hpbGRcbiAgICAgICAgICAgICAgICAgICAgICAvKiBGb3IgbWF4U3RhbnphU2l6ZSBlbmZvcmNlbWVudCAqL1xuICAgICAgICAgICAgICAgICAgICBzZWxmLmJ5dGVzUGFyc2VkT25TdGFuemFCZWdpbiA9IHNlbGYuYnl0ZXNQYXJzZWRcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvKiBBIGNoaWxkIGVsZW1lbnQgb2YgYSBzdGFuemEgKi9cbiAgICAgICAgICAgICAgICAgICAgY2hpbGQgPSBuZXcgbHR4LkVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuZWxlbWVudCA9IHNlbGYuZWxlbWVudC5jbm9kZShjaGlsZClcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICApXG5cbiAgICB0aGlzLnBhcnNlci5vbignZW5kRWxlbWVudCcsIGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgICAgaWYgKCFzZWxmLmVsZW1lbnQgJiYgKG5hbWUgPT09ICdzdHJlYW06c3RyZWFtJykpIHtcbiAgICAgICAgICAgIHNlbGYuZW5kKClcbiAgICAgICAgfSBlbHNlIGlmIChzZWxmLmVsZW1lbnQgJiYgKG5hbWUgPT09IHNlbGYuZWxlbWVudC5uYW1lKSkge1xuICAgICAgICAgICAgaWYgKHNlbGYuZWxlbWVudC5wYXJlbnQpIHtcbiAgICAgICAgICAgICAgICBzZWxmLmVsZW1lbnQgPSBzZWxmLmVsZW1lbnQucGFyZW50XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8qIFN0YW56YSBjb21wbGV0ZSAqL1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnc3RhbnphJywgc2VsZi5lbGVtZW50KVxuICAgICAgICAgICAgICAgIGRlbGV0ZSBzZWxmLmVsZW1lbnRcbiAgICAgICAgICAgICAgICAvKiBtYXhTdGFuemFTaXplIGRvZXNuJ3QgYXBwbHkgdW50aWwgbmV4dCBzdGFydEVsZW1lbnQgKi9cbiAgICAgICAgICAgICAgICBkZWxldGUgc2VsZi5ieXRlc1BhcnNlZE9uU3RhbnphQmVnaW5cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNlbGYuZXJyb3IoJ3htbC1ub3Qtd2VsbC1mb3JtZWQnLCAnWE1MIHBhcnNlIGVycm9yJylcbiAgICAgICAgfVxuICAgIH0pXG5cbiAgICB0aGlzLnBhcnNlci5vbigndGV4dCcsIGZ1bmN0aW9uKHN0cikge1xuICAgICAgICBpZiAoc2VsZi5lbGVtZW50KVxuICAgICAgICAgICAgc2VsZi5lbGVtZW50LnQoc3RyKVxuICAgIH0pXG5cbiAgICB0aGlzLnBhcnNlci5vbignZW50aXR5RGVjbCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAvKiBFbnRpdHkgZGVjbGFyYXRpb25zIGFyZSBmb3JiaWRkZW4gaW4gWE1QUC4gV2UgbXVzdCBhYm9ydCB0b1xuICAgICAgICAgKiBhdm9pZCBhIGJpbGxpb24gbGF1Z2hzLlxuICAgICAgICAgKi9cbiAgICAgICAgc2VsZi5lcnJvcigneG1sLW5vdC13ZWxsLWZvcm1lZCcsICdObyBlbnRpdHkgZGVjbGFyYXRpb25zIGFsbG93ZWQnKVxuICAgICAgICBzZWxmLmVuZCgpXG4gICAgfSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdlcnJvcicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdlcnJvcicpKVxufVxuXG51dGlsLmluaGVyaXRzKFN0cmVhbVBhcnNlciwgRXZlbnRFbWl0dGVyKVxuXG5cbi8qIFxuICogaGFjayBmb3IgbW9zdCB1c2VjYXNlcywgZG8gd2UgaGF2ZSBhIGJldHRlciBpZGVhP1xuICogICBjYXRjaCB0aGUgZm9sbG93aW5nOlxuICogICA8P3htbCB2ZXJzaW9uPVwiMS4wXCI/PlxuICogICA8P3htbCB2ZXJzaW9uPVwiMS4wXCIgZW5jb2Rpbmc9XCJVVEYtOFwiPz5cbiAqICAgPD94bWwgdmVyc2lvbj1cIjEuMFwiIGVuY29kaW5nPVwiVVRGLTE2XCIgc3RhbmRhbG9uZT1cInllc1wiPz5cbiAqL1xuU3RyZWFtUGFyc2VyLnByb3RvdHlwZS5jaGVja1hNTEhlYWRlciA9IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgLy8gY2hlY2sgZm9yIHhtbCB0YWdcbiAgICB2YXIgaW5kZXggPSBkYXRhLmluZGV4T2YoJzw/eG1sJyk7XG5cbiAgICBpZiAoaW5kZXggIT09IC0xKSB7XG4gICAgICAgIHZhciBlbmQgPSBkYXRhLmluZGV4T2YoJz8+Jyk7XG4gICAgICAgIGlmIChpbmRleCA+PSAwICYmIGVuZCA+PSAwICYmIGluZGV4IDwgZW5kKzIpIHtcbiAgICAgICAgICAgIHZhciBzZWFyY2ggPSBkYXRhLnN1YnN0cmluZyhpbmRleCxlbmQrMik7XG4gICAgICAgICAgICBkYXRhID0gZGF0YS5yZXBsYWNlKHNlYXJjaCwgJycpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGRhdGE7XG59XG5cblN0cmVhbVBhcnNlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgLyppZiAoL148c3RyZWFtOnN0cmVhbSBbXj5dK1xcLz4kLy50ZXN0KGRhdGEpKSB7XG4gICAgZGF0YSA9IGRhdGEucmVwbGFjZSgvXFwvPiQvLCBcIj5cIilcbiAgICB9Ki9cbiAgICBpZiAodGhpcy5wYXJzZXIpIHtcbiAgICAgICAgXG4gICAgICAgIGRhdGEgPSBkYXRhLnRvU3RyaW5nKCd1dGY4JylcbiAgICAgICAgZGF0YSA9IHRoaXMuY2hlY2tYTUxIZWFkZXIoZGF0YSlcblxuICAgIC8qIElmIGEgbWF4U3RhbnphU2l6ZSBpcyBjb25maWd1cmVkLCB0aGUgY3VycmVudCBzdGFuemEgbXVzdCBjb25zaXN0IG9ubHkgb2YgdGhpcyBtYW55IGJ5dGVzICovXG4gICAgICAgIGlmICh0aGlzLmJ5dGVzUGFyc2VkT25TdGFuemFCZWdpbiAmJiB0aGlzLm1heFN0YW56YVNpemUgJiZcbiAgICAgICAgICAgIHRoaXMuYnl0ZXNQYXJzZWQgPiB0aGlzLmJ5dGVzUGFyc2VkT25TdGFuemFCZWdpbiArIHRoaXMubWF4U3RhbnphU2l6ZSkge1xuXG4gICAgICAgICAgICB0aGlzLmVycm9yKCdwb2xpY3ktdmlvbGF0aW9uJywgJ01heGltdW0gc3RhbnphIHNpemUgZXhjZWVkZWQnKVxuICAgICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5ieXRlc1BhcnNlZCArPSBkYXRhLmxlbmd0aFxuXG4gICAgICAgIHRoaXMucGFyc2VyLndyaXRlKGRhdGEpXG4gICAgfVxufVxuXG5TdHJlYW1QYXJzZXIucHJvdG90eXBlLmVuZCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICBpZiAoZGF0YSkge1xuICAgICAgICB0aGlzLndyaXRlKGRhdGEpXG4gICAgfVxuICAgIC8qIEdldCBHQydlZCAqL1xuICAgIGRlbGV0ZSB0aGlzLnBhcnNlclxuICAgIHRoaXMuZW1pdCgnZW5kJylcbn1cblxuU3RyZWFtUGFyc2VyLnByb3RvdHlwZS5lcnJvciA9IGZ1bmN0aW9uKGNvbmRpdGlvbiwgbWVzc2FnZSkge1xuICAgIHZhciBlID0gbmV3IEVycm9yKG1lc3NhZ2UpXG4gICAgZS5jb25kaXRpb24gPSBjb25kaXRpb25cbiAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZSlcbn1cblxuZXhwb3J0cy5TdHJlYW1QYXJzZXIgPSBTdHJlYW1QYXJzZXIiLCJcbi8qKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbm1vZHVsZS5leHBvcnRzID0gZGVidWc7XG5cbi8qKlxuICogQ3JlYXRlIGEgZGVidWdnZXIgd2l0aCB0aGUgZ2l2ZW4gYG5hbWVgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtUeXBlfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBkZWJ1ZyhuYW1lKSB7XG4gIGlmICghZGVidWcuZW5hYmxlZChuYW1lKSkgcmV0dXJuIGZ1bmN0aW9uKCl7fTtcblxuICByZXR1cm4gZnVuY3Rpb24oZm10KXtcbiAgICBmbXQgPSBjb2VyY2UoZm10KTtcblxuICAgIHZhciBjdXJyID0gbmV3IERhdGU7XG4gICAgdmFyIG1zID0gY3VyciAtIChkZWJ1Z1tuYW1lXSB8fCBjdXJyKTtcbiAgICBkZWJ1Z1tuYW1lXSA9IGN1cnI7XG5cbiAgICBmbXQgPSBuYW1lXG4gICAgICArICcgJ1xuICAgICAgKyBmbXRcbiAgICAgICsgJyArJyArIGRlYnVnLmh1bWFuaXplKG1zKTtcblxuICAgIC8vIFRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4XG4gICAgLy8gd2hlcmUgYGNvbnNvbGUubG9nYCBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICAgIHdpbmRvdy5jb25zb2xlXG4gICAgICAmJiBjb25zb2xlLmxvZ1xuICAgICAgJiYgRnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LmNhbGwoY29uc29sZS5sb2csIGNvbnNvbGUsIGFyZ3VtZW50cyk7XG4gIH1cbn1cblxuLyoqXG4gKiBUaGUgY3VycmVudGx5IGFjdGl2ZSBkZWJ1ZyBtb2RlIG5hbWVzLlxuICovXG5cbmRlYnVnLm5hbWVzID0gW107XG5kZWJ1Zy5za2lwcyA9IFtdO1xuXG4vKipcbiAqIEVuYWJsZXMgYSBkZWJ1ZyBtb2RlIGJ5IG5hbWUuIFRoaXMgY2FuIGluY2x1ZGUgbW9kZXNcbiAqIHNlcGFyYXRlZCBieSBhIGNvbG9uIGFuZCB3aWxkY2FyZHMuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZGVidWcuZW5hYmxlID0gZnVuY3Rpb24obmFtZSkge1xuICB0cnkge1xuICAgIGxvY2FsU3RvcmFnZS5kZWJ1ZyA9IG5hbWU7XG4gIH0gY2F0Y2goZSl7fVxuXG4gIHZhciBzcGxpdCA9IChuYW1lIHx8ICcnKS5zcGxpdCgvW1xccyxdKy8pXG4gICAgLCBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG5hbWUgPSBzcGxpdFtpXS5yZXBsYWNlKCcqJywgJy4qPycpO1xuICAgIGlmIChuYW1lWzBdID09PSAnLScpIHtcbiAgICAgIGRlYnVnLnNraXBzLnB1c2gobmV3IFJlZ0V4cCgnXicgKyBuYW1lLnN1YnN0cigxKSArICckJykpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgIGRlYnVnLm5hbWVzLnB1c2gobmV3IFJlZ0V4cCgnXicgKyBuYW1lICsgJyQnKSk7XG4gICAgfVxuICB9XG59O1xuXG4vKipcbiAqIERpc2FibGUgZGVidWcgb3V0cHV0LlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZGVidWcuZGlzYWJsZSA9IGZ1bmN0aW9uKCl7XG4gIGRlYnVnLmVuYWJsZSgnJyk7XG59O1xuXG4vKipcbiAqIEh1bWFuaXplIHRoZSBnaXZlbiBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5kZWJ1Zy5odW1hbml6ZSA9IGZ1bmN0aW9uKG1zKSB7XG4gIHZhciBzZWMgPSAxMDAwXG4gICAgLCBtaW4gPSA2MCAqIDEwMDBcbiAgICAsIGhvdXIgPSA2MCAqIG1pbjtcblxuICBpZiAobXMgPj0gaG91cikgcmV0dXJuIChtcyAvIGhvdXIpLnRvRml4ZWQoMSkgKyAnaCc7XG4gIGlmIChtcyA+PSBtaW4pIHJldHVybiAobXMgLyBtaW4pLnRvRml4ZWQoMSkgKyAnbSc7XG4gIGlmIChtcyA+PSBzZWMpIHJldHVybiAobXMgLyBzZWMgfCAwKSArICdzJztcbiAgcmV0dXJuIG1zICsgJ21zJztcbn07XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBnaXZlbiBtb2RlIG5hbWUgaXMgZW5hYmxlZCwgZmFsc2Ugb3RoZXJ3aXNlLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lXG4gKiBAcmV0dXJuIHtCb29sZWFufVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5kZWJ1Zy5lbmFibGVkID0gZnVuY3Rpb24obmFtZSkge1xuICBmb3IgKHZhciBpID0gMCwgbGVuID0gZGVidWcuc2tpcHMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZGVidWcuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKHZhciBpID0gMCwgbGVuID0gZGVidWcubmFtZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcbiAgICBpZiAoZGVidWcubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbi8qKlxuICogQ29lcmNlIGB2YWxgLlxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuXG4vLyBwZXJzaXN0XG5cbnRyeSB7XG4gIGlmICh3aW5kb3cubG9jYWxTdG9yYWdlKSBkZWJ1Zy5lbmFibGUobG9jYWxTdG9yYWdlLmRlYnVnKTtcbn0gY2F0Y2goZSl7fVxuIiwiYXJndW1lbnRzWzRdWzIzXVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCIndXNlIHN0cmljdCc7XG5cbi8qKlxuICogVGhpcyBjaGVhcCByZXBsaWNhIG9mIERPTS9CdWlsZGVyIHB1dHMgbWUgdG8gc2hhbWUgOi0pXG4gKlxuICogQXR0cmlidXRlcyBhcmUgaW4gdGhlIGVsZW1lbnQuYXR0cnMgb2JqZWN0LiBDaGlsZHJlbiBpcyBhIGxpc3Qgb2ZcbiAqIGVpdGhlciBvdGhlciBFbGVtZW50cyBvciBTdHJpbmdzIGZvciB0ZXh0IGNvbnRlbnQuXG4gKiovXG5mdW5jdGlvbiBFbGVtZW50KG5hbWUsIGF0dHJzKSB7XG4gICAgdGhpcy5uYW1lID0gbmFtZVxuICAgIHRoaXMucGFyZW50ID0gbnVsbFxuICAgIHRoaXMuYXR0cnMgPSBhdHRycyB8fCB7fVxuICAgIHRoaXMuY2hpbGRyZW4gPSBbXVxufVxuXG4vKioqIEFjY2Vzc29ycyAqKiovXG5cbi8qKlxuICogaWYgKGVsZW1lbnQuaXMoJ21lc3NhZ2UnLCAnamFiYmVyOmNsaWVudCcpKSAuLi5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmlzID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gKHRoaXMuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAoIXhtbG5zIHx8ICh0aGlzLmdldE5TKCkgPT09IHhtbG5zKSlcbn1cblxuLyogd2l0aG91dCBwcmVmaXggKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldE5hbWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKVxuICAgICAgICByZXR1cm4gdGhpcy5uYW1lLnN1YnN0cih0aGlzLm5hbWUuaW5kZXhPZignOicpICsgMSlcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzLm5hbWVcbn1cblxuLyoqXG4gKiByZXRyaWV2ZXMgdGhlIG5hbWVzcGFjZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LCB1cHdhcmRzIHJlY3Vyc2l2ZWx5XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROUyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApIHtcbiAgICAgICAgdmFyIHByZWZpeCA9IHRoaXMubmFtZS5zdWJzdHIoMCwgdGhpcy5uYW1lLmluZGV4T2YoJzonKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKHByZWZpeClcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5maW5kTlMoKVxuICAgIH1cbn1cblxuLyoqXG4gKiBmaW5kIHRoZSBuYW1lc3BhY2UgdG8gdGhlIGdpdmVuIHByZWZpeCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZmluZE5TID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgLyogZGVmYXVsdCBuYW1lc3BhY2UgKi9cbiAgICAgICAgaWYgKHRoaXMuYXR0cnMueG1sbnMpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRycy54bWxuc1xuICAgICAgICBlbHNlIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIHByZWZpeGVkIG5hbWVzcGFjZSAqL1xuICAgICAgICB2YXIgYXR0ciA9ICd4bWxuczonICsgcHJlZml4XG4gICAgICAgIGlmICh0aGlzLmF0dHJzW2F0dHJdKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKHByZWZpeClcbiAgICB9XG59XG5cbi8qKlxuICogUmVjdXJzaXZlcmx5IGdldHMgYWxsIHhtbG5zIGRlZmluZWQsIGluIHRoZSBmb3JtIG9mIHt1cmw6cHJlZml4fVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0WG1sbnMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbmFtZXNwYWNlcyA9IHt9XG5cbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIG5hbWVzcGFjZXMgPSB0aGlzLnBhcmVudC5nZXRYbWxucygpXG5cbiAgICBmb3IgKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIG0gPSBhdHRyLm1hdGNoKCd4bWxuczo/KC4qKScpXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpICYmIG0pIHtcbiAgICAgICAgICAgIG5hbWVzcGFjZXNbdGhpcy5hdHRyc1thdHRyXV0gPSBtWzFdXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzcGFjZXNcbn1cblxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsLCByZXR1cm5zIHRoZSBtYXRjaGluZyBhdHRyaWJ1dGUuXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRBdHRyID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICBpZiAoIXhtbG5zKVxuICAgICAgICByZXR1cm4gdGhpcy5hdHRyc1tuYW1lXVxuXG4gICAgdmFyIG5hbWVzcGFjZXMgPSB0aGlzLmdldFhtbG5zKClcblxuICAgIGlmICghbmFtZXNwYWNlc1t4bWxuc10pXG4gICAgICAgIHJldHVybiBudWxsXG5cbiAgICByZXR1cm4gdGhpcy5hdHRyc1tbbmFtZXNwYWNlc1t4bWxuc10sIG5hbWVdLmpvaW4oJzonKV1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuKG5hbWUsIHhtbG5zKVswXVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbiA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGNoaWxkLmdldE5hbWUgJiZcbiAgICAgICAgICAgIChjaGlsZC5nZXROYW1lKCkgPT09IG5hbWUpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZEJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSlbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbkJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5hdHRycyAmJlxuICAgICAgICAgICAgKGNoaWxkLmF0dHJzW2F0dHJdID09PSB2YWwpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUF0dHIpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHRydWUpKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUpIHJlc3VsdCA9IFtdLmNvbmNhdC5hcHBseShbXSwgcmVzdWx0KVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUZpbHRlciA9IGZ1bmN0aW9uKGZpbHRlciwgcmVjdXJzaXZlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGZpbHRlcihjaGlsZCkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKXtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlGaWx0ZXIoZmlsdGVyLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSB7XG4gICAgICAgIHJlc3VsdCA9IFtdLmNvbmNhdC5hcHBseShbXSwgcmVzdWx0KVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldFRleHQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGV4dCA9ICcnXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKCh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIGNoaWxkID09PSAnbnVtYmVyJykpIHtcbiAgICAgICAgICAgIHRleHQgKz0gY2hpbGRcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGV4dFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZFRleHQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciBjaGlsZCA9IHRoaXMuZ2V0Q2hpbGQobmFtZSwgeG1sbnMpXG4gICAgcmV0dXJuIGNoaWxkID8gY2hpbGQuZ2V0VGV4dCgpIDogbnVsbFxufVxuXG4vKipcbiAqIFJldHVybiBhbGwgZGlyZWN0IGRlc2NlbmRlbnRzIHRoYXQgYXJlIEVsZW1lbnRzLlxuICogVGhpcyBkaWZmZXJzIGZyb20gYGdldENoaWxkcmVuYCBpbiB0aGF0IGl0IHdpbGwgZXhjbHVkZSB0ZXh0IG5vZGVzLFxuICogcHJvY2Vzc2luZyBpbnN0cnVjdGlvbnMsIGV0Yy5cbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRFbGVtZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlGaWx0ZXIoZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudFxuICAgIH0pXG59XG5cbi8qKiogQnVpbGRlciAqKiovXG5cbi8qKiByZXR1cm5zIHVwcGVybW9zdCBwYXJlbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnJvb3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5yb290KClcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzXG59XG5FbGVtZW50LnByb3RvdHlwZS50cmVlID0gRWxlbWVudC5wcm90b3R5cGUucm9vdFxuXG4vKioganVzdCBwYXJlbnQgb3IgaXRzZWxmICovXG5FbGVtZW50LnByb3RvdHlwZS51cCA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50XG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS5fZ2V0RWxlbWVudCA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgdmFyIGVsZW1lbnQgPSBuZXcgRWxlbWVudChuYW1lLCBhdHRycylcbiAgICByZXR1cm4gZWxlbWVudFxufVxuXG4vKiogY3JlYXRlIGNoaWxkIG5vZGUgYW5kIHJldHVybiBpdCAqL1xuRWxlbWVudC5wcm90b3R5cGUuYyA9IGZ1bmN0aW9uKG5hbWUsIGF0dHJzKSB7XG4gICAgcmV0dXJuIHRoaXMuY25vZGUodGhpcy5fZ2V0RWxlbWVudChuYW1lLCBhdHRycykpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmNub2RlID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICB0aGlzLmNoaWxkcmVuLnB1c2goY2hpbGQpXG4gICAgY2hpbGQucGFyZW50ID0gdGhpc1xuICAgIHJldHVybiBjaGlsZFxufVxuXG4vKiogYWRkIHRleHQgbm9kZSBhbmQgcmV0dXJuIGVsZW1lbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnQgPSBmdW5jdGlvbih0ZXh0KSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKHRleHQpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqKiBNYW5pcHVsYXRpb24gKioqL1xuXG4vKipcbiAqIEVpdGhlcjpcbiAqICAgZWwucmVtb3ZlKGNoaWxkRWwpXG4gKiAgIGVsLnJlbW92ZSgnYXV0aG9yJywgJ3VybjouLi4nKVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihlbCwgeG1sbnMpIHtcbiAgICB2YXIgZmlsdGVyXG4gICAgaWYgKHR5cGVvZiBlbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLyogMXN0IHBhcmFtZXRlciBpcyB0YWcgbmFtZSAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuICEoY2hpbGQuaXMgJiZcbiAgICAgICAgICAgICAgICAgY2hpbGQuaXMoZWwsIHhtbG5zKSlcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgZWxlbWVudCAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICE9PSBlbFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4uZmlsdGVyKGZpbHRlcilcblxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogVG8gdXNlIGluIGNhc2UgeW91IHdhbnQgdGhlIHNhbWUgWE1MIGRhdGEgZm9yIHNlcGFyYXRlIHVzZXMuXG4gKiBQbGVhc2UgcmVmcmFpbiBmcm9tIHRoaXMgcHJhY3Rpc2UgdW5sZXNzIHlvdSBrbm93IHdoYXQgeW91IGFyZVxuICogZG9pbmcuIEJ1aWxkaW5nIFhNTCB3aXRoIGx0eCBpcyBlYXN5IVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbG9uZSA9IHRoaXMuX2dldEVsZW1lbnQodGhpcy5uYW1lLCB7fSlcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgaWYgKHRoaXMuYXR0cnMuaGFzT3duUHJvcGVydHkoaykpXG4gICAgICAgICAgICBjbG9uZS5hdHRyc1trXSA9IHRoaXMuYXR0cnNba11cbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgY2xvbmUuY25vZGUoY2hpbGQuY2xvbmUgPyBjaGlsZC5jbG9uZSgpIDogY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiBjbG9uZVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS50ZXh0ID0gZnVuY3Rpb24odmFsKSB7XG4gICAgaWYgKHZhbCAmJiB0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuWzBdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmdldFRleHQoKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5hdHRyID0gZnVuY3Rpb24oYXR0ciwgdmFsKSB7XG4gICAgaWYgKCgodHlwZW9mIHZhbCAhPT0gJ3VuZGVmaW5lZCcpIHx8ICh2YWwgPT09IG51bGwpKSkge1xuICAgICAgICBpZiAoIXRoaXMuYXR0cnMpIHtcbiAgICAgICAgICAgIHRoaXMuYXR0cnMgPSB7fVxuICAgICAgICB9XG4gICAgICAgIHRoaXMuYXR0cnNbYXR0cl0gPSB2YWxcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbn1cblxuLyoqKiBTZXJpYWxpemF0aW9uICoqKi9cblxuRWxlbWVudC5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgcyA9ICcnXG4gICAgdGhpcy53cml0ZShmdW5jdGlvbihjKSB7XG4gICAgICAgIHMgKz0gY1xuICAgIH0pXG4gICAgcmV0dXJuIHNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgbmFtZTogdGhpcy5uYW1lLFxuICAgICAgICBhdHRyczogdGhpcy5hdHRycyxcbiAgICAgICAgY2hpbGRyZW46IHRoaXMuY2hpbGRyZW4ubWFwKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgICAgICByZXR1cm4gY2hpbGQgJiYgY2hpbGQudG9KU09OID8gY2hpbGQudG9KU09OKCkgOiBjaGlsZDtcbiAgICAgICAgfSlcbiAgICB9XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLl9hZGRDaGlsZHJlbiA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPicpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgLyogU2tpcCBudWxsL3VuZGVmaW5lZCAqL1xuICAgICAgICBpZiAoY2hpbGQgfHwgKGNoaWxkID09PSAwKSkge1xuICAgICAgICAgICAgaWYgKGNoaWxkLndyaXRlKSB7XG4gICAgICAgICAgICAgICAgY2hpbGQud3JpdGUod3JpdGVyKVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbFRleHQoY2hpbGQpKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaGlsZC50b1N0cmluZykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkLnRvU3RyaW5nKDEwKSkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgd3JpdGVyKCc8LycpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICB3cml0ZXIoJz4nKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPCcpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzLmF0dHJzW2tdXG4gICAgICAgIGlmICh2IHx8ICh2ID09PSAnJykgfHwgKHYgPT09IDApKSB7XG4gICAgICAgICAgICB3cml0ZXIoJyAnKVxuICAgICAgICAgICAgd3JpdGVyKGspXG4gICAgICAgICAgICB3cml0ZXIoJz1cIicpXG4gICAgICAgICAgICBpZiAodHlwZW9mIHYgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdiA9IHYudG9TdHJpbmcoMTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sKHYpKVxuICAgICAgICAgICAgd3JpdGVyKCdcIicpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHdyaXRlcignLz4nKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2FkZENoaWxkcmVuKHdyaXRlcilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJi9nLCAnJmFtcDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPC9nLCAnJmx0OycpLlxuICAgICAgICByZXBsYWNlKC8+L2csICcmZ3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmcXVvdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvXCIvZywgJyZhcG9zOycpXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbFRleHQocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpXG59XG5cbmV4cG9ydHMuRWxlbWVudCA9IEVsZW1lbnRcbmV4cG9ydHMuZXNjYXBlWG1sID0gZXNjYXBlWG1sXG4iLCJhcmd1bWVudHNbNF1bMjVdWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsImFyZ3VtZW50c1s0XVsyNl1bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiYXJndW1lbnRzWzRdWzI3XVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCIndXNlIHN0cmljdCc7XG5cbnZhciBsb2cgPSByZXF1aXJlKCdkZWJ1ZycpKCdub2RlLXN0cmluZ3ByZXAnKVxuXG4vLyBmcm9tIHVuaWNvZGUvdWlkbmEuaFxudmFyIFVJRE5BX0FMTE9XX1VOQVNTSUdORUQgPSAxXG52YXIgVUlETkFfVVNFX1NURDNfUlVMRVMgPSAyXG5cbnRyeSB7XG4gICAgdmFyIGJpbmRpbmdzID0gcmVxdWlyZSgnYmluZGluZ3MnKSgnbm9kZV9zdHJpbmdwcmVwLm5vZGUnKVxufSBjYXRjaCAoZXgpIHtcbiAgICBjb25zb2xlLndhcm4oXG4gICAgICAgICdDYW5ub3QgbG9hZCBTdHJpbmdQcmVwLScgK1xuICAgICAgICByZXF1aXJlKCcuL3BhY2thZ2UuanNvbicpLnZlcnNpb24gK1xuICAgICAgICAnIGJpbmRpbmdzICh1c2luZyBmYWxsYmFjaykuIFlvdSBtYXkgbmVlZCB0byAnICtcbiAgICAgICAgJ2BucG0gaW5zdGFsbCBub2RlLXN0cmluZ3ByZXBgJ1xuICAgIClcbiAgICBsb2coZXgpXG59XG5cbnZhciB0b1VuaWNvZGUgPSBmdW5jdGlvbih2YWx1ZSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdzLnRvVW5pY29kZSh2YWx1ZSxcbiAgICAgICAgICAgIChvcHRpb25zLmFsbG93VW5hc3NpZ25lZCAmJiBVSUROQV9BTExPV19VTkFTU0lHTkVEKSB8IDApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICB9XG59XG5cbnZhciB0b0FTQ0lJID0gZnVuY3Rpb24odmFsdWUsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBiaW5kaW5ncy50b0FTQ0lJKHZhbHVlLFxuICAgICAgICAgICAgKG9wdGlvbnMuYWxsb3dVbmFzc2lnbmVkICYmIFVJRE5BX0FMTE9XX1VOQVNTSUdORUQpIHxcbiAgICAgICAgICAgIChvcHRpb25zLnVzZVNURDNSdWxlcyAmJiBVSUROQV9VU0VfU1REM19SVUxFUykpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAob3B0aW9ucy50aHJvd0lmRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9XG4gICAgfVxufVxuXG52YXIgU3RyaW5nUHJlcCA9IGZ1bmN0aW9uKG9wZXJhdGlvbikge1xuICAgIHRoaXMub3BlcmF0aW9uID0gb3BlcmF0aW9uXG4gICAgdHJ5IHtcbiAgICAgICAgdGhpcy5zdHJpbmdQcmVwID0gbmV3IGJpbmRpbmdzLlN0cmluZ1ByZXAodGhpcy5vcGVyYXRpb24pXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aGlzLnN0cmluZ1ByZXAgPSBudWxsXG4gICAgICAgIGxvZygnT3BlcmF0aW9uIGRvZXMgbm90IGV4aXN0Jywgb3BlcmF0aW9uLCBlKVxuICAgIH1cbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuVU5LTk9XTl9QUk9GSUxFX1RZUEUgPSAnVW5rbm93biBwcm9maWxlIHR5cGUnXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5VTkhBTkRMRURfRkFMTEJBQ0sgPSAnVW5oYW5kbGVkIEpTIGZhbGxiYWNrJ1xuU3RyaW5nUHJlcC5wcm90b3R5cGUuTElCSUNVX05PVF9BVkFJTEFCTEUgPSAnbGliaWN1IHVuYXZhaWxhYmxlJ1xuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS51c2VKc0ZhbGxiYWNrcyA9IHRydWVcblxuU3RyaW5nUHJlcC5wcm90b3R5cGUucHJlcGFyZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHRoaXMuc3RyaW5nUHJlcCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RyaW5nUHJlcC5wcmVwYXJlKHRoaXMudmFsdWUpXG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7fVxuICAgIGlmIChmYWxzZSA9PT0gdGhpcy51c2VKc0ZhbGxiYWNrcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5MSUJJQ1VfTk9UX0FWQUlMQUJMRSlcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuanNGYWxsYmFjaygpXG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmlzTmF0aXZlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIChudWxsICE9PSB0aGlzLnN0cmluZ1ByZXApXG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmpzRmFsbGJhY2sgPSBmdW5jdGlvbigpIHtcbiAgICBzd2l0Y2ggKHRoaXMub3BlcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgJ25hbWVwcmVwJzpcbiAgICAgICAgY2FzZSAnbm9kZXByZXAnOlxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFsdWUudG9Mb3dlckNhc2UoKVxuICAgICAgICBjYXNlICdyZXNvdXJjZXByZXAnOlxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFsdWVcbiAgICAgICAgY2FzZSAnbmZzNF9jc19wcmVwJzpcbiAgICAgICAgY2FzZSAnbmZzNF9jaXNfcHJlcCc6XG4gICAgICAgIGNhc2UgJ25mczRfbWl4ZWRfcHJlcCBwcmVmaXgnOlxuICAgICAgICBjYXNlICduZnM0X21peGVkX3ByZXAgc3VmZml4JzpcbiAgICAgICAgY2FzZSAnaXNjc2knOlxuICAgICAgICBjYXNlICdtaWInOlxuICAgICAgICBjYXNlICdzYXNscHJlcCc6XG4gICAgICAgIGNhc2UgJ3RyYWNlJzpcbiAgICAgICAgY2FzZSAnbGRhcCc6XG4gICAgICAgIGNhc2UgJ2xkYXBjaSc6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5VTkhBTkRMRURfRkFMTEJBQ0spXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5VTktOT1dOX1BST0ZJTEVfVFlQRSlcbiAgICB9XG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmRpc2FibGVKc0ZhbGxiYWNrcyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMudXNlSnNGYWxsYmFja3MgPSBmYWxzZVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5lbmFibGVKc0ZhbGxiYWNrcyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMudXNlSnNGYWxsYmFja3MgPSB0cnVlXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHRvVW5pY29kZTogdG9Vbmljb2RlLFxuICAgIHRvQVNDSUk6IHRvQVNDSUksXG4gICAgU3RyaW5nUHJlcDogU3RyaW5nUHJlcFxufVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzLF9fZmlsZW5hbWUpe1xuXG4vKipcbiAqIE1vZHVsZSBkZXBlbmRlbmNpZXMuXG4gKi9cblxudmFyIGZzID0gcmVxdWlyZSgnZnMnKVxuICAsIHBhdGggPSByZXF1aXJlKCdwYXRoJylcbiAgLCBqb2luID0gcGF0aC5qb2luXG4gICwgZGlybmFtZSA9IHBhdGguZGlybmFtZVxuICAsIGV4aXN0cyA9IGZzLmV4aXN0c1N5bmMgfHwgcGF0aC5leGlzdHNTeW5jXG4gICwgZGVmYXVsdHMgPSB7XG4gICAgICAgIGFycm93OiBwcm9jZXNzLmVudi5OT0RFX0JJTkRJTkdTX0FSUk9XIHx8ICcg4oaSICdcbiAgICAgICwgY29tcGlsZWQ6IHByb2Nlc3MuZW52Lk5PREVfQklORElOR1NfQ09NUElMRURfRElSIHx8ICdjb21waWxlZCdcbiAgICAgICwgcGxhdGZvcm06IHByb2Nlc3MucGxhdGZvcm1cbiAgICAgICwgYXJjaDogcHJvY2Vzcy5hcmNoXG4gICAgICAsIHZlcnNpb246IHByb2Nlc3MudmVyc2lvbnMubm9kZVxuICAgICAgLCBiaW5kaW5nczogJ2JpbmRpbmdzLm5vZGUnXG4gICAgICAsIHRyeTogW1xuICAgICAgICAgIC8vIG5vZGUtZ3lwJ3MgbGlua2VkIHZlcnNpb24gaW4gdGhlIFwiYnVpbGRcIiBkaXJcbiAgICAgICAgICBbICdtb2R1bGVfcm9vdCcsICdidWlsZCcsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIG5vZGUtd2FmIGFuZCBneXBfYWRkb24gKGEuay5hIG5vZGUtZ3lwKVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2J1aWxkJywgJ0RlYnVnJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnUmVsZWFzZScsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIERlYnVnIGZpbGVzLCBmb3IgZGV2ZWxvcG1lbnQgKGxlZ2FjeSBiZWhhdmlvciwgcmVtb3ZlIGZvciBub2RlIHYwLjkpXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnb3V0JywgJ0RlYnVnJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnRGVidWcnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBSZWxlYXNlIGZpbGVzLCBidXQgbWFudWFsbHkgY29tcGlsZWQgKGxlZ2FjeSBiZWhhdmlvciwgcmVtb3ZlIGZvciBub2RlIHYwLjkpXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnb3V0JywgJ1JlbGVhc2UnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdSZWxlYXNlJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gTGVnYWN5IGZyb20gbm9kZS13YWYsIG5vZGUgPD0gMC40LnhcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdidWlsZCcsICdkZWZhdWx0JywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gUHJvZHVjdGlvbiBcIlJlbGVhc2VcIiBidWlsZHR5cGUgYmluYXJ5IChtZWguLi4pXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnY29tcGlsZWQnLCAndmVyc2lvbicsICdwbGF0Zm9ybScsICdhcmNoJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgIF1cbiAgICB9XG5cbi8qKlxuICogVGhlIG1haW4gYGJpbmRpbmdzKClgIGZ1bmN0aW9uIGxvYWRzIHRoZSBjb21waWxlZCBiaW5kaW5ncyBmb3IgYSBnaXZlbiBtb2R1bGUuXG4gKiBJdCB1c2VzIFY4J3MgRXJyb3IgQVBJIHRvIGRldGVybWluZSB0aGUgcGFyZW50IGZpbGVuYW1lIHRoYXQgdGhpcyBmdW5jdGlvbiBpc1xuICogYmVpbmcgaW52b2tlZCBmcm9tLCB3aGljaCBpcyB0aGVuIHVzZWQgdG8gZmluZCB0aGUgcm9vdCBkaXJlY3RvcnkuXG4gKi9cblxuZnVuY3Rpb24gYmluZGluZ3MgKG9wdHMpIHtcblxuICAvLyBBcmd1bWVudCBzdXJnZXJ5XG4gIGlmICh0eXBlb2Ygb3B0cyA9PSAnc3RyaW5nJykge1xuICAgIG9wdHMgPSB7IGJpbmRpbmdzOiBvcHRzIH1cbiAgfSBlbHNlIGlmICghb3B0cykge1xuICAgIG9wdHMgPSB7fVxuICB9XG4gIG9wdHMuX19wcm90b19fID0gZGVmYXVsdHNcblxuICAvLyBHZXQgdGhlIG1vZHVsZSByb290XG4gIGlmICghb3B0cy5tb2R1bGVfcm9vdCkge1xuICAgIG9wdHMubW9kdWxlX3Jvb3QgPSBleHBvcnRzLmdldFJvb3QoZXhwb3J0cy5nZXRGaWxlTmFtZSgpKVxuICB9XG5cbiAgLy8gRW5zdXJlIHRoZSBnaXZlbiBiaW5kaW5ncyBuYW1lIGVuZHMgd2l0aCAubm9kZVxuICBpZiAocGF0aC5leHRuYW1lKG9wdHMuYmluZGluZ3MpICE9ICcubm9kZScpIHtcbiAgICBvcHRzLmJpbmRpbmdzICs9ICcubm9kZSdcbiAgfVxuXG4gIHZhciB0cmllcyA9IFtdXG4gICAgLCBpID0gMFxuICAgICwgbCA9IG9wdHMudHJ5Lmxlbmd0aFxuICAgICwgblxuICAgICwgYlxuICAgICwgZXJyXG5cbiAgZm9yICg7IGk8bDsgaSsrKSB7XG4gICAgbiA9IGpvaW4uYXBwbHkobnVsbCwgb3B0cy50cnlbaV0ubWFwKGZ1bmN0aW9uIChwKSB7XG4gICAgICByZXR1cm4gb3B0c1twXSB8fCBwXG4gICAgfSkpXG4gICAgdHJpZXMucHVzaChuKVxuICAgIHRyeSB7XG4gICAgICBiID0gb3B0cy5wYXRoID8gcmVxdWlyZS5yZXNvbHZlKG4pIDogcmVxdWlyZShuKVxuICAgICAgaWYgKCFvcHRzLnBhdGgpIHtcbiAgICAgICAgYi5wYXRoID0gblxuICAgICAgfVxuICAgICAgcmV0dXJuIGJcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAoIS9ub3QgZmluZC9pLnRlc3QoZS5tZXNzYWdlKSkge1xuICAgICAgICB0aHJvdyBlXG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgZXJyID0gbmV3IEVycm9yKCdDb3VsZCBub3QgbG9jYXRlIHRoZSBiaW5kaW5ncyBmaWxlLiBUcmllZDpcXG4nXG4gICAgKyB0cmllcy5tYXAoZnVuY3Rpb24gKGEpIHsgcmV0dXJuIG9wdHMuYXJyb3cgKyBhIH0pLmpvaW4oJ1xcbicpKVxuICBlcnIudHJpZXMgPSB0cmllc1xuICB0aHJvdyBlcnJcbn1cbm1vZHVsZS5leHBvcnRzID0gZXhwb3J0cyA9IGJpbmRpbmdzXG5cblxuLyoqXG4gKiBHZXRzIHRoZSBmaWxlbmFtZSBvZiB0aGUgSmF2YVNjcmlwdCBmaWxlIHRoYXQgaW52b2tlcyB0aGlzIGZ1bmN0aW9uLlxuICogVXNlZCB0byBoZWxwIGZpbmQgdGhlIHJvb3QgZGlyZWN0b3J5IG9mIGEgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMuZ2V0RmlsZU5hbWUgPSBmdW5jdGlvbiBnZXRGaWxlTmFtZSAoKSB7XG4gIHZhciBvcmlnUFNUID0gRXJyb3IucHJlcGFyZVN0YWNrVHJhY2VcbiAgICAsIG9yaWdTVEwgPSBFcnJvci5zdGFja1RyYWNlTGltaXRcbiAgICAsIGR1bW15ID0ge31cbiAgICAsIGZpbGVOYW1lXG5cbiAgRXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gMTBcblxuICBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IGZ1bmN0aW9uIChlLCBzdCkge1xuICAgIGZvciAodmFyIGk9MCwgbD1zdC5sZW5ndGg7IGk8bDsgaSsrKSB7XG4gICAgICBmaWxlTmFtZSA9IHN0W2ldLmdldEZpbGVOYW1lKClcbiAgICAgIGlmIChmaWxlTmFtZSAhPT0gX19maWxlbmFtZSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBydW4gdGhlICdwcmVwYXJlU3RhY2tUcmFjZScgZnVuY3Rpb24gYWJvdmVcbiAgRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UoZHVtbXkpXG4gIGR1bW15LnN0YWNrXG5cbiAgLy8gY2xlYW51cFxuICBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZSA9IG9yaWdQU1RcbiAgRXJyb3Iuc3RhY2tUcmFjZUxpbWl0ID0gb3JpZ1NUTFxuXG4gIHJldHVybiBmaWxlTmFtZVxufVxuXG4vKipcbiAqIEdldHMgdGhlIHJvb3QgZGlyZWN0b3J5IG9mIGEgbW9kdWxlLCBnaXZlbiBhbiBhcmJpdHJhcnkgZmlsZW5hbWVcbiAqIHNvbWV3aGVyZSBpbiB0aGUgbW9kdWxlIHRyZWUuIFRoZSBcInJvb3QgZGlyZWN0b3J5XCIgaXMgdGhlIGRpcmVjdG9yeVxuICogY29udGFpbmluZyB0aGUgYHBhY2thZ2UuanNvbmAgZmlsZS5cbiAqXG4gKiAgIEluOiAgL2hvbWUvbmF0ZS9ub2RlLW5hdGl2ZS1tb2R1bGUvbGliL2luZGV4LmpzXG4gKiAgIE91dDogL2hvbWUvbmF0ZS9ub2RlLW5hdGl2ZS1tb2R1bGVcbiAqL1xuXG5leHBvcnRzLmdldFJvb3QgPSBmdW5jdGlvbiBnZXRSb290IChmaWxlKSB7XG4gIHZhciBkaXIgPSBkaXJuYW1lKGZpbGUpXG4gICAgLCBwcmV2XG4gIHdoaWxlICh0cnVlKSB7XG4gICAgaWYgKGRpciA9PT0gJy4nKSB7XG4gICAgICAvLyBBdm9pZHMgYW4gaW5maW5pdGUgbG9vcCBpbiByYXJlIGNhc2VzLCBsaWtlIHRoZSBSRVBMXG4gICAgICBkaXIgPSBwcm9jZXNzLmN3ZCgpXG4gICAgfVxuICAgIGlmIChleGlzdHMoam9pbihkaXIsICdwYWNrYWdlLmpzb24nKSkgfHwgZXhpc3RzKGpvaW4oZGlyLCAnbm9kZV9tb2R1bGVzJykpKSB7XG4gICAgICAvLyBGb3VuZCB0aGUgJ3BhY2thZ2UuanNvbicgZmlsZSBvciAnbm9kZV9tb2R1bGVzJyBkaXI7IHdlJ3JlIGRvbmVcbiAgICAgIHJldHVybiBkaXJcbiAgICB9XG4gICAgaWYgKHByZXYgPT09IGRpcikge1xuICAgICAgLy8gR290IHRvIHRoZSB0b3BcbiAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IGZpbmQgbW9kdWxlIHJvb3QgZ2l2ZW4gZmlsZTogXCInICsgZmlsZVxuICAgICAgICAgICAgICAgICAgICArICdcIi4gRG8geW91IGhhdmUgYSBgcGFja2FnZS5qc29uYCBmaWxlPyAnKVxuICAgIH1cbiAgICAvLyBUcnkgdGhlIHBhcmVudCBkaXIgbmV4dFxuICAgIHByZXYgPSBkaXJcbiAgICBkaXIgPSBqb2luKGRpciwgJy4uJylcbiAgfVxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSxcIi8uLi9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL25vZGUtc3RyaW5ncHJlcC9ub2RlX21vZHVsZXMvYmluZGluZ3MvYmluZGluZ3MuanNcIikiLCJtb2R1bGUuZXhwb3J0cz17XG4gIFwibmFtZVwiOiBcIm5vZGUtc3RyaW5ncHJlcFwiLFxuICBcInZlcnNpb25cIjogXCIwLjUuNFwiLFxuICBcIm1haW5cIjogXCJpbmRleC5qc1wiLFxuICBcImRlc2NyaXB0aW9uXCI6IFwiSUNVIFN0cmluZ1ByZXAgcHJvZmlsZXNcIixcbiAgXCJrZXl3b3Jkc1wiOiBbXG4gICAgXCJ1bmljb2RlXCIsXG4gICAgXCJzdHJpbmdwcmVwXCIsXG4gICAgXCJpY3VcIlxuICBdLFxuICBcInNjcmlwdHNcIjoge1xuICAgIFwidGVzdFwiOiBcImdydW50IHRlc3RcIixcbiAgICBcImluc3RhbGxcIjogXCJub2RlLWd5cCByZWJ1aWxkXCJcbiAgfSxcbiAgXCJkZXBlbmRlbmNpZXNcIjoge1xuICAgIFwibmFuXCI6IFwifjEuMi4wXCIsXG4gICAgXCJiaW5kaW5nc1wiOiBcIn4xLjEuMVwiLFxuICAgIFwiZGVidWdcIjogXCJ+Mi4wLjBcIlxuICB9LFxuICBcImRldkRlcGVuZGVuY2llc1wiOiB7XG4gICAgXCJwcm94eXF1aXJlXCI6IFwifjAuNS4yXCIsXG4gICAgXCJncnVudC1tb2NoYS1jbGlcIjogXCJ+MS4zLjBcIixcbiAgICBcImdydW50LWNvbnRyaWItanNoaW50XCI6IFwifjAuNy4yXCIsXG4gICAgXCJzaG91bGRcIjogXCJ+Mi4xLjFcIixcbiAgICBcImdydW50XCI6IFwifjAuNC4yXCJcbiAgfSxcbiAgXCJyZXBvc2l0b3J5XCI6IHtcbiAgICBcInR5cGVcIjogXCJnaXRcIixcbiAgICBcInBhdGhcIjogXCJnaXQ6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXAuZ2l0XCJcbiAgfSxcbiAgXCJob21lcGFnZVwiOiBcImh0dHA6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXBcIixcbiAgXCJidWdzXCI6IHtcbiAgICBcInVybFwiOiBcImh0dHA6Ly9naXRodWIuY29tL25vZGUteG1wcC9ub2RlLXN0cmluZ3ByZXAvaXNzdWVzXCJcbiAgfSxcbiAgXCJhdXRob3JcIjoge1xuICAgIFwibmFtZVwiOiBcIkxsb3lkIFdhdGtpblwiLFxuICAgIFwiZW1haWxcIjogXCJsbG95ZEBldmlscHJvZmVzc29yLmNvLnVrXCIsXG4gICAgXCJ1cmxcIjogXCJodHRwOi8vZXZpbHByb2Zlc3Nvci5jby51a1wiXG4gIH0sXG4gIFwibGljZW5zZXNcIjogW1xuICAgIHtcbiAgICAgIFwidHlwZVwiOiBcIk1JVFwiXG4gICAgfVxuICBdLFxuICBcImVuZ2luZXNcIjoge1xuICAgIFwibm9kZVwiOiBcIj49MC44XCJcbiAgfSxcbiAgXCJneXBmaWxlXCI6IHRydWUsXG4gIFwiX2lkXCI6IFwibm9kZS1zdHJpbmdwcmVwQDAuNS40XCIsXG4gIFwiZGlzdFwiOiB7XG4gICAgXCJzaGFzdW1cIjogXCJkZDAzYjNkOGY2ZjgzMTM3NzU0Y2MxZWExYTU1Njc1NDQ3YjBhYjkyXCIsXG4gICAgXCJ0YXJiYWxsXCI6IFwiaHR0cDovL3JlZ2lzdHJ5Lm5wbWpzLm9yZy9ub2RlLXN0cmluZ3ByZXAvLS9ub2RlLXN0cmluZ3ByZXAtMC41LjQudGd6XCJcbiAgfSxcbiAgXCJfZnJvbVwiOiBcIm5vZGUtc3RyaW5ncHJlcEBeMC41LjJcIixcbiAgXCJfbnBtVmVyc2lvblwiOiBcIjEuNC4zXCIsXG4gIFwiX25wbVVzZXJcIjoge1xuICAgIFwibmFtZVwiOiBcImxsb3lkd2F0a2luXCIsXG4gICAgXCJlbWFpbFwiOiBcImxsb3lkQGV2aWxwcm9mZXNzb3IuY28udWtcIlxuICB9LFxuICBcIm1haW50YWluZXJzXCI6IFtcbiAgICB7XG4gICAgICBcIm5hbWVcIjogXCJhc3Ryb1wiLFxuICAgICAgXCJlbWFpbFwiOiBcImFzdHJvQHNwYWNlYm95ei5uZXRcIlxuICAgIH0sXG4gICAge1xuICAgICAgXCJuYW1lXCI6IFwibGxveWR3YXRraW5cIixcbiAgICAgIFwiZW1haWxcIjogXCJsbG95ZEBldmlscHJvZmVzc29yLmNvLnVrXCJcbiAgICB9XG4gIF0sXG4gIFwiZGlyZWN0b3JpZXNcIjoge30sXG4gIFwiX3NoYXN1bVwiOiBcImRkMDNiM2Q4ZjZmODMxMzc3NTRjYzFlYTFhNTU2NzU0NDdiMGFiOTJcIixcbiAgXCJfcmVzb2x2ZWRcIjogXCJodHRwczovL3JlZ2lzdHJ5Lm5wbWpzLm9yZy9ub2RlLXN0cmluZ3ByZXAvLS9ub2RlLXN0cmluZ3ByZXAtMC41LjQudGd6XCIsXG4gIFwicmVhZG1lXCI6IFwiRVJST1I6IE5vIFJFQURNRSBkYXRhIGZvdW5kIVwiXG59XG4iLCJ2YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG52YXIgYmFja29mZiA9IHJlcXVpcmUoJ2JhY2tvZmYnKVxudmFyIG5vb3AgPSBmdW5jdGlvbiAoKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9XG5mdW5jdGlvbiAoY3JlYXRlQ29ubmVjdGlvbikge1xuICByZXR1cm4gZnVuY3Rpb24gKG9wdHMsIG9uQ29ubmVjdCkge1xuICAgIG9uQ29ubmVjdCA9ICdmdW5jdGlvbicgPT0gdHlwZW9mIG9wdHMgPyBvcHRzIDogb25Db25uZWN0XG4gICAgb3B0cyA9ICdvYmplY3QnID09IHR5cGVvZiBvcHRzID8gb3B0cyA6IHtpbml0aWFsRGVsYXk6IDFlMywgbWF4RGVsYXk6IDMwZTN9XG4gICAgaWYoIW9uQ29ubmVjdClcbiAgICAgIG9uQ29ubmVjdCA9IG9wdHMub25Db25uZWN0XG5cbiAgICB2YXIgZW1pdHRlciA9IG9wdHMuZW1pdHRlciB8fCBuZXcgRXZlbnRFbWl0dGVyKClcbiAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IGZhbHNlXG4gICAgZW1pdHRlci5yZWNvbm5lY3QgPSB0cnVlXG5cbiAgICBpZihvbkNvbm5lY3QpXG4gICAgICBlbWl0dGVyLm9uKCdjb25uZWN0Jywgb25Db25uZWN0KVxuXG4gICAgdmFyIGJhY2tvZmZNZXRob2QgPSAoYmFja29mZltvcHRzLnR5cGVdIHx8IGJhY2tvZmYuZmlib25hY2NpKSAob3B0cylcblxuICAgIGJhY2tvZmZNZXRob2Qub24oJ2JhY2tvZmYnLCBmdW5jdGlvbiAobiwgZCkge1xuICAgICAgZW1pdHRlci5lbWl0KCdiYWNrb2ZmJywgbiwgZClcbiAgICB9KVxuXG4gICAgdmFyIGFyZ3NcbiAgICB2YXIgY2xlYW51cCA9IG5vb3BcbiAgICBiYWNrb2ZmTWV0aG9kLm9uKCdyZWFkeScsIGF0dGVtcHQpXG4gICAgZnVuY3Rpb24gYXR0ZW1wdCAobiwgZGVsYXkpIHtcbiAgICAgIGlmKCFlbWl0dGVyLnJlY29ubmVjdCkgcmV0dXJuXG5cbiAgICAgIGNsZWFudXAoKVxuICAgICAgZW1pdHRlci5lbWl0KCdyZWNvbm5lY3QnLCBuLCBkZWxheSlcbiAgICAgIHZhciBjb24gPSBjcmVhdGVDb25uZWN0aW9uLmFwcGx5KG51bGwsIGFyZ3MpXG4gICAgICBpZiAoY29uICE9PSBlbWl0dGVyLl9jb25uZWN0aW9uKVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3Rpb24nLCBjb24pXG4gICAgICBlbWl0dGVyLl9jb25uZWN0aW9uID0gY29uXG5cbiAgICAgIGNsZWFudXAgPSBvbkNsZWFudXBcbiAgICAgIGZ1bmN0aW9uIG9uQ2xlYW51cChlcnIpIHtcbiAgICAgICAgY2xlYW51cCA9IG5vb3BcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjb25uZWN0JywgY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgY29uLnJlbW92ZUxpc3RlbmVyKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgICAvL2hhY2sgdG8gbWFrZSBodHRwIG5vdCBjcmFzaC5cbiAgICAgICAgLy9IVFRQIElTIFRIRSBXT1JTVCBQUk9UT0NPTC5cbiAgICAgICAgaWYoY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKVxuICAgICAgICAgIGNvbi5vbignZXJyb3InLCBub29wKVxuXG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIG9uRGlzY29ubmVjdCAoZXJyKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gZmFsc2VcbiAgICAgICAgb25DbGVhbnVwKGVycilcblxuICAgICAgICAvL2VtaXQgZGlzY29ubmVjdCBiZWZvcmUgY2hlY2tpbmcgcmVjb25uZWN0LCBzbyB1c2VyIGhhcyBhIGNoYW5jZSB0byBkZWNpZGUgbm90IHRvLlxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnLCBlcnIpXG5cbiAgICAgICAgaWYoIWVtaXR0ZXIucmVjb25uZWN0KSByZXR1cm5cbiAgICAgICAgdHJ5IHsgYmFja29mZk1ldGhvZC5iYWNrb2ZmKCkgfSBjYXRjaCAoXykgeyB9XG4gICAgICB9XG5cbiAgICAgIGZ1bmN0aW9uIGNvbm5lY3QoKSB7XG4gICAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IHRydWVcbiAgICAgICAgaWYob25Db25uZWN0KVxuICAgICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIG9uQ29ubmVjdClcbiAgICAgICAgZW1pdHRlci5lbWl0KCdjb25uZWN0JywgY29uKVxuICAgICAgfVxuXG4gICAgICBjb25cbiAgICAgICAgLm9uKCdlcnJvcicsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdjbG9zZScsIG9uRGlzY29ubmVjdClcbiAgICAgICAgLm9uKCdlbmQnICAsIG9uRGlzY29ubmVjdClcblxuICAgICAgaWYob3B0cy5pbW1lZGlhdGUgfHwgY29uLmNvbnN0cnVjdG9yLm5hbWUgPT0gJ1JlcXVlc3QnKSB7XG4gICAgICAgIGVtaXR0ZXIuY29ubmVjdGVkID0gdHJ1ZVxuICAgICAgICBlbWl0dGVyLmVtaXQoJ2Nvbm5lY3QnLCBjb24pXG4gICAgICAgIGNvbi5vbmNlKCdkYXRhJywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgIC8vdGhpcyBpcyB0aGUgb25seSB3YXkgdG8ga25vdyBmb3Igc3VyZSB0aGF0IGRhdGEgaXMgY29taW5nLi4uXG4gICAgICAgICAgYmFja29mZk1ldGhvZC5yZXNldCgpXG4gICAgICAgIH0pXG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb24ub24oJ2Nvbm5lY3QnLCBjb25uZWN0KVxuICAgICAgfVxuICAgIH1cblxuICAgIGVtaXR0ZXIuY29ubmVjdCA9XG4gICAgZW1pdHRlci5saXN0ZW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgICB0aGlzLnJlY29ubmVjdCA9IHRydWVcbiAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgYXJncyA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKVxuICAgICAgYXR0ZW1wdCgwLCAwKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICAvL2ZvcmNlIHJlY29ubmVjdGlvblxuXG4gICAgZW1pdHRlci5lbmQgPVxuICAgIGVtaXR0ZXIuZGlzY29ubmVjdCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgIGVtaXR0ZXIucmVjb25uZWN0ID0gZmFsc2VcblxuICAgICAgaWYoZW1pdHRlci5fY29ubmVjdGlvbilcbiAgICAgICAgZW1pdHRlci5fY29ubmVjdGlvbi5lbmQoKVxuXG4gICAgICBlbWl0dGVyLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgcmV0dXJuIGVtaXR0ZXJcbiAgICB9XG5cbiAgICByZXR1cm4gZW1pdHRlclxuICB9XG5cbn1cbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9saWIvYmFja29mZicpO1xudmFyIEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9saWIvc3RyYXRlZ3kvZXhwb25lbnRpYWwnKTtcbnZhciBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL2xpYi9zdHJhdGVneS9maWJvbmFjY2knKTtcbnZhciBGdW5jdGlvbkNhbGwgPSByZXF1aXJlKCcuL2xpYi9mdW5jdGlvbl9jYWxsLmpzJyk7XG5cbm1vZHVsZS5leHBvcnRzLkJhY2tvZmYgPSBCYWNrb2ZmO1xubW9kdWxlLmV4cG9ydHMuRnVuY3Rpb25DYWxsID0gRnVuY3Rpb25DYWxsO1xubW9kdWxlLmV4cG9ydHMuRmlib25hY2NpU3RyYXRlZ3kgPSBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3k7XG5tb2R1bGUuZXhwb3J0cy5FeHBvbmVudGlhbFN0cmF0ZWd5ID0gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3k7XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZpYm9uYWNjaSBiYWNrb2ZmLlxuICogQHBhcmFtIG9wdGlvbnMgRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kgYXJndW1lbnRzLlxuICogQHJldHVybiBUaGUgZmlib25hY2NpIGJhY2tvZmYuXG4gKiBAc2VlIEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5maWJvbmFjY2kgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBCYWNrb2ZmKG5ldyBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykpO1xufTtcblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGFuIGV4cG9uZW50aWFsIGJhY2tvZmYuXG4gKiBAcGFyYW0gb3B0aW9ucyBFeHBvbmVudGlhbCBzdHJhdGVneSBhcmd1bWVudHMuXG4gKiBAcmV0dXJuIFRoZSBleHBvbmVudGlhbCBiYWNrb2ZmLlxuICogQHNlZSBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneVxuICovXG5tb2R1bGUuZXhwb3J0cy5leHBvbmVudGlhbCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gbmV3IEJhY2tvZmYobmV3IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpKTtcbn07XG5cbi8qKlxuICogQ29uc3RydWN0cyBhIEZ1bmN0aW9uQ2FsbCBmb3IgdGhlIGdpdmVuIGZ1bmN0aW9uIGFuZCBhcmd1bWVudHMuXG4gKiBAcGFyYW0gZm4gVGhlIGZ1bmN0aW9uIHRvIHdyYXAgaW4gYSBiYWNrb2ZmIGhhbmRsZXIuXG4gKiBAcGFyYW0gdmFyZ3MgVGhlIGZ1bmN0aW9uJ3MgYXJndW1lbnRzICh2YXIgYXJncykuXG4gKiBAcGFyYW0gY2FsbGJhY2sgVGhlIGZ1bmN0aW9uJ3MgY2FsbGJhY2suXG4gKiBAcmV0dXJuIFRoZSBGdW5jdGlvbkNhbGwgaW5zdGFuY2UuXG4gKi9cbm1vZHVsZS5leHBvcnRzLmNhbGwgPSBmdW5jdGlvbihmbiwgdmFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIGZuID0gYXJnc1swXTtcbiAgICB2YXJncyA9IGFyZ3Muc2xpY2UoMSwgYXJncy5sZW5ndGggLSAxKTtcbiAgICBjYWxsYmFjayA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgICByZXR1cm4gbmV3IEZ1bmN0aW9uQ2FsbChmbiwgdmFyZ3MsIGNhbGxiYWNrKTtcbn07XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuLyoqXG4gKiBCYWNrb2ZmIGRyaXZlci5cbiAqIEBwYXJhbSBiYWNrb2ZmU3RyYXRlZ3kgQmFja29mZiBkZWxheSBnZW5lcmF0b3Ivc3RyYXRlZ3kuXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gQmFja29mZihiYWNrb2ZmU3RyYXRlZ3kpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLmJhY2tvZmZTdHJhdGVneV8gPSBiYWNrb2ZmU3RyYXRlZ3k7XG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IC0xO1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy50aW1lb3V0SURfID0gLTE7XG5cbiAgICB0aGlzLmhhbmRsZXJzID0ge1xuICAgICAgICBiYWNrb2ZmOiB0aGlzLm9uQmFja29mZl8uYmluZCh0aGlzKVxuICAgIH07XG59XG51dGlsLmluaGVyaXRzKEJhY2tvZmYsIGV2ZW50cy5FdmVudEVtaXR0ZXIpO1xuXG4vKipcbiAqIFNldHMgYSBsaW1pdCwgZ3JlYXRlciB0aGFuIDAsIG9uIHRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy4gQSAnZmFpbCdcbiAqIGV2ZW50IHdpbGwgYmUgZW1pdHRlZCB3aGVuIHRoZSBsaW1pdCBpcyByZWFjaGVkLlxuICogQHBhcmFtIG1heE51bWJlck9mUmV0cnkgVGhlIG1heGltdW0gbnVtYmVyIG9mIGJhY2tvZmZzLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKG1heE51bWJlck9mUmV0cnkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignTWF4aW11bSBudW1iZXIgb2YgcmV0cnkgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4gJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAnQWN0dWFsOiAnICsgbWF4TnVtYmVyT2ZSZXRyeSk7XG4gICAgfVxuXG4gICAgdGhpcy5tYXhOdW1iZXJPZlJldHJ5XyA9IG1heE51bWJlck9mUmV0cnk7XG59O1xuXG4vKipcbiAqIFN0YXJ0cyBhIGJhY2tvZmYgb3BlcmF0aW9uLlxuICogQHBhcmFtIGVyciBPcHRpb25hbCBwYXJhbWF0ZXIgdG8gbGV0IHRoZSBsaXN0ZW5lcnMga25vdyB3aHkgdGhlIGJhY2tvZmZcbiAqICAgICBvcGVyYXRpb24gd2FzIHN0YXJ0ZWQuXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLmJhY2tvZmYgPSBmdW5jdGlvbihlcnIpIHtcbiAgICBpZiAodGhpcy50aW1lb3V0SURfICE9PSAtMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmYgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuYmFja29mZk51bWJlcl8gPT09IHRoaXMubWF4TnVtYmVyT2ZSZXRyeV8pIHtcbiAgICAgICAgdGhpcy5lbWl0KCdmYWlsJywgZXJyKTtcbiAgICAgICAgdGhpcy5yZXNldCgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5uZXh0KCk7XG4gICAgICAgIHRoaXMudGltZW91dElEXyA9IHNldFRpbWVvdXQodGhpcy5oYW5kbGVycy5iYWNrb2ZmLCB0aGlzLmJhY2tvZmZEZWxheV8pO1xuICAgICAgICB0aGlzLmVtaXQoJ2JhY2tvZmYnLCB0aGlzLmJhY2tvZmZOdW1iZXJfLCB0aGlzLmJhY2tvZmZEZWxheV8sIGVycik7XG4gICAgfVxufTtcblxuLyoqXG4gKiBIYW5kbGVzIHRoZSBiYWNrb2ZmIHRpbWVvdXQgY29tcGxldGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkJhY2tvZmYucHJvdG90eXBlLm9uQmFja29mZl8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnRpbWVvdXRJRF8gPSAtMTtcbiAgICB0aGlzLmVtaXQoJ3JlYWR5JywgdGhpcy5iYWNrb2ZmTnVtYmVyXywgdGhpcy5iYWNrb2ZmRGVsYXlfKTtcbiAgICB0aGlzLmJhY2tvZmZOdW1iZXJfKys7XG59O1xuXG4vKipcbiAqIFN0b3BzIGFueSBiYWNrb2ZmIG9wZXJhdGlvbiBhbmQgcmVzZXRzIHRoZSBiYWNrb2ZmIGRlbGF5IHRvIGl0cyBpbml0YWxcbiAqIHZhbHVlLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZk51bWJlcl8gPSAwO1xuICAgIHRoaXMuYmFja29mZlN0cmF0ZWd5Xy5yZXNldCgpO1xuICAgIGNsZWFyVGltZW91dCh0aGlzLnRpbWVvdXRJRF8pO1xuICAgIHRoaXMudGltZW91dElEXyA9IC0xO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmO1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmID0gcmVxdWlyZSgnLi9iYWNrb2ZmJyk7XG52YXIgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneS9maWJvbmFjY2knKTtcblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIHNwZWNpZmllZCB2YWx1ZSBpcyBhIGZ1bmN0aW9uXG4gKiBAcGFyYW0gdmFsIFZhcmlhYmxlIHRvIHRlc3QuXG4gKiBAcmV0dXJuIFdoZXRoZXIgdmFyaWFibGUgaXMgYSBmdW5jdGlvbi5cbiAqL1xuZnVuY3Rpb24gaXNGdW5jdGlvbih2YWwpIHtcbiAgICByZXR1cm4gdHlwZW9mIHZhbCA9PSAnZnVuY3Rpb24nO1xufVxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGNhbGxpbmcgb2YgYSBmdW5jdGlvbiBpbiBhIGJhY2tvZmYgbG9vcC5cbiAqIEBwYXJhbSBmbiBGdW5jdGlvbiB0byB3cmFwIGluIGEgYmFja29mZiBoYW5kbGVyLlxuICogQHBhcmFtIGFyZ3MgQXJyYXkgb2YgZnVuY3Rpb24ncyBhcmd1bWVudHMuXG4gKiBAcGFyYW0gY2FsbGJhY2sgRnVuY3Rpb24ncyBjYWxsYmFjay5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBGdW5jdGlvbkNhbGwoZm4sIGFyZ3MsIGNhbGxiYWNrKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGZuKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2ZuIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgaWYgKCFpc0Z1bmN0aW9uKGNhbGxiYWNrKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ2NhbGxiYWNrIHNob3VsZCBiZSBhIGZ1bmN0aW9uLicgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIHR5cGVvZiBmbik7XG4gICAgfVxuXG4gICAgdGhpcy5mdW5jdGlvbl8gPSBmbjtcbiAgICB0aGlzLmFyZ3VtZW50c18gPSBhcmdzO1xuICAgIHRoaXMuY2FsbGJhY2tfID0gY2FsbGJhY2s7XG4gICAgdGhpcy5yZXN1bHRzXyA9IFtdO1xuXG4gICAgdGhpcy5iYWNrb2ZmXyA9IG51bGw7XG4gICAgdGhpcy5zdHJhdGVneV8gPSBudWxsO1xuICAgIHRoaXMuZmFpbEFmdGVyXyA9IC0xO1xuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlBFTkRJTkc7XG59XG51dGlsLmluaGVyaXRzKEZ1bmN0aW9uQ2FsbCwgZXZlbnRzLkV2ZW50RW1pdHRlcik7XG5cbi8qKlxuICogRW51bSBvZiBzdGF0ZXMgaW4gd2hpY2ggdGhlIEZ1bmN0aW9uQ2FsbCBjYW4gYmUuXG4gKiBAcHJpdmF0ZVxuICovXG5GdW5jdGlvbkNhbGwuU3RhdGVfID0ge1xuICAgIFBFTkRJTkc6IDAsXG4gICAgUlVOTklORzogMSxcbiAgICBDT01QTEVURUQ6IDIsXG4gICAgQUJPUlRFRDogM1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgcGVuZGluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc1BlbmRpbmcgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZV8gPT0gRnVuY3Rpb25DYWxsLlN0YXRlXy5QRU5ESU5HO1xufTtcblxuLyoqXG4gKiBAcmV0dXJuIFdoZXRoZXIgdGhlIGNhbGwgaXMgaW4gcHJvZ3Jlc3MuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNSdW5uaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uUlVOTklORztcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGNvbXBsZXRlZC5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5pc0NvbXBsZXRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXRlXyA9PSBGdW5jdGlvbkNhbGwuU3RhdGVfLkNPTVBMRVRFRDtcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGFib3J0ZWQuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNBYm9ydGVkID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBzdHJhdGVneS5cbiAqIEBwYXJhbSBzdHJhdGVneSBUaGUgYmFja29mZiBzdHJhdGVneSB0byB1c2UuXG4gKiBAcmV0dXJuIEl0c2VsZiBmb3IgY2hhaW5pbmcuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuc2V0U3RyYXRlZ3kgPSBmdW5jdGlvbihzdHJhdGVneSkge1xuICAgIGlmICghdGhpcy5pc1BlbmRpbmcoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBpbiBwcm9ncmVzcy4nKTtcbiAgICB9XG4gICAgdGhpcy5zdHJhdGVneV8gPSBzdHJhdGVneTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogUmV0dXJucyBhbGwgaW50ZXJtZWRpYXJ5IHJlc3VsdHMgcmV0dXJuZWQgYnkgdGhlIHdyYXBwZWQgZnVuY3Rpb24gc2luY2VcbiAqIHRoZSBpbml0aWFsIGNhbGwuXG4gKiBAcmV0dXJuIEFuIGFycmF5IG9mIGludGVybWVkaWFyeSByZXN1bHRzLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmdldFJlc3VsdHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5yZXN1bHRzXy5jb25jYXQoKTtcbn07XG5cbi8qKlxuICogU2V0cyB0aGUgYmFja29mZiBsaW1pdC5cbiAqIEBwYXJhbSBtYXhOdW1iZXJPZlJldHJ5IFRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy5cbiAqIEByZXR1cm4gSXRzZWxmIGZvciBjaGFpbmluZy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5mYWlsQWZ0ZXIgPSBmdW5jdGlvbihtYXhOdW1iZXJPZlJldHJ5KSB7XG4gICAgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGluIHByb2dyZXNzLicpO1xuICAgIH1cbiAgICB0aGlzLmZhaWxBZnRlcl8gPSBtYXhOdW1iZXJPZlJldHJ5O1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiBBYm9ydHMgdGhlIGNhbGwuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc0NvbXBsZXRlZCgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgY29tcGxldGVkLicpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmlzUnVubmluZygpKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8ucmVzZXQoKTtcbiAgICB9XG5cbiAgICB0aGlzLnN0YXRlXyA9IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQUJPUlRFRDtcbn07XG5cbi8qKlxuICogSW5pdGlhdGVzIHRoZSBjYWxsIHRvIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHBhcmFtIGJhY2tvZmZGYWN0b3J5IE9wdGlvbmFsIGZhY3RvcnkgZnVuY3Rpb24gdXNlZCB0byBjcmVhdGUgdGhlIGJhY2tvZmZcbiAqICAgICBpbnN0YW5jZS5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKGJhY2tvZmZGYWN0b3J5KSB7XG4gICAgaWYgKHRoaXMuaXNBYm9ydGVkKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5jdGlvbkNhbGwgYWJvcnRlZC4nKTtcbiAgICB9IGVsc2UgaWYgKCF0aGlzLmlzUGVuZGluZygpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFscmVhZHkgc3RhcnRlZC4nKTtcbiAgICB9XG5cbiAgICB2YXIgc3RyYXRlZ3kgPSB0aGlzLnN0cmF0ZWd5XyB8fCBuZXcgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KCk7XG5cbiAgICB0aGlzLmJhY2tvZmZfID0gYmFja29mZkZhY3RvcnkgP1xuICAgICAgICBiYWNrb2ZmRmFjdG9yeShzdHJhdGVneSkgOlxuICAgICAgICBuZXcgQmFja29mZihzdHJhdGVneSk7XG5cbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdyZWFkeScsIHRoaXMuZG9DYWxsXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdmYWlsJywgdGhpcy5kb0NhbGxiYWNrXy5iaW5kKHRoaXMpKTtcbiAgICB0aGlzLmJhY2tvZmZfLm9uKCdiYWNrb2ZmJywgdGhpcy5oYW5kbGVCYWNrb2ZmXy5iaW5kKHRoaXMpKTtcblxuICAgIGlmICh0aGlzLmZhaWxBZnRlcl8gPiAwKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8uZmFpbEFmdGVyKHRoaXMuZmFpbEFmdGVyXyk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLlJVTk5JTkc7XG4gICAgdGhpcy5kb0NhbGxfKCk7XG59O1xuXG4vKipcbiAqIENhbGxzIHRoZSB3cmFwcGVkIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5kb0NhbGxfID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGV2ZW50QXJncyA9IFsnY2FsbCddLmNvbmNhdCh0aGlzLmFyZ3VtZW50c18pO1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmVtaXQuYXBwbHkodGhpcywgZXZlbnRBcmdzKTtcbiAgICB2YXIgY2FsbGJhY2sgPSB0aGlzLmhhbmRsZUZ1bmN0aW9uQ2FsbGJhY2tfLmJpbmQodGhpcyk7XG4gICAgdGhpcy5mdW5jdGlvbl8uYXBwbHkobnVsbCwgdGhpcy5hcmd1bWVudHNfLmNvbmNhdChjYWxsYmFjaykpO1xufTtcblxuLyoqXG4gKiBDYWxscyB0aGUgd3JhcHBlZCBmdW5jdGlvbidzIGNhbGxiYWNrIHdpdGggdGhlIGxhc3QgcmVzdWx0IHJldHVybmVkIGJ5IHRoZVxuICogd3JhcHBlZCBmdW5jdGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuZG9DYWxsYmFja18gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXJncyA9IHRoaXMucmVzdWx0c19bdGhpcy5yZXN1bHRzXy5sZW5ndGggLSAxXTtcbiAgICB0aGlzLmNhbGxiYWNrXy5hcHBseShudWxsLCBhcmdzKTtcbn07XG5cbi8qKlxuICogSGFuZGxlcyB3cmFwcGVkIGZ1bmN0aW9uJ3MgY29tcGxldGlvbi4gVGhpcyBtZXRob2QgYWN0cyBhcyBhIHJlcGxhY2VtZW50XG4gKiBmb3IgdGhlIG9yaWdpbmFsIGNhbGxiYWNrIGZ1bmN0aW9uLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVGdW5jdGlvbkNhbGxiYWNrXyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLmlzQWJvcnRlZCgpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyk7XG4gICAgdGhpcy5yZXN1bHRzXy5wdXNoKGFyZ3MpOyAvLyBTYXZlIGNhbGxiYWNrIGFyZ3VtZW50cy5cbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0LmFwcGx5KHRoaXMsIFsnY2FsbGJhY2snXS5jb25jYXQoYXJncykpO1xuXG4gICAgaWYgKGFyZ3NbMF0pIHtcbiAgICAgICAgdGhpcy5iYWNrb2ZmXy5iYWNrb2ZmKGFyZ3NbMF0pO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RhdGVfID0gRnVuY3Rpb25DYWxsLlN0YXRlXy5DT01QTEVURUQ7XG4gICAgICAgIHRoaXMuZG9DYWxsYmFja18oKTtcbiAgICB9XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgYmFja29mZiBldmVudC5cbiAqIEBwYXJhbSBudW1iZXIgQmFja29mZiBudW1iZXIuXG4gKiBAcGFyYW0gZGVsYXkgQmFja29mZiBkZWxheS5cbiAqIEBwYXJhbSBlcnIgVGhlIGVycm9yIHRoYXQgY2F1c2VkIHRoZSBiYWNrb2ZmLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5oYW5kbGVCYWNrb2ZmXyA9IGZ1bmN0aW9uKG51bWJlciwgZGVsYXksIGVycikge1xuICAgIHRoaXMuZW1pdCgnYmFja29mZicsIG51bWJlciwgZGVsYXksIGVycik7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZ1bmN0aW9uQ2FsbDtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG52YXIgQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneScpO1xuXG4vKipcbiAqIEV4cG9uZW50aWFsIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykge1xuICAgIEJhY2tvZmZTdHJhdGVneS5jYWxsKHRoaXMsIG9wdGlvbnMpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59XG51dGlsLmluaGVyaXRzKEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LCBCYWNrb2ZmU3RyYXRlZ3kpO1xuXG4vKiogQGluaGVyaXREb2MgKi9cbkV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IE1hdGgubWluKHRoaXMubmV4dEJhY2tvZmZEZWxheV8sIHRoaXMuZ2V0TWF4RGVsYXkoKSk7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuYmFja29mZkRlbGF5XyAqIDI7XG4gICAgcmV0dXJuIHRoaXMuYmFja29mZkRlbGF5Xztcbn07XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG4gICAgdGhpcy5uZXh0QmFja29mZkRlbGF5XyA9IHRoaXMuZ2V0SW5pdGlhbERlbGF5KCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5O1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbnZhciBCYWNrb2ZmU3RyYXRlZ3kgPSByZXF1aXJlKCcuL3N0cmF0ZWd5Jyk7XG5cbi8qKlxuICogRmlib25hY2NpIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAZXh0ZW5kcyBCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xuZnVuY3Rpb24gRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICBCYWNrb2ZmU3RyYXRlZ3kuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xufVxudXRpbC5pbmhlcml0cyhGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3ksIEJhY2tvZmZTdHJhdGVneSk7XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRmlib25hY2NpQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5uZXh0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSBNYXRoLm1pbih0aGlzLm5leHRCYWNrb2ZmRGVsYXlfLCB0aGlzLmdldE1heERlbGF5KCkpO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gKz0gdGhpcy5iYWNrb2ZmRGVsYXlfO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IGJhY2tvZmZEZWxheTtcbiAgICByZXR1cm4gYmFja29mZkRlbGF5O1xufTtcblxuLyoqIEBpbmhlcml0RG9jICovXG5GaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLnJlc2V0XyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xuICAgIHRoaXMuYmFja29mZkRlbGF5XyA9IDA7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneTtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG5mdW5jdGlvbiBpc0RlZih2YWx1ZSkge1xuICAgIHJldHVybiB2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsO1xufVxuXG4vKipcbiAqIEFic3RyYWN0IGNsYXNzIGRlZmluaW5nIHRoZSBza2VsZXRvbiBmb3IgYWxsIGJhY2tvZmYgc3RyYXRlZ2llcy5cbiAqIEBwYXJhbSBvcHRpb25zIEJhY2tvZmYgc3RyYXRlZ3kgb3B0aW9ucy5cbiAqIEBwYXJhbSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yLCBtdXN0IGJlIGJldHdlZW5cbiAqIDAgYW5kIDEuXG4gKiBAcGFyYW0gb3B0aW9ucy5pbml0aWFsRGVsYXkgVGhlIGJhY2tvZmYgaW5pdGlhbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQHBhcmFtIG9wdGlvbnMubWF4RGVsYXkgVGhlIGJhY2tvZmYgbWF4aW1hbCBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEJhY2tvZmZTdHJhdGVneShvcHRpb25zKSB7XG4gICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG5cbiAgICBpZiAoaXNEZWYob3B0aW9ucy5pbml0aWFsRGVsYXkpICYmIG9wdGlvbnMuaW5pdGlhbERlbGF5IDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBpbml0aWFsIHRpbWVvdXQgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4nKTtcbiAgICB9IGVsc2UgaWYgKGlzRGVmKG9wdGlvbnMubWF4RGVsYXkpICYmIG9wdGlvbnMubWF4RGVsYXkgPCAxKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgdGltZW91dCBtdXN0IGJlIGdyZWF0ZXIgdGhhbiAwLicpO1xuICAgIH1cblxuICAgIHRoaXMuaW5pdGlhbERlbGF5XyA9IG9wdGlvbnMuaW5pdGlhbERlbGF5IHx8IDEwMDtcbiAgICB0aGlzLm1heERlbGF5XyA9IG9wdGlvbnMubWF4RGVsYXkgfHwgMTAwMDA7XG5cbiAgICBpZiAodGhpcy5tYXhEZWxheV8gPD0gdGhpcy5pbml0aWFsRGVsYXlfKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIG1heGltYWwgYmFja29mZiBkZWxheSBtdXN0IGJlICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ2dyZWF0ZXIgdGhhbiB0aGUgaW5pdGlhbCBiYWNrb2ZmIGRlbGF5LicpO1xuICAgIH1cblxuICAgIGlmIChpc0RlZihvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IpICYmXG4gICAgICAgIChvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgPCAwIHx8IG9wdGlvbnMucmFuZG9taXNhdGlvbkZhY3RvciA+IDEpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIHJhbmRvbWlzYXRpb24gZmFjdG9yIG11c3QgYmUgYmV0d2VlbiAwIGFuZCAxLicpO1xuICAgIH1cblxuICAgIHRoaXMucmFuZG9taXNhdGlvbkZhY3Rvcl8gPSBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgfHwgMDtcbn1cblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIG1heGltYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIG1heGltYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldE1heERlbGF5ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMubWF4RGVsYXlfO1xufTtcblxuLyoqXG4gKiBSZXRyaWV2ZXMgdGhlIGluaXRpYWwgYmFja29mZiBkZWxheS5cbiAqIEByZXR1cm4gVGhlIGluaXRpYWwgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLmdldEluaXRpYWxEZWxheSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmluaXRpYWxEZWxheV87XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IGNvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBiYWNrb2ZmRGVsYXkgPSB0aGlzLm5leHRfKCk7XG4gICAgdmFyIHJhbmRvbWlzYXRpb25NdWx0aXBsZSA9IDEgKyBNYXRoLnJhbmRvbSgpICogdGhpcy5yYW5kb21pc2F0aW9uRmFjdG9yXztcbiAgICB2YXIgcmFuZG9taXplZERlbGF5ID0gTWF0aC5yb3VuZChiYWNrb2ZmRGVsYXkgKiByYW5kb21pc2F0aW9uTXVsdGlwbGUpO1xuICAgIHJldHVybiByYW5kb21pemVkRGVsYXk7XG59O1xuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBuZXh0IGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBiYWNrb2ZmIGRlbGF5LCBpbiBtaWxsaXNlY29uZHMuXG4gKiBAcHJvdGVjdGVkXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5uZXh0XygpIHVuaW1wbGVtZW50ZWQuJyk7XG59O1xuXG4vKipcbiAqIFRlbXBsYXRlIG1ldGhvZCB0aGF0IHJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMucmVzZXRfKCk7XG59O1xuXG4vKipcbiAqIFJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGlhbCB2YWx1ZS5cbiAqIEBwcm90ZWN0ZWRcbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhY2tvZmZTdHJhdGVneS5yZXNldF8oKSB1bmltcGxlbWVudGVkLicpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBCYWNrb2ZmU3RyYXRlZ3k7XG4iLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNvbm5lY3Q7XG5jb25uZWN0LmNvbm5lY3QgPSBjb25uZWN0O1xuXG4vKiB0aGlzIHdob2xlIGZpbGUgb25seSBleGlzdHMgYmVjYXVzZSB0bHMuc3RhcnRcbiAqIGRvZW5zJ3QgZXhpc3RzIGFuZCB0bHMuY29ubmVjdCBjYW5ub3Qgc3RhcnQgc2VydmVyXG4gKiBjb25uZWN0aW9uc1xuICpcbiAqIGNvcGllZCBmcm9tIF90bHNfd3JhcC5qc1xuICovXG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gcmVxdWlyZSgnbmV0JykuY3JlYXRlU3RyZWFtKDI1LCAnc210cC5leGFtcGxlLmNvbScpXG4vLyAgcy5vbignY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuLy8gICByZXF1aXJlKCd0bHMtY29ubmVjdCcpKHMsIHtjcmVkZW50aWFsczpjcmVkcywgaXNTZXJ2ZXI6ZmFsc2V9LCBmdW5jdGlvbigpIHtcbi8vICAgICAgaWYgKCFzLmF1dGhvcml6ZWQpIHtcbi8vICAgICAgICBzLmRlc3Ryb3koKVxuLy8gICAgICAgIHJldHVyblxuLy8gICAgICB9XG4vL1xuLy8gICAgICBzLmVuZChcImhlbGxvIHdvcmxkXFxuXCIpXG4vLyAgICB9KVxuLy8gIH0pXG5cbnZhciBuZXQgPSByZXF1aXJlKCduZXQnKVxudmFyIHRscyA9IHJlcXVpcmUoJ3RscycpXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxudmFyIGFzc2VydCA9IHJlcXVpcmUoJ2Fzc2VydCcpXG52YXIgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcblxuLy8gUmV0dXJucyBhbiBhcnJheSBbb3B0aW9uc10gb3IgW29wdGlvbnMsIGNiXVxuLy8gSXQgaXMgdGhlIHNhbWUgYXMgdGhlIGFyZ3VtZW50IG9mIFNvY2tldC5wcm90b3R5cGUuY29ubmVjdCgpLlxuZnVuY3Rpb24gX19ub3JtYWxpemVDb25uZWN0QXJncyhhcmdzKSB7XG4gIHZhciBvcHRpb25zID0ge307XG5cbiAgaWYgKHR5cGVvZihhcmdzWzBdKSA9PSAnb2JqZWN0Jykge1xuICAgIC8vIGNvbm5lY3Qob3B0aW9ucywgW2NiXSlcbiAgICBvcHRpb25zID0gYXJnc1swXTtcbiAgfSBlbHNlIGlmIChpc1BpcGVOYW1lKGFyZ3NbMF0pKSB7XG4gICAgLy8gY29ubmVjdChwYXRoLCBbY2JdKTtcbiAgICBvcHRpb25zLnBhdGggPSBhcmdzWzBdO1xuICB9IGVsc2Uge1xuICAgIC8vIGNvbm5lY3QocG9ydCwgW2hvc3RdLCBbY2JdKVxuICAgIG9wdGlvbnMucG9ydCA9IGFyZ3NbMF07XG4gICAgaWYgKHR5cGVvZihhcmdzWzFdKSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIG9wdGlvbnMuaG9zdCA9IGFyZ3NbMV07XG4gICAgfVxuICB9XG5cbiAgdmFyIGNiID0gYXJnc1thcmdzLmxlbmd0aCAtIDFdO1xuICByZXR1cm4gdHlwZW9mKGNiKSA9PT0gJ2Z1bmN0aW9uJyA/IFtvcHRpb25zLCBjYl0gOiBbb3B0aW9uc107XG59XG5cbmZ1bmN0aW9uIF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0LCBjZXJ0KSB7XG4gIC8vIENyZWF0ZSByZWdleHAgdG8gbXVjaCBob3N0bmFtZXNcbiAgZnVuY3Rpb24gcmVnZXhwaWZ5KGhvc3QsIHdpbGRjYXJkcykge1xuICAgIC8vIEFkZCB0cmFpbGluZyBkb3QgKG1ha2UgaG9zdG5hbWVzIHVuaWZvcm0pXG4gICAgaWYgKCEvXFwuJC8udGVzdChob3N0KSkgaG9zdCArPSAnLic7XG5cbiAgICAvLyBUaGUgc2FtZSBhcHBsaWVzIHRvIGhvc3RuYW1lIHdpdGggbW9yZSB0aGFuIG9uZSB3aWxkY2FyZCxcbiAgICAvLyBpZiBob3N0bmFtZSBoYXMgd2lsZGNhcmQgd2hlbiB3aWxkY2FyZHMgYXJlIG5vdCBhbGxvd2VkLFxuICAgIC8vIG9yIGlmIHRoZXJlIGFyZSBsZXNzIHRoYW4gdHdvIGRvdHMgYWZ0ZXIgd2lsZGNhcmQgKGkuZS4gKi5jb20gb3IgKmQuY29tKVxuICAgIC8vXG4gICAgLy8gYWxzb1xuICAgIC8vXG4gICAgLy8gXCJUaGUgY2xpZW50IFNIT1VMRCBOT1QgYXR0ZW1wdCB0byBtYXRjaCBhIHByZXNlbnRlZCBpZGVudGlmaWVyIGluXG4gICAgLy8gd2hpY2ggdGhlIHdpbGRjYXJkIGNoYXJhY3RlciBjb21wcmlzZXMgYSBsYWJlbCBvdGhlciB0aGFuIHRoZVxuICAgIC8vIGxlZnQtbW9zdCBsYWJlbCAoZS5nLiwgZG8gbm90IG1hdGNoIGJhci4qLmV4YW1wbGUubmV0KS5cIlxuICAgIC8vIFJGQzYxMjVcbiAgICBpZiAoIXdpbGRjYXJkcyAmJiAvXFwqLy50ZXN0KGhvc3QpIHx8IC9bXFwuXFwqXS4qXFwqLy50ZXN0KGhvc3QpIHx8XG4gICAgICAgIC9cXCovLnRlc3QoaG9zdCkgJiYgIS9cXCouKlxcLi4rXFwuLisvLnRlc3QoaG9zdCkpIHtcbiAgICAgIHJldHVybiAvJC4vO1xuICAgIH1cblxuICAgIC8vIFJlcGxhY2Ugd2lsZGNhcmQgY2hhcnMgd2l0aCByZWdleHAncyB3aWxkY2FyZCBhbmRcbiAgICAvLyBlc2NhcGUgYWxsIGNoYXJhY3RlcnMgdGhhdCBoYXZlIHNwZWNpYWwgbWVhbmluZyBpbiByZWdleHBzXG4gICAgLy8gKGkuZS4gJy4nLCAnWycsICd7JywgJyonLCBhbmQgb3RoZXJzKVxuICAgIHZhciByZSA9IGhvc3QucmVwbGFjZShcbiAgICAgICAgL1xcKihbYS16MC05XFxcXC1fXFwuXSl8W1xcLixcXC1cXFxcXFxeXFwkKz8qXFxbXFxdXFwoXFwpOiFcXHx7fV0vZyxcbiAgICAgICAgZnVuY3Rpb24oYWxsLCBzdWIpIHtcbiAgICAgICAgICBpZiAoc3ViKSByZXR1cm4gJ1thLXowLTlcXFxcLV9dKicgKyAoc3ViID09PSAnLScgPyAnXFxcXC0nIDogc3ViKTtcbiAgICAgICAgICByZXR1cm4gJ1xcXFwnICsgYWxsO1xuICAgICAgICB9KTtcblxuICAgIHJldHVybiBuZXcgUmVnRXhwKCdeJyArIHJlICsgJyQnLCAnaScpO1xuICB9XG5cbiAgdmFyIGRuc05hbWVzID0gW10sXG4gICAgICB1cmlOYW1lcyA9IFtdLFxuICAgICAgaXBzID0gW10sXG4gICAgICBtYXRjaENOID0gdHJ1ZSxcbiAgICAgIHZhbGlkID0gZmFsc2U7XG5cbiAgLy8gVGhlcmUncmUgc2V2ZXJhbCBuYW1lcyB0byBwZXJmb3JtIGNoZWNrIGFnYWluc3Q6XG4gIC8vIENOIGFuZCBhbHRuYW1lcyBpbiBjZXJ0aWZpY2F0ZSBleHRlbnNpb25cbiAgLy8gKEROUyBuYW1lcywgSVAgYWRkcmVzc2VzLCBhbmQgVVJJcylcbiAgLy9cbiAgLy8gV2FsayB0aHJvdWdoIGFsdG5hbWVzIGFuZCBnZW5lcmF0ZSBsaXN0cyBvZiB0aG9zZSBuYW1lc1xuICBpZiAoY2VydC5zdWJqZWN0YWx0bmFtZSkge1xuICAgIGNlcnQuc3ViamVjdGFsdG5hbWUuc3BsaXQoLywgL2cpLmZvckVhY2goZnVuY3Rpb24oYWx0bmFtZSkge1xuICAgICAgaWYgKC9eRE5TOi8udGVzdChhbHRuYW1lKSkge1xuICAgICAgICBkbnNOYW1lcy5wdXNoKGFsdG5hbWUuc2xpY2UoNCkpO1xuICAgICAgfSBlbHNlIGlmICgvXklQIEFkZHJlc3M6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIGlwcy5wdXNoKGFsdG5hbWUuc2xpY2UoMTEpKTtcbiAgICAgIH0gZWxzZSBpZiAoL15VUkk6Ly50ZXN0KGFsdG5hbWUpKSB7XG4gICAgICAgIHZhciB1cmkgPSB1cmwucGFyc2UoYWx0bmFtZS5zbGljZSg0KSk7XG4gICAgICAgIGlmICh1cmkpIHVyaU5hbWVzLnB1c2godXJpLmhvc3RuYW1lKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIElmIGhvc3RuYW1lIGlzIGFuIElQIGFkZHJlc3MsIGl0IHNob3VsZCBiZSBwcmVzZW50IGluIHRoZSBsaXN0IG9mIElQXG4gIC8vIGFkZHJlc3Nlcy5cbiAgaWYgKG5ldC5pc0lQKGhvc3QpKSB7XG4gICAgdmFsaWQgPSBpcHMuc29tZShmdW5jdGlvbihpcCkge1xuICAgICAgcmV0dXJuIGlwID09PSBob3N0O1xuICAgIH0pO1xuICB9IGVsc2Uge1xuICAgIC8vIFRyYW5zZm9ybSBob3N0bmFtZSB0byBjYW5vbmljYWwgZm9ybVxuICAgIGlmICghL1xcLiQvLnRlc3QoaG9zdCkpIGhvc3QgKz0gJy4nO1xuXG4gICAgLy8gT3RoZXJ3aXNlIGNoZWNrIGFsbCBETlMvVVJJIHJlY29yZHMgZnJvbSBjZXJ0aWZpY2F0ZVxuICAgIC8vICh3aXRoIGFsbG93ZWQgd2lsZGNhcmRzKVxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMubWFwKGZ1bmN0aW9uKG5hbWUpIHtcbiAgICAgIHJldHVybiByZWdleHBpZnkobmFtZSwgdHJ1ZSk7XG4gICAgfSk7XG5cbiAgICAvLyBXaWxkY2FyZHMgYWluJ3QgYWxsb3dlZCBpbiBVUkkgbmFtZXNcbiAgICB1cmlOYW1lcyA9IHVyaU5hbWVzLm1hcChmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcmVnZXhwaWZ5KG5hbWUsIGZhbHNlKTtcbiAgICB9KTtcblxuICAgIGRuc05hbWVzID0gZG5zTmFtZXMuY29uY2F0KHVyaU5hbWVzKTtcblxuICAgIGlmIChkbnNOYW1lcy5sZW5ndGggPiAwKSBtYXRjaENOID0gZmFsc2U7XG5cblxuICAgIC8vIE1hdGNoIGFnYWluc3QgQ29tbW9uIE5hbWUgKENOKSBvbmx5IGlmIG5vIHN1cHBvcnRlZCBpZGVudGlmaWVycyBhcmVcbiAgICAvLyBwcmVzZW50LlxuICAgIC8vXG4gICAgLy8gXCJBcyBub3RlZCwgYSBjbGllbnQgTVVTVCBOT1Qgc2VlayBhIG1hdGNoIGZvciBhIHJlZmVyZW5jZSBpZGVudGlmaWVyXG4gICAgLy8gIG9mIENOLUlEIGlmIHRoZSBwcmVzZW50ZWQgaWRlbnRpZmllcnMgaW5jbHVkZSBhIEROUy1JRCwgU1JWLUlELFxuICAgIC8vICBVUkktSUQsIG9yIGFueSBhcHBsaWNhdGlvbi1zcGVjaWZpYyBpZGVudGlmaWVyIHR5cGVzIHN1cHBvcnRlZCBieSB0aGVcbiAgICAvLyAgY2xpZW50LlwiXG4gICAgLy8gUkZDNjEyNVxuICAgIGlmIChtYXRjaENOKSB7XG4gICAgICB2YXIgY29tbW9uTmFtZXMgPSBjZXJ0LnN1YmplY3QuQ047XG4gICAgICBpZiAodXRpbC5pc0FycmF5KGNvbW1vbk5hbWVzKSkge1xuICAgICAgICBmb3IgKHZhciBpID0gMCwgayA9IGNvbW1vbk5hbWVzLmxlbmd0aDsgaSA8IGs7ICsraSkge1xuICAgICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzW2ldLCB0cnVlKSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRuc05hbWVzLnB1c2gocmVnZXhwaWZ5KGNvbW1vbk5hbWVzLCB0cnVlKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdmFsaWQgPSBkbnNOYW1lcy5zb21lKGZ1bmN0aW9uKHJlKSB7XG4gICAgICByZXR1cm4gcmUudGVzdChob3N0KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJldHVybiB2YWxpZDtcbn07XG5cbi8vIFRhcmdldCBBUEk6XG4vL1xuLy8gIHZhciBzID0gdGxzLmNvbm5lY3Qoe3BvcnQ6IDgwMDAsIGhvc3Q6IFwiZ29vZ2xlLmNvbVwifSwgZnVuY3Rpb24oKSB7XG4vLyAgICBpZiAoIXMuYXV0aG9yaXplZCkge1xuLy8gICAgICBzLmRlc3Ryb3koKTtcbi8vICAgICAgcmV0dXJuO1xuLy8gICAgfVxuLy9cbi8vICAgIC8vIHMuc29ja2V0O1xuLy9cbi8vICAgIHMuZW5kKFwiaGVsbG8gd29ybGRcXG5cIik7XG4vLyAgfSk7XG4vL1xuLy9cbmZ1bmN0aW9uIG5vcm1hbGl6ZUNvbm5lY3RBcmdzKGxpc3RBcmdzKSB7XG4gIHZhciBhcmdzID0gX19ub3JtYWxpemVDb25uZWN0QXJncyhsaXN0QXJncyk7XG4gIHZhciBvcHRpb25zID0gYXJnc1swXTtcbiAgdmFyIGNiID0gYXJnc1sxXTtcblxuICBpZiAodHlwZW9mKGxpc3RBcmdzWzFdKSA9PT0gJ29iamVjdCcpIHtcbiAgICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKG9wdGlvbnMsIGxpc3RBcmdzWzFdKTtcbiAgfSBlbHNlIGlmICh0eXBlb2YobGlzdEFyZ3NbMl0pID09PSAnb2JqZWN0Jykge1xuICAgIG9wdGlvbnMgPSB1dGlsLl9leHRlbmQob3B0aW9ucywgbGlzdEFyZ3NbMl0pO1xuICB9XG5cbiAgcmV0dXJuIChjYikgPyBbb3B0aW9ucywgY2JdIDogW29wdGlvbnNdO1xufVxuXG5mdW5jdGlvbiBsZWdhY3lDb25uZWN0KGhvc3RuYW1lLCBvcHRpb25zLCBOUE4sIGNyZWRlbnRpYWxzKSB7XG4gIGFzc2VydChvcHRpb25zLnNvY2tldCk7XG4gIHZhciBwYWlyID0gdGxzLmNyZWF0ZVNlY3VyZVBhaXIoY3JlZGVudGlhbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgISFvcHRpb25zLmlzU2VydmVyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICEhb3B0aW9ucy5yZXF1ZXN0Q2VydCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIE5QTlByb3RvY29sczogTlBOLk5QTlByb3RvY29scyxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlcnZlcm5hbWU6IGhvc3RuYW1lXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gIGxlZ2FjeVBpcGUocGFpciwgb3B0aW9ucy5zb2NrZXQpO1xuICBwYWlyLmNsZWFydGV4dC5fY29udHJvbFJlbGVhc2VkID0gdHJ1ZTtcbiAgcGFpci5vbignZXJyb3InLCBmdW5jdGlvbihlcnIpIHtcbiAgICBwYWlyLmNsZWFydGV4dC5lbWl0KCdlcnJvcicsIGVycik7XG4gIH0pO1xuXG4gIHJldHVybiBwYWlyO1xufVxuXG5mdW5jdGlvbiBjb25uZWN0KC8qIFtwb3J0LCBob3N0XSwgb3B0aW9ucywgY2IgKi8pIHtcbiAgdmFyIGFyZ3MgPSBub3JtYWxpemVDb25uZWN0QXJncyhhcmd1bWVudHMpO1xuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMF07XG4gIHZhciBjYiA9IGFyZ3NbMV07XG5cbiAgdmFyIGRlZmF1bHRzID0ge1xuICAgIHJlamVjdFVuYXV0aG9yaXplZDogJzAnICE9PSBwcm9jZXNzLmVudi5OT0RFX1RMU19SRUpFQ1RfVU5BVVRIT1JJWkVELFxuICAgIHJlcXVlc3RDZXJ0OiB0cnVlLFxuICAgIGlzU2VydmVyOiBmYWxzZVxuICB9O1xuICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKGRlZmF1bHRzLCBvcHRpb25zIHx8IHt9KTtcblxuICB2YXIgaG9zdG5hbWUgPSBvcHRpb25zLnNlcnZlcm5hbWUgfHxcbiAgICAgICAgICAgICAgICAgb3B0aW9ucy5ob3N0IHx8XG4gICAgICAgICAgICAgICAgIG9wdGlvbnMuc29ja2V0ICYmIG9wdGlvbnMuc29ja2V0Ll9ob3N0IHx8XG4gICAgICAgICAgICAgICAgICcxMjcuMC4wLjEnLFxuICAgICAgTlBOID0ge30sXG4gICAgICBjcmVkZW50aWFscyA9IG9wdGlvbnMuY3JlZGVudGlhbHMgfHwgY3J5cHRvLmNyZWF0ZUNyZWRlbnRpYWxzKG9wdGlvbnMpO1xuICBpZiAodGxzLmNvbnZlcnROUE5Qcm90b2NvbHMpXG4gICAgdGxzLmNvbnZlcnROUE5Qcm90b2NvbHMob3B0aW9ucy5OUE5Qcm90b2NvbHMsIE5QTik7XG5cbiAgLy8gV3JhcHBpbmcgVExTIHNvY2tldCBpbnNpZGUgYW5vdGhlciBUTFMgc29ja2V0IHdhcyByZXF1ZXN0ZWQgLVxuICAvLyBjcmVhdGUgbGVnYWN5IHNlY3VyZSBwYWlyXG4gIHZhciBzb2NrZXQ7XG4gIHZhciBsZWdhY3k7XG4gIHZhciByZXN1bHQ7XG4gIGlmICh0eXBlb2YgdGxzLlRMU1NvY2tldCA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICBsZWdhY3kgPSB0cnVlO1xuICAgIHNvY2tldCA9IGxlZ2FjeUNvbm5lY3QoaG9zdG5hbWUsIG9wdGlvbnMsIE5QTiwgY3JlZGVudGlhbHMpO1xuICAgIHJlc3VsdCA9IHNvY2tldC5jbGVhcnRleHQ7XG4gIH0gZWxzZSB7XG4gICAgbGVnYWN5ID0gZmFsc2U7XG4gICAgc29ja2V0ID0gbmV3IHRscy5UTFNTb2NrZXQob3B0aW9ucy5zb2NrZXQsIHtcbiAgICAgIGNyZWRlbnRpYWxzOiBjcmVkZW50aWFscyxcbiAgICAgIGlzU2VydmVyOiAhIW9wdGlvbnMuaXNTZXJ2ZXIsXG4gICAgICByZXF1ZXN0Q2VydDogISFvcHRpb25zLnJlcXVlc3RDZXJ0LFxuICAgICAgcmVqZWN0VW5hdXRob3JpemVkOiAhIW9wdGlvbnMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgTlBOUHJvdG9jb2xzOiBOUE4uTlBOUHJvdG9jb2xzXG4gICAgfSk7XG4gICAgcmVzdWx0ID0gc29ja2V0O1xuICB9XG5cbiAgaWYgKHNvY2tldC5faGFuZGxlICYmICFzb2NrZXQuX2Nvbm5lY3RpbmcpIHtcbiAgICBvbkhhbmRsZSgpO1xuICB9IGVsc2Uge1xuICAgIC8vIE5vdCBldmVuIHN0YXJ0ZWQgY29ubmVjdGluZyB5ZXQgKG9yIHByb2JhYmx5IHJlc29sdmluZyBkbnMgYWRkcmVzcyksXG4gICAgLy8gY2F0Y2ggc29ja2V0IGVycm9ycyBhbmQgYXNzaWduIGhhbmRsZS5cbiAgICBpZiAoIWxlZ2FjeSAmJiBvcHRpb25zLnNvY2tldCkge1xuICAgICAgb3B0aW9ucy5zb2NrZXQub25jZSgnY29ubmVjdCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBhc3NlcnQob3B0aW9ucy5zb2NrZXQuX2hhbmRsZSk7XG4gICAgICAgIHNvY2tldC5faGFuZGxlID0gb3B0aW9ucy5zb2NrZXQuX2hhbmRsZTtcbiAgICAgICAgc29ja2V0Ll9oYW5kbGUub3duZXIgPSBzb2NrZXQ7XG5cbiAgICAgICAgc29ja2V0LmVtaXQoJ2Nvbm5lY3QnKTtcbiAgICAgIH0pO1xuICAgIH1cbiAgICBzb2NrZXQub25jZSgnY29ubmVjdCcsIG9uSGFuZGxlKTtcbiAgfVxuXG4gIGlmIChjYilcbiAgICByZXN1bHQub25jZSgnc2VjdXJlQ29ubmVjdCcsIGNiKTtcblxuICBpZiAoIW9wdGlvbnMuc29ja2V0KSB7XG4gICAgYXNzZXJ0KCFsZWdhY3kpO1xuICAgIHZhciBjb25uZWN0X29wdDtcbiAgICBpZiAob3B0aW9ucy5wYXRoICYmICFvcHRpb25zLnBvcnQpIHtcbiAgICAgIGNvbm5lY3Rfb3B0ID0geyBwYXRoOiBvcHRpb25zLnBhdGggfTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29ubmVjdF9vcHQgPSB7XG4gICAgICAgIHBvcnQ6IG9wdGlvbnMucG9ydCxcbiAgICAgICAgaG9zdDogb3B0aW9ucy5ob3N0LFxuICAgICAgICBsb2NhbEFkZHJlc3M6IG9wdGlvbnMubG9jYWxBZGRyZXNzXG4gICAgICB9O1xuICAgIH1cbiAgICBzb2NrZXQuY29ubmVjdChjb25uZWN0X29wdCk7XG4gIH1cblxuICByZXR1cm4gcmVzdWx0O1xuXG4gIGZ1bmN0aW9uIG9uSGFuZGxlKCkge1xuICAgIGlmICghbGVnYWN5KVxuICAgICAgc29ja2V0Ll9yZWxlYXNlQ29udHJvbCgpO1xuXG4gICAgaWYgKG9wdGlvbnMuc2Vzc2lvbilcbiAgICAgIHNvY2tldC5zZXRTZXNzaW9uKG9wdGlvbnMuc2Vzc2lvbik7XG5cbiAgICBpZiAoIWxlZ2FjeSkge1xuICAgICAgaWYgKG9wdGlvbnMuc2VydmVybmFtZSlcbiAgICAgICAgc29ja2V0LnNldFNlcnZlcm5hbWUob3B0aW9ucy5zZXJ2ZXJuYW1lKTtcblxuICAgICAgaWYgKCFvcHRpb25zLmlzU2VydmVyKVxuICAgICAgICBzb2NrZXQuX3N0YXJ0KCk7XG4gICAgfVxuICAgIHNvY2tldC5vbignc2VjdXJlJywgZnVuY3Rpb24oKSB7XG4gICAgICB2YXIgc3NsID0gc29ja2V0Ll9zc2wgfHwgc29ja2V0LnNzbDtcbiAgICAgIHZhciB2ZXJpZnlFcnJvciA9IHNzbC52ZXJpZnlFcnJvcigpO1xuXG4gICAgICAvLyBWZXJpZnkgdGhhdCBzZXJ2ZXIncyBpZGVudGl0eSBtYXRjaGVzIGl0J3MgY2VydGlmaWNhdGUncyBuYW1lc1xuICAgICAgaWYgKCF2ZXJpZnlFcnJvcikge1xuICAgICAgICB2YXIgY2VydCA9IHJlc3VsdC5nZXRQZWVyQ2VydGlmaWNhdGUoKTtcbiAgICAgICAgdmFyIHZhbGlkQ2VydCA9IF9fY2hlY2tTZXJ2ZXJJZGVudGl0eShob3N0bmFtZSwgY2VydCk7XG4gICAgICAgIGlmICghdmFsaWRDZXJ0KSB7XG4gICAgICAgICAgdmVyaWZ5RXJyb3IgPSBuZXcgRXJyb3IoJ0hvc3RuYW1lL0lQIGRvZXNuXFwndCBtYXRjaCBjZXJ0aWZpY2F0ZVxcJ3MgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJ2FsdG5hbWVzJyk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHZlcmlmeUVycm9yKSB7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemVkID0gZmFsc2U7XG4gICAgICAgIHJlc3VsdC5hdXRob3JpemF0aW9uRXJyb3IgPSB2ZXJpZnlFcnJvci5tZXNzYWdlO1xuXG4gICAgICAgIGlmIChvcHRpb25zLnJlamVjdFVuYXV0aG9yaXplZCkge1xuICAgICAgICAgIHJlc3VsdC5lbWl0KCdlcnJvcicsIHZlcmlmeUVycm9yKTtcbiAgICAgICAgICByZXN1bHQuZGVzdHJveSgpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXN1bHQuZW1pdCgnc2VjdXJlQ29ubmVjdCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXN1bHQuYXV0aG9yaXplZCA9IHRydWU7XG4gICAgICAgIHJlc3VsdC5lbWl0KCdzZWN1cmVDb25uZWN0Jyk7XG4gICAgICB9XG5cbiAgICAgIC8vIFVuY29yayBpbmNvbWluZyBkYXRhXG4gICAgICByZXN1bHQucmVtb3ZlTGlzdGVuZXIoJ2VuZCcsIG9uSGFuZ1VwKTtcbiAgICB9KTtcblxuICAgIGZ1bmN0aW9uIG9uSGFuZ1VwKCkge1xuICAgICAgLy8gTk9URTogVGhpcyBsb2dpYyBpcyBzaGFyZWQgd2l0aCBfaHR0cF9jbGllbnQuanNcbiAgICAgIGlmICghc29ja2V0Ll9oYWRFcnJvcikge1xuICAgICAgICBzb2NrZXQuX2hhZEVycm9yID0gdHJ1ZTtcbiAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCdzb2NrZXQgaGFuZyB1cCcpO1xuICAgICAgICBlcnJvci5jb2RlID0gJ0VDT05OUkVTRVQnO1xuICAgICAgICBzb2NrZXQuZGVzdHJveSgpO1xuICAgICAgICBzb2NrZXQuZW1pdCgnZXJyb3InLCBlcnJvcik7XG4gICAgICB9XG4gICAgfVxuICAgIHJlc3VsdC5vbmNlKCdlbmQnLCBvbkhhbmdVcCk7XG4gIH1cbn07XG5cbmZ1bmN0aW9uIGxlZ2FjeVBpcGUocGFpciwgc29ja2V0KSB7XG4gIHBhaXIuZW5jcnlwdGVkLnBpcGUoc29ja2V0KTtcbiAgc29ja2V0LnBpcGUocGFpci5lbmNyeXB0ZWQpO1xuXG4gIHBhaXIuZW5jcnlwdGVkLm9uKCdjbG9zZScsIGZ1bmN0aW9uKCkge1xuICAgIHByb2Nlc3MubmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAvLyBFbmNyeXB0ZWQgc2hvdWxkIGJlIHVucGlwZWQgZnJvbSBzb2NrZXQgdG8gcHJldmVudCBwb3NzaWJsZVxuICAgICAgLy8gd3JpdGUgYWZ0ZXIgZGVzdHJveS5cbiAgICAgIGlmIChwYWlyLmVuY3J5cHRlZC51bnBpcGUpXG4gICAgICAgIHBhaXIuZW5jcnlwdGVkLnVucGlwZShzb2NrZXQpO1xuICAgICAgc29ja2V0LmRlc3Ryb3lTb29uKCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHBhaXIuZmQgPSBzb2NrZXQuZmQ7XG4gIHBhaXIuX2hhbmRsZSA9IHNvY2tldC5faGFuZGxlO1xuICB2YXIgY2xlYXJ0ZXh0ID0gcGFpci5jbGVhcnRleHQ7XG4gIGNsZWFydGV4dC5zb2NrZXQgPSBzb2NrZXQ7XG4gIGNsZWFydGV4dC5lbmNyeXB0ZWQgPSBwYWlyLmVuY3J5cHRlZDtcbiAgY2xlYXJ0ZXh0LmF1dGhvcml6ZWQgPSBmYWxzZTtcblxuICAvLyBjeWNsZSB0aGUgZGF0YSB3aGVuZXZlciB0aGUgc29ja2V0IGRyYWlucywgc28gdGhhdFxuICAvLyB3ZSBjYW4gcHVsbCBzb21lIG1vcmUgaW50byBpdC4gIG5vcm1hbGx5IHRoaXMgd291bGRcbiAgLy8gYmUgaGFuZGxlZCBieSB0aGUgZmFjdCB0aGF0IHBpcGUoKSB0cmlnZ2VycyByZWFkKCkgY2FsbHNcbiAgLy8gb24gd3JpdGFibGUuZHJhaW4sIGJ1dCBDcnlwdG9TdHJlYW1zIGFyZSBhIGJpdCBtb3JlXG4gIC8vIGNvbXBsaWNhdGVkLiAgU2luY2UgdGhlIGVuY3J5cHRlZCBzaWRlIGFjdHVhbGx5IGdldHNcbiAgLy8gaXRzIGRhdGEgZnJvbSB0aGUgY2xlYXJ0ZXh0IHNpZGUsIHdlIGhhdmUgdG8gZ2l2ZSBpdCBhXG4gIC8vIGxpZ2h0IGtpY2sgdG8gZ2V0IGluIG1vdGlvbiBhZ2Fpbi5cbiAgc29ja2V0Lm9uKCdkcmFpbicsIGZ1bmN0aW9uKCkge1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5fcGVuZGluZyAmJiBwYWlyLmVuY3J5cHRlZC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5lbmNyeXB0ZWQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmNsZWFydGV4dC5fcGVuZGluZyAmJiBwYWlyLmNsZWFydGV4dC5fd3JpdGVQZW5kaW5nKVxuICAgICAgcGFpci5jbGVhcnRleHQuX3dyaXRlUGVuZGluZygpO1xuICAgIGlmIChwYWlyLmVuY3J5cHRlZC5yZWFkKVxuICAgICAgcGFpci5lbmNyeXB0ZWQucmVhZCgwKTtcbiAgICBpZiAocGFpci5jbGVhcnRleHQucmVhZClcbiAgICAgIHBhaXIuY2xlYXJ0ZXh0LnJlYWQoMCk7XG4gIH0pO1xuXG4gIGZ1bmN0aW9uIG9uZXJyb3IoZSkge1xuICAgIGlmIChjbGVhcnRleHQuX2NvbnRyb2xSZWxlYXNlZCkge1xuICAgICAgY2xlYXJ0ZXh0LmVtaXQoJ2Vycm9yJywgZSk7XG4gICAgfVxuICB9XG5cbiAgZnVuY3Rpb24gb25jbG9zZSgpIHtcbiAgICBzb2NrZXQucmVtb3ZlTGlzdGVuZXIoJ2Vycm9yJywgb25lcnJvcik7XG4gICAgc29ja2V0LnJlbW92ZUxpc3RlbmVyKCd0aW1lb3V0Jywgb250aW1lb3V0KTtcbiAgfVxuXG4gIGZ1bmN0aW9uIG9udGltZW91dCgpIHtcbiAgICBjbGVhcnRleHQuZW1pdCgndGltZW91dCcpO1xuICB9XG5cbiAgc29ja2V0Lm9uKCdlcnJvcicsIG9uZXJyb3IpO1xuICBzb2NrZXQub24oJ2Nsb3NlJywgb25jbG9zZSk7XG4gIHNvY2tldC5vbigndGltZW91dCcsIG9udGltZW91dCk7XG5cbiAgcmV0dXJuIGNsZWFydGV4dDtcbn07XG5cbn0pLmNhbGwodGhpcyxyZXF1aXJlKFwiMVlpWjVTXCIpKSJdfQ==
