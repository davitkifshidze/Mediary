import { api } from '@/lib/api'

/* ============================================================
   **„მონაცემები" — გასაღებები და ლიმიტები (Tasks §21 → §30).**

   ⚠️ **საიდუმლო აქ არასდროს მოდის.** სერვერი მხოლოდ ნიღბიან კუდს
   აბრუნებს (`masked`), ე.ი. ფორმის ველი ყოველთვის **ცარიელი** იწყება და
   „უცვლელად დატოვება" ნიშნავს მისი საერთოდ არგაგზავნას — სწორედ ამიტომ
   ცარიელი სტრიქონი backend-ზე „გასუფთავებას" ნიშნავს და არა „არ შეცვლილა".

   ⚠️ **§30-იდან გასაღები მხოლოდ მომხმარებლისაა** — `.env`-ის საერთო ფენა,
   მისი ნიღაბი (`shared_hint`) და `has_shared` აღარ არსებობს.
   ============================================================ */

/** `user` — ჩემი გასაღებია და მუშაობს · `none` — არ მაქვს (წყარო ჩემთვის არ მუშაობს) */
export type CredentialSource = 'user' | 'none'

export interface CredentialField {
  name: string
  secret: boolean
  required: boolean
  has_own: boolean
  /** ღია ველის (მოდელი, `client_id`) მიმდინარე მნიშვნელობა; საიდუმლოზე `null` */
  value: string | null
  /** `••••a1b2` — მხოლოდ საიდუმლოზე */
  masked: string | null
  /** კოდის ნაგულისხმევი — მხოლოდ ღია ველს აქვს (Gemini-ის მოდელი) */
  default: string | null
}

export interface CredentialLimit {
  name: string
  own: number | null
  /** კოდის ნაგულისხმევი (Gemini 1500/15, SerpApi 250) */
  default: number | null
  effective: number | null
}

export interface CredentialUsage {
  used: number
  limit: number | null
  remaining: number | null
  rpm_used?: number
  rpm_limit?: number
  exhausted?: boolean
  model?: string | null
  source?: CredentialSource
  /** რა ფანჯარას ითვლის: Gemini — დღე, SerpApi — თვე */
  period?: 'day' | 'month'
}

export interface Credential {
  provider: string
  source: CredentialSource
  /**
   * ჩემი გასაღები **სხვა `APP_KEY`-ით** არის დაშიფრული (Tasks GAP-11).
   *
   * ⚠️ `source`-ისგან ცალკეა განზრახ: `source` ამბობს, **მოქმედებს თუ არა**
   * ჩემი გასაღები (გაუშიფრავზე ეს `none`-ია და აპი მართლა ასე იქცევა), ეს კი
   * — რომ ჩემი რიგი არსებობს და ვერ იკითხება.
   */
  undecryptable: boolean
  configured: boolean
  is_active: boolean
  verified_at: string | null
  last_error: string | null
  docs: string | null
  modules: string[]
  test_costs_credit: boolean
  fields: CredentialField[]
  limits: CredentialLimit[]
  usage: CredentialUsage | null
}

/** `.env`-ის ის მნიშვნელობები, რომლებიც გასაღები არაა (მხოლოდ super_admin) */
export interface InstallationSetting {
  key: string
  value: string | null
}

export async function fetchCredentials(): Promise<{ data: Credential[]; installation: InstallationSetting[] }> {
  const { data } = await api.get<{ data: Credential[]; meta?: { installation?: InstallationSetting[] } }>(
    '/credentials',
  )
  return { data: data.data, installation: data.meta?.installation ?? [] }
}

export async function saveCredential(
  provider: string,
  body: { fields?: Record<string, string>; limits?: Record<string, number | null>; is_active?: boolean },
): Promise<Credential> {
  const { data } = await api.put<{ data: Credential }>(`/credentials/${provider}`, body)
  return data.data
}

export async function clearCredential(provider: string): Promise<Credential> {
  const { data } = await api.delete<{ data: Credential }>(`/credentials/${provider}`)
  return data.data
}

/**
 * შენახული გასაღების სრული მნიშვნელობა (§21.8).
 *
 * ⚠️ **ცალკე გამოძახებაა და არა სიის ველი**: სია ყოველ გახსნაზე მოდის, ე.ი.
 * სრული გასაღები ქეშსა და ქსელის ჩანართში დარჩებოდა. აქ ის მხოლოდ თვალის
 * ღილაკზე გადის — და მხოლოდ **ჩემი** (§30: სუპერ-ადმინისთვისაც).
 */
export async function revealCredential(provider: string): Promise<{ fields: Record<string, string> }> {
  const { data } = await api.get<{ fields: Record<string, string> }>(`/credentials/${provider}/reveal`)
  return { fields: data.fields }
}

export async function testCredential(
  provider: string,
  confirm = false,
): Promise<{ ok: boolean; error: string | null; data: Credential }> {
  const { data } = await api.post(`/credentials/${provider}/test`, confirm ? { confirm: true } : {})
  return data
}
