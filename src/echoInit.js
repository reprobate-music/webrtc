import Pusher from 'pusher-js'
import Echo from 'laravel-echo'

export const echoInit = () => {
  const token = '675|YOHK9idjaQDAWl1ve9pfSzzQ89eMTOGCg0AnDkVsec8e0f80'
  if (token) {
    window.Pusher = Pusher
    window.Echo = new Echo({
      broadcaster: 'reverb',
      key: import.meta.env.VITE_REVERB_APP_KEY,
      wsHost: import.meta.env.VITE_REVERB_HOST,
      wsPort: import.meta.env.VITE_REVERB_PORT ?? 80,
      wssPort: import.meta.env.VITE_REVERB_PORT ?? 443,
      forceTLS: (import.meta.env.VITE_REVERB_SCHEME ?? 'https') === 'https',
      encrypted: true,
      logToConsole: true,
      enabledTransports: ['ws', 'wss'],
      channelAuthorization: {
        endpoint: `${import.meta.env.VITE_MESSENGER_BASE_URL}/api/broadcasting/auth`,
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    })
  }
}
