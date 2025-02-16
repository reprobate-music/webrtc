import axios from 'axios'

const http = axios.create({
  baseURL: `${import.meta.env.VITE_MESSENGER_BASE_URL}/api/messenger/`,
})

http.interceptors.request.use((config) => ({...config}), (error) => Promise.reject(error))

const token = '675|YOHK9idjaQDAWl1ve9pfSzzQ89eMTOGCg0AnDkVsec8e0f80'
http.defaults.headers.common.Authorization = `Bearer ${token}`
http.defaults.headers.common.version = import.meta.env.VITE_VERSION
export default http
