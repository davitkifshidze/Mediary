import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Cake, Check, ChevronDown, ChevronUp, ExternalLink, Globe, Link2, Loader2, Lock, MapPin, RefreshCw, RotateCcw, Save, Sparkles, SquarePen, Star, Trash2, X } from 'lucide-react'
import { resyncActor, type Actor } from '@/api/media'
import { deptKey } from '@/lib/actors'
import { errorMessage } from '@/lib/errors'
import { useDateFormat } from '@/lib/dates'
import { useContentLang } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { PosterImage } from '@/components/PosterImage'
import { Button } from '@/components/ui/button'
import { useConfirm, useToast } from '@/components/ui/feedback'
import { ACTORS_KEY, resetActorOpens, setActorFavorite, settleActorGeorgian, trashActor } from '@/api/actors'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FavoriteButton } from '@/components/ui/favorite-button'
import { InfoHint } from '@/components/ui/info-hint'
import { ActorAttachDialog } from '@/components/actors/ActorAttachDialog'
import { ActorFormDialog } from '@/components/actors/ActorFormDialog'
import { RecordLockActions } from '@/components/locks/RecordLock'
import { actorLockBase } from '@/lib/locks'

/* ============================================================
   მსახიობის **hero** — შიდა გვერდის თავი.

   მოთხოვნა: „მსახიობებს შიდა გვერდები ცალკე უნდა ჰქონდეს" და „სტანდარტული
   ჩამოწერა ოფიციალური საიტებიდან — IMDb და TMDB".

   ⚠️ **მონაცემი გლობალურ ლექსიკონშია** (`cast_members`) და ერთხელ ივსება —
   ბიოგრაფია, დაბადების თარიღი და IMDb-ის id პიროვნების ფაქტებია და არა
   ჩემი მონაცემი (ჩემი მხოლოდ ტეგები და ფოტოებია).

   ⚠️ **შევსება ცხადი ღილაკია** და არა ავტომატური: TMDB-ის ლიმიტი საერთოა,
   მსახიობის გვერდი კი ხშირად იხსნება. ერთადერთი გამონაკლისი — როცა
   მონაცემი **საერთოდ არ არის**: მაშინ ღილაკი თვალშისაცემია და ტექსტიც
   ამბობს, რომ ჯერ არაფერი მოგვიტანია.

   ⚠️ **რჩეული და გახსნების მთვლელი ჩემია** (`ActorMark`) და არა ლექსიკონის: რჩეული
   მსახიობი სიაში თავშია; გახსნების რიცხვი მხოლოდ აქ, სახელთან მდგარ `i`-ში ჩანს —
   ის დალაგებას ემსახურება, ამიტომ იქვეა „გახსნების განულებაც".

   ⚠️ **ბიოგრაფია ენის მიხედვით ჩანს**: ქართულ შიგთავსზე — ქართული ბიოგრაფია, თუ არის
   (თარგმანის გვერდი მას ინგლისურიდან თარგმნის), თორემ ინგლისური.
   ⚠️ **მანქანური ქართული სახელი და ბიოგრაფია „გადასამოწმებელია"** — ნიშანი ტექსტთან ჩანს და
   იხსნება დადასტურებით ან ხელით გასწორებით (`GeorgianCheck`). მსახიობი საერთო ჩანაწერია:
   დადასტურებული ტექსტი ყველა ანგარიშს უჩანს.
   ============================================================ */

/** ცნობილი ქსელები — რაც არ იცნობა, უბრალოდ არ იხატება */
const LINKS: { key: string; label: string; href: (id: string) => string }[] = [
  { key: 'imdb_id', label: 'IMDb', href: (id) => `https://www.imdb.com/name/${id}/` },
  { key: 'instagram_id', label: 'Instagram', href: (id) => `https://www.instagram.com/${id}/` },
  { key: 'twitter_id', label: 'X', href: (id) => `https://x.com/${id}` },
  { key: 'facebook_id', label: 'Facebook', href: (id) => `https://www.facebook.com/${id}` },
  { key: 'tiktok_id', label: 'TikTok', href: (id) => `https://www.tiktok.com/@${id}` },
  { key: 'youtube_id', label: 'YouTube', href: (id) => `https://www.youtube.com/${id}` },
  { key: 'wikidata_id', label: 'Wikidata', href: (id) => `https://www.wikidata.org/wiki/${id}` },
]

/**
 * **„გადასამოწმებელია"** — მანქანური ქართული სახელის ან ბიოგრაფიის ნიშანი თავისი ორი
 * გასასვლელით: „სწორია" (დადასტურება) და „გასწორება" (ტექსტი იქვე იცვლება და ინახება).
 */
function GeorgianCheck({ actor, field, text }: { actor: Actor; field: 'name' | 'biography'; text: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()
  const [draft, setDraft] = useState<string | null>(null)

  const settle = useMutation({
    mutationFn: (value?: string) => settleActorGeorgian(actor.id, field, value),
    onSuccess: () => {
      setDraft(null)
      qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({ title: t('actor.georgian.settled'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  if (draft !== null) {
    return (
      <div className="mt-2 flex flex-wrap items-start gap-2" data-testid={`georgian-edit-${field}`}>
        {field === 'name' ? (
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('actor.georgian.name')} className="h-9 min-w-48 flex-1" />
        ) : (
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={t('actor.georgian.biography')} rows={6} className="min-w-64 flex-1" />
        )}
        <Button size="sm" disabled={settle.isPending || draft.trim() === ''} onClick={() => settle.mutate(draft.trim())} data-testid={`georgian-save-${field}`}>
          {settle.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t('actions.save')}
        </Button>
        <Button size="sm" variant="outline" disabled={settle.isPending} onClick={() => setDraft(null)}>
          <X className="size-4" />
          {t('confirm.cancel')}
        </Button>
      </div>
    )
  }

  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-2" data-testid={`georgian-check-${field}`}>
      <Badge size="row" className="bg-[color-mix(in_oklab,var(--icon-warn)_14%,transparent)]">
        <Sparkles className="size-3.5" />
        {t(`actor.georgian.unverified.${field}`)}
        <InfoHint info={t(actor.georgian_editable ? 'actor.georgian.hint' : 'actor.georgian.hintAdminOnly')} />
      </Badge>
      {/* ⚠️ მსახიობი საერთოა: დადასტურება და გასწორება მხოლოდ `super_admin`-ს (ან ხელით შექმნილის შემქმნელს) */}
      {actor.georgian_editable && (
        <>
          <Button size="sm" variant="outline" disabled={settle.isPending} onClick={() => settle.mutate(undefined)} data-testid={`georgian-confirm-${field}`}>
            {settle.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {t('actor.georgian.confirm')}
          </Button>
          <Button size="sm" variant="edit" disabled={settle.isPending} onClick={() => setDraft(text)} data-testid={`georgian-fix-${field}`}>
            <SquarePen className="size-4" />
            {t('actor.georgian.fix')}
          </Button>
        </>
      )}
    </span>
  )
}

export function ActorHero({ actor, name }: { actor: Actor; name: string }) {
  const { t, i18n } = useTranslation()
  const contentLang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const { date: formatDate } = useDateFormat()
  const [expanded, setExpanded] = useState(false)
  // ხელით შექმნილის რედაქტირება და ჩანაწერებზე მიმაგრება
  const [editing, setEditing] = useState(false)
  const [attaching, setAttaching] = useState(false)
  const editable = !!actor.created_by_me && !!actor.is_private
  const confirm = useConfirm()
  const navigate = useNavigate()

  /* ხელით შექმნილის წაშლა ურნაში; გვერდი აღარ არსებობს, ე.ი. სიაში ბრუნდება */
  const trash = useMutation({
    mutationFn: () => trashActor(actor.id),
    onSuccess: () => {
      ;['actors', 'trash', 'gallery'].forEach((key) => qc.invalidateQueries({ queryKey: [key] }))
      toast({ title: t('actors.deleted', { name }), variant: 'success' })
      navigate('/actors')
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const askTrash = async () => {
    const ok = await confirm({
      title: t('actors.deleteTitle'),
      description: t('actors.deleteDescShort', { name }),
      confirmText: t('confirm.delete'),
      variant: 'destructive',
    })
    if (ok) trash.mutate()
  }

  const favorite = useMutation({
    mutationFn: () => setActorFavorite(actor.id, !actor.favorite),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const resetOpens = useMutation({
    mutationFn: () => resetActorOpens(actor.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
      qc.invalidateQueries({ queryKey: [ACTORS_KEY] })
      toast({ title: t('actor.opensReset'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  const resync = useMutation({
    mutationFn: () => resyncActor(actor.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
      qc.invalidateQueries({ queryKey: ['gallery', 'cast', actor.id] })
      toast({
        title: res.updated ? t('actor.detailsUpdated') : t('actor.detailsUnavailable'),
        variant: res.updated ? 'success' : 'info',
      })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ბმულები — `profile_links` + პირდაპირი `imdb_id` */
  const links = LINKS.flatMap((link) => {
    const value = link.key === 'imdb_id'
      ? (actor.imdb_id ?? actor.profile_links?.imdb_id)
      : actor.profile_links?.[link.key]

    return value ? [{ ...link, value }] : []
  })

  // ბიოგრაფია ენის მიხედვით: ქართულ შიგთავსზე ქართული, თუ არის; თორემ ინგლისური
  const georgianBio = contentLang === 'ka' && !!actor.biography_ka
  const bio = (georgianBio ? actor.biography_ka : actor.biography) ?? ''
  const longBio = bio.length > 420

  return (
    <header className="mb-8 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row">
        <div className="mx-auto size-32 shrink-0 overflow-hidden rounded-2xl bg-muted ring-1 ring-border sm:mx-0">
          <PosterImage src={actor.photo} alt={name} className="size-full object-cover" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{name}</h1>
            {/* რამდენჯერ გავხსენი — მხოლოდ აქ ჩანს (დალაგებისთვისაა) */}
            <span className="mt-2" data-testid="actor-opens">
              <InfoHint info={t('actor.opensInfo', { count: actor.opens ?? 0 })} />
            </span>
            {actor.known_for && (
              <span className="mt-1.5 rounded-md bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground" data-testid="actor-dept">
                {/* TMDB-ის სფერო (`Acting`, `Directing`…) — ნათარგმნი; უცნობი როგორც მოვიდა */}
                {t(`actors.dept.${deptKey(actor.known_for)}`, { defaultValue: actor.known_for })}
              </span>
            )}
            {actor.popularity != null && (
              <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Star className="size-3.5 text-gold" />
                {actor.popularity.toFixed(1)}
              </span>
            )}
            {/* ხელით შექმნილი, TMDB-ს დაუკავშირებელი: სხვა ანგარიშები მას ვერ ხედავენ */}
            {actor.is_private && (
              <span className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-secondary px-2.5 py-0.5 text-xs text-secondary-foreground">
                <Lock className="size-3" />
                {t('actors.private')}
              </span>
            )}
          </div>

          {/* მეორე ენის სახელი — ორივე ხშირად საჭიროა ძებნისთვის */}
          {actor.name_ka && actor.name_ka !== name && (
            <p className="text-sm text-muted-foreground">{actor.name}</p>
          )}

          {/* მანქანამ დაწერილი ქართული სახელი — სანამ არავის დაუდასტურებია */}
          {actor.name_ka && actor.name_ka_unverified && <GeorgianCheck actor={actor} field="name" text={actor.name_ka} />}

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {actor.birthday && (
              <span className="inline-flex items-center gap-1.5">
                <Cake className="size-3.5" />
                {formatDate(actor.birthday)}
                {actor.deathday && ` — ${formatDate(actor.deathday)}`}
              </span>
            )}
            {actor.place_of_birth && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-3.5" />
                {actor.place_of_birth}
              </span>
            )}
          </div>

          {/* ---------- ოფიციალური ბმულები ---------- */}
          {(links.length > 0 || actor.homepage) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {links.map((link) => (
                <a
                  key={link.key}
                  href={link.href(link.value)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <ExternalLink className="size-3" />
                  {link.label}
                </a>
              ))}
              {actor.homepage && (
                <a
                  href={actor.homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                >
                  <Globe className="size-3" />
                  {t('actor.homepage')}
                </a>
              )}
            </div>
          )}

          {/* ---------- ბიოგრაფია ---------- */}
          {bio && (
            <div className="mt-3">
              <p className={cn('text-sm leading-relaxed text-muted-foreground', !expanded && 'line-clamp-4')} data-testid="actor-bio">
                {bio}
              </p>
              {longBio && (
                <Button type="button" variant="outline" size="xs" className="mt-1.5" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {t(expanded ? 'actions.less' : 'actions.more')}
                </Button>
              )}
              {/* ქართული ბიოგრაფია მანქანური თარგმანია — სანამ არავის დაუდასტურებია */}
              {georgianBio && actor.biography_ka_unverified && <GeorgianCheck actor={actor} field="biography" text={bio} />}
            </div>
          )}

          {/* ⚠️ მონაცემის უქონლობა ცალკე მდგომარეობაა და ცხადად ითქმის */}
          {!bio && !actor.birthday && (
            <p className="mt-3 text-sm text-muted-foreground">{t(editable ? 'actors.noDetailsManual' : 'actor.noDetails')}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:items-stretch">
          <FavoriteButton active={!!actor.favorite} pending={favorite.isPending} onToggle={() => favorite.mutate()} className="justify-center" />
          {editable && (
            <Button variant="edit" size="sm" onClick={() => setEditing(true)}>
              <SquarePen className="size-4" />
              {t('actions.edit')}
            </Button>
          )}
          {editable && (
            <Button variant="destructiveOutline" size="sm" disabled={trash.isPending} onClick={() => void askTrash()}>
              {trash.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {t('actions.delete')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setAttaching(true)}>
            <Link2 className="size-4" />
            {t('actors.attach.open')}
          </Button>
          {(actor.opens ?? 0) > 0 && (
            <Button variant="outline" size="sm" disabled={resetOpens.isPending} onClick={() => resetOpens.mutate()} data-testid="actor-reset-opens">
              <RotateCcw className="size-4" />
              {t('actors.opensResetAction')}
            </Button>
          )}
          {/* ჩაკეტვა / ისევ ჩაკეტვა / პაროლი (ლოკი მხოლოდ შენთვისაა) */}
          <RecordLockActions
            base={actorLockBase(actor.id)}
            record={{
              id: actor.id,
              name,
              locked: !!actor.locked,
              unlocked: actor.unlocked ?? true,
              lock_hint: actor.lock_hint ?? null,
              unlock_blocked_until: actor.unlock_blocked_until ?? null,
            }}
            onChanged={() => {
              qc.invalidateQueries({ queryKey: ['actor', String(actor.id)] })
              qc.invalidateQueries({ queryKey: ['actors'] })
            }}
            hint={t('lock.hintActor')}
            size="sm"
          />
          {/* ⚠️ ხელით შექმნილს TMDB-ის id არ აქვს — განახლების ღილაკი მას არაფერს მისცემდა */}
          {!editable && (
            <Button
              variant="outline"
              size="sm"
              disabled={resync.isPending || actor.has_tmdb === false}
              onClick={() => resync.mutate()}
              title={actor.has_tmdb === false ? t('actor.noTmdbId') : undefined}
            >
              {resync.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t('actor.refreshDetails')}
            </Button>
          )}
        </div>
      </div>

      {editing && <ActorFormDialog actor={actor} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />}
      {attaching && <ActorAttachDialog actorId={actor.id} name={name} onClose={() => setAttaching(false)} />}
    </header>
  )
}
