import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AudioLines, CalendarDays, Download, FileText, FileX, MonitorPlay, Play, Plus, SquarePen, Trash2, Tv, Upload } from 'lucide-react'
import {
  createVideoNote,
  deleteVideoDownload,
  deleteVideoFile,
  deleteVideoNote,
  fetchVideoFiles,
  fetchVideoNotes,
  fetchSimilarVideos,
  updateVideoNote,
  uploadVideoFiles,
  type Video,
  toggleVideoFavorite,
} from '@/api/videos'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { useDateFormat } from '@/lib/dates'
import { isAllowedEmbed } from '@/lib/embed'
import { errorMessage, translateCode } from '@/lib/errors'
import { cn, formatBytes } from '@/lib/utils'
import { LocalVideoPlayer } from '@/components/LocalVideoPlayer'
import { usePlayer } from '@/lib/player'
import { formatDuration } from '@/lib/videoDuration'
import { VideoEmbed } from '@/components/VideoEmbed'
import { ModalShell } from '@/components/ui/modal-shell'
import { Button } from '@/components/ui/button'
import { VideoBadges } from '@/components/VideoBadges'
import { useContentLang } from '@/lib/settings'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Tabs, TabInfo, type TabItem } from '@/components/ui/tabs'
import { useConfirm, useToast } from '@/components/ui/feedback'

/* ============================================================
   ვიდეოს დეტალური ხედი (K3): ვიდეო · ფოტოები · დოკუმენტები · ჩანიშვნები.
   ფაილები `video_files`-შია, ჩანიშვნები `video_notes`-ში — ცხრილი სექციისაა.

   ⚠️ Tasks §26.4 — ჩანართების რიგი ყველა დეტალის ფანჯრის რიგს მიჰყვება
   (ფოტოები ზემოთ, მერე … დოკუმენტები, ჩანიშვნები); ჩანართები თვითონ რჩება —
   ეს შენი გადაწყვეტილებაა (ბარათები შიგთავსს ეკრანის ქვემოთ ჩაწევდა).

   ⚠️ **Tasks §35.6 — საკუთარი ჩაშენება აღარ აქვს.** აქ `VideoEmbed` იდგა და
   გლობალურ დამკვრელთან ერთად **ორივე ჟღერდა**. ახლა ვიდეოს ჩანართში ესკიზია
   და „დამკვრელში დაკვრა": ვიდეო რიგს გადაეცემა (გვერდი წყვეტს, რომელ
   რიგს — `onPlay`) და ფანჯარა **იხურება**, რადგან მოდალი დამკვრელს ფარავს
   (`lib/layers.ts`) — ღია ფანჯრის ქვეშ ვიდეო არ ჩანდა. „ნანახად" ჩათვლა
   ახლა დამკვრელშია (ჩართვაზე) და არა ფანჯრის გახსნაზე: გახსნა ყურება არაა.
   ============================================================ */

type Tab = 'video' | 'images' | 'notes' | 'docs' | 'local'

function bytes(n: number): string {
  if (n <= 0) return '0 KB'
  const units = ['B', 'KB', 'MB']
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), units.length - 1)
  return `${(n / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

export function VideoDetail({
  video,
  onClose,
  onOpen,
  onPlay,
  onEdit,
}: {
  video: Video
  onClose: () => void
  /** „მსგავს ვიდეოზე" გადასვლა (K4) — მშობელი წყვეტს, რას აკეთებს */
  onOpen?: (video: Video) => void
  /**
   * დამკვრელისთვის გადაცემა (§35.6) — გვერდი წყვეტს რიგს: სიაში მყოფი
   * ვიდეო **გაფილტრულ სიას** აქედან უშვებს, სიის გარეთა — მარტო საკუთარ თავს.
   */
  onPlay: (video: Video) => void
  /** Tasks §19.6 — „რედაქტირება“ ფანჯრიდან; გვერდი წყვეტს, რა გაიხსნას */
  onEdit?: (video: Video) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { date } = useDateFormat()
  const qc = useQueryClient()
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ ბარათზე იყო)
  const favorite = useMutation({
    mutationFn: () => toggleVideoFavorite(video.id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['videos'] }),
  })
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>('video')
  /** Tasks §21.2 — ლოკალური ფლეერი ფანჯრის თავზე (მოდალები ერთმანეთზე დგება) */
  const [localOpen, setLocalOpen] = useState(false)

  const filesQ = useQuery({
    queryKey: ['video-files', video.id],
    queryFn: () => fetchVideoFiles(video.id),
  })
  const notesQ = useQuery({ queryKey: ['video-notes', video.id], queryFn: () => fetchVideoNotes(video.id) })

  const images = (filesQ.data ?? []).filter((a) => a.kind === 'image')
  const docs = (filesQ.data ?? []).filter((a) => a.kind === 'doc')
  const notes = notesQ.data ?? []

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['video-files', video.id] })
    qc.invalidateQueries({ queryKey: ['video-notes', video.id] })
    qc.invalidateQueries({ queryKey: ['videos'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: ({ kind, files }: { kind: 'image' | 'doc'; files: File[] }) =>
      uploadVideoFiles(video.id, kind, files),
    onSuccess: refresh,
    onError: fail,
  })
  const removeFile = useMutation({ mutationFn: deleteVideoFile, onSuccess: refresh, onError: fail })
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => removeFile.mutate(id) })

  const pick = (kind: 'image' | 'doc') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    if (files.length) upload.mutate({ kind, files })
    e.target.value = ''
  }

  const TABS: TabItem<Tab>[] = [
    { value: 'video', label: t('videos.tabVideo') },
    { value: 'images', label: t('videos.tabImages'), badge: images.length || undefined },
    { value: 'docs', label: t('videos.tabDocs'), badge: docs.length || undefined },
    { value: 'notes', label: t('videos.tabNotes'), badge: notes.length || undefined },
    // Tasks §21.4 — „ლოკალური ასლი" მხოლოდ მაშინ, როცა რამე არის სათქმელი
    ...(video.download_status ? [{ value: 'local' as Tab, label: t('videos.local.tab') }] : []),
  ]

  const uploadButton = (kind: 'image' | 'doc') => (
    <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3.5 text-sm hover:bg-muted">
      {kind === 'image' ? <Upload className="size-4" /> : <Plus className="size-4" />}
      {t(kind === 'image' ? 'videos.uploadImages' : 'videos.uploadDocs')}
      <input
        type="file"
        multiple
        accept={kind === 'image' ? 'image/*' : '.pdf,.doc,.docx,.txt,.rtf,.odt,.xls,.xlsx,.csv,.ppt,.pptx'}
        className="hidden"
        onChange={pick(kind)}
      />
    </label>
  )

  return (
    <ModalShell title={video.title} onClose={onClose} wide>
      {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
          `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
      {/* Tasks §19.6 — სათაურის ქვეშ იგივე სამი ბეჯი, რაც ბარათზეა (ტიპი · სტატუსი · პლატფორმა), და „რედაქტირება“ */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <VideoBadges video={video} lang={lang} />
        <div className="flex flex-wrap items-center gap-2">
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={video.visibility} />
          {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
          <VisitBadge type="video" id={video.id} />
          <FavoriteButton size="xs" active={video.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
          {onEdit && (
            <Button variant="edit" size="sm" onClick={() => onEdit(video)}>
              <SquarePen className="size-3.5" />
              {t('actions.edit')}
            </Button>
          )}
        </div>
      </div>

      <Tabs items={TABS} value={tab} onChange={setTab} className="mt-4" />

      <div className="mt-4">
        {tab === 'local' && (
          <LocalCopyTab video={video} onPlay={() => setLocalOpen(true)} />
        )}

        {tab === 'video' && (
          <>
            <PlayInPlayer
              video={video}
              onPlay={() => {
                onPlay(video)
                onClose()
              }}
              onShow={onClose}
            />
            {/* Q52 — ვინ ატვირთა და როდის (ვებძებნიდან ან ბმულის ჩასმისას) */}
            {(video.channel || video.published_at) && (
              <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {video.channel && (
                  <span className="inline-flex items-center gap-1.5" title={t('fields.name.video.channel')}>
                    <Tv className="size-3.5" />
                    {video.channel}
                  </span>
                )}
                {video.published_at && (
                  <span className="inline-flex items-center gap-1.5" title={t('fields.name.video.published_at')}>
                    <CalendarDays className="size-3.5" />
                    {date(video.published_at)}
                  </span>
                )}
              </p>
            )}
            {video.description && (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">{video.description}</p>
            )}
            {video.tags.length > 0 && (
              <p className="mt-3 flex flex-wrap gap-1">
                {video.tags.map((tag) => (
                  <span key={tag} className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                    #{tag}
                  </span>
                ))}
              </p>
            )}
            <SimilarVideos video={video} onOpen={onOpen} />
          </>
        )}

        {tab === 'images' && (
          <>
            <TabInfo>{t('videos.imagesInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('image')}</div>
            {/* საერთო `PhotoGrid` (§2.9) — ადრე თვითნაკეთი ბადე იყო, სადაც
                დაჭერა ფოტოს **ახალ ჩანართში** ხსნიდა; ახლა lightbox-ია,
                მონიშვნებით და „რამდენი გამოჩნდეს" არჩევანით. */}
            <PhotoGrid
              items={images.map((a) => ({
                id: a.id,
                src: a.url,
                title: a.original_name,
                size: a.size,
              }))}
              emptyText={t('videos.noImages')}
              onDelete={(ids) => ids.forEach((id) => removeFile.mutate(id))}
            />
          </>
        )}

        {tab === 'notes' && (
          <>
            <TabInfo>{t('videos.notesInfo')}</TabInfo>
            {/* ⚠️ სხეული გაზიარებულია (Tasks §6.7) — აქ ადრე ხელით აწყობილი
                სია იდგა თავისი inline რედაქტირებით, წაშლის დადასტურების
                გარეშე და `toLocaleString()`-ით. */}
            <RecordNotes
              queryKey={['video-notes', video.id]}
              invalidate={[['videos']]}
              api={{
                list: () => fetchVideoNotes(video.id),
                create: (input) => createVideoNote(video.id, input.body),
                update: (id, input) => updateVideoNote(id, input.body),
                remove: deleteVideoNote,
              }}
              placeholder={t('videos.notePlaceholder')}
              addLabel={t('videos.addNote')}
              emptyTitle={t('videos.noNotes')}
              emptyHint={t('recordNotes.emptyHint')}
            />
          </>
        )}

        {tab === 'docs' && (
          <>
            <TabInfo>{t('videos.docsInfo')}</TabInfo>
            <div className="mb-3">{uploadButton('doc')}</div>
            {docs.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                {t('videos.noDocs')}
              </p>
            ) : (
              <ul className="space-y-2">
                {docs.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
                    <button
                      type="button"
                      onClick={() => viewer.open(a)}
                      className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm hover:text-primary"
                      title={t('files.viewerOpen')}
                    >
                      {a.original_name}
                    </button>
                    <span className="shrink-0 text-xs text-muted-foreground">{bytes(a.size)}</span>
                    <a
                      href={storageUrl(a.url) ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="shrink-0 cursor-pointer text-muted-foreground hover:text-foreground"
                      aria-label={t('videos.download')}
                    >
                      <Download className="size-4" />
                    </a>
                    <button
                      onClick={() => removeFile.mutate(a.id)}
                      aria-label={t('actions.delete')}
                      className="shrink-0 cursor-pointer text-destructive hover:opacity-80"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>

      {/* ონლაინ მნახველი — ერთი კომპონენტი ყველა მოდულზე (2026-09-14) */}
      {viewer.node}

      {localOpen && (
        <LocalVideoPlayer
          video={video}
          onClose={() => setLocalOpen(false)}
          onRemoved={() => setTab('video')}
        />
      )}
    </ModalShell>
  )
}

/* ---------- დამკვრელში დაკვრა (§35.6) ---------- */

/**
 * ესკიზი დიდი „დაკვრით" — ვიდეო გლობალურ დამკვრელს გადაეცემა.
 *
 * ⚠️ **ეს ვიდეო თუ უკვე დამკვრელშია**, თავიდან არ ირთვება (რიგიც არ
 * იცვლება): ღილაკი ამბობს „ახლა დამკვრელში უკრავს" და დაჭერაზე ფანჯარას
 * ხურავს — პაუზაზე თუ იყო, აგრძელებს.
 *
 * ⚠️ ჩაუშენებელი წყარო (`platform = other`) ძველებურად ბმულია —
 * `VideoEmbed`-ის მესამე შტო ფრეიმს არ ხატავს, ე.ი. მეორე ხმა არ ჩნდება.
 */
function PlayInPlayer({ video, onPlay, onShow }: { video: Video; onPlay: () => void; onShow: () => void }) {
  const { t } = useTranslation()
  const player = usePlayer()

  if (video.platform !== 'file' && !isAllowedEmbed(video.embed_url)) return <VideoEmbed video={video} />

  const thumb = storageUrl(video.thumbnail)
  const here = player.current?.kind === 'video' && player.current.id === video.id
  const label = here
    ? t(player.playing ? 'playback.playingInPlayer' : 'playback.resumeInPlayer')
    : t('playback.playInPlayer')

  return (
    <button
      type="button"
      onClick={() => {
        if (!here) return onPlay()
        if (!player.playing) player.toggle()
        onShow()
      }}
      className="group relative block aspect-video w-full cursor-pointer overflow-hidden rounded-lg bg-black"
    >
      {thumb && (
        <img
          src={thumb}
          alt=""
          className="size-full object-cover opacity-80 transition-opacity group-hover:opacity-100"
        />
      )}
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 text-white">
        {here && player.playing ? (
          <AudioLines className="size-12 drop-shadow" />
        ) : (
          <Play className="size-12 fill-current drop-shadow" />
        )}
        <span className="rounded-md bg-black/60 px-3 py-1.5 text-sm font-medium">{label}</span>
      </span>
    </button>
  )
}

/* ---------- მსგავსი ვიდეოები (K4) ---------- */

/**
 * შემოთავაზება **ჩემი ბიბლიოთეკიდან** — საერთო ტეგები, სათაურის მსგავსება,
 * იგივე პლატფორმა/ტიპი (backend: `VideoSearch::similar()`).
 * YouTube-ის „related videos" API 2023-იდან აღარ არსებობს.
 */
function SimilarVideos({ video, onOpen }: { video: Video; onOpen?: (video: Video) => void }) {
  const { t } = useTranslation()
  const { data } = useQuery({
    queryKey: ['video-similar', video.id],
    queryFn: () => fetchSimilarVideos(video.id),
    staleTime: 60_000,
  })

  const similar = data ?? []
  if (!similar.length) return null

  return (
    <section className="mt-6 border-t border-border pt-4">
      <h3 className="mb-3 text-sm font-semibold">{t('videos.similar')}</h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {similar.map((v) => {
          const thumb = storageUrl(v.thumbnail)
          const inner = (
            <>
              <span className="relative block aspect-video overflow-hidden rounded-lg bg-muted">
                {thumb ? (
                  <img src={thumb} alt="" className="size-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid size-full place-items-center text-muted-foreground">
                    <Play className="size-6" />
                  </span>
                )}
                {v.duration && (
                  <span className="absolute bottom-1 right-1 rounded-[4px] bg-black/75 px-1 py-0.5 text-[10px] text-white">
                    {formatDuration(v.duration)}
                  </span>
                )}
              </span>
              <span className="mt-1.5 block truncate text-xs font-medium" title={v.title}>
                {v.title}
              </span>
              <span className="block truncate text-[11px] capitalize text-muted-foreground">
                {v.platform}
                {v.tags.length > 0 && ` · #${v.tags.slice(0, 2).join(' #')}`}
              </span>
            </>
          )

          return (
            <li key={v.id}>
              {onOpen ? (
                <button
                  type="button"
                  onClick={() => onOpen(v)}
                  className="w-full cursor-pointer text-left hover:opacity-90"
                >
                  {inner}
                </button>
              ) : (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="block hover:opacity-90">
                  {inner}
                </a>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/**
 * **„ლოკალური ასლი" ჩანართი** (Tasks §21.4) — მდგომარეობა, ზომა, ფორმატი, თარიღი,
 * დაკვრა ლოკალურ ფლეერში და ფაილის წაშლა. ⚠️ ჩამოტვირთვის **დაწყება** აქ არ არის —
 * ის ბარათზე და კონტექსტურ მენიუშია (`yt-dlp`-ის არსებობას გვერდი ამოწმებს).
 */
function LocalCopyTab({ video, onPlay }: { video: Video; onPlay: () => void }) {
  const { t } = useTranslation()
  const { date } = useDateFormat()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { toast } = useToast()

  const remove = useMutation({
    mutationFn: () => deleteVideoDownload(video.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['videos'] })
      toast({ title: t('videos.local.removed'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const askRemove = async () => {
    const ok = await confirm({
      title: t('videos.local.removeTitle'),
      description: t('videos.local.removeHint', { name: video.title, size: formatBytes(video.download_size) }),
      variant: 'destructive',
    })
    if (ok) remove.mutate()
  }

  const ready = video.download_status === 'ready'
  const state = ready
    ? t('videos.local.ready')
    : video.download_status === 'failed'
      ? t('videos.local.failed')
      : video.download_stale
        ? t('videos.local.stalled')
        : t('videos.local.running')

  return (
    <div className="space-y-4">
      <TabInfo>{t('videos.local.tabInfo')}</TabInfo>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t('form.status')}</dt>
          <dd className={cn('font-medium', ready ? 'text-[var(--status-watched)]' : video.download_status === 'failed' && 'text-destructive')}>
            {state}
          </dd>
        </div>
        {ready && (
          <div>
            <dt className="text-xs text-muted-foreground">{t('videos.local.size')}</dt>
            <dd className="font-medium">
              {[formatBytes(video.download_size), video.download_format].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}
        {video.downloaded_at && (
          <div>
            <dt className="text-xs text-muted-foreground">{t('videos.local.date')}</dt>
            <dd className="font-medium">{date(video.downloaded_at)}</dd>
          </div>
        )}
        {video.download_status === 'failed' && video.download_error && (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">{t('videos.local.error')}</dt>
            <dd className="text-destructive">{translateCode(video.download_error) || video.download_error}</dd>
          </div>
        )}
      </dl>
      {ready && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={onPlay}>
            <MonitorPlay className="size-4" />
            {t('videos.local.play')}
          </Button>
          <Button variant="destructiveOutline" disabled={remove.isPending} onClick={() => void askRemove()}>
            <FileX className="size-4" />
            {t('videos.local.remove')}
          </Button>
        </div>
      )}
    </div>
  )
}
