import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Plus, Trash2, Upload } from 'lucide-react'
import {
  createGameNote,
  createGameVideo,
  deleteGameFile,
  deleteGameNote,
  deleteGameVideo,
  fetchGameFiles,
  fetchGameNotes,
  fetchGameVideos,
  GAME_VIDEO_KINDS,
  uploadGameFiles,
  type Game,
  type GameFile,
  type GameVideoKind,
} from '@/api/games'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModalShell } from '@/components/ui/modal-shell'
import { PhotoGrid } from '@/components/ui/photo-grid'
import { formatMinutes } from '@/lib/videoDuration'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { VideoEmbed } from '@/components/VideoEmbed'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { formatBytes } from '@/lib/utils'

/* ============================================================
   თამაშის დეტალები — ვიდეოები (§11.2), სქრინშოტები (§11.3),
   დოკუმენტები და ჩანიშვნები (Tasks §11).

   ⚠️ **ატვირთული სქრინშოტები `game_files.kind = 'image'`-შია** და არა
   `gallery_images`-ში: ის ცხრილი წყაროდან **ჩამოტვირთულ** ფოტოებს ინახავს
   (RAWG/TMDB), user-ის ატვირთული კი სექციის ცხრილშია — ვიდეოსა და
   ბორდგეიმის იგივე წესი.
   ============================================================ */

export function GameDetail({ game, onClose }: { game: Game; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const title = (lang === 'ka' ? game.title_ka || game.title_en : game.title_en || game.title_ka) ?? ''
  const description =
    lang === 'ka'
      ? game.description_ka || game.description_en
      : game.description_en || game.description_ka

  const hltb = [
    { key: 'main', value: game.hltb_main },
    { key: 'main_extra', value: game.hltb_main_extra },
    { key: 'complete', value: game.hltb_complete },
  ].filter((row) => row.value != null)

  const languages = (['interface', 'audio', 'subtitles'] as const).filter(
    (key) => (game.languages?.[key]?.length ?? 0) > 0,
  )

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
            `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
        <div className="flex justify-end">
          {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
          <VisibilityBadge value={game.visibility} />
        </div>

        {/* ---------- მოკლე ცნობები ---------- */}
        <section className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-border p-3 text-sm">
          {game.developer && <span>{game.developer}</span>}
          {game.publisher && game.publisher !== game.developer && (
            <span className="text-muted-foreground">{game.publisher}</span>
          )}
          {game.release_date && <span className="text-muted-foreground">{game.release_date}</span>}
          {game.franchise && (
            <span className="text-muted-foreground">
              {t('games.franchise')}: {game.franchise}
            </span>
          )}
          {game.metacritic != null && <span className="text-muted-foreground">MC {game.metacritic}</span>}
          {/* ⚠️ RAWG-ის შკალა 0–5-ია და არა 0–100 — ისე ვწერთ, როგორც მოდის */}
          {game.users_score != null && (
            <span className="text-muted-foreground">
              {t('games.usersScore')} {game.users_score}/5
            </span>
          )}
          {game.age_rating && <span className="text-muted-foreground">{game.age_rating}</span>}
          {game.size_gb != null && <span className="text-muted-foreground">{game.size_gb} GB</span>}
        </section>

        {/* ---------- HowLongToBeat (11.4 — ხელით ივსება) ---------- */}
        {hltb.length > 0 && (
          <section className="flex flex-wrap gap-4 text-sm">
            {hltb.map((row) => (
              <span key={row.key} className="rounded-md bg-secondary px-2.5 py-1">
                {t(`games.hltb.${row.key}`)}:{' '}
                <b className="tabular-nums">
                  {formatMinutes(row.value, t('games.hoursShort'), t('games.minutesShort'))}
                </b>
              </span>
            ))}
          </section>
        )}

        {description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>
        )}

        {/* ---------- ენები ---------- */}
        {languages.length > 0 && (
          <section className="space-y-1 text-sm">
            {languages.map((key) => (
              <p key={key}>
                <span className="text-muted-foreground">{t(`games.languages.${key}`)}: </span>
                {game.languages[key]!.join(', ')}
              </p>
            ))}
          </section>
        )}

        {/* ---------- DLC-ები ---------- */}
        {game.dlcs.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('games.dlcTitle')}</h3>
            <ul className="space-y-1 text-sm">
              {game.dlcs.map((dlc, i) => (
                <li key={i}>
                  {dlc.name}
                  {dlc.note && <span className="text-muted-foreground"> — {dlc.note}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ---------- მაღაზიები / ოფიციალური საიტი ---------- */}
        {game.links.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('games.linksTitle')}</h3>
            <ul className="space-y-1.5 text-sm">
              {game.links.map((link, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="shrink-0 rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                    {t(`games.linkKinds.${link.kind ?? 'other'}`)}
                  </span>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-w-0 flex-1 truncate text-primary hover:text-primary/70"
                  >
                    {link.label || link.url}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('games.videosTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('games.videosHint')}</p>
          <Videos game={game} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('games.galleryTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('games.galleryHint')}</p>
          <Gallery game={game} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('games.docsTitle')}</h3>
          <p className="mb-3 text-xs text-muted-foreground">{t('games.docsHint')}</p>
          <Files game={game} />
        </section>

        <section>
          <h3 className="mb-1 text-sm font-semibold">{t('games.notesTitle')}</h3>
          <Notes game={game} />
        </section>
      </div>
    </ModalShell>
  )
}

/* ---------- §11.2 — ვიდეოები ---------- */

function Videos({ game }: { game: Game }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const confirm = useConfirm()

  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<GameVideoKind>('walkthrough')

  const { data: videos = [], isLoading } = useQuery({
    queryKey: ['game-videos', game.id],
    queryFn: () => fetchGameVideos(game.id),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['game-videos', game.id] })
    qc.invalidateQueries({ queryKey: ['games'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const add = useMutation({
    mutationFn: () => createGameVideo(game.id, { url: url.trim(), kind }),
    onSuccess: () => {
      setUrl('')
      done()
    },
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteGameVideo, onSuccess: done, onError: fail })

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          className="min-w-56 flex-1"
          placeholder={t('games.videoUrlPlaceholder')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <Select value={kind} onValueChange={(v) => setKind(v as GameVideoKind)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {GAME_VIDEO_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {t(`games.videoKinds.${k}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!url.trim() || add.isPending} onClick={() => add.mutate()}>
          <Plus className="size-3.5" />
          {t('actions.add')}
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !videos.length && (
        <p className="text-xs text-muted-foreground">{t('games.videosEmpty')}</p>
      )}

      <ul className="space-y-4">
        {videos.map((video) => (
          <li key={video.id}>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                {t(`games.videoKinds.${video.kind}`)}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{video.title || video.url}</span>
              <Button
                variant="ghost"
                size="icon"
                className="shrink-0 text-destructive"
                onClick={async () => {
                  const ok = await confirm({ title: t('games.videoDeleteTitle'), variant: 'destructive' })
                  if (ok) remove.mutate(video.id)
                }}
                aria-label={t('actions.delete')}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
            {/* ⚠️ iframe მხოლოდ allowlist-ის `embed_url`-ს იღებს — ჰოსტი აქაც მოწმდება */}
            <VideoEmbed
              video={{
                url: video.url,
                embed_url: video.embed_url,
                title: video.title ?? '',
                platform: video.platform as never,
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ---------- ფაილები ---------- */

/** ატვირთვის საერთო ქცევა — ორივე ბლოკს (გალერეა/დოკუმენტები) ერთი და იგივე სჭირდება */
function useFiles(game: Game, kind: GameFile['kind']) {
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['game-files', game.id, kind],
    queryFn: () => fetchGameFiles(game.id, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['game-files', game.id] })
    qc.invalidateQueries({ queryKey: ['games'] })
    // 17.1 — ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
    qc.invalidateQueries({ queryKey: ['storage'] })
    qc.invalidateQueries({ queryKey: ['me'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const upload = useMutation({
    mutationFn: (picked: File[]) => uploadGameFiles(game.id, kind, picked),
    onSuccess: done,
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteGameFile, onSuccess: done, onError: fail })

  return { query, upload, remove }
}

function Gallery({ game }: { game: Game }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useFiles(game, 'image')
  const images = query.data ?? []

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t('games.addPhotos')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept="image/*"
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {/* საერთო `PhotoGrid` (§2.9) — lightbox, მონიშვნები და „რამდენი გამოჩნდეს" */}
      <PhotoGrid
        items={images.map((file) => ({
          id: file.id,
          src: file.url,
          title: file.original_name,
          size: file.size,
        }))}
        emptyText={query.isLoading ? '' : t('games.galleryEmpty')}
        onDelete={async (ids) => {
          const ok = await confirm({ title: t('games.photoDeleteTitle'), variant: 'destructive' })
          if (ok) ids.forEach((id) => remove.mutate(id))
        }}
      />
    </div>
  )
}

function Files({ game }: { game: Game }) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const input = useRef<HTMLInputElement>(null)
  const { query, upload, remove } = useFiles(game, 'doc')
  const files = query.data ?? []
  /* ონლაინ მნახველი (2026-09-14) — ⚠️ `resolve: storageUrl` იმიტომაა, რომ ეს
     მოდული **საჯარო დისკზეა**; დისკს backend წყვეტს და არა ფრონტი (§17.5). */
  const viewer = useFileViewer({ resolve: storageUrl, onDelete: (id) => remove.mutate(id) })


  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        className="mb-3"
        disabled={upload.isPending}
        onClick={() => input.current?.click()}
      >
        <Upload className="size-3.5" />
        {upload.isPending ? t('actions.saving') : t('games.addDocs')}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? [])
          if (picked.length) upload.mutate(picked)
          e.target.value = ''
        }}
      />

      {!query.isLoading && !files.length && (
        <p className="text-xs text-muted-foreground">{t('games.docsEmpty')}</p>
      )}

      <ul className="space-y-1.5">
        {files.map((file) => (
          <li
            key={file.id}
            className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-sm"
          >
            <FileText className="size-4 shrink-0 text-muted-foreground" />
            {/* ⚠️ სახელი **ღილაკია** — ონლაინ მნახველი (2026-09-14) */}
            <button
              type="button"
              onClick={() => viewer.open(file)}
              className="min-w-0 flex-1 cursor-pointer truncate text-left hover:text-primary"
              title={t('files.viewerOpen')}
            >
              {file.original_name ?? file.url}
            </button>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {formatBytes(file.size)}
            </span>
            <a
              href={storageUrl(file.url) ?? '#'}
              download
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t('books.fileDownload')}
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Download className="size-4" />
            </a>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={async () => {
                const ok = await confirm({
                  title: t('books.fileDeleteTitle'),
                  description: t('books.fileDeleteHint', { name: file.original_name ?? file.url }),
                  variant: 'destructive',
                })
                if (ok) remove.mutate(file.id)
              }}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>

      {/* ონლაინ მნახველი — ერთი კომპონენტი ყველა მოდულზე (2026-09-14) */}
      {viewer.node}
    </div>
  )
}

function Notes({ game }: { game: Game }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [body, setBody] = useState('')

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['game-notes', game.id],
    queryFn: () => fetchGameNotes(game.id),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['game-notes', game.id] })
    qc.invalidateQueries({ queryKey: ['games'] })
  }
  const fail = (e: unknown) => toast({ title: errorMessage(e), variant: 'error' })

  const add = useMutation({
    mutationFn: () => createGameNote(game.id, body),
    onSuccess: () => {
      setBody('')
      done()
    },
    onError: fail,
  })

  const remove = useMutation({ mutationFn: deleteGameNote, onSuccess: done, onError: fail })

  return (
    <div>
      <div className="mb-3 space-y-2">
        <Textarea
          rows={2}
          placeholder={t('games.notePlaceholder')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <Button
          size="sm"
          className="ml-auto flex"
          disabled={!body.trim() || add.isPending}
          onClick={() => add.mutate()}
        >
          <Plus className="size-3.5" />
          {t('actions.add')}
        </Button>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && !notes.length && (
        <p className="text-xs text-muted-foreground">{t('books.notesEmpty')}</p>
      )}

      <ul className="space-y-2">
        {notes.map((note) => (
          <li
            key={note.id}
            className="flex items-start gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{note.body}</p>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-destructive"
              onClick={() => remove.mutate(note.id)}
              aria-label={t('actions.delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  )
}
