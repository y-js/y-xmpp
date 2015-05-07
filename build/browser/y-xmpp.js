(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);throw new Error("Cannot find module '"+o+"'")}var f=n[o]={exports:{}};t[o][0].call(f.exports,function(e){var n=t[o][1][e];return s(n?n:e)},f,f.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
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



},{"ltx":24,"node-xmpp-client":28}],2:[function(require,module,exports){

},{}],3:[function(require,module,exports){
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

},{"util/":21}],4:[function(require,module,exports){
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

},{"base64-js":5,"ieee754":6}],5:[function(require,module,exports){
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

},{}],6:[function(require,module,exports){
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

},{}],7:[function(require,module,exports){
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

},{"buffer":4}],8:[function(require,module,exports){
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

},{"./md5":9,"./rng":10,"./sha":11,"./sha256":12,"buffer":4}],9:[function(require,module,exports){
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

},{"./helpers":7}],10:[function(require,module,exports){
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

},{}],11:[function(require,module,exports){
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

},{"./helpers":7}],12:[function(require,module,exports){

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

},{"./helpers":7}],13:[function(require,module,exports){
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

},{}],14:[function(require,module,exports){
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

},{}],15:[function(require,module,exports){
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
},{"1YiZ5S":16}],16:[function(require,module,exports){
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

},{}],17:[function(require,module,exports){
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

},{}],19:[function(require,module,exports){
'use strict';

exports.decode = exports.parse = require('./decode');
exports.encode = exports.stringify = require('./encode');

},{"./decode":17,"./encode":18}],20:[function(require,module,exports){
module.exports = function isBuffer(arg) {
  return arg && typeof arg === 'object'
    && typeof arg.copy === 'function'
    && typeof arg.fill === 'function'
    && typeof arg.readUInt8 === 'function';
}
},{}],21:[function(require,module,exports){
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
},{"./support/isBuffer":20,"1YiZ5S":16,"inherits":14}],22:[function(require,module,exports){
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

},{"./element":23,"util":21}],23:[function(require,module,exports){
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

},{}],24:[function(require,module,exports){
'use strict';

/* Cause browserify to bundle SAX parsers: */
var parse = require('./parse')

parse.availableSaxParsers.push(parse.bestSaxParser = require('./sax/sax_ltx'))

/* SHIM */
module.exports = require('./index')
},{"./index":25,"./parse":26,"./sax/sax_ltx":27}],25:[function(require,module,exports){
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

},{"./dom-element":22,"./element":23,"./parse":26}],26:[function(require,module,exports){
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

},{"./dom-element":22,"events":13,"util":21}],27:[function(require,module,exports){
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

},{"events":13,"util":21}],28:[function(require,module,exports){
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
},{"./lib/authentication/anonymous":29,"./lib/authentication/digestmd5":30,"./lib/authentication/external":31,"./lib/authentication/plain":33,"./lib/authentication/xfacebook":34,"./lib/authentication/xoauth2":35,"./lib/sasl":37,"./lib/session":38,"buffer":4,"child_process":2,"debug":41,"node-xmpp-core":44,"util":21}],29:[function(require,module,exports){
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
},{"./mechanism":32,"util":21}],30:[function(require,module,exports){
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

},{"./mechanism":32,"crypto":8,"util":21}],31:[function(require,module,exports){
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
},{"./mechanism":32,"util":21}],32:[function(require,module,exports){
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
},{"events":13,"util":21}],33:[function(require,module,exports){
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
},{"./mechanism":32,"util":21}],34:[function(require,module,exports){
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
},{"./mechanism":32,"querystring":19,"util":21}],35:[function(require,module,exports){
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

},{"./mechanism":32,"util":21}],36:[function(require,module,exports){
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
},{"1YiZ5S":16,"debug":41,"events":13,"node-xmpp-core":44,"request":40,"util":21}],37:[function(require,module,exports){
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

},{"./authentication/mechanism":32}],38:[function(require,module,exports){
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
},{"./bosh":36,"./websockets":39,"1YiZ5S":16,"crypto":8,"debug":41,"events":13,"node-xmpp-core":44,"tls":2,"util":21}],39:[function(require,module,exports){
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

},{"debug":41,"events":13,"faye-websocket":2,"node-xmpp-core":44,"util":21}],40:[function(require,module,exports){
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

},{}],41:[function(require,module,exports){

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

},{"./debug":42}],42:[function(require,module,exports){

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

},{"ms":43}],43:[function(require,module,exports){
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

},{}],44:[function(require,module,exports){
var extend = require('util')._extend

exports.Stanza = {}
extend(exports.Stanza, require('./lib/stanza'))
exports.JID = require('./lib/jid')
exports.Connection = require('./lib/connection')
exports.SRV = require('./lib/srv')
exports.StreamParser = require('./lib/stream_parser')
exports.ltx = require('ltx')
},{"./lib/connection":45,"./lib/jid":46,"./lib/srv":47,"./lib/stanza":48,"./lib/stream_parser":49,"ltx":55,"util":21}],45:[function(require,module,exports){
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

},{"./stream_parser":49,"debug":50,"events":13,"ltx":55,"net":2,"reconnect-core":65,"tls-connect":72,"util":21}],46:[function(require,module,exports){
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

},{"node-stringprep":59}],47:[function(require,module,exports){
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

},{"dns":2}],48:[function(require,module,exports){
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

},{"ltx":55,"util":21}],49:[function(require,module,exports){
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
},{"./stanza":48,"events":13,"ltx":55,"util":21}],50:[function(require,module,exports){

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

},{"./debug":51}],51:[function(require,module,exports){
arguments[4][42][0].apply(exports,arguments)
},{"ms":52}],52:[function(require,module,exports){
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

},{}],53:[function(require,module,exports){
arguments[4][22][0].apply(exports,arguments)
},{"./element":54,"util":21}],54:[function(require,module,exports){
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

},{}],55:[function(require,module,exports){
arguments[4][24][0].apply(exports,arguments)
},{"./index":56,"./parse":57,"./sax/sax_ltx":58}],56:[function(require,module,exports){
arguments[4][25][0].apply(exports,arguments)
},{"./dom-element":53,"./element":54,"./parse":57}],57:[function(require,module,exports){
arguments[4][26][0].apply(exports,arguments)
},{"./dom-element":53,"events":13,"util":21}],58:[function(require,module,exports){
module.exports=require(27)
},{"events":13,"util":21}],59:[function(require,module,exports){
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
},{"./package.json":64,"1YiZ5S":16,"bindings":60,"debug":61}],60:[function(require,module,exports){
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
},{"1YiZ5S":16,"fs":2,"path":15}],61:[function(require,module,exports){
module.exports=require(41)
},{"./debug":62}],62:[function(require,module,exports){
module.exports=require(42)
},{"ms":63}],63:[function(require,module,exports){
module.exports=require(43)
},{}],64:[function(require,module,exports){
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

},{}],65:[function(require,module,exports){
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

},{"backoff":66,"events":13}],66:[function(require,module,exports){
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

},{"./lib/backoff":67,"./lib/function_call.js":68,"./lib/strategy/exponential":69,"./lib/strategy/fibonacci":70}],67:[function(require,module,exports){
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

},{"events":13,"util":21}],68:[function(require,module,exports){
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

},{"./backoff":67,"./strategy/fibonacci":70,"events":13,"util":21}],69:[function(require,module,exports){
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

},{"./strategy":71,"util":21}],70:[function(require,module,exports){
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

},{"./strategy":71,"util":21}],71:[function(require,module,exports){
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

},{"events":13,"util":21}],72:[function(require,module,exports){
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
},{"1YiZ5S":16,"assert":3,"crypto":8,"net":2,"tls":2,"util":21}]},{},[1])
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcGFjay9fcHJlbHVkZS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL2xpYi95LXhtcHAuY29mZmVlIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9saWIvX2VtcHR5LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYXNzZXJ0L2Fzc2VydC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2J1ZmZlci9ub2RlX21vZHVsZXMvYmFzZTY0LWpzL2xpYi9iNjQuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9idWZmZXIvbm9kZV9tb2R1bGVzL2llZWU3NTQvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9oZWxwZXJzLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvY3J5cHRvLWJyb3dzZXJpZnkvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9tZDUuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9ybmcuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9zaGEuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9jcnlwdG8tYnJvd3NlcmlmeS9zaGEyNTYuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9ldmVudHMvZXZlbnRzLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvaW5oZXJpdHMvaW5oZXJpdHNfYnJvd3Nlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3BhdGgtYnJvd3NlcmlmeS9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3Byb2Nlc3MvYnJvd3Nlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3F1ZXJ5c3RyaW5nLWVzMy9kZWNvZGUuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvZ3VscC1icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9xdWVyeXN0cmluZy1lczMvZW5jb2RlLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcXVlcnlzdHJpbmctZXMzL2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2d1bHAtYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvdXRpbC9zdXBwb3J0L2lzQnVmZmVyQnJvd3Nlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ndWxwLWJyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL2Jyb3dzZXJpZnkvbm9kZV9tb2R1bGVzL3V0aWwvdXRpbC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL2RvbS1lbGVtZW50LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvZWxlbWVudC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL2luZGV4LWJyb3dzZXJpZnkuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbHR4L2xpYi9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9sdHgvbGliL3BhcnNlLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL2x0eC9saWIvc2F4L3NheF9sdHguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9hbm9ueW1vdXMuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24vZGlnZXN0bWQ1LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL2V4dGVybmFsLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL2F1dGhlbnRpY2F0aW9uL21lY2hhbmlzbS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi9wbGFpbi5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9hdXRoZW50aWNhdGlvbi94ZmFjZWJvb2suanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvYXV0aGVudGljYXRpb24veG9hdXRoMi5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi9ib3NoLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbGliL3Nhc2wuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9saWIvc2Vzc2lvbi5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L2xpYi93ZWJzb2NrZXRzLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL2Jyb3dzZXItcmVxdWVzdC9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9kZWJ1Zy9icm93c2VyLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL2RlYnVnL2RlYnVnLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL2RlYnVnL25vZGVfbW9kdWxlcy9tcy9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvY29ubmVjdGlvbi5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvamlkLmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL2xpYi9zcnYuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbGliL3N0YW56YS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9saWIvc3RyZWFtX3BhcnNlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvZGVidWcvYnJvd3Nlci5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvZGVidWcvZGVidWcuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2RlYnVnL25vZGVfbW9kdWxlcy9tcy9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9kb20tZWxlbWVudC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbHR4L2xpYi9lbGVtZW50LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9sdHgvbGliL2luZGV4LWJyb3dzZXJpZnkuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL2x0eC9saWIvcGFyc2UuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL25vZGUtc3RyaW5ncHJlcC9pbmRleC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbm9kZS1zdHJpbmdwcmVwL25vZGVfbW9kdWxlcy9iaW5kaW5ncy9iaW5kaW5ncy5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvbm9kZS1zdHJpbmdwcmVwL3BhY2thZ2UuanNvbiIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvaW5kZXguanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2luZGV4LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9yZWNvbm5lY3QtY29yZS9ub2RlX21vZHVsZXMvYmFja29mZi9saWIvYmFja29mZi5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvbGliL2Z1bmN0aW9uX2NhbGwuanMiLCIvaG9tZS9kbW9uYWQvZ2l0L3kteG1wcC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNsaWVudC9ub2RlX21vZHVsZXMvbm9kZS14bXBwLWNvcmUvbm9kZV9tb2R1bGVzL3JlY29ubmVjdC1jb3JlL25vZGVfbW9kdWxlcy9iYWNrb2ZmL2xpYi9zdHJhdGVneS9leHBvbmVudGlhbC5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvbGliL3N0cmF0ZWd5L2ZpYm9uYWNjaS5qcyIsIi9ob21lL2Rtb25hZC9naXQveS14bXBwL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50L25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY29yZS9ub2RlX21vZHVsZXMvcmVjb25uZWN0LWNvcmUvbm9kZV9tb2R1bGVzL2JhY2tvZmYvbGliL3N0cmF0ZWd5L3N0cmF0ZWd5LmpzIiwiL2hvbWUvZG1vbmFkL2dpdC95LXhtcHAvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy90bHMtY29ubmVjdC9zdGFydHRscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0NBLElBQUEsd0ZBQUE7O0FBQUEsS0FBQSxHQUFRLE9BQUEsQ0FBUSxrQkFBUixDQUFSLENBQUE7O0FBQUEsR0FDQSxHQUFNLE9BQUEsQ0FBUSxLQUFSLENBRE4sQ0FBQTs7QUFBQSx5QkFHQSxHQUE0QixTQUFDLEdBQUQsR0FBQTtTQUMxQixHQUFHLENBQUMsS0FBSixDQUFVLEdBQVYsQ0FBZSxDQUFBLENBQUEsRUFEVztBQUFBLENBSDVCLENBQUE7O0FBQUEscUJBTUEsR0FBd0IsU0FBQyxHQUFELEdBQUE7U0FDdEIsR0FBRyxDQUFDLEtBQUosQ0FBVSxHQUFWLENBQWUsQ0FBQSxDQUFBLEVBRE87QUFBQSxDQU54QixDQUFBOztBQUFBO0FBY2UsRUFBQSxxQkFBQyxJQUFELEdBQUE7QUFFWCxRQUFBLEtBQUE7O01BRlksT0FBTztLQUVuQjtBQUFBLElBQUEsSUFBQyxDQUFBLEtBQUQsR0FBUyxFQUFULENBQUE7QUFDQSxJQUFBLElBQUcsNkJBQUg7QUFDRSxNQUFBLElBQUMsQ0FBQSxJQUFELEdBQVEsSUFBSSxDQUFDLGdCQUFiLENBREY7S0FBQSxNQUFBO0FBR0UsTUFBQSxJQUFHLGlDQUFIO0FBQ0UsUUFBQSxJQUFDLENBQUEsb0JBQUQsR0FBd0IsSUFBSSxDQUFDLG9CQUE3QixDQURGO09BQUEsTUFBQTtBQUdFLFFBQUEsSUFBQyxDQUFBLG9CQUFELEdBQXdCLHlCQUF4QixDQUhGO09BQUE7QUFBQSxNQUtBLEtBQUEsR0FBUSxFQUxSLENBQUE7QUFNQSxNQUFBLElBQUcsZ0JBQUg7QUFDRSxRQUFBLEtBQUssQ0FBQyxHQUFOLEdBQVksSUFBSSxDQUFDLEdBQWpCLENBQUE7QUFBQSxRQUNBLEtBQUssQ0FBQyxRQUFOLEdBQWlCLElBQUksQ0FBQyxRQUR0QixDQURGO09BQUEsTUFBQTtBQUlFLFFBQUEsS0FBSyxDQUFDLEdBQU4sR0FBWSxjQUFaLENBQUE7QUFBQSxRQUNBLEtBQUssQ0FBQyxTQUFOLEdBQWtCLFdBRGxCLENBSkY7T0FOQTtBQWFBLE1BQUEsSUFBRyxpQkFBSDtBQUNFLFFBQUEsS0FBSyxDQUFDLElBQU4sR0FBYSxJQUFJLENBQUMsSUFBbEIsQ0FBQTtBQUFBLFFBQ0EsS0FBSyxDQUFDLElBQU4sR0FBYSxJQUFJLENBQUMsSUFEbEIsQ0FERjtPQUFBLE1BQUE7O1VBSUUsSUFBSSxDQUFDLFlBQWE7U0FBbEI7QUFBQSxRQUNBLEtBQUssQ0FBQyxTQUFOLEdBQ0U7QUFBQSxVQUFBLEdBQUEsRUFBSyxJQUFJLENBQUMsU0FBVjtTQUZGLENBSkY7T0FiQTtBQUFBLE1BcUJBLElBQUMsQ0FBQSxJQUFELEdBQVksSUFBQSxLQUFLLENBQUMsTUFBTixDQUFhLEtBQWIsQ0FyQlosQ0FIRjtLQURBO0FBQUEsSUE0QkEsSUFBQyxDQUFBLFNBQUQsR0FBYSxLQTVCYixDQUFBO0FBQUEsSUE2QkEsSUFBQyxDQUFBLFdBQUQsR0FBZSxFQTdCZixDQUFBO0FBQUEsSUE4QkEsSUFBQyxDQUFBLHFCQUFELEdBQXlCLEVBOUJ6QixDQUFBO0FBQUEsSUErQkEsSUFBQyxDQUFBLElBQUksQ0FBQyxFQUFOLENBQVMsUUFBVCxFQUFtQixDQUFBLFNBQUEsS0FBQSxHQUFBO2FBQUEsU0FBQSxHQUFBO2VBQ2pCLEtBQUMsQ0FBQSxXQUFELENBQUEsRUFEaUI7TUFBQSxFQUFBO0lBQUEsQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFuQixDQS9CQSxDQUFBO0FBQUEsSUFpQ0EsSUFBQyxDQUFBLElBQUksQ0FBQyxFQUFOLENBQVMsUUFBVCxFQUFtQixDQUFBLFNBQUEsS0FBQSxHQUFBO2FBQUEsU0FBQyxNQUFELEdBQUE7QUFDakIsWUFBQSxJQUFBO0FBQUEsUUFBQSxJQUFHLE1BQU0sQ0FBQyxZQUFQLENBQW9CLE1BQUEsS0FBVSxPQUE5QixDQUFIO0FBQ0UsVUFBQSxPQUFPLENBQUMsS0FBUixDQUFjLE1BQU0sQ0FBQyxRQUFQLENBQUEsQ0FBZCxDQUFBLENBREY7U0FBQTtBQUFBLFFBSUEsSUFBQSxHQUFPLHFCQUFBLENBQXNCLE1BQU0sQ0FBQyxZQUFQLENBQW9CLE1BQXBCLENBQXRCLENBSlAsQ0FBQTtBQUtBLFFBQUEsSUFBRyx5QkFBSDtpQkFDRSxLQUFDLENBQUEsS0FBTSxDQUFBLElBQUEsQ0FBSyxDQUFDLFFBQWIsQ0FBc0IsTUFBdEIsRUFERjtTQU5pQjtNQUFBLEVBQUE7SUFBQSxDQUFBLENBQUEsQ0FBQSxJQUFBLENBQW5CLENBakNBLENBQUE7QUFBQSxJQTJDQSxJQUFDLENBQUEsS0FBRCxHQUFTLEtBM0NULENBRlc7RUFBQSxDQUFiOztBQUFBLHdCQWdEQSxVQUFBLEdBQVksU0FBQyxDQUFELEdBQUE7QUFDVixJQUFBLElBQUcsSUFBQyxDQUFBLFNBQUo7YUFDRSxDQUFBLENBQUEsRUFERjtLQUFBLE1BQUE7YUFHRSxJQUFDLENBQUEscUJBQXFCLENBQUMsSUFBdkIsQ0FBNEIsQ0FBNUIsRUFIRjtLQURVO0VBQUEsQ0FoRFosQ0FBQTs7QUFBQSx3QkF1REEsV0FBQSxHQUFhLFNBQUEsR0FBQTtBQUNYLFFBQUEsY0FBQTtBQUFBO0FBQUEsU0FBQSxxQ0FBQTtpQkFBQTtBQUNFLE1BQUEsQ0FBQSxDQUFBLENBQUEsQ0FERjtBQUFBLEtBQUE7V0FFQSxJQUFDLENBQUEsU0FBRCxHQUFhLEtBSEY7RUFBQSxDQXZEYixDQUFBOztBQUFBLHdCQWtFQSxJQUFBLEdBQU0sU0FBQyxJQUFELEVBQU8sT0FBUCxHQUFBO0FBQ0osUUFBQSxTQUFBOztNQURXLFVBQVU7S0FDckI7O01BQUEsT0FBTyxDQUFDLE9BQVE7S0FBaEI7O01BQ0EsT0FBTyxDQUFDLGFBQWM7S0FEdEI7QUFFQSxJQUFBLElBQU8sWUFBUDtBQUNFLFlBQVUsSUFBQSxLQUFBLENBQU0sMEJBQU4sQ0FBVixDQURGO0tBRkE7QUFJQSxJQUFBLElBQUcsSUFBSSxDQUFDLE9BQUwsQ0FBYSxHQUFiLENBQUEsS0FBcUIsQ0FBQSxDQUF4QjtBQUNFLE1BQUEsSUFBQSxJQUFRLElBQUMsQ0FBQSxvQkFBVCxDQURGO0tBSkE7QUFNQSxJQUFBLElBQU8sd0JBQVA7QUFDRSxNQUFBLFNBQUEsR0FBZ0IsSUFBQSxhQUFBLENBQUEsQ0FBaEIsQ0FBQTtBQUFBLE1BQ0EsSUFBQyxDQUFBLEtBQU0sQ0FBQSxJQUFBLENBQVAsR0FBZSxTQURmLENBQUE7QUFBQSxNQUVBLElBQUMsQ0FBQSxVQUFELENBQVksQ0FBQSxTQUFBLEtBQUEsR0FBQTtlQUFBLFNBQUEsR0FBQTtBQUtWLGNBQUEsYUFBQTtBQUFBLFVBQUEsYUFBQSxHQUFnQixTQUFBLEdBQUE7QUFDZCxnQkFBQSxpQkFBQTtBQUFBLFlBQUEsU0FBUyxDQUFDLElBQVYsQ0FDRTtBQUFBLGNBQUEsVUFBQSxFQUFZLE9BQU8sQ0FBQyxVQUFwQjtBQUFBLGNBQ0EsSUFBQSxFQUFNLE9BQU8sQ0FBQyxJQURkO0FBQUEsY0FFQSxPQUFBLEVBQVMsS0FBQyxDQUFBLElBQUksQ0FBQyxHQUFHLENBQUMsUUFGbkI7YUFERixDQUFBLENBQUE7QUFBQSxZQUlBLFNBQVMsQ0FBQyxJQUFWLEdBQWlCLElBSmpCLENBQUE7QUFBQSxZQUtBLFNBQVMsQ0FBQyxRQUFWLEdBQXFCLElBQUEsR0FBTyxHQUFQLEdBQWEsS0FBQyxDQUFBLElBQUksQ0FBQyxHQUFHLENBQUMsUUFMNUMsQ0FBQTtBQUFBLFlBTUEsU0FBUyxDQUFDLElBQVYsR0FBaUIsS0FBQyxDQUFBLElBTmxCLENBQUE7QUFBQSxZQU9BLFNBQVMsQ0FBQyxZQUFWLEdBQXlCLEtBUHpCLENBQUE7QUFBQSxZQVFBLGlCQUFBLEdBQXdCLElBQUEsR0FBRyxDQUFDLE9BQUosQ0FBWSxVQUFaLEVBQ3BCO0FBQUEsY0FBQSxFQUFBLEVBQUksU0FBUyxDQUFDLFFBQWQ7YUFEb0IsQ0FFdEIsQ0FBQyxDQUZxQixDQUVuQixHQUZtQixFQUVkLEVBRmMsQ0FHdEIsQ0FBQyxFQUhxQixDQUFBLENBSXRCLENBQUMsQ0FKcUIsQ0FJbkIsTUFKbUIsRUFJWDtBQUFBLGNBQUMsS0FBQSxFQUFPLHFCQUFSO2FBSlcsQ0FLdEIsQ0FBQyxDQUxxQixDQUtuQixTQUFTLENBQUMsSUFMUyxDQVJ4QixDQUFBO21CQWNBLEtBQUMsQ0FBQSxJQUFJLENBQUMsSUFBTixDQUFXLGlCQUFYLEVBZmM7VUFBQSxDQUFoQixDQUFBO0FBaUJBLFVBQUEsSUFBRyxTQUFTLENBQUMsYUFBYjttQkFDRSxhQUFBLENBQUEsRUFERjtXQUFBLE1BQUE7bUJBR0UsU0FBUyxDQUFDLGFBQVYsR0FBMEIsY0FINUI7V0F0QlU7UUFBQSxFQUFBO01BQUEsQ0FBQSxDQUFBLENBQUEsSUFBQSxDQUFaLENBRkEsQ0FERjtLQU5BO1dBb0NBLElBQUMsQ0FBQSxLQUFNLENBQUEsSUFBQSxFQXJDSDtFQUFBLENBbEVOLENBQUE7O3FCQUFBOztJQWRGLENBQUE7O0FBQUE7NkJBNEhFOztBQUFBLDBCQUFBLElBQUEsR0FBTSxTQUFBLEdBQUE7QUFDSixJQUFBLElBQUMsQ0FBQSxJQUFJLENBQUMsSUFBTixDQUFlLElBQUEsR0FBRyxDQUFDLE9BQUosQ0FBWSxVQUFaLEVBQ2I7QUFBQSxNQUFBLEVBQUEsRUFBSSxJQUFDLENBQUEsUUFBTDtBQUFBLE1BQ0EsSUFBQSxFQUFNLGFBRE47S0FEYSxDQUFmLENBQUEsQ0FBQTtXQUdBLE1BQUEsQ0FBQSxJQUFRLENBQUEsWUFBWSxDQUFDLEtBQU0sQ0FBQSxJQUFDLENBQUEsSUFBRCxFQUp2QjtFQUFBLENBQU4sQ0FBQTs7QUFBQSwwQkFNQSxRQUFBLEdBQVUsU0FBQyxNQUFELEdBQUE7QUFDUixRQUFBLHdCQUFBO0FBQUEsSUFBQSxJQUFHLElBQUMsQ0FBQSxLQUFKO0FBQ0UsTUFBQSxPQUFPLENBQUMsR0FBUixDQUFZLFlBQUEsR0FBYSxNQUFNLENBQUMsUUFBUCxDQUFBLENBQXpCLENBQUEsQ0FERjtLQUFBO0FBQUEsSUFFQSxNQUFBLEdBQVMseUJBQUEsQ0FBMEIsTUFBTSxDQUFDLFlBQVAsQ0FBb0IsTUFBcEIsQ0FBMUIsQ0FGVCxDQUFBO0FBR0EsSUFBQSxJQUFHLE1BQU0sQ0FBQyxFQUFQLENBQVUsVUFBVixDQUFIO0FBRUUsTUFBQSxJQUFHLE1BQUEsS0FBVSxJQUFDLENBQUEsT0FBZDtBQUFBO09BQUEsTUFHSyxJQUFHLE1BQU0sQ0FBQyxZQUFQLENBQW9CLE1BQXBCLENBQUEsS0FBK0IsYUFBbEM7ZUFFSCxJQUFDLENBQUEsUUFBRCxDQUFVLE1BQVYsRUFGRztPQUFBLE1BQUE7QUFJSCxRQUFBLFdBQUEsR0FBYyxNQUNaLENBQUMsUUFEVyxDQUNGLE1BREUsRUFDSyxxQkFETCxDQUVaLENBQUMsT0FGVyxDQUFBLENBQWQsQ0FBQTtlQUdBLElBQUMsQ0FBQSxVQUFELENBQVksTUFBWixFQUFvQixXQUFwQixFQVBHO09BTFA7S0FBQSxNQUFBO0FBZUUsTUFBQSxJQUFHLE1BQUEsS0FBVSxJQUFDLENBQUEsUUFBZDtBQUNFLGVBQU8sSUFBUCxDQURGO09BQUE7QUFBQSxNQUVBLEdBQUEsR0FBTSxNQUFNLENBQUMsUUFBUCxDQUFnQixHQUFoQixFQUFxQixpQ0FBckIsQ0FGTixDQUFBO0FBSUEsTUFBQSxJQUFHLFdBQUg7ZUFFRSxJQUFDLENBQUEsY0FBRCxDQUFnQixNQUFoQixFQUF3QixJQUFDLENBQUEsbUJBQUQsQ0FBcUIsR0FBckIsQ0FBeEIsRUFGRjtPQW5CRjtLQUpRO0VBQUEsQ0FOVixDQUFBOztBQUFBLDBCQWlDQSxJQUFBLEdBQU0sU0FBQyxJQUFELEVBQU8sSUFBUCxFQUFhLElBQWIsR0FBQTtBQUlKLFFBQUEsVUFBQTs7TUFKaUIsT0FBTztLQUl4QjtBQUFBLElBQUEsQ0FBQSxHQUFRLElBQUEsR0FBRyxDQUFDLE9BQUosQ0FBWSxTQUFaLEVBQ047QUFBQSxNQUFBLEVBQUEsRUFBTyxJQUFBLEtBQVEsRUFBWCxHQUFtQixJQUFDLENBQUEsSUFBcEIsR0FBOEIsSUFBQyxDQUFBLElBQUQsR0FBUSxHQUFSLEdBQWMsSUFBaEQ7QUFBQSxNQUNBLElBQUEsRUFBUyxZQUFILEdBQWMsSUFBZCxHQUF3QixNQUQ5QjtLQURNLENBQVIsQ0FBQTtBQUFBLElBR0EsT0FBQSxHQUFVLElBQUMsQ0FBQSxrQkFBRCxDQUFvQixDQUFwQixFQUF1QixJQUF2QixDQUhWLENBQUE7QUFJQSxJQUFBLElBQUcsSUFBQyxDQUFBLEtBQUo7QUFDRSxNQUFBLE9BQU8sQ0FBQyxHQUFSLENBQVksV0FBQSxHQUFZLE9BQU8sQ0FBQyxJQUFSLENBQUEsQ0FBYyxDQUFDLFFBQWYsQ0FBQSxDQUF4QixDQUFBLENBREY7S0FKQTtXQU1BLElBQUMsQ0FBQSxJQUFJLENBQUMsSUFBTixDQUFXLE9BQU8sQ0FBQyxJQUFSLENBQUEsQ0FBWCxFQVZJO0VBQUEsQ0FqQ04sQ0FBQTs7QUFBQSwwQkE2Q0EsU0FBQSxHQUFXLFNBQUMsSUFBRCxHQUFBO1dBQ1QsSUFBQyxDQUFBLElBQUQsQ0FBTSxFQUFOLEVBQVUsSUFBVixFQUFnQixXQUFoQixFQURTO0VBQUEsQ0E3Q1gsQ0FBQTs7dUJBQUE7O0lBNUhGLENBQUE7O0FBNktBLElBQUcsc0JBQUg7QUFDRSxFQUFBLE1BQU0sQ0FBQyxPQUFQLEdBQWlCLFdBQWpCLENBREY7Q0E3S0E7O0FBZ0xBLElBQUcsZ0RBQUg7QUFDRSxFQUFBLElBQU8sc0NBQVA7QUFDRSxVQUFVLElBQUEsS0FBQSxDQUFNLDBCQUFOLENBQVYsQ0FERjtHQUFBLE1BQUE7QUFHRSxJQUFBLENBQUMsQ0FBQyxJQUFGLEdBQVMsV0FBVCxDQUhGO0dBREY7Q0FoTEE7Ozs7O0FDREE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeFdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNybENBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDNUhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDakdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDL0JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3U0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZCQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVrQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzlHQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUtBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDeGFBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0NBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3ZNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzllQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNuSkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JNQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvYUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaktBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9JQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9LQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMzSEE7O0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hZQTs7QUNBQTs7QUNBQTs7OztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEhBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOzs7Ozs7OztBQ3hLQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2pEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNwRkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25PQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24gZSh0LG4scil7ZnVuY3Rpb24gcyhvLHUpe2lmKCFuW29dKXtpZighdFtvXSl7dmFyIGE9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtpZighdSYmYSlyZXR1cm4gYShvLCEwKTtpZihpKXJldHVybiBpKG8sITApO3Rocm93IG5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIrbytcIidcIil9dmFyIGY9bltvXT17ZXhwb3J0czp7fX07dFtvXVswXS5jYWxsKGYuZXhwb3J0cyxmdW5jdGlvbihlKXt2YXIgbj10W29dWzFdW2VdO3JldHVybiBzKG4/bjplKX0sZixmLmV4cG9ydHMsZSx0LG4scil9cmV0dXJuIG5bb10uZXhwb3J0c312YXIgaT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2Zvcih2YXIgbz0wO288ci5sZW5ndGg7bysrKXMocltvXSk7cmV0dXJuIHN9KSIsIlxuTlhNUFAgPSByZXF1aXJlIFwibm9kZS14bXBwLWNsaWVudFwiXG5sdHggPSByZXF1aXJlIFwibHR4XCJcblxuZXh0cmFjdF9yZXNvdXJjZV9mcm9tX2ppZCA9IChqaWQpLT5cbiAgamlkLnNwbGl0KFwiL1wiKVsxXVxuXG5leHRyYWN0X2JhcmVfZnJvbV9qaWQgPSAoamlkKS0+XG4gIGppZC5zcGxpdChcIi9cIilbMF1cblxuIyBUaGlzIEhhbmRsZXIgaGFuZGxlcyBhIHNldCBvZiBjb25uZWN0aW9uc1xuY2xhc3MgWE1QUEhhbmRsZXJcbiAgI1xuICAjIFNlZSBkb2N1bWVudGF0aW9uIGZvciBwYXJhbWV0ZXJzXG4gICNcbiAgY29uc3RydWN0b3I6IChvcHRzID0ge30pLT5cbiAgICAjIEluaXRpYWxpemUgTlhNUFAuQ2xpZW50XG4gICAgQHJvb21zID0ge31cbiAgICBpZiBvcHRzLm5vZGVfeG1wcF9jbGllbnQ/XG4gICAgICBAeG1wcCA9IG9wdHMubm9kZV94bXBwX2NsaWVudFxuICAgIGVsc2VcbiAgICAgIGlmIG9wdHMuZGVmYXVsdFJvb21Db21wb25lbnQ/XG4gICAgICAgIEBkZWZhdWx0Um9vbUNvbXBvbmVudCA9IG9wdHMuZGVmYXVsdFJvb21Db21wb25lbnRcbiAgICAgIGVsc2VcbiAgICAgICAgQGRlZmF1bHRSb29tQ29tcG9uZW50ID0gXCJAY29uZmVyZW5jZS55YXR0YS5uaW5qYVwiXG5cbiAgICAgIGNyZWRzID0ge31cbiAgICAgIGlmIG9wdHMuamlkP1xuICAgICAgICBjcmVkcy5qaWQgPSBvcHRzLmppZFxuICAgICAgICBjcmVkcy5wYXNzd29yZCA9IG9wdHMucGFzc3dvcmRcbiAgICAgIGVsc2VcbiAgICAgICAgY3JlZHMuamlkID0gJ0B5YXR0YS5uaW5qYSdcbiAgICAgICAgY3JlZHMucHJlZmVycmVkID0gJ0FOT05ZTU9VUydcblxuICAgICAgaWYgb3B0cy5ob3N0P1xuICAgICAgICBjcmVkcy5ob3N0ID0gb3B0cy5ob3N0XG4gICAgICAgIGNyZWRzLnBvcnQgPSBvcHRzLnBvcnRcbiAgICAgIGVsc2VcbiAgICAgICAgb3B0cy53ZWJzb2NrZXQgPz0gJ3dzczp5YXR0YS5uaW5qYTo1MjgxL3htcHAtd2Vic29ja2V0J1xuICAgICAgICBjcmVkcy53ZWJzb2NrZXQgPVxuICAgICAgICAgIHVybDogb3B0cy53ZWJzb2NrZXRcblxuICAgICAgQHhtcHAgPSBuZXcgTlhNUFAuQ2xpZW50IGNyZWRzXG5cbiAgICAjIFdoYXQgaGFwcGVucyB3aGVuIHlvdSBnbyBvbmxpbmVcbiAgICBAaXNfb25saW5lID0gZmFsc2VcbiAgICBAY29ubmVjdGlvbnMgPSB7fVxuICAgIEB3aGVuX29ubGluZV9saXN0ZW5lcnMgPSBbXVxuICAgIEB4bXBwLm9uICdvbmxpbmUnLCA9PlxuICAgICAgQHNldElzT25saW5lKClcbiAgICBAeG1wcC5vbiAnc3RhbnphJywgKHN0YW56YSk9PlxuICAgICAgaWYgc3RhbnphLmdldEF0dHJpYnV0ZSBcInR5cGVcIiBpcyBcImVycm9yXCJcbiAgICAgICAgY29uc29sZS5lcnJvcihzdGFuemEudG9TdHJpbmcoKSlcblxuICAgICAgIyB3aGVuIGEgc3RhbnphIGlzIHJlY2VpdmVkLCBzZW5kIGl0IHRvIHRoZSBjb3JyZXNwb25kaW5nIGNvbm5lY3RvclxuICAgICAgcm9vbSA9IGV4dHJhY3RfYmFyZV9mcm9tX2ppZCBzdGFuemEuZ2V0QXR0cmlidXRlIFwiZnJvbVwiXG4gICAgICBpZiBAcm9vbXNbcm9vbV0/XG4gICAgICAgIEByb29tc1tyb29tXS5vblN0YW56YShzdGFuemEpXG5cblxuICAgIEBkZWJ1ZyA9IGZhbHNlXG5cbiAgIyBFeGVjdXRlIGEgZnVuY3Rpb24gd2hlbiB4bXBwIGlzIG9ubGluZSAoaWYgaXQgaXMgbm90IHlldCBvbmxpbmUsIHdhaXQgdW50aWwgaXQgaXMpXG4gIHdoZW5PbmxpbmU6IChmKS0+XG4gICAgaWYgQGlzX29ubGluZVxuICAgICAgZigpXG4gICAgZWxzZVxuICAgICAgQHdoZW5fb25saW5lX2xpc3RlbmVycy5wdXNoIGZcblxuICAjIEB4bXBwIGlzIG9ubGluZSBmcm9tIG5vdyBvbi4gVGhlcmVmb3JlIHRoaXMgZXhlY3V0ZWQgYWxsIGxpc3RlbmVycyB0aGF0IGRlcGVuZCBvbiB0aGlzIGV2ZW50XG4gIHNldElzT25saW5lOiAoKS0+XG4gICAgZm9yIGYgaW4gQHdoZW5fb25saW5lX2xpc3RlbmVyc1xuICAgICAgZigpXG4gICAgQGlzX29ubGluZSA9IHRydWVcblxuICAjXG4gICMgSm9pbiBhIHNwZWNpZmljIHJvb21cbiAgIyBAcGFyYW1zIGpvaW4ocm9vbSwgc3luY01ldGhvZClcbiAgIyAgIHJvb20ge1N0cmluZ30gVGhlIHJvb20gbmFtZVxuICAjICAgb3B0aW9ucy5yb2xlIHtTdHJpbmd9IFwibWFzdGVyXCIgb3IgXCJzbGF2ZVwiIChkZWZhdWx0cyB0byBzbGF2ZSlcbiAgIyAgIG9wdGlvbnMuc3luY01ldGhvZCB7U3RyaW5nfSBUaGUgbW9kZSBpbiB3aGljaCB0byBzeW5jIHRvIHRoZSBvdGhlciBjbGllbnRzIChcInN5bmNBbGxcIiBvciBcIm1hc3Rlci1zbGF2ZVwiKVxuICBqb2luOiAocm9vbSwgb3B0aW9ucyA9IHt9KS0+XG4gICAgb3B0aW9ucy5yb2xlID89IFwic2xhdmVcIlxuICAgIG9wdGlvbnMuc3luY01ldGhvZCA/PSBcInN5bmNBbGxcIlxuICAgIGlmIG5vdCByb29tP1xuICAgICAgdGhyb3cgbmV3IEVycm9yIFwieW91IG11c3Qgc3BlY2lmeSBhIHJvb20hXCJcbiAgICBpZiByb29tLmluZGV4T2YoXCJAXCIpIGlzIC0xXG4gICAgICByb29tICs9IEBkZWZhdWx0Um9vbUNvbXBvbmVudFxuICAgIGlmIG5vdCBAcm9vbXNbcm9vbV0/XG4gICAgICByb29tX2Nvbm4gPSBuZXcgWE1QUENvbm5lY3RvcigpXG4gICAgICBAcm9vbXNbcm9vbV0gPSByb29tX2Nvbm5cbiAgICAgIEB3aGVuT25saW5lICgpPT5cbiAgICAgICAgIyBsb2dpbiB0byByb29tXG4gICAgICAgICMgV2FudCB0byBiZSBsaWtlIHRoaXM6XG4gICAgICAgICMgPHByZXNlbmNlIGZyb209J2EzM2I5NzU4LTYyZjgtNDJlMS1hODI3LTgzZWYwNGY4ODdjNUB5YXR0YS5uaW5qYS9jNDllYjdmYi0xOTIzLTQyZjItOWNjYS00Yzk3NDc3ZWE3YTgnIHRvPSd0aGluZ0Bjb25mZXJlbmNlLnlhdHRhLm5pbmphL2M0OWViN2ZiLTE5MjMtNDJmMi05Y2NhLTRjOTc0NzdlYTdhOCcgeG1sbnM9J2phYmJlcjpjbGllbnQnPlxuICAgICAgICAjIDx4IHhtbG5zPSdodHRwOi8vamFiYmVyLm9yZy9wcm90b2NvbC9tdWMnLz48L3ByZXNlbmNlPlxuICAgICAgICBvbl9ib3VuZF90b195ID0gKCk9PlxuICAgICAgICAgIHJvb21fY29ubi5pbml0XG4gICAgICAgICAgICBzeW5jTWV0aG9kOiBvcHRpb25zLnN5bmNNZXRob2RcbiAgICAgICAgICAgIHJvbGU6IG9wdGlvbnMucm9sZVxuICAgICAgICAgICAgdXNlcl9pZDogQHhtcHAuamlkLnJlc291cmNlXG4gICAgICAgICAgcm9vbV9jb25uLnJvb20gPSByb29tICMgc2V0IHRoZSByb29tIGppZFxuICAgICAgICAgIHJvb21fY29ubi5yb29tX2ppZCA9IHJvb20gKyBcIi9cIiArIEB4bXBwLmppZC5yZXNvdXJjZSAjIHNldCB5b3VyIGppZCBpbiB0aGUgcm9vbVxuICAgICAgICAgIHJvb21fY29ubi54bXBwID0gQHhtcHBcbiAgICAgICAgICByb29tX2Nvbm4ueG1wcF9oYW5kbGVyID0gQFxuICAgICAgICAgIHJvb21fc3Vic2NyaXB0aW9uID0gbmV3IGx0eC5FbGVtZW50ICdwcmVzZW5jZScsXG4gICAgICAgICAgICAgIHRvOiByb29tX2Nvbm4ucm9vbV9qaWRcbiAgICAgICAgICAgIC5jICd4Jywge31cbiAgICAgICAgICAgIC51cCgpXG4gICAgICAgICAgICAuYyAncm9sZScsIHt4bWxuczogXCJodHRwOi8veS5uaW5qYS9yb2xlXCJ9XG4gICAgICAgICAgICAudCByb29tX2Nvbm4ucm9sZVxuICAgICAgICAgIEB4bXBwLnNlbmQgcm9vbV9zdWJzY3JpcHRpb25cblxuICAgICAgICBpZiByb29tX2Nvbm4uaXNfYm91bmRfdG9feVxuICAgICAgICAgIG9uX2JvdW5kX3RvX3koKVxuICAgICAgICBlbHNlXG4gICAgICAgICAgcm9vbV9jb25uLm9uX2JvdW5kX3RvX3kgPSBvbl9ib3VuZF90b195XG5cbiAgICBAcm9vbXNbcm9vbV1cblxuY2xhc3MgWE1QUENvbm5lY3RvclxuXG4gICNcbiAgIyBjbG9zZXMgYSBjb25uZWN0aW9uIHRvIGEgcm9vbVxuICAjXG4gIGV4aXQ6ICgpLT5cbiAgICBAeG1wcC5zZW5kIG5ldyBsdHguRWxlbWVudCAncHJlc2VuY2UnLFxuICAgICAgdG86IEByb29tX2ppZFxuICAgICAgdHlwZTogXCJ1bmF2YWlsYWJsZVwiXG4gICAgZGVsZXRlIEB4bXBwX2hhbmRsZXIucm9vbXNbQHJvb21dXG5cbiAgb25TdGFuemE6IChzdGFuemEpLT5cbiAgICBpZiBAZGVidWdcbiAgICAgIGNvbnNvbGUubG9nIFwiUkVDRUlWRUQ6IFwiK3N0YW56YS50b1N0cmluZygpXG4gICAgc2VuZGVyID0gZXh0cmFjdF9yZXNvdXJjZV9mcm9tX2ppZCBzdGFuemEuZ2V0QXR0cmlidXRlIFwiZnJvbVwiXG4gICAgaWYgc3RhbnphLmlzIFwicHJlc2VuY2VcIlxuICAgICAgIyBhIG5ldyB1c2VyIGpvaW5lZCBvciBsZWF2ZWQgdGhlIHJvb21cbiAgICAgIGlmIHNlbmRlciBpcyBAdXNlcl9pZFxuICAgICAgICAjIHRoaXMgY2xpZW50IHJlY2VpdmVkIGluZm9ybWF0aW9uIHRoYXQgaXQgc3VjY2Vzc2Z1bGx5IGpvaW5lZCB0aGUgcm9vbVxuICAgICAgICAjIG5vcFxuICAgICAgZWxzZSBpZiBzdGFuemEuZ2V0QXR0cmlidXRlKFwidHlwZVwiKSBpcyBcInVuYXZhaWxhYmxlXCJcbiAgICAgICAgIyBhIHVzZXIgbGVmdCB0aGUgcm9vbVxuICAgICAgICBAdXNlckxlZnQgc2VuZGVyXG4gICAgICBlbHNlXG4gICAgICAgIHNlbmRlcl9yb2xlID0gc3RhbnphXG4gICAgICAgICAgLmdldENoaWxkKFwicm9sZVwiLFwiaHR0cDovL3kubmluamEvcm9sZVwiKVxuICAgICAgICAgIC5nZXRUZXh0KClcbiAgICAgICAgQHVzZXJKb2luZWQgc2VuZGVyLCBzZW5kZXJfcm9sZVxuICAgIGVsc2VcbiAgICAgICMgaXQgaXMgc29tZSBtZXNzYWdlIHRoYXQgd2FzIHNlbnQgaW50byB0aGUgcm9vbSAoY291bGQgYWxzbyBiZSBhIHByaXZhdGUgY2hhdCBvciB3aGF0ZXZlcilcbiAgICAgIGlmIHNlbmRlciBpcyBAcm9vbV9qaWRcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICAgIHJlcyA9IHN0YW56YS5nZXRDaGlsZCBcInlcIiwgXCJodHRwOi8veS5uaW5qYS9jb25uZWN0b3Itc3RhbnphXCJcbiAgICAgICMgY291bGQgYmUgc29tZSBzaW1wbGUgdGV4dCBtZXNzYWdlIChvciB3aGF0ZXZlcilcbiAgICAgIGlmIHJlcz9cbiAgICAgICAgIyB0aGlzIGlzIGRlZmluaXRlbHkgYSBtZXNzYWdlIGludGVuZGVkIGZvciBZanNcbiAgICAgICAgQHJlY2VpdmVNZXNzYWdlKHNlbmRlciwgQHBhcnNlTWVzc2FnZUZyb21YbWwgcmVzKVxuXG4gIHNlbmQ6ICh1c2VyLCBqc29uLCB0eXBlID0gXCJtZXNzYWdlXCIpLT5cbiAgICAjIGRvIG5vdCBzZW5kIHktb3BlcmF0aW9ucyBpZiBub3Qgc3luY2VkLFxuICAgICMgc2VuZCBzeW5jIG1lc3NhZ2VzIHRob3VnaFxuICAgICNpZiBAaXNfc3luY2VkIG9yIGpzb24uc3luY19zdGVwPyAjIyBvciBAaXNfc3luY2luZ1xuICAgIG0gPSBuZXcgbHR4LkVsZW1lbnQgXCJtZXNzYWdlXCIsXG4gICAgICB0bzogaWYgdXNlciBpcyBcIlwiIHRoZW4gQHJvb20gZWxzZSBAcm9vbSArIFwiL1wiICsgdXNlclxuICAgICAgdHlwZTogaWYgdHlwZT8gdGhlbiB0eXBlIGVsc2UgXCJjaGF0XCJcbiAgICBtZXNzYWdlID0gQGVuY29kZU1lc3NhZ2VUb1htbChtLCBqc29uKVxuICAgIGlmIEBkZWJ1Z1xuICAgICAgY29uc29sZS5sb2cgXCJTRU5ESU5HOiBcIittZXNzYWdlLnJvb3QoKS50b1N0cmluZygpXG4gICAgQHhtcHAuc2VuZCBtZXNzYWdlLnJvb3QoKVxuXG4gIGJyb2FkY2FzdDogKGpzb24pLT5cbiAgICBAc2VuZCBcIlwiLCBqc29uLCBcImdyb3VwY2hhdFwiXG5cblxuaWYgbW9kdWxlLmV4cG9ydHM/XG4gIG1vZHVsZS5leHBvcnRzID0gWE1QUEhhbmRsZXJcblxuaWYgd2luZG93P1xuICBpZiBub3QgWT9cbiAgICB0aHJvdyBuZXcgRXJyb3IgXCJZb3UgbXVzdCBpbXBvcnQgWSBmaXJzdCFcIlxuICBlbHNlXG4gICAgWS5YTVBQID0gWE1QUEhhbmRsZXJcbiIsbnVsbCwiLy8gaHR0cDovL3dpa2kuY29tbW9uanMub3JnL3dpa2kvVW5pdF9UZXN0aW5nLzEuMFxuLy9cbi8vIFRISVMgSVMgTk9UIFRFU1RFRCBOT1IgTElLRUxZIFRPIFdPUksgT1VUU0lERSBWOCFcbi8vXG4vLyBPcmlnaW5hbGx5IGZyb20gbmFyd2hhbC5qcyAoaHR0cDovL25hcndoYWxqcy5vcmcpXG4vLyBDb3B5cmlnaHQgKGMpIDIwMDkgVGhvbWFzIFJvYmluc29uIDwyODBub3J0aC5jb20+XG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGEgY29weVxuLy8gb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGUgJ1NvZnR3YXJlJyksIHRvXG4vLyBkZWFsIGluIHRoZSBTb2Z0d2FyZSB3aXRob3V0IHJlc3RyaWN0aW9uLCBpbmNsdWRpbmcgd2l0aG91dCBsaW1pdGF0aW9uIHRoZVxuLy8gcmlnaHRzIHRvIHVzZSwgY29weSwgbW9kaWZ5LCBtZXJnZSwgcHVibGlzaCwgZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yXG4vLyBzZWxsIGNvcGllcyBvZiB0aGUgU29mdHdhcmUsIGFuZCB0byBwZXJtaXQgcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpc1xuLy8gZnVybmlzaGVkIHRvIGRvIHNvLCBzdWJqZWN0IHRvIHRoZSBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZCBpblxuLy8gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEICdBUyBJUycsIFdJVEhPVVQgV0FSUkFOVFkgT0YgQU5ZIEtJTkQsIEVYUFJFU1MgT1Jcbi8vIElNUExJRUQsIElOQ0xVRElORyBCVVQgTk9UIExJTUlURUQgVE8gVEhFIFdBUlJBTlRJRVMgT0YgTUVSQ0hBTlRBQklMSVRZLFxuLy8gRklUTkVTUyBGT1IgQSBQQVJUSUNVTEFSIFBVUlBPU0UgQU5EIE5PTklORlJJTkdFTUVOVC4gSU4gTk8gRVZFTlQgU0hBTEwgVEhFXG4vLyBBVVRIT1JTIEJFIExJQUJMRSBGT1IgQU5ZIENMQUlNLCBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTlxuLy8gQUNUSU9OIE9GIENPTlRSQUNULCBUT1JUIE9SIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTlxuLy8gV0lUSCBUSEUgU09GVFdBUkUgT1IgVEhFIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbi8vIHdoZW4gdXNlZCBpbiBub2RlLCB0aGlzIHdpbGwgYWN0dWFsbHkgbG9hZCB0aGUgdXRpbCBtb2R1bGUgd2UgZGVwZW5kIG9uXG4vLyB2ZXJzdXMgbG9hZGluZyB0aGUgYnVpbHRpbiB1dGlsIG1vZHVsZSBhcyBoYXBwZW5zIG90aGVyd2lzZVxuLy8gdGhpcyBpcyBhIGJ1ZyBpbiBub2RlIG1vZHVsZSBsb2FkaW5nIGFzIGZhciBhcyBJIGFtIGNvbmNlcm5lZFxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsLycpO1xuXG52YXIgcFNsaWNlID0gQXJyYXkucHJvdG90eXBlLnNsaWNlO1xudmFyIGhhc093biA9IE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHk7XG5cbi8vIDEuIFRoZSBhc3NlcnQgbW9kdWxlIHByb3ZpZGVzIGZ1bmN0aW9ucyB0aGF0IHRocm93XG4vLyBBc3NlcnRpb25FcnJvcidzIHdoZW4gcGFydGljdWxhciBjb25kaXRpb25zIGFyZSBub3QgbWV0LiBUaGVcbi8vIGFzc2VydCBtb2R1bGUgbXVzdCBjb25mb3JtIHRvIHRoZSBmb2xsb3dpbmcgaW50ZXJmYWNlLlxuXG52YXIgYXNzZXJ0ID0gbW9kdWxlLmV4cG9ydHMgPSBvaztcblxuLy8gMi4gVGhlIEFzc2VydGlvbkVycm9yIGlzIGRlZmluZWQgaW4gYXNzZXJ0LlxuLy8gbmV3IGFzc2VydC5Bc3NlcnRpb25FcnJvcih7IG1lc3NhZ2U6IG1lc3NhZ2UsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgYWN0dWFsOiBhY3R1YWwsXG4vLyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXhwZWN0ZWQ6IGV4cGVjdGVkIH0pXG5cbmFzc2VydC5Bc3NlcnRpb25FcnJvciA9IGZ1bmN0aW9uIEFzc2VydGlvbkVycm9yKG9wdGlvbnMpIHtcbiAgdGhpcy5uYW1lID0gJ0Fzc2VydGlvbkVycm9yJztcbiAgdGhpcy5hY3R1YWwgPSBvcHRpb25zLmFjdHVhbDtcbiAgdGhpcy5leHBlY3RlZCA9IG9wdGlvbnMuZXhwZWN0ZWQ7XG4gIHRoaXMub3BlcmF0b3IgPSBvcHRpb25zLm9wZXJhdG9yO1xuICBpZiAob3B0aW9ucy5tZXNzYWdlKSB7XG4gICAgdGhpcy5tZXNzYWdlID0gb3B0aW9ucy5tZXNzYWdlO1xuICAgIHRoaXMuZ2VuZXJhdGVkTWVzc2FnZSA9IGZhbHNlO1xuICB9IGVsc2Uge1xuICAgIHRoaXMubWVzc2FnZSA9IGdldE1lc3NhZ2UodGhpcyk7XG4gICAgdGhpcy5nZW5lcmF0ZWRNZXNzYWdlID0gdHJ1ZTtcbiAgfVxuICB2YXIgc3RhY2tTdGFydEZ1bmN0aW9uID0gb3B0aW9ucy5zdGFja1N0YXJ0RnVuY3Rpb24gfHwgZmFpbDtcblxuICBpZiAoRXJyb3IuY2FwdHVyZVN0YWNrVHJhY2UpIHtcbiAgICBFcnJvci5jYXB0dXJlU3RhY2tUcmFjZSh0aGlzLCBzdGFja1N0YXJ0RnVuY3Rpb24pO1xuICB9XG4gIGVsc2Uge1xuICAgIC8vIG5vbiB2OCBicm93c2VycyBzbyB3ZSBjYW4gaGF2ZSBhIHN0YWNrdHJhY2VcbiAgICB2YXIgZXJyID0gbmV3IEVycm9yKCk7XG4gICAgaWYgKGVyci5zdGFjaykge1xuICAgICAgdmFyIG91dCA9IGVyci5zdGFjaztcblxuICAgICAgLy8gdHJ5IHRvIHN0cmlwIHVzZWxlc3MgZnJhbWVzXG4gICAgICB2YXIgZm5fbmFtZSA9IHN0YWNrU3RhcnRGdW5jdGlvbi5uYW1lO1xuICAgICAgdmFyIGlkeCA9IG91dC5pbmRleE9mKCdcXG4nICsgZm5fbmFtZSk7XG4gICAgICBpZiAoaWR4ID49IDApIHtcbiAgICAgICAgLy8gb25jZSB3ZSBoYXZlIGxvY2F0ZWQgdGhlIGZ1bmN0aW9uIGZyYW1lXG4gICAgICAgIC8vIHdlIG5lZWQgdG8gc3RyaXAgb3V0IGV2ZXJ5dGhpbmcgYmVmb3JlIGl0IChhbmQgaXRzIGxpbmUpXG4gICAgICAgIHZhciBuZXh0X2xpbmUgPSBvdXQuaW5kZXhPZignXFxuJywgaWR4ICsgMSk7XG4gICAgICAgIG91dCA9IG91dC5zdWJzdHJpbmcobmV4dF9saW5lICsgMSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuc3RhY2sgPSBvdXQ7XG4gICAgfVxuICB9XG59O1xuXG4vLyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3IgaW5zdGFuY2VvZiBFcnJvclxudXRpbC5pbmhlcml0cyhhc3NlcnQuQXNzZXJ0aW9uRXJyb3IsIEVycm9yKTtcblxuZnVuY3Rpb24gcmVwbGFjZXIoa2V5LCB2YWx1ZSkge1xuICBpZiAodXRpbC5pc1VuZGVmaW5lZCh2YWx1ZSkpIHtcbiAgICByZXR1cm4gJycgKyB2YWx1ZTtcbiAgfVxuICBpZiAodXRpbC5pc051bWJlcih2YWx1ZSkgJiYgKGlzTmFOKHZhbHVlKSB8fCAhaXNGaW5pdGUodmFsdWUpKSkge1xuICAgIHJldHVybiB2YWx1ZS50b1N0cmluZygpO1xuICB9XG4gIGlmICh1dGlsLmlzRnVuY3Rpb24odmFsdWUpIHx8IHV0aWwuaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvU3RyaW5nKCk7XG4gIH1cbiAgcmV0dXJuIHZhbHVlO1xufVxuXG5mdW5jdGlvbiB0cnVuY2F0ZShzLCBuKSB7XG4gIGlmICh1dGlsLmlzU3RyaW5nKHMpKSB7XG4gICAgcmV0dXJuIHMubGVuZ3RoIDwgbiA/IHMgOiBzLnNsaWNlKDAsIG4pO1xuICB9IGVsc2Uge1xuICAgIHJldHVybiBzO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldE1lc3NhZ2Uoc2VsZikge1xuICByZXR1cm4gdHJ1bmNhdGUoSlNPTi5zdHJpbmdpZnkoc2VsZi5hY3R1YWwsIHJlcGxhY2VyKSwgMTI4KSArICcgJyArXG4gICAgICAgICBzZWxmLm9wZXJhdG9yICsgJyAnICtcbiAgICAgICAgIHRydW5jYXRlKEpTT04uc3RyaW5naWZ5KHNlbGYuZXhwZWN0ZWQsIHJlcGxhY2VyKSwgMTI4KTtcbn1cblxuLy8gQXQgcHJlc2VudCBvbmx5IHRoZSB0aHJlZSBrZXlzIG1lbnRpb25lZCBhYm92ZSBhcmUgdXNlZCBhbmRcbi8vIHVuZGVyc3Rvb2QgYnkgdGhlIHNwZWMuIEltcGxlbWVudGF0aW9ucyBvciBzdWIgbW9kdWxlcyBjYW4gcGFzc1xuLy8gb3RoZXIga2V5cyB0byB0aGUgQXNzZXJ0aW9uRXJyb3IncyBjb25zdHJ1Y3RvciAtIHRoZXkgd2lsbCBiZVxuLy8gaWdub3JlZC5cblxuLy8gMy4gQWxsIG9mIHRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zIG11c3QgdGhyb3cgYW4gQXNzZXJ0aW9uRXJyb3Jcbi8vIHdoZW4gYSBjb3JyZXNwb25kaW5nIGNvbmRpdGlvbiBpcyBub3QgbWV0LCB3aXRoIGEgbWVzc2FnZSB0aGF0XG4vLyBtYXkgYmUgdW5kZWZpbmVkIGlmIG5vdCBwcm92aWRlZC4gIEFsbCBhc3NlcnRpb24gbWV0aG9kcyBwcm92aWRlXG4vLyBib3RoIHRoZSBhY3R1YWwgYW5kIGV4cGVjdGVkIHZhbHVlcyB0byB0aGUgYXNzZXJ0aW9uIGVycm9yIGZvclxuLy8gZGlzcGxheSBwdXJwb3Nlcy5cblxuZnVuY3Rpb24gZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCBvcGVyYXRvciwgc3RhY2tTdGFydEZ1bmN0aW9uKSB7XG4gIHRocm93IG5ldyBhc3NlcnQuQXNzZXJ0aW9uRXJyb3Ioe1xuICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgYWN0dWFsOiBhY3R1YWwsXG4gICAgZXhwZWN0ZWQ6IGV4cGVjdGVkLFxuICAgIG9wZXJhdG9yOiBvcGVyYXRvcixcbiAgICBzdGFja1N0YXJ0RnVuY3Rpb246IHN0YWNrU3RhcnRGdW5jdGlvblxuICB9KTtcbn1cblxuLy8gRVhURU5TSU9OISBhbGxvd3MgZm9yIHdlbGwgYmVoYXZlZCBlcnJvcnMgZGVmaW5lZCBlbHNld2hlcmUuXG5hc3NlcnQuZmFpbCA9IGZhaWw7XG5cbi8vIDQuIFB1cmUgYXNzZXJ0aW9uIHRlc3RzIHdoZXRoZXIgYSB2YWx1ZSBpcyB0cnV0aHksIGFzIGRldGVybWluZWRcbi8vIGJ5ICEhZ3VhcmQuXG4vLyBhc3NlcnQub2soZ3VhcmQsIG1lc3NhZ2Vfb3B0KTtcbi8vIFRoaXMgc3RhdGVtZW50IGlzIGVxdWl2YWxlbnQgdG8gYXNzZXJ0LmVxdWFsKHRydWUsICEhZ3VhcmQsXG4vLyBtZXNzYWdlX29wdCk7LiBUbyB0ZXN0IHN0cmljdGx5IGZvciB0aGUgdmFsdWUgdHJ1ZSwgdXNlXG4vLyBhc3NlcnQuc3RyaWN0RXF1YWwodHJ1ZSwgZ3VhcmQsIG1lc3NhZ2Vfb3B0KTsuXG5cbmZ1bmN0aW9uIG9rKHZhbHVlLCBtZXNzYWdlKSB7XG4gIGlmICghdmFsdWUpIGZhaWwodmFsdWUsIHRydWUsIG1lc3NhZ2UsICc9PScsIGFzc2VydC5vayk7XG59XG5hc3NlcnQub2sgPSBvaztcblxuLy8gNS4gVGhlIGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzaGFsbG93LCBjb2VyY2l2ZSBlcXVhbGl0eSB3aXRoXG4vLyA9PS5cbi8vIGFzc2VydC5lcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5lcXVhbCA9IGZ1bmN0aW9uIGVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UpIHtcbiAgaWYgKGFjdHVhbCAhPSBleHBlY3RlZCkgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnPT0nLCBhc3NlcnQuZXF1YWwpO1xufTtcblxuLy8gNi4gVGhlIG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHdoZXRoZXIgdHdvIG9iamVjdHMgYXJlIG5vdCBlcXVhbFxuLy8gd2l0aCAhPSBhc3NlcnQubm90RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90RXF1YWwgPSBmdW5jdGlvbiBub3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT0gZXhwZWN0ZWQpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICchPScsIGFzc2VydC5ub3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDcuIFRoZSBlcXVpdmFsZW5jZSBhc3NlcnRpb24gdGVzdHMgYSBkZWVwIGVxdWFsaXR5IHJlbGF0aW9uLlxuLy8gYXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5kZWVwRXF1YWwgPSBmdW5jdGlvbiBkZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoIV9kZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCkpIHtcbiAgICBmYWlsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2UsICdkZWVwRXF1YWwnLCBhc3NlcnQuZGVlcEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSB7XG4gIC8vIDcuMS4gQWxsIGlkZW50aWNhbCB2YWx1ZXMgYXJlIGVxdWl2YWxlbnQsIGFzIGRldGVybWluZWQgYnkgPT09LlxuICBpZiAoYWN0dWFsID09PSBleHBlY3RlZCkge1xuICAgIHJldHVybiB0cnVlO1xuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0J1ZmZlcihhY3R1YWwpICYmIHV0aWwuaXNCdWZmZXIoZXhwZWN0ZWQpKSB7XG4gICAgaWYgKGFjdHVhbC5sZW5ndGggIT0gZXhwZWN0ZWQubGVuZ3RoKSByZXR1cm4gZmFsc2U7XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IGFjdHVhbC5sZW5ndGg7IGkrKykge1xuICAgICAgaWYgKGFjdHVhbFtpXSAhPT0gZXhwZWN0ZWRbaV0pIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdHJ1ZTtcblxuICAvLyA3LjIuIElmIHRoZSBleHBlY3RlZCB2YWx1ZSBpcyBhIERhdGUgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIERhdGUgb2JqZWN0IHRoYXQgcmVmZXJzIHRvIHRoZSBzYW1lIHRpbWUuXG4gIH0gZWxzZSBpZiAodXRpbC5pc0RhdGUoYWN0dWFsKSAmJiB1dGlsLmlzRGF0ZShleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsLmdldFRpbWUoKSA9PT0gZXhwZWN0ZWQuZ2V0VGltZSgpO1xuXG4gIC8vIDcuMyBJZiB0aGUgZXhwZWN0ZWQgdmFsdWUgaXMgYSBSZWdFeHAgb2JqZWN0LCB0aGUgYWN0dWFsIHZhbHVlIGlzXG4gIC8vIGVxdWl2YWxlbnQgaWYgaXQgaXMgYWxzbyBhIFJlZ0V4cCBvYmplY3Qgd2l0aCB0aGUgc2FtZSBzb3VyY2UgYW5kXG4gIC8vIHByb3BlcnRpZXMgKGBnbG9iYWxgLCBgbXVsdGlsaW5lYCwgYGxhc3RJbmRleGAsIGBpZ25vcmVDYXNlYCkuXG4gIH0gZWxzZSBpZiAodXRpbC5pc1JlZ0V4cChhY3R1YWwpICYmIHV0aWwuaXNSZWdFeHAoZXhwZWN0ZWQpKSB7XG4gICAgcmV0dXJuIGFjdHVhbC5zb3VyY2UgPT09IGV4cGVjdGVkLnNvdXJjZSAmJlxuICAgICAgICAgICBhY3R1YWwuZ2xvYmFsID09PSBleHBlY3RlZC5nbG9iYWwgJiZcbiAgICAgICAgICAgYWN0dWFsLm11bHRpbGluZSA9PT0gZXhwZWN0ZWQubXVsdGlsaW5lICYmXG4gICAgICAgICAgIGFjdHVhbC5sYXN0SW5kZXggPT09IGV4cGVjdGVkLmxhc3RJbmRleCAmJlxuICAgICAgICAgICBhY3R1YWwuaWdub3JlQ2FzZSA9PT0gZXhwZWN0ZWQuaWdub3JlQ2FzZTtcblxuICAvLyA3LjQuIE90aGVyIHBhaXJzIHRoYXQgZG8gbm90IGJvdGggcGFzcyB0eXBlb2YgdmFsdWUgPT0gJ29iamVjdCcsXG4gIC8vIGVxdWl2YWxlbmNlIGlzIGRldGVybWluZWQgYnkgPT0uXG4gIH0gZWxzZSBpZiAoIXV0aWwuaXNPYmplY3QoYWN0dWFsKSAmJiAhdXRpbC5pc09iamVjdChleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gYWN0dWFsID09IGV4cGVjdGVkO1xuXG4gIC8vIDcuNSBGb3IgYWxsIG90aGVyIE9iamVjdCBwYWlycywgaW5jbHVkaW5nIEFycmF5IG9iamVjdHMsIGVxdWl2YWxlbmNlIGlzXG4gIC8vIGRldGVybWluZWQgYnkgaGF2aW5nIHRoZSBzYW1lIG51bWJlciBvZiBvd25lZCBwcm9wZXJ0aWVzIChhcyB2ZXJpZmllZFxuICAvLyB3aXRoIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbCksIHRoZSBzYW1lIHNldCBvZiBrZXlzXG4gIC8vIChhbHRob3VnaCBub3QgbmVjZXNzYXJpbHkgdGhlIHNhbWUgb3JkZXIpLCBlcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnlcbiAgLy8gY29ycmVzcG9uZGluZyBrZXksIGFuZCBhbiBpZGVudGljYWwgJ3Byb3RvdHlwZScgcHJvcGVydHkuIE5vdGU6IHRoaXNcbiAgLy8gYWNjb3VudHMgZm9yIGJvdGggbmFtZWQgYW5kIGluZGV4ZWQgcHJvcGVydGllcyBvbiBBcnJheXMuXG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIG9iakVxdWl2KGFjdHVhbCwgZXhwZWN0ZWQpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzQXJndW1lbnRzKG9iamVjdCkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKG9iamVjdCkgPT0gJ1tvYmplY3QgQXJndW1lbnRzXSc7XG59XG5cbmZ1bmN0aW9uIG9iakVxdWl2KGEsIGIpIHtcbiAgaWYgKHV0aWwuaXNOdWxsT3JVbmRlZmluZWQoYSkgfHwgdXRpbC5pc051bGxPclVuZGVmaW5lZChiKSlcbiAgICByZXR1cm4gZmFsc2U7XG4gIC8vIGFuIGlkZW50aWNhbCAncHJvdG90eXBlJyBwcm9wZXJ0eS5cbiAgaWYgKGEucHJvdG90eXBlICE9PSBiLnByb3RvdHlwZSkgcmV0dXJuIGZhbHNlO1xuICAvL35+fkkndmUgbWFuYWdlZCB0byBicmVhayBPYmplY3Qua2V5cyB0aHJvdWdoIHNjcmV3eSBhcmd1bWVudHMgcGFzc2luZy5cbiAgLy8gICBDb252ZXJ0aW5nIHRvIGFycmF5IHNvbHZlcyB0aGUgcHJvYmxlbS5cbiAgaWYgKGlzQXJndW1lbnRzKGEpKSB7XG4gICAgaWYgKCFpc0FyZ3VtZW50cyhiKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgICBhID0gcFNsaWNlLmNhbGwoYSk7XG4gICAgYiA9IHBTbGljZS5jYWxsKGIpO1xuICAgIHJldHVybiBfZGVlcEVxdWFsKGEsIGIpO1xuICB9XG4gIHRyeSB7XG4gICAgdmFyIGthID0gb2JqZWN0S2V5cyhhKSxcbiAgICAgICAga2IgPSBvYmplY3RLZXlzKGIpLFxuICAgICAgICBrZXksIGk7XG4gIH0gY2F0Y2ggKGUpIHsvL2hhcHBlbnMgd2hlbiBvbmUgaXMgYSBzdHJpbmcgbGl0ZXJhbCBhbmQgdGhlIG90aGVyIGlzbid0XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIC8vIGhhdmluZyB0aGUgc2FtZSBudW1iZXIgb2Ygb3duZWQgcHJvcGVydGllcyAoa2V5cyBpbmNvcnBvcmF0ZXNcbiAgLy8gaGFzT3duUHJvcGVydHkpXG4gIGlmIChrYS5sZW5ndGggIT0ga2IubGVuZ3RoKVxuICAgIHJldHVybiBmYWxzZTtcbiAgLy90aGUgc2FtZSBzZXQgb2Yga2V5cyAoYWx0aG91Z2ggbm90IG5lY2Vzc2FyaWx5IHRoZSBzYW1lIG9yZGVyKSxcbiAga2Euc29ydCgpO1xuICBrYi5zb3J0KCk7XG4gIC8vfn5+Y2hlYXAga2V5IHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBpZiAoa2FbaV0gIT0ga2JbaV0pXG4gICAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgLy9lcXVpdmFsZW50IHZhbHVlcyBmb3IgZXZlcnkgY29ycmVzcG9uZGluZyBrZXksIGFuZFxuICAvL35+fnBvc3NpYmx5IGV4cGVuc2l2ZSBkZWVwIHRlc3RcbiAgZm9yIChpID0ga2EubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcbiAgICBrZXkgPSBrYVtpXTtcbiAgICBpZiAoIV9kZWVwRXF1YWwoYVtrZXldLCBiW2tleV0pKSByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbi8vIDguIFRoZSBub24tZXF1aXZhbGVuY2UgYXNzZXJ0aW9uIHRlc3RzIGZvciBhbnkgZGVlcCBpbmVxdWFsaXR5LlxuLy8gYXNzZXJ0Lm5vdERlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlX29wdCk7XG5cbmFzc2VydC5ub3REZWVwRXF1YWwgPSBmdW5jdGlvbiBub3REZWVwRXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoX2RlZXBFcXVhbChhY3R1YWwsIGV4cGVjdGVkKSkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJ25vdERlZXBFcXVhbCcsIGFzc2VydC5ub3REZWVwRXF1YWwpO1xuICB9XG59O1xuXG4vLyA5LiBUaGUgc3RyaWN0IGVxdWFsaXR5IGFzc2VydGlvbiB0ZXN0cyBzdHJpY3QgZXF1YWxpdHksIGFzIGRldGVybWluZWQgYnkgPT09LlxuLy8gYXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbCwgZXhwZWN0ZWQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnN0cmljdEVxdWFsID0gZnVuY3Rpb24gc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICBpZiAoYWN0dWFsICE9PSBleHBlY3RlZCkge1xuICAgIGZhaWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZSwgJz09PScsIGFzc2VydC5zdHJpY3RFcXVhbCk7XG4gIH1cbn07XG5cbi8vIDEwLiBUaGUgc3RyaWN0IG5vbi1lcXVhbGl0eSBhc3NlcnRpb24gdGVzdHMgZm9yIHN0cmljdCBpbmVxdWFsaXR5LCBhc1xuLy8gZGV0ZXJtaW5lZCBieSAhPT0uICBhc3NlcnQubm90U3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCwgbWVzc2FnZV9vcHQpO1xuXG5hc3NlcnQubm90U3RyaWN0RXF1YWwgPSBmdW5jdGlvbiBub3RTdHJpY3RFcXVhbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlKSB7XG4gIGlmIChhY3R1YWwgPT09IGV4cGVjdGVkKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCBtZXNzYWdlLCAnIT09JywgYXNzZXJ0Lm5vdFN0cmljdEVxdWFsKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkge1xuICBpZiAoIWFjdHVhbCB8fCAhZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKGV4cGVjdGVkKSA9PSAnW29iamVjdCBSZWdFeHBdJykge1xuICAgIHJldHVybiBleHBlY3RlZC50ZXN0KGFjdHVhbCk7XG4gIH0gZWxzZSBpZiAoYWN0dWFsIGluc3RhbmNlb2YgZXhwZWN0ZWQpIHtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBlbHNlIGlmIChleHBlY3RlZC5jYWxsKHt9LCBhY3R1YWwpID09PSB0cnVlKSB7XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICByZXR1cm4gZmFsc2U7XG59XG5cbmZ1bmN0aW9uIF90aHJvd3Moc2hvdWxkVGhyb3csIGJsb2NrLCBleHBlY3RlZCwgbWVzc2FnZSkge1xuICB2YXIgYWN0dWFsO1xuXG4gIGlmICh1dGlsLmlzU3RyaW5nKGV4cGVjdGVkKSkge1xuICAgIG1lc3NhZ2UgPSBleHBlY3RlZDtcbiAgICBleHBlY3RlZCA9IG51bGw7XG4gIH1cblxuICB0cnkge1xuICAgIGJsb2NrKCk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBhY3R1YWwgPSBlO1xuICB9XG5cbiAgbWVzc2FnZSA9IChleHBlY3RlZCAmJiBleHBlY3RlZC5uYW1lID8gJyAoJyArIGV4cGVjdGVkLm5hbWUgKyAnKS4nIDogJy4nKSArXG4gICAgICAgICAgICAobWVzc2FnZSA/ICcgJyArIG1lc3NhZ2UgOiAnLicpO1xuXG4gIGlmIChzaG91bGRUaHJvdyAmJiAhYWN0dWFsKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnTWlzc2luZyBleHBlY3RlZCBleGNlcHRpb24nICsgbWVzc2FnZSk7XG4gIH1cblxuICBpZiAoIXNob3VsZFRocm93ICYmIGV4cGVjdGVkRXhjZXB0aW9uKGFjdHVhbCwgZXhwZWN0ZWQpKSB7XG4gICAgZmFpbChhY3R1YWwsIGV4cGVjdGVkLCAnR290IHVud2FudGVkIGV4Y2VwdGlvbicgKyBtZXNzYWdlKTtcbiAgfVxuXG4gIGlmICgoc2hvdWxkVGhyb3cgJiYgYWN0dWFsICYmIGV4cGVjdGVkICYmXG4gICAgICAhZXhwZWN0ZWRFeGNlcHRpb24oYWN0dWFsLCBleHBlY3RlZCkpIHx8ICghc2hvdWxkVGhyb3cgJiYgYWN0dWFsKSkge1xuICAgIHRocm93IGFjdHVhbDtcbiAgfVxufVxuXG4vLyAxMS4gRXhwZWN0ZWQgdG8gdGhyb3cgYW4gZXJyb3I6XG4vLyBhc3NlcnQudGhyb3dzKGJsb2NrLCBFcnJvcl9vcHQsIG1lc3NhZ2Vfb3B0KTtcblxuYXNzZXJ0LnRocm93cyA9IGZ1bmN0aW9uKGJsb2NrLCAvKm9wdGlvbmFsKi9lcnJvciwgLypvcHRpb25hbCovbWVzc2FnZSkge1xuICBfdGhyb3dzLmFwcGx5KHRoaXMsIFt0cnVlXS5jb25jYXQocFNsaWNlLmNhbGwoYXJndW1lbnRzKSkpO1xufTtcblxuLy8gRVhURU5TSU9OISBUaGlzIGlzIGFubm95aW5nIHRvIHdyaXRlIG91dHNpZGUgdGhpcyBtb2R1bGUuXG5hc3NlcnQuZG9lc05vdFRocm93ID0gZnVuY3Rpb24oYmxvY2ssIC8qb3B0aW9uYWwqL21lc3NhZ2UpIHtcbiAgX3Rocm93cy5hcHBseSh0aGlzLCBbZmFsc2VdLmNvbmNhdChwU2xpY2UuY2FsbChhcmd1bWVudHMpKSk7XG59O1xuXG5hc3NlcnQuaWZFcnJvciA9IGZ1bmN0aW9uKGVycikgeyBpZiAoZXJyKSB7dGhyb3cgZXJyO319O1xuXG52YXIgb2JqZWN0S2V5cyA9IE9iamVjdC5rZXlzIHx8IGZ1bmN0aW9uIChvYmopIHtcbiAgdmFyIGtleXMgPSBbXTtcbiAgZm9yICh2YXIga2V5IGluIG9iaikge1xuICAgIGlmIChoYXNPd24uY2FsbChvYmosIGtleSkpIGtleXMucHVzaChrZXkpO1xuICB9XG4gIHJldHVybiBrZXlzO1xufTtcbiIsIi8qIVxuICogVGhlIGJ1ZmZlciBtb2R1bGUgZnJvbSBub2RlLmpzLCBmb3IgdGhlIGJyb3dzZXIuXG4gKlxuICogQGF1dGhvciAgIEZlcm9zcyBBYm91a2hhZGlqZWggPGZlcm9zc0BmZXJvc3Mub3JnPiA8aHR0cDovL2Zlcm9zcy5vcmc+XG4gKiBAbGljZW5zZSAgTUlUXG4gKi9cblxudmFyIGJhc2U2NCA9IHJlcXVpcmUoJ2Jhc2U2NC1qcycpXG52YXIgaWVlZTc1NCA9IHJlcXVpcmUoJ2llZWU3NTQnKVxuXG5leHBvcnRzLkJ1ZmZlciA9IEJ1ZmZlclxuZXhwb3J0cy5TbG93QnVmZmVyID0gQnVmZmVyXG5leHBvcnRzLklOU1BFQ1RfTUFYX0JZVEVTID0gNTBcbkJ1ZmZlci5wb29sU2l6ZSA9IDgxOTJcblxuLyoqXG4gKiBJZiBgQnVmZmVyLl91c2VUeXBlZEFycmF5c2A6XG4gKiAgID09PSB0cnVlICAgIFVzZSBVaW50OEFycmF5IGltcGxlbWVudGF0aW9uIChmYXN0ZXN0KVxuICogICA9PT0gZmFsc2UgICBVc2UgT2JqZWN0IGltcGxlbWVudGF0aW9uIChjb21wYXRpYmxlIGRvd24gdG8gSUU2KVxuICovXG5CdWZmZXIuX3VzZVR5cGVkQXJyYXlzID0gKGZ1bmN0aW9uICgpIHtcbiAgLy8gRGV0ZWN0IGlmIGJyb3dzZXIgc3VwcG9ydHMgVHlwZWQgQXJyYXlzLiBTdXBwb3J0ZWQgYnJvd3NlcnMgYXJlIElFIDEwKywgRmlyZWZveCA0KyxcbiAgLy8gQ2hyb21lIDcrLCBTYWZhcmkgNS4xKywgT3BlcmEgMTEuNissIGlPUyA0LjIrLiBJZiB0aGUgYnJvd3NlciBkb2VzIG5vdCBzdXBwb3J0IGFkZGluZ1xuICAvLyBwcm9wZXJ0aWVzIHRvIGBVaW50OEFycmF5YCBpbnN0YW5jZXMsIHRoZW4gdGhhdCdzIHRoZSBzYW1lIGFzIG5vIGBVaW50OEFycmF5YCBzdXBwb3J0XG4gIC8vIGJlY2F1c2Ugd2UgbmVlZCB0byBiZSBhYmxlIHRvIGFkZCBhbGwgdGhlIG5vZGUgQnVmZmVyIEFQSSBtZXRob2RzLiBUaGlzIGlzIGFuIGlzc3VlXG4gIC8vIGluIEZpcmVmb3ggNC0yOS4gTm93IGZpeGVkOiBodHRwczovL2J1Z3ppbGxhLm1vemlsbGEub3JnL3Nob3dfYnVnLmNnaT9pZD02OTU0MzhcbiAgdHJ5IHtcbiAgICB2YXIgYnVmID0gbmV3IEFycmF5QnVmZmVyKDApXG4gICAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGJ1ZilcbiAgICBhcnIuZm9vID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gNDIgfVxuICAgIHJldHVybiA0MiA9PT0gYXJyLmZvbygpICYmXG4gICAgICAgIHR5cGVvZiBhcnIuc3ViYXJyYXkgPT09ICdmdW5jdGlvbicgLy8gQ2hyb21lIDktMTAgbGFjayBgc3ViYXJyYXlgXG4gIH0gY2F0Y2ggKGUpIHtcbiAgICByZXR1cm4gZmFsc2VcbiAgfVxufSkoKVxuXG4vKipcbiAqIENsYXNzOiBCdWZmZXJcbiAqID09PT09PT09PT09PT1cbiAqXG4gKiBUaGUgQnVmZmVyIGNvbnN0cnVjdG9yIHJldHVybnMgaW5zdGFuY2VzIG9mIGBVaW50OEFycmF5YCB0aGF0IGFyZSBhdWdtZW50ZWRcbiAqIHdpdGggZnVuY3Rpb24gcHJvcGVydGllcyBmb3IgYWxsIHRoZSBub2RlIGBCdWZmZXJgIEFQSSBmdW5jdGlvbnMuIFdlIHVzZVxuICogYFVpbnQ4QXJyYXlgIHNvIHRoYXQgc3F1YXJlIGJyYWNrZXQgbm90YXRpb24gd29ya3MgYXMgZXhwZWN0ZWQgLS0gaXQgcmV0dXJuc1xuICogYSBzaW5nbGUgb2N0ZXQuXG4gKlxuICogQnkgYXVnbWVudGluZyB0aGUgaW5zdGFuY2VzLCB3ZSBjYW4gYXZvaWQgbW9kaWZ5aW5nIHRoZSBgVWludDhBcnJheWBcbiAqIHByb3RvdHlwZS5cbiAqL1xuZnVuY3Rpb24gQnVmZmVyIChzdWJqZWN0LCBlbmNvZGluZywgbm9aZXJvKSB7XG4gIGlmICghKHRoaXMgaW5zdGFuY2VvZiBCdWZmZXIpKVxuICAgIHJldHVybiBuZXcgQnVmZmVyKHN1YmplY3QsIGVuY29kaW5nLCBub1plcm8pXG5cbiAgdmFyIHR5cGUgPSB0eXBlb2Ygc3ViamVjdFxuXG4gIC8vIFdvcmthcm91bmQ6IG5vZGUncyBiYXNlNjQgaW1wbGVtZW50YXRpb24gYWxsb3dzIGZvciBub24tcGFkZGVkIHN0cmluZ3NcbiAgLy8gd2hpbGUgYmFzZTY0LWpzIGRvZXMgbm90LlxuICBpZiAoZW5jb2RpbmcgPT09ICdiYXNlNjQnICYmIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgc3ViamVjdCA9IHN0cmluZ3RyaW0oc3ViamVjdClcbiAgICB3aGlsZSAoc3ViamVjdC5sZW5ndGggJSA0ICE9PSAwKSB7XG4gICAgICBzdWJqZWN0ID0gc3ViamVjdCArICc9J1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGxlbmd0aFxuICB2YXIgbGVuZ3RoXG4gIGlmICh0eXBlID09PSAnbnVtYmVyJylcbiAgICBsZW5ndGggPSBjb2VyY2Uoc3ViamVjdClcbiAgZWxzZSBpZiAodHlwZSA9PT0gJ3N0cmluZycpXG4gICAgbGVuZ3RoID0gQnVmZmVyLmJ5dGVMZW5ndGgoc3ViamVjdCwgZW5jb2RpbmcpXG4gIGVsc2UgaWYgKHR5cGUgPT09ICdvYmplY3QnKVxuICAgIGxlbmd0aCA9IGNvZXJjZShzdWJqZWN0Lmxlbmd0aCkgLy8gYXNzdW1lIHRoYXQgb2JqZWN0IGlzIGFycmF5LWxpa2VcbiAgZWxzZVxuICAgIHRocm93IG5ldyBFcnJvcignRmlyc3QgYXJndW1lbnQgbmVlZHMgdG8gYmUgYSBudW1iZXIsIGFycmF5IG9yIHN0cmluZy4nKVxuXG4gIHZhciBidWZcbiAgaWYgKEJ1ZmZlci5fdXNlVHlwZWRBcnJheXMpIHtcbiAgICAvLyBQcmVmZXJyZWQ6IFJldHVybiBhbiBhdWdtZW50ZWQgYFVpbnQ4QXJyYXlgIGluc3RhbmNlIGZvciBiZXN0IHBlcmZvcm1hbmNlXG4gICAgYnVmID0gQnVmZmVyLl9hdWdtZW50KG5ldyBVaW50OEFycmF5KGxlbmd0aCkpXG4gIH0gZWxzZSB7XG4gICAgLy8gRmFsbGJhY2s6IFJldHVybiBUSElTIGluc3RhbmNlIG9mIEJ1ZmZlciAoY3JlYXRlZCBieSBgbmV3YClcbiAgICBidWYgPSB0aGlzXG4gICAgYnVmLmxlbmd0aCA9IGxlbmd0aFxuICAgIGJ1Zi5faXNCdWZmZXIgPSB0cnVlXG4gIH1cblxuICB2YXIgaVxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cyAmJiB0eXBlb2Ygc3ViamVjdC5ieXRlTGVuZ3RoID09PSAnbnVtYmVyJykge1xuICAgIC8vIFNwZWVkIG9wdGltaXphdGlvbiAtLSB1c2Ugc2V0IGlmIHdlJ3JlIGNvcHlpbmcgZnJvbSBhIHR5cGVkIGFycmF5XG4gICAgYnVmLl9zZXQoc3ViamVjdClcbiAgfSBlbHNlIGlmIChpc0FycmF5aXNoKHN1YmplY3QpKSB7XG4gICAgLy8gVHJlYXQgYXJyYXktaXNoIG9iamVjdHMgYXMgYSBieXRlIGFycmF5XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpKVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0LnJlYWRVSW50OChpKVxuICAgICAgZWxzZVxuICAgICAgICBidWZbaV0gPSBzdWJqZWN0W2ldXG4gICAgfVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgYnVmLndyaXRlKHN1YmplY3QsIDAsIGVuY29kaW5nKVxuICB9IGVsc2UgaWYgKHR5cGUgPT09ICdudW1iZXInICYmICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzICYmICFub1plcm8pIHtcbiAgICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgIGJ1ZltpXSA9IDBcbiAgICB9XG4gIH1cblxuICByZXR1cm4gYnVmXG59XG5cbi8vIFNUQVRJQyBNRVRIT0RTXG4vLyA9PT09PT09PT09PT09PVxuXG5CdWZmZXIuaXNFbmNvZGluZyA9IGZ1bmN0aW9uIChlbmNvZGluZykge1xuICBzd2l0Y2ggKFN0cmluZyhlbmNvZGluZykudG9Mb3dlckNhc2UoKSkge1xuICAgIGNhc2UgJ2hleCc6XG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICBjYXNlICdiaW5hcnknOlxuICAgIGNhc2UgJ2Jhc2U2NCc6XG4gICAgY2FzZSAncmF3JzpcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0dXJuIHRydWVcbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIGZhbHNlXG4gIH1cbn1cblxuQnVmZmVyLmlzQnVmZmVyID0gZnVuY3Rpb24gKGIpIHtcbiAgcmV0dXJuICEhKGIgIT09IG51bGwgJiYgYiAhPT0gdW5kZWZpbmVkICYmIGIuX2lzQnVmZmVyKVxufVxuXG5CdWZmZXIuYnl0ZUxlbmd0aCA9IGZ1bmN0aW9uIChzdHIsIGVuY29kaW5nKSB7XG4gIHZhciByZXRcbiAgc3RyID0gc3RyICsgJydcbiAgc3dpdGNoIChlbmNvZGluZyB8fCAndXRmOCcpIHtcbiAgICBjYXNlICdoZXgnOlxuICAgICAgcmV0ID0gc3RyLmxlbmd0aCAvIDJcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndXRmOCc6XG4gICAgY2FzZSAndXRmLTgnOlxuICAgICAgcmV0ID0gdXRmOFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYXNjaWknOlxuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgY2FzZSAncmF3JzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IGJhc2U2NFRvQnl0ZXMoc3RyKS5sZW5ndGhcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAndWNzMic6XG4gICAgY2FzZSAndWNzLTInOlxuICAgIGNhc2UgJ3V0ZjE2bGUnOlxuICAgIGNhc2UgJ3V0Zi0xNmxlJzpcbiAgICAgIHJldCA9IHN0ci5sZW5ndGggKiAyXG4gICAgICBicmVha1xuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gZW5jb2RpbmcnKVxuICB9XG4gIHJldHVybiByZXRcbn1cblxuQnVmZmVyLmNvbmNhdCA9IGZ1bmN0aW9uIChsaXN0LCB0b3RhbExlbmd0aCkge1xuICBhc3NlcnQoaXNBcnJheShsaXN0KSwgJ1VzYWdlOiBCdWZmZXIuY29uY2F0KGxpc3QsIFt0b3RhbExlbmd0aF0pXFxuJyArXG4gICAgICAnbGlzdCBzaG91bGQgYmUgYW4gQXJyYXkuJylcblxuICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcigwKVxuICB9IGVsc2UgaWYgKGxpc3QubGVuZ3RoID09PSAxKSB7XG4gICAgcmV0dXJuIGxpc3RbMF1cbiAgfVxuXG4gIHZhciBpXG4gIGlmICh0eXBlb2YgdG90YWxMZW5ndGggIT09ICdudW1iZXInKSB7XG4gICAgdG90YWxMZW5ndGggPSAwXG4gICAgZm9yIChpID0gMDsgaSA8IGxpc3QubGVuZ3RoOyBpKyspIHtcbiAgICAgIHRvdGFsTGVuZ3RoICs9IGxpc3RbaV0ubGVuZ3RoXG4gICAgfVxuICB9XG5cbiAgdmFyIGJ1ZiA9IG5ldyBCdWZmZXIodG90YWxMZW5ndGgpXG4gIHZhciBwb3MgPSAwXG4gIGZvciAoaSA9IDA7IGkgPCBsaXN0Lmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGl0ZW0gPSBsaXN0W2ldXG4gICAgaXRlbS5jb3B5KGJ1ZiwgcG9zKVxuICAgIHBvcyArPSBpdGVtLmxlbmd0aFxuICB9XG4gIHJldHVybiBidWZcbn1cblxuLy8gQlVGRkVSIElOU1RBTkNFIE1FVEhPRFNcbi8vID09PT09PT09PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIF9oZXhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IGJ1Zi5sZW5ndGggLSBvZmZzZXRcbiAgaWYgKCFsZW5ndGgpIHtcbiAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgfSBlbHNlIHtcbiAgICBsZW5ndGggPSBOdW1iZXIobGVuZ3RoKVxuICAgIGlmIChsZW5ndGggPiByZW1haW5pbmcpIHtcbiAgICAgIGxlbmd0aCA9IHJlbWFpbmluZ1xuICAgIH1cbiAgfVxuXG4gIC8vIG11c3QgYmUgYW4gZXZlbiBudW1iZXIgb2YgZGlnaXRzXG4gIHZhciBzdHJMZW4gPSBzdHJpbmcubGVuZ3RoXG4gIGFzc2VydChzdHJMZW4gJSAyID09PSAwLCAnSW52YWxpZCBoZXggc3RyaW5nJylcblxuICBpZiAobGVuZ3RoID4gc3RyTGVuIC8gMikge1xuICAgIGxlbmd0aCA9IHN0ckxlbiAvIDJcbiAgfVxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGJ5dGUgPSBwYXJzZUludChzdHJpbmcuc3Vic3RyKGkgKiAyLCAyKSwgMTYpXG4gICAgYXNzZXJ0KCFpc05hTihieXRlKSwgJ0ludmFsaWQgaGV4IHN0cmluZycpXG4gICAgYnVmW29mZnNldCArIGldID0gYnl0ZVxuICB9XG4gIEJ1ZmZlci5fY2hhcnNXcml0dGVuID0gaSAqIDJcbiAgcmV0dXJuIGlcbn1cblxuZnVuY3Rpb24gX3V0ZjhXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGY4VG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9hc2NpaVdyaXRlIChidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIGNoYXJzV3JpdHRlbiA9IEJ1ZmZlci5fY2hhcnNXcml0dGVuID1cbiAgICBibGl0QnVmZmVyKGFzY2lpVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHJldHVybiBfYXNjaWlXcml0ZShidWYsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcihiYXNlNjRUb0J5dGVzKHN0cmluZyksIGJ1Ziwgb2Zmc2V0LCBsZW5ndGgpXG4gIHJldHVybiBjaGFyc1dyaXR0ZW5cbn1cblxuZnVuY3Rpb24gX3V0ZjE2bGVXcml0ZSAoYnVmLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKSB7XG4gIHZhciBjaGFyc1dyaXR0ZW4gPSBCdWZmZXIuX2NoYXJzV3JpdHRlbiA9XG4gICAgYmxpdEJ1ZmZlcih1dGYxNmxlVG9CeXRlcyhzdHJpbmcpLCBidWYsIG9mZnNldCwgbGVuZ3RoKVxuICByZXR1cm4gY2hhcnNXcml0dGVuXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbiAoc3RyaW5nLCBvZmZzZXQsIGxlbmd0aCwgZW5jb2RpbmcpIHtcbiAgLy8gU3VwcG9ydCBib3RoIChzdHJpbmcsIG9mZnNldCwgbGVuZ3RoLCBlbmNvZGluZylcbiAgLy8gYW5kIHRoZSBsZWdhY3kgKHN0cmluZywgZW5jb2RpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICBpZiAoaXNGaW5pdGUob2Zmc2V0KSkge1xuICAgIGlmICghaXNGaW5pdGUobGVuZ3RoKSkge1xuICAgICAgZW5jb2RpbmcgPSBsZW5ndGhcbiAgICAgIGxlbmd0aCA9IHVuZGVmaW5lZFxuICAgIH1cbiAgfSBlbHNlIHsgIC8vIGxlZ2FjeVxuICAgIHZhciBzd2FwID0gZW5jb2RpbmdcbiAgICBlbmNvZGluZyA9IG9mZnNldFxuICAgIG9mZnNldCA9IGxlbmd0aFxuICAgIGxlbmd0aCA9IHN3YXBcbiAgfVxuXG4gIG9mZnNldCA9IE51bWJlcihvZmZzZXQpIHx8IDBcbiAgdmFyIHJlbWFpbmluZyA9IHRoaXMubGVuZ3RoIC0gb2Zmc2V0XG4gIGlmICghbGVuZ3RoKSB7XG4gICAgbGVuZ3RoID0gcmVtYWluaW5nXG4gIH0gZWxzZSB7XG4gICAgbGVuZ3RoID0gTnVtYmVyKGxlbmd0aClcbiAgICBpZiAobGVuZ3RoID4gcmVtYWluaW5nKSB7XG4gICAgICBsZW5ndGggPSByZW1haW5pbmdcbiAgICB9XG4gIH1cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVdyaXRlKHRoaXMsIHN0cmluZywgb2Zmc2V0LCBsZW5ndGgpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5V3JpdGUodGhpcywgc3RyaW5nLCBvZmZzZXQsIGxlbmd0aClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVXcml0ZSh0aGlzLCBzdHJpbmcsIG9mZnNldCwgbGVuZ3RoKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9TdHJpbmcgPSBmdW5jdGlvbiAoZW5jb2RpbmcsIHN0YXJ0LCBlbmQpIHtcbiAgdmFyIHNlbGYgPSB0aGlzXG5cbiAgZW5jb2RpbmcgPSBTdHJpbmcoZW5jb2RpbmcgfHwgJ3V0ZjgnKS50b0xvd2VyQ2FzZSgpXG4gIHN0YXJ0ID0gTnVtYmVyKHN0YXJ0KSB8fCAwXG4gIGVuZCA9IChlbmQgIT09IHVuZGVmaW5lZClcbiAgICA/IE51bWJlcihlbmQpXG4gICAgOiBlbmQgPSBzZWxmLmxlbmd0aFxuXG4gIC8vIEZhc3RwYXRoIGVtcHR5IHN0cmluZ3NcbiAgaWYgKGVuZCA9PT0gc3RhcnQpXG4gICAgcmV0dXJuICcnXG5cbiAgdmFyIHJldFxuICBzd2l0Y2ggKGVuY29kaW5nKSB7XG4gICAgY2FzZSAnaGV4JzpcbiAgICAgIHJldCA9IF9oZXhTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1dGY4JzpcbiAgICBjYXNlICd1dGYtOCc6XG4gICAgICByZXQgPSBfdXRmOFNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2FzY2lpJzpcbiAgICAgIHJldCA9IF9hc2NpaVNsaWNlKHNlbGYsIHN0YXJ0LCBlbmQpXG4gICAgICBicmVha1xuICAgIGNhc2UgJ2JpbmFyeSc6XG4gICAgICByZXQgPSBfYmluYXJ5U2xpY2Uoc2VsZiwgc3RhcnQsIGVuZClcbiAgICAgIGJyZWFrXG4gICAgY2FzZSAnYmFzZTY0JzpcbiAgICAgIHJldCA9IF9iYXNlNjRTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBjYXNlICd1Y3MyJzpcbiAgICBjYXNlICd1Y3MtMic6XG4gICAgY2FzZSAndXRmMTZsZSc6XG4gICAgY2FzZSAndXRmLTE2bGUnOlxuICAgICAgcmV0ID0gX3V0ZjE2bGVTbGljZShzZWxmLCBzdGFydCwgZW5kKVxuICAgICAgYnJlYWtcbiAgICBkZWZhdWx0OlxuICAgICAgdGhyb3cgbmV3IEVycm9yKCdVbmtub3duIGVuY29kaW5nJylcbiAgfVxuICByZXR1cm4gcmV0XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUudG9KU09OID0gZnVuY3Rpb24gKCkge1xuICByZXR1cm4ge1xuICAgIHR5cGU6ICdCdWZmZXInLFxuICAgIGRhdGE6IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKHRoaXMuX2FyciB8fCB0aGlzLCAwKVxuICB9XG59XG5cbi8vIGNvcHkodGFyZ2V0QnVmZmVyLCB0YXJnZXRTdGFydD0wLCBzb3VyY2VTdGFydD0wLCBzb3VyY2VFbmQ9YnVmZmVyLmxlbmd0aClcbkJ1ZmZlci5wcm90b3R5cGUuY29weSA9IGZ1bmN0aW9uICh0YXJnZXQsIHRhcmdldF9zdGFydCwgc3RhcnQsIGVuZCkge1xuICB2YXIgc291cmNlID0gdGhpc1xuXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCAmJiBlbmQgIT09IDApIGVuZCA9IHRoaXMubGVuZ3RoXG4gIGlmICghdGFyZ2V0X3N0YXJ0KSB0YXJnZXRfc3RhcnQgPSAwXG5cbiAgLy8gQ29weSAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRhcmdldC5sZW5ndGggPT09IDAgfHwgc291cmNlLmxlbmd0aCA9PT0gMCkgcmV0dXJuXG5cbiAgLy8gRmF0YWwgZXJyb3IgY29uZGl0aW9uc1xuICBhc3NlcnQoZW5kID49IHN0YXJ0LCAnc291cmNlRW5kIDwgc291cmNlU3RhcnQnKVxuICBhc3NlcnQodGFyZ2V0X3N0YXJ0ID49IDAgJiYgdGFyZ2V0X3N0YXJ0IDwgdGFyZ2V0Lmxlbmd0aCxcbiAgICAgICd0YXJnZXRTdGFydCBvdXQgb2YgYm91bmRzJylcbiAgYXNzZXJ0KHN0YXJ0ID49IDAgJiYgc3RhcnQgPCBzb3VyY2UubGVuZ3RoLCAnc291cmNlU3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gc291cmNlLmxlbmd0aCwgJ3NvdXJjZUVuZCBvdXQgb2YgYm91bmRzJylcblxuICAvLyBBcmUgd2Ugb29iP1xuICBpZiAoZW5kID4gdGhpcy5sZW5ndGgpXG4gICAgZW5kID0gdGhpcy5sZW5ndGhcbiAgaWYgKHRhcmdldC5sZW5ndGggLSB0YXJnZXRfc3RhcnQgPCBlbmQgLSBzdGFydClcbiAgICBlbmQgPSB0YXJnZXQubGVuZ3RoIC0gdGFyZ2V0X3N0YXJ0ICsgc3RhcnRcblxuICB2YXIgbGVuID0gZW5kIC0gc3RhcnRcblxuICBpZiAobGVuIDwgMTAwIHx8ICFCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKylcbiAgICAgIHRhcmdldFtpICsgdGFyZ2V0X3N0YXJ0XSA9IHRoaXNbaSArIHN0YXJ0XVxuICB9IGVsc2Uge1xuICAgIHRhcmdldC5fc2V0KHRoaXMuc3ViYXJyYXkoc3RhcnQsIHN0YXJ0ICsgbGVuKSwgdGFyZ2V0X3N0YXJ0KVxuICB9XG59XG5cbmZ1bmN0aW9uIF9iYXNlNjRTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIGlmIChzdGFydCA9PT0gMCAmJiBlbmQgPT09IGJ1Zi5sZW5ndGgpIHtcbiAgICByZXR1cm4gYmFzZTY0LmZyb21CeXRlQXJyYXkoYnVmKVxuICB9IGVsc2Uge1xuICAgIHJldHVybiBiYXNlNjQuZnJvbUJ5dGVBcnJheShidWYuc2xpY2Uoc3RhcnQsIGVuZCkpXG4gIH1cbn1cblxuZnVuY3Rpb24gX3V0ZjhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXMgPSAnJ1xuICB2YXIgdG1wID0gJydcbiAgZW5kID0gTWF0aC5taW4oYnVmLmxlbmd0aCwgZW5kKVxuXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgaWYgKGJ1ZltpXSA8PSAweDdGKSB7XG4gICAgICByZXMgKz0gZGVjb2RlVXRmOENoYXIodG1wKSArIFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICAgICAgdG1wID0gJydcbiAgICB9IGVsc2Uge1xuICAgICAgdG1wICs9ICclJyArIGJ1ZltpXS50b1N0cmluZygxNilcbiAgICB9XG4gIH1cblxuICByZXR1cm4gcmVzICsgZGVjb2RlVXRmOENoYXIodG1wKVxufVxuXG5mdW5jdGlvbiBfYXNjaWlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciByZXQgPSAnJ1xuICBlbmQgPSBNYXRoLm1pbihidWYubGVuZ3RoLCBlbmQpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspXG4gICAgcmV0ICs9IFN0cmluZy5mcm9tQ2hhckNvZGUoYnVmW2ldKVxuICByZXR1cm4gcmV0XG59XG5cbmZ1bmN0aW9uIF9iaW5hcnlTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHJldHVybiBfYXNjaWlTbGljZShidWYsIHN0YXJ0LCBlbmQpXG59XG5cbmZ1bmN0aW9uIF9oZXhTbGljZSAoYnVmLCBzdGFydCwgZW5kKSB7XG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG5cbiAgaWYgKCFzdGFydCB8fCBzdGFydCA8IDApIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCB8fCBlbmQgPCAwIHx8IGVuZCA+IGxlbikgZW5kID0gbGVuXG5cbiAgdmFyIG91dCA9ICcnXG4gIGZvciAodmFyIGkgPSBzdGFydDsgaSA8IGVuZDsgaSsrKSB7XG4gICAgb3V0ICs9IHRvSGV4KGJ1ZltpXSlcbiAgfVxuICByZXR1cm4gb3V0XG59XG5cbmZ1bmN0aW9uIF91dGYxNmxlU2xpY2UgKGJ1Ziwgc3RhcnQsIGVuZCkge1xuICB2YXIgYnl0ZXMgPSBidWYuc2xpY2Uoc3RhcnQsIGVuZClcbiAgdmFyIHJlcyA9ICcnXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnl0ZXMubGVuZ3RoOyBpICs9IDIpIHtcbiAgICByZXMgKz0gU3RyaW5nLmZyb21DaGFyQ29kZShieXRlc1tpXSArIGJ5dGVzW2krMV0gKiAyNTYpXG4gIH1cbiAgcmV0dXJuIHJlc1xufVxuXG5CdWZmZXIucHJvdG90eXBlLnNsaWNlID0gZnVuY3Rpb24gKHN0YXJ0LCBlbmQpIHtcbiAgdmFyIGxlbiA9IHRoaXMubGVuZ3RoXG4gIHN0YXJ0ID0gY2xhbXAoc3RhcnQsIGxlbiwgMClcbiAgZW5kID0gY2xhbXAoZW5kLCBsZW4sIGxlbilcblxuICBpZiAoQnVmZmVyLl91c2VUeXBlZEFycmF5cykge1xuICAgIHJldHVybiBCdWZmZXIuX2F1Z21lbnQodGhpcy5zdWJhcnJheShzdGFydCwgZW5kKSlcbiAgfSBlbHNlIHtcbiAgICB2YXIgc2xpY2VMZW4gPSBlbmQgLSBzdGFydFxuICAgIHZhciBuZXdCdWYgPSBuZXcgQnVmZmVyKHNsaWNlTGVuLCB1bmRlZmluZWQsIHRydWUpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBzbGljZUxlbjsgaSsrKSB7XG4gICAgICBuZXdCdWZbaV0gPSB0aGlzW2kgKyBzdGFydF1cbiAgICB9XG4gICAgcmV0dXJuIG5ld0J1ZlxuICB9XG59XG5cbi8vIGBnZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLmdldCA9IGZ1bmN0aW9uIChvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5nZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLnJlYWRVSW50OChvZmZzZXQpXG59XG5cbi8vIGBzZXRgIHdpbGwgYmUgcmVtb3ZlZCBpbiBOb2RlIDAuMTMrXG5CdWZmZXIucHJvdG90eXBlLnNldCA9IGZ1bmN0aW9uICh2LCBvZmZzZXQpIHtcbiAgY29uc29sZS5sb2coJy5zZXQoKSBpcyBkZXByZWNhdGVkLiBBY2Nlc3MgdXNpbmcgYXJyYXkgaW5kZXhlcyBpbnN0ZWFkLicpXG4gIHJldHVybiB0aGlzLndyaXRlVUludDgodiwgb2Zmc2V0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgcmV0dXJuIHRoaXNbb2Zmc2V0XVxufVxuXG5mdW5jdGlvbiBfcmVhZFVJbnQxNiAoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIHZhciB2YWxcbiAgaWYgKGxpdHRsZUVuZGlhbikge1xuICAgIHZhbCA9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdIDw8IDhcbiAgfSBlbHNlIHtcbiAgICB2YWwgPSBidWZbb2Zmc2V0XSA8PCA4XG4gICAgaWYgKG9mZnNldCArIDEgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDFdXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQxNih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3JlYWRVSW50MzIgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsXG4gIGlmIChsaXR0bGVFbmRpYW4pIHtcbiAgICBpZiAob2Zmc2V0ICsgMiA8IGxlbilcbiAgICAgIHZhbCA9IGJ1ZltvZmZzZXQgKyAyXSA8PCAxNlxuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsIHw9IGJ1ZltvZmZzZXQgKyAxXSA8PCA4XG4gICAgdmFsIHw9IGJ1ZltvZmZzZXRdXG4gICAgaWYgKG9mZnNldCArIDMgPCBsZW4pXG4gICAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldCArIDNdIDw8IDI0ID4+PiAwKVxuICB9IGVsc2Uge1xuICAgIGlmIChvZmZzZXQgKyAxIDwgbGVuKVxuICAgICAgdmFsID0gYnVmW29mZnNldCArIDFdIDw8IDE2XG4gICAgaWYgKG9mZnNldCArIDIgPCBsZW4pXG4gICAgICB2YWwgfD0gYnVmW29mZnNldCArIDJdIDw8IDhcbiAgICBpZiAob2Zmc2V0ICsgMyA8IGxlbilcbiAgICAgIHZhbCB8PSBidWZbb2Zmc2V0ICsgM11cbiAgICB2YWwgPSB2YWwgKyAoYnVmW29mZnNldF0gPDwgMjQgPj4+IDApXG4gIH1cbiAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJMRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRVSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZFVJbnQzMih0aGlzLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50OCA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLFxuICAgICAgICAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgdmFyIG5lZyA9IHRoaXNbb2Zmc2V0XSAmIDB4ODBcbiAgaWYgKG5lZylcbiAgICByZXR1cm4gKDB4ZmYgLSB0aGlzW29mZnNldF0gKyAxKSAqIC0xXG4gIGVsc2VcbiAgICByZXR1cm4gdGhpc1tvZmZzZXRdXG59XG5cbmZ1bmN0aW9uIF9yZWFkSW50MTYgKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMSA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gcmVhZCBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICB2YXIgdmFsID0gX3JlYWRVSW50MTYoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgdHJ1ZSlcbiAgdmFyIG5lZyA9IHZhbCAmIDB4ODAwMFxuICBpZiAobmVnKVxuICAgIHJldHVybiAoMHhmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQxNkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MTYodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MTZCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDE2KHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEludDMyIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDMgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHJlYWQgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgdmFyIHZhbCA9IF9yZWFkVUludDMyKGJ1Ziwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIHRydWUpXG4gIHZhciBuZWcgPSB2YWwgJiAweDgwMDAwMDAwXG4gIGlmIChuZWcpXG4gICAgcmV0dXJuICgweGZmZmZmZmZmIC0gdmFsICsgMSkgKiAtMVxuICBlbHNlXG4gICAgcmV0dXJuIHZhbFxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRJbnQzMkxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkSW50MzIodGhpcywgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS5yZWFkSW50MzJCRSA9IGZ1bmN0aW9uIChvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIHJldHVybiBfcmVhZEludDMyKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfcmVhZEZsb2F0IChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgMjMsIDQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZEZsb2F0TEUgPSBmdW5jdGlvbiAob2Zmc2V0LCBub0Fzc2VydCkge1xuICByZXR1cm4gX3JlYWRGbG9hdCh0aGlzLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLnJlYWRGbG9hdEJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRmxvYXQodGhpcywgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF9yZWFkRG91YmxlIChidWYsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgKyA3IDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byByZWFkIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgfVxuXG4gIHJldHVybiBpZWVlNzU0LnJlYWQoYnVmLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgNTIsIDgpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUxFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUucmVhZERvdWJsZUJFID0gZnVuY3Rpb24gKG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgcmV0dXJuIF9yZWFkRG91YmxlKHRoaXMsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlVUludDggPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0IDwgdGhpcy5sZW5ndGgsICd0cnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmdWludCh2YWx1ZSwgMHhmZilcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpIHJldHVyblxuXG4gIHRoaXNbb2Zmc2V0XSA9IHZhbHVlXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQxNiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAxIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmYpXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBmb3IgKHZhciBpID0gMCwgaiA9IE1hdGgubWluKGxlbiAtIG9mZnNldCwgMik7IGkgPCBqOyBpKyspIHtcbiAgICBidWZbb2Zmc2V0ICsgaV0gPVxuICAgICAgICAodmFsdWUgJiAoMHhmZiA8PCAoOCAqIChsaXR0bGVFbmRpYW4gPyBpIDogMSAtIGkpKSkpID4+PlxuICAgICAgICAgICAgKGxpdHRsZUVuZGlhbiA/IGkgOiAxIC0gaSkgKiA4XG4gIH1cbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkxFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZVVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZVVJbnQxNih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCBmYWxzZSwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZVVJbnQzMiAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ3RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZ1aW50KHZhbHVlLCAweGZmZmZmZmZmKVxuICB9XG5cbiAgdmFyIGxlbiA9IGJ1Zi5sZW5ndGhcbiAgaWYgKG9mZnNldCA+PSBsZW4pXG4gICAgcmV0dXJuXG5cbiAgZm9yICh2YXIgaSA9IDAsIGogPSBNYXRoLm1pbihsZW4gLSBvZmZzZXQsIDQpOyBpIDwgajsgaSsrKSB7XG4gICAgYnVmW29mZnNldCArIGldID1cbiAgICAgICAgKHZhbHVlID4+PiAobGl0dGxlRW5kaWFuID8gaSA6IDMgLSBpKSAqIDgpICYgMHhmZlxuICB9XG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVVSW50MzJCRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVVSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50OCA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgPCB0aGlzLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZzaW50KHZhbHVlLCAweDdmLCAtMHg4MClcbiAgfVxuXG4gIGlmIChvZmZzZXQgPj0gdGhpcy5sZW5ndGgpXG4gICAgcmV0dXJuXG5cbiAgaWYgKHZhbHVlID49IDApXG4gICAgdGhpcy53cml0ZVVJbnQ4KHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgdGhpcy53cml0ZVVJbnQ4KDB4ZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbm9Bc3NlcnQpXG59XG5cbmZ1bmN0aW9uIF93cml0ZUludDE2IChidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpIHtcbiAgaWYgKCFub0Fzc2VydCkge1xuICAgIGFzc2VydCh2YWx1ZSAhPT0gdW5kZWZpbmVkICYmIHZhbHVlICE9PSBudWxsLCAnbWlzc2luZyB2YWx1ZScpXG4gICAgYXNzZXJ0KHR5cGVvZiBsaXR0bGVFbmRpYW4gPT09ICdib29sZWFuJywgJ21pc3Npbmcgb3IgaW52YWxpZCBlbmRpYW4nKVxuICAgIGFzc2VydChvZmZzZXQgIT09IHVuZGVmaW5lZCAmJiBvZmZzZXQgIT09IG51bGwsICdtaXNzaW5nIG9mZnNldCcpXG4gICAgYXNzZXJ0KG9mZnNldCArIDEgPCBidWYubGVuZ3RoLCAnVHJ5aW5nIHRvIHdyaXRlIGJleW9uZCBidWZmZXIgbGVuZ3RoJylcbiAgICB2ZXJpZnNpbnQodmFsdWUsIDB4N2ZmZiwgLTB4ODAwMClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGlmICh2YWx1ZSA+PSAwKVxuICAgIF93cml0ZVVJbnQxNihidWYsIHZhbHVlLCBvZmZzZXQsIGxpdHRsZUVuZGlhbiwgbm9Bc3NlcnQpXG4gIGVsc2VcbiAgICBfd3JpdGVVSW50MTYoYnVmLCAweGZmZmYgKyB2YWx1ZSArIDEsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDE2TEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MTYodGhpcywgdmFsdWUsIG9mZnNldCwgdHJ1ZSwgbm9Bc3NlcnQpXG59XG5cbkJ1ZmZlci5wcm90b3R5cGUud3JpdGVJbnQxNkJFID0gZnVuY3Rpb24gKHZhbHVlLCBvZmZzZXQsIG5vQXNzZXJ0KSB7XG4gIF93cml0ZUludDE2KHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuZnVuY3Rpb24gX3dyaXRlSW50MzIgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgMyA8IGJ1Zi5sZW5ndGgsICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmc2ludCh2YWx1ZSwgMHg3ZmZmZmZmZiwgLTB4ODAwMDAwMDApXG4gIH1cblxuICB2YXIgbGVuID0gYnVmLmxlbmd0aFxuICBpZiAob2Zmc2V0ID49IGxlbilcbiAgICByZXR1cm5cblxuICBpZiAodmFsdWUgPj0gMClcbiAgICBfd3JpdGVVSW50MzIoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxuICBlbHNlXG4gICAgX3dyaXRlVUludDMyKGJ1ZiwgMHhmZmZmZmZmZiArIHZhbHVlICsgMSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlSW50MzJMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVJbnQzMih0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUludDMyQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlSW50MzIodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVGbG9hdCAoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIG5vQXNzZXJ0KSB7XG4gIGlmICghbm9Bc3NlcnQpIHtcbiAgICBhc3NlcnQodmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbCwgJ21pc3NpbmcgdmFsdWUnKVxuICAgIGFzc2VydCh0eXBlb2YgbGl0dGxlRW5kaWFuID09PSAnYm9vbGVhbicsICdtaXNzaW5nIG9yIGludmFsaWQgZW5kaWFuJylcbiAgICBhc3NlcnQob2Zmc2V0ICE9PSB1bmRlZmluZWQgJiYgb2Zmc2V0ICE9PSBudWxsLCAnbWlzc2luZyBvZmZzZXQnKVxuICAgIGFzc2VydChvZmZzZXQgKyAzIDwgYnVmLmxlbmd0aCwgJ1RyeWluZyB0byB3cml0ZSBiZXlvbmQgYnVmZmVyIGxlbmd0aCcpXG4gICAgdmVyaWZJRUVFNzU0KHZhbHVlLCAzLjQwMjgyMzQ2NjM4NTI4ODZlKzM4LCAtMy40MDI4MjM0NjYzODUyODg2ZSszOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDIzLCA0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRmxvYXRMRSA9IGZ1bmN0aW9uICh2YWx1ZSwgb2Zmc2V0LCBub0Fzc2VydCkge1xuICBfd3JpdGVGbG9hdCh0aGlzLCB2YWx1ZSwgb2Zmc2V0LCB0cnVlLCBub0Fzc2VydClcbn1cblxuQnVmZmVyLnByb3RvdHlwZS53cml0ZUZsb2F0QkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRmxvYXQodGhpcywgdmFsdWUsIG9mZnNldCwgZmFsc2UsIG5vQXNzZXJ0KVxufVxuXG5mdW5jdGlvbiBfd3JpdGVEb3VibGUgKGJ1ZiwgdmFsdWUsIG9mZnNldCwgbGl0dGxlRW5kaWFuLCBub0Fzc2VydCkge1xuICBpZiAoIW5vQXNzZXJ0KSB7XG4gICAgYXNzZXJ0KHZhbHVlICE9PSB1bmRlZmluZWQgJiYgdmFsdWUgIT09IG51bGwsICdtaXNzaW5nIHZhbHVlJylcbiAgICBhc3NlcnQodHlwZW9mIGxpdHRsZUVuZGlhbiA9PT0gJ2Jvb2xlYW4nLCAnbWlzc2luZyBvciBpbnZhbGlkIGVuZGlhbicpXG4gICAgYXNzZXJ0KG9mZnNldCAhPT0gdW5kZWZpbmVkICYmIG9mZnNldCAhPT0gbnVsbCwgJ21pc3Npbmcgb2Zmc2V0JylcbiAgICBhc3NlcnQob2Zmc2V0ICsgNyA8IGJ1Zi5sZW5ndGgsXG4gICAgICAgICdUcnlpbmcgdG8gd3JpdGUgYmV5b25kIGJ1ZmZlciBsZW5ndGgnKVxuICAgIHZlcmlmSUVFRTc1NCh2YWx1ZSwgMS43OTc2OTMxMzQ4NjIzMTU3RSszMDgsIC0xLjc5NzY5MzEzNDg2MjMxNTdFKzMwOClcbiAgfVxuXG4gIHZhciBsZW4gPSBidWYubGVuZ3RoXG4gIGlmIChvZmZzZXQgPj0gbGVuKVxuICAgIHJldHVyblxuXG4gIGllZWU3NTQud3JpdGUoYnVmLCB2YWx1ZSwgb2Zmc2V0LCBsaXR0bGVFbmRpYW4sIDUyLCA4KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlTEUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIHRydWUsIG5vQXNzZXJ0KVxufVxuXG5CdWZmZXIucHJvdG90eXBlLndyaXRlRG91YmxlQkUgPSBmdW5jdGlvbiAodmFsdWUsIG9mZnNldCwgbm9Bc3NlcnQpIHtcbiAgX3dyaXRlRG91YmxlKHRoaXMsIHZhbHVlLCBvZmZzZXQsIGZhbHNlLCBub0Fzc2VydClcbn1cblxuLy8gZmlsbCh2YWx1ZSwgc3RhcnQ9MCwgZW5kPWJ1ZmZlci5sZW5ndGgpXG5CdWZmZXIucHJvdG90eXBlLmZpbGwgPSBmdW5jdGlvbiAodmFsdWUsIHN0YXJ0LCBlbmQpIHtcbiAgaWYgKCF2YWx1ZSkgdmFsdWUgPSAwXG4gIGlmICghc3RhcnQpIHN0YXJ0ID0gMFxuICBpZiAoIWVuZCkgZW5kID0gdGhpcy5sZW5ndGhcblxuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHZhbHVlID0gdmFsdWUuY2hhckNvZGVBdCgwKVxuICB9XG5cbiAgYXNzZXJ0KHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgIWlzTmFOKHZhbHVlKSwgJ3ZhbHVlIGlzIG5vdCBhIG51bWJlcicpXG4gIGFzc2VydChlbmQgPj0gc3RhcnQsICdlbmQgPCBzdGFydCcpXG5cbiAgLy8gRmlsbCAwIGJ5dGVzOyB3ZSdyZSBkb25lXG4gIGlmIChlbmQgPT09IHN0YXJ0KSByZXR1cm5cbiAgaWYgKHRoaXMubGVuZ3RoID09PSAwKSByZXR1cm5cblxuICBhc3NlcnQoc3RhcnQgPj0gMCAmJiBzdGFydCA8IHRoaXMubGVuZ3RoLCAnc3RhcnQgb3V0IG9mIGJvdW5kcycpXG4gIGFzc2VydChlbmQgPj0gMCAmJiBlbmQgPD0gdGhpcy5sZW5ndGgsICdlbmQgb3V0IG9mIGJvdW5kcycpXG5cbiAgZm9yICh2YXIgaSA9IHN0YXJ0OyBpIDwgZW5kOyBpKyspIHtcbiAgICB0aGlzW2ldID0gdmFsdWVcbiAgfVxufVxuXG5CdWZmZXIucHJvdG90eXBlLmluc3BlY3QgPSBmdW5jdGlvbiAoKSB7XG4gIHZhciBvdXQgPSBbXVxuICB2YXIgbGVuID0gdGhpcy5sZW5ndGhcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIG91dFtpXSA9IHRvSGV4KHRoaXNbaV0pXG4gICAgaWYgKGkgPT09IGV4cG9ydHMuSU5TUEVDVF9NQVhfQllURVMpIHtcbiAgICAgIG91dFtpICsgMV0gPSAnLi4uJ1xuICAgICAgYnJlYWtcbiAgICB9XG4gIH1cbiAgcmV0dXJuICc8QnVmZmVyICcgKyBvdXQuam9pbignICcpICsgJz4nXG59XG5cbi8qKlxuICogQ3JlYXRlcyBhIG5ldyBgQXJyYXlCdWZmZXJgIHdpdGggdGhlICpjb3BpZWQqIG1lbW9yeSBvZiB0aGUgYnVmZmVyIGluc3RhbmNlLlxuICogQWRkZWQgaW4gTm9kZSAwLjEyLiBPbmx5IGF2YWlsYWJsZSBpbiBicm93c2VycyB0aGF0IHN1cHBvcnQgQXJyYXlCdWZmZXIuXG4gKi9cbkJ1ZmZlci5wcm90b3R5cGUudG9BcnJheUJ1ZmZlciA9IGZ1bmN0aW9uICgpIHtcbiAgaWYgKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJykge1xuICAgIGlmIChCdWZmZXIuX3VzZVR5cGVkQXJyYXlzKSB7XG4gICAgICByZXR1cm4gKG5ldyBCdWZmZXIodGhpcykpLmJ1ZmZlclxuICAgIH0gZWxzZSB7XG4gICAgICB2YXIgYnVmID0gbmV3IFVpbnQ4QXJyYXkodGhpcy5sZW5ndGgpXG4gICAgICBmb3IgKHZhciBpID0gMCwgbGVuID0gYnVmLmxlbmd0aDsgaSA8IGxlbjsgaSArPSAxKVxuICAgICAgICBidWZbaV0gPSB0aGlzW2ldXG4gICAgICByZXR1cm4gYnVmLmJ1ZmZlclxuICAgIH1cbiAgfSBlbHNlIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0J1ZmZlci50b0FycmF5QnVmZmVyIG5vdCBzdXBwb3J0ZWQgaW4gdGhpcyBicm93c2VyJylcbiAgfVxufVxuXG4vLyBIRUxQRVIgRlVOQ1RJT05TXG4vLyA9PT09PT09PT09PT09PT09XG5cbmZ1bmN0aW9uIHN0cmluZ3RyaW0gKHN0cikge1xuICBpZiAoc3RyLnRyaW0pIHJldHVybiBzdHIudHJpbSgpXG4gIHJldHVybiBzdHIucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG59XG5cbnZhciBCUCA9IEJ1ZmZlci5wcm90b3R5cGVcblxuLyoqXG4gKiBBdWdtZW50IGEgVWludDhBcnJheSAqaW5zdGFuY2UqIChub3QgdGhlIFVpbnQ4QXJyYXkgY2xhc3MhKSB3aXRoIEJ1ZmZlciBtZXRob2RzXG4gKi9cbkJ1ZmZlci5fYXVnbWVudCA9IGZ1bmN0aW9uIChhcnIpIHtcbiAgYXJyLl9pc0J1ZmZlciA9IHRydWVcblxuICAvLyBzYXZlIHJlZmVyZW5jZSB0byBvcmlnaW5hbCBVaW50OEFycmF5IGdldC9zZXQgbWV0aG9kcyBiZWZvcmUgb3ZlcndyaXRpbmdcbiAgYXJyLl9nZXQgPSBhcnIuZ2V0XG4gIGFyci5fc2V0ID0gYXJyLnNldFxuXG4gIC8vIGRlcHJlY2F0ZWQsIHdpbGwgYmUgcmVtb3ZlZCBpbiBub2RlIDAuMTMrXG4gIGFyci5nZXQgPSBCUC5nZXRcbiAgYXJyLnNldCA9IEJQLnNldFxuXG4gIGFyci53cml0ZSA9IEJQLndyaXRlXG4gIGFyci50b1N0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0xvY2FsZVN0cmluZyA9IEJQLnRvU3RyaW5nXG4gIGFyci50b0pTT04gPSBCUC50b0pTT05cbiAgYXJyLmNvcHkgPSBCUC5jb3B5XG4gIGFyci5zbGljZSA9IEJQLnNsaWNlXG4gIGFyci5yZWFkVUludDggPSBCUC5yZWFkVUludDhcbiAgYXJyLnJlYWRVSW50MTZMRSA9IEJQLnJlYWRVSW50MTZMRVxuICBhcnIucmVhZFVJbnQxNkJFID0gQlAucmVhZFVJbnQxNkJFXG4gIGFyci5yZWFkVUludDMyTEUgPSBCUC5yZWFkVUludDMyTEVcbiAgYXJyLnJlYWRVSW50MzJCRSA9IEJQLnJlYWRVSW50MzJCRVxuICBhcnIucmVhZEludDggPSBCUC5yZWFkSW50OFxuICBhcnIucmVhZEludDE2TEUgPSBCUC5yZWFkSW50MTZMRVxuICBhcnIucmVhZEludDE2QkUgPSBCUC5yZWFkSW50MTZCRVxuICBhcnIucmVhZEludDMyTEUgPSBCUC5yZWFkSW50MzJMRVxuICBhcnIucmVhZEludDMyQkUgPSBCUC5yZWFkSW50MzJCRVxuICBhcnIucmVhZEZsb2F0TEUgPSBCUC5yZWFkRmxvYXRMRVxuICBhcnIucmVhZEZsb2F0QkUgPSBCUC5yZWFkRmxvYXRCRVxuICBhcnIucmVhZERvdWJsZUxFID0gQlAucmVhZERvdWJsZUxFXG4gIGFyci5yZWFkRG91YmxlQkUgPSBCUC5yZWFkRG91YmxlQkVcbiAgYXJyLndyaXRlVUludDggPSBCUC53cml0ZVVJbnQ4XG4gIGFyci53cml0ZVVJbnQxNkxFID0gQlAud3JpdGVVSW50MTZMRVxuICBhcnIud3JpdGVVSW50MTZCRSA9IEJQLndyaXRlVUludDE2QkVcbiAgYXJyLndyaXRlVUludDMyTEUgPSBCUC53cml0ZVVJbnQzMkxFXG4gIGFyci53cml0ZVVJbnQzMkJFID0gQlAud3JpdGVVSW50MzJCRVxuICBhcnIud3JpdGVJbnQ4ID0gQlAud3JpdGVJbnQ4XG4gIGFyci53cml0ZUludDE2TEUgPSBCUC53cml0ZUludDE2TEVcbiAgYXJyLndyaXRlSW50MTZCRSA9IEJQLndyaXRlSW50MTZCRVxuICBhcnIud3JpdGVJbnQzMkxFID0gQlAud3JpdGVJbnQzMkxFXG4gIGFyci53cml0ZUludDMyQkUgPSBCUC53cml0ZUludDMyQkVcbiAgYXJyLndyaXRlRmxvYXRMRSA9IEJQLndyaXRlRmxvYXRMRVxuICBhcnIud3JpdGVGbG9hdEJFID0gQlAud3JpdGVGbG9hdEJFXG4gIGFyci53cml0ZURvdWJsZUxFID0gQlAud3JpdGVEb3VibGVMRVxuICBhcnIud3JpdGVEb3VibGVCRSA9IEJQLndyaXRlRG91YmxlQkVcbiAgYXJyLmZpbGwgPSBCUC5maWxsXG4gIGFyci5pbnNwZWN0ID0gQlAuaW5zcGVjdFxuICBhcnIudG9BcnJheUJ1ZmZlciA9IEJQLnRvQXJyYXlCdWZmZXJcblxuICByZXR1cm4gYXJyXG59XG5cbi8vIHNsaWNlKHN0YXJ0LCBlbmQpXG5mdW5jdGlvbiBjbGFtcCAoaW5kZXgsIGxlbiwgZGVmYXVsdFZhbHVlKSB7XG4gIGlmICh0eXBlb2YgaW5kZXggIT09ICdudW1iZXInKSByZXR1cm4gZGVmYXVsdFZhbHVlXG4gIGluZGV4ID0gfn5pbmRleDsgIC8vIENvZXJjZSB0byBpbnRlZ2VyLlxuICBpZiAoaW5kZXggPj0gbGVuKSByZXR1cm4gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgaW5kZXggKz0gbGVuXG4gIGlmIChpbmRleCA+PSAwKSByZXR1cm4gaW5kZXhcbiAgcmV0dXJuIDBcbn1cblxuZnVuY3Rpb24gY29lcmNlIChsZW5ndGgpIHtcbiAgLy8gQ29lcmNlIGxlbmd0aCB0byBhIG51bWJlciAocG9zc2libHkgTmFOKSwgcm91bmQgdXBcbiAgLy8gaW4gY2FzZSBpdCdzIGZyYWN0aW9uYWwgKGUuZy4gMTIzLjQ1NikgdGhlbiBkbyBhXG4gIC8vIGRvdWJsZSBuZWdhdGUgdG8gY29lcmNlIGEgTmFOIHRvIDAuIEVhc3ksIHJpZ2h0P1xuICBsZW5ndGggPSB+fk1hdGguY2VpbCgrbGVuZ3RoKVxuICByZXR1cm4gbGVuZ3RoIDwgMCA/IDAgOiBsZW5ndGhcbn1cblxuZnVuY3Rpb24gaXNBcnJheSAoc3ViamVjdCkge1xuICByZXR1cm4gKEFycmF5LmlzQXJyYXkgfHwgZnVuY3Rpb24gKHN1YmplY3QpIHtcbiAgICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHN1YmplY3QpID09PSAnW29iamVjdCBBcnJheV0nXG4gIH0pKHN1YmplY3QpXG59XG5cbmZ1bmN0aW9uIGlzQXJyYXlpc2ggKHN1YmplY3QpIHtcbiAgcmV0dXJuIGlzQXJyYXkoc3ViamVjdCkgfHwgQnVmZmVyLmlzQnVmZmVyKHN1YmplY3QpIHx8XG4gICAgICBzdWJqZWN0ICYmIHR5cGVvZiBzdWJqZWN0ID09PSAnb2JqZWN0JyAmJlxuICAgICAgdHlwZW9mIHN1YmplY3QubGVuZ3RoID09PSAnbnVtYmVyJ1xufVxuXG5mdW5jdGlvbiB0b0hleCAobikge1xuICBpZiAobiA8IDE2KSByZXR1cm4gJzAnICsgbi50b1N0cmluZygxNilcbiAgcmV0dXJuIG4udG9TdHJpbmcoMTYpXG59XG5cbmZ1bmN0aW9uIHV0ZjhUb0J5dGVzIChzdHIpIHtcbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgdmFyIGIgPSBzdHIuY2hhckNvZGVBdChpKVxuICAgIGlmIChiIDw9IDB4N0YpXG4gICAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSlcbiAgICBlbHNlIHtcbiAgICAgIHZhciBzdGFydCA9IGlcbiAgICAgIGlmIChiID49IDB4RDgwMCAmJiBiIDw9IDB4REZGRikgaSsrXG4gICAgICB2YXIgaCA9IGVuY29kZVVSSUNvbXBvbmVudChzdHIuc2xpY2Uoc3RhcnQsIGkrMSkpLnN1YnN0cigxKS5zcGxpdCgnJScpXG4gICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGgubGVuZ3RoOyBqKyspXG4gICAgICAgIGJ5dGVBcnJheS5wdXNoKHBhcnNlSW50KGhbal0sIDE2KSlcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiBhc2NpaVRvQnl0ZXMgKHN0cikge1xuICB2YXIgYnl0ZUFycmF5ID0gW11cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBzdHIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyBOb2RlJ3MgY29kZSBzZWVtcyB0byBiZSBkb2luZyB0aGlzIGFuZCBub3QgJiAweDdGLi5cbiAgICBieXRlQXJyYXkucHVzaChzdHIuY2hhckNvZGVBdChpKSAmIDB4RkYpXG4gIH1cbiAgcmV0dXJuIGJ5dGVBcnJheVxufVxuXG5mdW5jdGlvbiB1dGYxNmxlVG9CeXRlcyAoc3RyKSB7XG4gIHZhciBjLCBoaSwgbG9cbiAgdmFyIGJ5dGVBcnJheSA9IFtdXG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc3RyLmxlbmd0aDsgaSsrKSB7XG4gICAgYyA9IHN0ci5jaGFyQ29kZUF0KGkpXG4gICAgaGkgPSBjID4+IDhcbiAgICBsbyA9IGMgJSAyNTZcbiAgICBieXRlQXJyYXkucHVzaChsbylcbiAgICBieXRlQXJyYXkucHVzaChoaSlcbiAgfVxuXG4gIHJldHVybiBieXRlQXJyYXlcbn1cblxuZnVuY3Rpb24gYmFzZTY0VG9CeXRlcyAoc3RyKSB7XG4gIHJldHVybiBiYXNlNjQudG9CeXRlQXJyYXkoc3RyKVxufVxuXG5mdW5jdGlvbiBibGl0QnVmZmVyIChzcmMsIGRzdCwgb2Zmc2V0LCBsZW5ndGgpIHtcbiAgdmFyIHBvc1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKChpICsgb2Zmc2V0ID49IGRzdC5sZW5ndGgpIHx8IChpID49IHNyYy5sZW5ndGgpKVxuICAgICAgYnJlYWtcbiAgICBkc3RbaSArIG9mZnNldF0gPSBzcmNbaV1cbiAgfVxuICByZXR1cm4gaVxufVxuXG5mdW5jdGlvbiBkZWNvZGVVdGY4Q2hhciAoc3RyKSB7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGRlY29kZVVSSUNvbXBvbmVudChzdHIpXG4gIH0gY2F0Y2ggKGVycikge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNoYXJDb2RlKDB4RkZGRCkgLy8gVVRGIDggaW52YWxpZCBjaGFyXG4gIH1cbn1cblxuLypcbiAqIFdlIGhhdmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIHZhbHVlIGlzIGEgdmFsaWQgaW50ZWdlci4gVGhpcyBtZWFucyB0aGF0IGl0XG4gKiBpcyBub24tbmVnYXRpdmUuIEl0IGhhcyBubyBmcmFjdGlvbmFsIGNvbXBvbmVudCBhbmQgdGhhdCBpdCBkb2VzIG5vdFxuICogZXhjZWVkIHRoZSBtYXhpbXVtIGFsbG93ZWQgdmFsdWUuXG4gKi9cbmZ1bmN0aW9uIHZlcmlmdWludCAodmFsdWUsIG1heCkge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPj0gMCwgJ3NwZWNpZmllZCBhIG5lZ2F0aXZlIHZhbHVlIGZvciB3cml0aW5nIGFuIHVuc2lnbmVkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlIDw9IG1heCwgJ3ZhbHVlIGlzIGxhcmdlciB0aGFuIG1heGltdW0gdmFsdWUgZm9yIHR5cGUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZnNpbnQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxuICBhc3NlcnQoTWF0aC5mbG9vcih2YWx1ZSkgPT09IHZhbHVlLCAndmFsdWUgaGFzIGEgZnJhY3Rpb25hbCBjb21wb25lbnQnKVxufVxuXG5mdW5jdGlvbiB2ZXJpZklFRUU3NTQgKHZhbHVlLCBtYXgsIG1pbikge1xuICBhc3NlcnQodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJywgJ2Nhbm5vdCB3cml0ZSBhIG5vbi1udW1iZXIgYXMgYSBudW1iZXInKVxuICBhc3NlcnQodmFsdWUgPD0gbWF4LCAndmFsdWUgbGFyZ2VyIHRoYW4gbWF4aW11bSBhbGxvd2VkIHZhbHVlJylcbiAgYXNzZXJ0KHZhbHVlID49IG1pbiwgJ3ZhbHVlIHNtYWxsZXIgdGhhbiBtaW5pbXVtIGFsbG93ZWQgdmFsdWUnKVxufVxuXG5mdW5jdGlvbiBhc3NlcnQgKHRlc3QsIG1lc3NhZ2UpIHtcbiAgaWYgKCF0ZXN0KSB0aHJvdyBuZXcgRXJyb3IobWVzc2FnZSB8fCAnRmFpbGVkIGFzc2VydGlvbicpXG59XG4iLCJ2YXIgbG9va3VwID0gJ0FCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky8nO1xuXG47KGZ1bmN0aW9uIChleHBvcnRzKSB7XG5cdCd1c2Ugc3RyaWN0JztcblxuICB2YXIgQXJyID0gKHR5cGVvZiBVaW50OEFycmF5ICE9PSAndW5kZWZpbmVkJylcbiAgICA/IFVpbnQ4QXJyYXlcbiAgICA6IEFycmF5XG5cblx0dmFyIFBMVVMgICA9ICcrJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSCAgPSAnLycuY2hhckNvZGVBdCgwKVxuXHR2YXIgTlVNQkVSID0gJzAnLmNoYXJDb2RlQXQoMClcblx0dmFyIExPV0VSICA9ICdhJy5jaGFyQ29kZUF0KDApXG5cdHZhciBVUFBFUiAgPSAnQScuY2hhckNvZGVBdCgwKVxuXHR2YXIgUExVU19VUkxfU0FGRSA9ICctJy5jaGFyQ29kZUF0KDApXG5cdHZhciBTTEFTSF9VUkxfU0FGRSA9ICdfJy5jaGFyQ29kZUF0KDApXG5cblx0ZnVuY3Rpb24gZGVjb2RlIChlbHQpIHtcblx0XHR2YXIgY29kZSA9IGVsdC5jaGFyQ29kZUF0KDApXG5cdFx0aWYgKGNvZGUgPT09IFBMVVMgfHxcblx0XHQgICAgY29kZSA9PT0gUExVU19VUkxfU0FGRSlcblx0XHRcdHJldHVybiA2MiAvLyAnKydcblx0XHRpZiAoY29kZSA9PT0gU0xBU0ggfHxcblx0XHQgICAgY29kZSA9PT0gU0xBU0hfVVJMX1NBRkUpXG5cdFx0XHRyZXR1cm4gNjMgLy8gJy8nXG5cdFx0aWYgKGNvZGUgPCBOVU1CRVIpXG5cdFx0XHRyZXR1cm4gLTEgLy9ubyBtYXRjaFxuXHRcdGlmIChjb2RlIDwgTlVNQkVSICsgMTApXG5cdFx0XHRyZXR1cm4gY29kZSAtIE5VTUJFUiArIDI2ICsgMjZcblx0XHRpZiAoY29kZSA8IFVQUEVSICsgMjYpXG5cdFx0XHRyZXR1cm4gY29kZSAtIFVQUEVSXG5cdFx0aWYgKGNvZGUgPCBMT1dFUiArIDI2KVxuXHRcdFx0cmV0dXJuIGNvZGUgLSBMT1dFUiArIDI2XG5cdH1cblxuXHRmdW5jdGlvbiBiNjRUb0J5dGVBcnJheSAoYjY0KSB7XG5cdFx0dmFyIGksIGosIGwsIHRtcCwgcGxhY2VIb2xkZXJzLCBhcnJcblxuXHRcdGlmIChiNjQubGVuZ3RoICUgNCA+IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzdHJpbmcuIExlbmd0aCBtdXN0IGJlIGEgbXVsdGlwbGUgb2YgNCcpXG5cdFx0fVxuXG5cdFx0Ly8gdGhlIG51bWJlciBvZiBlcXVhbCBzaWducyAocGxhY2UgaG9sZGVycylcblx0XHQvLyBpZiB0aGVyZSBhcmUgdHdvIHBsYWNlaG9sZGVycywgdGhhbiB0aGUgdHdvIGNoYXJhY3RlcnMgYmVmb3JlIGl0XG5cdFx0Ly8gcmVwcmVzZW50IG9uZSBieXRlXG5cdFx0Ly8gaWYgdGhlcmUgaXMgb25seSBvbmUsIHRoZW4gdGhlIHRocmVlIGNoYXJhY3RlcnMgYmVmb3JlIGl0IHJlcHJlc2VudCAyIGJ5dGVzXG5cdFx0Ly8gdGhpcyBpcyBqdXN0IGEgY2hlYXAgaGFjayB0byBub3QgZG8gaW5kZXhPZiB0d2ljZVxuXHRcdHZhciBsZW4gPSBiNjQubGVuZ3RoXG5cdFx0cGxhY2VIb2xkZXJzID0gJz0nID09PSBiNjQuY2hhckF0KGxlbiAtIDIpID8gMiA6ICc9JyA9PT0gYjY0LmNoYXJBdChsZW4gLSAxKSA/IDEgOiAwXG5cblx0XHQvLyBiYXNlNjQgaXMgNC8zICsgdXAgdG8gdHdvIGNoYXJhY3RlcnMgb2YgdGhlIG9yaWdpbmFsIGRhdGFcblx0XHRhcnIgPSBuZXcgQXJyKGI2NC5sZW5ndGggKiAzIC8gNCAtIHBsYWNlSG9sZGVycylcblxuXHRcdC8vIGlmIHRoZXJlIGFyZSBwbGFjZWhvbGRlcnMsIG9ubHkgZ2V0IHVwIHRvIHRoZSBsYXN0IGNvbXBsZXRlIDQgY2hhcnNcblx0XHRsID0gcGxhY2VIb2xkZXJzID4gMCA/IGI2NC5sZW5ndGggLSA0IDogYjY0Lmxlbmd0aFxuXG5cdFx0dmFyIEwgPSAwXG5cblx0XHRmdW5jdGlvbiBwdXNoICh2KSB7XG5cdFx0XHRhcnJbTCsrXSA9IHZcblx0XHR9XG5cblx0XHRmb3IgKGkgPSAwLCBqID0gMDsgaSA8IGw7IGkgKz0gNCwgaiArPSAzKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDE4KSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDEyKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMikpIDw8IDYpIHwgZGVjb2RlKGI2NC5jaGFyQXQoaSArIDMpKVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwMDApID4+IDE2KVxuXHRcdFx0cHVzaCgodG1wICYgMHhGRjAwKSA+PiA4KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH1cblxuXHRcdGlmIChwbGFjZUhvbGRlcnMgPT09IDIpIHtcblx0XHRcdHRtcCA9IChkZWNvZGUoYjY0LmNoYXJBdChpKSkgPDwgMikgfCAoZGVjb2RlKGI2NC5jaGFyQXQoaSArIDEpKSA+PiA0KVxuXHRcdFx0cHVzaCh0bXAgJiAweEZGKVxuXHRcdH0gZWxzZSBpZiAocGxhY2VIb2xkZXJzID09PSAxKSB7XG5cdFx0XHR0bXAgPSAoZGVjb2RlKGI2NC5jaGFyQXQoaSkpIDw8IDEwKSB8IChkZWNvZGUoYjY0LmNoYXJBdChpICsgMSkpIDw8IDQpIHwgKGRlY29kZShiNjQuY2hhckF0KGkgKyAyKSkgPj4gMilcblx0XHRcdHB1c2goKHRtcCA+PiA4KSAmIDB4RkYpXG5cdFx0XHRwdXNoKHRtcCAmIDB4RkYpXG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFyclxuXHR9XG5cblx0ZnVuY3Rpb24gdWludDhUb0Jhc2U2NCAodWludDgpIHtcblx0XHR2YXIgaSxcblx0XHRcdGV4dHJhQnl0ZXMgPSB1aW50OC5sZW5ndGggJSAzLCAvLyBpZiB3ZSBoYXZlIDEgYnl0ZSBsZWZ0LCBwYWQgMiBieXRlc1xuXHRcdFx0b3V0cHV0ID0gXCJcIixcblx0XHRcdHRlbXAsIGxlbmd0aFxuXG5cdFx0ZnVuY3Rpb24gZW5jb2RlIChudW0pIHtcblx0XHRcdHJldHVybiBsb29rdXAuY2hhckF0KG51bSlcblx0XHR9XG5cblx0XHRmdW5jdGlvbiB0cmlwbGV0VG9CYXNlNjQgKG51bSkge1xuXHRcdFx0cmV0dXJuIGVuY29kZShudW0gPj4gMTggJiAweDNGKSArIGVuY29kZShudW0gPj4gMTIgJiAweDNGKSArIGVuY29kZShudW0gPj4gNiAmIDB4M0YpICsgZW5jb2RlKG51bSAmIDB4M0YpXG5cdFx0fVxuXG5cdFx0Ly8gZ28gdGhyb3VnaCB0aGUgYXJyYXkgZXZlcnkgdGhyZWUgYnl0ZXMsIHdlJ2xsIGRlYWwgd2l0aCB0cmFpbGluZyBzdHVmZiBsYXRlclxuXHRcdGZvciAoaSA9IDAsIGxlbmd0aCA9IHVpbnQ4Lmxlbmd0aCAtIGV4dHJhQnl0ZXM7IGkgPCBsZW5ndGg7IGkgKz0gMykge1xuXHRcdFx0dGVtcCA9ICh1aW50OFtpXSA8PCAxNikgKyAodWludDhbaSArIDFdIDw8IDgpICsgKHVpbnQ4W2kgKyAyXSlcblx0XHRcdG91dHB1dCArPSB0cmlwbGV0VG9CYXNlNjQodGVtcClcblx0XHR9XG5cblx0XHQvLyBwYWQgdGhlIGVuZCB3aXRoIHplcm9zLCBidXQgbWFrZSBzdXJlIHRvIG5vdCBmb3JnZXQgdGhlIGV4dHJhIGJ5dGVzXG5cdFx0c3dpdGNoIChleHRyYUJ5dGVzKSB7XG5cdFx0XHRjYXNlIDE6XG5cdFx0XHRcdHRlbXAgPSB1aW50OFt1aW50OC5sZW5ndGggLSAxXVxuXHRcdFx0XHRvdXRwdXQgKz0gZW5jb2RlKHRlbXAgPj4gMilcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA8PCA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSAnPT0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0XHRjYXNlIDI6XG5cdFx0XHRcdHRlbXAgPSAodWludDhbdWludDgubGVuZ3RoIC0gMl0gPDwgOCkgKyAodWludDhbdWludDgubGVuZ3RoIC0gMV0pXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUodGVtcCA+PiAxMClcblx0XHRcdFx0b3V0cHV0ICs9IGVuY29kZSgodGVtcCA+PiA0KSAmIDB4M0YpXG5cdFx0XHRcdG91dHB1dCArPSBlbmNvZGUoKHRlbXAgPDwgMikgJiAweDNGKVxuXHRcdFx0XHRvdXRwdXQgKz0gJz0nXG5cdFx0XHRcdGJyZWFrXG5cdFx0fVxuXG5cdFx0cmV0dXJuIG91dHB1dFxuXHR9XG5cblx0ZXhwb3J0cy50b0J5dGVBcnJheSA9IGI2NFRvQnl0ZUFycmF5XG5cdGV4cG9ydHMuZnJvbUJ5dGVBcnJheSA9IHVpbnQ4VG9CYXNlNjRcbn0odHlwZW9mIGV4cG9ydHMgPT09ICd1bmRlZmluZWQnID8gKHRoaXMuYmFzZTY0anMgPSB7fSkgOiBleHBvcnRzKSlcbiIsImV4cG9ydHMucmVhZCA9IGZ1bmN0aW9uKGJ1ZmZlciwgb2Zmc2V0LCBpc0xFLCBtTGVuLCBuQnl0ZXMpIHtcbiAgdmFyIGUsIG0sXG4gICAgICBlTGVuID0gbkJ5dGVzICogOCAtIG1MZW4gLSAxLFxuICAgICAgZU1heCA9ICgxIDw8IGVMZW4pIC0gMSxcbiAgICAgIGVCaWFzID0gZU1heCA+PiAxLFxuICAgICAgbkJpdHMgPSAtNyxcbiAgICAgIGkgPSBpc0xFID8gKG5CeXRlcyAtIDEpIDogMCxcbiAgICAgIGQgPSBpc0xFID8gLTEgOiAxLFxuICAgICAgcyA9IGJ1ZmZlcltvZmZzZXQgKyBpXTtcblxuICBpICs9IGQ7XG5cbiAgZSA9IHMgJiAoKDEgPDwgKC1uQml0cykpIC0gMSk7XG4gIHMgPj49ICgtbkJpdHMpO1xuICBuQml0cyArPSBlTGVuO1xuICBmb3IgKDsgbkJpdHMgPiAwOyBlID0gZSAqIDI1NiArIGJ1ZmZlcltvZmZzZXQgKyBpXSwgaSArPSBkLCBuQml0cyAtPSA4KTtcblxuICBtID0gZSAmICgoMSA8PCAoLW5CaXRzKSkgLSAxKTtcbiAgZSA+Pj0gKC1uQml0cyk7XG4gIG5CaXRzICs9IG1MZW47XG4gIGZvciAoOyBuQml0cyA+IDA7IG0gPSBtICogMjU2ICsgYnVmZmVyW29mZnNldCArIGldLCBpICs9IGQsIG5CaXRzIC09IDgpO1xuXG4gIGlmIChlID09PSAwKSB7XG4gICAgZSA9IDEgLSBlQmlhcztcbiAgfSBlbHNlIGlmIChlID09PSBlTWF4KSB7XG4gICAgcmV0dXJuIG0gPyBOYU4gOiAoKHMgPyAtMSA6IDEpICogSW5maW5pdHkpO1xuICB9IGVsc2Uge1xuICAgIG0gPSBtICsgTWF0aC5wb3coMiwgbUxlbik7XG4gICAgZSA9IGUgLSBlQmlhcztcbiAgfVxuICByZXR1cm4gKHMgPyAtMSA6IDEpICogbSAqIE1hdGgucG93KDIsIGUgLSBtTGVuKTtcbn07XG5cbmV4cG9ydHMud3JpdGUgPSBmdW5jdGlvbihidWZmZXIsIHZhbHVlLCBvZmZzZXQsIGlzTEUsIG1MZW4sIG5CeXRlcykge1xuICB2YXIgZSwgbSwgYyxcbiAgICAgIGVMZW4gPSBuQnl0ZXMgKiA4IC0gbUxlbiAtIDEsXG4gICAgICBlTWF4ID0gKDEgPDwgZUxlbikgLSAxLFxuICAgICAgZUJpYXMgPSBlTWF4ID4+IDEsXG4gICAgICBydCA9IChtTGVuID09PSAyMyA/IE1hdGgucG93KDIsIC0yNCkgLSBNYXRoLnBvdygyLCAtNzcpIDogMCksXG4gICAgICBpID0gaXNMRSA/IDAgOiAobkJ5dGVzIC0gMSksXG4gICAgICBkID0gaXNMRSA/IDEgOiAtMSxcbiAgICAgIHMgPSB2YWx1ZSA8IDAgfHwgKHZhbHVlID09PSAwICYmIDEgLyB2YWx1ZSA8IDApID8gMSA6IDA7XG5cbiAgdmFsdWUgPSBNYXRoLmFicyh2YWx1ZSk7XG5cbiAgaWYgKGlzTmFOKHZhbHVlKSB8fCB2YWx1ZSA9PT0gSW5maW5pdHkpIHtcbiAgICBtID0gaXNOYU4odmFsdWUpID8gMSA6IDA7XG4gICAgZSA9IGVNYXg7XG4gIH0gZWxzZSB7XG4gICAgZSA9IE1hdGguZmxvb3IoTWF0aC5sb2codmFsdWUpIC8gTWF0aC5MTjIpO1xuICAgIGlmICh2YWx1ZSAqIChjID0gTWF0aC5wb3coMiwgLWUpKSA8IDEpIHtcbiAgICAgIGUtLTtcbiAgICAgIGMgKj0gMjtcbiAgICB9XG4gICAgaWYgKGUgKyBlQmlhcyA+PSAxKSB7XG4gICAgICB2YWx1ZSArPSBydCAvIGM7XG4gICAgfSBlbHNlIHtcbiAgICAgIHZhbHVlICs9IHJ0ICogTWF0aC5wb3coMiwgMSAtIGVCaWFzKTtcbiAgICB9XG4gICAgaWYgKHZhbHVlICogYyA+PSAyKSB7XG4gICAgICBlKys7XG4gICAgICBjIC89IDI7XG4gICAgfVxuXG4gICAgaWYgKGUgKyBlQmlhcyA+PSBlTWF4KSB7XG4gICAgICBtID0gMDtcbiAgICAgIGUgPSBlTWF4O1xuICAgIH0gZWxzZSBpZiAoZSArIGVCaWFzID49IDEpIHtcbiAgICAgIG0gPSAodmFsdWUgKiBjIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSBlICsgZUJpYXM7XG4gICAgfSBlbHNlIHtcbiAgICAgIG0gPSB2YWx1ZSAqIE1hdGgucG93KDIsIGVCaWFzIC0gMSkgKiBNYXRoLnBvdygyLCBtTGVuKTtcbiAgICAgIGUgPSAwO1xuICAgIH1cbiAgfVxuXG4gIGZvciAoOyBtTGVuID49IDg7IGJ1ZmZlcltvZmZzZXQgKyBpXSA9IG0gJiAweGZmLCBpICs9IGQsIG0gLz0gMjU2LCBtTGVuIC09IDgpO1xuXG4gIGUgPSAoZSA8PCBtTGVuKSB8IG07XG4gIGVMZW4gKz0gbUxlbjtcbiAgZm9yICg7IGVMZW4gPiAwOyBidWZmZXJbb2Zmc2V0ICsgaV0gPSBlICYgMHhmZiwgaSArPSBkLCBlIC89IDI1NiwgZUxlbiAtPSA4KTtcblxuICBidWZmZXJbb2Zmc2V0ICsgaSAtIGRdIHw9IHMgKiAxMjg7XG59O1xuIiwidmFyIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlcjtcbnZhciBpbnRTaXplID0gNDtcbnZhciB6ZXJvQnVmZmVyID0gbmV3IEJ1ZmZlcihpbnRTaXplKTsgemVyb0J1ZmZlci5maWxsKDApO1xudmFyIGNocnN6ID0gODtcblxuZnVuY3Rpb24gdG9BcnJheShidWYsIGJpZ0VuZGlhbikge1xuICBpZiAoKGJ1Zi5sZW5ndGggJSBpbnRTaXplKSAhPT0gMCkge1xuICAgIHZhciBsZW4gPSBidWYubGVuZ3RoICsgKGludFNpemUgLSAoYnVmLmxlbmd0aCAlIGludFNpemUpKTtcbiAgICBidWYgPSBCdWZmZXIuY29uY2F0KFtidWYsIHplcm9CdWZmZXJdLCBsZW4pO1xuICB9XG5cbiAgdmFyIGFyciA9IFtdO1xuICB2YXIgZm4gPSBiaWdFbmRpYW4gPyBidWYucmVhZEludDMyQkUgOiBidWYucmVhZEludDMyTEU7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYnVmLmxlbmd0aDsgaSArPSBpbnRTaXplKSB7XG4gICAgYXJyLnB1c2goZm4uY2FsbChidWYsIGkpKTtcbiAgfVxuICByZXR1cm4gYXJyO1xufVxuXG5mdW5jdGlvbiB0b0J1ZmZlcihhcnIsIHNpemUsIGJpZ0VuZGlhbikge1xuICB2YXIgYnVmID0gbmV3IEJ1ZmZlcihzaXplKTtcbiAgdmFyIGZuID0gYmlnRW5kaWFuID8gYnVmLndyaXRlSW50MzJCRSA6IGJ1Zi53cml0ZUludDMyTEU7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgZm4uY2FsbChidWYsIGFycltpXSwgaSAqIDQsIHRydWUpO1xuICB9XG4gIHJldHVybiBidWY7XG59XG5cbmZ1bmN0aW9uIGhhc2goYnVmLCBmbiwgaGFzaFNpemUsIGJpZ0VuZGlhbikge1xuICBpZiAoIUJ1ZmZlci5pc0J1ZmZlcihidWYpKSBidWYgPSBuZXcgQnVmZmVyKGJ1Zik7XG4gIHZhciBhcnIgPSBmbih0b0FycmF5KGJ1ZiwgYmlnRW5kaWFuKSwgYnVmLmxlbmd0aCAqIGNocnN6KTtcbiAgcmV0dXJuIHRvQnVmZmVyKGFyciwgaGFzaFNpemUsIGJpZ0VuZGlhbik7XG59XG5cbm1vZHVsZS5leHBvcnRzID0geyBoYXNoOiBoYXNoIH07XG4iLCJ2YXIgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyXG52YXIgc2hhID0gcmVxdWlyZSgnLi9zaGEnKVxudmFyIHNoYTI1NiA9IHJlcXVpcmUoJy4vc2hhMjU2JylcbnZhciBybmcgPSByZXF1aXJlKCcuL3JuZycpXG52YXIgbWQ1ID0gcmVxdWlyZSgnLi9tZDUnKVxuXG52YXIgYWxnb3JpdGhtcyA9IHtcbiAgc2hhMTogc2hhLFxuICBzaGEyNTY6IHNoYTI1NixcbiAgbWQ1OiBtZDVcbn1cblxudmFyIGJsb2Nrc2l6ZSA9IDY0XG52YXIgemVyb0J1ZmZlciA9IG5ldyBCdWZmZXIoYmxvY2tzaXplKTsgemVyb0J1ZmZlci5maWxsKDApXG5mdW5jdGlvbiBobWFjKGZuLCBrZXksIGRhdGEpIHtcbiAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihrZXkpKSBrZXkgPSBuZXcgQnVmZmVyKGtleSlcbiAgaWYoIUJ1ZmZlci5pc0J1ZmZlcihkYXRhKSkgZGF0YSA9IG5ldyBCdWZmZXIoZGF0YSlcblxuICBpZihrZXkubGVuZ3RoID4gYmxvY2tzaXplKSB7XG4gICAga2V5ID0gZm4oa2V5KVxuICB9IGVsc2UgaWYoa2V5Lmxlbmd0aCA8IGJsb2Nrc2l6ZSkge1xuICAgIGtleSA9IEJ1ZmZlci5jb25jYXQoW2tleSwgemVyb0J1ZmZlcl0sIGJsb2Nrc2l6ZSlcbiAgfVxuXG4gIHZhciBpcGFkID0gbmV3IEJ1ZmZlcihibG9ja3NpemUpLCBvcGFkID0gbmV3IEJ1ZmZlcihibG9ja3NpemUpXG4gIGZvcih2YXIgaSA9IDA7IGkgPCBibG9ja3NpemU7IGkrKykge1xuICAgIGlwYWRbaV0gPSBrZXlbaV0gXiAweDM2XG4gICAgb3BhZFtpXSA9IGtleVtpXSBeIDB4NUNcbiAgfVxuXG4gIHZhciBoYXNoID0gZm4oQnVmZmVyLmNvbmNhdChbaXBhZCwgZGF0YV0pKVxuICByZXR1cm4gZm4oQnVmZmVyLmNvbmNhdChbb3BhZCwgaGFzaF0pKVxufVxuXG5mdW5jdGlvbiBoYXNoKGFsZywga2V5KSB7XG4gIGFsZyA9IGFsZyB8fCAnc2hhMSdcbiAgdmFyIGZuID0gYWxnb3JpdGhtc1thbGddXG4gIHZhciBidWZzID0gW11cbiAgdmFyIGxlbmd0aCA9IDBcbiAgaWYoIWZuKSBlcnJvcignYWxnb3JpdGhtOicsIGFsZywgJ2lzIG5vdCB5ZXQgc3VwcG9ydGVkJylcbiAgcmV0dXJuIHtcbiAgICB1cGRhdGU6IGZ1bmN0aW9uIChkYXRhKSB7XG4gICAgICBpZighQnVmZmVyLmlzQnVmZmVyKGRhdGEpKSBkYXRhID0gbmV3IEJ1ZmZlcihkYXRhKVxuICAgICAgICBcbiAgICAgIGJ1ZnMucHVzaChkYXRhKVxuICAgICAgbGVuZ3RoICs9IGRhdGEubGVuZ3RoXG4gICAgICByZXR1cm4gdGhpc1xuICAgIH0sXG4gICAgZGlnZXN0OiBmdW5jdGlvbiAoZW5jKSB7XG4gICAgICB2YXIgYnVmID0gQnVmZmVyLmNvbmNhdChidWZzKVxuICAgICAgdmFyIHIgPSBrZXkgPyBobWFjKGZuLCBrZXksIGJ1ZikgOiBmbihidWYpXG4gICAgICBidWZzID0gbnVsbFxuICAgICAgcmV0dXJuIGVuYyA/IHIudG9TdHJpbmcoZW5jKSA6IHJcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gZXJyb3IgKCkge1xuICB2YXIgbSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzKS5qb2luKCcgJylcbiAgdGhyb3cgbmV3IEVycm9yKFtcbiAgICBtLFxuICAgICd3ZSBhY2NlcHQgcHVsbCByZXF1ZXN0cycsXG4gICAgJ2h0dHA6Ly9naXRodWIuY29tL2RvbWluaWN0YXJyL2NyeXB0by1icm93c2VyaWZ5J1xuICAgIF0uam9pbignXFxuJykpXG59XG5cbmV4cG9ydHMuY3JlYXRlSGFzaCA9IGZ1bmN0aW9uIChhbGcpIHsgcmV0dXJuIGhhc2goYWxnKSB9XG5leHBvcnRzLmNyZWF0ZUhtYWMgPSBmdW5jdGlvbiAoYWxnLCBrZXkpIHsgcmV0dXJuIGhhc2goYWxnLCBrZXkpIH1cbmV4cG9ydHMucmFuZG9tQnl0ZXMgPSBmdW5jdGlvbihzaXplLCBjYWxsYmFjaykge1xuICBpZiAoY2FsbGJhY2sgJiYgY2FsbGJhY2suY2FsbCkge1xuICAgIHRyeSB7XG4gICAgICBjYWxsYmFjay5jYWxsKHRoaXMsIHVuZGVmaW5lZCwgbmV3IEJ1ZmZlcihybmcoc2l6ZSkpKVxuICAgIH0gY2F0Y2ggKGVycikgeyBjYWxsYmFjayhlcnIpIH1cbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gbmV3IEJ1ZmZlcihybmcoc2l6ZSkpXG4gIH1cbn1cblxuZnVuY3Rpb24gZWFjaChhLCBmKSB7XG4gIGZvcih2YXIgaSBpbiBhKVxuICAgIGYoYVtpXSwgaSlcbn1cblxuLy8gdGhlIGxlYXN0IEkgY2FuIGRvIGlzIG1ha2UgZXJyb3IgbWVzc2FnZXMgZm9yIHRoZSByZXN0IG9mIHRoZSBub2RlLmpzL2NyeXB0byBhcGkuXG5lYWNoKFsnY3JlYXRlQ3JlZGVudGlhbHMnXG4sICdjcmVhdGVDaXBoZXInXG4sICdjcmVhdGVDaXBoZXJpdidcbiwgJ2NyZWF0ZURlY2lwaGVyJ1xuLCAnY3JlYXRlRGVjaXBoZXJpdidcbiwgJ2NyZWF0ZVNpZ24nXG4sICdjcmVhdGVWZXJpZnknXG4sICdjcmVhdGVEaWZmaWVIZWxsbWFuJ1xuLCAncGJrZGYyJ10sIGZ1bmN0aW9uIChuYW1lKSB7XG4gIGV4cG9ydHNbbmFtZV0gPSBmdW5jdGlvbiAoKSB7XG4gICAgZXJyb3IoJ3NvcnJ5LCcsIG5hbWUsICdpcyBub3QgaW1wbGVtZW50ZWQgeWV0JylcbiAgfVxufSlcbiIsIi8qXHJcbiAqIEEgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbiBvZiB0aGUgUlNBIERhdGEgU2VjdXJpdHksIEluYy4gTUQ1IE1lc3NhZ2VcclxuICogRGlnZXN0IEFsZ29yaXRobSwgYXMgZGVmaW5lZCBpbiBSRkMgMTMyMS5cclxuICogVmVyc2lvbiAyLjEgQ29weXJpZ2h0IChDKSBQYXVsIEpvaG5zdG9uIDE5OTkgLSAyMDAyLlxyXG4gKiBPdGhlciBjb250cmlidXRvcnM6IEdyZWcgSG9sdCwgQW5kcmV3IEtlcGVydCwgWWRuYXIsIExvc3RpbmV0XHJcbiAqIERpc3RyaWJ1dGVkIHVuZGVyIHRoZSBCU0QgTGljZW5zZVxyXG4gKiBTZWUgaHR0cDovL3BhamhvbWUub3JnLnVrL2NyeXB0L21kNSBmb3IgbW9yZSBpbmZvLlxyXG4gKi9cclxuXHJcbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XHJcblxyXG4vKlxyXG4gKiBQZXJmb3JtIGEgc2ltcGxlIHNlbGYtdGVzdCB0byBzZWUgaWYgdGhlIFZNIGlzIHdvcmtpbmdcclxuICovXHJcbmZ1bmN0aW9uIG1kNV92bV90ZXN0KClcclxue1xyXG4gIHJldHVybiBoZXhfbWQ1KFwiYWJjXCIpID09IFwiOTAwMTUwOTgzY2QyNGZiMGQ2OTYzZjdkMjhlMTdmNzJcIjtcclxufVxyXG5cclxuLypcclxuICogQ2FsY3VsYXRlIHRoZSBNRDUgb2YgYW4gYXJyYXkgb2YgbGl0dGxlLWVuZGlhbiB3b3JkcywgYW5kIGEgYml0IGxlbmd0aFxyXG4gKi9cclxuZnVuY3Rpb24gY29yZV9tZDUoeCwgbGVuKVxyXG57XHJcbiAgLyogYXBwZW5kIHBhZGRpbmcgKi9cclxuICB4W2xlbiA+PiA1XSB8PSAweDgwIDw8ICgobGVuKSAlIDMyKTtcclxuICB4WygoKGxlbiArIDY0KSA+Pj4gOSkgPDwgNCkgKyAxNF0gPSBsZW47XHJcblxyXG4gIHZhciBhID0gIDE3MzI1ODQxOTM7XHJcbiAgdmFyIGIgPSAtMjcxNzMzODc5O1xyXG4gIHZhciBjID0gLTE3MzI1ODQxOTQ7XHJcbiAgdmFyIGQgPSAgMjcxNzMzODc4O1xyXG5cclxuICBmb3IodmFyIGkgPSAwOyBpIDwgeC5sZW5ndGg7IGkgKz0gMTYpXHJcbiAge1xyXG4gICAgdmFyIG9sZGEgPSBhO1xyXG4gICAgdmFyIG9sZGIgPSBiO1xyXG4gICAgdmFyIG9sZGMgPSBjO1xyXG4gICAgdmFyIG9sZGQgPSBkO1xyXG5cclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyAwXSwgNyAsIC02ODA4NzY5MzYpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krIDFdLCAxMiwgLTM4OTU2NDU4Nik7XHJcbiAgICBjID0gbWQ1X2ZmKGMsIGQsIGEsIGIsIHhbaSsgMl0sIDE3LCAgNjA2MTA1ODE5KTtcclxuICAgIGIgPSBtZDVfZmYoYiwgYywgZCwgYSwgeFtpKyAzXSwgMjIsIC0xMDQ0NTI1MzMwKTtcclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyA0XSwgNyAsIC0xNzY0MTg4OTcpO1xyXG4gICAgZCA9IG1kNV9mZihkLCBhLCBiLCBjLCB4W2krIDVdLCAxMiwgIDEyMDAwODA0MjYpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krIDZdLCAxNywgLTE0NzMyMzEzNDEpO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krIDddLCAyMiwgLTQ1NzA1OTgzKTtcclxuICAgIGEgPSBtZDVfZmYoYSwgYiwgYywgZCwgeFtpKyA4XSwgNyAsICAxNzcwMDM1NDE2KTtcclxuICAgIGQgPSBtZDVfZmYoZCwgYSwgYiwgYywgeFtpKyA5XSwgMTIsIC0xOTU4NDE0NDE3KTtcclxuICAgIGMgPSBtZDVfZmYoYywgZCwgYSwgYiwgeFtpKzEwXSwgMTcsIC00MjA2Myk7XHJcbiAgICBiID0gbWQ1X2ZmKGIsIGMsIGQsIGEsIHhbaSsxMV0sIDIyLCAtMTk5MDQwNDE2Mik7XHJcbiAgICBhID0gbWQ1X2ZmKGEsIGIsIGMsIGQsIHhbaSsxMl0sIDcgLCAgMTgwNDYwMzY4Mik7XHJcbiAgICBkID0gbWQ1X2ZmKGQsIGEsIGIsIGMsIHhbaSsxM10sIDEyLCAtNDAzNDExMDEpO1xyXG4gICAgYyA9IG1kNV9mZihjLCBkLCBhLCBiLCB4W2krMTRdLCAxNywgLTE1MDIwMDIyOTApO1xyXG4gICAgYiA9IG1kNV9mZihiLCBjLCBkLCBhLCB4W2krMTVdLCAyMiwgIDEyMzY1MzUzMjkpO1xyXG5cclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKyAxXSwgNSAsIC0xNjU3OTY1MTApO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krIDZdLCA5ICwgLTEwNjk1MDE2MzIpO1xyXG4gICAgYyA9IG1kNV9nZyhjLCBkLCBhLCBiLCB4W2krMTFdLCAxNCwgIDY0MzcxNzcxMyk7XHJcbiAgICBiID0gbWQ1X2dnKGIsIGMsIGQsIGEsIHhbaSsgMF0sIDIwLCAtMzczODk3MzAyKTtcclxuICAgIGEgPSBtZDVfZ2coYSwgYiwgYywgZCwgeFtpKyA1XSwgNSAsIC03MDE1NTg2OTEpO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krMTBdLCA5ICwgIDM4MDE2MDgzKTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKzE1XSwgMTQsIC02NjA0NzgzMzUpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krIDRdLCAyMCwgLTQwNTUzNzg0OCk7XHJcbiAgICBhID0gbWQ1X2dnKGEsIGIsIGMsIGQsIHhbaSsgOV0sIDUgLCAgNTY4NDQ2NDM4KTtcclxuICAgIGQgPSBtZDVfZ2coZCwgYSwgYiwgYywgeFtpKzE0XSwgOSAsIC0xMDE5ODAzNjkwKTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKyAzXSwgMTQsIC0xODczNjM5NjEpO1xyXG4gICAgYiA9IG1kNV9nZyhiLCBjLCBkLCBhLCB4W2krIDhdLCAyMCwgIDExNjM1MzE1MDEpO1xyXG4gICAgYSA9IG1kNV9nZyhhLCBiLCBjLCBkLCB4W2krMTNdLCA1ICwgLTE0NDQ2ODE0NjcpO1xyXG4gICAgZCA9IG1kNV9nZyhkLCBhLCBiLCBjLCB4W2krIDJdLCA5ICwgLTUxNDAzNzg0KTtcclxuICAgIGMgPSBtZDVfZ2coYywgZCwgYSwgYiwgeFtpKyA3XSwgMTQsICAxNzM1MzI4NDczKTtcclxuICAgIGIgPSBtZDVfZ2coYiwgYywgZCwgYSwgeFtpKzEyXSwgMjAsIC0xOTI2NjA3NzM0KTtcclxuXHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgNV0sIDQgLCAtMzc4NTU4KTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKyA4XSwgMTEsIC0yMDIyNTc0NDYzKTtcclxuICAgIGMgPSBtZDVfaGgoYywgZCwgYSwgYiwgeFtpKzExXSwgMTYsICAxODM5MDMwNTYyKTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKzE0XSwgMjMsIC0zNTMwOTU1Nik7XHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgMV0sIDQgLCAtMTUzMDk5MjA2MCk7XHJcbiAgICBkID0gbWQ1X2hoKGQsIGEsIGIsIGMsIHhbaSsgNF0sIDExLCAgMTI3Mjg5MzM1Myk7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsgN10sIDE2LCAtMTU1NDk3NjMyKTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKzEwXSwgMjMsIC0xMDk0NzMwNjQwKTtcclxuICAgIGEgPSBtZDVfaGgoYSwgYiwgYywgZCwgeFtpKzEzXSwgNCAsICA2ODEyNzkxNzQpO1xyXG4gICAgZCA9IG1kNV9oaChkLCBhLCBiLCBjLCB4W2krIDBdLCAxMSwgLTM1ODUzNzIyMik7XHJcbiAgICBjID0gbWQ1X2hoKGMsIGQsIGEsIGIsIHhbaSsgM10sIDE2LCAtNzIyNTIxOTc5KTtcclxuICAgIGIgPSBtZDVfaGgoYiwgYywgZCwgYSwgeFtpKyA2XSwgMjMsICA3NjAyOTE4OSk7XHJcbiAgICBhID0gbWQ1X2hoKGEsIGIsIGMsIGQsIHhbaSsgOV0sIDQgLCAtNjQwMzY0NDg3KTtcclxuICAgIGQgPSBtZDVfaGgoZCwgYSwgYiwgYywgeFtpKzEyXSwgMTEsIC00MjE4MTU4MzUpO1xyXG4gICAgYyA9IG1kNV9oaChjLCBkLCBhLCBiLCB4W2krMTVdLCAxNiwgIDUzMDc0MjUyMCk7XHJcbiAgICBiID0gbWQ1X2hoKGIsIGMsIGQsIGEsIHhbaSsgMl0sIDIzLCAtOTk1MzM4NjUxKTtcclxuXHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsgMF0sIDYgLCAtMTk4NjMwODQ0KTtcclxuICAgIGQgPSBtZDVfaWkoZCwgYSwgYiwgYywgeFtpKyA3XSwgMTAsICAxMTI2ODkxNDE1KTtcclxuICAgIGMgPSBtZDVfaWkoYywgZCwgYSwgYiwgeFtpKzE0XSwgMTUsIC0xNDE2MzU0OTA1KTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKyA1XSwgMjEsIC01NzQzNDA1NSk7XHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsxMl0sIDYgLCAgMTcwMDQ4NTU3MSk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsgM10sIDEwLCAtMTg5NDk4NjYwNik7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsxMF0sIDE1LCAtMTA1MTUyMyk7XHJcbiAgICBiID0gbWQ1X2lpKGIsIGMsIGQsIGEsIHhbaSsgMV0sIDIxLCAtMjA1NDkyMjc5OSk7XHJcbiAgICBhID0gbWQ1X2lpKGEsIGIsIGMsIGQsIHhbaSsgOF0sIDYgLCAgMTg3MzMxMzM1OSk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsxNV0sIDEwLCAtMzA2MTE3NDQpO1xyXG4gICAgYyA9IG1kNV9paShjLCBkLCBhLCBiLCB4W2krIDZdLCAxNSwgLTE1NjAxOTgzODApO1xyXG4gICAgYiA9IG1kNV9paShiLCBjLCBkLCBhLCB4W2krMTNdLCAyMSwgIDEzMDkxNTE2NDkpO1xyXG4gICAgYSA9IG1kNV9paShhLCBiLCBjLCBkLCB4W2krIDRdLCA2ICwgLTE0NTUyMzA3MCk7XHJcbiAgICBkID0gbWQ1X2lpKGQsIGEsIGIsIGMsIHhbaSsxMV0sIDEwLCAtMTEyMDIxMDM3OSk7XHJcbiAgICBjID0gbWQ1X2lpKGMsIGQsIGEsIGIsIHhbaSsgMl0sIDE1LCAgNzE4Nzg3MjU5KTtcclxuICAgIGIgPSBtZDVfaWkoYiwgYywgZCwgYSwgeFtpKyA5XSwgMjEsIC0zNDM0ODU1NTEpO1xyXG5cclxuICAgIGEgPSBzYWZlX2FkZChhLCBvbGRhKTtcclxuICAgIGIgPSBzYWZlX2FkZChiLCBvbGRiKTtcclxuICAgIGMgPSBzYWZlX2FkZChjLCBvbGRjKTtcclxuICAgIGQgPSBzYWZlX2FkZChkLCBvbGRkKTtcclxuICB9XHJcbiAgcmV0dXJuIEFycmF5KGEsIGIsIGMsIGQpO1xyXG5cclxufVxyXG5cclxuLypcclxuICogVGhlc2UgZnVuY3Rpb25zIGltcGxlbWVudCB0aGUgZm91ciBiYXNpYyBvcGVyYXRpb25zIHRoZSBhbGdvcml0aG0gdXNlcy5cclxuICovXHJcbmZ1bmN0aW9uIG1kNV9jbW4ocSwgYSwgYiwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBzYWZlX2FkZChiaXRfcm9sKHNhZmVfYWRkKHNhZmVfYWRkKGEsIHEpLCBzYWZlX2FkZCh4LCB0KSksIHMpLGIpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9mZihhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oKGIgJiBjKSB8ICgofmIpICYgZCksIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9nZyhhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oKGIgJiBkKSB8IChjICYgKH5kKSksIGEsIGIsIHgsIHMsIHQpO1xyXG59XHJcbmZ1bmN0aW9uIG1kNV9oaChhLCBiLCBjLCBkLCB4LCBzLCB0KVxyXG57XHJcbiAgcmV0dXJuIG1kNV9jbW4oYiBeIGMgXiBkLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5mdW5jdGlvbiBtZDVfaWkoYSwgYiwgYywgZCwgeCwgcywgdClcclxue1xyXG4gIHJldHVybiBtZDVfY21uKGMgXiAoYiB8ICh+ZCkpLCBhLCBiLCB4LCBzLCB0KTtcclxufVxyXG5cclxuLypcclxuICogQWRkIGludGVnZXJzLCB3cmFwcGluZyBhdCAyXjMyLiBUaGlzIHVzZXMgMTYtYml0IG9wZXJhdGlvbnMgaW50ZXJuYWxseVxyXG4gKiB0byB3b3JrIGFyb3VuZCBidWdzIGluIHNvbWUgSlMgaW50ZXJwcmV0ZXJzLlxyXG4gKi9cclxuZnVuY3Rpb24gc2FmZV9hZGQoeCwgeSlcclxue1xyXG4gIHZhciBsc3cgPSAoeCAmIDB4RkZGRikgKyAoeSAmIDB4RkZGRik7XHJcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xyXG4gIHJldHVybiAobXN3IDw8IDE2KSB8IChsc3cgJiAweEZGRkYpO1xyXG59XHJcblxyXG4vKlxyXG4gKiBCaXR3aXNlIHJvdGF0ZSBhIDMyLWJpdCBudW1iZXIgdG8gdGhlIGxlZnQuXHJcbiAqL1xyXG5mdW5jdGlvbiBiaXRfcm9sKG51bSwgY250KVxyXG57XHJcbiAgcmV0dXJuIChudW0gPDwgY250KSB8IChudW0gPj4+ICgzMiAtIGNudCkpO1xyXG59XHJcblxyXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uIG1kNShidWYpIHtcclxuICByZXR1cm4gaGVscGVycy5oYXNoKGJ1ZiwgY29yZV9tZDUsIDE2KTtcclxufTtcclxuIiwiLy8gT3JpZ2luYWwgY29kZSBhZGFwdGVkIGZyb20gUm9iZXJ0IEtpZWZmZXIuXG4vLyBkZXRhaWxzIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9icm9vZmEvbm9kZS11dWlkXG4oZnVuY3Rpb24oKSB7XG4gIHZhciBfZ2xvYmFsID0gdGhpcztcblxuICB2YXIgbWF0aFJORywgd2hhdHdnUk5HO1xuXG4gIC8vIE5PVEU6IE1hdGgucmFuZG9tKCkgZG9lcyBub3QgZ3VhcmFudGVlIFwiY3J5cHRvZ3JhcGhpYyBxdWFsaXR5XCJcbiAgbWF0aFJORyA9IGZ1bmN0aW9uKHNpemUpIHtcbiAgICB2YXIgYnl0ZXMgPSBuZXcgQXJyYXkoc2l6ZSk7XG4gICAgdmFyIHI7XG5cbiAgICBmb3IgKHZhciBpID0gMCwgcjsgaSA8IHNpemU7IGkrKykge1xuICAgICAgaWYgKChpICYgMHgwMykgPT0gMCkgciA9IE1hdGgucmFuZG9tKCkgKiAweDEwMDAwMDAwMDtcbiAgICAgIGJ5dGVzW2ldID0gciA+Pj4gKChpICYgMHgwMykgPDwgMykgJiAweGZmO1xuICAgIH1cblxuICAgIHJldHVybiBieXRlcztcbiAgfVxuXG4gIGlmIChfZ2xvYmFsLmNyeXB0byAmJiBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKSB7XG4gICAgd2hhdHdnUk5HID0gZnVuY3Rpb24oc2l6ZSkge1xuICAgICAgdmFyIGJ5dGVzID0gbmV3IFVpbnQ4QXJyYXkoc2l6ZSk7XG4gICAgICBjcnlwdG8uZ2V0UmFuZG9tVmFsdWVzKGJ5dGVzKTtcbiAgICAgIHJldHVybiBieXRlcztcbiAgICB9XG4gIH1cblxuICBtb2R1bGUuZXhwb3J0cyA9IHdoYXR3Z1JORyB8fCBtYXRoUk5HO1xuXG59KCkpXG4iLCIvKlxuICogQSBKYXZhU2NyaXB0IGltcGxlbWVudGF0aW9uIG9mIHRoZSBTZWN1cmUgSGFzaCBBbGdvcml0aG0sIFNIQS0xLCBhcyBkZWZpbmVkXG4gKiBpbiBGSVBTIFBVQiAxODAtMVxuICogVmVyc2lvbiAyLjFhIENvcHlyaWdodCBQYXVsIEpvaG5zdG9uIDIwMDAgLSAyMDAyLlxuICogT3RoZXIgY29udHJpYnV0b3JzOiBHcmVnIEhvbHQsIEFuZHJldyBLZXBlcnQsIFlkbmFyLCBMb3N0aW5ldFxuICogRGlzdHJpYnV0ZWQgdW5kZXIgdGhlIEJTRCBMaWNlbnNlXG4gKiBTZWUgaHR0cDovL3BhamhvbWUub3JnLnVrL2NyeXB0L21kNSBmb3IgZGV0YWlscy5cbiAqL1xuXG52YXIgaGVscGVycyA9IHJlcXVpcmUoJy4vaGVscGVycycpO1xuXG4vKlxuICogQ2FsY3VsYXRlIHRoZSBTSEEtMSBvZiBhbiBhcnJheSBvZiBiaWctZW5kaWFuIHdvcmRzLCBhbmQgYSBiaXQgbGVuZ3RoXG4gKi9cbmZ1bmN0aW9uIGNvcmVfc2hhMSh4LCBsZW4pXG57XG4gIC8qIGFwcGVuZCBwYWRkaW5nICovXG4gIHhbbGVuID4+IDVdIHw9IDB4ODAgPDwgKDI0IC0gbGVuICUgMzIpO1xuICB4WygobGVuICsgNjQgPj4gOSkgPDwgNCkgKyAxNV0gPSBsZW47XG5cbiAgdmFyIHcgPSBBcnJheSg4MCk7XG4gIHZhciBhID0gIDE3MzI1ODQxOTM7XG4gIHZhciBiID0gLTI3MTczMzg3OTtcbiAgdmFyIGMgPSAtMTczMjU4NDE5NDtcbiAgdmFyIGQgPSAgMjcxNzMzODc4O1xuICB2YXIgZSA9IC0xMDA5NTg5Nzc2O1xuXG4gIGZvcih2YXIgaSA9IDA7IGkgPCB4Lmxlbmd0aDsgaSArPSAxNilcbiAge1xuICAgIHZhciBvbGRhID0gYTtcbiAgICB2YXIgb2xkYiA9IGI7XG4gICAgdmFyIG9sZGMgPSBjO1xuICAgIHZhciBvbGRkID0gZDtcbiAgICB2YXIgb2xkZSA9IGU7XG5cbiAgICBmb3IodmFyIGogPSAwOyBqIDwgODA7IGorKylcbiAgICB7XG4gICAgICBpZihqIDwgMTYpIHdbal0gPSB4W2kgKyBqXTtcbiAgICAgIGVsc2Ugd1tqXSA9IHJvbCh3W2otM10gXiB3W2otOF0gXiB3W2otMTRdIF4gd1tqLTE2XSwgMSk7XG4gICAgICB2YXIgdCA9IHNhZmVfYWRkKHNhZmVfYWRkKHJvbChhLCA1KSwgc2hhMV9mdChqLCBiLCBjLCBkKSksXG4gICAgICAgICAgICAgICAgICAgICAgIHNhZmVfYWRkKHNhZmVfYWRkKGUsIHdbal0pLCBzaGExX2t0KGopKSk7XG4gICAgICBlID0gZDtcbiAgICAgIGQgPSBjO1xuICAgICAgYyA9IHJvbChiLCAzMCk7XG4gICAgICBiID0gYTtcbiAgICAgIGEgPSB0O1xuICAgIH1cblxuICAgIGEgPSBzYWZlX2FkZChhLCBvbGRhKTtcbiAgICBiID0gc2FmZV9hZGQoYiwgb2xkYik7XG4gICAgYyA9IHNhZmVfYWRkKGMsIG9sZGMpO1xuICAgIGQgPSBzYWZlX2FkZChkLCBvbGRkKTtcbiAgICBlID0gc2FmZV9hZGQoZSwgb2xkZSk7XG4gIH1cbiAgcmV0dXJuIEFycmF5KGEsIGIsIGMsIGQsIGUpO1xuXG59XG5cbi8qXG4gKiBQZXJmb3JtIHRoZSBhcHByb3ByaWF0ZSB0cmlwbGV0IGNvbWJpbmF0aW9uIGZ1bmN0aW9uIGZvciB0aGUgY3VycmVudFxuICogaXRlcmF0aW9uXG4gKi9cbmZ1bmN0aW9uIHNoYTFfZnQodCwgYiwgYywgZClcbntcbiAgaWYodCA8IDIwKSByZXR1cm4gKGIgJiBjKSB8ICgofmIpICYgZCk7XG4gIGlmKHQgPCA0MCkgcmV0dXJuIGIgXiBjIF4gZDtcbiAgaWYodCA8IDYwKSByZXR1cm4gKGIgJiBjKSB8IChiICYgZCkgfCAoYyAmIGQpO1xuICByZXR1cm4gYiBeIGMgXiBkO1xufVxuXG4vKlxuICogRGV0ZXJtaW5lIHRoZSBhcHByb3ByaWF0ZSBhZGRpdGl2ZSBjb25zdGFudCBmb3IgdGhlIGN1cnJlbnQgaXRlcmF0aW9uXG4gKi9cbmZ1bmN0aW9uIHNoYTFfa3QodClcbntcbiAgcmV0dXJuICh0IDwgMjApID8gIDE1MTg1MDAyNDkgOiAodCA8IDQwKSA/ICAxODU5Nzc1MzkzIDpcbiAgICAgICAgICh0IDwgNjApID8gLTE4OTQwMDc1ODggOiAtODk5NDk3NTE0O1xufVxuXG4vKlxuICogQWRkIGludGVnZXJzLCB3cmFwcGluZyBhdCAyXjMyLiBUaGlzIHVzZXMgMTYtYml0IG9wZXJhdGlvbnMgaW50ZXJuYWxseVxuICogdG8gd29yayBhcm91bmQgYnVncyBpbiBzb21lIEpTIGludGVycHJldGVycy5cbiAqL1xuZnVuY3Rpb24gc2FmZV9hZGQoeCwgeSlcbntcbiAgdmFyIGxzdyA9ICh4ICYgMHhGRkZGKSArICh5ICYgMHhGRkZGKTtcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcbn1cblxuLypcbiAqIEJpdHdpc2Ugcm90YXRlIGEgMzItYml0IG51bWJlciB0byB0aGUgbGVmdC5cbiAqL1xuZnVuY3Rpb24gcm9sKG51bSwgY250KVxue1xuICByZXR1cm4gKG51bSA8PCBjbnQpIHwgKG51bSA+Pj4gKDMyIC0gY250KSk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2hhMShidWYpIHtcbiAgcmV0dXJuIGhlbHBlcnMuaGFzaChidWYsIGNvcmVfc2hhMSwgMjAsIHRydWUpO1xufTtcbiIsIlxuLyoqXG4gKiBBIEphdmFTY3JpcHQgaW1wbGVtZW50YXRpb24gb2YgdGhlIFNlY3VyZSBIYXNoIEFsZ29yaXRobSwgU0hBLTI1NiwgYXMgZGVmaW5lZFxuICogaW4gRklQUyAxODAtMlxuICogVmVyc2lvbiAyLjItYmV0YSBDb3B5cmlnaHQgQW5nZWwgTWFyaW4sIFBhdWwgSm9obnN0b24gMjAwMCAtIDIwMDkuXG4gKiBPdGhlciBjb250cmlidXRvcnM6IEdyZWcgSG9sdCwgQW5kcmV3IEtlcGVydCwgWWRuYXIsIExvc3RpbmV0XG4gKlxuICovXG5cbnZhciBoZWxwZXJzID0gcmVxdWlyZSgnLi9oZWxwZXJzJyk7XG5cbnZhciBzYWZlX2FkZCA9IGZ1bmN0aW9uKHgsIHkpIHtcbiAgdmFyIGxzdyA9ICh4ICYgMHhGRkZGKSArICh5ICYgMHhGRkZGKTtcbiAgdmFyIG1zdyA9ICh4ID4+IDE2KSArICh5ID4+IDE2KSArIChsc3cgPj4gMTYpO1xuICByZXR1cm4gKG1zdyA8PCAxNikgfCAobHN3ICYgMHhGRkZGKTtcbn07XG5cbnZhciBTID0gZnVuY3Rpb24oWCwgbikge1xuICByZXR1cm4gKFggPj4+IG4pIHwgKFggPDwgKDMyIC0gbikpO1xufTtcblxudmFyIFIgPSBmdW5jdGlvbihYLCBuKSB7XG4gIHJldHVybiAoWCA+Pj4gbik7XG59O1xuXG52YXIgQ2ggPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gIHJldHVybiAoKHggJiB5KSBeICgofngpICYgeikpO1xufTtcblxudmFyIE1haiA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgcmV0dXJuICgoeCAmIHkpIF4gKHggJiB6KSBeICh5ICYgeikpO1xufTtcblxudmFyIFNpZ21hMDI1NiA9IGZ1bmN0aW9uKHgpIHtcbiAgcmV0dXJuIChTKHgsIDIpIF4gUyh4LCAxMykgXiBTKHgsIDIyKSk7XG59O1xuXG52YXIgU2lnbWExMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgNikgXiBTKHgsIDExKSBeIFMoeCwgMjUpKTtcbn07XG5cbnZhciBHYW1tYTAyNTYgPSBmdW5jdGlvbih4KSB7XG4gIHJldHVybiAoUyh4LCA3KSBeIFMoeCwgMTgpIF4gUih4LCAzKSk7XG59O1xuXG52YXIgR2FtbWExMjU2ID0gZnVuY3Rpb24oeCkge1xuICByZXR1cm4gKFMoeCwgMTcpIF4gUyh4LCAxOSkgXiBSKHgsIDEwKSk7XG59O1xuXG52YXIgY29yZV9zaGEyNTYgPSBmdW5jdGlvbihtLCBsKSB7XG4gIHZhciBLID0gbmV3IEFycmF5KDB4NDI4QTJGOTgsMHg3MTM3NDQ5MSwweEI1QzBGQkNGLDB4RTlCNURCQTUsMHgzOTU2QzI1QiwweDU5RjExMUYxLDB4OTIzRjgyQTQsMHhBQjFDNUVENSwweEQ4MDdBQTk4LDB4MTI4MzVCMDEsMHgyNDMxODVCRSwweDU1MEM3REMzLDB4NzJCRTVENzQsMHg4MERFQjFGRSwweDlCREMwNkE3LDB4QzE5QkYxNzQsMHhFNDlCNjlDMSwweEVGQkU0Nzg2LDB4RkMxOURDNiwweDI0MENBMUNDLDB4MkRFOTJDNkYsMHg0QTc0ODRBQSwweDVDQjBBOURDLDB4NzZGOTg4REEsMHg5ODNFNTE1MiwweEE4MzFDNjZELDB4QjAwMzI3QzgsMHhCRjU5N0ZDNywweEM2RTAwQkYzLDB4RDVBNzkxNDcsMHg2Q0E2MzUxLDB4MTQyOTI5NjcsMHgyN0I3MEE4NSwweDJFMUIyMTM4LDB4NEQyQzZERkMsMHg1MzM4MEQxMywweDY1MEE3MzU0LDB4NzY2QTBBQkIsMHg4MUMyQzkyRSwweDkyNzIyQzg1LDB4QTJCRkU4QTEsMHhBODFBNjY0QiwweEMyNEI4QjcwLDB4Qzc2QzUxQTMsMHhEMTkyRTgxOSwweEQ2OTkwNjI0LDB4RjQwRTM1ODUsMHgxMDZBQTA3MCwweDE5QTRDMTE2LDB4MUUzNzZDMDgsMHgyNzQ4Nzc0QywweDM0QjBCQ0I1LDB4MzkxQzBDQjMsMHg0RUQ4QUE0QSwweDVCOUNDQTRGLDB4NjgyRTZGRjMsMHg3NDhGODJFRSwweDc4QTU2MzZGLDB4ODRDODc4MTQsMHg4Q0M3MDIwOCwweDkwQkVGRkZBLDB4QTQ1MDZDRUIsMHhCRUY5QTNGNywweEM2NzE3OEYyKTtcbiAgdmFyIEhBU0ggPSBuZXcgQXJyYXkoMHg2QTA5RTY2NywgMHhCQjY3QUU4NSwgMHgzQzZFRjM3MiwgMHhBNTRGRjUzQSwgMHg1MTBFNTI3RiwgMHg5QjA1Njg4QywgMHgxRjgzRDlBQiwgMHg1QkUwQ0QxOSk7XG4gICAgdmFyIFcgPSBuZXcgQXJyYXkoNjQpO1xuICAgIHZhciBhLCBiLCBjLCBkLCBlLCBmLCBnLCBoLCBpLCBqO1xuICAgIHZhciBUMSwgVDI7XG4gIC8qIGFwcGVuZCBwYWRkaW5nICovXG4gIG1bbCA+PiA1XSB8PSAweDgwIDw8ICgyNCAtIGwgJSAzMik7XG4gIG1bKChsICsgNjQgPj4gOSkgPDwgNCkgKyAxNV0gPSBsO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG0ubGVuZ3RoOyBpICs9IDE2KSB7XG4gICAgYSA9IEhBU0hbMF07IGIgPSBIQVNIWzFdOyBjID0gSEFTSFsyXTsgZCA9IEhBU0hbM107IGUgPSBIQVNIWzRdOyBmID0gSEFTSFs1XTsgZyA9IEhBU0hbNl07IGggPSBIQVNIWzddO1xuICAgIGZvciAodmFyIGogPSAwOyBqIDwgNjQ7IGorKykge1xuICAgICAgaWYgKGogPCAxNikge1xuICAgICAgICBXW2pdID0gbVtqICsgaV07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBXW2pdID0gc2FmZV9hZGQoc2FmZV9hZGQoc2FmZV9hZGQoR2FtbWExMjU2KFdbaiAtIDJdKSwgV1tqIC0gN10pLCBHYW1tYTAyNTYoV1tqIC0gMTVdKSksIFdbaiAtIDE2XSk7XG4gICAgICB9XG4gICAgICBUMSA9IHNhZmVfYWRkKHNhZmVfYWRkKHNhZmVfYWRkKHNhZmVfYWRkKGgsIFNpZ21hMTI1NihlKSksIENoKGUsIGYsIGcpKSwgS1tqXSksIFdbal0pO1xuICAgICAgVDIgPSBzYWZlX2FkZChTaWdtYTAyNTYoYSksIE1haihhLCBiLCBjKSk7XG4gICAgICBoID0gZzsgZyA9IGY7IGYgPSBlOyBlID0gc2FmZV9hZGQoZCwgVDEpOyBkID0gYzsgYyA9IGI7IGIgPSBhOyBhID0gc2FmZV9hZGQoVDEsIFQyKTtcbiAgICB9XG4gICAgSEFTSFswXSA9IHNhZmVfYWRkKGEsIEhBU0hbMF0pOyBIQVNIWzFdID0gc2FmZV9hZGQoYiwgSEFTSFsxXSk7IEhBU0hbMl0gPSBzYWZlX2FkZChjLCBIQVNIWzJdKTsgSEFTSFszXSA9IHNhZmVfYWRkKGQsIEhBU0hbM10pO1xuICAgIEhBU0hbNF0gPSBzYWZlX2FkZChlLCBIQVNIWzRdKTsgSEFTSFs1XSA9IHNhZmVfYWRkKGYsIEhBU0hbNV0pOyBIQVNIWzZdID0gc2FmZV9hZGQoZywgSEFTSFs2XSk7IEhBU0hbN10gPSBzYWZlX2FkZChoLCBIQVNIWzddKTtcbiAgfVxuICByZXR1cm4gSEFTSDtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gc2hhMjU2KGJ1Zikge1xuICByZXR1cm4gaGVscGVycy5oYXNoKGJ1ZiwgY29yZV9zaGEyNTYsIDMyLCB0cnVlKTtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuZnVuY3Rpb24gRXZlbnRFbWl0dGVyKCkge1xuICB0aGlzLl9ldmVudHMgPSB0aGlzLl9ldmVudHMgfHwge307XG4gIHRoaXMuX21heExpc3RlbmVycyA9IHRoaXMuX21heExpc3RlbmVycyB8fCB1bmRlZmluZWQ7XG59XG5tb2R1bGUuZXhwb3J0cyA9IEV2ZW50RW1pdHRlcjtcblxuLy8gQmFja3dhcmRzLWNvbXBhdCB3aXRoIG5vZGUgMC4xMC54XG5FdmVudEVtaXR0ZXIuRXZlbnRFbWl0dGVyID0gRXZlbnRFbWl0dGVyO1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9ldmVudHMgPSB1bmRlZmluZWQ7XG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLl9tYXhMaXN0ZW5lcnMgPSB1bmRlZmluZWQ7XG5cbi8vIEJ5IGRlZmF1bHQgRXZlbnRFbWl0dGVycyB3aWxsIHByaW50IGEgd2FybmluZyBpZiBtb3JlIHRoYW4gMTAgbGlzdGVuZXJzIGFyZVxuLy8gYWRkZWQgdG8gaXQuIFRoaXMgaXMgYSB1c2VmdWwgZGVmYXVsdCB3aGljaCBoZWxwcyBmaW5kaW5nIG1lbW9yeSBsZWFrcy5cbkV2ZW50RW1pdHRlci5kZWZhdWx0TWF4TGlzdGVuZXJzID0gMTA7XG5cbi8vIE9idmlvdXNseSBub3QgYWxsIEVtaXR0ZXJzIHNob3VsZCBiZSBsaW1pdGVkIHRvIDEwLiBUaGlzIGZ1bmN0aW9uIGFsbG93c1xuLy8gdGhhdCB0byBiZSBpbmNyZWFzZWQuIFNldCB0byB6ZXJvIGZvciB1bmxpbWl0ZWQuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnNldE1heExpc3RlbmVycyA9IGZ1bmN0aW9uKG4pIHtcbiAgaWYgKCFpc051bWJlcihuKSB8fCBuIDwgMCB8fCBpc05hTihuKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ24gbXVzdCBiZSBhIHBvc2l0aXZlIG51bWJlcicpO1xuICB0aGlzLl9tYXhMaXN0ZW5lcnMgPSBuO1xuICByZXR1cm4gdGhpcztcbn07XG5cbkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdCA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGVyLCBoYW5kbGVyLCBsZW4sIGFyZ3MsIGksIGxpc3RlbmVycztcblxuICBpZiAoIXRoaXMuX2V2ZW50cylcbiAgICB0aGlzLl9ldmVudHMgPSB7fTtcblxuICAvLyBJZiB0aGVyZSBpcyBubyAnZXJyb3InIGV2ZW50IGxpc3RlbmVyIHRoZW4gdGhyb3cuXG4gIGlmICh0eXBlID09PSAnZXJyb3InKSB7XG4gICAgaWYgKCF0aGlzLl9ldmVudHMuZXJyb3IgfHxcbiAgICAgICAgKGlzT2JqZWN0KHRoaXMuX2V2ZW50cy5lcnJvcikgJiYgIXRoaXMuX2V2ZW50cy5lcnJvci5sZW5ndGgpKSB7XG4gICAgICBlciA9IGFyZ3VtZW50c1sxXTtcbiAgICAgIGlmIChlciBpbnN0YW5jZW9mIEVycm9yKSB7XG4gICAgICAgIHRocm93IGVyOyAvLyBVbmhhbmRsZWQgJ2Vycm9yJyBldmVudFxuICAgICAgfVxuICAgICAgdGhyb3cgVHlwZUVycm9yKCdVbmNhdWdodCwgdW5zcGVjaWZpZWQgXCJlcnJvclwiIGV2ZW50LicpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZXIgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzVW5kZWZpbmVkKGhhbmRsZXIpKVxuICAgIHJldHVybiBmYWxzZTtcblxuICBpZiAoaXNGdW5jdGlvbihoYW5kbGVyKSkge1xuICAgIHN3aXRjaCAoYXJndW1lbnRzLmxlbmd0aCkge1xuICAgICAgLy8gZmFzdCBjYXNlc1xuICAgICAgY2FzZSAxOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcyk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAyOlxuICAgICAgICBoYW5kbGVyLmNhbGwodGhpcywgYXJndW1lbnRzWzFdKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIDM6XG4gICAgICAgIGhhbmRsZXIuY2FsbCh0aGlzLCBhcmd1bWVudHNbMV0sIGFyZ3VtZW50c1syXSk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgLy8gc2xvd2VyXG4gICAgICBkZWZhdWx0OlxuICAgICAgICBsZW4gPSBhcmd1bWVudHMubGVuZ3RoO1xuICAgICAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgICAgICBmb3IgKGkgPSAxOyBpIDwgbGVuOyBpKyspXG4gICAgICAgICAgYXJnc1tpIC0gMV0gPSBhcmd1bWVudHNbaV07XG4gICAgICAgIGhhbmRsZXIuYXBwbHkodGhpcywgYXJncyk7XG4gICAgfVxuICB9IGVsc2UgaWYgKGlzT2JqZWN0KGhhbmRsZXIpKSB7XG4gICAgbGVuID0gYXJndW1lbnRzLmxlbmd0aDtcbiAgICBhcmdzID0gbmV3IEFycmF5KGxlbiAtIDEpO1xuICAgIGZvciAoaSA9IDE7IGkgPCBsZW47IGkrKylcbiAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuXG4gICAgbGlzdGVuZXJzID0gaGFuZGxlci5zbGljZSgpO1xuICAgIGxlbiA9IGxpc3RlbmVycy5sZW5ndGg7XG4gICAgZm9yIChpID0gMDsgaSA8IGxlbjsgaSsrKVxuICAgICAgbGlzdGVuZXJzW2ldLmFwcGx5KHRoaXMsIGFyZ3MpO1xuICB9XG5cbiAgcmV0dXJuIHRydWU7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmFkZExpc3RlbmVyID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgdmFyIG07XG5cbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuXG4gIC8vIFRvIGF2b2lkIHJlY3Vyc2lvbiBpbiB0aGUgY2FzZSB0aGF0IHR5cGUgPT09IFwibmV3TGlzdGVuZXJcIiEgQmVmb3JlXG4gIC8vIGFkZGluZyBpdCB0byB0aGUgbGlzdGVuZXJzLCBmaXJzdCBlbWl0IFwibmV3TGlzdGVuZXJcIi5cbiAgaWYgKHRoaXMuX2V2ZW50cy5uZXdMaXN0ZW5lcilcbiAgICB0aGlzLmVtaXQoJ25ld0xpc3RlbmVyJywgdHlwZSxcbiAgICAgICAgICAgICAgaXNGdW5jdGlvbihsaXN0ZW5lci5saXN0ZW5lcikgP1xuICAgICAgICAgICAgICBsaXN0ZW5lci5saXN0ZW5lciA6IGxpc3RlbmVyKTtcblxuICBpZiAoIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAvLyBPcHRpbWl6ZSB0aGUgY2FzZSBvZiBvbmUgbGlzdGVuZXIuIERvbid0IG5lZWQgdGhlIGV4dHJhIGFycmF5IG9iamVjdC5cbiAgICB0aGlzLl9ldmVudHNbdHlwZV0gPSBsaXN0ZW5lcjtcbiAgZWxzZSBpZiAoaXNPYmplY3QodGhpcy5fZXZlbnRzW3R5cGVdKSlcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IGdvdCBhbiBhcnJheSwganVzdCBhcHBlbmQuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdLnB1c2gobGlzdGVuZXIpO1xuICBlbHNlXG4gICAgLy8gQWRkaW5nIHRoZSBzZWNvbmQgZWxlbWVudCwgbmVlZCB0byBjaGFuZ2UgdG8gYXJyYXkuXG4gICAgdGhpcy5fZXZlbnRzW3R5cGVdID0gW3RoaXMuX2V2ZW50c1t0eXBlXSwgbGlzdGVuZXJdO1xuXG4gIC8vIENoZWNrIGZvciBsaXN0ZW5lciBsZWFrXG4gIGlmIChpc09iamVjdCh0aGlzLl9ldmVudHNbdHlwZV0pICYmICF0aGlzLl9ldmVudHNbdHlwZV0ud2FybmVkKSB7XG4gICAgdmFyIG07XG4gICAgaWYgKCFpc1VuZGVmaW5lZCh0aGlzLl9tYXhMaXN0ZW5lcnMpKSB7XG4gICAgICBtID0gdGhpcy5fbWF4TGlzdGVuZXJzO1xuICAgIH0gZWxzZSB7XG4gICAgICBtID0gRXZlbnRFbWl0dGVyLmRlZmF1bHRNYXhMaXN0ZW5lcnM7XG4gICAgfVxuXG4gICAgaWYgKG0gJiYgbSA+IDAgJiYgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCA+IG0pIHtcbiAgICAgIHRoaXMuX2V2ZW50c1t0eXBlXS53YXJuZWQgPSB0cnVlO1xuICAgICAgY29uc29sZS5lcnJvcignKG5vZGUpIHdhcm5pbmc6IHBvc3NpYmxlIEV2ZW50RW1pdHRlciBtZW1vcnkgJyArXG4gICAgICAgICAgICAgICAgICAgICdsZWFrIGRldGVjdGVkLiAlZCBsaXN0ZW5lcnMgYWRkZWQuICcgK1xuICAgICAgICAgICAgICAgICAgICAnVXNlIGVtaXR0ZXIuc2V0TWF4TGlzdGVuZXJzKCkgdG8gaW5jcmVhc2UgbGltaXQuJyxcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5fZXZlbnRzW3R5cGVdLmxlbmd0aCk7XG4gICAgICBpZiAodHlwZW9mIGNvbnNvbGUudHJhY2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgLy8gbm90IHN1cHBvcnRlZCBpbiBJRSAxMFxuICAgICAgICBjb25zb2xlLnRyYWNlKCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLm9uID0gRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5hZGRMaXN0ZW5lcjtcblxuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5vbmNlID0gZnVuY3Rpb24odHlwZSwgbGlzdGVuZXIpIHtcbiAgaWYgKCFpc0Z1bmN0aW9uKGxpc3RlbmVyKSlcbiAgICB0aHJvdyBUeXBlRXJyb3IoJ2xpc3RlbmVyIG11c3QgYmUgYSBmdW5jdGlvbicpO1xuXG4gIHZhciBmaXJlZCA9IGZhbHNlO1xuXG4gIGZ1bmN0aW9uIGcoKSB7XG4gICAgdGhpcy5yZW1vdmVMaXN0ZW5lcih0eXBlLCBnKTtcblxuICAgIGlmICghZmlyZWQpIHtcbiAgICAgIGZpcmVkID0gdHJ1ZTtcbiAgICAgIGxpc3RlbmVyLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfVxuICB9XG5cbiAgZy5saXN0ZW5lciA9IGxpc3RlbmVyO1xuICB0aGlzLm9uKHR5cGUsIGcpO1xuXG4gIHJldHVybiB0aGlzO1xufTtcblxuLy8gZW1pdHMgYSAncmVtb3ZlTGlzdGVuZXInIGV2ZW50IGlmZiB0aGUgbGlzdGVuZXIgd2FzIHJlbW92ZWRcbkV2ZW50RW1pdHRlci5wcm90b3R5cGUucmVtb3ZlTGlzdGVuZXIgPSBmdW5jdGlvbih0eXBlLCBsaXN0ZW5lcikge1xuICB2YXIgbGlzdCwgcG9zaXRpb24sIGxlbmd0aCwgaTtcblxuICBpZiAoIWlzRnVuY3Rpb24obGlzdGVuZXIpKVxuICAgIHRocm93IFR5cGVFcnJvcignbGlzdGVuZXIgbXVzdCBiZSBhIGZ1bmN0aW9uJyk7XG5cbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXR1cm4gdGhpcztcblxuICBsaXN0ID0gdGhpcy5fZXZlbnRzW3R5cGVdO1xuICBsZW5ndGggPSBsaXN0Lmxlbmd0aDtcbiAgcG9zaXRpb24gPSAtMTtcblxuICBpZiAobGlzdCA9PT0gbGlzdGVuZXIgfHxcbiAgICAgIChpc0Z1bmN0aW9uKGxpc3QubGlzdGVuZXIpICYmIGxpc3QubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgaWYgKHRoaXMuX2V2ZW50cy5yZW1vdmVMaXN0ZW5lcilcbiAgICAgIHRoaXMuZW1pdCgncmVtb3ZlTGlzdGVuZXInLCB0eXBlLCBsaXN0ZW5lcik7XG5cbiAgfSBlbHNlIGlmIChpc09iamVjdChsaXN0KSkge1xuICAgIGZvciAoaSA9IGxlbmd0aDsgaS0tID4gMDspIHtcbiAgICAgIGlmIChsaXN0W2ldID09PSBsaXN0ZW5lciB8fFxuICAgICAgICAgIChsaXN0W2ldLmxpc3RlbmVyICYmIGxpc3RbaV0ubGlzdGVuZXIgPT09IGxpc3RlbmVyKSkge1xuICAgICAgICBwb3NpdGlvbiA9IGk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChwb3NpdGlvbiA8IDApXG4gICAgICByZXR1cm4gdGhpcztcblxuICAgIGlmIChsaXN0Lmxlbmd0aCA9PT0gMSkge1xuICAgICAgbGlzdC5sZW5ndGggPSAwO1xuICAgICAgZGVsZXRlIHRoaXMuX2V2ZW50c1t0eXBlXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbGlzdC5zcGxpY2UocG9zaXRpb24sIDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpXG4gICAgICB0aGlzLmVtaXQoJ3JlbW92ZUxpc3RlbmVyJywgdHlwZSwgbGlzdGVuZXIpO1xuICB9XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLnJlbW92ZUFsbExpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIGtleSwgbGlzdGVuZXJzO1xuXG4gIGlmICghdGhpcy5fZXZlbnRzKVxuICAgIHJldHVybiB0aGlzO1xuXG4gIC8vIG5vdCBsaXN0ZW5pbmcgZm9yIHJlbW92ZUxpc3RlbmVyLCBubyBuZWVkIHRvIGVtaXRcbiAgaWYgKCF0aGlzLl9ldmVudHMucmVtb3ZlTGlzdGVuZXIpIHtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PT0gMClcbiAgICAgIHRoaXMuX2V2ZW50cyA9IHt9O1xuICAgIGVsc2UgaWYgKHRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICAgIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICAvLyBlbWl0IHJlbW92ZUxpc3RlbmVyIGZvciBhbGwgbGlzdGVuZXJzIG9uIGFsbCBldmVudHNcbiAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICBmb3IgKGtleSBpbiB0aGlzLl9ldmVudHMpIHtcbiAgICAgIGlmIChrZXkgPT09ICdyZW1vdmVMaXN0ZW5lcicpIGNvbnRpbnVlO1xuICAgICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoa2V5KTtcbiAgICB9XG4gICAgdGhpcy5yZW1vdmVBbGxMaXN0ZW5lcnMoJ3JlbW92ZUxpc3RlbmVyJyk7XG4gICAgdGhpcy5fZXZlbnRzID0ge307XG4gICAgcmV0dXJuIHRoaXM7XG4gIH1cblxuICBsaXN0ZW5lcnMgPSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgaWYgKGlzRnVuY3Rpb24obGlzdGVuZXJzKSkge1xuICAgIHRoaXMucmVtb3ZlTGlzdGVuZXIodHlwZSwgbGlzdGVuZXJzKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBMSUZPIG9yZGVyXG4gICAgd2hpbGUgKGxpc3RlbmVycy5sZW5ndGgpXG4gICAgICB0aGlzLnJlbW92ZUxpc3RlbmVyKHR5cGUsIGxpc3RlbmVyc1tsaXN0ZW5lcnMubGVuZ3RoIC0gMV0pO1xuICB9XG4gIGRlbGV0ZSB0aGlzLl9ldmVudHNbdHlwZV07XG5cbiAgcmV0dXJuIHRoaXM7XG59O1xuXG5FdmVudEVtaXR0ZXIucHJvdG90eXBlLmxpc3RlbmVycyA9IGZ1bmN0aW9uKHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCF0aGlzLl9ldmVudHMgfHwgIXRoaXMuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSBbXTtcbiAgZWxzZSBpZiAoaXNGdW5jdGlvbih0aGlzLl9ldmVudHNbdHlwZV0pKVxuICAgIHJldCA9IFt0aGlzLl9ldmVudHNbdHlwZV1dO1xuICBlbHNlXG4gICAgcmV0ID0gdGhpcy5fZXZlbnRzW3R5cGVdLnNsaWNlKCk7XG4gIHJldHVybiByZXQ7XG59O1xuXG5FdmVudEVtaXR0ZXIubGlzdGVuZXJDb3VudCA9IGZ1bmN0aW9uKGVtaXR0ZXIsIHR5cGUpIHtcbiAgdmFyIHJldDtcbiAgaWYgKCFlbWl0dGVyLl9ldmVudHMgfHwgIWVtaXR0ZXIuX2V2ZW50c1t0eXBlXSlcbiAgICByZXQgPSAwO1xuICBlbHNlIGlmIChpc0Z1bmN0aW9uKGVtaXR0ZXIuX2V2ZW50c1t0eXBlXSkpXG4gICAgcmV0ID0gMTtcbiAgZWxzZVxuICAgIHJldCA9IGVtaXR0ZXIuX2V2ZW50c1t0eXBlXS5sZW5ndGg7XG4gIHJldHVybiByZXQ7XG59O1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cblxuZnVuY3Rpb24gaXNPYmplY3QoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnb2JqZWN0JyAmJiBhcmcgIT09IG51bGw7XG59XG5cbmZ1bmN0aW9uIGlzVW5kZWZpbmVkKGFyZykge1xuICByZXR1cm4gYXJnID09PSB2b2lkIDA7XG59XG4iLCJpZiAodHlwZW9mIE9iamVjdC5jcmVhdGUgPT09ICdmdW5jdGlvbicpIHtcbiAgLy8gaW1wbGVtZW50YXRpb24gZnJvbSBzdGFuZGFyZCBub2RlLmpzICd1dGlsJyBtb2R1bGVcbiAgbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpbmhlcml0cyhjdG9yLCBzdXBlckN0b3IpIHtcbiAgICBjdG9yLnN1cGVyXyA9IHN1cGVyQ3RvclxuICAgIGN0b3IucHJvdG90eXBlID0gT2JqZWN0LmNyZWF0ZShzdXBlckN0b3IucHJvdG90eXBlLCB7XG4gICAgICBjb25zdHJ1Y3Rvcjoge1xuICAgICAgICB2YWx1ZTogY3RvcixcbiAgICAgICAgZW51bWVyYWJsZTogZmFsc2UsXG4gICAgICAgIHdyaXRhYmxlOiB0cnVlLFxuICAgICAgICBjb25maWd1cmFibGU6IHRydWVcbiAgICAgIH1cbiAgICB9KTtcbiAgfTtcbn0gZWxzZSB7XG4gIC8vIG9sZCBzY2hvb2wgc2hpbSBmb3Igb2xkIGJyb3dzZXJzXG4gIG1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24gaW5oZXJpdHMoY3Rvciwgc3VwZXJDdG9yKSB7XG4gICAgY3Rvci5zdXBlcl8gPSBzdXBlckN0b3JcbiAgICB2YXIgVGVtcEN0b3IgPSBmdW5jdGlvbiAoKSB7fVxuICAgIFRlbXBDdG9yLnByb3RvdHlwZSA9IHN1cGVyQ3Rvci5wcm90b3R5cGVcbiAgICBjdG9yLnByb3RvdHlwZSA9IG5ldyBUZW1wQ3RvcigpXG4gICAgY3Rvci5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBjdG9yXG4gIH1cbn1cbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4vLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuLy8gcmVzb2x2ZXMgLiBhbmQgLi4gZWxlbWVudHMgaW4gYSBwYXRoIGFycmF5IHdpdGggZGlyZWN0b3J5IG5hbWVzIHRoZXJlXG4vLyBtdXN0IGJlIG5vIHNsYXNoZXMsIGVtcHR5IGVsZW1lbnRzLCBvciBkZXZpY2UgbmFtZXMgKGM6XFwpIGluIHRoZSBhcnJheVxuLy8gKHNvIGFsc28gbm8gbGVhZGluZyBhbmQgdHJhaWxpbmcgc2xhc2hlcyAtIGl0IGRvZXMgbm90IGRpc3Rpbmd1aXNoXG4vLyByZWxhdGl2ZSBhbmQgYWJzb2x1dGUgcGF0aHMpXG5mdW5jdGlvbiBub3JtYWxpemVBcnJheShwYXJ0cywgYWxsb3dBYm92ZVJvb3QpIHtcbiAgLy8gaWYgdGhlIHBhdGggdHJpZXMgdG8gZ28gYWJvdmUgdGhlIHJvb3QsIGB1cGAgZW5kcyB1cCA+IDBcbiAgdmFyIHVwID0gMDtcbiAgZm9yICh2YXIgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgdmFyIGxhc3QgPSBwYXJ0c1tpXTtcbiAgICBpZiAobGFzdCA9PT0gJy4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgfSBlbHNlIGlmIChsYXN0ID09PSAnLi4nKSB7XG4gICAgICBwYXJ0cy5zcGxpY2UoaSwgMSk7XG4gICAgICB1cCsrO1xuICAgIH0gZWxzZSBpZiAodXApIHtcbiAgICAgIHBhcnRzLnNwbGljZShpLCAxKTtcbiAgICAgIHVwLS07XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgdGhlIHBhdGggaXMgYWxsb3dlZCB0byBnbyBhYm92ZSB0aGUgcm9vdCwgcmVzdG9yZSBsZWFkaW5nIC4uc1xuICBpZiAoYWxsb3dBYm92ZVJvb3QpIHtcbiAgICBmb3IgKDsgdXAtLTsgdXApIHtcbiAgICAgIHBhcnRzLnVuc2hpZnQoJy4uJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHBhcnRzO1xufVxuXG4vLyBTcGxpdCBhIGZpbGVuYW1lIGludG8gW3Jvb3QsIGRpciwgYmFzZW5hbWUsIGV4dF0sIHVuaXggdmVyc2lvblxuLy8gJ3Jvb3QnIGlzIGp1c3QgYSBzbGFzaCwgb3Igbm90aGluZy5cbnZhciBzcGxpdFBhdGhSZSA9XG4gICAgL14oXFwvP3wpKFtcXHNcXFNdKj8pKCg/OlxcLnsxLDJ9fFteXFwvXSs/fCkoXFwuW14uXFwvXSp8KSkoPzpbXFwvXSopJC87XG52YXIgc3BsaXRQYXRoID0gZnVuY3Rpb24oZmlsZW5hbWUpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aFJlLmV4ZWMoZmlsZW5hbWUpLnNsaWNlKDEpO1xufTtcblxuLy8gcGF0aC5yZXNvbHZlKFtmcm9tIC4uLl0sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZXNvbHZlID0gZnVuY3Rpb24oKSB7XG4gIHZhciByZXNvbHZlZFBhdGggPSAnJyxcbiAgICAgIHJlc29sdmVkQWJzb2x1dGUgPSBmYWxzZTtcblxuICBmb3IgKHZhciBpID0gYXJndW1lbnRzLmxlbmd0aCAtIDE7IGkgPj0gLTEgJiYgIXJlc29sdmVkQWJzb2x1dGU7IGktLSkge1xuICAgIHZhciBwYXRoID0gKGkgPj0gMCkgPyBhcmd1bWVudHNbaV0gOiBwcm9jZXNzLmN3ZCgpO1xuXG4gICAgLy8gU2tpcCBlbXB0eSBhbmQgaW52YWxpZCBlbnRyaWVzXG4gICAgaWYgKHR5cGVvZiBwYXRoICE9PSAnc3RyaW5nJykge1xuICAgICAgdGhyb3cgbmV3IFR5cGVFcnJvcignQXJndW1lbnRzIHRvIHBhdGgucmVzb2x2ZSBtdXN0IGJlIHN0cmluZ3MnKTtcbiAgICB9IGVsc2UgaWYgKCFwYXRoKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICByZXNvbHZlZFBhdGggPSBwYXRoICsgJy8nICsgcmVzb2x2ZWRQYXRoO1xuICAgIHJlc29sdmVkQWJzb2x1dGUgPSBwYXRoLmNoYXJBdCgwKSA9PT0gJy8nO1xuICB9XG5cbiAgLy8gQXQgdGhpcyBwb2ludCB0aGUgcGF0aCBzaG91bGQgYmUgcmVzb2x2ZWQgdG8gYSBmdWxsIGFic29sdXRlIHBhdGgsIGJ1dFxuICAvLyBoYW5kbGUgcmVsYXRpdmUgcGF0aHMgdG8gYmUgc2FmZSAobWlnaHQgaGFwcGVuIHdoZW4gcHJvY2Vzcy5jd2QoKSBmYWlscylcblxuICAvLyBOb3JtYWxpemUgdGhlIHBhdGhcbiAgcmVzb2x2ZWRQYXRoID0gbm9ybWFsaXplQXJyYXkoZmlsdGVyKHJlc29sdmVkUGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFyZXNvbHZlZEFic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgcmV0dXJuICgocmVzb2x2ZWRBYnNvbHV0ZSA/ICcvJyA6ICcnKSArIHJlc29sdmVkUGF0aCkgfHwgJy4nO1xufTtcblxuLy8gcGF0aC5ub3JtYWxpemUocGF0aClcbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMubm9ybWFsaXplID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgaXNBYnNvbHV0ZSA9IGV4cG9ydHMuaXNBYnNvbHV0ZShwYXRoKSxcbiAgICAgIHRyYWlsaW5nU2xhc2ggPSBzdWJzdHIocGF0aCwgLTEpID09PSAnLyc7XG5cbiAgLy8gTm9ybWFsaXplIHRoZSBwYXRoXG4gIHBhdGggPSBub3JtYWxpemVBcnJheShmaWx0ZXIocGF0aC5zcGxpdCgnLycpLCBmdW5jdGlvbihwKSB7XG4gICAgcmV0dXJuICEhcDtcbiAgfSksICFpc0Fic29sdXRlKS5qb2luKCcvJyk7XG5cbiAgaWYgKCFwYXRoICYmICFpc0Fic29sdXRlKSB7XG4gICAgcGF0aCA9ICcuJztcbiAgfVxuICBpZiAocGF0aCAmJiB0cmFpbGluZ1NsYXNoKSB7XG4gICAgcGF0aCArPSAnLyc7XG4gIH1cblxuICByZXR1cm4gKGlzQWJzb2x1dGUgPyAnLycgOiAnJykgKyBwYXRoO1xufTtcblxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5pc0Fic29sdXRlID0gZnVuY3Rpb24ocGF0aCkge1xuICByZXR1cm4gcGF0aC5jaGFyQXQoMCkgPT09ICcvJztcbn07XG5cbi8vIHBvc2l4IHZlcnNpb25cbmV4cG9ydHMuam9pbiA9IGZ1bmN0aW9uKCkge1xuICB2YXIgcGF0aHMgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDApO1xuICByZXR1cm4gZXhwb3J0cy5ub3JtYWxpemUoZmlsdGVyKHBhdGhzLCBmdW5jdGlvbihwLCBpbmRleCkge1xuICAgIGlmICh0eXBlb2YgcCAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHRocm93IG5ldyBUeXBlRXJyb3IoJ0FyZ3VtZW50cyB0byBwYXRoLmpvaW4gbXVzdCBiZSBzdHJpbmdzJyk7XG4gICAgfVxuICAgIHJldHVybiBwO1xuICB9KS5qb2luKCcvJykpO1xufTtcblxuXG4vLyBwYXRoLnJlbGF0aXZlKGZyb20sIHRvKVxuLy8gcG9zaXggdmVyc2lvblxuZXhwb3J0cy5yZWxhdGl2ZSA9IGZ1bmN0aW9uKGZyb20sIHRvKSB7XG4gIGZyb20gPSBleHBvcnRzLnJlc29sdmUoZnJvbSkuc3Vic3RyKDEpO1xuICB0byA9IGV4cG9ydHMucmVzb2x2ZSh0bykuc3Vic3RyKDEpO1xuXG4gIGZ1bmN0aW9uIHRyaW0oYXJyKSB7XG4gICAgdmFyIHN0YXJ0ID0gMDtcbiAgICBmb3IgKDsgc3RhcnQgPCBhcnIubGVuZ3RoOyBzdGFydCsrKSB7XG4gICAgICBpZiAoYXJyW3N0YXJ0XSAhPT0gJycpIGJyZWFrO1xuICAgIH1cblxuICAgIHZhciBlbmQgPSBhcnIubGVuZ3RoIC0gMTtcbiAgICBmb3IgKDsgZW5kID49IDA7IGVuZC0tKSB7XG4gICAgICBpZiAoYXJyW2VuZF0gIT09ICcnKSBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoc3RhcnQgPiBlbmQpIHJldHVybiBbXTtcbiAgICByZXR1cm4gYXJyLnNsaWNlKHN0YXJ0LCBlbmQgLSBzdGFydCArIDEpO1xuICB9XG5cbiAgdmFyIGZyb21QYXJ0cyA9IHRyaW0oZnJvbS5zcGxpdCgnLycpKTtcbiAgdmFyIHRvUGFydHMgPSB0cmltKHRvLnNwbGl0KCcvJykpO1xuXG4gIHZhciBsZW5ndGggPSBNYXRoLm1pbihmcm9tUGFydHMubGVuZ3RoLCB0b1BhcnRzLmxlbmd0aCk7XG4gIHZhciBzYW1lUGFydHNMZW5ndGggPSBsZW5ndGg7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoZnJvbVBhcnRzW2ldICE9PSB0b1BhcnRzW2ldKSB7XG4gICAgICBzYW1lUGFydHNMZW5ndGggPSBpO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgdmFyIG91dHB1dFBhcnRzID0gW107XG4gIGZvciAodmFyIGkgPSBzYW1lUGFydHNMZW5ndGg7IGkgPCBmcm9tUGFydHMubGVuZ3RoOyBpKyspIHtcbiAgICBvdXRwdXRQYXJ0cy5wdXNoKCcuLicpO1xuICB9XG5cbiAgb3V0cHV0UGFydHMgPSBvdXRwdXRQYXJ0cy5jb25jYXQodG9QYXJ0cy5zbGljZShzYW1lUGFydHNMZW5ndGgpKTtcblxuICByZXR1cm4gb3V0cHV0UGFydHMuam9pbignLycpO1xufTtcblxuZXhwb3J0cy5zZXAgPSAnLyc7XG5leHBvcnRzLmRlbGltaXRlciA9ICc6JztcblxuZXhwb3J0cy5kaXJuYW1lID0gZnVuY3Rpb24ocGF0aCkge1xuICB2YXIgcmVzdWx0ID0gc3BsaXRQYXRoKHBhdGgpLFxuICAgICAgcm9vdCA9IHJlc3VsdFswXSxcbiAgICAgIGRpciA9IHJlc3VsdFsxXTtcblxuICBpZiAoIXJvb3QgJiYgIWRpcikge1xuICAgIC8vIE5vIGRpcm5hbWUgd2hhdHNvZXZlclxuICAgIHJldHVybiAnLic7XG4gIH1cblxuICBpZiAoZGlyKSB7XG4gICAgLy8gSXQgaGFzIGEgZGlybmFtZSwgc3RyaXAgdHJhaWxpbmcgc2xhc2hcbiAgICBkaXIgPSBkaXIuc3Vic3RyKDAsIGRpci5sZW5ndGggLSAxKTtcbiAgfVxuXG4gIHJldHVybiByb290ICsgZGlyO1xufTtcblxuXG5leHBvcnRzLmJhc2VuYW1lID0gZnVuY3Rpb24ocGF0aCwgZXh0KSB7XG4gIHZhciBmID0gc3BsaXRQYXRoKHBhdGgpWzJdO1xuICAvLyBUT0RPOiBtYWtlIHRoaXMgY29tcGFyaXNvbiBjYXNlLWluc2Vuc2l0aXZlIG9uIHdpbmRvd3M/XG4gIGlmIChleHQgJiYgZi5zdWJzdHIoLTEgKiBleHQubGVuZ3RoKSA9PT0gZXh0KSB7XG4gICAgZiA9IGYuc3Vic3RyKDAsIGYubGVuZ3RoIC0gZXh0Lmxlbmd0aCk7XG4gIH1cbiAgcmV0dXJuIGY7XG59O1xuXG5cbmV4cG9ydHMuZXh0bmFtZSA9IGZ1bmN0aW9uKHBhdGgpIHtcbiAgcmV0dXJuIHNwbGl0UGF0aChwYXRoKVszXTtcbn07XG5cbmZ1bmN0aW9uIGZpbHRlciAoeHMsIGYpIHtcbiAgICBpZiAoeHMuZmlsdGVyKSByZXR1cm4geHMuZmlsdGVyKGYpO1xuICAgIHZhciByZXMgPSBbXTtcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIGlmIChmKHhzW2ldLCBpLCB4cykpIHJlcy5wdXNoKHhzW2ldKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlcztcbn1cblxuLy8gU3RyaW5nLnByb3RvdHlwZS5zdWJzdHIgLSBuZWdhdGl2ZSBpbmRleCBkb24ndCB3b3JrIGluIElFOFxudmFyIHN1YnN0ciA9ICdhYicuc3Vic3RyKC0xKSA9PT0gJ2InXG4gICAgPyBmdW5jdGlvbiAoc3RyLCBzdGFydCwgbGVuKSB7IHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pIH1cbiAgICA6IGZ1bmN0aW9uIChzdHIsIHN0YXJ0LCBsZW4pIHtcbiAgICAgICAgaWYgKHN0YXJ0IDwgMCkgc3RhcnQgPSBzdHIubGVuZ3RoICsgc3RhcnQ7XG4gICAgICAgIHJldHVybiBzdHIuc3Vic3RyKHN0YXJ0LCBsZW4pO1xuICAgIH1cbjtcblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIikpIiwiLy8gc2hpbSBmb3IgdXNpbmcgcHJvY2VzcyBpbiBicm93c2VyXG5cbnZhciBwcm9jZXNzID0gbW9kdWxlLmV4cG9ydHMgPSB7fTtcblxucHJvY2Vzcy5uZXh0VGljayA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGNhblNldEltbWVkaWF0ZSA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnNldEltbWVkaWF0ZTtcbiAgICB2YXIgY2FuUG9zdCA9IHR5cGVvZiB3aW5kb3cgIT09ICd1bmRlZmluZWQnXG4gICAgJiYgd2luZG93LnBvc3RNZXNzYWdlICYmIHdpbmRvdy5hZGRFdmVudExpc3RlbmVyXG4gICAgO1xuXG4gICAgaWYgKGNhblNldEltbWVkaWF0ZSkge1xuICAgICAgICByZXR1cm4gZnVuY3Rpb24gKGYpIHsgcmV0dXJuIHdpbmRvdy5zZXRJbW1lZGlhdGUoZikgfTtcbiAgICB9XG5cbiAgICBpZiAoY2FuUG9zdCkge1xuICAgICAgICB2YXIgcXVldWUgPSBbXTtcbiAgICAgICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoJ21lc3NhZ2UnLCBmdW5jdGlvbiAoZXYpIHtcbiAgICAgICAgICAgIHZhciBzb3VyY2UgPSBldi5zb3VyY2U7XG4gICAgICAgICAgICBpZiAoKHNvdXJjZSA9PT0gd2luZG93IHx8IHNvdXJjZSA9PT0gbnVsbCkgJiYgZXYuZGF0YSA9PT0gJ3Byb2Nlc3MtdGljaycpIHtcbiAgICAgICAgICAgICAgICBldi5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICBpZiAocXVldWUubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICB2YXIgZm4gPSBxdWV1ZS5zaGlmdCgpO1xuICAgICAgICAgICAgICAgICAgICBmbigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSwgdHJ1ZSk7XG5cbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIG5leHRUaWNrKGZuKSB7XG4gICAgICAgICAgICBxdWV1ZS5wdXNoKGZuKTtcbiAgICAgICAgICAgIHdpbmRvdy5wb3N0TWVzc2FnZSgncHJvY2Vzcy10aWNrJywgJyonKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICByZXR1cm4gZnVuY3Rpb24gbmV4dFRpY2soZm4pIHtcbiAgICAgICAgc2V0VGltZW91dChmbiwgMCk7XG4gICAgfTtcbn0pKCk7XG5cbnByb2Nlc3MudGl0bGUgPSAnYnJvd3Nlcic7XG5wcm9jZXNzLmJyb3dzZXIgPSB0cnVlO1xucHJvY2Vzcy5lbnYgPSB7fTtcbnByb2Nlc3MuYXJndiA9IFtdO1xuXG5mdW5jdGlvbiBub29wKCkge31cblxucHJvY2Vzcy5vbiA9IG5vb3A7XG5wcm9jZXNzLmFkZExpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3Mub25jZSA9IG5vb3A7XG5wcm9jZXNzLm9mZiA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUxpc3RlbmVyID0gbm9vcDtcbnByb2Nlc3MucmVtb3ZlQWxsTGlzdGVuZXJzID0gbm9vcDtcbnByb2Nlc3MuZW1pdCA9IG5vb3A7XG5cbnByb2Nlc3MuYmluZGluZyA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmJpbmRpbmcgaXMgbm90IHN1cHBvcnRlZCcpO1xufVxuXG4vLyBUT0RPKHNodHlsbWFuKVxucHJvY2Vzcy5jd2QgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAnLycgfTtcbnByb2Nlc3MuY2hkaXIgPSBmdW5jdGlvbiAoZGlyKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdwcm9jZXNzLmNoZGlyIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG4iLCIvLyBDb3B5cmlnaHQgSm95ZW50LCBJbmMuIGFuZCBvdGhlciBOb2RlIGNvbnRyaWJ1dG9ycy5cbi8vXG4vLyBQZXJtaXNzaW9uIGlzIGhlcmVieSBncmFudGVkLCBmcmVlIG9mIGNoYXJnZSwgdG8gYW55IHBlcnNvbiBvYnRhaW5pbmcgYVxuLy8gY29weSBvZiB0aGlzIHNvZnR3YXJlIGFuZCBhc3NvY2lhdGVkIGRvY3VtZW50YXRpb24gZmlsZXMgKHRoZVxuLy8gXCJTb2Z0d2FyZVwiKSwgdG8gZGVhbCBpbiB0aGUgU29mdHdhcmUgd2l0aG91dCByZXN0cmljdGlvbiwgaW5jbHVkaW5nXG4vLyB3aXRob3V0IGxpbWl0YXRpb24gdGhlIHJpZ2h0cyB0byB1c2UsIGNvcHksIG1vZGlmeSwgbWVyZ2UsIHB1Ymxpc2gsXG4vLyBkaXN0cmlidXRlLCBzdWJsaWNlbnNlLCBhbmQvb3Igc2VsbCBjb3BpZXMgb2YgdGhlIFNvZnR3YXJlLCBhbmQgdG8gcGVybWl0XG4vLyBwZXJzb25zIHRvIHdob20gdGhlIFNvZnR3YXJlIGlzIGZ1cm5pc2hlZCB0byBkbyBzbywgc3ViamVjdCB0byB0aGVcbi8vIGZvbGxvd2luZyBjb25kaXRpb25zOlxuLy9cbi8vIFRoZSBhYm92ZSBjb3B5cmlnaHQgbm90aWNlIGFuZCB0aGlzIHBlcm1pc3Npb24gbm90aWNlIHNoYWxsIGJlIGluY2x1ZGVkXG4vLyBpbiBhbGwgY29waWVzIG9yIHN1YnN0YW50aWFsIHBvcnRpb25zIG9mIHRoZSBTb2Z0d2FyZS5cbi8vXG4vLyBUSEUgU09GVFdBUkUgSVMgUFJPVklERUQgXCJBUyBJU1wiLCBXSVRIT1VUIFdBUlJBTlRZIE9GIEFOWSBLSU5ELCBFWFBSRVNTXG4vLyBPUiBJTVBMSUVELCBJTkNMVURJTkcgQlVUIE5PVCBMSU1JVEVEIFRPIFRIRSBXQVJSQU5USUVTIE9GXG4vLyBNRVJDSEFOVEFCSUxJVFksIEZJVE5FU1MgRk9SIEEgUEFSVElDVUxBUiBQVVJQT1NFIEFORCBOT05JTkZSSU5HRU1FTlQuIElOXG4vLyBOTyBFVkVOVCBTSEFMTCBUSEUgQVVUSE9SUyBPUiBDT1BZUklHSFQgSE9MREVSUyBCRSBMSUFCTEUgRk9SIEFOWSBDTEFJTSxcbi8vIERBTUFHRVMgT1IgT1RIRVIgTElBQklMSVRZLCBXSEVUSEVSIElOIEFOIEFDVElPTiBPRiBDT05UUkFDVCwgVE9SVCBPUlxuLy8gT1RIRVJXSVNFLCBBUklTSU5HIEZST00sIE9VVCBPRiBPUiBJTiBDT05ORUNUSU9OIFdJVEggVEhFIFNPRlRXQVJFIE9SIFRIRVxuLy8gVVNFIE9SIE9USEVSIERFQUxJTkdTIElOIFRIRSBTT0ZUV0FSRS5cblxuJ3VzZSBzdHJpY3QnO1xuXG4vLyBJZiBvYmouaGFzT3duUHJvcGVydHkgaGFzIGJlZW4gb3ZlcnJpZGRlbiwgdGhlbiBjYWxsaW5nXG4vLyBvYmouaGFzT3duUHJvcGVydHkocHJvcCkgd2lsbCBicmVhay5cbi8vIFNlZTogaHR0cHM6Ly9naXRodWIuY29tL2pveWVudC9ub2RlL2lzc3Vlcy8xNzA3XG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHFzLCBzZXAsIGVxLCBvcHRpb25zKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICB2YXIgb2JqID0ge307XG5cbiAgaWYgKHR5cGVvZiBxcyAhPT0gJ3N0cmluZycgfHwgcXMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIG9iajtcbiAgfVxuXG4gIHZhciByZWdleHAgPSAvXFwrL2c7XG4gIHFzID0gcXMuc3BsaXQoc2VwKTtcblxuICB2YXIgbWF4S2V5cyA9IDEwMDA7XG4gIGlmIChvcHRpb25zICYmIHR5cGVvZiBvcHRpb25zLm1heEtleXMgPT09ICdudW1iZXInKSB7XG4gICAgbWF4S2V5cyA9IG9wdGlvbnMubWF4S2V5cztcbiAgfVxuXG4gIHZhciBsZW4gPSBxcy5sZW5ndGg7XG4gIC8vIG1heEtleXMgPD0gMCBtZWFucyB0aGF0IHdlIHNob3VsZCBub3QgbGltaXQga2V5cyBjb3VudFxuICBpZiAobWF4S2V5cyA+IDAgJiYgbGVuID4gbWF4S2V5cykge1xuICAgIGxlbiA9IG1heEtleXM7XG4gIH1cblxuICBmb3IgKHZhciBpID0gMDsgaSA8IGxlbjsgKytpKSB7XG4gICAgdmFyIHggPSBxc1tpXS5yZXBsYWNlKHJlZ2V4cCwgJyUyMCcpLFxuICAgICAgICBpZHggPSB4LmluZGV4T2YoZXEpLFxuICAgICAgICBrc3RyLCB2c3RyLCBrLCB2O1xuXG4gICAgaWYgKGlkeCA+PSAwKSB7XG4gICAgICBrc3RyID0geC5zdWJzdHIoMCwgaWR4KTtcbiAgICAgIHZzdHIgPSB4LnN1YnN0cihpZHggKyAxKTtcbiAgICB9IGVsc2Uge1xuICAgICAga3N0ciA9IHg7XG4gICAgICB2c3RyID0gJyc7XG4gICAgfVxuXG4gICAgayA9IGRlY29kZVVSSUNvbXBvbmVudChrc3RyKTtcbiAgICB2ID0gZGVjb2RlVVJJQ29tcG9uZW50KHZzdHIpO1xuXG4gICAgaWYgKCFoYXNPd25Qcm9wZXJ0eShvYmosIGspKSB7XG4gICAgICBvYmpba10gPSB2O1xuICAgIH0gZWxzZSBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICBvYmpba10ucHVzaCh2KTtcbiAgICB9IGVsc2Uge1xuICAgICAgb2JqW2tdID0gW29ialtrXSwgdl07XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG9iajtcbn07XG5cbnZhciBpc0FycmF5ID0gQXJyYXkuaXNBcnJheSB8fCBmdW5jdGlvbiAoeHMpIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh4cykgPT09ICdbb2JqZWN0IEFycmF5XSc7XG59O1xuIiwiLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbid1c2Ugc3RyaWN0JztcblxudmFyIHN0cmluZ2lmeVByaW1pdGl2ZSA9IGZ1bmN0aW9uKHYpIHtcbiAgc3dpdGNoICh0eXBlb2Ygdikge1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gdjtcblxuICAgIGNhc2UgJ2Jvb2xlYW4nOlxuICAgICAgcmV0dXJuIHYgPyAndHJ1ZScgOiAnZmFsc2UnO1xuXG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiBpc0Zpbml0ZSh2KSA/IHYgOiAnJztcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gJyc7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gZnVuY3Rpb24ob2JqLCBzZXAsIGVxLCBuYW1lKSB7XG4gIHNlcCA9IHNlcCB8fCAnJic7XG4gIGVxID0gZXEgfHwgJz0nO1xuICBpZiAob2JqID09PSBudWxsKSB7XG4gICAgb2JqID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgaWYgKHR5cGVvZiBvYmogPT09ICdvYmplY3QnKSB7XG4gICAgcmV0dXJuIG1hcChvYmplY3RLZXlzKG9iaiksIGZ1bmN0aW9uKGspIHtcbiAgICAgIHZhciBrcyA9IGVuY29kZVVSSUNvbXBvbmVudChzdHJpbmdpZnlQcmltaXRpdmUoaykpICsgZXE7XG4gICAgICBpZiAoaXNBcnJheShvYmpba10pKSB7XG4gICAgICAgIHJldHVybiBvYmpba10ubWFwKGZ1bmN0aW9uKHYpIHtcbiAgICAgICAgICByZXR1cm4ga3MgKyBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKHYpKTtcbiAgICAgICAgfSkuam9pbihzZXApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGtzICsgZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShvYmpba10pKTtcbiAgICAgIH1cbiAgICB9KS5qb2luKHNlcCk7XG5cbiAgfVxuXG4gIGlmICghbmFtZSkgcmV0dXJuICcnO1xuICByZXR1cm4gZW5jb2RlVVJJQ29tcG9uZW50KHN0cmluZ2lmeVByaW1pdGl2ZShuYW1lKSkgKyBlcSArXG4gICAgICAgICBlbmNvZGVVUklDb21wb25lbnQoc3RyaW5naWZ5UHJpbWl0aXZlKG9iaikpO1xufTtcblxudmFyIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uICh4cykge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHhzKSA9PT0gJ1tvYmplY3QgQXJyYXldJztcbn07XG5cbmZ1bmN0aW9uIG1hcCAoeHMsIGYpIHtcbiAgaWYgKHhzLm1hcCkgcmV0dXJuIHhzLm1hcChmKTtcbiAgdmFyIHJlcyA9IFtdO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHhzLmxlbmd0aDsgaSsrKSB7XG4gICAgcmVzLnB1c2goZih4c1tpXSwgaSkpO1xuICB9XG4gIHJldHVybiByZXM7XG59XG5cbnZhciBvYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24gKG9iaikge1xuICB2YXIgcmVzID0gW107XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKG9iaiwga2V5KSkgcmVzLnB1c2goa2V5KTtcbiAgfVxuICByZXR1cm4gcmVzO1xufTtcbiIsIid1c2Ugc3RyaWN0JztcblxuZXhwb3J0cy5kZWNvZGUgPSBleHBvcnRzLnBhcnNlID0gcmVxdWlyZSgnLi9kZWNvZGUnKTtcbmV4cG9ydHMuZW5jb2RlID0gZXhwb3J0cy5zdHJpbmdpZnkgPSByZXF1aXJlKCcuL2VuY29kZScpO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBpc0J1ZmZlcihhcmcpIHtcbiAgcmV0dXJuIGFyZyAmJiB0eXBlb2YgYXJnID09PSAnb2JqZWN0J1xuICAgICYmIHR5cGVvZiBhcmcuY29weSA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcuZmlsbCA9PT0gJ2Z1bmN0aW9uJ1xuICAgICYmIHR5cGVvZiBhcmcucmVhZFVJbnQ4ID09PSAnZnVuY3Rpb24nO1xufSIsIihmdW5jdGlvbiAocHJvY2VzcyxnbG9iYWwpe1xuLy8gQ29weXJpZ2h0IEpveWVudCwgSW5jLiBhbmQgb3RoZXIgTm9kZSBjb250cmlidXRvcnMuXG4vL1xuLy8gUGVybWlzc2lvbiBpcyBoZXJlYnkgZ3JhbnRlZCwgZnJlZSBvZiBjaGFyZ2UsIHRvIGFueSBwZXJzb24gb2J0YWluaW5nIGFcbi8vIGNvcHkgb2YgdGhpcyBzb2Z0d2FyZSBhbmQgYXNzb2NpYXRlZCBkb2N1bWVudGF0aW9uIGZpbGVzICh0aGVcbi8vIFwiU29mdHdhcmVcIiksIHRvIGRlYWwgaW4gdGhlIFNvZnR3YXJlIHdpdGhvdXQgcmVzdHJpY3Rpb24sIGluY2x1ZGluZ1xuLy8gd2l0aG91dCBsaW1pdGF0aW9uIHRoZSByaWdodHMgdG8gdXNlLCBjb3B5LCBtb2RpZnksIG1lcmdlLCBwdWJsaXNoLFxuLy8gZGlzdHJpYnV0ZSwgc3VibGljZW5zZSwgYW5kL29yIHNlbGwgY29waWVzIG9mIHRoZSBTb2Z0d2FyZSwgYW5kIHRvIHBlcm1pdFxuLy8gcGVyc29ucyB0byB3aG9tIHRoZSBTb2Z0d2FyZSBpcyBmdXJuaXNoZWQgdG8gZG8gc28sIHN1YmplY3QgdG8gdGhlXG4vLyBmb2xsb3dpbmcgY29uZGl0aW9uczpcbi8vXG4vLyBUaGUgYWJvdmUgY29weXJpZ2h0IG5vdGljZSBhbmQgdGhpcyBwZXJtaXNzaW9uIG5vdGljZSBzaGFsbCBiZSBpbmNsdWRlZFxuLy8gaW4gYWxsIGNvcGllcyBvciBzdWJzdGFudGlhbCBwb3J0aW9ucyBvZiB0aGUgU29mdHdhcmUuXG4vL1xuLy8gVEhFIFNPRlRXQVJFIElTIFBST1ZJREVEIFwiQVMgSVNcIiwgV0lUSE9VVCBXQVJSQU5UWSBPRiBBTlkgS0lORCwgRVhQUkVTU1xuLy8gT1IgSU1QTElFRCwgSU5DTFVESU5HIEJVVCBOT1QgTElNSVRFRCBUTyBUSEUgV0FSUkFOVElFUyBPRlxuLy8gTUVSQ0hBTlRBQklMSVRZLCBGSVRORVNTIEZPUiBBIFBBUlRJQ1VMQVIgUFVSUE9TRSBBTkQgTk9OSU5GUklOR0VNRU5ULiBJTlxuLy8gTk8gRVZFTlQgU0hBTEwgVEhFIEFVVEhPUlMgT1IgQ09QWVJJR0hUIEhPTERFUlMgQkUgTElBQkxFIEZPUiBBTlkgQ0xBSU0sXG4vLyBEQU1BR0VTIE9SIE9USEVSIExJQUJJTElUWSwgV0hFVEhFUiBJTiBBTiBBQ1RJT04gT0YgQ09OVFJBQ1QsIFRPUlQgT1Jcbi8vIE9USEVSV0lTRSwgQVJJU0lORyBGUk9NLCBPVVQgT0YgT1IgSU4gQ09OTkVDVElPTiBXSVRIIFRIRSBTT0ZUV0FSRSBPUiBUSEVcbi8vIFVTRSBPUiBPVEhFUiBERUFMSU5HUyBJTiBUSEUgU09GVFdBUkUuXG5cbnZhciBmb3JtYXRSZWdFeHAgPSAvJVtzZGolXS9nO1xuZXhwb3J0cy5mb3JtYXQgPSBmdW5jdGlvbihmKSB7XG4gIGlmICghaXNTdHJpbmcoZikpIHtcbiAgICB2YXIgb2JqZWN0cyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgYXJndW1lbnRzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBvYmplY3RzLnB1c2goaW5zcGVjdChhcmd1bWVudHNbaV0pKTtcbiAgICB9XG4gICAgcmV0dXJuIG9iamVjdHMuam9pbignICcpO1xuICB9XG5cbiAgdmFyIGkgPSAxO1xuICB2YXIgYXJncyA9IGFyZ3VtZW50cztcbiAgdmFyIGxlbiA9IGFyZ3MubGVuZ3RoO1xuICB2YXIgc3RyID0gU3RyaW5nKGYpLnJlcGxhY2UoZm9ybWF0UmVnRXhwLCBmdW5jdGlvbih4KSB7XG4gICAgaWYgKHggPT09ICclJScpIHJldHVybiAnJSc7XG4gICAgaWYgKGkgPj0gbGVuKSByZXR1cm4geDtcbiAgICBzd2l0Y2ggKHgpIHtcbiAgICAgIGNhc2UgJyVzJzogcmV0dXJuIFN0cmluZyhhcmdzW2krK10pO1xuICAgICAgY2FzZSAnJWQnOiByZXR1cm4gTnVtYmVyKGFyZ3NbaSsrXSk7XG4gICAgICBjYXNlICclaic6XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KGFyZ3NbaSsrXSk7XG4gICAgICAgIH0gY2F0Y2ggKF8pIHtcbiAgICAgICAgICByZXR1cm4gJ1tDaXJjdWxhcl0nO1xuICAgICAgICB9XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4geDtcbiAgICB9XG4gIH0pO1xuICBmb3IgKHZhciB4ID0gYXJnc1tpXTsgaSA8IGxlbjsgeCA9IGFyZ3NbKytpXSkge1xuICAgIGlmIChpc051bGwoeCkgfHwgIWlzT2JqZWN0KHgpKSB7XG4gICAgICBzdHIgKz0gJyAnICsgeDtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyICs9ICcgJyArIGluc3BlY3QoeCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBzdHI7XG59O1xuXG5cbi8vIE1hcmsgdGhhdCBhIG1ldGhvZCBzaG91bGQgbm90IGJlIHVzZWQuXG4vLyBSZXR1cm5zIGEgbW9kaWZpZWQgZnVuY3Rpb24gd2hpY2ggd2FybnMgb25jZSBieSBkZWZhdWx0LlxuLy8gSWYgLS1uby1kZXByZWNhdGlvbiBpcyBzZXQsIHRoZW4gaXQgaXMgYSBuby1vcC5cbmV4cG9ydHMuZGVwcmVjYXRlID0gZnVuY3Rpb24oZm4sIG1zZykge1xuICAvLyBBbGxvdyBmb3IgZGVwcmVjYXRpbmcgdGhpbmdzIGluIHRoZSBwcm9jZXNzIG9mIHN0YXJ0aW5nIHVwLlxuICBpZiAoaXNVbmRlZmluZWQoZ2xvYmFsLnByb2Nlc3MpKSB7XG4gICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgcmV0dXJuIGV4cG9ydHMuZGVwcmVjYXRlKGZuLCBtc2cpLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcbiAgfVxuXG4gIGlmIChwcm9jZXNzLm5vRGVwcmVjYXRpb24gPT09IHRydWUpIHtcbiAgICByZXR1cm4gZm47XG4gIH1cblxuICB2YXIgd2FybmVkID0gZmFsc2U7XG4gIGZ1bmN0aW9uIGRlcHJlY2F0ZWQoKSB7XG4gICAgaWYgKCF3YXJuZWQpIHtcbiAgICAgIGlmIChwcm9jZXNzLnRocm93RGVwcmVjYXRpb24pIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKG1zZyk7XG4gICAgICB9IGVsc2UgaWYgKHByb2Nlc3MudHJhY2VEZXByZWNhdGlvbikge1xuICAgICAgICBjb25zb2xlLnRyYWNlKG1zZyk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBjb25zb2xlLmVycm9yKG1zZyk7XG4gICAgICB9XG4gICAgICB3YXJuZWQgPSB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZm4uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgfVxuXG4gIHJldHVybiBkZXByZWNhdGVkO1xufTtcblxuXG52YXIgZGVidWdzID0ge307XG52YXIgZGVidWdFbnZpcm9uO1xuZXhwb3J0cy5kZWJ1Z2xvZyA9IGZ1bmN0aW9uKHNldCkge1xuICBpZiAoaXNVbmRlZmluZWQoZGVidWdFbnZpcm9uKSlcbiAgICBkZWJ1Z0Vudmlyb24gPSBwcm9jZXNzLmVudi5OT0RFX0RFQlVHIHx8ICcnO1xuICBzZXQgPSBzZXQudG9VcHBlckNhc2UoKTtcbiAgaWYgKCFkZWJ1Z3Nbc2V0XSkge1xuICAgIGlmIChuZXcgUmVnRXhwKCdcXFxcYicgKyBzZXQgKyAnXFxcXGInLCAnaScpLnRlc3QoZGVidWdFbnZpcm9uKSkge1xuICAgICAgdmFyIHBpZCA9IHByb2Nlc3MucGlkO1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIG1zZyA9IGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cyk7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoJyVzICVkOiAlcycsIHNldCwgcGlkLCBtc2cpO1xuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgZGVidWdzW3NldF0gPSBmdW5jdGlvbigpIHt9O1xuICAgIH1cbiAgfVxuICByZXR1cm4gZGVidWdzW3NldF07XG59O1xuXG5cbi8qKlxuICogRWNob3MgdGhlIHZhbHVlIG9mIGEgdmFsdWUuIFRyeXMgdG8gcHJpbnQgdGhlIHZhbHVlIG91dFxuICogaW4gdGhlIGJlc3Qgd2F5IHBvc3NpYmxlIGdpdmVuIHRoZSBkaWZmZXJlbnQgdHlwZXMuXG4gKlxuICogQHBhcmFtIHtPYmplY3R9IG9iaiBUaGUgb2JqZWN0IHRvIHByaW50IG91dC5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRzIE9wdGlvbmFsIG9wdGlvbnMgb2JqZWN0IHRoYXQgYWx0ZXJzIHRoZSBvdXRwdXQuXG4gKi9cbi8qIGxlZ2FjeTogb2JqLCBzaG93SGlkZGVuLCBkZXB0aCwgY29sb3JzKi9cbmZ1bmN0aW9uIGluc3BlY3Qob2JqLCBvcHRzKSB7XG4gIC8vIGRlZmF1bHQgb3B0aW9uc1xuICB2YXIgY3R4ID0ge1xuICAgIHNlZW46IFtdLFxuICAgIHN0eWxpemU6IHN0eWxpemVOb0NvbG9yXG4gIH07XG4gIC8vIGxlZ2FjeS4uLlxuICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+PSAzKSBjdHguZGVwdGggPSBhcmd1bWVudHNbMl07XG4gIGlmIChhcmd1bWVudHMubGVuZ3RoID49IDQpIGN0eC5jb2xvcnMgPSBhcmd1bWVudHNbM107XG4gIGlmIChpc0Jvb2xlYW4ob3B0cykpIHtcbiAgICAvLyBsZWdhY3kuLi5cbiAgICBjdHguc2hvd0hpZGRlbiA9IG9wdHM7XG4gIH0gZWxzZSBpZiAob3B0cykge1xuICAgIC8vIGdvdCBhbiBcIm9wdGlvbnNcIiBvYmplY3RcbiAgICBleHBvcnRzLl9leHRlbmQoY3R4LCBvcHRzKTtcbiAgfVxuICAvLyBzZXQgZGVmYXVsdCBvcHRpb25zXG4gIGlmIChpc1VuZGVmaW5lZChjdHguc2hvd0hpZGRlbikpIGN0eC5zaG93SGlkZGVuID0gZmFsc2U7XG4gIGlmIChpc1VuZGVmaW5lZChjdHguZGVwdGgpKSBjdHguZGVwdGggPSAyO1xuICBpZiAoaXNVbmRlZmluZWQoY3R4LmNvbG9ycykpIGN0eC5jb2xvcnMgPSBmYWxzZTtcbiAgaWYgKGlzVW5kZWZpbmVkKGN0eC5jdXN0b21JbnNwZWN0KSkgY3R4LmN1c3RvbUluc3BlY3QgPSB0cnVlO1xuICBpZiAoY3R4LmNvbG9ycykgY3R4LnN0eWxpemUgPSBzdHlsaXplV2l0aENvbG9yO1xuICByZXR1cm4gZm9ybWF0VmFsdWUoY3R4LCBvYmosIGN0eC5kZXB0aCk7XG59XG5leHBvcnRzLmluc3BlY3QgPSBpbnNwZWN0O1xuXG5cbi8vIGh0dHA6Ly9lbi53aWtpcGVkaWEub3JnL3dpa2kvQU5TSV9lc2NhcGVfY29kZSNncmFwaGljc1xuaW5zcGVjdC5jb2xvcnMgPSB7XG4gICdib2xkJyA6IFsxLCAyMl0sXG4gICdpdGFsaWMnIDogWzMsIDIzXSxcbiAgJ3VuZGVybGluZScgOiBbNCwgMjRdLFxuICAnaW52ZXJzZScgOiBbNywgMjddLFxuICAnd2hpdGUnIDogWzM3LCAzOV0sXG4gICdncmV5JyA6IFs5MCwgMzldLFxuICAnYmxhY2snIDogWzMwLCAzOV0sXG4gICdibHVlJyA6IFszNCwgMzldLFxuICAnY3lhbicgOiBbMzYsIDM5XSxcbiAgJ2dyZWVuJyA6IFszMiwgMzldLFxuICAnbWFnZW50YScgOiBbMzUsIDM5XSxcbiAgJ3JlZCcgOiBbMzEsIDM5XSxcbiAgJ3llbGxvdycgOiBbMzMsIDM5XVxufTtcblxuLy8gRG9uJ3QgdXNlICdibHVlJyBub3QgdmlzaWJsZSBvbiBjbWQuZXhlXG5pbnNwZWN0LnN0eWxlcyA9IHtcbiAgJ3NwZWNpYWwnOiAnY3lhbicsXG4gICdudW1iZXInOiAneWVsbG93JyxcbiAgJ2Jvb2xlYW4nOiAneWVsbG93JyxcbiAgJ3VuZGVmaW5lZCc6ICdncmV5JyxcbiAgJ251bGwnOiAnYm9sZCcsXG4gICdzdHJpbmcnOiAnZ3JlZW4nLFxuICAnZGF0ZSc6ICdtYWdlbnRhJyxcbiAgLy8gXCJuYW1lXCI6IGludGVudGlvbmFsbHkgbm90IHN0eWxpbmdcbiAgJ3JlZ2V4cCc6ICdyZWQnXG59O1xuXG5cbmZ1bmN0aW9uIHN0eWxpemVXaXRoQ29sb3Ioc3RyLCBzdHlsZVR5cGUpIHtcbiAgdmFyIHN0eWxlID0gaW5zcGVjdC5zdHlsZXNbc3R5bGVUeXBlXTtcblxuICBpZiAoc3R5bGUpIHtcbiAgICByZXR1cm4gJ1xcdTAwMWJbJyArIGluc3BlY3QuY29sb3JzW3N0eWxlXVswXSArICdtJyArIHN0ciArXG4gICAgICAgICAgICdcXHUwMDFiWycgKyBpbnNwZWN0LmNvbG9yc1tzdHlsZV1bMV0gKyAnbSc7XG4gIH0gZWxzZSB7XG4gICAgcmV0dXJuIHN0cjtcbiAgfVxufVxuXG5cbmZ1bmN0aW9uIHN0eWxpemVOb0NvbG9yKHN0ciwgc3R5bGVUeXBlKSB7XG4gIHJldHVybiBzdHI7XG59XG5cblxuZnVuY3Rpb24gYXJyYXlUb0hhc2goYXJyYXkpIHtcbiAgdmFyIGhhc2ggPSB7fTtcblxuICBhcnJheS5mb3JFYWNoKGZ1bmN0aW9uKHZhbCwgaWR4KSB7XG4gICAgaGFzaFt2YWxdID0gdHJ1ZTtcbiAgfSk7XG5cbiAgcmV0dXJuIGhhc2g7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0VmFsdWUoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzKSB7XG4gIC8vIFByb3ZpZGUgYSBob29rIGZvciB1c2VyLXNwZWNpZmllZCBpbnNwZWN0IGZ1bmN0aW9ucy5cbiAgLy8gQ2hlY2sgdGhhdCB2YWx1ZSBpcyBhbiBvYmplY3Qgd2l0aCBhbiBpbnNwZWN0IGZ1bmN0aW9uIG9uIGl0XG4gIGlmIChjdHguY3VzdG9tSW5zcGVjdCAmJlxuICAgICAgdmFsdWUgJiZcbiAgICAgIGlzRnVuY3Rpb24odmFsdWUuaW5zcGVjdCkgJiZcbiAgICAgIC8vIEZpbHRlciBvdXQgdGhlIHV0aWwgbW9kdWxlLCBpdCdzIGluc3BlY3QgZnVuY3Rpb24gaXMgc3BlY2lhbFxuICAgICAgdmFsdWUuaW5zcGVjdCAhPT0gZXhwb3J0cy5pbnNwZWN0ICYmXG4gICAgICAvLyBBbHNvIGZpbHRlciBvdXQgYW55IHByb3RvdHlwZSBvYmplY3RzIHVzaW5nIHRoZSBjaXJjdWxhciBjaGVjay5cbiAgICAgICEodmFsdWUuY29uc3RydWN0b3IgJiYgdmFsdWUuY29uc3RydWN0b3IucHJvdG90eXBlID09PSB2YWx1ZSkpIHtcbiAgICB2YXIgcmV0ID0gdmFsdWUuaW5zcGVjdChyZWN1cnNlVGltZXMsIGN0eCk7XG4gICAgaWYgKCFpc1N0cmluZyhyZXQpKSB7XG4gICAgICByZXQgPSBmb3JtYXRWYWx1ZShjdHgsIHJldCwgcmVjdXJzZVRpbWVzKTtcbiAgICB9XG4gICAgcmV0dXJuIHJldDtcbiAgfVxuXG4gIC8vIFByaW1pdGl2ZSB0eXBlcyBjYW5ub3QgaGF2ZSBwcm9wZXJ0aWVzXG4gIHZhciBwcmltaXRpdmUgPSBmb3JtYXRQcmltaXRpdmUoY3R4LCB2YWx1ZSk7XG4gIGlmIChwcmltaXRpdmUpIHtcbiAgICByZXR1cm4gcHJpbWl0aXZlO1xuICB9XG5cbiAgLy8gTG9vayB1cCB0aGUga2V5cyBvZiB0aGUgb2JqZWN0LlxuICB2YXIga2V5cyA9IE9iamVjdC5rZXlzKHZhbHVlKTtcbiAgdmFyIHZpc2libGVLZXlzID0gYXJyYXlUb0hhc2goa2V5cyk7XG5cbiAgaWYgKGN0eC5zaG93SGlkZGVuKSB7XG4gICAga2V5cyA9IE9iamVjdC5nZXRPd25Qcm9wZXJ0eU5hbWVzKHZhbHVlKTtcbiAgfVxuXG4gIC8vIElFIGRvZXNuJ3QgbWFrZSBlcnJvciBmaWVsZHMgbm9uLWVudW1lcmFibGVcbiAgLy8gaHR0cDovL21zZG4ubWljcm9zb2Z0LmNvbS9lbi11cy9saWJyYXJ5L2llL2R3dzUyc2J0KHY9dnMuOTQpLmFzcHhcbiAgaWYgKGlzRXJyb3IodmFsdWUpXG4gICAgICAmJiAoa2V5cy5pbmRleE9mKCdtZXNzYWdlJykgPj0gMCB8fCBrZXlzLmluZGV4T2YoJ2Rlc2NyaXB0aW9uJykgPj0gMCkpIHtcbiAgICByZXR1cm4gZm9ybWF0RXJyb3IodmFsdWUpO1xuICB9XG5cbiAgLy8gU29tZSB0eXBlIG9mIG9iamVjdCB3aXRob3V0IHByb3BlcnRpZXMgY2FuIGJlIHNob3J0Y3V0dGVkLlxuICBpZiAoa2V5cy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAoaXNGdW5jdGlvbih2YWx1ZSkpIHtcbiAgICAgIHZhciBuYW1lID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoJ1tGdW5jdGlvbicgKyBuYW1lICsgJ10nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgICByZXR1cm4gY3R4LnN0eWxpemUoUmVnRXhwLnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbHVlKSwgJ3JlZ2V4cCcpO1xuICAgIH1cbiAgICBpZiAoaXNEYXRlKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKERhdGUucHJvdG90eXBlLnRvU3RyaW5nLmNhbGwodmFsdWUpLCAnZGF0ZScpO1xuICAgIH1cbiAgICBpZiAoaXNFcnJvcih2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgdmFyIGJhc2UgPSAnJywgYXJyYXkgPSBmYWxzZSwgYnJhY2VzID0gWyd7JywgJ30nXTtcblxuICAvLyBNYWtlIEFycmF5IHNheSB0aGF0IHRoZXkgYXJlIEFycmF5XG4gIGlmIChpc0FycmF5KHZhbHVlKSkge1xuICAgIGFycmF5ID0gdHJ1ZTtcbiAgICBicmFjZXMgPSBbJ1snLCAnXSddO1xuICB9XG5cbiAgLy8gTWFrZSBmdW5jdGlvbnMgc2F5IHRoYXQgdGhleSBhcmUgZnVuY3Rpb25zXG4gIGlmIChpc0Z1bmN0aW9uKHZhbHVlKSkge1xuICAgIHZhciBuID0gdmFsdWUubmFtZSA/ICc6ICcgKyB2YWx1ZS5uYW1lIDogJyc7XG4gICAgYmFzZSA9ICcgW0Z1bmN0aW9uJyArIG4gKyAnXSc7XG4gIH1cblxuICAvLyBNYWtlIFJlZ0V4cHMgc2F5IHRoYXQgdGhleSBhcmUgUmVnRXhwc1xuICBpZiAoaXNSZWdFeHAodmFsdWUpKSB7XG4gICAgYmFzZSA9ICcgJyArIFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGRhdGVzIHdpdGggcHJvcGVydGllcyBmaXJzdCBzYXkgdGhlIGRhdGVcbiAgaWYgKGlzRGF0ZSh2YWx1ZSkpIHtcbiAgICBiYXNlID0gJyAnICsgRGF0ZS5wcm90b3R5cGUudG9VVENTdHJpbmcuY2FsbCh2YWx1ZSk7XG4gIH1cblxuICAvLyBNYWtlIGVycm9yIHdpdGggbWVzc2FnZSBmaXJzdCBzYXkgdGhlIGVycm9yXG4gIGlmIChpc0Vycm9yKHZhbHVlKSkge1xuICAgIGJhc2UgPSAnICcgKyBmb3JtYXRFcnJvcih2YWx1ZSk7XG4gIH1cblxuICBpZiAoa2V5cy5sZW5ndGggPT09IDAgJiYgKCFhcnJheSB8fCB2YWx1ZS5sZW5ndGggPT0gMCkpIHtcbiAgICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArIGJyYWNlc1sxXTtcbiAgfVxuXG4gIGlmIChyZWN1cnNlVGltZXMgPCAwKSB7XG4gICAgaWYgKGlzUmVnRXhwKHZhbHVlKSkge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKFJlZ0V4cC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSksICdyZWdleHAnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGN0eC5zdHlsaXplKCdbT2JqZWN0XScsICdzcGVjaWFsJyk7XG4gICAgfVxuICB9XG5cbiAgY3R4LnNlZW4ucHVzaCh2YWx1ZSk7XG5cbiAgdmFyIG91dHB1dDtcbiAgaWYgKGFycmF5KSB7XG4gICAgb3V0cHV0ID0gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cyk7XG4gIH0gZWxzZSB7XG4gICAgb3V0cHV0ID0ga2V5cy5tYXAoZnVuY3Rpb24oa2V5KSB7XG4gICAgICByZXR1cm4gZm9ybWF0UHJvcGVydHkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5LCBhcnJheSk7XG4gICAgfSk7XG4gIH1cblxuICBjdHguc2Vlbi5wb3AoKTtcblxuICByZXR1cm4gcmVkdWNlVG9TaW5nbGVTdHJpbmcob3V0cHV0LCBiYXNlLCBicmFjZXMpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdFByaW1pdGl2ZShjdHgsIHZhbHVlKSB7XG4gIGlmIChpc1VuZGVmaW5lZCh2YWx1ZSkpXG4gICAgcmV0dXJuIGN0eC5zdHlsaXplKCd1bmRlZmluZWQnLCAndW5kZWZpbmVkJyk7XG4gIGlmIChpc1N0cmluZyh2YWx1ZSkpIHtcbiAgICB2YXIgc2ltcGxlID0gJ1xcJycgKyBKU09OLnN0cmluZ2lmeSh2YWx1ZSkucmVwbGFjZSgvXlwifFwiJC9nLCAnJylcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKC9cXFxcXCIvZywgJ1wiJykgKyAnXFwnJztcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoc2ltcGxlLCAnc3RyaW5nJyk7XG4gIH1cbiAgaWYgKGlzTnVtYmVyKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ251bWJlcicpO1xuICBpZiAoaXNCb29sZWFuKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJycgKyB2YWx1ZSwgJ2Jvb2xlYW4nKTtcbiAgLy8gRm9yIHNvbWUgcmVhc29uIHR5cGVvZiBudWxsIGlzIFwib2JqZWN0XCIsIHNvIHNwZWNpYWwgY2FzZSBoZXJlLlxuICBpZiAoaXNOdWxsKHZhbHVlKSlcbiAgICByZXR1cm4gY3R4LnN0eWxpemUoJ251bGwnLCAnbnVsbCcpO1xufVxuXG5cbmZ1bmN0aW9uIGZvcm1hdEVycm9yKHZhbHVlKSB7XG4gIHJldHVybiAnWycgKyBFcnJvci5wcm90b3R5cGUudG9TdHJpbmcuY2FsbCh2YWx1ZSkgKyAnXSc7XG59XG5cblxuZnVuY3Rpb24gZm9ybWF0QXJyYXkoY3R4LCB2YWx1ZSwgcmVjdXJzZVRpbWVzLCB2aXNpYmxlS2V5cywga2V5cykge1xuICB2YXIgb3V0cHV0ID0gW107XG4gIGZvciAodmFyIGkgPSAwLCBsID0gdmFsdWUubGVuZ3RoOyBpIDwgbDsgKytpKSB7XG4gICAgaWYgKGhhc093blByb3BlcnR5KHZhbHVlLCBTdHJpbmcoaSkpKSB7XG4gICAgICBvdXRwdXQucHVzaChmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLFxuICAgICAgICAgIFN0cmluZyhpKSwgdHJ1ZSkpO1xuICAgIH0gZWxzZSB7XG4gICAgICBvdXRwdXQucHVzaCgnJyk7XG4gICAgfVxuICB9XG4gIGtleXMuZm9yRWFjaChmdW5jdGlvbihrZXkpIHtcbiAgICBpZiAoIWtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIG91dHB1dC5wdXNoKGZvcm1hdFByb3BlcnR5KGN0eCwgdmFsdWUsIHJlY3Vyc2VUaW1lcywgdmlzaWJsZUtleXMsXG4gICAgICAgICAga2V5LCB0cnVlKSk7XG4gICAgfVxuICB9KTtcbiAgcmV0dXJuIG91dHB1dDtcbn1cblxuXG5mdW5jdGlvbiBmb3JtYXRQcm9wZXJ0eShjdHgsIHZhbHVlLCByZWN1cnNlVGltZXMsIHZpc2libGVLZXlzLCBrZXksIGFycmF5KSB7XG4gIHZhciBuYW1lLCBzdHIsIGRlc2M7XG4gIGRlc2MgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpIHx8IHsgdmFsdWU6IHZhbHVlW2tleV0gfTtcbiAgaWYgKGRlc2MuZ2V0KSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW0dldHRlci9TZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RyID0gY3R4LnN0eWxpemUoJ1tHZXR0ZXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKGRlc2Muc2V0KSB7XG4gICAgICBzdHIgPSBjdHguc3R5bGl6ZSgnW1NldHRlcl0nLCAnc3BlY2lhbCcpO1xuICAgIH1cbiAgfVxuICBpZiAoIWhhc093blByb3BlcnR5KHZpc2libGVLZXlzLCBrZXkpKSB7XG4gICAgbmFtZSA9ICdbJyArIGtleSArICddJztcbiAgfVxuICBpZiAoIXN0cikge1xuICAgIGlmIChjdHguc2Vlbi5pbmRleE9mKGRlc2MudmFsdWUpIDwgMCkge1xuICAgICAgaWYgKGlzTnVsbChyZWN1cnNlVGltZXMpKSB7XG4gICAgICAgIHN0ciA9IGZvcm1hdFZhbHVlKGN0eCwgZGVzYy52YWx1ZSwgbnVsbCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzdHIgPSBmb3JtYXRWYWx1ZShjdHgsIGRlc2MudmFsdWUsIHJlY3Vyc2VUaW1lcyAtIDEpO1xuICAgICAgfVxuICAgICAgaWYgKHN0ci5pbmRleE9mKCdcXG4nKSA+IC0xKSB7XG4gICAgICAgIGlmIChhcnJheSkge1xuICAgICAgICAgIHN0ciA9IHN0ci5zcGxpdCgnXFxuJykubWFwKGZ1bmN0aW9uKGxpbmUpIHtcbiAgICAgICAgICAgIHJldHVybiAnICAnICsgbGluZTtcbiAgICAgICAgICB9KS5qb2luKCdcXG4nKS5zdWJzdHIoMik7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgc3RyID0gJ1xcbicgKyBzdHIuc3BsaXQoJ1xcbicpLm1hcChmdW5jdGlvbihsaW5lKSB7XG4gICAgICAgICAgICByZXR1cm4gJyAgICcgKyBsaW5lO1xuICAgICAgICAgIH0pLmpvaW4oJ1xcbicpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0ciA9IGN0eC5zdHlsaXplKCdbQ2lyY3VsYXJdJywgJ3NwZWNpYWwnKTtcbiAgICB9XG4gIH1cbiAgaWYgKGlzVW5kZWZpbmVkKG5hbWUpKSB7XG4gICAgaWYgKGFycmF5ICYmIGtleS5tYXRjaCgvXlxcZCskLykpIHtcbiAgICAgIHJldHVybiBzdHI7XG4gICAgfVxuICAgIG5hbWUgPSBKU09OLnN0cmluZ2lmeSgnJyArIGtleSk7XG4gICAgaWYgKG5hbWUubWF0Y2goL15cIihbYS16QS1aX11bYS16QS1aXzAtOV0qKVwiJC8pKSB7XG4gICAgICBuYW1lID0gbmFtZS5zdWJzdHIoMSwgbmFtZS5sZW5ndGggLSAyKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnbmFtZScpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lID0gbmFtZS5yZXBsYWNlKC8nL2csIFwiXFxcXCdcIilcbiAgICAgICAgICAgICAgICAgLnJlcGxhY2UoL1xcXFxcIi9nLCAnXCInKVxuICAgICAgICAgICAgICAgICAucmVwbGFjZSgvKF5cInxcIiQpL2csIFwiJ1wiKTtcbiAgICAgIG5hbWUgPSBjdHguc3R5bGl6ZShuYW1lLCAnc3RyaW5nJyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5hbWUgKyAnOiAnICsgc3RyO1xufVxuXG5cbmZ1bmN0aW9uIHJlZHVjZVRvU2luZ2xlU3RyaW5nKG91dHB1dCwgYmFzZSwgYnJhY2VzKSB7XG4gIHZhciBudW1MaW5lc0VzdCA9IDA7XG4gIHZhciBsZW5ndGggPSBvdXRwdXQucmVkdWNlKGZ1bmN0aW9uKHByZXYsIGN1cikge1xuICAgIG51bUxpbmVzRXN0Kys7XG4gICAgaWYgKGN1ci5pbmRleE9mKCdcXG4nKSA+PSAwKSBudW1MaW5lc0VzdCsrO1xuICAgIHJldHVybiBwcmV2ICsgY3VyLnJlcGxhY2UoL1xcdTAwMWJcXFtcXGRcXGQ/bS9nLCAnJykubGVuZ3RoICsgMTtcbiAgfSwgMCk7XG5cbiAgaWYgKGxlbmd0aCA+IDYwKSB7XG4gICAgcmV0dXJuIGJyYWNlc1swXSArXG4gICAgICAgICAgIChiYXNlID09PSAnJyA/ICcnIDogYmFzZSArICdcXG4gJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBvdXRwdXQuam9pbignLFxcbiAgJykgK1xuICAgICAgICAgICAnICcgK1xuICAgICAgICAgICBicmFjZXNbMV07XG4gIH1cblxuICByZXR1cm4gYnJhY2VzWzBdICsgYmFzZSArICcgJyArIG91dHB1dC5qb2luKCcsICcpICsgJyAnICsgYnJhY2VzWzFdO1xufVxuXG5cbi8vIE5PVEU6IFRoZXNlIHR5cGUgY2hlY2tpbmcgZnVuY3Rpb25zIGludGVudGlvbmFsbHkgZG9uJ3QgdXNlIGBpbnN0YW5jZW9mYFxuLy8gYmVjYXVzZSBpdCBpcyBmcmFnaWxlIGFuZCBjYW4gYmUgZWFzaWx5IGZha2VkIHdpdGggYE9iamVjdC5jcmVhdGUoKWAuXG5mdW5jdGlvbiBpc0FycmF5KGFyKSB7XG4gIHJldHVybiBBcnJheS5pc0FycmF5KGFyKTtcbn1cbmV4cG9ydHMuaXNBcnJheSA9IGlzQXJyYXk7XG5cbmZ1bmN0aW9uIGlzQm9vbGVhbihhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdib29sZWFuJztcbn1cbmV4cG9ydHMuaXNCb29sZWFuID0gaXNCb29sZWFuO1xuXG5mdW5jdGlvbiBpc051bGwoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IG51bGw7XG59XG5leHBvcnRzLmlzTnVsbCA9IGlzTnVsbDtcblxuZnVuY3Rpb24gaXNOdWxsT3JVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNOdWxsT3JVbmRlZmluZWQgPSBpc051bGxPclVuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNOdW1iZXIoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnbnVtYmVyJztcbn1cbmV4cG9ydHMuaXNOdW1iZXIgPSBpc051bWJlcjtcblxuZnVuY3Rpb24gaXNTdHJpbmcoYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3RyaW5nJztcbn1cbmV4cG9ydHMuaXNTdHJpbmcgPSBpc1N0cmluZztcblxuZnVuY3Rpb24gaXNTeW1ib2woYXJnKSB7XG4gIHJldHVybiB0eXBlb2YgYXJnID09PSAnc3ltYm9sJztcbn1cbmV4cG9ydHMuaXNTeW1ib2wgPSBpc1N5bWJvbDtcblxuZnVuY3Rpb24gaXNVbmRlZmluZWQoYXJnKSB7XG4gIHJldHVybiBhcmcgPT09IHZvaWQgMDtcbn1cbmV4cG9ydHMuaXNVbmRlZmluZWQgPSBpc1VuZGVmaW5lZDtcblxuZnVuY3Rpb24gaXNSZWdFeHAocmUpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KHJlKSAmJiBvYmplY3RUb1N0cmluZyhyZSkgPT09ICdbb2JqZWN0IFJlZ0V4cF0nO1xufVxuZXhwb3J0cy5pc1JlZ0V4cCA9IGlzUmVnRXhwO1xuXG5mdW5jdGlvbiBpc09iamVjdChhcmcpIHtcbiAgcmV0dXJuIHR5cGVvZiBhcmcgPT09ICdvYmplY3QnICYmIGFyZyAhPT0gbnVsbDtcbn1cbmV4cG9ydHMuaXNPYmplY3QgPSBpc09iamVjdDtcblxuZnVuY3Rpb24gaXNEYXRlKGQpIHtcbiAgcmV0dXJuIGlzT2JqZWN0KGQpICYmIG9iamVjdFRvU3RyaW5nKGQpID09PSAnW29iamVjdCBEYXRlXSc7XG59XG5leHBvcnRzLmlzRGF0ZSA9IGlzRGF0ZTtcblxuZnVuY3Rpb24gaXNFcnJvcihlKSB7XG4gIHJldHVybiBpc09iamVjdChlKSAmJlxuICAgICAgKG9iamVjdFRvU3RyaW5nKGUpID09PSAnW29iamVjdCBFcnJvcl0nIHx8IGUgaW5zdGFuY2VvZiBFcnJvcik7XG59XG5leHBvcnRzLmlzRXJyb3IgPSBpc0Vycm9yO1xuXG5mdW5jdGlvbiBpc0Z1bmN0aW9uKGFyZykge1xuICByZXR1cm4gdHlwZW9mIGFyZyA9PT0gJ2Z1bmN0aW9uJztcbn1cbmV4cG9ydHMuaXNGdW5jdGlvbiA9IGlzRnVuY3Rpb247XG5cbmZ1bmN0aW9uIGlzUHJpbWl0aXZlKGFyZykge1xuICByZXR1cm4gYXJnID09PSBudWxsIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnYm9vbGVhbicgfHxcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICdudW1iZXInIHx8XG4gICAgICAgICB0eXBlb2YgYXJnID09PSAnc3RyaW5nJyB8fFxuICAgICAgICAgdHlwZW9mIGFyZyA9PT0gJ3N5bWJvbCcgfHwgIC8vIEVTNiBzeW1ib2xcbiAgICAgICAgIHR5cGVvZiBhcmcgPT09ICd1bmRlZmluZWQnO1xufVxuZXhwb3J0cy5pc1ByaW1pdGl2ZSA9IGlzUHJpbWl0aXZlO1xuXG5leHBvcnRzLmlzQnVmZmVyID0gcmVxdWlyZSgnLi9zdXBwb3J0L2lzQnVmZmVyJyk7XG5cbmZ1bmN0aW9uIG9iamVjdFRvU3RyaW5nKG8pIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUudG9TdHJpbmcuY2FsbChvKTtcbn1cblxuXG5mdW5jdGlvbiBwYWQobikge1xuICByZXR1cm4gbiA8IDEwID8gJzAnICsgbi50b1N0cmluZygxMCkgOiBuLnRvU3RyaW5nKDEwKTtcbn1cblxuXG52YXIgbW9udGhzID0gWydKYW4nLCAnRmViJywgJ01hcicsICdBcHInLCAnTWF5JywgJ0p1bicsICdKdWwnLCAnQXVnJywgJ1NlcCcsXG4gICAgICAgICAgICAgICdPY3QnLCAnTm92JywgJ0RlYyddO1xuXG4vLyAyNiBGZWIgMTY6MTk6MzRcbmZ1bmN0aW9uIHRpbWVzdGFtcCgpIHtcbiAgdmFyIGQgPSBuZXcgRGF0ZSgpO1xuICB2YXIgdGltZSA9IFtwYWQoZC5nZXRIb3VycygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0TWludXRlcygpKSxcbiAgICAgICAgICAgICAgcGFkKGQuZ2V0U2Vjb25kcygpKV0uam9pbignOicpO1xuICByZXR1cm4gW2QuZ2V0RGF0ZSgpLCBtb250aHNbZC5nZXRNb250aCgpXSwgdGltZV0uam9pbignICcpO1xufVxuXG5cbi8vIGxvZyBpcyBqdXN0IGEgdGhpbiB3cmFwcGVyIHRvIGNvbnNvbGUubG9nIHRoYXQgcHJlcGVuZHMgYSB0aW1lc3RhbXBcbmV4cG9ydHMubG9nID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUubG9nKCclcyAtICVzJywgdGltZXN0YW1wKCksIGV4cG9ydHMuZm9ybWF0LmFwcGx5KGV4cG9ydHMsIGFyZ3VtZW50cykpO1xufTtcblxuXG4vKipcbiAqIEluaGVyaXQgdGhlIHByb3RvdHlwZSBtZXRob2RzIGZyb20gb25lIGNvbnN0cnVjdG9yIGludG8gYW5vdGhlci5cbiAqXG4gKiBUaGUgRnVuY3Rpb24ucHJvdG90eXBlLmluaGVyaXRzIGZyb20gbGFuZy5qcyByZXdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lXG4gKiBmdW5jdGlvbiAobm90IG9uIEZ1bmN0aW9uLnByb3RvdHlwZSkuIE5PVEU6IElmIHRoaXMgZmlsZSBpcyB0byBiZSBsb2FkZWRcbiAqIGR1cmluZyBib290c3RyYXBwaW5nIHRoaXMgZnVuY3Rpb24gbmVlZHMgdG8gYmUgcmV3cml0dGVuIHVzaW5nIHNvbWUgbmF0aXZlXG4gKiBmdW5jdGlvbnMgYXMgcHJvdG90eXBlIHNldHVwIHVzaW5nIG5vcm1hbCBKYXZhU2NyaXB0IGRvZXMgbm90IHdvcmsgYXNcbiAqIGV4cGVjdGVkIGR1cmluZyBib290c3RyYXBwaW5nIChzZWUgbWlycm9yLmpzIGluIHIxMTQ5MDMpLlxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gd2hpY2ggbmVlZHMgdG8gaW5oZXJpdCB0aGVcbiAqICAgICBwcm90b3R5cGUuXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBzdXBlckN0b3IgQ29uc3RydWN0b3IgZnVuY3Rpb24gdG8gaW5oZXJpdCBwcm90b3R5cGUgZnJvbS5cbiAqL1xuZXhwb3J0cy5pbmhlcml0cyA9IHJlcXVpcmUoJ2luaGVyaXRzJyk7XG5cbmV4cG9ydHMuX2V4dGVuZCA9IGZ1bmN0aW9uKG9yaWdpbiwgYWRkKSB7XG4gIC8vIERvbid0IGRvIGFueXRoaW5nIGlmIGFkZCBpc24ndCBhbiBvYmplY3RcbiAgaWYgKCFhZGQgfHwgIWlzT2JqZWN0KGFkZCkpIHJldHVybiBvcmlnaW47XG5cbiAgdmFyIGtleXMgPSBPYmplY3Qua2V5cyhhZGQpO1xuICB2YXIgaSA9IGtleXMubGVuZ3RoO1xuICB3aGlsZSAoaS0tKSB7XG4gICAgb3JpZ2luW2tleXNbaV1dID0gYWRkW2tleXNbaV1dO1xuICB9XG4gIHJldHVybiBvcmlnaW47XG59O1xuXG5mdW5jdGlvbiBoYXNPd25Qcm9wZXJ0eShvYmosIHByb3ApIHtcbiAgcmV0dXJuIE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChvYmosIHByb3ApO1xufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSx0eXBlb2Ygc2VsZiAhPT0gXCJ1bmRlZmluZWRcIiA/IHNlbGYgOiB0eXBlb2Ygd2luZG93ICE9PSBcInVuZGVmaW5lZFwiID8gd2luZG93IDoge30pIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEVsZW1lbnQgPSByZXF1aXJlKCcuL2VsZW1lbnQnKS5FbGVtZW50XG5cbmZ1bmN0aW9uIERPTUVsZW1lbnQobmFtZSwgYXR0cnMpIHtcbiAgICBFbGVtZW50LmNhbGwodGhpcywgbmFtZSwgYXR0cnMpXG5cbiAgICB0aGlzLm5vZGVUeXBlID0gMVxuICAgIHRoaXMubm9kZU5hbWUgPSB0aGlzLmxvY2FsTmFtZVxufVxuXG51dGlsLmluaGVyaXRzKERPTUVsZW1lbnQsIEVsZW1lbnQpXG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLl9nZXRFbGVtZW50ID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICB2YXIgZWxlbWVudCA9IG5ldyBET01FbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgIHJldHVybiBlbGVtZW50XG59XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShET01FbGVtZW50LnByb3RvdHlwZSwgJ2xvY2FsTmFtZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0TmFtZSgpXG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAnbmFtZXNwYWNlVVJJJywge1xuICAgIGdldDogZnVuY3Rpb24gKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXROUygpXG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAncGFyZW50Tm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50XG4gICAgfVxufSlcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KERPTUVsZW1lbnQucHJvdG90eXBlLCAnY2hpbGROb2RlcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY2hpbGRyZW5cbiAgICB9XG59KVxuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoRE9NRWxlbWVudC5wcm90b3R5cGUsICd0ZXh0Q29udGVudCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VGV4dCgpXG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICB0aGlzLmNoaWxkcmVuLnB1c2godmFsdWUpXG4gICAgfVxufSlcblxuRE9NRWxlbWVudC5wcm90b3R5cGUuZ2V0RWxlbWVudHNCeVRhZ05hbWUgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuKG5hbWUpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmdldEF0dHJpYnV0ZSA9IGZ1bmN0aW9uIChuYW1lKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0QXR0cihuYW1lKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRyaWJ1dGUgPSBmdW5jdGlvbiAobmFtZSwgdmFsdWUpIHtcbiAgICB0aGlzLmF0dHIobmFtZSwgdmFsdWUpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLmdldEF0dHJpYnV0ZU5TID0gZnVuY3Rpb24gKG5zLCBuYW1lKSB7XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICByZXR1cm4gdGhpcy5nZXRBdHRyKFsneG1sJywgbmFtZV0uam9pbignOicpKVxuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXRBdHRyKG5hbWUsIG5zKVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRyaWJ1dGVOUyA9IGZ1bmN0aW9uIChucywgbmFtZSwgdmFsdWUpIHtcbiAgICB2YXIgcHJlZml4XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICBwcmVmaXggPSAneG1sJ1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBuc3MgPSB0aGlzLmdldFhtbG5zKClcbiAgICAgICAgcHJlZml4ID0gbnNzW25zXSB8fCAnJ1xuICAgIH1cbiAgICBpZiAocHJlZml4KSB7XG4gICAgICAgIHRoaXMuYXR0cihbcHJlZml4LCBuYW1lXS5qb2luKCc6JyksIHZhbHVlKVxuICAgIH1cbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlQXR0cmlidXRlID0gZnVuY3Rpb24gKG5hbWUpIHtcbiAgICB0aGlzLmF0dHIobmFtZSwgbnVsbClcbn1cblxuRE9NRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlQXR0cmlidXRlTlMgPSBmdW5jdGlvbiAobnMsIG5hbWUpIHtcbiAgICB2YXIgcHJlZml4XG4gICAgaWYgKG5zID09PSAnaHR0cDovL3d3dy53My5vcmcvWE1MLzE5OTgvbmFtZXNwYWNlJykge1xuICAgICAgICBwcmVmaXggPSAneG1sJ1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciBuc3MgPSB0aGlzLmdldFhtbG5zKClcbiAgICAgICAgcHJlZml4ID0gbnNzW25zXSB8fCAnJ1xuICAgIH1cbiAgICBpZiAocHJlZml4KSB7XG4gICAgICAgIHRoaXMuYXR0cihbcHJlZml4LCBuYW1lXS5qb2luKCc6JyksIG51bGwpXG4gICAgfVxufVxuXG5ET01FbGVtZW50LnByb3RvdHlwZS5hcHBlbmRDaGlsZCA9IGZ1bmN0aW9uIChlbCkge1xuICAgIHRoaXMuY25vZGUoZWwpXG59XG5cbkRPTUVsZW1lbnQucHJvdG90eXBlLnJlbW92ZUNoaWxkID0gZnVuY3Rpb24gKGVsKSB7XG4gICAgdGhpcy5yZW1vdmUoZWwpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRE9NRWxlbWVudFxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFRoaXMgY2hlYXAgcmVwbGljYSBvZiBET00vQnVpbGRlciBwdXRzIG1lIHRvIHNoYW1lIDotKVxuICpcbiAqIEF0dHJpYnV0ZXMgYXJlIGluIHRoZSBlbGVtZW50LmF0dHJzIG9iamVjdC4gQ2hpbGRyZW4gaXMgYSBsaXN0IG9mXG4gKiBlaXRoZXIgb3RoZXIgRWxlbWVudHMgb3IgU3RyaW5ncyBmb3IgdGV4dCBjb250ZW50LlxuICoqL1xuZnVuY3Rpb24gRWxlbWVudChuYW1lLCBhdHRycykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnBhcmVudCA9IG51bGxcbiAgICB0aGlzLmNoaWxkcmVuID0gW11cbiAgICB0aGlzLnNldEF0dHJzKGF0dHJzKVxufVxuXG4vKioqIEFjY2Vzc29ycyAqKiovXG5cbi8qKlxuICogaWYgKGVsZW1lbnQuaXMoJ21lc3NhZ2UnLCAnamFiYmVyOmNsaWVudCcpKSAuLi5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmlzID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gKHRoaXMuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAoIXhtbG5zIHx8ICh0aGlzLmdldE5TKCkgPT09IHhtbG5zKSlcbn1cblxuLyogd2l0aG91dCBwcmVmaXggKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldE5hbWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKVxuICAgICAgICByZXR1cm4gdGhpcy5uYW1lLnN1YnN0cih0aGlzLm5hbWUuaW5kZXhPZignOicpICsgMSlcbiAgICBlbHNlXG4gICAgICAgIHJldHVybiB0aGlzLm5hbWVcbn1cblxuLyoqXG4gKiByZXRyaWV2ZXMgdGhlIG5hbWVzcGFjZSBvZiB0aGUgY3VycmVudCBlbGVtZW50LCB1cHdhcmRzIHJlY3Vyc2l2ZWx5XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXROUyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLm5hbWUuaW5kZXhPZignOicpID49IDApIHtcbiAgICAgICAgdmFyIHByZWZpeCA9IHRoaXMubmFtZS5zdWJzdHIoMCwgdGhpcy5uYW1lLmluZGV4T2YoJzonKSlcbiAgICAgICAgcmV0dXJuIHRoaXMuZmluZE5TKHByZWZpeClcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpcy5maW5kTlMoKVxuICAgIH1cbn1cblxuLyoqXG4gKiBmaW5kIHRoZSBuYW1lc3BhY2UgdG8gdGhlIGdpdmVuIHByZWZpeCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZmluZE5TID0gZnVuY3Rpb24ocHJlZml4KSB7XG4gICAgaWYgKCFwcmVmaXgpIHtcbiAgICAgICAgLyogZGVmYXVsdCBuYW1lc3BhY2UgKi9cbiAgICAgICAgaWYgKHRoaXMuYXR0cnMueG1sbnMpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRycy54bWxuc1xuICAgICAgICBlbHNlIGlmICh0aGlzLnBhcmVudClcbiAgICAgICAgICAgIHJldHVybiB0aGlzLnBhcmVudC5maW5kTlMoKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIHByZWZpeGVkIG5hbWVzcGFjZSAqL1xuICAgICAgICB2YXIgYXR0ciA9ICd4bWxuczonICsgcHJlZml4XG4gICAgICAgIGlmICh0aGlzLmF0dHJzW2F0dHJdKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbYXR0cl1cbiAgICAgICAgZWxzZSBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKHByZWZpeClcbiAgICB9XG59XG5cbi8qKlxuICogUmVjdXJzaXZlcmx5IGdldHMgYWxsIHhtbG5zIGRlZmluZWQsIGluIHRoZSBmb3JtIG9mIHt1cmw6cHJlZml4fVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0WG1sbnMgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgbmFtZXNwYWNlcyA9IHt9XG5cbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIG5hbWVzcGFjZXMgPSB0aGlzLnBhcmVudC5nZXRYbWxucygpXG5cbiAgICBmb3IgKHZhciBhdHRyIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIG0gPSBhdHRyLm1hdGNoKCd4bWxuczo/KC4qKScpXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLmhhc093blByb3BlcnR5KGF0dHIpICYmIG0pIHtcbiAgICAgICAgICAgIG5hbWVzcGFjZXNbdGhpcy5hdHRyc1thdHRyXV0gPSBtWzFdXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIG5hbWVzcGFjZXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuc2V0QXR0cnMgPSBmdW5jdGlvbihhdHRycykge1xuICAgIHRoaXMuYXR0cnMgPSB7fVxuICAgIE9iamVjdC5rZXlzKGF0dHJzIHx8IHt9KS5mb3JFYWNoKGZ1bmN0aW9uKGtleSkge1xuICAgICAgICB0aGlzLmF0dHJzW2tleV0gPSBhdHRyc1trZXldXG4gICAgfSwgdGhpcylcbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbCwgcmV0dXJucyB0aGUgbWF0Y2hpbmcgYXR0cmlidXRlLlxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0QXR0ciA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgaWYgKCF4bWxucylcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnNbbmFtZV1cblxuICAgIHZhciBuYW1lc3BhY2VzID0gdGhpcy5nZXRYbWxucygpXG5cbiAgICBpZiAoIW5hbWVzcGFjZXNbeG1sbnNdKVxuICAgICAgICByZXR1cm4gbnVsbFxuXG4gICAgcmV0dXJuIHRoaXMuYXR0cnNbW25hbWVzcGFjZXNbeG1sbnNdLCBuYW1lXS5qb2luKCc6JyldXG59XG5cbi8qKlxuICogeG1sbnMgY2FuIGJlIG51bGxcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbihuYW1lLCB4bWxucylbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW4gPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5nZXROYW1lICYmXG4gICAgICAgICAgICAoY2hpbGQuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRCeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpWzBdXG59XG5cbi8qKlxuICogeG1sbnMgYW5kIHJlY3Vyc2l2ZSBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwsIHhtbG5zLCByZWN1cnNpdmUpIHtcbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBpZiAoY2hpbGQuYXR0cnMgJiZcbiAgICAgICAgICAgIChjaGlsZC5hdHRyc1thdHRyXSA9PT0gdmFsKSAmJlxuICAgICAgICAgICAgKCF4bWxucyB8fCAoY2hpbGQuZ2V0TlMoKSA9PT0geG1sbnMpKSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkKVxuICAgICAgICBpZiAocmVjdXJzaXZlICYmIGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKSB7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5QXR0cihhdHRyLCB2YWwsIHhtbG5zLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkcmVuQnlGaWx0ZXIgPSBmdW5jdGlvbihmaWx0ZXIsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChmaWx0ZXIoY2hpbGQpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUZpbHRlcil7XG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZpbHRlciwgdHJ1ZSkpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHJlY3Vyc2l2ZSkge1xuICAgICAgICByZXN1bHQgPSBbXS5jb25jYXQuYXBwbHkoW10sIHJlc3VsdClcbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRUZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRleHQgPSAnJ1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmICgodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykgfHwgKHR5cGVvZiBjaGlsZCA9PT0gJ251bWJlcicpKSB7XG4gICAgICAgICAgICB0ZXh0ICs9IGNoaWxkXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRleHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRUZXh0ID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICB2YXIgY2hpbGQgPSB0aGlzLmdldENoaWxkKG5hbWUsIHhtbG5zKVxuICAgIHJldHVybiBjaGlsZCA/IGNoaWxkLmdldFRleHQoKSA6IG51bGxcbn1cblxuLyoqXG4gKiBSZXR1cm4gYWxsIGRpcmVjdCBkZXNjZW5kZW50cyB0aGF0IGFyZSBFbGVtZW50cy5cbiAqIFRoaXMgZGlmZmVycyBmcm9tIGBnZXRDaGlsZHJlbmAgaW4gdGhhdCBpdCB3aWxsIGV4Y2x1ZGUgdGV4dCBub2RlcyxcbiAqIHByb2Nlc3NpbmcgaW5zdHJ1Y3Rpb25zLCBldGMuXG4gKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldENoaWxkRWxlbWVudHMgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRDaGlsZHJlbkJ5RmlsdGVyKGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgICAgIHJldHVybiBjaGlsZCBpbnN0YW5jZW9mIEVsZW1lbnRcbiAgICB9KVxufVxuXG4vKioqIEJ1aWxkZXIgKioqL1xuXG4vKiogcmV0dXJucyB1cHBlcm1vc3QgcGFyZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS5yb290ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMucGFyZW50KVxuICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQucm9vdCgpXG4gICAgZWxzZVxuICAgICAgICByZXR1cm4gdGhpc1xufVxuRWxlbWVudC5wcm90b3R5cGUudHJlZSA9IEVsZW1lbnQucHJvdG90eXBlLnJvb3RcblxuLyoqIGp1c3QgcGFyZW50IG9yIGl0c2VsZiAqL1xuRWxlbWVudC5wcm90b3R5cGUudXAgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpXG4gICAgICAgIHJldHVybiB0aGlzLnBhcmVudFxuICAgIGVsc2VcbiAgICAgICAgcmV0dXJuIHRoaXNcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuX2dldEVsZW1lbnQgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHZhciBlbGVtZW50ID0gbmV3IEVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgcmV0dXJuIGVsZW1lbnRcbn1cblxuLyoqIGNyZWF0ZSBjaGlsZCBub2RlIGFuZCByZXR1cm4gaXQgKi9cbkVsZW1lbnQucHJvdG90eXBlLmMgPSBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgIHJldHVybiB0aGlzLmNub2RlKHRoaXMuX2dldEVsZW1lbnQobmFtZSwgYXR0cnMpKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5jbm9kZSA9IGZ1bmN0aW9uKGNoaWxkKSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKGNoaWxkKVxuICAgIGNoaWxkLnBhcmVudCA9IHRoaXNcbiAgICByZXR1cm4gY2hpbGRcbn1cblxuLyoqIGFkZCB0ZXh0IG5vZGUgYW5kIHJldHVybiBlbGVtZW50ICovXG5FbGVtZW50LnByb3RvdHlwZS50ID0gZnVuY3Rpb24odGV4dCkge1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaCh0ZXh0KVxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKiogTWFuaXB1bGF0aW9uICoqKi9cblxuLyoqXG4gKiBFaXRoZXI6XG4gKiAgIGVsLnJlbW92ZShjaGlsZEVsKVxuICogICBlbC5yZW1vdmUoJ2F1dGhvcicsICd1cm46Li4uJylcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24oZWwsIHhtbG5zKSB7XG4gICAgdmFyIGZpbHRlclxuICAgIGlmICh0eXBlb2YgZWwgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgdGFnIG5hbWUgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiAhKGNoaWxkLmlzICYmXG4gICAgICAgICAgICAgICAgIGNoaWxkLmlzKGVsLCB4bWxucykpXG4gICAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgICAvKiAxc3QgcGFyYW1ldGVyIGlzIGVsZW1lbnQgKi9cbiAgICAgICAgZmlsdGVyID0gZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZCAhPT0gZWxcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMuY2hpbGRyZW4gPSB0aGlzLmNoaWxkcmVuLmZpbHRlcihmaWx0ZXIpXG5cbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIFRvIHVzZSBpbiBjYXNlIHlvdSB3YW50IHRoZSBzYW1lIFhNTCBkYXRhIGZvciBzZXBhcmF0ZSB1c2VzLlxuICogUGxlYXNlIHJlZnJhaW4gZnJvbSB0aGlzIHByYWN0aXNlIHVubGVzcyB5b3Uga25vdyB3aGF0IHlvdSBhcmVcbiAqIGRvaW5nLiBCdWlsZGluZyBYTUwgd2l0aCBsdHggaXMgZWFzeSFcbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuY2xvbmUgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2xvbmUgPSB0aGlzLl9nZXRFbGVtZW50KHRoaXMubmFtZSwgdGhpcy5hdHRycylcbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgdmFyIGNoaWxkID0gdGhpcy5jaGlsZHJlbltpXVxuICAgICAgICBjbG9uZS5jbm9kZShjaGlsZC5jbG9uZSA/IGNoaWxkLmNsb25lKCkgOiBjaGlsZClcbiAgICB9XG4gICAgcmV0dXJuIGNsb25lXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnRleHQgPSBmdW5jdGlvbih2YWwpIHtcbiAgICBpZiAodmFsICYmIHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAxKSB7XG4gICAgICAgIHRoaXMuY2hpbGRyZW5bMF0gPSB2YWxcbiAgICAgICAgcmV0dXJuIHRoaXNcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuZ2V0VGV4dCgpXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmF0dHIgPSBmdW5jdGlvbihhdHRyLCB2YWwpIHtcbiAgICBpZiAoKCh0eXBlb2YgdmFsICE9PSAndW5kZWZpbmVkJykgfHwgKHZhbCA9PT0gbnVsbCkpKSB7XG4gICAgICAgIGlmICghdGhpcy5hdHRycykge1xuICAgICAgICAgICAgdGhpcy5hdHRycyA9IHt9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5hdHRyc1thdHRyXSA9IHZhbFxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5hdHRyc1thdHRyXVxufVxuXG4vKioqIFNlcmlhbGl6YXRpb24gKioqL1xuXG5FbGVtZW50LnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBzID0gJydcbiAgICB0aGlzLndyaXRlKGZ1bmN0aW9uKGMpIHtcbiAgICAgICAgcyArPSBjXG4gICAgfSlcbiAgICByZXR1cm4gc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS50b0pTT04gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4ge1xuICAgICAgICBuYW1lOiB0aGlzLm5hbWUsXG4gICAgICAgIGF0dHJzOiB0aGlzLmF0dHJzLFxuICAgICAgICBjaGlsZHJlbjogdGhpcy5jaGlsZHJlbi5tYXAoZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgICAgIHJldHVybiBjaGlsZCAmJiBjaGlsZC50b0pTT04gPyBjaGlsZC50b0pTT04oKSA6IGNoaWxkXG4gICAgICAgIH0pXG4gICAgfVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5fYWRkQ2hpbGRyZW4gPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJz4nKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIC8qIFNraXAgbnVsbC91bmRlZmluZWQgKi9cbiAgICAgICAgaWYgKGNoaWxkIHx8IChjaGlsZCA9PT0gMCkpIHtcbiAgICAgICAgICAgIGlmIChjaGlsZC53cml0ZSkge1xuICAgICAgICAgICAgICAgIGNoaWxkLndyaXRlKHdyaXRlcilcbiAgICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGNoaWxkID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkKSlcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoY2hpbGQudG9TdHJpbmcpIHtcbiAgICAgICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sVGV4dChjaGlsZC50b1N0cmluZygxMCkpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHdyaXRlcignPC8nKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgd3JpdGVyKCc+Jylcbn1cblxuRWxlbWVudC5wcm90b3R5cGUud3JpdGUgPSBmdW5jdGlvbih3cml0ZXIpIHtcbiAgICB3cml0ZXIoJzwnKVxuICAgIHdyaXRlcih0aGlzLm5hbWUpXG4gICAgZm9yICh2YXIgayBpbiB0aGlzLmF0dHJzKSB7XG4gICAgICAgIHZhciB2ID0gdGhpcy5hdHRyc1trXVxuICAgICAgICBpZiAodiB8fCAodiA9PT0gJycpIHx8ICh2ID09PSAwKSkge1xuICAgICAgICAgICAgd3JpdGVyKCcgJylcbiAgICAgICAgICAgIHdyaXRlcihrKVxuICAgICAgICAgICAgd3JpdGVyKCc9XCInKVxuICAgICAgICAgICAgaWYgKHR5cGVvZiB2ICE9PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgICAgIHYgPSB2LnRvU3RyaW5nKDEwKVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbCh2KSlcbiAgICAgICAgICAgIHdyaXRlcignXCInKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmICh0aGlzLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICB3cml0ZXIoJy8+JylcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9hZGRDaGlsZHJlbih3cml0ZXIpXG4gICAgfVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWwocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpLlxuICAgICAgICByZXBsYWNlKC9cIi9nLCAnJnF1b3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmYXBvczsnKVxufVxuXG5mdW5jdGlvbiBlc2NhcGVYbWxUZXh0KHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmL2csICcmYW1wOycpLlxuICAgICAgICByZXBsYWNlKC88L2csICcmbHQ7JykuXG4gICAgICAgIHJlcGxhY2UoLz4vZywgJyZndDsnKVxufVxuXG5leHBvcnRzLkVsZW1lbnQgPSBFbGVtZW50XG5leHBvcnRzLmVzY2FwZVhtbCA9IGVzY2FwZVhtbFxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKiBDYXVzZSBicm93c2VyaWZ5IHRvIGJ1bmRsZSBTQVggcGFyc2VyczogKi9cbnZhciBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UnKVxuXG5wYXJzZS5hdmFpbGFibGVTYXhQYXJzZXJzLnB1c2gocGFyc2UuYmVzdFNheFBhcnNlciA9IHJlcXVpcmUoJy4vc2F4L3NheF9sdHgnKSlcblxuLyogU0hJTSAqL1xubW9kdWxlLmV4cG9ydHMgPSByZXF1aXJlKCcuL2luZGV4JykiLCIndXNlIHN0cmljdCc7XG5cbnZhciBwYXJzZSA9IHJlcXVpcmUoJy4vcGFyc2UnKVxuXG4vKipcbiAqIFRoZSBvbmx5IChyZWxldmFudCkgZGF0YSBzdHJ1Y3R1cmVcbiAqL1xuZXhwb3J0cy5FbGVtZW50ID0gcmVxdWlyZSgnLi9kb20tZWxlbWVudCcpXG5cbi8qKlxuICogSGVscGVyXG4gKi9cbmV4cG9ydHMuZXNjYXBlWG1sID0gcmVxdWlyZSgnLi9lbGVtZW50JykuZXNjYXBlWG1sXG5cbi8qKlxuICogRE9NIHBhcnNlciBpbnRlcmZhY2VcbiAqL1xuZXhwb3J0cy5wYXJzZSA9IHBhcnNlLnBhcnNlXG5leHBvcnRzLlBhcnNlciA9IHBhcnNlLlBhcnNlclxuXG4vKipcbiAqIFNBWCBwYXJzZXIgaW50ZXJmYWNlXG4gKi9cbmV4cG9ydHMuYXZhaWxhYmxlU2F4UGFyc2VycyA9IHBhcnNlLmF2YWlsYWJsZVNheFBhcnNlcnNcbmV4cG9ydHMuYmVzdFNheFBhcnNlciA9IHBhcnNlLmJlc3RTYXhQYXJzZXJcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIERPTUVsZW1lbnQgPSByZXF1aXJlKCcuL2RvbS1lbGVtZW50JylcblxuXG5leHBvcnRzLmF2YWlsYWJsZVNheFBhcnNlcnMgPSBbXVxuZXhwb3J0cy5iZXN0U2F4UGFyc2VyID0gbnVsbFxuXG52YXIgc2F4UGFyc2VycyA9IFtcbiAgICAnLi9zYXgvc2F4X2V4cGF0LmpzJyxcbiAgICAnLi9zYXgvc2F4X2x0eC5qcycsXG4gICAgLyonLi9zYXhfZWFzeXNheC5qcycsICcuL3NheF9ub2RlLXhtbC5qcycsKi9cbiAgICAnLi9zYXgvc2F4X3NheGpzLmpzJ1xuXVxuXG5zYXhQYXJzZXJzLmZvckVhY2goZnVuY3Rpb24obW9kTmFtZSkge1xuICAgIHZhciBtb2RcbiAgICB0cnkge1xuICAgICAgICBtb2QgPSByZXF1aXJlKG1vZE5hbWUpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAvKiBTaWxlbnRseSBtaXNzaW5nIGxpYnJhcmllcyBkcm9wIGZvciBkZWJ1ZzpcbiAgICAgICAgY29uc29sZS5lcnJvcihlLnN0YWNrIHx8IGUpXG4gICAgICAgICAqL1xuICAgIH1cbiAgICBpZiAobW9kKSB7XG4gICAgICAgIGV4cG9ydHMuYXZhaWxhYmxlU2F4UGFyc2Vycy5wdXNoKG1vZClcbiAgICAgICAgaWYgKCFleHBvcnRzLmJlc3RTYXhQYXJzZXIpIHtcbiAgICAgICAgICAgIGV4cG9ydHMuYmVzdFNheFBhcnNlciA9IG1vZFxuICAgICAgICB9XG4gICAgfVxufSlcblxuZXhwb3J0cy5QYXJzZXIgPSBmdW5jdGlvbihzYXhQYXJzZXIpIHtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcbiAgICB2YXIgc2VsZiA9IHRoaXNcblxuICAgIHZhciBQYXJzZXJNb2QgPSBzYXhQYXJzZXIgfHwgZXhwb3J0cy5iZXN0U2F4UGFyc2VyXG4gICAgaWYgKCFQYXJzZXJNb2QpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdObyBTQVggcGFyc2VyIGF2YWlsYWJsZScpXG4gICAgfVxuICAgIHRoaXMucGFyc2VyID0gbmV3IFBhcnNlck1vZCgpXG5cbiAgICB2YXIgZWxcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcignc3RhcnRFbGVtZW50JywgZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICAgICAgdmFyIGNoaWxkID0gbmV3IERPTUVsZW1lbnQobmFtZSwgYXR0cnMpXG4gICAgICAgIGlmICghZWwpIHtcbiAgICAgICAgICAgIGVsID0gY2hpbGRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVsID0gZWwuY25vZGUoY2hpbGQpXG4gICAgICAgIH1cbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLmFkZExpc3RlbmVyKCdlbmRFbGVtZW50JywgZnVuY3Rpb24obmFtZSkge1xuICAgICAgICAvKiBqc2hpbnQgLVcwMzUgKi9cbiAgICAgICAgaWYgKCFlbCkge1xuICAgICAgICAgICAgLyogRXJyICovXG4gICAgICAgIH0gZWxzZSBpZiAobmFtZSA9PT0gZWwubmFtZSkge1xuICAgICAgICAgICAgaWYgKGVsLnBhcmVudCkge1xuICAgICAgICAgICAgICAgIGVsID0gZWwucGFyZW50XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFzZWxmLnRyZWUpIHtcbiAgICAgICAgICAgICAgICBzZWxmLnRyZWUgPSBlbFxuICAgICAgICAgICAgICAgIGVsID0gdW5kZWZpbmVkXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLyoganNoaW50ICtXMDM1ICovXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcigndGV4dCcsIGZ1bmN0aW9uKHN0cikge1xuICAgICAgICBpZiAoZWwpIHtcbiAgICAgICAgICAgIGVsLnQoc3RyKVxuICAgICAgICB9XG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5hZGRMaXN0ZW5lcignZXJyb3InLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIHNlbGYuZXJyb3IgPSBlXG4gICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBlKVxuICAgIH0pXG59XG5cbnV0aWwuaW5oZXJpdHMoZXhwb3J0cy5QYXJzZXIsIGV2ZW50cy5FdmVudEVtaXR0ZXIpXG5cbmV4cG9ydHMuUGFyc2VyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICB0aGlzLnBhcnNlci53cml0ZShkYXRhKVxufVxuXG5leHBvcnRzLlBhcnNlci5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIHRoaXMucGFyc2VyLmVuZChkYXRhKVxuXG4gICAgaWYgKCF0aGlzLmVycm9yKSB7XG4gICAgICAgIGlmICh0aGlzLnRyZWUpIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgndHJlZScsIHRoaXMudHJlZSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ0luY29tcGxldGUgZG9jdW1lbnQnKSlcbiAgICAgICAgfVxuICAgIH1cbn1cblxuZXhwb3J0cy5wYXJzZSA9IGZ1bmN0aW9uKGRhdGEsIHNheFBhcnNlcikge1xuICAgIHZhciBwID0gbmV3IGV4cG9ydHMuUGFyc2VyKHNheFBhcnNlcilcbiAgICB2YXIgcmVzdWx0ID0gbnVsbFxuICAgICAgLCBlcnJvciA9IG51bGxcblxuICAgIHAub24oJ3RyZWUnLCBmdW5jdGlvbih0cmVlKSB7XG4gICAgICAgIHJlc3VsdCA9IHRyZWVcbiAgICB9KVxuICAgIHAub24oJ2Vycm9yJywgZnVuY3Rpb24oZSkge1xuICAgICAgICBlcnJvciA9IGVcbiAgICB9KVxuXG4gICAgcC53cml0ZShkYXRhKVxuICAgIHAuZW5kKClcblxuICAgIGlmIChlcnJvcikge1xuICAgICAgICB0aHJvdyBlcnJvclxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiByZXN1bHRcbiAgICB9XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJylcblxudmFyIFNUQVRFX1RFWFQgPSAwLFxuICAgIFNUQVRFX0lHTk9SRV9UQUcgPSAxLFxuICAgIFNUQVRFX1RBR19OQU1FID0gMixcbiAgICBTVEFURV9UQUcgPSAzLFxuICAgIFNUQVRFX0FUVFJfTkFNRSA9IDQsXG4gICAgU1RBVEVfQVRUUl9FUSA9IDUsXG4gICAgU1RBVEVfQVRUUl9RVU9UID0gNixcbiAgICBTVEFURV9BVFRSX1ZBTFVFID0gN1xuXG52YXIgU2F4THR4ID0gbW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbiBTYXhMdHgoKSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB2YXIgc3RhdGUgPSBTVEFURV9URVhULCByZW1haW5kZXJcbiAgICB2YXIgdGFnTmFtZSwgYXR0cnMsIGVuZFRhZywgc2VsZkNsb3NpbmcsIGF0dHJRdW90ZVxuICAgIHZhciByZWNvcmRTdGFydCA9IDBcbiAgICB2YXIgYXR0ck5hbWVcblxuICAgIHRoaXMuX2hhbmRsZVRhZ09wZW5pbmcgPSBmdW5jdGlvbihlbmRUYWcsIHRhZ05hbWUsIGF0dHJzKSB7XG4gICAgICAgIGlmICghZW5kVGFnKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ3N0YXJ0RWxlbWVudCcsIHRhZ05hbWUsIGF0dHJzKVxuICAgICAgICAgICAgaWYgKHNlbGZDbG9zaW5nKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdlbmRFbGVtZW50JywgdGFnTmFtZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZW5kRWxlbWVudCcsIHRhZ05hbWUpXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLndyaXRlID0gZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICAvKiBqc2hpbnQgLVcwNzEgKi9cbiAgICAgICAgLyoganNoaW50IC1XMDc0ICovXG4gICAgICAgIGlmICh0eXBlb2YgZGF0YSAhPT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLnRvU3RyaW5nKClcbiAgICAgICAgfVxuICAgICAgICB2YXIgcG9zID0gMFxuXG4gICAgICAgIC8qIEFueXRoaW5nIGZyb20gcHJldmlvdXMgd3JpdGUoKT8gKi9cbiAgICAgICAgaWYgKHJlbWFpbmRlcikge1xuICAgICAgICAgICAgZGF0YSA9IHJlbWFpbmRlciArIGRhdGFcbiAgICAgICAgICAgIHBvcyArPSByZW1haW5kZXIubGVuZ3RoXG4gICAgICAgICAgICByZW1haW5kZXIgPSBudWxsXG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBlbmRSZWNvcmRpbmcoKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHJlY29yZFN0YXJ0ID09PSAnbnVtYmVyJykge1xuICAgICAgICAgICAgICAgIHZhciByZWNvcmRlZCA9IGRhdGEuc2xpY2UocmVjb3JkU3RhcnQsIHBvcylcbiAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgIHJldHVybiByZWNvcmRlZFxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yKDsgcG9zIDwgZGF0YS5sZW5ndGg7IHBvcysrKSB7XG4gICAgICAgICAgICB2YXIgYyA9IGRhdGEuY2hhckNvZGVBdChwb3MpXG4gICAgICAgICAgICAvL2NvbnNvbGUubG9nKFwic3RhdGVcIiwgc3RhdGUsIFwiY1wiLCBjLCBkYXRhW3Bvc10pXG4gICAgICAgICAgICBzd2l0Y2goc3RhdGUpIHtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfVEVYVDpcbiAgICAgICAgICAgICAgICBpZiAoYyA9PT0gNjAgLyogPCAqLykge1xuICAgICAgICAgICAgICAgICAgICB2YXIgdGV4dCA9IGVuZFJlY29yZGluZygpXG4gICAgICAgICAgICAgICAgICAgIGlmICh0ZXh0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLmVtaXQoJ3RleHQnLCB1bmVzY2FwZVhtbCh0ZXh0KSlcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RBR19OQU1FXG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgICAgICBhdHRycyA9IHt9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX1RBR19OQU1FOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA0NyAvKiAvICovICYmIHJlY29yZFN0YXJ0ID09PSBwb3MpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgICAgIGVuZFRhZyA9IHRydWVcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09IDMzIC8qICEgKi8gfHwgYyA9PT0gNjMgLyogPyAqLykge1xuICAgICAgICAgICAgICAgICAgICByZWNvcmRTdGFydCA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX0lHTk9SRV9UQUdcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPD0gMzIgfHwgYyA9PT0gNDcgLyogLyAqLyB8fCBjID09PSA2MiAvKiA+ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhZ05hbWUgPSBlbmRSZWNvcmRpbmcoKVxuICAgICAgICAgICAgICAgICAgICBwb3MtLVxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RBR1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9JR05PUkVfVEFHOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSA2MiAvKiA+ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEVYVFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9UQUc6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYyIC8qID4gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5faGFuZGxlVGFnT3BlbmluZyhlbmRUYWcsIHRhZ05hbWUsIGF0dHJzKVxuICAgICAgICAgICAgICAgICAgICB0YWdOYW1lID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIGVuZFRhZyA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzZWxmQ2xvc2luZyA9IHVuZGVmaW5lZFxuICAgICAgICAgICAgICAgICAgICBzdGF0ZSA9IFNUQVRFX1RFWFRcbiAgICAgICAgICAgICAgICAgICAgcmVjb3JkU3RhcnQgPSBwb3MgKyAxXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSA0NyAvKiAvICovKSB7XG4gICAgICAgICAgICAgICAgICAgIHNlbGZDbG9zaW5nID0gdHJ1ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA+IDMyKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfQVRUUl9OQU1FXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfTkFNRTpcbiAgICAgICAgICAgICAgICBpZiAoYyA8PSAzMiB8fCBjID09PSA2MSAvKiA9ICovKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJOYW1lID0gZW5kUmVjb3JkaW5nKClcbiAgICAgICAgICAgICAgICAgICAgcG9zLS1cbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX0VRXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICBjYXNlIFNUQVRFX0FUVFJfRVE6XG4gICAgICAgICAgICAgICAgaWYgKGMgPT09IDYxIC8qID0gKi8pIHtcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX1FVT1RcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWtcbiAgICAgICAgICAgIGNhc2UgU1RBVEVfQVRUUl9RVU9UOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSAzNCAvKiBcIiAqLyB8fCBjID09PSAzOSAvKiAnICovKSB7XG4gICAgICAgICAgICAgICAgICAgIGF0dHJRdW90ZSA9IGNcbiAgICAgICAgICAgICAgICAgICAgc3RhdGUgPSBTVEFURV9BVFRSX1ZBTFVFXG4gICAgICAgICAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gcG9zICsgMVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBicmVha1xuICAgICAgICAgICAgY2FzZSBTVEFURV9BVFRSX1ZBTFVFOlxuICAgICAgICAgICAgICAgIGlmIChjID09PSBhdHRyUXVvdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHZhbHVlID0gdW5lc2NhcGVYbWwoZW5kUmVjb3JkaW5nKCkpXG4gICAgICAgICAgICAgICAgICAgIGF0dHJzW2F0dHJOYW1lXSA9IHZhbHVlXG4gICAgICAgICAgICAgICAgICAgIGF0dHJOYW1lID0gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIHN0YXRlID0gU1RBVEVfVEFHXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodHlwZW9mIHJlY29yZFN0YXJ0ID09PSAnbnVtYmVyJyAmJlxuICAgICAgICAgICAgcmVjb3JkU3RhcnQgPD0gZGF0YS5sZW5ndGgpIHtcblxuICAgICAgICAgICAgcmVtYWluZGVyID0gZGF0YS5zbGljZShyZWNvcmRTdGFydClcbiAgICAgICAgICAgIHJlY29yZFN0YXJ0ID0gMFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyp2YXIgb3JpZ0VtaXQgPSB0aGlzLmVtaXRcbiAgICB0aGlzLmVtaXQgPSBmdW5jdGlvbigpIHtcbiAgICBjb25zb2xlLmxvZygnbHR4JywgYXJndW1lbnRzKVxuICAgIG9yaWdFbWl0LmFwcGx5KHRoaXMsIGFyZ3VtZW50cylcbiAgICB9Ki9cbn1cbnV0aWwuaW5oZXJpdHMoU2F4THR4LCBldmVudHMuRXZlbnRFbWl0dGVyKVxuXG5cblNheEx0eC5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIHRoaXMud3JpdGUoZGF0YSlcbiAgICB9XG5cbiAgICAvKiBVaCwgeWVhaCAqL1xuICAgIHRoaXMud3JpdGUgPSBmdW5jdGlvbigpIHt9XG59XG5cbmZ1bmN0aW9uIHVuZXNjYXBlWG1sKHMpIHtcbiAgICByZXR1cm4gcy5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGFtcHwjMzgpOy9nLCAnJicpLlxuICAgICAgICByZXBsYWNlKC9cXCYobHR8IzYwKTsvZywgJzwnKS5cbiAgICAgICAgcmVwbGFjZSgvXFwmKGd0fCM2Mik7L2csICc+JykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihxdW90fCMzNCk7L2csICdcIicpLlxuICAgICAgICByZXBsYWNlKC9cXCYoYXBvc3wjMzkpOy9nLCAnXFwnJykuXG4gICAgICAgIHJlcGxhY2UoL1xcJihuYnNwfCMxNjApOy9nLCAnXFxuJylcbn1cbiIsIihmdW5jdGlvbiAoX19kaXJuYW1lKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIFNlc3Npb24gPSByZXF1aXJlKCcuL2xpYi9zZXNzaW9uJylcbiAgLCBDb25uZWN0aW9uID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5Db25uZWN0aW9uXG4gICwgSklEID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5KSURcbiAgLCBTdGFuemEgPSByZXF1aXJlICgnbm9kZS14bXBwLWNvcmUnKS5TdGFuemFcbiAgLCBzYXNsID0gcmVxdWlyZSgnLi9saWIvc2FzbCcpXG4gICwgQW5vbnltb3VzID0gcmVxdWlyZSgnLi9saWIvYXV0aGVudGljYXRpb24vYW5vbnltb3VzJylcbiAgLCBQbGFpbiA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL3BsYWluJylcbiAgLCBEaWdlc3RNRDUgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9kaWdlc3RtZDUnKVxuICAsIFhPQXV0aDIgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi94b2F1dGgyJylcbiAgLCBYRmFjZWJvb2tQbGF0Zm9ybSA9IHJlcXVpcmUoJy4vbGliL2F1dGhlbnRpY2F0aW9uL3hmYWNlYm9vaycpXG4gICwgRXh0ZXJuYWwgPSByZXF1aXJlKCcuL2xpYi9hdXRoZW50aWNhdGlvbi9leHRlcm5hbCcpXG4gICwgZXhlYyA9IHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5leGVjXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGRlYnVnID0gcmVxdWlyZSgnZGVidWcnKSgneG1wcDpjbGllbnQnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG5cbnZhciBOU19DTElFTlQgPSAnamFiYmVyOmNsaWVudCdcbnZhciBOU19SRUdJU1RFUiA9ICdqYWJiZXI6aXE6cmVnaXN0ZXInXG52YXIgTlNfWE1QUF9TQVNMID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC1zYXNsJ1xudmFyIE5TX1hNUFBfQklORCA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtYmluZCdcbnZhciBOU19YTVBQX1NFU1NJT04gPSAndXJuOmlldGY6cGFyYW1zOnhtbDpuczp4bXBwLXNlc3Npb24nXG5cbnZhciBTVEFURV9QUkVBVVRIID0gMFxuICAsIFNUQVRFX0FVVEggPSAxXG4gICwgU1RBVEVfQVVUSEVEID0gMlxuICAsIFNUQVRFX0JJTkQgPSAzXG4gICwgU1RBVEVfU0VTU0lPTiA9IDRcbiAgLCBTVEFURV9PTkxJTkUgPSA1XG5cbnZhciBJUUlEX1NFU1NJT04gPSAnc2VzcydcbiAgLCBJUUlEX0JJTkQgPSAnYmluZCdcblxuLyoganNoaW50IGxhdGVkZWY6IGZhbHNlICovXG4vKiBqc2hpbnQgLVcwNzkgKi9cbi8qIGpzaGludCAtVzAyMCAqL1xudmFyIGRlY29kZTY0LCBlbmNvZGU2NCwgQnVmZmVyXG5pZiAodHlwZW9mIGJ0b2EgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgdmFyIGJ0b2EgPSBudWxsXG4gICAgdmFyIGF0b2IgPSBudWxsXG59XG5cbmlmICh0eXBlb2YgYnRvYSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgIGRlY29kZTY0ID0gZnVuY3Rpb24oZW5jb2RlZCkge1xuICAgICAgICByZXR1cm4gYXRvYihlbmNvZGVkKVxuICAgIH1cbn0gZWxzZSB7XG4gICAgQnVmZmVyID0gcmVxdWlyZSgnYnVmZmVyJykuQnVmZmVyXG4gICAgZGVjb2RlNjQgPSBmdW5jdGlvbihlbmNvZGVkKSB7XG4gICAgICAgIHJldHVybiAobmV3IEJ1ZmZlcihlbmNvZGVkLCAnYmFzZTY0JykpLnRvU3RyaW5nKCd1dGY4JylcbiAgICB9XG59XG5pZiAodHlwZW9mIGF0b2IgPT09ICdmdW5jdGlvbicpIHtcbiAgICBlbmNvZGU2NCA9IGZ1bmN0aW9uKGRlY29kZWQpIHtcbiAgICAgICAgcmV0dXJuIGJ0b2EoZGVjb2RlZClcbiAgICB9XG59IGVsc2Uge1xuICAgIEJ1ZmZlciA9IHJlcXVpcmUoJ2J1ZmZlcicpLkJ1ZmZlclxuICAgIGVuY29kZTY0ID0gZnVuY3Rpb24oZGVjb2RlZCkge1xuICAgICAgICByZXR1cm4gKG5ldyBCdWZmZXIoZGVjb2RlZCwgJ3V0ZjgnKSkudG9TdHJpbmcoJ2Jhc2U2NCcpXG4gICAgfVxufVxuXG4vKipcbiAqIHBhcmFtcyBvYmplY3Q6XG4gKiAgIGppZDogU3RyaW5nIChyZXF1aXJlZClcbiAqICAgcGFzc3dvcmQ6IFN0cmluZyAocmVxdWlyZWQpXG4gKiAgIGhvc3Q6IFN0cmluZyAob3B0aW9uYWwpXG4gKiAgIHBvcnQ6IE51bWJlciAob3B0aW9uYWwpXG4gKiAgIHJlY29ubmVjdDogQm9vbGVhbiAob3B0aW9uYWwpXG4gKiAgIGF1dG9zdGFydDogQm9vbGVhbiAob3B0aW9uYWwpIC0gaWYgd2Ugc3RhcnQgY29ubmVjdGluZyB0byBhIGdpdmVuIHBvcnRcbiAqICAgcmVnaXN0ZXI6IEJvb2xlYW4gKG9wdGlvbikgLSByZWdpc3RlciBhY2NvdW50IGJlZm9yZSBhdXRoZW50aWNhdGlvblxuICogICBsZWdhY3lTU0w6IEJvb2xlYW4gKG9wdGlvbmFsKSAtIGNvbm5lY3QgdG8gdGhlIGxlZ2FjeSBTU0wgcG9ydCwgcmVxdWlyZXMgYXQgbGVhc3QgdGhlIGhvc3QgdG8gYmUgc3BlY2lmaWVkXG4gKiAgIGNyZWRlbnRpYWxzOiBEaWN0aW9uYXJ5IChvcHRpb25hbCkgLSBUTFMgb3IgU1NMIGtleSBhbmQgY2VydGlmaWNhdGUgY3JlZGVudGlhbHNcbiAqICAgYWN0QXM6IFN0cmluZyAob3B0aW9uYWwpIC0gaWYgYWRtaW4gdXNlciBhY3Qgb24gYmVoYWxmIG9mIGFub3RoZXIgdXNlciAoanVzdCB1c2VyKVxuICogICBkaXNhbGxvd1RMUzogQm9vbGVhbiAob3B0aW9uYWwpIC0gcHJldmVudCB1cGdyYWRpbmcgdGhlIGNvbm5lY3Rpb24gdG8gYSBzZWN1cmUgb25lIHZpYSBUTFNcbiAqICAgcHJlZmVycmVkOiBTdHJpbmcgKG9wdGlvbmFsKSAtIFByZWZlcnJlZCBTQVNMIG1lY2hhbmlzbSB0byB1c2VcbiAqICAgYm9zaC51cmw6IFN0cmluZyAob3B0aW9uYWwpIC0gQk9TSCBlbmRwb2ludCB0byB1c2VcbiAqICAgYm9zaC5wcmViaW5kOiBGdW5jdGlvbihlcnJvciwgZGF0YSkgKG9wdGlvbmFsKSAtIEp1c3QgcHJlYmluZCBhIG5ldyBCT1NIIHNlc3Npb24gZm9yIGJyb3dzZXIgY2xpZW50IHVzZVxuICogICAgICAgICAgICBlcnJvciBTdHJpbmcgLSBSZXN1bHQgb2YgWE1QUCBlcnJvci4gRXggOiBbRXJyb3I6IFhNUFAgYXV0aGVudGljYXRpb24gZmFpbHVyZV1cbiAqICAgICAgICAgICAgZGF0YSBPYmplY3QgLSBSZXN1bHQgb2YgWE1QUCBCT1NIIGNvbm5lY3Rpb24uXG4gKlxuICogRXhhbXBsZXM6XG4gKiAgIHZhciBjbCA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICAgIHBhc3N3b3JkOiBcInNlY3JldFwiXG4gKiAgIH0pXG4gKiAgIHZhciBmYWNlYm9vayA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6ICctJyArIGZiVUlEICsgJ0BjaGF0LmZhY2Vib29rLmNvbScsXG4gKiAgICAgICBhcGlfa2V5OiAnNTQzMjEnLCAvLyBhcGkga2V5IG9mIHlvdXIgZmFjZWJvb2sgYXBwXG4gKiAgICAgICBhY2Nlc3NfdG9rZW46ICdhYmNkZWZnJywgLy8gdXNlciBhY2Nlc3MgdG9rZW5cbiAqICAgICAgIGhvc3Q6ICdjaGF0LmZhY2Vib29rLmNvbSdcbiAqICAgfSlcbiAqICAgdmFyIGd0YWxrID0gbmV3IHhtcHAuQ2xpZW50KHtcbiAqICAgICAgIGppZDogJ21lQGdtYWlsLmNvbScsXG4gKiAgICAgICBvYXV0aDJfdG9rZW46ICd4eHh4Lnh4eHh4eHh4eHh4JywgLy8gZnJvbSBPQXV0aDJcbiAqICAgICAgIG9hdXRoMl9hdXRoOiAnaHR0cDovL3d3dy5nb29nbGUuY29tL3RhbGsvcHJvdG9jb2wvYXV0aCcsXG4gKiAgICAgICBob3N0OiAndGFsay5nb29nbGUuY29tJ1xuICogICB9KVxuICogICB2YXIgcHJlYmluZCA9IG5ldyB4bXBwLkNsaWVudCh7XG4gKiAgICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICAgIHBhc3N3b3JkOiBcInNlY3JldFwiLFxuICogICAgICAgYm9zaDoge1xuICogICAgICAgICAgIHVybDogXCJodHRwOi8vZXhhbXBsZS5jb20vaHR0cC1iaW5kXCIsXG4gKiAgICAgICAgICAgcHJlYmluZDogZnVuY3Rpb24oZXJyb3IsIGRhdGEpIHtcbiAqICAgICAgICAgICAgICAgaWYgKGVycm9yKSB7fVxuICogICAgICAgICAgICAgICByZXMuc2VuZCh7IHJpZDogZGF0YS5yaWQsIHNpZDogZGF0YS5zaWQgfSlcbiAqICAgICAgICAgICB9XG4gKiAgICAgICB9XG4gKiAgIH0pXG4gKlxuICogRXhhbXBsZSBTQVNMIEVYVEVSTkFMOlxuICpcbiAqIHZhciBteUNyZWRlbnRpYWxzID0ge1xuICogICAvLyBUaGVzZSBhcmUgbmVjZXNzYXJ5IG9ubHkgaWYgdXNpbmcgdGhlIGNsaWVudCBjZXJ0aWZpY2F0ZSBhdXRoZW50aWNhdGlvblxuICogICBrZXk6IGZzLnJlYWRGaWxlU3luYygna2V5LnBlbScpLFxuICogICBjZXJ0OiBmcy5yZWFkRmlsZVN5bmMoJ2NlcnQucGVtJyksXG4gKiAgIC8vIHBhc3NwaHJhc2U6ICdvcHRpb25hbCdcbiAqIH1cbiAqIHZhciBjbCA9IG5ldyB4bXBwQ2xpZW50KHtcbiAqICAgICBqaWQ6IFwibWVAZXhhbXBsZS5jb21cIixcbiAqICAgICBjcmVkZW50aWFsczogbXlDcmVkZW50aWFsc1xuICogICAgIHByZWZlcnJlZDogJ0VYVEVSTkFMJyAvLyBub3QgcmVhbGx5IHJlcXVpcmVkLCBidXQgcG9zc2libGVcbiAqIH0pXG4gKlxuICovXG5mdW5jdGlvbiBDbGllbnQob3B0aW9ucykge1xuICAgIHRoaXMub3B0aW9ucyA9IHt9XG4gICAgaWYgKG9wdGlvbnMpIHRoaXMub3B0aW9ucyA9IG9wdGlvbnNcbiAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zID0gW1xuICAgICAgICBYT0F1dGgyLCBYRmFjZWJvb2tQbGF0Zm9ybSwgRXh0ZXJuYWwsIERpZ2VzdE1ENSwgUGxhaW4sIEFub255bW91c1xuICAgIF1cblxuICAgIGlmICh0aGlzLm9wdGlvbnMuYXV0b3N0YXJ0ICE9PSBmYWxzZSlcbiAgICAgICAgdGhpcy5jb25uZWN0KClcbn1cblxudXRpbC5pbmhlcml0cyhDbGllbnQsIFNlc3Npb24pXG5cbkNsaWVudC5OU19DTElFTlQgPSBOU19DTElFTlRcblxuQ2xpZW50LnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMub3B0aW9ucy5ib3NoICYmIHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmQpIHtcbiAgICAgICAgZGVidWcoJ2xvYWQgYm9zaCBwcmViaW5kJylcbiAgICAgICAgdmFyIGNiID0gdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZFxuICAgICAgICBkZWxldGUgdGhpcy5vcHRpb25zLmJvc2gucHJlYmluZFxuICAgICAgICB2YXIgY21kID0gJ25vZGUgJyArIF9fZGlybmFtZSArXG4gICAgICAgICAgICAnL2xpYi9wcmViaW5kLmpzICdcbiAgICAgICAgZGVsZXRlIHRoaXMub3B0aW9ucy5ib3NoLnByZWJpbmRcbiAgICAgICAgY21kICs9IGVuY29kZVVSSShKU09OLnN0cmluZ2lmeSh0aGlzLm9wdGlvbnMpKVxuICAgICAgICBleGVjKFxuICAgICAgICAgICAgY21kLFxuICAgICAgICAgICAgZnVuY3Rpb24gKGVycm9yLCBzdGRvdXQsIHN0ZGVycikge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikge1xuICAgICAgICAgICAgICAgICAgICBjYihlcnJvciwgbnVsbClcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB2YXIgciA9IHN0ZG91dC5tYXRjaCgvcmlkOitbIDAtOV0qL2kpXG4gICAgICAgICAgICAgICAgICAgIHIgPSAoclswXS5zcGxpdCgnOicpKVsxXS50cmltKClcbiAgICAgICAgICAgICAgICAgICAgdmFyIHMgPSBzdGRvdXQubWF0Y2goL3NpZDorWyBhLXorJ1wiLV9BLVorMC05XSovaSlcbiAgICAgICAgICAgICAgICAgICAgcyA9IChzWzBdLnNwbGl0KCc6JykpWzFdXG4gICAgICAgICAgICAgICAgICAgICAgICAucmVwbGFjZSgnXFwnJywnJylcbiAgICAgICAgICAgICAgICAgICAgICAgIC5yZXBsYWNlKCdcXCcnLCcnKVxuICAgICAgICAgICAgICAgICAgICAgICAgLnRyaW0oKVxuICAgICAgICAgICAgICAgICAgICBpZiAociAmJiBzKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IobnVsbCwgeyByaWQ6IHIsIHNpZDogcyB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNiKHN0ZGVycilcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLm9wdGlvbnMueG1sbnMgPSBOU19DTElFTlRcbiAgICAgICAgLyoganNoaW50IGNhbWVsY2FzZTogZmFsc2UgKi9cbiAgICAgICAgZGVsZXRlIHRoaXMuZGlkX2JpbmRcbiAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cblxuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfUFJFQVVUSFxuICAgICAgICB0aGlzLm9uKCdlbmQnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9QUkVBVVRIXG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfYmluZFxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cbiAgICAgICAgfSlcblxuICAgICAgICBTZXNzaW9uLmNhbGwodGhpcywgdGhpcy5vcHRpb25zKVxuICAgICAgICB0aGlzLm9wdGlvbnMuamlkID0gdGhpcy5qaWRcblxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ub24oJ2Rpc2Nvbm5lY3QnLCBmdW5jdGlvbihlcnJvcikge1xuICAgICAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX1BSRUFVVEhcbiAgICAgICAgICAgIGlmICghdGhpcy5jb25uZWN0aW9uLnJlY29ubmVjdCkge1xuICAgICAgICAgICAgICAgIGlmIChlcnJvcikgdGhpcy5lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnb2ZmbGluZScpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5kaWRfYmluZFxuICAgICAgICAgICAgZGVsZXRlIHRoaXMuZGlkX3Nlc3Npb25cbiAgICAgICAgfS5iaW5kKHRoaXMpKVxuXG4gICAgICAgIC8vIElmIHNlcnZlciBhbmQgY2xpZW50IGhhdmUgbXVsdGlwbGUgcG9zc2libGUgYXV0aCBtZWNoYW5pc21zXG4gICAgICAgIC8vIHdlIHRyeSB0byBzZWxlY3QgdGhlIHByZWZlcnJlZCBvbmVcbiAgICAgICAgaWYgKHRoaXMub3B0aW9ucy5wcmVmZXJyZWQpIHtcbiAgICAgICAgICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSA9IHRoaXMub3B0aW9ucy5wcmVmZXJyZWRcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMucHJlZmVycmVkU2FzbE1lY2hhbmlzbSA9ICdESUdFU1QtTUQ1J1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIG1lY2hzID0gc2FzbC5kZXRlY3RNZWNoYW5pc21zKHRoaXMub3B0aW9ucywgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcylcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IG1lY2hzXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLm9uU3RhbnphID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgLyogQWN0dWFsbHksIHdlIHNob3VsZG4ndCB3YWl0IGZvciA8c3RyZWFtOmZlYXR1cmVzLz4gaWZcbiAgICAgICB0aGlzLnN0cmVhbUF0dHJzLnZlcnNpb24gaXMgbWlzc2luZywgYnV0IHdobyB1c2VzIHByZS1YTVBQLTEuMFxuICAgICAgIHRoZXNlIGRheXMgYW55d2F5PyAqL1xuICAgIGlmICgodGhpcy5zdGF0ZSAhPT0gU1RBVEVfT05MSU5FKSAmJiBzdGFuemEuaXMoJ2ZlYXR1cmVzJykpIHtcbiAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcyA9IHN0YW56YVxuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX1BSRUFVVEgpIHtcbiAgICAgICAgdGhpcy5lbWl0KCdzdGFuemE6cHJlYXV0aCcsIHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX0FVVEgpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlQXV0aFN0YXRlKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9CSU5EKSAmJiBzdGFuemEuaXMoJ2lxJykgJiYgKHN0YW56YS5hdHRycy5pZCA9PT0gSVFJRF9CSU5EKSkge1xuICAgICAgICB0aGlzLl9oYW5kbGVCaW5kU3RhdGUoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAoKHRoaXMuc3RhdGUgPT09IFNUQVRFX1NFU1NJT04pICYmICh0cnVlID09PSBzdGFuemEuaXMoJ2lxJykpICYmXG4gICAgICAgIChzdGFuemEuYXR0cnMuaWQgPT09IElRSURfU0VTU0lPTikpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlU2Vzc2lvblN0YXRlKHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHN0YW56YS5uYW1lID09PSAnc3RyZWFtOmVycm9yJykge1xuICAgICAgICBpZiAoIXRoaXMucmVjb25uZWN0KVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIHN0YW56YSlcbiAgICB9IGVsc2UgaWYgKHRoaXMuc3RhdGUgPT09IFNUQVRFX09OTElORSkge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZVNlc3Npb25TdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgICAgICB0aGlzLmRpZF9zZXNzaW9uID0gdHJ1ZVxuXG4gICAgICAgIC8qIG5vIHN0cmVhbSByZXN0YXJ0LCBidXQgbmV4dCBmZWF0dXJlIChtb3N0IHByb2JhYmx5XG4gICAgICAgICAgIHdlJ2xsIGdvIG9ubGluZSBuZXh0KSAqL1xuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ0Nhbm5vdCBiaW5kIHJlc291cmNlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZUJpbmRTdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIHRoaXMuZGlkX2JpbmQgPSB0cnVlXG5cbiAgICAgICAgdmFyIGJpbmRFbCA9IHN0YW56YS5nZXRDaGlsZCgnYmluZCcsIE5TX1hNUFBfQklORClcbiAgICAgICAgaWYgKGJpbmRFbCAmJiBiaW5kRWwuZ2V0Q2hpbGQoJ2ppZCcpKSB7XG4gICAgICAgICAgICB0aGlzLmppZCA9IG5ldyBKSUQoYmluZEVsLmdldENoaWxkKCdqaWQnKS5nZXRUZXh0KCkpXG4gICAgICAgIH1cblxuICAgICAgICAvKiBubyBzdHJlYW0gcmVzdGFydCwgYnV0IG5leHQgZmVhdHVyZSAqL1xuICAgICAgICB0aGlzLnVzZUZlYXR1cmVzKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ0Nhbm5vdCBiaW5kIHJlc291cmNlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZUF1dGhTdGF0ZSA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIGlmIChzdGFuemEuaXMoJ2NoYWxsZW5nZScsIE5TX1hNUFBfU0FTTCkpIHtcbiAgICAgICAgdmFyIGNoYWxsZW5nZU1zZyA9IGRlY29kZTY0KHN0YW56YS5nZXRUZXh0KCkpXG4gICAgICAgIHZhciByZXNwb25zZU1zZyA9IGVuY29kZTY0KHRoaXMubWVjaC5jaGFsbGVuZ2UoY2hhbGxlbmdlTXNnKSlcbiAgICAgICAgdmFyIHJlc3BvbnNlID0gbmV3IFN0YW56YS5FbGVtZW50KFxuICAgICAgICAgICAgJ3Jlc3BvbnNlJywgeyB4bWxuczogTlNfWE1QUF9TQVNMIH1cbiAgICAgICAgKS50KHJlc3BvbnNlTXNnKVxuICAgICAgICB0aGlzLnNlbmQocmVzcG9uc2UpXG4gICAgfSBlbHNlIGlmIChzdGFuemEuaXMoJ3N1Y2Nlc3MnLCBOU19YTVBQX1NBU0wpKSB7XG4gICAgICAgIHRoaXMubWVjaCA9IG51bGxcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0FVVEhFRFxuICAgICAgICB0aGlzLmVtaXQoJ2F1dGgnKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAnWE1QUCBhdXRoZW50aWNhdGlvbiBmYWlsdXJlJylcbiAgICB9XG59XG5cbkNsaWVudC5wcm90b3R5cGUuX2hhbmRsZVByZUF1dGhTdGF0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuc3RhdGUgPSBTVEFURV9BVVRIXG4gICAgdmFyIG9mZmVyZWRNZWNocyA9IHRoaXMuc3RyZWFtRmVhdHVyZXMuXG4gICAgICAgIGdldENoaWxkKCdtZWNoYW5pc21zJywgTlNfWE1QUF9TQVNMKS5cbiAgICAgICAgZ2V0Q2hpbGRyZW4oJ21lY2hhbmlzbScsIE5TX1hNUFBfU0FTTCkuXG4gICAgICAgIG1hcChmdW5jdGlvbihlbCkgeyByZXR1cm4gZWwuZ2V0VGV4dCgpIH0pXG4gICAgdGhpcy5tZWNoID0gc2FzbC5zZWxlY3RNZWNoYW5pc20oXG4gICAgICAgIG9mZmVyZWRNZWNocyxcbiAgICAgICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtLFxuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zXG4gICAgKVxuICAgIGlmICh0aGlzLm1lY2gpIHtcbiAgICAgICAgdGhpcy5tZWNoLmF1dGh6aWQgPSB0aGlzLmppZC5iYXJlKCkudG9TdHJpbmcoKVxuICAgICAgICB0aGlzLm1lY2guYXV0aGNpZCA9IHRoaXMuamlkLnVzZXJcbiAgICAgICAgdGhpcy5tZWNoLnBhc3N3b3JkID0gdGhpcy5wYXNzd29yZFxuICAgICAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgICAgIHRoaXMubWVjaC5hcGlfa2V5ID0gdGhpcy5hcGlfa2V5XG4gICAgICAgIHRoaXMubWVjaC5hY2Nlc3NfdG9rZW4gPSB0aGlzLmFjY2Vzc190b2tlblxuICAgICAgICB0aGlzLm1lY2gub2F1dGgyX3Rva2VuID0gdGhpcy5vYXV0aDJfdG9rZW5cbiAgICAgICAgdGhpcy5tZWNoLm9hdXRoMl9hdXRoID0gdGhpcy5vYXV0aDJfYXV0aFxuICAgICAgICB0aGlzLm1lY2gucmVhbG0gPSB0aGlzLmppZC5kb21haW4gIC8vIGFueXRoaW5nP1xuICAgICAgICBpZiAodGhpcy5hY3RBcykgdGhpcy5tZWNoLmFjdEFzID0gdGhpcy5hY3RBcy51c2VyXG4gICAgICAgIHRoaXMubWVjaC5kaWdlc3RfdXJpID0gJ3htcHAvJyArIHRoaXMuamlkLmRvbWFpblxuICAgICAgICB2YXIgYXV0aE1zZyA9IGVuY29kZTY0KHRoaXMubWVjaC5hdXRoKCkpXG4gICAgICAgIHZhciBhdHRycyA9IHRoaXMubWVjaC5hdXRoQXR0cnMoKVxuICAgICAgICBhdHRycy54bWxucyA9IE5TX1hNUFBfU0FTTFxuICAgICAgICBhdHRycy5tZWNoYW5pc20gPSB0aGlzLm1lY2gubmFtZVxuICAgICAgICB0aGlzLnNlbmQobmV3IFN0YW56YS5FbGVtZW50KCdhdXRoJywgYXR0cnMpXG4gICAgICAgICAgICAudChhdXRoTXNnKSlcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgJ05vIHVzYWJsZSBTQVNMIG1lY2hhbmlzbScpXG4gICAgfVxufVxuXG4vKipcbiAqIEVpdGhlciB3ZSBqdXN0IHJlY2VpdmVkIDxzdHJlYW06ZmVhdHVyZXMvPiwgb3Igd2UganVzdCBlbmFibGVkIGFcbiAqIGZlYXR1cmUgYW5kIGFyZSBsb29raW5nIGZvciB0aGUgbmV4dC5cbiAqL1xuQ2xpZW50LnByb3RvdHlwZS51c2VGZWF0dXJlcyA9IGZ1bmN0aW9uKCkge1xuICAgIC8qIGpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9QUkVBVVRIKSAmJiB0aGlzLnJlZ2lzdGVyKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzLnJlZ2lzdGVyXG4gICAgICAgIHRoaXMuZG9SZWdpc3RlcigpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfUFJFQVVUSCkgJiZcbiAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcy5nZXRDaGlsZCgnbWVjaGFuaXNtcycsIE5TX1hNUFBfU0FTTCkpIHtcbiAgICAgICAgdGhpcy5faGFuZGxlUHJlQXV0aFN0YXRlKClcbiAgICB9IGVsc2UgaWYgKCh0aGlzLnN0YXRlID09PSBTVEFURV9BVVRIRUQpICYmXG4gICAgICAgICAgICAgICAhdGhpcy5kaWRfYmluZCAmJlxuICAgICAgICAgICAgICAgdGhpcy5zdHJlYW1GZWF0dXJlcy5nZXRDaGlsZCgnYmluZCcsIE5TX1hNUFBfQklORCkpIHtcbiAgICAgICAgdGhpcy5zdGF0ZSA9IFNUQVRFX0JJTkRcbiAgICAgICAgdmFyIGJpbmRFbCA9IG5ldyBTdGFuemEuRWxlbWVudChcbiAgICAgICAgICAgICdpcScsXG4gICAgICAgICAgICB7IHR5cGU6ICdzZXQnLCBpZDogSVFJRF9CSU5EIH1cbiAgICAgICAgKS5jKCdiaW5kJywgeyB4bWxuczogTlNfWE1QUF9CSU5EIH0pXG4gICAgICAgIGlmICh0aGlzLmppZC5yZXNvdXJjZSlcbiAgICAgICAgICAgIGJpbmRFbC5jKCdyZXNvdXJjZScpLnQodGhpcy5qaWQucmVzb3VyY2UpXG4gICAgICAgIHRoaXMuc2VuZChiaW5kRWwpXG4gICAgfSBlbHNlIGlmICgodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSEVEKSAmJlxuICAgICAgICAgICAgICAgIXRoaXMuZGlkX3Nlc3Npb24gJiZcbiAgICAgICAgICAgICAgIHRoaXMuc3RyZWFtRmVhdHVyZXMuZ2V0Q2hpbGQoJ3Nlc3Npb24nLCBOU19YTVBQX1NFU1NJT04pKSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBTVEFURV9TRVNTSU9OXG4gICAgICAgIHZhciBzdGFuemEgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICAgJ2lxJyxcbiAgICAgICAgICB7IHR5cGU6ICdzZXQnLCB0bzogdGhpcy5qaWQuZG9tYWluLCBpZDogSVFJRF9TRVNTSU9OICB9XG4gICAgICAgICkuYygnc2Vzc2lvbicsIHsgeG1sbnM6IE5TX1hNUFBfU0VTU0lPTiB9KVxuICAgICAgICB0aGlzLnNlbmQoc3RhbnphKVxuICAgIH0gZWxzZSBpZiAodGhpcy5zdGF0ZSA9PT0gU1RBVEVfQVVUSEVEKSB7XG4gICAgICAgIC8qIE9rLCB3ZSdyZSBhdXRoZW50aWNhdGVkIGFuZCBhbGwgZmVhdHVyZXMgaGF2ZSBiZWVuXG4gICAgICAgICAgIHByb2Nlc3NlZCAqL1xuICAgICAgICB0aGlzLnN0YXRlID0gU1RBVEVfT05MSU5FXG4gICAgICAgIHRoaXMuZW1pdCgnb25saW5lJywgeyBqaWQ6IHRoaXMuamlkIH0pXG4gICAgfVxufVxuXG5DbGllbnQucHJvdG90eXBlLmRvUmVnaXN0ZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgaWQgPSAncmVnaXN0ZXInICsgTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiA5OTk5OSlcbiAgICB2YXIgaXEgPSBuZXcgU3RhbnphLkVsZW1lbnQoXG4gICAgICAgICdpcScsXG4gICAgICAgIHsgdHlwZTogJ3NldCcsIGlkOiBpZCwgdG86IHRoaXMuamlkLmRvbWFpbiB9XG4gICAgKS5jKCdxdWVyeScsIHsgeG1sbnM6IE5TX1JFR0lTVEVSIH0pXG4gICAgLmMoJ3VzZXJuYW1lJykudCh0aGlzLmppZC51c2VyKS51cCgpXG4gICAgLmMoJ3Bhc3N3b3JkJykudCh0aGlzLnBhc3N3b3JkKVxuICAgIHRoaXMuc2VuZChpcSlcblxuICAgIHZhciBzZWxmID0gdGhpc1xuICAgIHZhciBvblJlcGx5ID0gZnVuY3Rpb24ocmVwbHkpIHtcbiAgICAgICAgaWYgKHJlcGx5LmlzKCdpcScpICYmIChyZXBseS5hdHRycy5pZCA9PT0gaWQpKSB7XG4gICAgICAgICAgICBzZWxmLnJlbW92ZUxpc3RlbmVyKCdzdGFuemEnLCBvblJlcGx5KVxuXG4gICAgICAgICAgICBpZiAocmVwbHkuYXR0cnMudHlwZSA9PT0gJ3Jlc3VsdCcpIHtcbiAgICAgICAgICAgICAgICAvKiBSZWdpc3RyYXRpb24gc3VjY2Vzc2Z1bCwgcHJvY2VlZCB0byBhdXRoICovXG4gICAgICAgICAgICAgICAgc2VsZi51c2VGZWF0dXJlcygpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHNlbGYuZW1pdCgnZXJyb3InLCBuZXcgRXJyb3IoJ1JlZ2lzdHJhdGlvbiBlcnJvcicpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRoaXMub24oJ3N0YW56YTpwcmVhdXRoJywgb25SZXBseSlcbn1cblxuLyoqXG4gKiByZXR1cm5zIGFsbCByZWdpc3RlcmVkIHNhc2wgbWVjaGFuaXNtc1xuICovXG5DbGllbnQucHJvdG90eXBlLmdldFNhc2xNZWNoYW5pc21zID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXNcbn1cblxuLyoqXG4gKiByZW1vdmVzIGFsbCByZWdpc3RlcmVkIHNhc2wgbWVjaGFuaXNtc1xuICovXG5DbGllbnQucHJvdG90eXBlLmNsZWFyU2FzbE1lY2hhbmlzbSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMgPSBbXVxufVxuXG4vKipcbiAqIHJlZ2lzdGVyIGEgbmV3IHNhc2wgbWVjaGFuaXNtXG4gKi9cbkNsaWVudC5wcm90b3R5cGUucmVnaXN0ZXJTYXNsTWVjaGFuaXNtID0gZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgLy8gY2hlY2sgaWYgbWV0aG9kIGlzIHJlZ2lzdGVyZWRcbiAgICBpZiAodGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcy5pbmRleE9mKG1ldGhvZCkgPT09IC0xICkge1xuICAgICAgICB0aGlzLmF2YWlsYWJsZVNhc2xNZWNoYW5pc21zLnB1c2gobWV0aG9kKVxuICAgIH1cbn1cblxuLyoqXG4gKiB1bnJlZ2lzdGVyIGFuIGV4aXN0aW5nIHNhc2wgbWVjaGFuaXNtXG4gKi9cbkNsaWVudC5wcm90b3R5cGUudW5yZWdpc3RlclNhc2xNZWNoYW5pc20gPSBmdW5jdGlvbihtZXRob2QpIHtcbiAgICAvLyBjaGVjayBpZiBtZXRob2QgaXMgcmVnaXN0ZXJlZFxuICAgIHZhciBpbmRleCA9IHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMuaW5kZXhPZihtZXRob2QpXG4gICAgaWYgKGluZGV4ID49IDApIHtcbiAgICAgICAgdGhpcy5hdmFpbGFibGVTYXNsTWVjaGFuaXNtcyA9IHRoaXMuYXZhaWxhYmxlU2FzbE1lY2hhbmlzbXMuc3BsaWNlKGluZGV4LCAxKVxuICAgIH1cbn1cblxuQ2xpZW50LlNBU0wgPSBzYXNsXG5DbGllbnQuQ2xpZW50ID0gQ2xpZW50XG5DbGllbnQuU3RhbnphID0gU3RhbnphXG5DbGllbnQubHR4ID0gbHR4XG5tb2R1bGUuZXhwb3J0cyA9IENsaWVudFxufSkuY2FsbCh0aGlzLFwiLy4uL25vZGVfbW9kdWxlcy9ub2RlLXhtcHAtY2xpZW50XCIpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIE1lY2hhbmlzbSA9IHJlcXVpcmUoJy4vbWVjaGFuaXNtJylcblxuLyoqXG4gKiBAc2VlIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzQ1MDVcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxNzUuaHRtbFxuICovXG5mdW5jdGlvbiBBbm9ueW1vdXMoKSB7fVxuXG51dGlsLmluaGVyaXRzKEFub255bW91cywgTWVjaGFuaXNtKVxuXG5Bbm9ueW1vdXMucHJvdG90eXBlLm5hbWUgPSAnQU5PTllNT1VTJ1xuXG5Bbm9ueW1vdXMucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoemlkXG59O1xuXG5Bbm9ueW1vdXMucHJvdG90eXBlLm1hdGNoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRydWVcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBbm9ueW1vdXMiLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgY3J5cHRvID0gcmVxdWlyZSgnY3J5cHRvJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cblxuLyoqXG4gKiBIYXNoIGEgc3RyaW5nXG4gKi9cbmZ1bmN0aW9uIG1kNShzLCBlbmNvZGluZykge1xuICAgIHZhciBoYXNoID0gY3J5cHRvLmNyZWF0ZUhhc2goJ21kNScpXG4gICAgaGFzaC51cGRhdGUocylcbiAgICByZXR1cm4gaGFzaC5kaWdlc3QoZW5jb2RpbmcgfHwgJ2JpbmFyeScpXG59XG5mdW5jdGlvbiBtZDVIZXgocykge1xuICAgIHJldHVybiBtZDUocywgJ2hleCcpXG59XG5cbi8qKlxuICogUGFyc2UgU0FTTCBzZXJpYWxpemF0aW9uXG4gKi9cbmZ1bmN0aW9uIHBhcnNlRGljdChzKSB7XG4gICAgdmFyIHJlc3VsdCA9IHt9XG4gICAgd2hpbGUgKHMpIHtcbiAgICAgICAgdmFyIG1cbiAgICAgICAgaWYgKChtID0gL14oLis/KT0oLio/W15cXFxcXSksXFxzKiguKikvLmV4ZWMocykpKSB7XG4gICAgICAgICAgICByZXN1bHRbbVsxXV0gPSBtWzJdLnJlcGxhY2UoL1xcXCIvZywgJycpXG4gICAgICAgICAgICBzID0gbVszXVxuICAgICAgICB9IGVsc2UgaWYgKChtID0gL14oLis/KT0oLis/KSxcXHMqKC4qKS8uZXhlYyhzKSkpIHtcbiAgICAgICAgICAgIHJlc3VsdFttWzFdXSA9IG1bMl1cbiAgICAgICAgICAgIHMgPSBtWzNdXG4gICAgICAgIH0gZWxzZSBpZiAoKG0gPSAvXiguKz8pPVwiKC4qP1teXFxcXF0pXCIkLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIGlmICgobSA9IC9eKC4rPyk9KC4rPykkLy5leGVjKHMpKSkge1xuICAgICAgICAgICAgcmVzdWx0W21bMV1dID0gbVsyXVxuICAgICAgICAgICAgcyA9IG1bM11cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHMgPSBudWxsXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlc3VsdFxufVxuXG4vKipcbiAqIFNBU0wgc2VyaWFsaXphdGlvblxuICovXG5mdW5jdGlvbiBlbmNvZGVEaWN0KGRpY3QpIHtcbiAgICB2YXIgcyA9ICcnXG4gICAgZm9yICh2YXIgayBpbiBkaWN0KSB7XG4gICAgICAgIHZhciB2ID0gZGljdFtrXVxuICAgICAgICBpZiAodikgcyArPSAnLCcgKyBrICsgJz1cIicgKyB2ICsgJ1wiJ1xuICAgIH1cbiAgICByZXR1cm4gcy5zdWJzdHIoMSkgLy8gd2l0aG91dCBmaXJzdCAnLCdcbn1cblxuLyoqXG4gKiBSaWdodC1qdXN0aWZ5IGEgc3RyaW5nLFxuICogZWcuIHBhZCB3aXRoIDBzXG4gKi9cbmZ1bmN0aW9uIHJqdXN0KHMsIHRhcmdldExlbiwgcGFkZGluZykge1xuICAgIHdoaWxlIChzLmxlbmd0aCA8IHRhcmdldExlbilcbiAgICAgICAgcyA9IHBhZGRpbmcgKyBzXG4gICAgcmV0dXJuIHNcbn1cblxuLyoqXG4gKiBHZW5lcmF0ZSBhIHN0cmluZyBvZiA4IGRpZ2l0c1xuICogKG51bWJlciB1c2VkIG9uY2UpXG4gKi9cbmZ1bmN0aW9uIGdlbmVyYXRlTm9uY2UoKSB7XG4gICAgdmFyIHJlc3VsdCA9ICcnXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCA4OyBpKyspXG4gICAgICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKDQ4ICtcbiAgICAgICAgICAgIE1hdGguY2VpbChNYXRoLnJhbmRvbSgpICogMTApKVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiBAc2VlIGh0dHA6Ly90b29scy5pZXRmLm9yZy9odG1sL3JmYzI4MzFcbiAqIEBzZWUgaHR0cDovL3dpa2kueG1wcC5vcmcvd2ViL1NBU0xhbmRESUdFU1QtTUQ1XG4gKi9cbmZ1bmN0aW9uIERpZ2VzdE1ENSgpIHtcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdGhpcy5ub25jZV9jb3VudCA9IDBcbiAgICB0aGlzLmNub25jZSA9IGdlbmVyYXRlTm9uY2UoKVxuICAgIHRoaXMuYXV0aGNpZCA9IG51bGxcbiAgICB0aGlzLmFjdEFzID0gbnVsbFxuICAgIHRoaXMucmVhbG0gPSBudWxsXG4gICAgdGhpcy5wYXNzd29yZCA9IG51bGxcbn1cblxudXRpbC5pbmhlcml0cyhEaWdlc3RNRDUsIE1lY2hhbmlzbSlcblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5uYW1lID0gJ0RJR0VTVC1NRDUnXG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUuYXV0aCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAnJ1xufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLmdldE5DID0gZnVuY3Rpb24oKSB7XG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHJldHVybiByanVzdCh0aGlzLm5vbmNlX2NvdW50LnRvU3RyaW5nKCksIDgsICcwJylcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5yZXNwb25zZVZhbHVlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcGFyc2VEaWN0KHMpXG4gICAgaWYgKGRpY3QucmVhbG0pXG4gICAgICAgIHRoaXMucmVhbG0gPSBkaWN0LnJlYWxtXG5cbiAgICB2YXIgdmFsdWVcbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgaWYgKGRpY3Qubm9uY2UgJiYgZGljdC5xb3ApIHtcbiAgICAgICAgdGhpcy5ub25jZV9jb3VudCsrXG4gICAgICAgIHZhciBhMSA9IG1kNSh0aGlzLmF1dGhjaWQgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5yZWFsbSArICc6JyArXG4gICAgICAgICAgICB0aGlzLnBhc3N3b3JkKSArICc6JyArXG4gICAgICAgICAgICBkaWN0Lm5vbmNlICsgJzonICtcbiAgICAgICAgICAgIHRoaXMuY25vbmNlXG4gICAgICAgIGlmICh0aGlzLmFjdEFzKSBhMSArPSAnOicgKyB0aGlzLmFjdEFzXG5cbiAgICAgICAgdmFyIGEyID0gJ0FVVEhFTlRJQ0FURTonICsgdGhpcy5kaWdlc3RfdXJpXG4gICAgICAgIGlmICgoZGljdC5xb3AgPT09ICdhdXRoLWludCcpIHx8IChkaWN0LnFvcCA9PT0gJ2F1dGgtY29uZicpKVxuICAgICAgICAgICAgYTIgKz0gJzowMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMCdcblxuICAgICAgICB2YWx1ZSA9IG1kNUhleChtZDVIZXgoYTEpICsgJzonICtcbiAgICAgICAgICAgIGRpY3Qubm9uY2UgKyAnOicgK1xuICAgICAgICAgICAgdGhpcy5nZXROQygpICsgJzonICtcbiAgICAgICAgICAgIHRoaXMuY25vbmNlICsgJzonICtcbiAgICAgICAgICAgIGRpY3QucW9wICsgJzonICtcbiAgICAgICAgICAgIG1kNUhleChhMikpXG4gICAgfVxuICAgIHJldHVybiB2YWx1ZVxufVxuXG5EaWdlc3RNRDUucHJvdG90eXBlLmNoYWxsZW5nZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHBhcnNlRGljdChzKVxuICAgIGlmIChkaWN0LnJlYWxtKVxuICAgICAgICB0aGlzLnJlYWxtID0gZGljdC5yZWFsbVxuXG4gICAgdmFyIHJlc3BvbnNlXG4gICAgLypqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIGlmIChkaWN0Lm5vbmNlICYmIGRpY3QucW9wKSB7XG4gICAgICAgIHZhciByZXNwb25zZVZhbHVlID0gdGhpcy5yZXNwb25zZVZhbHVlKHMpXG4gICAgICAgIHJlc3BvbnNlID0ge1xuICAgICAgICAgICAgdXNlcm5hbWU6IHRoaXMuYXV0aGNpZCxcbiAgICAgICAgICAgIHJlYWxtOiB0aGlzLnJlYWxtLFxuICAgICAgICAgICAgbm9uY2U6IGRpY3Qubm9uY2UsXG4gICAgICAgICAgICBjbm9uY2U6IHRoaXMuY25vbmNlLFxuICAgICAgICAgICAgbmM6IHRoaXMuZ2V0TkMoKSxcbiAgICAgICAgICAgIHFvcDogZGljdC5xb3AsXG4gICAgICAgICAgICAnZGlnZXN0LXVyaSc6IHRoaXMuZGlnZXN0X3VyaSxcbiAgICAgICAgICAgIHJlc3BvbnNlOiByZXNwb25zZVZhbHVlLFxuICAgICAgICAgICAgY2hhcnNldDogJ3V0Zi04J1xuICAgICAgICB9XG4gICAgICAgIGlmICh0aGlzLmFjdEFzKSByZXNwb25zZS5hdXRoemlkID0gdGhpcy5hY3RBc1xuICAgIH0gZWxzZSBpZiAoZGljdC5yc3BhdXRoKSB7XG4gICAgICAgIHJldHVybiAnJ1xuICAgIH1cbiAgICByZXR1cm4gZW5jb2RlRGljdChyZXNwb25zZSlcbn1cblxuRGlnZXN0TUQ1LnByb3RvdHlwZS5zZXJ2ZXJDaGFsbGVuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZGljdCA9IHt9XG4gICAgZGljdC5yZWFsbSA9ICcnXG4gICAgdGhpcy5ub25jZSA9IGRpY3Qubm9uY2UgPSBnZW5lcmF0ZU5vbmNlKClcbiAgICBkaWN0LnFvcCA9ICdhdXRoJ1xuICAgIHRoaXMuY2hhcnNldCA9IGRpY3QuY2hhcnNldCA9ICd1dGYtOCdcbiAgICBkaWN0LmFsZ29yaXRobSA9ICdtZDUtc2VzcydcbiAgICByZXR1cm4gZW5jb2RlRGljdChkaWN0KVxufVxuXG4vLyBVc2VkIG9uIHRoZSBzZXJ2ZXIgdG8gY2hlY2sgZm9yIGF1dGghXG5EaWdlc3RNRDUucHJvdG90eXBlLnJlc3BvbnNlID0gZnVuY3Rpb24ocykge1xuICAgIHZhciBkaWN0ID0gcGFyc2VEaWN0KHMpXG4gICAgdGhpcy5hdXRoY2lkID0gZGljdC51c2VybmFtZVxuXG4gICAgaWYgKGRpY3Qubm9uY2UgIT09IHRoaXMubm9uY2UpIHJldHVybiBmYWxzZVxuICAgIGlmICghZGljdC5jbm9uY2UpIHJldHVybiBmYWxzZVxuXG4gICAgdGhpcy5jbm9uY2UgPSBkaWN0LmNub25jZVxuICAgIGlmICh0aGlzLmNoYXJzZXQgIT09IGRpY3QuY2hhcnNldCkgcmV0dXJuIGZhbHNlXG5cbiAgICB0aGlzLnJlc3BvbnNlID0gZGljdC5yZXNwb25zZVxuICAgIHJldHVybiB0cnVlXG59XG5cbkRpZ2VzdE1ENS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgaWYgKG9wdGlvbnMucGFzc3dvcmQpIHJldHVybiB0cnVlXG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gRGlnZXN0TUQ1XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG4vKipcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxNzguaHRtbFxuICovXG5mdW5jdGlvbiBFeHRlcm5hbCgpIHt9XG5cbnV0aWwuaW5oZXJpdHMoRXh0ZXJuYWwsIE1lY2hhbmlzbSlcblxuRXh0ZXJuYWwucHJvdG90eXBlLm5hbWUgPSAnRVhURVJOQUwnXG5cbkV4dGVybmFsLnByb3RvdHlwZS5hdXRoID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuICh0aGlzLmF1dGh6aWQpXG59XG5cbkV4dGVybmFsLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5jcmVkZW50aWFscykgcmV0dXJuIHRydWVcbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBFeHRlcm5hbCIsIid1c2Ugc3RyaWN0JztcblxuLyoqXG4gKiBFYWNoIGltcGxlbWVudGVkIG1lY2hhbmlzbSBvZmZlcnMgbXVsdGlwbGUgbWV0aG9kc1xuICogLSBuYW1lIDogbmFtZSBvZiB0aGUgYXV0aCBtZXRob2RcbiAqIC0gYXV0aCA6XG4gKiAtIG1hdGNoOiBjaGVja3MgaWYgdGhlIGNsaWVudCBoYXMgZW5vdWdoIG9wdGlvbnMgdG9cbiAqICAgICAgICAgIG9mZmVyIHRoaXMgbWVjaGFuaXMgdG8geG1wcCBzZXJ2ZXJzXG4gKiAtIGF1dGhTZXJ2ZXI6IHRha2VzIGEgc3RhbnphIGFuZCBleHRyYWN0cyB0aGUgaW5mb3JtYXRpb25cbiAqL1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxuXG4vLyBNZWNoYW5pc21zXG5mdW5jdGlvbiBNZWNoYW5pc20oKSB7fVxuXG51dGlsLmluaGVyaXRzKE1lY2hhbmlzbSwgRXZlbnRFbWl0dGVyKVxuXG5NZWNoYW5pc20ucHJvdG90eXBlLmF1dGhBdHRycyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7fVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IE1lY2hhbmlzbSIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG5cbmZ1bmN0aW9uIFBsYWluKCkge31cblxudXRpbC5pbmhlcml0cyhQbGFpbiwgTWVjaGFuaXNtKVxuXG5QbGFpbi5wcm90b3R5cGUubmFtZSA9ICdQTEFJTidcblxuUGxhaW4ucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5hdXRoemlkICsgJ1xcMCcgK1xuICAgICAgICB0aGlzLmF1dGhjaWQgKyAnXFwwJyArXG4gICAgICAgIHRoaXMucGFzc3dvcmQ7XG59XG5cblBsYWluLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICBpZiAob3B0aW9ucy5wYXNzd29yZCkgcmV0dXJuIHRydWVcbiAgICByZXR1cm4gZmFsc2Vcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBQbGFpbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBNZWNoYW5pc20gPSByZXF1aXJlKCcuL21lY2hhbmlzbScpXG4gICwgcXVlcnlzdHJpbmcgPSByZXF1aXJlKCdxdWVyeXN0cmluZycpXG5cbi8qKlxuICogQHNlZSBodHRwczovL2RldmVsb3BlcnMuZmFjZWJvb2suY29tL2RvY3MvY2hhdC8jcGxhdGF1dGhcbiAqL1xudmFyIFhGYWNlYm9va1BsYXRmb3JtID0gZnVuY3Rpb24oKSB7fVxuXG51dGlsLmluaGVyaXRzKFhGYWNlYm9va1BsYXRmb3JtLCBNZWNoYW5pc20pXG5cblhGYWNlYm9va1BsYXRmb3JtLnByb3RvdHlwZS5uYW1lID0gJ1gtRkFDRUJPT0stUExBVEZPUk0nXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuaG9zdCA9ICdjaGF0LmZhY2Vib29rLmNvbSdcblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJydcbn1cblxuWEZhY2Vib29rUGxhdGZvcm0ucHJvdG90eXBlLmNoYWxsZW5nZSA9IGZ1bmN0aW9uKHMpIHtcbiAgICB2YXIgZGljdCA9IHF1ZXJ5c3RyaW5nLnBhcnNlKHMpXG5cbiAgICAvKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG4gICAgdmFyIHJlc3BvbnNlID0ge1xuICAgICAgICBhcGlfa2V5OiB0aGlzLmFwaV9rZXksXG4gICAgICAgIGNhbGxfaWQ6IG5ldyBEYXRlKCkuZ2V0VGltZSgpLFxuICAgICAgICBtZXRob2Q6IGRpY3QubWV0aG9kLFxuICAgICAgICBub25jZTogZGljdC5ub25jZSxcbiAgICAgICAgYWNjZXNzX3Rva2VuOiB0aGlzLmFjY2Vzc190b2tlbixcbiAgICAgICAgdjogJzEuMCdcbiAgICB9XG5cbiAgICByZXR1cm4gcXVlcnlzdHJpbmcuc3RyaW5naWZ5KHJlc3BvbnNlKVxufVxuXG5YRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUubWF0Y2ggPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgdmFyIGhvc3QgPSBYRmFjZWJvb2tQbGF0Zm9ybS5wcm90b3R5cGUuaG9zdFxuICAgIGlmICgob3B0aW9ucy5ob3N0ID09PSBob3N0KSB8fFxuICAgICAgICAob3B0aW9ucy5qaWQgJiYgKG9wdGlvbnMuamlkLmdldERvbWFpbigpID09PSBob3N0KSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWVcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlXG59XG5cbm1vZHVsZS5leHBvcnRzID0gWEZhY2Vib29rUGxhdGZvcm0iLCIndXNlIHN0cmljdCc7XG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgTWVjaGFuaXNtID0gcmVxdWlyZSgnLi9tZWNoYW5pc20nKVxuXG4vKipcbiAqIEBzZWUgaHR0cHM6Ly9kZXZlbG9wZXJzLmdvb2dsZS5jb20vdGFsay9qZXBfZXh0ZW5zaW9ucy9vYXV0aFxuICovXG4vKmpzaGludCBjYW1lbGNhc2U6IGZhbHNlICovXG5mdW5jdGlvbiBYT0F1dGgyKCkge1xuICAgIHRoaXMub2F1dGgyX2F1dGggPSBudWxsXG4gICAgdGhpcy5hdXRoemlkID0gbnVsbFxufVxuXG51dGlsLmluaGVyaXRzKFhPQXV0aDIsIE1lY2hhbmlzbSlcblxuWE9BdXRoMi5wcm90b3R5cGUubmFtZSA9ICdYLU9BVVRIMidcblhPQXV0aDIucHJvdG90eXBlLk5TX0dPT0dMRV9BVVRIID0gJ2h0dHA6Ly93d3cuZ29vZ2xlLmNvbS90YWxrL3Byb3RvY29sL2F1dGgnXG5cblhPQXV0aDIucHJvdG90eXBlLmF1dGggPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gJ1xcMCcgKyB0aGlzLmF1dGh6aWQgKyAnXFwwJyArIHRoaXMub2F1dGgyX3Rva2VuXG59XG5cblhPQXV0aDIucHJvdG90eXBlLmF1dGhBdHRycyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgICdhdXRoOnNlcnZpY2UnOiAnb2F1dGgyJyxcbiAgICAgICAgJ3htbG5zOmF1dGgnOiB0aGlzLm9hdXRoMl9hdXRoXG4gICAgfVxufVxuXG5YT0F1dGgyLnByb3RvdHlwZS5tYXRjaCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgICByZXR1cm4gKG9wdGlvbnMub2F1dGgyX2F1dGggPT09IFhPQXV0aDIucHJvdG90eXBlLk5TX0dPT0dMRV9BVVRIKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFhPQXV0aDJcbiIsIihmdW5jdGlvbiAocHJvY2Vzcyl7XG4ndXNlIHN0cmljdCc7XG5cbnZhciBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgcmVxdWVzdCA9IHJlcXVpcmUoJ3JlcXVlc3QnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG4gICwgZGVidWcgPSByZXF1aXJlKCdkZWJ1ZycpKCd4bXBwOmNsaWVudDpib3NoJylcblxuZnVuY3Rpb24gQk9TSENvbm5lY3Rpb24ob3B0cykge1xuICAgIHZhciB0aGF0ID0gdGhpc1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLmJvc2hVUkwgPSBvcHRzLmJvc2gudXJsXG4gICAgdGhpcy5qaWQgPSBvcHRzLmppZFxuICAgIHRoaXMud2FpdCA9IG9wdHMuYm9zaC53YWl0IHx8IDEwO1xuICAgIHRoaXMueG1sbnNBdHRycyA9IHtcbiAgICAgICAgeG1sbnM6ICdodHRwOi8vamFiYmVyLm9yZy9wcm90b2NvbC9odHRwYmluZCcsXG4gICAgICAgICd4bWxuczp4bXBwJzogJ3Vybjp4bXBwOnhib3NoJyxcbiAgICAgICAgJ3htbG5zOnN0cmVhbSc6ICdodHRwOi8vZXRoZXJ4LmphYmJlci5vcmcvc3RyZWFtcydcbiAgICB9XG4gICAgaWYgKG9wdHMueG1sbnMpIHtcbiAgICAgICAgZm9yICh2YXIgcHJlZml4IGluIG9wdHMueG1sbnMpIHtcbiAgICAgICAgICAgIGlmIChwcmVmaXgpIHtcbiAgICAgICAgICAgICAgICB0aGlzLnhtbG5zQXR0cnNbJ3htbG5zOicgKyBwcmVmaXhdID0gb3B0cy54bWxuc1twcmVmaXhdXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRoaXMueG1sbnNBdHRycy54bWxucyA9IG9wdHMueG1sbnNbcHJlZml4XVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIHRoaXMuY3VycmVudFJlcXVlc3RzID0gMFxuICAgIHRoaXMucXVldWUgPSBbXVxuICAgIHRoaXMucmlkID0gTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiA5OTk5OTk5OTk5KVxuXG4gICAgdGhpcy5yZXF1ZXN0KHtcbiAgICAgICAgICAgIHRvOiB0aGlzLmppZC5kb21haW4sXG4gICAgICAgICAgICB2ZXI6ICcxLjYnLFxuICAgICAgICAgICAgd2FpdDogdGhpcy53YWl0LFxuICAgICAgICAgICAgaG9sZDogJzEnLFxuICAgICAgICAgICAgY29udGVudDogdGhpcy5jb250ZW50VHlwZSxcbiAgICAgICAgICAgICd4bXBwOnZlcnNpb24nOiAnMS4wJ1xuICAgICAgICB9LFxuICAgICAgICBbXSxcbiAgICAgICAgZnVuY3Rpb24oZXJyLCBib2R5RWwpIHtcbiAgICAgICAgICAgIGlmIChlcnIpIHtcbiAgICAgICAgICAgICAgICB0aGF0LmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChib2R5RWwgJiYgYm9keUVsLmF0dHJzKSB7XG4gICAgICAgICAgICAgICAgdGhhdC5zaWQgPSBib2R5RWwuYXR0cnMuc2lkXG4gICAgICAgICAgICAgICAgdGhhdC5tYXhSZXF1ZXN0cyA9IHBhcnNlSW50KGJvZHlFbC5hdHRycy5yZXF1ZXN0cywgMTApIHx8IDJcbiAgICAgICAgICAgICAgICBpZiAodGhhdC5zaWQgJiYgKHRoYXQubWF4UmVxdWVzdHMgPiAwKSkge1xuICAgICAgICAgICAgICAgICAgICB0aGF0LmVtaXQoJ2Nvbm5lY3QnKVxuICAgICAgICAgICAgICAgICAgICB0aGF0LnByb2Nlc3NSZXNwb25zZShib2R5RWwpXG4gICAgICAgICAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2sodGhhdC5tYXlSZXF1ZXN0LmJpbmQodGhhdCkpXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdGhhdC5lbWl0KCdlcnJvcicsICdJbnZhbGlkIHBhcmFtZXRlcnMnKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSlcblxufVxuXG51dGlsLmluaGVyaXRzKEJPU0hDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5jb250ZW50VHlwZSA9ICd0ZXh0L3htbDsgY2hhcnNldD11dGYtOCdcblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLnNlbmQgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICB0aGlzLnF1ZXVlLnB1c2goc3RhbnphLnJvb3QoKSlcbiAgICBwcm9jZXNzLm5leHRUaWNrKHRoaXMubWF5UmVxdWVzdC5iaW5kKHRoaXMpKVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcblxuICAgIHRoaXMucmlkKytcbiAgICB0aGlzLnJlcXVlc3Qoe1xuICAgICAgICB0bzogdGhpcy5qaWQuZG9tYWluLFxuICAgICAgICAneG1wcDpyZXN0YXJ0JzogJ3RydWUnXG4gICAgfSxcbiAgICBbXSxcbiAgICBmdW5jdGlvbiAoZXJyLCBib2R5RWwpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgdGhhdC5lbWl0KCdlcnJvcicsIGVycilcbiAgICAgICAgICAgIHRoYXQuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgICAgICAgICB0aGF0LmVtaXQoJ2VuZCcpXG4gICAgICAgICAgICBkZWxldGUgdGhhdC5zaWRcbiAgICAgICAgICAgIHRoYXQuZW1pdCgnY2xvc2UnKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhhdC5zdHJlYW1PcGVuZWQgPSB0cnVlXG4gICAgICAgICAgICBpZiAoYm9keUVsKSB0aGF0LnByb2Nlc3NSZXNwb25zZShib2R5RWwpXG5cbiAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2sodGhhdC5tYXlSZXF1ZXN0LmJpbmQodGhhdCkpXG4gICAgICAgIH1cbiAgICB9KVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUucHJvY2Vzc1Jlc3BvbnNlID0gZnVuY3Rpb24oYm9keUVsKSB7XG4gICAgZGVidWcoJ3Byb2Nlc3MgYm9zaCBzZXJ2ZXIgcmVzcG9uc2UgJyArIGJvZHlFbC50b1N0cmluZygpKVxuICAgIGlmIChib2R5RWwgJiYgYm9keUVsLmNoaWxkcmVuKSB7XG4gICAgICAgIGZvcih2YXIgaSA9IDA7IGkgPCBib2R5RWwuY2hpbGRyZW4ubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIHZhciBjaGlsZCA9IGJvZHlFbC5jaGlsZHJlbltpXVxuICAgICAgICAgICAgaWYgKGNoaWxkLm5hbWUgJiYgY2hpbGQuYXR0cnMgJiYgY2hpbGQuY2hpbGRyZW4pXG4gICAgICAgICAgICAgICAgdGhpcy5lbWl0KCdzdGFuemEnLCBjaGlsZClcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAoYm9keUVsICYmIChib2R5RWwuYXR0cnMudHlwZSA9PT0gJ3Rlcm1pbmF0ZScpKSB7XG4gICAgICAgIGlmICghdGhpcy5zaHV0ZG93biB8fCBib2R5RWwuYXR0cnMuY29uZGl0aW9uKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsXG4gICAgICAgICAgICAgICAgICAgICAgbmV3IEVycm9yKGJvZHlFbC5hdHRycy5jb25kaXRpb24gfHwgJ1Nlc3Npb24gdGVybWluYXRlZCcpKVxuICAgICAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG4gICAgICAgIHRoaXMuZW1pdCgnY2xvc2UnKVxuICAgIH1cbn1cblxuQk9TSENvbm5lY3Rpb24ucHJvdG90eXBlLm1heVJlcXVlc3QgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgY2FuUmVxdWVzdCA9XG4gICAgICAgIC8qIE11c3QgaGF2ZSBhIHNlc3Npb24gYWxyZWFkeSAqL1xuICAgICAgICB0aGlzLnNpZCAmJlxuICAgICAgICAvKiBXZSBjYW4gb25seSByZWNlaXZlIHdoZW4gb25lIHJlcXVlc3QgaXMgaW4gZmxpZ2h0ICovXG4gICAgICAgICgodGhpcy5jdXJyZW50UmVxdWVzdHMgPT09IDApIHx8XG4gICAgICAgICAvKiBJcyB0aGVyZSBzb21ldGhpbmcgdG8gc2VuZCwgYW5kIGFyZSB3ZSBhbGxvd2VkPyAqL1xuICAgICAgICAgKCgodGhpcy5xdWV1ZS5sZW5ndGggPiAwKSAmJiAodGhpcy5jdXJyZW50UmVxdWVzdHMgPCB0aGlzLm1heFJlcXVlc3RzKSkpXG4gICAgICAgIClcblxuICAgIGlmICghY2FuUmVxdWVzdCkgcmV0dXJuXG5cbiAgICB2YXIgc3RhbnphcyA9IHRoaXMucXVldWVcbiAgICB0aGlzLnF1ZXVlID0gW11cbiAgICB0aGlzLnJpZCsrXG4gICAgdGhpcy5yZXF1ZXN0KHt9LCBzdGFuemFzLCBmdW5jdGlvbihlcnIsIGJvZHlFbCkge1xuICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICB0aGlzLmVtaXQoJ2Vycm9yJywgZXJyKVxuICAgICAgICAgICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JylcbiAgICAgICAgICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLnNpZFxuICAgICAgICAgICAgdGhpcy5lbWl0KCdjbG9zZScpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAoYm9keUVsKSB0aGlzLnByb2Nlc3NSZXNwb25zZShib2R5RWwpXG5cbiAgICAgICAgICAgIHByb2Nlc3MubmV4dFRpY2sodGhpcy5tYXlSZXF1ZXN0LmJpbmQodGhpcykpXG4gICAgICAgIH1cbiAgICB9LmJpbmQodGhpcykpXG59XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5lbmQgPSBmdW5jdGlvbihzdGFuemFzKSB7XG4gICAgc3RhbnphcyA9IHN0YW56YXMgfHwgW11cbiAgICBpZiAodHlwZW9mIHN0YW56YXMgIT09IEFycmF5KSBzdGFuemFzID0gW3N0YW56YXNdXG5cbiAgICBzdGFuemFzID0gdGhpcy5xdWV1ZS5jb25jYXQoc3RhbnphcylcbiAgICB0aGlzLnNodXRkb3duID0gdHJ1ZVxuICAgIHRoaXMucXVldWUgPSBbXVxuICAgIHRoaXMucmlkKytcbiAgICB0aGlzLnJlcXVlc3QoeyB0eXBlOiAndGVybWluYXRlJyB9LCBzdGFuemFzLCBmdW5jdGlvbihlcnIsIGJvZHlFbCkge1xuICAgICAgICBpZiAoYm9keUVsKSB0aGlzLnByb2Nlc3NSZXNwb25zZShib2R5RWwpXG5cbiAgICAgICAgdGhpcy5lbWl0KCdkaXNjb25uZWN0JylcbiAgICAgICAgdGhpcy5lbWl0KCdlbmQnKVxuICAgICAgICBkZWxldGUgdGhpcy5zaWRcbiAgICAgICAgdGhpcy5lbWl0KCdjbG9zZScpXG4gICAgfS5iaW5kKHRoaXMpKVxufVxuXG5CT1NIQ29ubmVjdGlvbi5wcm90b3R5cGUubWF4SFRUUFJldHJpZXMgPSA1XG5cbkJPU0hDb25uZWN0aW9uLnByb3RvdHlwZS5yZXF1ZXN0ID0gZnVuY3Rpb24oYXR0cnMsIGNoaWxkcmVuLCBjYiwgcmV0cnkpIHtcbiAgICB2YXIgdGhhdCA9IHRoaXNcbiAgICByZXRyeSA9IHJldHJ5IHx8IDBcblxuICAgIGF0dHJzLnJpZCA9IHRoaXMucmlkLnRvU3RyaW5nKClcbiAgICBpZiAodGhpcy5zaWQpIGF0dHJzLnNpZCA9IHRoaXMuc2lkXG5cbiAgICBmb3IgKHZhciBrIGluIHRoaXMueG1sbnNBdHRycykge1xuICAgICAgICBhdHRyc1trXSA9IHRoaXMueG1sbnNBdHRyc1trXVxuICAgIH1cbiAgICB2YXIgYm9zaEVsID0gbmV3IGx0eC5FbGVtZW50KCdib2R5JywgYXR0cnMpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBjaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICBib3NoRWwuY25vZGUoY2hpbGRyZW5baV0pXG4gICAgfVxuXG4gICAgZGVidWcoJ3NlbmQgYm9zaCByZXF1ZXN0OicgKyBib3NoRWwudG9TdHJpbmcoKSk7XG5cbiAgICByZXF1ZXN0KHtcbiAgICAgICAgICAgIHVyaTogdGhpcy5ib3NoVVJMLFxuICAgICAgICAgICAgbWV0aG9kOiAnUE9TVCcsXG4gICAgICAgICAgICBoZWFkZXJzOiB7ICdDb250ZW50LVR5cGUnOiB0aGlzLmNvbnRlbnRUeXBlIH0sXG4gICAgICAgICAgICBib2R5OiBib3NoRWwudG9TdHJpbmcoKVxuICAgICAgICB9LFxuICAgICAgICBmdW5jdGlvbihlcnIsIHJlcywgYm9keSkge1xuICAgICAgICAgICAgdGhhdC5jdXJyZW50UmVxdWVzdHMtLVxuXG4gICAgICAgICAgICBpZiAoZXJyKSB7XG4gICAgICAgICAgICAgICAgaWYgKHJldHJ5IDwgdGhhdC5tYXhIVFRQUmV0cmllcykge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdGhhdC5yZXF1ZXN0KGF0dHJzLCBjaGlsZHJlbiwgY2IsIHJldHJ5ICsgMSlcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gY2IoZXJyKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmICgocmVzLnN0YXR1c0NvZGUgPCAyMDApIHx8IChyZXMuc3RhdHVzQ29kZSA+PSA0MDApKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNiKG5ldyBFcnJvcignSFRUUCBzdGF0dXMgJyArIHJlcy5zdGF0dXNDb2RlKSlcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIGJvZHlFbFxuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBib2R5RWwgPSBsdHgucGFyc2UoYm9keSlcbiAgICAgICAgICAgIH0gY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYihlKVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoYm9keUVsICYmXG4gICAgICAgICAgICAgICAgKGJvZHlFbC5hdHRycy50eXBlID09PSAndGVybWluYXRlJykgJiZcbiAgICAgICAgICAgICAgICBib2R5RWwuYXR0cnMuY29uZGl0aW9uKSB7XG4gICAgICAgICAgICAgICAgY2IobmV3IEVycm9yKGJvZHlFbC5hdHRycy5jb25kaXRpb24pKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChib2R5RWwpIHtcbiAgICAgICAgICAgICAgICBjYihudWxsLCBib2R5RWwpXG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGNiKG5ldyBFcnJvcignbm8gPGJvZHkvPicpKVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgKVxuICAgIHRoaXMuY3VycmVudFJlcXVlc3RzKytcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCT1NIQ29ubmVjdGlvblxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBNZWNoYW5pc20gPSByZXF1aXJlKCcuL2F1dGhlbnRpY2F0aW9uL21lY2hhbmlzbScpXG5cbi8qKlxuICogQXZhaWxhYmxlIG1ldGhvZHMgZm9yIGNsaWVudC1zaWRlIGF1dGhlbnRpY2F0aW9uIChDbGllbnQpXG4gKiBAcGFyYW0gIEFycmF5IG9mZmVyZWRNZWNocyAgbWV0aG9kcyBvZmZlcmVkIGJ5IHNlcnZlclxuICogQHBhcmFtICBBcnJheSBwcmVmZXJyZWRNZWNoIHByZWZlcnJlZCBtZXRob2RzIGJ5IGNsaWVudFxuICogQHBhcmFtICBBcnJheSBhdmFpbGFibGVNZWNoIGF2YWlsYWJsZSBtZXRob2RzIG9uIGNsaWVudFxuICovXG5mdW5jdGlvbiBzZWxlY3RNZWNoYW5pc20ob2ZmZXJlZE1lY2hzLCBwcmVmZXJyZWRNZWNoLCBhdmFpbGFibGVNZWNoKSB7XG4gICAgdmFyIG1lY2hDbGFzc2VzID0gW11cbiAgICB2YXIgYnlOYW1lID0ge31cbiAgICB2YXIgTWVjaFxuICAgIGlmIChBcnJheS5pc0FycmF5KGF2YWlsYWJsZU1lY2gpKSB7XG4gICAgICAgIG1lY2hDbGFzc2VzID0gbWVjaENsYXNzZXMuY29uY2F0KGF2YWlsYWJsZU1lY2gpXG4gICAgfVxuICAgIG1lY2hDbGFzc2VzLmZvckVhY2goZnVuY3Rpb24obWVjaENsYXNzKSB7XG4gICAgICAgIGJ5TmFtZVttZWNoQ2xhc3MucHJvdG90eXBlLm5hbWVdID0gbWVjaENsYXNzXG4gICAgfSlcbiAgICAvKiBBbnkgcHJlZmVycmVkPyAqL1xuICAgIGlmIChieU5hbWVbcHJlZmVycmVkTWVjaF0gJiZcbiAgICAgICAgKG9mZmVyZWRNZWNocy5pbmRleE9mKHByZWZlcnJlZE1lY2gpID49IDApKSB7XG4gICAgICAgIE1lY2ggPSBieU5hbWVbcHJlZmVycmVkTWVjaF1cbiAgICB9XG4gICAgLyogQnkgcHJpb3JpdHkgKi9cbiAgICBtZWNoQ2xhc3Nlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lY2hDbGFzcykge1xuICAgICAgICBpZiAoIU1lY2ggJiZcbiAgICAgICAgICAgIChvZmZlcmVkTWVjaHMuaW5kZXhPZihtZWNoQ2xhc3MucHJvdG90eXBlLm5hbWUpID49IDApKVxuICAgICAgICAgICAgTWVjaCA9IG1lY2hDbGFzc1xuICAgIH0pXG5cbiAgICByZXR1cm4gTWVjaCA/IG5ldyBNZWNoKCkgOiBudWxsXG59XG5cbi8qKlxuICogV2lsbCBkZXRlY3QgdGhlIGF2YWlsYWJsZSBtZWNoYW5pc21zIGJhc2VkIG9uIHRoZSBnaXZlbiBvcHRpb25zXG4gKiBAcGFyYW0gIHtbdHlwZV19IG9wdGlvbnMgY2xpZW50IGNvbmZpZ3VyYXRpb25cbiAqIEBwYXJhbSAgQXJyYXkgYXZhaWxhYmxlTWVjaCBhdmFpbGFibGUgbWV0aG9kcyBvbiBjbGllbnRcbiAqIEByZXR1cm4ge1t0eXBlXX0gICAgICAgICBhdmFpbGFibGUgb3B0aW9uc1xuICovXG5mdW5jdGlvbiBkZXRlY3RNZWNoYW5pc21zKG9wdGlvbnMsIGF2YWlsYWJsZU1lY2gpIHtcbiAgICB2YXIgbWVjaENsYXNzZXMgPSBhdmFpbGFibGVNZWNoID8gYXZhaWxhYmxlTWVjaCA6IFtdXG5cbiAgICB2YXIgZGV0ZWN0ID0gW11cbiAgICBtZWNoQ2xhc3Nlcy5mb3JFYWNoKGZ1bmN0aW9uKG1lY2hDbGFzcykge1xuICAgICAgICB2YXIgbWF0Y2ggPSBtZWNoQ2xhc3MucHJvdG90eXBlLm1hdGNoXG4gICAgICAgIGlmIChtYXRjaChvcHRpb25zKSkgZGV0ZWN0LnB1c2gobWVjaENsYXNzKVxuICAgIH0pXG4gICAgcmV0dXJuIGRldGVjdFxufVxuXG5leHBvcnRzLnNlbGVjdE1lY2hhbmlzbSA9IHNlbGVjdE1lY2hhbmlzbVxuZXhwb3J0cy5kZXRlY3RNZWNoYW5pc21zID0gZGV0ZWN0TWVjaGFuaXNtc1xuZXhwb3J0cy5BYnN0cmFjdE1lY2hhbmlzbSA9IE1lY2hhbmlzbVxuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCB0bHMgPSByZXF1aXJlKCd0bHMnKVxuICAsIGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpXG4gICwgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgQ29ubmVjdGlvbiA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuQ29ubmVjdGlvblxuICAsIEpJRCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykuSklEXG4gICwgU1JWID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5TUlZcbiAgLCBCT1NIQ29ubmVjdGlvbiA9IHJlcXVpcmUoJy4vYm9zaCcpXG4gICwgV1NDb25uZWN0aW9uID0gcmVxdWlyZSgnLi93ZWJzb2NrZXRzJylcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50OnNlc3Npb24nKVxuXG5mdW5jdGlvbiBTZXNzaW9uKG9wdHMpIHtcbiAgICBFdmVudEVtaXR0ZXIuY2FsbCh0aGlzKVxuXG4gICAgdGhpcy5zZXRPcHRpb25zKG9wdHMpXG5cbiAgICBpZiAob3B0cy53ZWJzb2NrZXQgJiYgb3B0cy53ZWJzb2NrZXQudXJsKSB7XG4gICAgICAgIGRlYnVnKCdzdGFydCB3ZWJzb2NrZXQgY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwV2Vic29ja2V0Q29ubmVjdGlvbihvcHRzKVxuICAgIH0gZWxzZSBpZiAob3B0cy5ib3NoICYmIG9wdHMuYm9zaC51cmwpIHtcbiAgICAgICAgZGVidWcoJ3N0YXJ0IGJvc2ggY29ubmVjdGlvbicpXG4gICAgICAgIHRoaXMuX3NldHVwQm9zaENvbm5lY3Rpb24ob3B0cylcbiAgICB9IGVsc2Uge1xuICAgICAgICBkZWJ1Zygnc3RhcnQgc29ja2V0IGNvbm5lY3Rpb24nKVxuICAgICAgICB0aGlzLl9zZXR1cFNvY2tldENvbm5lY3Rpb24ob3B0cylcbiAgICB9XG59XG5cbnV0aWwuaW5oZXJpdHMoU2Vzc2lvbiwgRXZlbnRFbWl0dGVyKVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fc2V0dXBTb2NrZXRDb25uZWN0aW9uID0gZnVuY3Rpb24ob3B0cykge1xuICAgIHZhciBwYXJhbXMgPSB7XG4gICAgICAgIHhtbG5zOiB7ICcnOiBvcHRzLnhtbG5zIH0sXG4gICAgICAgIHN0cmVhbUF0dHJzOiB7XG4gICAgICAgICAgICB2ZXJzaW9uOiAnMS4wJyxcbiAgICAgICAgICAgIHRvOiB0aGlzLmppZC5kb21haW5cbiAgICAgICAgfSxcbiAgICAgICAgc2VyaWFsaXplZDogb3B0cy5zZXJpYWxpemVkXG4gICAgfVxuICAgIGZvciAodmFyICBrZXkgaW4gb3B0cylcbiAgICAgICAgaWYgKCEoa2V5IGluIHBhcmFtcykpXG4gICAgICAgICAgICBwYXJhbXNba2V5XSA9IG9wdHNba2V5XVxuXG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IENvbm5lY3Rpb24ocGFyYW1zKVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxuXG4gICAgaWYgKG9wdHMuaG9zdCkge1xuICAgICAgICB0aGlzLl9zb2NrZXRDb25uZWN0aW9uVG9Ib3N0KG9wdHMpXG4gICAgfSBlbHNlIGlmICghU1JWKSB7XG4gICAgICAgIHRocm93ICdDYW5ub3QgbG9hZCBTUlYnXG4gICAgfSBlbHNlIHtcbiAgICAgICAgdGhpcy5fcGVyZm9ybVNydkxvb2t1cChvcHRzKVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3NvY2tldENvbm5lY3Rpb25Ub0hvc3QgPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgaWYgKG9wdHMubGVnYWN5U1NMKSB7XG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5hbGxvd1RMUyA9IGZhbHNlXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5jb25uZWN0KHtcbiAgICAgICAgICAgIHNvY2tldDpmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRscy5jb25uZWN0KFxuICAgICAgICAgICAgICAgICAgICBvcHRzLnBvcnQgfHwgNTIyMyxcbiAgICAgICAgICAgICAgICAgICAgb3B0cy5ob3N0LFxuICAgICAgICAgICAgICAgICAgICBvcHRzLmNyZWRlbnRpYWxzIHx8IHt9LFxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh0aGlzLnNvY2tldC5hdXRob3JpemVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnY29ubmVjdCcsIHRoaXMuc29ja2V0KVxuICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuZW1pdCgnZXJyb3InLCAndW5hdXRob3JpemVkJylcbiAgICAgICAgICAgICAgICAgICAgfS5iaW5kKHRoaXMpXG4gICAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH0gZWxzZSB7XG4gICAgICAgIGlmIChvcHRzLmNyZWRlbnRpYWxzKSB7XG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb24uY3JlZGVudGlhbHMgPSBjcnlwdG9cbiAgICAgICAgICAgICAgICAuY3JlYXRlQ3JlZGVudGlhbHMob3B0cy5jcmVkZW50aWFscylcbiAgICAgICAgfVxuICAgICAgICBpZiAob3B0cy5kaXNhbGxvd1RMUykgdGhpcy5jb25uZWN0aW9uLmFsbG93VExTID0gZmFsc2VcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmxpc3Rlbih7XG4gICAgICAgICAgICBzb2NrZXQ6ZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIC8vIHdhaXQgZm9yIGNvbm5lY3QgZXZlbnQgbGlzdGVuZXJzXG4gICAgICAgICAgICAgICAgcHJvY2Vzcy5uZXh0VGljayhmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuc29ja2V0LmNvbm5lY3Qob3B0cy5wb3J0IHx8IDUyMjIsIG9wdHMuaG9zdClcbiAgICAgICAgICAgICAgICB9LmJpbmQodGhpcykpXG4gICAgICAgICAgICAgICAgdmFyIHNvY2tldCA9IG9wdHMuc29ja2V0XG4gICAgICAgICAgICAgICAgb3B0cy5zb2NrZXQgPSBudWxsXG4gICAgICAgICAgICAgICAgcmV0dXJuIHNvY2tldCAvLyBtYXliZSBjcmVhdGUgbmV3IHNvY2tldFxuICAgICAgICAgICAgfVxuICAgICAgICB9KVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3BlcmZvcm1TcnZMb29rdXAgPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgaWYgKG9wdHMubGVnYWN5U1NMKSB7XG4gICAgICAgIHRocm93ICdMZWdhY3lTU0wgbW9kZSBkb2VzIG5vdCBzdXBwb3J0IEROUyBsb29rdXBzJ1xuICAgIH1cbiAgICBpZiAob3B0cy5jcmVkZW50aWFscylcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmNyZWRlbnRpYWxzID0gY3J5cHRvLmNyZWF0ZUNyZWRlbnRpYWxzKG9wdHMuY3JlZGVudGlhbHMpXG4gICAgaWYgKG9wdHMuZGlzYWxsb3dUTFMpXG4gICAgICAgIHRoaXMuY29ubmVjdGlvbi5hbGxvd1RMUyA9IGZhbHNlXG4gICAgdGhpcy5jb25uZWN0aW9uLmxpc3Rlbih7c29ja2V0OlNSVi5jb25uZWN0KHtcbiAgICAgICAgc29ja2V0OiAgICAgIG9wdHMuc29ja2V0LFxuICAgICAgICBzZXJ2aWNlczogICAgWydfeG1wcC1jbGllbnQuX3RjcCddLFxuICAgICAgICBkb21haW46ICAgICAgdGhpcy5qaWQuZG9tYWluLFxuICAgICAgICBkZWZhdWx0UG9ydDogNTIyMlxuICAgIH0pfSlcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuX3NldHVwQm9zaENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IEJPU0hDb25uZWN0aW9uKHtcbiAgICAgICAgamlkOiB0aGlzLmppZCxcbiAgICAgICAgYm9zaDogb3B0cy5ib3NoXG4gICAgfSlcbiAgICB0aGlzLl9hZGRDb25uZWN0aW9uTGlzdGVuZXJzKClcbiAgICB0aGlzLmNvbm5lY3Rpb24ub24oJ2Nvbm5lY3RlZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBDbGllbnRzIHN0YXJ0IDxzdHJlYW06c3RyZWFtPiwgc2VydmVycyByZXBseVxuICAgICAgICBpZiAodGhpcy5jb25uZWN0aW9uLnN0YXJ0U3RyZWFtKVxuICAgICAgICAgICAgdGhpcy5jb25uZWN0aW9uLnN0YXJ0U3RyZWFtKClcbiAgICB9LmJpbmQodGhpcykpXG59XG5cblNlc3Npb24ucHJvdG90eXBlLl9zZXR1cFdlYnNvY2tldENvbm5lY3Rpb24gPSBmdW5jdGlvbihvcHRzKSB7XG4gICAgdGhpcy5jb25uZWN0aW9uID0gbmV3IFdTQ29ubmVjdGlvbih7XG4gICAgICAgIGppZDogdGhpcy5qaWQsXG4gICAgICAgIHdlYnNvY2tldDogb3B0cy53ZWJzb2NrZXRcbiAgICB9KVxuICAgIHRoaXMuX2FkZENvbm5lY3Rpb25MaXN0ZW5lcnMoKVxuICAgIHRoaXMuY29ubmVjdGlvbi5vbignY29ubmVjdGVkJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIC8vIENsaWVudHMgc3RhcnQgPHN0cmVhbTpzdHJlYW0+LCBzZXJ2ZXJzIHJlcGx5XG4gICAgICAgIGlmICh0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0pXG4gICAgICAgICAgICB0aGlzLmNvbm5lY3Rpb24uc3RhcnRTdHJlYW0oKVxuICAgIH0uYmluZCh0aGlzKSlcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuc2V0T3B0aW9ucyA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICAvKiBqc2hpbnQgY2FtZWxjYXNlOiBmYWxzZSAqL1xuICAgIHRoaXMuamlkID0gKHR5cGVvZiBvcHRzLmppZCA9PT0gJ3N0cmluZycpID8gbmV3IEpJRChvcHRzLmppZCkgOiBvcHRzLmppZFxuICAgIHRoaXMucGFzc3dvcmQgPSBvcHRzLnBhc3N3b3JkXG4gICAgdGhpcy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtID0gb3B0cy5wcmVmZXJyZWRTYXNsTWVjaGFuaXNtXG4gICAgdGhpcy5hcGlfa2V5ID0gb3B0cy5hcGlfa2V5XG4gICAgdGhpcy5hY2Nlc3NfdG9rZW4gPSBvcHRzLmFjY2Vzc190b2tlblxuICAgIHRoaXMub2F1dGgyX3Rva2VuID0gb3B0cy5vYXV0aDJfdG9rZW5cbiAgICB0aGlzLm9hdXRoMl9hdXRoID0gb3B0cy5vYXV0aDJfYXV0aFxuICAgIHRoaXMucmVnaXN0ZXIgPSBvcHRzLnJlZ2lzdGVyXG4gICAgaWYgKHR5cGVvZiBvcHRzLmFjdEFzID09PSAnc3RyaW5nJykge1xuICAgICAgICB0aGlzLmFjdEFzID0gbmV3IEpJRChvcHRzLmFjdEFzKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYWN0QXMgPSBvcHRzLmFjdEFzXG4gICAgfVxufVxuXG5TZXNzaW9uLnByb3RvdHlwZS5fYWRkQ29ubmVjdGlvbkxpc3RlbmVycyA9IGZ1bmN0aW9uIChjb24pIHtcbiAgICBjb24gPSBjb24gfHwgdGhpcy5jb25uZWN0aW9uXG4gICAgY29uLm9uKCdzdGFuemEnLCB0aGlzLm9uU3RhbnphLmJpbmQodGhpcykpXG4gICAgY29uLm9uKCdkcmFpbicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdkcmFpbicpKVxuICAgIGNvbi5vbignZW5kJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2VuZCcpKVxuICAgIGNvbi5vbignY2xvc2UnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnY2xvc2UnKSlcbiAgICBjb24ub24oJ2Vycm9yJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Vycm9yJykpXG4gICAgY29uLm9uKCdjb25uZWN0JywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Nvbm5lY3QnKSlcbiAgICBjb24ub24oJ3JlY29ubmVjdCcsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdyZWNvbm5lY3QnKSlcbiAgICBjb24ub24oJ2Rpc2Nvbm5lY3QnLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZGlzY29ubmVjdCcpKVxuICAgIGlmIChjb24uc3RhcnRTdHJlYW0pIHtcbiAgICAgICAgY29uLm9uKCdjb25uZWN0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgLy8gQ2xpZW50cyBzdGFydCA8c3RyZWFtOnN0cmVhbT4sIHNlcnZlcnMgcmVwbHlcbiAgICAgICAgICAgIGNvbi5zdGFydFN0cmVhbSgpXG4gICAgICAgIH0pXG4gICAgICAgIHRoaXMub24oJ2F1dGgnLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb24uc3RhcnRTdHJlYW0oKVxuICAgICAgICB9KVxuICAgIH1cbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5jb25uZWN0aW9uICYmIHRoaXMuY29ubmVjdGlvbi5wYXVzZSlcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLnBhdXNlKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvbiAmJiB0aGlzLmNvbm5lY3Rpb24ucmVzdW1lKVxuICAgICAgICB0aGlzLmNvbm5lY3Rpb24ucmVzdW1lKClcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuc2VuZCA9IGZ1bmN0aW9uKHN0YW56YSkge1xuICAgIHJldHVybiB0aGlzLmNvbm5lY3Rpb24gPyB0aGlzLmNvbm5lY3Rpb24uc2VuZChzdGFuemEpIDogZmFsc2Vcbn1cblxuU2Vzc2lvbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuY29ubmVjdGlvbilcbiAgICAgICAgdGhpcy5jb25uZWN0aW9uLmVuZCgpXG59XG5cblNlc3Npb24ucHJvdG90eXBlLm9uU3RhbnphID0gZnVuY3Rpb24oKSB7fVxuXG5tb2R1bGUuZXhwb3J0cyA9IFNlc3Npb25cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIikpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgRXZlbnRFbWl0dGVyID0gcmVxdWlyZSgnZXZlbnRzJykuRXZlbnRFbWl0dGVyXG4gICwgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ25vZGUteG1wcC1jb3JlJykubHR4XG4gICwgU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnbm9kZS14bXBwLWNvcmUnKS5TdHJlYW1QYXJzZXJcbiAgLCBXZWJTb2NrZXQgPSByZXF1aXJlKCdmYXllLXdlYnNvY2tldCcpICYmIHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykuQ2xpZW50ID9cbiAgICAgIHJlcXVpcmUoJ2ZheWUtd2Vic29ja2V0JykuQ2xpZW50IDogd2luZG93LldlYlNvY2tldFxuICAsIENvbm5lY3Rpb24gPSByZXF1aXJlKCdub2RlLXhtcHAtY29yZScpLkNvbm5lY3Rpb25cbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y2xpZW50OndlYnNvY2tldHMnKVxuXG5mdW5jdGlvbiBXU0Nvbm5lY3Rpb24ob3B0cykge1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB0aGlzLnVybCA9IG9wdHMud2Vic29ja2V0LnVybFxuICAgIHRoaXMuamlkID0gb3B0cy5qaWRcbiAgICB0aGlzLnhtbG5zID0ge31cbiAgICB0aGlzLndlYnNvY2tldCA9IG5ldyBXZWJTb2NrZXQodGhpcy51cmwsIFsneG1wcCddKVxuICAgIHRoaXMud2Vic29ja2V0Lm9ub3BlbiA9IHRoaXMub25vcGVuLmJpbmQodGhpcylcbiAgICB0aGlzLndlYnNvY2tldC5vbm1lc3NhZ2UgPSB0aGlzLm9ubWVzc2FnZS5iaW5kKHRoaXMpXG4gICAgdGhpcy53ZWJzb2NrZXQub25jbG9zZSA9IHRoaXMub25jbG9zZS5iaW5kKHRoaXMpXG4gICAgdGhpcy53ZWJzb2NrZXQub25lcnJvciA9IHRoaXMub25lcnJvci5iaW5kKHRoaXMpXG59XG5cbnV0aWwuaW5oZXJpdHMoV1NDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUubWF4U3RhbnphU2l6ZSA9IDY1NTM1XG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLnhtcHBWZXJzaW9uID0gJzEuMCdcblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbm9wZW4gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnN0YXJ0UGFyc2VyKClcbiAgICB0aGlzLmVtaXQoJ2Nvbm5lY3RlZCcpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB0aGlzLnBhcnNlciA9IG5ldyBTdHJlYW1QYXJzZXIuU3RyZWFtUGFyc2VyKHRoaXMubWF4U3RhbnphU2l6ZSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFydCcsIGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgICAgIHNlbGYuc3RyZWFtQXR0cnMgPSBhdHRyc1xuICAgICAgICAvKiBXZSBuZWVkIHRob3NlIHhtbG5zIG9mdGVuLCBzdG9yZSB0aGVtIGV4dHJhICovXG4gICAgICAgIHNlbGYuc3RyZWFtTnNBdHRycyA9IHt9XG4gICAgICAgIGZvciAodmFyIGsgaW4gYXR0cnMpIHtcbiAgICAgICAgICAgIGlmICgoayA9PT0gJ3htbG5zJykgfHxcbiAgICAgICAgICAgICAgICAoay5zdWJzdHIoMCwgNikgPT09ICd4bWxuczonKSkge1xuICAgICAgICAgICAgICAgIHNlbGYuc3RyZWFtTnNBdHRyc1trXSA9IGF0dHJzW2tdXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvKiBOb3RpZnkgaW4gY2FzZSB3ZSBkb24ndCB3YWl0IGZvciA8c3RyZWFtOmZlYXR1cmVzLz5cbiAgICAgICAgICAgKENvbXBvbmVudCBvciBub24tMS4wIHN0cmVhbXMpXG4gICAgICAgICAqL1xuICAgICAgICBzZWxmLmVtaXQoJ3N0cmVhbVN0YXJ0JywgYXR0cnMpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignc3RhbnphJywgZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgICAgIC8vc2VsZi5vblN0YW56YShzZWxmLmFkZFN0cmVhbU5zKHN0YW56YSkpXG4gICAgICAgIHNlbGYub25TdGFuemEoc3RhbnphKVxuICAgIH0pXG4gICAgdGhpcy5wYXJzZXIub24oJ2Vycm9yJywgdGhpcy5vbmVycm9yLmJpbmQodGhpcykpXG4gICAgdGhpcy5wYXJzZXIub24oJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLnN0b3BQYXJzZXIoKVxuICAgICAgICBzZWxmLmVuZCgpXG4gICAgfSlcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zdG9wUGFyc2VyID0gZnVuY3Rpb24oKSB7XG4gICAgLyogTm8gbW9yZSBldmVudHMsIHBsZWFzZSAobWF5IGhhcHBlbiBob3dldmVyKSAqL1xuICAgIGlmICh0aGlzLnBhcnNlcikge1xuICAgICAgICAvKiBHZXQgR0MnZWQgKi9cbiAgICAgICAgZGVsZXRlIHRoaXMucGFyc2VyXG4gICAgfVxufVxuXG5XU0Nvbm5lY3Rpb24ucHJvdG90eXBlLm9ubWVzc2FnZSA9IGZ1bmN0aW9uKG1zZykge1xuICAgIGRlYnVnKCd3cyBtc2cgPC0tJywgbXNnLmRhdGEpXG4gICAgaWYgKG1zZyAmJiBtc2cuZGF0YSAmJiB0aGlzLnBhcnNlcilcbiAgICAgICAgdGhpcy5wYXJzZXIud3JpdGUobXNnLmRhdGEpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmlzKCdlcnJvcicsIENvbm5lY3Rpb24uTlNfU1RSRUFNKSkge1xuICAgICAgICAvKiBUT0RPOiBleHRyYWN0IGVycm9yIHRleHQgKi9cbiAgICAgICAgdGhpcy5lbWl0KCdlcnJvcicsIHN0YW56YSlcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRTdHJlYW0gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYXR0cnMgPSB7fVxuICAgIGZvcih2YXIgayBpbiB0aGlzLnhtbG5zKSB7XG4gICAgICAgIGlmICh0aGlzLnhtbG5zLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBpZiAoIWspIHtcbiAgICAgICAgICAgICAgICBhdHRycy54bWxucyA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cnNbJ3htbG5zOicgKyBrXSA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodGhpcy54bXBwVmVyc2lvbilcbiAgICAgICAgYXR0cnMudmVyc2lvbiA9IHRoaXMueG1wcFZlcnNpb25cbiAgICBpZiAodGhpcy5zdHJlYW1UbylcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLnN0cmVhbVRvXG4gICAgaWYgKHRoaXMuc3RyZWFtSWQpXG4gICAgICAgIGF0dHJzLmlkID0gdGhpcy5zdHJlYW1JZFxuICAgIGlmICh0aGlzLmppZClcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLmppZC5kb21haW5cbiAgICBhdHRycy54bWxucyA9ICdqYWJiZXI6Y2xpZW50J1xuICAgIGF0dHJzWyd4bWxuczpzdHJlYW0nXSA9IENvbm5lY3Rpb24uTlNfU1RSRUFNXG5cbiAgICB2YXIgZWwgPSBuZXcgbHR4LkVsZW1lbnQoJ3N0cmVhbTpzdHJlYW0nLCBhdHRycylcbiAgICAvLyBtYWtlIGl0IG5vbi1lbXB0eSB0byBjdXQgdGhlIGNsb3NpbmcgdGFnXG4gICAgZWwudCgnICcpXG4gICAgdmFyIHMgPSBlbC50b1N0cmluZygpXG4gICAgdGhpcy5zZW5kKHMuc3Vic3RyKDAsIHMuaW5kZXhPZignIDwvc3RyZWFtOnN0cmVhbT4nKSkpXG5cbiAgICB0aGlzLnN0cmVhbU9wZW5lZCA9IHRydWVcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgaWYgKHN0YW56YS5yb290KSBzdGFuemEgPSBzdGFuemEucm9vdCgpXG4gICAgc3RhbnphID0gc3RhbnphLnRvU3RyaW5nKClcbiAgICBkZWJ1Zygnd3Mgc2VuZCAtLT4nLCBzdGFuemEpXG4gICAgdGhpcy53ZWJzb2NrZXQuc2VuZChzdGFuemEpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUub25jbG9zZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuZW1pdCgnZGlzY29ubmVjdCcpXG4gICAgdGhpcy5lbWl0KCdjbG9zZScpXG59XG5cbldTQ29ubmVjdGlvbi5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zZW5kKCc8L3N0cmVhbTpzdHJlYW0+JylcbiAgICB0aGlzLmVtaXQoJ2Rpc2Nvbm5lY3QnKVxuICAgIHRoaXMuZW1pdCgnZW5kJylcbiAgICBpZiAodGhpcy53ZWJzb2NrZXQpXG4gICAgICAgIHRoaXMud2Vic29ja2V0LmNsb3NlKClcbn1cblxuV1NDb25uZWN0aW9uLnByb3RvdHlwZS5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlKVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFdTQ29ubmVjdGlvblxuIiwiLy8gQnJvd3NlciBSZXF1ZXN0XG4vL1xuLy8gTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbi8vIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbi8vIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuLy9cbi8vICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcbi8vXG4vLyBVbmxlc3MgcmVxdWlyZWQgYnkgYXBwbGljYWJsZSBsYXcgb3IgYWdyZWVkIHRvIGluIHdyaXRpbmcsIHNvZnR3YXJlXG4vLyBkaXN0cmlidXRlZCB1bmRlciB0aGUgTGljZW5zZSBpcyBkaXN0cmlidXRlZCBvbiBhbiBcIkFTIElTXCIgQkFTSVMsXG4vLyBXSVRIT1VUIFdBUlJBTlRJRVMgT1IgQ09ORElUSU9OUyBPRiBBTlkgS0lORCwgZWl0aGVyIGV4cHJlc3Mgb3IgaW1wbGllZC5cbi8vIFNlZSB0aGUgTGljZW5zZSBmb3IgdGhlIHNwZWNpZmljIGxhbmd1YWdlIGdvdmVybmluZyBwZXJtaXNzaW9ucyBhbmRcbi8vIGxpbWl0YXRpb25zIHVuZGVyIHRoZSBMaWNlbnNlLlxuXG4vLyBVTUQgSEVBREVSIFNUQVJUIFxuKGZ1bmN0aW9uIChyb290LCBmYWN0b3J5KSB7XG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lLmFtZCkge1xuICAgICAgICAvLyBBTUQuIFJlZ2lzdGVyIGFzIGFuIGFub255bW91cyBtb2R1bGUuXG4gICAgICAgIGRlZmluZShbXSwgZmFjdG9yeSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgZXhwb3J0cyA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgLy8gTm9kZS4gRG9lcyBub3Qgd29yayB3aXRoIHN0cmljdCBDb21tb25KUywgYnV0XG4gICAgICAgIC8vIG9ubHkgQ29tbW9uSlMtbGlrZSBlbnZpcm9tZW50cyB0aGF0IHN1cHBvcnQgbW9kdWxlLmV4cG9ydHMsXG4gICAgICAgIC8vIGxpa2UgTm9kZS5cbiAgICAgICAgbW9kdWxlLmV4cG9ydHMgPSBmYWN0b3J5KCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gQnJvd3NlciBnbG9iYWxzIChyb290IGlzIHdpbmRvdylcbiAgICAgICAgcm9vdC5yZXR1cm5FeHBvcnRzID0gZmFjdG9yeSgpO1xuICB9XG59KHRoaXMsIGZ1bmN0aW9uICgpIHtcbi8vIFVNRCBIRUFERVIgRU5EXG5cbnZhciBYSFIgPSBYTUxIdHRwUmVxdWVzdFxuaWYgKCFYSFIpIHRocm93IG5ldyBFcnJvcignbWlzc2luZyBYTUxIdHRwUmVxdWVzdCcpXG5yZXF1ZXN0LmxvZyA9IHtcbiAgJ3RyYWNlJzogbm9vcCwgJ2RlYnVnJzogbm9vcCwgJ2luZm8nOiBub29wLCAnd2Fybic6IG5vb3AsICdlcnJvcic6IG5vb3Bcbn1cblxudmFyIERFRkFVTFRfVElNRU9VVCA9IDMgKiA2MCAqIDEwMDAgLy8gMyBtaW51dGVzXG5cbi8vXG4vLyByZXF1ZXN0XG4vL1xuXG5mdW5jdGlvbiByZXF1ZXN0KG9wdGlvbnMsIGNhbGxiYWNrKSB7XG4gIC8vIFRoZSBlbnRyeS1wb2ludCB0byB0aGUgQVBJOiBwcmVwIHRoZSBvcHRpb25zIG9iamVjdCBhbmQgcGFzcyB0aGUgcmVhbCB3b3JrIHRvIHJ1bl94aHIuXG4gIGlmKHR5cGVvZiBjYWxsYmFjayAhPT0gJ2Z1bmN0aW9uJylcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0JhZCBjYWxsYmFjayBnaXZlbjogJyArIGNhbGxiYWNrKVxuXG4gIGlmKCFvcHRpb25zKVxuICAgIHRocm93IG5ldyBFcnJvcignTm8gb3B0aW9ucyBnaXZlbicpXG5cbiAgdmFyIG9wdGlvbnNfb25SZXNwb25zZSA9IG9wdGlvbnMub25SZXNwb25zZTsgLy8gU2F2ZSB0aGlzIGZvciBsYXRlci5cblxuICBpZih0eXBlb2Ygb3B0aW9ucyA9PT0gJ3N0cmluZycpXG4gICAgb3B0aW9ucyA9IHsndXJpJzpvcHRpb25zfTtcbiAgZWxzZVxuICAgIG9wdGlvbnMgPSBKU09OLnBhcnNlKEpTT04uc3RyaW5naWZ5KG9wdGlvbnMpKTsgLy8gVXNlIGEgZHVwbGljYXRlIGZvciBtdXRhdGluZy5cblxuICBvcHRpb25zLm9uUmVzcG9uc2UgPSBvcHRpb25zX29uUmVzcG9uc2UgLy8gQW5kIHB1dCBpdCBiYWNrLlxuXG4gIGlmIChvcHRpb25zLnZlcmJvc2UpIHJlcXVlc3QubG9nID0gZ2V0TG9nZ2VyKCk7XG5cbiAgaWYob3B0aW9ucy51cmwpIHtcbiAgICBvcHRpb25zLnVyaSA9IG9wdGlvbnMudXJsO1xuICAgIGRlbGV0ZSBvcHRpb25zLnVybDtcbiAgfVxuXG4gIGlmKCFvcHRpb25zLnVyaSAmJiBvcHRpb25zLnVyaSAhPT0gXCJcIilcbiAgICB0aHJvdyBuZXcgRXJyb3IoXCJvcHRpb25zLnVyaSBpcyBhIHJlcXVpcmVkIGFyZ3VtZW50XCIpO1xuXG4gIGlmKHR5cGVvZiBvcHRpb25zLnVyaSAhPSBcInN0cmluZ1wiKVxuICAgIHRocm93IG5ldyBFcnJvcihcIm9wdGlvbnMudXJpIG11c3QgYmUgYSBzdHJpbmdcIik7XG5cbiAgdmFyIHVuc3VwcG9ydGVkX29wdGlvbnMgPSBbJ3Byb3h5JywgJ19yZWRpcmVjdHNGb2xsb3dlZCcsICdtYXhSZWRpcmVjdHMnLCAnZm9sbG93UmVkaXJlY3QnXVxuICBmb3IgKHZhciBpID0gMDsgaSA8IHVuc3VwcG9ydGVkX29wdGlvbnMubGVuZ3RoOyBpKyspXG4gICAgaWYob3B0aW9uc1sgdW5zdXBwb3J0ZWRfb3B0aW9uc1tpXSBdKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucy5cIiArIHVuc3VwcG9ydGVkX29wdGlvbnNbaV0gKyBcIiBpcyBub3Qgc3VwcG9ydGVkXCIpXG5cbiAgb3B0aW9ucy5jYWxsYmFjayA9IGNhbGxiYWNrXG4gIG9wdGlvbnMubWV0aG9kID0gb3B0aW9ucy5tZXRob2QgfHwgJ0dFVCc7XG4gIG9wdGlvbnMuaGVhZGVycyA9IG9wdGlvbnMuaGVhZGVycyB8fCB7fTtcbiAgb3B0aW9ucy5ib2R5ICAgID0gb3B0aW9ucy5ib2R5IHx8IG51bGxcbiAgb3B0aW9ucy50aW1lb3V0ID0gb3B0aW9ucy50aW1lb3V0IHx8IHJlcXVlc3QuREVGQVVMVF9USU1FT1VUXG5cbiAgaWYob3B0aW9ucy5oZWFkZXJzLmhvc3QpXG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3B0aW9ucy5oZWFkZXJzLmhvc3QgaXMgbm90IHN1cHBvcnRlZFwiKTtcblxuICBpZihvcHRpb25zLmpzb24pIHtcbiAgICBvcHRpb25zLmhlYWRlcnMuYWNjZXB0ID0gb3B0aW9ucy5oZWFkZXJzLmFjY2VwdCB8fCAnYXBwbGljYXRpb24vanNvbidcbiAgICBpZihvcHRpb25zLm1ldGhvZCAhPT0gJ0dFVCcpXG4gICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gJ2FwcGxpY2F0aW9uL2pzb24nXG5cbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5qc29uICE9PSAnYm9vbGVhbicpXG4gICAgICBvcHRpb25zLmJvZHkgPSBKU09OLnN0cmluZ2lmeShvcHRpb25zLmpzb24pXG4gICAgZWxzZSBpZih0eXBlb2Ygb3B0aW9ucy5ib2R5ICE9PSAnc3RyaW5nJylcbiAgICAgIG9wdGlvbnMuYm9keSA9IEpTT04uc3RyaW5naWZ5KG9wdGlvbnMuYm9keSlcbiAgfVxuICBcbiAgLy9CRUdJTiBRUyBIYWNrXG4gIHZhciBzZXJpYWxpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgICB2YXIgc3RyID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iailcbiAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgc3RyLnB1c2goZW5jb2RlVVJJQ29tcG9uZW50KHApICsgXCI9XCIgKyBlbmNvZGVVUklDb21wb25lbnQob2JqW3BdKSk7XG4gICAgICB9XG4gICAgcmV0dXJuIHN0ci5qb2luKFwiJlwiKTtcbiAgfVxuICBcbiAgaWYob3B0aW9ucy5xcyl7XG4gICAgdmFyIHFzID0gKHR5cGVvZiBvcHRpb25zLnFzID09ICdzdHJpbmcnKT8gb3B0aW9ucy5xcyA6IHNlcmlhbGl6ZShvcHRpb25zLnFzKTtcbiAgICBpZihvcHRpb25zLnVyaS5pbmRleE9mKCc/JykgIT09IC0xKXsgLy9ubyBnZXQgcGFyYW1zXG4gICAgICAgIG9wdGlvbnMudXJpID0gb3B0aW9ucy51cmkrJyYnK3FzO1xuICAgIH1lbHNleyAvL2V4aXN0aW5nIGdldCBwYXJhbXNcbiAgICAgICAgb3B0aW9ucy51cmkgPSBvcHRpb25zLnVyaSsnPycrcXM7XG4gICAgfVxuICB9XG4gIC8vRU5EIFFTIEhhY2tcbiAgXG4gIC8vQkVHSU4gRk9STSBIYWNrXG4gIHZhciBtdWx0aXBhcnQgPSBmdW5jdGlvbihvYmopIHtcbiAgICAvL3RvZG86IHN1cHBvcnQgZmlsZSB0eXBlICh1c2VmdWw/KVxuICAgIHZhciByZXN1bHQgPSB7fTtcbiAgICByZXN1bHQuYm91bmRyeSA9ICctLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tJytNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqMTAwMDAwMDAwMCk7XG4gICAgdmFyIGxpbmVzID0gW107XG4gICAgZm9yKHZhciBwIGluIG9iail7XG4gICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocCkpIHtcbiAgICAgICAgICAgIGxpbmVzLnB1c2goXG4gICAgICAgICAgICAgICAgJy0tJytyZXN1bHQuYm91bmRyeStcIlxcblwiK1xuICAgICAgICAgICAgICAgICdDb250ZW50LURpc3Bvc2l0aW9uOiBmb3JtLWRhdGE7IG5hbWU9XCInK3ArJ1wiJytcIlxcblwiK1xuICAgICAgICAgICAgICAgIFwiXFxuXCIrXG4gICAgICAgICAgICAgICAgb2JqW3BdK1wiXFxuXCJcbiAgICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbGluZXMucHVzaCggJy0tJytyZXN1bHQuYm91bmRyeSsnLS0nICk7XG4gICAgcmVzdWx0LmJvZHkgPSBsaW5lcy5qb2luKCcnKTtcbiAgICByZXN1bHQubGVuZ3RoID0gcmVzdWx0LmJvZHkubGVuZ3RoO1xuICAgIHJlc3VsdC50eXBlID0gJ211bHRpcGFydC9mb3JtLWRhdGE7IGJvdW5kYXJ5PScrcmVzdWx0LmJvdW5kcnk7XG4gICAgcmV0dXJuIHJlc3VsdDtcbiAgfVxuICBcbiAgaWYob3B0aW9ucy5mb3JtKXtcbiAgICBpZih0eXBlb2Ygb3B0aW9ucy5mb3JtID09ICdzdHJpbmcnKSB0aHJvdygnZm9ybSBuYW1lIHVuc3VwcG9ydGVkJyk7XG4gICAgaWYob3B0aW9ucy5tZXRob2QgPT09ICdQT1NUJyl7XG4gICAgICAgIHZhciBlbmNvZGluZyA9IChvcHRpb25zLmVuY29kaW5nIHx8ICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnKS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICBvcHRpb25zLmhlYWRlcnNbJ2NvbnRlbnQtdHlwZSddID0gZW5jb2Rpbmc7XG4gICAgICAgIHN3aXRjaChlbmNvZGluZyl7XG4gICAgICAgICAgICBjYXNlICdhcHBsaWNhdGlvbi94LXd3dy1mb3JtLXVybGVuY29kZWQnOlxuICAgICAgICAgICAgICAgIG9wdGlvbnMuYm9keSA9IHNlcmlhbGl6ZShvcHRpb25zLmZvcm0pLnJlcGxhY2UoLyUyMC9nLCBcIitcIik7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlICdtdWx0aXBhcnQvZm9ybS1kYXRhJzpcbiAgICAgICAgICAgICAgICB2YXIgbXVsdGkgPSBtdWx0aXBhcnQob3B0aW9ucy5mb3JtKTtcbiAgICAgICAgICAgICAgICAvL29wdGlvbnMuaGVhZGVyc1snY29udGVudC1sZW5ndGgnXSA9IG11bHRpLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBvcHRpb25zLmJvZHkgPSBtdWx0aS5ib2R5O1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuaGVhZGVyc1snY29udGVudC10eXBlJ10gPSBtdWx0aS50eXBlO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgZGVmYXVsdCA6IHRocm93IG5ldyBFcnJvcigndW5zdXBwb3J0ZWQgZW5jb2Rpbmc6JytlbmNvZGluZyk7XG4gICAgICAgIH1cbiAgICB9XG4gIH1cbiAgLy9FTkQgRk9STSBIYWNrXG5cbiAgLy8gSWYgb25SZXNwb25zZSBpcyBib29sZWFuIHRydWUsIGNhbGwgYmFjayBpbW1lZGlhdGVseSB3aGVuIHRoZSByZXNwb25zZSBpcyBrbm93bixcbiAgLy8gbm90IHdoZW4gdGhlIGZ1bGwgcmVxdWVzdCBpcyBjb21wbGV0ZS5cbiAgb3B0aW9ucy5vblJlc3BvbnNlID0gb3B0aW9ucy5vblJlc3BvbnNlIHx8IG5vb3BcbiAgaWYob3B0aW9ucy5vblJlc3BvbnNlID09PSB0cnVlKSB7XG4gICAgb3B0aW9ucy5vblJlc3BvbnNlID0gY2FsbGJhY2tcbiAgICBvcHRpb25zLmNhbGxiYWNrID0gbm9vcFxuICB9XG5cbiAgLy8gWFhYIEJyb3dzZXJzIGRvIG5vdCBsaWtlIHRoaXMuXG4gIC8vaWYob3B0aW9ucy5ib2R5KVxuICAvLyAgb3B0aW9ucy5oZWFkZXJzWydjb250ZW50LWxlbmd0aCddID0gb3B0aW9ucy5ib2R5Lmxlbmd0aDtcblxuICAvLyBIVFRQIGJhc2ljIGF1dGhlbnRpY2F0aW9uXG4gIGlmKCFvcHRpb25zLmhlYWRlcnMuYXV0aG9yaXphdGlvbiAmJiBvcHRpb25zLmF1dGgpXG4gICAgb3B0aW9ucy5oZWFkZXJzLmF1dGhvcml6YXRpb24gPSAnQmFzaWMgJyArIGI2NF9lbmMob3B0aW9ucy5hdXRoLnVzZXJuYW1lICsgJzonICsgb3B0aW9ucy5hdXRoLnBhc3N3b3JkKTtcblxuICByZXR1cm4gcnVuX3hocihvcHRpb25zKVxufVxuXG52YXIgcmVxX3NlcSA9IDBcbmZ1bmN0aW9uIHJ1bl94aHIob3B0aW9ucykge1xuICB2YXIgeGhyID0gbmV3IFhIUlxuICAgICwgdGltZWRfb3V0ID0gZmFsc2VcbiAgICAsIGlzX2NvcnMgPSBpc19jcm9zc0RvbWFpbihvcHRpb25zLnVyaSlcbiAgICAsIHN1cHBvcnRzX2NvcnMgPSAoJ3dpdGhDcmVkZW50aWFscycgaW4geGhyKVxuXG4gIHJlcV9zZXEgKz0gMVxuICB4aHIuc2VxX2lkID0gcmVxX3NlcVxuICB4aHIuaWQgPSByZXFfc2VxICsgJzogJyArIG9wdGlvbnMubWV0aG9kICsgJyAnICsgb3B0aW9ucy51cmlcbiAgeGhyLl9pZCA9IHhoci5pZCAvLyBJIGtub3cgSSB3aWxsIHR5cGUgXCJfaWRcIiBmcm9tIGhhYml0IGFsbCB0aGUgdGltZS5cblxuICBpZihpc19jb3JzICYmICFzdXBwb3J0c19jb3JzKSB7XG4gICAgdmFyIGNvcnNfZXJyID0gbmV3IEVycm9yKCdCcm93c2VyIGRvZXMgbm90IHN1cHBvcnQgY3Jvc3Mtb3JpZ2luIHJlcXVlc3Q6ICcgKyBvcHRpb25zLnVyaSlcbiAgICBjb3JzX2Vyci5jb3JzID0gJ3Vuc3VwcG9ydGVkJ1xuICAgIHJldHVybiBvcHRpb25zLmNhbGxiYWNrKGNvcnNfZXJyLCB4aHIpXG4gIH1cblxuICB4aHIudGltZW91dFRpbWVyID0gc2V0VGltZW91dCh0b29fbGF0ZSwgb3B0aW9ucy50aW1lb3V0KVxuICBmdW5jdGlvbiB0b29fbGF0ZSgpIHtcbiAgICB0aW1lZF9vdXQgPSB0cnVlXG4gICAgdmFyIGVyID0gbmV3IEVycm9yKCdFVElNRURPVVQnKVxuICAgIGVyLmNvZGUgPSAnRVRJTUVET1VUJ1xuICAgIGVyLmR1cmF0aW9uID0gb3B0aW9ucy50aW1lb3V0XG5cbiAgICByZXF1ZXN0LmxvZy5lcnJvcignVGltZW91dCcsIHsgJ2lkJzp4aHIuX2lkLCAnbWlsbGlzZWNvbmRzJzpvcHRpb25zLnRpbWVvdXQgfSlcbiAgICByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKVxuICB9XG5cbiAgLy8gU29tZSBzdGF0ZXMgY2FuIGJlIHNraXBwZWQgb3Zlciwgc28gcmVtZW1iZXIgd2hhdCBpcyBzdGlsbCBpbmNvbXBsZXRlLlxuICB2YXIgZGlkID0geydyZXNwb25zZSc6ZmFsc2UsICdsb2FkaW5nJzpmYWxzZSwgJ2VuZCc6ZmFsc2V9XG5cbiAgeGhyLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IG9uX3N0YXRlX2NoYW5nZVxuICB4aHIub3BlbihvcHRpb25zLm1ldGhvZCwgb3B0aW9ucy51cmksIHRydWUpIC8vIGFzeW5jaHJvbm91c1xuICBpZihpc19jb3JzKVxuICAgIHhoci53aXRoQ3JlZGVudGlhbHMgPSAhISBvcHRpb25zLndpdGhDcmVkZW50aWFsc1xuICB4aHIuc2VuZChvcHRpb25zLmJvZHkpXG4gIHJldHVybiB4aHJcblxuICBmdW5jdGlvbiBvbl9zdGF0ZV9jaGFuZ2UoZXZlbnQpIHtcbiAgICBpZih0aW1lZF9vdXQpXG4gICAgICByZXR1cm4gcmVxdWVzdC5sb2cuZGVidWcoJ0lnbm9yaW5nIHRpbWVkIG91dCBzdGF0ZSBjaGFuZ2UnLCB7J3N0YXRlJzp4aHIucmVhZHlTdGF0ZSwgJ2lkJzp4aHIuaWR9KVxuXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1N0YXRlIGNoYW5nZScsIHsnc3RhdGUnOnhoci5yZWFkeVN0YXRlLCAnaWQnOnhoci5pZCwgJ3RpbWVkX291dCc6dGltZWRfb3V0fSlcblxuICAgIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuT1BFTkVEKSB7XG4gICAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnUmVxdWVzdCBzdGFydGVkJywgeydpZCc6eGhyLmlkfSlcbiAgICAgIGZvciAodmFyIGtleSBpbiBvcHRpb25zLmhlYWRlcnMpXG4gICAgICAgIHhoci5zZXRSZXF1ZXN0SGVhZGVyKGtleSwgb3B0aW9ucy5oZWFkZXJzW2tleV0pXG4gICAgfVxuXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkhFQURFUlNfUkVDRUlWRUQpXG4gICAgICBvbl9yZXNwb25zZSgpXG5cbiAgICBlbHNlIGlmKHhoci5yZWFkeVN0YXRlID09PSBYSFIuTE9BRElORykge1xuICAgICAgb25fcmVzcG9uc2UoKVxuICAgICAgb25fbG9hZGluZygpXG4gICAgfVxuXG4gICAgZWxzZSBpZih4aHIucmVhZHlTdGF0ZSA9PT0gWEhSLkRPTkUpIHtcbiAgICAgIG9uX3Jlc3BvbnNlKClcbiAgICAgIG9uX2xvYWRpbmcoKVxuICAgICAgb25fZW5kKClcbiAgICB9XG4gIH1cblxuICBmdW5jdGlvbiBvbl9yZXNwb25zZSgpIHtcbiAgICBpZihkaWQucmVzcG9uc2UpXG4gICAgICByZXR1cm5cblxuICAgIGRpZC5yZXNwb25zZSA9IHRydWVcbiAgICByZXF1ZXN0LmxvZy5kZWJ1ZygnR290IHJlc3BvbnNlJywgeydpZCc6eGhyLmlkLCAnc3RhdHVzJzp4aHIuc3RhdHVzfSlcbiAgICBjbGVhclRpbWVvdXQoeGhyLnRpbWVvdXRUaW1lcilcbiAgICB4aHIuc3RhdHVzQ29kZSA9IHhoci5zdGF0dXMgLy8gTm9kZSByZXF1ZXN0IGNvbXBhdGliaWxpdHlcblxuICAgIC8vIERldGVjdCBmYWlsZWQgQ09SUyByZXF1ZXN0cy5cbiAgICBpZihpc19jb3JzICYmIHhoci5zdGF0dXNDb2RlID09IDApIHtcbiAgICAgIHZhciBjb3JzX2VyciA9IG5ldyBFcnJvcignQ09SUyByZXF1ZXN0IHJlamVjdGVkOiAnICsgb3B0aW9ucy51cmkpXG4gICAgICBjb3JzX2Vyci5jb3JzID0gJ3JlamVjdGVkJ1xuXG4gICAgICAvLyBEbyBub3QgcHJvY2VzcyB0aGlzIHJlcXVlc3QgZnVydGhlci5cbiAgICAgIGRpZC5sb2FkaW5nID0gdHJ1ZVxuICAgICAgZGlkLmVuZCA9IHRydWVcblxuICAgICAgcmV0dXJuIG9wdGlvbnMuY2FsbGJhY2soY29yc19lcnIsIHhocilcbiAgICB9XG5cbiAgICBvcHRpb25zLm9uUmVzcG9uc2UobnVsbCwgeGhyKVxuICB9XG5cbiAgZnVuY3Rpb24gb25fbG9hZGluZygpIHtcbiAgICBpZihkaWQubG9hZGluZylcbiAgICAgIHJldHVyblxuXG4gICAgZGlkLmxvYWRpbmcgPSB0cnVlXG4gICAgcmVxdWVzdC5sb2cuZGVidWcoJ1Jlc3BvbnNlIGJvZHkgbG9hZGluZycsIHsnaWQnOnhoci5pZH0pXG4gICAgLy8gVE9ETzogTWF5YmUgc2ltdWxhdGUgXCJkYXRhXCIgZXZlbnRzIGJ5IHdhdGNoaW5nIHhoci5yZXNwb25zZVRleHRcbiAgfVxuXG4gIGZ1bmN0aW9uIG9uX2VuZCgpIHtcbiAgICBpZihkaWQuZW5kKVxuICAgICAgcmV0dXJuXG5cbiAgICBkaWQuZW5kID0gdHJ1ZVxuICAgIHJlcXVlc3QubG9nLmRlYnVnKCdSZXF1ZXN0IGRvbmUnLCB7J2lkJzp4aHIuaWR9KVxuXG4gICAgeGhyLmJvZHkgPSB4aHIucmVzcG9uc2VUZXh0XG4gICAgaWYob3B0aW9ucy5qc29uKSB7XG4gICAgICB0cnkgICAgICAgIHsgeGhyLmJvZHkgPSBKU09OLnBhcnNlKHhoci5yZXNwb25zZVRleHQpIH1cbiAgICAgIGNhdGNoIChlcikgeyByZXR1cm4gb3B0aW9ucy5jYWxsYmFjayhlciwgeGhyKSAgICAgICAgfVxuICAgIH1cblxuICAgIG9wdGlvbnMuY2FsbGJhY2sobnVsbCwgeGhyLCB4aHIuYm9keSlcbiAgfVxuXG59IC8vIHJlcXVlc3RcblxucmVxdWVzdC53aXRoQ3JlZGVudGlhbHMgPSBmYWxzZTtcbnJlcXVlc3QuREVGQVVMVF9USU1FT1VUID0gREVGQVVMVF9USU1FT1VUO1xuXG4vL1xuLy8gZGVmYXVsdHNcbi8vXG5cbnJlcXVlc3QuZGVmYXVsdHMgPSBmdW5jdGlvbihvcHRpb25zLCByZXF1ZXN0ZXIpIHtcbiAgdmFyIGRlZiA9IGZ1bmN0aW9uIChtZXRob2QpIHtcbiAgICB2YXIgZCA9IGZ1bmN0aW9uIChwYXJhbXMsIGNhbGxiYWNrKSB7XG4gICAgICBpZih0eXBlb2YgcGFyYW1zID09PSAnc3RyaW5nJylcbiAgICAgICAgcGFyYW1zID0geyd1cmknOiBwYXJhbXN9O1xuICAgICAgZWxzZSB7XG4gICAgICAgIHBhcmFtcyA9IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkocGFyYW1zKSk7XG4gICAgICB9XG4gICAgICBmb3IgKHZhciBpIGluIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKHBhcmFtc1tpXSA9PT0gdW5kZWZpbmVkKSBwYXJhbXNbaV0gPSBvcHRpb25zW2ldXG4gICAgICB9XG4gICAgICByZXR1cm4gbWV0aG9kKHBhcmFtcywgY2FsbGJhY2spXG4gICAgfVxuICAgIHJldHVybiBkXG4gIH1cbiAgdmFyIGRlID0gZGVmKHJlcXVlc3QpXG4gIGRlLmdldCA9IGRlZihyZXF1ZXN0LmdldClcbiAgZGUucG9zdCA9IGRlZihyZXF1ZXN0LnBvc3QpXG4gIGRlLnB1dCA9IGRlZihyZXF1ZXN0LnB1dClcbiAgZGUuaGVhZCA9IGRlZihyZXF1ZXN0LmhlYWQpXG4gIHJldHVybiBkZVxufVxuXG4vL1xuLy8gSFRUUCBtZXRob2Qgc2hvcnRjdXRzXG4vL1xuXG52YXIgc2hvcnRjdXRzID0gWyAnZ2V0JywgJ3B1dCcsICdwb3N0JywgJ2hlYWQnIF07XG5zaG9ydGN1dHMuZm9yRWFjaChmdW5jdGlvbihzaG9ydGN1dCkge1xuICB2YXIgbWV0aG9kID0gc2hvcnRjdXQudG9VcHBlckNhc2UoKTtcbiAgdmFyIGZ1bmMgICA9IHNob3J0Y3V0LnRvTG93ZXJDYXNlKCk7XG5cbiAgcmVxdWVzdFtmdW5jXSA9IGZ1bmN0aW9uKG9wdHMpIHtcbiAgICBpZih0eXBlb2Ygb3B0cyA9PT0gJ3N0cmluZycpXG4gICAgICBvcHRzID0geydtZXRob2QnOm1ldGhvZCwgJ3VyaSc6b3B0c307XG4gICAgZWxzZSB7XG4gICAgICBvcHRzID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeShvcHRzKSk7XG4gICAgICBvcHRzLm1ldGhvZCA9IG1ldGhvZDtcbiAgICB9XG5cbiAgICB2YXIgYXJncyA9IFtvcHRzXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmFwcGx5KGFyZ3VtZW50cywgWzFdKSk7XG4gICAgcmV0dXJuIHJlcXVlc3QuYXBwbHkodGhpcywgYXJncyk7XG4gIH1cbn0pXG5cbi8vXG4vLyBDb3VjaERCIHNob3J0Y3V0XG4vL1xuXG5yZXF1ZXN0LmNvdWNoID0gZnVuY3Rpb24ob3B0aW9ucywgY2FsbGJhY2spIHtcbiAgaWYodHlwZW9mIG9wdGlvbnMgPT09ICdzdHJpbmcnKVxuICAgIG9wdGlvbnMgPSB7J3VyaSc6b3B0aW9uc31cblxuICAvLyBKdXN0IHVzZSB0aGUgcmVxdWVzdCBBUEkgdG8gZG8gSlNPTi5cbiAgb3B0aW9ucy5qc29uID0gdHJ1ZVxuICBpZihvcHRpb25zLmJvZHkpXG4gICAgb3B0aW9ucy5qc29uID0gb3B0aW9ucy5ib2R5XG4gIGRlbGV0ZSBvcHRpb25zLmJvZHlcblxuICBjYWxsYmFjayA9IGNhbGxiYWNrIHx8IG5vb3BcblxuICB2YXIgeGhyID0gcmVxdWVzdChvcHRpb25zLCBjb3VjaF9oYW5kbGVyKVxuICByZXR1cm4geGhyXG5cbiAgZnVuY3Rpb24gY291Y2hfaGFuZGxlcihlciwgcmVzcCwgYm9keSkge1xuICAgIGlmKGVyKVxuICAgICAgcmV0dXJuIGNhbGxiYWNrKGVyLCByZXNwLCBib2R5KVxuXG4gICAgaWYoKHJlc3Auc3RhdHVzQ29kZSA8IDIwMCB8fCByZXNwLnN0YXR1c0NvZGUgPiAyOTkpICYmIGJvZHkuZXJyb3IpIHtcbiAgICAgIC8vIFRoZSBib2R5IGlzIGEgQ291Y2ggSlNPTiBvYmplY3QgaW5kaWNhdGluZyB0aGUgZXJyb3IuXG4gICAgICBlciA9IG5ldyBFcnJvcignQ291Y2hEQiBlcnJvcjogJyArIChib2R5LmVycm9yLnJlYXNvbiB8fCBib2R5LmVycm9yLmVycm9yKSlcbiAgICAgIGZvciAodmFyIGtleSBpbiBib2R5KVxuICAgICAgICBlcltrZXldID0gYm9keVtrZXldXG4gICAgICByZXR1cm4gY2FsbGJhY2soZXIsIHJlc3AsIGJvZHkpO1xuICAgIH1cblxuICAgIHJldHVybiBjYWxsYmFjayhlciwgcmVzcCwgYm9keSk7XG4gIH1cbn1cblxuLy9cbi8vIFV0aWxpdHlcbi8vXG5cbmZ1bmN0aW9uIG5vb3AoKSB7fVxuXG5mdW5jdGlvbiBnZXRMb2dnZXIoKSB7XG4gIHZhciBsb2dnZXIgPSB7fVxuICAgICwgbGV2ZWxzID0gWyd0cmFjZScsICdkZWJ1ZycsICdpbmZvJywgJ3dhcm4nLCAnZXJyb3InXVxuICAgICwgbGV2ZWwsIGlcblxuICBmb3IoaSA9IDA7IGkgPCBsZXZlbHMubGVuZ3RoOyBpKyspIHtcbiAgICBsZXZlbCA9IGxldmVsc1tpXVxuXG4gICAgbG9nZ2VyW2xldmVsXSA9IG5vb3BcbiAgICBpZih0eXBlb2YgY29uc29sZSAhPT0gJ3VuZGVmaW5lZCcgJiYgY29uc29sZSAmJiBjb25zb2xlW2xldmVsXSlcbiAgICAgIGxvZ2dlcltsZXZlbF0gPSBmb3JtYXR0ZWQoY29uc29sZSwgbGV2ZWwpXG4gIH1cblxuICByZXR1cm4gbG9nZ2VyXG59XG5cbmZ1bmN0aW9uIGZvcm1hdHRlZChvYmosIG1ldGhvZCkge1xuICByZXR1cm4gZm9ybWF0dGVkX2xvZ2dlclxuXG4gIGZ1bmN0aW9uIGZvcm1hdHRlZF9sb2dnZXIoc3RyLCBjb250ZXh0KSB7XG4gICAgaWYodHlwZW9mIGNvbnRleHQgPT09ICdvYmplY3QnKVxuICAgICAgc3RyICs9ICcgJyArIEpTT04uc3RyaW5naWZ5KGNvbnRleHQpXG5cbiAgICByZXR1cm4gb2JqW21ldGhvZF0uY2FsbChvYmosIHN0cilcbiAgfVxufVxuXG4vLyBSZXR1cm4gd2hldGhlciBhIFVSTCBpcyBhIGNyb3NzLWRvbWFpbiByZXF1ZXN0LlxuZnVuY3Rpb24gaXNfY3Jvc3NEb21haW4odXJsKSB7XG4gIHZhciBydXJsID0gL14oW1xcd1xcK1xcLlxcLV0rOikoPzpcXC9cXC8oW15cXC8/IzpdKikoPzo6KFxcZCspKT8pPy9cblxuICAvLyBqUXVlcnkgIzgxMzgsIElFIG1heSB0aHJvdyBhbiBleGNlcHRpb24gd2hlbiBhY2Nlc3NpbmdcbiAgLy8gYSBmaWVsZCBmcm9tIHdpbmRvdy5sb2NhdGlvbiBpZiBkb2N1bWVudC5kb21haW4gaGFzIGJlZW4gc2V0XG4gIHZhciBhamF4TG9jYXRpb25cbiAgdHJ5IHsgYWpheExvY2F0aW9uID0gbG9jYXRpb24uaHJlZiB9XG4gIGNhdGNoIChlKSB7XG4gICAgLy8gVXNlIHRoZSBocmVmIGF0dHJpYnV0ZSBvZiBhbiBBIGVsZW1lbnQgc2luY2UgSUUgd2lsbCBtb2RpZnkgaXQgZ2l2ZW4gZG9jdW1lbnQubG9jYXRpb25cbiAgICBhamF4TG9jYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCBcImFcIiApO1xuICAgIGFqYXhMb2NhdGlvbi5ocmVmID0gXCJcIjtcbiAgICBhamF4TG9jYXRpb24gPSBhamF4TG9jYXRpb24uaHJlZjtcbiAgfVxuXG4gIHZhciBhamF4TG9jUGFydHMgPSBydXJsLmV4ZWMoYWpheExvY2F0aW9uLnRvTG93ZXJDYXNlKCkpIHx8IFtdXG4gICAgLCBwYXJ0cyA9IHJ1cmwuZXhlYyh1cmwudG9Mb3dlckNhc2UoKSApXG5cbiAgdmFyIHJlc3VsdCA9ICEhKFxuICAgIHBhcnRzICYmXG4gICAgKCAgcGFydHNbMV0gIT0gYWpheExvY1BhcnRzWzFdXG4gICAgfHwgcGFydHNbMl0gIT0gYWpheExvY1BhcnRzWzJdXG4gICAgfHwgKHBhcnRzWzNdIHx8IChwYXJ0c1sxXSA9PT0gXCJodHRwOlwiID8gODAgOiA0NDMpKSAhPSAoYWpheExvY1BhcnRzWzNdIHx8IChhamF4TG9jUGFydHNbMV0gPT09IFwiaHR0cDpcIiA/IDgwIDogNDQzKSlcbiAgICApXG4gIClcblxuICAvL2NvbnNvbGUuZGVidWcoJ2lzX2Nyb3NzRG9tYWluKCcrdXJsKycpIC0+ICcgKyByZXN1bHQpXG4gIHJldHVybiByZXN1bHRcbn1cblxuLy8gTUlUIExpY2Vuc2UgZnJvbSBodHRwOi8vcGhwanMub3JnL2Z1bmN0aW9ucy9iYXNlNjRfZW5jb2RlOjM1OFxuZnVuY3Rpb24gYjY0X2VuYyAoZGF0YSkge1xuICAgIC8vIEVuY29kZXMgc3RyaW5nIHVzaW5nIE1JTUUgYmFzZTY0IGFsZ29yaXRobVxuICAgIHZhciBiNjQgPSBcIkFCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXowMTIzNDU2Nzg5Ky89XCI7XG4gICAgdmFyIG8xLCBvMiwgbzMsIGgxLCBoMiwgaDMsIGg0LCBiaXRzLCBpID0gMCwgYWMgPSAwLCBlbmM9XCJcIiwgdG1wX2FyciA9IFtdO1xuXG4gICAgaWYgKCFkYXRhKSB7XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH1cblxuICAgIC8vIGFzc3VtZSB1dGY4IGRhdGFcbiAgICAvLyBkYXRhID0gdGhpcy51dGY4X2VuY29kZShkYXRhKycnKTtcblxuICAgIGRvIHsgLy8gcGFjayB0aHJlZSBvY3RldHMgaW50byBmb3VyIGhleGV0c1xuICAgICAgICBvMSA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuICAgICAgICBvMiA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuICAgICAgICBvMyA9IGRhdGEuY2hhckNvZGVBdChpKyspO1xuXG4gICAgICAgIGJpdHMgPSBvMTw8MTYgfCBvMjw8OCB8IG8zO1xuXG4gICAgICAgIGgxID0gYml0cz4+MTggJiAweDNmO1xuICAgICAgICBoMiA9IGJpdHM+PjEyICYgMHgzZjtcbiAgICAgICAgaDMgPSBiaXRzPj42ICYgMHgzZjtcbiAgICAgICAgaDQgPSBiaXRzICYgMHgzZjtcblxuICAgICAgICAvLyB1c2UgaGV4ZXRzIHRvIGluZGV4IGludG8gYjY0LCBhbmQgYXBwZW5kIHJlc3VsdCB0byBlbmNvZGVkIHN0cmluZ1xuICAgICAgICB0bXBfYXJyW2FjKytdID0gYjY0LmNoYXJBdChoMSkgKyBiNjQuY2hhckF0KGgyKSArIGI2NC5jaGFyQXQoaDMpICsgYjY0LmNoYXJBdChoNCk7XG4gICAgfSB3aGlsZSAoaSA8IGRhdGEubGVuZ3RoKTtcblxuICAgIGVuYyA9IHRtcF9hcnIuam9pbignJyk7XG5cbiAgICBzd2l0Y2ggKGRhdGEubGVuZ3RoICUgMykge1xuICAgICAgICBjYXNlIDE6XG4gICAgICAgICAgICBlbmMgPSBlbmMuc2xpY2UoMCwgLTIpICsgJz09JztcbiAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMjpcbiAgICAgICAgICAgIGVuYyA9IGVuYy5zbGljZSgwLCAtMSkgKyAnPSc7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBlbmM7XG59XG4gICAgcmV0dXJuIHJlcXVlc3Q7XG4vL1VNRCBGT09URVIgU1RBUlRcbn0pKTtcbi8vVU1EIEZPT1RFUiBFTkRcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSB3ZWIgYnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGVidWcnKTtcbmV4cG9ydHMubG9nID0gbG9nO1xuZXhwb3J0cy5mb3JtYXRBcmdzID0gZm9ybWF0QXJncztcbmV4cG9ydHMuc2F2ZSA9IHNhdmU7XG5leHBvcnRzLmxvYWQgPSBsb2FkO1xuZXhwb3J0cy51c2VDb2xvcnMgPSB1c2VDb2xvcnM7XG5cbi8qKlxuICogQ29sb3JzLlxuICovXG5cbmV4cG9ydHMuY29sb3JzID0gW1xuICAnbGlnaHRzZWFncmVlbicsXG4gICdmb3Jlc3RncmVlbicsXG4gICdnb2xkZW5yb2QnLFxuICAnZG9kZ2VyYmx1ZScsXG4gICdkYXJrb3JjaGlkJyxcbiAgJ2NyaW1zb24nXG5dO1xuXG4vKipcbiAqIEN1cnJlbnRseSBvbmx5IFdlYktpdC1iYXNlZCBXZWIgSW5zcGVjdG9ycywgRmlyZWZveCA+PSB2MzEsXG4gKiBhbmQgdGhlIEZpcmVidWcgZXh0ZW5zaW9uIChhbnkgRmlyZWZveCB2ZXJzaW9uKSBhcmUga25vd25cbiAqIHRvIHN1cHBvcnQgXCIlY1wiIENTUyBjdXN0b21pemF0aW9ucy5cbiAqXG4gKiBUT0RPOiBhZGQgYSBgbG9jYWxTdG9yYWdlYCB2YXJpYWJsZSB0byBleHBsaWNpdGx5IGVuYWJsZS9kaXNhYmxlIGNvbG9yc1xuICovXG5cbmZ1bmN0aW9uIHVzZUNvbG9ycygpIHtcbiAgLy8gaXMgd2Via2l0PyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8xNjQ1OTYwNi8zNzY3NzNcbiAgcmV0dXJuICgnV2Via2l0QXBwZWFyYW5jZScgaW4gZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LnN0eWxlKSB8fFxuICAgIC8vIGlzIGZpcmVidWc/IGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9hLzM5ODEyMC8zNzY3NzNcbiAgICAod2luZG93LmNvbnNvbGUgJiYgKGNvbnNvbGUuZmlyZWJ1ZyB8fCAoY29uc29sZS5leGNlcHRpb24gJiYgY29uc29sZS50YWJsZSkpKSB8fFxuICAgIC8vIGlzIGZpcmVmb3ggPj0gdjMxP1xuICAgIC8vIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvVG9vbHMvV2ViX0NvbnNvbGUjU3R5bGluZ19tZXNzYWdlc1xuICAgIChuYXZpZ2F0b3IudXNlckFnZW50LnRvTG93ZXJDYXNlKCkubWF0Y2goL2ZpcmVmb3hcXC8oXFxkKykvKSAmJiBwYXJzZUludChSZWdFeHAuJDEsIDEwKSA+PSAzMSk7XG59XG5cbi8qKlxuICogTWFwICVqIHRvIGBKU09OLnN0cmluZ2lmeSgpYCwgc2luY2Ugbm8gV2ViIEluc3BlY3RvcnMgZG8gdGhhdCBieSBkZWZhdWx0LlxuICovXG5cbmV4cG9ydHMuZm9ybWF0dGVycy5qID0gZnVuY3Rpb24odikge1xuICByZXR1cm4gSlNPTi5zdHJpbmdpZnkodik7XG59O1xuXG5cbi8qKlxuICogQ29sb3JpemUgbG9nIGFyZ3VtZW50cyBpZiBlbmFibGVkLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZm9ybWF0QXJncygpIHtcbiAgdmFyIGFyZ3MgPSBhcmd1bWVudHM7XG4gIHZhciB1c2VDb2xvcnMgPSB0aGlzLnVzZUNvbG9ycztcblxuICBhcmdzWzBdID0gKHVzZUNvbG9ycyA/ICclYycgOiAnJylcbiAgICArIHRoaXMubmFtZXNwYWNlXG4gICAgKyAodXNlQ29sb3JzID8gJyAlYycgOiAnICcpXG4gICAgKyBhcmdzWzBdXG4gICAgKyAodXNlQ29sb3JzID8gJyVjICcgOiAnICcpXG4gICAgKyAnKycgKyBleHBvcnRzLmh1bWFuaXplKHRoaXMuZGlmZik7XG5cbiAgaWYgKCF1c2VDb2xvcnMpIHJldHVybiBhcmdzO1xuXG4gIHZhciBjID0gJ2NvbG9yOiAnICsgdGhpcy5jb2xvcjtcbiAgYXJncyA9IFthcmdzWzBdLCBjLCAnY29sb3I6IGluaGVyaXQnXS5jb25jYXQoQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJncywgMSkpO1xuXG4gIC8vIHRoZSBmaW5hbCBcIiVjXCIgaXMgc29tZXdoYXQgdHJpY2t5LCBiZWNhdXNlIHRoZXJlIGNvdWxkIGJlIG90aGVyXG4gIC8vIGFyZ3VtZW50cyBwYXNzZWQgZWl0aGVyIGJlZm9yZSBvciBhZnRlciB0aGUgJWMsIHNvIHdlIG5lZWQgdG9cbiAgLy8gZmlndXJlIG91dCB0aGUgY29ycmVjdCBpbmRleCB0byBpbnNlcnQgdGhlIENTUyBpbnRvXG4gIHZhciBpbmRleCA9IDA7XG4gIHZhciBsYXN0QyA9IDA7XG4gIGFyZ3NbMF0ucmVwbGFjZSgvJVthLXolXS9nLCBmdW5jdGlvbihtYXRjaCkge1xuICAgIGlmICgnJSUnID09PSBtYXRjaCkgcmV0dXJuO1xuICAgIGluZGV4Kys7XG4gICAgaWYgKCclYycgPT09IG1hdGNoKSB7XG4gICAgICAvLyB3ZSBvbmx5IGFyZSBpbnRlcmVzdGVkIGluIHRoZSAqbGFzdCogJWNcbiAgICAgIC8vICh0aGUgdXNlciBtYXkgaGF2ZSBwcm92aWRlZCB0aGVpciBvd24pXG4gICAgICBsYXN0QyA9IGluZGV4O1xuICAgIH1cbiAgfSk7XG5cbiAgYXJncy5zcGxpY2UobGFzdEMsIDAsIGMpO1xuICByZXR1cm4gYXJncztcbn1cblxuLyoqXG4gKiBJbnZva2VzIGBjb25zb2xlLmxvZygpYCB3aGVuIGF2YWlsYWJsZS5cbiAqIE5vLW9wIHdoZW4gYGNvbnNvbGUubG9nYCBpcyBub3QgYSBcImZ1bmN0aW9uXCIuXG4gKlxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBsb2coKSB7XG4gIC8vIFRoaXMgaGFja2VyeSBpcyByZXF1aXJlZCBmb3IgSUU4LFxuICAvLyB3aGVyZSB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT0gdHlwZW9mIGNvbnNvbGVcbiAgICAmJiAnZnVuY3Rpb24nID09IHR5cGVvZiBjb25zb2xlLmxvZ1xuICAgICYmIEZ1bmN0aW9uLnByb3RvdHlwZS5hcHBseS5jYWxsKGNvbnNvbGUubG9nLCBjb25zb2xlLCBhcmd1bWVudHMpO1xufVxuXG4vKipcbiAqIFNhdmUgYG5hbWVzcGFjZXNgLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lc3BhY2VzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzYXZlKG5hbWVzcGFjZXMpIHtcbiAgdHJ5IHtcbiAgICBpZiAobnVsbCA9PSBuYW1lc3BhY2VzKSB7XG4gICAgICBsb2NhbFN0b3JhZ2UucmVtb3ZlSXRlbSgnZGVidWcnKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbG9jYWxTdG9yYWdlLmRlYnVnID0gbmFtZXNwYWNlcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge31cbn1cblxuLyoqXG4gKiBMb2FkIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHJldHVybnMgdGhlIHByZXZpb3VzbHkgcGVyc2lzdGVkIGRlYnVnIG1vZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICB2YXIgcjtcbiAgdHJ5IHtcbiAgICByID0gbG9jYWxTdG9yYWdlLmRlYnVnO1xuICB9IGNhdGNoKGUpIHt9XG4gIHJldHVybiByO1xufVxuXG4vKipcbiAqIEVuYWJsZSBuYW1lc3BhY2VzIGxpc3RlZCBpbiBgbG9jYWxTdG9yYWdlLmRlYnVnYCBpbml0aWFsbHkuXG4gKi9cblxuZXhwb3J0cy5lbmFibGUobG9hZCgpKTtcbiIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSBjb21tb24gbG9naWMgZm9yIGJvdGggdGhlIE5vZGUuanMgYW5kIHdlYiBicm93c2VyXG4gKiBpbXBsZW1lbnRhdGlvbnMgb2YgYGRlYnVnKClgLlxuICpcbiAqIEV4cG9zZSBgZGVidWcoKWAgYXMgdGhlIG1vZHVsZS5cbiAqL1xuXG5leHBvcnRzID0gbW9kdWxlLmV4cG9ydHMgPSBkZWJ1ZztcbmV4cG9ydHMuY29lcmNlID0gY29lcmNlO1xuZXhwb3J0cy5kaXNhYmxlID0gZGlzYWJsZTtcbmV4cG9ydHMuZW5hYmxlID0gZW5hYmxlO1xuZXhwb3J0cy5lbmFibGVkID0gZW5hYmxlZDtcbmV4cG9ydHMuaHVtYW5pemUgPSByZXF1aXJlKCdtcycpO1xuXG4vKipcbiAqIFRoZSBjdXJyZW50bHkgYWN0aXZlIGRlYnVnIG1vZGUgbmFtZXMsIGFuZCBuYW1lcyB0byBza2lwLlxuICovXG5cbmV4cG9ydHMubmFtZXMgPSBbXTtcbmV4cG9ydHMuc2tpcHMgPSBbXTtcblxuLyoqXG4gKiBNYXAgb2Ygc3BlY2lhbCBcIiVuXCIgaGFuZGxpbmcgZnVuY3Rpb25zLCBmb3IgdGhlIGRlYnVnIFwiZm9ybWF0XCIgYXJndW1lbnQuXG4gKlxuICogVmFsaWQga2V5IG5hbWVzIGFyZSBhIHNpbmdsZSwgbG93ZXJjYXNlZCBsZXR0ZXIsIGkuZS4gXCJuXCIuXG4gKi9cblxuZXhwb3J0cy5mb3JtYXR0ZXJzID0ge307XG5cbi8qKlxuICogUHJldmlvdXNseSBhc3NpZ25lZCBjb2xvci5cbiAqL1xuXG52YXIgcHJldkNvbG9yID0gMDtcblxuLyoqXG4gKiBQcmV2aW91cyBsb2cgdGltZXN0YW1wLlxuICovXG5cbnZhciBwcmV2VGltZTtcblxuLyoqXG4gKiBTZWxlY3QgYSBjb2xvci5cbiAqXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBzZWxlY3RDb2xvcigpIHtcbiAgcmV0dXJuIGV4cG9ydHMuY29sb3JzW3ByZXZDb2xvcisrICUgZXhwb3J0cy5jb2xvcnMubGVuZ3RoXTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBkZWJ1Z2dlciB3aXRoIHRoZSBnaXZlbiBgbmFtZXNwYWNlYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlXG4gKiBAcmV0dXJuIHtGdW5jdGlvbn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gZGVidWcobmFtZXNwYWNlKSB7XG5cbiAgLy8gZGVmaW5lIHRoZSBgZGlzYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZGlzYWJsZWQoKSB7XG4gIH1cbiAgZGlzYWJsZWQuZW5hYmxlZCA9IGZhbHNlO1xuXG4gIC8vIGRlZmluZSB0aGUgYGVuYWJsZWRgIHZlcnNpb25cbiAgZnVuY3Rpb24gZW5hYmxlZCgpIHtcblxuICAgIHZhciBzZWxmID0gZW5hYmxlZDtcblxuICAgIC8vIHNldCBgZGlmZmAgdGltZXN0YW1wXG4gICAgdmFyIGN1cnIgPSArbmV3IERhdGUoKTtcbiAgICB2YXIgbXMgPSBjdXJyIC0gKHByZXZUaW1lIHx8IGN1cnIpO1xuICAgIHNlbGYuZGlmZiA9IG1zO1xuICAgIHNlbGYucHJldiA9IHByZXZUaW1lO1xuICAgIHNlbGYuY3VyciA9IGN1cnI7XG4gICAgcHJldlRpbWUgPSBjdXJyO1xuXG4gICAgLy8gYWRkIHRoZSBgY29sb3JgIGlmIG5vdCBzZXRcbiAgICBpZiAobnVsbCA9PSBzZWxmLnVzZUNvbG9ycykgc2VsZi51c2VDb2xvcnMgPSBleHBvcnRzLnVzZUNvbG9ycygpO1xuICAgIGlmIChudWxsID09IHNlbGYuY29sb3IgJiYgc2VsZi51c2VDb2xvcnMpIHNlbGYuY29sb3IgPSBzZWxlY3RDb2xvcigpO1xuXG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuXG4gICAgYXJnc1swXSA9IGV4cG9ydHMuY29lcmNlKGFyZ3NbMF0pO1xuXG4gICAgaWYgKCdzdHJpbmcnICE9PSB0eXBlb2YgYXJnc1swXSkge1xuICAgICAgLy8gYW55dGhpbmcgZWxzZSBsZXQncyBpbnNwZWN0IHdpdGggJW9cbiAgICAgIGFyZ3MgPSBbJyVvJ10uY29uY2F0KGFyZ3MpO1xuICAgIH1cblxuICAgIC8vIGFwcGx5IGFueSBgZm9ybWF0dGVyc2AgdHJhbnNmb3JtYXRpb25zXG4gICAgdmFyIGluZGV4ID0gMDtcbiAgICBhcmdzWzBdID0gYXJnc1swXS5yZXBsYWNlKC8lKFthLXolXSkvZywgZnVuY3Rpb24obWF0Y2gsIGZvcm1hdCkge1xuICAgICAgLy8gaWYgd2UgZW5jb3VudGVyIGFuIGVzY2FwZWQgJSB0aGVuIGRvbid0IGluY3JlYXNlIHRoZSBhcnJheSBpbmRleFxuICAgICAgaWYgKG1hdGNoID09PSAnJSUnKSByZXR1cm4gbWF0Y2g7XG4gICAgICBpbmRleCsrO1xuICAgICAgdmFyIGZvcm1hdHRlciA9IGV4cG9ydHMuZm9ybWF0dGVyc1tmb3JtYXRdO1xuICAgICAgaWYgKCdmdW5jdGlvbicgPT09IHR5cGVvZiBmb3JtYXR0ZXIpIHtcbiAgICAgICAgdmFyIHZhbCA9IGFyZ3NbaW5kZXhdO1xuICAgICAgICBtYXRjaCA9IGZvcm1hdHRlci5jYWxsKHNlbGYsIHZhbCk7XG5cbiAgICAgICAgLy8gbm93IHdlIG5lZWQgdG8gcmVtb3ZlIGBhcmdzW2luZGV4XWAgc2luY2UgaXQncyBpbmxpbmVkIGluIHRoZSBgZm9ybWF0YFxuICAgICAgICBhcmdzLnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgIGluZGV4LS07XG4gICAgICB9XG4gICAgICByZXR1cm4gbWF0Y2g7XG4gICAgfSk7XG5cbiAgICBpZiAoJ2Z1bmN0aW9uJyA9PT0gdHlwZW9mIGV4cG9ydHMuZm9ybWF0QXJncykge1xuICAgICAgYXJncyA9IGV4cG9ydHMuZm9ybWF0QXJncy5hcHBseShzZWxmLCBhcmdzKTtcbiAgICB9XG4gICAgdmFyIGxvZ0ZuID0gZW5hYmxlZC5sb2cgfHwgZXhwb3J0cy5sb2cgfHwgY29uc29sZS5sb2cuYmluZChjb25zb2xlKTtcbiAgICBsb2dGbi5hcHBseShzZWxmLCBhcmdzKTtcbiAgfVxuICBlbmFibGVkLmVuYWJsZWQgPSB0cnVlO1xuXG4gIHZhciBmbiA9IGV4cG9ydHMuZW5hYmxlZChuYW1lc3BhY2UpID8gZW5hYmxlZCA6IGRpc2FibGVkO1xuXG4gIGZuLm5hbWVzcGFjZSA9IG5hbWVzcGFjZTtcblxuICByZXR1cm4gZm47XG59XG5cbi8qKlxuICogRW5hYmxlcyBhIGRlYnVnIG1vZGUgYnkgbmFtZXNwYWNlcy4gVGhpcyBjYW4gaW5jbHVkZSBtb2Rlc1xuICogc2VwYXJhdGVkIGJ5IGEgY29sb24gYW5kIHdpbGRjYXJkcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5mdW5jdGlvbiBlbmFibGUobmFtZXNwYWNlcykge1xuICBleHBvcnRzLnNhdmUobmFtZXNwYWNlcyk7XG5cbiAgdmFyIHNwbGl0ID0gKG5hbWVzcGFjZXMgfHwgJycpLnNwbGl0KC9bXFxzLF0rLyk7XG4gIHZhciBsZW4gPSBzcGxpdC5sZW5ndGg7XG5cbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgIGlmICghc3BsaXRbaV0pIGNvbnRpbnVlOyAvLyBpZ25vcmUgZW1wdHkgc3RyaW5nc1xuICAgIG5hbWVzcGFjZXMgPSBzcGxpdFtpXS5yZXBsYWNlKC9cXCovZywgJy4qPycpO1xuICAgIGlmIChuYW1lc3BhY2VzWzBdID09PSAnLScpIHtcbiAgICAgIGV4cG9ydHMuc2tpcHMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMuc3Vic3RyKDEpICsgJyQnKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGV4cG9ydHMubmFtZXMucHVzaChuZXcgUmVnRXhwKCdeJyArIG5hbWVzcGFjZXMgKyAnJCcpKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBEaXNhYmxlIGRlYnVnIG91dHB1dC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGRpc2FibGUoKSB7XG4gIGV4cG9ydHMuZW5hYmxlKCcnKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGdpdmVuIG1vZGUgbmFtZSBpcyBlbmFibGVkLCBmYWxzZSBvdGhlcndpc2UuXG4gKlxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWVcbiAqIEByZXR1cm4ge0Jvb2xlYW59XG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGVuYWJsZWQobmFtZSkge1xuICB2YXIgaSwgbGVuO1xuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLnNraXBzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMuc2tpcHNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICBmb3IgKGkgPSAwLCBsZW4gPSBleHBvcnRzLm5hbWVzLmxlbmd0aDsgaSA8IGxlbjsgaSsrKSB7XG4gICAgaWYgKGV4cG9ydHMubmFtZXNbaV0udGVzdChuYW1lKSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBDb2VyY2UgYHZhbGAuXG4gKlxuICogQHBhcmFtIHtNaXhlZH0gdmFsXG4gKiBAcmV0dXJuIHtNaXhlZH1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIGNvZXJjZSh2YWwpIHtcbiAgaWYgKHZhbCBpbnN0YW5jZW9mIEVycm9yKSByZXR1cm4gdmFsLnN0YWNrIHx8IHZhbC5tZXNzYWdlO1xuICByZXR1cm4gdmFsO1xufVxuIiwiLyoqXG4gKiBIZWxwZXJzLlxuICovXG5cbnZhciBzID0gMTAwMDtcbnZhciBtID0gcyAqIDYwO1xudmFyIGggPSBtICogNjA7XG52YXIgZCA9IGggKiAyNDtcbnZhciB5ID0gZCAqIDM2NS4yNTtcblxuLyoqXG4gKiBQYXJzZSBvciBmb3JtYXQgdGhlIGdpdmVuIGB2YWxgLlxuICpcbiAqIE9wdGlvbnM6XG4gKlxuICogIC0gYGxvbmdgIHZlcmJvc2UgZm9ybWF0dGluZyBbZmFsc2VdXG4gKlxuICogQHBhcmFtIHtTdHJpbmd8TnVtYmVyfSB2YWxcbiAqIEBwYXJhbSB7T2JqZWN0fSBvcHRpb25zXG4gKiBAcmV0dXJuIHtTdHJpbmd8TnVtYmVyfVxuICogQGFwaSBwdWJsaWNcbiAqL1xuXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHZhbCwgb3B0aW9ucyl7XG4gIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuICBpZiAoJ3N0cmluZycgPT0gdHlwZW9mIHZhbCkgcmV0dXJuIHBhcnNlKHZhbCk7XG4gIHJldHVybiBvcHRpb25zLmxvbmdcbiAgICA/IGxvbmcodmFsKVxuICAgIDogc2hvcnQodmFsKTtcbn07XG5cbi8qKlxuICogUGFyc2UgdGhlIGdpdmVuIGBzdHJgIGFuZCByZXR1cm4gbWlsbGlzZWNvbmRzLlxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdHJcbiAqIEByZXR1cm4ge051bWJlcn1cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHBhcnNlKHN0cikge1xuICB2YXIgbWF0Y2ggPSAvXigoPzpcXGQrKT9cXC4/XFxkKykgKihtc3xzZWNvbmRzP3xzfG1pbnV0ZXM/fG18aG91cnM/fGh8ZGF5cz98ZHx5ZWFycz98eSk/JC9pLmV4ZWMoc3RyKTtcbiAgaWYgKCFtYXRjaCkgcmV0dXJuO1xuICB2YXIgbiA9IHBhcnNlRmxvYXQobWF0Y2hbMV0pO1xuICB2YXIgdHlwZSA9IChtYXRjaFsyXSB8fCAnbXMnKS50b0xvd2VyQ2FzZSgpO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICd5ZWFycyc6XG4gICAgY2FzZSAneWVhcic6XG4gICAgY2FzZSAneSc6XG4gICAgICByZXR1cm4gbiAqIHk7XG4gICAgY2FzZSAnZGF5cyc6XG4gICAgY2FzZSAnZGF5JzpcbiAgICBjYXNlICdkJzpcbiAgICAgIHJldHVybiBuICogZDtcbiAgICBjYXNlICdob3Vycyc6XG4gICAgY2FzZSAnaG91cic6XG4gICAgY2FzZSAnaCc6XG4gICAgICByZXR1cm4gbiAqIGg7XG4gICAgY2FzZSAnbWludXRlcyc6XG4gICAgY2FzZSAnbWludXRlJzpcbiAgICBjYXNlICdtJzpcbiAgICAgIHJldHVybiBuICogbTtcbiAgICBjYXNlICdzZWNvbmRzJzpcbiAgICBjYXNlICdzZWNvbmQnOlxuICAgIGNhc2UgJ3MnOlxuICAgICAgcmV0dXJuIG4gKiBzO1xuICAgIGNhc2UgJ21zJzpcbiAgICAgIHJldHVybiBuO1xuICB9XG59XG5cbi8qKlxuICogU2hvcnQgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2hvcnQobXMpIHtcbiAgaWYgKG1zID49IGQpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gZCkgKyAnZCc7XG4gIGlmIChtcyA+PSBoKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGgpICsgJ2gnO1xuICBpZiAobXMgPj0gbSkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBtKSArICdtJztcbiAgaWYgKG1zID49IHMpIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gcykgKyAncyc7XG4gIHJldHVybiBtcyArICdtcyc7XG59XG5cbi8qKlxuICogTG9uZyBmb3JtYXQgZm9yIGBtc2AuXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IG1zXG4gKiBAcmV0dXJuIHtTdHJpbmd9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb25nKG1zKSB7XG4gIHJldHVybiBwbHVyYWwobXMsIGQsICdkYXknKVxuICAgIHx8IHBsdXJhbChtcywgaCwgJ2hvdXInKVxuICAgIHx8IHBsdXJhbChtcywgbSwgJ21pbnV0ZScpXG4gICAgfHwgcGx1cmFsKG1zLCBzLCAnc2Vjb25kJylcbiAgICB8fCBtcyArICcgbXMnO1xufVxuXG4vKipcbiAqIFBsdXJhbGl6YXRpb24gaGVscGVyLlxuICovXG5cbmZ1bmN0aW9uIHBsdXJhbChtcywgbiwgbmFtZSkge1xuICBpZiAobXMgPCBuKSByZXR1cm47XG4gIGlmIChtcyA8IG4gKiAxLjUpIHJldHVybiBNYXRoLmZsb29yKG1zIC8gbikgKyAnICcgKyBuYW1lO1xuICByZXR1cm4gTWF0aC5jZWlsKG1zIC8gbikgKyAnICcgKyBuYW1lICsgJ3MnO1xufVxuIiwidmFyIGV4dGVuZCA9IHJlcXVpcmUoJ3V0aWwnKS5fZXh0ZW5kXG5cbmV4cG9ydHMuU3RhbnphID0ge31cbmV4dGVuZChleHBvcnRzLlN0YW56YSwgcmVxdWlyZSgnLi9saWIvc3RhbnphJykpXG5leHBvcnRzLkpJRCA9IHJlcXVpcmUoJy4vbGliL2ppZCcpXG5leHBvcnRzLkNvbm5lY3Rpb24gPSByZXF1aXJlKCcuL2xpYi9jb25uZWN0aW9uJylcbmV4cG9ydHMuU1JWID0gcmVxdWlyZSgnLi9saWIvc3J2JylcbmV4cG9ydHMuU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnLi9saWIvc3RyZWFtX3BhcnNlcicpXG5leHBvcnRzLmx0eCA9IHJlcXVpcmUoJ2x0eCcpIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgbmV0ID0gcmVxdWlyZSgnbmV0JylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCB1dGlsID0gcmVxdWlyZSgndXRpbCcpXG4gICwgbHR4ID0gcmVxdWlyZSgnbHR4JylcbiAgLCByZWNvbm5lY3QgPSByZXF1aXJlKCdyZWNvbm5lY3QtY29yZScpXG4gICwgU3RyZWFtUGFyc2VyID0gcmVxdWlyZSgnLi9zdHJlYW1fcGFyc2VyJylcbiAgLCBzdGFydHRscyA9IHJlcXVpcmUoJ3Rscy1jb25uZWN0JylcbiAgLCBkZWJ1ZyA9IHJlcXVpcmUoJ2RlYnVnJykoJ3htcHA6Y29ubmVjdGlvbicpXG4gICwgZXh0ZW5kID0gcmVxdWlyZSgndXRpbCcpLl9leHRlbmRcblxudmFyIE5TX1hNUFBfVExTID0gJ3VybjppZXRmOnBhcmFtczp4bWw6bnM6eG1wcC10bHMnXG52YXIgTlNfU1RSRUFNID0gJ2h0dHA6Ly9ldGhlcnguamFiYmVyLm9yZy9zdHJlYW1zJ1xudmFyIE5TX1hNUFBfU1RSRUFNUyA9ICd1cm46aWV0ZjpwYXJhbXM6eG1sOm5zOnhtcHAtc3RyZWFtcydcblxudmFyIElOSVRJQUxfUkVDT05ORUNUX0RFTEFZID0gMWUzXG52YXIgTUFYX1JFQ09OTkVDVF9ERUxBWSAgICAgPSAzMGUzXG5cbmZ1bmN0aW9uIGRlZmF1bHRJbmplY3Rpb24oZW1pdHRlciwgb3B0cykge1xuICAgIC8vIGNsb25lIG9wdHNcbiAgICB2YXIgb3B0aW9ucyA9IGV4dGVuZCh7fSwgb3B0cylcblxuICAgIC8vIGFkZCBjb21wdXRlZCBvcHRpb25zXG4gICAgLyoganNoaW50IC1XMDE0ICovXG4gICAgb3B0aW9ucy5pbml0aWFsRGVsYXkgPSAob3B0cyAmJiAob3B0cy5pbml0aWFsUmVjb25uZWN0RGVsYXlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCAgb3B0cy5yZWNvbm5lY3REZWxheSkpIHx8IElOSVRJQUxfUkVDT05ORUNUX0RFTEFZXG4gICAgb3B0aW9ucy5tYXhEZWxheSA9IChvcHRzICYmIG9wdHMubWF4UmVjb25uZWN0RGVsYXkpIHx8IE1BWF9SRUNPTk5FQ1RfREVMQVlcbiAgICBvcHRpb25zLmltbWVkaWF0ZSA9IG9wdHMgJiYgb3B0cy5zb2NrZXQgJiYgKHR5cGVvZiBvcHRzLnNvY2tldCAhPT0gJ2Z1bmN0aW9uJylcbiAgICBvcHRpb25zLnR5cGUgPSBvcHRzICYmIG9wdHMuZGVsYXlUeXBlXG4gICAgb3B0aW9ucy5lbWl0dGVyID0gZW1pdHRlclxuXG4gICAgLy8gcmV0dXJuIGNhbGN1bGF0ZWQgb3B0aW9uc1xuICAgIHJldHVybiBvcHRpb25zXG59XG5cbi8qKlxuIEJhc2UgY2xhc3MgZm9yIGNvbm5lY3Rpb24tYmFzZWQgc3RyZWFtcyAoVENQKS5cbiBUaGUgc29ja2V0IHBhcmFtZXRlciBpcyBvcHRpb25hbCBmb3IgaW5jb21pbmcgY29ubmVjdGlvbnMuXG4qL1xuZnVuY3Rpb24gQ29ubmVjdGlvbihvcHRzKSB7XG4gICAgXG4gICAgRXZlbnRFbWl0dGVyLmNhbGwodGhpcylcblxuICAgIHRoaXMuc3RyZWFtQXR0cnMgPSAob3B0cyAmJiBvcHRzLnN0cmVhbUF0dHJzKSB8fCB7fVxuICAgIHRoaXMueG1sbnMgPSAob3B0cyAmJiBvcHRzLnhtbG5zKSB8fCB7fVxuICAgIHRoaXMueG1sbnMuc3RyZWFtID0gTlNfU1RSRUFNXG5cbiAgICB0aGlzLnJlamVjdFVuYXV0aG9yaXplZCA9IChvcHRzICYmIG9wdHMucmVqZWN0VW5hdXRob3JpemVkKSA/IHRydWUgOiBmYWxzZVxuICAgIHRoaXMuc2VyaWFsaXplZCA9IChvcHRzICYmIG9wdHMuc2VyaWFsaXplZCkgPyB0cnVlIDogZmFsc2VcbiAgICB0aGlzLnJlcXVlc3RDZXJ0ID0gKG9wdHMgJiYgb3B0cy5yZXF1ZXN0Q2VydCkgPyB0cnVlIDogZmFsc2VcblxuICAgIHRoaXMuc2VydmVybmFtZSA9IChvcHRzICYmIG9wdHMuc2VydmVybmFtZSlcblxuICAgIHRoaXMuX3NldHVwU29ja2V0KGRlZmF1bHRJbmplY3Rpb24odGhpcywgb3B0cykpXG4gICAgdGhpcy5vbmNlKCdyZWNvbm5lY3QnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5yZWNvbm5lY3QgPSBvcHRzICYmIG9wdHMucmVjb25uZWN0XG4gICAgfSlcbn1cblxudXRpbC5pbmhlcml0cyhDb25uZWN0aW9uLCBFdmVudEVtaXR0ZXIpXG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLk5TX1hNUFBfVExTID0gTlNfWE1QUF9UTFNcbkNvbm5lY3Rpb24uTlNfU1RSRUFNID0gTlNfU1RSRUFNXG5Db25uZWN0aW9uLnByb3RvdHlwZS5OU19YTVBQX1NUUkVBTVMgPSBOU19YTVBQX1NUUkVBTVNcbi8vIERlZmF1bHRzXG5Db25uZWN0aW9uLnByb3RvdHlwZS5hbGxvd1RMUyA9IHRydWVcblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuX3NldHVwU29ja2V0ID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIGRlYnVnKCdzZXR1cCBzb2NrZXQnKVxuICAgIHZhciBwcmV2aW91c09wdGlvbnMgPSB7fVxuICAgIHZhciBpbmplY3QgPSByZWNvbm5lY3QoZnVuY3Rpb24ob3B0cykge1xuICAgICAgICB2YXIgcHJldmlvdXNTb2NrZXQgPSB0aGlzLnNvY2tldFxuICAgICAgICAvKiBpZiB0aGlzIG9wdHMucHJlc2VydmUgaXMgb25cbiAgICAgICAgICogdGhlIHByZXZpb3VzIG9wdGlvbnMgYXJlIHN0b3JlZCB1bnRpbCBuZXh0IHRpbWUuXG4gICAgICAgICAqIHRoaXMgaXMgbmVlZGVkIHRvIHJlc3RvcmUgZnJvbSBhIHNldFNlY3VyZSBjYWxsLlxuICAgICAgICAgKi9cbiAgICAgICAgaWYgKG9wdHMucHJlc2VydmUgPT09ICdvbicpIHtcbiAgICAgICAgICAgIG9wdHMucHJlc2VydmUgPSBwcmV2aW91c09wdGlvbnNcbiAgICAgICAgICAgIHByZXZpb3VzT3B0aW9ucyA9IG9wdHNcbiAgICAgICAgfSBlbHNlIGlmIChvcHRzLnByZXNlcnZlKSB7XG4gICAgICAgICAgICAvLyBzd2l0Y2ggYmFjayB0byB0aGUgcHJldmVyc2VkIG9wdGlvbnNcbiAgICAgICAgICAgIG9wdHMgPSBwcmV2aW91c09wdGlvbnMgPSBvcHRzLnByZXNlcnZlXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBrZWVwIHNvbWUgc3RhdGUgZm9yIGVnIFNSVi5jb25uZWN0XG4gICAgICAgICAgICBvcHRzID0gcHJldmlvdXNPcHRpb25zID0gb3B0cyB8fCBwcmV2aW91c09wdGlvbnNcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0eXBlb2Ygb3B0cy5zb2NrZXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGRlYnVnKCd1c2UgbGF6eSBzb2NrZXQnKVxuICAgICAgICAgICAgLyogbGF6eSBldmFsdWF0aW9uXG4gICAgICAgICAgICAgKiAoY2FuIGJlIHJldHJpZ2dlcmVkIGJ5IGNhbGxpbmcgY29ubmVjdGlvbi5jb25uZWN0KClcbiAgICAgICAgICAgICAqICB3aXRob3V0IGFyZ3VtZW50cyBhZnRlciBhIHByZXZpb3VzXG4gICAgICAgICAgICAgKiAgY29ubmVjdGlvbi5jb25uZWN0KHtzb2NrZXQ6ZnVuY3Rpb24oKSB7IOKApiB9fSkpICovXG4gICAgICAgICAgICB0aGlzLnNvY2tldCA9IG9wdHMuc29ja2V0LmNhbGwodGhpcylcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlYnVnKCd1c2Ugc3RhbmRhcmQgc29ja2V0JylcbiAgICAgICAgICAgIC8vIG9ubHkgdXNlIHRoaXMgc29ja2V0IG9uY2VcbiAgICAgICAgICAgIHRoaXMuc29ja2V0ID0gb3B0cy5zb2NrZXRcbiAgICAgICAgICAgIG9wdHMuc29ja2V0ID0gbnVsbFxuICAgICAgICAgICAgaWYgKHRoaXMuc29ja2V0KSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vbmNlKCdjb25uZWN0JywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBpbmplY3Qub3B0aW9ucy5pbW1lZGlhdGUgPSBmYWxzZVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5zb2NrZXQgPSB0aGlzLnNvY2tldCB8fCBuZXcgbmV0LlNvY2tldCgpXG4gICAgICAgIGlmIChwcmV2aW91c1NvY2tldCAhPT0gdGhpcy5zb2NrZXQpIHtcbiAgICAgICAgICAgIHRoaXMuc2V0dXBTdHJlYW0oKVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLnNvY2tldFxuICAgIH0uYmluZCh0aGlzKSlcblxuICAgIGluamVjdChpbmplY3Qub3B0aW9ucyA9IG9wdGlvbnMpXG5cbiAgICAvL3dyYXAgdGhlIGVuZCBmdW5jdGlvbiBwcm92aWRlZCBieSByZWNvbm5lY3QtY29yZSB0byB0cmlnZ2VyIHRoZSBzdHJlYW0gZW5kIGxvZ2ljXG4gICAgdmFyIGVuZCA9IHRoaXMuZW5kXG4gICAgdGhpcy5lbmQgPSB0aGlzLmRpc2Nvbm5lY3QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgdGhpcy5lbmRTdHJlYW0oKVxuICAgICAgICBlbmQoKVxuICAgIH1cblxuICAgIHRoaXMub24oJ2Nvbm5lY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGhpcy5wYXJzZXIpXG4gICAgICAgICAgICB0aGlzLnN0YXJ0UGFyc2VyKClcbiAgICB9KVxuICAgIHRoaXMub24oJ2VuZCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcHJldmlvdXNPcHRpb25zID0ge31cbiAgICB9KVxufVxuXG4vKipcbiBVc2VkIGJ5IGJvdGggdGhlIGNvbnN0cnVjdG9yIGFuZCBieSByZWluaXRpYWxpemF0aW9uIGluIHNldFNlY3VyZSgpLlxuKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnNldHVwU3RyZWFtID0gZnVuY3Rpb24oKSB7XG4gICAgZGVidWcoJ3NldHVwIHN0cmVhbScpXG4gICAgdGhpcy5zb2NrZXQub24oJ2VuZCcsIHRoaXMub25FbmQuYmluZCh0aGlzKSlcbiAgICB0aGlzLnNvY2tldC5vbignZGF0YScsIHRoaXMub25EYXRhLmJpbmQodGhpcykpXG4gICAgdGhpcy5zb2NrZXQub24oJ2Nsb3NlJywgdGhpcy5vbkNsb3NlLmJpbmQodGhpcykpXG4gICAgLy8gbGV0IHRoZW0gc25pZmYgdW5wYXJzZWQgWE1MXG4gICAgdGhpcy5zb2NrZXQub24oJ2RhdGEnLCAgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2RhdGEnKSlcbiAgICB0aGlzLnNvY2tldC5vbignZHJhaW4nLCB0aGlzLmVtaXQuYmluZCh0aGlzLCAnZHJhaW4nKSlcbiAgICAvLyBpZ25vcmUgZXJyb3JzIGFmdGVyIGRpc2Nvbm5lY3RcbiAgICB0aGlzLnNvY2tldC5vbignZXJyb3InLCBmdW5jdGlvbiAoKSB7IH0pXG5cbiAgICBpZiAoIXRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSkge1xuICAgICAgICAvKipcbiAgICAgICAgKiBUaGlzIGlzIG9wdGltaXplZCBmb3IgY29udGludW91cyBUQ1Agc3RyZWFtcy4gSWYgeW91ciBcInNvY2tldFwiXG4gICAgICAgICogYWN0dWFsbHkgdHJhbnNwb3J0cyBmcmFtZXMgKFdlYlNvY2tldHMpIGFuZCB5b3UgY2FuJ3QgaGF2ZVxuICAgICAgICAqIHN0YW56YXMgc3BsaXQgYWNyb3NzIHRob3NlLCB1c2U6XG4gICAgICAgICogICAgIGNiKGVsLnRvU3RyaW5nKCkpXG4gICAgICAgICovXG4gICAgICAgIGlmICh0aGlzLnNlcmlhbGl6ZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSA9IGZ1bmN0aW9uKGVsLCBjYikge1xuICAgICAgICAgICAgICAgIC8vIENvbnRpbnVvdXNseSB3cml0ZSBvdXRcbiAgICAgICAgICAgICAgICBlbC53cml0ZShmdW5jdGlvbihzKSB7XG4gICAgICAgICAgICAgICAgICAgIGNiKHMpXG4gICAgICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LnNlcmlhbGl6ZVN0YW56YSA9IGZ1bmN0aW9uKGVsLCBjYikge1xuICAgICAgICAgICAgICAgIGNiKGVsLnRvU3RyaW5nKCkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuc29ja2V0LnBhdXNlKSB0aGlzLnNvY2tldC5wYXVzZSgpXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLnJlc3VtZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnNvY2tldC5yZXN1bWUpIHRoaXMuc29ja2V0LnJlc3VtZSgpXG59XG5cbi8qKiBDbGltYnMgdGhlIHN0YW56YSB1cCBpZiBhIGNoaWxkIHdhcyBwYXNzZWQsXG4gICAgYnV0IHlvdSBjYW4gc2VuZCBzdHJpbmdzIGFuZCBidWZmZXJzIHRvby5cblxuICAgIFJldHVybnMgd2hldGhlciB0aGUgc29ja2V0IGZsdXNoZWQgZGF0YS5cbiovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zZW5kID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgdmFyIGZsdXNoZWQgPSB0cnVlXG4gICAgaWYgKCF0aGlzLnNvY2tldCkge1xuICAgICAgICByZXR1cm4gLy8gRG9oIVxuICAgIH1cbiAgICBpZiAoIXRoaXMuc29ja2V0LndyaXRhYmxlKSB7XG4gICAgICAgIHRoaXMuc29ja2V0LmVuZCgpXG4gICAgICAgIHJldHVyblxuICAgIH1cblxuICAgIGRlYnVnKCdzZW5kOiAnICsgc3RhbnphLnRvU3RyaW5nKCkpXG4gICAgaWYgKHN0YW56YS5yb290KSB7XG4gICAgICAgIHZhciBlbCA9IHRoaXMucm1YbWxucyhzdGFuemEucm9vdCgpKVxuICAgICAgICB0aGlzLnNvY2tldC5zZXJpYWxpemVTdGFuemEoZWwsIGZ1bmN0aW9uKHMpIHtcbiAgICAgICAgICAgIGZsdXNoZWQgPSB0aGlzLndyaXRlKHMpXG4gICAgICAgIH0uYmluZCh0aGlzLnNvY2tldCkpXG4gICAgfSBlbHNlIHtcbiAgICAgICAgZmx1c2hlZCA9IHRoaXMuc29ja2V0LndyaXRlKHN0YW56YSlcbiAgICB9XG4gICAgcmV0dXJuIGZsdXNoZWRcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RhcnRQYXJzZXIgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB0aGlzLnBhcnNlciA9IG5ldyBTdHJlYW1QYXJzZXIuU3RyZWFtUGFyc2VyKHRoaXMubWF4U3RhbnphU2l6ZSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdzdHJlYW1TdGFydCcsIGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgICAgIC8qIFdlIG5lZWQgdGhvc2UgeG1sbnMgb2Z0ZW4sIHN0b3JlIHRoZW0gZXh0cmEgKi9cbiAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzID0ge31cbiAgICAgICAgZm9yICh2YXIgayBpbiBhdHRycykge1xuICAgICAgICAgICAgaWYgKGsgPT09ICd4bWxucycgfHwgKGsuc3Vic3RyKDAsIDYpID09PSAneG1sbnM6JykpXG4gICAgICAgICAgICAgICAgc2VsZi5zdHJlYW1Oc0F0dHJzW2tdID0gYXR0cnNba11cbiAgICAgICAgfVxuXG4gICAgICAgIC8qIE5vdGlmeSBpbiBjYXNlIHdlIGRvbid0IHdhaXQgZm9yIDxzdHJlYW06ZmVhdHVyZXMvPlxuICAgICAgICAgICAoQ29tcG9uZW50IG9yIG5vbi0xLjAgc3RyZWFtcylcbiAgICAgICAgICovXG4gICAgICAgIHNlbGYuZW1pdCgnc3RyZWFtU3RhcnQnLCBhdHRycylcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFuemEnLCBmdW5jdGlvbihzdGFuemEpIHtcbiAgICAgICAgc2VsZi5vblN0YW56YShzZWxmLmFkZFN0cmVhbU5zKHN0YW56YSkpXG4gICAgfSlcbiAgICB0aGlzLnBhcnNlci5vbignZXJyb3InLCBmdW5jdGlvbihlKSB7XG4gICAgICAgIHNlbGYuZXJyb3IoZS5jb25kaXRpb24gfHwgJ2ludGVybmFsLXNlcnZlci1lcnJvcicsIGUubWVzc2FnZSlcbiAgICB9KVxuICAgIHRoaXMucGFyc2VyLm9uY2UoJ2VuZCcsIGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLnN0b3BQYXJzZXIoKVxuICAgICAgICBpZiAoc2VsZi5yZWNvbm5lY3QpIHtcbiAgICAgICAgICAgIHNlbGYub25jZSgncmVjb25uZWN0Jywgc2VsZi5zdGFydFBhcnNlci5iaW5kKHNlbGYpKVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5lbmQoKVxuICAgICAgICB9XG4gICAgfSlcbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc3RvcFBhcnNlciA9IGZ1bmN0aW9uKCkge1xuICAgIC8qIE5vIG1vcmUgZXZlbnRzLCBwbGVhc2UgKG1heSBoYXBwZW4gaG93ZXZlcikgKi9cbiAgICBpZiAodGhpcy5wYXJzZXIpIHtcbiAgICAgICAgdmFyIHBhcnNlciA9IHRoaXMucGFyc2VyXG4gICAgICAgIC8qIEdldCBHQydlZCAqL1xuICAgICAgICB0aGlzLnBhcnNlciA9IG51bGxcbiAgICAgICAgcGFyc2VyLmVuZCgpXG4gICAgfVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5zdGFydFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBhdHRycyA9IHt9XG4gICAgZm9yICh2YXIgayBpbiB0aGlzLnhtbG5zKSB7XG4gICAgICAgIGlmICh0aGlzLnhtbG5zLmhhc093blByb3BlcnR5KGspKSB7XG4gICAgICAgICAgICBpZiAoIWspIHtcbiAgICAgICAgICAgICAgICBhdHRycy54bWxucyA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgYXR0cnNbJ3htbG5zOicgKyBrXSA9IHRoaXMueG1sbnNba11cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbiAgICBmb3IgKGsgaW4gdGhpcy5zdHJlYW1BdHRycykge1xuICAgICAgICBpZiAodGhpcy5zdHJlYW1BdHRycy5oYXNPd25Qcm9wZXJ0eShrKSkge1xuICAgICAgICAgICAgYXR0cnNba10gPSB0aGlzLnN0cmVhbUF0dHJzW2tdXG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5zdHJlYW1UbykgeyAvLyBpbiBjYXNlIG9mIGEgY29tcG9uZW50IGNvbm5lY3RpbmdcbiAgICAgICAgYXR0cnMudG8gPSB0aGlzLnN0cmVhbVRvXG4gICAgfVxuXG4gICAgdmFyIGVsID0gbmV3IGx0eC5FbGVtZW50KCdzdHJlYW06c3RyZWFtJywgYXR0cnMpXG4gICAgLy8gbWFrZSBpdCBub24tZW1wdHkgdG8gY3V0IHRoZSBjbG9zaW5nIHRhZ1xuICAgIGVsLnQoJyAnKVxuICAgIHZhciBzID0gZWwudG9TdHJpbmcoKVxuICAgIHRoaXMuc2VuZChzLnN1YnN0cigwLCBzLmluZGV4T2YoJyA8L3N0cmVhbTpzdHJlYW0+JykpKVxuXG4gICAgdGhpcy5zdHJlYW1PcGVuZWQgPSB0cnVlXG59XG5cbkNvbm5lY3Rpb24ucHJvdG90eXBlLmVuZFN0cmVhbSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICh0aGlzLnNvY2tldCAmJiB0aGlzLnNvY2tldC53cml0YWJsZSkge1xuICAgICAgICBpZiAodGhpcy5zdHJlYW1PcGVuZWQpIHtcbiAgICAgICAgICAgIHRoaXMuc29ja2V0LndyaXRlKCc8L3N0cmVhbTpzdHJlYW0+JylcbiAgICAgICAgICAgIHRoaXMuc3RyZWFtT3BlbmVkID0gZmFsc2VcbiAgICAgICAgfVxuICAgIH1cbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUub25EYXRhID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGRlYnVnKCdyZWNlaXZlOiAnICsgZGF0YS50b1N0cmluZygndXRmOCcpKVxuICAgIGlmICh0aGlzLnBhcnNlcikge1xuICAgICAgICB0aGlzLnBhcnNlci53cml0ZShkYXRhKVxuICAgIH1cbn1cblxuQ29ubmVjdGlvbi5wcm90b3R5cGUuc2V0U2VjdXJlID0gZnVuY3Rpb24oY3JlZGVudGlhbHMsIGlzU2VydmVyKSB7XG4gICAgLy8gUmVtb3ZlIG9sZCBldmVudCBsaXN0ZW5lcnNcbiAgICB0aGlzLnNvY2tldC5yZW1vdmVBbGxMaXN0ZW5lcnMoJ2RhdGEnKVxuICAgIC8vIHJldGFpbiBzb2NrZXQgJ2VuZCcgbGlzdGVuZXJzIGJlY2F1c2Ugc3NsIGxheWVyIGRvZXNuJ3Qgc3VwcG9ydCBpdFxuICAgIHRoaXMuc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnZHJhaW4nKVxuICAgIHRoaXMuc29ja2V0LnJlbW92ZUFsbExpc3RlbmVycygnY2xvc2UnKVxuICAgIC8vIHJlbW92ZSBpZGxlX3RpbWVvdXRcbiAgICBpZiAodGhpcy5zb2NrZXQuY2xlYXJUaW1lcikge1xuICAgICAgICB0aGlzLnNvY2tldC5jbGVhclRpbWVyKClcbiAgICB9XG5cbiAgICB2YXIgY2xlYXJ0ZXh0ID0gc3RhcnR0bHMoe1xuICAgICAgICBzb2NrZXQ6IHRoaXMuc29ja2V0LFxuICAgICAgICByZWplY3RVbmF1dGhvcml6ZWQ6IHRoaXMucmVqZWN0VW5hdXRob3JpemVkLFxuICAgICAgICBjcmVkZW50aWFsczogY3JlZGVudGlhbHMgfHwgdGhpcy5jcmVkZW50aWFscyxcbiAgICAgICAgcmVxdWVzdENlcnQ6IHRoaXMucmVxdWVzdENlcnQsXG4gICAgICAgIGlzU2VydmVyOiAhIWlzU2VydmVyXG4gICAgfSwgZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuaXNTZWN1cmUgPSB0cnVlXG4gICAgICAgIHRoaXMub25jZSgnZGlzY29ubmVjdCcsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuaXNTZWN1cmUgPSBmYWxzZVxuICAgICAgICB9KVxuICAgICAgICBjbGVhcnRleHQuZW1pdCgnY29ubmVjdCcsIGNsZWFydGV4dClcbiAgICB9LmJpbmQodGhpcykpXG4gICAgY2xlYXJ0ZXh0Lm9uKCdjbGllbnRFcnJvcicsIHRoaXMuZW1pdC5iaW5kKHRoaXMsICdlcnJvcicpKVxuICAgIGlmICghdGhpcy5yZWNvbm5lY3QpIHtcbiAgICAgICAgdGhpcy5yZWNvbm5lY3QgPSB0cnVlIC8vIG5lZWQgdGhpcyBzbyBzdG9wUGFyc2VyIHdvcmtzIHByb3Blcmx5XG4gICAgICAgIHRoaXMub25jZSgncmVjb25uZWN0JywgZnVuY3Rpb24oKSB7IHRoaXMucmVjb25uZWN0ID0gZmFsc2UgfSlcbiAgICB9XG4gICAgdGhpcy5zdG9wUGFyc2VyKClcbiAgICAvLyBpZiB3ZSByZWNvbm5lY3Qgd2UgbmVlZCB0byBnZXQgYmFjayB0byB0aGUgcHJldmlvdXMgc29ja2V0IGNyZWF0aW9uXG4gICAgdGhpcy5saXN0ZW4oeyBzb2NrZXQ6IGNsZWFydGV4dCwgcHJlc2VydmU6J29uJyB9KVxufVxuXG5mdW5jdGlvbiBnZXRBbGxUZXh0KGVsKSB7XG4gICAgcmV0dXJuICFlbC5jaGlsZHJlbiA/IGVsIDogZWwuY2hpbGRyZW4ucmVkdWNlKGZ1bmN0aW9uKHRleHQsIGNoaWxkKSB7XG4gICAgICAgIHJldHVybiB0ZXh0ICsgZ2V0QWxsVGV4dChjaGlsZClcbiAgICB9LCAnJylcbn1cblxuLyoqXG4gKiBUaGlzIGlzIG5vdCBhbiBldmVudCBsaXN0ZW5lciwgYnV0IHRha2VzIGNhcmUgb2YgdGhlIFRMUyBoYW5kc2hha2VcbiAqIGJlZm9yZSAnc3RhbnphJyBldmVudHMgYXJlIGVtaXR0ZWQgdG8gdGhlIGRlcml2ZWQgY2xhc3Nlcy5cbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUub25TdGFuemEgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBpZiAoc3RhbnphLmlzKCdlcnJvcicsIE5TX1NUUkVBTSkpIHtcbiAgICAgICAgdmFyIGVycm9yID0gbmV3IEVycm9yKCcnICsgZ2V0QWxsVGV4dChzdGFuemEpKVxuICAgICAgICBlcnJvci5zdGFuemEgPSBzdGFuemFcbiAgICAgICAgdGhpcy5zb2NrZXQuZW1pdCgnZXJyb3InLCBlcnJvcilcbiAgICB9IGVsc2UgaWYgKHN0YW56YS5pcygnZmVhdHVyZXMnLCB0aGlzLk5TX1NUUkVBTSkgJiZcbiAgICAgICAgdGhpcy5hbGxvd1RMUyAmJlxuICAgICAgICAhdGhpcy5pc1NlY3VyZSAmJlxuICAgICAgICBzdGFuemEuZ2V0Q2hpbGQoJ3N0YXJ0dGxzJywgdGhpcy5OU19YTVBQX1RMUykpIHtcbiAgICAgICAgLyogU2lnbmFsIHdpbGxpbmduZXNzIHRvIHBlcmZvcm0gVExTIGhhbmRzaGFrZSAqL1xuICAgICAgICB0aGlzLnNlbmQobmV3IGx0eC5FbGVtZW50KCdzdGFydHRscycsIHsgeG1sbnM6IHRoaXMuTlNfWE1QUF9UTFMgfSkpXG4gICAgfSBlbHNlIGlmICh0aGlzLmFsbG93VExTICYmXG4gICAgICAgIHN0YW56YS5pcygncHJvY2VlZCcsIHRoaXMuTlNfWE1QUF9UTFMpKSB7XG4gICAgICAgIC8qIFNlcnZlciBpcyB3YWl0aW5nIGZvciBUTFMgaGFuZHNoYWtlICovXG4gICAgICAgIHRoaXMuc2V0U2VjdXJlKClcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmVtaXQoJ3N0YW56YScsIHN0YW56YSlcbiAgICB9XG59XG5cbi8qKlxuICogQWRkIHN0cmVhbSB4bWxucyB0byBhIHN0YW56YVxuICpcbiAqIERvZXMgbm90IGFkZCBvdXIgZGVmYXVsdCB4bWxucyBhcyBpdCBpcyBkaWZmZXJlbnQgZm9yXG4gKiBDMlMvUzJTL0NvbXBvbmVudCBjb25uZWN0aW9ucy5cbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUuYWRkU3RyZWFtTnMgPSBmdW5jdGlvbihzdGFuemEpIHtcbiAgICBmb3IgKHZhciBhdHRyIGluIHRoaXMuc3RyZWFtTnNBdHRycykge1xuICAgICAgICBpZiAoIXN0YW56YS5hdHRyc1thdHRyXSAmJlxuICAgICAgICAgICAgISgoYXR0ciA9PT0gJ3htbG5zJykgJiYgKHRoaXMuc3RyZWFtTnNBdHRyc1thdHRyXSA9PT0gdGhpcy54bWxuc1snJ10pKVxuICAgICAgICAgICApIHtcbiAgICAgICAgICAgIHN0YW56YS5hdHRyc1thdHRyXSA9IHRoaXMuc3RyZWFtTnNBdHRyc1thdHRyXVxuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBzdGFuemFcbn1cblxuLyoqXG4gKiBSZW1vdmUgc3VwZXJmbHVvdXMgeG1sbnMgdGhhdCB3ZXJlIGFsZWFkeSBkZWNsYXJlZCBpblxuICogb3VyIDxzdHJlYW06c3RyZWFtPlxuICovXG5Db25uZWN0aW9uLnByb3RvdHlwZS5ybVhtbG5zID0gZnVuY3Rpb24oc3RhbnphKSB7XG4gICAgZm9yICh2YXIgcHJlZml4IGluIHRoaXMueG1sbnMpIHtcbiAgICAgICAgdmFyIGF0dHIgPSBwcmVmaXggPyAneG1sbnM6JyArIHByZWZpeCA6ICd4bWxucydcbiAgICAgICAgaWYgKHN0YW56YS5hdHRyc1thdHRyXSA9PT0gdGhpcy54bWxuc1twcmVmaXhdKSB7XG4gICAgICAgICAgICBzdGFuemEuYXR0cnNbYXR0cl0gPSBudWxsXG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHN0YW56YVxufVxuXG4vKipcbiAqIFhNUFAtc3R5bGUgZW5kIGNvbm5lY3Rpb24gZm9yIHVzZXJcbiAqL1xuQ29ubmVjdGlvbi5wcm90b3R5cGUub25FbmQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmVuZFN0cmVhbSgpXG4gICAgaWYgKCF0aGlzLnJlY29ubmVjdCkge1xuICAgICAgICB0aGlzLmVtaXQoJ2VuZCcpXG4gICAgfVxufVxuXG5Db25uZWN0aW9uLnByb3RvdHlwZS5vbkNsb3NlID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKCF0aGlzLnJlY29ubmVjdCkge1xuICAgICAgICB0aGlzLmVtaXQoJ2Nsb3NlJylcbiAgICB9XG59XG5cbi8qKlxuICogRW5kIGNvbm5lY3Rpb24gd2l0aCBzdHJlYW0gZXJyb3IuXG4gKiBFbWl0cyAnZXJyb3InIGV2ZW50IHRvby5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gY29uZGl0aW9uIFhNUFAgZXJyb3IgY29uZGl0aW9uLCBzZWUgUkZDMzkyMCA0LjcuMy4gRGVmaW5lZCBDb25kaXRpb25zXG4gKiBAcGFyYW0ge1N0cmluZ30gdGV4dCBPcHRpb25hbCBlcnJvciBtZXNzYWdlXG4gKi9cbkNvbm5lY3Rpb24ucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24oY29uZGl0aW9uLCBtZXNzYWdlKSB7XG4gICAgdGhpcy5lbWl0KCdlcnJvcicsIG5ldyBFcnJvcihtZXNzYWdlKSlcblxuICAgIGlmICghdGhpcy5zb2NrZXQgfHwgIXRoaXMuc29ja2V0LndyaXRhYmxlKSByZXR1cm5cblxuICAgIC8qIFJGQyAzOTIwLCA0LjcuMSBzdHJlYW0tbGV2ZWwgZXJyb3JzIHJ1bGVzICovXG4gICAgaWYgKCF0aGlzLnN0cmVhbU9wZW5lZCkgdGhpcy5zdGFydFN0cmVhbSgpXG5cbiAgICB2YXIgZXJyb3IgPSBuZXcgbHR4LkVsZW1lbnQoJ3N0cmVhbTplcnJvcicpXG4gICAgZXJyb3IuYyhjb25kaXRpb24sIHsgeG1sbnM6IE5TX1hNUFBfU1RSRUFNUyB9KVxuICAgIGlmIChtZXNzYWdlKSB7XG4gICAgICAgIGVycm9yLmMoICd0ZXh0Jywge1xuICAgICAgICAgICAgeG1sbnM6IE5TX1hNUFBfU1RSRUFNUyxcbiAgICAgICAgICAgICd4bWw6bGFuZyc6ICdlbidcbiAgICAgICAgfSkudChtZXNzYWdlKVxuICAgIH1cblxuICAgIHRoaXMuc2VuZChlcnJvcilcbiAgICB0aGlzLmVuZCgpXG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ29ubmVjdGlvblxuIiwidmFyIFN0cmluZ1ByZXAgPSByZXF1aXJlKCdub2RlLXN0cmluZ3ByZXAnKS5TdHJpbmdQcmVwXG4gICwgdG9Vbmljb2RlID0gcmVxdWlyZSgnbm9kZS1zdHJpbmdwcmVwJykudG9Vbmljb2RlXG5cblxuLyoqXG4gKiBKSUQgaW1wbGVtZW50cyBcbiAqIC0gWG1wcCBhZGRyZXNzZXMgYWNjb3JkaW5nIHRvIFJGQzYxMjJcbiAqIC0gWEVQLTAxMDY6IEpJRCBFc2NhcGluZ1xuICpcbiAqIEBzZWUgaHR0cDovL3Rvb2xzLmlldGYub3JnL2h0bWwvcmZjNjEyMiNzZWN0aW9uLTJcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxMDYuaHRtbFxuICovXG5mdW5jdGlvbiBKSUQoYSwgYiwgYykge1xuICAgIHRoaXMubG9jYWwgPSBudWxsXG4gICAgdGhpcy5kb21haW4gPSBudWxsXG4gICAgdGhpcy5yZXNvdXJjZSA9IG51bGxcblxuICAgIGlmIChhICYmICghYikgJiYgKCFjKSkge1xuICAgICAgICB0aGlzLnBhcnNlSklEKGEpXG4gICAgfSBlbHNlIGlmIChiKSB7XG4gICAgICAgIHRoaXMuc2V0TG9jYWwoYSlcbiAgICAgICAgdGhpcy5zZXREb21haW4oYilcbiAgICAgICAgdGhpcy5zZXRSZXNvdXJjZShjKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQXJndW1lbnQgZXJyb3InKVxuICAgIH1cbn1cblxuSklELnByb3RvdHlwZS5wYXJzZUpJRCA9IGZ1bmN0aW9uKHMpIHtcbiAgICBpZiAocy5pbmRleE9mKCdAJykgPj0gMCkge1xuICAgICAgICB0aGlzLnNldExvY2FsKHMuc3Vic3RyKDAsIHMubGFzdEluZGV4T2YoJ0AnKSkpXG4gICAgICAgIHMgPSBzLnN1YnN0cihzLmxhc3RJbmRleE9mKCdAJykgKyAxKVxuICAgIH1cbiAgICBpZiAocy5pbmRleE9mKCcvJykgPj0gMCkge1xuICAgICAgICB0aGlzLnNldFJlc291cmNlKHMuc3Vic3RyKHMuaW5kZXhPZignLycpICsgMSkpXG4gICAgICAgIHMgPSBzLnN1YnN0cigwLCBzLmluZGV4T2YoJy8nKSlcbiAgICB9XG4gICAgdGhpcy5zZXREb21haW4ocylcbn1cblxuSklELnByb3RvdHlwZS50b1N0cmluZyA9IGZ1bmN0aW9uKHVuZXNjYXBlKSB7XG4gICAgdmFyIHMgPSB0aGlzLmRvbWFpblxuICAgIGlmICh0aGlzLmxvY2FsKSBzID0gdGhpcy5nZXRMb2NhbCh1bmVzY2FwZSkgKyAnQCcgKyBzXG4gICAgaWYgKHRoaXMucmVzb3VyY2UpIHMgPSBzICsgJy8nICsgdGhpcy5yZXNvdXJjZVxuICAgIHJldHVybiBzXG59XG5cbi8qKlxuICogQ29udmVuaWVuY2UgbWV0aG9kIHRvIGRpc3Rpbmd1aXNoIHVzZXJzXG4gKiovXG5KSUQucHJvdG90eXBlLmJhcmUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5yZXNvdXJjZSkge1xuICAgICAgICByZXR1cm4gbmV3IEpJRCh0aGlzLmxvY2FsLCB0aGlzLmRvbWFpbiwgbnVsbClcbiAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbn1cblxuLyoqXG4gKiBDb21wYXJpc29uIGZ1bmN0aW9uXG4gKiovXG5KSUQucHJvdG90eXBlLmVxdWFscyA9IGZ1bmN0aW9uKG90aGVyKSB7XG4gICAgcmV0dXJuICh0aGlzLmxvY2FsID09PSBvdGhlci5sb2NhbCkgJiZcbiAgICAgICAgKHRoaXMuZG9tYWluID09PSBvdGhlci5kb21haW4pICYmXG4gICAgICAgICh0aGlzLnJlc291cmNlID09PSBvdGhlci5yZXNvdXJjZSlcbn1cblxuLyogRGVwcmVjYXRlZCwgdXNlIHNldExvY2FsKCkgW3NlZSBSRkM2MTIyXSAqL1xuSklELnByb3RvdHlwZS5zZXRVc2VyID0gZnVuY3Rpb24odXNlcikge1xuICAgIHJldHVybiB0aGlzLnNldExvY2FsKHVzZXIpXG59XG5cbi8qKlxuICogU2V0dGVycyB0aGF0IGRvIHN0cmluZ3ByZXAgbm9ybWFsaXphdGlvbi5cbiAqKi9cbkpJRC5wcm90b3R5cGUuc2V0TG9jYWwgPSBmdW5jdGlvbihsb2NhbCwgZXNjYXBlKSB7XG4gICAgZXNjYXBlID0gZXNjYXBlIHx8IHRoaXMuZGV0ZWN0RXNjYXBlKGxvY2FsKVxuXG4gICAgaWYgKGVzY2FwZSkge1xuICAgICAgICBsb2NhbCA9IHRoaXMuZXNjYXBlTG9jYWwobG9jYWwpXG4gICAgfVxuXG4gICAgdGhpcy5sb2NhbCA9IHRoaXMudXNlciA9IGxvY2FsICYmIHRoaXMucHJlcCgnbm9kZXByZXAnLCBsb2NhbClcbiAgICByZXR1cm4gdGhpc1xufVxuXG4vKipcbiAqIGh0dHA6Ly94bXBwLm9yZy9yZmNzL3JmYzYxMjIuaHRtbCNhZGRyZXNzaW5nLWRvbWFpblxuICovXG5KSUQucHJvdG90eXBlLnNldERvbWFpbiA9IGZ1bmN0aW9uKGRvbWFpbikge1xuICAgIHRoaXMuZG9tYWluID0gZG9tYWluICYmXG4gICAgICAgIHRoaXMucHJlcCgnbmFtZXByZXAnLCBkb21haW4uc3BsaXQoJy4nKS5tYXAodG9Vbmljb2RlKS5qb2luKCcuJykpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuSklELnByb3RvdHlwZS5zZXRSZXNvdXJjZSA9IGZ1bmN0aW9uKHJlc291cmNlKSB7XG4gICAgdGhpcy5yZXNvdXJjZSA9IHJlc291cmNlICYmIHRoaXMucHJlcCgncmVzb3VyY2VwcmVwJywgcmVzb3VyY2UpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuSklELnByb3RvdHlwZS5nZXRMb2NhbCA9IGZ1bmN0aW9uKHVuZXNjYXBlKSB7XG4gICAgdW5lc2NhcGUgPSB1bmVzY2FwZSB8fCBmYWxzZVxuICAgIHZhciBsb2NhbCA9IG51bGxcbiAgICBcbiAgICBpZiAodW5lc2NhcGUpIHtcbiAgICAgICAgbG9jYWwgPSB0aGlzLnVuZXNjYXBlTG9jYWwodGhpcy5sb2NhbClcbiAgICB9IGVsc2Uge1xuICAgICAgICBsb2NhbCA9IHRoaXMubG9jYWxcbiAgICB9XG5cbiAgICByZXR1cm4gbG9jYWw7XG59XG5cbkpJRC5wcm90b3R5cGUucHJlcCA9IGZ1bmN0aW9uKG9wZXJhdGlvbiwgdmFsdWUpIHtcbiAgICB2YXIgcCA9IG5ldyBTdHJpbmdQcmVwKG9wZXJhdGlvbilcbiAgICByZXR1cm4gcC5wcmVwYXJlKHZhbHVlKVxufVxuXG4vKiBEZXByZWNhdGVkLCB1c2UgZ2V0TG9jYWwoKSBbc2VlIFJGQzYxMjJdICovXG5KSUQucHJvdG90eXBlLmdldFVzZXIgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5nZXRMb2NhbCgpXG59XG5cbkpJRC5wcm90b3R5cGUuZ2V0RG9tYWluID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuZG9tYWluXG59XG5cbkpJRC5wcm90b3R5cGUuZ2V0UmVzb3VyY2UgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5yZXNvdXJjZVxufVxuXG5KSUQucHJvdG90eXBlLmRldGVjdEVzY2FwZSA9IGZ1bmN0aW9uIChsb2NhbCkge1xuICAgIGlmICghbG9jYWwpIHJldHVybiBmYWxzZVxuXG4gICAgLy8gcmVtb3ZlIGFsbCBlc2NhcGVkIHNlY3F1ZW5jZXNcbiAgICB2YXIgdG1wID0gbG9jYWwucmVwbGFjZSgvXFxcXDIwL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDIyL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDI2L2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDI3L2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDJmL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNhL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNjL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNlL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDQwL2csICcnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDVjL2csICcnKVxuXG4gICAgLy8gZGV0ZWN0IGlmIHdlIGhhdmUgdW5lc2NhcGVkIHNlcXVlbmNlc1xuICAgIHZhciBzZWFyY2ggPSB0bXAuc2VhcmNoKC9cXFxcfCB8XFxcInxcXCZ8XFwnfFxcL3w6fDx8PnxAL2cpO1xuICAgIGlmIChzZWFyY2ggPT09IC0xKSB7XG4gICAgICAgIHJldHVybiBmYWxzZVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0cnVlXG4gICAgfVxufVxuXG4vKiogXG4gKiBFc2NhcGUgdGhlIGxvY2FsIHBhcnQgb2YgYSBKSUQuXG4gKlxuICogQHNlZSBodHRwOi8veG1wcC5vcmcvZXh0ZW5zaW9ucy94ZXAtMDEwNi5odG1sXG4gKiBAcGFyYW0gU3RyaW5nIGxvY2FsIGxvY2FsIHBhcnQgb2YgYSBqaWRcbiAqIEByZXR1cm4gQW4gZXNjYXBlZCBsb2NhbCBwYXJ0XG4gKi9cbkpJRC5wcm90b3R5cGUuZXNjYXBlTG9jYWwgPSBmdW5jdGlvbiAobG9jYWwpIHtcbiAgICBpZiAobG9jYWwgPT09IG51bGwpIHJldHVybiBudWxsXG5cbiAgICAvKiBqc2hpbnQgLVcwNDQgKi9cbiAgICByZXR1cm4gbG9jYWwucmVwbGFjZSgvXlxccyt8XFxzKyQvZywgJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcL2csICdcXFxcNWMnKVxuICAgICAgICAucmVwbGFjZSgvIC9nLCAnXFxcXDIwJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXCIvZywgJ1xcXFwyMicpXG4gICAgICAgIC5yZXBsYWNlKC9cXCYvZywgJ1xcXFwyNicpXG4gICAgICAgIC5yZXBsYWNlKC9cXCcvZywgJ1xcXFwyNycpXG4gICAgICAgIC5yZXBsYWNlKC9cXC8vZywgJ1xcXFwyZicpXG4gICAgICAgIC5yZXBsYWNlKC86L2csICdcXFxcM2EnKVxuICAgICAgICAucmVwbGFjZSgvPC9nLCAnXFxcXDNjJylcbiAgICAgICAgLnJlcGxhY2UoLz4vZywgJ1xcXFwzZScpXG4gICAgICAgIC5yZXBsYWNlKC9AL2csICdcXFxcNDAnKVxuICAgICAgICAucmVwbGFjZSgvXFwzYS9nLCAnXFw1YzNhJylcbiAgICAgICBcbiAgICBcbn1cblxuLyoqIFxuICogVW5lc2NhcGUgYSBsb2NhbCBwYXJ0IG9mIGEgSklELlxuICpcbiAqIEBzZWUgaHR0cDovL3htcHAub3JnL2V4dGVuc2lvbnMveGVwLTAxMDYuaHRtbFxuICogQHBhcmFtIFN0cmluZyBsb2NhbCBsb2NhbCBwYXJ0IG9mIGEgamlkXG4gKiBAcmV0dXJuIHVuZXNjYXBlZCBsb2NhbCBwYXJ0XG4gKi9cbkpJRC5wcm90b3R5cGUudW5lc2NhcGVMb2NhbCA9IGZ1bmN0aW9uIChsb2NhbCkge1xuICAgIGlmIChsb2NhbCA9PT0gbnVsbCkgcmV0dXJuIG51bGxcblxuICAgIHJldHVybiBsb2NhbC5yZXBsYWNlKC9cXFxcMjAvZywgJyAnKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDIyL2csICdcXFwiJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwyNi9nLCAnJicpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMjcvZywgJ1xcJycpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcMmYvZywgJy8nKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDNhL2csICc6JylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFwzYy9nLCAnPCcpXG4gICAgICAgIC5yZXBsYWNlKC9cXFxcM2UvZywgJz4nKVxuICAgICAgICAucmVwbGFjZSgvXFxcXDQwL2csICdAJylcbiAgICAgICAgLnJlcGxhY2UoL1xcXFw1Yy9nLCAnXFxcXCcpXG59XG5cbmlmICgodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSAmJiAoZXhwb3J0cyAhPT0gbnVsbCkpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEpJRFxufSBlbHNlIGlmICgodHlwZW9mIHdpbmRvdyAhPT0gJ3VuZGVmaW5lZCcpICYmICh3aW5kb3cgIT09IG51bGwpKSB7XG4gICAgd2luZG93LkpJRCA9IEpJRFxufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5cbnZhciBkbnMgPSByZXF1aXJlKCdkbnMnKVxuXG5mdW5jdGlvbiBjb21wYXJlTnVtYmVycyhhLCBiKSB7XG4gICAgYSA9IHBhcnNlSW50KGEsIDEwKVxuICAgIGIgPSBwYXJzZUludChiLCAxMClcbiAgICBpZiAoYSA8IGIpXG4gICAgICAgIHJldHVybiAtMVxuICAgIGlmIChhID4gYilcbiAgICAgICAgcmV0dXJuIDFcbiAgICByZXR1cm4gMFxufVxuXG5mdW5jdGlvbiBncm91cFNydlJlY29yZHMoYWRkcnMpIHtcbiAgICB2YXIgZ3JvdXBzID0ge30gIC8vIGJ5IHByaW9yaXR5XG4gICAgYWRkcnMuZm9yRWFjaChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgIGlmICghZ3JvdXBzLmhhc093blByb3BlcnR5KGFkZHIucHJpb3JpdHkpKVxuICAgICAgICAgICAgZ3JvdXBzW2FkZHIucHJpb3JpdHldID0gW11cblxuICAgICAgICBncm91cHNbYWRkci5wcmlvcml0eV0ucHVzaChhZGRyKVxuICAgIH0pXG5cbiAgICB2YXIgcmVzdWx0ID0gW11cbiAgICBPYmplY3Qua2V5cyhncm91cHMpLnNvcnQoY29tcGFyZU51bWJlcnMpLmZvckVhY2goZnVuY3Rpb24ocHJpb3JpdHkpIHtcbiAgICAgICAgdmFyIGdyb3VwID0gZ3JvdXBzW3ByaW9yaXR5XVxuICAgICAgICB2YXIgdG90YWxXZWlnaHQgPSAwXG4gICAgICAgIGdyb3VwLmZvckVhY2goZnVuY3Rpb24oYWRkcikge1xuICAgICAgICAgICAgdG90YWxXZWlnaHQgKz0gYWRkci53ZWlnaHRcbiAgICAgICAgfSlcbiAgICAgICAgdmFyIHcgPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiB0b3RhbFdlaWdodClcbiAgICAgICAgdG90YWxXZWlnaHQgPSAwXG4gICAgICAgIHZhciBjYW5kaWRhdGUgPSBncm91cFswXVxuICAgICAgICBncm91cC5mb3JFYWNoKGZ1bmN0aW9uKGFkZHIpIHtcbiAgICAgICAgICAgIHRvdGFsV2VpZ2h0ICs9IGFkZHIud2VpZ2h0XG4gICAgICAgICAgICBpZiAodyA8IHRvdGFsV2VpZ2h0KVxuICAgICAgICAgICAgICAgIGNhbmRpZGF0ZSA9IGFkZHJcbiAgICAgICAgfSlcbiAgICAgICAgaWYgKGNhbmRpZGF0ZSlcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNhbmRpZGF0ZSlcbiAgICB9KVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuZnVuY3Rpb24gcmVzb2x2ZVNydihuYW1lLCBjYikge1xuICAgIGRucy5yZXNvbHZlU3J2KG5hbWUsIGZ1bmN0aW9uKGVyciwgYWRkcnMpIHtcbiAgICAgICAgaWYgKGVycikge1xuICAgICAgICAgICAgLyogbm8gU1JWIHJlY29yZCwgdHJ5IGRvbWFpbiBhcyBBICovXG4gICAgICAgICAgICBjYihlcnIpXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcGVuZGluZyA9IDAsIGVycm9yLCByZXN1bHRzID0gW11cbiAgICAgICAgICAgIHZhciBjYjEgPSBmdW5jdGlvbihlLCBhZGRyczEpIHtcbiAgICAgICAgICAgICAgICBlcnJvciA9IGVycm9yIHx8IGVcbiAgICAgICAgICAgICAgICByZXN1bHRzID0gcmVzdWx0cy5jb25jYXQoYWRkcnMxKVxuICAgICAgICAgICAgICAgIHBlbmRpbmctLVxuICAgICAgICAgICAgICAgIGlmIChwZW5kaW5nIDwgMSkge1xuICAgICAgICAgICAgICAgICAgICBjYihyZXN1bHRzID8gbnVsbCA6IGVycm9yLCByZXN1bHRzKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBnU1JWID0gZ3JvdXBTcnZSZWNvcmRzKGFkZHJzKVxuICAgICAgICAgICAgcGVuZGluZyA9IGdTUlYubGVuZ3RoXG4gICAgICAgICAgICBnU1JWLmZvckVhY2goZnVuY3Rpb24oYWRkcikge1xuICAgICAgICAgICAgICAgIHJlc29sdmVIb3N0KGFkZHIubmFtZSwgZnVuY3Rpb24oZSwgYSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgYSA9IGEubWFwKGZ1bmN0aW9uKGExKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuIHsgbmFtZTogYTEsIHBvcnQ6IGFkZHIucG9ydCB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9KVxuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNiMShlLCBhKVxuICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9KVxuICAgICAgICB9XG4gICAgfSlcbn1cblxuLy8gb25lIG9mIGJvdGggQSAmIEFBQUEsIGluIGNhc2Ugb2YgYnJva2VuIHR1bm5lbHNcbmZ1bmN0aW9uIHJlc29sdmVIb3N0KG5hbWUsIGNiKSB7XG4gICAgdmFyIGVycm9yLCByZXN1bHRzID0gW11cbiAgICB2YXIgY2IxID0gZnVuY3Rpb24oZSwgYWRkcikge1xuICAgICAgICBlcnJvciA9IGVycm9yIHx8IGVcbiAgICAgICAgaWYgKGFkZHIpXG4gICAgICAgICAgICByZXN1bHRzLnB1c2goYWRkcilcblxuICAgICAgICBjYigocmVzdWx0cy5sZW5ndGggPiAwKSA/IG51bGwgOiBlcnJvciwgcmVzdWx0cylcbiAgICB9XG5cbiAgICBkbnMubG9va3VwKG5hbWUsIGNiMSlcbn1cblxuLy8gY29ubmVjdGlvbiBhdHRlbXB0cyB0byBtdWx0aXBsZSBhZGRyZXNzZXMgaW4gYSByb3dcbmZ1bmN0aW9uIHRyeUNvbm5lY3QoY29ubmVjdGlvbiwgYWRkcnMpIHtcbiAgICBjb25uZWN0aW9uLm9uKCdjb25uZWN0JywgY2xlYW51cClcbiAgICBjb25uZWN0aW9uLm9uKCdkaXNjb25uZWN0JywgY29ubmVjdE5leHQpXG4gICAgcmV0dXJuIGNvbm5lY3ROZXh0KClcblxuICAgIGZ1bmN0aW9uIGNsZWFudXAoKSB7XG4gICAgICAgIGNvbm5lY3Rpb24ucmVtb3ZlTGlzdGVuZXIoJ2Nvbm5lY3QnLCBjbGVhbnVwKVxuICAgICAgICBjb25uZWN0aW9uLnJlbW92ZUxpc3RlbmVyKCdkaXNjb25uZWN0JywgY29ubmVjdE5leHQpXG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29ubmVjdE5leHQoKSB7XG4gICAgICAgIHZhciBhZGRyID0gYWRkcnMuc2hpZnQoKVxuICAgICAgICBpZiAoYWRkcilcbiAgICAgICAgICAgIGNvbm5lY3Rpb24uc29ja2V0LmNvbm5lY3QoYWRkci5wb3J0LCBhZGRyLm5hbWUpXG4gICAgICAgIGVsc2VcbiAgICAgICAgICAgIGNsZWFudXAoKVxuICAgIH1cbn1cblxuLy8gcmV0dXJucyBhIGxhenkgaXRlcmF0b3Igd2hpY2ggY2FuIGJlIHJlc3RhcnRlZCB2aWEgY29ubmVjdGlvbi5jb25uZWN0KClcbmV4cG9ydHMuY29ubmVjdCA9IGZ1bmN0aW9uIGNvbm5lY3Qob3B0cykge1xuICAgIHZhciBzZXJ2aWNlcyA9IG9wdHMuc2VydmljZXMuc2xpY2UoKVxuICAgIC8vIGxhenkgZXZhbHVhdGlvbiB0byBkZXRlcm1pbmUgZW5kcG9pbnRcbiAgICBmdW5jdGlvbiB0cnlTZXJ2aWNlcyhyZXRyeSkge1xuICAgICAgICAvKiBqc2hpbnQgLVcwNDAgKi9cbiAgICAgICAgdmFyIGNvbm5lY3Rpb24gPSB0aGlzXG4gICAgICAgIGlmICghY29ubmVjdGlvbi5zb2NrZXQgJiYgb3B0cy5zb2NrZXQpIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb3B0cy5zb2NrZXQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG9wdHMuc29ja2V0LmNhbGwodGhpcylcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQgPSBvcHRzLnNvY2tldFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgb3B0cy5zb2NrZXQgPSBudWxsXG4gICAgICAgIH0gZWxzZSBpZiAoIXJldHJ5KSB7XG4gICAgICAgICAgICBjb25uZWN0aW9uLnNvY2tldCA9IG51bGxcbiAgICAgICAgfVxuICAgICAgICB2YXIgc2VydmljZSA9IHNlcnZpY2VzLnNoaWZ0KClcbiAgICAgICAgaWYgKHNlcnZpY2UpIHtcbiAgICAgICAgICAgIHJlc29sdmVTcnYoc2VydmljZSArICcuJyArIG9wdHMuZG9tYWluLCBmdW5jdGlvbihlcnJvciwgYWRkcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoYWRkcnMpXG4gICAgICAgICAgICAgICAgICAgIHRyeUNvbm5lY3QoY29ubmVjdGlvbiwgYWRkcnMpXG4gICAgICAgICAgICAgICAgLy8gY2FsbCB0cnlTZXJ2aWNlcyBhZ2FpblxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICB0cnlTZXJ2aWNlcy5jYWxsKGNvbm5lY3Rpb24sICdyZXRyeScpXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJlc29sdmVIb3N0KG9wdHMuZG9tYWluLCBmdW5jdGlvbihlcnJvciwgYWRkcnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoYWRkcnMgJiYgYWRkcnMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgICAgICBhZGRycyA9IGFkZHJzLm1hcChmdW5jdGlvbihhZGRyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4geyBuYW1lOiBhZGRyLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcG9ydDogb3B0cy5kZWZhdWx0UG9ydCB9XG4gICAgICAgICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAgICAgICAgIHRyeUNvbm5lY3QoY29ubmVjdGlvbiwgYWRkcnMpXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjb25uZWN0aW9uLnJlY29ubmVjdCkgIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gcmV0cnkgZnJvbSB0aGUgYmVnaW5uaW5nXG4gICAgICAgICAgICAgICAgICAgIHNlcnZpY2VzID0gb3B0cy5zZXJ2aWNlcy5zbGljZSgpXG4gICAgICAgICAgICAgICAgICAgIC8vIGdldCBhIG5ldyBzb2NrZXRcbiAgICAgICAgICAgICAgICAgICAgY29ubmVjdGlvbi5zb2NrZXQgPSBudWxsXG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgZXJyb3IgPSBlcnJvciB8fCBuZXcgRXJyb3IoJ05vIGFkZHJlc3NlcyByZXNvbHZlZCBmb3IgJyArXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvcHRzLmRvbWFpbilcbiAgICAgICAgICAgICAgICAgICAgY29ubmVjdGlvbi5lbWl0KCdlcnJvcicsIGVycm9yKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pXG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNvbm5lY3Rpb24uc29ja2V0XG4gICAgfVxuICAgIHJldHVybiB0cnlTZXJ2aWNlc1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKVxuICAsIGx0eCA9IHJlcXVpcmUoJ2x0eCcpXG5cbmZ1bmN0aW9uIFN0YW56YShuYW1lLCBhdHRycykge1xuICAgIGx0eC5FbGVtZW50LmNhbGwodGhpcywgbmFtZSwgYXR0cnMpXG59XG5cbnV0aWwuaW5oZXJpdHMoU3RhbnphLCBsdHguRWxlbWVudClcblxuU3RhbnphLnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbG9uZSA9IG5ldyBTdGFuemEodGhpcy5uYW1lLCB7fSlcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgaWYgKHRoaXMuYXR0cnMuaGFzT3duUHJvcGVydHkoaykpXG4gICAgICAgICAgICBjbG9uZS5hdHRyc1trXSA9IHRoaXMuYXR0cnNba11cbiAgICB9XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgY2xvbmUuY25vZGUoY2hpbGQuY2xvbmUgPyBjaGlsZC5jbG9uZSgpIDogY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiBjbG9uZVxufVxuXG4vKipcbiAqIENvbW1vbiBhdHRyaWJ1dGUgZ2V0dGVycy9zZXR0ZXJzIGZvciBhbGwgc3Rhbnphc1xuICovXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuemEucHJvdG90eXBlLCAnZnJvbScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy5mcm9tXG4gICAgfSxcblxuICAgIHNldDogZnVuY3Rpb24oZnJvbSkge1xuICAgICAgICB0aGlzLmF0dHJzLmZyb20gPSBmcm9tXG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTdGFuemEucHJvdG90eXBlLCAndG8nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMudG9cbiAgICB9LFxuXG4gICAgc2V0OiBmdW5jdGlvbih0bykge1xuICAgICAgICB0aGlzLmF0dHJzLnRvID0gdG9cbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFN0YW56YS5wcm90b3R5cGUsICdpZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5hdHRycy5pZFxuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKGlkKSB7XG4gICAgICAgIHRoaXMuYXR0cnMuaWQgPSBpZFxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3RhbnphLnByb3RvdHlwZSwgJ3R5cGUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuYXR0cnMudHlwZVxuICAgIH0sXG5cbiAgICBzZXQ6IGZ1bmN0aW9uKHR5cGUpIHtcbiAgICAgICAgdGhpcy5hdHRycy50eXBlID0gdHlwZVxuICAgIH1cbn0pO1xuXG4vKipcbiAqIFN0YW56YSBraW5kc1xuICovXG5cbmZ1bmN0aW9uIE1lc3NhZ2UoYXR0cnMpIHtcbiAgICBTdGFuemEuY2FsbCh0aGlzLCAnbWVzc2FnZScsIGF0dHJzKVxufVxuXG51dGlsLmluaGVyaXRzKE1lc3NhZ2UsIFN0YW56YSlcblxuZnVuY3Rpb24gUHJlc2VuY2UoYXR0cnMpIHtcbiAgICBTdGFuemEuY2FsbCh0aGlzLCAncHJlc2VuY2UnLCBhdHRycylcbn1cblxudXRpbC5pbmhlcml0cyhQcmVzZW5jZSwgU3RhbnphKVxuXG5mdW5jdGlvbiBJcShhdHRycykge1xuICAgIFN0YW56YS5jYWxsKHRoaXMsICdpcScsIGF0dHJzKVxufVxuXG51dGlsLmluaGVyaXRzKElxLCBTdGFuemEpXG5cbmV4cG9ydHMuRWxlbWVudCA9IGx0eC5FbGVtZW50XG5leHBvcnRzLlN0YW56YSA9IFN0YW56YVxuZXhwb3J0cy5NZXNzYWdlID0gTWVzc2FnZVxuZXhwb3J0cy5QcmVzZW5jZSA9IFByZXNlbmNlXG5leHBvcnRzLklxID0gSXFcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbiAgLCBFdmVudEVtaXR0ZXIgPSByZXF1aXJlKCdldmVudHMnKS5FdmVudEVtaXR0ZXJcbiAgLCBsdHggPSByZXF1aXJlKCdsdHgnKVxuICAsIFN0YW56YSA9IHJlcXVpcmUoJy4vc3RhbnphJykuU3RhbnphXG5cbi8qKlxuICogUmVjb2duaXplcyA8c3RyZWFtOnN0cmVhbT4gYW5kIGNvbGxlY3RzIHN0YW56YXMgdXNlZCBmb3Igb3JkaW5hcnlcbiAqIFRDUCBzdHJlYW1zIGFuZCBXZWJzb2NrZXRzLlxuICpcbiAqIEFQSTogd3JpdGUoZGF0YSkgJiBlbmQoZGF0YSlcbiAqIEV2ZW50czogc3RyZWFtU3RhcnQsIHN0YW56YSwgZW5kLCBlcnJvclxuICovXG5mdW5jdGlvbiBTdHJlYW1QYXJzZXIobWF4U3RhbnphU2l6ZSkge1xuICAgIEV2ZW50RW1pdHRlci5jYWxsKHRoaXMpXG5cbiAgICB2YXIgc2VsZiA9IHRoaXNcbiAgICB0aGlzLnBhcnNlciA9IG5ldyBsdHguYmVzdFNheFBhcnNlcigpXG5cbiAgICAvKiBDb3VudCB0cmFmZmljIGZvciBlbnRpcmUgbGlmZS10aW1lICovXG4gICAgdGhpcy5ieXRlc1BhcnNlZCA9IDBcbiAgICB0aGlzLm1heFN0YW56YVNpemUgPSBtYXhTdGFuemFTaXplXG4gICAgLyogV2lsbCBiZSByZXNldCB1cG9uIGZpcnN0IHN0YW56YSwgYnV0IGVuZm9yY2UgbWF4U3RhbnphU2l6ZSB1bnRpbCBpdCBpcyBwYXJzZWQgKi9cbiAgICB0aGlzLmJ5dGVzUGFyc2VkT25TdGFuemFCZWdpbiA9IDBcblxuICAgIHRoaXMucGFyc2VyLm9uKCdzdGFydEVsZW1lbnQnLCBmdW5jdGlvbihuYW1lLCBhdHRycykge1xuICAgICAgICAgICAgLy8gVE9ETzogcmVmdXNlIGFueXRoaW5nIGJ1dCA8c3RyZWFtOnN0cmVhbT5cbiAgICAgICAgICAgIGlmICghc2VsZi5lbGVtZW50ICYmIChuYW1lID09PSAnc3RyZWFtOnN0cmVhbScpKSB7XG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdzdHJlYW1TdGFydCcsIGF0dHJzKVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hpbGRcbiAgICAgICAgICAgICAgICBpZiAoIXNlbGYuZWxlbWVudCkge1xuICAgICAgICAgICAgICAgICAgICAvKiBBIG5ldyBzdGFuemEgKi9cbiAgICAgICAgICAgICAgICAgICAgY2hpbGQgPSBuZXcgU3RhbnphKG5hbWUsIGF0dHJzKVxuICAgICAgICAgICAgICAgICAgICBzZWxmLmVsZW1lbnQgPSBjaGlsZFxuICAgICAgICAgICAgICAgICAgICAgIC8qIEZvciBtYXhTdGFuemFTaXplIGVuZm9yY2VtZW50ICovXG4gICAgICAgICAgICAgICAgICAgIHNlbGYuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luID0gc2VsZi5ieXRlc1BhcnNlZFxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIC8qIEEgY2hpbGQgZWxlbWVudCBvZiBhIHN0YW56YSAqL1xuICAgICAgICAgICAgICAgICAgICBjaGlsZCA9IG5ldyBsdHguRWxlbWVudChuYW1lLCBhdHRycylcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5lbGVtZW50ID0gc2VsZi5lbGVtZW50LmNub2RlKGNoaWxkKVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIClcblxuICAgIHRoaXMucGFyc2VyLm9uKCdlbmRFbGVtZW50JywgZnVuY3Rpb24obmFtZSkge1xuICAgICAgICBpZiAoIXNlbGYuZWxlbWVudCAmJiAobmFtZSA9PT0gJ3N0cmVhbTpzdHJlYW0nKSkge1xuICAgICAgICAgICAgc2VsZi5lbmQoKVxuICAgICAgICB9IGVsc2UgaWYgKHNlbGYuZWxlbWVudCAmJiAobmFtZSA9PT0gc2VsZi5lbGVtZW50Lm5hbWUpKSB7XG4gICAgICAgICAgICBpZiAoc2VsZi5lbGVtZW50LnBhcmVudCkge1xuICAgICAgICAgICAgICAgIHNlbGYuZWxlbWVudCA9IHNlbGYuZWxlbWVudC5wYXJlbnRcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLyogU3RhbnphIGNvbXBsZXRlICovXG4gICAgICAgICAgICAgICAgc2VsZi5lbWl0KCdzdGFuemEnLCBzZWxmLmVsZW1lbnQpXG4gICAgICAgICAgICAgICAgZGVsZXRlIHNlbGYuZWxlbWVudFxuICAgICAgICAgICAgICAgIC8qIG1heFN0YW56YVNpemUgZG9lc24ndCBhcHBseSB1bnRpbCBuZXh0IHN0YXJ0RWxlbWVudCAqL1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBzZWxmLmJ5dGVzUGFyc2VkT25TdGFuemFCZWdpblxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5lcnJvcigneG1sLW5vdC13ZWxsLWZvcm1lZCcsICdYTUwgcGFyc2UgZXJyb3InKVxuICAgICAgICB9XG4gICAgfSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCd0ZXh0JywgZnVuY3Rpb24oc3RyKSB7XG4gICAgICAgIGlmIChzZWxmLmVsZW1lbnQpXG4gICAgICAgICAgICBzZWxmLmVsZW1lbnQudChzdHIpXG4gICAgfSlcblxuICAgIHRoaXMucGFyc2VyLm9uKCdlbnRpdHlEZWNsJywgZnVuY3Rpb24oKSB7XG4gICAgICAgIC8qIEVudGl0eSBkZWNsYXJhdGlvbnMgYXJlIGZvcmJpZGRlbiBpbiBYTVBQLiBXZSBtdXN0IGFib3J0IHRvXG4gICAgICAgICAqIGF2b2lkIGEgYmlsbGlvbiBsYXVnaHMuXG4gICAgICAgICAqL1xuICAgICAgICBzZWxmLmVycm9yKCd4bWwtbm90LXdlbGwtZm9ybWVkJywgJ05vIGVudGl0eSBkZWNsYXJhdGlvbnMgYWxsb3dlZCcpXG4gICAgICAgIHNlbGYuZW5kKClcbiAgICB9KVxuXG4gICAgdGhpcy5wYXJzZXIub24oJ2Vycm9yJywgdGhpcy5lbWl0LmJpbmQodGhpcywgJ2Vycm9yJykpXG59XG5cbnV0aWwuaW5oZXJpdHMoU3RyZWFtUGFyc2VyLCBFdmVudEVtaXR0ZXIpXG5cblxuLyogXG4gKiBoYWNrIGZvciBtb3N0IHVzZWNhc2VzLCBkbyB3ZSBoYXZlIGEgYmV0dGVyIGlkZWE/XG4gKiAgIGNhdGNoIHRoZSBmb2xsb3dpbmc6XG4gKiAgIDw/eG1sIHZlcnNpb249XCIxLjBcIj8+XG4gKiAgIDw/eG1sIHZlcnNpb249XCIxLjBcIiBlbmNvZGluZz1cIlVURi04XCI/PlxuICogICA8P3htbCB2ZXJzaW9uPVwiMS4wXCIgZW5jb2Rpbmc9XCJVVEYtMTZcIiBzdGFuZGFsb25lPVwieWVzXCI/PlxuICovXG5TdHJlYW1QYXJzZXIucHJvdG90eXBlLmNoZWNrWE1MSGVhZGVyID0gZnVuY3Rpb24gKGRhdGEpIHtcbiAgICAvLyBjaGVjayBmb3IgeG1sIHRhZ1xuICAgIHZhciBpbmRleCA9IGRhdGEuaW5kZXhPZignPD94bWwnKTtcblxuICAgIGlmIChpbmRleCAhPT0gLTEpIHtcbiAgICAgICAgdmFyIGVuZCA9IGRhdGEuaW5kZXhPZignPz4nKTtcbiAgICAgICAgaWYgKGluZGV4ID49IDAgJiYgZW5kID49IDAgJiYgaW5kZXggPCBlbmQrMikge1xuICAgICAgICAgICAgdmFyIHNlYXJjaCA9IGRhdGEuc3Vic3RyaW5nKGluZGV4LGVuZCsyKTtcbiAgICAgICAgICAgIGRhdGEgPSBkYXRhLnJlcGxhY2Uoc2VhcmNoLCAnJyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZGF0YTtcbn1cblxuU3RyZWFtUGFyc2VyLnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAvKmlmICgvXjxzdHJlYW06c3RyZWFtIFtePl0rXFwvPiQvLnRlc3QoZGF0YSkpIHtcbiAgICBkYXRhID0gZGF0YS5yZXBsYWNlKC9cXC8+JC8sIFwiPlwiKVxuICAgIH0qL1xuICAgIGlmICh0aGlzLnBhcnNlcikge1xuICAgICAgICBcbiAgICAgICAgZGF0YSA9IGRhdGEudG9TdHJpbmcoJ3V0ZjgnKVxuICAgICAgICBkYXRhID0gdGhpcy5jaGVja1hNTEhlYWRlcihkYXRhKVxuXG4gICAgLyogSWYgYSBtYXhTdGFuemFTaXplIGlzIGNvbmZpZ3VyZWQsIHRoZSBjdXJyZW50IHN0YW56YSBtdXN0IGNvbnNpc3Qgb25seSBvZiB0aGlzIG1hbnkgYnl0ZXMgKi9cbiAgICAgICAgaWYgKHRoaXMuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luICYmIHRoaXMubWF4U3RhbnphU2l6ZSAmJlxuICAgICAgICAgICAgdGhpcy5ieXRlc1BhcnNlZCA+IHRoaXMuYnl0ZXNQYXJzZWRPblN0YW56YUJlZ2luICsgdGhpcy5tYXhTdGFuemFTaXplKSB7XG5cbiAgICAgICAgICAgIHRoaXMuZXJyb3IoJ3BvbGljeS12aW9sYXRpb24nLCAnTWF4aW11bSBzdGFuemEgc2l6ZSBleGNlZWRlZCcpXG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmJ5dGVzUGFyc2VkICs9IGRhdGEubGVuZ3RoXG5cbiAgICAgICAgdGhpcy5wYXJzZXIud3JpdGUoZGF0YSlcbiAgICB9XG59XG5cblN0cmVhbVBhcnNlci5wcm90b3R5cGUuZW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGlmIChkYXRhKSB7XG4gICAgICAgIHRoaXMud3JpdGUoZGF0YSlcbiAgICB9XG4gICAgLyogR2V0IEdDJ2VkICovXG4gICAgZGVsZXRlIHRoaXMucGFyc2VyXG4gICAgdGhpcy5lbWl0KCdlbmQnKVxufVxuXG5TdHJlYW1QYXJzZXIucHJvdG90eXBlLmVycm9yID0gZnVuY3Rpb24oY29uZGl0aW9uLCBtZXNzYWdlKSB7XG4gICAgdmFyIGUgPSBuZXcgRXJyb3IobWVzc2FnZSlcbiAgICBlLmNvbmRpdGlvbiA9IGNvbmRpdGlvblxuICAgIHRoaXMuZW1pdCgnZXJyb3InLCBlKVxufVxuXG5leHBvcnRzLlN0cmVhbVBhcnNlciA9IFN0cmVhbVBhcnNlciIsIlxuLyoqXG4gKiBUaGlzIGlzIHRoZSB3ZWIgYnJvd3NlciBpbXBsZW1lbnRhdGlvbiBvZiBgZGVidWcoKWAuXG4gKlxuICogRXhwb3NlIGBkZWJ1ZygpYCBhcyB0aGUgbW9kdWxlLlxuICovXG5cbmV4cG9ydHMgPSBtb2R1bGUuZXhwb3J0cyA9IHJlcXVpcmUoJy4vZGVidWcnKTtcbmV4cG9ydHMubG9nID0gbG9nO1xuZXhwb3J0cy5mb3JtYXRBcmdzID0gZm9ybWF0QXJncztcbmV4cG9ydHMuc2F2ZSA9IHNhdmU7XG5leHBvcnRzLmxvYWQgPSBsb2FkO1xuZXhwb3J0cy51c2VDb2xvcnMgPSB1c2VDb2xvcnM7XG5cbi8qKlxuICogVXNlIGNocm9tZS5zdG9yYWdlLmxvY2FsIGlmIHdlIGFyZSBpbiBhbiBhcHBcbiAqL1xuXG52YXIgc3RvcmFnZTtcblxuaWYgKHR5cGVvZiBjaHJvbWUgIT09ICd1bmRlZmluZWQnICYmIHR5cGVvZiBjaHJvbWUuc3RvcmFnZSAhPT0gJ3VuZGVmaW5lZCcpXG4gIHN0b3JhZ2UgPSBjaHJvbWUuc3RvcmFnZS5sb2NhbDtcbmVsc2VcbiAgc3RvcmFnZSA9IGxvY2Fsc3RvcmFnZSgpO1xuXG4vKipcbiAqIENvbG9ycy5cbiAqL1xuXG5leHBvcnRzLmNvbG9ycyA9IFtcbiAgJ2xpZ2h0c2VhZ3JlZW4nLFxuICAnZm9yZXN0Z3JlZW4nLFxuICAnZ29sZGVucm9kJyxcbiAgJ2RvZGdlcmJsdWUnLFxuICAnZGFya29yY2hpZCcsXG4gICdjcmltc29uJ1xuXTtcblxuLyoqXG4gKiBDdXJyZW50bHkgb25seSBXZWJLaXQtYmFzZWQgV2ViIEluc3BlY3RvcnMsIEZpcmVmb3ggPj0gdjMxLFxuICogYW5kIHRoZSBGaXJlYnVnIGV4dGVuc2lvbiAoYW55IEZpcmVmb3ggdmVyc2lvbikgYXJlIGtub3duXG4gKiB0byBzdXBwb3J0IFwiJWNcIiBDU1MgY3VzdG9taXphdGlvbnMuXG4gKlxuICogVE9ETzogYWRkIGEgYGxvY2FsU3RvcmFnZWAgdmFyaWFibGUgdG8gZXhwbGljaXRseSBlbmFibGUvZGlzYWJsZSBjb2xvcnNcbiAqL1xuXG5mdW5jdGlvbiB1c2VDb2xvcnMoKSB7XG4gIC8vIGlzIHdlYmtpdD8gaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL2EvMTY0NTk2MDYvMzc2NzczXG4gIHJldHVybiAoJ1dlYmtpdEFwcGVhcmFuY2UnIGluIGRvY3VtZW50LmRvY3VtZW50RWxlbWVudC5zdHlsZSkgfHxcbiAgICAvLyBpcyBmaXJlYnVnPyBodHRwOi8vc3RhY2tvdmVyZmxvdy5jb20vYS8zOTgxMjAvMzc2NzczXG4gICAgKHdpbmRvdy5jb25zb2xlICYmIChjb25zb2xlLmZpcmVidWcgfHwgKGNvbnNvbGUuZXhjZXB0aW9uICYmIGNvbnNvbGUudGFibGUpKSkgfHxcbiAgICAvLyBpcyBmaXJlZm94ID49IHYzMT9cbiAgICAvLyBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9lbi1VUy9kb2NzL1Rvb2xzL1dlYl9Db25zb2xlI1N0eWxpbmdfbWVzc2FnZXNcbiAgICAobmF2aWdhdG9yLnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLm1hdGNoKC9maXJlZm94XFwvKFxcZCspLykgJiYgcGFyc2VJbnQoUmVnRXhwLiQxLCAxMCkgPj0gMzEpO1xufVxuXG4vKipcbiAqIE1hcCAlaiB0byBgSlNPTi5zdHJpbmdpZnkoKWAsIHNpbmNlIG5vIFdlYiBJbnNwZWN0b3JzIGRvIHRoYXQgYnkgZGVmYXVsdC5cbiAqL1xuXG5leHBvcnRzLmZvcm1hdHRlcnMuaiA9IGZ1bmN0aW9uKHYpIHtcbiAgcmV0dXJuIEpTT04uc3RyaW5naWZ5KHYpO1xufTtcblxuXG4vKipcbiAqIENvbG9yaXplIGxvZyBhcmd1bWVudHMgaWYgZW5hYmxlZC5cbiAqXG4gKiBAYXBpIHB1YmxpY1xuICovXG5cbmZ1bmN0aW9uIGZvcm1hdEFyZ3MoKSB7XG4gIHZhciBhcmdzID0gYXJndW1lbnRzO1xuICB2YXIgdXNlQ29sb3JzID0gdGhpcy51c2VDb2xvcnM7XG5cbiAgYXJnc1swXSA9ICh1c2VDb2xvcnMgPyAnJWMnIDogJycpXG4gICAgKyB0aGlzLm5hbWVzcGFjZVxuICAgICsgKHVzZUNvbG9ycyA/ICcgJWMnIDogJyAnKVxuICAgICsgYXJnc1swXVxuICAgICsgKHVzZUNvbG9ycyA/ICclYyAnIDogJyAnKVxuICAgICsgJysnICsgZXhwb3J0cy5odW1hbml6ZSh0aGlzLmRpZmYpO1xuXG4gIGlmICghdXNlQ29sb3JzKSByZXR1cm4gYXJncztcblxuICB2YXIgYyA9ICdjb2xvcjogJyArIHRoaXMuY29sb3I7XG4gIGFyZ3MgPSBbYXJnc1swXSwgYywgJ2NvbG9yOiBpbmhlcml0J10uY29uY2F0KEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3MsIDEpKTtcblxuICAvLyB0aGUgZmluYWwgXCIlY1wiIGlzIHNvbWV3aGF0IHRyaWNreSwgYmVjYXVzZSB0aGVyZSBjb3VsZCBiZSBvdGhlclxuICAvLyBhcmd1bWVudHMgcGFzc2VkIGVpdGhlciBiZWZvcmUgb3IgYWZ0ZXIgdGhlICVjLCBzbyB3ZSBuZWVkIHRvXG4gIC8vIGZpZ3VyZSBvdXQgdGhlIGNvcnJlY3QgaW5kZXggdG8gaW5zZXJ0IHRoZSBDU1MgaW50b1xuICB2YXIgaW5kZXggPSAwO1xuICB2YXIgbGFzdEMgPSAwO1xuICBhcmdzWzBdLnJlcGxhY2UoLyVbYS16JV0vZywgZnVuY3Rpb24obWF0Y2gpIHtcbiAgICBpZiAoJyUlJyA9PT0gbWF0Y2gpIHJldHVybjtcbiAgICBpbmRleCsrO1xuICAgIGlmICgnJWMnID09PSBtYXRjaCkge1xuICAgICAgLy8gd2Ugb25seSBhcmUgaW50ZXJlc3RlZCBpbiB0aGUgKmxhc3QqICVjXG4gICAgICAvLyAodGhlIHVzZXIgbWF5IGhhdmUgcHJvdmlkZWQgdGhlaXIgb3duKVxuICAgICAgbGFzdEMgPSBpbmRleDtcbiAgICB9XG4gIH0pO1xuXG4gIGFyZ3Muc3BsaWNlKGxhc3RDLCAwLCBjKTtcbiAgcmV0dXJuIGFyZ3M7XG59XG5cbi8qKlxuICogSW52b2tlcyBgY29uc29sZS5sb2coKWAgd2hlbiBhdmFpbGFibGUuXG4gKiBOby1vcCB3aGVuIGBjb25zb2xlLmxvZ2AgaXMgbm90IGEgXCJmdW5jdGlvblwiLlxuICpcbiAqIEBhcGkgcHVibGljXG4gKi9cblxuZnVuY3Rpb24gbG9nKCkge1xuICAvLyB0aGlzIGhhY2tlcnkgaXMgcmVxdWlyZWQgZm9yIElFOC85LCB3aGVyZVxuICAvLyB0aGUgYGNvbnNvbGUubG9nYCBmdW5jdGlvbiBkb2Vzbid0IGhhdmUgJ2FwcGx5J1xuICByZXR1cm4gJ29iamVjdCcgPT09IHR5cGVvZiBjb25zb2xlXG4gICAgJiYgY29uc29sZS5sb2dcbiAgICAmJiBGdW5jdGlvbi5wcm90b3R5cGUuYXBwbHkuY2FsbChjb25zb2xlLmxvZywgY29uc29sZSwgYXJndW1lbnRzKTtcbn1cblxuLyoqXG4gKiBTYXZlIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZXNwYWNlc1xuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gc2F2ZShuYW1lc3BhY2VzKSB7XG4gIHRyeSB7XG4gICAgaWYgKG51bGwgPT0gbmFtZXNwYWNlcykge1xuICAgICAgc3RvcmFnZS5yZW1vdmVJdGVtKCdkZWJ1ZycpO1xuICAgIH0gZWxzZSB7XG4gICAgICBzdG9yYWdlLmRlYnVnID0gbmFtZXNwYWNlcztcbiAgICB9XG4gIH0gY2F0Y2goZSkge31cbn1cblxuLyoqXG4gKiBMb2FkIGBuYW1lc3BhY2VzYC5cbiAqXG4gKiBAcmV0dXJuIHtTdHJpbmd9IHJldHVybnMgdGhlIHByZXZpb3VzbHkgcGVyc2lzdGVkIGRlYnVnIG1vZGVzXG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBsb2FkKCkge1xuICB2YXIgcjtcbiAgdHJ5IHtcbiAgICByID0gc3RvcmFnZS5kZWJ1ZztcbiAgfSBjYXRjaChlKSB7fVxuICByZXR1cm4gcjtcbn1cblxuLyoqXG4gKiBFbmFibGUgbmFtZXNwYWNlcyBsaXN0ZWQgaW4gYGxvY2FsU3RvcmFnZS5kZWJ1Z2AgaW5pdGlhbGx5LlxuICovXG5cbmV4cG9ydHMuZW5hYmxlKGxvYWQoKSk7XG5cbi8qKlxuICogTG9jYWxzdG9yYWdlIGF0dGVtcHRzIHRvIHJldHVybiB0aGUgbG9jYWxzdG9yYWdlLlxuICpcbiAqIFRoaXMgaXMgbmVjZXNzYXJ5IGJlY2F1c2Ugc2FmYXJpIHRocm93c1xuICogd2hlbiBhIHVzZXIgZGlzYWJsZXMgY29va2llcy9sb2NhbHN0b3JhZ2VcbiAqIGFuZCB5b3UgYXR0ZW1wdCB0byBhY2Nlc3MgaXQuXG4gKlxuICogQHJldHVybiB7TG9jYWxTdG9yYWdlfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9jYWxzdG9yYWdlKCl7XG4gIHRyeSB7XG4gICAgcmV0dXJuIHdpbmRvdy5sb2NhbFN0b3JhZ2U7XG4gIH0gY2F0Y2ggKGUpIHt9XG59XG4iLCJhcmd1bWVudHNbNF1bNDJdWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsIi8qKlxuICogSGVscGVycy5cbiAqL1xuXG52YXIgcyA9IDEwMDA7XG52YXIgbSA9IHMgKiA2MDtcbnZhciBoID0gbSAqIDYwO1xudmFyIGQgPSBoICogMjQ7XG52YXIgeSA9IGQgKiAzNjUuMjU7XG5cbi8qKlxuICogUGFyc2Ugb3IgZm9ybWF0IHRoZSBnaXZlbiBgdmFsYC5cbiAqXG4gKiBPcHRpb25zOlxuICpcbiAqICAtIGBsb25nYCB2ZXJib3NlIGZvcm1hdHRpbmcgW2ZhbHNlXVxuICpcbiAqIEBwYXJhbSB7U3RyaW5nfE51bWJlcn0gdmFsXG4gKiBAcGFyYW0ge09iamVjdH0gb3B0aW9uc1xuICogQHJldHVybiB7U3RyaW5nfE51bWJlcn1cbiAqIEBhcGkgcHVibGljXG4gKi9cblxubW9kdWxlLmV4cG9ydHMgPSBmdW5jdGlvbih2YWwsIG9wdGlvbnMpe1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgaWYgKCdzdHJpbmcnID09IHR5cGVvZiB2YWwpIHJldHVybiBwYXJzZSh2YWwpO1xuICByZXR1cm4gb3B0aW9ucy5sb25nXG4gICAgPyBsb25nKHZhbClcbiAgICA6IHNob3J0KHZhbCk7XG59O1xuXG4vKipcbiAqIFBhcnNlIHRoZSBnaXZlbiBgc3RyYCBhbmQgcmV0dXJuIG1pbGxpc2Vjb25kcy5cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gc3RyXG4gKiBAcmV0dXJuIHtOdW1iZXJ9XG4gKiBAYXBpIHByaXZhdGVcbiAqL1xuXG5mdW5jdGlvbiBwYXJzZShzdHIpIHtcbiAgdmFyIG1hdGNoID0gL14oKD86XFxkKyk/XFwuP1xcZCspICoobWlsbGlzZWNvbmRzP3xtc2Vjcz98bXN8c2Vjb25kcz98c2Vjcz98c3xtaW51dGVzP3xtaW5zP3xtfGhvdXJzP3xocnM/fGh8ZGF5cz98ZHx5ZWFycz98eXJzP3x5KT8kL2kuZXhlYyhzdHIpO1xuICBpZiAoIW1hdGNoKSByZXR1cm47XG4gIHZhciBuID0gcGFyc2VGbG9hdChtYXRjaFsxXSk7XG4gIHZhciB0eXBlID0gKG1hdGNoWzJdIHx8ICdtcycpLnRvTG93ZXJDYXNlKCk7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3llYXJzJzpcbiAgICBjYXNlICd5ZWFyJzpcbiAgICBjYXNlICd5cnMnOlxuICAgIGNhc2UgJ3lyJzpcbiAgICBjYXNlICd5JzpcbiAgICAgIHJldHVybiBuICogeTtcbiAgICBjYXNlICdkYXlzJzpcbiAgICBjYXNlICdkYXknOlxuICAgIGNhc2UgJ2QnOlxuICAgICAgcmV0dXJuIG4gKiBkO1xuICAgIGNhc2UgJ2hvdXJzJzpcbiAgICBjYXNlICdob3VyJzpcbiAgICBjYXNlICdocnMnOlxuICAgIGNhc2UgJ2hyJzpcbiAgICBjYXNlICdoJzpcbiAgICAgIHJldHVybiBuICogaDtcbiAgICBjYXNlICdtaW51dGVzJzpcbiAgICBjYXNlICdtaW51dGUnOlxuICAgIGNhc2UgJ21pbnMnOlxuICAgIGNhc2UgJ21pbic6XG4gICAgY2FzZSAnbSc6XG4gICAgICByZXR1cm4gbiAqIG07XG4gICAgY2FzZSAnc2Vjb25kcyc6XG4gICAgY2FzZSAnc2Vjb25kJzpcbiAgICBjYXNlICdzZWNzJzpcbiAgICBjYXNlICdzZWMnOlxuICAgIGNhc2UgJ3MnOlxuICAgICAgcmV0dXJuIG4gKiBzO1xuICAgIGNhc2UgJ21pbGxpc2Vjb25kcyc6XG4gICAgY2FzZSAnbWlsbGlzZWNvbmQnOlxuICAgIGNhc2UgJ21zZWNzJzpcbiAgICBjYXNlICdtc2VjJzpcbiAgICBjYXNlICdtcyc6XG4gICAgICByZXR1cm4gbjtcbiAgfVxufVxuXG4vKipcbiAqIFNob3J0IGZvcm1hdCBmb3IgYG1zYC5cbiAqXG4gKiBAcGFyYW0ge051bWJlcn0gbXNcbiAqIEByZXR1cm4ge1N0cmluZ31cbiAqIEBhcGkgcHJpdmF0ZVxuICovXG5cbmZ1bmN0aW9uIHNob3J0KG1zKSB7XG4gIGlmIChtcyA+PSBkKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIGQpICsgJ2QnO1xuICBpZiAobXMgPj0gaCkgcmV0dXJuIE1hdGgucm91bmQobXMgLyBoKSArICdoJztcbiAgaWYgKG1zID49IG0pIHJldHVybiBNYXRoLnJvdW5kKG1zIC8gbSkgKyAnbSc7XG4gIGlmIChtcyA+PSBzKSByZXR1cm4gTWF0aC5yb3VuZChtcyAvIHMpICsgJ3MnO1xuICByZXR1cm4gbXMgKyAnbXMnO1xufVxuXG4vKipcbiAqIExvbmcgZm9ybWF0IGZvciBgbXNgLlxuICpcbiAqIEBwYXJhbSB7TnVtYmVyfSBtc1xuICogQHJldHVybiB7U3RyaW5nfVxuICogQGFwaSBwcml2YXRlXG4gKi9cblxuZnVuY3Rpb24gbG9uZyhtcykge1xuICByZXR1cm4gcGx1cmFsKG1zLCBkLCAnZGF5JylcbiAgICB8fCBwbHVyYWwobXMsIGgsICdob3VyJylcbiAgICB8fCBwbHVyYWwobXMsIG0sICdtaW51dGUnKVxuICAgIHx8IHBsdXJhbChtcywgcywgJ3NlY29uZCcpXG4gICAgfHwgbXMgKyAnIG1zJztcbn1cblxuLyoqXG4gKiBQbHVyYWxpemF0aW9uIGhlbHBlci5cbiAqL1xuXG5mdW5jdGlvbiBwbHVyYWwobXMsIG4sIG5hbWUpIHtcbiAgaWYgKG1zIDwgbikgcmV0dXJuO1xuICBpZiAobXMgPCBuICogMS41KSByZXR1cm4gTWF0aC5mbG9vcihtcyAvIG4pICsgJyAnICsgbmFtZTtcbiAgcmV0dXJuIE1hdGguY2VpbChtcyAvIG4pICsgJyAnICsgbmFtZSArICdzJztcbn1cbiIsImFyZ3VtZW50c1s0XVsyMl1bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKipcbiAqIFRoaXMgY2hlYXAgcmVwbGljYSBvZiBET00vQnVpbGRlciBwdXRzIG1lIHRvIHNoYW1lIDotKVxuICpcbiAqIEF0dHJpYnV0ZXMgYXJlIGluIHRoZSBlbGVtZW50LmF0dHJzIG9iamVjdC4gQ2hpbGRyZW4gaXMgYSBsaXN0IG9mXG4gKiBlaXRoZXIgb3RoZXIgRWxlbWVudHMgb3IgU3RyaW5ncyBmb3IgdGV4dCBjb250ZW50LlxuICoqL1xuZnVuY3Rpb24gRWxlbWVudChuYW1lLCBhdHRycykge1xuICAgIHRoaXMubmFtZSA9IG5hbWVcbiAgICB0aGlzLnBhcmVudCA9IG51bGxcbiAgICB0aGlzLmNoaWxkcmVuID0gW11cbiAgICB0aGlzLnNldEF0dHJzKGF0dHJzKVxufVxuXG4vKioqIEFjY2Vzc29ycyAqKiovXG5cbi8qKlxuICogaWYgKGVsZW1lbnQuaXMoJ21lc3NhZ2UnLCAnamFiYmVyOmNsaWVudCcpKSAuLi5cbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmlzID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICByZXR1cm4gKHRoaXMuZ2V0TmFtZSgpID09PSBuYW1lKSAmJlxuICAgICAgICAoIXhtbG5zIHx8ICh0aGlzLmdldE5TKCkgPT09IHhtbG5zKSlcbn1cblxuLyogd2l0aG91dCBwcmVmaXggKi9cbkVsZW1lbnQucHJvdG90eXBlLmdldE5hbWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWUuc3Vic3RyKHRoaXMubmFtZS5pbmRleE9mKCc6JykgKyAxKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiB0aGlzLm5hbWVcbiAgICB9XG59XG5cbi8qKlxuICogcmV0cmlldmVzIHRoZSBuYW1lc3BhY2Ugb2YgdGhlIGN1cnJlbnQgZWxlbWVudCwgdXB3YXJkcyByZWN1cnNpdmVseVxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0TlMgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5uYW1lLmluZGV4T2YoJzonKSA+PSAwKSB7XG4gICAgICAgIHZhciBwcmVmaXggPSB0aGlzLm5hbWUuc3Vic3RyKDAsIHRoaXMubmFtZS5pbmRleE9mKCc6JykpXG4gICAgICAgIHJldHVybiB0aGlzLmZpbmROUyhwcmVmaXgpXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmZpbmROUygpXG59XG5cbi8qKlxuICogZmluZCB0aGUgbmFtZXNwYWNlIHRvIHRoZSBnaXZlbiBwcmVmaXgsIHVwd2FyZHMgcmVjdXJzaXZlbHlcbiAqKi9cbkVsZW1lbnQucHJvdG90eXBlLmZpbmROUyA9IGZ1bmN0aW9uKHByZWZpeCkge1xuICAgIGlmICghcHJlZml4KSB7XG4gICAgICAgIC8qIGRlZmF1bHQgbmFtZXNwYWNlICovXG4gICAgICAgIGlmICh0aGlzLmF0dHJzLnhtbG5zKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRycy54bWxuc1xuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKClcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIHByZWZpeGVkIG5hbWVzcGFjZSAqL1xuICAgICAgICB2YXIgYXR0ciA9ICd4bWxuczonICsgcHJlZml4XG4gICAgICAgIGlmICh0aGlzLmF0dHJzW2F0dHJdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5hdHRyc1thdHRyXVxuICAgICAgICB9IGVsc2UgaWYgKHRoaXMucGFyZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5wYXJlbnQuZmluZE5TKHByZWZpeClcbiAgICAgICAgfVxuICAgIH1cbn1cblxuLyoqXG4gKiBSZWN1cnNpdmVybHkgZ2V0cyBhbGwgeG1sbnMgZGVmaW5lZCwgaW4gdGhlIGZvcm0gb2Yge3VybDpwcmVmaXh9XG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRYbWxucyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBuYW1lc3BhY2VzID0ge31cblxuICAgIGlmICh0aGlzLnBhcmVudCkge1xuICAgICAgICBuYW1lc3BhY2VzID0gdGhpcy5wYXJlbnQuZ2V0WG1sbnMoKVxuICAgIH1cblxuICAgIGZvciAodmFyIGF0dHIgaW4gdGhpcy5hdHRycykge1xuICAgICAgICB2YXIgbSA9IGF0dHIubWF0Y2goJ3htbG5zOj8oLiopJylcbiAgICAgICAgaWYgKHRoaXMuYXR0cnMuaGFzT3duUHJvcGVydHkoYXR0cikgJiYgbSkge1xuICAgICAgICAgICAgbmFtZXNwYWNlc1t0aGlzLmF0dHJzW2F0dHJdXSA9IG1bMV1cbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gbmFtZXNwYWNlc1xufVxuXG5FbGVtZW50LnByb3RvdHlwZS5zZXRBdHRycyA9IGZ1bmN0aW9uKGF0dHJzKSB7XG4gICAgdGhpcy5hdHRycyA9IHt9XG5cbiAgICBpZiAodHlwZW9mIGF0dHJzID09PSAnc3RyaW5nJylcbiAgICAgICAgdGhpcy5hdHRycy54bWxucyA9IGF0dHJzXG4gICAgZWxzZSBpZiAoYXR0cnMpIHtcbiAgICAgICAgT2JqZWN0LmtleXMoYXR0cnMpLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgICAgICB0aGlzLmF0dHJzW2tleV0gPSBhdHRyc1trZXldXG4gICAgICAgIH0sIHRoaXMpXG4gICAgfVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsLCByZXR1cm5zIHRoZSBtYXRjaGluZyBhdHRyaWJ1dGUuXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRBdHRyID0gZnVuY3Rpb24obmFtZSwgeG1sbnMpIHtcbiAgICBpZiAoIXhtbG5zKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmF0dHJzW25hbWVdXG4gICAgfVxuXG4gICAgdmFyIG5hbWVzcGFjZXMgPSB0aGlzLmdldFhtbG5zKClcblxuICAgIGlmICghbmFtZXNwYWNlc1t4bWxuc10pIHtcbiAgICAgICAgcmV0dXJuIG51bGxcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5hdHRyc1tbbmFtZXNwYWNlc1t4bWxuc10sIG5hbWVdLmpvaW4oJzonKV1cbn1cblxuLyoqXG4gKiB4bWxucyBjYW4gYmUgbnVsbFxuICoqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuKG5hbWUsIHhtbG5zKVswXVxufVxuXG4vKipcbiAqIHhtbG5zIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbiA9IGZ1bmN0aW9uKG5hbWUsIHhtbG5zKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGNoaWxkLmdldE5hbWUgJiZcbiAgICAgICAgICAgIChjaGlsZC5nZXROYW1lKCkgPT09IG5hbWUpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZEJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSlbMF1cbn1cblxuLyoqXG4gKiB4bWxucyBhbmQgcmVjdXJzaXZlIGNhbiBiZSBudWxsXG4gKiovXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZHJlbkJ5QXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCwgeG1sbnMsIHJlY3Vyc2l2ZSkge1xuICAgIHZhciByZXN1bHQgPSBbXVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGlmIChjaGlsZC5hdHRycyAmJlxuICAgICAgICAgICAgKGNoaWxkLmF0dHJzW2F0dHJdID09PSB2YWwpICYmXG4gICAgICAgICAgICAoIXhtbG5zIHx8IChjaGlsZC5nZXROUygpID09PSB4bWxucykpKVxuICAgICAgICAgICAgcmVzdWx0LnB1c2goY2hpbGQpXG4gICAgICAgIGlmIChyZWN1cnNpdmUgJiYgY2hpbGQuZ2V0Q2hpbGRyZW5CeUF0dHIpIHtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlBdHRyKGF0dHIsIHZhbCwgeG1sbnMsIHRydWUpKVxuICAgICAgICB9XG4gICAgfVxuICAgIGlmIChyZWN1cnNpdmUpIHtcbiAgICAgICAgcmVzdWx0ID0gW10uY29uY2F0LmFwcGx5KFtdLCByZXN1bHQpXG4gICAgfVxuICAgIHJldHVybiByZXN1bHRcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRyZW5CeUZpbHRlciA9IGZ1bmN0aW9uKGZpbHRlciwgcmVjdXJzaXZlKSB7XG4gICAgdmFyIHJlc3VsdCA9IFtdXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKGZpbHRlcihjaGlsZCkpXG4gICAgICAgICAgICByZXN1bHQucHVzaChjaGlsZClcbiAgICAgICAgaWYgKHJlY3Vyc2l2ZSAmJiBjaGlsZC5nZXRDaGlsZHJlbkJ5RmlsdGVyKXtcbiAgICAgICAgICAgIHJlc3VsdC5wdXNoKGNoaWxkLmdldENoaWxkcmVuQnlGaWx0ZXIoZmlsdGVyLCB0cnVlKSlcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAocmVjdXJzaXZlKSB7XG4gICAgICAgIHJlc3VsdCA9IFtdLmNvbmNhdC5hcHBseShbXSwgcmVzdWx0KVxuICAgIH1cbiAgICByZXR1cm4gcmVzdWx0XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLmdldFRleHQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdGV4dCA9ICcnXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgaWYgKCh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB8fCAodHlwZW9mIGNoaWxkID09PSAnbnVtYmVyJykpIHtcbiAgICAgICAgICAgIHRleHQgKz0gY2hpbGRcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdGV4dFxufVxuXG5FbGVtZW50LnByb3RvdHlwZS5nZXRDaGlsZFRleHQgPSBmdW5jdGlvbihuYW1lLCB4bWxucykge1xuICAgIHZhciBjaGlsZCA9IHRoaXMuZ2V0Q2hpbGQobmFtZSwgeG1sbnMpXG4gICAgcmV0dXJuIGNoaWxkID8gY2hpbGQuZ2V0VGV4dCgpIDogbnVsbFxufVxuXG4vKipcbiAqIFJldHVybiBhbGwgZGlyZWN0IGRlc2NlbmRlbnRzIHRoYXQgYXJlIEVsZW1lbnRzLlxuICogVGhpcyBkaWZmZXJzIGZyb20gYGdldENoaWxkcmVuYCBpbiB0aGF0IGl0IHdpbGwgZXhjbHVkZSB0ZXh0IG5vZGVzLFxuICogcHJvY2Vzc2luZyBpbnN0cnVjdGlvbnMsIGV0Yy5cbiAqL1xuRWxlbWVudC5wcm90b3R5cGUuZ2V0Q2hpbGRFbGVtZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmdldENoaWxkcmVuQnlGaWx0ZXIoZnVuY3Rpb24oY2hpbGQpIHtcbiAgICAgICAgcmV0dXJuIGNoaWxkIGluc3RhbmNlb2YgRWxlbWVudFxuICAgIH0pXG59XG5cbi8qKiogQnVpbGRlciAqKiovXG5cbi8qKiByZXR1cm5zIHVwcGVybW9zdCBwYXJlbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnJvb3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50LnJvb3QoKVxuICAgIH1cbiAgICByZXR1cm4gdGhpc1xufVxuRWxlbWVudC5wcm90b3R5cGUudHJlZSA9IEVsZW1lbnQucHJvdG90eXBlLnJvb3RcblxuLyoqIGp1c3QgcGFyZW50IG9yIGl0c2VsZiAqL1xuRWxlbWVudC5wcm90b3R5cGUudXAgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5wYXJlbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMucGFyZW50XG4gICAgfVxuICAgIHJldHVybiB0aGlzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLl9nZXRFbGVtZW50ID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICB2YXIgZWxlbWVudCA9IG5ldyBFbGVtZW50KG5hbWUsIGF0dHJzKVxuICAgIHJldHVybiBlbGVtZW50XG59XG5cbi8qKiBjcmVhdGUgY2hpbGQgbm9kZSBhbmQgcmV0dXJuIGl0ICovXG5FbGVtZW50LnByb3RvdHlwZS5jID0gZnVuY3Rpb24obmFtZSwgYXR0cnMpIHtcbiAgICByZXR1cm4gdGhpcy5jbm9kZSh0aGlzLl9nZXRFbGVtZW50KG5hbWUsIGF0dHJzKSlcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuY25vZGUgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgIHRoaXMuY2hpbGRyZW4ucHVzaChjaGlsZClcbiAgICBpZiAodHlwZW9mIGNoaWxkID09PSAnb2JqZWN0Jykge1xuICAgICAgICBjaGlsZC5wYXJlbnQgPSB0aGlzXG4gICAgfVxuICAgIHJldHVybiBjaGlsZFxufVxuXG4vKiogYWRkIHRleHQgbm9kZSBhbmQgcmV0dXJuIGVsZW1lbnQgKi9cbkVsZW1lbnQucHJvdG90eXBlLnQgPSBmdW5jdGlvbih0ZXh0KSB7XG4gICAgdGhpcy5jaGlsZHJlbi5wdXNoKHRleHQpXG4gICAgcmV0dXJuIHRoaXNcbn1cblxuLyoqKiBNYW5pcHVsYXRpb24gKioqL1xuXG4vKipcbiAqIEVpdGhlcjpcbiAqICAgZWwucmVtb3ZlKGNoaWxkRWwpXG4gKiAgIGVsLnJlbW92ZSgnYXV0aG9yJywgJ3VybjouLi4nKVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5yZW1vdmUgPSBmdW5jdGlvbihlbCwgeG1sbnMpIHtcbiAgICB2YXIgZmlsdGVyXG4gICAgaWYgKHR5cGVvZiBlbCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgLyogMXN0IHBhcmFtZXRlciBpcyB0YWcgbmFtZSAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuICEoY2hpbGQuaXMgJiZcbiAgICAgICAgICAgICAgICAgY2hpbGQuaXMoZWwsIHhtbG5zKSlcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIC8qIDFzdCBwYXJhbWV0ZXIgaXMgZWxlbWVudCAqL1xuICAgICAgICBmaWx0ZXIgPSBmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICE9PSBlbFxuICAgICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5jaGlsZHJlbiA9IHRoaXMuY2hpbGRyZW4uZmlsdGVyKGZpbHRlcilcblxuICAgIHJldHVybiB0aGlzXG59XG5cbi8qKlxuICogVG8gdXNlIGluIGNhc2UgeW91IHdhbnQgdGhlIHNhbWUgWE1MIGRhdGEgZm9yIHNlcGFyYXRlIHVzZXMuXG4gKiBQbGVhc2UgcmVmcmFpbiBmcm9tIHRoaXMgcHJhY3Rpc2UgdW5sZXNzIHlvdSBrbm93IHdoYXQgeW91IGFyZVxuICogZG9pbmcuIEJ1aWxkaW5nIFhNTCB3aXRoIGx0eCBpcyBlYXN5IVxuICovXG5FbGVtZW50LnByb3RvdHlwZS5jbG9uZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBjbG9uZSA9IHRoaXMuX2dldEVsZW1lbnQodGhpcy5uYW1lLCB0aGlzLmF0dHJzKVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5jaGlsZHJlbi5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgY2hpbGQgPSB0aGlzLmNoaWxkcmVuW2ldXG4gICAgICAgIGNsb25lLmNub2RlKGNoaWxkLmNsb25lID8gY2hpbGQuY2xvbmUoKSA6IGNoaWxkKVxuICAgIH1cbiAgICByZXR1cm4gY2xvbmVcbn1cblxuRWxlbWVudC5wcm90b3R5cGUudGV4dCA9IGZ1bmN0aW9uKHZhbCkge1xuICAgIGlmICh2YWwgJiYgdGhpcy5jaGlsZHJlbi5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgdGhpcy5jaGlsZHJlblswXSA9IHZhbFxuICAgICAgICByZXR1cm4gdGhpc1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5nZXRUZXh0KClcbn1cblxuRWxlbWVudC5wcm90b3R5cGUuYXR0ciA9IGZ1bmN0aW9uKGF0dHIsIHZhbCkge1xuICAgIGlmICgoKHR5cGVvZiB2YWwgIT09ICd1bmRlZmluZWQnKSB8fCAodmFsID09PSBudWxsKSkpIHtcbiAgICAgICAgaWYgKCF0aGlzLmF0dHJzKSB7XG4gICAgICAgICAgICB0aGlzLmF0dHJzID0ge31cbiAgICAgICAgfVxuICAgICAgICB0aGlzLmF0dHJzW2F0dHJdID0gdmFsXG4gICAgICAgIHJldHVybiB0aGlzXG4gICAgfVxuICAgIHJldHVybiB0aGlzLmF0dHJzW2F0dHJdXG59XG5cbi8qKiogU2VyaWFsaXphdGlvbiAqKiovXG5cbkVsZW1lbnQucHJvdG90eXBlLnRvU3RyaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHMgPSAnJ1xuICAgIHRoaXMud3JpdGUoZnVuY3Rpb24oYykge1xuICAgICAgICBzICs9IGNcbiAgICB9KVxuICAgIHJldHVybiBzXG59XG5cbkVsZW1lbnQucHJvdG90eXBlLnRvSlNPTiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIG5hbWU6IHRoaXMubmFtZSxcbiAgICAgICAgYXR0cnM6IHRoaXMuYXR0cnMsXG4gICAgICAgIGNoaWxkcmVuOiB0aGlzLmNoaWxkcmVuLm1hcChmdW5jdGlvbihjaGlsZCkge1xuICAgICAgICAgICAgcmV0dXJuIGNoaWxkICYmIGNoaWxkLnRvSlNPTiA/IGNoaWxkLnRvSlNPTigpIDogY2hpbGRcbiAgICAgICAgfSlcbiAgICB9XG59XG5cbkVsZW1lbnQucHJvdG90eXBlLl9hZGRDaGlsZHJlbiA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPicpXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmNoaWxkcmVuLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgIHZhciBjaGlsZCA9IHRoaXMuY2hpbGRyZW5baV1cbiAgICAgICAgLyogU2tpcCBudWxsL3VuZGVmaW5lZCAqL1xuICAgICAgICBpZiAoY2hpbGQgfHwgKGNoaWxkID09PSAwKSkge1xuICAgICAgICAgICAgaWYgKGNoaWxkLndyaXRlKSB7XG4gICAgICAgICAgICAgICAgY2hpbGQud3JpdGUod3JpdGVyKVxuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgY2hpbGQgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgd3JpdGVyKGVzY2FwZVhtbFRleHQoY2hpbGQpKVxuICAgICAgICAgICAgfSBlbHNlIGlmIChjaGlsZC50b1N0cmluZykge1xuICAgICAgICAgICAgICAgIHdyaXRlcihlc2NhcGVYbWxUZXh0KGNoaWxkLnRvU3RyaW5nKDEwKSkpXG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgd3JpdGVyKCc8LycpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICB3cml0ZXIoJz4nKVxufVxuXG5FbGVtZW50LnByb3RvdHlwZS53cml0ZSA9IGZ1bmN0aW9uKHdyaXRlcikge1xuICAgIHdyaXRlcignPCcpXG4gICAgd3JpdGVyKHRoaXMubmFtZSlcbiAgICBmb3IgKHZhciBrIGluIHRoaXMuYXR0cnMpIHtcbiAgICAgICAgdmFyIHYgPSB0aGlzLmF0dHJzW2tdXG4gICAgICAgIGlmICh2IHx8ICh2ID09PSAnJykgfHwgKHYgPT09IDApKSB7XG4gICAgICAgICAgICB3cml0ZXIoJyAnKVxuICAgICAgICAgICAgd3JpdGVyKGspXG4gICAgICAgICAgICB3cml0ZXIoJz1cIicpXG4gICAgICAgICAgICBpZiAodHlwZW9mIHYgIT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgdiA9IHYudG9TdHJpbmcoMTApXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICB3cml0ZXIoZXNjYXBlWG1sKHYpKVxuICAgICAgICAgICAgd3JpdGVyKCdcIicpXG4gICAgICAgIH1cbiAgICB9XG4gICAgaWYgKHRoaXMuY2hpbGRyZW4ubGVuZ3RoID09PSAwKSB7XG4gICAgICAgIHdyaXRlcignLz4nKVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuX2FkZENoaWxkcmVuKHdyaXRlcilcbiAgICB9XG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbChzKSB7XG4gICAgcmV0dXJuIHMuXG4gICAgICAgIHJlcGxhY2UoL1xcJi9nLCAnJmFtcDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPC9nLCAnJmx0OycpLlxuICAgICAgICByZXBsYWNlKC8+L2csICcmZ3Q7JykuXG4gICAgICAgIHJlcGxhY2UoL1wiL2csICcmcXVvdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvXCIvZywgJyZhcG9zOycpXG59XG5cbmZ1bmN0aW9uIGVzY2FwZVhtbFRleHQocykge1xuICAgIHJldHVybiBzLlxuICAgICAgICByZXBsYWNlKC9cXCYvZywgJyZhbXA7JykuXG4gICAgICAgIHJlcGxhY2UoLzwvZywgJyZsdDsnKS5cbiAgICAgICAgcmVwbGFjZSgvPi9nLCAnJmd0OycpXG59XG5cbmV4cG9ydHMuRWxlbWVudCA9IEVsZW1lbnRcbmV4cG9ydHMuZXNjYXBlWG1sID0gZXNjYXBlWG1sXG4iLCJhcmd1bWVudHNbNF1bMjRdWzBdLmFwcGx5KGV4cG9ydHMsYXJndW1lbnRzKSIsImFyZ3VtZW50c1s0XVsyNV1bMF0uYXBwbHkoZXhwb3J0cyxhcmd1bWVudHMpIiwiYXJndW1lbnRzWzRdWzI2XVswXS5hcHBseShleHBvcnRzLGFyZ3VtZW50cykiLCIoZnVuY3Rpb24gKHByb2Nlc3Mpe1xuJ3VzZSBzdHJpY3QnO1xuXG52YXIgbG9nID0gcmVxdWlyZSgnZGVidWcnKSgnbm9kZS1zdHJpbmdwcmVwJylcblxuLy8gZnJvbSB1bmljb2RlL3VpZG5hLmhcbnZhciBVSUROQV9BTExPV19VTkFTU0lHTkVEID0gMVxudmFyIFVJRE5BX1VTRV9TVEQzX1JVTEVTID0gMlxuXG50cnkge1xuICAgIHZhciBiaW5kaW5ncyA9IHJlcXVpcmUoJ2JpbmRpbmdzJykoJ25vZGVfc3RyaW5ncHJlcC5ub2RlJylcbn0gY2F0Y2ggKGV4KSB7XG4gICAgaWYgKHByb2Nlc3MudGl0bGUgIT09ICdicm93c2VyJykge1xuICAgICAgICBjb25zb2xlLmxvZyhcbiAgICAgICAgICAgICdDYW5ub3QgbG9hZCBTdHJpbmdQcmVwLScgK1xuICAgICAgICAgICAgcmVxdWlyZSgnLi9wYWNrYWdlLmpzb24nKS52ZXJzaW9uICtcbiAgICAgICAgICAgICcgYmluZGluZ3MgKHVzaW5nIGZhbGxiYWNrKS4gWW91IG1heSBuZWVkIHRvICcgK1xuICAgICAgICAgICAgJ2BucG0gaW5zdGFsbCBub2RlLXN0cmluZ3ByZXBgJ1xuICAgICAgICApXG4gICAgICAgIGxvZyhleClcbiAgICB9XG59XG5cbnZhciB0b1VuaWNvZGUgPSBmdW5jdGlvbih2YWx1ZSwgb3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9XG4gICAgdHJ5IHtcbiAgICAgICAgcmV0dXJuIGJpbmRpbmdzLnRvVW5pY29kZSh2YWx1ZSxcbiAgICAgICAgICAgIChvcHRpb25zLmFsbG93VW5hc3NpZ25lZCAmJiBVSUROQV9BTExPV19VTkFTU0lHTkVEKSB8IDApXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICByZXR1cm4gdmFsdWVcbiAgICB9XG59XG5cbnZhciB0b0FTQ0lJID0gZnVuY3Rpb24odmFsdWUsIG9wdGlvbnMpIHtcbiAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fVxuICAgIHRyeSB7XG4gICAgICAgIHJldHVybiBiaW5kaW5ncy50b0FTQ0lJKHZhbHVlLFxuICAgICAgICAgICAgKG9wdGlvbnMuYWxsb3dVbmFzc2lnbmVkICYmIFVJRE5BX0FMTE9XX1VOQVNTSUdORUQpIHxcbiAgICAgICAgICAgIChvcHRpb25zLnVzZVNURDNSdWxlcyAmJiBVSUROQV9VU0VfU1REM19SVUxFUykpXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICBpZiAob3B0aW9ucy50aHJvd0lmRXJyb3IpIHtcbiAgICAgICAgICAgIHRocm93IGVcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVxuICAgICAgICB9XG4gICAgfVxufVxuXG52YXIgU3RyaW5nUHJlcCA9IGZ1bmN0aW9uKG9wZXJhdGlvbikge1xuICAgIHRoaXMub3BlcmF0aW9uID0gb3BlcmF0aW9uXG4gICAgdHJ5IHtcbiAgICAgICAgdGhpcy5zdHJpbmdQcmVwID0gbmV3IGJpbmRpbmdzLlN0cmluZ1ByZXAodGhpcy5vcGVyYXRpb24pXG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aGlzLnN0cmluZ1ByZXAgPSBudWxsXG4gICAgICAgIGxvZygnT3BlcmF0aW9uIGRvZXMgbm90IGV4aXN0Jywgb3BlcmF0aW9uLCBlKVxuICAgIH1cbn1cblxuU3RyaW5nUHJlcC5wcm90b3R5cGUuVU5LTk9XTl9QUk9GSUxFX1RZUEUgPSAnVW5rbm93biBwcm9maWxlIHR5cGUnXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5VTkhBTkRMRURfRkFMTEJBQ0sgPSAnVW5oYW5kbGVkIEpTIGZhbGxiYWNrJ1xuU3RyaW5nUHJlcC5wcm90b3R5cGUuTElCSUNVX05PVF9BVkFJTEFCTEUgPSAnbGliaWN1IHVuYXZhaWxhYmxlJ1xuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS51c2VKc0ZhbGxiYWNrcyA9IHRydWVcblxuU3RyaW5nUHJlcC5wcm90b3R5cGUucHJlcGFyZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgdGhpcy52YWx1ZSA9IHZhbHVlXG4gICAgdHJ5IHtcbiAgICAgICAgaWYgKHRoaXMuc3RyaW5nUHJlcCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuc3RyaW5nUHJlcC5wcmVwYXJlKHRoaXMudmFsdWUpXG4gICAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7fVxuICAgIGlmIChmYWxzZSA9PT0gdGhpcy51c2VKc0ZhbGxiYWNrcykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5MSUJJQ1VfTk9UX0FWQUlMQUJMRSlcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuanNGYWxsYmFjaygpXG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmlzTmF0aXZlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIChudWxsICE9PSB0aGlzLnN0cmluZ1ByZXApXG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmpzRmFsbGJhY2sgPSBmdW5jdGlvbigpIHtcbiAgICBzd2l0Y2ggKHRoaXMub3BlcmF0aW9uKSB7XG4gICAgICAgIGNhc2UgJ25hbWVwcmVwJzpcbiAgICAgICAgY2FzZSAnbm9kZXByZXAnOlxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFsdWUudG9Mb3dlckNhc2UoKVxuICAgICAgICBjYXNlICdyZXNvdXJjZXByZXAnOlxuICAgICAgICAgICAgcmV0dXJuIHRoaXMudmFsdWVcbiAgICAgICAgY2FzZSAnbmZzNF9jc19wcmVwJzpcbiAgICAgICAgY2FzZSAnbmZzNF9jaXNfcHJlcCc6XG4gICAgICAgIGNhc2UgJ25mczRfbWl4ZWRfcHJlcCBwcmVmaXgnOlxuICAgICAgICBjYXNlICduZnM0X21peGVkX3ByZXAgc3VmZml4JzpcbiAgICAgICAgY2FzZSAnaXNjc2knOlxuICAgICAgICBjYXNlICdtaWInOlxuICAgICAgICBjYXNlICdzYXNscHJlcCc6XG4gICAgICAgIGNhc2UgJ3RyYWNlJzpcbiAgICAgICAgY2FzZSAnbGRhcCc6XG4gICAgICAgIGNhc2UgJ2xkYXBjaSc6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5VTkhBTkRMRURfRkFMTEJBQ0spXG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IodGhpcy5VTktOT1dOX1BST0ZJTEVfVFlQRSlcbiAgICB9XG59XG5cblN0cmluZ1ByZXAucHJvdG90eXBlLmRpc2FibGVKc0ZhbGxiYWNrcyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMudXNlSnNGYWxsYmFja3MgPSBmYWxzZVxufVxuXG5TdHJpbmdQcmVwLnByb3RvdHlwZS5lbmFibGVKc0ZhbGxiYWNrcyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMudXNlSnNGYWxsYmFja3MgPSB0cnVlXG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICAgIHRvVW5pY29kZTogdG9Vbmljb2RlLFxuICAgIHRvQVNDSUk6IHRvQVNDSUksXG4gICAgU3RyaW5nUHJlcDogU3RyaW5nUHJlcFxufVxuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiLCIoZnVuY3Rpb24gKHByb2Nlc3MsX19maWxlbmFtZSl7XG5cbi8qKlxuICogTW9kdWxlIGRlcGVuZGVuY2llcy5cbiAqL1xuXG52YXIgZnMgPSByZXF1aXJlKCdmcycpXG4gICwgcGF0aCA9IHJlcXVpcmUoJ3BhdGgnKVxuICAsIGpvaW4gPSBwYXRoLmpvaW5cbiAgLCBkaXJuYW1lID0gcGF0aC5kaXJuYW1lXG4gICwgZXhpc3RzID0gZnMuZXhpc3RzU3luYyB8fCBwYXRoLmV4aXN0c1N5bmNcbiAgLCBkZWZhdWx0cyA9IHtcbiAgICAgICAgYXJyb3c6IHByb2Nlc3MuZW52Lk5PREVfQklORElOR1NfQVJST1cgfHwgJyDihpIgJ1xuICAgICAgLCBjb21waWxlZDogcHJvY2Vzcy5lbnYuTk9ERV9CSU5ESU5HU19DT01QSUxFRF9ESVIgfHwgJ2NvbXBpbGVkJ1xuICAgICAgLCBwbGF0Zm9ybTogcHJvY2Vzcy5wbGF0Zm9ybVxuICAgICAgLCBhcmNoOiBwcm9jZXNzLmFyY2hcbiAgICAgICwgdmVyc2lvbjogcHJvY2Vzcy52ZXJzaW9ucy5ub2RlXG4gICAgICAsIGJpbmRpbmdzOiAnYmluZGluZ3Mubm9kZSdcbiAgICAgICwgdHJ5OiBbXG4gICAgICAgICAgLy8gbm9kZS1neXAncyBsaW5rZWQgdmVyc2lvbiBpbiB0aGUgXCJidWlsZFwiIGRpclxuICAgICAgICAgIFsgJ21vZHVsZV9yb290JywgJ2J1aWxkJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gbm9kZS13YWYgYW5kIGd5cF9hZGRvbiAoYS5rLmEgbm9kZS1neXApXG4gICAgICAgICwgWyAnbW9kdWxlX3Jvb3QnLCAnYnVpbGQnLCAnRGVidWcnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdidWlsZCcsICdSZWxlYXNlJywgJ2JpbmRpbmdzJyBdXG4gICAgICAgICAgLy8gRGVidWcgZmlsZXMsIGZvciBkZXZlbG9wbWVudCAobGVnYWN5IGJlaGF2aW9yLCByZW1vdmUgZm9yIG5vZGUgdjAuOSlcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdvdXQnLCAnRGVidWcnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdEZWJ1ZycsICdiaW5kaW5ncycgXVxuICAgICAgICAgIC8vIFJlbGVhc2UgZmlsZXMsIGJ1dCBtYW51YWxseSBjb21waWxlZCAobGVnYWN5IGJlaGF2aW9yLCByZW1vdmUgZm9yIG5vZGUgdjAuOSlcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdvdXQnLCAnUmVsZWFzZScsICdiaW5kaW5ncycgXVxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ1JlbGVhc2UnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBMZWdhY3kgZnJvbSBub2RlLXdhZiwgbm9kZSA8PSAwLjQueFxuICAgICAgICAsIFsgJ21vZHVsZV9yb290JywgJ2J1aWxkJywgJ2RlZmF1bHQnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgICAvLyBQcm9kdWN0aW9uIFwiUmVsZWFzZVwiIGJ1aWxkdHlwZSBiaW5hcnkgKG1laC4uLilcbiAgICAgICAgLCBbICdtb2R1bGVfcm9vdCcsICdjb21waWxlZCcsICd2ZXJzaW9uJywgJ3BsYXRmb3JtJywgJ2FyY2gnLCAnYmluZGluZ3MnIF1cbiAgICAgICAgXVxuICAgIH1cblxuLyoqXG4gKiBUaGUgbWFpbiBgYmluZGluZ3MoKWAgZnVuY3Rpb24gbG9hZHMgdGhlIGNvbXBpbGVkIGJpbmRpbmdzIGZvciBhIGdpdmVuIG1vZHVsZS5cbiAqIEl0IHVzZXMgVjgncyBFcnJvciBBUEkgdG8gZGV0ZXJtaW5lIHRoZSBwYXJlbnQgZmlsZW5hbWUgdGhhdCB0aGlzIGZ1bmN0aW9uIGlzXG4gKiBiZWluZyBpbnZva2VkIGZyb20sIHdoaWNoIGlzIHRoZW4gdXNlZCB0byBmaW5kIHRoZSByb290IGRpcmVjdG9yeS5cbiAqL1xuXG5mdW5jdGlvbiBiaW5kaW5ncyAob3B0cykge1xuXG4gIC8vIEFyZ3VtZW50IHN1cmdlcnlcbiAgaWYgKHR5cGVvZiBvcHRzID09ICdzdHJpbmcnKSB7XG4gICAgb3B0cyA9IHsgYmluZGluZ3M6IG9wdHMgfVxuICB9IGVsc2UgaWYgKCFvcHRzKSB7XG4gICAgb3B0cyA9IHt9XG4gIH1cbiAgb3B0cy5fX3Byb3RvX18gPSBkZWZhdWx0c1xuXG4gIC8vIEdldCB0aGUgbW9kdWxlIHJvb3RcbiAgaWYgKCFvcHRzLm1vZHVsZV9yb290KSB7XG4gICAgb3B0cy5tb2R1bGVfcm9vdCA9IGV4cG9ydHMuZ2V0Um9vdChleHBvcnRzLmdldEZpbGVOYW1lKCkpXG4gIH1cblxuICAvLyBFbnN1cmUgdGhlIGdpdmVuIGJpbmRpbmdzIG5hbWUgZW5kcyB3aXRoIC5ub2RlXG4gIGlmIChwYXRoLmV4dG5hbWUob3B0cy5iaW5kaW5ncykgIT0gJy5ub2RlJykge1xuICAgIG9wdHMuYmluZGluZ3MgKz0gJy5ub2RlJ1xuICB9XG5cbiAgdmFyIHRyaWVzID0gW11cbiAgICAsIGkgPSAwXG4gICAgLCBsID0gb3B0cy50cnkubGVuZ3RoXG4gICAgLCBuXG4gICAgLCBiXG4gICAgLCBlcnJcblxuICBmb3IgKDsgaTxsOyBpKyspIHtcbiAgICBuID0gam9pbi5hcHBseShudWxsLCBvcHRzLnRyeVtpXS5tYXAoZnVuY3Rpb24gKHApIHtcbiAgICAgIHJldHVybiBvcHRzW3BdIHx8IHBcbiAgICB9KSlcbiAgICB0cmllcy5wdXNoKG4pXG4gICAgdHJ5IHtcbiAgICAgIGIgPSBvcHRzLnBhdGggPyByZXF1aXJlLnJlc29sdmUobikgOiByZXF1aXJlKG4pXG4gICAgICBpZiAoIW9wdHMucGF0aCkge1xuICAgICAgICBiLnBhdGggPSBuXG4gICAgICB9XG4gICAgICByZXR1cm4gYlxuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICghL25vdCBmaW5kL2kudGVzdChlLm1lc3NhZ2UpKSB7XG4gICAgICAgIHRocm93IGVcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBlcnIgPSBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBsb2NhdGUgdGhlIGJpbmRpbmdzIGZpbGUuIFRyaWVkOlxcbidcbiAgICArIHRyaWVzLm1hcChmdW5jdGlvbiAoYSkgeyByZXR1cm4gb3B0cy5hcnJvdyArIGEgfSkuam9pbignXFxuJykpXG4gIGVyci50cmllcyA9IHRyaWVzXG4gIHRocm93IGVyclxufVxubW9kdWxlLmV4cG9ydHMgPSBleHBvcnRzID0gYmluZGluZ3NcblxuXG4vKipcbiAqIEdldHMgdGhlIGZpbGVuYW1lIG9mIHRoZSBKYXZhU2NyaXB0IGZpbGUgdGhhdCBpbnZva2VzIHRoaXMgZnVuY3Rpb24uXG4gKiBVc2VkIHRvIGhlbHAgZmluZCB0aGUgcm9vdCBkaXJlY3Rvcnkgb2YgYSBtb2R1bGUuXG4gKiBPcHRpb25hbGx5IGFjY2VwdHMgYW4gZmlsZW5hbWUgYXJndW1lbnQgdG8gc2tpcCB3aGVuIHNlYXJjaGluZyBmb3IgdGhlIGludm9raW5nIGZpbGVuYW1lXG4gKi9cblxuZXhwb3J0cy5nZXRGaWxlTmFtZSA9IGZ1bmN0aW9uIGdldEZpbGVOYW1lIChjYWxsaW5nX2ZpbGUpIHtcbiAgdmFyIG9yaWdQU1QgPSBFcnJvci5wcmVwYXJlU3RhY2tUcmFjZVxuICAgICwgb3JpZ1NUTCA9IEVycm9yLnN0YWNrVHJhY2VMaW1pdFxuICAgICwgZHVtbXkgPSB7fVxuICAgICwgZmlsZU5hbWVcblxuICBFcnJvci5zdGFja1RyYWNlTGltaXQgPSAxMFxuXG4gIEVycm9yLnByZXBhcmVTdGFja1RyYWNlID0gZnVuY3Rpb24gKGUsIHN0KSB7XG4gICAgZm9yICh2YXIgaT0wLCBsPXN0Lmxlbmd0aDsgaTxsOyBpKyspIHtcbiAgICAgIGZpbGVOYW1lID0gc3RbaV0uZ2V0RmlsZU5hbWUoKVxuICAgICAgaWYgKGZpbGVOYW1lICE9PSBfX2ZpbGVuYW1lKSB7XG4gICAgICAgIGlmIChjYWxsaW5nX2ZpbGUpIHtcbiAgICAgICAgICAgIGlmIChmaWxlTmFtZSAhPT0gY2FsbGluZ19maWxlKSB7XG4gICAgICAgICAgICAgIHJldHVyblxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gcnVuIHRoZSAncHJlcGFyZVN0YWNrVHJhY2UnIGZ1bmN0aW9uIGFib3ZlXG4gIEVycm9yLmNhcHR1cmVTdGFja1RyYWNlKGR1bW15KVxuICBkdW1teS5zdGFja1xuXG4gIC8vIGNsZWFudXBcbiAgRXJyb3IucHJlcGFyZVN0YWNrVHJhY2UgPSBvcmlnUFNUXG4gIEVycm9yLnN0YWNrVHJhY2VMaW1pdCA9IG9yaWdTVExcblxuICByZXR1cm4gZmlsZU5hbWVcbn1cblxuLyoqXG4gKiBHZXRzIHRoZSByb290IGRpcmVjdG9yeSBvZiBhIG1vZHVsZSwgZ2l2ZW4gYW4gYXJiaXRyYXJ5IGZpbGVuYW1lXG4gKiBzb21ld2hlcmUgaW4gdGhlIG1vZHVsZSB0cmVlLiBUaGUgXCJyb290IGRpcmVjdG9yeVwiIGlzIHRoZSBkaXJlY3RvcnlcbiAqIGNvbnRhaW5pbmcgdGhlIGBwYWNrYWdlLmpzb25gIGZpbGUuXG4gKlxuICogICBJbjogIC9ob21lL25hdGUvbm9kZS1uYXRpdmUtbW9kdWxlL2xpYi9pbmRleC5qc1xuICogICBPdXQ6IC9ob21lL25hdGUvbm9kZS1uYXRpdmUtbW9kdWxlXG4gKi9cblxuZXhwb3J0cy5nZXRSb290ID0gZnVuY3Rpb24gZ2V0Um9vdCAoZmlsZSkge1xuICB2YXIgZGlyID0gZGlybmFtZShmaWxlKVxuICAgICwgcHJldlxuICB3aGlsZSAodHJ1ZSkge1xuICAgIGlmIChkaXIgPT09ICcuJykge1xuICAgICAgLy8gQXZvaWRzIGFuIGluZmluaXRlIGxvb3AgaW4gcmFyZSBjYXNlcywgbGlrZSB0aGUgUkVQTFxuICAgICAgZGlyID0gcHJvY2Vzcy5jd2QoKVxuICAgIH1cbiAgICBpZiAoZXhpc3RzKGpvaW4oZGlyLCAncGFja2FnZS5qc29uJykpIHx8IGV4aXN0cyhqb2luKGRpciwgJ25vZGVfbW9kdWxlcycpKSkge1xuICAgICAgLy8gRm91bmQgdGhlICdwYWNrYWdlLmpzb24nIGZpbGUgb3IgJ25vZGVfbW9kdWxlcycgZGlyOyB3ZSdyZSBkb25lXG4gICAgICByZXR1cm4gZGlyXG4gICAgfVxuICAgIGlmIChwcmV2ID09PSBkaXIpIHtcbiAgICAgIC8vIEdvdCB0byB0aGUgdG9wXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCBmaW5kIG1vZHVsZSByb290IGdpdmVuIGZpbGU6IFwiJyArIGZpbGVcbiAgICAgICAgICAgICAgICAgICAgKyAnXCIuIERvIHlvdSBoYXZlIGEgYHBhY2thZ2UuanNvbmAgZmlsZT8gJylcbiAgICB9XG4gICAgLy8gVHJ5IHRoZSBwYXJlbnQgZGlyIG5leHRcbiAgICBwcmV2ID0gZGlyXG4gICAgZGlyID0gam9pbihkaXIsICcuLicpXG4gIH1cbn1cblxufSkuY2FsbCh0aGlzLHJlcXVpcmUoXCIxWWlaNVNcIiksXCIvLi4vbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jbGllbnQvbm9kZV9tb2R1bGVzL25vZGUteG1wcC1jb3JlL25vZGVfbW9kdWxlcy9ub2RlLXN0cmluZ3ByZXAvbm9kZV9tb2R1bGVzL2JpbmRpbmdzL2JpbmRpbmdzLmpzXCIpIiwibW9kdWxlLmV4cG9ydHM9e1xuICBcIm5hbWVcIjogXCJub2RlLXN0cmluZ3ByZXBcIixcbiAgXCJ2ZXJzaW9uXCI6IFwiMC43LjBcIixcbiAgXCJtYWluXCI6IFwiaW5kZXguanNcIixcbiAgXCJkZXNjcmlwdGlvblwiOiBcIklDVSBTdHJpbmdQcmVwIHByb2ZpbGVzXCIsXG4gIFwia2V5d29yZHNcIjogW1xuICAgIFwidW5pY29kZVwiLFxuICAgIFwic3RyaW5ncHJlcFwiLFxuICAgIFwiaWN1XCJcbiAgXSxcbiAgXCJzY3JpcHRzXCI6IHtcbiAgICBcInRlc3RcIjogXCJncnVudCB0ZXN0XCIsXG4gICAgXCJpbnN0YWxsXCI6IFwibm9kZS1neXAgcmVidWlsZFwiXG4gIH0sXG4gIFwiZGVwZW5kZW5jaWVzXCI6IHtcbiAgICBcImJpbmRpbmdzXCI6IFwiXjEuMi4xXCIsXG4gICAgXCJkZWJ1Z1wiOiBcIn4yLjAuMFwiLFxuICAgIFwibmFuXCI6IFwiXjEuNS4xXCJcbiAgfSxcbiAgXCJkZXZEZXBlbmRlbmNpZXNcIjoge1xuICAgIFwiZ3J1bnRcIjogXCJ+MC40LjJcIixcbiAgICBcImdydW50LWNsaVwiOiBcIl4wLjEuMTNcIixcbiAgICBcImdydW50LWNvbnRyaWItanNoaW50XCI6IFwifjAuNy4yXCIsXG4gICAgXCJncnVudC1tb2NoYS1jbGlcIjogXCJ+MS4zLjBcIixcbiAgICBcInByb3h5cXVpcmVcIjogXCJ+MC41LjJcIixcbiAgICBcInNob3VsZFwiOiBcIn4yLjEuMVwiXG4gIH0sXG4gIFwicmVwb3NpdG9yeVwiOiB7XG4gICAgXCJ0eXBlXCI6IFwiZ2l0XCIsXG4gICAgXCJwYXRoXCI6IFwiZ2l0Oi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwLmdpdFwiXG4gIH0sXG4gIFwiaG9tZXBhZ2VcIjogXCJodHRwOi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwXCIsXG4gIFwiYnVnc1wiOiB7XG4gICAgXCJ1cmxcIjogXCJodHRwOi8vZ2l0aHViLmNvbS9ub2RlLXhtcHAvbm9kZS1zdHJpbmdwcmVwL2lzc3Vlc1wiXG4gIH0sXG4gIFwiYXV0aG9yXCI6IHtcbiAgICBcIm5hbWVcIjogXCJMbG95ZCBXYXRraW5cIixcbiAgICBcImVtYWlsXCI6IFwibGxveWRAZXZpbHByb2Zlc3Nvci5jby51a1wiLFxuICAgIFwidXJsXCI6IFwiaHR0cDovL2V2aWxwcm9mZXNzb3IuY28udWtcIlxuICB9LFxuICBcImxpY2Vuc2VzXCI6IFtcbiAgICB7XG4gICAgICBcInR5cGVcIjogXCJNSVRcIlxuICAgIH1cbiAgXSxcbiAgXCJlbmdpbmVzXCI6IHtcbiAgICBcIm5vZGVcIjogXCI+PTAuOFwiXG4gIH0sXG4gIFwiZ3lwZmlsZVwiOiB0cnVlLFxuICBcImdpdEhlYWRcIjogXCJkZTNiNDVlYzIxNWU1OTIzMzFiOWI4MGMwNTNiMzMyMjY1NjkwN2E0XCIsXG4gIFwiX2lkXCI6IFwibm9kZS1zdHJpbmdwcmVwQDAuNy4wXCIsXG4gIFwiX3NoYXN1bVwiOiBcImM4YThkZWFjOTIxN2RiOTdlZjNlYjIwZGZhODE3ZDdlNzE2ZjU2YjVcIixcbiAgXCJfZnJvbVwiOiBcIm5vZGUtc3RyaW5ncHJlcEBeMC43LjBcIixcbiAgXCJfbnBtVmVyc2lvblwiOiBcIjIuMi4wXCIsXG4gIFwiX25vZGVWZXJzaW9uXCI6IFwiMS4wLjNcIixcbiAgXCJfbnBtVXNlclwiOiB7XG4gICAgXCJuYW1lXCI6IFwibGxveWR3YXRraW5cIixcbiAgICBcImVtYWlsXCI6IFwibGxveWRAZXZpbHByb2Zlc3Nvci5jby51a1wiXG4gIH0sXG4gIFwibWFpbnRhaW5lcnNcIjogW1xuICAgIHtcbiAgICAgIFwibmFtZVwiOiBcImFzdHJvXCIsXG4gICAgICBcImVtYWlsXCI6IFwiYXN0cm9Ac3BhY2Vib3l6Lm5ldFwiXG4gICAgfSxcbiAgICB7XG4gICAgICBcIm5hbWVcIjogXCJsbG95ZHdhdGtpblwiLFxuICAgICAgXCJlbWFpbFwiOiBcImxsb3lkQGV2aWxwcm9mZXNzb3IuY28udWtcIlxuICAgIH1cbiAgXSxcbiAgXCJkaXN0XCI6IHtcbiAgICBcInNoYXN1bVwiOiBcImM4YThkZWFjOTIxN2RiOTdlZjNlYjIwZGZhODE3ZDdlNzE2ZjU2YjVcIixcbiAgICBcInRhcmJhbGxcIjogXCJodHRwOi8vcmVnaXN0cnkubnBtanMub3JnL25vZGUtc3RyaW5ncHJlcC8tL25vZGUtc3RyaW5ncHJlcC0wLjcuMC50Z3pcIlxuICB9LFxuICBcImRpcmVjdG9yaWVzXCI6IHt9LFxuICBcIl9yZXNvbHZlZFwiOiBcImh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnL25vZGUtc3RyaW5ncHJlcC8tL25vZGUtc3RyaW5ncHJlcC0wLjcuMC50Z3pcIlxufVxuIiwidmFyIEV2ZW50RW1pdHRlciA9IHJlcXVpcmUoJ2V2ZW50cycpLkV2ZW50RW1pdHRlclxudmFyIGJhY2tvZmYgPSByZXF1aXJlKCdiYWNrb2ZmJylcbnZhciBub29wID0gZnVuY3Rpb24gKCkge31cblxubW9kdWxlLmV4cG9ydHMgPVxuZnVuY3Rpb24gKGNyZWF0ZUNvbm5lY3Rpb24pIHtcbiAgcmV0dXJuIGZ1bmN0aW9uIChvcHRzLCBvbkNvbm5lY3QpIHtcbiAgICBvbkNvbm5lY3QgPSAnZnVuY3Rpb24nID09IHR5cGVvZiBvcHRzID8gb3B0cyA6IG9uQ29ubmVjdFxuICAgIG9wdHMgPSAnb2JqZWN0JyA9PSB0eXBlb2Ygb3B0cyA/IG9wdHMgOiB7aW5pdGlhbERlbGF5OiAxZTMsIG1heERlbGF5OiAzMGUzfVxuICAgIGlmKCFvbkNvbm5lY3QpXG4gICAgICBvbkNvbm5lY3QgPSBvcHRzLm9uQ29ubmVjdFxuXG4gICAgdmFyIGVtaXR0ZXIgPSBvcHRzLmVtaXR0ZXIgfHwgbmV3IEV2ZW50RW1pdHRlcigpXG4gICAgZW1pdHRlci5jb25uZWN0ZWQgPSBmYWxzZVxuICAgIGVtaXR0ZXIucmVjb25uZWN0ID0gdHJ1ZVxuXG4gICAgaWYob25Db25uZWN0KVxuICAgICAgZW1pdHRlci5vbignY29ubmVjdCcsIG9uQ29ubmVjdClcblxuICAgIHZhciBiYWNrb2ZmTWV0aG9kID0gKGJhY2tvZmZbb3B0cy50eXBlXSB8fCBiYWNrb2ZmLmZpYm9uYWNjaSkgKG9wdHMpXG5cbiAgICBiYWNrb2ZmTWV0aG9kLm9uKCdiYWNrb2ZmJywgZnVuY3Rpb24gKG4sIGQpIHtcbiAgICAgIGVtaXR0ZXIuZW1pdCgnYmFja29mZicsIG4sIGQpXG4gICAgfSlcblxuICAgIHZhciBhcmdzXG4gICAgdmFyIGNsZWFudXAgPSBub29wXG4gICAgYmFja29mZk1ldGhvZC5vbigncmVhZHknLCBhdHRlbXB0KVxuICAgIGZ1bmN0aW9uIGF0dGVtcHQgKG4sIGRlbGF5KSB7XG4gICAgICBpZighZW1pdHRlci5yZWNvbm5lY3QpIHJldHVyblxuXG4gICAgICBjbGVhbnVwKClcbiAgICAgIGVtaXR0ZXIuZW1pdCgncmVjb25uZWN0JywgbiwgZGVsYXkpXG4gICAgICB2YXIgY29uID0gY3JlYXRlQ29ubmVjdGlvbi5hcHBseShudWxsLCBhcmdzKVxuICAgICAgaWYgKGNvbiAhPT0gZW1pdHRlci5fY29ubmVjdGlvbilcbiAgICAgICAgZW1pdHRlci5lbWl0KCdjb25uZWN0aW9uJywgY29uKVxuICAgICAgZW1pdHRlci5fY29ubmVjdGlvbiA9IGNvblxuXG4gICAgICBjbGVhbnVwID0gb25DbGVhbnVwXG4gICAgICBmdW5jdGlvbiBvbkNsZWFudXAoZXJyKSB7XG4gICAgICAgIGNsZWFudXAgPSBub29wXG4gICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignY29ubmVjdCcsIGNvbm5lY3QpXG4gICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignZXJyb3InLCBvbkRpc2Nvbm5lY3QpXG4gICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignY2xvc2UnLCBvbkRpc2Nvbm5lY3QpXG4gICAgICAgIGNvbi5yZW1vdmVMaXN0ZW5lcignZW5kJyAgLCBvbkRpc2Nvbm5lY3QpXG5cbiAgICAgICAgLy9oYWNrIHRvIG1ha2UgaHR0cCBub3QgY3Jhc2guXG4gICAgICAgIC8vSFRUUCBJUyBUSEUgV09SU1QgUFJPVE9DT0wuXG4gICAgICAgIGlmKGNvbi5jb25zdHJ1Y3Rvci5uYW1lID09ICdSZXF1ZXN0JylcbiAgICAgICAgICBjb24ub24oJ2Vycm9yJywgbm9vcClcblxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBvbkRpc2Nvbm5lY3QgKGVycikge1xuICAgICAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IGZhbHNlXG4gICAgICAgIG9uQ2xlYW51cChlcnIpXG5cbiAgICAgICAgLy9lbWl0IGRpc2Nvbm5lY3QgYmVmb3JlIGNoZWNraW5nIHJlY29ubmVjdCwgc28gdXNlciBoYXMgYSBjaGFuY2UgdG8gZGVjaWRlIG5vdCB0by5cbiAgICAgICAgZW1pdHRlci5lbWl0KCdkaXNjb25uZWN0JywgZXJyKVxuXG4gICAgICAgIGlmKCFlbWl0dGVyLnJlY29ubmVjdCkgcmV0dXJuXG4gICAgICAgIHRyeSB7IGJhY2tvZmZNZXRob2QuYmFja29mZigpIH0gY2F0Y2ggKF8pIHsgfVxuICAgICAgfVxuXG4gICAgICBmdW5jdGlvbiBjb25uZWN0KCkge1xuICAgICAgICBiYWNrb2ZmTWV0aG9kLnJlc2V0KClcbiAgICAgICAgZW1pdHRlci5jb25uZWN0ZWQgPSB0cnVlXG4gICAgICAgIGlmKG9uQ29ubmVjdClcbiAgICAgICAgICBjb24ucmVtb3ZlTGlzdGVuZXIoJ2Nvbm5lY3QnLCBvbkNvbm5lY3QpXG4gICAgICAgIGVtaXR0ZXIuZW1pdCgnY29ubmVjdCcsIGNvbilcbiAgICAgIH1cblxuICAgICAgY29uXG4gICAgICAgIC5vbignZXJyb3InLCBvbkRpc2Nvbm5lY3QpXG4gICAgICAgIC5vbignY2xvc2UnLCBvbkRpc2Nvbm5lY3QpXG4gICAgICAgIC5vbignZW5kJyAgLCBvbkRpc2Nvbm5lY3QpXG5cbiAgICAgIGlmKG9wdHMuaW1tZWRpYXRlIHx8IGNvbi5jb25zdHJ1Y3Rvci5uYW1lID09ICdSZXF1ZXN0Jykge1xuICAgICAgICBlbWl0dGVyLmNvbm5lY3RlZCA9IHRydWVcbiAgICAgICAgZW1pdHRlci5lbWl0KCdjb25uZWN0JywgY29uKVxuICAgICAgICBjb24ub25jZSgnZGF0YScsIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAvL3RoaXMgaXMgdGhlIG9ubHkgd2F5IHRvIGtub3cgZm9yIHN1cmUgdGhhdCBkYXRhIGlzIGNvbWluZy4uLlxuICAgICAgICAgIGJhY2tvZmZNZXRob2QucmVzZXQoKVxuICAgICAgICB9KVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uLm9uKCdjb25uZWN0JywgY29ubmVjdClcbiAgICAgIH1cbiAgICB9XG5cbiAgICBlbWl0dGVyLmNvbm5lY3QgPVxuICAgIGVtaXR0ZXIubGlzdGVuID0gZnVuY3Rpb24gKCkge1xuICAgICAgdGhpcy5yZWNvbm5lY3QgPSB0cnVlXG4gICAgICBiYWNrb2ZmTWV0aG9kLnJlc2V0KClcbiAgICAgIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cylcbiAgICAgIGF0dGVtcHQoMCwgMClcbiAgICAgIHJldHVybiBlbWl0dGVyXG4gICAgfVxuXG4gICAgLy9mb3JjZSByZWNvbm5lY3Rpb25cblxuICAgIGVtaXR0ZXIuZW5kID1cbiAgICBlbWl0dGVyLmRpc2Nvbm5lY3QgPSBmdW5jdGlvbiAoKSB7XG4gICAgICBlbWl0dGVyLnJlY29ubmVjdCA9IGZhbHNlXG5cbiAgICAgIGlmKGVtaXR0ZXIuX2Nvbm5lY3Rpb24pXG4gICAgICAgIGVtaXR0ZXIuX2Nvbm5lY3Rpb24uZW5kKClcblxuICAgICAgZW1pdHRlci5lbWl0KCdkaXNjb25uZWN0JylcbiAgICAgIHJldHVybiBlbWl0dGVyXG4gICAgfVxuXG4gICAgcmV0dXJuIGVtaXR0ZXJcbiAgfVxuXG59XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgQmFja29mZiA9IHJlcXVpcmUoJy4vbGliL2JhY2tvZmYnKTtcbnZhciBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneSA9IHJlcXVpcmUoJy4vbGliL3N0cmF0ZWd5L2V4cG9uZW50aWFsJyk7XG52YXIgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9saWIvc3RyYXRlZ3kvZmlib25hY2NpJyk7XG52YXIgRnVuY3Rpb25DYWxsID0gcmVxdWlyZSgnLi9saWIvZnVuY3Rpb25fY2FsbC5qcycpO1xuXG5tb2R1bGUuZXhwb3J0cy5CYWNrb2ZmID0gQmFja29mZjtcbm1vZHVsZS5leHBvcnRzLkZ1bmN0aW9uQ2FsbCA9IEZ1bmN0aW9uQ2FsbDtcbm1vZHVsZS5leHBvcnRzLkZpYm9uYWNjaVN0cmF0ZWd5ID0gRmlib25hY2NpQmFja29mZlN0cmF0ZWd5O1xubW9kdWxlLmV4cG9ydHMuRXhwb25lbnRpYWxTdHJhdGVneSA9IEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5O1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBGaWJvbmFjY2kgYmFja29mZi5cbiAqIEBwYXJhbSBvcHRpb25zIEZpYm9uYWNjaSBiYWNrb2ZmIHN0cmF0ZWd5IGFyZ3VtZW50cy5cbiAqIEByZXR1cm4gVGhlIGZpYm9uYWNjaSBiYWNrb2ZmLlxuICogQHNlZSBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xubW9kdWxlLmV4cG9ydHMuZmlib25hY2NpID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICAgIHJldHVybiBuZXcgQmFja29mZihuZXcgRmlib25hY2NpQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpKTtcbn07XG5cbi8qKlxuICogQ29uc3RydWN0cyBhbiBleHBvbmVudGlhbCBiYWNrb2ZmLlxuICogQHBhcmFtIG9wdGlvbnMgRXhwb25lbnRpYWwgc3RyYXRlZ3kgYXJndW1lbnRzLlxuICogQHJldHVybiBUaGUgZXhwb25lbnRpYWwgYmFja29mZi5cbiAqIEBzZWUgRXhwb25lbnRpYWxCYWNrb2ZmU3RyYXRlZ3lcbiAqL1xubW9kdWxlLmV4cG9ydHMuZXhwb25lbnRpYWwgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gICAgcmV0dXJuIG5ldyBCYWNrb2ZmKG5ldyBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneShvcHRpb25zKSk7XG59O1xuXG4vKipcbiAqIENvbnN0cnVjdHMgYSBGdW5jdGlvbkNhbGwgZm9yIHRoZSBnaXZlbiBmdW5jdGlvbiBhbmQgYXJndW1lbnRzLlxuICogQHBhcmFtIGZuIFRoZSBmdW5jdGlvbiB0byB3cmFwIGluIGEgYmFja29mZiBoYW5kbGVyLlxuICogQHBhcmFtIHZhcmdzIFRoZSBmdW5jdGlvbidzIGFyZ3VtZW50cyAodmFyIGFyZ3MpLlxuICogQHBhcmFtIGNhbGxiYWNrIFRoZSBmdW5jdGlvbidzIGNhbGxiYWNrLlxuICogQHJldHVybiBUaGUgRnVuY3Rpb25DYWxsIGluc3RhbmNlLlxuICovXG5tb2R1bGUuZXhwb3J0cy5jYWxsID0gZnVuY3Rpb24oZm4sIHZhcmdzLCBjYWxsYmFjaykge1xuICAgIHZhciBhcmdzID0gQXJyYXkucHJvdG90eXBlLnNsaWNlLmNhbGwoYXJndW1lbnRzKTtcbiAgICBmbiA9IGFyZ3NbMF07XG4gICAgdmFyZ3MgPSBhcmdzLnNsaWNlKDEsIGFyZ3MubGVuZ3RoIC0gMSk7XG4gICAgY2FsbGJhY2sgPSBhcmdzW2FyZ3MubGVuZ3RoIC0gMV07XG4gICAgcmV0dXJuIG5ldyBGdW5jdGlvbkNhbGwoZm4sIHZhcmdzLCBjYWxsYmFjayk7XG59O1xuIiwiLypcbiAqIENvcHlyaWdodCAoYykgMjAxMiBNYXRoaWV1IFR1cmNvdHRlXG4gKiBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIGxpY2Vuc2UuXG4gKi9cblxudmFyIGV2ZW50cyA9IHJlcXVpcmUoJ2V2ZW50cycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJyk7XG5cbi8qKlxuICogQmFja29mZiBkcml2ZXIuXG4gKiBAcGFyYW0gYmFja29mZlN0cmF0ZWd5IEJhY2tvZmYgZGVsYXkgZ2VuZXJhdG9yL3N0cmF0ZWd5LlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbmZ1bmN0aW9uIEJhY2tvZmYoYmFja29mZlN0cmF0ZWd5KSB7XG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5jYWxsKHRoaXMpO1xuXG4gICAgdGhpcy5iYWNrb2ZmU3RyYXRlZ3lfID0gYmFja29mZlN0cmF0ZWd5O1xuICAgIHRoaXMubWF4TnVtYmVyT2ZSZXRyeV8gPSAtMTtcbiAgICB0aGlzLmJhY2tvZmZOdW1iZXJfID0gMDtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMudGltZW91dElEXyA9IC0xO1xuXG4gICAgdGhpcy5oYW5kbGVycyA9IHtcbiAgICAgICAgYmFja29mZjogdGhpcy5vbkJhY2tvZmZfLmJpbmQodGhpcylcbiAgICB9O1xufVxudXRpbC5pbmhlcml0cyhCYWNrb2ZmLCBldmVudHMuRXZlbnRFbWl0dGVyKTtcblxuLyoqXG4gKiBTZXRzIGEgbGltaXQsIGdyZWF0ZXIgdGhhbiAwLCBvbiB0aGUgbWF4aW11bSBudW1iZXIgb2YgYmFja29mZnMuIEEgJ2ZhaWwnXG4gKiBldmVudCB3aWxsIGJlIGVtaXR0ZWQgd2hlbiB0aGUgbGltaXQgaXMgcmVhY2hlZC5cbiAqIEBwYXJhbSBtYXhOdW1iZXJPZlJldHJ5IFRoZSBtYXhpbXVtIG51bWJlciBvZiBiYWNrb2Zmcy5cbiAqL1xuQmFja29mZi5wcm90b3R5cGUuZmFpbEFmdGVyID0gZnVuY3Rpb24obWF4TnVtYmVyT2ZSZXRyeSkge1xuICAgIGlmIChtYXhOdW1iZXJPZlJldHJ5IDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ01heGltdW0gbnVtYmVyIG9mIHJldHJ5IG11c3QgYmUgZ3JlYXRlciB0aGFuIDAuICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgJ0FjdHVhbDogJyArIG1heE51bWJlck9mUmV0cnkpO1xuICAgIH1cblxuICAgIHRoaXMubWF4TnVtYmVyT2ZSZXRyeV8gPSBtYXhOdW1iZXJPZlJldHJ5O1xufTtcblxuLyoqXG4gKiBTdGFydHMgYSBiYWNrb2ZmIG9wZXJhdGlvbi5cbiAqIEBwYXJhbSBlcnIgT3B0aW9uYWwgcGFyYW1hdGVyIHRvIGxldCB0aGUgbGlzdGVuZXJzIGtub3cgd2h5IHRoZSBiYWNrb2ZmXG4gKiAgICAgb3BlcmF0aW9uIHdhcyBzdGFydGVkLlxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5iYWNrb2ZmID0gZnVuY3Rpb24oZXJyKSB7XG4gICAgaWYgKHRoaXMudGltZW91dElEXyAhPT0gLTEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdCYWNrb2ZmIGluIHByb2dyZXNzLicpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmJhY2tvZmZOdW1iZXJfID09PSB0aGlzLm1heE51bWJlck9mUmV0cnlfKSB7XG4gICAgICAgIHRoaXMuZW1pdCgnZmFpbCcsIGVycik7XG4gICAgICAgIHRoaXMucmVzZXQoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSB0aGlzLmJhY2tvZmZTdHJhdGVneV8ubmV4dCgpO1xuICAgICAgICB0aGlzLnRpbWVvdXRJRF8gPSBzZXRUaW1lb3V0KHRoaXMuaGFuZGxlcnMuYmFja29mZiwgdGhpcy5iYWNrb2ZmRGVsYXlfKTtcbiAgICAgICAgdGhpcy5lbWl0KCdiYWNrb2ZmJywgdGhpcy5iYWNrb2ZmTnVtYmVyXywgdGhpcy5iYWNrb2ZmRGVsYXlfLCBlcnIpO1xuICAgIH1cbn07XG5cbi8qKlxuICogSGFuZGxlcyB0aGUgYmFja29mZiB0aW1lb3V0IGNvbXBsZXRpb24uXG4gKiBAcHJpdmF0ZVxuICovXG5CYWNrb2ZmLnByb3RvdHlwZS5vbkJhY2tvZmZfID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy50aW1lb3V0SURfID0gLTE7XG4gICAgdGhpcy5lbWl0KCdyZWFkeScsIHRoaXMuYmFja29mZk51bWJlcl8sIHRoaXMuYmFja29mZkRlbGF5Xyk7XG4gICAgdGhpcy5iYWNrb2ZmTnVtYmVyXysrO1xufTtcblxuLyoqXG4gKiBTdG9wcyBhbnkgYmFja29mZiBvcGVyYXRpb24gYW5kIHJlc2V0cyB0aGUgYmFja29mZiBkZWxheSB0byBpdHMgaW5pdGFsXG4gKiB2YWx1ZS5cbiAqL1xuQmFja29mZi5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmJhY2tvZmZOdW1iZXJfID0gMDtcbiAgICB0aGlzLmJhY2tvZmZTdHJhdGVneV8ucmVzZXQoKTtcbiAgICBjbGVhclRpbWVvdXQodGhpcy50aW1lb3V0SURfKTtcbiAgICB0aGlzLnRpbWVvdXRJRF8gPSAtMTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja29mZjtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciBldmVudHMgPSByZXF1aXJlKCdldmVudHMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG52YXIgQmFja29mZiA9IHJlcXVpcmUoJy4vYmFja29mZicpO1xudmFyIEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneSA9IHJlcXVpcmUoJy4vc3RyYXRlZ3kvZmlib25hY2NpJyk7XG5cbi8qKlxuICogUmV0dXJucyB0cnVlIGlmIHRoZSBzcGVjaWZpZWQgdmFsdWUgaXMgYSBmdW5jdGlvblxuICogQHBhcmFtIHZhbCBWYXJpYWJsZSB0byB0ZXN0LlxuICogQHJldHVybiBXaGV0aGVyIHZhcmlhYmxlIGlzIGEgZnVuY3Rpb24uXG4gKi9cbmZ1bmN0aW9uIGlzRnVuY3Rpb24odmFsKSB7XG4gICAgcmV0dXJuIHR5cGVvZiB2YWwgPT0gJ2Z1bmN0aW9uJztcbn1cblxuLyoqXG4gKiBNYW5hZ2VzIHRoZSBjYWxsaW5nIG9mIGEgZnVuY3Rpb24gaW4gYSBiYWNrb2ZmIGxvb3AuXG4gKiBAcGFyYW0gZm4gRnVuY3Rpb24gdG8gd3JhcCBpbiBhIGJhY2tvZmYgaGFuZGxlci5cbiAqIEBwYXJhbSBhcmdzIEFycmF5IG9mIGZ1bmN0aW9uJ3MgYXJndW1lbnRzLlxuICogQHBhcmFtIGNhbGxiYWNrIEZ1bmN0aW9uJ3MgY2FsbGJhY2suXG4gKiBAY29uc3RydWN0b3JcbiAqL1xuZnVuY3Rpb24gRnVuY3Rpb25DYWxsKGZuLCBhcmdzLCBjYWxsYmFjaykge1xuICAgIGV2ZW50cy5FdmVudEVtaXR0ZXIuY2FsbCh0aGlzKTtcblxuICAgIGlmICghaXNGdW5jdGlvbihmbikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdmbiBzaG91bGQgYmUgYSBmdW5jdGlvbi4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdBY3R1YWw6ICcgKyB0eXBlb2YgZm4pO1xuICAgIH1cblxuICAgIGlmICghaXNGdW5jdGlvbihjYWxsYmFjaykpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdjYWxsYmFjayBzaG91bGQgYmUgYSBmdW5jdGlvbi4nICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdBY3R1YWw6ICcgKyB0eXBlb2YgZm4pO1xuICAgIH1cblxuICAgIHRoaXMuZnVuY3Rpb25fID0gZm47XG4gICAgdGhpcy5hcmd1bWVudHNfID0gYXJncztcbiAgICB0aGlzLmNhbGxiYWNrXyA9IGNhbGxiYWNrO1xuICAgIHRoaXMucmVzdWx0c18gPSBbXTtcblxuICAgIHRoaXMuYmFja29mZl8gPSBudWxsO1xuICAgIHRoaXMuc3RyYXRlZ3lfID0gbnVsbDtcbiAgICB0aGlzLmZhaWxBZnRlcl8gPSAtMTtcblxuICAgIHRoaXMuc3RhdGVfID0gRnVuY3Rpb25DYWxsLlN0YXRlXy5QRU5ESU5HO1xufVxudXRpbC5pbmhlcml0cyhGdW5jdGlvbkNhbGwsIGV2ZW50cy5FdmVudEVtaXR0ZXIpO1xuXG4vKipcbiAqIEVudW0gb2Ygc3RhdGVzIGluIHdoaWNoIHRoZSBGdW5jdGlvbkNhbGwgY2FuIGJlLlxuICogQHByaXZhdGVcbiAqL1xuRnVuY3Rpb25DYWxsLlN0YXRlXyA9IHtcbiAgICBQRU5ESU5HOiAwLFxuICAgIFJVTk5JTkc6IDEsXG4gICAgQ09NUExFVEVEOiAyLFxuICAgIEFCT1JURUQ6IDNcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIHBlbmRpbmcuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNQZW5kaW5nID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGVfID09IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uUEVORElORztcbn07XG5cbi8qKlxuICogQHJldHVybiBXaGV0aGVyIHRoZSBjYWxsIGlzIGluIHByb2dyZXNzLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmlzUnVubmluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXRlXyA9PSBGdW5jdGlvbkNhbGwuU3RhdGVfLlJVTk5JTkc7XG59O1xuXG4vKipcbiAqIEByZXR1cm4gV2hldGhlciB0aGUgY2FsbCBpcyBjb21wbGV0ZWQuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaXNDb21wbGV0ZWQgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZV8gPT0gRnVuY3Rpb25DYWxsLlN0YXRlXy5DT01QTEVURUQ7XG59O1xuXG4vKipcbiAqIEByZXR1cm4gV2hldGhlciB0aGUgY2FsbCBpcyBhYm9ydGVkLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmlzQWJvcnRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLnN0YXRlXyA9PSBGdW5jdGlvbkNhbGwuU3RhdGVfLkFCT1JURUQ7XG59O1xuXG4vKipcbiAqIFNldHMgdGhlIGJhY2tvZmYgc3RyYXRlZ3kuXG4gKiBAcGFyYW0gc3RyYXRlZ3kgVGhlIGJhY2tvZmYgc3RyYXRlZ3kgdG8gdXNlLlxuICogQHJldHVybiBJdHNlbGYgZm9yIGNoYWluaW5nLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLnNldFN0cmF0ZWd5ID0gZnVuY3Rpb24oc3RyYXRlZ3kpIHtcbiAgICBpZiAoIXRoaXMuaXNQZW5kaW5nKCkpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdGdW5jdGlvbkNhbGwgaW4gcHJvZ3Jlc3MuJyk7XG4gICAgfVxuICAgIHRoaXMuc3RyYXRlZ3lfID0gc3RyYXRlZ3k7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKipcbiAqIFJldHVybnMgYWxsIGludGVybWVkaWFyeSByZXN1bHRzIHJldHVybmVkIGJ5IHRoZSB3cmFwcGVkIGZ1bmN0aW9uIHNpbmNlXG4gKiB0aGUgaW5pdGlhbCBjYWxsLlxuICogQHJldHVybiBBbiBhcnJheSBvZiBpbnRlcm1lZGlhcnkgcmVzdWx0cy5cbiAqL1xuRnVuY3Rpb25DYWxsLnByb3RvdHlwZS5nZXRSZXN1bHRzID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMucmVzdWx0c18uY29uY2F0KCk7XG59O1xuXG4vKipcbiAqIFNldHMgdGhlIGJhY2tvZmYgbGltaXQuXG4gKiBAcGFyYW0gbWF4TnVtYmVyT2ZSZXRyeSBUaGUgbWF4aW11bSBudW1iZXIgb2YgYmFja29mZnMuXG4gKiBAcmV0dXJuIEl0c2VsZiBmb3IgY2hhaW5pbmcuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuZmFpbEFmdGVyID0gZnVuY3Rpb24obWF4TnVtYmVyT2ZSZXRyeSkge1xuICAgIGlmICghdGhpcy5pc1BlbmRpbmcoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBpbiBwcm9ncmVzcy4nKTtcbiAgICB9XG4gICAgdGhpcy5mYWlsQWZ0ZXJfID0gbWF4TnVtYmVyT2ZSZXRyeTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICogQWJvcnRzIHRoZSBjYWxsLlxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYgKHRoaXMuaXNDb21wbGV0ZWQoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBhbHJlYWR5IGNvbXBsZXRlZC4nKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5pc1J1bm5pbmcoKSkge1xuICAgICAgICB0aGlzLmJhY2tvZmZfLnJlc2V0KCk7XG4gICAgfVxuXG4gICAgdGhpcy5zdGF0ZV8gPSBGdW5jdGlvbkNhbGwuU3RhdGVfLkFCT1JURUQ7XG59O1xuXG4vKipcbiAqIEluaXRpYXRlcyB0aGUgY2FsbCB0byB0aGUgd3JhcHBlZCBmdW5jdGlvbi5cbiAqIEBwYXJhbSBiYWNrb2ZmRmFjdG9yeSBPcHRpb25hbCBmYWN0b3J5IGZ1bmN0aW9uIHVzZWQgdG8gY3JlYXRlIHRoZSBiYWNrb2ZmXG4gKiAgICAgaW5zdGFuY2UuXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbihiYWNrb2ZmRmFjdG9yeSkge1xuICAgIGlmICh0aGlzLmlzQWJvcnRlZCgpKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignRnVuY3Rpb25DYWxsIGFib3J0ZWQuJyk7XG4gICAgfSBlbHNlIGlmICghdGhpcy5pc1BlbmRpbmcoKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Z1bmN0aW9uQ2FsbCBhbHJlYWR5IHN0YXJ0ZWQuJyk7XG4gICAgfVxuXG4gICAgdmFyIHN0cmF0ZWd5ID0gdGhpcy5zdHJhdGVneV8gfHwgbmV3IEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneSgpO1xuXG4gICAgdGhpcy5iYWNrb2ZmXyA9IGJhY2tvZmZGYWN0b3J5ID9cbiAgICAgICAgYmFja29mZkZhY3Rvcnkoc3RyYXRlZ3kpIDpcbiAgICAgICAgbmV3IEJhY2tvZmYoc3RyYXRlZ3kpO1xuXG4gICAgdGhpcy5iYWNrb2ZmXy5vbigncmVhZHknLCB0aGlzLmRvQ2FsbF8uYmluZCh0aGlzKSk7XG4gICAgdGhpcy5iYWNrb2ZmXy5vbignZmFpbCcsIHRoaXMuZG9DYWxsYmFja18uYmluZCh0aGlzKSk7XG4gICAgdGhpcy5iYWNrb2ZmXy5vbignYmFja29mZicsIHRoaXMuaGFuZGxlQmFja29mZl8uYmluZCh0aGlzKSk7XG5cbiAgICBpZiAodGhpcy5mYWlsQWZ0ZXJfID4gMCkge1xuICAgICAgICB0aGlzLmJhY2tvZmZfLmZhaWxBZnRlcih0aGlzLmZhaWxBZnRlcl8pO1xuICAgIH1cblxuICAgIHRoaXMuc3RhdGVfID0gRnVuY3Rpb25DYWxsLlN0YXRlXy5SVU5OSU5HO1xuICAgIHRoaXMuZG9DYWxsXygpO1xufTtcblxuLyoqXG4gKiBDYWxscyB0aGUgd3JhcHBlZCBmdW5jdGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuZG9DYWxsXyA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBldmVudEFyZ3MgPSBbJ2NhbGwnXS5jb25jYXQodGhpcy5hcmd1bWVudHNfKTtcbiAgICBldmVudHMuRXZlbnRFbWl0dGVyLnByb3RvdHlwZS5lbWl0LmFwcGx5KHRoaXMsIGV2ZW50QXJncyk7XG4gICAgdmFyIGNhbGxiYWNrID0gdGhpcy5oYW5kbGVGdW5jdGlvbkNhbGxiYWNrXy5iaW5kKHRoaXMpO1xuICAgIHRoaXMuZnVuY3Rpb25fLmFwcGx5KG51bGwsIHRoaXMuYXJndW1lbnRzXy5jb25jYXQoY2FsbGJhY2spKTtcbn07XG5cbi8qKlxuICogQ2FsbHMgdGhlIHdyYXBwZWQgZnVuY3Rpb24ncyBjYWxsYmFjayB3aXRoIHRoZSBsYXN0IHJlc3VsdCByZXR1cm5lZCBieSB0aGVcbiAqIHdyYXBwZWQgZnVuY3Rpb24uXG4gKiBAcHJpdmF0ZVxuICovXG5GdW5jdGlvbkNhbGwucHJvdG90eXBlLmRvQ2FsbGJhY2tfID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGFyZ3MgPSB0aGlzLnJlc3VsdHNfW3RoaXMucmVzdWx0c18ubGVuZ3RoIC0gMV07XG4gICAgdGhpcy5jYWxsYmFja18uYXBwbHkobnVsbCwgYXJncyk7XG59O1xuXG4vKipcbiAqIEhhbmRsZXMgd3JhcHBlZCBmdW5jdGlvbidzIGNvbXBsZXRpb24uIFRoaXMgbWV0aG9kIGFjdHMgYXMgYSByZXBsYWNlbWVudFxuICogZm9yIHRoZSBvcmlnaW5hbCBjYWxsYmFjayBmdW5jdGlvbi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaGFuZGxlRnVuY3Rpb25DYWxsYmFja18gPSBmdW5jdGlvbigpIHtcbiAgICBpZiAodGhpcy5pc0Fib3J0ZWQoKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHRoaXMucmVzdWx0c18ucHVzaChhcmdzKTsgLy8gU2F2ZSBjYWxsYmFjayBhcmd1bWVudHMuXG4gICAgZXZlbnRzLkV2ZW50RW1pdHRlci5wcm90b3R5cGUuZW1pdC5hcHBseSh0aGlzLCBbJ2NhbGxiYWNrJ10uY29uY2F0KGFyZ3MpKTtcblxuICAgIGlmIChhcmdzWzBdKSB7XG4gICAgICAgIHRoaXMuYmFja29mZl8uYmFja29mZihhcmdzWzBdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnN0YXRlXyA9IEZ1bmN0aW9uQ2FsbC5TdGF0ZV8uQ09NUExFVEVEO1xuICAgICAgICB0aGlzLmRvQ2FsbGJhY2tfKCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiBIYW5kbGVzIGJhY2tvZmYgZXZlbnQuXG4gKiBAcGFyYW0gbnVtYmVyIEJhY2tvZmYgbnVtYmVyLlxuICogQHBhcmFtIGRlbGF5IEJhY2tvZmYgZGVsYXkuXG4gKiBAcGFyYW0gZXJyIFRoZSBlcnJvciB0aGF0IGNhdXNlZCB0aGUgYmFja29mZi5cbiAqIEBwcml2YXRlXG4gKi9cbkZ1bmN0aW9uQ2FsbC5wcm90b3R5cGUuaGFuZGxlQmFja29mZl8gPSBmdW5jdGlvbihudW1iZXIsIGRlbGF5LCBlcnIpIHtcbiAgICB0aGlzLmVtaXQoJ2JhY2tvZmYnLCBudW1iZXIsIGRlbGF5LCBlcnIpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGdW5jdGlvbkNhbGw7XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxudmFyIEJhY2tvZmZTdHJhdGVneSA9IHJlcXVpcmUoJy4vc3RyYXRlZ3knKTtcblxuLyoqXG4gKiBFeHBvbmVudGlhbCBiYWNrb2ZmIHN0cmF0ZWd5LlxuICogQGV4dGVuZHMgQmFja29mZlN0cmF0ZWd5XG4gKi9cbmZ1bmN0aW9uIEV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5KG9wdGlvbnMpIHtcbiAgICBCYWNrb2ZmU3RyYXRlZ3kuY2FsbCh0aGlzLCBvcHRpb25zKTtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xufVxudXRpbC5pbmhlcml0cyhFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneSwgQmFja29mZlN0cmF0ZWd5KTtcblxuLyoqIEBpbmhlcml0RG9jICovXG5FeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSBNYXRoLm1pbih0aGlzLm5leHRCYWNrb2ZmRGVsYXlfLCB0aGlzLmdldE1heERlbGF5KCkpO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmJhY2tvZmZEZWxheV8gKiAyO1xuICAgIHJldHVybiB0aGlzLmJhY2tvZmZEZWxheV87XG59O1xuXG4vKiogQGluaGVyaXREb2MgKi9cbkV4cG9uZW50aWFsQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xuICAgIHRoaXMubmV4dEJhY2tvZmZEZWxheV8gPSB0aGlzLmdldEluaXRpYWxEZWxheSgpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFeHBvbmVudGlhbEJhY2tvZmZTdHJhdGVneTtcbiIsIi8qXG4gKiBDb3B5cmlnaHQgKGMpIDIwMTIgTWF0aGlldSBUdXJjb3R0ZVxuICogTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlLlxuICovXG5cbnZhciB1dGlsID0gcmVxdWlyZSgndXRpbCcpO1xuXG52YXIgQmFja29mZlN0cmF0ZWd5ID0gcmVxdWlyZSgnLi9zdHJhdGVneScpO1xuXG4vKipcbiAqIEZpYm9uYWNjaSBiYWNrb2ZmIHN0cmF0ZWd5LlxuICogQGV4dGVuZHMgQmFja29mZlN0cmF0ZWd5XG4gKi9cbmZ1bmN0aW9uIEZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneShvcHRpb25zKSB7XG4gICAgQmFja29mZlN0cmF0ZWd5LmNhbGwodGhpcywgb3B0aW9ucyk7XG4gICAgdGhpcy5iYWNrb2ZmRGVsYXlfID0gMDtcbiAgICB0aGlzLm5leHRCYWNrb2ZmRGVsYXlfID0gdGhpcy5nZXRJbml0aWFsRGVsYXkoKTtcbn1cbnV0aWwuaW5oZXJpdHMoRmlib25hY2NpQmFja29mZlN0cmF0ZWd5LCBCYWNrb2ZmU3RyYXRlZ3kpO1xuXG4vKiogQGluaGVyaXREb2MgKi9cbkZpYm9uYWNjaUJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUubmV4dF8gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYmFja29mZkRlbGF5ID0gTWF0aC5taW4odGhpcy5uZXh0QmFja29mZkRlbGF5XywgdGhpcy5nZXRNYXhEZWxheSgpKTtcbiAgICB0aGlzLm5leHRCYWNrb2ZmRGVsYXlfICs9IHRoaXMuYmFja29mZkRlbGF5XztcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSBiYWNrb2ZmRGVsYXk7XG4gICAgcmV0dXJuIGJhY2tvZmZEZWxheTtcbn07XG5cbi8qKiBAaW5oZXJpdERvYyAqL1xuRmlib25hY2NpQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5yZXNldF8gPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5leHRCYWNrb2ZmRGVsYXlfID0gdGhpcy5nZXRJbml0aWFsRGVsYXkoKTtcbiAgICB0aGlzLmJhY2tvZmZEZWxheV8gPSAwO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGaWJvbmFjY2lCYWNrb2ZmU3RyYXRlZ3k7XG4iLCIvKlxuICogQ29weXJpZ2h0IChjKSAyMDEyIE1hdGhpZXUgVHVyY290dGVcbiAqIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgbGljZW5zZS5cbiAqL1xuXG52YXIgZXZlbnRzID0gcmVxdWlyZSgnZXZlbnRzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJ3V0aWwnKTtcblxuZnVuY3Rpb24gaXNEZWYodmFsdWUpIHtcbiAgICByZXR1cm4gdmFsdWUgIT09IHVuZGVmaW5lZCAmJiB2YWx1ZSAhPT0gbnVsbDtcbn1cblxuLyoqXG4gKiBBYnN0cmFjdCBjbGFzcyBkZWZpbmluZyB0aGUgc2tlbGV0b24gZm9yIGFsbCBiYWNrb2ZmIHN0cmF0ZWdpZXMuXG4gKiBAcGFyYW0gb3B0aW9ucyBCYWNrb2ZmIHN0cmF0ZWd5IG9wdGlvbnMuXG4gKiBAcGFyYW0gb3B0aW9ucy5yYW5kb21pc2F0aW9uRmFjdG9yIFRoZSByYW5kb21pc2F0aW9uIGZhY3RvciwgbXVzdCBiZSBiZXR3ZWVuXG4gKiAwIGFuZCAxLlxuICogQHBhcmFtIG9wdGlvbnMuaW5pdGlhbERlbGF5IFRoZSBiYWNrb2ZmIGluaXRpYWwgZGVsYXksIGluIG1pbGxpc2Vjb25kcy5cbiAqIEBwYXJhbSBvcHRpb25zLm1heERlbGF5IFRoZSBiYWNrb2ZmIG1heGltYWwgZGVsYXksIGluIG1pbGxpc2Vjb25kcy5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG5mdW5jdGlvbiBCYWNrb2ZmU3RyYXRlZ3kob3B0aW9ucykge1xuICAgIG9wdGlvbnMgPSBvcHRpb25zIHx8IHt9O1xuXG4gICAgaWYgKGlzRGVmKG9wdGlvbnMuaW5pdGlhbERlbGF5KSAmJiBvcHRpb25zLmluaXRpYWxEZWxheSA8IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdUaGUgaW5pdGlhbCB0aW1lb3V0IG11c3QgYmUgZ3JlYXRlciB0aGFuIDAuJyk7XG4gICAgfSBlbHNlIGlmIChpc0RlZihvcHRpb25zLm1heERlbGF5KSAmJiBvcHRpb25zLm1heERlbGF5IDwgMSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBtYXhpbWFsIHRpbWVvdXQgbXVzdCBiZSBncmVhdGVyIHRoYW4gMC4nKTtcbiAgICB9XG5cbiAgICB0aGlzLmluaXRpYWxEZWxheV8gPSBvcHRpb25zLmluaXRpYWxEZWxheSB8fCAxMDA7XG4gICAgdGhpcy5tYXhEZWxheV8gPSBvcHRpb25zLm1heERlbGF5IHx8IDEwMDAwO1xuXG4gICAgaWYgKHRoaXMubWF4RGVsYXlfIDw9IHRoaXMuaW5pdGlhbERlbGF5Xykge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSBtYXhpbWFsIGJhY2tvZmYgZGVsYXkgbXVzdCBiZSAnICtcbiAgICAgICAgICAgICAgICAgICAgICAgICdncmVhdGVyIHRoYW4gdGhlIGluaXRpYWwgYmFja29mZiBkZWxheS4nKTtcbiAgICB9XG5cbiAgICBpZiAoaXNEZWYob3B0aW9ucy5yYW5kb21pc2F0aW9uRmFjdG9yKSAmJlxuICAgICAgICAob3B0aW9ucy5yYW5kb21pc2F0aW9uRmFjdG9yIDwgMCB8fCBvcHRpb25zLnJhbmRvbWlzYXRpb25GYWN0b3IgPiAxKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSByYW5kb21pc2F0aW9uIGZhY3RvciBtdXN0IGJlIGJldHdlZW4gMCBhbmQgMS4nKTtcbiAgICB9XG5cbiAgICB0aGlzLnJhbmRvbWlzYXRpb25GYWN0b3JfID0gb3B0aW9ucy5yYW5kb21pc2F0aW9uRmFjdG9yIHx8IDA7XG59XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSBtYXhpbWFsIGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBtYXhpbWFsIGJhY2tvZmYgZGVsYXksIGluIG1pbGxpc2Vjb25kcy5cbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5nZXRNYXhEZWxheSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLm1heERlbGF5Xztcbn07XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSBpbml0aWFsIGJhY2tvZmYgZGVsYXkuXG4gKiBAcmV0dXJuIFRoZSBpbml0aWFsIGJhY2tvZmYgZGVsYXksIGluIG1pbGxpc2Vjb25kcy5cbiAqL1xuQmFja29mZlN0cmF0ZWd5LnByb3RvdHlwZS5nZXRJbml0aWFsRGVsYXkgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5pbml0aWFsRGVsYXlfO1xufTtcblxuLyoqXG4gKiBUZW1wbGF0ZSBtZXRob2QgdGhhdCBjb21wdXRlcyB0aGUgbmV4dCBiYWNrb2ZmIGRlbGF5LlxuICogQHJldHVybiBUaGUgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLm5leHQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgYmFja29mZkRlbGF5ID0gdGhpcy5uZXh0XygpO1xuICAgIHZhciByYW5kb21pc2F0aW9uTXVsdGlwbGUgPSAxICsgTWF0aC5yYW5kb20oKSAqIHRoaXMucmFuZG9taXNhdGlvbkZhY3Rvcl87XG4gICAgdmFyIHJhbmRvbWl6ZWREZWxheSA9IE1hdGgucm91bmQoYmFja29mZkRlbGF5ICogcmFuZG9taXNhdGlvbk11bHRpcGxlKTtcbiAgICByZXR1cm4gcmFuZG9taXplZERlbGF5O1xufTtcblxuLyoqXG4gKiBDb21wdXRlcyB0aGUgbmV4dCBiYWNrb2ZmIGRlbGF5LlxuICogQHJldHVybiBUaGUgYmFja29mZiBkZWxheSwgaW4gbWlsbGlzZWNvbmRzLlxuICogQHByb3RlY3RlZFxuICovXG5CYWNrb2ZmU3RyYXRlZ3kucHJvdG90eXBlLm5leHRfID0gZnVuY3Rpb24oKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWNrb2ZmU3RyYXRlZ3kubmV4dF8oKSB1bmltcGxlbWVudGVkLicpO1xufTtcblxuLyoqXG4gKiBUZW1wbGF0ZSBtZXRob2QgdGhhdCByZXNldHMgdGhlIGJhY2tvZmYgZGVsYXkgdG8gaXRzIGluaXRpYWwgdmFsdWUuXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUucmVzZXQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnJlc2V0XygpO1xufTtcblxuLyoqXG4gKiBSZXNldHMgdGhlIGJhY2tvZmYgZGVsYXkgdG8gaXRzIGluaXRpYWwgdmFsdWUuXG4gKiBAcHJvdGVjdGVkXG4gKi9cbkJhY2tvZmZTdHJhdGVneS5wcm90b3R5cGUucmVzZXRfID0gZnVuY3Rpb24oKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCYWNrb2ZmU3RyYXRlZ3kucmVzZXRfKCkgdW5pbXBsZW1lbnRlZC4nKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gQmFja29mZlN0cmF0ZWd5O1xuIiwiKGZ1bmN0aW9uIChwcm9jZXNzKXtcbid1c2Ugc3RyaWN0JztcblxubW9kdWxlLmV4cG9ydHMgPSBjb25uZWN0O1xuY29ubmVjdC5jb25uZWN0ID0gY29ubmVjdDtcblxuLyogdGhpcyB3aG9sZSBmaWxlIG9ubHkgZXhpc3RzIGJlY2F1c2UgdGxzLnN0YXJ0XG4gKiBkb2Vucyd0IGV4aXN0cyBhbmQgdGxzLmNvbm5lY3QgY2Fubm90IHN0YXJ0IHNlcnZlclxuICogY29ubmVjdGlvbnNcbiAqXG4gKiBjb3BpZWQgZnJvbSBfdGxzX3dyYXAuanNcbiAqL1xuXG4vLyBUYXJnZXQgQVBJOlxuLy9cbi8vICB2YXIgcyA9IHJlcXVpcmUoJ25ldCcpLmNyZWF0ZVN0cmVhbSgyNSwgJ3NtdHAuZXhhbXBsZS5jb20nKVxuLy8gIHMub24oJ2Nvbm5lY3QnLCBmdW5jdGlvbigpIHtcbi8vICAgcmVxdWlyZSgndGxzLWNvbm5lY3QnKShzLCB7Y3JlZGVudGlhbHM6Y3JlZHMsIGlzU2VydmVyOmZhbHNlfSwgZnVuY3Rpb24oKSB7XG4vLyAgICAgIGlmICghcy5hdXRob3JpemVkKSB7XG4vLyAgICAgICAgcy5kZXN0cm95KClcbi8vICAgICAgICByZXR1cm5cbi8vICAgICAgfVxuLy9cbi8vICAgICAgcy5lbmQoXCJoZWxsbyB3b3JsZFxcblwiKVxuLy8gICAgfSlcbi8vICB9KVxuXG52YXIgbmV0ID0gcmVxdWlyZSgnbmV0JylcbnZhciB0bHMgPSByZXF1aXJlKCd0bHMnKVxudmFyIHV0aWwgPSByZXF1aXJlKCd1dGlsJylcbnZhciBhc3NlcnQgPSByZXF1aXJlKCdhc3NlcnQnKVxudmFyIGNyeXB0byA9IHJlcXVpcmUoJ2NyeXB0bycpXG5cbi8vIFJldHVybnMgYW4gYXJyYXkgW29wdGlvbnNdIG9yIFtvcHRpb25zLCBjYl1cbi8vIEl0IGlzIHRoZSBzYW1lIGFzIHRoZSBhcmd1bWVudCBvZiBTb2NrZXQucHJvdG90eXBlLmNvbm5lY3QoKS5cbmZ1bmN0aW9uIF9fbm9ybWFsaXplQ29ubmVjdEFyZ3MoYXJncykge1xuICB2YXIgb3B0aW9ucyA9IHt9O1xuXG4gIGlmICh0eXBlb2YoYXJnc1swXSkgPT0gJ29iamVjdCcpIHtcbiAgICAvLyBjb25uZWN0KG9wdGlvbnMsIFtjYl0pXG4gICAgb3B0aW9ucyA9IGFyZ3NbMF07XG4gIH0gZWxzZSBpZiAoaXNQaXBlTmFtZShhcmdzWzBdKSkge1xuICAgIC8vIGNvbm5lY3QocGF0aCwgW2NiXSk7XG4gICAgb3B0aW9ucy5wYXRoID0gYXJnc1swXTtcbiAgfSBlbHNlIHtcbiAgICAvLyBjb25uZWN0KHBvcnQsIFtob3N0XSwgW2NiXSlcbiAgICBvcHRpb25zLnBvcnQgPSBhcmdzWzBdO1xuICAgIGlmICh0eXBlb2YoYXJnc1sxXSkgPT09ICdzdHJpbmcnKSB7XG4gICAgICBvcHRpb25zLmhvc3QgPSBhcmdzWzFdO1xuICAgIH1cbiAgfVxuXG4gIHZhciBjYiA9IGFyZ3NbYXJncy5sZW5ndGggLSAxXTtcbiAgcmV0dXJuIHR5cGVvZihjYikgPT09ICdmdW5jdGlvbicgPyBbb3B0aW9ucywgY2JdIDogW29wdGlvbnNdO1xufVxuXG5mdW5jdGlvbiBfX2NoZWNrU2VydmVySWRlbnRpdHkoaG9zdCwgY2VydCkge1xuICAvLyBDcmVhdGUgcmVnZXhwIHRvIG11Y2ggaG9zdG5hbWVzXG4gIGZ1bmN0aW9uIHJlZ2V4cGlmeShob3N0LCB3aWxkY2FyZHMpIHtcbiAgICAvLyBBZGQgdHJhaWxpbmcgZG90IChtYWtlIGhvc3RuYW1lcyB1bmlmb3JtKVxuICAgIGlmICghL1xcLiQvLnRlc3QoaG9zdCkpIGhvc3QgKz0gJy4nO1xuXG4gICAgLy8gVGhlIHNhbWUgYXBwbGllcyB0byBob3N0bmFtZSB3aXRoIG1vcmUgdGhhbiBvbmUgd2lsZGNhcmQsXG4gICAgLy8gaWYgaG9zdG5hbWUgaGFzIHdpbGRjYXJkIHdoZW4gd2lsZGNhcmRzIGFyZSBub3QgYWxsb3dlZCxcbiAgICAvLyBvciBpZiB0aGVyZSBhcmUgbGVzcyB0aGFuIHR3byBkb3RzIGFmdGVyIHdpbGRjYXJkIChpLmUuICouY29tIG9yICpkLmNvbSlcbiAgICAvL1xuICAgIC8vIGFsc29cbiAgICAvL1xuICAgIC8vIFwiVGhlIGNsaWVudCBTSE9VTEQgTk9UIGF0dGVtcHQgdG8gbWF0Y2ggYSBwcmVzZW50ZWQgaWRlbnRpZmllciBpblxuICAgIC8vIHdoaWNoIHRoZSB3aWxkY2FyZCBjaGFyYWN0ZXIgY29tcHJpc2VzIGEgbGFiZWwgb3RoZXIgdGhhbiB0aGVcbiAgICAvLyBsZWZ0LW1vc3QgbGFiZWwgKGUuZy4sIGRvIG5vdCBtYXRjaCBiYXIuKi5leGFtcGxlLm5ldCkuXCJcbiAgICAvLyBSRkM2MTI1XG4gICAgaWYgKCF3aWxkY2FyZHMgJiYgL1xcKi8udGVzdChob3N0KSB8fCAvW1xcLlxcKl0uKlxcKi8udGVzdChob3N0KSB8fFxuICAgICAgICAvXFwqLy50ZXN0KGhvc3QpICYmICEvXFwqLipcXC4uK1xcLi4rLy50ZXN0KGhvc3QpKSB7XG4gICAgICByZXR1cm4gLyQuLztcbiAgICB9XG5cbiAgICAvLyBSZXBsYWNlIHdpbGRjYXJkIGNoYXJzIHdpdGggcmVnZXhwJ3Mgd2lsZGNhcmQgYW5kXG4gICAgLy8gZXNjYXBlIGFsbCBjaGFyYWN0ZXJzIHRoYXQgaGF2ZSBzcGVjaWFsIG1lYW5pbmcgaW4gcmVnZXhwc1xuICAgIC8vIChpLmUuICcuJywgJ1snLCAneycsICcqJywgYW5kIG90aGVycylcbiAgICB2YXIgcmUgPSBob3N0LnJlcGxhY2UoXG4gICAgICAgIC9cXCooW2EtejAtOVxcXFwtX1xcLl0pfFtcXC4sXFwtXFxcXFxcXlxcJCs/KlxcW1xcXVxcKFxcKTohXFx8e31dL2csXG4gICAgICAgIGZ1bmN0aW9uKGFsbCwgc3ViKSB7XG4gICAgICAgICAgaWYgKHN1YikgcmV0dXJuICdbYS16MC05XFxcXC1fXSonICsgKHN1YiA9PT0gJy0nID8gJ1xcXFwtJyA6IHN1Yik7XG4gICAgICAgICAgcmV0dXJuICdcXFxcJyArIGFsbDtcbiAgICAgICAgfSk7XG5cbiAgICByZXR1cm4gbmV3IFJlZ0V4cCgnXicgKyByZSArICckJywgJ2knKTtcbiAgfVxuXG4gIHZhciBkbnNOYW1lcyA9IFtdLFxuICAgICAgdXJpTmFtZXMgPSBbXSxcbiAgICAgIGlwcyA9IFtdLFxuICAgICAgbWF0Y2hDTiA9IHRydWUsXG4gICAgICB2YWxpZCA9IGZhbHNlO1xuXG4gIC8vIFRoZXJlJ3JlIHNldmVyYWwgbmFtZXMgdG8gcGVyZm9ybSBjaGVjayBhZ2FpbnN0OlxuICAvLyBDTiBhbmQgYWx0bmFtZXMgaW4gY2VydGlmaWNhdGUgZXh0ZW5zaW9uXG4gIC8vIChETlMgbmFtZXMsIElQIGFkZHJlc3NlcywgYW5kIFVSSXMpXG4gIC8vXG4gIC8vIFdhbGsgdGhyb3VnaCBhbHRuYW1lcyBhbmQgZ2VuZXJhdGUgbGlzdHMgb2YgdGhvc2UgbmFtZXNcbiAgaWYgKGNlcnQuc3ViamVjdGFsdG5hbWUpIHtcbiAgICBjZXJ0LnN1YmplY3RhbHRuYW1lLnNwbGl0KC8sIC9nKS5mb3JFYWNoKGZ1bmN0aW9uKGFsdG5hbWUpIHtcbiAgICAgIGlmICgvXkROUzovLnRlc3QoYWx0bmFtZSkpIHtcbiAgICAgICAgZG5zTmFtZXMucHVzaChhbHRuYW1lLnNsaWNlKDQpKTtcbiAgICAgIH0gZWxzZSBpZiAoL15JUCBBZGRyZXNzOi8udGVzdChhbHRuYW1lKSkge1xuICAgICAgICBpcHMucHVzaChhbHRuYW1lLnNsaWNlKDExKSk7XG4gICAgICB9IGVsc2UgaWYgKC9eVVJJOi8udGVzdChhbHRuYW1lKSkge1xuICAgICAgICB2YXIgdXJpID0gdXJsLnBhcnNlKGFsdG5hbWUuc2xpY2UoNCkpO1xuICAgICAgICBpZiAodXJpKSB1cmlOYW1lcy5wdXNoKHVyaS5ob3N0bmFtZSk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cblxuICAvLyBJZiBob3N0bmFtZSBpcyBhbiBJUCBhZGRyZXNzLCBpdCBzaG91bGQgYmUgcHJlc2VudCBpbiB0aGUgbGlzdCBvZiBJUFxuICAvLyBhZGRyZXNzZXMuXG4gIGlmIChuZXQuaXNJUChob3N0KSkge1xuICAgIHZhbGlkID0gaXBzLnNvbWUoZnVuY3Rpb24oaXApIHtcbiAgICAgIHJldHVybiBpcCA9PT0gaG9zdDtcbiAgICB9KTtcbiAgfSBlbHNlIHtcbiAgICAvLyBUcmFuc2Zvcm0gaG9zdG5hbWUgdG8gY2Fub25pY2FsIGZvcm1cbiAgICBpZiAoIS9cXC4kLy50ZXN0KGhvc3QpKSBob3N0ICs9ICcuJztcblxuICAgIC8vIE90aGVyd2lzZSBjaGVjayBhbGwgRE5TL1VSSSByZWNvcmRzIGZyb20gY2VydGlmaWNhdGVcbiAgICAvLyAod2l0aCBhbGxvd2VkIHdpbGRjYXJkcylcbiAgICBkbnNOYW1lcyA9IGRuc05hbWVzLm1hcChmdW5jdGlvbihuYW1lKSB7XG4gICAgICByZXR1cm4gcmVnZXhwaWZ5KG5hbWUsIHRydWUpO1xuICAgIH0pO1xuXG4gICAgLy8gV2lsZGNhcmRzIGFpbid0IGFsbG93ZWQgaW4gVVJJIG5hbWVzXG4gICAgdXJpTmFtZXMgPSB1cmlOYW1lcy5tYXAoZnVuY3Rpb24obmFtZSkge1xuICAgICAgcmV0dXJuIHJlZ2V4cGlmeShuYW1lLCBmYWxzZSk7XG4gICAgfSk7XG5cbiAgICBkbnNOYW1lcyA9IGRuc05hbWVzLmNvbmNhdCh1cmlOYW1lcyk7XG5cbiAgICBpZiAoZG5zTmFtZXMubGVuZ3RoID4gMCkgbWF0Y2hDTiA9IGZhbHNlO1xuXG5cbiAgICAvLyBNYXRjaCBhZ2FpbnN0IENvbW1vbiBOYW1lIChDTikgb25seSBpZiBubyBzdXBwb3J0ZWQgaWRlbnRpZmllcnMgYXJlXG4gICAgLy8gcHJlc2VudC5cbiAgICAvL1xuICAgIC8vIFwiQXMgbm90ZWQsIGEgY2xpZW50IE1VU1QgTk9UIHNlZWsgYSBtYXRjaCBmb3IgYSByZWZlcmVuY2UgaWRlbnRpZmllclxuICAgIC8vICBvZiBDTi1JRCBpZiB0aGUgcHJlc2VudGVkIGlkZW50aWZpZXJzIGluY2x1ZGUgYSBETlMtSUQsIFNSVi1JRCxcbiAgICAvLyAgVVJJLUlELCBvciBhbnkgYXBwbGljYXRpb24tc3BlY2lmaWMgaWRlbnRpZmllciB0eXBlcyBzdXBwb3J0ZWQgYnkgdGhlXG4gICAgLy8gIGNsaWVudC5cIlxuICAgIC8vIFJGQzYxMjVcbiAgICBpZiAobWF0Y2hDTikge1xuICAgICAgdmFyIGNvbW1vbk5hbWVzID0gY2VydC5zdWJqZWN0LkNOO1xuICAgICAgaWYgKHV0aWwuaXNBcnJheShjb21tb25OYW1lcykpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIGsgPSBjb21tb25OYW1lcy5sZW5ndGg7IGkgPCBrOyArK2kpIHtcbiAgICAgICAgICBkbnNOYW1lcy5wdXNoKHJlZ2V4cGlmeShjb21tb25OYW1lc1tpXSwgdHJ1ZSkpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBkbnNOYW1lcy5wdXNoKHJlZ2V4cGlmeShjb21tb25OYW1lcywgdHJ1ZSkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHZhbGlkID0gZG5zTmFtZXMuc29tZShmdW5jdGlvbihyZSkge1xuICAgICAgcmV0dXJuIHJlLnRlc3QoaG9zdCk7XG4gICAgfSk7XG4gIH1cblxuICByZXR1cm4gdmFsaWQ7XG59O1xuXG4vLyBUYXJnZXQgQVBJOlxuLy9cbi8vICB2YXIgcyA9IHRscy5jb25uZWN0KHtwb3J0OiA4MDAwLCBob3N0OiBcImdvb2dsZS5jb21cIn0sIGZ1bmN0aW9uKCkge1xuLy8gICAgaWYgKCFzLmF1dGhvcml6ZWQpIHtcbi8vICAgICAgcy5kZXN0cm95KCk7XG4vLyAgICAgIHJldHVybjtcbi8vICAgIH1cbi8vXG4vLyAgICAvLyBzLnNvY2tldDtcbi8vXG4vLyAgICBzLmVuZChcImhlbGxvIHdvcmxkXFxuXCIpO1xuLy8gIH0pO1xuLy9cbi8vXG5mdW5jdGlvbiBub3JtYWxpemVDb25uZWN0QXJncyhsaXN0QXJncykge1xuICB2YXIgYXJncyA9IF9fbm9ybWFsaXplQ29ubmVjdEFyZ3MobGlzdEFyZ3MpO1xuICB2YXIgb3B0aW9ucyA9IGFyZ3NbMF07XG4gIHZhciBjYiA9IGFyZ3NbMV07XG5cbiAgaWYgKHR5cGVvZihsaXN0QXJnc1sxXSkgPT09ICdvYmplY3QnKSB7XG4gICAgb3B0aW9ucyA9IHV0aWwuX2V4dGVuZChvcHRpb25zLCBsaXN0QXJnc1sxXSk7XG4gIH0gZWxzZSBpZiAodHlwZW9mKGxpc3RBcmdzWzJdKSA9PT0gJ29iamVjdCcpIHtcbiAgICBvcHRpb25zID0gdXRpbC5fZXh0ZW5kKG9wdGlvbnMsIGxpc3RBcmdzWzJdKTtcbiAgfVxuXG4gIHJldHVybiAoY2IpID8gW29wdGlvbnMsIGNiXSA6IFtvcHRpb25zXTtcbn1cblxuZnVuY3Rpb24gbGVnYWN5Q29ubmVjdChob3N0bmFtZSwgb3B0aW9ucywgTlBOLCBjcmVkZW50aWFscykge1xuICBhc3NlcnQob3B0aW9ucy5zb2NrZXQpO1xuICB2YXIgcGFpciA9IHRscy5jcmVhdGVTZWN1cmVQYWlyKGNyZWRlbnRpYWxzLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICEhb3B0aW9ucy5pc1NlcnZlcixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAhIW9wdGlvbnMucmVxdWVzdENlcnQsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgISFvcHRpb25zLnJlamVjdFVuYXV0aG9yaXplZCxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBOUE5Qcm90b2NvbHM6IE5QTi5OUE5Qcm90b2NvbHMsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzZXJ2ZXJuYW1lOiBob3N0bmFtZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICBsZWdhY3lQaXBlKHBhaXIsIG9wdGlvbnMuc29ja2V0KTtcbiAgcGFpci5jbGVhcnRleHQuX2NvbnRyb2xSZWxlYXNlZCA9IHRydWU7XG4gIHBhaXIub24oJ2Vycm9yJywgZnVuY3Rpb24oZXJyKSB7XG4gICAgcGFpci5jbGVhcnRleHQuZW1pdCgnZXJyb3InLCBlcnIpO1xuICB9KTtcblxuICByZXR1cm4gcGFpcjtcbn1cblxuZnVuY3Rpb24gY29ubmVjdCgvKiBbcG9ydCwgaG9zdF0sIG9wdGlvbnMsIGNiICovKSB7XG4gIHZhciBhcmdzID0gbm9ybWFsaXplQ29ubmVjdEFyZ3MoYXJndW1lbnRzKTtcbiAgdmFyIG9wdGlvbnMgPSBhcmdzWzBdO1xuICB2YXIgY2IgPSBhcmdzWzFdO1xuXG4gIHZhciBkZWZhdWx0cyA9IHtcbiAgICByZWplY3RVbmF1dGhvcml6ZWQ6ICcwJyAhPT0gcHJvY2Vzcy5lbnYuTk9ERV9UTFNfUkVKRUNUX1VOQVVUSE9SSVpFRCxcbiAgICByZXF1ZXN0Q2VydDogdHJ1ZSxcbiAgICBpc1NlcnZlcjogZmFsc2VcbiAgfTtcbiAgb3B0aW9ucyA9IHV0aWwuX2V4dGVuZChkZWZhdWx0cywgb3B0aW9ucyB8fCB7fSk7XG5cbiAgdmFyIGhvc3RuYW1lID0gb3B0aW9ucy5zZXJ2ZXJuYW1lIHx8XG4gICAgICAgICAgICAgICAgIG9wdGlvbnMuaG9zdCB8fFxuICAgICAgICAgICAgICAgICBvcHRpb25zLnNvY2tldCAmJiBvcHRpb25zLnNvY2tldC5faG9zdCB8fFxuICAgICAgICAgICAgICAgICAnMTI3LjAuMC4xJyxcbiAgICAgIE5QTiA9IHt9LFxuICAgICAgY3JlZGVudGlhbHMgPSBvcHRpb25zLmNyZWRlbnRpYWxzIHx8IGNyeXB0by5jcmVhdGVDcmVkZW50aWFscyhvcHRpb25zKTtcbiAgaWYgKHRscy5jb252ZXJ0TlBOUHJvdG9jb2xzKVxuICAgIHRscy5jb252ZXJ0TlBOUHJvdG9jb2xzKG9wdGlvbnMuTlBOUHJvdG9jb2xzLCBOUE4pO1xuXG4gIC8vIFdyYXBwaW5nIFRMUyBzb2NrZXQgaW5zaWRlIGFub3RoZXIgVExTIHNvY2tldCB3YXMgcmVxdWVzdGVkIC1cbiAgLy8gY3JlYXRlIGxlZ2FjeSBzZWN1cmUgcGFpclxuICB2YXIgc29ja2V0O1xuICB2YXIgbGVnYWN5O1xuICB2YXIgcmVzdWx0O1xuICBpZiAodHlwZW9mIHRscy5UTFNTb2NrZXQgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgbGVnYWN5ID0gdHJ1ZTtcbiAgICBzb2NrZXQgPSBsZWdhY3lDb25uZWN0KGhvc3RuYW1lLCBvcHRpb25zLCBOUE4sIGNyZWRlbnRpYWxzKTtcbiAgICByZXN1bHQgPSBzb2NrZXQuY2xlYXJ0ZXh0O1xuICB9IGVsc2Uge1xuICAgIGxlZ2FjeSA9IGZhbHNlO1xuICAgIHNvY2tldCA9IG5ldyB0bHMuVExTU29ja2V0KG9wdGlvbnMuc29ja2V0LCB7XG4gICAgICBjcmVkZW50aWFsczogY3JlZGVudGlhbHMsXG4gICAgICBpc1NlcnZlcjogISFvcHRpb25zLmlzU2VydmVyLFxuICAgICAgcmVxdWVzdENlcnQ6ICEhb3B0aW9ucy5yZXF1ZXN0Q2VydCxcbiAgICAgIHJlamVjdFVuYXV0aG9yaXplZDogISFvcHRpb25zLnJlamVjdFVuYXV0aG9yaXplZCxcbiAgICAgIE5QTlByb3RvY29sczogTlBOLk5QTlByb3RvY29sc1xuICAgIH0pO1xuICAgIHJlc3VsdCA9IHNvY2tldDtcbiAgfVxuXG4gIGlmIChzb2NrZXQuX2hhbmRsZSAmJiAhc29ja2V0Ll9jb25uZWN0aW5nKSB7XG4gICAgb25IYW5kbGUoKTtcbiAgfSBlbHNlIHtcbiAgICAvLyBOb3QgZXZlbiBzdGFydGVkIGNvbm5lY3RpbmcgeWV0IChvciBwcm9iYWJseSByZXNvbHZpbmcgZG5zIGFkZHJlc3MpLFxuICAgIC8vIGNhdGNoIHNvY2tldCBlcnJvcnMgYW5kIGFzc2lnbiBoYW5kbGUuXG4gICAgaWYgKCFsZWdhY3kgJiYgb3B0aW9ucy5zb2NrZXQpIHtcbiAgICAgIG9wdGlvbnMuc29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCBmdW5jdGlvbigpIHtcbiAgICAgICAgYXNzZXJ0KG9wdGlvbnMuc29ja2V0Ll9oYW5kbGUpO1xuICAgICAgICBzb2NrZXQuX2hhbmRsZSA9IG9wdGlvbnMuc29ja2V0Ll9oYW5kbGU7XG4gICAgICAgIHNvY2tldC5faGFuZGxlLm93bmVyID0gc29ja2V0O1xuXG4gICAgICAgIHNvY2tldC5lbWl0KCdjb25uZWN0Jyk7XG4gICAgICB9KTtcbiAgICB9XG4gICAgc29ja2V0Lm9uY2UoJ2Nvbm5lY3QnLCBvbkhhbmRsZSk7XG4gIH1cblxuICBpZiAoY2IpXG4gICAgcmVzdWx0Lm9uY2UoJ3NlY3VyZUNvbm5lY3QnLCBjYik7XG5cbiAgaWYgKCFvcHRpb25zLnNvY2tldCkge1xuICAgIGFzc2VydCghbGVnYWN5KTtcbiAgICB2YXIgY29ubmVjdF9vcHQ7XG4gICAgaWYgKG9wdGlvbnMucGF0aCAmJiAhb3B0aW9ucy5wb3J0KSB7XG4gICAgICBjb25uZWN0X29wdCA9IHsgcGF0aDogb3B0aW9ucy5wYXRoIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbm5lY3Rfb3B0ID0ge1xuICAgICAgICBwb3J0OiBvcHRpb25zLnBvcnQsXG4gICAgICAgIGhvc3Q6IG9wdGlvbnMuaG9zdCxcbiAgICAgICAgbG9jYWxBZGRyZXNzOiBvcHRpb25zLmxvY2FsQWRkcmVzc1xuICAgICAgfTtcbiAgICB9XG4gICAgc29ja2V0LmNvbm5lY3QoY29ubmVjdF9vcHQpO1xuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcblxuICBmdW5jdGlvbiBvbkhhbmRsZSgpIHtcbiAgICBpZiAoIWxlZ2FjeSlcbiAgICAgIHNvY2tldC5fcmVsZWFzZUNvbnRyb2woKTtcblxuICAgIGlmIChvcHRpb25zLnNlc3Npb24pXG4gICAgICBzb2NrZXQuc2V0U2Vzc2lvbihvcHRpb25zLnNlc3Npb24pO1xuXG4gICAgaWYgKCFsZWdhY3kpIHtcbiAgICAgIGlmIChvcHRpb25zLnNlcnZlcm5hbWUpXG4gICAgICAgIHNvY2tldC5zZXRTZXJ2ZXJuYW1lKG9wdGlvbnMuc2VydmVybmFtZSk7XG5cbiAgICAgIGlmICghb3B0aW9ucy5pc1NlcnZlcilcbiAgICAgICAgc29ja2V0Ll9zdGFydCgpO1xuICAgIH1cbiAgICBzb2NrZXQub24oJ3NlY3VyZScsIGZ1bmN0aW9uKCkge1xuICAgICAgdmFyIHNzbCA9IHNvY2tldC5fc3NsIHx8IHNvY2tldC5zc2w7XG4gICAgICB2YXIgdmVyaWZ5RXJyb3IgPSBzc2wudmVyaWZ5RXJyb3IoKTtcblxuICAgICAgLy8gVmVyaWZ5IHRoYXQgc2VydmVyJ3MgaWRlbnRpdHkgbWF0Y2hlcyBpdCdzIGNlcnRpZmljYXRlJ3MgbmFtZXNcbiAgICAgIGlmICghdmVyaWZ5RXJyb3IpIHtcbiAgICAgICAgdmFyIGNlcnQgPSByZXN1bHQuZ2V0UGVlckNlcnRpZmljYXRlKCk7XG4gICAgICAgIHZhciB2YWxpZENlcnQgPSBfX2NoZWNrU2VydmVySWRlbnRpdHkoaG9zdG5hbWUsIGNlcnQpO1xuICAgICAgICBpZiAoIXZhbGlkQ2VydCkge1xuICAgICAgICAgIHZlcmlmeUVycm9yID0gbmV3IEVycm9yKCdIb3N0bmFtZS9JUCBkb2VzblxcJ3QgbWF0Y2ggY2VydGlmaWNhdGVcXCdzICcgK1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICdhbHRuYW1lcycpO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh2ZXJpZnlFcnJvcikge1xuICAgICAgICByZXN1bHQuYXV0aG9yaXplZCA9IGZhbHNlO1xuICAgICAgICByZXN1bHQuYXV0aG9yaXphdGlvbkVycm9yID0gdmVyaWZ5RXJyb3IubWVzc2FnZTtcblxuICAgICAgICBpZiAob3B0aW9ucy5yZWplY3RVbmF1dGhvcml6ZWQpIHtcbiAgICAgICAgICByZXN1bHQuZW1pdCgnZXJyb3InLCB2ZXJpZnlFcnJvcik7XG4gICAgICAgICAgcmVzdWx0LmRlc3Ryb3koKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmVzdWx0LmVtaXQoJ3NlY3VyZUNvbm5lY3QnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmVzdWx0LmF1dGhvcml6ZWQgPSB0cnVlO1xuICAgICAgICByZXN1bHQuZW1pdCgnc2VjdXJlQ29ubmVjdCcpO1xuICAgICAgfVxuXG4gICAgICAvLyBVbmNvcmsgaW5jb21pbmcgZGF0YVxuICAgICAgcmVzdWx0LnJlbW92ZUxpc3RlbmVyKCdlbmQnLCBvbkhhbmdVcCk7XG4gICAgfSk7XG5cbiAgICBmdW5jdGlvbiBvbkhhbmdVcCgpIHtcbiAgICAgIC8vIE5PVEU6IFRoaXMgbG9naWMgaXMgc2hhcmVkIHdpdGggX2h0dHBfY2xpZW50LmpzXG4gICAgICBpZiAoIXNvY2tldC5faGFkRXJyb3IpIHtcbiAgICAgICAgc29ja2V0Ll9oYWRFcnJvciA9IHRydWU7XG4gICAgICAgIHZhciBlcnJvciA9IG5ldyBFcnJvcignc29ja2V0IGhhbmcgdXAnKTtcbiAgICAgICAgZXJyb3IuY29kZSA9ICdFQ09OTlJFU0VUJztcbiAgICAgICAgc29ja2V0LmRlc3Ryb3koKTtcbiAgICAgICAgc29ja2V0LmVtaXQoJ2Vycm9yJywgZXJyb3IpO1xuICAgICAgfVxuICAgIH1cbiAgICByZXN1bHQub25jZSgnZW5kJywgb25IYW5nVXApO1xuICB9XG59O1xuXG5mdW5jdGlvbiBsZWdhY3lQaXBlKHBhaXIsIHNvY2tldCkge1xuICBwYWlyLmVuY3J5cHRlZC5waXBlKHNvY2tldCk7XG4gIHNvY2tldC5waXBlKHBhaXIuZW5jcnlwdGVkKTtcblxuICBwYWlyLmVuY3J5cHRlZC5vbignY2xvc2UnLCBmdW5jdGlvbigpIHtcbiAgICBwcm9jZXNzLm5leHRUaWNrKGZ1bmN0aW9uKCkge1xuICAgICAgLy8gRW5jcnlwdGVkIHNob3VsZCBiZSB1bnBpcGVkIGZyb20gc29ja2V0IHRvIHByZXZlbnQgcG9zc2libGVcbiAgICAgIC8vIHdyaXRlIGFmdGVyIGRlc3Ryb3kuXG4gICAgICBpZiAocGFpci5lbmNyeXB0ZWQudW5waXBlKVxuICAgICAgICBwYWlyLmVuY3J5cHRlZC51bnBpcGUoc29ja2V0KTtcbiAgICAgIHNvY2tldC5kZXN0cm95U29vbigpO1xuICAgIH0pO1xuICB9KTtcblxuICBwYWlyLmZkID0gc29ja2V0LmZkO1xuICBwYWlyLl9oYW5kbGUgPSBzb2NrZXQuX2hhbmRsZTtcbiAgdmFyIGNsZWFydGV4dCA9IHBhaXIuY2xlYXJ0ZXh0O1xuICBjbGVhcnRleHQuc29ja2V0ID0gc29ja2V0O1xuICBjbGVhcnRleHQuZW5jcnlwdGVkID0gcGFpci5lbmNyeXB0ZWQ7XG4gIGNsZWFydGV4dC5hdXRob3JpemVkID0gZmFsc2U7XG5cbiAgLy8gY3ljbGUgdGhlIGRhdGEgd2hlbmV2ZXIgdGhlIHNvY2tldCBkcmFpbnMsIHNvIHRoYXRcbiAgLy8gd2UgY2FuIHB1bGwgc29tZSBtb3JlIGludG8gaXQuICBub3JtYWxseSB0aGlzIHdvdWxkXG4gIC8vIGJlIGhhbmRsZWQgYnkgdGhlIGZhY3QgdGhhdCBwaXBlKCkgdHJpZ2dlcnMgcmVhZCgpIGNhbGxzXG4gIC8vIG9uIHdyaXRhYmxlLmRyYWluLCBidXQgQ3J5cHRvU3RyZWFtcyBhcmUgYSBiaXQgbW9yZVxuICAvLyBjb21wbGljYXRlZC4gIFNpbmNlIHRoZSBlbmNyeXB0ZWQgc2lkZSBhY3R1YWxseSBnZXRzXG4gIC8vIGl0cyBkYXRhIGZyb20gdGhlIGNsZWFydGV4dCBzaWRlLCB3ZSBoYXZlIHRvIGdpdmUgaXQgYVxuICAvLyBsaWdodCBraWNrIHRvIGdldCBpbiBtb3Rpb24gYWdhaW4uXG4gIHNvY2tldC5vbignZHJhaW4nLCBmdW5jdGlvbigpIHtcbiAgICBpZiAocGFpci5lbmNyeXB0ZWQuX3BlbmRpbmcgJiYgcGFpci5lbmNyeXB0ZWQuX3dyaXRlUGVuZGluZylcbiAgICAgIHBhaXIuZW5jcnlwdGVkLl93cml0ZVBlbmRpbmcoKTtcbiAgICBpZiAocGFpci5jbGVhcnRleHQuX3BlbmRpbmcgJiYgcGFpci5jbGVhcnRleHQuX3dyaXRlUGVuZGluZylcbiAgICAgIHBhaXIuY2xlYXJ0ZXh0Ll93cml0ZVBlbmRpbmcoKTtcbiAgICBpZiAocGFpci5lbmNyeXB0ZWQucmVhZClcbiAgICAgIHBhaXIuZW5jcnlwdGVkLnJlYWQoMCk7XG4gICAgaWYgKHBhaXIuY2xlYXJ0ZXh0LnJlYWQpXG4gICAgICBwYWlyLmNsZWFydGV4dC5yZWFkKDApO1xuICB9KTtcblxuICBmdW5jdGlvbiBvbmVycm9yKGUpIHtcbiAgICBpZiAoY2xlYXJ0ZXh0Ll9jb250cm9sUmVsZWFzZWQpIHtcbiAgICAgIGNsZWFydGV4dC5lbWl0KCdlcnJvcicsIGUpO1xuICAgIH1cbiAgfVxuXG4gIGZ1bmN0aW9uIG9uY2xvc2UoKSB7XG4gICAgc29ja2V0LnJlbW92ZUxpc3RlbmVyKCdlcnJvcicsIG9uZXJyb3IpO1xuICAgIHNvY2tldC5yZW1vdmVMaXN0ZW5lcigndGltZW91dCcsIG9udGltZW91dCk7XG4gIH1cblxuICBmdW5jdGlvbiBvbnRpbWVvdXQoKSB7XG4gICAgY2xlYXJ0ZXh0LmVtaXQoJ3RpbWVvdXQnKTtcbiAgfVxuXG4gIHNvY2tldC5vbignZXJyb3InLCBvbmVycm9yKTtcbiAgc29ja2V0Lm9uKCdjbG9zZScsIG9uY2xvc2UpO1xuICBzb2NrZXQub24oJ3RpbWVvdXQnLCBvbnRpbWVvdXQpO1xuXG4gIHJldHVybiBjbGVhcnRleHQ7XG59O1xuXG59KS5jYWxsKHRoaXMscmVxdWlyZShcIjFZaVo1U1wiKSkiXX0=
