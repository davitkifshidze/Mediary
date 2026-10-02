import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2, Plus, Store, X } from 'lucide-react'
import {
  createBoardGame,
  fetchBggCandidates,
  fetchBggDraft,
  fetchShopOffers,
  updateBoardGame,
  type BggCandidate,
  type BoardGame,
  type BoardGameGenre,
  type BoardGameInput,
  type BoardGameLink,
  type ShopOffer,
  type ShopSource,
} from '@/api/boardGames'
import { storageUrl } from '@/lib/api'
import { useModuleFields } from '@/lib/fields'
import { errorMessage, fieldErrors, isApiCode } from '@/lib/errors'
import { hiddenPicks, pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BoardGameGenreDialog } from '@/components/BoardGameGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DurationInput } from '@/components/ui/duration-input'
import { FieldLabel } from '@/components/ui/field-label'
import { FORM_TEXT_ROWS, FormField, FormFooter, FormSection } from '@/components/ui/form-layout'
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
import { StarRating } from '@/components/ui/star-rating'
import { useRecordExtras } from '@/lib/customFieldDraft'

/* ============================================================
   ბორდგეიმის ფორმა (Tasks §14).

   „სწრაფი შევსება" BoardGameGeek-იდან, TMDB-ის ნაკადით: ჯერ კანდიდატები,
   მერე არჩეულის დრაფტი. ავტომატურად არაფერი ემთხვევა და დრაფტი
   **მხოლოდ ცარიელ ველებს** ავსებს.

   ⚠️ BGG Cloudflare-ის challenge-ის უკან დგას და სერვერიდან შეიძლება
   საერთოდ არ გაიხსნას — ასეთ დროს ცხადად ვწერთ („წყარო მიუწვდომელია"),
   და არა „ვერაფერი მოიძებნა".
   ============================================================ */

/** ⚠️ ზოლი `<form>`-ის გარეთაა და ფორმას `form="…"`-ით უშვებს */
const FORM_ID = 'board-game-form'

export function BoardGameForm({
  game,
  genres,
  onClose,
  onSaved,
}: {
  game: BoardGame | null
  genres: BoardGameGenre[]
  onClose: () => void
  onSaved: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  // §6 — რომელი არჩევითი ველი ჩანს ამ ფორმაზე
  const fields = useModuleFields('board_game')

  const [form, setForm] = useState({
    title: game?.title ?? '',
    description: game?.description ?? '',
    year: game?.year ? String(game.year) : '',
    designer: game?.designer ?? '',
    publisher: game?.publisher ?? '',
    genreId: game?.genre_id ? String(game.genre_id) : '',
    players_min: game?.players_min ? String(game.players_min) : '',
    players_max: game?.players_max ? String(game.players_max) : '',
    age_min: game?.age_min ? String(game.age_min) : '',
    playtime_min: game?.playtime_min ? String(game.playtime_min) : '',
    playtime_max: game?.playtime_max ? String(game.playtime_max) : '',
    complexity: game?.complexity ? String(game.complexity) : '',
    bggId: game?.bgg_id ? String(game.bgg_id) : '',
    bggRating: game?.bgg_rating ? String(game.bgg_rating) : '',
    // Tasks §25.4 — „ჩემი ქულა" ბრუნდება: რიცხვი ან `null` (`RatingSelect`)
    rating: game?.rating ?? null,
    // ⚠️ ცარიელით იწყება — არჩევანი მომხმარებლისაა, ნაგულისხმები აღარ იწერება
  })
  /* ⚠️ სტრიქონს **საკუთარი გასაღები** აქვს და არა ინდექსი (Tasks BUG-11):
     ინდექსზე შუა სტრიქონის წაშლა ფოკუსს, კარეტსა და Radix `Select`-ის ღია
     მდგომარეობას მეზობელ ბმულზე გადაიტანდა. `unkeyRows()` მას payload-ში ჭრის. */
  const [links, setLinks] = useState<Keyed<BoardGameLink>[]>(() => keyRows(game?.links ?? []))
  const [bggImageUrl, setBggImageUrl] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(storageUrl(game?.image))
  const [removeImage, setRemoveImage] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGenre, setNewGenre] = useState(false)
  const qc = useQueryClient()
  // §26.5 — დამატებითი ველები ახალ თამაშზე; ჩავარდნისას შექმნილი რჩება
  const extras = useRecordExtras('board_game', game)

  /* ---------- სწრაფი შევსება BGG-დან ---------- */

  const [lookupQuery, setLookupQuery] = useState('')
  const [candidates, setCandidates] = useState<BggCandidate[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const lookup = useMutation({
    mutationFn: () => fetchBggCandidates(lookupQuery.trim()),
    onSuccess: (results) => {
      setUnavailable(false)
      setCandidates(results)
    },
    onError: (e) => {
      // 503 = წყარო დაბლოკილია; დანარჩენი ჩვეულებრივი შეცდომაა
      const blocked = isApiCode(e, 'bgg_unavailable')
      setUnavailable(blocked)
      setCandidates(blocked ? [] : null)
      if (!blocked) toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const pick = useMutation({
    /** ძებნის რიგი უკვე გამდიდრებულია; დეტალები მხოლოდ აღწერას ამატებს */
    mutationFn: async (candidate: BggCandidate) => {
      try {
        const draft = await fetchBggDraft(candidate.bgg_id)
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

  /* ---------- ქართული მაღაზიები (§7.2) ---------- */

  /**
   * ⚠️ **სქრეიპინგია და არა API.** ამიტომ პასუხი ორნაწილიანია: `offers` — რაც
   * ვიპოვეთ, `sources` — რომელი მაღაზია **გაიხსნა** საერთოდ. მარკაპის
   * ცვლილებაზე ჩუმად ცარიელი სია მოვა („ფასი უცნობია"), 500 არასდროს.
   */
  const [offers, setOffers] = useState<ShopOffer[] | null>(null)
  const [shopSources, setShopSources] = useState<ShopSource[]>([])

  const shopLookup = useMutation({
    mutationFn: (query: string) => fetchShopOffers(query),
    onSuccess: ({ offers: found, sources }) => {
      setOffers(found)
      setShopSources(sources)
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** მაღაზიის შეთავაზება → `links[]`. ⚠️ ფასი **ბმულს** ეკუთვნის და არა ჩანაწერს */
  const addOffer = (offer: ShopOffer) =>
    setLinks((all) =>
      all.some((l) => l.url === offer.url)
        ? all
        : [
            ...all,
            keyRow({
              label: offer.shop_name,
              url: offer.url,
              price: offer.price,
              currency: offer.currency ?? 'GEL',
            }),
          ],
    )

  /** ფასი ვალუტით; `null` = მაღაზიაზე ვერ ამოვიკითხეთ */
  const priceText = (value: number | null, currency: string | null) =>
    value === null ? t('boardGames.shopSearch.priceUnknown') : `${value} ${currency ?? ''}`.trim()

  /**
   * ერთი ღილაკი — ორივე წყარო. §7.2: „**დამატებისას ძებნაზე** უნდა მოვიდეს
   * შესაბამისი საიტის ლინკები". BGG და მაღაზიები ერთმანეთს არ ელოდება:
   * BGG ამ ქსელიდან ხშირად საერთოდ არ იხსნება, მაღაზიები კი მუშაობს.
   */
  const searchAll = () => {
    const query = lookupQuery.trim()
    if (!query) return
    lookup.mutate()
    if (fields.shows('links')) shopLookup.mutate(query)
  }

  /** ⚠️ **მხოლოდ ცარიელი ველები** — ხელით შეყვანილს არასდროს ვაბათილებთ */
  const applyDraft = (draft: BggCandidate) => {
    setForm((f) => ({
      ...f,
      title: f.title || (draft.title ?? ''),
      description: f.description || (draft.description ?? ''),
      year: f.year || (draft.year ? String(draft.year) : ''),
      designer: f.designer || (draft.designer ?? ''),
      publisher: f.publisher || (draft.publisher ?? ''),
      players_min: f.players_min || (draft.players_min ? String(draft.players_min) : ''),
      players_max: f.players_max || (draft.players_max ? String(draft.players_max) : ''),
      age_min: f.age_min || (draft.age_min ? String(draft.age_min) : ''),
      playtime_min: f.playtime_min || (draft.playtime_min ? String(draft.playtime_min) : ''),
      playtime_max: f.playtime_max || (draft.playtime_max ? String(draft.playtime_max) : ''),
      complexity: f.complexity || (draft.complexity ? String(draft.complexity) : ''),
      bggId: f.bggId || String(draft.bgg_id),
      bggRating: f.bggRating || (draft.bgg_rating ? String(draft.bgg_rating) : ''),
    }))
    // ფოტო შენახვისას ჩამოიტვირთება; **კვოტაში არ ითვლება** (19.4/B)
    if (draft.image_url && !imagePreview) {
      setBggImageUrl(draft.image_url)
      setImagePreview(draft.image_url)
    }
  }

  /* ---------- შენახვა ---------- */

  const save = useMutation({
    mutationFn: (input: BoardGameInput) =>
      extras.current ? updateBoardGame(extras.current.id, input) : createBoardGame(input),
    onSuccess: async (saved) => {
      const done = await extras.afterSave(saved)
      if (!done.ok) {
        qc.invalidateQueries({ queryKey: ['board-games'] })
        toast({ title: done.message, variant: 'error' })

        return
      }

      toast({ title: t('boardGames.saved'), variant: 'success' })
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

    /* ⚠️ ჟანრი სავალდებულოა (სტატუსი Tasks §12-ით ამოვიდა) — შემოწმება
       ქსელამდე, რათა ველი იმავე წამს გაწითლდეს. */
    const picked = pickErrors(
      { genre_id: form.genreId },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)
      warnHidden(Object.keys(picked))

      return
    }

    setErrors({})

    save.mutate({
      title: form.title,
      description: form.description || null,
      year: num(form.year),
      designer: form.designer || null,
      publisher: form.publisher || null,
      genre_id: form.genreId ? Number(form.genreId) : null,
      players_min: num(form.players_min),
      players_max: num(form.players_max),
      age_min: num(form.age_min),
      playtime_min: num(form.playtime_min),
      playtime_max: num(form.playtime_max),
      complexity: num(form.complexity),
      bgg_id: num(form.bggId),
      bgg_rating: num(form.bggRating),
      // Tasks §25.4 — ფორმაზე ისევ ჩანს, ე.ი. `null` („გარეშე") ქულას ასუფთავებს
      rating: form.rating,
      links: unkeyRows(links.filter((l) => l.url.trim())),
      bgg_image_url: bggImageUrl,
      image,
      remove_image: removeImage,
    })
  }

  return (
    <ModalShell title={t(game ? 'boardGames.edit' : 'boardGames.add')} onClose={onClose} wide>
      <form id={FORM_ID} onSubmit={submit} className="mt-4 space-y-6">
        {/* ---------- §26.2 — სწრაფი შევსება: BGG + ქართული მაღაზიები ერთი ღილაკით ---------- */}
        <QuickFill title={t('boardGames.lookup')} hint={t('boardGames.lookupHint')} htmlFor="bg-lookup">
          <QuickFillSearch
            id="bg-lookup"
            value={lookupQuery}
            onChange={setLookupQuery}
            onSearch={searchAll}
            busy={lookup.isPending || shopLookup.isPending}
            placeholder={t('boardGames.lookupPlaceholder')}
            buttonLabel={t('boardGames.lookupSearch')}
          />

          {/* ⚠️ „წყარო მიუწვდომელია" ცალკე მდგომარეობაა და არა ცარიელი სია */}
          {unavailable && <QuickFillMessage tone="warn">{t('boardGames.lookupUnavailable')}</QuickFillMessage>}

          {!unavailable && candidates && !candidates.length && (
            <QuickFillMessage>{t('boardGames.lookupEmpty')}</QuickFillMessage>
          )}

          {!unavailable && candidates && candidates.length > 0 && (
            <QuickFillResults>
              {candidates.map((candidate) => (
                <QuickFillCandidate
                  key={candidate.bgg_id}
                  shape="square"
                  image={candidate.image_url}
                  title={candidate.title ?? '—'}
                  meta={[candidate.year, candidate.designer, candidate.bgg_rating ? `BGG ${candidate.bgg_rating}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                  disabled={pick.isPending}
                  onPick={() => pick.mutate(candidate)}
                />
              ))}
            </QuickFillResults>
          )}

          {/* ---------- ქართული მაღაზიები (§7.2) ---------- */}
          {fields.shows('links') && (offers !== null || shopLookup.isPending) && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Store className="size-3.5" />
                {t('boardGames.shopSearch.title')}
              </p>

              {/* ⚠️ „მაღაზია არ გაიხსნა" ≠ „ვერაფერი იპოვა" — ცალკე ვწერთ */}
              {shopSources.some((source) => !source.ok) && (
                <QuickFillMessage tone="warn">
                  {t('boardGames.shopSearch.unavailable', {
                    shops: shopSources
                      .filter((source) => !source.ok)
                      .map((source) => source.name)
                      .join(', '),
                  })}
                </QuickFillMessage>
              )}

              {offers !== null && !offers.length && !shopLookup.isPending && (
                <QuickFillMessage>{t('boardGames.shopSearch.empty')}</QuickFillMessage>
              )}

              <div className="mt-2 space-y-1.5">
                {(offers ?? []).map((offer) => {
                  const added = links.some((l) => l.url === offer.url)
                  return (
                    <div
                      key={`${offer.shop}-${offer.url}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-2"
                    >
                      {offer.image ? (
                        <img src={offer.image} alt="" className="size-10 shrink-0 rounded object-cover" />
                      ) : (
                        <span className="size-10 shrink-0 rounded bg-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <a
                          href={offer.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm hover:text-primary"
                        >
                          {offer.title}
                        </a>
                        <span className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                          <span className="rounded bg-muted px-1.5 py-0.5">{offer.shop_name}</span>
                          <span className={offer.price === null ? 'italic' : 'font-medium text-foreground'}>
                            {priceText(offer.price, offer.currency)}
                          </span>
                          {offer.old_price !== null && (
                            <span className="line-through">{priceText(offer.old_price, offer.currency)}</span>
                          )}
                          {offer.in_stock === false && (
                            <span className="text-destructive">{t('boardGames.shopSearch.outOfStock')}</span>
                          )}
                        </span>
                      </span>
                      <Button
                        type="button"
                        variant={added ? 'ghost' : 'outline'}
                        size="sm"
                        className="shrink-0"
                        disabled={added}
                        onClick={() => addOffer(offer)}
                      >
                        {added ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
                        {t(added ? 'boardGames.shopSearch.added' : 'boardGames.shopSearch.add')}
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </QuickFill>

        {/* ---------- §26 — ფოტო ზემოთაა, სახელთან, ავტორებთან და აღწერასთან ერთად ---------- */}
        <FormSection
          title={t('form.sections.basic')}
          media={
            fields.shows('image') && (
              <>
                <FieldLabel required={fields.required('image')} hint={fields.hint('image')}>
                  {fields.label('image')}
                </FieldLabel>
                <PosterUploader
                  variant="wide"
                  hint={t('boardGames.imageHint')}
                  preview={imagePreview}
                  onSelect={(file) => {
                    setImage(file)
                    setBggImageUrl(null)
                    setRemoveImage(false)
                    setImagePreview(URL.createObjectURL(file))
                  }}
                  onClear={() => {
                    setImage(null)
                    setBggImageUrl(null)
                    setImagePreview(null)
                    setRemoveImage(true)
                  }}
                />
              </>
            )
          }
        >
          {/* ⚠️ სათაური `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება;
              ჩაკეტვის მოხსნა ცხადი ქმედებაა (§4), ამიტომ `shows()` აქაც ისმის. */}
          <FormField {...fields.field('title')} required htmlFor="bg-title" error={errors.title}>
            <Input
              id="bg-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('designer')} htmlFor="bg-designer">
            <Input
              id="bg-designer"
              placeholder={fields.placeholder('designer')}
              value={form.designer}
              onChange={(e) => setForm((f) => ({ ...f, designer: e.target.value }))}
            />
          </FormField>

          <FormField size="half" {...fields.field('publisher')} htmlFor="bg-publisher">
            <Input
              id="bg-publisher"
              placeholder={fields.placeholder('publisher')}
              value={form.publisher}
              onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
            />
          </FormField>

          <FormField {...fields.field('description')} htmlFor="bg-desc">
            <Textarea
              id="bg-desc"
              rows={FORM_TEXT_ROWS}
              autoGrow
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </FormField>
        </FormSection>

        {/* ---------- კლასიფიკაცია: ჟანრი · ქულა ---------- */}
        <FormSection title={t('form.sections.classification')}>
          {/* ჟანრი — per-user ლექსიკონიდან, გვერდით „ახალი ჟანრი" */}
          <FormField size="half" {...fields.field('genre')} htmlFor="bg-genre" error={errors.genre_id}>
            <div className="flex gap-1">
              <Select value={form.genreId} onValueChange={(v) => setForm((f) => ({ ...f, genreId: v }))}>
                <SelectTrigger id="bg-genre" className={errors.genre_id ? 'border-destructive' : undefined}>
                  <SelectValue placeholder={t('validation.choose')} />
                </SelectTrigger>
                <SelectContent>
                  {genres.map((genre) => (
                    <SelectItem key={genre.id} value={String(genre.id)}>
                      {dictionaryName(genre, lang)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                onClick={() => setNewGenre(true)}
                title={t('boardGameGenres.add')}
                aria-label={t('boardGameGenres.add')}
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </FormField>

          {/* Tasks §25.4 — „ჩემი ქულა"; BGG-ის ქულა (`bgg_rating`) ცალკეა და წყაროდან მოდის */}
          <FormField size="half" {...fields.field('rating')} htmlFor="bg-rating" error={errors.rating}>
            <StarRating
              id="bg-rating"
              value={form.rating}
              invalid={!!errors.rating}
              onChange={(rating) => setForm((f) => ({ ...f, rating }))}
            />
          </FormField>
        </FormSection>

        {/* ---------- დეტალები: წელი · ასაკი · სირთულე · BGG + მოთამაშეები/დრო + მაღაზიები ---------- */}
        <FormSection title={t('form.sections.details')}>
          <FormField size="quarter" {...fields.field('year')} htmlFor="bg-year">
            <Input
              id="bg-year"
              type="number"
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </FormField>

          <FormField size="quarter" {...fields.field('age')} htmlFor="bg-age">
            <Input
              id="bg-age"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.age_min}
              onChange={(e) => setForm((f) => ({ ...f, age_min: e.target.value }))}
            />
          </FormField>

          <FormField size="quarter" {...fields.field('complexity')} htmlFor="bg-complexity">
            <Input
              id="bg-complexity"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={1}
              max={5}
              placeholder={fields.placeholder('complexity')}
              value={form.complexity}
              onChange={(e) => setForm((f) => ({ ...f, complexity: e.target.value }))}
            />
          </FormField>

          <FormField size="quarter" {...fields.field('bgg_id')} htmlFor="bg-id" error={errors.bgg_id}>
            <Input
              id="bg-id"
              type="number"
              inputMode="numeric"
              value={form.bggId}
              onChange={(e) => setForm((f) => ({ ...f, bggId: e.target.value }))}
            />
          </FormField>

          {/* მოთამაშეები: მინ – მაქს */}
          <FormField size="half" {...fields.field('players')} htmlFor="bg-players" error={errors.players_max}>
            <div className="flex items-center gap-1.5">
              <Input
                id="bg-players"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t('boardGames.min')}
                value={form.players_min}
                onChange={(e) => setForm((f) => ({ ...f, players_min: e.target.value }))}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                placeholder={t('boardGames.max')}
                aria-label={t('boardGames.max')}
                value={form.players_max}
                onChange={(e) => setForm((f) => ({ ...f, players_max: e.target.value }))}
              />
            </div>
          </FormField>

          {/* §2.5 — საათი+წუთი ერთი კომპონენტით; სვეტი ისევ **წუთებია** */}
          <FormField size="half" {...fields.field('playtime')} error={errors.playtime_max}>
            <div className="space-y-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">{t('boardGames.min')}</span>
                <DurationInput
                  unit="minutes"
                  value={form.playtime_min ? Number(form.playtime_min) : null}
                  onChange={(v) => setForm((f) => ({ ...f, playtime_min: v == null ? '' : String(v) }))}
                />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">{t('boardGames.max')}</span>
                <DurationInput
                  unit="minutes"
                  value={form.playtime_max ? Number(form.playtime_max) : null}
                  onChange={(v) => setForm((f) => ({ ...f, playtime_max: v == null ? '' : String(v) }))}
                />
              </span>
            </div>
          </FormField>

          {/* მაღაზიები: ბმული + ფასი (§14) */}
          <FormField {...fields.field('links')}>
            <div className="space-y-1.5">
              {links.map((link, i) => (
                <div key={link._key} className="flex gap-1.5">
                  <Input
                    className="w-24 shrink-0"
                    placeholder={t('books.linkLabel')}
                    value={link.label ?? ''}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                    }
                  />
                  <Input
                    placeholder="https://…"
                    value={link.url}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))
                    }
                  />
                  <Input
                    className="w-20 shrink-0"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={0}
                    placeholder={t('boardGames.price')}
                    value={link.price ?? ''}
                    onChange={(e) =>
                      setLinks((all) =>
                        all.map((x, j) =>
                          j === i ? { ...x, price: e.target.value === '' ? null : Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    className="w-16 shrink-0"
                    placeholder="GEL"
                    value={link.currency ?? ''}
                    onChange={(e) =>
                      setLinks((all) => all.map((x, j) => (j === i ? { ...x, currency: e.target.value } : x)))
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
              <div className="flex flex-wrap gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setLinks((all) => [...all, keyRow({ label: '', url: '', price: null, currency: '' })])}
                >
                  <Plus className="size-3.5" />
                  {t('boardGames.addShop')}
                </Button>
                {/* რედაქტირებისას ზედა საძიებო ველი ცარიელია — აქ სახელით ვეძებთ */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!form.title.trim() || shopLookup.isPending}
                  onClick={() => {
                    setLookupQuery((q) => q || form.title.trim())
                    shopLookup.mutate(form.title.trim())
                  }}
                >
                  {shopLookup.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Store className="size-3.5" />}
                  {t('boardGames.shopSearch.search')}
                </Button>
              </div>
            </div>
          </FormField>
        </FormSection>
      </form>

      {/* §6 ფაზა 3 → §26.5 — დამატებითი ველები; ახალ თამაშზე მონახაზი */}
      <CustomFieldsCard
        module="board_game"
        recordId={extras.current?.id ?? null}
        draft={extras.draft}
        className="mt-6"
      />

      <FormFooter formId={FORM_ID} onCancel={onClose} saving={save.isPending} />

      {/* სწრაფი „ახალი ჟანრი" — შენახვისთანავე select-ში ირჩევა */}
      {newGenre && (
        <BoardGameGenreDialog
          genre={null}
          onClose={() => setNewGenre(false)}
          onSaved={(saved) => setForm((f) => ({ ...f, genreId: String(saved.id) }))}
        />
      )}
    </ModalShell>
  )
}
