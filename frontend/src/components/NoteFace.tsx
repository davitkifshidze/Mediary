import type { NoteEntry } from '@/api/notes'
import { resolveStatusColor } from '@/lib/statusColor'
import { cn } from '@/lib/utils'
import { ModuleIcon } from '@/components/ModuleIcon'
import { usePrivateFileUrl } from '@/components/PrivateFile'

/* ============================================================
   **ჩანაწერის სახე** — მთავარი ფოტო, ან აიქონი ფონის ფერზე.

   სამივე ნებისმიერი კომბინაციით ივსება; წესი ერთია ყველა ხედზე (ბარათი, ბადე,
   სტრიქონი, ფანჯრის სათაური): **ფოტო თუ არის — ის ჩანს; თუ არა — აიქონი ფერად
   ფონზე**. აიქონი ჩანაწერის საკუთარია, მის გარეშე — კატეგორიისა, მის გარეშე —
   მოდულისა; ფერის გარეშე ჩარჩოს ჩვეულებრივი ნაცრისფერი ფონი რჩება.

   ⚠️ **ფოტო პრივატულ დისკზეა** (`notes/photos`): `photo_url` API-ს გზაა და არა
   `/storage/…`, ე.ი. `<img src>`-ში პირდაპირ არ ჯდება — სესიით იკითხება blob-ად
   (`usePrivateFileUrl`). სანამ იტვირთება, აიქონი ჩანს და არა ცარიელი ჩარჩო.
   ============================================================ */

type Faced = Pick<NoteEntry, 'icon' | 'color' | 'photo_url'> & { category?: { icon?: string | null } | null }

/** აიქონის სახელი: ჩანაწერის საკუთარი → კატეგორიის → მოდულის */
export function noteIcon(note: Pick<Faced, 'icon' | 'category'>): string {
  return note.icon || note.category?.icon || 'NotebookPen'
}

/** პრივატული ფოტოს მისამართი; `null` — ფოტო არ არის ან ჯერ იტვირთება */
export function useNotePhoto(note: Pick<NoteEntry, 'photo_url'> | null | undefined): string | null {
  return usePrivateFileUrl(note?.photo_url).url
}

/** აიქონი ფონის ფერზე — ფოტოს ჩარჩოს მთლიანად ავსებს */
export function NoteIconFace({ note, className }: { note: Pick<Faced, 'icon' | 'color' | 'category'>; className?: string }) {
  const color = resolveStatusColor(note.color)

  return (
    <span
      className="grid size-full place-items-center"
      style={color ? { backgroundColor: color, color: '#fff' } : undefined}
      data-testid="note-face"
      data-color={note.color ?? undefined}
      data-icon={noteIcon(note)}
    >
      <ModuleIcon name={noteIcon(note)} className={className ?? 'size-5'} />
    </span>
  )
}

/** პატარა ფილა (ფანჯრის სათაურთან): ფოტო ან აიქონი ფონის ფერზე */
export function NoteTile({ note, className }: { note: Faced; className?: string }) {
  const photo = useNotePhoto(note)

  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-muted-foreground', className)}
      data-testid="note-tile"
    >
      {photo ? <img src={photo} alt="" className="size-full object-cover" /> : <NoteIconFace note={note} className="size-4" />}
    </span>
  )
}
