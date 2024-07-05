<script setup>
import { Peer } from "peerjs";
import {onMounted, reactive, ref} from "vue";

const peerID = ref('')
const connectId = ref('')
let peer = reactive(null)
let peerCall = reactive(null)
let connect = reactive(null)
let localStream = reactive(null)
const remoteVideo = ref(null)

const startAudioCall = async () => {
  connect = peer.connect(connectId.value);
  connect.on('open', function() {
    console.log('Connected to ' + connectId.value);
    connect.on('data', function(data) {
      console.log('Received data:', data);
    });
  });
  connect.on('error', function(err) {
    console.error('Connection error:', err);
  });
  connect.on('close', function() {
    console.log('Соединение закрыто');
  });
  localStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
  peerCall = peer.call(connectId.value, localStream);
  peerCall.on('stream', function (stream) {
    remoteVideo.value.srcObject = stream
  })
}

const endAudioCall = () => {
  if (connect) connect.close();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  if (peerCall) peerCall = null
  if (peer) peer.destroy();
  remoteVideo.value.srcObject = null;
}
const init = () => {
  peer = new Peer();
  peer.on('open', function(id) {
    peerID.value = id
  })
  peer.on('connection', function(dataConnection) {
    console.log('peer connection to ' + dataConnection.peer)
  });
  peer.on('close', function() {
    console.log('peer close')
    endAudioCall()
  });
  peer.on('disconnected', function() {
    console.log('peer disconnected')
    endAudioCall()
  });
  peer.on('error', function(err) {
    console.log('peer error', err)
  });
  peer.on('call', async call => {
    const answer = confirm('Вам звонок. Ответить?')
    if (answer) {
      localStream = await navigator.mediaDevices.getUserMedia({video: false, audio: true});
      call.answer(localStream);
      call.on('stream', stream => {
        remoteVideo.value.srcObject = stream;
      });
    }
  });
}
onMounted(() => {
  init()
})
</script>

<template>
  <section class="card">
    <div class="">My peer ID is: {{ peerID }}</div>
    <input type="text" placeholder="ID кому хочешь набрать" v-model="connectId">
    <div class="flex">
      <video ref="remoteVideo" autoplay></video>
    </div>
    <button @click="startAudioCall">Начать аудиозвонок</button>
    <button @click="endAudioCall">Завершить аудиозвонок</button>
  </section>
</template>

<style scoped>

</style>
