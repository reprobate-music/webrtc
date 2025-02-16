<template>
  <div>
    <h2>Комната: {{ roomId }}</h2>
    <video ref="localVideo" autoplay muted></video>
    <video ref="remoteVideo" autoplay></video>
    <button @click="startCall">Начать звонок</button>
    <button @click="shareScreen">Демонстрация экрана</button>
    <button @click="toggleVideo">Включить/выключить видео</button>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import {echoInit} from "./echoInit.js";

// Реактивные переменные
const localVideo = ref(null);
const remoteVideo = ref(null);
const localStream = ref(null);
const remoteStream = ref(null);
const roomId = ref(null);
const peerConnection = ref(null);

// Конфигурация ICE-серверов (STUN/TURN)
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }, // Google STUN
    // Добавьте TURN-серверы при необходимости
  ],
};

// Инициализация WebRTC
const initializeWebRTC = async () => {
  try {
    // Получение локального медиапотока (аудио и видео)
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
      remoteStream.value = event.streams[0];
      remoteVideo.value.srcObject = remoteStream.value;
    };

    // Обработка ICE-кандидатов
    peerConnection.value.onicecandidate = (event) => {
      if (event.candidate) {
        // Отправка ICE-кандидата через Laravel Echo
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
    // Создание предложения (offer)
    const offer = await peerConnection.value.createOffer();
    await peerConnection.value.setLocalDescription(offer);

    // Отправка предложения через Laravel Echo
    window.Echo.private(`room-${roomId.value}`).whisper('offer', {
      offer: peerConnection.value.localDescription,
    });
  } catch (error) {
    console.error('Ошибка при создании предложения:', error);
  }
};

// Демонстрация экрана
const shareScreen = async () => {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    // Замена локального видео на экран
    const sender = peerConnection.value.getSenders().find((s) => s.track.kind === 'video');
    sender.replaceTrack(screenTrack);
  } catch (error) {
    console.error('Ошибка при демонстрации экрана:', error);
  }
};

// Включение/выключение видео
const toggleVideo = () => {
  const videoTrack = localStream.value.getVideoTracks()[0];
  videoTrack.enabled = !videoTrack.enabled;
};

// Обработка входящих сигналов через Laravel Echo
onMounted(async () => {
  console.log(import.meta.env.VITE_MESSENGER_BASE_URL)
  await echoInit()
  roomId.value = '123'; // Получение ID комнаты из URL

  // Подключение к комнате
  window.Echo.private(`room-${roomId.value}`)
      .listenForWhisper('offer', async ({offer}) => {
        try {
          await peerConnection.value.setRemoteDescription(new RTCSessionDescription(offer));

          // Создание ответа (answer)
          const answer = await peerConnection.value.createAnswer();
          await peerConnection.value.setLocalDescription(answer);

          // Отправка ответа через Laravel Echo
          window.Echo.private(`room-${roomId.value}`).whisper('answer', {
            answer: peerConnection.value.localDescription,
          });
        } catch (error) {
          console.error('Ошибка при обработке предложения:', error);
        }
      })
      .listenForWhisper('answer', async ({answer}) => {
        try {
          await peerConnection.value.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error('Ошибка при обработке ответа:', error);
        }
      })
      .listenForWhisper('ice-candidate', async ({candidate}) => {
        try {
          await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
          console.error('Ошибка при добавлении ICE-кандидата:', error);
        }
      });

  // Инициализация WebRTC
  await initializeWebRTC();
});
</script>