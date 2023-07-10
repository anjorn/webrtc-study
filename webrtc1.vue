<template>
    <h1>一对多通信</h1>
    <div style="width: 300px; margin-bottom: 50px; margin-left: 50px; overflow: auto;">
        <a-descriptions title="个人信息">
            <a-descriptions-item label="用户名">
                {{ route.params.nickname }}
            </a-descriptions-item>
            <a-descriptions-item label="房间号">
                {{ route.params.roomId }}
            </a-descriptions-item>
            <a-descriptions-item label="用户id">
                {{ route.params.userId }}
            </a-descriptions-item>
        </a-descriptions>
        <div style="position: relative;">
            <video
                v-if="roomId === userId"
                id="localVideo"
                width="300"
                height="300"
                x5-video-player-type="h5"
                controls="controls"
                autoplay
                playsinline
            ></video>
            <video
                v-else
                id="publisherVideo"
                width="300"
                height="300"
                playsinline
                autoplay
                controls="controls"
                x5-video-player-type="h5"
            ></video>
            <vue-danmaku
                v-model:danmus="danmus"
                :speeds="100"
                style="height:100px; width:300px; position: absolute; top: 0; left: 0; background: rgba(0,0,0,0.4)"
            />
        </div>
        <div>成员列表</div>
        <div v-for="item in roomUserList" :key="item.userId">
            {{ item.nickname }}
        </div>
        <div style="display: flex; margin-top: 20px;">
            <a-input
                v-model:value="message" placeholder="发送弹幕"
                @keyup.enter="sendMsgToPub()"
            />
            <a-button
                type="primary" style="margin-left: 10px;"
                @click="sendMsgToPub()"
            >
                发送
            </a-button>
        </div>
        <div
            v-if="roomId === userId" style="margin-top: 20px;"
            @click="stopHandle"
        >
            <a-button type="primary">
                hang up
            </a-button>
        </div>
    </div>
</template>
<script setup>
import {ref, onBeforeUnmount, onMounted, getCurrentInstance} from 'vue';
import {useRoute} from 'vue-router';
import vueDanmaku from 'vue3-danmaku';
const route = useRoute();
import {createWs} from '@/utils/websocket';
const {proxy} = getCurrentInstance();
const {userId, roomId, nickname} = route.params;
let ws = createWs({
    url: 'ws://172.25.104.59:4000',
    isReconnect: true,
    reconnectCount: 50,
    reconnectTime: 1000,
    onOpen: () => {
        console.log('Connection open ...');
        joinRoom();
    },
    onMessage: async (e) => {
        const data = JSON.parse(e.data);
        if (data.type === 'join') {
            proxy.$message.success(data.data.nickname + '加入房间');
            console.log(1111, data.list);
            roomUserList.value = data.list;
        }
        if (data.type === 'leave') {
            proxy.$message.success(data.data.nickname + '离开房间');
            roomUserList.value = data.list;
        }
        if (data.type === 'offer') {
            if (data.data['targetUid'] !== userId) {
                return;
            }
            await onRemoteOffer(data['data']['userId'], data['data']['offer']);
        }
        if (data.type === 'answer') {
            if (data.data['targetUid'] !== userId) {
                return;
            }
            await onRemoteAnswer(data['data']['userId'], data['data']['answer']);
        }
        if (data.type === 'candidate') {
            if (data.data['targetUid'] !== userId) {
                return;
            }
            const pcKey = userId + '-' + data['data']['userId'];
            const pc = rtcPcMaps.get(pcKey);
            pc.addIceCandidate(data['data'].candidate);
        }
    }
});
// 房间成员
const roomUserList = ref([]);
const rtcPcMaps = new Map();
const dataChannelMap = new Map();
const initCalleeInfo = async () => {
    // 1. 创建RTCPeerConnection
    // 2. 创建offer
    // 3. 设置本地描述
    // 4. 发送offer
    // 初始化PeerConnection
    const pcKey = userId + '-' + roomId;
    if (!rtcPcMaps.get(pcKey)) {
        rtcPcMaps.set(pcKey, new RTCPeerConnection());
    }
    const pc = rtcPcMaps.get(pcKey);
    pc.addTransceiver('audio', {direction: 'recvonly'});
    pc.addTransceiver('video', {direction: 'recvonly'});
    // 回调监听
    onPcEvent(pc, userId, roomId);
    await createDataChannel(pc, userId, roomId);
    const offer = await pc.createOffer({iceRestart: true});
    // 设置offer未本地描述
    await pc.setLocalDescription(offer);
    // 发送offer给被呼叫端
    const params = {'targetUid': roomId, 'userId': userId, 'offer': offer};
    // 发送websocket消息
    ws.send(JSON.stringify({
        type: 'offer',
        data: params
    }));
};
// 设置本机视频流
const setDomVideoStream = (domId, newStream) => {
    let video = document.getElementById(domId);
    let stream = video.srcObject;
    if (stream) {
        stream.getAudioTracks().forEach(e => {
            stream.removeTrack(e);
        });
        stream.getVideoTracks().forEach(e => {
            stream.removeTrack(e);
        });
    }
    video.srcObject = newStream;
    video.autoplay = true;
    video.muted = false;
};
// 设置远程视频流
const setRemoteDomVideoStream = (domId, track) => {
    let video = document.getElementById(domId);
    let stream = video.srcObject;
    if (stream) {
        stream.addTrack(track);
    }
    else {
        let newStream = new MediaStream();
        newStream.addTrack(track);
        video.srcObject = newStream;
        video.muted = false;
        video.autoplay = true;
    }
};
// 设置本机视频流
const onPcEvent = (pc, localUid, remoteUid) => {
    // channel = pc.createDataChannel('chat');
    pc.ontrack = function (event) {
        setRemoteDomVideoStream('publisherVideo', event.track);
    };
    pc.onnegotiationneeded = function (e) {
        console.log('重新协商', e);
    };
    pc.ondatachannel = (ev) => {
        console.log('Data channel is created!');
        ev.channel.onmessage = (data) => {
            console.log('用户：' + remoteUid + ' 数据通道消息', data.data);
            // 弹幕上屏幕
            onAllMessage(data.data);
        };
    };
    pc.onicecandidate = (event) => {
        if (event.candidate) {
            ws.send(JSON.stringify({
                type: 'candidate',
                data: {'targetUid': remoteUid, 'userId': localUid, 'candidate': event.candidate}
            }));
        }
        else {
        /* 在此次协商中，没有更多的候选了 */
            console.log('在此次协商中，没有更多的候选了');
        }
    };
};
const getLocalUserMedia = async (constraints) => {
    return await navigator.mediaDevices.getUserMedia(constraints);
};
const onRemoteAnswer = async (fromUid, answer) => {
    const pcKey = userId + '-' + fromUid;
    const pc = rtcPcMaps.get(pcKey);
    await pc.setRemoteDescription(answer);
};

const onRemoteOffer = async (fromUid, offer) => {
    const pcKey = userId + '-' + fromUid;
    let pc = rtcPcMaps.get(pcKey);
    if (!pc) {
        pc = new RTCPeerConnection();
        rtcPcMaps.set(pcKey, pc);
    }
    console.log('主播监听到远端offer');
    onPcEvent(pc, userId, fromUid);
    await createDataChannel(pc, userId, fromUid);
    for (const track of localStream.getTracks()) {
        pc.addTrack(track);
    }
    // B接受到A的offer 设置为remote desc
    pc.setRemoteDescription(offer);
    // 创建应答
    const answer = await pc.createAnswer();
    // 设置为local desc
    await pc.setLocalDescription(answer);
    // 并通过信令服务器发送给
    let params = {'targetUid': fromUid, 'userId': userId, 'answer': answer};
    ws.send(JSON.stringify({
        type: 'answer',
        data: params
    }));
};
const createDataChannel = (pc, localUid, remoteUid) => {
    const channel = pc.createDataChannel(localUid + '-' + remoteUid);
    dataChannelMap.delete(localUid + '-' + remoteUid);
    dataChannelMap.set(localUid + '-' + remoteUid, channel);
};
let danmus = ref([]);
const onAllMessage = (msg) => {
    danmus.value.push(msg); // 收到消息上屏幕
    // 主播收到客户端的消息 广播
    if (roomId === userId) {
        dataChannelMap.forEach((index, k) => {
            dataChannelMap.get(k).send(msg);
        });
    }
};
let message = ref('');
/**
 * 发布弹幕
 */
const sendMsgToPub = (msg = undefined) => {
    if (!msg) {
        msg = message.value;
    }
    // 如果是主播 则遍历所有数据通道给每个客户端发送消息
    if (roomId === userId) {
        dataChannelMap.forEach((index, k) => {
            dataChannelMap.get(k).send(msg);
        });
        danmus.value.push(msg); // 收到消息上屏幕
    }
    else {
        // 私信给主播 主播收到再广播（所以无需自己上屏幕）
        clientDataChannelMsg(userId, roomId, msg);
    }
    message.value = undefined;
};
const clientDataChannelMsg = (localUid, remoteUid, msg) => {
    let c = dataChannelMap.get(localUid + '-' + remoteUid);
    if (c) {
        c.send(msg);
    }
};
const joinRoom = () => {
    ws.send(JSON.stringify({
        type: 'join',
        data: {
            nickname: nickname,
            roomId: roomId,
            userId: userId
        }
    }));
};
const leaveRoom = () => {
    ws.send(JSON.stringify({
        type: 'leave',
        data: {
            nickname: nickname,
            roomId: roomId,
            userId: userId
        }
    }));
};
const stopHandle = () => {
    for (const track of localStream.getTracks()) {
        track.stop();
    }
    setDomVideoStream('localVideo', null);
};
let localStream;
onMounted(async () => {
    if (roomId === userId) {
        // 获取本地媒体并添加到PeerConnection中
        localStream = await getLocalUserMedia({video: true, audio: true});
        await setDomVideoStream('localVideo', localStream);
    }
    else {
        initCalleeInfo();
    }
});
onBeforeUnmount(() => {
    ws.send(JSON.stringify({
        type: 'close'
    }));
    leaveRoom();
});
</script>
<style lang="less">
.ml10 {
    margin-left: 10px;
}
</style>
