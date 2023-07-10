<template>
    <h1>点对点通信</h1>
    <div style="width: 300px; margin-bottom: 50px; overflow: auto;">
        <div v-if="isAudio">
            语音通话中
        </div>
        <a-button
            v-if="isShowCall && route.params.id === '2'" type="primary"
            @click="reCall"
        >
            接听
        </a-button>
        <a-button
            v-if="route.params.id === '1'"
            type="primary" class="ml10"
            @click="call('audio')"
        >
            语音通话
        </a-button>
        <a-button
            v-if="route.params.id === '1'"
            type="primary" class="ml10"
            @click="call('video')"
        >
            视频通话
        </a-button>
        <a-button
            type="primary" class="ml10"
            @click="stopHandle"
        >
            hang up
        </a-button>
        <video
            id="localVideo"
            width="300"
            height="300"
            playsinline
            autoplay
            controls="controls"
            x5-video-player-type="h5"
        ></video>
        <video
            id="remoteVideo"
            width="300"
            height="300"
            x5-video-player-type="h5"
            controls="controls"
            autoplay
            playsinline
        ></video>
    </div>
</template>
<script setup>
import {ref, onMounted, onBeforeUnmount} from 'vue';
import {useRoute} from 'vue-router';
const route = useRoute();
import {createWs} from '@/utils/websocket';
let isShowCall = ref(false);
let ws = createWs({
    url: 'ws://172.25.104.59:4000',
    isReconnect: true,
    reconnectCount: 50,
    reconnectTime: 1000,
    onOpen: () => {
        console.log('Connection open ...');
    },
    onMessage: async (e) => {
        const data = JSON.parse(e.data);
        if (data['type'] === 'call') {
            if (data.data['type'] === 'audio') {
                isAudio.value = true;
            }
            if (data.data['targetUid'] !== route.params.id) {
                return;
            }
            isShowCall.value = true;
            await initCalleeInfo(data.data['targetUid'], data.data['userId'], data.data['type']);
        }
        if (data['type'] === 'recall') {
            if (data.data['targetUid'] !== route.params.id) {
                return;
            }
            await sendOffer();
        }
        if (data['type'] === 'offer') {
            if (data.data['targetUid'] !== route.params.id) {
                return;
            }
            await onRemoteOffer(data['data']['userId'], data['data']['offer']);
        }
        if (data['type'] === 'answer') {
            if (data.data['targetUid'] !== route.params.id) {
                return;
            }
            console.log('answer', data['data']['answer']);
            await onRemoteAnswer(data['data']['userId'], data['data']['answer']);
        }
        if (data['type'] === 'candidate') {
            if (data.data['targetUid'] !== route.params.id) {
                return;
            }
            localRtcPc.addIceCandidate(data['data'].candidate);
        }
        if (data['type'] === 'close') {
            onClose();
        }
    }
});
const onClose = () => {
    localRtcPc?.close();
    for (const track of localStream.getTracks()) {
        track.stop();
    }
    setDomVideoStream('localVideo', null);
    setDomVideoStream('remoteVideo', null);
    isAudio.value = false;
};
const call = async (type) => {
    let params = {
        'userId': route.params.id, 'targetUid': '2', type};
    ws.send(JSON.stringify({
        type: 'call',
        data: params
    }));
    await initCallerInfo(route.params.id, '2', {audio: true, video: type === 'video'});
};
const reCall = () => {
    let params = {
        'userId': route.params.id, 'targetUid': '1'};
    ws.send(JSON.stringify({
        type: 'recall',
        data: params
    }));
    isShowCall.value = false;
};
let localRtcPc;
let localStream;
let channel;
let isAudio = ref(false);
const initCallerInfo = async (callerId, calleeId, mediaInfo) => {
    // 1. 创建RTCPeerConnection
    // 2. 创建offer
    // 3. 设置本地描述
    // 4. 发送offer
    // 初始化PeerConnection
    localRtcPc = new RTCPeerConnection();
    // 获取本地媒体并添加到PeerConnection中
    localStream = await getLocalUserMedia(mediaInfo);
    // 添加音视频
    for (const track of localStream.getTracks()) {
        localRtcPc.addTrack(track);
    }
    // 本地dom渲染
    if (mediaInfo.video) {
        await setDomVideoStream('localVideo', localStream);
    }
    // 回调监听
    onPcEvent(localRtcPc, callerId, calleeId);
};
const sendOffer = async () => {
    // 创建offer
    let offer = await localRtcPc.createOffer({iceRestart: true});
    console.log('sendOffer', offer);
    // 设置offer未本地描述
    await localRtcPc.setLocalDescription(offer);
    // 发送offer给被呼叫端
    let params = {'targetUid': '2', 'userId': route.params.id, 'offer': offer};
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
    channel = pc.createDataChannel('chat');
    pc.ontrack = function (event) {
        setRemoteDomVideoStream('remoteVideo', event.track);
    };
    pc.onnegotiationneeded = function (e) {
        console.log('重新协商', e);
    };
    pc.ondatachannel = function (ev) {
        console.log('Data channel is created!');
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
    await localRtcPc.setRemoteDescription(answer);
};

const initCalleeInfo = async (localUid, fromUid, type) => {
    // 初始化pc
    localRtcPc = new RTCPeerConnection();
    // 初始化本地媒体信息
    localStream = await getLocalUserMedia({audio: true, video: type === 'video'});
    for (const track of localStream.getTracks()) {
        localRtcPc.addTrack(track);
    }
    // dom渲染
    if (type === 'video') {
        await setDomVideoStream('localVideo', localStream);
    }
    // 监听
    onPcEvent(localRtcPc, localUid, fromUid);
};
const onRemoteOffer = async (fromUid, offer) => {
    console.log('onRemoteOffer', offer);
    // B接受到A的offer 设置为remote desc
    localRtcPc.setRemoteDescription(offer);
    // 创建应答
    let answer = await localRtcPc.createAnswer();
    // 设置为local desc
    await localRtcPc.setLocalDescription(answer);
    // 并通过信令服务器发送给A
    let params = {'targetUid': '1', 'userId': '2', 'answer': answer};
    ws.send(JSON.stringify({
        type: 'answer',
        data: params
    }));
};
const stopHandle = () => {
    isShowCall.value = false;
    ws.send(JSON.stringify({
        type: 'close'
    }));
};
onBeforeUnmount(() => {
    ws.send(JSON.stringify({
        type: 'close'
    }));
});
</script>
<style lang="less">
.ml10 {
    margin-left: 10px;
}
</style>
