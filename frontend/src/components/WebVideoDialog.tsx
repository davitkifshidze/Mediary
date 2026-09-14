import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ExternalLink, Loader2, Play, Search, VideoOff } from 'lucide-react'
import { searchWebVideos, webSearchStatus, type SerpQuota, type SerpSource, type SerpVideo } from '@/api/web'
import { saveGalleryVideo, type GalleryParentKind } from '@/api/gallery'
import { useDateFormat } from '@/lib/dates'
import { errorMessage } from '@/lib/errors'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { StepSection } from '@/components/ui/step-section'
import { useToast } from '@/components/ui/feedback'
import { WebSourcePicker } from '@/components/WebSourcePicker'

/* ============================================================
   **ვიდეოს ძებნა ვებში და ბმულის შენახვა (Tasks §8.4).**

   მოთხოვნა: „დაამატე მსახიობებზე ვიდეო სერჩი — ვიდეოს ლინკები ან სადაც
   ვიდეო დევს, იმის ლინკები და თამბნეილები; ბლარი და სეიფი გამორთე".

   ⚠️ **ძებნა უკვე არსებობდა** (`GET /api/web/videos`), მაგრამ **ერთი
   გამომძახებელიც არ ჰყავდა** — შენახვის ადგილი აკლდა. ახლა ნაპოვნი ბმული
   `gallery_videos`-ში ჯდება.

   ⚠️ **არაფერი ჩამოიწერება**: ვიდეო ბმულია, ესკიზი დაშორებული URL — ე.ი.
   კვოტა საერთოდ არ იხარჯება (ბუკმარკის `og:image`-ის წესი).

   ⚠️ **ცენზურა და დაბინდვა არსად არის.** `safe` ისედაც `false`-ია
   (`WebSearchController`-ის ნაგულისხმევი) და ესკიზი ბლარის გარეშე ჩანს.
   კოდში შიგთავსის კლასიფიკაცია **არ იწერება** — შენი პირდაპირი პირობა.

   ⚠️ **ძებნა მხოლოდ ღილაკზე** — 250 ძებნაა თვეში მთელ ანგარიშზე, ე.ი.
   ერთი „ჩუმი" ავტომატური გამოძახება ბიუჯეტს დღეებში აჭმევს.

   ⚠️ **ვიზუალი ფოტოს დიალოგისაა** (ეტაპი 5, 2026-09-13): იგივე
   `StepSection` („რას ვეძებთ · სად ვეძებთ · შედეგები"), იგივე `EmptyState`
   და იგივე „ძებნა სხვა წყაროთი" ღილაკები. ორი ვებძებნის დიალოგი ერთმანეთს
   არ უნდა ჰგავდეს „დაახლოებით" — ეს ერთი და იგივე სამუშაოა.
   ============================================================ */

export function WebVideoDialog({
  target,
  id,
  initialQuery,
  title,
  onClose,
  onSaved,
}: {
  target: GalleryParentKind | 'cast_member'
  id: number
  initialQuery: string
  title: string
  onClose: () => void
  onSaved?: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const qc = useQueryClient()
  /* ⚠️ **თარიღი ერთი წესით იხატება** — `published` ახლა `Y-m-d`-ია
     (`SerpApiClient::publishedDate()`), ე.ი. ის ისევე უნდა გამოჩნდეს,
     როგორც აპლიკაციის დანარჩენი თარიღები. */
  const { date } = useDateFormat()

  const [query, setQuery] = useState(initialQuery)
  const [engines, setEngines] = useState<string[]>([])
  const [items, setItems] = useState<SerpVideo[]>([])
  const [sources, setSources] = useState<SerpSource[]>([])
  const [quota, setQuota] = useState<SerpQuota | null>(null)
  const [saved, setSaved] = useState<Set<string>>(new Set())
  const [searched, setSearched] = useState(false)

  // ⚠️ სტატუსი **კვოტას არ ხარჯავს** (`GET /account`)
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['web', 'status'],
    queryFn: webSearchStatus,
    staleTime: 60_000,
  })

  const available = status?.sources.videos ?? []
  const selected = engines.length ? engines : available.slice(0, 1).map((e) => e.key)

  /** ⚠️ არჩეული წყარო პარამეტრად მიდის — იხ. `WebImageDialog`-ის იგივე ადგილი */
  const search = useMutation({
    mutationFn: (override?: string[]) =>
      searchWebVideos({ query: query.trim(), engines: override ?? selected, limit: 30 }),
    onSuccess: (data) => {
      setItems(data.items)
      setSources(data.sources)
      setQuota(data.quota)
      setSearched(true)
      toast({
        title: data.spent > 0 ? t('web.spent', { count: data.spent }) : t('web.fromCache'),
        variant: data.items.length ? 'success' : 'info',
      })
      qc.invalidateQueries({ queryKey: ['web', 'status'] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const save = useMutation({
    mutationFn: (video: SerpVideo) =>
      saveGalleryVideo({
        target,
        id,
        url: video.link,
        title: video.title,
        channel: video.channel,
        duration: video.duration,
        published_at: video.published,
        thumbnail_url: video.thumbnail,
        source_url: video.link,
        engine: video.engine,
      }),
    onSuccess: (result, video) => {
      setSaved((cur) => new Set(cur).add(video.link))
      toast({
        title: result.duplicate ? t('web.videoAlreadySaved') : t('web.videoSaved'),
        variant: result.duplicate ? 'info' : 'success',
      })
      qc.invalidateQueries({ queryKey: ['gallery-videos'] })
      qc.invalidateQueries({ queryKey: ['gallery-summary'] })
      onSaved?.()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  // „იპოვა, მაგრამ გამოუსადეგარი" — ცალკე მდგომარეობა და ცალკე ტექსტი
  const dropped = useMemo(() => sources.reduce((sum, s) => sum + s.dropped, 0), [sources])
  const offline = useMemo(() => sources.filter((s) => !s.ok).map((s) => s.engine), [sources])
  /**
   * რომელი წყაროები დარჩა გამოუყენებელი — ცარიელ პასუხზე სწორედ ისინი გამოსადეგარია.
   * ⚠️ `useMemo` განზრახ არაა: `available` ყოველ რენდერზე ახალი მასივია
   * (`status?.sources… ?? []`), ე.ი. მემოიზაცია ისედაც ყოველ ჯერზე გაიაროდა.
   */
  const others = available.filter((e) => !selected.includes(e.key))

  /* ⚠️ **ვიდეოს უფასო წყარო არ არსებობს** — ორივე engine SerpApi-სია, ე.ი.
     გასაღების გარეშე სია ცარიელია და ამას ცხადად ვამბობთ. */
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        <div className="mt-6 flex justify-end border-t border-border pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-5 space-y-3">
        {/* რა ინახება — ერთი წინადადება ზემოთ, რომ „შენახვა" ღილაკს ახსნა ჰქონდეს */}
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {t('web.videosHint')}
        </p>

        {/* ---------- 1. რას ვეძებთ ---------- */}
        <StepSection step={1} title={t('web.stepQuery')}>
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('web.queryPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (query.trim()) search.mutate(undefined)
                }
              }}
            />
            <Button
              type="button"
              onClick={() => search.mutate(undefined)}
              disabled={!query.trim() || search.isPending || available.length === 0}
            >
              {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              {t('web.search')}
            </Button>
          </div>
        </StepSection>

        {/* ---------- 2. სად ვეძებთ ---------- */}
        <StepSection step={2} title={t('web.stepSources')}>
          <WebSourcePicker
            engines={available}
            selected={selected}
            onChange={setEngines}
            quota={quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)}
            disabled={search.isPending}
          />
        </StepSection>

        {/* ---------- 3. შედეგები ---------- */}
        <StepSection
          step={3}
          title={t('web.stepResults')}
          hint={items.length > 0 ? t('web.found', { count: items.length }) : undefined}
        >
          {offline.length > 0 && (
            <p className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-px size-3.5 shrink-0" />
              {t('web.sourceOffline', { engines: offline.join(', ') })}
            </p>
          )}

          {items.length === 0 ? (
            /* ⚠️ სამი ცარიელი მდგომარეობა და სამივე სხვადასხვა ამბავია */
            <EmptyState
              icon={searched ? <VideoOff className="size-6" /> : <Search className="size-6" />}
              title={searched ? t('web.nothingFound') : t('web.notSearchedYet')}
              hint={
                searched
                  ? dropped > 0
                    ? t('web.foundUnusable', { count: dropped })
                    : undefined
                  : t('web.notSearchedHint')
              }
              actions={
                // ⚠️ ცარიელი მასივი `EmptyState`-ისთვის „არის" — ღილაკების
                // ცარიელი რიგი ზედმეტ ჰაერს დახატავდა
                searched && query.trim() && others.length > 0
                  ? others.map((engine) => (
                      <Button
                        key={engine.key}
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={search.isPending}
                        onClick={() => {
                          setEngines([engine.key])
                          search.mutate([engine.key])
                        }}
                      >
                        <Search className="size-3.5" />
                        {t('web.searchWith', { engine: engine.name })}
                      </Button>
                    ))
                  : undefined
              }
            />
          ) : (
            <ul className="fb-scroll grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
              {items.map((video) => {
                const on = saved.has(video.link)

                return (
                  <li
                    key={video.link}
                    className={cn(
                      'flex gap-3 rounded-lg border bg-card p-3 transition-colors',
                      on ? 'border-primary' : 'border-border hover:border-primary/50',
                    )}
                  >
                    <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-muted">
                      {video.thumbnail && (
                        /* ⚠️ **ბლარი არსად** — ესკიზი ისე ჩანს, როგორც წყაროს აქვს */
                        <img
                          src={video.thumbnail}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="size-full object-cover"
                        />
                      )}
                      {video.duration != null && (
                        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white">
                          {formatDuration(video.duration)}
                        </span>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <p className="line-clamp-2 text-sm font-medium">{video.title ?? video.link}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {[video.channel, video.published ? date(video.published) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      <div className="mt-auto flex items-center gap-2 pt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={on ? 'outline' : 'default'}
                          disabled={on || save.isPending}
                          onClick={() => save.mutate(video)}
                        >
                          {on ? <Check className="size-3.5" /> : <Play className="size-3.5" />}
                          {on ? t('web.videoSavedShort') : t('web.saveVideo')}
                        </Button>
                        <a
                          href={video.link}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="size-3.5" />
                          {t('photos.infoOpen')}
                        </a>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </StepSection>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </div>
    </ModalShell>
  )
}
