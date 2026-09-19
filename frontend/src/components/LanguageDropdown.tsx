import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { safeSet } from '@/lib/storage'

/**
 * ⚠️ **ენის სახელი ენდონიმია** (Tasks DEBT-21): `lang.ka`/`lang.en` ორივე
 * ლოკალში **ერთსა და იმავე** მნიშვნელობას ატარებს — ენა თავის ენაზე იწერება,
 * თორემ ინგლისურ ინტერფეისში ქართულს „Georgian" ერქმეოდა და პირიქით.
 * i18n-ში ის მაინც იმიტომ ზის, რომ ოთხივე ადგილმა ერთი წყარო კითხულობდეს.
 */
export function LanguageDropdown() {
  const { t, i18n } = useTranslation()
  const current = i18n.language === 'en' ? 'en' : 'ka'

  const change = (v: string) => {
    void i18n.changeLanguage(v)
    safeSet('lang', v)
  }

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger className="w-full gap-2">
        <Languages className="size-4 shrink-0 opacity-60" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ka">{t('lang.ka')}</SelectItem>
        <SelectItem value="en">{t('lang.en')}</SelectItem>
      </SelectContent>
    </Select>
  )
}
