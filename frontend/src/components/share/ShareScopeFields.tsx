import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { Globe2 } from 'lucide-react'
import type { Genre } from '@/api/types'
import {
  fetchShareRecords,
  type ShareDomainKey,
  type ShareDomainSpec,
  type ShareScopeMode,
} from '@/api/shareLinks'
import { fetchBoardGameGenres } from '@/api/boardGames'
import { fetchBookGenres } from '@/api/books'
import { fetchBookmarkCategories } from '@/api/bookmarks'
import { fetchCourseCategories } from '@/api/courses'
import { fetchGameGenres } from '@/api/games'
import { fetchPlaceCategories } from '@/api/places'
import { fetchSongGenres } from '@/api/songs'
import { fetchVideoTypes } from '@/api/videos'
import type { StatusDomain } from '@/api/statuses'
import { emptyMediaIds, type MediaType } from '@/lib/media'
import { ENUM_STATUS_ROLE, enumStatusKey, statusName, useStatuses } from '@/lib/statuses'
import { useContentLang } from '@/lib/settings'
import { shareMeta, type ShareClassifierKind } from '@/lib/shareLinks'
import { RadioGroup } from '@/components/ui/radio-group'
import { ScopeRow } from '@/components/ui/scope-row'
import { Chip, ChipRow } from '@/components/ui/chip'
import { Checkbox } from '@/components/ui/checkbox'
import { InfoHint } from '@/components/ui/info-hint'
import { GenreSelect } from '@/components/GenreSelect'
import { MediaRecordPicker } from '@/components/MediaRecordPicker'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { ModuleIcon } from '@/components/ModuleIcon'
import { MODULE_ACCENT_FALLBACK, isMediaKey, modAccent } from '@/lib/modules'
import type { ShareDomainLook } from '@/hooks/useShareDomains'

/* ============================================================
   **ერთი სექციის ფარგლები** გაზიარების ბმულის ფანჯარაში (Tasks §40.3).

   ⚠️ **რეჟიმები ერთმანეთს გამორიცხავს** — შენი ჩამონათვალი „ან"-ებითაა
   (ყველა · სტატუსი · რჩეულები · ჟანრი · კონკრეტული), და `RadioGroup` +
   `ScopeRow` სწორედ ამ სემანტიკას აქვს: თითო ვარიანტი თავის ქვე-ფორმას შლის.
   „მხოლოდ საჯაროები" კი **ცალკე ჩამრთველია**, რომელიც ნებისმიერ რეჟიმს
   ავიწროებს („ჩემი საჯარო საშინელებათა ფილმები" ერთი არჩევანია და არა ორი).

   ⚠️ **§40.10 — ერთი ფორმა თერთმეტ დომენზე, სამი მექანიზმით**: სტატუსი
   ლექსიკონიდან (ფილმი · სერიალი · ანიმე · ვიდეო · ბუკმარკი), enum-იდან
   (თამაში · წიგნი · ადგილი · კურსი) ან საერთოდ არ არის (სიმღერა · სამაგიდო) —
   მაშინ „სტატუსით" არ იხატება, რადგან სერვერი მას `invalid_status`-ით
   დაუბრუნებდა. კლასიფიკატორი მედიაზე გლობალური ჟანრია (slug), დანარჩენზე —
   **მფლობელის** ჟანრი/კატეგორია/ტიპი (id). ყოველი ქვე-ფორმა თავის
   კომპონენტშია: hook-ები პირობით ვერ გამოიძახება.

   ⚠️ **პლეილისტს (§40.13) მხოლოდ „ყველა" და „კონკრეტული" აქვს** —
   რჩეული, სტატუსი და კლასიფიკატორი მას არ აქვს (`shareModes()`), შიგნით კი
   მისი ყველა სიმღერა ჩანს, პირადიც — ეს სათაურთან წითლად წერია.
   ============================================================ */

/** კლასიფიკატორის რეჟიმის სახელი — „ჟანრით" / „კატეგორიით" / „ტიპით" */
const CLASSIFIER_LABEL = {
  genre: 'share.scope.genre',
  category: 'share.scope.category',
  type: 'share.scope.type',
} as const satisfies Record<ShareClassifierKind, string>

interface ClassifierEntry {
  id: number
  name_ka: string
  name_en: string
  icon?: string | null
}

/** კლასიფიკატორიანი ეტაპი 2-ის დომენი — მედიის და პლეილისტის გარდა */
type ClassifiedDomain = Exclude<ShareDomainKey, MediaType | 'playlist'>

/**
 * **მფლობელის ლექსიკონი ყოველ ეტაპი 2-ის დომენზე.**
 *
 * ⚠️ ქეშის გასაღები **იგივეა, რასაც მოდულის გვერდი და `/dictionaries`
 * იყენებს** (`lib/dictionaries.tsx`) — ორი გასაღები ერთ სიაზე ორ ქეშს
 * დაბადებდა და აქ დამატებული ჟანრი ფანჯარაში არ გამოჩნდებოდა. რეესტრი
 * თვითონ აქ არ შემოდის: მას რვა რედაქტირების დიალოგი მოსდევს, ფანჯარას კი
 * მხოლოდ სია სჭირდება. ⚠️ `satisfies` ყოველ არა-მედია დომენს ითხოვს.
 */
const CLASSIFIER_SOURCE = {
  game: { queryKey: ['game-genres'], list: fetchGameGenres },
  book: { queryKey: ['book-genres'], list: fetchBookGenres },
  board_game: { queryKey: ['board-game-genres'], list: fetchBoardGameGenres },
  place: { queryKey: ['place-categories'], list: fetchPlaceCategories },
  video: { queryKey: ['video-types'], list: fetchVideoTypes },
  song: { queryKey: ['song-genres'], list: fetchSongGenres },
  bookmark: { queryKey: ['bookmark-categories'], list: fetchBookmarkCategories },
  course: { queryKey: ['course-categories'], list: fetchCourseCategories },
} satisfies Record<ClassifiedDomain, { queryKey: string[]; list: () => Promise<ClassifierEntry[]> }>

export function ShareScopeFields({
  domain,
  look,
  spec,
  genres,
  count,
  onChange,
}: {
  domain: ShareDomainKey
  /** სახელი, ხატულა, ფერი — `useShareDomains().look()` */
  look: ShareDomainLook
  spec: ShareDomainSpec
  /** მედიის გლობალური ჟანრები — მხოლოდ ფილმს/სერიალს/ანიმეს სჭირდება */
  genres: Genre[]
  /** ცოცხალი რიცხვი — `GET /share-links/preview` */
  count?: { total: number; private: number }
  onChange: (next: ShareDomainSpec) => void
}) {
  const { t } = useTranslation()
  const meta = shareMeta(domain)

  const patch = (next: Partial<ShareDomainSpec>) => onChange({ ...spec, ...next })

  const toggleStatus = (key: string) => {
    const current = spec.statuses ?? []
    patch({ statuses: current.includes(key) ? current.filter((k) => k !== key) : [...current, key] })
  }

  return (
    <div className="rounded-lg border border-border p-3" style={modAccent(look.color) ?? MODULE_ACCENT_FALLBACK}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="grid size-7 place-items-center rounded-md bg-[var(--mod-soft)]">
          <ModuleIcon name={look.icon} className="size-4 text-[var(--mod)]" />
        </span>
        <span className="font-medium">{look.label}</span>
        {/* ⚠️ პლეილისტის შიგნით ყველა სიმღერა ჩანს — „მხოლოდ საჯაროები" თვითონ პლეილისტს ეხება */}
        {domain === 'playlist' && <InfoHint critical={t('share.playlistRevealsSongs')} />}
        {count && (
          <span className="text-xs text-muted-foreground">
            {t('share.domainCount', { count: count.total })}
            {count.private > 0 && ` · ${t('share.domainPrivate', { count: count.private })}`}
          </span>
        )}
      </div>

      <RadioGroup
        value={spec.scope}
        onValueChange={(v) => patch({ scope: v as ShareScopeMode })}
        className="gap-2"
      >
        <ScopeRow value="all" active={spec.scope} label={t('share.scope.all')} />

        {meta.status !== null && (
          <ScopeRow value="status" active={spec.scope} label={t('share.scope.status')}>
            {meta.status === 'dictionary' ? (
              <DictionaryStatusChips domain={domain as StatusDomain} value={spec.statuses ?? []} onToggle={toggleStatus} />
            ) : (
              <EnumStatusChips domain={domain} value={spec.statuses ?? []} onToggle={toggleStatus} />
            )}
          </ScopeRow>
        )}

        {meta.favorite && <ScopeRow value="favorite" active={spec.scope} label={t('share.scope.favorite')} />}

        {meta.classifier !== null && (
        <ScopeRow value="genre" active={spec.scope} label={t(CLASSIFIER_LABEL[meta.classifier])}>
          {meta.global ? (
            <GenreSelect genres={genres} value={spec.genres ?? []} onChange={(next) => patch({ genres: next })} />
          ) : (
            <ClassifierChips
              domain={domain as ClassifiedDomain}
              value={spec.categories ?? []}
              onChange={(next) => patch({ categories: next })}
            />
          )}
          {/* ⚠️ „ყველა ერთდროულად" მხოლოდ pivot-ს აქვს აზრი (ჟანრები) — ერთ
              სვეტს ორი მნიშვნელობა ვერ ექნება; სამ ჟანრზე ხშირად ცარიელ სიას იძლევა */}
          {meta.multi && (
            <ChipRow className="mt-2">
              {(['any', 'all'] as const).map((mode) => (
                <Chip
                  key={mode}
                  active={(spec.genre_mode ?? 'any') === mode}
                  onClick={() => patch({ genre_mode: mode })}
                >
                  {t(`gallery.genreMode.${mode}`)}
                </Chip>
              ))}
            </ChipRow>
          )}
        </ScopeRow>
        )}

        <ScopeRow value="ids" active={spec.scope} label={t('share.scope.ids')}>
          {isMediaKey(domain) ? (
            <MediaRecordPicker
              types={[domain]}
              ids={{ ...emptyMediaIds(), [domain]: spec.ids ?? [] }}
              onChange={(_, next) => patch({ ids: next })}
              enabled={spec.scope === 'ids'}
            />
          ) : (
            <ShareRecordPicker
              domain={domain}
              value={spec.ids ?? []}
              placeholder={look.label}
              onChange={(next) => patch({ ids: next })}
            />
          )}
        </ScopeRow>
      </RadioGroup>

      <label className="mt-3 flex cursor-pointer items-start gap-2.5 text-sm">
        <Checkbox
          checked={!!spec.public_only}
          onCheckedChange={(v) => patch({ public_only: v === true })}
          className="mt-0.5"
        />
        <span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Globe2 className="size-3.5" />
            {t('share.publicOnly')}
          </span>
          <span className="block text-xs text-muted-foreground">{t('share.publicOnlyHint')}</span>
        </span>
      </label>
    </div>
  )
}

/** ლექსიკონის სტატუსები — სახელი **მფლობელისაა** (§6.4), გასაღები მიდის */
function DictionaryStatusChips({
  domain,
  value,
  onToggle,
}: {
  domain: StatusDomain
  value: string[]
  onToggle: (key: string) => void
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const statuses = useStatuses(domain).data ?? []

  return (
    <ChipRow>
      {statuses.map((s) => (
        <Chip key={s.key} active={value.includes(s.key)} onClick={() => onToggle(s.key)}>
          {statusName(s, lang)}
        </Chip>
      ))}
    </ChipRow>
  )
}

/**
 * enum-სტატუსები (თამაში · წიგნი · ადგილი · კურსი). ⚠️ სია `ENUM_STATUS_ROLE`-
 * დანაა — ის ყოველ სტატუსს ჩამოთვლის (`satisfies` სრულს ითხოვს) და კანონიკური
 * რიგით; ოთხი API-მოდულის `*_STATUSES` აქ მეორე წყარო იქნებოდა.
 */
function EnumStatusChips({
  domain,
  value,
  onToggle,
}: {
  domain: ShareDomainKey
  value: string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation()
  const keys = Object.keys((ENUM_STATUS_ROLE as Record<string, Record<string, string>>)[domain] ?? {})

  return (
    <ChipRow>
      {keys.map((key) => {
        const label = enumStatusKey(domain, key)

        return (
          <Chip key={key} active={value.includes(key)} onClick={() => onToggle(key)}>
            {label ? t(label) : key}
          </Chip>
        )
      })}
    </ChipRow>
  )
}

/** მფლობელის ჟანრი/კატეგორია/ტიპი — მიდის **id**, ხატია ლექსიკონის თავისი ხატულა */
function ClassifierChips({
  domain,
  value,
  onChange,
}: {
  domain: ClassifiedDomain
  value: number[]
  onChange: (next: number[]) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const source = CLASSIFIER_SOURCE[domain]
  const q = useQuery({ queryKey: source.queryKey, queryFn: source.list })
  const entries = q.data ?? []

  const toggle = (id: number) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  if (q.isLoading) return <p className="text-xs text-muted-foreground">{t('api.loading')}</p>
  if (!entries.length) return <p className="text-xs text-muted-foreground">{t('share.classifierEmpty')}</p>

  return (
    <ChipRow>
      {entries.map((e) => (
        <Chip
          key={e.id}
          active={value.includes(e.id)}
          icon={e.icon ? <ModuleIcon name={e.icon} className="size-3.5" /> : undefined}
          onClick={() => toggle(e.id)}
        >
          {(lang === 'ka' ? e.name_ka || e.name_en : e.name_en || e.name_ka) || `#${e.id}`}
        </Chip>
      ))}
    </ChipRow>
  )
}

/**
 * **„კონკრეტული ჩანაწერები" ეტაპი 2-ის დომენებზე** — ერთი endpoint რვაზე
 * (`GET /share-links/records`): მოდულების `index`-ებს რვა სხვადასხვა ფორმა
 * აქვთ, სათაური კი სერვერზე ერთი წესით იწყობა (`ShareDomain::titleOf()`).
 */
function ShareRecordPicker({
  domain,
  value,
  placeholder,
  onChange,
}: {
  domain: ShareDomainKey
  value: number[]
  placeholder: string
  onChange: (next: number[]) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const q = useQuery({ queryKey: ['share-records', domain], queryFn: () => fetchShareRecords(domain) })

  const items = (q.data ?? []).map((r) => {
    const title = (lang === 'ka' ? r.title_ka || r.title_en : r.title_en || r.title_ka) || `#${r.id}`
    return { id: r.id, label: r.year ? `${title} (${r.year})` : title }
  })

  return (
    <IdMultiSelect
      items={items}
      value={value}
      onChange={onChange}
      placeholder={q.isLoading ? t('api.loading') : placeholder}
    />
  )
}
