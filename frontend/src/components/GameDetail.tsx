import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Gamepad2, Plus, Trash2, Upload } from 'lucide-react'
import {
  createGameNote,
  createGameVideo,
  deleteGameFile,
  deleteGameNote,
  deleteGameVideo,
  fetchGameFiles,
  fetchGameNotes,
  updateGameNote,
  fetchGameVideos,
  GAME_VIDEO_KINDS,
  uploadGameFiles,
  type Game,
  type GameFile,
  type GameVideoKind,
  toggleGameFavorite,
} from '@/api/games'
import { storageUrl } from '@/lib/api'
import { useFileViewer } from '@/components/FileViewer'
import { RecordNotes } from '@/components/RecordNotes'
import { GameMetaSections } from '@/components/GameMetaCards'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { VisitBadge } from '@/components/RecordVisits'
import { ModalShell } from '@/components/ui/modal-shell'
import { RatingStars } from '@/components/ui/star-rating'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VideoEmbed } from '@/components/VideoEmbed'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { formatBytes } from '@/lib/utils'
import { LinkField } from '@/components/ui/link-field'

/* ============================================================
   თამაშის დეტალები — ვიდეოები (§11.2), სქრინშოტები (§11.3),
   დოკუმენტები და ჩანიშვნები (Tasks §11).

   ⚠️ **რიგი §22.2-ით შეიცვალა** (შენი სიტყვები: „ფოტოები ბოლოშია — ზემოთ
   გააკეთე, კარგი ზომით"): თავში მთავარი ფოტო, სტატუსი, ჟანრები,
   პლატფორმები და მოკლე ცნობები; მერე **სქრინშოტები — Steam-ის მაღაზიის
   გვერდივით** (`PhotoShowcase`: პირველი დიდად, დანარჩენი ზოლად); მერე
   აღწერა, ბმულები, ვიდეოები, დოკუმენტები და ჩანიშვნები. აქამდე მთავარი
   ფოტო, სტატუსი, ჟანრები და პლატფორმები ფანჯარაში საერთოდ არ ჩანდა, ხოლო
   სქრინშოტები 11-დან მე-9 იყო.

   ⚠️ **ატვირთული სქრინშოტები `game_files.kind = 'image'`-შია** და არა
   `gallery_images`-ში: ის ცხრილი წყაროდან **ჩამოტვირთულ** ფოტოებს ინახავს
   (RAWG/TMDB), user-ის ატვირთული კი სექციის ცხრილშია — ვიდეოსა და
   ბორდგეიმის იგივე წესი.
   ============================================================ */

/**
 * პლატფორმების ჩიპები — **„ჩემი პლატფორმა" დაჭერით ირჩევა** (Tasks §6.9).
 *
 * ⚠️ ფორმიდან `my_platform` ამოღებულია (წინა პარტიის §13), ანათება კი დეტალსა
 * და სიაში დარჩა — ე.ი. ახალ თამაშს „ჩემი" ვერასდროს ექნებოდა. ხელახლა დაჭერა
 * მოხსნის (`null`); სია `['games']`-ის გაუქმებით ახლდება და დეტალს ახალ
 * ობიექტს აწვდის (`GamesPage` მას id-ით პოულობს).
 */
export function GameDetail({ game, onClose }: { game: Game; onClose: () => void }) {
  // Tasks §8 — რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favoriteQc = useQueryClient()
  const favorite = useMutation({
    mutationFn: () => toggleGameFavorite(game.id),
    onSuccess: () => void favoriteQc.invalidateQueries({ queryKey: ['games'] }),
  })
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const title = (lang === 'ka' ? game.title_ka || game.title_en : game.title_en || game.title_ka) ?? ''
  const cover = storageUrl(game.cover)
  const description =
    lang === 'ka'
      ? game.description_ka || game.description_en
      : game.description_en || game.description_ka

  return (
    <ModalShell title={title} onClose={onClose} wide>
      <div className="mt-4 space-y-6">
        {/* ---------- თავი: მთავარი ფოტო, სტატუსი, ჟანრები, პლატფორმები (§22.2 → §26.4) ---------- */}
        <DetailHero
          image={cover}
          alt={title}
          fallback={<Gamepad2 className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="game" status={game.status} />
              {/* Tasks §9 — ვარსკვლავები და „4.6 / 10" დეტალის თავში */}
              <RatingStars value={game.rating} />
              {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={game.visibility} />
              {/* Tasks §10 — „შევედი N-ჯერ" და ჟურნალი */}
              <VisitBadge type="game" id={game.id} />
              <FavoriteButton size="xs" active={game.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
            </>
          }
        >

            {/* Tasks §24.2 — ჟანრები და პლატფორმები თავიდან ბარათებად გავიდა (ქვემოთ, `GameMetaSections`) */}

            {/* ---------- მოკლე ცნობები ---------- */}
            <DetailFacts>
              {game.developer && <span className="text-foreground">{game.developer}</span>}
              {game.publisher && game.publisher !== game.developer && <span>{game.publisher}</span>}
              {game.release_date && <span>{game.release_date}</span>}
              {game.franchise && (
                <span>
                  {t('games.franchise')}: {game.franchise}
                </span>
              )}
              {/* ⚠️ RAWG-ის შკალა 0–5-ია და არა 0–100 — ისე ვწერთ, როგორც მოდის */}
              {game.users_score != null && (
                <span>
                  {t('games.usersScore')} {game.users_score}/5
                </span>
              )}
              {game.age_rating && <span>{game.age_rating}</span>}
              {game.size_gb != null && <span>{game.size_gb} GB</span>}
            </DetailFacts>
        </DetailHero>

        {/* ---------- Tasks §24.2 — პლატფორმები („ჩემი" დაჭერით) · რეჟიმები · ჟანრები ბარათებად ---------- */}
        <GameMetaSections game={game} />

        {/* ---------- სქრინშოტები — ზემოთ და დიდად (§22.2, Q35) ---------- */}
        <Screenshots game={game} />

        {description && (
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">{description}</p>
        )}

        {/* ---------- მაღაზიები / ოფიციალური საიტი ---------- */}
        {game.links.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('games.linksTitle')}</h3>
            <ul className="space-y-1.5 text-sm">
              {game.links.map((link, i) => (
                <li key={i} className="flex items-center gap-2">
                  {/* §22.3 — „რა არის" + (მაღაზიას) „სად" */}
                  <span className="shrink-0 rounded-[5px] bg-secondary px-1.5 py-0.5 text-[11px]">
                    {t(`games.linkKinds.${link.kind ?? 'other'}`)}
                    {link.kind === 'store' && link.store && ` · ${t(`games.linkStores.${link.store}`)}`}
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

        <DetailSection title={t('games.videosTitle')} hint={t('games.videosHint')}>
          <Videos game={game} />
        </DetailSection>

        <DetailSection title={t('games.docsTitle')} hint={t('games.docsHint')}>
          <Files game={game} />
        </DetailSection>

        <DetailSection title={t('games.notesTitle')}>
          <Notes game={game} />
        </DetailSection>
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
        {/* Tasks §15.3 — ჩასმისთანავე სათაური, ესკიზი და ხანგრძლივობა ჩანს */}
        <LinkField
          className="min-w-56 flex-1"
          placeholder={t('games.videoUrlPlaceholder')}
          value={url}
          onChange={setUrl}
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

/**
 * **სქრინშოტები — ვიტრინა** (§22.2, Q35): პირველი დიდად, დანარჩენი ზოლად,
 * დაჭერით — სრულ ეკრანზე. ⚠️ ატვირთვაც და წაშლაც აქვეა — ცალკე ბადე
 * იმავე ფოტოებს მეორედ დახატავდა.
 */
function Screenshots({ game }: { game: Game }) {
  const { t } = useTranslation()
  const { query, upload, remove } = useFiles(game, 'image')

  return (
    <DetailPhotos
      title={t('games.galleryTitle')}
      hint={t('games.galleryHint')}
      items={(query.data ?? []).map((file) => ({ id: file.id, src: file.url, title: file.original_name }))}
      loading={query.isLoading}
      uploading={upload.isPending}
      onUpload={(picked) => upload.mutate(picked)}
      onDelete={(id) => remove.mutate(id)}
      uploadLabel={t('games.addPhotos')}
      emptyTitle={t('games.galleryEmpty')}
      deleteTitle={t('games.photoDeleteTitle')}
    />
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
              className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"
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

  /* ⚠️ სხეული გაზიარებულია (`components/RecordNotes.tsx`, Tasks §6.7).
     აქ ადრე `books.notesEmpty` იყო ნასესხები — გაზიარებულ კომპონენტს
     ტექსტი გამომძახებლისგან მოაქვს, ე.ი. თითოეულ მოდულს თავისი გასაღები
     უნდა ჰქონდეს და არა მეზობლის სივრცე. */
  return (
    <RecordNotes
      queryKey={['game-notes', game.id]}
      invalidate={[['games']]}
      api={{
        list: () => fetchGameNotes(game.id),
        create: (input) => createGameNote(game.id, input.body),
        update: (id, input) => updateGameNote(id, input.body),
        remove: deleteGameNote,
      }}
      placeholder={t('games.notePlaceholder')}
      addLabel={t('actions.add')}
      emptyTitle={t('games.notesEmpty')}
      emptyHint={t('recordNotes.emptyHint')}
    />
  )
}
