import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Plus, X } from 'lucide-react'
import { BOOKMARK_LINK_KINDS, setBookmarkLinks, type Bookmark, type BookmarkLink, type BookmarkLinkKind } from '@/api/bookmarks'
import { emptyLink, isPricedKind, LINK_KIND_LOOK, linkHost, usableFavicon, withPreview } from '@/lib/bookmarkLinks'
import { useBookmarkRefresh } from '@/lib/bookmarks'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { tintStyle } from '@/lib/gameMeta'
import { keyRow, type Keyed } from '@/lib/rowKeys'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FormFooter } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { LinkField } from '@/components/ui/link-field'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ბუკმარკის დამატებითი ბმულები** (Tasks §36.3, §36.5).

   შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც
   იყოს დამატებით".

   ოთხი ნაწილი, ერთი ფორმა (`BookmarkLink`):
   - `BookmarkLinkRow` — ერთი რიგის რედაქტორი: ტიპი (აიქონი + ფერი), წარწერა,
     ფასი (მხოლოდ მაღაზიასა და ფასზე) და ბმულის ველი §15-ის მეტა-მონაცემით;
   - `BookmarkLinksEditor` — სია ფორმაში + „ბმულის დამატება" (§24.4-ის ღილაკი);
   - `BookmarkLinkDialog` — ერთი ბმული ფორმის გარეშე (დეტალი, მარჯვენა კლიკი);
   - `BookmarkLinkCards` — დეტალის ბარათები: favicon, წარწერა, დომენი, ფასი.

   ⚠️ **რიგი ცვლილებას ფუნქციით აბრუნებს** (`(link) => link`): მეტა-მონაცემი
   ასინქრონულად მოდის და იმ დროისთვის მომხმარებელს წარწერა შეიძლება უკვე
   შეეცვალა — ძველი ობიექტიდან აწყობილი რიგი მას ჩუმად გადაწერდა.
   ============================================================ */

type LinkUpdate = (link: BookmarkLink) => BookmarkLink

/** ტიპის ამრჩევი — პუნქტები აიქონითა და ფერით */
function KindSelect({ value, onChange }: { value: BookmarkLinkKind; onChange: (kind: BookmarkLinkKind) => void }) {
  const { t } = useTranslation()

  return (
    <Select value={value} onValueChange={(v) => onChange(v as BookmarkLinkKind)}>
      <SelectTrigger className="w-40 shrink-0" aria-label={t('bookmarks.linkKind')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BOOKMARK_LINK_KINDS.map((kind) => {
          const { icon: Icon, color } = LINK_KIND_LOOK[kind]
          return (
            <SelectItem key={kind} value={kind}>
              <span className="inline-flex items-center gap-1.5">
                <Icon className="size-3.5" style={{ color }} />
                {t(`bookmarks.linkKinds.${kind}`)}
              </span>
            </SelectItem>
          )
        })}
      </SelectContent>
    </Select>
  )
}

export function BookmarkLinkRow({
  link,
  onChange,
  onRemove,
  error,
}: {
  link: BookmarkLink
  onChange: (update: LinkUpdate) => void
  /** არ არის — რიგი მარტოა (დიალოგი) და წაშლა არ სჭირდება */
  onRemove?: () => void
  error?: string
}) {
  const { t } = useTranslation()
  const set = (patch: Partial<BookmarkLink>) => onChange((current) => ({ ...current, ...patch }))

  return (
    <div className="space-y-1.5 rounded-md border border-border p-2" data-testid="bookmark-link-row">
      <div className="flex flex-wrap gap-1.5">
        <KindSelect
          value={link.kind}
          // ⚠️ ფასი მხოლოდ ფასიან ტიპზე რჩება — სერვერიც ასე ჭრის
          onChange={(kind) => onChange((current) => ({ ...current, kind, price: isPricedKind(kind) ? current.price : null }))}
        />
        <Input
          className="min-w-0 flex-1"
          placeholder={t('bookmarks.linkLabelPlaceholder')}
          aria-label={t('bookmarks.linkLabel')}
          value={link.label ?? ''}
          onChange={(e) => set({ label: e.target.value })}
        />
        {isPricedKind(link.kind) && (
          <Input
            className="w-28 shrink-0"
            placeholder={t('bookmarks.linkPricePlaceholder')}
            aria-label={t('bookmarks.linkPrice')}
            value={link.price ?? ''}
            onChange={(e) => set({ price: e.target.value })}
          />
        )}
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0"
            onClick={onRemove}
            aria-label={t('actions.delete')}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      {/* §15 — ჩასმისას: ცარიელი წარწერა სათაურით, favicon, ვიდეო-ბმული „ვიდეოდ" */}
      <LinkField
        value={link.url}
        invalid={!!error}
        onChange={(url) => set({ url })}
        onFound={(preview) => onChange((current) => withPreview(current, preview))}
        onApply={(preview) =>
          onChange((current) => ({
            ...current,
            label: preview.title ?? current.label,
            favicon_url: usableFavicon(preview.favicon_url) ?? current.favicon_url ?? null,
          }))
        }
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/** ფორმის სია — რიგები სტაბილური გასაღებით (`lib/rowKeys.ts`) */
export function BookmarkLinksEditor({
  links,
  onChange,
  errors,
}: {
  links: Keyed<BookmarkLink>[]
  onChange: (next: (all: Keyed<BookmarkLink>[]) => Keyed<BookmarkLink>[]) => void
  /** სერვერის 422 — `links.N.url` */
  errors?: Record<string, string>
}) {
  const { t } = useTranslation()

  return (
    <div className="space-y-1.5" data-testid="bookmark-links-editor">
      {links.map((link, i) => (
        <BookmarkLinkRow
          key={link._key}
          link={link}
          error={errors?.[`links.${i}.url`]}
          onChange={(update) =>
            onChange((all) => all.map((x) => (x._key === link._key ? { ...update(x), _key: x._key } : x)))
          }
          onRemove={() => onChange((all) => all.filter((x) => x._key !== link._key))}
        />
      ))}
      {/* Tasks §24.4 — „დამატება" ღილაკია (`outline sm`, `Plus` + ტექსტი) და არა ლეიბლის ბმული */}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange((all) => [...all, keyRow(emptyLink())])}>
        <Plus className="size-3.5" />
        {t('bookmarks.addLink')}
      </Button>
    </div>
  )
}

const DIALOG_FORM = 'bookmark-link-form'

/**
 * **ერთი ბმულის დამატება ფორმის გარეშე** (Tasks §36.5) — დეტალის ფანჯრიდან და
 * სიის მარჯვენა კლიკიდან. ⚠️ სია მთლიანად იგზავნება (`setBookmarkLinks`):
 * სერვერზე `links` ერთი სვეტია და მისი ნაწილობრივი ცვლილება არ არსებობს.
 */
export function BookmarkLinkDialog({ bookmark, onClose }: { bookmark: Bookmark; onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const refresh = useBookmarkRefresh()
  const [link, setLink] = useState<BookmarkLink>(emptyLink)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const current = bookmark.links ?? []
  // ახალი რიგის ინდექსი სერვერის სიაში — 422-ის `links.N.url` სწორედ მას ეკუთვნის
  const index = current.length

  const save = useMutation({
    mutationFn: () => setBookmarkLinks(bookmark.id, [...current, { ...link, url: link.url.trim() }]),
    onSuccess: () => {
      refresh()
      toast({ title: t('bookmarks.linkSaved'), variant: 'success' })
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  return (
    <ModalShell title={t('bookmarks.addLink')} hint={t('bookmarks.linksHint')} onClose={onClose}>
      <form
        id={DIALOG_FORM}
        className="mt-4"
        onSubmit={(e) => {
          e.preventDefault()
          if (!link.url.trim()) {
            setErrors({ [`links.${index}.url`]: t('bookmarks.linkUrlRequired') })
            return
          }
          save.mutate()
        }}
      >
        <p className="mb-2 truncate text-sm text-muted-foreground" title={bookmark.title}>
          {bookmark.title}
        </p>
        <BookmarkLinkRow link={link} onChange={(update) => setLink(update)} error={errors[`links.${index}.url`]} />
      </form>
      <FormFooter formId={DIALOG_FORM} onCancel={onClose} saving={save.isPending} />
    </ModalShell>
  )
}

/** დეტალის ბარათები — favicon, წარწერა, დომენი, ტიპი ფერით და ფასი */
export function BookmarkLinkCards({ links }: { links: BookmarkLink[] }) {
  const { t } = useTranslation()

  if (!links.length) {
    return <EmptyState className="py-6" icon={<ExternalLink className="size-5" />} title={t('bookmarks.linksEmpty')} />
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="bookmark-link-cards">
      {links.map((link, i) => {
        const { icon: Icon, color } = LINK_KIND_LOOK[link.kind] ?? LINK_KIND_LOOK.other
        const host = linkHost(link.url)

        return (
          <li key={`${i}:${link.url}`}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-full items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-primary/50"
              title={link.url}
            >
              <span className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                {link.favicon_url ? (
                  <img src={link.favicon_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-5" />
                ) : (
                  <Icon className="size-4" style={{ color }} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{link.label || host || link.url}</span>
                {host && <span className="block truncate text-xs text-muted-foreground">{host}</span>}
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <Badge className="border" style={tintStyle(color)}>
                  <Icon className="size-3" />
                  {t(`bookmarks.linkKinds.${link.kind}`)}
                </Badge>
                {link.price && (
                  <span className="text-sm font-semibold tabular-nums" data-testid="bookmark-link-price">
                    {link.price}
                  </span>
                )}
              </span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}
