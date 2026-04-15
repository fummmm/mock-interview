import { BLOCK_DEFS } from '../blockDefs'

export default function PropsPanel({ block, updateBlock, deleteBlock, bringToFront, sendToBack, onClose }) {
  if (!block) return null
  const def = BLOCK_DEFS[block.type]

  const Btn = ({ onClick, children, title, active }) => (
    <button
      onClick={onClick}
      title={title}
      className={`w-7 h-7 rounded-lg border flex items-center justify-center cursor-pointer transition-all text-xs ${
        active ? 'border-accent bg-accent/10 text-accent' : 'border-border text-text-secondary hover:border-accent/50'
      }`}
    >
      {children}
    </button>
  )

  const Label = ({ children }) => (
    <div className="text-[10px] font-medium text-text-secondary/60 uppercase tracking-wider">{children}</div>
  )

  return (
    <div className="absolute right-0 top-0 bottom-0 w-72 z-30 border-l border-border bg-bg-card/95 backdrop-blur-sm flex flex-col overflow-y-auto print:hidden shadow-lg">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
        <span className="text-xs font-semibold">{def?.label || '블록'}</span>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary cursor-pointer text-xs">x</button>
      </div>

      <div className="p-3 space-y-4">
        {/* 배경 */}
        <div className="space-y-2">
          <Label>배경</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={block.bgColor}
              onChange={(e) => updateBlock(block.id, { bgColor: e.target.value })}
              className="w-8 h-8 rounded-lg border border-border cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-text-secondary">투명도</span>
                <span className="text-[10px] text-text-secondary ml-auto">{block.bgOpacity}%</span>
              </div>
              <input
                type="range" min="0" max="100" value={block.bgOpacity}
                onChange={(e) => updateBlock(block.id, { bgOpacity: parseInt(e.target.value) })}
                className="w-full h-1 accent-accent"
              />
            </div>
          </div>
        </div>

        {/* 텍스트 */}
        <div className="space-y-2">
          <Label>텍스트</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={block.fontColor || '#1a1a2e'}
              onChange={(e) => updateBlock(block.id, { fontColor: e.target.value })}
              className="w-8 h-8 rounded-lg border border-border cursor-pointer"
            />
            <div className="flex items-center gap-1">
              <Btn onClick={() => updateBlock(block.id, { fontSize: Math.max(8, block.fontSize - 1) })}>-</Btn>
              <span className="text-xs w-6 text-center">{block.fontSize}</span>
              <Btn onClick={() => updateBlock(block.id, { fontSize: block.fontSize + 1 })}>+</Btn>
            </div>
          </div>
        </div>

        {/* 강조색 */}
        <div className="space-y-2">
          <Label>강조색</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={block.accent}
              onChange={(e) => updateBlock(block.id, { accent: e.target.value })}
              className="w-8 h-8 rounded-lg border border-border cursor-pointer"
            />
            <span className="text-[10px] text-text-secondary">섹션 제목, 구분선 색상</span>
          </div>
        </div>

        {/* 여백 & 모서리 */}
        <div className="space-y-2">
          <Label>여백 & 모서리</Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary w-7">여백</span>
              <Btn onClick={() => updateBlock(block.id, { padding: Math.max(0, block.padding - 2) })}>-</Btn>
              <span className="text-[10px] w-4 text-center">{block.padding}</span>
              <Btn onClick={() => updateBlock(block.id, { padding: block.padding + 2 })}>+</Btn>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-text-secondary w-7">둥글기</span>
              <Btn onClick={() => updateBlock(block.id, { borderRadius: Math.max(0, (block.borderRadius || 0) - 2) })}>-</Btn>
              <span className="text-[10px] w-4 text-center">{block.borderRadius || 0}</span>
              <Btn onClick={() => updateBlock(block.id, { borderRadius: (block.borderRadius || 0) + 2 })}>+</Btn>
            </div>
          </div>
        </div>

        {/* 레이어 */}
        <div className="space-y-2">
          <Label>레이어</Label>
          <div className="flex gap-1">
            <Btn onClick={sendToBack} title="맨 뒤로">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 14l-7 7-7-7M19 3l-7 7-7-7"/></svg>
            </Btn>
            <Btn onClick={bringToFront} title="맨 앞으로">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 10l7-7 7 7M5 21l7-7 7 7"/></svg>
            </Btn>
          </div>
        </div>

        {/* 삭제 */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => deleteBlock(block.id)}
            className="w-full py-1.5 rounded-lg border border-danger/30 text-xs text-danger hover:bg-danger/5 cursor-pointer transition-all"
          >
            블록 삭제
          </button>
        </div>
      </div>
    </div>
  )
}
