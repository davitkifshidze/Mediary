import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react'
import { DICTIONARIES, dictionaryOf, type DictionaryDef, type DictionaryItem } from '@/lib/dictionaries'
import { errorMessage } from '@/lib/errors'
import { dragRowClass, useDragReorder } from '@/lib/dragReorder'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { ModuleIcon } from '@/components/ModuleIcon'
import { Button } from '@/components/ui/button'
import { DragHandle } from '@/components/ui/drag-handle'
import { EmptyState } from '@/components/ui/empty-state'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   **ლექსიკონები ერთ გვერდზე** — `/dictionaries/:key` (Tasks §6.3).

   ერთ გვერდზე ხედავ, ვისი ლექსიკონია (ვიდეოს ტიპები · სიმღერის ჟანრები ·
   წიგნის · ბორდგეიმის · თამაშის ჟანრები · ჩანაწერების და ბუკმარკების
   კატეგორიები) და იქვე ამატებ, შლი და ალაგებ.

   ⚠️ **გადამრჩევში მხოლოდ ჩართული მოდულებია** — გამორთული მოდულის
   ლექსიკონს არც გვერდი აქვს და არც აზრი; `useModules().has()` იგივე
   წყაროა, რითაც საიდბარი და მარშრუტები იწყობა.

   ⚠️ **ძველი მისამართები ცოცხალია** (`/book-genres` → `/dictionaries/book-genres`):
   საიდბარის ბმულები, „უკან" ბმულები და შენახული ჩანართები არ უნდა გატყდეს.
   ============================================================ */

export function DictionariesPage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const navigate = useNavigate()
  const { key } = useParams()
  const { has } = useModules()

  /** ⚠️ გამორთული მოდული სიაშიც არ ჩანს და მისი ლექსიკონიც არ იხსნება */
  const available = useMemo(() => DICTIONARIES.filter((d) => has(d.module)), [has])

  const current = dictionaryOf(key) ?? available[0]

  // პირდაპირ `/dictionaries`-ზე შესვლა პირველს ხსნის, გამორთულზე შესვლა კი
  // პირველზე აბრუნებს — თორემ გვერდი ცარიელი დარჩებოდა ახსნის გარეშე
  useEffect(() => {
    if (!available.length) return
    if (!key || !available.some((d) => d.key === key)) {
      navigate(`/dictionaries/${available[0].key}`, { replace: true })
    }
  }, [available, key, navigate])

  if (!available.length) {
    return (
      <PageContainer>
        <PageHeader title={t('dictionaries.title')} />
        <p className="text-sm text-muted-foreground">{t('dictionaries.noModules')}</p>
      </PageContainer>
    )
  }

  if (!current) return null

  return (
    <PageContainer>
      <Link
        to={current.recordsRoute}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('dictionaries.backToRecords')}
      </Link>

      <PageHeader
        module={current.module}
        title={t(current.titleKey)}
        subtitle={t('dictionaries.subtitle')}
      />

      {/* ---------- გადამრჩევი: ვისი ლექსიკონია ---------- */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {available.map((def) => (
          <Link
            key={def.key}
            to={`/dictionaries/${def.key}`}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm transition-colors',
              def.key === current.key
                ? 'border-primary bg-secondary text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {t(def.titleKey)}
          </Link>
        ))}
      </div>

      {/* ⚠️ `key` აიძულებს რეაქტს, სია ნულიდან ააწყოს — თორემ გადართვისას
          გადათრევის მდგომარეობა ძველ id-ებზე დარჩებოდა */}
      <DictionaryList key={current.key} def={current} lang={lang} />
    </PageContainer>
  )
}

/* ---------- ერთი ლექსიკონის სია ---------- */

function DictionaryList({ def, lang }: { def: DictionaryDef; lang: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [editing, setEditing] = useState<DictionaryItem | 'new' | null>(null)
  const [deleting, setDeleting] = useState<DictionaryItem | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: def.queryKey,
    queryFn: def.list,
  })

  const reorder = useMutation({
    mutationFn: def.reorder,
    onSuccess: (next) => qc.setQueryData(def.queryKey, next),
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /* გადალაგება: drag & drop **და** ისრები — ორივე ერთსა და იმავე
     `reorder`-ს იძახებს, ე.ი. `sort_order` თანმიმდევრული რჩება (§2.4) */
  const drag = useDragReorder(
    items.map((x) => x.id),
    (ids) => reorder.mutate(ids),
  )

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('dictionaries.add')}
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}

      {!isLoading && !items.length && (
        <EmptyState
          title={t('dictionaries.empty')}
          actions={
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('dictionaries.add')}
            </Button>
          }
        />
      )}

      <ul className="space-y-2">
        {items.map((item, i) => (
          <li
            key={item.id}
            {...drag.handlers(item.id)}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3',
              dragRowClass(drag, item.id),
            )}
          >
            <DragHandle />
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted">
              <ModuleIcon name={item.icon} className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{dictionaryName(item, lang)}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {lang === 'ka' ? item.name_en : item.name_ka} ·{' '}
                {t(def.countKey, { count: def.count(item) })}
              </span>
            </span>

            <span className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                disabled={i === 0 || reorder.isPending}
                onClick={() => drag.moveBy(item.id, -1)}
                aria-label={t('videoTypes.moveUp')}
              >
                <ChevronUp className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={i === items.length - 1 || reorder.isPending}
                onClick={() => drag.moveBy(item.id, 1)}
                aria-label={t('videoTypes.moveDown')}
              >
                <ChevronDown className="size-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setEditing(item)}>
                <Pencil className="size-3.5" />
                {t('actions.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                onClick={() => setDeleting(item)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          </li>
        ))}
      </ul>

      {/* რედაქტირების დიალოგი თითო ლექსიკონს თავისი აქვს — თავის endpoint-ზე წერს */}
      {editing && def.dialog(editing === 'new' ? null : editing, () => setEditing(null))}

      {deleting && (
        <DeleteDictionaryEntry
          def={def}
          item={deleting}
          others={items.filter((x) => x.id !== deleting.id)}
          lang={lang}
          onClose={() => setDeleting(null)}
        />
      )}
    </>
  )
}

/* ---------- წაშლა: გადატანა თუ ცარიელად დატოვება ---------- */

type DeleteMode = 'reassign' | 'empty'

function DeleteDictionaryEntry({
  def,
  item,
  others,
  lang,
  onClose,
}: {
  def: DictionaryDef
  item: DictionaryItem
  others: DictionaryItem[]
  lang: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [mode, setMode] = useState<DeleteMode>('reassign')
  const [moveTo, setMoveTo] = useState('')

  const count = def.count(item)

  const remove = useMutation({
    mutationFn: () =>
      def.remove(item.id, mode === 'reassign' && moveTo ? Number(moveTo) : null),
    onSuccess: (moved) => {
      qc.invalidateQueries({ queryKey: def.queryKey })
      qc.invalidateQueries({ queryKey: [def.recordsQueryKey] })
      toast({
        title: moved
          ? t('dictionaries.moved', { count: moved })
          : t('dictionaries.deleted'),
        variant: 'success',
      })
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /* ⚠️ „გადატანა" მიზნის გარეშე ჩუმად „ცარიელად დატოვებას" ნიშნავდა —
     ე.ი. ღილაკი უნდა იყოს გამორთული, სანამ მიზანი არ აირჩია. */
  const confirmDisabled =
    remove.isPending || (count > 0 && mode === 'reassign' && (!others.length || !moveTo))

  return (
    <ModalShell title={t('dictionaries.deleteTitle')} onClose={onClose} destructive>
      {count === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          {t('dictionaries.deleteSimple', { name: dictionaryName(item, lang) })}
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t('dictionaries.inUse', { name: dictionaryName(item, lang), count })}
          </p>

          <RadioGroup value={mode} onValueChange={(v) => setMode(v as DeleteMode)} className="gap-3">
            {/* ⚠️ select **არ ჯდება** `<label>`-ში — მასზე დაჭერა radio-ს
                ააქტიურებდა და მენიუ იხურებოდა (`GenresPage`-ის იგივე ხაფანგი) */}
            <div
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === 'reassign' ? 'border-primary bg-secondary/50' : 'border-border',
                !others.length && 'pointer-events-none opacity-50',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value="reassign" disabled={!others.length} />
                <span className="text-sm font-medium">{t('dictionaries.moveTo')}</span>
              </label>
              {mode === 'reassign' && others.length > 0 && (
                <div className="mt-2 pl-8">
                  <Label className="sr-only">{t('dictionaries.moveTo')}</Label>
                  <Select value={moveTo} onValueChange={setMoveTo}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('dictionaries.movePick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((o) => (
                        <SelectItem key={o.id} value={String(o.id)}>
                          {dictionaryName(o, lang)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <label
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors',
                mode === 'empty' ? 'border-primary bg-secondary/50' : 'border-border hover:bg-muted',
              )}
            >
              <RadioGroupItem value="empty" />
              <span className="text-sm font-medium">{t('dictionaries.moveNone')}</span>
            </label>
          </RadioGroup>
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button variant="destructive" disabled={confirmDisabled} onClick={() => remove.mutate()}>
          <Trash2 className="size-4" />
          {t('actions.delete')}
        </Button>
      </div>
    </ModalShell>
  )
}
