import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

/* ============================================================
   პრივატული დისკის ფაილები (Tasks §17.5).

   ⚠️ **`/storage/*` ამ ფაილებს აღარ ხედავს.** ისინი პრივატულ დისკზეა და
   მხოლოდ policy-ით დაცული API-დან გაიცემა (`GET /api/note-files/{id}`).
   ე.ი. `<img src="/storage/…">` აქ არ მუშაობს და არც უნდა მუშაობდეს.

   ⚠️ **`<img src="{API}/note-files/12">`-იც არ გამოდგება**: dev-ში ფრონტი
   5173-ზეა და API 8000-ზე, ე.ი. `<img>`-ის რექვესთი cross-origin-ია და
   სესიის cookie-ს არ ატანს. ამიტომ ფაილს **axios-ით ვკითხულობთ blob-ად**
   (იგივე ინსტანცია, იგივე cookie/XSRF) და `URL.createObjectURL()`-ით ვაჩვენებთ.

   object URL **უნდა გათავისუფლდეს** — თორემ ყოველი გახსნა მეხსიერებაში რჩება.
   ============================================================ */

/**
 * **ერთჯერადი წაკითხვა hook-ის გარეშე (Tasks PERF-09).**
 *
 * ⚠️ საჭიროა მხოლოდ **ჩამოტვირთვაზე**: ბადე მონიშნულ ფოტოს `<a download>`-ს
 * მისი უჯრის უკვე წამოღებული blob-ით აძლევს, ხოლო „ყველას მონიშვნა" იმ
 * უჯრებსაც მოიცავს, რომლებიც ჯერ არ დახატულა (სხვა გვერდი) ან ეკრანზე ჯერ
 * არ გამოჩნდა. ასეთი ფაილი ადრე **ჩუმად გამოტოვდებოდა**.
 *
 * ⚠️ object URL გამომძახებლისაა — მან უნდა გაათავისუფლოს.
 */
export async function fetchPrivateObjectUrl(url: string): Promise<string | null> {
  try {
    const res = await api.get(url, { responseType: 'blob' })

    return URL.createObjectURL(res.data as Blob)
  } catch {
    return null
  }
}

/** `url` — რესურსიდან მოსული API-ს გზა, მაგ. `/note-files/12` */
export function usePrivateFileUrl(url: string | null | undefined) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!url) return

    let revoked = false
    let created: string | null = null
    setFailed(false)

    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (revoked) return
        created = URL.createObjectURL(res.data as Blob)
        setObjectUrl(created)
      })
      .catch(() => {
        if (!revoked) setFailed(true)
      })

    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
      setObjectUrl(null)
    }
  }, [url])

  return { url: objectUrl, loading: !objectUrl && !failed, failed }
}

/** პრივატული სურათი — ჩატვირთვამდე ჩონჩხი, ჩავარდნაზე ცარიელი ბლოკი */
export function PrivateImage({
  url,
  alt,
  className,
}: {
  url: string
  alt: string
  className?: string
}) {
  const file = usePrivateFileUrl(url)

  if (!file.url) {
    return (
      <span className={cn('grid size-full place-items-center bg-muted', className)}>
        {file.loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </span>
    )
  }

  return <img src={file.url} alt={alt} loading="lazy" className={className} />
}

/**
 * პრივატული ფაილის ბმული (გახსნა ან ჩამოტვირთვა).
 * ⚠️ სანამ blob არ ჩამოვა, ღილაკი **გამორთულია** — `href="#"` მომხმარებელს
 * გვერდის თავში აგდებდა და „არ მუშაობს"-ის შთაბეჭდილებას ტოვებდა.
 */
export function PrivateFileLink({
  url,
  name,
  download,
  className,
  children,
  ...rest
}: {
  url: string
  name?: string | null
  download?: boolean
  className?: string
  children: React.ReactNode
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const file = usePrivateFileUrl(url)

  if (!file.url) {
    return (
      <span className={cn('pointer-events-none opacity-50', className)} aria-disabled>
        {file.loading ? <Loader2 className="size-4 animate-spin" /> : children}
      </span>
    )
  }

  return (
    <a
      {...rest}
      href={file.url}
      download={download ? (name ?? true) : undefined}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children}
    </a>
  )
}
