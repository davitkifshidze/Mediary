import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import {
  GENRE_ITEM_BUCKET,
  fetchGenreItems,
  mediaApi,
  updateGenreItems,
  type GenreItemsInput,
} from '@/api/media'
import type { Genre, MovieListItem } from '@/api/types'
import { MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import { genreName, movieTitle } from '@/lib/display'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { GenreSingleSelect } from '@/components/GenreSelect'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'
import { useContentLang } from '@/lib/settings'

/* ============================================================
   ჟანრზე მიბმული ჩანაწერების მართვა (Tasks C1) — ჟანრი გაზიარებულია
   ფილმებსა და სერიალებს შორის, ამიტომ დომენი ტაბებით ირჩევა.

   K1: მოდალის შიგნით სექციებად დაიყო. L5: „ჩანაწერები" და „ქმედებები"
   **ერთ სექციად გაერთიანდა** — მონიშვნა და მასზე შესასრულებელი ქმედება ერთ
   ეკრანზეა (ადრე ერთ ტაბზე ნიშნავდი, ქმედებას მეორეზე ეძებდი).
   კომპონენტი ყოველთვის დამონტაჟებულია — მონიშვნა და დომენი სექციებს შორის
   გადართვისას არ იკარგება.
   ============================================================ */

const DOMAINS: MediaType[] = ['movie', 'series']

/** რომელი სექცია ჩანს; `names` — სახელების ტაბია, აქ არაფერი იხატება */
export type GenreSection = 'names' | 'items' | 'add'

/** ბიბლიოთეკის სია ჟანრში დასამატებლად (მხოლოდ ისინი, რაც ჟანრზე არ არის) */
function useAttachPool(type: MediaType, attached: MovieListItem[]) {
  const q = useQuery({
    queryKey: ['genre-attach-pool', type],
    queryFn: () => mediaApi(type).list(),
  })
  const attachedIds = useMemo(() => new Set(attached.map((m) => m.id)), [attached])

  return {
    isLoading: q.isLoading,
    pool: useMemo(() => (q.data ?? []).filter((m) => !attachedIds.has(m.id)), [q.data, attachedIds]),
  }
}

export function GenreItemsManager({
  genre,
  allGenres,
  section,
}: {
  genre: Genre
  allGenres: Genre[]
  section: GenreSection
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [type, setType] = useState<MediaType>('movie')
  const [selected, setSelected] = useState<number[]>([])
  const [target, setTarget] = useState('')
  const [addIds, setAddIds] = useState<number[]>([])

  const itemsQ = useQuery({ queryKey: ['genre-items', genre.id], queryFn: () => fetchGenreItems(genre.id) })
  const items = (itemsQ.data?.[GENRE_ITEM_BUCKET[type]] as MovieListItem[] | undefined) ?? []
  const { pool, isLoading: poolLoading } = useAttachPool(type, items)
  const others = allGenres.filter((g) => g.id !== genre.id)
  const targetGenre = others.find((g) => String(g.id) === target)

  const switchType = (v: MediaType) => {
    setType(v)
    setSelected([])
    setAddIds([])
  }

  const mut = useMutation({
    mutationFn: (input: GenreItemsInput) => updateGenreItems(genre.id, input),
    onSuccess: ({ affected }) => {
      // ჟანრების მთვლელები, ჟანრის ჩანაწერები, ბიბლიოთეკები და დეტალური გვერდები
      ;['genres', 'genre-items', 'genre-attach-pool', 'movie', 'series'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }),
      )
      toast({ title: t('genres.itemsDone', { count: affected }), variant: 'success' })
      setSelected([])
      setAddIds([])
    },
    onError: () => toast({ title: t('toast.error'), variant: 'error' }),
  })

  const toggle = (id: number) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))

  const allSelected = items.length > 0 && selected.length === items.length
  const toggleAll = () => setSelected(allSelected ? [] : items.map((m) => m.id))

  const detach = async () => {
    const ok = await confirm({
      title: t('genres.detachConfirm'),
      description: t('genres.detachConfirmDesc', { count: selected.length }),
      confirmText: t('genres.actDetach'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate({ type, action: 'detach', ids: selected })
  }

  const replace = async () => {
    if (!targetGenre) return
    const ok = await confirm({
      title: t('genres.replaceConfirm'),
      description: t('genres.replaceConfirmDesc', {
        count: selected.length,
        name: genreName(targetGenre, lang),
      }),
      confirmText: t('genres.actReplace'),
      cancelText: t('confirm.cancel'),
    })
    if (ok) mut.mutate({ type, action: 'replace', ids: selected, target_genre_id: targetGenre.id })
  }

  const count = (itemsQ.data?.[`${GENRE_ITEM_BUCKET[type]}_count`] as number | undefined) ?? 0
  const busy = mut.isPending
  const noSelection = selected.length === 0 || busy

  // სახელების ტაბზე არაფერი გვაქვს საჩვენებელი, მაგრამ კომპონენტი დამონტაჟებული რჩება
  // (მონიშვნა/დომენი არ იკარგება ტაბებს შორის გადართვისას)
  if (section === 'names') return null

  return (
    <div className="mt-4">
      {/* დომენის გადამრთველი — სამივე სექციას სჭირდება */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <Label className="mb-0">{t('genres.items')}</Label>
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {DOMAINS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => switchType(d)}
              className={cn(
                'cursor-pointer rounded-[4px] px-2.5 py-1 text-xs font-medium transition-colors',
                type === d
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {t(MEDIA_NAV_KEY[d])}
              <span className="ml-1.5 opacity-70">
                {d === 'series' ? (itemsQ.data?.series_count ?? 0) : (itemsQ.data?.movies_count ?? 0)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* ---------- ჩანაწერები: სია მონიშვნით + ქმედებები იმავე ეკრანზე (L5) ---------- */}
      {section === 'items' && (
        <>
          {itemsQ.isLoading ? (
            <div className="py-6 text-center text-sm text-muted-foreground">{t('genres.itemsLoading')}</div>
          ) : items.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-muted-foreground">
              {t('genres.itemsEmpty')}
            </div>
          ) : (
            <>
              <label className="flex cursor-pointer items-center gap-2.5 border-b border-border px-1 pb-2 text-sm font-medium">
                <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                {t('genres.selectAll')}
                <span className="text-muted-foreground">({count})</span>
              </label>
              <div className="max-h-64 overflow-y-auto">
                {items.map((m) => (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2.5 px-1 py-1.5 text-sm hover:bg-muted/50"
                  >
                    <Checkbox checked={selected.includes(m.id)} onCheckedChange={() => toggle(m.id)} />
                    <span className="min-w-0 flex-1 truncate">{movieTitle(m, lang)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{m.year ?? '—'}</span>
                  </label>
                ))}
              </div>

              {/* ქმედებები მონიშნულებზე — ჩახსნა / გადატანა / ჩანაცვლება */}
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-2">
                  <span className="text-sm">
                    {t('genres.selectedCount', { count: selected.length })}
                    {selected.length === 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t('genres.actNeedSelection')}
                      </span>
                    )}
                  </span>
                  <Button variant="destructiveOutline" size="sm" onClick={detach} disabled={noSelection}>
                    {t('genres.actDetach')}
                  </Button>
                </div>

                <div>
                  <span className="mb-1.5 block text-xs text-muted-foreground">{t('genres.actTarget')}</span>
                  <GenreSingleSelect
                    genres={others}
                    value={target}
                    onChange={setTarget}
                    placeholder={t('genres.optReassignPick')}
                  />
                </div>

                <div className="space-y-2 rounded-lg border border-border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-xs text-muted-foreground">{t('genres.actHintMove')}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0"
                      onClick={() =>
                        targetGenre &&
                        mut.mutate({ type, action: 'move', ids: selected, target_genre_id: targetGenre.id })
                      }
                      disabled={noSelection || !targetGenre}
                    >
                      {t('genres.actMove')}
                    </Button>
                  </div>
                  <div className="flex items-start justify-between gap-3 border-t border-border pt-2">
                    <p className="text-xs text-destructive">{t('genres.actHintReplace')}</p>
                    <Button
                      variant="destructiveOutline"
                      size="sm"
                      className="shrink-0"
                      onClick={replace}
                      disabled={noSelection || !targetGenre}
                    >
                      {t('genres.actReplace')}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ---------- დამატება: ჟანრზე არმიბმულები ---------- */}
      {section === 'add' && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <MovieMultiSelect
              movies={pool}
              value={addIds}
              onChange={setAddIds}
              placeholder={poolLoading ? t('api.loading') : t('genres.addItems')}
            />
          </div>
          <Button
            variant="outline"
            onClick={() => mut.mutate({ type, action: 'attach', ids: addIds })}
            disabled={addIds.length === 0 || busy}
            title={t('genres.addItemsBtn')}
          >
            <Plus className="size-4" />
            {t('genres.addItemsBtn')}
          </Button>
        </div>
      )}

    </div>
  )
}

/* ============================================================
   C2 — ახალი ჟანრის შექმნისას ჩანაწერების წინასწარი მონიშვნა.
   ჟანრი ჯერ არ არსებობს, ამიტომ მხოლოდ id-ებს ვაგროვებთ; მიბმა
   შექმნის შემდეგ ხდება (იხ. GenresPage).
   ============================================================ */
export function GenreItemsPicker({
  value,
  onChange,
}: {
  value: Record<MediaType, number[]>
  onChange: (v: Record<MediaType, number[]>) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-5 border-t border-border pt-4">
      <Label className="mb-1 block">{t('genres.addItems')}</Label>
      <p className="mb-3 text-xs text-muted-foreground">{t('genres.newItemsHint')}</p>
      {DOMAINS.map((d) => (
        <DomainPicker
          key={d}
          type={d}
          value={value[d]}
          onChange={(ids) => onChange({ ...value, [d]: ids })}
        />
      ))}
    </div>
  )
}

function DomainPicker({
  type,
  value,
  onChange,
}: {
  type: MediaType
  value: number[]
  onChange: (ids: number[]) => void
}) {
  const { t } = useTranslation()
  const q = useQuery({ queryKey: ['genre-attach-pool', type], queryFn: () => mediaApi(type).list() })
  const all = q.data ?? []

  return (
    <div className="mb-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          {t(MEDIA_NAV_KEY[type])}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange(all.map((m) => m.id))}
            disabled={!all.length}
            className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            {t('genres.pickAll')} ({all.length})
          </button>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="cursor-pointer rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t('filter.clear')}
            </button>
          )}
        </div>
      </div>
      <MovieMultiSelect
        movies={all}
        value={value}
        onChange={onChange}
        placeholder={q.isLoading ? t('api.loading') : t('genres.pickPlaceholder')}
      />
    </div>
  )
}
