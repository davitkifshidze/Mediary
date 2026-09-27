import { Film } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PosterImage({
  src,
  alt,
  className,
  draggable,
}: {
  src: string | null
  alt: string
  className?: string
  /**
   * Tasks §16 — `false` გადასათრევ ბარათში: `<img>` თავისით გადაითრევა
   * (ბრაუზერი თვითონ ფოტოს „ატანს") და ბარათის drag & drop-ს ჩაანაცვლებდა.
   * მითითების გარეშე ატრიბუტი არ იწერება — ქცევა სხვაგან უცვლელია.
   */
  draggable?: boolean
}) {
  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-muted-foreground', className)}>
        <Film className="size-8 opacity-40" />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" draggable={draggable} className={cn('object-cover', className)} />
}
