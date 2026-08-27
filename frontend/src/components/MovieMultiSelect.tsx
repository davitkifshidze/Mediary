import Select from 'react-select'
import { useTranslation } from 'react-i18next'
import { movieTitle } from '@/lib/display'
import { reactSelectStyles, type Option } from '@/lib/selectStyles'
import type { MovieListItem } from '@/api/types'

const styles = reactSelectStyles<true>()

/** ფილმების მრავალარჩევანი (value = movie id-ების მასივი) — ძებნადი/სქროლადი. */
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
  const options: Option[] = movies.map((m) => {
    const title = movieTitle(m, i18n.language)
    return { value: String(m.id), label: m.year ? `${title} (${m.year})` : title }
  })
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
    />
  )
}
