<template>
  <div>
    <h2>Комната: {{ roomId }}</h2>
    <h3>Локальный поток:</h3>
    <video ref="localVideo" autoplay muted></video>

    <h3>Удалённые потоки:</h3>
    <div class="video-container">

    </div>

    <button @click="startCall">Начать звонок</button>
    <button @click="answerCall" v-if="incomingOffer">Ответить на звонок</button>
<!--    <button @click="shareScreen">Демонстрация экрана</button>-->
<!--    <button @click="toggleVideo">Включить/выключить видео</button>-->
  </div>
</template>

<script setup>
import {ref, onMounted, nextTick} from 'vue';
import { echoInit } from './echoInit.js';

// Реактивные переменные
const localVideo = ref(null);
const remoteVideo = ref(null);
const localStream = ref(null);
const remoteStreams = ref([]);
const roomId = ref(null);
const peerConnection = ref(null);
const incomingOffer = ref(null);
const pendingCandidates = ref([]); // Буфер для ICE-кандидатов

// Конфигурация ICE-серверов
const iceServers = {
  iceServers: [
    {
      urls: "stun:stun.relay.metered.ca:80",
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "d5e54dbbddbdd3648f9e7048",
      credential: "nNLgZr7pgrx1q+K5",
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "d5e54dbbddbdd3648f9e7048",
      credential: "nNLgZr7pgrx1q+K5",
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "d5e54dbbddbdd3648f9e7048",
      credential: "nNLgZr7pgrx1q+K5",
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "d5e54dbbddbdd3648f9e7048",
      credential: "nNLgZr7pgrx1q+K5",
    },
  ],
};

// Инициализация WebRTC
const initializeWebRTC = async () => {
  try {
    // Получение локального медиапотока
    localStream.value = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
    localVideo.value.srcObject = localStream.value;

    // Создание RTCPeerConnection
    peerConnection.value = new RTCPeerConnection(iceServers);

    // Добавление локального медиапотока в соединение
    localStream.value.getTracks().forEach((track) => {
      peerConnection.value.addTrack(track, localStream.value);
    });

    peerConnection.value.oniceconnectionstatechange = () => {
      console.log('ICE Connection State:', peerConnection.value.iceConnectionState);

      if (peerConnection.value.iceConnectionState === 'failed') {
        console.log('Переустановка соединения...');
        peerConnection.value.restartIce(); // Перезапуск ICE-кандидатов
      }
    };

    peerConnection.value.onconnectionstatechange = () => {
      console.log('Connection State:', peerConnection.value.connectionState);
    };

    // Обработка входящих треков
    peerConnection.value.ontrack = (event) => {
      console.log('RTCTrackEvent:', event);

      // Проверяем, есть ли поток уже в списке
      const stream = event.streams[0];
      if (!remoteStreams.value.includes(stream)) {
        remoteStreams.value.push(stream);
      }

      // Динамически привязываем поток к видео-элементу
      nextTick(() => {
        remoteStreams.value.forEach((_stream) => {
          const audio = document.createElement('audio')
          audio.autoplay = true
          audio.muted = false
          audio.volume = 1.0
          audio.srcObject = _stream
          audio.addEventListener('loadedmetadata', async () => {
            try {
              await audio.play()
              console.log('Аудио воспроизводится')
            } catch (err) {
              console.error('Ошибка воспроизведения:', err)
            }
          })
          document.querySelector('.video-container').appendChild(audio)
        })
      });
    };

    // Обработка ICE-кандидатов
    peerConnection.value.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await window.Echo.private(`room-${roomId.value}`).whisper('ice-candidate', {
            candidate: event.candidate,
          });
          console.log('ICE-кандидат отправлен:', event.candidate);
        } catch (error) {
          console.error('Ошибка отправки ICE-кандидата:', error);
        }
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
        console.log('Получен ICE-кандидат:', candidate);
        try {
          await handleIceCandidate(candidate);
        } catch (error) {
          console.error('Ошибка при обработке ICE-кандидата:', error);
        }
      });

  // Инициализация WebRTC
  await initializeWebRTC();
});
</script>
<style>
.video-container {
  display: inline-block;
  margin: 10px;
  width: 300px;
  height: 200px;
}

video {
  width: 100%;
  height: 100%;
  border: 2px solid #000;
  border-radius: 10px;
}
</style>