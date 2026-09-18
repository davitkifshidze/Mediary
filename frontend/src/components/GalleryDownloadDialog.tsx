import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useContentLang } from '@/lib/settings'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Check, Clapperboard, Layers, Loader2, Play, Search, Square, UserRound, Users } from 'lucide-react'
import {
  fetchGalleryPlan,
  GALLERY_CAST_SIZES,
  GALLERY_CAST_SOURCES,
  GALLERY_MAX_ACTORS,
  GALLERY_MAX_LIMIT,
  GALLERY_MAX_PER_ACTOR,
  GALLERY_SUBJECT_SIZES,
  GALLERY_SUBJECTS,
  type GalleryCastMember,
  type GalleryCastMode,
  type GalleryCastSize,
  type GalleryCastSource,
  type GalleryDefaults,
  type GalleryOptions,
  type GalleryPlanFilters,
  type GalleryScope,
  type GallerySubject,
} from '@/api/gallery'
import { fetchGenres } from '@/api/media'
import { emptyMediaIds, MEDIA_NAV_KEY, type MediaType } from '@/lib/media'
import { useModules, isMediaKey } from '@/lib/modules'
import { cn, formatBytes } from '@/lib/utils'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NumberPick } from '@/components/ui/number-pick'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CutTabs } from '@/components/ui/cut-tabs'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ჩამოტვირთვის ცენტრი (Tasks §8.2/§8.5).**

   ⚠️ **ხაზით გაყოფილი „მასობრივი ჩამოტვირთვა" აღარ არსებობს** (შენი
   პირდაპირი მითითება). ჩამოტვირთვა ახლა **ყოველთვის კონტექსტიდან** იხსნება:
   გალერეის თავიდან, ჯგუფის ბარათიდან, ჩანაწერიდან ან მსახიობიდან — და იმავე
   დიალოგია. ცალკე ბლოკი სწორედ იმიტომ იყო ცუდი, რომ სკოუპს ხელახლა
   ალაგებინებდა იქ, სადაც ის უკვე ცნობილია.

   ## ორი ტაბი და რატომ
   · **ჩანაწერის ფოტოები** — რა (კადრი · პოსტერი), **თითოზე რამდენი**
     და **თითოზე რა ზომის**. მსახიობები აქ საერთოდ არ ჩანს: კადრში ვერ
     გაარჩევ, ვინაა სურათზე, ე.ი. კომბინაცია თავიდანვე უაზრო იყო.
   · **მსახიობების ფოტოები** — წყარო (პორტრეტები · კადრები ფილმებიდან),
     ვინ (ყველა · ქალი · კაცი · კონკრეტული), თითოზე რამდენი და რა ზომის.

   ## §8-ის სიახლეები
   ⚠️ **სკოუპი მრავალდომენიანია** — „ფილმებზე, სერიალებზე და ანიმეებზე
   ჯამში" ერთი გაშვებაა და არა სამი.
   ⚠️ **სტატუსი მულტია** და ჟანრებს **„ნებისმიერი/ყველა"** გადამრთველი აქვს:
   სამი ჟანრის „ყველა ერთდროულად" ხშირად ცარიელ სკოუპს იძლეოდა.
   ⚠️ **სკოუპი შეიძლება გამოირთოს** (მსახიობების ტაბზე) — „ან ჩათიშო და
   ზოგადად მსახიობზე ჩამოწერ".
   ⚠️ **„ყველა ქალის მონიშვნა" ღილაკია** და არა ხელით ძებნა-მონიშვნა.
   ⚠️ **რიცხვი და ზომა თითო სახეობას თავისი აქვს** — ერთი საერთო `limit`
   პოსტერებს საერთოდ არ უშვებდა (სია ჯერ იკვრებოდა და მერე იჭრებოდა).
   ============================================================ */

/** ტაბი = ნაკადი */
type Flow = 'record' | 'cast'

const LIMIT_OPTIONS = [5, 10, 20, 50, 100, 250, 500, GALLERY_MAX_LIMIT]
const PER_ACTOR_OPTIONS = [1, 2, 3, 5, 10, 20, 50, GALLERY_MAX_PER_ACTOR]
const ACTORS_OPTIONS = [3, 6, 12, 20, 50, 100, GALLERY_MAX_ACTORS]

/** მსახიობის ფოტოს წყაროს ხატულა — პორტრეტი · კადრი · ორივე */
const CAST_SOURCE_ICON: Record<GalleryCastSource, typeof UserRound> = {
  profiles: UserRound,
  tagged: Clapperboard,
  both: Layers,
}

export interface GalleryDownloadPin {
  /** ჩანაწერიდან გახსნილი — სკოუპი უკვე ცნობილია */
  record?: { type: MediaType; id: number; title?: string }
  /** მსახიობიდან გახსნილი — ერთი კონკრეტული მსახიობი */
  actor?: { id: number; name: string }
}

export function GalleryDownloadDialog({
  open,
  onOpenChange,
  defaults,
  onRun,
  pin,
  initialFlow,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  /** მოდულის პარამეტრებიდან მოსული default-ები (`module_user.settings`) */
  defaults: GalleryDefaults
  /** გაშვებული არჩევანი default-ად ინახება, რომ ხელახლა არ აწყო */
  onRun?: (next: GalleryDefaults) => void
  pin?: GalleryDownloadPin
  initialFlow?: Flow
}) {
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const { enqueueGallery, isBusy } = useQueue()
  const { mediaModules } = useModules()

  const domains = useMemo(
    () => mediaModules.map((m) => m.key).filter(isMediaKey),
    [mediaModules],
  )

  const [flow, setFlow] = useState<Flow>(initialFlow ?? (pin?.actor ? 'cast' : 'record'))

  /* ---------- სკოუპი: ორივე ტაბისთვის საერთო ---------- */
  const [types, setTypes] = useState<MediaType[]>(domains)
  // §6.4 — სტატუსების ჩიპები არჩეულ დომენებს მიჰყვება
  const statusOptions = useMergedStatuses(types)
  const lang = useContentLang(i18n.language)
  const [scope, setScope] = useState<GalleryScope>('all')
  const [statuses, setStatuses] = useState<string[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [genreMode, setGenreMode] = useState<'any' | 'all'>('any')
  const [ids, setIds] = useState<Record<MediaType, number[]>>(emptyMediaIds())
  const [skipWithPhotos, setSkipWithPhotos] = useState(true)

  /* ---------- ჩანაწერის ტაბი ---------- */
  const [subjects, setSubjects] = useState<GallerySubject[]>(defaults.subjects)
  const [limits, setLimits] = useState<Record<GallerySubject, number>>(defaults.limits)
  const [sizes, setSizes] = useState<Record<GallerySubject, string>>(defaults.sizes)

  /* ---------- მსახიობების ტაბი ---------- */
  const [castMode, setCastMode] = useState<GalleryCastMode>(
    pin?.actor ? 'selected' : defaults.cast === 'none' ? 'all' : defaults.cast,
  )
  const [castIds, setCastIds] = useState<number[]>(pin?.actor ? [pin.actor.id] : [])
  const [castSource, setCastSource] = useState<GalleryCastSource>(defaults.cast_source)
  const [castSize, setCastSize] = useState<GalleryCastSize>(defaults.cast_size)
  const [perActor, setPerActor] = useState(defaults.per_actor)
  const [actors, setActors] = useState(defaults.actors)

  /** მსახიობის ძებნა — ბიბლიოთეკაში ასეულობითია, სქროლი არ ჰყოფნის */
  const [castQ, setCastQ] = useState('')
  const [castQuery, setCastQuery] = useState('')

  // ⚠️ ძებნა **გეგმას** ხელახლა ითვლის, ე.ი. ყოველ ასოზე რექვესთი წასვლა არ უნდა
  useEffect(() => {
    const id = window.setTimeout(() => setCastQuery(castQ.trim()), 350)
    return () => window.clearTimeout(id)
  }, [castQ])

  // ჩართული დომენების სია მოგვიანებით მოდის — არჩეული უნდა დარჩეს ვალიდური
  useEffect(() => {
    setTypes((cur) => {
      const next = cur.filter((type) => domains.includes(type))
      return next.length ? next : domains
    })
  }, [domains])

  /**
   * **კონტექსტი გახსნაზე ხელახლა იკითხება.**
   *
   * ⚠️ დიალოგი მუდმივად მონტაჟშია (`open` მხოლოდ ჩვენებას წყვეტს), ე.ი.
   * `useState`-ის საწყისი მნიშვნელობა **მხოლოდ ერთხელ** გამოითვლება. ამის
   * გარეშე ორი ნამდვილი შეცდომა ხდებოდა:
   *  · მსახიობ **A**-ზე გახსნა → დახურვა → მსახიობ **B**-ზე გახსნა და
   *    `cast_ids` ისევ A-ს შეიცავდა, ე.ი. ჩამოტვირთვა **სხვა მსახიობზე** მიდიოდა;
   *  · „მსახიობების" ჭრილიდან გახსნილ დიალოგში ჩანაწერის ტაბი ჩანდა, თუ
   *    ადრე სხვა ჭრილზე იყავი.
   */
  useEffect(() => {
    if (!open) return

    setFlow(pin?.actor ? 'cast' : (initialFlow ?? 'record'))

    if (pin?.actor) {
      setCastMode('selected')
      setCastIds([pin.actor.id])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- მხოლოდ გახსნაზე ვაწყობთ ფორმას — pin.actor-ის იგივეობა ღია დიალოგს არ უნდა გადააწყოს
  }, [open, pin?.actor?.id, pin?.record?.id, initialFlow])

  const castFlow = flow === 'cast'
  /** ჩანაწერიდან/მსახიობიდან გახსნილზე სკოუპის არჩევანი ზედმეტია */
  const pinned = !!pin?.record || !!pin?.actor

  /**
   * **„ვისაც უკვე აქვს, გამოტოვე" — ერთი გამოთქმა ჩამრთველისთვისაც და
   * რექვესთისთვისაც** (გასწორდა 2026-09-13).
   *
   * ⚠️ ეს ორი ადგილი ერთმანეთს გასცდა და ნამდვილ ხარვეზს იძლეოდა:
   * მსახიობის გვერდიდან გახსნილ დიალოგში ჩამრთველი **დამალული იყო**,
   * `skip_with_photos` კი ისევ `true` მიდიოდა — ე.ი. კონკრეტულად
   * მონიშნული მსახიობი, რომელსაც ერთი ფოტო მაინც ჰქონდა, გეგმიდან
   * ჩუმად ამოვარდებოდა და ეკრანზე „მსახიობი 0 × თითოზე 20 = 0" წერია
   * (ცოცხლად გადამოწმებული — Abigail Lowe, 1 ფოტო).
   *
   * ⚠️ **მიბმულ ერთეულზე ფილტრს აზრი არ აქვს:** არჩევანი ხელით გაკეთდა,
   * „ვისაც უკვე აქვს" კი მასობრივი გაშვების მოხერხებულობაა. ჩანაწერიდან
   * გახსნილ **მსახიობების** ტაბზე პირიქით — ავზი ამ ფილმის მთელი
   * შემადგენლობაა და ფილტრი ისევ საჭიროა.
   */
  const canSkipWithPhotos = castFlow ? !pin?.actor : !pinned

  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: open && !pinned })

  /**
   * ⚠️ **თითო ტაბი მხოლოდ თავის პარამეტრებს აგზავნის.** ერთი საერთო
   * `options` ობიექტი სწორედ ის იყო, რაც ორ ნაკადს ერთმანეთში რევდა.
   */
  const options: GalleryOptions = useMemo(
    () =>
      castFlow
        ? {
            subjects: [],
            limits: { stills: 0, posters: 0 },
            cast: castMode,
            cast_ids: castMode === 'selected' ? castIds : [],
            cast_source: castSource,
            cast_size: castSize,
            per_actor: perActor,
            actors,
          }
        : {
            subjects,
            limits,
            sizes,
            cast: 'none',
            cast_ids: [],
            per_actor: 0,
          },
    [castFlow, subjects, limits, sizes, castMode, castIds, castSource, castSize, perActor, actors],
  )

  const scopeFilters = useMemo((): Partial<GalleryPlanFilters> => {
    if (pin?.record) return { types: [pin.record.type], scope: 'ids', ids: { [pin.record.type]: [pin.record.id] } }
    // მსახიობიდან გახსნილზე ჩანაწერების სკოუპს აზრი არ აქვს
    if (pin?.actor) return { scope: 'off' }

    return {
      types,
      scope,
      statuses: scope === 'status' ? statuses : undefined,
      favorite: scope === 'favorite' ? true : undefined,
      genres: scope === 'genre' ? genres : undefined,
      genre_mode: scope === 'genre' ? genreMode : undefined,
      ids: scope === 'ids' ? ids : undefined,
    }
  }, [pin, types, scope, statuses, genres, genreMode, ids])

  const filters: GalleryPlanFilters = useMemo(
    () => ({
      target: castFlow ? 'actor' : 'record',
      ...scopeFilters,
      // მიბმულ ჩანაწერზე „უკვე აქვს ფოტოები" გამორიცხვა აზრს კარგავს
      skip_with_photos: canSkipWithPhotos && skipWithPhotos,
      cast_q: castFlow && !pin?.actor ? castQuery || undefined : undefined,
      ...options,
    }),
    [castFlow, scopeFilters, canSkipWithPhotos, pin, skipWithPhotos, castQuery, options],
  )

  const planQ = useQuery({
    queryKey: ['gallery-plan', filters],
    queryFn: () => fetchGalleryPlan(filters),
    enabled: open,
  })

  const plan = planQ.data
  /* ⚠️ მსახიობთა სია **ყოველთვის გეგმიდან** მოდის: სკოუპის შეცვლაზე ავზიც
     იცვლება. ორი წყარო ერთმანეთს გაცდებოდა. */
  const castOptions: GalleryCastMember[] = plan?.cast ?? []

  /* ⚠️ „არცერთი" (0) ტაბის გამორთვის ტოლფასია (§3.6) — თორემ ღილაკი
     აქტიური იქნებოდა და ჩამოტვირთვა ცარიელს დაითვლიდა. */
  const pickedSubjects = subjects.filter((s) => (limits[s] ?? 0) > 0)
  const nothingPicked = castFlow ? perActor <= 0 : pickedSubjects.length === 0
  const canRun = !!plan?.count && !nothingPicked && !planQ.isFetching

  /** §3.2 — „რამდენი მსახიობი × თითოზე რამდენი = რამდენი ფოტო" */
  const castTotal = (plan?.count ?? 0) * perActor
  const perRecord = pickedSubjects.reduce((sum, s) => sum + (limits[s] ?? 0), 0)
  const recordTotal = (plan?.count ?? 0) * perRecord

  const toggleSubject = (s: GallerySubject) =>
    setSubjects((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]))
  const toggleCastId = (id: number) =>
    setCastIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const toggleType = (type: MediaType) =>
    setTypes((cur) => (cur.includes(type) ? cur.filter((x) => x !== type) : [...cur, type]))
  const toggleStatus = (status: string) =>
    setStatuses((cur) => (cur.includes(status) ? cur.filter((x) => x !== status) : [...cur, status]))

  /**
   * **„ყველა ქალი" / „ყველა კაცი" / „გასუფთავება" (§8.5).**
   *
   * ⚠️ ეს ზუსტად ის ღილაკია, რომელსაც მოთხოვნა ასახელებს („მონიშნო ყველა
   * ქალი ღილაკი"). ის **მონიშვნას** ავსებს და არა რეჟიმს ცვლის: შემდეგ
   * ხელით მოხსნა/დამატება ისევ შეიძლება — სწორედ ესაა „4-5 ქალზე".
   */
  const pickByGender = (gender: number | null) => {
    setCastMode('selected')
    setCastIds(
      gender === null
        ? []
        : castOptions.filter((m) => m.gender === gender && m.has_tmdb).map((m) => m.id),
    )
  }

  const eta = (seconds: number) =>
    seconds < 90 ? t('sync.etaSec', { count: seconds }) : t('sync.etaMin', { count: Math.round(seconds / 60) })

  const run = () => {
    if (!plan?.items.length) return
    enqueueGallery(plan.items, options)
    onRun?.({
      subjects,
      limits,
      sizes,
      cast: castMode,
      cast_source: castSource,
      cast_size: castSize,
      per_actor: perActor,
      actors,
    })
    toast({ title: t('gallery.started', { count: plan.items.length }), variant: 'success' })
    onOpenChange(false)
  }

  /**
   * მსახიობების არჩევანი. „კონკრეტული" მაშინ ჩანს, როცა ავზში ერთი მსახიობი მაინცაა.
   */
  const castModes: GalleryCastMode[] = [
    'all',
    'female',
    'male',
    ...(castOptions.length ? (['selected'] as GalleryCastMode[]) : []),
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>
          {pin?.actor
            ? t('gallery.fetchForActor', { name: pin.actor.name })
            : pin?.record
              ? t('gallery.fetchForRecord', { name: pin.record.title ?? '' })
              : t('gallery.fetchTitle')}
        </DialogTitle>

        {/* ---------- ორი ნაკადი — ორი ტაბი ---------- */}
        {/* ⚠️ **ორი სკოუპია და არა ერთის ორი ხედი** — „ჩანაწერის კადრები" და
            „მსახიობების ფოტოები" სხვადასხვა რამეს ჩამოტვირთავს, ამიტომ
            ჭრილის ბარათებია და არა ქვედახაზული ტაბები. */}
        {!pin?.actor && (
          <div className="mt-3">
            <CutTabs
              options={[
                { key: 'record', label: t('gallery.tab.record') },
                { key: 'cast', label: t('gallery.tab.cast') },
              ]}
              value={flow}
              onChange={(key) => setFlow(key as 'record' | 'cast')}
              layout="inline"
            />
          </div>
        )}

        <div className="fb-scroll mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          <p className="text-xs text-muted-foreground">{t(`gallery.tabHint.${flow}`)}</p>

          {/* ---------- დომენები + სკოუპი ---------- */}
          {!pinned && (
            <>
              {domains.length > 1 && (
                <div>
                  <Label className="mb-2 block">{t('gallery.domains')}</Label>
                  <ChipRow>
                    {domains.map((type) => (
                      <Chip key={type} active={types.includes(type)} onClick={() => toggleType(type)}>
                        {t(MEDIA_NAV_KEY[type])}
                      </Chip>
                    ))}
                  </ChipRow>
                  {/* ⚠️ ცარიელი არჩევანი ცხადად ითქვას — გეგმა 403-ს დააბრუნებს */}
                  {!types.length && (
                    <p className="mt-1.5 text-xs text-destructive">{t('gallery.pickDomain')}</p>
                  )}
                </div>
              )}

              <div>
                <Label className="mb-2 block">
                  {t(castFlow ? 'gallery.castScope' : 'sync.scope')}
                </Label>
                <RadioGroup
                  value={scope}
                  onValueChange={(v) => setScope(v as GalleryScope)}
                  className="gap-2"
                >
                  <ScopeRow value="all" active={scope} label={t('sync.scopeAll')} />

                  <ScopeRow value="status" active={scope} label={t('gallery.scopeStatuses')}>
                    <div className="flex flex-wrap gap-1.5">
                      {/* §6.4 — ჩიპები არჩეული დომენების ლექსიკონებიდან */}
                      {statusOptions.map((s) => (
                        <Chip
                          key={s.key}
                          active={statuses.includes(s.key)}
                          onClick={() => toggleStatus(s.key)}
                        >
                          {statusName(s, lang)}
                        </Chip>
                      ))}
                    </div>
                  </ScopeRow>

                  <ScopeRow value="favorite" active={scope} label={t('sync.scopeFavorite')} />

                  <ScopeRow value="genre" active={scope} label={t('sync.scopeGenre')}>
                    <GenreSelect genres={genresQ.data ?? []} value={genres} onChange={setGenres} />
                    {/* ⚠️ „ყველა ერთდროულად" სამ ჟანრზე ხშირად ცარიელ სკოუპს იძლევა */}
                    <ChipRow className="mt-2">
                      {(['any', 'all'] as const).map((mode) => (
                        <Chip key={mode} active={genreMode === mode} onClick={() => setGenreMode(mode)}>
                          {t(`gallery.genreMode.${mode}`)}
                        </Chip>
                      ))}
                    </ChipRow>
                  </ScopeRow>

                  <ScopeRow value="ids" active={scope} label={t('sync.scopeSpecific')}>
                    <MediaRecordPicker
                      types={types}
                      ids={ids}
                      onChange={(type, next) => setIds((cur) => ({ ...cur, [type]: next }))}
                      enabled={scope === 'ids'}
                    />
                  </ScopeRow>

                  {/* ⚠️ მხოლოდ მსახიობების ტაბზე — „ან ჩათიშო" */}
                  {castFlow && (
                    <ScopeRow value="off" active={scope} label={t('gallery.scopeOff')}>
                      <p className="text-xs text-muted-foreground">{t('gallery.scopeOffHint')}</p>
                    </ScopeRow>
                  )}
                </RadioGroup>
              </div>
            </>
          )}

          {canSkipWithPhotos && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox checked={skipWithPhotos} onCheckedChange={() => setSkipWithPhotos((v) => !v)} />
              <span>
                {t(castFlow ? 'gallery.skipActorsWithPhotos' : 'gallery.skipWithPhotos')}
                <span className="block text-xs text-muted-foreground">
                  {t('gallery.skipWithPhotosHint')}
                </span>
              </span>
            </label>
          )}

          {/* ============ ტაბი 1 — ჩანაწერის ფოტოები ============ */}
          {!castFlow && (
            <div className="space-y-2">
              <Label className="block">{t('gallery.what')}</Label>
              {GALLERY_SUBJECTS.map((subject) => {
                const on = subjects.includes(subject)

                return (
                  <div
                    key={subject}
                    className={cn(
                      'rounded-lg border p-3 transition-colors',
                      on ? 'border-primary bg-secondary/40' : 'border-border',
                    )}
                  >
                    <label className="flex cursor-pointer items-start gap-2 text-sm">
                      <Checkbox checked={on} onCheckedChange={() => toggleSubject(subject)} />
                      <span className="min-w-0">
                        {t(`gallery.subject.${subject}`)}
                        <span className="block text-xs text-muted-foreground">
                          {t(`gallery.subjectHint.${subject}`)}
                        </span>
                      </span>
                    </label>

                    {/* ⚠️ **რიცხვი და ზომა თითოს თავისი აქვს** (§8.2) */}
                    {on && (
                      <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2">
                        <div>
                          <Label className="mb-1.5 block text-xs">{t('gallery.limit')}</Label>
                          <NumberPick
                            allowNone
                            value={limits[subject] ?? 0}
                            onChange={(n) => setLimits((cur) => ({ ...cur, [subject]: n }))}
                            options={LIMIT_OPTIONS}
                            max={GALLERY_MAX_LIMIT}
                          />
                        </div>
                        <div>
                          <Label className="mb-1.5 block text-xs">{t('gallery.size')}</Label>
                          <Select
                            value={sizes[subject]}
                            onValueChange={(v) => setSizes((cur) => ({ ...cur, [subject]: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {GALLERY_SUBJECT_SIZES[subject].map((s) => (
                                <SelectItem key={s} value={s}>
                                  {t(`gallery.sizeOption.${s}`, s)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {nothingPicked && <p className="text-xs text-destructive">{t('gallery.pickSubject')}</p>}
            </div>
          )}

          {/* ============ ტაბი 2 — მსახიობების ფოტოები ============ */}
          {castFlow && (
            <>
              {/* წყარო — პორტრეტები თუ კადრები ფილმებიდან (§8.2).

                  ⚠️ **ბარათებია და აღარ ჩიპები** (შენი მითითება, 2026-09-14).
                  სამ ჩიპს ქვემოთ ერთი განმარტება ჰქონდა — **მხოლოდ არჩეულის**,
                  ე.ი. დანარჩენი ორის მნიშვნელობა დაფარული იყო და არჩევანის
                  გასაკეთებლად ჯერ უნდა გადაგერთო, რომ წაგეკითხა, რას ირჩევდი.
                  ახლა სამივე თავის განმარტებას თვითონ ამბობს. */}
              <div>
                <Label className="mb-2 block">{t('gallery.castSourceTitle')}</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {GALLERY_CAST_SOURCES.map((source) => {
                    const on = castSource === source
                    const Icon = CAST_SOURCE_ICON[source]

                    return (
                      <button
                        key={source}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setCastSource(source)}
                        className={cn(
                          'flex cursor-pointer flex-col gap-1.5 rounded-md border p-3 text-left transition-colors',
                          on
                            ? 'border-primary bg-secondary/60'
                            : 'border-border hover:border-primary/40 hover:bg-muted/50',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Icon className={cn('size-4 shrink-0', on ? 'text-primary' : 'text-muted-foreground')} />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {t(`gallery.castSource.${source}`)}
                          </span>
                          {on && <Check className="size-4 shrink-0 text-primary" />}
                        </span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {t(`gallery.castSourceHint.${source}`)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {!pin?.actor && (
                <div>
                  <Label className="mb-2 block">{t('gallery.castTargetTitle')}</Label>
                  <RadioGroup
                    value={castMode}
                    onValueChange={(v) => setCastMode(v as GalleryCastMode)}
                    className="gap-1.5"
                  >
                    {castModes.map((mode) => (
                      <div
                        key={mode}
                        className={cn(
                          'rounded-lg border p-2.5 transition-colors',
                          castMode === mode ? 'border-primary bg-secondary/50' : 'border-border',
                        )}
                      >
                        <label className="flex cursor-pointer items-center gap-3">
                          <RadioGroupItem value={mode} />
                          <span className="text-sm font-medium">{t(`gallery.cast.${mode}`)}</span>
                        </label>

                        {mode === 'selected' && castMode === 'selected' && (
                          <div className="mt-2 space-y-2 pl-8">
                            {/* ⚠️ **„ყველა ქალი" ღილაკი** — მოთხოვნის პირდაპირი პუნქტი */}
                            <div className="flex flex-wrap gap-1.5">
                              <Button type="button" size="sm" variant="outline" onClick={() => pickByGender(1)}>
                                <Users className="size-3.5" />
                                {t('gallery.pickAllFemale')}
                              </Button>
                              <Button type="button" size="sm" variant="outline" onClick={() => pickByGender(2)}>
                                <Users className="size-3.5" />
                                {t('gallery.pickAllMale')}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => pickByGender(null)}>
                                <Square className="size-3.5" />
                                {t('photos.clear')}
                              </Button>
                              <span className="ml-auto self-center text-xs text-muted-foreground">
                                {t('gallery.castPicked', { count: castIds.length })}
                              </span>
                            </div>

                            <div className="relative">
                              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                              <Input
                                value={castQ}
                                onChange={(e) => setCastQ(e.target.value)}
                                placeholder={t('gallery.castSearch')}
                                className="pl-8"
                              />
                            </div>

                            <div className="fb-scroll max-h-44 space-y-1 overflow-y-auto">
                              {castOptions.map((member) => (
                                <label
                                  key={member.id}
                                  className={cn(
                                    'flex cursor-pointer items-center gap-2 text-sm',
                                    !member.has_tmdb && 'opacity-50',
                                  )}
                                >
                                  <Checkbox
                                    checked={castIds.includes(member.id)}
                                    disabled={!member.has_tmdb}
                                    onCheckedChange={() => toggleCastId(member.id)}
                                  />
                                  <span className="min-w-0 truncate">
                                    {member.name_ka || member.name}
                                    {member.photos > 0 && (
                                      <span className="ml-1.5 text-xs text-muted-foreground">
                                        {t('gallery.photos', { count: member.photos })}
                                      </span>
                                    )}
                                  </span>
                                </label>
                              ))}
                              {!castOptions.length && (
                                <p className="text-xs text-muted-foreground">{t('gallery.castNone')}</p>
                              )}
                            </div>

                            {plan?.cast_truncated && (
                              <p className="text-xs text-muted-foreground">{t('gallery.castTruncated')}</p>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </RadioGroup>

                  {/* სქესით ჭრა მხოლოდ მაშინ მუშაობს, როცა სქესი ცნობილია */}
                  {(castMode === 'female' || castMode === 'male') && !!plan?.unknown_gender && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t('gallery.unknownGender', { count: plan.unknown_gender })}
                    </p>
                  )}

                  {castMode !== 'selected' && castQuery && (
                    <p className="mt-2 text-xs text-muted-foreground">{t('gallery.castSearchNarrows')}</p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="mb-2 block">{t('gallery.perActor')}</Label>
                  <NumberPick
                    allowNone
                    value={perActor}
                    onChange={setPerActor}
                    options={PER_ACTOR_OPTIONS}
                    max={GALLERY_MAX_PER_ACTOR}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">{t('gallery.perActorHint')}</p>
                </div>
                <div>
                  <Label className="mb-2 block">{t('gallery.castSize')}</Label>
                  <Select value={castSize} onValueChange={(v) => setCastSize(v as GalleryCastSize)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GALLERY_CAST_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(`gallery.castSizeOption.${s}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">{t('gallery.castSizeHint')}</p>
                </div>

                {/* ჭერი მხოლოდ ჯგუფურ არჩევანს ეხება — ხელით მონიშნული სია თვითონაა ჭერი */}
                {castMode !== 'selected' && !pin?.actor && (
                  <div>
                    <Label className="mb-2 block">{t('gallery.actors')}</Label>
                    <NumberPick
                      value={actors}
                      onChange={setActors}
                      options={ACTORS_OPTIONS}
                      max={GALLERY_MAX_ACTORS}
                    />
                  </div>
                )}
              </div>

              {nothingPicked && <p className="text-xs text-destructive">{t('gallery.pickPerActor')}</p>}
            </>
          )}
        </div>

        {/* ---------- შეჯამება: **ამ ტაბის** ჯამი, დრო და ადგილი ---------- */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="min-w-0 text-sm">
            {planQ.isFetching ? (
              <span className="text-muted-foreground">{t('api.loading')}</span>
            ) : plan ? (
              <>
                <span className="font-medium">
                  {castFlow
                    ? t('gallery.castSum', { actors: plan.count, each: perActor, total: castTotal })
                    : t('gallery.recordSum', { records: plan.count, each: perRecord, total: recordTotal })}
                </span>
                {plan.count > 0 && <span className="ml-1.5 text-muted-foreground">≈ {eta(plan.eta_seconds)}</span>}
                <span className={cn('block text-xs', plan.fits ? 'text-muted-foreground' : 'text-destructive')}>
                  {t('gallery.estimate', {
                    size: formatBytes(plan.estimated_bytes),
                    remaining: formatBytes(plan.storage.remaining),
                  })}
                </span>
                {!plan.fits && <span className="block text-xs text-destructive">{t('gallery.estimateOver')}</span>}
                {plan.skipped_without_tmdb > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t(castFlow ? 'gallery.actorsNoTmdb' : 'sync.noTmdb', {
                      count: plan.skipped_without_tmdb,
                    })}
                  </span>
                )}
                {/* ⚠️ **ნული თავის მიზეზს ატარებს** — „ყველას ფოტოები უკვე აქვს"
                    და „სკოუპში არაფერია" ერთნაირად ცარიელი გეგმაა, ტექსტი კი
                    სხვა უნდა იყოს; სწორედ ამის დუმილი იკითხებოდა ხარვეზად. */}
                {plan.skipped_with_photos > 0 && (
                  <span className="block text-xs text-muted-foreground">
                    {t(castFlow ? 'gallery.actorsHavePhotos' : 'gallery.recordsHavePhotos', {
                      count: plan.skipped_with_photos,
                    })}
                  </span>
                )}
              </>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('confirm.cancel')}
            </Button>
            <Button onClick={run} disabled={!canRun}>
              {planQ.isFetching ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {isBusy ? t('sync.addToQueue') : t('gallery.run')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** radio + (არჩეულზე) დამატებითი კონტროლი — `SyncDialog`-ის იდენტური ქცევა */
function ScopeRow({
  value,
  active,
  label,
  children,
}: {
  value: GalleryScope
  active: GalleryScope
  label: string
  children?: ReactNode
}) {
  const selected = active === value

  return (
    <div
      className={cn(
        'rounded-lg border p-3 transition-colors',
        selected ? 'border-primary bg-secondary/50' : 'border-border',
      )}
    >
      <label className="flex cursor-pointer items-center gap-3">
        <RadioGroupItem value={value} />
        <span className="text-sm font-medium">{label}</span>
      </label>
      {selected && children && <div className="mt-2 pl-8">{children}</div>}
    </div>
  )
}
