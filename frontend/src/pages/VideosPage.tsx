import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  ExternalLink,
  Eye,
  Loader2,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  createVideo,
  deleteVideo,
  fetchVideoMetadata,
  fetchVideos,
  markVideoWatched,
  saveModuleSettings,
  toggleVideoFavorite,
  updateVideo,
  type Video,
  type VideoFilters,
  type VideoInput,
  type VideoKind,
  type VideoMetadata,
} from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { errorMessage, fieldErrors } from '@/lib/errors'
import { useModules } from '@/lib/modules'
import { VideoDetail } from '@/components/VideoDetail'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ModalShell } from '@/components/ui/modal-shell'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ვიდეოების მოდული (I5).
   18+ ჩანაწერები მხოლოდ `video_adult` მოდულით და ასაკის დადასტურების შემდეგ ჩანს.
   ============================================================ */

function duration(seconds: number | null): string | null {
  if (!seconds) return null
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return h
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

export function VideosPage() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()
  const { all, has } = useModules()

  const adultModule = all.find((m) => m.key === 'video_adult')
  const hasAdult = has('video_adult')
  const consented = !!(adultModule?.user_settings as { consent_at?: string } | undefined)?.consent_at

  const [params, setParams] = useSearchParams()
  const view = params.get('view') ?? 'all'

  const [filters, setFilters] = useState<VideoFilters>({})
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Video | 'new' | null>(null)
  const [playing, setPlaying] = useState<Video | null>(null)

  // საიდბარის სექცია → ფილტრი (K7). ხელით ფილტრები (ძებნა/ტეგი) ამას ემატება.
  const viewFilters: VideoFilters =
    view === 'media' || view === 'info'
      ? { kind: view }
      : view === 'adult'
        ? { adult_only: true }
        : view === 'favorite'
          ? { favorite: true }
          : {}

  const effective: VideoFilters = { ...filters, ...viewFilters }

  const query = useQuery({
    queryKey: ['videos', effective],
    queryFn: () => fetchVideos(effective),
  })

  // საიდბარის „დამატება" → `?new=1`
  useEffect(() => {
    if (params.get('new')) {
      setEditing('new')
      const next = new URLSearchParams(params)
      next.delete('new')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['videos'] })
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const favorite = useMutation({ mutationFn: toggleVideoFavorite, onSuccess: invalidate, onError: fail })
  const watched = useMutation({ mutationFn: markVideoWatched, onSuccess: invalidate, onError: fail })
  const remove = useMutation({ mutationFn: deleteVideo, onSuccess: invalidate, onError: fail })

  const consent = useMutation({
    mutationFn: () => saveModuleSettings('video_adult', { consent_at: new Date().toISOString() }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['modules'] }),
    onError: fail,
  })

  const videos = query.data ?? []
  const tags = useMemo(
    () => [...new Set(videos.flatMap((v) => v.tags))].sort(),
    [videos],
  )

  const applySearch = (e: React.FormEvent) => {
    e.preventDefault()
    setFilters((f) => ({ ...f, q: search || undefined }))
  }

  const heading =
    view === 'media'
      ? t('videos.kindMedia')
      : view === 'info'
        ? t('videos.kindInfo')
        : view === 'adult'
          ? t('videos.adultSection')
          : view === 'favorite'
            ? t('filter.favorite')
            : t('videos.title')

  // 18+ სექცია ასაკის დადასტურებამდე დახურულია (I5/K7)
  if (view === 'adult' && hasAdult && !consented) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center">
          <h1 className="text-xl font-semibold text-destructive">{t('videos.consentTitle')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('videos.consentText')}</p>
          <Button
            className="mt-5"
            variant="destructive"
            disabled={consent.isPending}
            onClick={() => consent.mutate()}
          >
            {t('videos.consentConfirm')}
          </Button>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('videos.count', { count: videos.length })}
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" />
          {t('videos.add')}
        </Button>
      </div>

      {/* ---------- ფილტრები ---------- */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form onSubmit={applySearch} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-56 pl-9"
            placeholder={t('videos.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </form>

        <Button
          variant={filters.favorite ? 'default' : 'outline'}
          size="sm"
          aria-pressed={!!filters.favorite}
          onClick={() => setFilters((f) => ({ ...f, favorite: f.favorite ? undefined : true }))}
        >
          <Star className="size-4" />
          {t('filter.favorite')}
        </Button>

        {tags.map((tag) => (
          <button
            key={tag}
            onClick={() => setFilters((f) => ({ ...f, tag: f.tag === tag ? undefined : tag }))}
            className={cn(
              'cursor-pointer rounded-[5px] border px-2.5 py-1 text-xs transition-colors',
              filters.tag === tag
                ? 'border-primary bg-secondary font-medium'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            #{tag}
          </button>
        ))}

        {(filters.q || filters.favorite || filters.tag) && (
          <Button
            variant="destructiveOutline"
            size="sm"
            className="ml-auto"
            onClick={() => {
              setFilters({})
              setSearch('')
            }}
          >
            <X className="size-4" />
            {t('filter.clear')}
          </Button>
        )}
      </div>

      {/* ---------- ბადე ---------- */}
      {query.isLoading && <p className="text-sm text-muted-foreground">{t('common.loading')}</p>}
      {!query.isLoading && !videos.length && (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('videos.empty')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => {
          const thumb = storageUrl(v.thumbnail)
          return (
            <div key={v.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <button
                onClick={() => {
                  setPlaying(v)
                  watched.mutate(v.id)
                }}
                className="relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted"
              >
                {thumb ? (
                  <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <Play className="size-8" />
                  </span>
                )}
                <span className="absolute inset-0 grid place-items-center bg-black/30 opacity-0 transition-opacity hover:opacity-100">
                  <Play className="size-10 text-white" />
                </span>
                {v.duration && (
                  <span className="absolute bottom-2 right-2 rounded-[5px] bg-black/75 px-1.5 py-0.5 text-xs text-white">
                    {duration(v.duration)}
                  </span>
                )}
                {v.is_adult && (
                  <span className="absolute left-2 top-2 rounded-[5px] bg-destructive px-1.5 py-0.5 text-xs font-medium text-destructive-foreground">
                    18+
                  </span>
                )}
              </button>

              <div className="p-3">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 truncate text-sm font-medium" title={v.title}>
                    {v.title}
                  </h3>
                  <button
                    onClick={() => favorite.mutate(v.id)}
                    aria-label={t(v.is_favorite ? 'actions.unfavorite' : 'actions.favorite')}
                    className="cursor-pointer text-muted-foreground hover:text-gold"
                  >
                    <Star className={cn('size-4', v.is_favorite && 'fill-gold text-gold')} />
                  </button>
                </div>

                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="capitalize">{v.platform}</span>
                  {v.watch_count > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Eye className="size-3" />
                      {v.watch_count}
                    </span>
                  )}
                  {v.watched_at && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {new Date(v.watched_at).toLocaleDateString()}
                    </span>
                  )}
                </p>

                {v.tags.length > 0 && (
                  <p className="mt-2 flex flex-wrap gap-1">
                    {v.tags.map((tag) => (
                      <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                        #{tag}
                      </span>
                    ))}
                  </p>
                )}

                <div className="mt-3 flex items-center gap-1 border-t border-border pt-2">
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <ExternalLink className="size-3.5" />
                    {t('videos.source')}
                  </a>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                    <Pencil className="size-3.5" />
                    {t('actions.edit')}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-destructive"
                    onClick={async () => {
                      const ok = await confirm({
                        title: t('videos.deleteTitle'),
                        description: t('videos.deleteHint', { title: v.title }),
                        variant: 'destructive',
                      })
                      if (ok) remove.mutate(v.id)
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {playing && <VideoDetail video={playing} onClose={() => setPlaying(null)} />}

      {editing && (
        <VideoForm
          video={editing === 'new' ? null : editing}
          canMarkAdult={hasAdult}
          onClose={() => setEditing(null)}
          onSaved={() => {
            invalidate()
            setEditing(null)
          }}
        />
      )}
    </main>
  )
}

/* ---------- ფორმა ---------- */

function VideoForm({
  video,
  canMarkAdult,
  onClose,
  onSaved,
}: {
  video: Video | null
  canMarkAdult: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const { toast } = useToast()

  const [form, setForm] = useState({
    title: video?.title ?? '',
    url: video?.url ?? '',
    description: video?.description ?? '',
    kind: (video?.kind ?? 'media') as VideoKind,
    duration: video?.duration ? String(video.duration) : '',
    tags: (video?.tags ?? []).join(', '),
    is_adult: video?.is_adult ?? false,
  })
  const [thumbnail, setThumbnail] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [meta, setMeta] = useState<VideoMetadata | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const lastFetched = useRef<string>(video?.url ?? '')

  /**
   * ბმულის ჩასმისთანავე ვცდილობთ სათაურის/thumbnail-ის/ხანგრძლივობის წამოღებას (K2).
   * ივსება **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არ ვაბათილებთ.
   */
  const loadMeta = async (url: string) => {
    const clean = url.trim()
    if (!clean || clean === lastFetched.current || !/^https?:\/\//i.test(clean)) return
    lastFetched.current = clean
    setMetaLoading(true)
    try {
      const m = await fetchVideoMetadata(clean)
      setMeta(m)
      setForm((f) => ({
        ...f,
        title: f.title || (m.title ?? ''),
        description: f.description || (m.description ?? ''),
        duration: f.duration || (m.duration ? String(m.duration) : ''),
        tags: f.tags || m.tags.join(', '),
      }))
    } catch {
      setMeta(null)
    } finally {
      setMetaLoading(false)
    }
  }

  const save = useMutation({
    mutationFn: (input: VideoInput) => (video ? updateVideo(video.id, input) : createVideo(input)),
    onSuccess: () => {
      toast({ title: t('videos.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})
    save.mutate({
      title: form.title,
      url: form.url,
      kind: form.kind,
      description: form.description || undefined,
      duration: form.duration ? Number(form.duration) : null,
      tags: form.tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      is_adult: form.is_adult,
      thumbnail,
    })
  }

  return (
    <ModalShell title={t(video ? 'videos.edit' : 'videos.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <Label htmlFor="v-url">{t('videos.url')}</Label>
          <Input
            id="v-url"
            autoFocus
            placeholder="https://www.youtube.com/watch?v=…"
            value={form.url}
            onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            onBlur={(e) => void loadMeta(e.target.value)}
            onPaste={(e) => {
              const pasted = e.clipboardData.getData('text')
              if (pasted) setTimeout(() => void loadMeta(pasted), 0)
            }}
          />
          {errors.url && <p className="mt-1 text-xs text-destructive">{errors.url}</p>}
          <p className="mt-1 text-xs text-muted-foreground">{t('videos.urlHint')}</p>

          {/* ბმულიდან წამოღებული მონაცემი (K2) */}
          {metaLoading && (
            <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              {t('videos.metaLoading')}
            </p>
          )}
          {!metaLoading && meta && (
            <div className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-card/50 p-2">
              {meta.thumbnail_url && (
                <img src={meta.thumbnail_url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 text-xs text-muted-foreground">
                <p className="truncate text-foreground">{meta.title ?? t('videos.metaNoTitle')}</p>
                <p className="capitalize">
                  {meta.platform}
                  {meta.author && ` · ${meta.author}`}
                  {meta.duration ? ` · ${duration(meta.duration)}` : ''}
                </p>
                {meta.platform === 'youtube' && !meta.youtube_key && (
                  <p className="mt-0.5">{t('videos.metaNeedsKey')}</p>
                )}
              </div>
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="v-title">{t('videos.name')}</Label>
          <Input
            id="v-title"
            placeholder={t('videos.namePlaceholder')}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
          {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
        </div>

        <div>
          <Label htmlFor="v-desc">{t('videos.description')}</Label>
          <Textarea
            id="v-desc"
            rows={3}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="v-duration">{t('videos.duration')}</Label>
            <Input
              id="v-duration"
              type="number"
              min={0}
              value={form.duration}
              onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="v-tags">{t('videos.tags')}</Label>
            <Input
              id="v-tags"
              placeholder={t('videos.tagsPlaceholder')}
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
            />
          </div>
        </div>

        {/* ტიპი — საიდბარის სექციები ამით იყოფა (K7) */}
        <div>
          <Label>{t('videos.kind')}</Label>
          <div className="flex gap-1 rounded-md border border-border p-0.5">
            {(['media', 'info'] as VideoKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
                className={cn(
                  'flex-1 cursor-pointer rounded-[4px] px-2.5 py-1.5 text-sm font-medium transition-colors',
                  form.kind === k
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {t(k === 'media' ? 'videos.kindMedia' : 'videos.kindInfo')}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm hover:bg-muted">
            <Upload className="size-4" />
            {thumbnail ? thumbnail.name : t('videos.thumbnail')}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => setThumbnail(e.target.files?.[0] ?? null)}
            />
          </label>

          {canMarkAdult && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={form.is_adult}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_adult: v === true }))}
              />
              {t('videos.isAdult')}
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
