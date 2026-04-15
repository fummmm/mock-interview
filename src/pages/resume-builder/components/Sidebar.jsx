import { useState } from 'react'
import { BLOCK_DEFS, PALETTE_GROUPS } from '../blockDefs'

export default function Sidebar({ onAddBlock, className = '' }) {
  const [openGroup, setOpenGroup] = useState(null)

  const grouped = {}
  for (const [type, def] of Object.entries(BLOCK_DEFS)) {
    if (!grouped[def.group]) grouped[def.group] = []
    grouped[def.group].push({ type, ...def })
  }

  return (
    <div className={`w-52 shrink-0 border-r border-border bg-bg-card flex flex-col overflow-y-auto p-3 gap-1 ${className}`}>
      <div className="text-[10px] font-bold text-text-secondary/50 uppercase tracking-wider mb-2">
        컴포넌트
      </div>

      {PALETTE_GROUPS.map((groupName) => {
        const items = grouped[groupName]
        if (!items) return null
        const isOpen = openGroup === groupName

        return (
          <div key={groupName}>
            <button
              onClick={() => setOpenGroup(isOpen ? null : groupName)}
              className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs cursor-pointer transition-all ${
                isOpen
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:bg-bg-elevated'
              }`}
            >
              <span className="text-xs opacity-60">{items[0]?.icon}</span>
              <span className="font-medium">{groupName}</span>
              <svg
                className={`w-3 h-3 ml-auto transition-transform ${isOpen ? 'rotate-90' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {isOpen && (
              <div className="pl-4 py-1 space-y-0.5">
                {items.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => onAddBlock(item.type)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] text-text-secondary hover:bg-bg-elevated hover:text-text-primary cursor-pointer transition-all"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-text-secondary/20 shrink-0" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
