import axios from 'axios'

/** Backend API-ს ბაზისო URL (.env: VITE_API_URL) */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { Accept: 'application/json' },
})

/** სურათის სრული URL storage-იდან (მაგ. "posters/kraken.jpg") */
export function storageUrl(path?: string | null) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${API_URL}/storage/${path.replace(/^\/+/, '')}`
}
