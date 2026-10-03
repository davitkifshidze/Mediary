import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Film, Layers, Loader2, Star } from 'lucide-react'
import { fetchMovieCollection, mediaApi, type CollectionPart } from '@/api/media'
import type { MovieListItem } from '@/api/types'
import { movieTitle } from '@/lib/display'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { useStatuses } from '@/lib/statuses'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { CutTabs } from '@/components/ui/cut-tabs'
import { useToast } from '@/components/ui/feedback'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useQueue } from '@/components/ui/queue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PosterImage } from '@/components/PosterImage'
import { StatusLabel } from '@/components/StatusBadge'

/* ============================================================
   **რჩეულში დამატება — ფრანჩაიზი პოპაპით** (Tasks §18).

   ⚠️ **აქამდე სერვერი ჩუმად ავრცელებდა**: ფილმის რჩეულში ჩასმა იმავე
   კოლექციის ყველა ნანახ-არა ნაწილს უკითხავად აფერადებდა და მხოლოდ იმას,
   რაც ბიბლიოთეკაში უკვე იყო. ახლა კითხვა ეკრანზეა: „მხოლოდ ეს ფილმი" თუ
   „მთელი ფრანჩაიზი" — და მეორეზე თითო ნაწილი ჩექბოქსით ირჩევა.

   ⚠️ **ბიბლიოთეკაში არარსებული ნაწილიც ემატება (Q5)**: ბეჯი „დაემატება",
   სტატუსი იქვე ირჩევა (ნაგულისხმევი — მოდულის ნაგულისხმევი, როგორც
   აღმოჩენიდან დამატებისას), თვითონ დამატება კი TMDB-ის არსებული რიგით მიდის
   (`useQueue().enqueue` — `status` და `favorite` ერთეულს მიჰყვება).

   ⚠️ **ფრანჩაიზი რომ არ აღმოჩნდეს** (TMDB-მ სხვა ნაწილი არ იცის, გასაღები
   არ არის, ქსელი ჩავარდა) — დიალოგი კითხვას არ სვამს: ფილმს უმალ რჩეულად
   ნიშნავს და იხურება. რჩეულიდან **მოხსნა** აქ საერთოდ არ გადის (ბარათი და
   გვერდი მას პირდაპირ აკეთებენ).
   ============================================================ */

type Mode = 'only' | 'all'

export function FranchiseFavoriteDialog({
  movie,
  onClose,
  onDone,
}: {
  movie: Pick<MovieListItem, 'id' | 'title_ka' | 'title_en' | 'collection_name'>
  onClose: () => void
  /** შენახვის შემდეგ — სიისა და დეტალის ქეშის განახლება მშობლის საქმეა */
  onDone: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const { enqueue } = useQueue()
  const api = mediaApi('movie')
  const { data: statuses = [] } = useStatuses('movie')

  // იგივე გასაღები, რაც ფილმის გვერდს აქვს — კოლექცია ერთხელ ჩამოდის
  const collectionQ = useQuery({
    queryKey: ['collection', String(movie.id)],
    queryFn: () => fetchMovieCollection(movie.id),
  })
  const parts = useMemo(() => collectionQ.data?.parts ?? [], [collectionQ.data])
  const others = parts.filter((p) => p.movie_id !== movie.id)

  const [mode, setMode] = useState<Mode>('all')
  /** მოხსნილი ნაწილები (TMDB id) — ნაგულისხმევად ყველა მონიშნულია */
  const [excluded, setExcluded] = useState<Set<number>>(() => new Set())
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const defaultStatus = statuses.find((s) => s.is_default) ?? statuses.find((s) => s.role === 'todo') ?? statuses[0]
  const statusKey = status ?? defaultStatus?.key ?? null

  const chosen = mode === 'all' ? others.filter((p) => !excluded.has(p.tmdb_id)) : []
  const fresh = chosen.filter((p) => !p.owned)
  const count = 1 + chosen.length

  const commit = async (parts: CollectionPart[]) => {
    setSaving(true)
    try {
      const owned = parts.filter((p) => p.owned && p.movie_id).map((p) => p.movie_id!)
      await api.setFavorite(movie.id, true, owned)
      const missing = parts.filter((p) => !p.owned)
      if (missing.length) {
        enqueue(
          missing.map((p) => ({ tmdbId: p.tmdb_id, title: p.title, status: statusKey ?? undefined, favorite: true })),
          'movie',
        )
      }
      toast({
        title: t('franchise.added', { count: 1 + owned.length }),
        description: missing.length ? t('franchise.queued', { count: missing.length }) : undefined,
        variant: 'success',
      })
      onDone()
      onClose()
    } catch (e) {
      toast({ title: errorMessage(e), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  /* ფრანჩაიზი არ აღმოჩნდა → კითხვის გარეშე. ⚠️ `ref` — ეფექტი ერთხელ უნდა
     გაეშვას; `commit` ყოველ რენდერზე ახალია და დამოკიდებულებად არ გამოდგება. */
  const autoRef = useRef(false)
  useEffect(() => {
    if (collectionQ.isPending || autoRef.current || others.length > 0) return
    autoRef.current = true
    void commit([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionQ.isPending, others.length])

  const toggle = (tmdbId: number, on: boolean) =>
    setExcluded((cur) => {
      const next = new Set(cur)
      if (on) next.delete(tmdbId)
      else next.add(tmdbId)
      return next
    })

  const title = movieTitle(movie as MovieListItem, lang)
  const name = collectionQ.data?.name ?? movie.collection_name ?? ''

  return (
    <ModalShell title={t('franchise.favoriteTitle', { name: name || title })} hint={t('franchise.hint')} onClose={onClose}>
      {collectionQ.isPending || others.length === 0 ? (
        <div className="grid place-items-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          <CutTabs
            layout="inline"
            size="sm"
            value={mode}
            onChange={(k) => setMode(k as Mode)}
            options={[
              { key: 'only', label: t('franchise.onlyThis'), icon: Film, color: 'var(--mod, var(--gold))' },
              { key: 'all', label: t('franchise.whole'), icon: Layers, color: 'var(--favorite)', count: parts.length },
            ]}
          />

          {mode === 'only' ? (
            <p className="text-sm text-muted-foreground">{t('franchise.onlyThisHint', { title })}</p>
          ) : (
            <ul className="space-y-2">
              {parts.map((p) => {
                const isThis = p.movie_id === movie.id
                const on = isThis || !excluded.has(p.tmdb_id)
                return (
                  <li
                    key={p.tmdb_id}
                    className={cn(
                      'flex items-start gap-3 rounded-md border border-border p-2.5 transition-opacity',
                      !on && 'opacity-60',
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      checked={on}
                      disabled={isThis || saving}
                      onCheckedChange={(v) => toggle(p.tmdb_id, v === true)}
                      aria-label={p.title}
                    />
                    <PosterImage src={p.poster} alt={p.title} className="h-16 w-11 shrink-0 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium">{p.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {[p.year, p.rating ? `★ ${p.rating}` : null].filter(Boolean).join(' · ')}
                        </span>
                      </div>
                      {p.overview && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{p.overview}</p>}
                    </div>
                    <Badge
                      className={cn(
                        'shrink-0',
                        isThis
                          ? 'bg-favorite/15 text-favorite'
                          : p.owned
                            ? 'bg-secondary text-secondary-foreground'
                            : 'bg-primary/15 text-foreground',
                      )}
                    >
                      {isThis ? t('franchise.thisOne') : p.owned ? t('franchise.inLibrary') : t('franchise.willAdd')}
                    </Badge>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Q5 — ახლებისთვის სტატუსი იქვე; ჩანს მხოლოდ მაშინ, როცა მართლა ემატება რამე */}
          {mode === 'all' && fresh.length > 0 && statuses.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">{t('franchise.newStatus', { count: fresh.length })}</span>
              <Select value={statusKey ?? ''} onValueChange={setStatus}>
                <SelectTrigger className="h-9 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.key} value={s.key}>
                      <StatusLabel status={s} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <ModalFooter>
            <Button variant="outline" onClick={onClose} disabled={saving}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => void commit(chosen)} disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Star className="size-4" />}
              {t('franchise.addFavorites', { count })}
            </Button>
          </ModalFooter>
        </div>
      )}
    </ModalShell>
  )
}
