const app = require('express')();
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

server.on('open', function open() {
    console.log('connected');
});
  
server.on('close', function close() {
    console.log('disconnected');
});

server.on('connection', function connection(ws, req) {
    const ip = req.socket.remoteAddress;
    const port = req.socket.remotePort;
    const clientName = ip + ':' + port;

    console.log('%s is connected', clientName)


    ws.on('message', function incoming(message) {
        console.log('received: %s from %s', message, clientName);
        // 广播消息给所有客户端
        server.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                // client.send( clientName + " -> " + message);
                if (message.toString('utf8').startsWith('欢迎')) {
                    client.send(JSON.stringify({
                        content: message.toString('utf8'),
                        name: '服务器',
                        timeStamp: new Date().getTime()
                    }));
                } else {
                    client.send(message.toString('utf8'));
                }
            }
        });
        
    });
});
const roomUserList = [];
const server1 = new WebSocket.Server({ port: 4000 });

server1.on('open', function open() {
    // console.log('connected');
});
  
server1.on('close', function close() {
    // console.log('disconnected');
});

server1.on('connection', function connection(ws, req) {
    const ip = req.socket.remoteAddress;
    const port = req.socket.remotePort;
    const clientName = ip + ':' + port;

    console.log('%s is connected', clientName)

    ws.on('message', function incoming(message) {
        console.log('received: %s from %s', JSON.parse(message.toString('utf8')).type);
        let msg = JSON.parse(message.toString('utf8'));
        if (msg.type === 'join') {
            let index = roomUserList.find((item) => {
                return item.userId === msg.data.userId;
            });
            if (!index) {
                roomUserList.push(msg.data);
            }
            msg.list = roomUserList;
            console.log(index, roomUserList);
        }
        if (msg.type === 'leave') {
            let index = roomUserList.find((item) => {
                return item.userId === msg.data.userId;
            });
            roomUserList.splice(index, 1);
            msg.list = roomUserList;
        }
        // 广播消息给所有客户端
        // let msg = JSON.parse(message.toString('utf8'));
        server1.clients.forEach(function each(client) {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(msg));
            }
        });
    });
});