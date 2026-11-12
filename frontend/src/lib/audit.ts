import { useEffect, useMemo, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import {
  AUDIT_EVENT_BATCH,
  recordOpen,
  recordVisit,
  sendAuditEvents,
  type AuditEvent,
  type OpenType,
} from '@/api/audit'
import { useAuth } from '@/lib/auth'

/* ============================================================
   **ჟურნალის სიგნალები SPA-დან**.

   ოთხი ტიპი იგზავნება აქედან: გვერდზე გადასვლა (`visit`), ჩანაწერის გახსნა
   (`open`), განახლება (`refresh`) და დაჭერა (`click`). ⚠️ **მხოლოდ ჩართული**
   — მთავარი ადმინის წესები `/auth/me`-ში მოდის: `user.audit_kinds` (რა იწერება
   ამ ანგარიშზე) და `user.audit_paths` (რომელ მისამართზეა პასუხი სხვა — მოდულის
   წესი). გამორთულზე ქსელში არაფერი მიდის (სერვერი მაინც აგდებს — მეორე კარიბჭე).
   ============================================================ */

const NO_KINDS: readonly string[] = []
const NO_PATHS: Record<string, Record<string, boolean>> = {}

/**
 * მისამართის ის ნაწილი, რომლითაც სერვერი მოდულს ცნობს: პირველი სეგმენტი,
 * პირადი მოდულის გვერდზე — ორი (`c/{key}`).
 */
export function pathSegment(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean)

  return parts[0] === 'c' && parts[1] ? `c/${parts[1]}` : (parts[0] ?? '')
}

interface AuditGate {
  /** ეს ტიპი ამ მისამართზე იწერება? */
  on: (kind: string, pathname: string) => boolean
  /** ტიპი სადმე მაინც იწერება? — მსმენელი საერთოდ საჭიროა თუ არა */
  anywhere: (kind: string) => boolean
}

/** SPA-ს კარიბჭე; ავტორიზაციის გარეშე არაფერი იწერება */
function useAuditGate(): AuditGate {
  const user = useAuth().user
  const kinds = user?.audit_kinds ?? NO_KINDS
  const paths = user?.audit_paths ?? NO_PATHS

  return useMemo(
    () => ({
      on: (kind, pathname) => paths[kind]?.[pathSegment(pathname)] ?? kinds.includes(kind),
      anywhere: (kind) => kinds.includes(kind) || Object.values(paths[kind] ?? {}).some(Boolean),
    }),
    [kinds, paths],
  )
}

/**
 * **„რომელ სექციაში შევიდა"**.
 *
 * ⚠️ **სიგნალი აქედან მოდის და არა backend-ის middleware-იდან.** აპლიკაცია
 * SPA-ა: სექციაში შესვლა მარშრუტის შეცვლაა და არა HTTP რექვესთი — ერთი
 * გვერდის გახსნა ხუთ GET-ს აგზავნის, ბრაუზერის „უკან" კი არცერთს. ე.ი.
 * რექვესთების ლოგირება ერთდროულად ხმაურიც იქნებოდა და გამოტოვებაც.
 *
 * ⚠️ **მხოლოდ `pathname`, query-ს გარეშე.** ფილტრის შეცვლა (`?view=…`)
 * სექციაში შესვლა არ არის და ლოგს უაზროდ გაზრდიდა.
 *
 * გამეორების საბოლოო ჩახშობა backend-შია (ერთი წუთის ფანჯარა) — აქაური
 * `ref` მხოლოდ ზედმეტ რექვესთს იშორებს.
 */
export function useVisitTracker(): void {
  const { pathname } = useLocation()
  const last = useRef<string | null>(null)
  const enabled = useAuditGate().on('visit', pathname)

  useEffect(() => {
    if (!enabled || last.current === pathname) return

    last.current = pathname
    void recordVisit(pathname)
  }, [enabled, pathname])
}

/**
 * **ჩანაწერის გახსნა** — ყოფილი `VisitBadge`-ის ადგილი: ბეჯი
 * წაიშალა, ჩაწერა კი დეტალის გახსნაზე რჩება (ფილმის გვერდის მაუნთი, ფანჯრის
 * გახსნა). იგივე ჩანაწერი იმავე ადამიანისგან წუთში ერთხელ — სერვერზე.
 *
 * ⚠️ ჩანაწერის მოდულს სერვერი ჩანაწერიდან ადგენს და არა მისამართიდან (ფანჯარა
 * სხვა გვერდიდანაც იხსნება), ამიტომ აქ სიგნალი მიდის, თუ გახსნა **სადმე მაინც**
 * იწერება — მოდულის წესს სერვერი წყვეტს.
 */
export function useRecordOpen(type: OpenType, id: number | null | undefined): void {
  const enabled = useAuditGate().anywhere('open')

  useEffect(() => {
    if (!enabled || id == null) return
    void recordOpen(type, id)
  }, [enabled, type, id])
}

/** ინტერაქტიული ელემენტი: ღილაკი, ბმული, მენიუს პუნქტი, ჩანართი, ვარიანტი, გადამრთველი */
const CLICKABLE =
  'button, a[href], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="tab"], [role="option"], [role="switch"]'

/** როლი ჟურნალისთვის — `menuitemcheckbox`/`radio` ერთი „მენიუს პუნქტია" */
function roleOf(el: Element): NonNullable<AuditEvent['role']> {
  const role = el.getAttribute('role')
  if (role === 'switch' || role === 'tab' || role === 'option') return role
  if (role?.startsWith('menuitem')) return 'menuitem'
  return el.tagName === 'A' ? 'link' : 'button'
}

/**
 * დაჭერილი ელემენტი → მოვლენა; არაინტერაქტიულზე `null`.
 *
 * ⚠️ **ველის მნიშვნელობა არასოდეს**: იკითხება მხოლოდ წარწერა (`aria-label` →
 * `title` → ტექსტი), `input`/`textarea` სიაში საერთოდ არ არის. სერვერი წარწერას
 * 120 სიმბოლოზე ჭრის და ტოკენის მსგავს სტრიქონს ფარავს.
 */
function clickEvent(target: EventTarget | null, path: string): AuditEvent | null {
  if (!(target instanceof Element)) return null

  const el = target.closest(CLICKABLE)
  if (!el) return null

  const label = (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)

  return { action: 'click', path, label: label || null, role: roleOf(el) }
}

/** პაკეტის ინტერვალი („პაკეტებად, ყოველ ~5 წამში") */
const FLUSH_MS = 5000

/** განახლება ერთხელ იგზავნება ჩატვირთვაზე — StrictMode-ის ორმაგი მაუნთი მას ორჯერ არ ჩაწერს */
let refreshReported = false

/**
 * **დაჭერები და განახლება** — ერთი `capture` მსმენელი აპის გარსში.
 *
 * ⚠️ რიგი ~5 წამში ერთხელ იცლება (≤ 50 თითო პაკეტში), გვერდის დატოვებისას
 * (`pagehide`) კი `keepalive`-ით — დახურული ჩანართის ბოლო დაჭერებიც არ იკარგება.
 * ⚠️ `capture` — დაჭერა ჩაიწერება მაშინაც, როცა ღილაკი მოვლენას აჩერებს
 * (`stopPropagation`), და გვერდი იმ მისამართით, რომელზეც დააჭირე (ნავიგაციამდე).
 */
export function useAuditEvents(): void {
  const { pathname } = useLocation()
  const path = useRef(pathname)
  const gate = useAuditGate()
  const clicks = gate.anywhere('click')
  const refresh = gate.on('refresh', window.location.pathname)

  useEffect(() => {
    path.current = pathname
  }, [pathname])

  useEffect(() => {
    if (!refresh || refreshReported) return

    const nav = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined
    if (nav?.type !== 'reload') return

    refreshReported = true
    void sendAuditEvents([{ action: 'refresh', path: window.location.pathname }])
  }, [refresh])

  useEffect(() => {
    if (!clicks) return

    const queue: AuditEvent[] = []

    const flush = (keepalive = false) => {
      while (queue.length > 0) void sendAuditEvents(queue.splice(0, AUDIT_EVENT_BATCH), keepalive)
    }

    const onClick = (e: MouseEvent) => {
      // მოდულის წესი: ამ გვერდზე დაჭერა შეიძლება არ იწერებოდეს, სხვაგან კი იწერებოდეს
      if (!gate.on('click', path.current)) return

      const event = clickEvent(e.target, path.current)
      if (!event) return
      queue.push(event)
      if (queue.length >= AUDIT_EVENT_BATCH) flush()
    }

    const onHide = () => flush(true)
    const timer = window.setInterval(() => flush(), FLUSH_MS)

    document.addEventListener('click', onClick, true)
    window.addEventListener('pagehide', onHide)

    return () => {
      document.removeEventListener('click', onClick, true)
      window.removeEventListener('pagehide', onHide)
      window.clearInterval(timer)
      flush()
    }
  }, [clicks, gate])
}
