import { useState, useEffect, useRef } from 'react'

/* 커스텀 드롭다운 */
export default function DeviceDropdown({ label, items, currentId, onSelect, emptyText }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = items.find((d) => d.deviceId === currentId)
  const displayLabel = current?.label || (items.length > 0 ? items[0].label : emptyText)

  return (
    <div className="space-y-2" ref={ref}>
      <label className="text-text-secondary text-xs font-medium">{label}</label>
      <div className="relative">
        <button
          onClick={() => items.length > 0 && setOpen(!open)}
          className={`bg-bg-card flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
            open ? 'border-accent' : 'border-border hover:border-accent/50'
          }`}
        >
          <span className="truncate">{displayLabel || emptyText}</span>
          <svg
            className={`text-text-secondary h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && items.length > 0 && (
          <div className="bg-bg-card border-border absolute z-20 mt-1 w-full overflow-hidden rounded-xl border shadow-lg">
            {items.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => {
                  onSelect(d.deviceId)
                  setOpen(false)
                }}
                className={`w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                  d.deviceId === currentId
                    ? 'bg-accent/10 text-accent'
                    : 'hover:bg-bg-elevated text-text-primary'
                }`}
              >
                {d.label || `${label} ${d.deviceId.slice(0, 8)}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
