import type { PublicGalleryGroup } from '@/api/publicProfile'

/* ============================================================
   საჯარო ჯგუფის სათაური და ორიენტირი (Tasks §32).

   ⚠️ **ცალკე ფაილშია და არა `PublicGroupGrid.tsx`-ში**: კომპონენტის ფაილიდან
   ფუნქციის ექსპორტი Fast Refresh-ს ტეხს (oxlint-ის `only-export-components`),
   ხოლო სათაური ორ ადგილს სჭირდება — დასტასაც და ჯგუფის შიგნითა თავსაც.
   ============================================================ */

/** ჯგუფის სათაური ეკრანის ენით — მეორე ენა სარეზერვოა */
export function groupTitle(group: PublicGalleryGroup, lang: 'ka' | 'en'): string {
  return (lang === 'ka' ? group.title_ka || group.title : group.title || group.title_ka) || `#${group.id}`
}

/**
 * ორიენტირი სათაურის ქვეშ — ალბომის აღწერა, ან ქართულ ეკრანზე ორიგინალი
 * სათაური და წელი (მფლობელის `GroupsCut`-ის წესი).
 */
export function groupSubtitle(group: PublicGalleryGroup, lang: 'ka' | 'en'): string | undefined {
  if (group.kind === 'album') return group.subtitle || undefined

  const original = lang === 'ka' && group.title && group.title_ka ? group.title : null
  const parts = [original, group.year ? String(group.year) : null].filter(Boolean)

  return parts.length ? parts.join(' · ') : undefined
}
