import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Gamepad2, Plus, Trash2 } from 'lucide-react'
import {
  createGameVideo,
  deleteGameFile,
  deleteGameVideo,
  fetchGameFiles,
  fetchGameVideos,
  GAME_VIDEO_KINDS,
  uploadGameFiles,
  type Game,
  type GameVideoKind,
  toggleGameFavorite,
} from '@/api/games'
import { useRecordOpen } from '@/lib/audit'
import { storageUrl } from '@/lib/api'
import { GameMetaSections } from '@/components/GameMetaCards'
import { errorMessage } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { ModalShell } from '@/components/ui/modal-shell'
import { RatingStars } from '@/components/ui/star-rating'
import { DetailFacts, DetailHero, DetailPhotos, DetailSection } from '@/components/DetailHero'
import { EnumStatusBadge } from '@/components/StatusBadge'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VideoEmbed } from '@/components/VideoEmbed'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { LinkField } from '@/components/ui/link-field'

/* ============================================================
   თამაშის დეტალები — ვიდეოები და სქრინშოტები.
   ⚠️ დოკუმენტები და ჩანიშვნები აღარ არის („დოკუმენტის ატვირთვა არ მჭირდება
   არაფერში… არ მჭირდება ჩანიშვნები").

   ⚠️ **რიგი შეიცვალა** (შენი სიტყვები: „ფოტოები ბოლოშია — ზემოთ
   გააკეთე, კარგი ზომით"): თავში მთავარი ფოტო, სტატუსი, ჟანრები,
   პლატფორმები და მოკლე ცნობები; მერე **სქრინშოტები — Steam-ის მაღაზიის
   გვერდივით** (`PhotoShowcase`: პირველი დიდად, დანარჩენი ზოლად); მერე
   აღწერა, ბმულები და ვიდეოები. აქამდე მთავარი
   ფოტო, სტატუსი, ჟანრები და პლატფორმები ფანჯარაში საერთოდ არ ჩანდა, ხოლო
   სქრინშოტები 11-დან მე-9 იყო.

   ⚠️ **ატვირთული სქრინშოტები `game_files.kind = 'image'`-შია** და არა
   `gallery_images`-ში: ის ცხრილი წყაროდან **ჩამოტვირთულ** ფოტოებს ინახავს
   (RAWG/TMDB), user-ის ატვირთული კი სექციის ცხრილშია — ვიდეოსა და
   ბორდგეიმის იგივე წესი.
   ============================================================ */

/**
 * პლატფორმების ჩიპები — **„ჩემი პლატფორმა" დაჭერით ირჩევა**.
 *
 * ⚠️ ფორმიდან `my_platform` ამოღებულია, ანათება კი დეტალსა
 * და სიაში დარჩა — ე.ი. ახალ თამაშს „ჩემი" ვერასდროს ექნებოდა. ხელახლა დაჭერა
 * მოხსნის (`null`); სია `['games']`-ის გაუქმებით ახლდება და დეტალს ახალ
 * ობიექტს აწვდის (`GamesPage` მას id-ით პოულობს).
 */
export function GameDetail({ game, onClose }: { game: Game; onClose: () => void }) {
  // რჩეული დეტალის ფანჯარაშიც (აქამდე მხოლოდ სიის სტრიქონზე იყო)
  const favoriteQc = useQueryClient()
  const favorite = useMutation({
    mutationFn: () => toggleGameFavorite(game.id),
    onSuccess: () => void favoriteQc.invalidateQueries({ queryKey: ['games'] }),
  })
  const { t, i18n } = useTranslation()
  // გახსნა ჟურნალში (ადრე „შევედი N-ჯერ" ბეჯი)
  useRecordOpen('game', game.id)
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
        {/* ---------- თავი: მთავარი ფოტო, სტატუსი, ჟანრები, პლატფორმები ---------- */}
        <DetailHero
          image={cover}
          alt={title}
          fallback={<Gamepad2 className="size-8 text-muted-foreground" />}
          badges={
            <>
              <EnumStatusBadge domain="game" status={game.status} size="row" />
              {/* ვარსკვლავები და „4.6 / 10" დეტალის თავში */}
              <RatingStars value={game.rating} />
              {/* ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
              <VisibilityBadge value={game.visibility} />
              <FavoriteButton active={game.is_favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} />
            </>
          }
        >

            {/* ჟანრები და პლატფორმები თავიდან ბარათებად გავიდა (ქვემოთ, `GameMetaSections`) */}

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

        {/* ---------- პლატფორმები („ჩემი" დაჭერით) · რეჟიმები · ჟანრები ბარათებად ---------- */}
        <GameMetaSections game={game} />

        {/* ---------- სქრინშოტები — ზემოთ და დიდად ---------- */}
        <Screenshots game={game} />

        {description && (
          <Markdown text={description} className="text-sm text-muted-foreground" />
        )}

        {/* ---------- მაღაზიები / ოფიციალური საიტი ---------- */}
        {game.links.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('games.linksTitle')}</h3>
            <ul className="space-y-1.5 text-sm">
              {game.links.map((link, i) => (
                <li key={i} className="flex items-center gap-2">
                  {/* „რა არის" + (მაღაზიას) „სად" */}
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

      </div>
    </ModalShell>
  )
}

/* ---------- ვიდეოები ---------- */

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
        {/* ჩასმისთანავე სათაური, ესკიზი და ხანგრძლივობა ჩანს */}
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
                variant="destructiveOutline"
                size="sm"
                className="shrink-0"
                onClick={async () => {
                  const ok = await confirm({ title: t('games.videoDeleteTitle'), variant: 'destructive' })
                  if (ok) remove.mutate(video.id)
                }}
                aria-label={t('actions.delete')}
              >
                <Trash2 className="size-3.5" />
                {t('actions.delete')}
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

/** სქრინშოტების ატვირთვა და წაშლა */
function useFiles(game: Game) {
  const kind = 'image'
  const qc = useQueryClient()
  const { toast } = useToast()

  const query = useQuery({
    queryKey: ['game-files', game.id, kind],
    queryFn: () => fetchGameFiles(game.id, kind),
  })

  const done = () => {
    qc.invalidateQueries({ queryKey: ['game-files', game.id] })
    qc.invalidateQueries({ queryKey: ['games'] })
    // ატვირთვა/წაშლა კვოტას ცვლის, ჰედერის ინდიკატორიც უნდა განახლდეს
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
 * **სქრინშოტები — ვიტრინა**: პირველი დიდად, დანარჩენი ზოლად,
 * დაჭერით — სრულ ეკრანზე. ⚠️ ატვირთვაც და წაშლაც აქვეა — ცალკე ბადე
 * იმავე ფოტოებს მეორედ დახატავდა.
 */
function Screenshots({ game }: { game: Game }) {
  const { t } = useTranslation()
  const { query, upload, remove } = useFiles(game)

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
