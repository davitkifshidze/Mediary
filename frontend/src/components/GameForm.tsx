import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Library, Plus, X } from 'lucide-react'
import {
  createGame,
  fetchRawgCandidates,
  fetchRawgDraft,
  GAME_LINK_KINDS,
  GAME_LINK_STORES,
  GAME_MAX_RATING,
  GAME_MODES,
  GAME_PLATFORMS,
  GAME_STATUSES,
  updateGame,
  type Game,
  type GameGenre,
  type GameInput,
  type GameLink,
  type GameLinkKind,
  type GameLinkStore,
  type GameMode,
  type GamePlatform,
  type RawgCandidate,
} from '@/api/games'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { errorMessage, fieldErrors, isApiCode } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { GameFranchiseDialog } from '@/components/GameFranchiseDialog'
import { GameGenreDialog } from '@/components/GameGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { FieldLabel } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FieldAction, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
import {
  QuickFill,
  QuickFillCandidate,
  QuickFillMessage,
  QuickFillResults,
  QuickFillSearch,
} from '@/components/ui/quick-fill'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { keyRow, keyRows, unkeyRows, type Keyed } from '@/lib/rowKeys'
import { becomesVideo, storeFromUrl, withUrl } from '@/lib/gameLinks'
import { cn } from '@/lib/utils'
import { RatingSelect } from '@/components/ui/rating-select'
import { useRecordExtras } from '@/lib/customFieldDraft'

/* ============================================================
   თამაშის ფორმა (Tasks §11; ველების სია დამტკიცდა 19.1-ში).

   ⚠️ **§5.1 (2026-09-10) — ველების სია შემოკლდა.** ფორმიდან მოიხსნა:
   ქართული სახელი · დეველოპერი · „სად ვთამაშობ" · ასაკობრივი რეიტინგი ·
   ზომა · ქართული აღწერა · **ქულების ბლოკი** (OpenCritic, მოთამაშეების
   ქულა, ჩემი ქულა). ⚠️ **Tasks §13 (2026-09-27)** — Metacritic, HLTB, ენები
   და DLC-ის ბლოკი **მთლიანად** ამოვიდა (სვეტიც), ე.ი. ქვემოთი „state-ში
   განზრახ რჩება" მათ აღარ ეხება. **Tasks §25.4 (Q17)** — „ჩემი ქულა"
   ფორმაზე ბრუნდება (`RatingSelect`, ხუთივე ფორმის ერთი ამრჩევი).

   ⚠️ **მონაცემი არსად წაშლილა**: ამოღებული ველები `state`-ში და payload-ში
   **განზრახ** რჩება (წიგნების §5.7-ის ზუსტი პრეცედენტი) — თორემ ძველი
   ჩანაწერის რედაქტირება ჩუმად წაშლიდა RAWG-ის შევსებულ დეველოპერს,
   ასაკობრივ რეიტინგსა და ქულებს. RAWG მათ ისევ ავსებს და ჩანაწერის
   გვერდზე ისინი ისევ ჩანს.

   „სწრაფი შევსება" RAWG-იდან, TMDB-ის ნაკადით: ჯერ კანდიდატები, მერე
   არჩეულის დრაფტი. ავტომატურად არაფერი ემთხვევა და დრაფტი
   **მხოლოდ ცარიელ ველებს** ავსებს.

   ⚠️ RAWG (ან IGDB) **შენს** გასაღებს ითხოვს („მონაცემები", Tasks §30).
   მისი გარეშე endpoint 409 `credential_missing`-ს აბრუნებს და ფორმა
   „მონაცემების" ბმულს აჩვენებს; წყარო რომ არ პასუხობს, 503-ია და ფორმა
   ცხადად წერს „წყარო მიუწვდომელია" — ორივე სხვაა, ვიდრე „ვერაფერი
   მოიძებნა". ველები ხელით ივსება (ბორდგეიმის იგივე ქცევა).
   ============================================================ */

/** მრავალარჩევანიანი ჩიპები — პლატფორმებსა და რეჟიმებს ერთი და იგივე სჭირდება */
function ChipGroup<T extends string>({
  values,
  selected,
  label,
  onToggle,
}: {
  values: readonly T[]
  selected: T[]
  label: (value: T) => string
  onToggle: (value: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onToggle(value)}
          className={cn(
            'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
            selected.includes(value)
              ? 'border-primary bg-secondary font-medium'
              : 'border-border text-muted-foreground hover:bg-muted',
          )}
        >
          {label(value)}
        </button>
      ))}
    </div>
  )
}

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'game-form'

export function GameForm({
  game,
  genres,
  onClose,
  onSaved,
}: {
  game: Game | null
  genres: GameGenre[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('game')

  const [form, setForm] = useState({
    title_ka: game?.title_ka ?? '',
    title_en: game?.title_en ?? '',
    description_ka: game?.description_ka ?? '',
    description_en: game?.description_en ?? '',
    release_date: game?.release_date ?? '',
    developer: game?.developer ?? '',
    publisher: game?.publisher ?? '',
    franchise: game?.franchise ?? '',
    my_platform: game?.my_platform ?? '',
    opencritic: game?.opencritic != null ? String(game.opencritic) : '',
    users_score: game?.users_score != null ? String(game.users_score) : '',
    // Tasks §25.4 — რიცხვი ან `null` (`RatingSelect`)
    rating: game?.rating ?? null,
    age_rating: game?.age_rating ?? '',
    size_gb: game?.size_gb != null ? String(game.size_gb) : '',
    // ⚠️ ცარიელით იწყება — არჩევანი მომხმარებლისაა, ნაგულისხმები აღარ იწერება
    status: game?.status ?? '',
    rawgId: game?.rawg_id != null ? String(game.rawg_id) : '',
    rawgSlug: game?.rawg_slug ?? '',
    igdbId: game?.igdb_id != null ? String(game.igdb_id) : '',
    igdbSlug: game?.igdb_slug ?? '',
  })

  const [platforms, setPlatforms] = useState<GamePlatform[]>(game?.platforms ?? [])
  const [modes, setModes] = useState<GameMode[]>(game?.modes ?? [])
  const [genreIds, setGenreIds] = useState<number[]>(game?.genre_ids ?? [])
  /* ⚠️ სტრიქონს **საკუთარი გასაღები** აქვს და არა ინდექსი (Tasks BUG-11):
     შუა სტრიქონის წაშლაზე React ძველი რიგის DOM-ს მომდევნოსთვის იყენებდა,
     ე.ი. ფოკუსი, კარეტი და Radix `Select`-ის ღია მდგომარეობა სხვა ჩანაწერზე
     გადადიოდა. გასაღები მონაცემი არ არის — payload-ში `unkeyRows()` ჭრის. */
  const [links, setLinks] = useState<Keyed<GameLink>[]>(() => keyRows(game?.links ?? []))

  const [rawgCoverUrl, setRawgCoverUrl] = useState<string | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(storageUrl(game?.cover))
  const [removeCover, setRemoveCover] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGenre, setNewGenre] = useState(false)
  const [franchiseOpen, setFranchiseOpen] = useState(false)
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ თამაშზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('game', game)

  /* ---------- სწრაფი შევსება RAWG-იდან ---------- */

  const [lookupQuery, setLookupQuery] = useState('')
  const [candidates, setCandidates] = useState<RawgCandidate[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  // Tasks §30.6 — ჩემი RAWG/IGDB-ის გასაღები არ მაქვს (≠ წყარო ჩავარდა)
  const [noKey, setNoKey] = useState(false)

  const lookup = useMutation({
    mutationFn: () => fetchRawgCandidates(lookupQuery.trim()),
    onSuccess: (results) => {
      setUnavailable(false)
      setNoKey(false)
      setCandidates(results)
    },
    onError: (e) => {
      /* 503 = წყარო ჩავარდა · 409 `credential_missing` = გასაღები არ მაქვს (§30.6) —
         ⚠️ ორი სხვადასხვა ქმედება: „სცადე მოგვიანებით" და „ჩაწერე „მონაცემებში"" */
      const missing = isApiCode(e, 'credential_missing')
      const blocked = isApiCode(e, 'rawg_unavailable')
      setNoKey(missing)
      setUnavailable(blocked)
      setCandidates(blocked || missing ? [] : null)
      if (!blocked && !missing) toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const pick = useMutation({
    /**
     * ⚠️ სიის რიგსა და დეტალებს **სხვადასხვა ველები აქვს** (სიაში აღწერა არაა,
     * დეტალებში ზოგჯერ ჟანრი აკლია) — ამიტომ ვაერთიანებთ, როგორც წიგნებზე.
     */
    mutationFn: async (candidate: RawgCandidate) => {
      try {
        const draft = await fetchRawgDraft(candidate)
        const merged = { ...candidate }
        for (const [key, value] of Object.entries(draft)) {
          if (value !== null && value !== '' && !(Array.isArray(value) && !value.length)) {
            ;(merged as Record<string, unknown>)[key] = value
          }
        }
        return merged
      } catch {
        // დეტალების ჩავარდნა სიის მონაცემს არ უნდა დაკარგავდეს
        return candidate
      }
    },
    onSuccess: (draft) => {
      applyDraft(draft)
      setCandidates(null)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ⚠️ **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არასდროს ვაბათილებთ */
  const applyDraft = (draft: RawgCandidate) => {
    setForm((f) => ({
      ...f,
      title_en: f.title_en || (draft.title_en ?? ''),
      description_en: f.description_en || (draft.description_en ?? ''),
      release_date: f.release_date || (draft.release_date ?? ''),
      developer: f.developer || (draft.developer ?? ''),
      publisher: f.publisher || (draft.publisher ?? ''),
      users_score: f.users_score || (draft.users_score != null ? String(draft.users_score) : ''),
      age_rating: f.age_rating || (draft.age_rating ?? ''),
      // ⚠️ IGDB-ის დრაფტს `rawg_id` **არ აქვს** — ცარიელი რჩება და მისი
      // იდენტიფიკატორი ცალკე ველში ჯდება (`DECISIONS.md` §7)
      rawgId: f.rawgId || (draft.rawg_id != null ? String(draft.rawg_id) : ''),
      rawgSlug: f.rawgSlug || (draft.rawg_slug ?? ''),
      igdbId: f.igdbId || (draft.igdb_id != null ? String(draft.igdb_id) : ''),
      igdbSlug: f.igdbSlug || (draft.igdb_slug ?? ''),
    }))

    if (!platforms.length && draft.platforms?.length) setPlatforms(draft.platforms)
    if (!links.length && draft.links?.length) setLinks(keyRows(draft.links))

    // RAWG-ის ჟანრი **სახელია** — ჩვენს per-user ლექსიკონს სახელით ვუთავსებთ;
    // რაც ვერ დაემთხვა, ჩუმად ვარდება (ლექსიკონს user თვითონ მართავს)
    if (!genreIds.length && draft.genres?.length) {
      const matched = genres
        .filter((g) =>
          draft.genres.some(
            (name) =>
              name.toLowerCase() === g.name_en.toLowerCase() ||
              name.toLowerCase() === g.key.toLowerCase(),
          ),
        )
        .map((g) => g.id)
      if (matched.length) setGenreIds(matched)
    }

    // ყდა შენახვისას ჩამოიტვირთება; **კვოტაში არ ითვლება** (19.4/B)
    if (draft.cover_url && !coverPreview) {
      setRawgCoverUrl(draft.cover_url)
      setCoverPreview(draft.cover_url)
    }
  }

  /* ---------- შენახვა ---------- */

  const save = useMutation({
    mutationFn: (input: GameInput) => (extras.current ? updateGame(extras.current.id, input) : createGame(input)),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['games'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      toast({ title: t('games.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const num = (value: string) => (value === '' ? null : Number(value))


  /* ⚠️ **დამალულ ველზე წითელი ტექსტი არავის უნახავს** (Tasks §4.1): ბლოკი
     `hidden`-ითაა, ე.ი. შეცდომა DOM-შია და ეკრანზე არა — ღილაკი „შენახვა"
     ვიზუალურად არაფერს აკეთებდა. ამიტომ ასეთი ველი თოსტით სახელდება. */
  const warnHidden = (missing: string[]) => {
    const hidden = hiddenPicks(missing, fields.shows)

    if (hidden.length > 0) {
      toast({
        title: t('validation.hiddenRequired', {
          fields: hidden.map((key) => fields.label(key)).join(', '),
        }),
        variant: 'error',
      })
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()

    /* ⚠️ სტატუსიც და ჟანრიც სავალდებულოა — ჟანრი აქ pivot-ია, ე.ი. „მინიმუმ ერთი".
       შემოწმება ქსელამდეა, რათა პასუხი იმავე წამს იყოს; backend-ის 422 მეორე კარიბჭეა. */
    const picked = pickErrors(
      { status: form.status, genre_ids: genreIds },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    save.mutate({
      title_ka: form.title_ka || null,
      title_en: form.title_en || null,
      description_ka: form.description_ka || null,
      description_en: form.description_en || null,
      release_date: form.release_date || null,
      developer: form.developer || null,
      publisher: form.publisher || null,
      franchise: form.franchise || null,
      platforms,
      my_platform: (form.my_platform || null) as GamePlatform | null,
      modes,
      genre_ids: genreIds,
      opencritic: num(form.opencritic),
      users_score: num(form.users_score),
      rating: form.rating,
      age_rating: form.age_rating || null,
      size_gb: num(form.size_gb),
      links: unkeyRows(links.filter((l) => l.url.trim())),
      rawg_id: num(form.rawgId),
      rawg_slug: form.rawgSlug || null,
      igdb_id: num(form.igdbId),
      igdb_slug: form.igdbSlug || null,
      // ⚠️ ზემოთი დაცვა უკვე დაადგინა, რომ ცარიელი არ არის
      status: form.status as (typeof GAME_STATUSES)[number],
      rawg_cover_url: rawgCoverUrl,
      cover,
      remove_cover: removeCover,
    })
  }

  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  return (
    <ModalShell title={t(game ? 'games.edit' : 'games.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ---------- §26.2 — სწრაფი შევსება (ყველა ფორმის ერთი ბლოკი) ---------- */}
        <QuickFill title={t('games.lookup')} hint={t('games.lookupHint')} htmlFor="g-lookup">
          <QuickFillSearch
            id="g-lookup"
            value={lookupQuery}
            onChange={setLookupQuery}
            onSearch={() => lookup.mutate()}
            busy={lookup.isPending}
            placeholder={t('games.lookupPlaceholder')}
            buttonLabel={t('games.lookupSearch')}
          />

          {/* ⚠️ „წყარო მიუწვდომელია" ცალკე მდგომარეობაა და არა ცარიელი სია */}
          {unavailable && <QuickFillMessage tone="warn">{t('games.lookupUnavailable')}</QuickFillMessage>}
          {noKey && <CredentialMissingNotice provider="rawg" />}

          {!unavailable && !noKey && candidates && !candidates.length && (
            <QuickFillMessage>{t('games.lookupEmpty')}</QuickFillMessage>
          )}

          {!unavailable && !noKey && candidates && candidates.length > 0 && (
            <QuickFillResults>
              {candidates.map((candidate) => (
                <QuickFillCandidate
                  key={`${candidate.source ?? 'rawg'}-${candidate.rawg_id ?? candidate.igdb_id}`}
                  shape="wide"
                  image={candidate.cover_url}
                  title={candidate.title_en ?? '—'}
                  meta={[
                    candidate.release_date,
                    candidate.genres?.join(', '),
                    // საიდან მოვიდა — IGDB სათადარიგოა და ეს ცხადად ჩანს
                    candidate.source === 'igdb' ? 'IGDB' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  disabled={pick.isPending}
                  onPick={() => pick.mutate(candidate)}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>

        {/* ---------- §26 — ყდა ზემოთაა, სათაურთან და აღწერასთან ერთად ---------- */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('cover') && (
              <>
                <FieldLabel required={fields.required('cover')} hint={fields.hint('cover')}>
                  {fields.label('cover')}
                </FieldLabel>
                <PosterUploader
                  variant="wide"
                  hint={t('games.coverHint')}
                  preview={coverPreview}
                  onSelect={(file) => {
                    setCover(file)
                    setRawgCoverUrl(null)
                    setRemoveCover(false)
                    setCoverPreview(URL.createObjectURL(file))
                  }}
                  onClear={() => {
                    setCover(null)
                    setRawgCoverUrl(null)
                    setCoverPreview(null)
                    setRemoveCover(true)
                  }}
                />
              </>
            )
          }
        >
          {/* ⚠️ §5.1 — მხოლოდ ინგლისური; `title_ka` state-ში რჩება და ძველ
              ჩანაწერს არ ეშლება (იხ. ფაილის თავში). ⚠️ სათაური `locked`-ია
              (§6.5) — ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` ისმის. */}
          <FormField
            {...fields.field('title')}
            required
            htmlFor="g-title-en"
            error={errors.title_en ?? errors.title_ka}
          >
            <Input
              id="g-title-en"
              value={form.title_en}
              onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
            />
          </FormField>

          {/* §2.8 — საერთო პიქერი (`YYYY-MM-DD`, იგივე ფორმატი) */}
          <FormField size="third" {...fields.field('release_date')} htmlFor="g-release">
            <DatePicker
              id="g-release"
              value={form.release_date || null}
              onChange={(v) => setForm((f) => ({ ...f, release_date: v ?? '' }))}
            />
          </FormField>

          <FormField size="third" {...fields.field('publisher')} htmlFor="g-pub">
            <Input
              id="g-pub"
              value={form.publisher}
              onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
            />
          </FormField>

          {/* ფრენჩაიზი — ტექსტი აღარაა, მოდალია (§5.1) */}
          <FormField size="third" {...fields.field('franchise')}>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                className="min-w-0 flex-1 justify-start"
                onClick={() => setFranchiseOpen(true)}
              >
                <Library className="size-4 shrink-0" />
                <span className="truncate">{form.franchise || t('games.franchiseNone')}</span>
              </Button>
              {!!form.franchise && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => setForm((f) => ({ ...f, franchise: '' }))}
                  aria-label={t('games.franchiseClear')}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </FormField>

          {/* ⚠️ §5.1 — მხოლოდ ინგლისური აღწერა; `description_ka` state-ში
              რჩება და ძველ ჩანაწერს არ ეშლება */}
          <FormField
            {...fields.field('description')}
            label={`${fields.label('description')} · ${t('fields.langEn')}`}
            htmlFor="g-desc-en"
          >
            <Textarea
              id="g-desc-en"
              rows={FORM_TEXT_ROWS}
              value={form.description_en}
              onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
            />
          </FormField>
        </FormSection>

        {/* ---------- კლასიფიკაცია ---------- */}
        <FormSection title={t('form.sections.classification')}>
          <FormField size="third" {...fields.field('status')} htmlFor="g-status" error={errors.status}>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}>
              <SelectTrigger id="g-status" className={errors.status ? 'border-destructive' : undefined}>
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {GAME_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`games.statuses.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {/* ⚠️ §5.1 — OpenCritic და მოთამაშეების ქულა ფორმის გარეთ რჩება (payload-ში
              ისევ მიდის); „ჩემი ქულა" Tasks §25.4-ით ბრუნდება — სტატუსის გვერდით */}
          <FormField size="third" {...fields.field('rating')} htmlFor="g-rating" error={errors.rating}>
            <RatingSelect
              id="g-rating"
              max={GAME_MAX_RATING}
              value={form.rating}
              invalid={!!errors.rating}
              onChange={(rating) => setForm((f) => ({ ...f, rating }))}
            />
          </FormField>

          <FormField size="third" {...fields.field('rawg_id')} htmlFor="g-rawg" error={errors.rawg_id}>
            <Input
              id="g-rawg"
              type="number"
              inputMode="numeric"
              value={form.rawgId}
              onChange={(e) => setForm((f) => ({ ...f, rawgId: e.target.value }))}
            />
          </FormField>

          {/* ჟანრები — per-user ლექსიკონი, ⚠️ **მრავალი** (11.1) */}
          <FormField
            {...fields.field('genres')}
            error={errors.genre_ids}
            action={
              <FieldAction onClick={() => setNewGenre(true)} icon={<Plus className="size-3.5" />}>
                {t('gameGenres.add')}
              </FieldAction>
            }
          >
            <div
              className={cn(
                'flex flex-wrap gap-1.5',
                // ⚠️ აქ `Select` არ არის (ჭიპებია), ამიტომ წითელდება მთელ ბლოკს
                errors.genre_ids && 'rounded-md border border-destructive p-1.5',
              )}
            >
              {genres.map((genre) => (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => setGenreIds((cur) => toggleIn(cur, genre.id))}
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                    genreIds.includes(genre.id)
                      ? 'border-primary bg-secondary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {dictionaryName(genre, lang)}
                </button>
              ))}
            </div>
          </FormField>

          <FormField size="half" {...fields.field('platforms')}>
            <ChipGroup
              values={GAME_PLATFORMS}
              selected={platforms}
              label={(p) => t(`games.platforms.${p}`)}
              onToggle={(p) => setPlatforms((cur) => toggleIn(cur, p))}
            />
            {/* ⚠️ §5.1 — „სად ვთამაშობ" (`my_platform`) ფორმიდან მოიხსნა;
                სვეტი და ძველი მნიშვნელობა რჩება (payload-ში ისევ მიდის) */}
          </FormField>

          <FormField size="half" {...fields.field('modes')}>
            <ChipGroup
              values={GAME_MODES}
              selected={modes}
              label={(m) => t(`games.modes.${m}`)}
              onToggle={(m) => setModes((cur) => toggleIn(cur, m))}
            />
          </FormField>
        </FormSection>

        {/* ---------- დეტალები: ბმულები — ოფიციალური საიტი და მაღაზიები (§11.1) ---------- */}
        <FormSection title={t('form.sections.details')} className={fields.shows('links') ? undefined : 'hidden'}>
          <FormField {...fields.field('links')}>
            <div className="space-y-1.5">
              {/* Tasks §22.3 — ორი ღერძი: „რა არის" (ტიპი) და „სად" (მხოლოდ მაღაზიას —
                  ჰოსტიდან ამოიცნობა), + არჩევითი წარწერა */}
              {links.map((link, i) => {
                const kind = link.kind ?? 'other'
                const set = (patch: Partial<GameLink>) =>
                  setLinks((all) => all.map((x, j) => (j === i ? { ...x, ...patch } : x)))

                return (
                  <div key={link._key} className="space-y-1.5 rounded-md border border-border p-2">
                    <div className="flex gap-1.5">
                      <Select
                        value={kind}
                        onValueChange={(v) =>
                          set({
                            kind: v as GameLinkKind,
                            // „სად" მხოლოდ მაღაზიას აქვს; გადართვისას ჰოსტიდან ივსება
                            store: v === 'store' ? (link.store ?? storeFromUrl(link.url)) : null,
                          })
                        }
                      >
                        <SelectTrigger className="w-40 shrink-0" aria-label={t('games.linkKind')}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {GAME_LINK_KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {t(`games.linkKinds.${k}`)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {kind === 'store' && (
                        <Select value={link.store ?? ''} onValueChange={(v) => set({ store: v as GameLinkStore })}>
                          <SelectTrigger className="w-36 shrink-0" aria-label={t('games.linkStore')}>
                            <SelectValue placeholder={t('games.linkStorePick')} />
                          </SelectTrigger>
                          <SelectContent>
                            {GAME_LINK_STORES.map((store) => (
                              <SelectItem key={store} value={store}>
                                {t(`games.linkStores.${store}`)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Input
                        className="min-w-0 flex-1"
                        placeholder={t('games.linkLabelPlaceholder')}
                        aria-label={t('games.linkLabel')}
                        value={link.label ?? ''}
                        onChange={(e) => set({ label: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="shrink-0"
                        onClick={() => setLinks((all) => all.filter((_, j) => j !== i))}
                        aria-label={t('actions.delete')}
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                    <Input
                      placeholder="https://…"
                      value={link.url}
                      onChange={(e) =>
                        setLinks((all) => all.map((x, j) => (j === i ? withUrl(x, e.target.value) : x)))
                      }
                    />
                    {/* §22.4 — ⚠️ ასეთი ბმული ბმულად არ ინახება: სერვერი თამაშის ვიდეოდ აქცევს */}
                    {becomesVideo(link) && (
                      <p className="text-xs text-muted-foreground">{t('games.linkBecomesVideo')}</p>
                    )}
                  </div>
                )
              })}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinks((all) => [...all, keyRow({ label: '', url: '', kind: 'other' })])}
              >
                <Plus className="size-3.5" />
                {t('games.addLink')}
              </Button>
            </div>
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ თამაშზე მონახაზი */}
      <CustomFieldsCard
        module="game"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

      {/* ფრენჩაიზის მოდალი (§5.1) — ნაწილების სია + ბიბლიოთეკაში დამატება */}
      {franchiseOpen && (
        <GameFranchiseDialog
          value={form.franchise}
          onApply={(next) => setForm((f) => ({ ...f, franchise: next }))}
          onClose={() => setFranchiseOpen(false)}
        />
      )}

      {/* სწრაფი „ახალი ჟანრი" — შენახვისთანავე ირჩევა */}
      {newGenre && (
        <GameGenreDialog
          genre={null}
          onClose={() => setNewGenre(false)}
          onSaved={(saved) => setGenreIds((cur) => [...cur, saved.id])}
        />
      )}
    </ModalShell>
  )
}
