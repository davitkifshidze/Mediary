import { storageUrl } from '@/lib/api'
import { cn } from '@/lib/utils'

/* ============================================================
   მომხმარებლის ავატარი — სურათი, ან სახელის პირველი ასო.
   ერთი კომპონენტი სამივე ადგილისთვის: სია, შიდა გვერდი, მოდულის ხედი.
   ============================================================ */

export function UserAvatar({
  user,
  size = 'size-8',
  className,
}: {
  user: { avatar_path: string | null; display_name: string }
  /** Tailwind-ის `size-*` კლასი */
  size?: string
  className?: string
}) {
  return (
    <span
      className={cn(
        'grid shrink-0 place-items-center overflow-hidden rounded-full bg-muted',
        size,
        className,
      )}
    >
      {user.avatar_path ? (
        <img src={storageUrl(user.avatar_path) ?? ''} alt="" className="size-full object-cover" />
      ) : (
        <span className="text-xs font-semibold text-muted-foreground">
          {user.display_name.charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  )
}
