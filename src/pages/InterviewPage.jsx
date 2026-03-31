import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useMediaStream } from '../hooks/useMediaStream'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { useFrameCapture } from '../hooks/useFrameCapture'
import { useAudioLevel } from '../hooks/useAudioLevel'
import { transcribeAudio, preloadModel, isModelLoaded } from '../lib/whisper'
import { correctTranscript, generateFollowUp } from '../lib/api'
import { getEvaluators } from '../data/evaluators'
import { useEffect, useCallback, useRef, useState } from 'react'

/**
 * 상태 머신:
 * briefing → ready → recording → generating-followup →
 *   ├── followup-ready → followup-recording → next (ready or processing)
 *   └── no followup → next (ready or processing)
 */
export default function InterviewPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const {
    phase, questions, currentIndex,
    setPhase, updateAnswer, nextQuestion, setMediaStream,
    incPendingSTT, decPendingSTT,
  } = useInterviewStore()

  const { stream, videoRef, error: mediaError, status: mediaStatus, requestPermission, stopStream } = useMediaStream()
  const { isRecording, duration, startRecording, stopRecording } = useMediaRecorder(stream)
  const { frames, startCapture, stopCapture, clearFrames } = useFrameCapture(videoRef)
  const audioLevel = useAudioLevel(stream)

  // Web Speech API (꼬리질문 생성용, UI 표시 없음)
  const speechRef = useRef(null)
  const roughTranscriptRef = useRef('')

  // 브리핑 + 꼬리질문 상태
  const [showBriefing, setShowBriefing] = useState(true)
  const [followUpQuestion, setFollowUpQuestion] = useState(null)
  const [followUpEvaluator, setFollowUpEvaluator] = useState(null)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [retryMessage, setRetryMessage] = useState(null)

  const evaluators = getEvaluators(track)
  const isMountedRef = useRef(true)
  useEffect(() => () => { isMountedRef.current = false }, [])

  const currentQuestion = questions[currentIndex]

  // 설정 없으면 홈으로
  useEffect(() => {
    if (!track || questions.length === 0) navigate('/')
  }, [track, questions, navigate])

  // 캠/마이크 권한 요청
  useEffect(() => {
    if (mediaStatus === 'idle') {
      requestPermission().then((s) => {
        if (s) setMediaStream(s)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (mediaStatus === 'granted' && !isModelLoaded()) {
      preloadModel().catch((e) => console.warn('모델 사전 로딩 실패:', e.message))
    }
  }, [mediaStatus])

  // 브리핑 닫힌 후 비디오 스트림 재연결
  useEffect(() => {
    if (!showBriefing && videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [showBriefing, stream, videoRef])

  // Web Speech API 초기화 (꼬리질문용 백그라운드)
  const initSpeech = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const recognition = new SR()
    recognition.lang = 'ko-KR'
    recognition.continuous = true
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (e) => {
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          roughTranscriptRef.current += ' ' + e.results[i][0].transcript
        }
      }
    }
    recognition.onend = () => {
      if (speechRef.current?._active) {
        try { recognition.start() } catch (e) { /* ignore */ }
      }
    }
    recognition.onerror = () => {} // 무시
    speechRef.current = recognition
  }, [])

  useEffect(() => { initSpeech() }, [initSpeech])

  const startSpeech = () => {
    roughTranscriptRef.current = ''
    if (speechRef.current) {
      speechRef.current._active = true
      try { speechRef.current.start() } catch (e) { /* ignore */ }
    }
  }
  const stopSpeech = () => {
    if (speechRef.current) {
      speechRef.current._active = false
      try { speechRef.current.stop() } catch (e) { /* ignore */ }
    }
  }

  const handleExit = useCallback(async () => {
    stopSpeech()
    stopStream()
    const { abandonSession } = useInterviewStore.getState()
    await abandonSession()
    navigate('/')
  }, [stopStream, navigate])

  // 백그라운드 STT + 교정 (세션 ID로 이전 세션 작업 무효화)
  const processInBackground = useCallback((idx, blob, questionText, isFollowUpAnswer = false) => {
    const mySession = useInterviewStore.getState().sessionId
    incPendingSTT()
    ;(async () => {
      try {
        if (useInterviewStore.getState().sessionId !== mySession) return

        const result = await transcribeAudio(blob)
        if (useInterviewStore.getState().sessionId !== mySession) return

        const corrected = await correctTranscript(result.transcript, questionText)
        if (useInterviewStore.getState().sessionId !== mySession) return

        if (isFollowUpAnswer) {
          const state = useInterviewStore.getState()
          const answers = [...state.answers]
          if (answers[idx]) {
            answers[idx] = {
              ...answers[idx],
              followUp: { ...answers[idx].followUp, rawTranscript: result.transcript, transcript: corrected, fillerWordCount: result.fillerWordCount },
            }
            useInterviewStore.setState({ answers })
          }
        } else {
          updateAnswer(idx, { rawTranscript: result.transcript, transcript: corrected, fillerWordCount: result.fillerWordCount, silenceSegments: result.silencePositions || [] })
        }
      } catch (e) {
        console.warn(`[백그라운드] Q${idx + 1}${isFollowUpAnswer ? ' 꼬리' : ''} 실패:`, e.message)
      } finally {
        if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
      }
    })()
  }, [updateAnswer, incPendingSTT, decPendingSTT])

  // === 메인 답변 시작 ===
  const handleStartAnswer = useCallback(() => {
    if (!stream) return
    clearFrames()
    startRecording()
    startCapture()
    startSpeech()
    setRetryMessage(null)
    setPhase('recording')
  }, [stream, clearFrames, startRecording, startCapture, setPhase])

  // === 메인 답변 완료 → 꼬리질문 판단 ===
  const handleStopAnswer = useCallback(async () => {
    stopSpeech()
    const finalFrames = stopCapture()
    const result = await stopRecording()
    if (!isMountedRef.current) return // 언마운트 후 setState 방지
    const idx = currentIndex
    const questionText = currentQuestion?.text || ''

    if (result) {
      updateAnswer(idx, {
        videoBlob: result.blob,
        videoBlobUrl: result.blobUrl,
        recordingDuration: result.duration,
        frames: finalFrames || frames,
      })
      processInBackground(idx, result.blob, questionText, false)
    }

    // 꼬리질문 판단
    setIsGenerating(true)
    try {
      const rough = roughTranscriptRef.current.trim()
      console.log(`[꼬리질문] Q${idx + 1} 거친 텍스트:`, rough?.slice(0, 80))

      // 녹화 완료 → 무조건 진행 (답변 미감지 차단 제거)
      // Web Speech API 실패해도 Whisper가 나중에 처리함
      const followUp = await generateFollowUp(questionText, rough || '', evaluators, currentQuestion?.id || '')
      console.log(`[꼬리질문] 판단:`, followUp)

      if (followUp.needed && followUp.question) {
        const asker = evaluators.find((e) => e.id === followUp.evaluatorId) || evaluators[0]
        setFollowUpQuestion(followUp.question)
        setFollowUpEvaluator(asker)
        updateAnswer(idx, {
          followUp: { question: followUp.question, evaluatorId: asker.id, evaluatorName: asker.name, transcript: '', rawTranscript: '', videoBlob: null, videoBlobUrl: null, frames: [], recordingDuration: 0 },
        })
        setIsFollowUp(true)
        setIsGenerating(false)
        setPhase('ready')
        return
      }
    } catch (e) {
      console.warn('[꼬리질문] 생성 실패 (타임아웃 또는 API 오류):', e.message)
      // 실패해도 무조건 다음으로 진행
    }

    // 꼬리질문 불필요 또는 실패 → 다음 메인 질문
    setIsGenerating(false)
    setFollowUpQuestion(null)
    setIsFollowUp(false)
    nextQuestion()
  }, [stopCapture, stopRecording, updateAnswer, currentIndex, currentQuestion, frames, processInBackground, nextQuestion, setPhase])

  // === 꼬리질문 답변 시작 ===
  const handleStartFollowUp = useCallback(() => {
    if (!stream) return
    clearFrames()
    startRecording()
    startCapture()
    startSpeech()
    setPhase('recording')
  }, [stream, clearFrames, startRecording, startCapture, setPhase])

  // === 꼬리질문 답변 완료 → 다음 메인 질문 ===
  const handleStopFollowUp = useCallback(async () => {
    stopSpeech()
    const finalFrames = stopCapture()
    const result = await stopRecording()
    const idx = currentIndex

    if (result) {
      const state = useInterviewStore.getState()
      const answers = [...state.answers]
      answers[idx] = {
        ...answers[idx],
        followUp: {
          ...answers[idx].followUp,
          videoBlob: result.blob,
          videoBlobUrl: result.blobUrl,
          recordingDuration: result.duration,
          frames: finalFrames || frames,
        },
      }
      useInterviewStore.setState({ answers })
      processInBackground(idx, result.blob, followUpQuestion || '', true)
    }

    setFollowUpQuestion(null)
    setIsFollowUp(false)
    nextQuestion()
  }, [stopCapture, stopRecording, currentIndex, frames, followUpQuestion, processInBackground, nextQuestion])

  // processing → 분석 페이지 이동
  useEffect(() => {
    if (phase === 'processing') {
      stopSpeech()
      stopStream()
      navigate('/analyzing')
    }
  }, [phase, stopStream, navigate])

  if (!currentQuestion) return null

  // === 브리핑 화면 ===
  if (showBriefing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="max-w-2xl w-full space-y-8">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold">면접을 시작합니다</h1>
            <p className="text-text-secondary">진행 방식을 확인하고 준비되면 시작해주세요</p>
          </div>

          {/* 진행 안내 */}
          <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-3">
            <h2 className="font-semibold text-sm text-text-secondary">진행 방식</h2>
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="text-accent shrink-0">1.</span>질문이 화면에 표시되면 카메라를 보며 답변해주세요</li>
              <li className="flex gap-2"><span className="text-accent shrink-0">2.</span>"답변 시작" 버튼을 누르면 녹화가 시작됩니다</li>
              <li className="flex gap-2"><span className="text-accent shrink-0">3.</span>답변 후 면접관이 꼬리질문을 할 수 있습니다</li>
              <li className="flex gap-2"><span className="text-accent shrink-0">4.</span>모든 질문이 끝나면 AI가 답변을 분석하여 리포트를 제공합니다</li>
            </ul>
            <div className="flex gap-4 text-xs text-text-secondary pt-2 border-t border-border/50">
              <span>질문 {questions.length}개</span>
              <span>예상 소요 10~15분</span>
            </div>
          </div>

          {/* 면접관 소개 */}
          <div className="space-y-3">
            <h2 className="font-semibold text-sm text-text-secondary">오늘의 면접관</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {evaluators.map((ev) => (
                <div key={ev.id} className="bg-bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{ev.icon}</span>
                    <div>
                      <p className="font-semibold text-sm">{ev.name}</p>
                      <p className="text-xs text-text-secondary">{ev.role}</p>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary">{ev.description}</p>
                  <p className="text-xs text-accent">평가 중점: {ev.focus}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => { setShowBriefing(false); setPhase('ready') }}
            disabled={mediaStatus !== 'granted'}
            className={`w-full py-4 rounded-xl text-lg font-semibold transition-all ${
              mediaStatus === 'granted'
                ? 'bg-accent hover:bg-accent-hover text-white cursor-pointer'
                : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
            }`}
          >
            {mediaStatus === 'granted' ? '면접 시작' : '카메라/마이크 권한을 허용해주세요'}
          </button>
        </div>
      </div>
    )
  }

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // 현재 표시할 질문 텍스트
  const displayQuestion = isFollowUp ? followUpQuestion : currentQuestion.text

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 max-h-screen">
      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col gap-4">

        {/* 상단: 진행 상태 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-text-secondary">
                질문 {currentIndex + 1} / {questions.length}
              </span>
              {isFollowUp && (
                <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded-full">꼬리질문</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isRecording && (
                <span className="flex items-center gap-2 text-sm text-recording font-medium">
                  <span className="w-2 h-2 rounded-full bg-recording animate-recording-pulse" />
                  REC {formatTime(duration)}
                  <span className="flex items-center gap-px h-3 ml-1">
                    {[0.05, 0.15, 0.25, 0.35, 0.45].map((threshold, i) => (
                      <span key={i} className="w-0.5 rounded-full transition-all duration-75" style={{
                        height: audioLevel > threshold ? '12px' : '4px',
                        backgroundColor: audioLevel > threshold ? '#22c55e' : '#ffffff30',
                      }} />
                    ))}
                  </span>
                </span>
              )}
              {!isFollowUp && (
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                  currentQuestion.difficulty === 'basic' ? 'bg-success/15 text-success' :
                  currentQuestion.difficulty === 'intermediate' ? 'bg-warning/15 text-warning' :
                  'bg-danger/15 text-danger'
                }`}>
                  {currentQuestion.difficulty === 'basic' ? '기본' :
                   currentQuestion.difficulty === 'intermediate' ? '중급' : '심화'}
                </span>
              )}
            </div>
          </div>

          {/* 진행 바 */}
          <div className="w-full h-1 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: `${((currentIndex) / questions.length) * 100}%` }}
            />
          </div>

          {/* 질문 텍스트 */}
          <div className={`border rounded-xl p-5 transition-all ${
            isFollowUp ? 'bg-accent/5 border-accent/30' : 'bg-bg-card border-border'
          }`}>
            {isFollowUp && followUpEvaluator && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">{followUpEvaluator.icon}</span>
                <span className="text-sm font-medium text-accent">{followUpEvaluator.name}</span>
                <span className="text-xs text-text-secondary">꼬리질문</span>
              </div>
            )}
            <p className="text-base sm:text-lg leading-relaxed">{displayQuestion}</p>
          </div>
        </div>

        {/* 캠 프리뷰 */}
        <div className="relative rounded-2xl overflow-hidden bg-bg-secondary border border-border" style={{ height: '55vh', maxHeight: '500px' }}>
          {mediaStatus === 'granted' ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* 답변 전 가이드 / 꼬리질문 생성 중 */}
              {phase === 'ready' && !isGenerating && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-white/60 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/80" />
                  </div>
                  <p className="text-white text-sm font-medium">정면에서 카메라를 응시하고 답변해주세요</p>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-white/60 text-xs">마이크 테스트 - 말해보세요</p>
                    <div className="flex items-center gap-1 h-5">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div key={i} className="w-1 rounded-full transition-all duration-75" style={{
                          height: `${Math.max(4, (audioLevel > (i / 20) ? 20 : 4))}px`,
                          backgroundColor: audioLevel > (i / 20) ? i < 14 ? '#22c55e' : i < 17 ? '#f59e0b' : '#ef4444' : '#ffffff20',
                        }} />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: audioLevel > 0.05 ? '#22c55e' : '#ffffff60' }}>
                      {audioLevel > 0.05 ? '마이크 정상' : '소리가 감지되지 않습니다'}
                    </p>
                  </div>
                  {retryMessage && (
                    <div className="bg-warning/20 border border-warning/40 rounded-xl px-4 py-2.5">
                      <p className="text-warning text-sm font-medium">{retryMessage}</p>
                    </div>
                  )}
                  <p className="text-white/60 text-xs">준비되면 아래 "답변 시작" 버튼을 눌러주세요</p>
                </div>
              )}

              {/* 꼬리질문 생성 중 로딩 */}
              {isGenerating && (
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="flex gap-3">
                    {evaluators.map((ev, i) => (
                      <div key={ev.id} className="flex flex-col items-center gap-1" style={{
                        animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                        animationDelay: `${i * 0.3}s`,
                      }}>
                        <span className="text-2xl">{ev.icon}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-white text-sm">면접관들이 답변을 검토하고 있습니다...</p>
                </div>
              )}

              {/* 녹화 중 테두리 */}
              {isRecording && (
                <div className="absolute inset-0 border-2 border-recording rounded-2xl pointer-events-none" />
              )}
              {isRecording && frames.length > 0 && (
                <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                  캡처 {frames.length}/6
                </div>
              )}
            </>
          ) : mediaStatus === 'requesting' ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-secondary">카메라/마이크 권한을 요청 중...</p>
            </div>
          ) : mediaStatus === 'denied' ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <p className="text-danger font-medium">카메라/마이크 접근이 거부되었습니다</p>
              <p className="text-sm text-text-secondary">{mediaError}</p>
              <button onClick={requestPermission} className="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer">다시 시도</button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-secondary">카메라를 준비하고 있습니다...</p>
            </div>
          )}
        </div>

        {/* 하단 컨트롤 */}
        <div className="flex justify-center gap-4 py-2">
          <button
            onClick={handleExit}
            disabled={isRecording}
            className="px-5 py-2.5 rounded-xl border border-border bg-bg-card text-text-secondary hover:border-accent/50 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            나가기
          </button>

          {isGenerating ? (
            <button disabled className="px-8 py-2.5 rounded-xl bg-bg-elevated text-text-secondary cursor-not-allowed">
              검토 중...
            </button>
          ) : phase === 'ready' && !isRecording ? (
            <button
              onClick={isFollowUp ? handleStartFollowUp : handleStartAnswer}
              disabled={mediaStatus !== 'granted'}
              className="px-8 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              답변 시작
            </button>
          ) : phase === 'recording' ? (
            <button
              onClick={isFollowUp ? handleStopFollowUp : handleStopAnswer}
              className="px-8 py-2.5 rounded-xl bg-recording hover:bg-red-600 text-white font-semibold transition-all cursor-pointer"
            >
              답변 완료
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
