import { useState, useRef, useCallback } from 'react'

const CAPTURE_INTERVAL = 7000 // 7초 간격
const MAX_FRAMES = 3 // 질문당 최대 프레임 수

export function useFrameCapture(videoRef) {
  const [frames, setFrames] = useState([])
  const intervalRef = useRef(null)
  const canvasRef = useRef(null)

  // 캔버스 lazy 생성
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
    return canvas.toDataURL('image/jpeg', 0.7)
  }, [videoRef])

  const startCapture = useCallback(() => {
    setFrames([])

    // 즉시 첫 프레임 캡처
    const first = captureFrame()
    if (first) setFrames([first])

    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (!frame) return

      setFrames((prev) => {
        if (prev.length < MAX_FRAMES) {
          return [...prev, frame]
        }
        // 3장 초과 시: 시작 유지, 중간 교체, 끝 = 최신
        return [prev[0], prev[prev.length - 1], frame]
      })
    }, CAPTURE_INTERVAL)
  }, [captureFrame])

  const stopCapture = useCallback(() => {
    clearInterval(intervalRef.current)
    // 마지막 프레임 캡처 (끝 시점)
    const last = captureFrame()
    if (last) {
      setFrames((prev) => {
        if (prev.length < MAX_FRAMES) return [...prev, last]
        return [prev[0], prev[1], last]
      })
    }
  }, [captureFrame])

  const clearFrames = useCallback(() => {
    setFrames([])
  }, [])

  return { frames, startCapture, stopCapture, clearFrames }
}
