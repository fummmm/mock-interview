export default function PropsPanel({ block, updateBlock, bringToFront, sendToBack }) {
  if (!block) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-bg-card px-4 py-2 flex items-center gap-3 flex-wrap text-xs print:hidden z-50">
      {/* 배경색 */}
      <label className="flex items-center gap-1.5 text-text-secondary">
        배경
        <input
          type="color"
          value={block.bgColor}
          onChange={(e) => updateBlock(block.id, { bgColor: e.target.value })}
          className="w-6 h-6 rounded border border-border cursor-pointer"
        />
      </label>

      {/* 투명도 */}
      <label className="flex items-center gap-1.5 text-text-secondary">
        투명도
        <input
          type="range"
          min="0"
          max="100"
          value={block.bgOpacity}
          onChange={(e) => updateBlock(block.id, { bgOpacity: parseInt(e.target.value) })}
          className="w-16 h-1 accent-accent"
        />
        <span className="w-8 text-right">{block.bgOpacity}%</span>
      </label>

      <div className="w-px h-5 bg-border" />

      {/* 글자 크기 */}
      <label className="flex items-center gap-1 text-text-secondary">
        글자
        <button
          onClick={() => updateBlock(block.id, { fontSize: Math.max(8, block.fontSize - 1) })}
          className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer"
        >
          -
        </button>
        <span className="w-6 text-center">{block.fontSize}</span>
        <button
          onClick={() => updateBlock(block.id, { fontSize: block.fontSize + 1 })}
          className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer"
        >
          +
        </button>
      </label>

      {/* 여백 */}
      <label className="flex items-center gap-1 text-text-secondary">
        여백
        <button
          onClick={() => updateBlock(block.id, { padding: Math.max(0, block.padding - 2) })}
          className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer"
        >
          -
        </button>
        <span className="w-6 text-center">{block.padding}</span>
        <button
          onClick={() => updateBlock(block.id, { padding: block.padding + 2 })}
          className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer"
        >
          +
        </button>
      </label>

      <div className="w-px h-5 bg-border" />

      {/* 강조색 */}
      <label className="flex items-center gap-1.5 text-text-secondary">
        강조색
        <input
          type="color"
          value={block.accent}
          onChange={(e) => updateBlock(block.id, { accent: e.target.value })}
          className="w-6 h-6 rounded border border-border cursor-pointer"
        />
      </label>

      <div className="w-px h-5 bg-border" />

      {/* 레이어 */}
      <div className="flex items-center gap-1 text-text-secondary">
        레이어
        <button onClick={sendToBack} className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer" title="맨 뒤로">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7-7-7M19 3l-7 7-7-7"/></svg>
        </button>
        <button onClick={bringToFront} className="w-5 h-5 rounded border border-border flex items-center justify-center hover:border-accent/50 cursor-pointer" title="맨 앞으로">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 10l7-7 7 7M5 21l7-7 7 7"/></svg>
        </button>
      </div>
    </div>
  )
}
