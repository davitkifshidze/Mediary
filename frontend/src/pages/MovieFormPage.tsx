import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, RefreshCw } from 'lucide-react'
import {
  fetchGenres,
  lookupCandidates,
  lookupDraft,
  mediaApi,
  type Candidate,
  type LookupDraft,
} from '@/api/media'
import { useModuleFields } from '@/lib/fields'
import { mediaKey, mediaOf, type MediaType } from '@/lib/media'
import { useSettings } from '@/lib/settings'
import { Button, buttonVariants } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { StarRating } from '@/components/ui/star-rating'
import { DurationInput } from '@/components/ui/duration-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField } from '@/components/ui/form-layout'
import {
  QuickFill,
  QuickFillCandidate,
  QuickFillMessage,
  QuickFillResults,
  QuickFillSearch,
} from '@/components/ui/quick-fill'
import { Switch } from '@/components/ui/switch'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterUploader } from '@/components/PosterUploader'
import { PageContainer } from '@/components/ui/page'
import { GenreSelect } from '@/components/GenreSelect'
import { cn } from '@/lib/utils'
import { STATUS_ACTIVE, STATUS_INACTIVE } from '@/lib/statusStyles'
import { hiddenPicks, missingPicks } from '@/lib/requiredPicks'
import { statusName, statusTone, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import { useRecordExtras } from '@/lib/customFieldDraft'
import { errorMessage, isApiCode } from '@/lib/errors'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { LinkField } from '@/components/ui/link-field'
import { statusStyle } from '@/lib/statusColor'
import { ModuleIcon } from '@/components/ModuleIcon'

/** ⚠️ ღილაკების რიგი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'media-form'

/* ⚠️ **გვერდის ფორმა თეთრ ბარათებადაა** (§26-მდელი სახე, დაბრუნდა
   2026-09-28): ქაღალდის ფონზე თეთრი ფილა ველებს აჯგუფებს. მოდალის ფორმებს
   ეს არ სჭირდებათ — იქ თვითონ მოდალია თეთრი ბარათი. */
const FORM_CARD = 'rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6'
const CARD_TITLE = 'font-mono text-[11px] uppercase tracking-wider text-muted-foreground'

const EMPTY = {
  title_ka: '',
  title_en: '',
  year: '',
  imdb_id: '',
  ge_url: '',
  trailer_url: '',
  description_ka: '',
  description_en: '',
  /** Tasks §9 (Q1) — „ჩემი ქულა" (`my_rating`); TMDB-ის `rating`-ს ფორმა აღარ ეხება */
  my_rating: null as number | null,
  // §2.5 — ხანგრძლივობა **წუთებში** (`movies.runtime`), `DurationInput`-ით
  runtime: '',
  genres: [] as string[],
  /** §6.4 — ლექსიკონის **გასაღები**; ცარიელი = „როგორც არის" (ახალზე ნაგულისხმევი) */
  status: '',
  is_favorite: false,
}

export function MovieFormPage({ type = 'movie' }: { type?: MediaType }) {
  const { id } = useParams()
  const editing = Boolean(id)
  const nav = useNavigate()
  const qc = useQueryClient()
  const { t, i18n } = useTranslation()
  const { toast } = useToast()
  const api = mediaApi(type)
  const lang = useContentLang(i18n.language)
  // §6.4 — სტატუსების ლექსიკონი დომენისაა
  const { data: statuses = [] } = useStatuses(type)
  const { settings } = useSettings()
  const { detailBase, libraryPath } = mediaOf(type)
  const backTo = editing ? `${detailBase}/${id}` : libraryPath

  const [form, setForm] = useState(EMPTY)
  const [poster, setPoster] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [removePoster, setRemovePoster] = useState(false)
  const [errors, setErrors] = useState<Record<string, string[]>>({})
  const [lookupInput, setLookupInput] = useState('')
  const [lookupTmdbId, setLookupTmdbId] = useState<number | null>(null)
  const [lookupErr, setLookupErr] = useState<string | null>(null)
  // Tasks §30.6 — ჩემი TMDB-ის გასაღები არ მაქვს (≠ „ვერ მოიძებნა" და ≠ „წყარო არ პასუხობს")
  const [lookupNoKey, setLookupNoKey] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])

  // §6 — რომელი არჩევითი ველი ჩანს ამ დომენზე (ლიმიტი per-module-ია)
  const fields = useModuleFields(type)
  /* §26.5 — დამატებითი ველები ახალ ჩანაწერზეც. ⚠️ ჩავარდნისას გვერდი ღია
     რჩება და შექმნილს ანახლებს (`extras.current`) — მეორე „შენახვა" დუბლს
     აღარ ქმნის. */
  const extras = useRecordExtras(type, editing ? { id: Number(id) } : null)

  // დომენზე მიბმული ტექსტი — სერიალის ფორმაზე „ფილმი" აღარ ეწეროს
  /* დომენზე მიბმული ტექსტი — სერიალის ფორმაზე „ფილმი" აღარ ეწეროს.
     ⚠️ **სუფიქსი დომენიდან იგება** (`Series` / `Anime`) და ფილმი უსუფიქსოა:
     ასე მესამე დომენის (§7.1) დამატება ერთი i18n-წყვილია და არა `if`. */
  const tm = (key: string) =>
    t(type === 'movie' ? `form.${key}` : `form.${key}${type === 'series' ? 'Series' : 'Anime'}`)

  const movieQ = useQuery({ queryKey: [type, 'detail', id], queryFn: () => api.get(id!), enabled: editing })
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres() })
  useEffect(() => {
    const m = movieQ.data
    if (!m) return
    setForm({
      title_ka: m.title_ka ?? '',
      title_en: m.title_en ?? '',
      year: m.year ? String(m.year) : '',
      imdb_id: m.imdb_id ?? '',
      ge_url: m.ge_url ?? '',
      trailer_url: m.trailer_url ?? '',
      description_ka: m.description_ka ?? '',
      description_en: m.description_en ?? '',
      my_rating: m.my_rating ?? null,
      runtime: m.runtime ? String(m.runtime) : '',
      genres: m.genres.map((g) => g.slug),
      status: m.status?.key ?? '',
      is_favorite: m.is_favorite,
    })
    if (m.poster) setPreview(m.poster)
  }, [movieQ.data])

  const set = (key: keyof typeof EMPTY, value: string | boolean) =>
    setForm((f) => ({ ...f, [key]: value }))

  const buildFormData = () => {
    const fd = new FormData()
    fd.append('title_ka', form.title_ka)
    fd.append('title_en', form.title_en)
    if (form.year) fd.append('year', form.year)
    if (form.imdb_id) fd.append('imdb_id', form.imdb_id)
    if (form.ge_url) fd.append('ge_url', form.ge_url)
    if (form.trailer_url) fd.append('trailer_url', form.trailer_url)
    fd.append('description_ka', form.description_ka)
    fd.append('description_en', form.description_en)
    // Tasks §9 — ჩემი ქულა ყოველთვის იგზავნება: ცარიელი სტრიქონი = წაშლა (`Rating::normalize()`)
    fd.append('my_rating', form.my_rating == null ? '' : String(form.my_rating))
    if (form.runtime) fd.append('runtime', form.runtime)
    // ცარიელი გასაღები საერთოდ არ იგზავნება — backend ნაგულისხმევს დაუყენებს
    if (form.status) fd.append('status', form.status)
    fd.append('is_favorite', form.is_favorite ? '1' : '0')
    const nameBySlug = new Map((genresQ.data ?? []).map((g) => [g.slug, g.name_en]))
    form.genres.forEach((slug) => {
      const name = nameBySlug.get(slug)
      if (name) fd.append('genres[]', name)
    })
    if (poster) fd.append('poster', poster)
    if (removePoster) fd.append('remove_poster', '1')
    return fd
  }

  const fillFromDraft = (d: LookupDraft) => {
    setLookupTmdbId(d.tmdb_id)
    const nameToSlug = new Map((genresQ.data ?? []).map((g) => [g.name_en.toLowerCase(), g.slug]))
    setForm((f) => ({
      ...f,
      title_en: d.title_en ?? f.title_en,
      title_ka: d.title_ka ?? f.title_ka,
      year: d.year ? String(d.year) : f.year,
      imdb_id: d.imdb_id ?? f.imdb_id,
      description_en: d.description_en ?? f.description_en,
      description_ka: d.description_ka ?? f.description_ka,
      genres: d.genres
        .map((n) => nameToSlug.get(n.toLowerCase()))
        .filter((s): s is string => Boolean(s)),
    }))
    if (d.poster) setPreview(d.poster)
  }

  /* Tasks §30.6 — სწრაფი შევსების ჩავარდნა სამი სხვადასხვა ფაქტია და
     სამნაირად ითქმის: გასაღები არ მაქვს (409 `credential_missing` →
     „მონაცემების" ბმული), ვერ მოიძებნა (404 `tmdb_not_found`) და წყარო არ
     პასუხობს (502 `tmdb_error`).
     ⚠️ **`message` მანქანური კოდია** (GAP-01) — ადრე ის პირდაპირ იწერებოდა
     ეკრანზე, ე.ი. გასაღების გარეშე ფორმაში ნედლი „credential_missing" ჩანდა.
     ამიტომ ტექსტი `errorMessage()`-ით ითარგმნება. */
  const onLookupError = (e: unknown) => {
    const noKey = isApiCode(e, 'credential_missing')
    setLookupNoKey(noKey)
    setLookupErr(
      noKey
        ? null
        : isApiCode(e, 'tmdb_not_found')
          ? tm('lookupNotFound')
          : errorMessage(e, tm('lookupNotFound')),
    )
  }

  const pickMut = useMutation({
    mutationFn: (tmdbId: number) => lookupDraft({ tmdb_id: tmdbId }, type),
    onSuccess: (d) => {
      setCandidates([])
      setLookupErr(null)
      setLookupNoKey(false)
      fillFromDraft(d)
    },
    onError: onLookupError,
  })

  const candidatesMut = useMutation({
    mutationFn: () => {
      const v = lookupInput.trim()
      const year = form.year ? Number(form.year) : undefined
      const payload = /^https?:\/\//i.test(v)
        ? { url: v }
        : /^tt\d+$/i.test(v)
          ? { imdb: v }
          : { query: v, year }
      return lookupCandidates(payload, type)
    },
    onSuccess: (list) => {
      setLookupErr(null)
      setLookupNoKey(false)
      if (!list.length) {
        setCandidates([])
        setLookupErr(tm('lookupNotFound'))
        return
      }
      if (list.length === 1) {
        setCandidates([])
        pickMut.mutate(list[0].tmdb_id)
        return
      }
      setCandidates(list)
    },
    onError: onLookupError,
  })

  const lookupBusy = candidatesMut.isPending || pickMut.isPending

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

  const mut = useMutation({
    mutationFn: async () => {
      const saved = extras.current
        ? await api.update(extras.current.id, buildFormData())
        : await api.create(buildFormData())
      // 18 — ავტომატური resync გამორთვადია: მედიის ჩამოტვირთვა შენახვას
      // აყოვნებს, ხოლო `/sync` იმავეს მოგვიანებით და მასობრივად აკეთებს.
      if (lookupTmdbId && settings.autoResync) {
        try {
          return await api.resync(saved.id)
        } catch {
          return saved
        }
      }
      return saved
    },
    onSuccess: async (m) => {
      qc.invalidateQueries({ queryKey: [type] })
      qc.invalidateQueries({ queryKey: ['genres'] })

      const done = await extras.afterSave(m)
      if (!done.ok) {
        toast({ title: done.message, variant: 'error' })

        return
      }

      // 19.3 — ტექსტი დომენს მიჰყვება: სერიალზე „ფილმი დაემატა" ეწერა
      if (!editing) {
        toast({ title: t(type === 'series' ? 'toast.addedSeries' : 'toast.added'), variant: 'success' })
      }
      nav(`${detailBase}/${m.id}`)
    },
    onError: (e: { response?: { data?: { errors?: Record<string, string[]> } } }) => {
      const errs = e?.response?.data?.errors ?? {}
      setErrors(errs)
      // „უკვე დამატებულია“ (IMDb ID არსებობს) — ლამაზი alert, არა მხოლოდ network-ში
      if (errs.imdb_id) {
        toast({ title: tm('alreadyAdded'), variant: 'error' })
      }
    },
  })

  const resyncMut = useMutation({
    mutationFn: () => api.resync(Number(id)),
    onSuccess: (mv) => {
      qc.invalidateQueries({ queryKey: [type] })
      setForm((f) => ({
        ...f,
        title_ka: mv.title_ka ?? f.title_ka,
        title_en: mv.title_en ?? f.title_en,
        year: mv.year ? String(mv.year) : f.year,
        imdb_id: mv.imdb_id ?? f.imdb_id,
        description_ka: mv.description_ka ?? f.description_ka,
        description_en: mv.description_en ?? f.description_en,
        genres: mv.genres.map((g) => g.slug),
      }))
      if (mv.poster) {
        setPreview(mv.poster)
        setRemovePoster(false)
      }
    },
    /* Tasks §30.6 — `onError` აქ საერთოდ არ იყო, ე.ი. გასაღების გარეშე
       (409 `credential_missing`) ღილაკი ჩუმად არაფერს აკეთებდა. */
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  return (
    <PageContainer width="narrow">
      <Link
        to={backTo}
        className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {t('actions.back')}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {/* Tasks §4.1 — ტერნარი ანიმეს „ფილმის დამატებას“ აწერდა */}
          {t(mediaKey(editing ? 'form.editTitle' : 'form.addTitle', type))}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {editing ? t('form.editSubtitle') : t('form.addSubtitle')}
        </p>
      </div>

      <form
        id={FORM_ID}
        onSubmit={(e) => {
          e.preventDefault()

          /* ⚠️ სტატუსიც და ჟანრიც სავალდებულოა. აქ `errors` სიას იჭერს
             (backend-ი ველზე რამდენიმე შეცდომას აბრუნებს), ამიტომ `missingPicks`-ის
             პასუხი ერთწევრიან სიად ეხვევა, რომ ერთი და იგივე ველი
             ორივე შემთხვევაში ერთნაირად გაწითლდეს. */
          const missing = missingPicks({ status: form.status, genres: form.genres })
          if (missing.length > 0) {
            setErrors(Object.fromEntries(missing.map((key) => [key, [t('validation.pickOne')]])))
            warnHidden(missing)

            return
          }

          setErrors({})
          mut.mutate()
        }}
        className="space-y-6"
      >
        {/* --- §26.2 — სწრაფი შევსება (ყველა ფორმის ერთი ბლოკი) --- */}
        <QuickFill title={t('form.lookup')} hint={t('form.lookupHint')} htmlFor="m-lookup">
          <QuickFillSearch
            id="m-lookup"
            value={lookupInput}
            onChange={setLookupInput}
            onSearch={() => candidatesMut.mutate()}
            busy={lookupBusy}
            placeholder={tm('lookupPlaceholder')}
            buttonLabel={t('form.lookupBtn')}
          />
          {lookupErr && <QuickFillMessage tone="error">{lookupErr}</QuickFillMessage>}
          {lookupNoKey && <CredentialMissingNotice provider="tmdb" />}

          {candidates.length > 0 && (
            <QuickFillResults label={tm('lookupPick')}>
              {candidates.map((c) => (
                <QuickFillCandidate
                  key={c.tmdb_id}
                  image={c.poster}
                  title={c.title_en}
                  meta={`${c.year ?? '—'}${c.rating ? ` · ★ ${c.rating}` : ''}`}
                  disabled={pickMut.isPending}
                  onPick={() => pickMut.mutate(c.tmdb_id)}
                />
              ))}
            </QuickFillResults>
          )}
        </QuickFill>

        {/* --- თარგმანადი შიგთავსი — თეთრი ბარათი ---
            ⚠️ **ბარათები დაბრუნდა (2026-09-28, შენი მოთხოვნა).** §26-მა სექციები
            ფონზე, მხოლოდ სათაურის ხაზით დაალაგა — თეთრი ფონი გაქრა და გვერდი
            ერთ უწყვეტ სივრცედ იკითხებოდა. ბარათი ველებს აჯგუფებს: ერთი თეთრი
            ფილა = ერთი თემა, ქაღალდის ფონი მათ შორის = საზღვარი. */}
        <section className={FORM_CARD}>
          <div className={cn(CARD_TITLE, 'mb-4')}>
            {t('detail.content')} · {t(`lang.${i18n.language === 'en' ? 'en' : 'ka'}`)}
          </div>

          {/* ⚠️ სათაური `locked`-ია (§6.5): ერთი ენა ყოველთვის სავალდებულოა.
              ⚠️ **`shows()` მაინც ისმის (Tasks §4.5)** — ჩაკეტვა ახლა
              სუპერ-ადმინს ცხადად ეხსნება, ე.ი. „აზრი არ აქვს" აღარ მართლდება:
              ჩამრთველი, რომელიც ფორმაზე არაფერს ცვლის, ღილაკის არარსებობაზე
              უარესია. ⚠️ ენა მხოლოდ იმას წყვეტს, რომელი `Input` დაიხატება —
              თარგმანადი შიგთავსი ინტერფეისის ენაზეა. */}
          <div className="space-y-4">
            <FormField
              show={fields.shows('title')}
              label={fields.label('title')}
              htmlFor="m-title"
              required
              hint={t('form.requiredEitherLang')}
              error={(i18n.language === 'ka' ? errors.title_ka : errors.title_en)?.[0]}
            >
              <Input
                id="m-title"
                value={i18n.language === 'ka' ? form.title_ka : form.title_en}
                placeholder={fields.placeholder('title')}
                onChange={(e) => set(i18n.language === 'ka' ? 'title_ka' : 'title_en', e.target.value)}
              />
            </FormField>

            <FormField {...fields.field('description')} htmlFor="m-desc">
              <Textarea
                id="m-desc"
                rows={FORM_TEXT_ROWS}
              autoGrow
                value={i18n.language === 'ka' ? form.description_ka : form.description_en}
                placeholder={fields.placeholder('description')}
                onChange={(e) => set(i18n.language === 'ka' ? 'description_ka' : 'description_en', e.target.value)}
              />
            </FormField>
          </div>
        </section>

        {/* --- დეტალები — მეორე თეთრი ბარათი: პოსტერი წლითა და შეფასებით,
            ხანგრძლივობა, ბმულები, ჟანრები, სტატუსი და რჩეული --- */}
        <section className={cn(FORM_CARD, 'space-y-4')}>
          <div className={CARD_TITLE}>{t('form.details')}</div>

          {/* Tasks §14.1 — სვეტი იჭიმება: ლეიბლი ზემოთ, ყუთი დარჩენილ სიმაღლეს ავსებს (`FormSection media`-ს იგივე წესი) */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-stretch">
            <div className={fields.shows('poster') ? 'flex shrink-0 flex-col' : 'hidden'}>
              <FieldLabel required={fields.required('poster')} hint={fields.hint('poster')}>
                {fields.label('poster')}
              </FieldLabel>
              <div className="sm:min-h-0 sm:flex-1">
              <PosterUploader
                fill
                preview={preview}
                onSelect={(f) => {
                  setPoster(f)
                  setPreview(URL.createObjectURL(f))
                  setRemovePoster(false)
                }}
                onClear={() => {
                  setPoster(null)
                  setPreview(null)
                  setRemovePoster(true)
                }}
              />
              </div>
            </div>

            <div className="grid flex-1 grid-cols-2 gap-4">
              {fields.shows('year') && (
                <div>
                  <FieldLabel htmlFor="m-year" required={fields.required('year')} hint={fields.hint('year')}>
                    {fields.label('year')}
                  </FieldLabel>
                  <Input
                    id="m-year"
                    type="number"
                    value={form.year}
                    placeholder={fields.placeholder('year')}
                    onChange={(e) => set('year', e.target.value)}
                  />
                  {errors.year && <p className="mt-1 text-xs text-destructive">{errors.year[0]}</p>}
                </div>
              )}
              {fields.shows('rating') && (
                <div>
                  <FieldLabel htmlFor="m-rating" required={fields.required('rating')} hint={fields.hint('rating')}>
                    {fields.label('rating')}
                  </FieldLabel>
                  {/* Tasks §9 (Q1) — ვარსკვლავები `my_rating`-ზე; TMDB-ის საშუალო ქვემოთ მხოლოდ საკითხავად */}
                  <StarRating
                    id="m-rating"
                    value={form.my_rating}
                    invalid={!!errors.my_rating}
                    onChange={(my_rating) => setForm((f) => ({ ...f, my_rating }))}
                  />
                  {movieQ.data?.rating && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('rating.tmdbAverage')}: {movieQ.data.rating}
                    </p>
                  )}
                  {errors.my_rating && <p className="mt-1 text-xs text-destructive">{errors.my_rating[0]}</p>}
                </div>
              )}
            </div>
          </div>

          {/* §2.5 — ხანგრძლივობა ხელით; ჩვეულებრივ TMDB-იდან მოდის */}
          <FormField {...fields.field('runtime')} htmlFor="m-runtime" error={errors.runtime?.[0]}>
            <DurationInput
              id="m-runtime"
              unit="minutes"
              value={form.runtime ? Number(form.runtime) : null}
              onChange={(v) => set('runtime', v == null ? '' : String(v))}
            />
          </FormField>

          {/* ⚠️ §8 — ველის ინსტრუქცია `i`-ია და არა ქვეწარწერა */}
          <FormField
            {...fields.field('ge_url')}
            hint={joinHints(fields.hint('ge_url'), t('form.ge_urlHint'))}
            htmlFor="m-ge-url"
            error={errors.ge_url?.[0]}
          >
            {/* Tasks §15.3 — ბმულის მეტა-მონაცემი გაცნობისთვის: სწორი გვერდია თუ არა, აქვე ჩანს */}
            <LinkField
              id="m-ge-url"
              value={form.ge_url}
              onChange={(v) => set('ge_url', v)}
              placeholder={fields.placeholder('ge_url') ?? 'https://…'}
            />
          </FormField>

          {/* ტრეილერი (Tasks 9) — ცარიელზე სინქრონი TMDB-დან თვითონ მოიტანს */}
          <FormField
            {...fields.field('trailer_url')}
            hint={joinHints(fields.hint('trailer_url'), t('form.trailer_urlHint'))}
            htmlFor="m-trailer"
            error={errors.trailer_url?.[0]}
          >
            <LinkField
              id="m-trailer"
              value={form.trailer_url}
              onChange={(v) => set('trailer_url', v)}
              placeholder={fields.placeholder('trailer_url') ?? 'https://www.youtube.com/watch?v=…'}
            />
          </FormField>

          {/* ⚠️ `GenreSelect` react-select-ია — ჩარჩოს მას თავისი სტილები ხატავს,
              ამიტომ წითელდება მისი გარსა ედება და არა `className`-ით */}
          <FormField {...fields.field('genres')} error={errors.genres?.[0]}>
            <div className={cn(errors.genres && 'rounded-md ring-1 ring-destructive')}>
              <GenreSelect
                genres={genresQ.data ?? []}
                value={form.genres}
                onChange={(v) => setForm((f) => ({ ...f, genres: v }))}
              />
            </div>
          </FormField>

          <div className="flex flex-wrap items-center gap-6">
            <FormField {...fields.field('status')} error={errors.status?.[0]}>
              <div
                className={cn('flex flex-wrap gap-1.5', errors.status && 'rounded-md border border-destructive p-1.5')}
              >
                {/* §6.4 — სია ლექსიკონიდან. ⚠️ ნაგულისხმები აღარ იდება — არცევა სავალდებულოა */}
                {statuses.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => set('status', s.key)}
                    className={cn(
                      'inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                      form.status === s.key ? STATUS_ACTIVE[statusTone(s)] : STATUS_INACTIVE[statusTone(s)],
                    )}
                    // Tasks §16.3 — საკუთარი ფერი კლასებს ზემოდან ადგება; აიქონი წინ
                    style={statusStyle(s, form.status === s.key ? 'active' : 'inactive')}
                  >
                    {s.icon && <ModuleIcon name={s.icon} className="size-3.5" />}
                    {statusName(s, lang)}
                  </button>
                ))}
              </div>
            </FormField>

            {fields.shows('is_favorite') && (
              <div className="flex items-center gap-2 pt-6">
                <Switch id="fav" checked={form.is_favorite} onCheckedChange={(v) => set('is_favorite', v)} />
                <Label htmlFor="fav" className="mb-0 cursor-pointer text-sm">
                  {fields.label('is_favorite')}
                </Label>
              </div>
            )}
          </div>
        </section>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები (თავისი თეთრი ბარათი).
          ⚠️ `<form>`-ის **გარეთაა**: არსებულ ჩანაწერზე ბარათი თვითონ ინახავს
          თავს (მნიშვნელობები ცალკე ცხრილშია), ახალზე — მონახაზია და ჩანაწერთან
          ერთად ინახება; მის ველში Enter-მა ჩანაწერი არ უნდა შეინახოს. */}
      <CustomFieldsCard
        module={type}
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {/* ⚠️ ღილაკების რიგი ბოლოშია, როგორც §26-მდე — `<form>`-ის გარეთ
          (დამატებითი ველების ქვემოთ), ამიტომ „შენახვა" ფორმას `form="…"`-ით უშვებს */}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="submit" form={FORM_ID} disabled={mut.isPending}>
          {mut.isPending && <Loader2 className="size-4 animate-spin" />}
          {mut.isPending ? t('actions.saving') : t('actions.save')}
        </Button>
        {editing && (
          <Button
            type="button"
            variant="outline"
            onClick={() => resyncMut.mutate()}
            disabled={resyncMut.isPending}
          >
            {resyncMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
            {t('detail.sync')}
          </Button>
        )}
        <Link to={backTo} className={buttonVariants({ variant: 'outline' })}>
          {t('actions.cancel')}
        </Link>
      </div>
    </PageContainer>
  )
}
