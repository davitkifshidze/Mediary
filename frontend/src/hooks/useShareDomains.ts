import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { SHARE_DOMAINS, type ShareDomainKey } from '@/api/shareLinks'
import { useAuth } from '@/lib/auth'
import { moduleName, useModules } from '@/lib/modules'
import { shareMeta } from '@/lib/shareLinks'

/* ============================================================
   **რომელ სექციას აზიარებს ეს ანგარიში** (Tasks §40.10, §40.13).

   ⚠️ სერვერის წესის სარკეა (`ShareDomain::availableFor()`): ჩართული მოდული
   **და** `view` უფლება. რიგი მოდულების პირადი რიგია (§36) — იგივე, რასაც
   საიდბარი ხატავს. ბარათებიც და ფანჯრის მეორე ნაბიჯიც ამას კითხულობს —
   ორი ცალკე სია ერთ დღეს სხვადასხვა რიგს დახატავდა.

   ⚠️ **პლეილისტი მოდული არაა** (`song`-ის შიგნითაა, §15) — მისი უფლება და
   ფერი `song`-ისაა, სახელი და ხატულა კი თავისი; ბარათების რიგში სიმღერების
   გვერდით დგას.
   ============================================================ */

/** სექციის სახე — სახელი, ხატულა და ფერი (გათიშული მოდულისაც) */
export interface ShareDomainLook {
  label: string
  icon: string
  color: string | null
}

export interface ShareDomainsApi {
  /** რომელ სექციას აზიარებს ეს ანგარიში — საიდბარის რიგით */
  available: ShareDomainKey[]
  look: (domain: ShareDomainKey) => ShareDomainLook
}

export function useShareDomains(): ShareDomainsApi {
  const { t, i18n } = useTranslation()
  const { all, enabled } = useModules()
  const { can } = useAuth()

  return useMemo(() => {
    const order = enabled.map((m) => m.key)
    const position = (domain: ShareDomainKey) => order.indexOf(shareMeta(domain).module)

    const available = SHARE_DOMAINS.filter((domain) => {
      const module = shareMeta(domain).module
      return order.includes(module) && can(module, 'view')
    }).sort((a, b) => position(a) - position(b) || SHARE_DOMAINS.indexOf(a) - SHARE_DOMAINS.indexOf(b))

    const look = (domain: ShareDomainKey): ShareDomainLook => {
      const m = all.find((x) => x.key === shareMeta(domain).module)

      if (domain === 'playlist') {
        return { label: t('playlists.title'), icon: 'ListMusic', color: m?.color ?? null }
      }

      return { label: m ? moduleName(m, i18n.language) : domain, icon: m?.icon ?? 'Film', color: m?.color ?? null }
    }

    return { available, look }
  }, [all, enabled, can, t, i18n.language])
}
