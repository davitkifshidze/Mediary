import { BadgePercent, FileText, Link2, MessageSquareText, ShoppingCart, SquarePlay, type LucideIcon } from 'lucide-react'
import { BOOKMARK_PRICED_LINK_KINDS, type BookmarkLink, type BookmarkLinkKind } from '@/api/bookmarks'
import type { LinkPreview } from '@/api/links'

/* ============================================================
   **ბუკმარკის დამატებითი ბმული — აიქონი, ფერი, ჰოსტი** (Tasks §36.3).

   შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც
   იყოს დამატებით".

   ⚠️ **ფერი CSS-ცვლადია** (`--link-*`, `index.css`, ორივე თემაში) — თამაშის
   პლატფორმებისა და რეჟიმების წესი (`lib/gameMeta.ts`): hex-იდან Tailwind-ის
   კლასი ვერ დაიბადება და მუქ ფონზე ტონი სხვაა. ჩამქრალი ფონი — `tintStyle()`.
   ============================================================ */

export interface LinkKindLook {
  icon: LucideIcon
  /** CSS-მნიშვნელობა — `var(--link-…)` */
  color: string
}

export const LINK_KIND_LOOK: Record<BookmarkLinkKind, LinkKindLook> = {
  shop: { icon: ShoppingCart, color: 'var(--link-shop)' },
  price: { icon: BadgePercent, color: 'var(--link-price)' },
  review: { icon: MessageSquareText, color: 'var(--link-review)' },
  video: { icon: SquarePlay, color: 'var(--link-video)' },
  docs: { icon: FileText, color: 'var(--link-docs)' },
  other: { icon: Link2, color: 'var(--link-other)' },
}

/** ფასის ველი ჩანს? — სერვერი სხვა ტიპზე ფასს ჩუმად ჭრის (`Bookmark::normalizeLinks()`) */
export function isPricedKind(kind: BookmarkLinkKind): boolean {
  return (BOOKMARK_PRICED_LINK_KINDS as readonly string[]).includes(kind)
}

/** ჰოსტი `www.`-ის გარეშე; ჯერ დაუმთავრებელ მისამართზე — `null` */
export function linkHost(url: string): string | null {
  try {
    return new URL(url.trim()).hostname.toLowerCase().replace(/^www\./, '') || null
  } catch {
    return null
  }
}

/**
 * **ჩასმული ბმულის მეტა-მონაცემი რიგში** (§15): ცარიელი წარწერა სათაურით ივსება,
 * favicon ინახება, ვიდეო-პლატფორმა „ვიდეოდ" იწერება.
 * ⚠️ მომხმარებლის ცხადი არჩევანი არ იცვლება — ტიპს მხოლოდ ნაგულისხმევ „სხვას"
 * ვცვლით (თამაშის `withUrl()`-ის წესი).
 */
export function withPreview<T extends BookmarkLink>(link: T, preview: LinkPreview): T {
  return {
    ...link,
    label: link.label || preview.title || null,
    favicon_url: usableFavicon(preview.favicon_url) ?? link.favicon_url ?? null,
    kind: preview.kind === 'video' && link.kind === 'other' ? 'video' : link.kind,
  }
}

/**
 * ხატულა მხოლოდ `http(s)`-ის მისამართია, 500 სიმბოლომდე — სერვერის
 * `Bookmark::faviconOrNull()`-ის წესი; დანარჩენს ის ისედაც ჩუმად ჭრის.
 */
export function usableFavicon(url: string | null | undefined): string | null {
  return url && url.length <= 500 && /^https?:\/\//i.test(url) ? url : null
}

/** ახალი, ცარიელი რიგი — ტიპი „სხვა" */
export function emptyLink(): BookmarkLink {
  return { label: null, url: '', kind: 'other', price: null, favicon_url: null }
}
