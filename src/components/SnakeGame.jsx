import { useEffect, useRef, useState, useCallback } from 'react'

const CELL = 16
const COLS = 26
const ROWS = 18
const W = COLS * CELL // 416
const H = ROWS * CELL // 288
const SPEED = 120

const DIR = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] }

export default function SnakeGame({ initialDir = 'RIGHT', onClose }) {
  const canvasRef = useRef(null)
  const stateRef = useRef(null)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [highScore, setHighScore] = useState(() =>
    parseInt(localStorage.getItem('snake_high') || '0'),
  )

  const init = useCallback((startDir) => {
    const d = DIR[startDir] || DIR.RIGHT
    const snake = [
      { x: 13, y: 9 },
      { x: 13 - d[0], y: 9 - d[1] },
      { x: 13 - d[0] * 2, y: 9 - d[1] * 2 },
    ]
    const food = spawnFood(snake)
    stateRef.current = {
      snake,
      food,
      dir: d,
      nextDir: d,
      alive: true,
      started: false,
    }
    setScore(0)
    setGameOver(false)
  }, [])

  useEffect(() => {
    init(initialDir)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 게임 루프
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const interval = setInterval(() => {
      const s = stateRef.current
      if (!s) return

      // 이동 (started 상태에서만)
      if (s.alive && s.started) {
        s.dir = s.nextDir
        const head = { x: s.snake[0].x + s.dir[0], y: s.snake[0].y + s.dir[1] }

        if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
          s.alive = false
          setGameOver(true)
          if (score > highScore) {
            setHighScore(score)
            localStorage.setItem('snake_high', score.toString())
          }
          return
        }

        if (s.snake.some((seg) => seg.x === head.x && seg.y === head.y)) {
          s.alive = false
          setGameOver(true)
          if (score > highScore) {
            setHighScore(score)
            localStorage.setItem('snake_high', score.toString())
          }
          return
        }

        s.snake.unshift(head)

        if (head.x === s.food.x && head.y === s.food.y) {
          setScore((prev) => prev + 1)
          s.food = spawnFood(s.snake)
        } else {
          s.snake.pop()
        }
      }

      // 죽은 상태면 렌더 스킵 (이전 프레임 유지)
      if (!s.alive) return

      // 렌더 (대기/플레이 모두)
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, W, H)

      ctx.strokeStyle = '#22223a'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= COLS; x++) {
        ctx.beginPath()
        ctx.moveTo(x * CELL, 0)
        ctx.lineTo(x * CELL, H)
        ctx.stroke()
      }
      for (let y = 0; y <= ROWS; y++) {
        ctx.beginPath()
        ctx.moveTo(0, y * CELL)
        ctx.lineTo(W, y * CELL)
        ctx.stroke()
      }

      s.snake.forEach((seg, i) => {
        const ratio = 1 - (i / s.snake.length) * 0.4
        ctx.fillStyle = i === 0 ? '#d14558' : `rgba(209, 69, 88, ${ratio})`
        ctx.fillRect(seg.x * CELL + 1, seg.y * CELL + 1, CELL - 2, CELL - 2)
        if (i === 0) {
          ctx.fillStyle = '#fff'
          const ex = s.dir[0] === 1 ? 10 : s.dir[0] === -1 ? 2 : 6
          const ey = s.dir[1] === 1 ? 10 : s.dir[1] === -1 ? 2 : 5
          ctx.fillRect(seg.x * CELL + ex, seg.y * CELL + ey, 3, 3)
        }
      })

      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2)
      ctx.fill()

      // 대기 상태 안내 텍스트
      if (!s.started) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.font = '13px sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText('방향키를 눌러 시작', W / 2, H / 2 + 48)
      }
    }, SPEED)

    return () => clearInterval(interval)
  }, [score, highScore])

  // 키보드
  useEffect(() => {
    const handler = (e) => {
      const s = stateRef.current
      if (!s) return

      if (gameOver && e.key === ' ') {
        init('RIGHT')
        return
      }
      if (e.key === 'Escape') {
        onClose?.()
        return
      }

      const keyMap = {
        ArrowUp: DIR.UP,
        ArrowDown: DIR.DOWN,
        ArrowLeft: DIR.LEFT,
        ArrowRight: DIR.RIGHT,
        w: DIR.UP,
        s: DIR.DOWN,
        a: DIR.LEFT,
        d: DIR.RIGHT,
      }
      const newDir = keyMap[e.key]
      if (newDir) {
        e.preventDefault()
        // 반대 방향 방지
        if (newDir[0] === -s.dir[0] && newDir[1] === -s.dir[1]) return

        if (!s.started) {
          s.nextDir = newDir
          s.started = true
          return
        }
        s.nextDir = newDir
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [gameOver, init, onClose])

  return (
    <div className="relative">
      <div className="flex h-7 items-center justify-between px-2" style={{ width: W }}>
        <span className="text-accent text-xs font-bold">{score}점</span>
        <span className="text-text-secondary text-[10px]">최고 {highScore}</span>
        <button
          onClick={onClose}
          className="text-text-secondary hover:text-text-primary cursor-pointer text-[10px]"
        >
          ESC 닫기
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{ imageRendering: 'pixelated', display: 'block' }}
      />
      {gameOver && (
        <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50">
          <div className="text-center">
            <p className="text-sm font-bold text-white">Game Over! ({score}점)</p>
            <p className="mt-1 text-xs text-white/60">SPACE 재시작 / ESC 닫기</p>
          </div>
        </div>
      )}
    </div>
  )
}

function spawnFood(snake) {
  let pos
  do {
    pos = {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    }
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y))
  return pos
}
