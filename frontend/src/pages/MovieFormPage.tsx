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
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { DurationInput } from '@/components/ui/duration-input'
import { Textarea } from '@/components/ui/textarea'
import { FieldLabel, joinHints } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
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

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'media-form'

const EMPTY = {
  title_ka: '',
  title_en: '',
  year: '',
  imdb_id: '',
  ge_url: '',
  trailer_url: '',
  description_ka: '',
  description_en: '',
  rating: '',
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
      rating: m.rating ?? '',
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
    if (form.rating) fd.append('rating', form.rating)
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
      rating: d.rating != null ? String(d.rating) : f.rating,
      description_en: d.description_en ?? f.description_en,
      description_ka: d.description_ka ?? f.description_ka,
      genres: d.genres
        .map((n) => nameToSlug.get(n.toLowerCase()))
        .filter((s): s is string => Boolean(s)),
    }))
    if (d.poster) setPreview(d.poster)
  }

  const pickMut = useMutation({
    mutationFn: (tmdbId: number) => lookupDraft({ tmdb_id: tmdbId }, type),
    onSuccess: (d) => {
      setCandidates([])
      setLookupErr(null)
      fillFromDraft(d)
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setLookupErr(e?.response?.data?.message ?? tm('lookupNotFound'))
    },
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
    onError: (e: { response?: { data?: { message?: string } } }) => {
      setLookupErr(e?.response?.data?.message ?? tm('lookupNotFound'))
    },
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
        rating: mv.rating != null ? String(mv.rating) : f.rating,
        description_ka: mv.description_ka ?? f.description_ka,
        description_en: mv.description_en ?? f.description_en,
        genres: mv.genres.map((g) => g.slug),
      }))
      if (mv.poster) {
        setPreview(mv.poster)
        setRemovePoster(false)
      }
    },
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

        {/* --- §26 — პოსტერი ზემოთაა, სათაურთან და აღწერასთან ერთად --- */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('poster') && (
              <>
                <FieldLabel required={fields.required('poster')} hint={fields.hint('poster')}>
                  {fields.label('poster')}
                </FieldLabel>
                <PosterUploader
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
              </>
            )
          }
        >
          {/* ⚠️ სათაური `locked`-ია (§6.5): ერთი ენა ყოველთვის სავალდებულოა.
              ⚠️ **`shows()` მაინც ისმის (Tasks §4.5)** — ჩაკეტვა ახლა
              სუპერ-ადმინს ცხადად ეხსნება, ე.ი. „აზრი არ აქვს" აღარ მართლდება:
              ჩამრთველი, რომელიც ფორმაზე არაფერს ცვლის, ღილაკის არარსებობაზე
              უარესია. ⚠️ ენა მხოლოდ იმას წყვეტს, რომელი `Input` დაიხატება —
              თარგმანადი შიგთავსი ინტერფეისის ენაზეა. */}
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
              value={i18n.language === 'ka' ? form.description_ka : form.description_en}
              placeholder={fields.placeholder('description')}
              onChange={(e) => set(i18n.language === 'ka' ? 'description_ka' : 'description_en', e.target.value)}
            />
          </FormField>

          <FormField size="half" {...fields.field('year')} htmlFor="m-year" error={errors.year?.[0]}>
            <Input
              id="m-year"
              type="number"
              value={form.year}
              placeholder={fields.placeholder('year')}
              onChange={(e) => set('year', e.target.value)}
            />
          </FormField>

          <FormField size="half" {...fields.field('rating')} htmlFor="m-rating" error={errors.rating?.[0]}>
            <Input
              id="m-rating"
              type="number"
              step="0.1"
              min="0"
              max="10"
              placeholder={fields.placeholder('rating')}
              value={form.rating}
              onChange={(e) => set('rating', e.target.value)}
            />
          </FormField>
        </FormSection>

        {/* --- კლასიფიკაცია: ჟანრები, სტატუსი, რჩეული --- */}
        <FormSection title={t('form.sections.classification')}>
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

          <FormField size="half" {...fields.field('status')} error={errors.status?.[0]}>
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
                    'cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium transition-colors',
                    form.status === s.key ? STATUS_ACTIVE[statusTone(s)] : STATUS_INACTIVE[statusTone(s)],
                  )}
                >
                  {statusName(s, lang)}
                </button>
              ))}
            </div>
          </FormField>

          <FormField size="half" {...fields.field('is_favorite')} htmlFor="fav">
            <div className="flex h-10 items-center">
              <Switch id="fav" checked={form.is_favorite} onCheckedChange={(v) => set('is_favorite', v)} />
            </div>
          </FormField>
        </FormSection>

        {/* --- დეტალები: ხანგრძლივობა, ბმულები --- */}
        <FormSection title={t('form.sections.details')}>
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
            <Input
              id="m-ge-url"
              value={form.ge_url}
              onChange={(e) => set('ge_url', e.target.value)}
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
            <Input
              id="m-trailer"
              value={form.trailer_url}
              onChange={(e) => set('trailer_url', e.target.value)}
              placeholder={fields.placeholder('trailer_url') ?? 'https://www.youtube.com/watch?v=…'}
            />
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები. ⚠️ `<form>`-ის **გარეთაა**:
          არსებულ ჩანაწერზე ბარათი თვითონ ინახავს თავს (მნიშვნელობები ცალკე
          ცხრილშია), ახალზე — მონახაზია და ჩანაწერთან ერთად ინახება. */}
      <CustomFieldsCard
        module={type}
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      {/* ⚠️ §26.1 — მიმაგრებული ზოლი გვერდზეც: ფანჯრის ქვედა კიდეზე */}
      <FormFooter page formId={FORM_ID} onCancel={() => nav(backTo)} saving={mut.isPending}>
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
      </FormFooter>
    </PageContainer>
  )
}
