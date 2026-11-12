import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, MoveRight, Unlink, X } from 'lucide-react'
import {
  fetchGalleryGroups,
  fetchPhotoPlacement,
  galleryParentsOf,
  moveGalleryImages,
  type GalleryParentKind,
} from '@/api/gallery'
import { searchCastMembers } from '@/api/cast'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalFooter, ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlbumPicker } from '@/components/gallery/AlbumPicker'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ფოტოს გადატანა.**

   შენი სიტყვები: „ფოტოებზე შეიძლებოდეს გადაიტანო სხვადასხვა რამეზე — იმ
   უკატეგორიოზე, ასევე უკატეგორიოში რაიმე კონკრეტულ ჯგუფში, ან მსახიობზე,
   ან სერიალზე, ან რამე მსგავსები".

   ⚠️ **ორი ღერძია და ორივე არჩევითია**: „რომელ ჩანაწერზე ჰკიდია" და „რომელ
   ალბომშია". ისინი **ცალ-ცალკე იგზავნება** — გამოტოვებული ღერძი ხელუხლებელი
   რჩება. ერთად რომ წასულიყო, ალბომში ჩაგდება ჩუმად ფილმისგან მოხსნას ნიშნავდა.

   ⚠️ **ზემოთ წერია „ახლა სად არის"** (`GET /gallery/images/placement`) და მოქმედება
   მხოლოდ მაშინ ჩანს, როცა აზრი აქვს: „ჩანაწერიდან მოხსნა" — მხოლოდ ჩანაწერზე
   მიბმულ ფოტოზე, „ალბომიდან ამოღება" — მხოლოდ ალბომში მყოფზე. მოხსნის ქვეშ წერია,
   სად იპოვი ფოტოს მერე (ალბომში, ან „მიუბმელ" ჭრილში).

   ⚠️ **ნაგულისხმევი „ჩანაწერი არ შეიცვალოს"-ია**: „მოხსნა" ნაგულისხმევად ერთი
   დაჭერით „გადატანას" ფოტოს დაკარგვად აქცევდა.

   ⚠️ **ჩანაწერების სია `by=record&have=all`-იდან მოდის** და არა თითო
   მოდულის `index()`-იდან: ესაა ერთადერთი endpoint, რომელიც ექვსივე
   მშობელს ერთი ფორმით აბრუნებს (და უფოტოებსაც — სწორედ მათზე გინდა
   ხოლმე ფოტოს გადატანა).

   ⚠️ **მსახიობი ძებნით მოდის და არა სიით** — `cast_members` გლობალური
   ლექსიკონია, ე.ი. სრული სია ათასობით რიგია; `GET /cast/search` უკვე
   არსებობს და ორივე ენაზე ეძებს.

   ⚠️ **მსახიობისა და ჩანაწერის გვერდი ფანჯარას `keep`-ით ხსნის**:
   იქ ფოტო სწორედ იმ გვერდს ეკუთვნის, რომელსაც უყურებ. `keep`-ზე ღილაკი მანამდე
   გამორთულია, სანამ ალბომს არ აირჩევ (`ready`), ე.ი. ცხადი არჩევანის გარეშე
   არაფერი იცვლება.
   ============================================================ */

/** სად ეკიდოს: `keep` — ჩანაწერი ხელუხლებელია · `none` — ჩანაწერიდან მოხსნა */
export type MoveTarget = 'keep' | 'none' | 'record' | 'actor'

export function GalleryMoveDialog({
  ids,
  onClose,
  onMoved,
  initialTarget = 'keep',
}: {
  /** რომელი ფოტოები გადადის */
  ids: number[]
  onClose: () => void
  onMoved?: () => void
  /** რომელი ვარიანტი იყოს თავიდან არჩეული */
  initialTarget?: MoveTarget
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const { enabled, all } = useModules()

  const [target, setTarget] = useState<MoveTarget>(initialTarget)
  const [domain, setDomain] = useState<GalleryParentKind>('movie')
  const [recordId, setRecordId] = useState<number[]>([])
  const [actorQuery, setActorQuery] = useState('')
  const [actorId, setActorId] = useState<number[]>([])
  /** `''` = ალბომი არ იცვლება · `none` = ალბომიდან ამოღება · რიცხვი = ალბომი */
  const [album, setAlbum] = useState<string>('')

  /* „ახლა სად არის" — რამდენი ფოტო ჰკიდია ჩანაწერზე და რამდენია ალბომში.
     ⚠️ პასუხამდე ორივე მოქმედება ჩანს: დამალული ღილაკი, რომელიც წამის შემდეგ ჩნდება,
     ფანჯარას ახტუნებდა. */
  const placementQ = useQuery({
    queryKey: ['gallery-placement', ids],
    queryFn: () => fetchPhotoPlacement(ids),
  })
  const placement = placementQ.data
  const attached = placement ? placement.attached > 0 : true
  const inAlbum = placement ? placement.in_album > 0 : true

  // პირადი მოდულის ჩანაწერზეც შეიძლება გადატანა
  const parents = useMemo(
    () =>
      galleryParentsOf(enabled).map(({ key, module }) => ({
        key,
        label: moduleName(module, i18n.language),
      })),
    [enabled, i18n.language],
  )

  /* ⚠️ არჩეული მშობელი სიაში უნდა იყოს — ნაგულისხმევი `movie` იმ ანგარიშზე,
     სადაც ფილმები გამორთულია (მაგ. მხოლოდ პირადი მოდული აქვს),
     ცარიელ ჩამონათვალს და არარსებულ ტიპს გაგზავნიდა. */
  const current: GalleryParentKind = parents.some((p) => p.key === domain) ? domain : (parents[0]?.key ?? domain)

  const recordsQ = useQuery({
    queryKey: ['gallery-groups', 'record', { type: current, have: 'all', previews: 0 }],
    queryFn: () => fetchGalleryGroups('record', { type: current, have: 'all', previews: 0 }),
    enabled: target === 'record',
  })

  /* ⚠️ ძებნა **ცხადი ტექსტით** იწყება: ორ ასოზე მოკლე მოთხოვნა TMDB-საც
     ეკითხება, ე.ი. ყოველი კლავიშისთვის გარე გამოძახება იქნებოდა. */
  const actorsQ = useQuery({
    queryKey: ['cast-search', actorQuery],
    queryFn: () => searchCastMembers(actorQuery),
    enabled: target === 'actor' && actorQuery.trim().length >= 2,
  })

  const move = useMutation({
    mutationFn: () =>
      moveGalleryImages({
        ids,
        target:
          target === 'none'
            ? 'none'
            : target === 'record' && recordId[0]
              ? `${current}:${recordId[0]}`
              : target === 'actor' && actorId[0]
                ? `cast_member:${actorId[0]}`
                : undefined,
        // ⚠️ `''` = „არ მიეკაროს"; გასაღები საერთოდ არ იგზავნება
        ...(album === '' ? {} : { album_id: album === 'none' ? null : Number(album) }),
      }),
    onSuccess: (res) => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums', 'gallery-placement'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.moved', { count: res.moved }), variant: 'success' })
      onMoved?.()
      onClose()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** მიზანი შევსებულია? („ალბომის შეცვლა" მარტოც კანონიერია) */
  const ready =
    (target === 'keep' && album !== '') ||
    target === 'none' ||
    (target === 'record' && recordId.length > 0) ||
    (target === 'actor' && actorId.length > 0)

  /** მოხსნის შემდეგ ფოტო ალბომში იქნება? — ახალი არჩევანით, ან დღევანდელით */
  const staysInAlbum = album === '' ? inAlbum && !!placement?.in_album : album !== 'none'

  /** „ახლა სად არის" — ჩანაწერის (მსახიობის) ხაზი */
  const recordLine = () => {
    if (!placement) return null
    if (!placement.attached) return t('gallery.moveNow.recordNone')
    if (!placement.record) return t('gallery.moveNow.records', { count: placement.attached })

    const name = (lang === 'ka' ? placement.record.title_ka : null) ?? placement.record.title ?? placement.record.title_ka ?? `#${placement.record.id}`
    if (placement.record.kind === 'actor') return t('gallery.moveNow.actor', { name })

    const module = all.find((m) => m.key === placement.record!.kind)
    return t('gallery.moveNow.record', { module: module ? moduleName(module, i18n.language) : placement.record.kind, name })
  }

  const albumLine = () => {
    if (!placement) return null
    if (!placement.in_album) return t('gallery.moveNow.albumNone')
    return placement.album ? t('gallery.moveNow.album', { name: placement.album.name }) : t('gallery.moveNow.albums', { count: placement.in_album })
  }

  return (
    <ModalShell
      title={t('gallery.moveTitle', { count: ids.length })}
      onClose={onClose} hint={t('gallery.moveHint')}>

      {/* ---------- ახლა სად არის ---------- */}
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm" data-testid="move-now">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <MapPin className="size-3.5" />
          {t('gallery.moveNow.title')}
        </p>
        {placement ? (
          <>
            <p>{recordLine()}</p>
            <p>{albumLine()}</p>
          </>
        ) : (
          <p className="text-muted-foreground">{t('api.loading')}</p>
        )}
      </div>

      {/* ---------- 1. ჩანაწერი ან მსახიობი ---------- */}
      <Label className="mb-2 block">{t('gallery.moveTarget')}</Label>
      <RadioGroup value={target} onValueChange={(v) => setTarget(v as MoveTarget)} className="gap-2">
        <Row value="keep" active={target === 'keep'} label={t('gallery.moveKeepRecord')} />
        {/* მოხსნა — მხოლოდ იმ ფოტოზე, რომელიც რამეზე ჰკიდია */}
        {attached && (
          <Row
            value="none"
            active={target === 'none'}
            label={t('gallery.moveDetach')}
            icon={<Unlink className="size-4 text-muted-foreground" />}
          >
            {target === 'none' && (
              <p className="mt-2 text-xs text-muted-foreground" data-testid="move-detach-note">
                {t(staysInAlbum ? 'gallery.moveDetachToAlbum' : 'gallery.moveDetachToLoose')}
              </p>
            )}
          </Row>
        )}

        <Row value="record" active={target === 'record'} label={t('gallery.moveToRecord')}>
          {target === 'record' && (
            <div className="mt-2 space-y-2">
              <Select value={current} onValueChange={(v) => { setDomain(v as GalleryParentKind); setRecordId([]) }}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {parents.map((parent) => (
                    <SelectItem key={parent.key} value={parent.key}>
                      {parent.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <IdMultiSelect
                items={(recordsQ.data?.groups ?? []).map((group) => ({
                  id: group.id,
                  label:
                    (lang === 'ka'
                      ? group.title_ka || group.title
                      : group.title || group.title_ka) || `#${group.id}`,
                }))}
                // ⚠️ ერთი მიზანი — ბოლო არჩეული რჩება
                value={recordId.slice(-1)}
                onChange={(next) => setRecordId(next.slice(-1))}
                placeholder={recordsQ.isLoading ? t('api.loading') : t('gallery.movePickRecord')}
              />
            </div>
          )}
        </Row>

        <Row value="actor" active={target === 'actor'} label={t('gallery.moveToActor')}>
          {target === 'actor' && (
            <div className="mt-2 space-y-2">
              <Input
                value={actorQuery}
                onChange={(e) => setActorQuery(e.target.value)}
                placeholder={t('gallery.moveFindActor')}
              />
              <IdMultiSelect
                /* ⚠️ **TMDB-ის რიგებს `id` არ აქვთ** (ჯერ ლოკალურ ლექსიკონში
                   არ შემოსულან), ე.ი. მათზე გადატანა შეუძლებელია — სიიდან
                   საერთოდ ამოდიან, ნაცვლად იმისა, რომ „0"-ზე გადავიტანოთ. */
                items={(actorsQ.data?.items ?? [])
                  .filter((row) => row.id != null)
                  .map((row) => ({ id: row.id as number, label: row.name_ka || row.name }))}
                value={actorId.slice(-1)}
                onChange={(next) => setActorId(next.slice(-1))}
                placeholder={actorsQ.isLoading ? t('api.loading') : t('gallery.movePickActor')}
              />
            </div>
          )}
        </Row>
      </RadioGroup>

      {/* ---------- 2. ალბომი ----------
          ⚠️ **სია და არა ჩამოსაშლელი** (შენი მითითება, 2026-09-16): ალბომები
          გადატანისასვე უნდა ჩანდეს და ახალიც იქვე იქმნებოდეს — „ფაილ
          მენეჯერივით". `Select` მხოლოდ **არსებულს** სთავაზობდა, ე.ი. სანამ
          პირველ ალბომს შექმნიდი, ეს ღერძი ცარიელი იყო. იხ. `AlbumPicker`. */}
      <div className="mt-4 border-t border-border pt-4">
        <Label className="mb-2 block">{t('gallery.moveAlbum')}</Label>
        <AlbumPicker value={album} onChange={setAlbum} allowRemove={inAlbum} />
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          <X className="size-4" />
          {t('actions.cancel')}
        </Button>
        <Button disabled={!ready || move.isPending} onClick={() => move.mutate()}>
          <MoveRight className="size-4" />
          {t('gallery.move')}
        </Button>
      </ModalFooter>
    </ModalShell>
  )
}

function Row({
  value,
  active,
  label,
  icon,
  children,
}: {
  value: string
  active: boolean
  label: string
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div className={`rounded-md border p-3 transition-colors ${active ? 'border-primary bg-secondary/40' : 'border-border'}`}>
      <label className="flex cursor-pointer items-center gap-3">
        <RadioGroupItem value={value} />
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </label>
      {children}
    </div>
  )
}
