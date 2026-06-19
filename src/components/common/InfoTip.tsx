import { useState } from 'react'
import { GLOSSARY } from '../../lib/glossary'

/**
 * Small ⓘ marker with a hover/focus tooltip. Pass a `term` to pull a definition
 * from the glossary, or `text` for an arbitrary tooltip. CSS-only positioning,
 * no dependency.
 */
export default function InfoTip({ term, text }: { term?: keyof typeof GLOSSARY | string; text?: string }) {
  const [open, setOpen] = useState(false)
  const content = text ?? (term ? GLOSSARY[term] : undefined)
  if (!content) return null

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        aria-label={content}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="text-gray-300 hover:text-gray-500 focus:text-gray-500 outline-none cursor-help leading-none"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 3a1 1 0 110 2 1 1 0 010-2zm1.25 8h-2.5v-1h.75V8h-.75V7h1.75v4h.75v1z" />
        </svg>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute z-30 left-1/2 -translate-x-1/2 top-full mt-1 w-56 rounded-md bg-gray-800 text-white text-[11px] font-normal normal-case tracking-normal leading-snug px-2.5 py-1.5 shadow-lg pointer-events-none"
        >
          {content}
        </span>
      )}
    </span>
  )
}
