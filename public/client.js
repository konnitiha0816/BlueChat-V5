const socket = io({
    reconnection: true, // 自動再接続を有効化
});

let myNick = "";
let currentRoom = "";
let isHost = false;
let lastMentionTime = 0;
let localStream;

// --- 1. 昼夜背景自動切替 ---
function updateBG() {
    const h = new Date().getHours();
    document.body.className = (h >= 5 && h < 17) ? 'day-bg' : 'night-bg';
}
setInterval(updateBG, 60000);
updateBG();

// --- 2. 音楽設定 (ここが魂！) ---
const audioJoin = new Audio('/sounds/ketsui.mp3'); // 主催者用
const audioWait = new Audio('/sounds/battle.mp3'); // 参加者用
audioWait.loop = true;

// --- 3. 九九ロジック ---
let captchaAns = 0;
function startCaptcha() {
    const a = Math.floor(Math.random()*9)+1;
    const b = Math.floor(Math.random()*9)+1;
    captchaAns = a * b;
    document.getElementById('kuku-q').innerText = `${a} × ${b} = ?`;
    show('screen-captcha');
}

function checkCaptcha() {
    if(parseInt(document.getElementById('kuku-a').value) === captchaAns) {
        show('screen-nick');
    } else {
        alert('不正解！'); startCaptcha();
    }
}

function goMenu() {
    myNick = document.getElementById('my-nick').value;
    if(!myNick) return alert('ニックネームを入れてください');
    show('screen-menu');
}

// --- 4. 通話ロジック ---
function showRoomInput() { show('screen-room-input'); }
function backToMenu() { show('screen-menu'); }

function joinRoom() {
    const roomId = document.getElementById('room-id').value;
    if(!roomId) { // 空欄なら新規作成（主催者）
        const newId = Math.random().toString(36).substring(2,8);
        socket.emit('create-room', newId);
        currentRoom = newId;
        isHost = true;
    } else { // 入力あれば参加（参加者）
        currentRoom = roomId;
        isHost = false;
        // 承認待ち音楽スタート
        audioWait.play().catch(e => console.log("再生制限: 画面を操作してください"));
        socket.emit('request-join', { roomId, nickname: myNick });
        alert("承認待ちです...音楽を聴いてお待ちください");
    }
}

// 主催者：部屋作成完了
socket.on('room-created', (id) => {
    document.getElementById('call-id-disp').innerText = id;
    startCall();
});

// 主催者：参加リクエスト受信
socket.on('admin-approval-request', (data) => {
    audioJoin.play(); // 通知音
    if(confirm(`${data.nickname}さんが参加を求めています。承認しますか？`)) {
        socket.emit('approve-user', data.senderId);
    }
});

// 参加者：承認された
socket.on('join-approved', () => {
    audioWait.pause(); // 音楽ストップ
    audioWait.currentTime = 0;
    document.getElementById('call-id-disp').innerText = currentRoom;
    startCall();
});

// 通話開始処理
async function startCall() {
    show('screen-call');
    updateClock();
    // カメラ取得
    try {
        localStream = await navigator.mediaDevices.getUserMedia({video:true, audio:true});
        document.getElementById('main-video').srcObject = localStream;
    } catch(e) {
        alert("カメラ/マイクが許可されていません");
    }
    
    // 主催者以外は管理ボタンを消す
    if(!isHost) document.getElementById('btn-admin').style.display = 'none';
}

// 時計
function updateClock() {
    const now = new Date();
    document.getElementById('call-clock').innerText = now.toLocaleTimeString();
    setTimeout(updateClock, 1000);
}

// 画面切り替え便利関数
function show(id) {
    document.querySelectorAll('.full-screen, #screen-call').forEach(e => e.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// チャットなど
function toggleChat() { document.getElementById('side-chat').classList.toggle('open'); }
function toggleAdmin() { document.getElementById('side-admin').classList.toggle('open'); }
function sendMsg() {
    const txt = document.getElementById('chat-input').value;
    socket.emit('send-chat', { roomId: currentRoom, nick: myNick, text: txt });
    document.getElementById('chat-input').value = "";
}
socket.on('receive-chat', (data) => {
    const p = document.createElement('p');
    p.innerText = `${data.nick}: ${data.text}`;
    document.getElementById('chat-logs').appendChild(p);
    // メンション処理などがあればここに追記
});
function adminAction(type) {
    socket.emit('admin-action', { roomId: currentRoom, type });
}
socket.on('force-exit', () => {
    alert("強制退出されました");
    location.reload();
});
function leaveRoom() { location.reload(); }
