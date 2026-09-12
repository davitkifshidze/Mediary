import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Video } from '@/api/videos'
import { isAllowedEmbed } from '@/lib/embed'

/**
 * ვიდეოს ჩვენება (I5).
 *
 * ⚠️ უსაფრთხოება: iframe **მხოლოდ** backend-ის allowlist-იდან მოსულ `embed_url`-ს
 * იღებს (და აქვე ხელახლა მოწმდება ჰოსტი) — თვითნებური HTML არსად ირენდერება.
 * პირდაპირი ფაილი `<video>`-შია; უცნობი წყარო — უბრალოდ ბმული.
 *
 * ⚠️ allowlist-ის ასლი აქ **აღარ არის** — `lib/embed.ts`-შია, იმავეს რომ
 * კითხულობდეს ერთიანი დამკვრელიც (§7.2).
 */

/**
 * ვიწრო ფორმა — მთელი `Video` საჭირო არაა.
 * Tasks 9-ის ტრეილერიც ამ სახით გადმოეცემა (`trailer_url`/`trailer_embed_url`).
 */
export type Embeddable = Pick<Video, 'url' | 'embed_url' | 'title'> & {
  platform?: Video['platform']
}

export function VideoEmbed({ video }: { video: Embeddable }) {
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
