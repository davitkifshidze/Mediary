import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { ExternalLink, Plus, SquarePen, Trash2, X } from 'lucide-react'
import { BOOKMARK_LINK_KINDS, setBookmarkLinks, type Bookmark, type BookmarkLink, type BookmarkLinkKind } from '@/api/bookmarks'
import { emptyLink, isPricedKind, LINK_KIND_LOOK, linkHost, usableFavicon, withPreview } from '@/lib/bookmarkLinks'
import { useBookmarkRefresh } from '@/lib/bookmarks'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { tintStyle } from '@/lib/gameMeta'
import { keyRow, type Keyed } from '@/lib/rowKeys'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { FormFooter } from '@/components/ui/form-layout'
import { Input } from '@/components/ui/input'
import { LinkField } from '@/components/ui/link-field'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { MENU_ICONS, RecordContextMenu, type MenuAction } from '@/components/ui/record-menu'
import { Sortable, SortableHandle, SortableItem } from '@/components/ui/sortable'

/* ============================================================
   **ბუკმარკის დამატებითი ბმულები**.

   შენი სიტყვები: „თუ შოპინგია ან რამე ისეთი, კონკრეტული ლინკის დამატებაც
   იყოს დამატებით".

   ოთხი ნაწილი, ერთი ფორმა (`BookmarkLink`):
   - `BookmarkLinkRow` — ერთი რიგის რედაქტორი: ტიპი (აიქონი + ფერი), წარწერა,
     ფასი (მხოლოდ მაღაზიასა და ფასზე) და ბმულის ველი გვერდის მეტა-მონაცემით;
   - `BookmarkLinksEditor` — სია ფორმაში + „ბმულის დამატება"-ს ღილაკი;
   - `BookmarkLinkDialog` — ერთი ბმული ფორმის გარეშე (დეტალი, მარჯვენა კლიკი);
   - `BookmarkLinkCards` — დეტალის სია: თითო ბმული ერთ ხაზზე (ნიშანი · სახელი · საიტი ·
     კატეგორია · ფასი · „გახსნა" · „რედაქტირება"), რიგი გადათრევით.

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
 * **დეტალის ბმულები — თითო ერთ ხაზზე**: ნიშანი · სახელი · საიტი · კატეგორია · ფასი,
 * მარჯვნივ „გახსნა" და „რედაქტირება". მარჯვენა ღილაკის მენიუ: გახსნა · რედაქტირება · მოხსნა.
 *
 * ⚠️ **რიგი გადათრევით იცვლება და ინახება** (`onReorder`): სერვერზე `links` ერთი სვეტია,
 * ე.ი. ახალი რიგი მთელი სიაა — ნაწილობრივი „გადაადგილება" არ არსებობს.
 * ⚠️ რიგი ბმული აღარ არის (შიგნით ღილაკები ვერ ჩაჯდებოდა) — გასახსნელად „გახსნაა".
 * ⚠️ ახალი რიგი **მაშინვე** ჩანს (`moved`), სერვერის პასუხამდე; ჩავარდნაზე ძველი ბრუნდება.
 *    „რედაქტირება"/„მოხსნა" ადგილს მაინც **შენახული** სიიდან ითვლის — გამომძახებელმა
 *    ახალი რიგი ჯერ არ იცის.
 */
export function BookmarkLinkCards({
  links,
  onEdit,
  onRemove,
  onReorder,
}: {
  links: BookmarkLink[]
  onEdit?: (index: number) => void
  onRemove?: (index: number) => void
  /** ახალი რიგი — მთელი სია; დაბრუნებული დაპირების ჩავარდნა ძველ რიგს აბრუნებს */
  onReorder?: (links: BookmarkLink[]) => Promise<unknown> | void
}) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const [moved, setMoved] = useState<BookmarkLink[] | null>(null)
  // შენახული სია შეიცვალა (პასუხი მოვიდა) — დროებითი რიგი აღარ სჭირდება
  useEffect(() => setMoved(null), [links])

  if (!links.length) {
    return <EmptyState kind="link" className="py-6" title={t('bookmarks.linksEmpty')} />
  }

  const sortable = !!onReorder && links.length > 1
  const shown = moved ?? links
  /* ⚠️ `0` dnd-kit-ისთვის „არაფერია" — გასაღები სტრიქონია და არა ადგილის ნომერი */
  const ids = shown.map((_, i) => `link-${i}`)
  const reorder = (order: (string | number)[]) => {
    const next = order.map((id) => shown[ids.indexOf(String(id))])
    setMoved(next)
    void Promise.resolve(onReorder?.(next)).catch(() => setMoved(null))
  }

  return (
    <ul className="space-y-2" data-testid="bookmark-link-cards">
      <Sortable ids={ids} onReorder={reorder}>
        {shown.map((link, row) => {
          // ადგილი შენახულ სიაში — გამომძახებლის ინდექსი
          const i = links.indexOf(link)
          const { icon: Icon, color } = LINK_KIND_LOOK[link.kind] ?? LINK_KIND_LOOK.other
          const host = linkHost(link.url)
          const open = () => window.open(link.url, '_blank', 'noopener,noreferrer')
          const actions: MenuAction[] = [
            { key: 'link', label: t('actions.openLink'), icon: MENU_ICONS.link, run: open },
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
              <SortableItem
                id={ids[row]}
                handle
                disabled={!sortable}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-2.5 py-2"
                title={link.url}
                data-testid="bookmark-link"
              >
                {sortable && <SortableHandle />}
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-muted">
                  {link.favicon_url ? (
                    <img src={link.favicon_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-5" />
                  ) : (
                    <Icon className="size-4" style={{ color }} />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{link.label || host || link.url}</span>
                {host && <span className="hidden max-w-44 shrink-0 truncate text-xs text-muted-foreground sm:block">{host}</span>}
                <Badge className="shrink-0 border" style={tintStyle(color)}>
                  <Icon className="size-3" />
                  {t(`bookmarks.linkKinds.${link.kind}`)}
                </Badge>
                {link.price && (
                  <span className="shrink-0 text-sm font-semibold tabular-nums" data-testid="bookmark-link-price">
                    {link.price}
                  </span>
                )}
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                    data-testid="bookmark-link-open"
                  >
                    <ExternalLink className="size-3.5" />
                    {t('actions.open')}
                  </a>
                  {onEdit && (
                    <Button type="button" variant="edit" size="sm" onClick={() => onEdit(i)} data-testid="bookmark-link-edit">
                      <SquarePen className="size-3.5" />
                      {t('actions.edit')}
                    </Button>
                  )}
                </span>
              </SortableItem>
            </RecordContextMenu>
          )
        })}
      </Sortable>
    </ul>
  )
}
