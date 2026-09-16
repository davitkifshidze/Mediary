import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, Plus, Search, Store, X } from 'lucide-react'
import {
  BOARD_GAME_STATUSES,
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
import { pickErrors } from '@/lib/requiredPicks'
import { videoTypeName as dictionaryName } from '@/lib/display'
import { useContentLang } from '@/lib/settings'
import { BoardGameGenreDialog } from '@/components/BoardGameGenreDialog'
import { PosterUploader } from '@/components/PosterUploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DurationInput } from '@/components/ui/duration-input'
import { Label } from '@/components/ui/label'
import { FieldLabel } from '@/components/ui/field-label'
import { CustomFieldsCard } from '@/components/CustomFieldsCard'
import { ModalShell } from '@/components/ui/modal-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   ბორდგეიმის ფორმა (Tasks §14).

   „სწრაფი შევსება" BoardGameGeek-იდან, TMDB-ის ნაკადით: ჯერ კანდიდატები,
   მერე არჩეულის დრაფტი. ავტომატურად არაფერი ემთხვევა და დრაფტი
   **მხოლოდ ცარიელ ველებს** ავსებს.

   ⚠️ BGG Cloudflare-ის challenge-ის უკან დგას და სერვერიდან შეიძლება
   საერთოდ არ გაიხსნას — ასეთ დროს ცხადად ვწერთ („წყარო მიუწვდომელია"),
   და არა „ვერაფერი მოიძებნა".
   ============================================================ */

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
    // ⚠️ ცარიელით იწყება — არჩევანი მომხმარებლისაა, ნაგულისხმები აღარ იწერება
    status: game?.status ?? '',
  })
  const [links, setLinks] = useState<BoardGameLink[]>(game?.links ?? [])
  const [bggImageUrl, setBggImageUrl] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(storageUrl(game?.image))
  const [removeImage, setRemoveImage] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [newGenre, setNewGenre] = useState(false)

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
            {
              label: offer.shop_name,
              url: offer.url,
              price: offer.price,
              currency: offer.currency ?? 'GEL',
            },
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
      game ? updateBoardGame(game.id, input) : createBoardGame(input),
    onSuccess: () => {
      toast({ title: t('boardGames.saved'), variant: 'success' })
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

    /* ⚠️ სტატუსიც და ჟანრიც სავალდებულოა — შემოწმება ქსელამდე, რათა ველი
       იმავე წამს გაწითლდეს. გასაღებები backend-ის შეცდომებისაა, ე.ი. ცემა ერთია. */
    const picked = pickErrors(
      { status: form.status, genre_id: form.genreId },
      t('validation.pickOne'),
    )
    if (Object.keys(picked).length > 0) {
      setErrors(picked)

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
      // ⚠️ §5.2 — „ჩემი ქულა" ფორმიდან მოიხსნა და **საერთოდ აღარ იგზავნება**:
      // ცარიელი მნიშვნელობის გაგზავნა არსებულ ქულას ჩუმად წაშლიდა
      // ⚠️ ზემოთი დაცვა უკვე დაადგინა, რომ ცარიელი არ არის
      status: form.status as (typeof BOARD_GAME_STATUSES)[number],
      links: links.filter((l) => l.url.trim()),
      bgg_image_url: bggImageUrl,
      image,
      remove_image: removeImage,
    })
  }

  return (
    <ModalShell title={t(game ? 'boardGames.edit' : 'boardGames.add')} onClose={onClose} wide>
      <form onSubmit={submit} className="mt-4 space-y-4">
        {/* ---------- სწრაფი შევსება ---------- */}
        <div className="rounded-lg border border-border bg-card/50 p-3">
          <Label htmlFor="bg-lookup">{t('boardGames.lookup')}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="bg-lookup"
              placeholder={t('boardGames.lookupPlaceholder')}
              value={lookupQuery}
              onChange={(e) => setLookupQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  // ⚠️ ფორმის submit-ს ვაჩერებთ — Enter აქ „ძებნას" ნიშნავს
                  e.preventDefault()
                  if (lookupQuery.trim()) searchAll()
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={!lookupQuery.trim() || lookup.isPending || shopLookup.isPending}
              onClick={searchAll}
            >
              {lookup.isPending || shopLookup.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Search className="size-4" />
              )}
              {t('boardGames.lookupSearch')}
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('boardGames.lookupHint')}</p>

          {unavailable && (
            <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              {t('boardGames.lookupUnavailable')}
            </p>
          )}

          {!unavailable && candidates && (
            <div className="mt-3 space-y-1.5">
              {!candidates.length && (
                <p className="text-xs text-muted-foreground">{t('boardGames.lookupEmpty')}</p>
              )}
              {candidates.map((candidate) => (
                <button
                  key={candidate.bgg_id}
                  type="button"
                  disabled={pick.isPending}
                  onClick={() => pick.mutate(candidate)}
                  className="flex w-full cursor-pointer items-center gap-3 rounded-md border border-border px-2 py-1.5 text-left hover:bg-muted"
                >
                  {candidate.image_url ? (
                    <img src={candidate.image_url} alt="" className="size-10 shrink-0 rounded object-cover" />
                  ) : (
                    <span className="size-10 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{candidate.title ?? '—'}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {[
                        candidate.year,
                        candidate.designer,
                        candidate.bgg_rating ? `BGG ${candidate.bgg_rating}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
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
                <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {t('boardGames.shopSearch.unavailable', {
                    shops: shopSources.filter((source) => !source.ok).map((source) => source.name).join(', '),
                  })}
                </p>
              )}

              {offers !== null && !offers.length && !shopLookup.isPending && (
                <p className="mt-2 text-xs text-muted-foreground">{t('boardGames.shopSearch.empty')}</p>
              )}

              <div className="mt-2 space-y-1.5">
                {(offers ?? []).map((offer) => {
                  const added = links.some((l) => l.url === offer.url)
                  return (
                    <div
                      key={`${offer.shop}-${offer.url}`}
                      className="flex items-center gap-3 rounded-md border border-border px-2 py-1.5"
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
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            {/* ⚠️ სათაური `locked`-ია (§6.5) — მისი გარეშე ჩანაწერი არ ჩაიწერება */}
            <FieldLabel htmlFor="bg-title" required>{fields.label('title')}</FieldLabel>
            <Input
              id="bg-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
            {errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className={fields.shows('year') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="bg-year" required={fields.required('year')} hint={fields.hint('year')}>
              {fields.label('year')}
            </FieldLabel>
            <Input
              id="bg-year"
              type="number"
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {fields.shows('designer') && (
            <div>
              <FieldLabel htmlFor="bg-designer" required={fields.required('designer')} hint={fields.hint('designer')}>
                {fields.label('designer')}
              </FieldLabel>
              <Input
                id="bg-designer"
                placeholder={fields.placeholder('designer')}
                value={form.designer}
                onChange={(e) => setForm((f) => ({ ...f, designer: e.target.value }))}
              />
            </div>
          )}
          {fields.shows('publisher') && (
            <div>
              <FieldLabel htmlFor="bg-publisher" required={fields.required('publisher')} hint={fields.hint('publisher')}>
                {fields.label('publisher')}
              </FieldLabel>
              <Input
                id="bg-publisher"
                placeholder={fields.placeholder('publisher')}
                value={form.publisher}
                onChange={(e) => setForm((f) => ({ ...f, publisher: e.target.value }))}
              />
            </div>
          )}
        </div>

        {/* მოთამაშეები / ასაკი / ხანგრძლივობა */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className={fields.shows('players') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('players')} hint={fields.hint('players')}>
              {fields.label('players')}
            </FieldLabel>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Input
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
                value={form.players_max}
                onChange={(e) => setForm((f) => ({ ...f, players_max: e.target.value }))}
              />
            </div>
            {errors.players_max && (
              <p className="mt-1 text-xs text-destructive">{errors.players_max}</p>
            )}
          </div>

          <div className={fields.shows('playtime') ? undefined : 'hidden'}>
            <FieldLabel required={fields.required('playtime')} hint={fields.hint('playtime')}>
              {fields.label('playtime')}
            </FieldLabel>
            {/* §2.5 — საათი+წუთი ერთი კომპონენტით; სვეტი ისევ **წუთებია** */}
            <div className="mt-1.5 space-y-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">
                  {t('boardGames.min')}
                </span>
                <DurationInput
                  unit="minutes"
                  value={form.playtime_min ? Number(form.playtime_min) : null}
                  onChange={(v) => setForm((f) => ({ ...f, playtime_min: v == null ? '' : String(v) }))}
                />
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground">
                  {t('boardGames.max')}
                </span>
                <DurationInput
                  unit="minutes"
                  value={form.playtime_max ? Number(form.playtime_max) : null}
                  onChange={(v) => setForm((f) => ({ ...f, playtime_max: v == null ? '' : String(v) }))}
                />
              </span>
            </div>
            {errors.playtime_max && (
              <p className="mt-1 text-xs text-destructive">{errors.playtime_max}</p>
            )}
          </div>

          <div className={fields.shows('age') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="bg-age" required={fields.required('age')} hint={fields.hint('age')}>
              {fields.label('age')}
            </FieldLabel>
            <Input
              id="bg-age"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.age_min}
              onChange={(e) => setForm((f) => ({ ...f, age_min: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {fields.shows('complexity') && (
            <div>
              <FieldLabel htmlFor="bg-complexity" required={fields.required('complexity')} hint={fields.hint('complexity')}>
                {fields.label('complexity')}
              </FieldLabel>
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
            </div>
          )}
          <div className={fields.shows('bgg_id') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="bg-id" required={fields.required('bgg_id')} hint={fields.hint('bgg_id')}>
              {fields.label('bgg_id')}
            </FieldLabel>
            <Input
              id="bg-id"
              type="number"
              inputMode="numeric"
              value={form.bggId}
              onChange={(e) => setForm((f) => ({ ...f, bggId: e.target.value }))}
            />
            {errors.bgg_id && <p className="mt-1 text-xs text-destructive">{errors.bgg_id}</p>}
          </div>
          <div className={fields.shows('status') ? undefined : 'hidden'}>
            <FieldLabel htmlFor="bg-status" required={fields.required('status')} hint={fields.hint('status')}>
              {fields.label('status')}
            </FieldLabel>
            <Select
              value={form.status}
              onValueChange={(v) => setForm((f) => ({ ...f, status: v as typeof f.status }))}
            >
              <SelectTrigger
                id="bg-status"
                className={errors.status ? 'border-destructive' : undefined}
              >
                <SelectValue placeholder={t('validation.choose')} />
              </SelectTrigger>
              <SelectContent>
                {BOARD_GAME_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`boardGames.statuses.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.status && <p className="mt-1 text-xs text-destructive">{errors.status}</p>}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {/* ჟანრი — per-user ლექსიკონიდან, გვერდით „ახალი ჟანრი" */}
            <div className={fields.shows('genre') ? undefined : 'hidden'}>
              <FieldLabel htmlFor="bg-genre" required={fields.required('genre')} hint={fields.hint('genre')}>
                {fields.label('genre')}
              </FieldLabel>
            </div>
            <div className={fields.shows('genre') ? 'flex gap-1' : 'hidden'}>
              <Select
                value={form.genreId}
                onValueChange={(v) => setForm((f) => ({ ...f, genreId: v }))}
              >
                <SelectTrigger
                  id="bg-genre"
                  className={errors.genre_id ? 'border-destructive' : undefined}
                >
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
            {errors.genre_id && <p className="mt-1 text-xs text-destructive">{errors.genre_id}</p>}

            {/* მაღაზიები: ბმული + ფასი (§14) */}
            <div className={fields.shows('links') ? 'mt-4' : 'hidden'}>
              <FieldLabel required={fields.required('links')} hint={fields.hint('links')}>
                {fields.label('links')}
              </FieldLabel>
              <div className="mt-1.5 space-y-1.5">
                {links.map((link, i) => (
                  <div key={i} className="flex gap-1.5">
                    <Input
                      className="w-24 shrink-0"
                      placeholder={t('books.linkLabel')}
                      value={link.label ?? ''}
                      onChange={(e) =>
                        setLinks((all) =>
                          all.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                        )
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
                            j === i
                              ? { ...x, price: e.target.value === '' ? null : Number(e.target.value) }
                              : x,
                          ),
                        )
                      }
                    />
                    <Input
                      className="w-16 shrink-0"
                      placeholder="GEL"
                      value={link.currency ?? ''}
                      onChange={(e) =>
                        setLinks((all) =>
                          all.map((x, j) => (j === i ? { ...x, currency: e.target.value } : x)),
                        )
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
                    onClick={() => setLinks((all) => [...all, { label: '', url: '', price: null, currency: '' }])}
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
                    {shopLookup.isPending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Store className="size-3.5" />
                    )}
                    {t('boardGames.shopSearch.search')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div>
            {fields.shows('image') && (
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
            )}

            <div className={fields.shows('description') ? 'mt-4' : 'hidden'}>
              <FieldLabel htmlFor="bg-desc" required={fields.required('description')} hint={fields.hint('description')}>
                {fields.label('description')}
              </FieldLabel>
              <Textarea
                id="bg-desc"
                rows={6}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
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
        <CustomFieldsCard module="board_game" recordId={game?.id ?? null} />
      </div>

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
