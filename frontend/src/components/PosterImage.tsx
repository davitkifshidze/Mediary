import { Film } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PosterImage({
  src,
  alt,
  className,
}: {
  src: string | null
  alt: string
  className?: string
}) {
  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <Film className="size-8 opacity-40" />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" className={cn('object-cover', className)} />
}
