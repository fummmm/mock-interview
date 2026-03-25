import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * 마이크 오디오 레벨 실시간 감지
 * stream을 받아서 볼륨 레벨(0~1)을 반환
 */
export function useAudioLevel(stream) {
  const [level, setLevel] = useState(0)
  const analyserRef = useRef(null)
  const animFrameRef = useRef(null)
  const contextRef = useRef(null)

  useEffect(() => {
    if (!stream) { setLevel(0); return }

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const analyser = audioCtx.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.8

    const source = audioCtx.createMediaStreamSource(stream)
    source.connect(analyser)

    contextRef.current = audioCtx
    analyserRef.current = analyser

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      analyser.getByteFrequencyData(dataArray)
      // RMS 계산
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length) / 255
      // 노이즈 플로어 제거 (0.08 이하는 배경 소음으로 무시)
      const cleaned = rms > 0.08 ? (rms - 0.08) / 0.92 : 0
      setLevel(cleaned)
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      source.disconnect()
      audioCtx.close()
    }
  }, [stream])

  return level
}
