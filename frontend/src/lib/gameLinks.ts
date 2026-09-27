import type { GameLink, GameLinkStore } from '@/api/games'

/* ============================================================
   **თამაშის ბმული — „სად" ჰოსტიდან** (Tasks §22.3).

   ⚠️ **ეს მოხერხებაა და არა წესი**: backend-ი `store`-ს თვითონ ავსებს
   (`Game::normalizeLink()`), როცა ტიპი „მაღაზიაა" და მაღაზია არ წერია.
   აქ მხოლოდ ის ხდება, რისი თქმაც სერვერს არ შეუძლია — ახალი რიგის
   ნაგულისხმევი „სხვა" Steam-ის ბმულის ჩასმისას „მაღაზია / Steam" ხდება.
   ⚠️ **მომხმარებლის ცხადი არჩევანი არ იცვლება**: „DLC"-ად მონიშნული
   Steam-ის ბმული DLC რჩება.

   ⚠️ **სია `Game::STORE_HOSTS`-ის სარკეა** — `RegistryConsistencyTest`
   ორივეს ერთმანეთს ადარებს.
   ============================================================ */

/** ჰოსტი → მაღაზია; ქვედომენიც ითვლება, მსგავსი სახელი — არა */
const STORE_HOSTS: Record<string, GameLinkStore> = {
  'steampowered.com': 'steam',
  'steamcommunity.com': 'steam',
  'epicgames.com': 'epic',
  'gog.com': 'gog',
  'playstation.com': 'psn',
  'xbox.com': 'xbox',
}

export function storeFromUrl(url: string): GameLinkStore | null {
  let host: string

  try {
    host = new URL(url.trim()).hostname.toLowerCase()
  } catch {
    // ჯერ დაუმთავრებელი მისამართი — ჯერ არაფერს ვამბობთ
    return null
  }

  host = host.replace(/^www\./, '')

  for (const [domain, store] of Object.entries(STORE_HOSTS)) {
    if (host === domain || host.endsWith(`.${domain}`)) return store
  }

  return null
}

/**
 * ჩაშენებადი ვიდეოს ჰოსტები — `VideoUrl::parse()`-ის სარკე (`embed_url`-იანი).
 * ⚠️ მხოლოდ მინიშნებისთვის: გადაწყვეტს სერვერი (`Game::splitVideoLinks()`).
 */
const VIDEO_HOSTS = ['youtube.com', 'm.youtube.com', 'youtu.be', 'youtube-nocookie.com', 'vimeo.com', 'player.vimeo.com', 'dailymotion.com', 'dai.ly']

/** ტრეილერი/გზამკვლევი → თამაშის ვიდეო (`Game::VIDEO_LINK_KINDS`) */
const VIDEO_KINDS = new Set(['trailer', 'guide'])

/**
 * **ეს ბმული შენახვისას თამაშის ვიდეოდ იქცევა?** (Tasks §22.4, Q15)
 *
 * ⚠️ ფორმა ამას ხმამაღლა ამბობს — თორემ რიგი შენახვის შემდეგ „გაქრებოდა"
 * ბმულებიდან და „დავკარგე" წაიკითხებოდა.
 */
export function becomesVideo(link: GameLink): boolean {
  if (!VIDEO_KINDS.has(link.kind ?? 'other')) return false

  try {
    const host = new URL(link.url.trim()).hostname.toLowerCase().replace(/^www\./, '')
    return VIDEO_HOSTS.includes(host)
  } catch {
    return false
  }
}

/**
 * მისამართის შეცვლა რიგში. ⚠️ ტიპს მხოლოდ ნაგულისხმევ „სხვას" ცვლის —
 * და მაღაზიის რიგს მაღაზიას მხოლოდ მაშინ უწერს, თუ ის ჯერ არ აურჩევია.
 */
export function withUrl<T extends GameLink>(link: T, url: string): T {
  const store = storeFromUrl(url)
  const kind = link.kind ?? 'other'

  if (store && kind === 'other') return { ...link, url, kind: 'store', store }
  if (store && kind === 'store' && !link.store) return { ...link, url, store }

  return { ...link, url }
}
