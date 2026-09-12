import Select from 'react-select'
import { useTranslation } from 'react-i18next'
import { movieTitle } from '@/lib/display'
import { reactSelectPortal, reactSelectStyles, type Option } from '@/lib/selectStyles'
import type { MovieListItem } from '@/api/types'
import { useContentLang } from '@/lib/settings'

const styles = reactSelectStyles<true>()

/**
 * id-ების მრავალარჩევანი — ძებნადი/სქროლადი. დომენს არ იცნობს, ე.ი.
 * ფილმებზეც, სერიალებზეც და ვიდეოებზეც ერთი და იგივე კონტროლია (Tasks 4).
 */
export function IdMultiSelect({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: { id: number; label: string }[]
  value: number[]
  onChange: (v: number[]) => void
  placeholder?: string
}) {
  const options: Option[] = items.map((i) => ({ value: String(i.id), label: i.label }))
  const selected = options.filter((o) => value.includes(Number(o.value)))

  return (
    <Select<Option, true>
      isMulti
      options={options}
      value={selected}
      onChange={(vals) => onChange(vals.map((v) => Number(v.value)))}
      placeholder={placeholder}
      noOptionsMessage={() => '—'}
      styles={styles}
      classNamePrefix="rs"
      closeMenuOnSelect={false}
      {...reactSelectPortal}
    />
  )
}

/** ფილმების/სერიალების მრავალარჩევანი (value = id-ების მასივი) */
export function MovieMultiSelect({
  movies,
  value,
  onChange,
  placeholder,
}: {
  movies: MovieListItem[]
  value: number[]
  onChange: (v: number[]) => void
  placeholder?: string
}) {
  const { i18n } = useTranslation()
  const lang = useContentLang(i18n.language)
  const items = movies.map((m) => {
    const title = movieTitle(m, lang)
    return { id: m.id, label: m.year ? `${title} (${m.year})` : title }
  })

  return <IdMultiSelect items={items} value={value} onChange={onChange} placeholder={placeholder} />
}
