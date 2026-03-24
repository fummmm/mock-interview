import { useState, useRef, useCallback } from 'react'

const CAPTURE_INTERVAL = 5000 // 5초 간격
const MAX_FRAMES = 6 // 질문당 최대 프레임 (비용 vs 커버리지 균형)

export function useFrameCapture(videoRef) {
  const [frames, setFrames] = useState([])
  const intervalRef = useRef(null)
  const canvasRef = useRef(null)

  const getCanvas = () => {
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas')
      canvasRef.current.width = 640
      canvasRef.current.height = 480
    }
    return canvasRef.current
  }

  const captureFrame = useCallback(() => {
    const video = videoRef?.current
    if (!video || video.readyState < 2) return null

    const canvas = getCanvas()
    const ctx = canvas.getContext('2d')
    ctx.drawImage(video, 0, 0, 640, 480)
    return canvas.toDataURL('image/jpeg', 0.6) // 약간 압축 (프레임 수 늘었으니)
  }, [videoRef])

  const startCapture = useCallback(() => {
    setFrames([])
    const first = captureFrame()
    if (first) setFrames([first])

    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (!frame) return

      setFrames((prev) => {
        if (prev.length < MAX_FRAMES) return [...prev, frame]
        // 초과 시: 첫 프레임 유지, 균등 간격으로 대표 프레임 선택
        const step = Math.floor(prev.length / (MAX_FRAMES - 1))
        const kept = [prev[0]]
        for (let i = 1; i < MAX_FRAMES - 1; i++) {
          kept.push(prev[Math.min(i * step, prev.length - 1)])
        }
        kept.push(frame) // 최신 프레임
        return kept
      })
    }, CAPTURE_INTERVAL)
  }, [captureFrame])

  const stopCapture = useCallback(() => {
    clearInterval(intervalRef.current)
    const last = captureFrame()
    if (last) {
      setFrames((prev) => {
        if (prev.length < MAX_FRAMES) return [...prev, last]
        return [...prev.slice(0, MAX_FRAMES - 1), last]
      })
    }
  }, [captureFrame])

  const clearFrames = useCallback(() => {
    setFrames([])
  }, [])

  return { frames, startCapture, stopCapture, clearFrames }
}
