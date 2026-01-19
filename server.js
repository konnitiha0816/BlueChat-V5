const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000, // 接続切れ防止の設定
});

app.use(express.static('public'));

// サーバー生存確認用（スピンアウト防止）
app.get('/health', (req, res) => res.sendStatus(200));

const rooms = new Map(); // { roomId: { hostId, locked: false } }

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // 1. 通話ルーム作成
    socket.on('create-room', (roomId) => {
        if (rooms.has(roomId)) {
            socket.emit('room-error', 'そのIDは使用されています');
        } else {
            rooms.set(roomId, { hostId: socket.id, locked: false });
            socket.join(roomId);
            socket.emit('room-created', roomId);
        }
    });

    // 2. 参加リクエスト
    socket.on('request-join', (data) => {
        const room = rooms.get(data.roomId);
        if (!room) return socket.emit('join-error', '通話が見つかりません');
        if (room.locked) return socket.emit('join-error', 'ロックされています');
        
        // 主催者に承認要請（ここで音楽トリガー）
        io.to(room.hostId).emit('admin-approval-request', { 
            senderId: socket.id, 
            nickname: data.nickname 
        });
    });

    // 3. 承認処理
    socket.on('approve-user', (targetId) => {
        io.to(targetId).emit('join-approved');
    });

    // 4. チャット・メンション
    socket.on('send-chat', (data) => {
        io.to(data.roomId).emit('receive-chat', data);
    });

    // 5. 管理機能
    socket.on('admin-action', (data) => {
        const room = rooms.get(data.roomId);
        if (room && room.hostId === socket.id) {
            if (data.type === 'lock') room.locked = !room.locked;
            if (data.type === 'kick-all') io.to(data.roomId).emit('force-exit');
            io.to(data.roomId).emit('room-update', { locked: room.locked });
        }
    });

    // 切断時の処理
    socket.on('disconnect', () => {
        // 主催者が落ちたら部屋を消すなどの処理が必要ならここ
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
