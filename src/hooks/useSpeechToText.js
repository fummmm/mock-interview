import { useState, useRef, useCallback } from 'react'

// TODO: OpenAI Whisper API 키 확보 시 useWhisper.js로 교체 가능
// 현재는 Web Speech API (브라우저 내장, 무료, Chrome 전용)
// Whisper 전환 시: 녹화 Blob → /api/transcribe → Whisper API → transcript + word_timestamps

const FILLER_WORDS = ['음', '어', '그', '아', '에', '음음', '어어']
const SILENCE_THRESHOLD = 3000 // 3초 이상 음성 없으면 침묵으로 판정

export function useSpeechToText() {
  const [transcript, setTranscript] = useState('')
  const [interimText, setInterimText] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [fillerCount, setFillerCount] = useState(0)
  const [silenceCount, setSilenceCount] = useState(0)

  // ref로 최신값 항상 접근 가능 (useCallback 클로저 stale state 방지)
  const transcriptRef = useRef('')
  const fillerCountRef = useRef(0)
  const silenceCountRef = useRef(0)

  const recognitionRef = useRef(null)
  const lastResultTimeRef = useRef(null)
  const silenceTimerRef = useRef(null)
  const isActiveRef = useRef(false)

  const isSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const start = useCallback(() => {
    if (!isSupported) return

    // 이전 인스턴스 완전 정리
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch (e) { /* ignore */ }
    }

    // 매 질문마다 새 인스턴스 생성 (누적 버그 방지)
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'ko-KR'
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    // 새 결과만 처리하기 위한 인덱스
    let processedIndex = 0

    recognition.onresult = (event) => {
      // 마지막 결과 시간 업데이트 (침묵 감지용)
      lastResultTimeRef.current = Date.now()

      let newFinal = ''
      let interim = ''

      // processedIndex 이후의 새 결과만 처리
      for (let i = processedIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          newFinal += result[0].transcript
          processedIndex = i + 1
        } else {
          interim += result[0].transcript
        }
      }

      if (newFinal) {
        const trimmed = newFinal.trim()
        setTranscript((prev) => {
          const updated = prev + (prev ? ' ' : '') + trimmed
          transcriptRef.current = updated
          return updated
        })

        // 습관어 카운트
        const words = trimmed.split(/\s+/)
        const fillers = words.filter((w) => FILLER_WORDS.includes(w)).length
        if (fillers > 0) {
          setFillerCount((c) => { const v = c + fillers; fillerCountRef.current = v; return v })
        }
      }

      setInterimText(interim)
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      console.warn('STT error:', event.error)
    }

    recognition.onend = () => {
      // 활성 상태면 즉시 재시작 (Chrome이 빠른 말에서 세션을 끊음)
      if (isActiveRef.current) {
        // 끊기기 직전 interim 텍스트가 있으면 transcript에 반영
        setInterimText((prev) => {
          if (prev.trim()) {
            const trimmed = prev.trim()
            setTranscript((t) => {
              const updated = t + (t ? ' ' : '') + trimmed
              transcriptRef.current = updated
              return updated
            })
          }
          return ''
        })
        processedIndex = 0
        // 즉시 재시작 (딜레이 없이)
        try { recognition.start() } catch (e) { /* ignore */ }
      }
    }

    recognitionRef.current = recognition
    isActiveRef.current = true
    lastResultTimeRef.current = Date.now()

    // 상태 초기화
    setTranscript(''); transcriptRef.current = ''
    setInterimText('')
    setFillerCount(0); fillerCountRef.current = 0
    setSilenceCount(0); silenceCountRef.current = 0

    try {
      recognition.start()
      setIsListening(true)
    } catch (e) {
      console.warn('STT start failed:', e)
    }

    // 침묵 감지 타이머
    // 마지막 음성 인식 결과로부터 SILENCE_THRESHOLD 이상 지나면 침묵 1회 카운트
    let lastCountedSilenceStart = 0
    silenceTimerRef.current = setInterval(() => {
      if (!isActiveRef.current || !lastResultTimeRef.current) return
      const elapsed = Date.now() - lastResultTimeRef.current
      if (elapsed >= SILENCE_THRESHOLD) {
        // 같은 침묵 구간을 중복 카운트하지 않음
        if (lastResultTimeRef.current !== lastCountedSilenceStart) {
          lastCountedSilenceStart = lastResultTimeRef.current
          setSilenceCount((c) => { const v = c + 1; silenceCountRef.current = v; return v })
        }
      }
    }, 1000)
  }, [isSupported])

  const stop = useCallback(() => {
    isActiveRef.current = false
    clearInterval(silenceTimerRef.current)
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch (e) { /* ignore */ }
    }
    setIsListening(false)
    setInterimText('')
  }, [])

  const reset = useCallback(() => {
    setTranscript(''); transcriptRef.current = ''
    setInterimText('')
    setFillerCount(0); fillerCountRef.current = 0
    setSilenceCount(0); silenceCountRef.current = 0
  }, [])

  return {
    transcript,
    interimText,
    isListening,
    isSupported,
    fillerCount,
    silenceCount,
    transcriptRef,
    fillerCountRef,
    silenceCountRef,
    start,
    stop,
    reset,
  }
}
