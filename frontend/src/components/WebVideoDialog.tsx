import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ExternalLink, Loader2, Play, Search } from 'lucide-react'
import { searchWebVideos, webSearchStatus, type SerpQuota, type SerpSource, type SerpVideo } from '@/api/web'
import { saveGalleryVideo, type GalleryParentKind } from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { formatDuration } from '@/lib/videoDuration'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
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

  const search = useMutation({
    mutationFn: () => searchWebVideos({ query: query.trim(), engines: selected, limit: 30 }),
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

  /* ⚠️ **ვიდეოს უფასო წყარო არ არსებობს** — ორივე engine SerpApi-სია, ე.ი.
     გასაღების გარეშე სია ცარიელია და ამას ცხადად ვამბობთ. */
  if (!statusLoading && status && available.length === 0) {
    return (
      <ModalShell title={title} onClose={onClose} wide>
        <p className="mt-4 text-sm text-muted-foreground">{t('errors.serpapi_unavailable')}</p>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
        </div>
      </ModalShell>
    )
  }

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-4">
        <p className="text-xs text-muted-foreground">{t('web.videosHint')}</p>

        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('web.queryPlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (query.trim()) search.mutate()
              }
            }}
          />
          <Button
            type="button"
            onClick={() => search.mutate()}
            disabled={!query.trim() || search.isPending || available.length === 0}
          >
            {search.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            {t('web.search')}
          </Button>
        </div>

        <WebSourcePicker
          engines={available}
          selected={selected}
          onChange={setEngines}
          quota={quota ?? (status ? { used: status.used, limit: status.limit, remaining: status.remaining } : null)}
          disabled={search.isPending}
        />

        {/* ⚠️ სამი მდგომარეობა და სამივე სხვადასხვა ტექსტია */}
        {offline.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500">
            <AlertTriangle className="size-3.5" />
            {t('web.sourceOffline', { engines: offline.join(', ') })}
          </p>
        )}
        {searched && items.length === 0 && dropped > 0 && (
          <p className="text-xs text-muted-foreground">{t('web.foundUnusable', { count: dropped })}</p>
        )}
        {searched && items.length === 0 && dropped === 0 && offline.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('web.nothingFound')}</p>
        )}

        {items.length > 0 && (
          <ul className="fb-scroll grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {items.map((video) => {
              const on = saved.has(video.link)

              return (
                <li
                  key={video.link}
                  className="flex gap-3 rounded-xl border border-border bg-card p-2 transition-colors hover:border-primary/50"
                >
                  <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-lg bg-muted">
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
                      <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1 text-[10px] font-medium tabular-nums text-white">
                        {formatDuration(video.duration)}
                      </span>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="line-clamp-2 text-sm font-medium">{video.title ?? video.link}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[video.channel, video.published].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-auto flex items-center gap-1.5 pt-1.5">
                      <Button
                        type="button"
                        size="sm"
                        variant={on ? 'outline' : 'default'}
                        className="h-7 px-2 text-xs"
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
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs',
                          'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                        )}
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
      </div>

      <div className="mt-6 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t('actions.close')}
        </Button>
      </div>
    </ModalShell>
  )
}
