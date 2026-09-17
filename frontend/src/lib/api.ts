import axios, { type InternalAxiosRequestConfig } from 'axios'

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

/**
 * საცავის მრიცხველი შეიცვალა (17.3) — AuthProvider უსმენს და `['me']`/`['storage']`-ს
 * ანულებს, რომ ჰედერის ინდიკატორი არ ჩამორჩეს.
 *
 * წესი განზრახ **ფართოა**: ყველა multipart მუტაცია (ატვირთვა ყოველთვის FormData-ია)
 * და ყველა DELETE. ასე ახალი ატვირთვის წერტილს ამის დამატება არ სჭირდება; ფასი —
 * იშვიათი ზედმეტი მსუბუქი GET.
 */
export const STORAGE_CHANGED_EVENT = 'mediary:storage-changed'

/**
 * ერთხელ უკვე ვცადეთ CSRF-ის განახლება. მარკერი **თვითონ `config`-ზეა** და არა
 * გარე ცვლადში: ერთდროულად რამდენიმე მოთხოვნა ცვივა და გლობალური დროშა
 * მეორეს დაუმსახურებლად ჩამოართმევდა ცდას.
 */
type RetriedConfig = InternalAxiosRequestConfig & { _csrfRetried?: boolean }

/**
 * login/register-ის საკუთარი შეცდომები ფორმაში ჩანს და გლობალურ logout-ს არ იწვევს —
 * გამოსული მომხმარებლის „გამოსვლა" უაზრობაა.
 */
function isAuthForm(url: string): boolean {
  return url.startsWith('/auth/login') || url.startsWith('/auth/register')
}

api.interceptors.response.use(
  (r) => {
    const method = (r.config.method ?? 'get').toLowerCase()
    if (r.config.data instanceof FormData || method === 'delete') {
      window.dispatchEvent(new Event(STORAGE_CHANGED_EVENT))
    }
    return r
  },
  async (error) => {
    const status = error?.response?.status
    const config = error?.config as RetriedConfig | undefined
    const url: string = config?.url ?? ''

    /*
     * **419 — CSRF ტოკენის/სესიის ვადა** (Tasks GAP-02).
     *
     * `SESSION_LIFETIME` 120 წუთია და იმავე ვადას ატარებს `XSRF-TOKEN` ქუქიც,
     * ე.ი. ღია ტაბში ორი საათის შემდეგ ყოველი მუტაცია 419-ს იღებდა და
     * მომხმარებელს ხელით გადატვირთვამდე არაფერი ეშველებოდა.
     *
     * ⚠️ **POST-ის გამეორება აქ ორმაგ ჩანაწერს ვერ შექმნის.** CSRF-ს
     * `EnsureFrontendRequestsAreStateful`-ის pipeline ამოწმებს — `$next($request)`-მდე —
     * ე.ი. 419 ნიშნავს, რომ მოთხოვნა კონტროლერამდე **საერთოდ არ მისულა**.
     * სწორედ ეს ხდის გამეორებას უსაფრთხოს; სხვა სტატუსზე ასე არ იქნებოდა.
     *
     * ⚠️ **ახალ ტოკენს ხელით არსად ვწერთ.** axios `X-XSRF-TOKEN`-ს ყოველ
     * გაგზავნაზე **ქუქიდან** კითხულობს (`helpers/resolveConfig.js`) და
     * `headers.set()`-ით გადააწერს — ამიტომ იგივე `config` საკმარისია.
     *
     * ⚠️ `ensureCsrfCookie()` შიშველ `axios`-ს იყენებს და არა `api`-ს, ე.ი. ამ
     * interceptor-ში არ ბრუნდება — რეკურსია გამორიცხულია.
     */
    if (status === 419 && config && !config._csrfRetried) {
      config._csrfRetried = true
      const refreshed = await ensureCsrfCookie().then(
        () => true,
        () => false,
      )
      if (refreshed) return api.request(config)
    }

    /*
     * ⚠️ **გამეორების შემდეგაც 419 — ესე იგი სესია აღარ არსებობს**, და არა ის,
     * რომ ტოკენი ჩამორჩა: ახალი ქუქი უკვე აღებულია. ორივე შემთხვევა login-ზე
     * უნდა დაბრუნდეს, თორემ მომხმარებელი გვერდზე რჩება, სადაც ყველა ღილაკი
     * ჩუმად ცვივა. (ხშირად ამ დრომდე 401 უკვე მოვიდა — გამეორებული მოთხოვნა
     * ახალ, არაავტორიზებულ სესიაზე მიდის — და ეს იგივე შტოა.)
     */
    if ((status === 401 || status === 419) && !isAuthForm(url)) {
      window.dispatchEvent(new Event(UNAUTHENTICATED_EVENT))
    }

    return Promise.reject(error)
  },
)
