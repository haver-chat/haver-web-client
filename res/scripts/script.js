var Chat = function() {
  var exports = {};
  
  var types = {
    LOCATION: 0,
    POST: 1,
    ROOM_INFO: 2,
    CLIENT_INFO: 3
  };
  
  var states = {
    CLOSED: 0,
    OPEN: 1,
    WAITING: 2,
    READY: 3
  };
  
  var state = states.CLOSED;
  var socket = null;
  
  function getLocation(callback) {
    function ret(pos) {
      if (typeof callback != 'undefined') {
        callback({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        });
      }
    }
    function req() {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(ret);
      } else {
        console.log("No geolocation!"); // No geolocation, we dun goofed!
      }
    }
    req();
  }
  
  var Post = function(content, to) {
    this.content = content.trim();
    this.to = typeof to == "undefined" ? [] : to;
  }
  
  var RoomInfo = function(name, radius) {
    this.name = name;
    this.radius = radius;
  }
  
  var open = function() {
    changeState(states.OPEN);
    getLocation(function(pos) {
      send(types.LOCATION, pos);
      changeState(states.WAITING);
    });
  }
  var close = function() {
    changeState(states.CLOSED);
    setTimeout(function() {
      connect();
    }, 1500); // reconnect
  }
  var error = function() {
    console.log("Error");
    socket.close();
  }
  var message = function(m) {
    var message = JSON.parse(m.data);
    if (typeof message.type == 'undefined') console.log("Error: No message type");
    switch(message.type) {
      case types.LOCATION:
        getLocation(function(pos) {
          send(types.LOCATION, pos);
        });
        break;
      case types.POST:
        receiveMessage(message.from, message.content);
        break;
      case types.ROOM_INFO:
        exports.roomInfoRequest(function(name, radius) {
          send(types.ROOM_INFO, new RoomInfo(name, radius));
          changeState(states.WAITING);
        });
        break;
      case types.CLIENT_INFO:
        if (state != states.READY) {
          changeState(states.READY);
          receiveMessage('System', 'Welcome to ' + message.roomName + ', you are the ' + message.clientName);
          message.names.splice(message.names.indexOf(message.clientName), 1);
          if (message.names.length > 0) {
            var names = 'Say hello to: ' + message.names[0];
            for (var i = 1; i < message.names.length; i++) names += ', ' + message.names[i];
            receiveMessage('System', names);
          }
        } else {
          for(var i = 0; i < message.names.length; i++) {
            var status = message.change ? 'joined' : 'left';
            receiveMessage('System', message.names[i] + ' has ' + status + ' the room');
          }
        }
        break;
      default:
        console.log("Error: undefined behaviour with post: \n" + m.data);
        break;
    }
  }
  
  var connect = function() {
    var hostname = location.host;
    var protocol = location.protocol.split('http').join('ws') + '//';
    var host = (hostname == '' || hostname == 'local.haver.chat') ? 'ws://127.0.0.1:8080' : protocol + location.host + '/soc';
    socket = new WebSocket(host);
    socket.onopen = open;
    socket.onclose = close;
    socket.onerror = error;
    socket.onmessage = message;
  }
  
  var send = function(type, message) {
    message['type'] = type;
    console.log("Sending message["+type+"]: " + JSON.stringify(message));
    socket.send(JSON.stringify(message));
  }
  
  function receiveMessage(from, content) {
    exports.onMessage(escapeHtml(from), escapeHtml(content));
  }
  
  function checkState(needle, haystack) {
    if (typeof haystack == 'number') haystack = [haystack];
    return ~haystack.indexOf(needle);
  }
  
  function changeState(newState) {
    if (state != newState) {
      state = newState;
      exports.onStateChange(newState);
    }
  }
  
  // Exports with example client:
  exports.states = states;
  exports.state = state;
  exports.onStateChange = function(s) {
    console.log("Changed state!");
    exports.state = state;
    switch(s) {
      case states.CLOSED:
        console.log("Not connected :(");
        break;
      case states.OPEN:
        console.log("Connected!");
        break;
      case states.WAITING:
        console.log("Waiting on server message");
        break;
      case states.READY:
        console.log("Time to post!");
        break;
    }
  }
  exports.onMessage = function(from, content) {
    console.log(from + ": " + content);
  }
  exports.roomInfoRequest = function(callback) {
    callback("Test Room", 150);
  }
  exports.send = function(message) {
    var post = new Post(message);
    if (post.content.length == 0) return;
    send(types.POST, post);
  }
  exports.connect = connect;
  return exports;
};

// FRONT END:

var chat = Chat();
chat.connect();
chat.onMessage = function(from, content) {
  var div = document.querySelector('#chat-list');
  var bottom = div.scrollTop + div.offsetHeight === div.scrollHeight;
  console.log("Adding messsage to UL");
  var li = document.createElement('li');
  li.innerHTML += "<span>" + from + "</span>: " + content;
  li.firstChild.classList.add("username");
  if (from != "System") li.firstChild.classList.add(from.split(" ")[0].toLowerCase());
  document.querySelector('#chat ul').appendChild(li);
  if (bottom) div.scrollTop = div.scrollHeight - div.offsetHeight;
}
chat.roomInfoRequest = function(callback) {
  splashForm(function(name, radius) {
    callback(name, radius);
  });
}
chat.onStateChange = function(state) {
  var states = chat.states;
  chat.state = state;
  switch(state) {
    case states.CLOSED:
      console.log("State change: CLOSED");
      chat.onMessage("System", "Connection closed");
      break;
    case states.OPEN:
      console.log("State change: OPEN");
      break;
    case states.READY:
      console.log("State change: READY");
      resetChat();
      removeSplash();
      break;
    case states.WAITING:
      console.log("State change: WAITING FOR SERVER MESSAGE");
      break;
    default:
      console.log("Undefined behaviour: invalid state");
      break;
  }
}
document.querySelector("#chat-form").onsubmit = function(e) {
  e.preventDefault();
  try {
    var message = document.querySelector("input[name=msg-box]").value;
    chat.send(message);
    document.querySelector("input[name=msg-box]").value = "";
  } catch(exception) {
    throw new Error(exception.message);
  }
  return false;
}

// SPLASH SCREEN:

var splashForm = function(callback) {
  resetSplash();
  var splash = document.querySelector("#splash");
  var chat = document.querySelector("#chat");
  show(splash)
  hide(chat);
  var img = document.querySelector("#splash img");
  var helper = document.querySelector("#splash .helper");
  var form = document.querySelector("#splash form");
  helper.style.height = "50px";
  img.style.width = "140px";
  show(form);
  form.onsubmit = function(e) {
    e.preventDefault();
    try {
      var name = document.querySelector("#splash form input[name=room-name]").value;
      var radius = parseInt(document.querySelector("#splash form input[name=room-radius]").value);
      callback(name, radius);
    } catch(exception) {
      throw new Error(exception.message);
    }
    return false;
  }
}

var removeSplash = function() {
  var splash = document.querySelector("#splash");
  var chat = document.querySelector("#chat");
  splash.style.position = "absolute";
  splash.style.top = "calc(-100vh - 20px)";
  splash.addEventListener(transitionEndEventName(), function() {
    if (!splash.classList.contains("hidden")) {
      hide(splash);
      resetSplash();
    }
  }, false);
  show(chat);
}

var resetSplash = function() {
  var splash = document.querySelector("#splash");
  splash.style.top = "0";
  splash.style.position = "initial";
  var img = document.querySelector("#splash img");
  var helper = document.querySelector("#splash .helper");
  var form = document.querySelector("#splash form");
  helper.style.height = "100%";
  img.style.width = "300px";
  hide(form);
}

var resetChat = function() {
  var chatList = document.querySelector("#chat-list ul");
  chatList.innerHTML = "";
}

document.querySelector("#splash input[name=room-radius]").addEventListener("input", function(e) {
  document.querySelector("#radius-label").innerHTML = document.querySelector("#splash input[name=room-radius]").value;
}, false);

// OTHER FUNCTIONS:

function hide(elem) {
  if (!elem.classList.contains("hidden")) elem.classList.add("hidden");
}

function show(elem) {
  if (elem.classList.contains("hidden")) elem.classList.remove("hidden");
}

function transitionEndEventName() {
  var i,
      undefined,
      el = document.createElement('div'),
      transitions = {
        'transition':'transitionend',
        'OTransition':'otransitionend', // oTransitionEnd in very old Opera
        'MozTransition':'transitionend',
        'WebkitTransition':'webkitTransitionEnd'
      };
  for (i in transitions) {
    if (transitions.hasOwnProperty(i) && el.style[i] !== undefined) {
      return transitions[i];
    }
  }
}

function escapeHtml(unsafe) {
  if (typeof unsafe == 'undefined') return '';
  var safe = unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  return safe;
}