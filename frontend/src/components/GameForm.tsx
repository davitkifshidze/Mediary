import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Library, Loader2, Plus, Search, X } from 'lucide-react'
import {
  createGame,
  fetchRawgCandidates,
  fetchRawgDraft,
  GAME_LINK_KINDS,
  GAME_MODES,
  GAME_PLATFORMS,
  GAME_STATUSES,
  updateGame,
  type Game,
  type GameDlc,
  type GameGenre,
  type GameInput,
  type GameLink,
  type GameLinkKind,
  type GameMode,
  type GamePlatform,
  type RawgCandidate,
} from '@/api/games'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { errorMessage, fieldErrors, isApiCode } from '@/lib/errors'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { GameFranchiseDialog } from '@/components/GameFranchiseDialog'
import { GameGenreDialog } from '@/components/GameGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { TagSelect } from '@/components/TagSelect'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DatePicker } from '@/components/ui/date-picker'
import { DurationInput } from '@/components/ui/duration-input'
import { Label } from '@/components/ui/label'
import { FieldLabel } from '@/components/ui/field-label'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   თამაშის ფორმა (Tasks §11; ველების სია დამტკიცდა 19.1-ში).

   ⚠️ **§5.1 (2026-09-10) — ველების სია შემოკლდა.** ფორმიდან მოიხსნა:
   ქართული სახელი · დეველოპერი · „სად ვთამაშობ" · ასაკობრივი რეიტინგი ·
   ზომა · ქართული აღწერა · **ქულების მთელი ბლოკი** (Metacritic, OpenCritic,
   მოთამაშეების ქულა, ჩემი ქულა).

   ⚠️ **მონაცემი არსად წაშლილა**: ამოღებული ველები `state`-ში და payload-ში
   **განზრახ** რჩება (წიგნების §5.7-ის ზუსტი პრეცედენტი) — თორემ ძველი
   ჩანაწერის რედაქტირება ჩუმად წაშლიდა RAWG-ის შევსებულ დეველოპერს,
   ასაკობრივ რეიტინგსა და ქულებს. RAWG მათ ისევ ავსებს და ჩანაწერის
   გვერდზე ისინი ისევ ჩანს.

   „სწრაფი შევსება" RAWG-იდან, TMDB-ის ნაკადით: ჯერ კანდიდატები, მერე
   არჩეულის დრაფტი. ავტომატურად არაფერი ემთხვევა და დრაფტი
   **მხოლოდ ცარიელ ველებს** ავსებს.

   ⚠️ RAWG კლავიშს ითხოვს (`RAWG_API_KEY`). მისი გარეშე endpoint 503-ს
   აბრუნებს და ფორმა ცხადად წერს „წყარო მიუწვდომელია" — და არა
   „ვერაფერი მოიძებნა". ველები ხელით ივსება (ბორდგეიმის იგივე ქცევა).
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
    <div className="mt-1.5 flex flex-wrap gap-1.5">
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
    hltb_main: game?.hltb_main != null ? String(game.hltb_main) : '',
    hltb_main_extra: game?.hltb_main_extra != null ? String(game.hltb_main_extra) : '',
    hltb_complete: game?.hltb_complete != null ? String(game.hltb_complete) : '',
    metacritic: game?.metacritic != null ? String(game.metacritic) : '',
    opencritic: game?.opencritic != null ? String(game.opencritic) : '',
    users_score: game?.users_score != null ? String(game.users_score) : '',
    rating: game?.rating != null ? String(game.rating) : '',
    age_rating: game?.age_rating ?? '',
    size_gb: game?.size_gb != null ? String(game.size_gb) : '',
    status: game?.status ?? 'undecided',
    rawgId: game?.rawg_id != null ? String(game.rawg_id) : '',
    rawgSlug: game?.rawg_slug ?? '',
    igdbId: game?.igdb_id != null ? String(game.igdb_id) : '',
    igdbSlug: game?.igdb_slug ?? '',
  })

  const [platforms, setPlatforms] = useState<GamePlatform[]>(game?.platforms ?? [])
  const [modes, setModes] = useState<GameMode[]>(game?.modes ?? [])
  const [genreIds, setGenreIds] = useState<number[]>(game?.genre_ids ?? [])
  const [links, setLinks] = useState<GameLink[]>(game?.links ?? [])
  const [dlcs, setDlcs] = useState<GameDlc[]>(game?.dlcs ?? [])
  const [languages, setLanguages] = useState({
    interface: game?.languages?.interface ?? [],
    audio: game?.languages?.audio ?? [],
    subtitles: game?.languages?.subtitles ?? [],
  })

  const [rawgCoverUrl, setRawgCoverUrl] = useState<string | null>(null)
  const [cover, setCover] = useState<File | null>(null)
  const [coverPreview, setCoverPreview] = useState<string | null>(storageUrl(game?.cover))
  const [removeCover, setRemoveCover] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGenre, setNewGenre] = useState(false)
  const [franchiseOpen, setFranchiseOpen] = useState(false)

  /* ---------- სწრაფი შევსება RAWG-იდან ---------- */

  const [lookupQuery, setLookupQuery] = useState('')
  const [candidates, setCandidates] = useState<RawgCandidate[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const lookup = useMutation({
    mutationFn: () => fetchRawgCandidates(lookupQuery.trim()),
    onSuccess: (results) => {
      setUnavailable(false)
      setCandidates(results)
    },
    onError: (e) => {
      // 503 = კლავიში არ არის ან წყარო ჩავარდა; დანარჩენი ჩვეულებრივი შეცდომაა
      const blocked = isApiCode(e, 'rawg_unavailable')
      setUnavailable(blocked)
      setCandidates(blocked ? [] : null)
      if (!blocked) toast({ title: errorMessage(e), variant: 'error' })
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
      metacritic: f.metacritic || (draft.metacritic != null ? String(draft.metacritic) : ''),
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
    if (!links.length && draft.links?.length) setLinks(draft.links)

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
    mutationFn: (input: GameInput) => (game ? updateGame(game.id, input) : createGame(input)),
    onSuccess: () => {
      toast({ title: t('games.saved'), variant: 'success' })
      onSaved()
    },
    onError: (e) => {
      setErrors(fieldErrors(e))
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const num = (value: string) => (value === '' ? null : Number(value))

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
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
      hltb_main: num(form.hltb_main),
      hltb_main_extra: num(form.hltb_main_extra),
      hltb_complete: num(form.hltb_complete),
      metacritic: num(form.metacritic),
      opencritic: num(form.opencritic),
      users_score: num(form.users_score),
      rating: num(form.rating),
      age_rating: form.age_rating || null,
      size_gb: num(form.size_gb),
      languages,
      dlcs: dlcs.filter((d) => d.name.trim()),
      links: links.filter((l) => l.url.trim()),
      rawg_id: num(form.rawgId),
      rawg_slug: form.rawgSlug || null,
      igdb_id: num(form.igdbId),
      igdb_slug: form.igdbSlug || null,
      status: form.status,
      rawg_cover_url: rawgCoverUrl,
      cover,
      remove_cover: removeCover,
    })
  }

  const toggleIn = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((x) => x !== value) : [...list, value]

  return (
    <ModalShell title={t(game ? 'games.edit' : 'games.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* ---------- სწრაფი შევსება ---------- */}
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <Label htmlFor="g-lookup">{t('games.lookup')}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="g-lookup"
              placeholder={t('games.lookupPlaceholder')}
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // ⚠️ ფორმის submit-ს ვაჩერებთ — Enter აქ „ძებნას" ნიშნავს
                  e.preventDefault()
                  if (lookupQuery.trim()) lookup.mutate()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!lookupQuery.trim() || lookup.isPending}
              onClick={() => lookup.mutate()}
            >
              {lookup.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {t('games.lookupSearch')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('games.lookupHint')}</p>

          {unavailable && (
            <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t('games.lookupUnavailable')}
            </p>
          )}

          {!unavailable && candidates && (
            <div className="mt-3 space-y-1.5">
              {!candidates.length && (
                <p className="text-xs text-muted-foreground">{t('games.lookupEmpty')}</p>
              )}
              {candidates.map((candidate) => (
                <button
                  key={`${candidate.source ?? 'rawg'}-${candidate.rawg_id ?? candidate.igdb_id}`}
                  type="button"
                  disabled={pick.isPending}
                  onClick={() => pick.mutate(candidate)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted"
                >
                  {candidate.cover_url ? (
                    <img
                      src={candidate.cover_url}
                      alt=""
                      className="h-10 w-16 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="h-10 w-16 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{candidate.title_en ?? '—'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        candidate.release_date,
                        candidate.genres?.join(', '),
                        candidate.metacritic ? `MC ${candidate.metacritic}` : null,
                        // საიდან მოვიდა — IGDB სათადარიგოა და ეს ცხადად ჩანს
                        candidate.source === 'igdb' ? 'IGDB' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- სათაური ---------- */}
        {/* ⚠️ §5.1 — მხოლოდ ინგლისური; `title_ka` state-ში რჩება და ძველ
            ჩანაწერს არ ეშლება (იხ. ფაილის თავში) */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="sm:col-span-2">
            {/* ⚠️ სათაური `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება */}
            <FieldLabel htmlFor="g-title-en" required>{fields.label('title')}</FieldLabel>
            <Input
              id="g-title-en"
              value={form.title_en}
              onChange={(e) => setForm((f) => ({ ...f, title_en: e.target.value }))}
            />
            {errors.title_en && <p className="mt-1 text-xs text-destructive">{errors.title_en}</p>}
            {errors.title_ka && <p className="mt-1 text-xs text-destructive">{errors.title_ka}</p>}
          </div>
          <div className={fields.shows('release_date') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="g-release" required={fields.required('release_date')} hint={fields.hint('release_date')}>
              {fields.label('release_date')}
            </FieldLabel>
            {/* §2.8 — საერთო პიქერი (`YYYY-MM-DD`, იგივე ფორმატი) */}
            <DatePicker
              id="g-release"
              value={form.release_date || null}
              onChange={(v) => setForm((f) => ({ ...f, release_date: v ?? '' }))}
            />
          </div>
          <div className={fields.shows('publisher') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="g-pub" required={fields.required('publisher')} hint={fields.hint('publisher')}>
              {fields.label('publisher')}
            </FieldLabel>
            <Input
              id="g-pub"
              value={form.publisher}
              onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
            />
          </div>
        </div>

        {/* ---------- ფრენჩაიზი — ტექსტი აღარაა, მოდალია (§5.1) ---------- */}
        {fields.shows('franchise') && (
          <div>
            <FieldLabel required={fields.required('franchise')} hint={fields.hint('franchise')}>
              {fields.label('franchise')}
            </FieldLabel>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setFranchiseOpen(true)}>
                <Library className="size-4" />
                {form.franchise || t('games.franchiseNone')}
              </Button>
              {!!form.franchise && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setForm((f) => ({ ...f, franchise: '' }))}
                  aria-label={t('games.franchiseClear')}
                >
                  <X className="size-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* ---------- პლატფორმები და რეჟიმები ---------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('platforms') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('platforms')} hint={fields.hint('platforms')}>
              {fields.label('platforms')}
            </FieldLabel>
            <ChipGroup
              values={GAME_PLATFORMS}
              selected={platforms}
              label={(p) => t(`games.platforms.${p}`)}
              onToggle={(p) => setPlatforms((cur) => toggleIn(cur, p))}
            />
            {/* ⚠️ §5.1 — „სად ვთამაშობ" (`my_platform`) ფორმიდან მოიხსნა;
                სვეტი და ძველი მნიშვნელობა რჩება (payload-ში ისევ მიდის) */}
          </div>

          <div>
            <span className={fields.shows('modes') ? undefined : 'hidden'}>
              <FieldLabel required={fields.required('modes')} hint={fields.hint('modes')}>
                {fields.label('modes')}
              </FieldLabel>
            </span>
            <ChipGroup
              values={GAME_MODES}
              selected={modes}
              label={(m) => t(`games.modes.${m}`)}
              onToggle={(m) => setModes((cur) => toggleIn(cur, m))}
            />

            <div className="mt-3">
              {/* ჟანრები — per-user ლექსიკონი, ⚠️ **მრავალი** (11.1) */}
              <div className={fields.shows('genres') ? 'flex items-center justify-between' : 'hidden'}>
                <FieldLabel required={fields.required('genres')} hint={fields.hint('genres')}>
                  {fields.label('genres')}
                </FieldLabel>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setNewGenre(true)}
                  title={t('gameGenres.add')}
                >
                  <Plus className="size-3.5" />
                  {t('gameGenres.add')}
                </Button>
              </div>
              <div className={fields.shows('genres') ? 'mt-1 flex flex-wrap gap-1.5' : 'hidden'}>
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
              {errors.genre_ids && (
                <p className="mt-1 text-xs text-destructive">{errors.genre_ids}</p>
              )}
            </div>
          </div>
        </div>

        {/* ---------- HowLongToBeat (11.4 — ხელით) ---------- */}
        <div className={fields.shows('hltb') ? undefined : 'hidden'}>
          <FieldLabel required={fields.required('hltb')} hint={fields.hint('hltb')}>
            {fields.label('hltb')}
          </FieldLabel>
          {/* ⚠️ §2.5 — სვეტი **წუთებშია** და ველი საერთო `DurationInput`-ია.
              ადრე ათწილადი საათი ეწერა, ე.ი. „2 სთ 20 წთ" 2.3-ად ინახებოდა
              და უკან 2 სთ 18 წთ-ად იკითხებოდა. */}
          <div className="mt-1.5 grid gap-4 sm:grid-cols-3">
            {(['hltb_main', 'hltb_main_extra', 'hltb_complete'] as const).map((key) => (
              <div key={key}>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t(`games.hltb.${key.replace('hltb_', '')}`)}
                </p>
                <DurationInput
                  unit="minutes"
                  value={form[key] ? Number(form[key]) : null}
                  onChange={(v) => setForm((f) => ({ ...f, [key]: v == null ? '' : String(v) }))}
                />
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('games.hltbHint')}</p>
        </div>

        {/* ⚠️ §5.1 — ქულების მთელი ბლოკი (Metacritic · OpenCritic ·
            მოთამაშეების ქულა · ჩემი ქულა) ფორმიდან მოიხსნა. RAWG-ის
            მოტანილი ქულები payload-ში ისევ მიდის და ჩანაწერზე ჩანს. */}

        {/* ---------- სტატუსი / დამატებითი ---------- */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="g-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger id="g-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`games.statuses.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={fields.shows('rawg_id') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="g-rawg" required={fields.required('rawg_id')} hint={fields.hint('rawg_id')}>
              {fields.label('rawg_id')}
            </FieldLabel>
            <Input
              id="g-rawg"
              type="number"
              inputMode="numeric"
              value={form.rawgId}
              onChange={(e) => setForm((f) => ({ ...f, rawgId: e.target.value }))}
            />
            {errors.rawg_id && <p className="mt-1 text-xs text-destructive">{errors.rawg_id}</p>}
          </div>
        </div>

        {/* ---------- ენები ---------- */}
        <div className={fields.shows('languages') ? 'grid gap-4 sm:grid-cols-3' : 'hidden'}>
          {(['interface', 'audio', 'subtitles'] as const).map((key) => (
            <div key={key}>
              <Label htmlFor={`g-lang-${key}`}>{t(`games.languages.${key}`)}</Label>
              <TagSelect
                inputId={`g-lang-${key}`}
                options={['EN', 'KA', 'RU', 'DE', 'FR', 'ES', 'IT', 'PL', 'JA', 'ZH']}
                value={languages[key]}
                onChange={(v) => setLanguages((cur) => ({ ...cur, [key]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {/* ლინკები: ოფიციალური საიტი და მაღაზიები (§11.1) */}
            <span className={fields.shows('links') ? undefined : 'hidden'}>
              <FieldLabel required={fields.required('links')} hint={fields.hint('links')}>
                {fields.label('links')}
              </FieldLabel>
            </span>
            <div className={fields.shows('links') ? 'mt-1.5 space-y-1.5' : 'hidden'}>
              {links.map((link, i) => (
                <div key={i} className="flex gap-1.5">
                  <Select
                    value={link.kind ?? 'other'}
                    onValueChange={(v) =>
                      setLinks((all) =>
                        all.map((x, j) => (j === i ? { ...x, kind: v as GameLinkKind } : x)),
                      )
                    }
                  >
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_LINK_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {t(`games.linkKinds.${kind}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                    }
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
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLinks((all) => [...all, { label: '', url: '', kind: 'other' }])}
              >
                <Plus className="size-3.5" />
                {t('games.addLink')}
              </Button>
            </div>

            {/* DLC-ები */}
            <div className={fields.shows('dlcs') ? 'mt-4' : 'hidden'}>
              <FieldLabel required={fields.required('dlcs')} hint={fields.hint('dlcs')}>
                {fields.label('dlcs')}
              </FieldLabel>
              <div className="mt-1.5 space-y-1.5">
                {dlcs.map((dlc, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      placeholder={t('games.dlcName')}
                      value={dlc.name}
                      onChange={(e) =>
                        setDlcs((all) => all.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                      }
                    />
                    <Input
                      className="w-32 shrink-0"
                      placeholder={t('games.dlcNote')}
                      value={dlc.note ?? ''}
                      onChange={(e) =>
                        setDlcs((all) => all.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setDlcs((all) => all.filter((_, j) => j !== i))}
                      aria-label={t('actions.delete')}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDlcs((all) => [...all, { name: '', note: '' }])}
                >
                  <Plus className="size-3.5" />
                  {t('games.addDlc')}
                </Button>
              </div>
            </div>
          </div>

          <div>
            <span className={fields.shows('cover') ? undefined : 'hidden'}>
              <FieldLabel required={fields.required('cover')} hint={fields.hint('cover')}>
                {fields.label('cover')}
              </FieldLabel>
            </span>
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

            {/* ⚠️ §5.1 — მხოლოდ ინგლისური აღწერა; `description_ka` state-ში
                რჩება და ძველ ჩანაწერს არ ეშლება */}
            <div className={fields.shows('description') ? 'mt-4' : 'hidden'}>
              <FieldLabel htmlFor="g-desc-en" required={fields.required('description')} hint={fields.hint('description')}>
                {fields.label('description')} · {t('fields.langEn')}
              </FieldLabel>
              <Textarea
                id="g-desc-en"
                rows={8}
                value={form.description_en}
                onChange={(e) => setForm((f) => ({ ...f, description_en: e.target.value }))}
              />
            </div>
          </div>
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

      {/* §6 ფაზა 3 — მორგებული ველები (იხ. `CustomFieldsCard`: ბარათი თვითონ ინახავს თავს) */}
      <div className="mt-4">
        <CustomFieldsCard module="game" recordId={game?.id ?? null} />
      </div>

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
