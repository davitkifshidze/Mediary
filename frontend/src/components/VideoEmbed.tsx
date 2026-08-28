import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Video } from '@/api/videos'

/**
 * ვიდეოს ჩვენება (I5).
 *
 * ⚠️ უსაფრთხოება: iframe **მხოლოდ** backend-ის allowlist-იდან მოსულ `embed_url`-ს
 * იღებს (და აქვე ხელახლა მოწმდება ჰოსტი) — თვითნებური HTML არსად ირენდერება.
 * პირდაპირი ფაილი `<video>`-შია; უცნობი წყარო — უბრალოდ ბმული.
 */
const ALLOWED_EMBED_HOSTS = ['www.youtube-nocookie.com', 'player.vimeo.com', 'geo.dailymotion.com']

function isAllowedEmbed(url: string | null): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && ALLOWED_EMBED_HOSTS.includes(parsed.host)
  } catch {
    return false
  }
}

export function VideoEmbed({ video }: { video: Video }) {
  const { t } = useTranslation()

  if (isAllowedEmbed(video.embed_url)) {
    return (
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
        <iframe
          src={video.embed_url!}
          title={video.title}
          className="size-full"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups"
          loading="lazy"
        />
      </div>
    )
  }

  if (video.platform === 'file') {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video src={video.url} controls className="aspect-video w-full rounded-lg bg-black" />
    )
  }

  return (
    <a
      href={video.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg border border-border bg-muted text-sm text-muted-foreground hover:text-foreground"
    >
      <ExternalLink className="size-4" />
      {t('videos.openExternal')}
    </a>
  )
}
