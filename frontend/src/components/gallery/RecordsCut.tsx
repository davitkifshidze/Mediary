import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  fetchGalleryGroups,
  GALLERY_PARENTS,
  type GalleryGroup,
  type GalleryParentKind,
} from '@/api/gallery'
import { isMediaKey, moduleName, useModules } from '@/lib/modules'
import type { MediaType } from '@/lib/media'
import { EmptyState } from '@/components/ui/empty-state'
import { ModuleIcon } from '@/components/ModuleIcon'
import { GroupsCut } from '@/components/gallery/GroupsCut'
import { GalleryScope } from '@/components/gallery/GalleryScope'

/* ============================================================
   ბიბლიოთეკის ჭრილი — **დომენის ბარათები და მსახიობები შიგნით**.

   შენი სიტყვები (ეტაპი 2): „ჩანაწერის გალერეა არა — ფილმების გალერეა,
   სადაც უნდა იყოს როგორც ფილმები ასევე მსახიობები შიგნით".

   ⚠️ **აქამდე „ჩანაწერები" და „მსახიობები" ორი დამოუკიდებელი ჭრილი იყო** და
   ფილმის მსახიობებამდე მისასვლელად გვერდითა მენიუში ჭრილის გამოცვლა
   გჭირდებოდა — ე.ი. „ფილმების გალერეა" ორ სხვადასხვა ადგილას იყო გაყოფილი.
   ცალკე „მსახიობების" ჭრილი **რჩება**: ის ბიბლიოთეკის ყველა მსახიობია,
   დომენის გარეშე.

   ## §24.4/§27 (2026-09-15)
   ⚠️ **ჩიპების ნაცვლად ბარათებია, თითოს თავისი რიცხვით** — იგივე ვიზუალი,
   რაც აუდიტ-ლოგს აქვს, და სწორედ ისაა შენი შენიშვნის პასუხი: „რაღაც
   ყველაფერი მოდის და რაღაც არ მომწონს, მინდა უფრო დახარისხებული იყოს".
   ტაბი, რომელიც არ ამბობს რამდენი ჩანაწერია შიგნით, არჩევამდე არაფერს
   გეუბნება.

   ⚠️ **რიცხვი ფასეტურია**: სერვერი მას **დომენის ფილტრის გარეშე** ითვლის
   (`GalleryGroups.facets.types`), თორემ ერთი დომენის არჩევისთანავე
   დანარჩენები ნულზე ჩამოვიდოდა — აუდიტის `summary()`-ის იგივე წესი.

   ⚠️ **ტაბები `useModules()`-იდან იგება და არა ხელით დაწერილი სიიდან** —
   გამორთულ მოდულს ტაბი არ უნდა ჰქონდეს, სახელი კი ის უნდა იყოს, რასაც
   საიდბარი ხატავს (`modules.name_ka/name_en`). სია `GALLERY_PARENTS`-ით
   იჭრება, რომ თანმიმდევრობა backend-ის `GalleryParent`-ს დაემთხვეს.

   ⚠️ **მსახიობების ტაბი მხოლოდ მედია-დომენზეა**: „ვინც ამ დომენში თამაშობს"
   `cast_members`-ის რელაციით ითვლება, რომელიც სიმღერას/წიგნს/თამაშს არ აქვს.
   ============================================================ */

export function RecordsCut({
  onDownloadRecord,
  onDownloadActor,
}: {
  onDownloadRecord?: (group: GalleryGroup) => void
  onDownloadActor?: (group: GalleryGroup) => void
}) {
  const { t, i18n } = useTranslation()
  const { enabled } = useModules()
  const [domain, setDomain] = useState<GalleryParentKind | 'all'>('all')
  const [tab, setTab] = useState<'records' | 'actors'>('records')

  const parents = useMemo(
    () =>
      GALLERY_PARENTS.filter((key) => enabled.some((m) => m.key === key)).map((key) => ({
        key,
        module: enabled.find((m) => m.key === key)!,
        label: moduleName(enabled.find((m) => m.key === key)!, i18n.language),
      })),
    [enabled, i18n.language],
  )

  /* ⚠️ **მთვლელებისთვის ცალკე, ფილტრის გარეშე მოთხოვნა** (`previews: 0`).
     ბარათებს დომენების სრული სურათი სჭირდებათ, ჯგუფების სია კი უკვე
     გაფილტრულია — ერთმანეთში რომ აგვერია, არჩეული დომენის გარდა ყველა
     ბარათი ნულს აჩვენებდა. ესკიზები აქ არ იკითხება, ე.ი. ეს იაფი
     მოთხოვნაა და იმავე ქეშში ზის, რასაც „ყველა" ტაბი ისედაც კითხულობს. */
  const facetsQ = useQuery({
    queryKey: ['gallery-groups', 'record', { previews: 0, have: 'with' }],
    queryFn: () => fetchGalleryGroups('record', { previews: 0, have: 'with' }),
  })

  const counts = facetsQ.data?.facets?.types ?? {}

  if (!parents.length) {
    return <EmptyState title={t('gallery.needsMediaModule')} />
  }

  const active: GalleryParentKind | 'all' = parents.some((p) => p.key === domain) ? domain : 'all'
  const showActors = isMediaKey(active)
  const onActors = showActors && tab === 'actors'

  return (
    <div>
      {/* ---------- დომენის ბარათები ---------- */}
      {parents.length > 1 && (
        <div className="mb-4">
          <GalleryScope
            label={t('gallery.domainScope')}
            options={[
              { key: 'all', label: t('filter.all'), count: counts.all },
              ...parents.map((parent) => ({
                key: parent.key,
                label: parent.label,
                count: counts[parent.key] ?? 0,
                color: parent.module.color ?? null,
                // მოდულის თავისი ხატულა — იგივე, რასაც საიდბარი ხატავს
                node: <ModuleIcon name={parent.module.icon} className="size-4 text-[var(--mod)]" />,
              })),
            ]}
            value={active}
            onChange={(key) => setDomain(key as GalleryParentKind | 'all')}
          />
        </div>
      )}

      {/* ---------- ჩანაწერები / მსახიობები ----------
          ⚠️ მარცხენა ბარათს **მოდულის სახელი** აწერია („ფილმები") და არა
          „ჩანაწერები": სწორედ ეს სიტყვა იყო შენი შენიშვნა. */}
      {showActors && (
        <div className="mb-4">
          <GalleryScope
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
        </div>
      )}

      {/* ⚠️ **`key` განზრახაა — ტაბის გადართვა ფილტრს ანულებს.** ორივე
          განშტოება ერთი და იგივე კომპონენტია, ე.ი. React მას ხელახლა არ
          ქმნის: „ფილმებზე" არჩეული ჟანრი სიმღერების ტაბზე გადმოყვებოდა,
          სადაც ჟანრის ფილტრი საერთოდ არ მოქმედებს — ე.ი. ჩიპი ეწერებოდა
          და არაფერს ჭრიდა. */}
      {onActors ? (
        <GroupsCut
          key={`actor:${active}`}
          by="actor"
          from={active as MediaType}
          onDownloadRecord={onDownloadRecord}
          onDownloadActor={onDownloadActor}
        />
      ) : (
        <GroupsCut
          key={`record:${active}`}
          by="record"
          type={active === 'all' ? undefined : active}
          /* ფილტრის ჟანრი/სტატუსი იმ დომენებს ეკითხება, რომლებიც ეკრანზეა:
             ერთი ტაბი — ერთი დომენი, „ყველა" — ყველა ჩართული */
          domains={active === 'all' ? parents.map((p) => p.key) : [active]}
          onDownloadRecord={onDownloadRecord}
          onDownloadActor={onDownloadActor}
        />
      )}
    </div>
  )
}
