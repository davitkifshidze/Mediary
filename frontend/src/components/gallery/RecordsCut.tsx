import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GALLERY_PARENTS, type GalleryGroup, type GalleryParentKind } from '@/api/gallery'
import { isMediaKey, moduleName, useModules } from '@/lib/modules'
import type { MediaType } from '@/lib/media'
import { Chip, ChipRow } from '@/components/ui/chip'
import { EmptyState } from '@/components/ui/empty-state'
import { GroupsCut } from '@/components/gallery/GroupsCut'

/* ============================================================
   ჩანაწერების ჭრილი — **დომენის ტაბები და მსახიობები შიგნით** (ეტაპი 2).

   შენი სიტყვები: „ჩანაწერის გალერეა არა — ფილმების გალერეა, სადაც უნდა
   იყოს როგორც ფილმები ასევე მსახიობები შიგნით".

   ⚠️ **აქამდე „ჩანაწერები" და „მსახიობები" ორი დამოუკიდებელი ჭრილი იყო** და
   ფილმის მსახიობებამდე მისასვლელად გვერდითა მენიუში ჭრილის გამოცვლა
   გჭირდებოდა — ე.ი. „ფილმების გალერეა" ორ სხვადასხვა ადგილას იყო გაყოფილი.
   ახლა დომენის ტაბს თავისი „ჩანაწერები / მსახიობები" გადამრთველი აქვს.
   ცალკე „მსახიობების" ჭრილი **რჩება**: ის ბიბლიოთეკის ყველა მსახიობია,
   დომენის გარეშე.

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
        label: moduleName(enabled.find((m) => m.key === key)!, i18n.language),
      })),
    [enabled, i18n.language],
  )

  if (!parents.length) {
    return <EmptyState title={t('gallery.needsMediaModule')} />
  }

  const active: GalleryParentKind | 'all' = parents.some((p) => p.key === domain) ? domain : 'all'
  const showActors = isMediaKey(active)
  const onActors = showActors && tab === 'actors'

  return (
    <div>
      {/* ---------- დომენის ტაბები ---------- */}
      {parents.length > 1 && (
        <ChipRow className="mb-3">
          <Chip active={active === 'all'} onClick={() => setDomain('all')}>
            {t('filter.all')}
          </Chip>
          {parents.map((parent) => (
            <Chip key={parent.key} active={active === parent.key} onClick={() => setDomain(parent.key)}>
              {parent.label}
            </Chip>
          ))}
        </ChipRow>
      )}

      {/* ---------- ჩანაწერები / მსახიობები ----------
          ⚠️ მარცხენა გადამრთველს **მოდულის სახელი** აწერია („ფილმები") და
          არა „ჩანაწერები": სწორედ ეს სიტყვა იყო შენი შენიშვნა. */}
      {showActors && (
        <ChipRow className="mb-4">
          <Chip active={tab === 'records'} onClick={() => setTab('records')}>
            {parents.find((p) => p.key === active)?.label ?? t('gallery.cut.records')}
          </Chip>
          <Chip active={tab === 'actors'} onClick={() => setTab('actors')}>
            {t('gallery.inner.actors')}
          </Chip>
        </ChipRow>
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
