import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Loader2, RefreshCw, Wand2 } from 'lucide-react'
import {
  fetchGenres,
  lookupCandidates,
  lookupDraft,
  mediaApi,
  type Candidate,
  type LookupDraft,
} from '@/api/media'
import { useModuleFields } from '@/lib/fields'
import { mediaOf, type MediaType } from '@/lib/media'
import { useSettings } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/feedback'
import { Input } from '@/components/ui/input'
import { DurationInput } from '@/components/ui/duration-input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { FieldLabel } from '@/components/ui/field-label'
import { Switch } from '@/components/ui/switch'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { PosterImage } from '@/components/PosterImage'
import { PosterUploader } from '@/components/PosterUploader'
import { PageContainer } from '@/components/ui/page'
import { GenreSelect } from '@/components/GenreSelect'
import { cn } from '@/lib/utils'
import { STATUS_ACTIVE, STATUS_INACTIVE } from '@/lib/statusStyles'
import { statusName, statusTone, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'

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

  const mut = useMutation({
    mutationFn: async () => {
      const saved = editing
        ? await api.update(Number(id), buildFormData())
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
    onSuccess: (m) => {
      qc.invalidateQueries({ queryKey: [type] })
      qc.invalidateQueries({ queryKey: ['genres'] })
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

  const err = (field: string) =>
    errors[field] ? <p className="mt-1 text-xs text-destructive">{errors[field][0]}</p> : null

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
          {editing
            ? type === 'series'
              ? t('form.editTitleSeries')
              : t('form.editTitle')
            : type === 'series'
              ? t('form.addTitleSeries')
              : t('form.addTitle')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {editing ? t('form.editSubtitle') : t('form.addSubtitle')}
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setErrors({})
          mut.mutate()
        }}
        className="space-y-6"
      >
        {/* --- სწრაფი შევსება (lookup) --- */}
        <div className="rounded-2xl border border-dashed border-primary/50 bg-secondary/40 p-4 sm:p-5">
          <Label className="flex items-center gap-1.5">
            <Wand2 className="size-3.5 text-primary" />
            {t('form.lookup')}
          </Label>
          <div className="flex gap-2">
            <Input
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder={tm('lookupPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (lookupInput.trim()) candidatesMut.mutate()
                }
              }}
            />
            <Button
              type="button"
              onClick={() => candidatesMut.mutate()}
              disabled={!lookupInput.trim() || lookupBusy}
            >
              {lookupBusy ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              {t('form.lookupBtn')}
            </Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{t('form.lookupHint')}</p>
          {lookupErr && <p className="mt-1 text-xs text-destructive">{lookupErr}</p>}

          {candidates.length > 0 && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-muted-foreground">{tm('lookupPick')}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {candidates.map((c) => (
                  <button
                    key={c.tmdb_id}
                    type="button"
                    onClick={() => pickMut.mutate(c.tmdb_id)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card p-2 text-left transition-colors hover:border-primary"
                  >
                    <PosterImage
                      src={c.poster}
                      alt={c.title_en}
                      className="h-16 w-11 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.title_en}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.year ?? '—'}
                        {c.rating ? ` · ★ ${c.rating}` : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* --- თარგმანადი შიგთავსი (ka / en გვერდიგვერდ) --- */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-4 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('detail.content')} · {i18n.language === 'ka' ? 'ქართული' : 'English'}
          </div>
          {/* ⚠️ სათაური `locked`-ია (§6.5): ერთი ენა ყოველთვის სავალდებულოა,
              ე.ი. `fields.shows('title')`-ს შემოწმებას აზრი არ აქვს — backend
              მას მაინც `true`-ს დაუბრუნებს. */}
          {i18n.language === 'ka' ? (
            <>
              <FieldLabel required hint={t('form.requiredEitherLang')}>
                {fields.label('title')}
              </FieldLabel>
              <Input
                value={form.title_ka}
                placeholder={fields.placeholder('title')}
                onChange={(e) => set('title_ka', e.target.value)}
              />
              {fields.shows('description') && (
                <>
                  <FieldLabel
                    className="mt-4"
                    required={fields.required('description')}
                    hint={fields.hint('description')}
                  >
                    {fields.label('description')}
                  </FieldLabel>
                  <Textarea
                    value={form.description_ka}
                    placeholder={fields.placeholder('description')}
                    onChange={(e) => set('description_ka', e.target.value)}
                  />
                </>
              )}
            </>
          ) : (
            <>
              <FieldLabel required hint={t('form.requiredEitherLang')}>
                {fields.label('title')}
              </FieldLabel>
              <Input
                value={form.title_en}
                placeholder={fields.placeholder('title')}
                onChange={(e) => set('title_en', e.target.value)}
              />
              {err('title_en')}
              {fields.shows('description') && (
                <>
                  <FieldLabel
                    className="mt-4"
                    required={fields.required('description')}
                    hint={fields.hint('description')}
                  >
                    {fields.label('description')}
                  </FieldLabel>
                  <Textarea
                    value={form.description_en}
                    placeholder={fields.placeholder('description')}
                    onChange={(e) => set('description_en', e.target.value)}
                  />
                </>
              )}
            </>
          )}
        </div>

        {/* --- სტატიკური ველები --- */}
        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('form.details')}
          </div>
          <div className="flex flex-col gap-5 sm:flex-row">
            <div className={fields.shows('poster') ? 'shrink-0' : 'hidden'}>
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
            </div>

            <div className="grid flex-1 grid-cols-2 gap-4">
              {fields.shows('year') && (
                <div>
                  <FieldLabel required={fields.required('year')} hint={fields.hint('year')}>
                    {fields.label('year')}
                  </FieldLabel>
                  <Input
                    type="number"
                    value={form.year}
                    placeholder={fields.placeholder('year')}
                    onChange={(e) => set('year', e.target.value)}
                  />
                  {err('year')}
                </div>
              )}
              {fields.shows('rating') && (
                <div>
                  <FieldLabel required={fields.required('rating')} hint={fields.hint('rating')}>
                    {fields.label('rating')}
                  </FieldLabel>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    placeholder={fields.placeholder('rating')}
                    value={form.rating}
                    onChange={(e) => set('rating', e.target.value)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* §2.5 — ხანგრძლივობა ხელით; ჩვეულებრივ TMDB-იდან მოდის */}
          {fields.shows('runtime') && (
            <div>
              <FieldLabel required={fields.required('runtime')} hint={fields.hint('runtime')}>
                {fields.label('runtime')}
              </FieldLabel>
              <DurationInput
                unit="minutes"
                value={form.runtime ? Number(form.runtime) : null}
                onChange={(v) => set('runtime', v == null ? '' : String(v))}
              />
              {err('runtime')}
            </div>
          )}

          {fields.shows('ge_url') && (
            <div>
              <FieldLabel required={fields.required('ge_url')} hint={fields.hint('ge_url')}>
                {fields.label('ge_url')}
              </FieldLabel>
              <Input
                value={form.ge_url}
                onChange={(e) => set('ge_url', e.target.value)}
                placeholder={fields.placeholder('ge_url') ?? 'https://…'}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('form.ge_urlHint')}</p>
              {err('ge_url')}
            </div>
          )}

          {/* ტრეილერი (Tasks 9) — ცარიელზე სინქრონი TMDB-დან თვითონ მოიტანს */}
          {fields.shows('trailer_url') && (
            <div>
              <FieldLabel required={fields.required('trailer_url')} hint={fields.hint('trailer_url')}>
                {fields.label('trailer_url')}
              </FieldLabel>
              <Input
                value={form.trailer_url}
                onChange={(e) => set('trailer_url', e.target.value)}
                placeholder={fields.placeholder('trailer_url') ?? 'https://www.youtube.com/watch?v=…'}
              />
              <p className="mt-1 text-xs text-muted-foreground">{t('form.trailer_urlHint')}</p>
              {err('trailer_url')}
            </div>
          )}

          <div className={fields.shows('genres') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('genres')} hint={fields.hint('genres')}>
              {fields.label('genres')}
            </FieldLabel>
            <GenreSelect
              genres={genresQ.data ?? []}
              value={form.genres}
              onChange={(v) => setForm((f) => ({ ...f, genres: v }))}
            />
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <div className={fields.shows('status') ? undefined : 'hidden'}>
              <FieldLabel required={fields.required('status')} hint={fields.hint('status')}>
                {fields.label('status')}
              </FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {/* §6.4 — სია ლექსიკონიდან; ცარიელზე backend ნაგულისხმევს დაადებს */}
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
            </div>
            {fields.shows('is_favorite') && (
              <div className="flex items-center gap-2 pt-6">
                <Switch id="fav" checked={form.is_favorite} onCheckedChange={(v) => set('is_favorite', v)} />
                <Label htmlFor="fav" className="mb-0 cursor-pointer text-sm">
                  {fields.label('is_favorite')}
                </Label>
              </div>
            )}
          </div>
        </div>

        {/* §6 ფაზა 3 — მორგებული ველები. ⚠️ ბარათი **თვითონ ინახავს თავს**
            (მნიშვნელობები ცალკე ცხრილშია), ამიტომ მისი ღილაკი `type="button"`-ია
            და ამ ფორმის submit-ს არ უშვებს. */}
        <CustomFieldsCard module={type} recordId={editing ? Number(id) : null} />

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mut.isPending}>
            {mut.isPending ? t('actions.saving') : t('actions.save')}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="outline"
              onClick={() => resyncMut.mutate()}
              disabled={resyncMut.isPending}
            >
              {resyncMut.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {t('detail.sync')}
            </Button>
          )}
          <Link
            to={backTo}
            className="inline-flex h-10 cursor-pointer items-center rounded-md border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            {t('actions.cancel')}
          </Link>
        </div>
      </form>
    </PageContainer>
  )
}
