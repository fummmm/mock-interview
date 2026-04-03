import { useState, useRef, useEffect } from 'react'

export default function CustomSelect({ value, onChange, options, placeholder = '선택', className = '' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = options.find((o) => o.value === value)

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`w-full px-3 py-2 rounded-xl bg-bg-card border text-left text-sm transition-all cursor-pointer flex items-center justify-between ${
          open ? 'border-accent' : 'border-border hover:border-accent/50'
        }`}
      >
        <span className={selected ? 'text-text-primary' : 'text-text-secondary/50'}>{selected?.label || placeholder}</span>
        <svg className={`w-4 h-4 text-text-secondary shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && options.length > 0 && (
        <div className="absolute z-20 w-full mt-1 bg-bg-card border border-border rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
          {options.map((o) => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false) }}
              className={`w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer ${
                o.value === value ? 'bg-accent/10 text-accent' : 'hover:bg-bg-elevated text-text-primary'
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
