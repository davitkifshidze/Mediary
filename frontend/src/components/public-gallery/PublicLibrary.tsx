import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  fetchPublicGalleryGroups,
  type PublicGalleryGroup,
  type PublicGalleryPhotoFilters,
  type PublicProfile,
} from '@/api/publicProfile'
import { GALLERY_PARENTS, type GalleryParentKind } from '@/api/gallery'
import { isMediaKey } from '@/lib/modules'
import type { MediaType } from '@/lib/media'
import { useContentLang } from '@/lib/settings'
import { CutTabs } from '@/components/ui/cut-tabs'
import { EmptyState } from '@/components/ui/empty-state'
import { InfoHint } from '@/components/ui/info-hint'
import { ModuleIcon } from '@/components/ModuleIcon'
import { LayoutToggle, type GalleryLayout } from '@/components/gallery/LayoutToggle'
import { PublicGroupGrid } from '@/components/public-gallery/PublicGroupGrid'
import { groupTitle } from '@/components/public-gallery/groupTitle'
import { PublicPhotoList } from '@/components/public-gallery/PublicPhotoList'

/* ============================================================
   **საჯარო „ბიბლიოთეკა" — ჩანაწერები და მათი მსახიობები** (Tasks §32.2).

   მფლობელის `RecordsCut`-ის სტრუქტურა: დომენის ბარათები (ყველა · ფილმები ·
   სერიალები · …), მედია-დომენზე „ჩანაწერები / მსახიობები" გადამრთველი,
   მსახიობებზე სქესის ბარათები, და ყველგან „დაჯგუფებული / არეული".

   ⚠️ **დომენები პროფილიდან მოდის და არა `useModules()`-იდან**: სტუმარს
   მოდულების კონტექსტი არ აქვს (გვერდი `Protected`-ის გარეთაა), ხოლო სწორი
   კითხვა ისედაც „რომელია **ამ პროფილზე** საჯარო" და არა „რა მაქვს მე".
   სახელი, ხატულა და ფერი პროფილის `modules`-იდანაა — იგივე, რასაც
   მფლობელი საიდბარში ხედავს.

   ⚠️ **ჯგუფი ჩანაწერის საკუთარი ფოტოებია** — მფლობელის გალერეისგან
   განსხვავებით, სადაც შიგნით მისი მსახიობებიც ერევა. ბარათზე „12 ფოტო"
   წერია და შიგნითაც თორმეტია; ფილმის მსახიობები იმავე დომენის
   „მსახიობების" ჩანართშია.

   ⚠️ **ბარათების რიცხვი ფასეტურია** (`facets.types`, ცალკე მოთხოვნით
   ესკიზების გარეშე) — ერთი დომენის არჩევისთანავე სხვები ნულზე რომ არ
   ჩამოვიდნენ (§24.4-ის წესი).
   ============================================================ */

type Gender = 'all' | 'female' | 'male'

export function PublicLibrary({
  username,
  profile,
  onLocked,
}: {
  username: string
  profile: PublicProfile
  onLocked: (albumId: number) => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)

  const [domain, setDomain] = useState<GalleryParentKind | 'all'>('all')
  const [tab, setTab] = useState<'records' | 'actors'>('records')
  const [gender, setGender] = useState<Gender>('all')
  const [layout, setLayout] = useState<GalleryLayout>('grouped')
  const [open, setOpen] = useState<PublicGalleryGroup | null>(null)

  /** ამ პროფილზე საჯარო ჩანაწერის დომენები — `GalleryParent`-ის რიგით */
  const parents = useMemo(
    () =>
      GALLERY_PARENTS.filter((key) => profile.domains.includes(key)).map((key) => {
        const module = profile.modules[profile.domain_modules[key] ?? key]
        return {
          key,
          label: module ? (lang === 'ka' ? module.name_ka : module.name_en) : key,
          color: module?.color ?? null,
          icon: module?.icon ?? null,
        }
      }),
    [profile, lang],
  )

  /* ⚠️ **ერთი დომენი = ის დომენი და არა „ყველა"** (ტესტმა იპოვა): ერთ
     დომენზე ბარათები არ იხატება, ე.ი. არჩევა შეუძლებელია — `all`-ზე რომ
     დარჩენილიყო, „ფილმები / მსახიობები" გადამრთველი არასდროს გამოჩნდებოდა
     და მსახიობებამდე მისვლა საერთოდ ვერ მოხერხდებოდა. მფლობელს ცალკე
     „მსახიობების" ჭრილი აქვს, საჯარო გვერდს — არა. */
  const active: GalleryParentKind | 'all' = parents.some((p) => p.key === domain)
    ? domain
    : parents.length === 1
      ? parents[0].key
      : 'all'
  const showActors = isMediaKey(active)
  const onActors = showActors && tab === 'actors'

  const facetsQ = useQuery({
    queryKey: ['public-gallery', username, 'groups', 'record', { previews: 0 }],
    queryFn: () => fetchPublicGalleryGroups(username, 'record', { previews: 0 }),
    enabled: parents.length > 0,
  })

  const groupQuery = onActors
    ? ({ from: active as MediaType, gender: gender === 'all' ? undefined : gender } as const)
    : ({ type: active === 'all' ? undefined : active } as const)

  const groupsQ = useQuery({
    queryKey: ['public-gallery', username, 'groups', onActors ? 'actor' : 'record', groupQuery],
    queryFn: () => fetchPublicGalleryGroups(username, onActors ? 'actor' : 'record', groupQuery),
    enabled: parents.length > 0 && layout === 'grouped',
  })

  const counts = facetsQ.data?.facets?.types ?? {}
  const genderFacets = groupsQ.data?.facets?.gender

  if (!parents.length) {
    return <EmptyState title={t('publicProfile.gallery.emptyLibrary')} />
  }

  if (open) {
    return (
      <PublicPhotoList
        username={username}
        filters={{ owner: `${open.kind}:${open.id}` }}
        title={groupTitle(open, lang)}
        onBack={() => setOpen(null)}
        onLocked={onLocked}
      />
    )
  }

  /** „არეული" — იგივე სკოუპი ბრტყლად (მფლობელის `flatFilters`-ის წესი) */
  const flat: PublicGalleryPhotoFilters = onActors
    ? { parent: 'actor', from: active as MediaType }
    : { parent: 'record', type: active === 'all' ? undefined : active }

  return (
    <div className="space-y-4">
      {parents.length > 1 && (
        <CutTabs
          label={t('gallery.domainScope')}
          size="sm"
          layout="inline"
          options={[
            { key: 'all', label: t('filter.all'), count: counts.all },
            ...parents.map((parent) => ({
              key: parent.key,
              label: parent.label,
              count: counts[parent.key] ?? 0,
              color: parent.color,
              node: <ModuleIcon name={parent.icon ?? ''} className="size-4 text-[var(--mod)]" />,
            })),
          ]}
          value={active}
          onChange={(key) => {
            setDomain(key as GalleryParentKind | 'all')
            setTab('records')
          }}
        />
      )}

      {/* ⚠️ მარცხენა ბარათს მოდულის სახელი აწერია („ფილმები") და არა
          „ჩანაწერები" — მფლობელის `RecordsCut`-ის წესი */}
      {showActors && (
        <CutTabs
          size="sm"
          layout="inline"
          options={[
            {
              key: 'records',
              label: parents.find((p) => p.key === active)?.label ?? t('gallery.cut.records'),
              count: counts[active] ?? 0,
            },
            { key: 'actors', label: t('gallery.inner.actors') },
          ]}
          value={tab}
          onChange={(key) => setTab(key as 'records' | 'actors')}
        />
      )}

      {onActors && layout === 'grouped' && (
        <CutTabs
          label={t('gallery.castScope')}
          size="sm"
          layout="inline"
          options={(['all', 'female', 'male'] as const).map((key) => ({
            key,
            label: t(`gallery.cast.${key}`),
            count: genderFacets?.[key],
          }))}
          value={gender}
          onChange={(key) => setGender(key as Gender)}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!onActors && <InfoHint info={t('publicProfile.gallery.libraryHint')} />}
        <LayoutToggle className="ml-auto" value={layout} onChange={setLayout} />
      </div>

      {layout === 'mixed' ? (
        <PublicPhotoList
          /* ⚠️ `key` — ტაბის გადართვაზე „მეტის ჩვენებით" დაგროვილი სია ნულდება */
          key={`flat:${onActors ? 'actor' : 'record'}:${active}`}
          username={username}
          filters={flat}
          title={t('gallery.allPhotos')}
          hint={<InfoHint info={t('gallery.mixedHint')} />}
          showOwner
          onLocked={onLocked}
        />
      ) : (
        <PublicGroupGrid
          key={`${onActors ? 'actor' : 'record'}:${active}:${gender}`}
          groups={groupsQ.data?.groups ?? []}
          previews={groupsQ.data?.previews ?? {}}
          loading={groupsQ.isLoading}
          aspect={onActors ? 'portrait' : 'wide'}
          onOpen={setOpen}
          emptyText={t('publicProfile.gallery.empty')}
        />
      )}
    </div>
  )
}
