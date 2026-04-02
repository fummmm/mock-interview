import { useState, useRef, useCallback, useEffect } from 'react'

export function useMediaStream() {
  const [stream, setStream] = useState(null)
  const [error, setError] = useState(null)
  const [status, setStatus] = useState('idle') // idle | requesting | granted | denied
  const [devices, setDevices] = useState({ video: [], audio: [] })
  const [selectedVideo, setSelectedVideo] = useState('')
  const [selectedAudio, setSelectedAudio] = useState('')
  const videoRef = useRef(null)

  // 기기 목록 조회
  const loadDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices()
      setDevices({
        video: all.filter((d) => d.kind === 'videoinput'),
        audio: all.filter((d) => d.kind === 'audioinput'),
      })
    } catch (e) {
      console.warn('기기 목록 조회 실패:', e.message)
    }
  }, [])

  const requestPermission = useCallback(async (videoId, audioId) => {
    setStatus('requesting')
    setError(null)
    try {
      const constraints = {
        video: videoId
          ? { deviceId: { exact: videoId }, width: 640, height: 480 }
          : { width: 640, height: 480, facingMode: 'user' },
        audio: audioId
          ? { deviceId: { exact: audioId } }
          : true,
      }
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints)
      setStream(mediaStream)
      setStatus('granted')
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream
      }
      // 권한 획득 후 기기 목록 갱신 (라벨 노출됨)
      await loadDevices()
      return mediaStream
    } catch (err) {
      setError(err.message)
      setStatus('denied')
      return null
    }
  }, [loadDevices])

  // 기기 변경
  const switchDevice = useCallback(async (videoId, audioId) => {
    // 기존 스트림 정리
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
    }
    if (videoId) setSelectedVideo(videoId)
    if (audioId) setSelectedAudio(audioId)
    return requestPermission(videoId || selectedVideo, audioId || selectedAudio)
  }, [stream, selectedVideo, selectedAudio, requestPermission])

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

  return {
    stream, videoRef, error, status,
    devices, selectedVideo, selectedAudio,
    requestPermission, switchDevice, stopStream, loadDevices,
  }
}
