import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  Share2,
  SquarePen,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react'
import { fetchMovieCollection, mediaApi, setSyncPaused } from '@/api/media'
import { useRecordOpen } from '@/lib/audit'
import { isDetailPath, mediaKey, mediaOf, type MediaType } from '@/lib/media'
import { NotFound } from '@/pages/NotFoundPage'
import { PosterImage } from '@/components/PosterImage'
import { EpisodeTracker } from '@/components/EpisodeTracker'
import { WatchLog } from '@/components/WatchLog'
import { RecordGallery } from '@/components/RecordGallery'
import { RecordCast } from '@/components/RecordCast'
import { FranchiseFavoriteDialog } from '@/components/FranchiseFavoriteDialog'
import { ShareRecordDialog } from '@/components/chat/ShareRecordDialog'
import { VideoEmbed } from '@/components/VideoEmbed'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { InfoHint, type InfoTone } from '@/components/ui/info-hint'
import { Markdown } from '@/components/ui/markdown'
import { pageContainer } from '@/components/ui/page'
import { Button, buttonVariants } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { RatingStars } from '@/components/ui/star-rating'
import { favoriteAction, MENU_ICONS, RecordContextMenu, statusActions, type MenuAction } from '@/components/ui/record-menu'
import { useQueue } from '@/components/ui/queue'
import { cn } from '@/lib/utils'
import { STATUS_ACTIVE, STATUS_INACTIVE } from '@/lib/statusStyles'
import { genreName, movieSubtitle, movieTitle } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { statusName, statusTone, useStatuses } from '@/lib/statuses'
import { errorMessage } from '@/lib/errors'
import { statusStyle } from '@/lib/statusColor'
import { ModuleIcon } from '@/components/ModuleIcon'
import { RecordLockActions, RecordLockedScreen } from '@/components/locks/RecordLock'
import { mediaLockBase } from '@/lib/locks'


/** ტექსტის წყაროს ფერი; უცნობი (და ძველი ge.movie) — ნაცრისფერი */
const SOURCE_TONE: Record<string, InfoTone> = {
  tmdb: 'info',
  translation: 'warn',
  manual: 'ok',
  ge_movie: 'muted',
}

export function MoviePage({ type = 'movie' }: { type?: MediaType }) {
  const { id } = useParams()
  const nav = useNavigate()
  const qc = useQueryClient()
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const confirm = useConfirm()
  const { toast } = useToast()
  const { enqueue, isQueued } = useQueue()
  const api = mediaApi(type)
  // სტატუსების ლექსიკონი დომენისაა (ფილმი/სერიალი/ანიმე ცალ-ცალკე)
  const { data: statuses = [] } = useStatuses(type)
  const loc = useLocation()
  const { detailBase, libraryPath } = mediaOf(type)

  // საიდან შემოვედით (MovieCard-ი state-ში წერს). სხვა ჩანაწერის გვერდზე არასოდეს
  // ვბრუნდებით — ფრანჩაიზის/შემოთავაზების ბმულიდან მოსვლისას ბიბლიოთეკა გვჭირდება.
  const from = (loc.state as { from?: string } | null)?.from
  const backTo = from && !isDetailPath(from) ? from : libraryPath

  const { data: m, isLoading } = useQuery({ queryKey: [type, 'detail', id], queryFn: () => api.get(id!) })
  // გახსნა ჟურნალში (გვერდის მაუნთზე; ადრე „შევედი N-ჯერ" ბეჯი)
  useRecordOpen(type, m?.id)
  const collectionQ = useQuery({
    queryKey: ['collection', id],
    queryFn: () => fetchMovieCollection(id!),
    enabled: type === 'movie' && !!m?.tmdb_id,
  })

  const onMutated = (data: unknown) => {
    qc.setQueryData([type, 'detail', id], data)
    qc.invalidateQueries({ queryKey: [type] })
  }
  const statusMut = useMutation({ mutationFn: (s: string) => api.setStatus(Number(id), s), onSuccess: onMutated })
  const favMut = useMutation({ mutationFn: () => api.toggleFavorite(Number(id)), onSuccess: onMutated })
  /* `onError` აქ არ იყო, ე.ი. გასაღების გარეშე (409
     `credential_missing`) „სინქრონიზაცია" ჩუმად არაფერს აკეთებდა. ტექსტი
     წყაროს სახელს ამბობს („TMDB-ის გასაღები არ გაქვს — ჩაწერე „მონაცემებში""). */
  const resyncMut = useMutation({
    mutationFn: () => api.resync(Number(id)),
    onSuccess: onMutated,
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  /* „აღარ განაახლო": მასობრივი სინქრონი, თარგმანი და გალერეის ჩამოტვირთვა
     ამ ჩანაწერს გამოტოვებს; ზემოთა ერთეულოვანი ღილაკი მაინც მუშაობს */
  const pauseMut = useMutation({
    mutationFn: (paused: boolean) => setSyncPaused(type, Number(id), paused),
    onSuccess: (r) => {
      qc.setQueryData<{ sync_paused: boolean } | undefined>([type, 'detail', id], (cur) =>
        cur ? { ...cur, sync_paused: r.sync_paused } : cur,
      )
      qc.invalidateQueries({ queryKey: [type] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })
  const delMut = useMutation({
    mutationFn: () => api.remove(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [type] })
      // ტექსტი დომენს მიჰყვება: სერიალზე „ფილმი წაიშალა" ეწერა
      toast({ title: t(mediaKey('toast.deleted', type)), variant: 'success' })
      // replace — წაშლილი ჩანაწერის URL ისტორიაში არ დარჩეს (Back მკვდარ გვერდს ხსნიდა)
      nav(backTo, { replace: true })
    },
  })

  // გაზიარება ჩატში
  const [sharing, setSharing] = useState(false)
  /* რჩეულში დამატება ფრანჩაიზიან ფილმზე პოპაპით; მოხსნა — პირდაპირ */
  const [franchiseOpen, setFranchiseOpen] = useState(false)
  const toggleFavorite = () => {
    if (type === 'movie' && m && !m.is_favorite && m.collection_id) setFranchiseOpen(true)
    else favMut.mutate()
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: t(mediaKey('confirm.deleteRecord', type)),
      // აღწერაში დომენი არ იხსენიება („«X» სამუდამოდ წაიშლება…"), ე.ი. ორივეს უხდება
      description: t('confirm.deleteRecordDesc', { name: m ? movieTitle(m, lang) : '' }),
      confirmText: t('confirm.delete'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) delMut.mutate()
  }

  if (isLoading) {
    return <div className={pageContainer('wide', 'py-10 text-muted-foreground')}>{t('api.loading')}</div>
  }

  /* ⚠️ **წაშლილი/სხვისი ჩანაწერი აქამდე სამუდამოდ „იტვირთებოდა"**:
     404-ზე `isLoading` false ხდება, `m` კი ცარიელი რჩება — ერთი პირობა ორივე
     მდგომარეობას ფარავდა და მომხმარებელი უსასრულო „იტვირთება"-ს ხედავდა.
     ⚠️ ღილაკი სექციაში აბრუნებს და არა დეშბორდზე: სწორედ იქიდან მოხვედი. */
  if (!m) {
    return (
      <div className={pageContainer('wide', 'py-10')}>
        <NotFound
          title={t('notFound.recordTitle')}
          hint={t('notFound.recordHint')}
          actions={
            <Link to={libraryPath} className={buttonVariants()}>
              {t('notFound.backToList')}
            </Link>
          }
        />
      </div>
    )
  }

  /* დამალული ჩანაწერი: მხოლოდ სათაური და ბოქლომი (სერვერი სხვას არ აგზავნის) */
  const lockOnChanged = () => {
    qc.invalidateQueries({ queryKey: [type] })
    qc.invalidateQueries({ queryKey: [type, 'detail', id] })
  }
  const lockRecord = {
    id: m.id,
    name: movieTitle(m, lang),
    locked: !!m.locked,
    unlocked: m.unlocked ?? true,
    lock_hint: m.lock_hint ?? null,
    unlock_blocked_until: m.unlock_blocked_until ?? null,
  }

  if (m.hidden) {
    return (
      <div className={pageContainer('wide', 'py-6')}>
        <Link to={backTo} className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          {t('actions.back')}
        </Link>
        <h1 className="mb-4 text-2xl font-semibold tracking-tight">{movieTitle(m, lang)}</h1>
        <RecordLockedScreen base={mediaLockBase(type, m.id)} record={lockRecord} onChanged={lockOnChanged} hint={t('lock.hintMedia')} />
      </div>
    )
  }

  const description = lang === 'ka' ? m.description_ka || m.description_en : m.description_en || m.description_ka
  /* საიდან მოვიდა ეს ტექსტი. ⚠️ წყარო **იმ ენისაა, რომელიც
     მართლა გამოჩნდა**: ka-ს ცარიელობაზე en-ის ტექსტი ჩანს და მისი
     წყაროც უნდა ეწეროს, თორემ ბარათი სხვა ენის წყაროს დაასახელებდა. */
  const descriptionSource =
    lang === 'ka'
      ? m.description_ka
        ? m.description_ka_source
        : m.description_en_source
      : m.description_en
        ? m.description_en_source
        : m.description_ka_source
  const parts = collectionQ.data?.parts ?? []
  const missingParts = parts
    .filter((p) => !p.owned)
    .map((p) => ({ tmdbId: p.tmdb_id, title: p.title }))

  /* მარჯვენა ღილაკი ჰეროზე (პოსტერი, სათაური): სტატუსი ▸ · რჩეული · — · რედაქტირება · წაშლა */
  const heroActions: MenuAction[] = [
    statusActions(t('form.status'), statuses, m.status, lang, (key) => statusMut.mutate(key)),
    favoriteAction(m.is_favorite, toggleFavorite, t),
    { key: 'edit', label: t('actions.edit'), icon: MENU_ICONS.edit, separator: true, run: () => nav(`${detailBase}/${m.id}/edit`) },
    { key: 'delete', label: t('actions.delete'), icon: MENU_ICONS.delete, danger: true, run: () => void askDelete() },
  ]

  return (
    <div>
      {/* ===== HERO ===== */}
      <div className="relative">
        <div className="absolute inset-0 -z-10 overflow-hidden">
          {m.poster && (
            <img src={m.poster} alt="" className="h-full w-full scale-110 object-cover opacity-25 blur-2xl" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/80 to-background" />
        </div>

        <div className={pageContainer('wide', 'pt-6')}>
          <Link
            to={backTo}
            className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            {t('actions.back')}
          </Link>

          <RecordContextMenu actions={heroActions}>
          <div className="flex flex-col gap-6 pb-8 sm:flex-row">
            <PosterImage
              src={m.poster}
              alt={movieTitle(m, lang)}
              className="w-44 shrink-0 self-start rounded-xl border border-border shadow-xl"
            />

            <div className="min-w-0 flex-1">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{movieTitle(m, lang)}</h1>
              {movieSubtitle(m, lang) && <p className="mt-1 text-lg text-muted-foreground">{movieSubtitle(m, lang)}</p>}

              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {m.year && <span className="font-medium">{m.year}</span>}
                {type === 'series' && m.seasons ? (
                  <span className="text-muted-foreground">
                    {t('detail.seasons', { count: m.seasons })}
                    {m.episodes ? ` · ${t('detail.episodes', { count: m.episodes })}` : ''}
                  </span>
                ) : null}
                {/* ჩემი ქულა ვარსკვლავებით და „4.6 / 10"; TMDB-ის საშუალო ცალკე, `i`-ით */}
                <RatingStars value={m.my_rating} />
                {m.rating && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-0.5 text-muted-foreground">
                    TMDB {m.rating}
                    <InfoHint info={t('rating.tmdbAverage')} />
                  </span>
                )}
                {m.imdb_url && (
                  <a
                    href={m.imdb_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-gold"
                  >
                    IMDb <ExternalLink className="size-3.5" />
                  </a>
                )}
              </div>

              {m.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {/* ჟანრზე დაჭერა → ბიბლიოთეკა ამ ჟანრის ფილტრით */}
                  {m.genres.map((g) => (
                    <Link
                      key={g.id}
                      to={`${libraryPath}?genre=${encodeURIComponent(g.slug)}`}
                      title={t('genres.filterBy', { name: genreName(g, lang) })}
                      className="rounded-md border border-border bg-card/60 px-3 py-1.5 text-sm font-medium transition-colors hover:border-primary hover:bg-secondary"
                    >
                      {genreName(g, lang)}
                    </Link>
                  ))}
                </div>
              )}

              {/* status + favorite — სტატუსები, რჩეული და „საჯარო" ერთი სიმაღლისაა (`h-9`,
                  ღილაკის `sm`); ადრე სტატუსი ~34 px იყო, „საჯარო" ~20 px, რჩეული 36 px */}
              <div className="mt-5 flex flex-wrap items-center gap-2" data-testid="movie-status-row">
                {/* სტატუსები per-user ლექსიკონიდან და არა კოდიდან */}
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => statusMut.mutate(s.key)}
                    className={cn(
                      'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors',
                      m.status?.id === s.id ? STATUS_ACTIVE[statusTone(s)] : STATUS_INACTIVE[statusTone(s)],
                    )}
                    // საკუთარი ფერი კლასებს ზემოდან ადგება; აიქონი წინ
                    style={statusStyle(s, m.status?.id === s.id ? 'active' : 'inactive')}
                  >
                    {s.icon && <ModuleIcon name={s.icon} className="size-3.5" />}
                    {statusName(s, lang)}
                  </button>
                ))}
                {/* რჩეული ტექსტით, იგივე ღილაკი, რაც სიებშია */}
                <FavoriteButton
                  className="ml-1"
                  active={m.is_favorite}
                  pending={favMut.isPending}
                  onToggle={toggleFavorite}
                />

                {/* ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
                    `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
                {/* ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
                <VisibilityBadge value={m.visibility} />
              </div>

              {/* actions — მეორე რიგიც იმავე `h-9`-ზეა, აიქონები `size-3.5` */}
              <div className="mt-4 flex flex-wrap items-center gap-2" data-testid="movie-actions">
                {m.ge_url && (
                  <a href={m.ge_url} target="_blank" rel="noreferrer" className={buttonVariants({ size: 'sm' })}>
                    <Play className="size-3.5" />
                    {t('detail.watch')}
                  </a>
                )}
                <Button variant="outline" size="sm" onClick={() => resyncMut.mutate()} disabled={resyncMut.isPending}>
                  {resyncMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                  {resyncMut.isPending ? t('detail.syncing') : t('detail.sync')}
                </Button>
                {/* გადამრთველი „სინქრონიზაცია შეჩერებულია" */}
                <label
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm"
                  data-testid="sync-paused"
                >
                  <Switch checked={m.sync_paused} disabled={pauseMut.isPending} onCheckedChange={(v) => pauseMut.mutate(v)} />
                  {t('detail.syncPaused')}
                  <InfoHint info={t('detail.syncPausedHint')} />
                </label>
                <Link to={`${detailBase}/${m.id}/edit`} className={buttonVariants({ variant: 'edit', size: 'sm' })}>
                  <SquarePen className="size-3.5" />
                  {t('actions.edit')}
                </Link>
                {/* გაზიარება ჩატში ბარათად.
                    ⚠️ **გაზიარება ხილვადობას არ ცვლის**: პირადი ჩანაწერიდან
                    თანამოსაუბრემდე მხოლოდ სათაური და გლობალური იდენტობა
                    მიდის — სწორედ იმდენი, რამდენიც რეკომენდაციას სჭირდება. */}
                <Button variant="outline" size="sm" onClick={() => setSharing(true)}>
                  <Share2 className="size-3.5" />
                  {t('chat.share')}
                </Button>
                {/* ჩაკეტვა / ისევ ჩაკეტვა / პაროლი */}
                <RecordLockActions base={mediaLockBase(type, m.id)} record={lockRecord} onChanged={lockOnChanged} hint={t('lock.hintMedia')} size="sm" />
                <Button variant="destructiveOutline" size="sm" onClick={askDelete} disabled={delMut.isPending}>
                  <Trash2 className="size-3.5" />
                  {t('actions.delete')}
                </Button>
              </div>
            </div>
          </div>
          </RecordContextMenu>
        </div>
      </div>

      {/* ===== BODY ===== */}
      <div className={pageContainer('wide', 'space-y-8 pb-12')}>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          {/* „საიდან მოვიდა ტექსტი" ცალკე ხაზი აღარაა: სათაურის
              გვერდით i, **ფერი წყაროს მიხედვით** (TMDB — ლურჯი, ავტომატური
              თარგმანი — ქარვისფერი, შენი — მწვანე, ძველი/უცნობი — ნაცრისფერი).
              ხელით გადაწერა `manual`-ს ნიშნავს, ე.ი. ნიშანი არ ტყუის. */}
          <h2 className="mb-3 flex items-center gap-1.5 font-mono text-sm uppercase tracking-wider text-muted-foreground">
            {t('detail.content')}
            {description && descriptionSource && (
              <InfoHint
                tone={SOURCE_TONE[descriptionSource] ?? 'muted'}
                info={t(`detail.source.${descriptionSource}`, {
                  defaultValue: t('detail.sourceUnknown'),
                })}
              />
            )}
          </h2>
          {/* აღწერა ფორმატით (Markdown) */}
          {description ? (
            <Markdown text={description} className="leading-relaxed text-foreground/90" />
          ) : (
            <p className="leading-relaxed text-foreground/90">{t('detail.noDescription')}</p>
          )}
        </section>

        {/* ===== ტრეილერი ===== */}
        {m.trailer_url && (
          <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
              {t('detail.trailer')}
            </h2>
            {/* დამკვრელი ვიდეოს მოდულიდან — allowlist ერთია და HTML არსად ინახება */}
            <VideoEmbed
              video={{
                url: m.trailer_url,
                embed_url: m.trailer_embed_url,
                title: movieTitle(m, lang),
              }}
            />
          </section>
        )}

        {/* ===== სეზონები და ეპიზოდები =====
            ⚠️ **მხოლოდ TV-დომენებზე**: ფილმს სეზონი არ აქვს და endpoint-იც
            მას არ იღებს. ტრეილერის ქვემოთ დგას, რადგან „სად გავჩერდი"
            ყოველდღიური კითხვაა და გალერეაზე მაღლა უნდა იყოს. */}
        {(type === 'series' || type === 'anime') && <EpisodeTracker type={type} id={m.id} />}

        {/* ხელახლა ნახვის ჟურნალი.
            ⚠️ ბლოკი მხოლოდ ნახულ ჩანაწერზე ადგება: ჟურნალის პირველ რიგს
            სტატუსი ქმნის, ე.ი. ცარიელი ჟურნალი „ჯერ არ მინახავს"-ა —
            და იქ „კიდევ ვნახე" უაზრო ღილაკი იქნებოდა. */}
        <WatchLog type={type} recordId={m.id} watched={!!m.watched_at} />

        {/* ===== გალერეა — ტრეილერის ქვემოთ, user-ის მოთხოვნით =====
            სექცია თვითონ ჩუმდება, თუ `gallery` მოდული ჩართული არ არის. */}
        <RecordGallery type={type} id={m.id} />

        {parts.length > 1 && (
          <section>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-lg font-semibold">
                {t('parts.title')}
                <InfoHint info={t('parts.watchOrderNote')} />
              </h2>
              {missingParts.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => enqueue(missingParts)}>
                  <Plus className="size-4" />
                  {t('parts.addAll')} ({missingParts.length})
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {parts.map((p, i) => {
                const adding = isQueued(p.tmdb_id)
                const inner = (
                  <>
                    <div className="relative overflow-hidden rounded-lg bg-muted ring-1 ring-border">
                      <div className="aspect-[2/3]">
                        <PosterImage src={p.poster} alt={p.title} className="h-full w-full" />
                      </div>
                      <span className="absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-md bg-black/60 text-[11px] font-semibold text-white">
                        {i + 1}
                      </span>
                      {!p.owned && (
                        <div
                          className={cn(
                            'absolute inset-0 flex items-center justify-center bg-primary/70 text-white transition-opacity',
                            adding ? 'opacity-100' : 'opacity-0 hover:opacity-100',
                          )}
                        >
                          {adding ? (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
                              <Loader2 className="size-3.5 animate-spin" />
                              {t('queue.queued')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
                              <Plus className="size-3.5" />
                              {t('actor.add')}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 truncate text-xs font-medium">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground">{p.year ?? '—'}</div>
                  </>
                )
                return p.owned && p.movie_id ? (
                  <Link key={p.tmdb_id} to={`/movies/${p.movie_id}`} className="group block">
                    {inner}
                  </Link>
                ) : (
                  <button
                    key={p.tmdb_id}
                    type="button"
                    onClick={() => enqueue([{ tmdbId: p.tmdb_id, title: p.title }])}
                    className="group block cursor-pointer text-left"
                  >
                    {inner}
                  </button>
                )
              })}
            </div>
          </section>
        )}

        {/* მსახიობები: დამატება, როლი, მარჯვენა კლიკის მენიუ,
            drag & drop-ით დალაგება, დამალვა და წაშლა. ⚠️ სექცია **ცარიელზეც
            იხატება** — „დაამატე" იმ შემთხვევაშიც უნდა ჩანდეს, როცა TMDB-ს ამ
            ფილმზე არცერთი არ დაუდვია. */}
        <RecordCast type={type} recordId={m.id} cast={m.cast} detailKey={[type, 'detail', id]} />

        {franchiseOpen && (
          <FranchiseFavoriteDialog
            movie={m}
            onClose={() => setFranchiseOpen(false)}
            onDone={() => {
              qc.invalidateQueries({ queryKey: [type, 'detail', id] })
              qc.invalidateQueries({ queryKey: [type] })
            }}
          />
        )}
        {sharing && (
          <ShareRecordDialog
            domain={type}
            recordId={m.id}
            title={movieTitle(m, lang)}
            onClose={() => setSharing(false)}
          />
        )}
      </div>
    </div>
  )
}
