import { useState, useRef, useCallback, useEffect } from 'react'

export function useMediaStream() {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle | requesting | granted | denied
  const videoRef = useRef(null)

  const requestPermission = useCallback(async () => {
    setStatus('requesting')
    setError(null)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
        audio: true,
      })
      setStream(mediaStream)
      setStatus('granted')
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      return mediaStream
    } catch (err) {
      setError(err.message)
      setStatus('denied')
      return null
    }
  }, [])

  const stopStream = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      setStream(null)
      setStatus('idle')
    }
  }, [stream])

  // videoRef가 바뀌면 stream 연결
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop())
    }
  }, [stream])

  return { stream, videoRef, error, status, requestPermission, stopStream }
}
