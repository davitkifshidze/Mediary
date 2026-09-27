import { useState, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Folder, FolderPlus, Inbox, Lock, LockOpen, Minus, SquarePen } from 'lucide-react'
import {
  createGalleryAlbum,
  fetchGalleryAlbums,
  lockGalleryAlbum,
  type GalleryAlbum,
} from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { albumPasswordProblem } from '@/lib/albumPassword'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { InfoHint } from '@/components/ui/info-hint'
import { useToast } from '@/components/ui/feedback'
import { AlbumDialog } from '@/components/gallery/AlbumDialog'
import { AlbumPasswordFields } from '@/components/gallery/AlbumPasswordFields'

/* ============================================================
   **ალბომის ამრჩევი — „ფაილ-მენეჯერივით" (შენი მითითება, 2026-09-16).**

   შენი სიტყვები: „ალბომის შექმნა გადატანის მომენტში, ალბომები
   გამოდიოდეს გადატანისას, დაახლოებით ფაილ მენეჯერივით".

   ⚠️ **`Select`-ს ეს ვერ გააკეთებდა და სწორედ ეს იყო ხარვეზი.** ჩამოსაშლელი
   სია მხოლოდ **არსებულს** სთავაზობს: სანამ პირველ ალბომს არ შექმნი,
   „გადატანა ალბომში" ცარიელი პუნქტია — ე.ი. ყველაზე ხშირი შემთხვევა
   („ახლა მინდა ამ ფოტოებისთვის საქაღალდე") სულ სხვა ეკრანზე გაგზავნიდა
   და გადატანას შუაზე გაწყვეტდა. აქ ახალი ალბომი იქვე იქმნება და
   **მაშინვე არჩეულია**.

   ⚠️ **სია და არა ჩამოსაშლელი**: საქაღალდე თავისი შიგთავსით იცნობა —
   რიგზე ფოტოების რიცხვი წერია და ჩაკეტილს ბოქლომი აქვს. `Select`-ის
   ერთხაზიან პუნქტში ამათგან არცერთი არ ეტეოდა.

   ⚠️ **სამი განსხვავებული პასუხია და სამივე საჭირო**: „ალბომი არ
   შეიცვალოს" (`''`) · „ალბომიდან ამოღება" (`none`) · კონკრეტული ალბომი.
   პირველი ორი ფსევდო-რიგია — მათ არც სახელი აქვთ და არც წაშლა.

   ⚠️ **ჩაკეტილ ალბომში გადატანა ნებადართულია და ეს ცხადად წერია**: ფოტო
   მაშინვე იმალება — ბადეში დაბლარულ ფილად რჩება (სწორედ ამიტომ შეიძლება
   იყოს სასურველი), ე.ი. გაფრთხილების გარეშე ეს „ფოტო დავკარგე"-დ
   წაიკითხებოდა.

   ## ლოკი იქვე (Tasks §17.2 — „ალბომის ჩაკეტვაც, სრული ფუნქციონალი")
   ⚠️ **ადგილზე შექმნილ ალბომს პაროლიც შეიძლება დაედოს** — `AlbumDialog`-ის
   ჩაკეტვის ნაწილი, იგივე `AlbumPasswordFields`-ით. ⚠️ **ასეთი ალბომი ამ
   სესიაში მაშინვე ღიაა** (სერვერის `store()` — „შენ ახლა დაადე"), ე.ი.
   მასში გადატანილი ფოტო ჯერ **ჩანს**. ძველი გაფრთხილება („მაშინვე
   დაიმალება") აქ ტყუილი იქნებოდა და ლოკი გატეხილად მოგეჩვენებოდა — ამიტომ
   ღია ალბომს თავისი ტექსტი და „ჩაკეტვის" ღილაკი აქვს.
   ⚠️ **არჩეული ალბომის პარამეტრები (სახელი, აღწერა, ხილვადობა, ლოკი) აქედანვე
   იხსნება** — `AlbumDialog` ამ ფანჯრის თავზე ჯდება და `ModalShell`-ის დასტა
   ქვედას დამალავს და უკან დააბრუნებს, არჩევანიც და შევსებული ველებიც
   შენახული რჩება. მსახიობის გვერდიდან `/gallery/albums`-ზე გადასვლა კი
   გადატანას შუაზე გაწყვეტდა.
   ============================================================ */

export function AlbumPicker({
  value,
  onChange,
  allowKeep = true,
}: {
  /** `''` — არ შეიცვალოს · `'none'` — ალბომიდან ამოღება · `'<id>'` — ალბომი */
  value: string
  onChange: (value: string) => void
  allowKeep?: boolean
}) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { toast } = useToast()

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  /** §17.2 — ახალ ალბომს პაროლიც დაედოს */
  const [withLock, setWithLock] = useState(false)
  const [password, setPassword] = useState('')
  const [repeat, setRepeat] = useState('')
  /** §17.2 — რომელი ალბომის პარამეტრები ღიაა (`null` — არცერთის) */
  const [editing, setEditing] = useState<GalleryAlbum | null>(null)

  const albumsQ = useQuery({ queryKey: ['gallery-albums'], queryFn: fetchGalleryAlbums })
  const albums = albumsQ.data ?? []

  /** ⚠️ ყოველი გახსნა სუფთაა — წინა ცდის პაროლი ახალ ალბომზე არ უნდა გადავიდეს */
  const resetDraft = () => {
    setAdding(false)
    setName('')
    setWithLock(false)
    setPassword('')
    setRepeat('')
  }

  const create = useMutation({
    mutationFn: () =>
      createGalleryAlbum({ name: name.trim(), ...(withLock ? { password } : {}) }),
    onSuccess: (album) => {
      qc.invalidateQueries({ queryKey: ['gallery-albums'] })
      qc.invalidateQueries({ queryKey: ['gallery-groups'] })
      // ⚠️ ახლად შექმნილი მაშინვე არჩეულია — სწორედ ამიტომ შექმენი
      onChange(String(album.id))
      resetDraft()
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /**
   * „ისევ ჩაკეტე" — პაროლი რჩება, უბრალოდ ამ სესიის გახსნა იხურება
   * (`AlbumsCut`-ის იგივე მოქმედება). ლოკი ფოტოების ხილვადობას ცვლის, ე.ი.
   * გალერეის ყველა სია ძველდება — ამ გვერდისაც.
   */
  const relock = useMutation({
    mutationFn: (id: number) => lockGalleryAlbum(id),
    onSuccess: () => {
      ;['gallery', 'gallery-photos', 'gallery-groups', 'gallery-summary', 'gallery-albums'].forEach(
        (key) => qc.invalidateQueries({ queryKey: [key] }),
      )
      toast({ title: t('gallery.albumRelocked'), variant: 'success' })
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

  /** ⚠️ ჩართული ლოკი ცარიელ პაროლს არ იღებს — უპაროლო „ჩაკეტილი" ალბომი ტყუილი იქნებოდა */
  const lockReady = !withLock || (!!password && !albumPasswordProblem(password, repeat))
  const canCreate = !!name.trim() && lockReady && !create.isPending

  /**
   * Enter ქმნის, Esc აუქმებს — **ერთ ადგილას ყველა ველისთვის**.
   * ⚠️ `preventDefault` — ამრჩევი შეიძლება ფორმის შიგნით იდგეს და Enter
   * მას გაგზავნიდა (`TagSelect`-ის იგივე წესი). ⚠️ `PasswordInput` თავის
   * `onKeyDown`-ს არ ატარებს, ამიტომ მოვლენა გარე ბლოკზე იჭირება.
   * ⚠️ **Enter მხოლოდ ველიდან ქმნის**: ბლოკში ღილაკებიცაა („გაუქმება",
   * პაროლის თვალი) და მათზე Enter მათივე მოქმედებაა — „გაუქმებაზე" Enter-ით
   * ალბომი რომ იქმნებოდეს, ეს სწორედ საპირისპირო იქნებოდა.
   */
  const onDraftKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) {
      e.preventDefault()
      if (canCreate) create.mutate()
    }
    if (e.key === 'Escape') resetDraft()
  }

  const picked = albums.find((a) => String(a.id) === value)

  return (
    <div>
      <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border border-border p-1.5 fb-scroll">
        {allowKeep && (
          <PickerRow
            active={value === ''}
            onClick={() => onChange('')}
            icon={<Minus className="size-4" />}
            label={t('gallery.moveAlbumKeep')}
          />
        )}

        <PickerRow
          active={value === 'none'}
          onClick={() => onChange('none')}
          icon={<Inbox className="size-4" />}
          label={t('gallery.moveAlbumNone')}
        />

        {albums.map((album) => (
          <PickerRow
            key={album.id}
            active={String(album.id) === value}
            onClick={() => onChange(String(album.id))}
            /* ⚠️ ღია ბოქლომი — პაროლი ადევს, მაგრამ ამ სესიაში გახსნილია
               (`AlbumsCut`-ის „გახსნილი" ნიშნის იგივე ფაქტი) */
            icon={
              album.locked ? (
                album.unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />
              ) : (
                <Folder className="size-4" />
              )
            }
            label={album.name}
            meta={t('gallery.photos', { count: album.photos })}
          />
        ))}

        {!albums.length && !albumsQ.isLoading && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            {t('gallery.albumPickerEmpty')}
          </p>
        )}
      </div>

      {/* ---------- ახალი საქაღალდე ---------- */}
      {adding ? (
        <div className="mt-2 space-y-3 rounded-md border border-border p-3" onKeyDown={onDraftKey}>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gallery.albumName')}
            aria-label={t('gallery.albumName')}
            maxLength={120}
            className="h-9"
          />

          {/* ⚠️ i ლეიბლის **გარეთაა**: ღილაკი `<label>`-ში მეორე „მართვის
              ელემენტი" იქნებოდა და ლეიბლი ვეღარ მიხვდებოდა, რომელს ეკუთვნის */}
          <div className="flex items-center gap-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <Checkbox checked={withLock} onCheckedChange={(v) => setWithLock(v === true)} />
              <Lock className="size-4 text-muted-foreground" />
              {t('gallery.albumLockTitle')}
            </label>
            <InfoHint info={t('gallery.albumLockHint')} />
          </div>

          {withLock && (
            <AlbumPasswordFields
              idPrefix="album-picker"
              password={password}
              repeat={repeat}
              onPassword={setPassword}
              onRepeat={setRepeat}
            />
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetDraft}>
              {t('actions.cancel')}
            </Button>
            <Button type="button" size="sm" disabled={!canCreate} onClick={() => create.mutate()}>
              {withLock ? <Lock className="size-4" /> : <FolderPlus className="size-4" />}
              {t('gallery.albumCreate')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              resetDraft()
              setAdding(true)
            }}
          >
            <FolderPlus className="size-4" />
            {t('gallery.albumNew')}
          </Button>

          {/* §17.2 — არჩეული ალბომის პარამეტრები აქვე, გადატანის შუაგულში */}
          {picked && (
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(picked)}>
              <SquarePen className="size-4" />
              {t('gallery.albumEdit')}
            </Button>
          )}
        </div>
      )}

      {/* ⚠️ **ლოკის ორი მდგომარეობა — ორი ტექსტი.** ჩაკეტილში ფოტო მაშინვე
          იმალება; ამ სესიაში გახსნილში კი ჯერ ჩანს — და ეს ხშირია, რადგან
          პაროლით ახლად შექმნილი ალბომი სწორედ ასეთია. ერთი ტექსტი ერთ-ერთ
          შემთხვევაში იტყუებოდა. */}
      {picked?.locked &&
        (picked.unlocked ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {t('gallery.albumOpenMoveHint')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={relock.isPending}
              onClick={() => relock.mutate(picked.id)}
            >
              <Lock className="size-4" />
              {t('gallery.albumRelock')}
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">{t('gallery.albumLockedMoveHint')}</p>
        ))}

      {/* ⚠️ მდგომარეობაც და ფანჯრის JSX-იც ერთ კომპონენტშია — `GroupsCut`-ის
          ცოცხალი ხარვეზის წესი */}
      {editing && <AlbumDialog album={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function PickerRow({
  active,
  onClick,
  icon,
  label,
  meta,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  meta?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors',
        active ? 'bg-secondary font-medium text-foreground' : 'hover:bg-muted',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-primary' : 'text-muted-foreground')}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
      {active && <Check className="size-4 shrink-0 text-primary" />}
    </button>
  )
}
