import { useEffect, useRef } from 'react'
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
   **ჟურნალის სიგნალები SPA-დან** (Tasks §4.1 → §43).

   ოთხი ტიპი იგზავნება აქედან: გვერდზე გადასვლა (`visit`), ჩანაწერის გახსნა
   (`open`), განახლება (`refresh`) და დაჭერა (`click`). ⚠️ **მხოლოდ ჩართული**
   — სუპერადმინის გადამრთველები `/auth/me`-ში მოდის (`user.audit_kinds`);
   გამორთულზე ქსელში არაფერი მიდის (სერვერი მაინც აგდებს — მეორე კარიბჭე).
   ============================================================ */

/** SPA-ს ჩართული ტიპები; ავტორიზაციის გარეშე — არცერთი */
function useAuditKinds(): readonly string[] {
  return useAuth().user?.audit_kinds ?? []
}

/**
 * **„რომელ სექციაში შევიდა" (Tasks §4.1)**.
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
  const enabled = useAuditKinds().includes('visit')

  useEffect(() => {
    if (!enabled || last.current === pathname) return

    last.current = pathname
    void recordVisit(pathname)
  }, [enabled, pathname])
}

/**
 * **ჩანაწერის გახსნა** (Tasks §43, Q10) — §10-ის `VisitBadge`-ის ადგილი: ბეჯი
 * წაიშალა, ჩაწერა კი დეტალის გახსნაზე რჩება (ფილმის გვერდის მაუნთი, ფანჯრის
 * გახსნა). იგივე ჩანაწერი იმავე ადამიანისგან წუთში ერთხელ — სერვერზე.
 */
export function useRecordOpen(type: OpenType, id: number | null | undefined): void {
  const enabled = useAuditKinds().includes('open')

  useEffect(() => {
    if (!enabled || id == null) return
    void recordOpen(type, id)
  }, [enabled, type, id])
}

/** ინტერაქტიული ელემენტი — Q10-ის სია: ღილაკი, ბმული, მენიუს პუნქტი, ჩანართი, ვარიანტი, გადამრთველი */
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

/** პაკეტის ინტერვალი (Q10: „პაკეტებად, ყოველ ~5 წამში") */
const FLUSH_MS = 5000

/** განახლება ერთხელ იგზავნება ჩატვირთვაზე — StrictMode-ის ორმაგი მაუნთი მას ორჯერ არ ჩაწერს */
let refreshReported = false

/**
 * **დაჭერები და განახლება** (Tasks §43.4) — ერთი `capture` მსმენელი აპის გარსში.
 *
 * ⚠️ რიგი ~5 წამში ერთხელ იცლება (≤ 50 თითო პაკეტში), გვერდის დატოვებისას
 * (`pagehide`) კი `keepalive`-ით — დახურული ჩანართის ბოლო დაჭერებიც არ იკარგება.
 * ⚠️ `capture` — დაჭერა ჩაიწერება მაშინაც, როცა ღილაკი მოვლენას აჩერებს
 * (`stopPropagation`), და გვერდი იმ მისამართით, რომელზეც დააჭირე (ნავიგაციამდე).
 */
export function useAuditEvents(): void {
  const { pathname } = useLocation()
  const path = useRef(pathname)
  const kinds = useAuditKinds()
  const clicks = kinds.includes('click')
  const refresh = kinds.includes('refresh')

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
  }, [clicks])
}
