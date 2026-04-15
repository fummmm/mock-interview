import { useState, useCallback, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { BLOCK_DEFS, PALETTE_GROUPS } from './blockDefs'
import Sidebar from './components/Sidebar'
import PropsPanel from './components/PropsPanel'

const A4_W = 794 // A4 width in px at 96dpi
const A4_H = 1123 // A4 height in px
const SNAP_THRESHOLD = 8
const EDGE_THRESHOLD = 16

let nextId = 1

export default function ResumeBuilderPage() {
  const [blocks, setBlocks] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const canvasRef = useRef(null)

  const selectedBlock = blocks.find((b) => b.id === selectedId)

  // 블록 추가 (사이드바에서 드롭)
  const addBlock = useCallback((type, x, y) => {
    const def = BLOCK_DEFS[type]
    if (!def) return
    const id = `block-${nextId++}`
    const isDecor = type.startsWith('cb-') || type.startsWith('dv-')
    setBlocks((prev) => {
      // 자동 배치: 마지막 블록 아래에 20px 간격
      let posX = x ?? 40
      let posY = y ?? 40
      if (x === undefined && y === undefined && prev.length > 0) {
        const lastBlock = prev[prev.length - 1]
        const lastH = typeof lastBlock.h === 'number' ? lastBlock.h : 100
        posX = lastBlock.x
        posY = lastBlock.y + lastH + 20
      }
      return [
        ...prev,
        {
          id,
          type,
          x: posX,
          y: posY,
          w: def.w || 400,
          h: def.h || 'auto',
          zIndex: prev.length + 10,
          accent: '#E8344E',
          fontColor: '#1a1a2e',
          bgColor: isDecor ? '#ffffff' : '#ffffff',
          bgOpacity: isDecor ? 0 : 100,
          fontSize: 14,
          padding: isDecor ? 0 : 12,
          borderRadius: 0,
          content: {},
        },
      ]
    })
    setSelectedId(id)
  }, [])

  // 블록 업데이트
  const updateBlock = useCallback((id, updates) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)))
  }, [])

  // 블록 삭제
  const deleteBlock = useCallback(
    (id) => {
      setBlocks((prev) => prev.filter((b) => b.id !== id))
      if (selectedId === id) setSelectedId(null)
    },
    [selectedId],
  )

  // 스냅 계산
  const calcSnap = useCallback(
    (dragId, x, y, w, h) => {
      let sx = x,
        sy = y
      let snappedX = false,
        snappedY = false

      // 캔버스 경계 스냅
      if (Math.abs(x) < EDGE_THRESHOLD) {
        sx = 0
        snappedX = true
      }
      if (Math.abs(y) < EDGE_THRESHOLD) {
        sy = 0
        snappedY = true
      }
      if (Math.abs(x + w - A4_W) < EDGE_THRESHOLD) {
        sx = A4_W - w
        snappedX = true
      }
      if (Math.abs(y + h - A4_H) < EDGE_THRESHOLD) {
        sy = A4_H - h
        snappedY = true
      }

      // 블록 간 스냅
      if (!snappedX || !snappedY) {
        for (const other of blocks) {
          if (other.id === dragId) continue
          const oh = typeof other.h === 'number' ? other.h : 100

          if (!snappedX) {
            // 좌-좌
            if (Math.abs(x - other.x) < SNAP_THRESHOLD) {
              sx = other.x
              snappedX = true
            }
            // 우-우
            if (Math.abs(x + w - (other.x + other.w)) < SNAP_THRESHOLD) {
              sx = other.x + other.w - w
              snappedX = true
            }
            // 좌-우
            if (Math.abs(x - (other.x + other.w)) < SNAP_THRESHOLD) {
              sx = other.x + other.w
              snappedX = true
            }
            // 우-좌
            if (Math.abs(x + w - other.x) < SNAP_THRESHOLD) {
              sx = other.x - w
              snappedX = true
            }
          }

          if (!snappedY) {
            // 상-상
            if (Math.abs(y - other.y) < SNAP_THRESHOLD) {
              sy = other.y
              snappedY = true
            }
            // 하-하
            if (Math.abs(y + h - (other.y + oh)) < SNAP_THRESHOLD) {
              sy = other.y + oh - h
              snappedY = true
            }
            // 상-하
            if (Math.abs(y - (other.y + oh)) < SNAP_THRESHOLD) {
              sy = other.y + oh
              snappedY = true
            }
            // 하-상
            if (Math.abs(y + h - other.y) < SNAP_THRESHOLD) {
              sy = other.y - h
              snappedY = true
            }
          }
        }
      }

      return { x: sx, y: sy }
    },
    [blocks],
  )

  // 레이어 순서
  const bringToFront = useCallback(() => {
    if (!selectedId) return
    setBlocks((prev) => {
      const max = Math.max(...prev.map((b) => b.zIndex))
      return prev.map((b) => (b.id === selectedId ? { ...b, zIndex: max + 1 } : b))
    })
  }, [selectedId])

  const sendToBack = useCallback(() => {
    if (!selectedId) return
    setBlocks((prev) => {
      const min = Math.min(...prev.map((b) => b.zIndex))
      return prev.map((b) => (b.id === selectedId ? { ...b, zIndex: Math.max(1, min - 1) } : b))
    })
  }, [selectedId])

  // 로컬 저장/불러오기
  const saveToLocal = useCallback(() => {
    localStorage.setItem('rb_react_current', JSON.stringify(blocks))
  }, [blocks])

  const loadFromLocal = useCallback(() => {
    const saved = localStorage.getItem('rb_react_current')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        setBlocks(parsed)
        nextId = Math.max(...parsed.map((b) => parseInt(b.id.split('-')[1]) || 0)) + 1
      } catch (e) {
        /* ignore */
      }
    }
  }, [])

  // 자동 저장
  const autoSaveTimer = useRef(null)
  const triggerAutoSave = useCallback(() => {
    clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      localStorage.setItem('rb_react_current', JSON.stringify(blocks))
    }, 1200)
  }, [blocks])

  // PDF 출력
  const printResume = useCallback(() => {
    setSelectedId(null)
    setTimeout(() => window.print(), 100)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary print:block">
      {/* 사이드바 */}
      <Sidebar onAddBlock={addBlock} className="print:hidden" />

      {/* 메인 영역 */}
      <div className="relative flex flex-1 flex-col overflow-hidden print:overflow-visible">
        {/* 상단 바 */}
        <div className="flex items-center justify-between border-b border-border bg-bg-card px-4 py-2 print:hidden">
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs text-text-secondary hover:text-accent transition-colors">← 돌아가기</a>
            <div className="w-px h-4 bg-border" />
            <h1 className="text-sm font-semibold">이력서 빌더</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadFromLocal}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-text-secondary hover:border-accent/50 transition-all cursor-pointer"
            >
              불러오기
            </button>
            <button
              onClick={saveToLocal}
              className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-1.5 text-xs text-accent hover:bg-accent/10 transition-all cursor-pointer"
            >
              저장
            </button>
            <button
              onClick={printResume}
              className="rounded-lg bg-accent px-4 py-1.5 text-xs font-medium text-white hover:bg-accent-hover transition-all cursor-pointer"
            >
              PDF 출력
            </button>
          </div>
        </div>

        {/* 캔버스 스크롤 영역 */}
        <div className="flex-1 overflow-auto bg-bg-elevated p-8 print:overflow-visible print:p-0">
          <div
            ref={canvasRef}
            className="relative mx-auto bg-white shadow-lg print:shadow-none"
            style={{ width: A4_W, minHeight: A4_H }}
            onClick={(e) => {
              if (e.target === canvasRef.current) setSelectedId(null)
            }}
          >
            {/* A4 경계선 (인쇄 시 숨김) */}
            <div
              className="pointer-events-none absolute inset-0 print:hidden"
              style={{ outline: '1.5px dashed #d4d4de' }}
            />

            {blocks.map((block) => {
              const def = BLOCK_DEFS[block.type]
              if (!def) return null
              const BlockComponent = def.component

              return (
                <Rnd
                  key={block.id}
                  position={{ x: block.x, y: block.y }}
                  size={{
                    width: block.w,
                    height: typeof block.h === 'number' ? block.h : undefined,
                  }}
                  minWidth={60}
                  minHeight={20}
                  style={{ zIndex: block.zIndex }}
                  onDragStop={(e, d) => {
                    const snapped = calcSnap(block.id, d.x, d.y, block.w, typeof block.h === 'number' ? block.h : 100)
                    updateBlock(block.id, { x: snapped.x, y: snapped.y })
                    triggerAutoSave()
                  }}
                  onResizeStop={(e, dir, ref, delta, pos) => {
                    updateBlock(block.id, {
                      w: ref.offsetWidth,
                      h: ref.offsetHeight,
                      x: pos.x,
                      y: pos.y,
                    })
                    triggerAutoSave()
                  }}
                  onMouseDown={() => setSelectedId(block.id)}
                  enableResizing={{
                    bottomRight: true,
                    right: true,
                    bottom: true,
                  }}
                  className={`group ${selectedId === block.id ? 'ring-2 ring-accent' : ''}`}
                >
                  {/* 드래그 핸들 */}
                  <div className="absolute -top-6 left-0 right-0 flex h-6 items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity print:hidden">
                    <span className="text-[10px] text-text-secondary">{def.label}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteBlock(block.id)
                      }}
                      className="text-xs text-text-secondary hover:text-danger cursor-pointer"
                    >
                      x
                    </button>
                  </div>

                  {/* 블록 콘텐츠 */}
                  <div
                    className="h-full w-full overflow-hidden"
                    style={{
                      backgroundColor: `rgba(${hexToRgb(block.bgColor)}, ${block.bgOpacity / 100})`,
                      padding: block.padding,
                      fontSize: block.fontSize,
                      color: block.fontColor,
                      borderRadius: block.borderRadius,
                      '--accent': block.accent,
                    }}
                  >
                    <BlockComponent block={block} updateBlock={updateBlock} />
                  </div>

                  {/* 리사이즈 핸들 시각화 */}
                  <div className="absolute bottom-0 right-0 h-3 w-3 cursor-se-resize opacity-0 group-hover:opacity-100 print:hidden">
                    <svg viewBox="0 0 10 10" className="h-full w-full text-text-secondary/40">
                      <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </div>
                </Rnd>
              )
            })}
          </div>
        </div>

        {/* 프로퍼티 패널 */}
        {selectedBlock && (
          <PropsPanel
            block={selectedBlock}
            updateBlock={updateBlock}
            bringToFront={bringToFront}
            sendToBack={sendToBack}
          />
        )}
      </div>
    </div>
  )
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}
