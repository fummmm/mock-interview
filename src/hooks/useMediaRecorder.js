import { useState, useRef, useCallback } from 'react'

export function useMediaRecorder(stream) {
  const [isRecording, setIsRecording] = useState(false)
  const [duration, setDuration] = useState(0)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startTimeRef = useRef(null)

  const startRecording = useCallback(() => {
    if (!stream) return null
    chunksRef.current = []

    // mimeType 호환성 체크
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : ''

    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorderRef.current = recorder

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }

    recorder.start(1000) // 1초 간격으로 청크
    setIsRecording(true)
    setDuration(0)
    startTimeRef.current = Date.now()

    timerRef.current = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000))
    }, 1000)

    return recorder
  }, [stream])

  const stopRecording = useCallback(() => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === 'inactive') {
        resolve(null)
        return
      }

      clearInterval(timerRef.current)
      setIsRecording(false)

      // 1. 마지막 청크 강제 플러시 (recording/paused 상태에서만 가능)
      if (recorder.state === 'recording' || recorder.state === 'paused') {
        try {
          recorder.requestData()
        } catch {
          // requestData() 미지원 브라우저 대비 — 무시하고 진행
        }
      }

      // 2. onstop에서 Blob 생성 (requestData 후이므로 모든 청크 수신됨)
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'video/webm',
        })
        const blobUrl = URL.createObjectURL(blob)
        chunksRef.current = []
        resolve({
          blob,
          blobUrl,
          duration: Math.floor((Date.now() - startTimeRef.current) / 1000),
        })
      }

      // 3. requestData() 후 지연을 두고 stop (ondataavailable 처리 시간 확보)
      setTimeout(() => {
        recorder.stop()
      }, 100)
    })
  }, [])

  return { isRecording, duration, startRecording, stopRecording }
}
