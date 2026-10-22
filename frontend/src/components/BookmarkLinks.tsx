import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Plus, SquarePen, Trash2, X } from 'lucide-react'
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
import { useConfirm, useToast } from '@/components/ui/feedback'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'

/* ============================================================
   **ბუკმარკის დამატებითი ბმულები**.

   შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც
   იყოს დამატებით".

   ოთხი ნაწილი, ერთი ფორმა (`BookmarkLink`):
   - `BookmarkLinkRow` — ერთი რიგის რედაქტორი: ტიპი (აიქონი + ფერი), წარწერა,
     ფასი (მხოლოდ მაღაზიასა და ფასზე) და ბმულის ველი გვერდის მეტა-მონაცემით;
   - `BookmarkLinksEditor` — სია ფორმაში + „ბმულის დამატება"-ს ღილაკი;
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
      {/* ჩასმისას: ცარიელი წარწერა სათაურით, favicon, ვიდეო-ბმული „ვიდეოდ" */}
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
      {/* „დამატება" ღილაკია (`outline sm`, `Plus` + ტექსტი) და არა ლეიბლის ბმული */}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange((all) => [...all, keyRow(emptyLink())])}>
        <Plus className="size-3.5" />
        {t('bookmarks.addLink')}
      </Button>
    </div>
  )
}

const DIALOG_FORM = 'bookmark-link-form'

/**
 * **ერთი ბმულის დამატება ან რედაქტირება ფორმის გარეშე** — დეტალის ფანჯრიდან
 * და სიის მარჯვენა კლიკიდან. `edit` — არსებული ბმულის ადგილი სიაში: ველები
 * მისით ივსება, შენახვა მას ცვლის, „ბმულის მოხსნა" — შლის.
 * ⚠️ სია მთლიანად იგზავნება (`setBookmarkLinks`): სერვერზე `links` ერთი სვეტია
 * და მისი ნაწილობრივი ცვლილება არ არსებობს.
 */
export function BookmarkLinkDialog({ bookmark, edit, onClose }: { bookmark: Bookmark; edit?: number; onClose: () => void }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const refresh = useBookmarkRefresh()
  const current = bookmark.links ?? []
  const editing = edit !== undefined && current[edit] !== undefined
  const [link, setLink] = useState<BookmarkLink>(() => (editing ? { ...current[edit!] } : emptyLink()))
  const [errors, setErrors] = useState<Record<string, string>>({})
  // რიგის ინდექსი სერვერის სიაში — 422-ის `links.N.url` სწორედ მას ეკუთვნის
  const index = editing ? edit! : current.length

  const fail = (e: unknown) => {
    setErrors(fieldErrors(e))
    toast({ title: errorMessage(e), variant: 'error' })
  }

  const save = useMutation({
    mutationFn: () => {
      const next = { ...link, url: link.url.trim() }
      return setBookmarkLinks(bookmark.id, editing ? current.map((l, i) => (i === index ? next : l)) : [...current, next])
    },
    onSuccess: () => {
      refresh()
      toast({ title: t(editing ? 'bookmarks.linkUpdated' : 'bookmarks.linkSaved'), variant: 'success' })
      onClose()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: () => setBookmarkLinks(bookmark.id, current.filter((_, i) => i !== index)),
    onSuccess: () => {
      refresh()
      toast({ title: t('bookmarks.linkRemoved'), variant: 'success' })
      onClose()
    },
    onError: fail,
  })

  return (
    <ModalShell title={t(editing ? 'bookmarks.editLink' : 'bookmarks.addLink')} hint={t('bookmarks.linksHint')} onClose={onClose}>
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
      <FormFooter formId={DIALOG_FORM} onCancel={onClose} saving={save.isPending}>
        {editing && (
          <Button type="button" variant="destructiveOutline" disabled={remove.isPending} onClick={() => remove.mutate()}>
            <Trash2 className="size-4" />
            {t('bookmarks.removeLink')}
          </Button>
        )}
      </FormFooter>
    </ModalShell>
  )
}

/**
 * დეტალის ბარათები — favicon, წარწერა, დომენი, ტიპი ფერით და ფასი.
 * `onEdit` — ბარათის გვერდით ხილული „რედაქტირება" (ტექსტით; ბმულის **შიგნით**
 * ღილაკი ვერ ჩაჯდება) და მარჯვენა ღილაკის მენიუ: გახსნა · რედაქტირება · მოხსნა.
 */
export function BookmarkLinkCards({
  links,
  onEdit,
  onRemove,
}: {
  links: BookmarkLink[]
  onEdit?: (index: number) => void
  onRemove?: (index: number) => void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()

  if (!links.length) {
    return <EmptyState className="py-6" icon={<ExternalLink className="size-5" />} title={t('bookmarks.linksEmpty')} />
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2" data-testid="bookmark-link-cards">
      {links.map((link, i) => {
        const { icon: Icon, color } = LINK_KIND_LOOK[link.kind] ?? LINK_KIND_LOOK.other
        const host = linkHost(link.url)
        const actions: MenuAction[] = [
          { key: 'link', label: t('actions.openLink'), icon: MENU_ICONS.link, run: () => window.open(link.url, '_blank', 'noopener,noreferrer') },
          ...(onEdit ? [{ key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => onEdit(i) }] : []),
          ...(onRemove
            ? [
                {
                  key: 'remove',
                  label: t('bookmarks.removeLink'),
                  icon: MENU_ICONS.delete,
                  danger: true,
                  run: async () => {
                    if (await confirm({ title: t('bookmarks.removeLinkTitle'), description: link.label || host || link.url, variant: 'destructive' })) {
                      onRemove(i)
                    }
                  },
                },
              ]
            : []),
        ]

        return (
          <RecordContextMenu key={`${i}:${link.url}`} actions={actions}>
            <li className="flex items-center gap-2">
              <a
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full min-w-0 flex-1 items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-primary/50"
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
              {onEdit && (
                <Button type="button" variant="edit" size="sm" className="shrink-0" onClick={() => onEdit(i)} data-testid="bookmark-link-edit">
                  <SquarePen className="size-3.5" />
                  {t('actions.edit')}
                </Button>
              )}
            </li>
          </RecordContextMenu>
        )
      })}
    </ul>
  )
}
