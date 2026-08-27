import Select from 'react-select'
import { useTranslation } from 'react-i18next'
import { genreName } from '@/lib/display'
import { reactSelectStyles, type Option } from '@/lib/selectStyles'
import type { Genre } from '@/api/types'

const multiStyles = reactSelectStyles<true>()
const singleStyles = reactSelectStyles<false>()

/** single-select ჟანრით (value = genre id string) — მაგ. წაშლისას გადატანა. */
export function GenreSingleSelect({
  genres,
  value,
  onChange,
  placeholder,
}: {
  genres: Genre[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const { i18n } = useTranslation()
  const options: Option[] = genres.map((g) => ({ value: String(g.id), label: genreName(g, i18n.language) }))
  const selected = options.find((o) => o.value === value) ?? null

  return (
    <Select<Option, false>
      options={options}
      value={selected}
      onChange={(v) => onChange(v?.value ?? '')}
      placeholder={placeholder}
      noOptionsMessage={() => '—'}
      styles={singleStyles}
      classNamePrefix="rs"
      menuPlacement="auto"
    />
  )
}

export function GenreSelect({
  genres,
  value,
  onChange,
}: {
  genres: Genre[]
  value: string[]
  onChange: (v: string[]) => void
}) {
  const { t, i18n } = useTranslation()
  const options: Option[] = genres.map((g) => ({ value: g.slug, label: genreName(g, i18n.language) }))
  const selected = options.filter((o) => value.includes(o.value))

  return (
    <Select<Option, true>
      isMulti
      options={options}
      value={selected}
      onChange={(vals) => onChange(vals.map((v) => v.value))}
      placeholder={t('form.genres')}
      noOptionsMessage={() => '—'}
      styles={multiStyles}
      classNamePrefix="rs"
    />
  )
}
