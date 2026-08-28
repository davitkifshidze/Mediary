import type { StylesConfig } from 'react-select'

export interface Option {
  value: string
  label: string
}

/** react-select (Select2-ის მსგავსი) — თემაზე მორგებული CSS ცვლადებით.
 *  single/multi ორივესთვის: `IsMulti` პარამეტრით. */
export function reactSelectStyles<IsMulti extends boolean>(): StylesConfig<Option, IsMulti> {
  return {
    // react-select-ის შიდა ელემენტები default-ად `cursor: default`-ს იყენებს —
    // ყველა დასაჭერს ცალკე ვუწესებთ pointer-ს
    control: (base, state) => ({
      ...base,
      minHeight: 40,
      backgroundColor: 'var(--card)',
      borderColor: state.isFocused ? 'var(--ring)' : 'var(--border)',
      borderRadius: 8,
      boxShadow: state.isFocused ? '0 0 0 2px var(--ring)' : 'none',
      cursor: 'pointer',
      ':hover': { borderColor: 'var(--ring)' },
    }),
    dropdownIndicator: (base) => ({ ...base, cursor: 'pointer' }),
    clearIndicator: (base) => ({ ...base, cursor: 'pointer' }),
    valueContainer: (base) => ({ ...base, padding: '2px 8px', gap: 4 }),
    placeholder: (base) => ({ ...base, color: 'var(--muted-foreground)' }),
    input: (base) => ({ ...base, color: 'var(--foreground)' }),
    singleValue: (base) => ({ ...base, color: 'var(--foreground)' }),
    multiValue: (base) => ({
      ...base,
      backgroundColor: 'var(--secondary)',
      borderRadius: 5,
      padding: '1px 2px',
    }),
    multiValueLabel: (base) => ({ ...base, color: 'var(--secondary-foreground)', fontSize: 12, fontWeight: 500 }),
    multiValueRemove: (base) => ({
      ...base,
      color: 'var(--muted-foreground)',
      borderRadius: 4,
      cursor: 'pointer',
      ':hover': { backgroundColor: 'var(--destructive)', color: '#fff' },
    }),
    menu: (base) => ({
      ...base,
      backgroundColor: 'var(--popover)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      overflow: 'hidden',
      zIndex: 50,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isFocused ? 'var(--muted)' : 'transparent',
      color: 'var(--foreground)',
      fontSize: 14,
      cursor: 'pointer',
      ':active': { backgroundColor: 'var(--muted)' },
    }),
  }
}
