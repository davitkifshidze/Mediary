import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, MoveRight } from 'lucide-react'
import {
  fetchGalleryAlbums,
  fetchGalleryGroups,
  moveGalleryImages,
  GALLERY_PARENTS,
  type GalleryParentKind,
} from '@/api/gallery'
import { searchCastMembers } from '@/api/cast'
import { errorMessage } from '@/lib/errors'
import { moduleName, useModules } from '@/lib/modules'
import { useContentLang } from '@/lib/settings'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ModalShell } from '@/components/ui/modal-shell'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IdMultiSelect } from '@/components/MovieMultiSelect'
import { useToast } from '@/components/ui/feedback'

/* ============================================================
   **ფოტოს გადატანა (Tasks §26.3).**

   შენი სიტყვები: „ფოტოებზე შეიძლებოდეს გადაიტანო სხვადასხვა რამეზე — იმ
   უკატეგორიოზე, ასევე უკატეგორიოში რაიმე კონკრეტულ ჯგუფში, ან მსახიობზე,
   ან სერიალზე, ან რამე მსგავსები".

   ⚠️ **ორი ღერძია და ორივე არჩევითია**: „სად ეკიდოს" (მშობელი) და „რომელ
   ჯგუფშია" (ალბომი). ისინი **ცალ-ცალკე იგზავნება** — გამოტოვებული ღერძი
   ხელუხლებელი რჩება. ერთად რომ წასულიყო, ალბომში ჩაგდება ჩუმად ფილმისგან
   მოხსნას ნიშნავდა.

   ⚠️ **ჩანაწერების სია `by=record&have=all`-იდან მოდის** და არა თითო
   მოდულის `index()`-იდან: ესაა ერთადერთი endpoint, რომელიც ექვსივე
   მშობელს ერთი ფორმით აბრუნებს (და უფოტოებსაც — სწორედ მათზე გინდა
   ხოლმე ფოტოს გადატანა).

   ⚠️ **მსახიობი ძებნით მოდის და არა სიით** — `cast_members` გლობალური
   ლექსიკონია, ე.ი. სრული სია ათასობით რიგია; `GET /cast/search` უკვე
   არსებობს და ორივე ენაზე ეძებს.
   ============================================================ */

type Target = 'keep' | 'none' | 'record' | 'actor'

export function GalleryMoveDialog({
  ids,
  onClose,
  onMoved,
}: {
  /** რომელი ფოტოები გადადის */
  ids: number[]
  onClose: () => void
  onMoved?: () => void
}) {
  const { t, i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const qc = useQueryClient()
  const { toast } = useToast()
  const { enabled } = useModules()

  const [target, setTarget] = useState<Target>('none')
  const [domain, setDomain] = useState<GalleryParentKind>('movie')
  const [recordId, setRecordId] = useState<number[]>([])
  const [actorQuery, setActorQuery] = useState('')
  const [actorId, setActorId] = useState<number[]>([])
  /** `''` = ალბომი არ იცვლება · `none` = ალბომიდან ამოღება · რიცხვი = ალბომი */
  const [album, setAlbum] = useState<string>('')

  const parents = useMemo(
    () =>
      GALLERY_PARENTS.filter((key) => enabled.some((m) => m.key === key)).map((key) => ({
        key,
        label: moduleName(enabled.find((m) => m.key === key)!, i18n.language),
      })),
    [enabled, i18n.language],
  )

  const albumsQ = useQuery({ queryKey: ['gallery-albums'], queryFn: fetchGalleryAlbums })

  const recordsQ = useQuery({
    queryKey: ['gallery-groups', 'record', { type: domain, have: 'all', previews: 0 }],
    queryFn: () => fetchGalleryGroups('record', { type: domain, have: 'all', previews: 0 }),
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
              ? `${domain}:${recordId[0]}`
              : target === 'actor' && actorId[0]
                ? `cast_member:${actorId[0]}`
                : undefined,
        // ⚠️ `''` = „არ მიეკაროს"; გასაღები საერთოდ არ იგზავნება
        ...(album === '' ? {} : { album_id: album === 'none' ? null : Number(album) }),
      }),
    onSuccess: (res) => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums'].forEach(
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

  return (
    <ModalShell
      title={t('gallery.moveTitle', { count: ids.length })}
      onClose={onClose}
    >
      <p className="mb-4 text-sm text-muted-foreground">{t('gallery.moveHint')}</p>

      {/* ---------- 1. სად ეკიდოს ---------- */}
      <Label className="mb-2 block">{t('gallery.moveTarget')}</Label>
      <RadioGroup value={target} onValueChange={(v) => setTarget(v as Target)} className="gap-2">
        <Row value="keep" active={target === 'keep'} label={t('gallery.moveKeepParent')} />
        <Row
          value="none"
          active={target === 'none'}
          label={t('gallery.moveToUncategorized')}
          icon={<Inbox className="size-4 text-muted-foreground" />}
        />

        <Row value="record" active={target === 'record'} label={t('gallery.moveToRecord')}>
          {target === 'record' && (
            <div className="mt-2 space-y-2">
              <Select value={domain} onValueChange={(v) => { setDomain(v as GalleryParentKind); setRecordId([]) }}>
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

      {/* ---------- 2. ალბომი ---------- */}
      <div className="mt-4 border-t border-border pt-4">
        <Label className="mb-2 block">{t('gallery.moveAlbum')}</Label>
        <Select value={album || 'keep'} onValueChange={(v) => setAlbum(v === 'keep' ? '' : v)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {/* ⚠️ სამი მდგომარეობა და სამივე საჭიროა: „არ შეეხო" · „ამოიღე" · კონკრეტული */}
            <SelectItem value="keep">{t('gallery.moveAlbumKeep')}</SelectItem>
            <SelectItem value="none">{t('gallery.moveAlbumNone')}</SelectItem>
            {(albumsQ.data ?? []).map((a) => (
              <SelectItem key={a.id} value={String(a.id)}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>
          {t('actions.cancel')}
        </Button>
        <Button disabled={!ready || move.isPending} onClick={() => move.mutate()}>
          <MoveRight className="size-4" />
          {t('gallery.move')}
        </Button>
      </div>
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
