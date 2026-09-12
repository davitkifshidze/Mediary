import { useMemo, useState } from 'react'
import { fetchStatuses, isStatusDomain, type StatusDomain } from '@/api/statuses'
import { statusName } from '@/lib/statuses'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Trash2 } from 'lucide-react'
import {
  fetchPurgePlan,
  fetchUsers,
  PURGE_TARGETS,
  PURGE_TARGET_MODES,
  PURGE_TARGET_STATUSES,
  type PurgeInput,
  type PurgeMode,
  type PurgeTarget,
  type PurgeTargetWithStatus,
  type PurgeTargetWithType,
} from '@/api/account'
import { fetchGenres, mediaApi } from '@/api/media'
import { fetchVideos, fetchVideoTypes } from '@/api/videos'
import { fetchSongGenres, fetchSongs } from '@/api/songs'
import { fetchBookGenres, fetchBooks } from '@/api/books'
import { fetchBoardGameGenres } from '@/api/boardGames'
import { fetchGameGenres } from '@/api/games'
import { fetchNoteCategories, fetchNotes } from '@/api/notes'
import { fetchBookmarkCategories, fetchBookmarks } from '@/api/bookmarks'
import { useAuth } from '@/lib/auth'
import { videoTypeName } from '@/lib/display'
import { useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { cn, formatBytes } from '@/lib/utils'
import { GenreSelect } from '@/components/GenreSelect'
import { MovieMultiSelect } from '@/components/MovieMultiSelect'
import { TagSelect } from '@/components/TagSelect'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useQueue } from '@/components/ui/queue'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   მასობრივი წაშლა (Tasks 20) — `/purge`, მხოლოდ super_admin-ს.

   ორნაბიჯიანია: ჯერ **გეგმა** (რამდენი ჩანაწერი, ფოტო და მეგაბაიტი
   წაიშლება), მერე დადასტურება **სიტყვის ჩაწერით**. ერთი „დიახ" განზრახ
   არ კმარა — ეს ერთადერთი ადგილია, საიდანაც ბიბლიოთეკა შეიძლება გაქრეს.

   ციკლს **queue ატარებს** (20.2), როგორც `/sync`-სა და თარგმანებზე: თითო
   ჩანაწერი = თითო მოკლე რექვესთი, ე.ი. პროგრესი ჩანს, გაჩერება შეიძლება
   და 1000+ ჩანაწერზე `artisan serve` არ იბლოკება.
   ============================================================ */

const CONFIRM_WORD = 'DELETE'

/** ჩანაწერის დომენი — გალერეა ჩანაწერს არ შლის, ე.ი. თავისი დომენი არ აქვს */
type PurgeDomain = Exclude<PurgeTarget, 'gallery'>

/** ლექსიკონის ერთეული — სამივე წყაროს ერთი და იგივე ფორმა აქვს */
type DictionaryItem = { id: number; name_ka: string; name_en: string; icon?: string | null }

/**
 * **per-user ლექსიკონიანი დომენები** — `[queryKey, fetcher]`.
 * ვისაც აქ არ წერია, გლობალურ polymorphic `genres`-ს იყენებს (ფილმი/სერიალი).
 *
 * ⚠️ **გასაღებების სია TypeScript-მა გამოთვალა და არა ჩვენ ჩამოვწერეთ**:
 * `PurgeTargetWithType` სწორედ ის დომენებია, რომლებსაც `PURGE_TARGET_MODES`-ში
 * `type` სკოუპი უწერიათ. ე.ი. ახალი მოდულის დამატება ლექსიკონის გარეშე
 * **კომპილაციას ტეხს**. ადრე რუკა `Partial<Record<…>>` იყო და `game` ზუსტად
 * ასე გამოგვეპარა (2026-09-04) — გვერდი ცარიელ „ტიპის" სიას ხატავდა და
 * არავითარ შეცდომას არ იძლეოდა.
 */
const DICTIONARIES: Record<PurgeTargetWithType, { key: string; load: () => Promise<DictionaryItem[]> }> = {
  video: { key: 'video-types', load: fetchVideoTypes },
  song: { key: 'song-genres', load: fetchSongGenres },
  book: { key: 'book-genres', load: fetchBookGenres },
  board_game: { key: 'board-game-genres', load: fetchBoardGameGenres },
  game: { key: 'game-genres', load: fetchGameGenres },
  // §13 — „ტიპი" აქ კატეგორიაა
  note: { key: 'note-categories', load: fetchNoteCategories },
  // §18 — ბუკმარკზეც კატეგორიაა
  bookmark: { key: 'bookmark-categories', load: fetchBookmarkCategories },
}

/**
 * სტატუსის ლეიბლი `enum`-იან დომენებზე — i18n-ის namespace.
 *
 * ⚠️ **§6.4-ის შემდეგ აქ მხოლოდ სამი დომენია.** ექვსს per-user ლექსიკონი
 * აქვს, ე.ი. მათი სახელი ბაზიდან მოდის და თარგმანში არც არსებობს.
 *
 * ⚠️ გასაღებები აქაც **გამოთვლილია** — `status` სკოუპიანი სამიზნეები,
 * გამოკლებული ლექსიკონიანები და `gallery` (ჩანაწერს არ შლის, სტატუსს
 * მედია-დომენიდან იღებს). ე.ი. ახალი `enum`-სტატუსიანი მოდული ლეიბლის
 * გარეშე კომპილაციას ტეხს, ნაცვლად იმისა, რომ ნედლი i18n გასაღები დახატოს.
 */
const STATUS_NAMESPACE: Record<
  Exclude<PurgeTargetWithStatus, StatusDomain | 'gallery'>,
  string
> = {
  book: 'books.statuses',
  board_game: 'boardGames.statuses',
  game: 'games.statuses',
}

const statusKey = (domain: PurgeDomain, status: string) =>
  `${STATUS_NAMESPACE[domain as keyof typeof STATUS_NAMESPACE] ?? 'status'}.${status}`

/**
 * ლექსიკონი დომენზე, თუ აქვს.
 * ⚠️ `movie`/`series`/`anime` **განზრახ** არ არიან `DICTIONARIES`-ში — მათ გლობალური
 * polymorphic `genres` აქვთ. ე.ი. `undefined` აქ ნორმალური პასუხია და არა
 * გამორჩენილი რიგი; რუკის სისრულეს ტიპი უკვე იცავს.
 */
const dictionaryFor = (domain: PurgeDomain) =>
  domain in DICTIONARIES ? DICTIONARIES[domain as PurgeTargetWithType] : undefined

export function PurgePage() {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const { toast } = useToast()
  const { user: me } = useAuth()
  const { has } = useModules()
  const { enqueuePurge, isBusy } = useQueue()

  const [target, setTarget] = useState<PurgeTarget>('movie')
  const [mediaType, setMediaType] = useState<'movie' | 'series'>('movie')
  const [mode, setMode] = useState<PurgeMode>('ids')
  const [ids, setIds] = useState<number[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [status, setStatus] = useState('')
  const [typeIds, setTypeIds] = useState<number[]>([])
  const [tags, setTags] = useState<string[]>([])
  const [keepFavorites, setKeepFavorites] = useState(true)
  const [userId, setUserId] = useState<number | undefined>(undefined)
  const [confirmWord, setConfirmWord] = useState('')

  /** რომელ დომენზე მუშაობს არჩეული სამიზნე */
  const domain: PurgeDomain = target === 'gallery' ? mediaType : target
  const isVideo = domain === 'video'
  const isSong = domain === 'song'
  const isBook = domain === 'book'
  const isNote = domain === 'note'
  const isBookmark = domain === 'bookmark'
  /** per-user ლექსიკონიანი დომენი (იხ. `DICTIONARIES`) vs გლობალური `genres` */
  const dict = dictionaryFor(domain)
  const byDictionary = !!dict

  /**
   * რეჟიმების სია სამიზნეს მიჰყვება (სარკე `PurgeService::TARGET_MODES`-ისა).
   * ⚠️ ლექსიკონიან დომენებზე „კონკრეტული" განზრახ არ არის: ბიბლიოთეკა
   * ბადეშივე იშლება თითოეულად, მასობრივად კი ტიპი/ტეგი გვჭირდება.
   * ⚠️ `readonly` — სია `as const`-ია, რომ ტიპებმა ლიტერალები დაინახონ.
   */
  const modes: readonly PurgeMode[] = PURGE_TARGET_MODES[target]
  /* §6.4 — ორი მექანიზმი ერთდროულად: ექვს დომენს per-user ლექსიკონი აქვს
     (და სია **სამიზნე ანგარიშიდან** მოდის, რადგან `/purge` სხვისას შლის),
     წიგნს/თამაშს/ბორდგეიმს კი `enum`. ორივე მხარე გასაღებებით მუშაობს,
     ე.ი. ქვემოთ განსხვავება მხოლოდ ლეიბლშია. */
  const dictionaryStatuses = isStatusDomain(domain)
  const statusQ = useQuery({
    queryKey: ['statuses', domain, userId ?? 'me'],
    queryFn: () => fetchStatuses(domain as StatusDomain, userId),
    enabled: dictionaryStatuses,
  })
  const statuses = dictionaryStatuses
    ? (statusQ.data ?? []).map((s) => s.key)
    : (PURGE_TARGET_STATUSES[domain] ?? [])

  /** ლეიბლი: ლექსიკონიდან სახელი, `enum`-ზე — i18n */
  const statusLabel = (key: string) =>
    dictionaryStatuses
      ? (statusName(statusQ.data?.find((s) => s.key === key), lang) || key)
      : t(statusKey(domain, key))

  const input: PurgeInput = useMemo(
    () => ({
      target,
      mode,
      media_type: target === 'gallery' ? mediaType : undefined,
      ids: mode === 'ids' ? ids : undefined,
      genres: mode === 'genre' ? genres : undefined,
      status: mode === 'status' ? status : undefined,
      type_ids: mode === 'type' ? typeIds : undefined,
      tags: mode === 'tag' ? tags : undefined,
      keep_favorites: keepFavorites,
      user_id: userId,
    }),
    [target, mode, mediaType, ids, genres, status, typeIds, tags, keepFavorites, userId],
  )

  /** სკოუპი შევსებულია? (backend-იც ამოწმებს — ეს მხოლოდ UI-ს ბლოკავს) */
  const scopeReady =
    mode === 'all' ||
    (mode === 'ids' && ids.length > 0) ||
    (mode === 'genre' && genres.length > 0) ||
    (mode === 'status' && !!status) ||
    (mode === 'type' && typeIds.length > 0) ||
    (mode === 'tag' && tags.length > 0)

  const usersQ = useQuery({ queryKey: ['admin-users'], queryFn: fetchUsers })
  const genresQ = useQuery({ queryKey: ['genres'], queryFn: () => fetchGenres(), enabled: !byDictionary })
  // ლექსიკონი დომენს მიჰყვება (`DICTIONARIES`) — ქეშის გასაღებიც იქიდან მოდის,
  // ე.ი. იმავე სიას იზიარებს, რასაც მოდულის გვერდი
  const dictQ = useQuery({
    queryKey: [dict?.key ?? 'no-dictionary'],
    queryFn: () => dict!.load(),
    enabled: byDictionary,
  })
  const dictionary = dictQ.data ?? []
  /* ⚠️ ექვსივე `all: true`-ით. `/purge` სკოუპს **ცხადად** აგებს (`mode` +
     პარამეტრები), ე.ი. ამრჩევსა და ტეგების შემოთავაზებას გვერდებად დაჭრილი
     სია არ გამოადგება: მე-2 გვერდზე დარჩენილი ჩანაწერი სიიდან ჩუმად
     ამოვარდებოდა და წასაშლელის სია მცდარი იქნებოდა. */
  const poolQ = useQuery({
    queryKey: ['purge-pool', domain],
    queryFn: () =>
      byDictionary
        ? Promise.resolve([])
        : mediaApi(domain as 'movie' | 'series')
            .list({ all: true })
            .then((p) => p.items),
    enabled: mode === 'ids' && !byDictionary,
  })
  // ტეგების შემოთავაზება — ბიბლიოთეკაში უკვე არსებული ტეგები
  const videosQ = useQuery({
    queryKey: ['videos', 'purge'],
    queryFn: () => fetchVideos({ all: true }).then((p) => p.items),
    enabled: isVideo,
  })
  const songsQ = useQuery({
    queryKey: ['songs', 'purge'],
    queryFn: () => fetchSongs({ all: true }).then((p) => p.items),
    enabled: isSong,
  })
  const booksQ = useQuery({
    queryKey: ['books', 'purge'],
    queryFn: () => fetchBooks({ all: true }).then((p) => p.items),
    enabled: isBook,
  })
  const notesQ = useQuery({
    queryKey: ['notes', 'purge'],
    queryFn: () => fetchNotes({ all: true }).then((p) => p.items),
    enabled: isNote,
  })
  const bookmarksQ = useQuery({
    queryKey: ['bookmarks', 'purge'],
    queryFn: () => fetchBookmarks({ all: true }).then((p) => p.items),
    enabled: isBookmark,
  })
  const knownTags = useMemo(
    () =>
      [
        ...new Set([
          ...(videosQ.data ?? []).flatMap((v) => v.tags ?? []),
          ...(songsQ.data ?? []).flatMap((x) => x.tags ?? []),
          ...(booksQ.data ?? []).flatMap((b) => b.tags ?? []),
          ...(notesQ.data ?? []).flatMap((n) => n.tags ?? []),
          ...(bookmarksQ.data ?? []).flatMap((b) => b.tags ?? []),
        ]),
      ].sort((a, b) => a.localeCompare(b)),
    [videosQ.data, songsQ.data, booksQ.data, notesQ.data, bookmarksQ.data],
  )

  const planQ = useQuery({
    queryKey: ['purge-plan', input],
    queryFn: () => fetchPurgePlan(input),
    enabled: scopeReady,
  })

  /**
   * ⚠️ გაშვება — რიგში ჩაყრა. ქეშის გასუფთავებასა და შედეგის შეჯამებას
   * queue თვითონ აკეთებს, ე.ი. გვერდიდან გასვლაც უსაფრთხოა.
   */
  const run = () => {
    const items = planQ.data?.plan.items ?? []
    if (!items.length) return

    enqueuePurge(items, {
      target,
      media_type: target === 'gallery' ? mediaType : undefined,
      user_id: userId,
    })
    // დადასტურება ერთჯერადია — მეორე გაშვება ხელახლა ჩაწერას მოითხოვს
    setConfirmWord('')
    toast({ title: t('purge.started', { count: items.length }), variant: 'success' })
  }

  if (!me?.is_super_admin) {
    return (
      <PageContainer>
        <p className="text-sm text-muted-foreground">{t('roles.noAccess')}</p>
      </PageContainer>
    )
  }

  const plan = planQ.data?.plan
  const nothing = !!plan && plan.items.length === 0
  const canRun = scopeReady && !!plan && !nothing && confirmWord.trim() === CONFIRM_WORD

  // სამიზნე = მოდული, ე.ი. გამორთული მოდული სიაშიც არ ჩანს
  const targets = PURGE_TARGETS.filter((tg) => has(tg))

  return (
    <PageContainer>
      <PageHeader
        title={t('purge.title')}
        subtitle={t('purge.subtitle')}
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <p>{t('purge.warning')}</p>
      </div>

      {/* ---------- 1. რა წაიშლება ---------- */}
      <section className="mb-4 rounded-xl border border-border bg-card p-5">
        <Label className="mb-2 block">{t('purge.target')}</Label>
        <div className="flex flex-wrap gap-2">
          {targets.map((tg) => (
            <Button
              key={tg}
              size="sm"
              variant={target === tg ? 'default' : 'outline'}
              onClick={() => {
                setTarget(tg)
                // რეჟიმი ვალიდური უნდა დარჩეს — თითო სამიზნეს თავისი სია აქვს
                setMode(PURGE_TARGET_MODES[tg][0])
                // ⚠️ სტატუსების ლექსიკონი დომენზეა: `read` ფილმზე 422-ს იძლევა
                setStatus('')
              }}
            >
              {t(`purge.targetOption.${tg}`)}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t(`purge.targetHint.${target}`)}</p>

        {target === 'gallery' && (
          <div className="mt-3 border-t border-border pt-3">
            <Label className="mb-2 block">{t('purge.mediaType')}</Label>
            <div className="flex gap-2">
              {(['movie', 'series'] as const).map((d) => (
                <Button
                  key={d}
                  size="sm"
                  variant={mediaType === d ? 'default' : 'outline'}
                  onClick={() => setMediaType(d)}
                >
                  {t(d === 'series' ? 'nav.series' : 'nav.movies')}
                </Button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 2. სკოუპი ---------- */}
      <section className="mb-4 rounded-xl border border-border bg-card p-5">
        <Label className="mb-2 block">{t('purge.scope')}</Label>
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as PurgeMode)} className="gap-2">
          {modes.map((m) => (
            <div
              key={m}
              className={cn(
                'rounded-lg border p-3 transition-colors',
                mode === m ? 'border-primary bg-secondary/50' : 'border-border',
                m === 'all' && mode === 'all' && 'border-destructive bg-destructive/5',
              )}
            >
              <label className="flex cursor-pointer items-center gap-3">
                <RadioGroupItem value={m} />
                <span className="text-sm font-medium">{t(`purge.mode.${m}`)}</span>
              </label>

              {mode === m && m === 'ids' && (
                <div className="mt-2 pl-8">
                  <MovieMultiSelect
                    movies={poolQ.data ?? []}
                    value={ids}
                    onChange={setIds}
                    placeholder={poolQ.isLoading ? t('api.loading') : t('purge.pickRecords')}
                  />
                </div>
              )}

              {mode === m && m === 'genre' && (
                <div className="mt-2 pl-8">
                  <GenreSelect genres={genresQ.data ?? []} value={genres} onChange={setGenres} />
                </div>
              )}

              {mode === m && m === 'status' && (
                <div className="mt-2 pl-8">
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('sync.statusPick')} />
                    </SelectTrigger>
                    <SelectContent>
                      {statuses.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {mode === m && m === 'type' && (
                <div className="mt-2 space-y-1 pl-8">
                  {dictionary.map((type) => (
                    <label key={type.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={typeIds.includes(type.id)}
                        onCheckedChange={() =>
                          setTypeIds((cur) =>
                            cur.includes(type.id) ? cur.filter((x) => x !== type.id) : [...cur, type.id],
                          )
                        }
                      />
                      {videoTypeName(type, lang)}
                    </label>
                  ))}
                </div>
              )}

              {mode === m && m === 'tag' && (
                <div className="mt-2 pl-8">
                  <TagSelect options={knownTags} value={tags} onChange={setTags} />
                </div>
              )}
            </div>
          ))}
        </RadioGroup>

        {/* ⚠️ ყველა სამიზნეზე ჩანს: `keep_favorites` ისედაც ყოველთვის იგზავნება
            (backend-ზე `is_favorite = false` ფილტრია), ე.ი. დამალული checkbox
            ჩუმად ცვლიდა სკოუპს — ვიდეოზეც, სიმღერაზეც და გალერეაზეც */}
        <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
          <Checkbox checked={keepFavorites} onCheckedChange={() => setKeepFavorites((v) => !v)} />
          <span>
            {t('purge.keepFavorites')}
            <span className="block text-xs text-muted-foreground">{t('purge.keepFavoritesHint')}</span>
          </span>
        </label>

        {/* ადმინს სხვისი ბიბლიოთეკის გასუფთავებაც შეუძლია */}
        <div className="mt-3 border-t border-border pt-3">
          <Label className="mb-2 block">{t('purge.account')}</Label>
          <Select
            value={String(userId ?? me.id)}
            onValueChange={(v) => setUserId(Number(v) === me.id ? undefined : Number(v))}
          >
            <SelectTrigger className="sm:max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(usersQ.data ?? [{ ...me }]).map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.display_name}
                  {u.id === me.id ? ` · ${t('purge.self')}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* ---------- 3. შეჯამება + დადასტურება ---------- */}
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 font-display text-lg font-semibold tracking-tight">{t('purge.summary')}</h2>

        {!scopeReady ? (
          <p className="text-sm text-muted-foreground">{t('purge.pickScope')}</p>
        ) : planQ.isFetching ? (
          <p className="text-sm text-muted-foreground">{t('api.loading')}</p>
        ) : plan ? (
          <>
            <ul className="space-y-1 text-sm">
              {target !== 'gallery' && (
                <li>
                  {t('purge.willDeleteRecords', { count: plan.records })}
                  {/* ელწიგნი/წესების PDF ხშირად ყველაზე მძიმე ფაილია — ცალკე ჩანდეს */}
                  {plan.attachments > 0 && ` · ${t('purge.attachments', { count: plan.attachments })}`}
                  {plan.notes > 0 && ` · ${t('purge.notes', { count: plan.notes })}`}
                </li>
              )}
              <li>{t('purge.willDeletePhotos', { count: plan.photos })}</li>
              <li className="font-medium">{t('purge.willFree', { size: formatBytes(plan.bytes) })}</li>
              {/* 20.2 — რიგის სიგრძე და სავარაუდო დრო, როგორც `/sync`-ზე */}
              {plan.items.length > 0 && (
                <li className="text-muted-foreground">
                  {t('purge.queueUnits', { count: plan.items.length })}
                  {' · ≈ '}
                  {(planQ.data?.eta_seconds ?? 0) < 90
                    ? t('sync.etaSec', { count: planQ.data?.eta_seconds ?? 0 })
                    : t('sync.etaMin', { count: Math.round((planQ.data?.eta_seconds ?? 0) / 60) })}
                </li>
              )}
            </ul>

            {nothing ? (
              <p className="mt-3 text-sm text-muted-foreground">{t('purge.nothing')}</p>
            ) : (
              <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
                <div className="min-w-48">
                  <Label htmlFor="confirm">{t('purge.confirmLabel', { word: CONFIRM_WORD })}</Label>
                  <Input
                    id="confirm"
                    value={confirmWord}
                    onChange={(e) => setConfirmWord(e.target.value)}
                    placeholder={CONFIRM_WORD}
                    autoComplete="off"
                  />
                </div>
                <Button variant="destructive" disabled={!canRun} onClick={run}>
                  <Trash2 className="size-4" />
                  {isBusy ? t('sync.addToQueue') : t('purge.run')}
                </Button>
              </div>
            )}

            <p className="mt-3 text-xs text-muted-foreground">{t('sync.runsInQueue')}</p>
          </>
        ) : null}
      </section>
    </PageContainer>
  )
}
