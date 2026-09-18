import type { VideoPlatform } from '@/api/videos'

/* ============================================================
   embed-ის ერთადერთი წყარო ფრონტზე (Tasks §7.2).

   ⚠️ **ნედლი HTML არსად ირენდერება** — `<iframe src>`-ში მხოლოდ backend-ის
   ნაშენი `embed_url` ხვდება (`App\Support\VideoUrl`), ჰოსტი აქვე ხელახლა
   მოწმდება, პარამეტრებს კი `URL`-ით ვამატებთ. ეს პროექტის მყარი წესია.

   ⚠️ allowlist **აქ ერთხელ წერია** — `VideoEmbed`-საც აქედან მოაქვს. ორი
   ასლი პირველივე ახალ ჰოსტზე დაშორდებოდა ერთმანეთს.
   ============================================================ */

/** დაშვებული embed-ჰოსტები — `VideoUrl::EMBED_HOSTS`-ის სარკე */
const ALLOWED_EMBED_HOSTS = [
  'www.youtube-nocookie.com',
  'player.vimeo.com',
  'geo.dailymotion.com',
]

export function isAllowedEmbed(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ALLOWED_EMBED_HOSTS.includes(parsed.host)
  } catch {
    return false
  }
}

/**
 * იგივე ბმული, ოღონდ დასაკრავად: ავტოდაკვრა + JS API.
 *
 * ⚠️ `enablejsapi`/`origin` YouTube-ისთვის **სავალდებულოა** — მათ გარეშე
 * ფრეიმი `postMessage`-ს არც აგზავნის და არც იღებს, ე.ი. „დამთავრდა" ვერ
 * გავიგებთ და ავტომატური გადასვლა (§7.2-ის არსი) არ იმუშავებდა.
 */
export function playableEmbedSrc(
  embedUrl: string | null | undefined,
  platform: VideoPlatform,
): string | null {
  if (!isAllowedEmbed(embedUrl)) return null

  const url = new URL(embedUrl as string)
  url.searchParams.set('autoplay', '1')

  if (platform === 'youtube') {
    url.searchParams.set('enablejsapi', '1')
    url.searchParams.set('playsinline', '1')
    url.searchParams.set('rel', '0')
    url.searchParams.set('origin', window.location.origin)
  }
  if (platform === 'vimeo') {
    // Vimeo-ს postMessage API ჩართულია by default; `api=1` ძველ პლეერს ეხება
    url.searchParams.set('playsinline', '1')
  }

  return url.toString()
}

/** სცენიდან ამოკითხული მდგომარეობა — ოთხი, სამივე პლატფორმისთვის ერთი ენა */
export type EmbedEvent = 'ready' | 'playing' | 'paused' | 'ended'

/** YouTube-ის `playerState` → ჩვენი ენა (3 = ბუფერი, 5 = ჩადგმული — გვერდს ვუვლით) */
const YT_STATE: Record<number, EmbedEvent> = { 0: 'ended', 1: 'playing', 2: 'paused' }

/**
 * `postMessage`-ის შიგთავსი ობიექტად.
 *
 * ⚠️ სამი ფორმა არსებობს: JSON-სტრიქონი (YouTube), უკვე გაპარსული ობიექტი
 * (Vimeo) და query-string (`event=video_end&…`, Dailymotion-ის ძველი პლეერი).
 */
function decode(data: unknown): Record<string, unknown> | null {
  if (data && typeof data === 'object') return data as Record<string, unknown>
  if (typeof data !== 'string') return null

  const raw = data.trim()
  if (raw.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw)
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
    } catch {
      return null
    }
  }
  if (raw.includes('=')) {
    const out: Record<string, unknown> = {}
    new URLSearchParams(raw).forEach((value, key) => {
      out[key] = value
    })
    return out
  }
  return null
}

/** `message`-ის შიგთავსი → მოვლენა, ან `null` (უმეტესობა `timeupdate`-ია) */
export function embedEventFrom(data: unknown): EmbedEvent | null {
  const msg = decode(data)
  if (!msg) return null

  // ---- YouTube: მდგომარეობა რიცხვია და `info`-ში ზის
  if (msg.event === 'infoDelivery' && msg.info && typeof msg.info === 'object') {
    const state = (msg.info as { playerState?: unknown }).playerState
    return typeof state === 'number' ? (YT_STATE[state] ?? null) : null
  }
  if (msg.event === 'onStateChange' && typeof msg.info === 'number') {
    return YT_STATE[msg.info] ?? null
  }
  if (msg.event === 'onReady') return 'ready'

  // ---- Vimeo / Dailymotion: მოვლენა სახელითაა
  switch (msg.event) {
    case 'ended':
    case 'video_end':
    case 'videoend':
      return 'ended'
    case 'play':
    case 'playing':
      return 'playing'
    case 'pause':
      return 'paused'
    case 'ready':
      return 'ready'
    default:
      return null
  }
}

/**
 * ხელის ჩამორთმევა — ამის გარეშე ფრეიმი მოვლენებს არ გვიგზავნის.
 * ⚠️ პასუხისმგებლობა გამგზავნზეა: ფრეიმი მზად რომ არ იყოს, შეტყობინება
 * უბრალოდ იკარგება — ამიტომ გამომძახებელი რამდენჯერმე იმეორებს.
 */
export function embedHandshake(platform: VideoPlatform): string[] {
  if (platform === 'youtube') {
    return [
      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
      JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onStateChange'] }),
    ]
  }
  if (platform === 'vimeo') {
    return ['ended', 'play', 'pause'].map((value) =>
      JSON.stringify({ method: 'addEventListener', value }),
    )
  }
  return []
}

/** დაკვრა/პაუზა ფრეიმისთვის — თითოეულ პლატფორმას თავისი სიტყვა აქვს */
export function embedCommand(platform: VideoPlatform, command: 'play' | 'pause'): string | null {
  if (platform === 'youtube') {
    return JSON.stringify({
      event: 'command',
      func: command === 'play' ? 'playVideo' : 'pauseVideo',
      args: [],
    })
  }
  if (platform === 'vimeo') return JSON.stringify({ method: command })
  if (platform === 'dailymotion') return JSON.stringify({ command })
  return null
}
