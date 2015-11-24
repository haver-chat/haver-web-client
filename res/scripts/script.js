var Chat = function() {
  var exports = {};
  
  var types = {
    LOCATION: 0,
    POST: 1,
    ROOM_INFO: 2,
    CLIENT_INFO: 3
  };
  
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
    this.to = typeof to != "undefined" ? to : [];
  }
  
  var RoomInfo = function(name, radius) {
    this.name = name;
    this.radius = radius;
  }
  
  var socket = null;
  
  var open = function() {
    console.log("Connected");
    getLocation(function(pos) {
      send(types.LOCATION, pos);
    });
  }
  var close = function() {
    console.log("Disconnected");
  }
  var error = function() {
    console.log("Error");
    close();
  }
  var message = function(m) {
    var message = JSON.parse(m.data);
    if (typeof message.type == 'undefined');
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
        roomInfoRequest(function(roomInfo) {
          send(types.ROOM_INFO, roomInfo);
        });
        break;
      case types.CLIENT_INFO:
        if (typeof message.clientName == 'undefined') {
          for(var i = 0; i < message.names.length; i++) {
            var status = message.change ? 'joined' : 'left';
            receiveMessage('System', message.names[i] + ' has ' + status + ' the room');
          }
        } else {
          joinRoom();
          receiveMessage('System', 'Welcome to ' + message.roomName + ', you are the ' + message.clientName);
          message.names.splice(message.names.indexOf(message.clientName), 1);
          if (message.names.length > 0) {
            var names = 'Say hello to: ' + message.names[0];
            for (var i = 1; i < message.names.length; i++) names += ', ' + message.names[i];
            receiveMessage('System', names);
          }
        }
      default:
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
    socket.send(JSON.stringify(message));
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
  
  function receiveMessage(from, content) {
    exports.onMessage(escapeHtml(from), escapeHtml(content));
  }
  
  function roomInfoRequest(callback) {
    exports.getRoomInfo(function(name, radius) {
      callback(new RoomInfo(name, radius));
    });
  }
  
  function joinRoom() {
    exports.onJoin();
  }
  
  exports.onJoin = function() {
    console.log("Joined room!");
  }
  
  exports.getRoomInfo = function(callback) {
    callback("Test Room", 150);
  }
  exports.onMessage = function(from, content) {
    console.log(from + ": " + content);
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
chat.getRoomInfo = function(callback) {
  splashForm(function(name, radius) {
    callback(name, radius);
  });
}
chat.onJoin = function() {
  removeSplash();
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
  var h1 = document.querySelector("#splash h1");
  var form = document.querySelector("#splash form");
  h1.style.lineHeight = "48px";
  h1.style.fontSize = "36px";
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
  var form = document.querySelector("#splash form");
  hide(form);
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
        'OTransition':'otransitionend',  // oTransitionEnd in very old Opera
        'MozTransition':'transitionend',
        'WebkitTransition':'webkitTransitionEnd'
      };
  for (i in transitions) {
    if (transitions.hasOwnProperty(i) && el.style[i] !== undefined) {
      return transitions[i];
    }
  }
}