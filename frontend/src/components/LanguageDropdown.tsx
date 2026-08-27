import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function LanguageDropdown() {
  const { i18n } = useTranslation()
  const current = i18n.language === 'en' ? 'en' : 'ka'

  const change = (v: string) => {
    void i18n.changeLanguage(v)
    localStorage.setItem('lang', v)
  }

  return (
    <Select value={current} onValueChange={change}>
      <SelectTrigger className="w-full gap-2">
        <Languages className="size-4 shrink-0 opacity-60" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ka">ქართული</SelectItem>
        <SelectItem value="en">English</SelectItem>
      </SelectContent>
    </Select>
  )
}
