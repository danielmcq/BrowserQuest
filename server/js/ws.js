const url               = require("url");
const Log               = require("log");
const wsserver          = require("websocket").server;
const miksagoConnection = require("websocket").connection;
const worlizeRequest    = require("websocket").request;
const http              = require("http");
const Utils             = require("./utils");
const _                 = require("underscore");
const BISON             = require("bison");
const WS                = {};
const useBison          = false;

const log = new Log();

module.exports = WS;


/**
 * Abstract Server and Connection classes
 */
const Server = class Server {
    constructor(port) {
        this.port = port;
    }

    onConnect(callback) {
        this.connection_callback = callback;
    }

    onError(callback) {
        this.error_callback = callback;
    }

    broadcast() {
        throw "Not implemented";
    }

    forEachConnection(callback) {
        _.each(this._connections, callback);
    }

    addConnection(connection) {
        this._connections[connection.id] = connection;
    }

    removeConnection(id) {
        delete this._connections[id];
    }

    getConnection(id) {
        return this._connections[id];
    }
};


const Connection = class Connection {
    constructor(id, connection, server) {
        this._connection = connection;
        this._server = server;
        this.id = id;
    }

    onClose(callback) {
        this.close_callback = callback;
    }

    listen(callback) {
        this.listen_callback = callback;
    }

    broadcast() {
        throw "Not implemented";
    }

    send() {
        throw "Not implemented";
    }

    sendUTF8() {
        throw "Not implemented";
    }

    close(logError) {
        log.info("Closing connection to "+this._connection.remoteAddress+". Error: "+logError);
        this._connection.close();
    }
};



/**
 * MultiVersionWebsocketServer
 *
 * Websocket server supporting draft-75, draft-76 and version 08+ of the WebSocket protocol.
 * Fallback for older protocol versions borrowed from https://gist.github.com/1219165
 */
WS.MultiVersionWebsocketServer = class extends Server {
    constructor(port) {
        super(port);
        this.worlizeServerConfig = {
            // All options *except* 'httpServer' are required when bypassing
            // WebSocketServer.
            maxReceivedFrameSize: 0x10000,
            maxReceivedMessageSize: 0x100000,
            fragmentOutgoingMessages: true,
            fragmentationThreshold: 0x4000,
            keepalive: true,
            keepaliveInterval: 20000,
            assembleFragments: true,
            // autoAcceptConnections is not applicable when bypassing WebSocketServer
            // autoAcceptConnections: false,
            disableNagleAlgorithm: true,
            closeTimeout: 5000
        };
        this._connections = {};
        this._counter = 0;

        const self = this;

        this._httpServer = http.createServer(function(request, response) {
            var path = url.parse(request.url).pathname;
            switch(path) {
            case "/status":
                if(self.status_callback) {
                    response.writeHead(200);
                    response.write(self.status_callback());
                }
                break;
            default:
                response.writeHead(404);
            }
            response.end();
        });

        /*this._httpServer.on('upgrade', (req, socket, head) => {
          socket.write('HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                       'Upgrade: WebSocket\r\n' +
                       'Connection: Upgrade\r\n' +
                       '\r\n');

          socket.pipe(socket); // echo back
        });*/

        this._httpServer.listen(port, function() {
            log.info("Server is listening on port "+port);
        });

        this._miksagoServer = new wsserver({
            httpServer: self._httpServer,
            autoAcceptConnections: true
        });
        // this._miksagoServer = wsserver.createServer();
        // this._miksagoServer.server = this._httpServer;
        log.debug("setup ws server");
        // this._miksagoServer.addListener("connection", function(connection) {
        // this._miksagoServer.addListener("connect", function(connection) {
        this._miksagoServer.on("connect", function(connection) {
            log.debug("ws connect");
            // Add remoteAddress property
            // connection.remoteAddress = connection._socket.remoteAddress;

            // We want to use "sendUTF" regardless of the server implementation
            // connection.sendUTF = connection.send;
            // var c = new WS.miksagoWebSocketConnection(self._createId(), connection, self);
            var c = connection;

            if (self.connection_callback) {
                self.connection_callback(c);
            }
            self.addConnection(c);
        });

        this._httpServer.on("upgrade", function(req, socket, head) {
            if (typeof req.headers["sec-websocket-version"] !== "undefined") {
                log.debug("upgrade websocket connection", req.headers["sec-websocket-version"]);
                // WebSocket hybi-08/-09/-10 connection (WebSocket-Node)
                // var wsRequest = new worlizeRequest(socket, req, self.worlizeServerConfig);
                var wsRequest = req;
                try {
                    // wsRequest.readHandshake();
                    log.debug("ws requested protocol", wsRequest.requestedProtocols);
                    // let requestedProtocol = wsRequest.requestedProtocols[0]||'echo-protocol';
                    // let requestedProtocol = wsRequest.requestedProtocols[0]||'';
                    let requestedProtocol = "";
                    var wsConnection = wsRequest.accept(requestedProtocol, wsRequest.origin);
                    // var c = new WS.worlizeWebSocketConnection(self._createId(), wsConnection, self);
                    var c = wsConnection;
                    if(self.connection_callback) {
                        self.connection_callback(c);
                    }
                    self.addConnection(c);
                }
                catch(e) {
                    log.error("WebSocket Request unsupported by WebSocket-Node: ", e);
                    return;
                }
            } else {
                // WebSocket hixie-75/-76/hybi-00 connection (node-websocket-server)
                if (req.method === "GET" &&
                    (req.headers.upgrade && req.headers.connection) &&
                    req.headers.upgrade.toLowerCase() === "websocket" &&
                    req.headers.connection.toLowerCase() === "upgrade") {
                    new miksagoConnection(self._miksagoServer.manager, self._miksagoServer.options, req, socket, head);
                }
            }
        });
    }

    _createId() {
        return "5" + Utils.random(99) + "" + (this._counter++);
    }

    broadcast(message) {
        this.forEachConnection(function(connection) {
            connection.send(message);
        });
    }

    onRequestStatus(status_callback) {
        this.status_callback = status_callback;
    }
};


/**
 * Connection class for Websocket-Node (Worlize)
 * https://github.com/Worlize/WebSocket-Node
 */
WS.worlizeWebSocketConnection = class extends Connection {
    constructor(id, connection, server) {
        super(id, connection, server);

        var self = this;

        this._connection.on("message", function(message) {
            if(self.listen_callback) {
                if(message.type === "utf8") {
                    if(useBison) {
                        self.listen_callback(BISON.decode(message.utf8Data));
                    } else {
                        try {
                            self.listen_callback(JSON.parse(message.utf8Data));
                        } catch(e) {
                            if(e instanceof SyntaxError) {
                                self.close("Received message was not valid JSON.");
                            } else {
                                throw e;
                            }
                        }
                    }
                }
            }
        });

        this._connection.on("close", function() {
            if(self.close_callback) {
                self.close_callback();
            }
            delete self._server.removeConnection(self.id);
        });
    }

    send(message) {
        var data;
        if(useBison) {
            data = BISON.encode(message);
        } else {
            data = JSON.stringify(message);
        }
        this.sendUTF8(data);
    }

    sendUTF8(data) {
        this._connection.sendUTF(data);
    }
};


/**
 * Connection class for websocket-server (miksago)
 * https://github.com/miksago/node-websocket-server
 */
WS.miksagoWebSocketConnection = class extends Connection {
    constructor(id, connection, server) {
        super(id, connection, server);

        var self = this;

        this._connection.addListener("message", function(message) {
            if(self.listen_callback) {
                if(useBison) {
                    self.listen_callback(BISON.decode(message));
                } else {
                    self.listen_callback(JSON.parse(message));
                }
            }
        });

        this._connection.on("close", function() {
            if(self.close_callback) {
                self.close_callback();
            }
            delete self._server.removeConnection(self.id);
        });
    }

    send(message) {
        var data;
        if(useBison) {
            data = BISON.encode(message);
        } else {
            data = JSON.stringify(message);
        }
        this.sendUTF8(data);
    }

    sendUTF8(data) {
        this._connection.send(data);
    }
};
