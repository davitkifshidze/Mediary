import type { ActorCard } from '@/api/actors'

/* ============================================================
   **მსახიობის სახელი და „ცნობილია" (Tasks §35.2).**
   ============================================================ */

/** სახელი კონტენტის ენაზე და მეორე ენა — მხოლოდ თუ განსხვავდება */
export function actorName(actor: Pick<ActorCard, 'name' | 'name_ka'>, lang: string): { title: string; alt: string | null } {
  const title = lang === 'ka' ? actor.name_ka || actor.name : actor.name
  const other = lang === 'ka' ? actor.name : actor.name_ka

  return { title, alt: other && other !== title ? other : null }
}

/**
 * TMDB-ის `known_for_department` → თარგმანის გასაღების ბოლო („Visual Effects"
 * → `visual_effects`). ⚠️ უცნობი მნიშვნელობა `defaultValue`-თი როგორც მოვიდა
 * ისე იწერება — TMDB-ს ახალი განყოფილება ცარიელ ღილაკს არ დახატავს.
 */
export function deptKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
}
