import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronsDownUp, ChevronsUpDown, Search, SlidersHorizontal, Star, X } from 'lucide-react'
import { fetchGenres } from '@/api/media'
import type { GalleryParentKind } from '@/api/gallery'
import { isMediaKey } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { statusName, useMergedStatuses } from '@/lib/statuses'
import {
  GALLERY_GROUP_SECTIONS,
  GALLERY_GROUP_SORTS,
  type GalleryGroupSection,
  type GalleryGroupSort,
} from '@/lib/galleryGroups'
import { Button } from '@/components/ui/button'
import { Chip, ChipRow } from '@/components/ui/chip'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { LayoutToggle } from '@/components/gallery/LayoutToggle'

/* ============================================================
   ჯგუფების ჭრილის ფილტრი, დალაგება და შიდა დაჯგუფება (ეტაპი 2).

   შენი სიტყვები: „უნდა შეგეძლოს შიდა დაჯგუფება და ფილტვრაც".

   ⚠️ **ჟანრი/სტატუსი/წელი მხოლოდ მედია-დომენზე ჩანს.** სიმღერას, წიგნსა და
   თამაშს სამნაირი ჟანრი აქვთ (თავისი ლექსიკონები), სტატუსი კი წიგნზე/თამაშზე
   ისევ enum-ია და სიმღერას საერთოდ არ აქვს — ე.ი. ერთი საერთო ფილტრი მათზე
   ან ცარიელ სიას დახატავდა, ან ჩუმად არაფერს გააკეთებდა. Backend-ზე იგივე
   წესია (`GalleryController::applyRecordFilters()`), ერთი და იმავე მიზეზით.

   ⚠️ **დამატებითი ფილტრები ნაგულისხმევად დაკეცილია, მაგრამ არჩეული
   მნიშვნელობები დაკეცილშიც ჩანს** — ჩიპებად, ჯვრით. ეს `FilterPanel`-ის
   §2.3-ის წესია: სამი არჩეული ჟანრი, რომელიც მხოლოდ გახსნისას ჩანს,
   „რატომ მაქვს ცარიელი სია" კითხვად იკითხება.
   ============================================================ */

export interface GroupFilterState {
  /**
   * **„დაჯგუფებული ↔ არეული" (§28).**
   *
   * ⚠️ ეს **ჭრილი არ არის** — ერთი და იგივე სკოუპის ორი გამოსახულებაა:
   * `grouped` დასტებია (თითო ჩანაწერი/მსახიობი ერთი ბარათი), `mixed` კი
   * იმავე სკოუპის ფოტოების ბრტყელი ბადე. სწორედ ესაა შენი „ან არეულად
   * ჩვენება, ან შეკრება".
   */
  layout: 'grouped' | 'mixed'
  q: string
  have: 'with' | 'without' | 'all'
  /** მძიმით გაყოფილი slug-ები (AND) */
  genre: string
  /** მძიმით გაყოფილი გასაღებები (OR) */
  status: string
  favorite: boolean
  yearMin: string
  yearMax: string
  sort: GalleryGroupSort
  section: GalleryGroupSection
}

export const EMPTY_GROUP_FILTERS: GroupFilterState = {
  layout: 'grouped',
  q: '',
  have: 'with',
  genre: '',
  status: '',
  favorite: false,
  yearMin: '',
  yearMax: '',
  sort: 'photos',
  section: 'none',
}

/** `"a,b"` ↔ `['a','b']` — ცარიელი სტრიქონი ცარიელი სიაა და არა `['']` */
const toList = (value: string): string[] => value.split(',').filter(Boolean)
const toValue = (list: string[]): string => list.join(',')

function toggle(value: string, item: string): string {
  const list = toList(value)

  return toValue(list.includes(item) ? list.filter((x) => x !== item) : [...list, item])
}

/** რამდენი ფილტრია ჩართული — ღილაკზე რიცხვად, რომ დაკეცილიც ჩანდეს */
export function activeFilterCount(value: GroupFilterState): number {
  return (
    toList(value.genre).length +
    toList(value.status).length +
    (value.favorite ? 1 : 0) +
    (value.yearMin ? 1 : 0) +
    (value.yearMax ? 1 : 0)
  )
}

export function GroupFilters({
  value,
  onChange,
  domains,
  showHave,
  sorts = GALLERY_GROUP_SORTS,
  showSections = true,
  showLayout = true,
  onCollapseAll,
  collapsed,
  extra,
}: {
  value: GroupFilterState
  onChange: (next: GroupFilterState) => void
  /** რომელი მედია-დომენების ჟანრი/სტატუსი ივარგებს; ცარიელი = ფილტრი არ ჩანს */
  domains: GalleryParentKind[]
  /** „ფოტოიანი/უფოტო" მხოლოდ ჩანაწერების ჭრილშია — მსახიობი უფოტოდ ჯგუფშიც არ ხვდება */
  showHave?: boolean
  /** რომელი დალაგებები ივარგებს — მსახიობზე „წელი" არაფერს ცვლის */
  sorts?: readonly GalleryGroupSort[]
  /** სექციებად დაყოფა მხოლოდ ჩანაწერებზეა (მსახიობს ჟანრი/წელი არ აქვს) */
  showSections?: boolean
  /**
   * „დაჯგუფებული / არეული" გადამრთველი (§28).
   *
   * ⚠️ **იქ არ იხატება, სადაც ბრტყელი ეკვივალენტი არ არსებობს**: „წყაროს"
   * და „მომწოდებლის" ჭრილში ჯგუფი მთელი დომენია, ე.ი. „არეული" იქ
   * ბიბლიოთეკის ყველა ფოტოს ნიშნავდა — სულ სხვა კითხვის პასუხს. ეს
   * პროექტის არსებული წესია: კონტროლი, რომელიც ტყუის, არ იხატება.
   */
  showLayout?: boolean
  /** სექციების ერთბაშად შეკრება/გაშლა — მხოლოდ მაშინ, როცა სექციები არსებობს */
  onCollapseAll?: () => void
  collapsed?: boolean
  /** ჭრილის საკუთარი კონტროლი (მაგ. სქესის რიგი მსახიობებზე) */
  extra?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const [open, setOpen] = useState(false)

  const mediaDomains = domains.filter(isMediaKey)
  const set = (patch: Partial<GroupFilterState>) => onChange({ ...value, ...patch })

  const genresQ = useQuery({
    queryKey: ['genres'],
    queryFn: () => fetchGenres(),
    enabled: mediaDomains.length > 0,
  })
  const statuses = useMergedStatuses(mediaDomains)

  const genreName = (slug: string) => {
    const genre = genresQ.data?.find((g) => g.slug === slug)

    if (!genre) return slug

    return (lang === 'ka' ? genre.name_ka || genre.name_en : genre.name_en || genre.name_ka) || slug
  }

  const count = activeFilterCount(value)

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value.q}
            onChange={(e) => set({ q: e.target.value })}
            placeholder={t('gallery.searchPlaceholder')}
            className="pl-8"
          />
        </div>

        {showHave && (
          <ChipRow>
            {(['with', 'without', 'all'] as const).map((key) => (
              <Chip key={key} active={value.have === key} onClick={() => set({ have: key })}>
                {t(`gallery.have.${key}`)}
              </Chip>
            ))}
          </ChipRow>
        )}

        {extra}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* ⚠️ **იგივე გადამრთველია, რაც მსახიობების ქვე-სექციაში** (§28.1):
              სელექტი და სეგმენტები ერთსა და იმავე არჩევანს ორნაირად
              გამოსახავდა და „სად იყო ეს?" კითხვად იკითხებოდა. */}
          {showLayout && (
            <LayoutToggle value={value.layout} onChange={(next) => set({ layout: next })} />
          )}
          <Pick
            label={t('gallery.groupSort.label')}
            value={value.sort}
            options={sorts.map((key) => ({ value: key, label: t(`gallery.groupSort.${key}`) }))}
            onChange={(next) => set({ sort: next as GalleryGroupSort })}
          />
          {showSections && (
          <Pick
            label={t('gallery.groupSection.label')}
            value={value.section}
            options={GALLERY_GROUP_SECTIONS.map((key) => ({ value: key, label: t(`gallery.groupSection.${key}`) }))}
            onChange={(next) => set({ section: next as GalleryGroupSection })}
          />
          )}
          {onCollapseAll && (
            <Button variant="outline" size="sm" onClick={onCollapseAll}>
              {collapsed ? (
                <ChevronsUpDown className="size-4" />
              ) : (
                <ChevronsDownUp className="size-4" />
              )}
              {t(collapsed ? 'gallery.expandAll' : 'gallery.collapseAll')}
            </Button>
          )}
          {mediaDomains.length > 0 && (
            <Button variant={open ? 'default' : 'outline'} size="sm" onClick={() => setOpen((o) => !o)}>
              <SlidersHorizontal className="size-4" />
              {t('gallery.moreFilters')}
              {count > 0 && <span className="tabular-nums">({count})</span>}
            </Button>
          )}
        </div>
      </div>

      {/* არჩეული — დაკეცილშიც ჩანს (§2.3-ის წესი) */}
      {count > 0 && (
        <ChipRow>
          {toList(value.genre).map((slug) => (
            <Chip key={slug} active icon={<X className="size-3" />} onClick={() => set({ genre: toggle(value.genre, slug) })}>
              {genreName(slug)}
            </Chip>
          ))}
          {toList(value.status).map((key) => (
            <Chip key={key} active icon={<X className="size-3" />} onClick={() => set({ status: toggle(value.status, key) })}>
              {statusName(statuses.find((s) => s.key === key), lang) || key}
            </Chip>
          ))}
          {value.favorite && (
            <Chip active icon={<X className="size-3" />} onClick={() => set({ favorite: false })}>
              {t('filter.favorite')}
            </Chip>
          )}
          {(value.yearMin || value.yearMax) && (
            <Chip active icon={<X className="size-3" />} onClick={() => set({ yearMin: '', yearMax: '' })}>
              {`${value.yearMin || '…'} – ${value.yearMax || '…'}`}
            </Chip>
          )}
        </ChipRow>
      )}

      {open && mediaDomains.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Group title={t('filter.genres')}>
            <ChipRow>
              {(genresQ.data ?? []).map((genre) => (
                <Chip
                  key={genre.slug}
                  active={toList(value.genre).includes(genre.slug)}
                  onClick={() => set({ genre: toggle(value.genre, genre.slug) })}
                >
                  {genreName(genre.slug)}
                </Chip>
              ))}
            </ChipRow>
          </Group>

          {statuses.length > 0 && (
            <Group title={t('filter.statuses')}>
              <ChipRow>
                {statuses.map((status) => (
                  <Chip
                    key={status.key}
                    active={toList(value.status).includes(status.key)}
                    onClick={() => set({ status: toggle(value.status, status.key) })}
                  >
                    {statusName(status, lang)}
                  </Chip>
                ))}
              </ChipRow>
            </Group>
          )}

          <Group title={t('filter.year')}>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                inputMode="numeric"
                value={value.yearMin}
                onChange={(e) => set({ yearMin: e.target.value })}
                placeholder={t('filter.from')}
                className="w-28"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="number"
                inputMode="numeric"
                value={value.yearMax}
                onChange={(e) => set({ yearMax: e.target.value })}
                placeholder={t('filter.to')}
                className="w-28"
              />
              <Chip active={value.favorite} icon={<Star className="size-3.5" />} onClick={() => set({ favorite: !value.favorite })}>
                {t('filter.favorite')}
              </Chip>
            </div>
          </Group>

          {count > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => set({ genre: '', status: '', favorite: false, yearMin: '', yearMax: '' })}
            >
              {t('filter.clear')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground">{title}</div>
      {children}
    </div>
  )
}

/** პატარა გადამრჩევი — „დალაგება" და „დაჯგუფება" ერთნაირად გამოიყურება */
function Pick({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (next: string) => void
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="hidden sm:inline">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-auto min-w-36 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  )
}
