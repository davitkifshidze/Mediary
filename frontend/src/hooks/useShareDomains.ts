import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ModuleInfo } from '@/api/account'
import type { ShareDomainKey } from '@/api/shareLinks'
import { useAuth } from '@/lib/auth'
import { moduleName, useModules } from '@/lib/modules'
import { isShareDomain } from '@/lib/shareLinks'

/* ============================================================
   **რომელ სექციას აზიარებს ეს ანგარიში** (Tasks §40.10).

   ⚠️ სერვერის წესის სარკეა (`ShareDomain::availableFor()`): ჩართული მოდული
   **და** `view` უფლება. რიგი მოდულების პირადი რიგია (§36) — იგივე, რასაც
   საიდბარი ხატავს. ბარათებიც და ფანჯრის მეორე ნაბიჯიც ამას კითხულობს —
   ორი ცალკე სია ერთ დღეს სხვადასხვა რიგს დახატავდა.
   ============================================================ */

export interface ShareDomainsApi {
  /** რომელ სექციას აზიარებს ეს ანგარიში — საიდბარის რიგით */
  available: ShareDomainKey[]
  /** ჩართული მოდულის ფერი/ხატულა/სახელი */
  moduleOf: (domain: ShareDomainKey) => ModuleInfo | undefined
  /** სახელი გათიშული მოდულისაც — ბმულში დარჩენილი სექციისთვის */
  nameOf: (domain: ShareDomainKey) => string
}

export function useShareDomains(): ShareDomainsApi {
  const { i18n } = useTranslation()
  const { all, enabled } = useModules()
  const { can } = useAuth()

  return useMemo(() => {
    const modules = enabled.filter((m) => isShareDomain(m.key) && can(m.key, 'view'))

    return {
      available: modules.map((m) => m.key as ShareDomainKey),
      moduleOf: (domain) => modules.find((m) => m.key === domain),
      nameOf: (domain) => {
        const m = all.find((x) => x.key === domain)
        return m ? moduleName(m, i18n.language) : domain
      },
    }
  }, [all, enabled, can, i18n.language])
}
