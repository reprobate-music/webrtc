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
const pendingCandidates = ref([]); // Буфер для ICE-кандидатов

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

// Обработка входящих ICE-кандидатов
const handleIceCandidate = async (candidate) => {
  if (peerConnection.value.remoteDescription) {
    try {
      await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Ошибка при добавлении ICE-кандидата:', error);
    }
  } else {
    // Если удалённое описание ещё не установлено, сохраняем кандидат в буфер
    pendingCandidates.value.push(candidate);
  }
};

// Обработка отложенных ICE-кандидатов
const processPendingCandidates = async () => {
  for (const candidate of pendingCandidates.value) {
    try {
      await peerConnection.value.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Ошибка при обработке отложенных ICE-кандидатов:', error);
    }
  }
  pendingCandidates.value = []; // Очищаем буфер после обработки
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

    // Обработка всех отложенных ICE-кандидатов
    await processPendingCandidates();
  } catch (error) {
    console.error('Ошибка при ответе на звонок:', error);
  }
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
        try {
          if (
              peerConnection.value.signalingState === 'have-local-offer' ||
              peerConnection.value.signalingState === 'stable'
          ) {
            await peerConnection.value.setRemoteDescription(
                new RTCSessionDescription(answer)
            );

            // Обработка всех отложенных ICE-кандидатов
            await processPendingCandidates();
          }
        } catch (error) {
          console.error('Ошибка при обработке ответа:', error);
        }
      })
      .listenForWhisper('ice-candidate', async ({ candidate }) => {
        await handleIceCandidate(candidate);
      });

  // Инициализация WebRTC
  await initializeWebRTC();
});
</script>
