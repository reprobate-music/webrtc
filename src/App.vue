<template>
  <div>
    <h2>Комната: {{ roomId }}</h2>
    <video ref="localVideo" autoplay muted></video>
    <video ref="remoteVideo" autoplay></video>
    <button @click="startCall">Начать звонок</button>
    <button @click="answerCall" v-if="incomingOffer">Ответить на звонок</button>
    <button @click="shareScreen">Демонстрация экрана</button>
    <button @click="toggleVideo">Включить/выключить видео</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { echoInit } from './echoInit.js';

// Реактивные переменные
const localVideo = ref(null);
const remoteVideo = ref(null);
const localStream = ref(null);
const remoteStream = ref(null);
const roomId = ref(null);
const peerConnection = ref(null);
const incomingOffer = ref(null);

// Конфигурация ICE-серверов
const iceServers = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

// Инициализация WebRTC
const initializeWebRTC = async () => {
  try {
    // Получение локального медиапотока
    localStream.value = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.value.srcObject = localStream.value;

    // Создание RTCPeerConnection
    peerConnection.value = new RTCPeerConnection(iceServers);

    // Добавление локального медиапотока в соединение
    localStream.value.getTracks().forEach((track) => {
      peerConnection.value.addTrack(track, localStream.value);
    });

    // Обработка входящих треков
    peerConnection.value.ontrack = (event) => {
      if (!remoteStream.value) {
        remoteStream.value = new MediaStream();
        remoteVideo.value.srcObject = remoteStream.value;
      }
      remoteStream.value.addTrack(event.track);
    };

    // Обработка ICE-кандидатов
    peerConnection.value.onicecandidate = (event) => {
      if (event.candidate) {
        // Отправка ICE-кандидатов через Laravel Echo
        window.Echo.private(`room-${roomId.value}`).whisper('ice-candidate', {
          candidate: event.candidate,
        });
      }
    };
  } catch (error) {
    console.error('Ошибка при инициализации WebRTC:', error);
  }
};

// Начало звонка
const startCall = async () => {
  try {
    const offer = await peerConnection.value.createOffer();
    await peerConnection.value.setLocalDescription(offer);

    window.Echo.private(`room-${roomId.value}`).whisper('offer', {
      offer: peerConnection.value.localDescription,
    });
  } catch (error) {
    console.error('Ошибка при создании предложения:', error);
  }
};

// Ответ на звонок
const answerCall = async () => {
  try {
    if (!incomingOffer.value) return;

    await peerConnection.value.setRemoteDescription(
        new RTCSessionDescription(incomingOffer.value)
    );

    const answer = await peerConnection.value.createAnswer();
    await peerConnection.value.setLocalDescription(answer);

    window.Echo.private(`room-${roomId.value}`).whisper('answer', {
      answer: peerConnection.value.localDescription,
    });

    incomingOffer.value = null;
  } catch (error) {
    console.error('Ошибка при ответе на звонок:', error);
  }
};

// Демонстрация экрана
const shareScreen = async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection.value.getSenders().find((s) => s.track.kind === 'video');
    if (sender) sender.replaceTrack(screenTrack);
  } catch (error) {
    console.error('Ошибка при демонстрации экрана:', error);
  }
};

// Включение/выключение видео
const toggleVideo = () => {
  const videoTrack = localStream.value.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
};

// Обработка сигналов через Laravel Echo
onMounted(async () => {
  await echoInit();
  roomId.value = '123';

  // Подключение к комнате
  window.Echo.private(`room-${roomId.value}`)
      .listenForWhisper('offer', async ({ offer }) => {
        incomingOffer.value = offer;
        alert('Входящий звонок! Нажмите "Ответить на звонок", чтобы принять.');
      })
      .listenForWhisper('answer', async ({ answer }) => {
        if (
            peerConnection.value.signalingState === 'have-local-offer' ||
            peerConnection.value.signalingState === 'stable'
        ) {
          await peerConnection.value.setRemoteDescription(
              new RTCSessionDescription(answer)
          );
        }
      })
      .listenForWhisper('ice-candidate', async ({ candidate }) => {
        if (candidate) {
          await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
        }
      });

  // Инициализация WebRTC
  await initializeWebRTC();
});
</script>