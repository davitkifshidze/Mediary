import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios, { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { api, UNAUTHENTICATED_EVENT } from '@/lib/api'

/* ============================================================
   axios-ის interceptor (Tasks GAP-02).

   ⚠️ **ბიბლიოთეკა არ დამატებულა.** `axios-mock-adapter` ამისთვის ზედმეტია —
   axios თვითონ იღებს `adapter`-ს config-იდან, ე.ი. სატესტო ტრანსპორტი ერთი
   ფუნქციაა. `api.defaults.adapter`-ს `api`-ს მოთხოვნები კითხულობენ,
   `axios.defaults.adapter`-ს კი `ensureCsrfCookie()` — ის შიშველ `axios`-ს
   იყენებს სწორედ იმისთვის, რომ ამ interceptor-ში არ დაბრუნდეს.
   ============================================================ */

type Handler = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>

let calls: string[] = []
const realApiAdapter = api.defaults.adapter
const realAxiosAdapter = axios.defaults.adapter

function ok(config: InternalAxiosRequestConfig, data: unknown = {}): Promise<AxiosResponse> {
  return Promise.resolve({ status: 200, statusText: 'OK', headers: {}, config, data } as AxiosResponse)
}

function fail(config: InternalAxiosRequestConfig, status: number, data: unknown = {}): Promise<AxiosResponse> {
  const response = { status, statusText: '', headers: {}, config, data } as AxiosResponse

  return Promise.reject(
    new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_REQUEST', config, null, response),
  )
}

/** ქსელის ჩავარდნა: `response` **საერთოდ არ არის** — ეს ერთადერთი ნიშანია */
function offline(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
  return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, null))
}

function install(handler: Handler) {
  const wrapped: Handler = (config) => {
    calls.push(`${(config.method ?? 'get').toUpperCase()} ${config.url}`)
    return handler(config)
  }
  api.defaults.adapter = wrapped as AxiosAdapter
  axios.defaults.adapter = wrapped as AxiosAdapter
}

/** გამოსვლის მოვლენა — AuthProvider მას ქეშის გასუფთავებით პასუხობს */
function watchUnauth() {
  const seen = vi.fn()
  window.addEventListener(UNAUTHENTICATED_EVENT, seen)
  return { seen, stop: () => window.removeEventListener(UNAUTHENTICATED_EVENT, seen) }
}

beforeEach(() => {
  calls = []
})

afterEach(() => {
  api.defaults.adapter = realApiAdapter
  axios.defaults.adapter = realAxiosAdapter
})

describe('419 — CSRF-ის ვადა', () => {
  it('ერთხელ ანახლებს ქუქის და მოთხოვნას იმეორებს', async () => {
    let attempt = 0
    install((config) => {
      if (config.url?.includes('/sanctum/csrf-cookie')) return ok(config)
      return ++attempt === 1 ? fail(config, 419, { message: 'csrf_token_mismatch' }) : ok(config, { id: 7 })
    })
    const unauth = watchUnauth()

    const { data } = await api.post('/movies', { title: 'x' })

    expect(data).toEqual({ id: 7 })
    expect(calls).toEqual([
      'POST /movies',
      `GET ${api.defaults.baseURL?.replace('/api', '')}/sanctum/csrf-cookie`,
      'POST /movies',
    ])
    // ⚠️ აღდგენილი მოთხოვნა **არ** უნდა აგდებდეს login-ზე
    expect(unauth.seen).not.toHaveBeenCalled()
    unauth.stop()
  })

  it('მეორე 419-ზე ჩერდება და login-ზე აბრუნებს', async () => {
    install((config) => (config.url?.includes('/sanctum/csrf-cookie') ? ok(config) : fail(config, 419)))
    const unauth = watchUnauth()

    await expect(api.post('/movies', { title: 'x' })).rejects.toMatchObject({ response: { status: 419 } })

    // ორი მცდელობა და **ერთი** განახლება — უსასრულო ციკლი გამორიცხულია
    expect(calls.filter((c) => c === 'POST /movies')).toHaveLength(2)
    expect(calls.filter((c) => c.includes('csrf-cookie'))).toHaveLength(1)
    expect(unauth.seen).toHaveBeenCalledTimes(1)
    unauth.stop()
  })

  it('ქუქის ვერ-განახლებაზე მოთხოვნას აღარ იმეორებს', async () => {
    install((config) => (config.url?.includes('/sanctum/csrf-cookie') ? offline(config) : fail(config, 419)))
    const unauth = watchUnauth()

    await expect(api.post('/movies', {})).rejects.toMatchObject({ response: { status: 419 } })

    expect(calls.filter((c) => c === 'POST /movies')).toHaveLength(1)
    expect(unauth.seen).toHaveBeenCalledTimes(1)
    unauth.stop()
  })

  it('login-ის 419 გლობალურ გამოსვლას არ იწვევს', async () => {
    install((config) => (config.url?.includes('/sanctum/csrf-cookie') ? ok(config) : fail(config, 419)))
    const unauth = watchUnauth()

    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError)

    expect(unauth.seen).not.toHaveBeenCalled()
    unauth.stop()
  })
})

describe('401', () => {
  it('გამოსვლის მოვლენას აგდებს და მოთხოვნას არ იმეორებს', async () => {
    install((config) => fail(config, 401))
    const unauth = watchUnauth()

    await expect(api.get('/movies')).rejects.toBeInstanceOf(AxiosError)

    expect(calls).toEqual(['GET /movies'])
    expect(unauth.seen).toHaveBeenCalledTimes(1)
    unauth.stop()
  })

  it('login-ის 401 ფორმაში რჩება', async () => {
    install((config) => fail(config, 401))
    const unauth = watchUnauth()

    await expect(api.post('/auth/login', {})).rejects.toBeInstanceOf(AxiosError)

    expect(unauth.seen).not.toHaveBeenCalled()
    unauth.stop()
  })
})

describe('ქსელის ჩავარდნა', () => {
  it('არც იმეორებს და არც login-ზე აგდებს', async () => {
    install((config) => offline(config))
    const unauth = watchUnauth()

    await expect(api.get('/movies')).rejects.toMatchObject({ code: AxiosError.ERR_NETWORK })

    expect(calls).toEqual(['GET /movies'])
    expect(unauth.seen).not.toHaveBeenCalled()
    unauth.stop()
  })
})
