import type { Credential, CredentialUsage } from '@/api/credentials'

/* ============================================================
   **გარე წყაროები — სია, სახელები, ჯგუფები და ბარათის მდგომარეობა
   (Tasks §21 → §30).**

   ⚠️ **`CREDENTIAL_PROVIDERS` backend-ის `CredentialProviders::keys()`-ის
   სარკეა** და `RegistryConsistencyTest` მას წყაროდან კითხულობს — ახალი
   წყარო ერთ მხარეს რომ დაემატოს, ბარათი ან ჩუმად არ გამოჩნდებოდა, ან
   უცნობ სახელს დახატავდა.

   ⚠️ **§30-იდან (Q38) გასაღები მხოლოდ მომხმარებლისაა** — „საერთო"
   მდგომარეობა აღარ არსებობს. ბარათი ხუთ რამეს არჩევს, რადგან ხუთივე სხვა
   ქმედებას ითხოვს: ჩემია (მუშაობს) · გამორთულია (ჩართე) · შეუვსებელია
   (მეორე ველი აკლია) · არ არის (ჩაწერე) · ვერ იშიფრება (ხელახლა ჩაწერე).
   ============================================================ */

export const CREDENTIAL_PROVIDERS = [
  'tmdb',
  'gemini',
  'rawg',
  'igdb',
  'serpapi',
  'serper',
  'youtube',
  'telegram',
] as const

export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number]

/** ბრენდის სრული სახელი — ბარათის სათაურისთვის; არ ითარგმნება */
export const CREDENTIAL_BRAND: Record<CredentialProvider, string> = {
  tmdb: 'TMDB',
  gemini: 'Google Gemini',
  rawg: 'RAWG.io',
  igdb: 'IGDB (Twitch)',
  serpapi: 'SerpApi',
  serper: 'Serper.dev',
  youtube: 'YouTube Data API',
  telegram: 'Telegram',
}

/**
 * ტექსტში ჩასასმელი მოკლე სახელი („TMDB-ის გასაღები არ გაქვს").
 * ⚠️ სრული სახელი („IGDB (Twitch)-ის") წინადადებაში უხერხულად ჯდება.
 */
const SHORT: Record<CredentialProvider, string> = {
  tmdb: 'TMDB',
  gemini: 'Gemini',
  rawg: 'RAWG',
  igdb: 'IGDB',
  serpapi: 'SerpApi',
  serper: 'Serper',
  youtube: 'YouTube',
  telegram: 'Telegram',
}

export function isCredentialProvider(value: unknown): value is CredentialProvider {
  return typeof value === 'string' && (CREDENTIAL_PROVIDERS as readonly string[]).includes(value)
}

/** უცნობი წყარო (ახალი სერვერი, ძველი ტაბი) ნედლი სახელით ჩანს და არ ცვივა */
export function credentialShortName(provider: string): string {
  return isCredentialProvider(provider) ? SHORT[provider] : provider
}

/**
 * **გვერდის ჯგუფები (§30.3)** — რისთვის სჭირდება ადამიანს ეს გასაღები.
 * ⚠️ ყოველი წყარო ზუსტად ერთ ჯგუფშია; `credentials.test.ts` ამას ამოწმებს,
 * თორემ ახალი წყარო ჩუმად გაქრებოდა გვერდიდან.
 */
export const CREDENTIAL_GROUPS = [
  { key: 'media', providers: ['tmdb', 'rawg', 'igdb', 'youtube'] },
  { key: 'translation', providers: ['gemini'] },
  { key: 'web', providers: ['serpapi', 'serper'] },
  { key: 'notify', providers: ['telegram'] },
] as const satisfies readonly { key: string; providers: readonly CredentialProvider[] }[]

export type CredentialState = 'mine' | 'off' | 'partial' | 'none' | 'undecryptable'

/**
 * ბარათის მდგომარეობა — **ერთი ფუნქცია** სიისა და მოდალისთვის.
 *
 * ⚠️ რიგი მნიშვნელოვანია: გაუშიფრავი რიგი `source`-ით `none`-ია (აპი
 * მართლაც ასე იქცევა), მაგრამ ადამიანს სხვა რამ უნდა ეთქვას — „ხელახლა
 * ჩაწერე" და არა „ჩაწერე".
 */
export function credentialState(c: Pick<Credential, 'source' | 'undecryptable' | 'is_active' | 'fields'>): CredentialState {
  if (c.undecryptable) return 'undecryptable'
  if (c.source === 'user') return 'mine'
  if (!c.fields.some((f) => f.has_own)) return 'none'

  return c.is_active ? 'partial' : 'off'
}

/**
 * ხარჯის ზოლის სიგრძე (0–100); `null` — ზოლი არ ხატავს (ლიმიტი არ არის
 * ან `0` = გამორთულია). ⚠️ ლიმიტს გადაცილებული ხარჯი 100-ზე ჩერდება.
 */
export function usagePercent(usage: Pick<CredentialUsage, 'used' | 'limit'> | null | undefined): number | null {
  if (!usage || !usage.limit || usage.limit <= 0) return null

  return Math.min(100, Math.round((usage.used / usage.limit) * 100))
}
