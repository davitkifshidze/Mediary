import axios from 'axios'

/** Backend API-ს ბაზისო URL (.env: VITE_API_URL) */
export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: { Accept: 'application/json' },
  // Sanctum SPA (cookie) რეჟიმი: სესია httpOnly ქუქშია, ტოკენს არსად ვინახავთ.
  // axios v1-ში cross-origin რექვესთზე XSRF ჰედერი მხოლოდ `withXSRFToken`-ით ეწერება.
  withCredentials: true,
  withXSRFToken: true,
})

/** სურათის სრული URL storage-იდან (მაგ. "posters/kraken.jpg") */
export function storageUrl(path?: string | null) {
  if (!path) return null
  if (/^https?:\/\//.test(path)) return path
  return `${API_URL}/storage/${path.replace(/^\/+/, '')}`
}

/**
 * CSRF ქუქის მოთხოვნა login/register-ამდე (Sanctum).
 * ერთხელ საკმარისია სესიაზე, მაგრამ იაფია — ყოველი ავტორიზაციის მცდელობამდე ვიძახებთ.
 */
export async function ensureCsrfCookie(): Promise<void> {
  await axios.get(`${API_URL}/sanctum/csrf-cookie`, { withCredentials: true })
}

/** 401-ზე მთელი აპლიკაცია login-ზე უნდა დაბრუნდეს — AuthProvider უსმენს */
export const UNAUTHENTICATED_EVENT = 'mediary:unauthenticated'

api.interceptors.response.use(
  (r) => r,
  (error) => {
    const status = error?.response?.status
    const url: string = error?.config?.url ?? ''
    // login/register-ის საკუთარი შეცდომები ფორმაში ჩანს, გლობალურ logout-ს არ იწვევს
    if (status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT))
    }
    return Promise.reject(error)
  },
)
