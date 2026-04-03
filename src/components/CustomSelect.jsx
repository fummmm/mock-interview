import { useState, useRef, useEffect } from 'react'

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = '선택',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`bg-bg-card flex w-full cursor-pointer items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition-all ${
          open ? 'border-accent' : 'border-border hover:border-accent/50'
        }`}
      >
        <span className={selected ? 'text-text-primary' : 'text-text-secondary/50'}>
          {selected?.label || placeholder}
        </span>
        <svg
          className={`text-text-secondary h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && options.length > 0 && (
        <div className="bg-bg-card border-border absolute z-20 mt-1 max-h-48 w-full overflow-hidden overflow-y-auto rounded-xl border shadow-lg">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => {
                onChange(o.value)
                setOpen(false)
              }}
              className={`w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors ${
                o.value === value
                  ? 'bg-accent/10 text-accent'
                  : 'hover:bg-bg-elevated text-text-primary'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
