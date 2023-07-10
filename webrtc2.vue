<template>
    <h1>多对多通信</h1>
    <div style="width: 300px; margin-bottom: 50px; margin-left: 50px; overflow: auto;">
        <a-descriptions title="个人信息">
            <a-descriptions-item label="用户名">
                {{ route.params.nickname }}
            </a-descriptions-item>
            <a-descriptions-item label="会议id">
                {{ route.params.roomId }}
            </a-descriptions-item>
            <a-descriptions-item label="用户id">
                {{ route.params.userId }}
            </a-descriptions-item>
        </a-descriptions>
        <p>会议列表</p>
        <a-row>
            <p>{{ nickname }}</p>
            <video
                id="localVideo"
                width="100"
                height="100"
                x5-video-player-type="h5"
                controls="controls"
                autoplay
                playsinline
            ></video>
        </a-row>
        <div>
            <div
                v-for="item in roomUserList"
                :key="item.userId"
            >
                <div
                    v-if="userId !== item.userId" :id="item.userId"
                >
                    <p>{{ item.nickname }}</p>
                </div>
            </div>
        </div>
        <!-- <div>成员列表</div>
        <div v-for="item in roomUserList" :key="item.userId">
            {{ item.nickname }}
        </div> -->
        <div
            v-if="roomId === userId" style="margin-top: 20px;"
            @click="stopHandle"
        >
            <a-button type="primary">
                退出
            </a-button>
        </div>
    </div>
</template>
<script setup>
import {ref, onBeforeUnmount, onMounted, getCurrentInstance} from 'vue';
import {useRoute} from 'vue-router';
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
            roomUserList.value = data.list;
            initMeetingRoomPC();
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
let localStream;
const initMeetingRoomPC = async () => {
    // 获取本地媒体
    localStream = await getLocalUserMedia({video: {
        width: 720,
        height: 480,
        frameRate: {min: 10, ideal: 15, max: 24}
    }, audio: true});
    // 进入会议室静音
    // initMediaStatus();
    // 视频流自己展示
    await setDomVideoStream('localVideo', localStream);
    // 判断当前房间有无其他人
    roomUserList.value.forEach(async (item) => {
        if (item.userId !== userId) {
            await initCalleeInfo(item.userId);
        }
    });
};
const initMediaStatus = () => {
    localStream.getVideoTracks()[0].enabled = false;
    localStream.getAudioTracks()[0].enabled = false;
    proxy.$message.info('进入房间默认已关闭你的麦克风和摄像头，请手动打开');
};
const initCalleeInfo = async (fromUid) => {
    // 1. 创建RTCPeerConnection
    // 2. 创建offer
    // 3. 设置本地描述
    // 4. 发送offer
    // 初始化PeerConnection
    const pcKey = userId + '-' + fromUid;
    if (!rtcPcMaps.get(pcKey)) {
        rtcPcMaps.set(pcKey, new RTCPeerConnection());
    }
    const pc = rtcPcMaps.get(pcKey);
    // 音视频添加到轨道里
    for (const track of localStream.getTracks()) {
	    pc.addTrack(track);
    }
    // 回调监听
    onPcEvent(pc, userId, fromUid);
    // await createDataChannel(pc, userId, fromUid);
    const offer = await pc.createOffer({iceRestart: true});
    // 设置offer未本地描述
    await pc.setLocalDescription(offer);
    // 发送offer给被呼叫端
    const params = {'targetUid': fromUid, 'userId': userId, 'offer': offer};
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
const createRemoteDomVideoStream = (domId, track) => {
    let parentDom  = document.getElementById(domId);
    let id = domId + '-media';
    let video = document.getElementById(id);
    if (!video) {
        video = document.createElement('video');
        video.id = id;
        video.controls = true;
        video.autoplay = true;
        video.muted = false;
        video.playsinline = true;
        video.style.width = '100px';
        video.style.height = '100px';
    }
    let stream = video.srcObject;
    if (stream) {
        stream.addTrack(track);
    }
    else {
        let newStream = new MediaStream();
        newStream.addTrack(track);
        video.srcObject = newStream;
        video.muted = false;
        parentDom.appendChild(video);
    }
};
// 设置本机视频流
const onPcEvent = (pc, localUid, remoteUid) => {
    // channel = pc.createDataChannel('chat');
    pc.ontrack = function (event) {
        createRemoteDomVideoStream(remoteUid, event.track);
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
    onPcEvent(pc, userId, fromUid);
    // await createDataChannel(pc, userId, fromUid);
    // for (const track of localStream.getTracks()) {
    //     pc.addTrack(track);
    // }
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
onMounted(async () => {
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
