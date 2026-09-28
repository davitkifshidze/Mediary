import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, Plus, Search, X } from 'lucide-react'
import {
  createGame,
  fetchGameFranchises,
  fetchGameGenres,
  fetchGames,
  fetchRawgCandidates,
  fetchRawgDraft,
  type Game,
  type GameGenre,
  type RawgCandidate,
} from '@/api/games'
import { errorMessage, isApiCode } from '@/lib/errors'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { CredentialMissingNotice } from '@/components/CredentialMissingNotice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { useToast } from '@/components/ui/feedback'
import { cn } from '@/lib/utils'

/* ============================================================
   ფრენჩაიზის მოდალი (Tasks §5.1).

   ⚠️ ფრენჩაიზი **ტექსტური ველი აღარაა** — ღილაკი ხსნის ამ მოდალს, სადაც
   ერთდროულად სამი რამ კეთდება:
     1. სახელი აირჩევა ბიბლიოთეკაში უკვე არსებულთაგან (ან იწერება ახალი),
     2. ჩანს, **რომელი ნაწილები** გაქვს უკვე,
     3. **იქვე ემატება ახალი ნაწილი ბიბლიოთეკაში** (RAWG-ის ძებნით ან ხელით).

   ⚠️ ლექსიკონის ცხრილი განზრახ არ არსებობს — სია `games.franchise`-იდან
   იკრიბება (`GET /api/games/franchises`), ე.ი. ერთი ფაქტი ერთ ადგილას წერია.

   ⚠️ დამატება **დამოუკიდებელია** მშობელი ფორმისგან: ახალი თამაში მაშინვე
   იქმნება, მაშინაც კი, თუ თვითონ ფორმა ჯერ არ შენახულა. ამიტომ სახელს
   ჯერ ვამტკიცებთ (ღილაკი ჩამქრალია, სანამ ფრენჩაიზი ცარიელია) — თორემ
   ახალი ჩანაწერი უფრენჩაიზოდ დაჯდებოდა.
   ============================================================ */

export function GameFranchiseDialog({
  value,
  onApply,
  onClose,
}: {
  /** მიმდინარე ფრენჩაიზი ფორმიდან ('' = არჩეული არაა) */
  value: string
  onApply: (name: string) => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()

  const [name, setName] = useState(value)
  const trimmed = name.trim()

  const { data: franchises = [] } = useQuery({
    queryKey: ['game-franchises'],
    queryFn: fetchGameFranchises,
  })

  /* ნაწილები — მხოლოდ მაშინ, როცა სახელი მართლა არსებობს ბიბლიოთეკაში */
  const parts = useQuery({
    queryKey: ['games', { franchise: trimmed }],
    // ⚠️ `all` — ფრანჩაიზის ყველა ნაწილი ერთ სიაში უნდა ჩანდეს
    queryFn: () => fetchGames({ franchise: trimmed, all: true }).then((p) => p.items),
    enabled: trimmed.length > 0,
  })

  const title = (game: Game) =>
    (lang === 'ka' ? game.title_ka || game.title_en : game.title_en || game.title_ka) ?? `#${game.id}`

  /* ---------- ახალი ნაწილის დამატება ---------- */

  const [query, setQuery] = useState('')
  const [candidates, setCandidates] = useState<RawgCandidate[] | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [noKey, setNoKey] = useState(false)

  /* Tasks §4.4 — სტატუსი და ჟანრი სავალდებულოა, ღილაკი კი ორივეს გარეშე
     იძახებდა `createGame`-ს ⇒ ყოველთვის 422. სტატუსი ნაგულისხმევად
     „გასავლელია“, ჟანრი კი — ხელით არჩეული, ან RAWG-ის ჟანრი, თუ ის ჩემს
     ლექსიკონში არსებობს. ⚠️ ლექსიკონში თავისით არაფერი იქმნება. */
  const { data: genres = [] } = useQuery({ queryKey: ['game-genres'], queryFn: fetchGameGenres })
  const [genreId, setGenreId] = useState('')
  const [genreMissing, setGenreMissing] = useState(false)

  /** RAWG-ის ჟანრის სახელები → ლექსიკონის id-ები (ორივე ენა, რეგისტრი და სივრცეები არ ითვლება) */
  const matchGenres = (names: string[] | undefined): number[] => {
    const wanted = new Set((names ?? []).map(normalizeGenre))
    return genres
      .filter((g: GameGenre) => wanted.has(normalizeGenre(g.name_en)) || wanted.has(normalizeGenre(g.name_ka)))
      .map((g) => g.id)
  }

  /** ხელით არჩეული იმარჯვებს; მის გარეშე — RAWG-ის დამთხვევა; ორივეს გარეშე — `null` */
  const resolveGenres = (names?: string[]): number[] | null => {
    if (genreId) return [Number(genreId)]
    const matched = matchGenres(names)
    return matched.length ? matched : null
  }

  const lookup = useMutation({
    mutationFn: () => fetchRawgCandidates(query.trim()),
    onSuccess: (results) => {
      setUnavailable(false)
      setNoKey(false)
      setCandidates(results)
    },
    onError: (e) => {
      /* 503 = წყარო მიუწვდომელია; ეს „ვერაფერი მოიძებნა" **არ არის**.
         409 `credential_missing` (§30.6) — ჩემი გასაღები არ მაქვს: სხვა ქმედებაა */
      const missing = isApiCode(e, 'credential_missing')
      const blocked = isApiCode(e, 'rawg_unavailable')
      setNoKey(missing)
      setUnavailable(blocked)
      setCandidates(blocked || missing ? [] : null)
      if (!blocked && !missing) toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  const add = useMutation({
    /** `candidate = null` → ხელით დამატება, მხოლოდ აკრეფილი სახელით */
    mutationFn: async (candidate: RawgCandidate | null) => {
      if (!candidate) {
        const genre_ids = resolveGenres()
        if (!genre_ids) throw new GenreRequired()
        return createGame({ title_en: query.trim(), franchise: trimmed, status: DEFAULT_STATUS, genre_ids })
      }

      /* დეტალები კანდიდატს ავსებს — ⚠️ **მხოლოდ არაცარიელით**, ზუსტად ისე,
         როგორც `GameForm`-ში: სიის რიგსა და დეტალებს სხვადასხვა ველები აქვს */
      let draft = candidate
      try {
        const detail = await fetchRawgDraft(candidate)
        const merged = { ...candidate }
        for (const [key, val] of Object.entries(detail)) {
          if (val !== null && val !== '' && !(Array.isArray(val) && !val.length)) {
            ;(merged as Record<string, unknown>)[key] = val
          }
        }
        draft = merged
      } catch {
        /* დეტალების ჩავარდნა დამატებას არ უნდა აჩერებდეს */
      }

      const genre_ids = resolveGenres(draft.genres)
      if (!genre_ids) throw new GenreRequired()

      return createGame({
        title_en: draft.title_en || candidate.title_en || query.trim(),
        status: DEFAULT_STATUS,
        genre_ids,
        release_date: draft.release_date ?? null,
        developer: draft.developer ?? null,
        publisher: draft.publisher ?? null,
        franchise: trimmed,
        platforms: draft.platforms ?? [],
        users_score: draft.users_score ?? null,
        age_rating: draft.age_rating ?? null,
        // ⚠️ IGDB-ის რიგს `rawg_id` არ აქვს — ცალკე ველში ჯდება
        rawg_id: draft.rawg_id ?? null,
        rawg_slug: draft.rawg_slug ?? null,
        igdb_id: draft.igdb_id ?? null,
        igdb_slug: draft.igdb_slug ?? null,
        // ყდა შენახვისას ჩამოიტვირთება; **კვოტაში არ ითვლება** (19.4/B)
        rawg_cover_url: draft.cover_url ?? null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['games'] })
      qc.invalidateQueries({ queryKey: ['game-franchises'] })
      toast({ title: t('games.saved'), variant: 'success' })
      setCandidates(null)
      setQuery('')
      setGenreMissing(false)
    },
    onError: (e) => {
      if (e instanceof GenreRequired) {
        setGenreMissing(true)
        toast({ title: t('games.franchisePickGenre'), variant: 'error' })
        return
      }
      // ⚠️ ყველაზე ხშირი შეცდომა — იგივე `rawg_id` უკვე ბიბლიოთეკაშია (422)
      toast({ title: errorMessage(e), variant: 'error' })
    },
  })

  return (
    <ModalShell title={t('games.franchiseTitle')} onClose={onClose} wide>
      <div className="mt-4 space-y-4">
        {/* ---------- სახელი ---------- */}
        <div>
          <Label htmlFor="gf-name">{t('games.franchiseName')}</Label>
          <div className="mt-1.5 flex gap-2">
            <Input
              id="gf-name"
              autoFocus
              placeholder={t('games.franchisePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {!!trimmed && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => setName('')}
                aria-label={t('games.franchiseClear')}
              >
                <X className="size-4" />
              </Button>
            )}
          </div>

          {franchises.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {franchises.map((f) => (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => setName(f.name)}
                  className={cn(
                    'cursor-pointer rounded-md border px-2.5 py-1 text-xs transition-colors',
                    f.name === trimmed
                      ? 'border-primary bg-secondary font-medium'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {f.name} · {f.games_count}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ---------- ნაწილები ---------- */}
        {trimmed && (
          <div className="rounded-lg border border-border bg-card/50 p-3">
            <Label>{t('games.franchiseParts')}</Label>

            {parts.isLoading && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t('common.loading')}</p>
            )}
            {!parts.isLoading && !parts.data?.length && (
              <p className="mt-1.5 text-xs text-muted-foreground">{t('games.franchiseNoParts')}</p>
            )}

            <ul className="mt-1.5 space-y-1">
              {(parts.data ?? []).map((game) => (
                <li
                  key={game.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                >
                  <Check className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{title(game)}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {[game.year, t(`games.statuses.${game.status}`)].filter(Boolean).join(' · ')}
                  </span>
                </li>
              ))}
            </ul>

            {/* ---------- ახალი ნაწილი ---------- */}
            <div className="mt-3 border-t border-border pt-3">
              <Label htmlFor="gf-add">{t('games.franchiseAdd')}</Label>
              <div className="mt-1.5 flex gap-2">
                <Input
                  id="gf-add"
                  placeholder={t('games.lookupPlaceholder')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      // ⚠️ Enter აქ „ძებნას" ნიშნავს — მშობელი ფორმა არ უნდა შეინახოს
                      e.preventDefault()
                      if (query.trim()) lookup.mutate()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={!query.trim() || lookup.isPending}
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
              <p className="mt-1 text-xs text-muted-foreground">{t('games.franchiseAddHint')}</p>

              <div className="mt-2">
                <Label htmlFor="gf-genre">{t('games.franchiseGenre')}</Label>
                <Select
                  value={genreId}
                  onValueChange={(v) => {
                    setGenreId(v)
                    setGenreMissing(false)
                  }}
                >
                  <SelectTrigger id="gf-genre" className={cn('mt-1.5', genreMissing && 'border-destructive')}>
                    <SelectValue placeholder={t('games.franchiseGenreAuto')} />
                  </SelectTrigger>
                  <SelectContent>
                    {genres.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {lang === 'ka' ? g.name_ka || g.name_en : g.name_en || g.name_ka}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {genreMissing && (
                  <p className="mt-1 text-xs text-destructive">{t('games.franchisePickGenre')}</p>
                )}
              </div>

              {unavailable && (
                <p className="mt-2 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-500">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {t('games.lookupUnavailable')}
                </p>
              )}
              {noKey && <CredentialMissingNotice provider="rawg" className="mt-2" />}

              {candidates && (
                <div className="mt-2 space-y-1.5">
                  {!candidates.length && !unavailable && !noKey && (
                    <p className="text-xs text-muted-foreground">{t('games.lookupEmpty')}</p>
                  )}
                  {candidates.map((candidate) => (
                    <button
                      key={`${candidate.source ?? 'rawg'}-${candidate.rawg_id ?? candidate.igdb_id}`}
                      type="button"
                      disabled={add.isPending}
                      onClick={() => add.mutate(candidate)}
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
                            candidate.source === 'igdb' ? 'IGDB' : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                      <Plus className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}

              {/* წყარო რომც ჩავარდეს, ხელით დამატება უნდა შეიძლებოდეს */}
              {!!query.trim() && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  disabled={add.isPending}
                  onClick={() => add.mutate(null)}
                >
                  <Plus className="size-3.5" />
                  {t('games.franchiseAddManual', { name: query.trim() })}
                </Button>
              )}
            </div>
          </div>
        )}

        <ModalFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t('actions.cancel')}
          </Button>
          <Button
            type="button"
            onClick={() => {
              onApply(trimmed)
              onClose()
            }}
          >
            {t('actions.save')}
          </Button>
        </ModalFooter>
      </div>
    </ModalShell>
  )
}

/** ახალი ნაწილის სტატუსი — „გასავლელი“ (Tasks §4.4) */
const DEFAULT_STATUS = 'to_play' as const

/** ჟანრი ვერ გაირკვა — ეს ვალიდაციაა და არა ქსელის შეცდომა */
class GenreRequired extends Error {}

/** ლექსიკონის სახელის შედარება: რეგისტრი, სივრცეები და პუნქტუაცია არ ითვლება */
function normalizeGenre(name: string | null | undefined): string {
  return (name ?? '').toLocaleLowerCase().replace(/[\s\-_.,&/]+/g, '')
}
