<template>
    <h1></h1>
    <div style="width: 600px; margin-left: 50px;">
        <div ref="scrollRef" style="border: 1px solid #ccc; height: 500px; overflow: auto; padding-bottom: 30px;">
            <div
                v-for="(item, index) in chatList" :key="index"
                style="margin-top: 10px;"
            >
                <div>
                    <span>{{ item.name }}</span><span
                        v-if="item.timeStamp"
                        style="margin-left: 10px;"
                    >{{ new Date(item.timeStamp).toLocaleString() }}</span>
                </div>
                <div>{{ item.content }}</div>
            </div>
        </div>
        <div style="display: flex; align-items: end; margin-top: 10px;">
            <a-textarea
                v-model:value="testValue" :placeholder="placeholder"
                style="flex: 1"
                @keyup.enter="submit"
            />
            <a-button
                type="primary" style="margin-left:10px"
                @click="submit"
            >
                发送消息
            </a-button>
            <a-button
                style="margin-left:10px"
                @click="clearHandle"
            >
                清空聊天记录
            </a-button>
        </div>
    </div>
</template>

<script setup>
import {ref} from 'vue';
import {useRoute} from 'vue-router';
import {createWs} from '@/utils/websocket';
const route = useRoute();
const nameMap = {
    '1': '小红',
    '2': '小明',
    '3': '小紫',
    '4': '小暗',
    '5': 'cc姐'
};
let testValue = ref('');
let placeholder = ref('');
let scrollRef = ref(null);
let chatList = ref([]);
let ws = createWs({
    url: 'ws://172.25.104.59:3000',
    isReconnect: true,
    reconnectCount: 50,
    reconnectTime: 1000,
    onOpen: () => {
        console.log('Connection open ...');
        placeholder.value = 'Connection open ...';
        if (!nameMap[route.params.id]) {
            nameMap[route.params.id] = generateUsername();
        }
        ws.send('欢迎' + nameMap[route.params.id] + '进入聊天室');
    },
    onMessage: (e) => {
        placeholder.value = '请输入消息';
        console.log('Received Message: ' + e.data);
        chatList.value.push(JSON.parse(e.data));
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight + 100;
    },
    onClose: () => {
        console.log('Connection closed.');
        placeholder.value = 'Connection closed.';
        testValue.value = '';
    },
    onError: (error) => {
        placeholder.value = 'Connection error.';
        console.error('WebSocket error:', error);
    }
});
const submit = () => {
    let obj =  {
        name: nameMap[route.params.id],
        timeStamp: new Date().getTime(),
        content: testValue.value
    };
    testValue.value = '';
    ws.send(JSON.stringify(obj));
};
const clearHandle = () => {
    chatList.value = [];
};
const generateUsername = () => {
    const adjectives = ['happy', 'silly', 'sleepy', 'funny', 'clever', 'brave', 'friendly'];
    const nouns = ['cat', 'dog', 'bird', 'tiger', 'lion', 'elephant', 'monkey'];

    const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

    const username = randomAdjective + '-' + randomNoun;
    return username;
};
</script>
