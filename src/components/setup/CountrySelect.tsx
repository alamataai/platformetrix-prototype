import { countryOptions, countryName } from '../../lib/countries'

const FIELD_CLASS =
  'mt-1 w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 outline-none bg-white focus:border-brand-500'

interface Props {
  value: string                       // ISO code, or '' for unset/inherit
  onChange: (code: string) => void
  /** When provided, renders a leading "Inherit (X)" option (value ''); for the event level. */
  inheritFrom?: string
  className?: string
}

/** Structured ISO country picker. Shows names, stores codes. */
export default function CountrySelect({ value, onChange, inheritFrom, className }: Props) {
  const options = countryOptions()
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={className ?? FIELD_CLASS}
    >
      <option value="">
        {inheritFrom !== undefined
          ? `Inherit${inheritFrom ? ` (${countryName(inheritFrom)})` : ''}`
          : 'Select country'}
      </option>
      {options.map(o => (
        <option key={o.code} value={o.code}>{o.name}</option>
      ))}
    </select>
  )
}
