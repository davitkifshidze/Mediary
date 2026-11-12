import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Eye, EyeOff, KeyRound, Plus, Save, SquarePen, Trash2, X } from 'lucide-react'
import {
  BOOKMARK_OWN_FIELDS_MAX,
  fetchBookmarkFields,
  setBookmarkFields,
  type Bookmark,
  type BookmarkOwnField,
  type BookmarkOwnFieldInput,
} from '@/api/bookmarks'
import { copyText } from '@/lib/clipboard'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { keyRow, keyRows, type Keyed } from '@/lib/rowKeys'
import { DetailSection } from '@/components/DetailHero'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { useToast } from '@/components/ui/feedback'
import { InfoHint } from '@/components/ui/info-hint'
import { Input } from '@/components/ui/input'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { Sortable, SortableHandle, SortableItem } from '@/components/ui/sortable'
import { Switch } from '@/components/ui/switch'

/* ============================================================
   **ბუკმარკის საკუთარი ველები** — „სახელი → მნიშვნელობა" წყვილები ერთ ჩანაწერზე
   (ტექპასპორტი, მანქანის ნომერი, შეკვეთის კოდი), რომლებიც ერთი დაჭერით კოპირდება.

   სამი ნაწილი:
   - `BookmarkFieldsSection` — ფანჯრის სექცია: სია + „რედაქტირება";
   - `BookmarkFieldRows` — თითო ველი ერთ ხაზზე: სახელი · მნიშვნელობა · „კოპირება";
   - `BookmarkFieldsDialog` — მთელი სიის რედაქტორი (20-მდე, რიგი გადათრევით).

   ⚠️ **ეს მოდულის დამატებითი ველები არ არის** (`/modules`-ის ველები ყველა
   ბუკმარკზე ერთია) — აქ თითო ჩანაწერს თავისი სია აქვს.
   ⚠️ **საიდუმლო ველი ეკრანზე წერტილებადაა** — მუდმივი სიგრძით, რომ მნიშვნელობის
   სიგრძეც არ ჩანდეს; თვალი აჩვენებს, „კოპირება" კი ჩვენების გარეშეც მუშაობს.
   რედაქტორში მნიშვნელობა ღიაა (`SecretInput`-ის წესი: ჩასმულის გადამოწმება
   სწორედ აკრეფისას სჭირდება).
   ⚠️ **მნიშვნელობა ქეშში ფანჯრის დახურვის შემდეგ არ რჩება** (`gcTime: 0`) და
   ბუკმარკის სიას, ძებნას და საჯარო გვერდს საერთოდ არ მოაქვს — ერთადერთი წყარო
   `GET /bookmarks/{id}/fields`-ია.
   ⚠️ **სია მთლიანად ინახება** (რიგი = მასივის რიგი), ბმულების წესით.
   ============================================================ */

/** მუდმივი ნიღაბი — მნიშვნელობის სიგრძეს არ ამხელს */
const MASK = '••••••••'

const fieldsKey = (id: number) => ['bookmark-fields', id] as const

export function BookmarkFieldsSection({ bookmark }: { bookmark: Bookmark }) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)

  const { data: fields = [], isLoading } = useQuery({
    queryKey: fieldsKey(bookmark.id),
    queryFn: () => fetchBookmarkFields(bookmark.id),
    gcTime: 0,
  })

  return (
    <DetailSection
      title={t('bookmarks.fields.title')}
      hint={t('bookmarks.fields.hint')}
      icon={<KeyRound className="size-4 text-muted-foreground" />}
      action={
        fields.length > 0 && (
          <Button type="button" variant="edit" size="sm" onClick={() => setEditing(true)} data-testid="bookmark-fields-edit">
            <SquarePen className="size-3.5" />
            {t('actions.edit')}
          </Button>
        )
      }
    >
      {isLoading ? null : fields.length > 0 ? (
        <BookmarkFieldRows fields={fields} />
      ) : (
        <EmptyState
          kind="list"
          className="py-6"
          title={t('bookmarks.fields.empty')}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} data-testid="bookmark-fields-add">
              <Plus className="size-3.5" />
              {t('bookmarks.fields.add')}
            </Button>
          }
        />
      )}

      {editing && <BookmarkFieldsDialog bookmark={bookmark} fields={fields} onClose={() => setEditing(false)} />}
    </DetailSection>
  )
}

/** თითო ველი ერთ ხაზზე: სახელი · მნიშვნელობა · (თვალი) · „კოპირება" */
export function BookmarkFieldRows({ fields }: { fields: BookmarkOwnField[] }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  /** ნაჩვენები საიდუმლო ველები — ფანჯრის დახურვამდე */
  const [shown, setShown] = useState<Set<number>>(() => new Set())

  const toggle = (id: number) =>
    setShown((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })

  const copy = async (field: BookmarkOwnField) => {
    const ok = await copyText(field.value ?? '')
    toast({
      title: ok ? t('bookmarks.fields.copied', { label: field.label }) : t('bookmarks.copyFailed'),
      variant: ok ? 'success' : 'error',
    })
  }

  return (
    <ul className="space-y-2" data-testid="bookmark-fields">
      {fields.map((field) => {
        const open = !field.is_secret || shown.has(field.id)
        const empty = field.value == null || field.value === ''

        return (
          <li
            key={field.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-card px-2.5 py-2"
            data-testid="bookmark-field"
          >
            <span className="w-40 max-w-full shrink-0 truncate text-sm text-muted-foreground" title={field.label}>
              {field.label}
            </span>

            {!field.readable ? (
              <span className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-destructive" data-testid="bookmark-field-unreadable">
                {t('bookmarks.fields.unreadable')}
                <InfoHint info={t('bookmarks.fields.unreadableHint')} />
              </span>
            ) : (
              <span
                className={open ? 'min-w-0 flex-1 truncate font-mono text-sm' : 'min-w-0 flex-1 truncate font-mono text-sm tracking-[0.2em]'}
                title={open && !empty ? (field.value ?? undefined) : undefined}
                data-testid="bookmark-field-value"
              >
                {empty ? '—' : open ? field.value : MASK}
              </span>
            )}

            <span className="ml-auto flex shrink-0 items-center gap-2">
              {field.is_secret && field.readable && !empty && (
                <button
                  type="button"
                  onClick={() => toggle(field.id)}
                  title={open ? t('secret.hide') : t('secret.show')}
                  aria-label={open ? t('secret.hide') : t('secret.show')}
                  aria-pressed={open}
                  className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:text-foreground"
                  data-testid="bookmark-field-eye"
                >
                  {open ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={empty}
                onClick={() => void copy(field)}
                data-testid="bookmark-field-copy"
              >
                <Copy className="size-3.5" />
                {t('actions.copy')}
              </Button>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

type Draft = Keyed<{ id?: number; label: string; value: string; is_secret: boolean; readable: boolean }>

const blank = (): Draft => keyRow({ label: '', value: '', is_secret: false, readable: true })

/** მთელი სიის რედაქტორი — სახელი, მნიშვნელობა, „საიდუმლო", რიგი გადათრევით */
export function BookmarkFieldsDialog({
  bookmark,
  fields,
  onClose,
}: {
  bookmark: Bookmark
  fields: BookmarkOwnField[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  const [rows, setRows] = useState<Draft[]>(() =>
    fields.length
      ? keyRows(fields.map((f) => ({ id: f.id, label: f.label, value: f.value ?? '', is_secret: f.is_secret, readable: f.readable })))
      : [blank()],
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  const set = (key: string, patch: Partial<Draft>) =>
    setRows((current) => current.map((row) => (row._key === key ? { ...row, ...patch } : row)))

  /* ⚠️ სრულიად ცარიელი რიგი („დაამატე" დააჭირე და არაფერი ჩაწერე) არ იგზავნება;
     სახელის გარეშე მნიშვნელობა კი იგზავნება — სერვერი იტყვის, რომ სახელი აკლია. */
  const payload = (): BookmarkOwnFieldInput[] =>
    rows
      .filter((row) => row.label.trim() !== '' || row.value.trim() !== '')
      .map((row) => ({ id: row.id, label: row.label.trim(), value: row.value === '' ? null : row.value, is_secret: row.is_secret }))

  const save = useMutation({
    mutationFn: () => setBookmarkFields(bookmark.id, payload()),
    onSuccess: (saved) => {
      qc.setQueryData(fieldsKey(bookmark.id), saved)
      toast({ title: t('bookmarks.fields.saved'), variant: 'success' })
      onClose()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const full = rows.length >= BOOKMARK_OWN_FIELDS_MAX
  /* სერვერის შეცდომა გაგზავნილი სიის ადგილით მოდის (`fields.2.label`) — ცარიელი რიგები იქ არ ითვლება */
  const sent = rows.filter((row) => row.label.trim() !== '' || row.value.trim() !== '')

  return (
    <ModalShell title={t('bookmarks.fields.editTitle')} hint={t('bookmarks.fields.editHint')} onClose={onClose} wide>
      <form
        className="mt-4 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          setErrors({})
          save.mutate()
        }}
        data-testid="bookmark-fields-form"
      >
        <ul className="space-y-2">
          <Sortable
            ids={rows.map((row) => row._key)}
            onReorder={(ids) => setRows((current) => ids.map((id) => current.find((row) => row._key === id)!))}
          >
            {rows.map((row) => {
              const error = errors[`fields.${sent.indexOf(row)}.label`] ?? errors[`fields.${sent.indexOf(row)}.value`]

              return (
                <SortableItem
                  key={row._key}
                  id={row._key}
                  handle
                  disabled={rows.length < 2}
                  className="rounded-md border border-border bg-card p-2"
                  data-testid="bookmark-field-row"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {rows.length > 1 && <SortableHandle />}
                    <Input
                      className="w-48 max-w-full shrink-0"
                      maxLength={100}
                      placeholder={t('bookmarks.fields.labelPlaceholder')}
                      aria-label={t('bookmarks.fields.label')}
                      aria-invalid={!!errors[`fields.${sent.indexOf(row)}.label`]}
                      value={row.label}
                      onChange={(e) => set(row._key, { label: e.target.value })}
                    />
                    <Input
                      className="min-w-40 flex-1 font-mono"
                      maxLength={2000}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={row.readable ? t('bookmarks.fields.valuePlaceholder') : t('bookmarks.fields.unreadable')}
                      aria-label={t('bookmarks.fields.value')}
                      value={row.value}
                      onChange={(e) => set(row._key, { value: e.target.value })}
                    />
                    <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm">
                      <Switch
                        checked={row.is_secret}
                        onCheckedChange={(is_secret) => set(row._key, { is_secret })}
                        aria-label={t('bookmarks.fields.secret')}
                      />
                      {t('bookmarks.fields.secret')}
                    </label>
                    <Button
                      type="button"
                      variant="destructiveOutline"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setRows((current) => current.filter((r) => r._key !== row._key))}
                      data-testid="bookmark-field-remove"
                    >
                      <Trash2 className="size-3.5" />
                      {t('actions.delete')}
                    </Button>
                  </div>
                  {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
                </SortableItem>
              )
            })}
          </Sortable>
        </ul>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={full}
            onClick={() => setRows((current) => [...current, blank()])}
            data-testid="bookmark-field-new"
          >
            <Plus className="size-3.5" />
            {t('bookmarks.fields.add')}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {rows.length} / {BOOKMARK_OWN_FIELDS_MAX}
          </span>
          <InfoHint info={t('bookmarks.fields.secretHint')} />
        </div>

        <ModalFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            <X className="size-4" />
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            <Save className="size-4" />
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </ModalFooter>
      </form>
    </ModalShell>
  )
}
