import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Folder, FolderPlus, Inbox, Lock, Minus } from 'lucide-react'
import { createGalleryAlbum, fetchGalleryAlbums } from '@/api/gallery'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/feedback'

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
   მაშინვე ქრება ხედვიდან (სწორედ ამიტომ შეიძლება იყოს სასურველი), ე.ი.
   გაფრთხილების გარეშე ეს „ფოტო დავკარგე"-დ წაიკითხებოდა.
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

  const albumsQ = useQuery({ queryKey: ['gallery-albums'], queryFn: fetchGalleryAlbums })
  const albums = albumsQ.data ?? []

  const create = useMutation({
    mutationFn: () => createGalleryAlbum({ name: name.trim() }),
    onSuccess: (album) => {
      qc.invalidateQueries({ queryKey: ['gallery-albums'] })
      qc.invalidateQueries({ queryKey: ['gallery-groups'] })
      // ⚠️ ახლად შექმნილი მაშინვე არჩეულია — სწორედ ამიტომ შექმენი
      onChange(String(album.id))
      setAdding(false)
      setName('')
    },
    onError: (e) => toast({ title: errorMessage(e), variant: 'error' }),
  })

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
            icon={album.locked ? <Lock className="size-4" /> : <Folder className="size-4" />}
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
        <div className="mt-2 flex items-center gap-2">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('gallery.albumName')}
            className="h-9"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                // ⚠️ `preventDefault` — ეს ველი გადატანის ფორმის შიგნითაა
                e.preventDefault()
                if (name.trim()) create.mutate()
              }
              if (e.key === 'Escape') {
                setAdding(false)
                setName('')
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            disabled={!name.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            {t('gallery.albumCreate')}
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)}>
            {t('actions.cancel')}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => {
            setAdding(true)
            setName('')
          }}
        >
          <FolderPlus className="size-4" />
          {t('gallery.albumNew')}
        </Button>
      )}

      {picked?.locked && (
        <p className="mt-2 text-xs text-muted-foreground">{t('gallery.albumLockedMoveHint')}</p>
      )}
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
