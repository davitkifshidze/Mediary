import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeft,
  ExternalLink,
  Loader2,
  SquarePen,
  Play,
  Plus,
  RefreshCw,
  Star,
  Trash2,
  UserPlus,
  UserRound,
} from 'lucide-react'
import { fetchMovieCollection, mediaApi } from '@/api/media'
import { detachCastMember } from '@/api/cast'
import type { CastMember } from '@/api/types'
import { isDetailPath, mediaKey, mediaOf, type MediaType } from '@/lib/media'
import { NotFound } from '@/pages/NotFoundPage'
import { PosterImage } from '@/components/PosterImage'
import { RecordGallery } from '@/components/RecordGallery'
import { CastMemberDialog } from '@/components/CastMemberDialog'
import { CastRoleDialog } from '@/components/CastRoleDialog'
import { VideoEmbed } from '@/components/VideoEmbed'
import { VisibilityBadge } from '@/components/VisibilityToggle'
import { pageContainer } from '@/components/ui/page'
import { Button, buttonVariants } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { useQueue } from '@/components/ui/queue'
import { ActionMenu, actionItemClass } from '@/components/ui/action-menu'
import { cn } from '@/lib/utils'
import { STATUS_ACTIVE, STATUS_INACTIVE } from '@/lib/statusStyles'
import { castName, genreName, movieSubtitle, movieTitle } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { errorMessage } from '@/lib/errors'
import { statusName, statusTone, useStatuses } from '@/lib/statuses'


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
  // §6.4 — სტატუსების ლექსიკონი დომენისაა (ფილმი/სერიალი/ანიმე ცალ-ცალკე)
  const { data: statuses = [] } = useStatuses(type)
  const loc = useLocation()
  const { detailBase, libraryPath } = mediaOf(type)

  // საიდან შემოვედით (MovieCard-ი state-ში წერს). სხვა ჩანაწერის გვერდზე არასოდეს
  // ვბრუნდებით — ფრანჩაიზის/შემოთავაზების ბმულიდან მოსვლისას ბიბლიოთეკა გვჭირდება.
  const from = (loc.state as { from?: string } | null)?.from
  const backTo = from && !isDetailPath(from) ? from : libraryPath

  const { data: m, isLoading } = useQuery({ queryKey: [type, 'detail', id], queryFn: () => api.get(id!) })
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
  const resyncMut = useMutation({ mutationFn: () => api.resync(Number(id)), onSuccess: onMutated })
  const delMut = useMutation({
    mutationFn: () => api.remove(Number(id)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [type] })
      // 19.3 — ტექსტი დომენს მიჰყვება: სერიალზე „ფილმი წაიშალა" ეწერა
      toast({ title: t(mediaKey('toast.deleted', type)), variant: 'success' })
      // replace — წაშლილი ჩანაწერის URL ისტორიაში არ დარჩეს (Back მკვდარ გვერდს ხსნიდა)
      nav(backTo, { replace: true })
    },
  })

  /* ეტაპი 1 — მსახიობის დამატება და როლის შესწორება */
  const [castOpen, setCastOpen] = useState(false)
  const [roleOf, setRoleOf] = useState<CastMember | null>(null)

  const detachMut = useMutation({
    mutationFn: (castId: number) => detachCastMember(type, Number(id), castId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [type, 'detail', id] })
      toast({ title: t('cast.detached'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * ⚠️ **მოხსნა და წაშლა ერთი არ არის.** მსახიობი გლობალურ ლექსიკონში
   * რჩება (მას სხვისი ფილმებიც ეყრდნობა), აქ მხოლოდ ბმული ქრება.
   * დასტური იმისთვისაა, რომ ეს გარჩევა ცხადი იყოს.
   */
  const askDetach = async (c: CastMember) => {
    const ok = await confirm({
      title: t('cast.detachTitle'),
      description: t('cast.detachHint', { name: castName(c, lang) }),
      confirmText: t('cast.detach'),
      cancelText: t('confirm.cancel'),
      variant: 'destructive',
    })
    if (ok) detachMut.mutate(c.id)
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

  /* ⚠️ **წაშლილი/სხვისი ჩანაწერი აქამდე სამუდამოდ „იტვირთებოდა"** (Tasks GAP-21):
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

  const description = lang === 'ka' ? m.description_ka || m.description_en : m.description_en || m.description_ka
  /* Tasks §7 — საიდან მოვიდა ეს ტექსტი. ⚠️ წყარო **იმ ენისაა, რომელიც
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
                {m.rating && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-status-towatch/15 px-2 py-0.5 font-semibold text-status-towatch">
                    ★ {m.rating}
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
                  {/* ჟანრზე დაჭერა → ბიბლიოთეკა ამ ჟანრის ფილტრით (Tasks K9) */}
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

              {/* status + favorite */}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {/* §6.4 — სტატუსები per-user ლექსიკონიდან და არა კოდიდან */}
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => statusMut.mutate(s.key)}
                    className={cn(
                      'cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      m.status?.id === s.id ? STATUS_ACTIVE[statusTone(s)] : STATUS_INACTIVE[statusTone(s)],
                    )}
                  >
                    {statusName(s, lang)}
                  </button>
                ))}
                <button
                  onClick={() => favMut.mutate()}
                  aria-label="favorite"
                  className={cn(
                    'ml-1 grid size-9 cursor-pointer place-items-center rounded-md border transition-colors',
                    m.is_favorite
                      ? 'border-favorite bg-favorite/10 text-favorite'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <Star className={cn('size-4', m.is_favorite && 'fill-current')} />
                </button>

                {/* Tasks 16.1 — ხილვადობა: მესამე (ბოლო) ფენა. პროფილი და მოდული
                    `/profile`-ზეა, ე.ი. აქ მარტო ეს გადამრთველი ვერაფერს გამოაჩენს. */}
                {/* §6.1 — ხილვადობა პროფილზე იმართება; აქ მხოლოდ ბეჯი ჩანს */}
                <VisibilityBadge value={m.visibility} />
              </div>

              {/* actions */}
              <div className="mt-4 flex flex-wrap gap-2">
                {m.ge_url && (
                  <a href={m.ge_url} target="_blank" rel="noreferrer" className={buttonVariants()}>
                    <Play className="size-4" />
                    {t('detail.watch')}
                  </a>
                )}
                <Button variant="outline" onClick={() => resyncMut.mutate()} disabled={resyncMut.isPending}>
                  {resyncMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {resyncMut.isPending ? t('detail.syncing') : t('detail.sync')}
                </Button>
                <Link to={`${detailBase}/${m.id}/edit`} className={buttonVariants({ variant: 'outline' })}>
                  <SquarePen className="size-4" />
                  {t('actions.edit')}
                </Link>
                <Button variant="destructiveOutline" onClick={askDelete} disabled={delMut.isPending}>
                  <Trash2 className="size-4" />
                  {t('actions.delete')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== BODY ===== */}
      <div className={pageContainer('wide', 'space-y-8 pb-12')}>
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-3 font-mono text-sm uppercase tracking-wider text-muted-foreground">
            {t('detail.content')}
          </h2>
          <p className="whitespace-pre-line leading-relaxed text-foreground/90">
            {description || t('detail.noDescription')}
          </p>

          {/* Tasks §7 — „საიდან მოვიდა ტექსტი". ხელით გადაწერა `manual`-ს ნიშნავს,
              ე.ი. ნიშანი აღარ ტყუის მას შემდეგ, რაც თვითონ შეასწორე. */}
          {description && descriptionSource && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t(`detail.source.${descriptionSource}`, {
                defaultValue: t('detail.sourceUnknown'),
              })}
            </p>
          )}
        </section>

        {/* ===== ტრეილერი (Tasks 9) ===== */}
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

        {/* ===== გალერეა (Tasks 10) — ტრეილერის ქვემოთ, user-ის მოთხოვნით =====
            სექცია თვითონ ჩუმდება, თუ `gallery` მოდული ჩართული არ არის. */}
        <RecordGallery type={type} id={m.id} />

        {parts.length > 1 && (
          <section>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">{t('parts.title')}</h2>
              {missingParts.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => enqueue(missingParts)}>
                  <Plus className="size-4" />
                  {t('parts.addAll')} ({missingParts.length})
                </Button>
              )}
            </div>
            <p className="mb-4 text-xs text-muted-foreground">{t('parts.watchOrderNote')}</p>
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

        {/* ეტაპი 1 — მსახიობები ახლა ხელითაც იხსნება.
            ⚠️ სექცია ახლა **ცარიელზეც იხატება** — „დაამატე" იმ შემთხვევაშიც
            უნდა ჩანდეს, როცა TMDB-ს ამ ფილმზე არცერთი არ დაუდვია. */}
        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">
              {t('detail.cast')}
              {m.cast.length > 0 && <span className="text-muted-foreground"> · {m.cast.length}</span>}
            </h2>
            <Button variant="outline" size="sm" onClick={() => setCastOpen(true)}>
              <UserPlus className="size-4" />
              {t('cast.add')}
            </Button>
          </div>

          {m.cast.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('cast.empty')}</p>
          ) : (
            <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {m.cast.map((c) => (
                <div key={c.id} className="group/cast relative text-center">
                  <Link to={`/actors/${c.id}`} className="block cursor-pointer">
                    <PosterImage
                      src={c.photo}
                      alt={castName(c, lang)}
                      className="mx-auto size-20 rounded-full ring-1 ring-border transition-transform duration-300 group-hover/cast:scale-105"
                    />
                    <div className="mt-2 truncate text-xs font-medium group-hover/cast:text-gold">
                      {castName(c, lang)}
                    </div>
                    {c.character && (
                      <div className="truncate text-xs text-muted-foreground">{c.character}</div>
                    )}
                  </Link>

                  {/* ⚠️ მოქმედებები ცალკე მენიუშია და არა ბარათზე: ბარათის დაწკაპუნება
                      მსახიობის გვერდია და ეს ხშირი მოქმედებაა — წაშლა მას ვერ დაეჩრდილება. */}
                  <div className="absolute right-0 top-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cast:opacity-100">
                    <ActionMenu label={t('actions.more')}>
                      <Link to={`/actors/${c.id}`} className={actionItemClass()}>
                        <UserRound className="size-4" />
                        {t('cast.openActor')}
                      </Link>
                      <button
                        type="button"
                        className={actionItemClass()}
                        onClick={() => setRoleOf(c)}
                      >
                        <SquarePen className="size-4" />
                        {t('cast.editRole')}
                      </button>
                      <button
                        type="button"
                        className={actionItemClass('destructive')}
                        onClick={() => askDetach(c)}
                      >
                        <Trash2 className="size-4" />
                        {t('cast.detach')}
                      </button>
                    </ActionMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {castOpen && (
          <CastMemberDialog
            type={type}
            recordId={m.id}
            onClose={() => setCastOpen(false)}
            onAdded={() => qc.invalidateQueries({ queryKey: [type, 'detail', id] })}
          />
        )}

        {roleOf && (
          <CastRoleDialog
            type={type}
            recordId={m.id}
            member={roleOf}
            onClose={() => setRoleOf(null)}
            onSaved={() => qc.invalidateQueries({ queryKey: [type, 'detail', id] })}
          />
        )}
      </div>
    </div>
  )
}
