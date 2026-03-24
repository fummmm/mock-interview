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

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' })
        const blobUrl = URL.createObjectURL(blob)
        chunksRef.current = []
        resolve({ blob, blobUrl, duration: Math.floor((Date.now() - startTimeRef.current) / 1000) })
      }

      recorder.stop()
    })
  }, [])

  return { isRecording, duration, startRecording, stopRecording }
}
