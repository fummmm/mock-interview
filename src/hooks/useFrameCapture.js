import { useState, useRef, useCallback } from 'react'

const CAPTURE_INTERVAL = 5000
const MAX_FRAMES = 6

export function useFrameCapture(videoRef) {
  const [frames, setFrames] = useState([])
  const framesRef = useRef([]) // 동기적 접근용 ref
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
    return canvas.toDataURL('image/jpeg', 0.6)
  }, [videoRef])

  const updateFrames = (newFrames) => {
    framesRef.current = newFrames
    setFrames(newFrames)
  }

  const startCapture = useCallback(() => {
    updateFrames([])
    const first = captureFrame()
    if (first) updateFrames([first])

    intervalRef.current = setInterval(() => {
      const frame = captureFrame()
      if (!frame) return
      const prev = framesRef.current
      if (prev.length < MAX_FRAMES) {
        updateFrames([...prev, frame])
      } else {
        const step = Math.floor(prev.length / (MAX_FRAMES - 1))
        const kept = [prev[0]]
        for (let i = 1; i < MAX_FRAMES - 1; i++) {
          kept.push(prev[Math.min(i * step, prev.length - 1)])
        }
        kept.push(frame)
        updateFrames(kept)
      }
    }, CAPTURE_INTERVAL)
  }, [captureFrame])

  // stopCapture: 최종 frames 배열을 동기적으로 반환
  const stopCapture = useCallback(() => {
    clearInterval(intervalRef.current)
    const last = captureFrame()
    if (last) {
      const prev = framesRef.current
      const final = prev.length < MAX_FRAMES ? [...prev, last] : [...prev.slice(0, MAX_FRAMES - 1), last]
      updateFrames(final)
      return final
    }
    return framesRef.current
  }, [captureFrame])

  const clearFrames = useCallback(() => {
    updateFrames([])
  }, [])

  return { frames, framesRef, startCapture, stopCapture, clearFrames }
}
