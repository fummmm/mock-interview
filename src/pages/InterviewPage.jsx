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
  const { track, companySize, mode } = useSettingsStore()
  const isHardMode = mode === 'hard'
  const {
    phase,
    questions,
    currentIndex,
    setPhase,
    updateAnswer,
    nextQuestion,
    setMediaStream,
    incPendingSTT,
    decPendingSTT,
  } = useInterviewStore()

  const {
    stream,
    videoRef,
    error: mediaError,
    status: mediaStatus,
    devices,
    requestPermission,
    switchDevice,
    stopStream,
    loadDevices,
  } = useMediaStream()
  const { isRecording, duration, startRecording, stopRecording } = useMediaRecorder(stream)
  const { frames, startCapture, stopCapture, clearFrames } = useFrameCapture(videoRef)
  const audioLevel = useAudioLevel(stream)

  // Web Speech API (꼬리질문 생성용, UI 표시 없음)
  const speechRef = useRef(null)
  const roughTranscriptRef = useRef('')

  // 브리핑 + 꼬리질문 상태
  const [showBriefing, setShowBriefing] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [followUpQuestion, setFollowUpQuestion] = useState(null)
  const [followUpEvaluator, setFollowUpEvaluator] = useState(null)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [retryMessage, setRetryMessage] = useState(null)

  // 하드모드 전용 state
  const [typingText, setTypingText] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const [countdown, setCountdown] = useState(0) // 3→2→1→0 카운트다운
  const [timeLimit, setTimeLimit] = useState(0) // 초
  const [timeLeft, setTimeLeft] = useState(0)
  const timerRef = useRef(null)

  const evaluators = getEvaluators(track, companySize)
  const isMountedRef = useRef(true)
  useEffect(
    () => () => {
      isMountedRef.current = false
    },
    [],
  )

  const currentQuestion = questions[currentIndex]

  // 하드모드: 질문 유형별 제한시간 (초)
  const getTimeLimit = (question) => {
    if (!question) return 180
    const isTech =
      question.category === 'technical' ||
      question.category === 'document' ||
      question.category === 'job_posting'
    return isTech ? 300 : 180 // 기술 5분, 인성 3분
  }

  // 질문 카테고리에 맞는 면접관 배정
  function getQuestionAsker(question, index) {
    // 인성면접 트랙은 전원 균등 배분 (전부 behavioral 카테고리)
    if (track === 'behavioral') return evaluators[index % evaluators.length]

    // 기술 트랙: 질문 카테고리에 따라 매칭
    const techIds = ['team_lead', 'expert', 'tech_a', 'tech_b', 'senior']
    const behavIds = ['hr', 'hr_expert', 'executive', 'director', 'ceo']

    const isTech = question?.category === 'technical'
    const pool = isTech
      ? evaluators.filter((e) => techIds.includes(e.id))
      : evaluators.filter((e) => behavIds.includes(e.id))

    if (pool.length > 0) return pool[index % pool.length]
    return evaluators[index % evaluators.length]
  }

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

  // 하드모드: 질문 변경 시 타이핑 애니메이션 → 자동 녹화 시작
  const typingTimeoutRef = useRef(null)
  useEffect(() => {
    if (!isHardMode || showBriefing || showSetup) return
    if (phase !== 'ready' || isGenerating) return
    // 메인 질문 또는 꼬리질문 텍스트
    const fullText = isFollowUp ? followUpQuestion : currentQuestion?.text
    if (!fullText) return

    // 타이핑 시작
    setIsTyping(true)
    setTypingText('')
    let charIdx = 0

    const typeNext = () => {
      if (charIdx < fullText.length) {
        charIdx++
        setTypingText(fullText.slice(0, charIdx))
        typingTimeoutRef.current = setTimeout(typeNext, 75)
      } else {
        // 타이핑 완료 → 3-2-1 카운트다운 → 녹화 시작
        setIsTyping(false)
        let count = 3
        setCountdown(count)
        const countdownTick = () => {
          count--
          if (count > 0) {
            setCountdown(count)
            typingTimeoutRef.current = setTimeout(countdownTick, 1000)
          } else {
            setCountdown(0)
            // 녹화 시작 (꼬리질문은 3분 고정)
            if (isMountedRef.current && stream) {
              const limit = isFollowUp ? 180 : getTimeLimit(currentQuestion)
              setTimeLimit(limit)
              setTimeLeft(limit)
              clearFrames()
              startRecording()
              startCapture()
              startSpeech()
              setRetryMessage(null)
              setPhase('recording')
            }
          }
        }
        typingTimeoutRef.current = setTimeout(countdownTick, 1000)
      }
    }
    typingTimeoutRef.current = setTimeout(typeNext, 500)

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    }
  }, [
    isHardMode,
    showBriefing,
    currentQuestion?.id,
    phase,
    isFollowUp,
    isGenerating,
    followUpQuestion,
  ]) // eslint-disable-line react-hooks/exhaustive-deps

  // 하드모드: 카운트다운 타이머
  useEffect(() => {
    if (!isHardMode || !isRecording || timeLimit === 0) return

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [isHardMode, isRecording, timeLimit])

  // 하드모드: 시간 초과 → 자동 답변 종료
  useEffect(() => {
    if (!isHardMode || timeLeft !== 0 || !isRecording) return
    if (timeLimit === 0) return // 초기 상태 무시

    // 자동 종료
    if (isFollowUp) {
      handleStopFollowUp()
    } else {
      handleStopAnswer()
    }
  }, [timeLeft]) // eslint-disable-line react-hooks/exhaustive-deps

  // 브리핑 닫힌 후 비디오 스트림 재연결
  useEffect(() => {
    if (!showBriefing && videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [showBriefing, showSetup, stream, videoRef])

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
        try {
          recognition.start()
        } catch (e) {
          /* ignore */
        }
      }
    }
    recognition.onerror = () => {} // 무시
    speechRef.current = recognition
  }, [])

  useEffect(() => {
    initSpeech()
  }, [initSpeech])

  const startSpeech = () => {
    roughTranscriptRef.current = ''
    if (speechRef.current) {
      speechRef.current._active = true
      try {
        speechRef.current.start()
      } catch (e) {
        /* ignore */
      }
    }
  }
  const stopSpeech = () => {
    if (speechRef.current) {
      speechRef.current._active = false
      try {
        speechRef.current.stop()
      } catch (e) {
        /* ignore */
      }
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
  const processInBackground = useCallback(
    (idx, blob, questionText, isFollowUpAnswer = false) => {
      const mySession = useInterviewStore.getState().sessionId

      // 녹화 3초 미만이면 STT 스킵 (Whisper 환각 방지)
      const answer = useInterviewStore.getState().answers[idx]
      const recDuration = isFollowUpAnswer
        ? answer?.followUp?.recordingDuration
        : answer?.recordingDuration
      if (!recDuration || recDuration < 3) {
        return
      }

      incPendingSTT()
      ;(async () => {
        try {
          if (useInterviewStore.getState().sessionId !== mySession) return

          const result = await transcribeAudio(blob)
          if (useInterviewStore.getState().sessionId !== mySession) return

          const corrected = await correctTranscript(result.transcript, questionText, track)
          if (useInterviewStore.getState().sessionId !== mySession) return

          if (isFollowUpAnswer) {
            const state = useInterviewStore.getState()
            const answers = [...state.answers]
            if (answers[idx]) {
              answers[idx] = {
                ...answers[idx],
                followUp: {
                  ...answers[idx].followUp,
                  rawTranscript: result.transcript,
                  transcript: corrected,
                  fillerWordCount: result.fillerWordCount,
                },
              }
              useInterviewStore.setState({ answers })
            }
          } else {
            updateAnswer(idx, {
              rawTranscript: result.transcript,
              transcript: corrected,
              fillerWordCount: result.fillerWordCount,
              silenceSegments: result.silencePositions || [],
            })
          }
        } catch (e) {
          console.warn(
            `[백그라운드] Q${idx + 1}${isFollowUpAnswer ? ' 꼬리' : ''} 실패:`,
            e.message,
          )
        } finally {
          if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
        }
      })()
    },
    [updateAnswer, incPendingSTT, decPendingSTT],
  )

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

      // 녹화 완료 → 무조건 진행 (답변 미감지 차단 제거)
      // Web Speech API 실패해도 Whisper가 나중에 처리함
      const followUp = await generateFollowUp(
        questionText,
        rough || '',
        evaluators,
        currentQuestion?.id || '',
        result?.duration || 0,
      )

      if (followUp.needed && followUp.question) {
        const asker = evaluators.find((e) => e.id === followUp.evaluatorId) || evaluators[0]
        setFollowUpQuestion(followUp.question)
        setFollowUpEvaluator(asker)
        updateAnswer(idx, {
          followUp: {
            question: followUp.question,
            evaluatorId: asker.id,
            evaluatorName: asker.name,
            transcript: '',
            rawTranscript: '',
            videoBlob: null,
            videoBlobUrl: null,
            frames: [],
            recordingDuration: 0,
          },
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
  }, [
    stopCapture,
    stopRecording,
    updateAnswer,
    currentIndex,
    currentQuestion,
    frames,
    processInBackground,
    nextQuestion,
    setPhase,
  ])

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
  }, [
    stopCapture,
    stopRecording,
    currentIndex,
    frames,
    followUpQuestion,
    processInBackground,
    nextQuestion,
  ])

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
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-8">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">
              {isHardMode ? '하드모드 면접을 시작합니다' : '면접을 시작합니다'}
            </h1>
            <p className="text-text-secondary">진행 방식을 확인하고 준비되면 시작해주세요</p>
          </div>

          {/* 진행 안내 */}
          {isHardMode ? (
            <div className="bg-accent/5 border-accent/30 space-y-4 rounded-2xl border-2 p-6">
              <div className="flex items-center gap-2">
                <span className="text-accent text-lg font-bold">HARD MODE</span>
                <span className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-xs font-medium">
                  실전 모드
                </span>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    1
                  </span>
                  <div>
                    <p className="text-sm font-semibold">질문이 타이핑되며 나타납니다</p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      질문 텍스트가 한 글자씩 표시됩니다
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    2
                  </span>
                  <div>
                    <p className="text-sm font-semibold">3초 카운트다운 후 즉시 녹화 시작</p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      준비할 시간이 없습니다. 타이핑이 끝나면 바로 답변하세요
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    3
                  </span>
                  <div>
                    <p className="text-sm font-semibold">질문별 제한시간이 있습니다</p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      인성 질문 <strong className="text-text-primary">3분</strong> / 기술 질문{' '}
                      <strong className="text-text-primary">5분</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="bg-accent/15 text-accent flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold">
                    4
                  </span>
                  <div>
                    <p className="text-sm font-semibold">시간 초과 시 자동으로 다음 질문</p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      제한시간 내에 답변을 마무리하세요
                    </p>
                  </div>
                </div>
              </div>
              <div className="text-text-secondary border-accent/20 flex gap-4 border-t pt-3 text-xs">
                <span>질문 {questions.length}개</span>
                <span>예상 소요 15~25분</span>
              </div>
            </div>
          ) : (
            <div className="bg-bg-card border-border space-y-3 rounded-2xl border p-5">
              <h2 className="text-text-secondary text-sm font-semibold">진행 방식</h2>
              <ul className="space-y-2 text-sm">
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">1.</span>질문이 화면에 표시되면 충분히 읽고
                  생각을 정리하세요
                </li>
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">2.</span>준비되면 "답변 시작" 버튼을 눌러
                  녹화를 시작하세요
                </li>
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">3.</span>답변 후 면접관이 꼬리질문을 할 수
                  있습니다
                </li>
                <li className="flex gap-2">
                  <span className="text-accent shrink-0">4.</span>모든 질문이 끝나면 AI가 답변을
                  분석하여 리포트를 제공합니다
                </li>
              </ul>
              <div className="text-text-secondary border-border/50 flex gap-4 border-t pt-2 text-xs">
                <span>질문 {questions.length}개</span>
                <span>예상 소요 10~15분</span>
              </div>
            </div>
          )}

          {/* 면접관 소개 */}
          <div className="space-y-3">
            <h2 className="text-text-secondary text-sm font-semibold">오늘의 면접관</h2>
            <div
              className={`grid grid-cols-1 gap-3 ${evaluators.length === 2 ? 'sm:grid-cols-2' : evaluators.length === 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-3'}`}
            >
              {evaluators.map((ev) => (
                <div
                  key={ev.id}
                  className="bg-bg-card border-border space-y-2 rounded-xl border p-4"
                >
                  <div>
                    <p className="text-sm font-semibold">{ev.name}</p>
                    <p className="text-text-secondary text-xs">{ev.role}</p>
                  </div>
                  <p className="text-text-secondary text-xs">{ev.description}</p>
                  <p className="text-accent text-xs">평가 중점: {ev.focus}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => {
              setShowBriefing(false)
              setShowSetup(true)
            }}
            disabled={mediaStatus !== 'granted'}
            className={`w-full rounded-xl py-4 text-lg font-semibold transition-all ${
              mediaStatus === 'granted'
                ? 'bg-accent hover:bg-accent-hover cursor-pointer text-white'
                : 'bg-bg-elevated text-text-secondary cursor-not-allowed'
            }`}
          >
            {mediaStatus === 'granted' ? '면접 시작' : '카메라/마이크 권한을 허용해주세요'}
          </button>
        </div>
      </div>
    )
  }

  // === 캠/마이크 세팅 화면 ===
  if (showSetup) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-6">
        <div className="w-full max-w-2xl space-y-6">
          <div className="space-y-2 text-center">
            <h1 className="text-2xl font-bold">카메라 / 마이크 점검</h1>
            <p className="text-text-secondary">
              아래에서 카메라와 마이크가 정상 작동하는지 확인하세요
            </p>
          </div>

          {/* 캠 프리뷰 */}
          <div
            className="bg-bg-secondary border-border relative overflow-hidden rounded-2xl border"
            style={{ height: '360px' }}
          >
            {mediaStatus === 'granted' ? (
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-text-secondary">카메라를 불러오는 중...</p>
              </div>
            )}
          </div>

          {/* 마이크 테스트 */}
          <div className="bg-bg-card border-border space-y-3 rounded-2xl border p-5">
            <h2 className="text-text-secondary text-sm font-semibold">마이크 테스트</h2>
            <p className="text-text-secondary text-sm">아래 막대가 말할 때 움직이면 정상입니다</p>
            <div className="bg-bg-elevated flex h-10 items-center gap-2 rounded-xl px-4">
              {Array.from({ length: 30 }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 rounded-full transition-all duration-75"
                  style={{
                    height: `${Math.max(4, audioLevel > i / 30 ? 32 : 4)}px`,
                    backgroundColor:
                      audioLevel > i / 30
                        ? i < 21
                          ? '#22c55e'
                          : i < 25
                            ? '#f59e0b'
                            : '#ef4444'
                        : '#ffffff20',
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${audioLevel > 0.05 ? 'bg-success' : 'bg-text-secondary/30'}`}
              />
              <span
                className={`text-sm ${audioLevel > 0.05 ? 'text-success' : 'text-text-secondary'}`}
              >
                {audioLevel > 0.05
                  ? '마이크 정상 작동 중'
                  : '소리가 감지되지 않습니다 - 마이크를 확인하세요'}
              </span>
            </div>
          </div>

          {/* 기기 선택 */}
          <div className="grid grid-cols-2 gap-3">
            <DeviceDropdown
              label="카메라"
              items={devices.video}
              currentId={stream?.getVideoTracks()[0]?.getSettings()?.deviceId || ''}
              onSelect={(id) => switchDevice(id, null)}
              emptyText="카메라 없음"
            />
            <DeviceDropdown
              label="마이크"
              items={devices.audio}
              currentId={stream?.getAudioTracks()[0]?.getSettings()?.deviceId || ''}
              onSelect={(id) => switchDevice(null, id)}
              emptyText="마이크 없음"
            />
          </div>

          <button
            onClick={() => {
              setShowSetup(false)
              setPhase('ready')
            }}
            className="bg-accent hover:bg-accent-hover w-full cursor-pointer rounded-xl py-4 text-lg font-semibold text-white transition-all"
          >
            준비 완료 - 면접 시작
          </button>
        </div>
      </div>
    )
  }

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60)
      .toString()
      .padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  // 현재 표시할 질문 텍스트
  const displayQuestion = isFollowUp ? followUpQuestion : currentQuestion.text

  return (
    <div className="flex max-h-screen flex-1 flex-col p-4 sm:p-6">
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4">
        {/* 상단: 진행 상태 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-text-secondary text-sm">
                질문 {currentIndex + 1} / {questions.length}
              </span>
              {isFollowUp && (
                <span className="bg-accent/20 text-accent rounded-full px-2 py-0.5 text-xs">
                  꼬리질문
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isRecording && (
                <span className="text-recording flex items-center gap-2 text-sm font-medium">
                  <span className="bg-recording animate-recording-pulse h-2 w-2 rounded-full" />
                  REC {formatTime(duration)}
                  <span className="ml-1 flex h-3 items-center gap-px">
                    {[0.05, 0.15, 0.25, 0.35, 0.45].map((threshold, i) => (
                      <span
                        key={i}
                        className="w-0.5 rounded-full transition-all duration-75"
                        style={{
                          height: audioLevel > threshold ? '12px' : '4px',
                          backgroundColor: audioLevel > threshold ? '#22c55e' : '#ffffff30',
                        }}
                      />
                    ))}
                  </span>
                </span>
              )}
              {!isFollowUp && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    currentQuestion.difficulty === 'basic'
                      ? 'bg-success/15 text-success'
                      : currentQuestion.difficulty === 'intermediate'
                        ? 'bg-warning/15 text-warning'
                        : 'bg-danger/15 text-danger'
                  }`}
                >
                  {currentQuestion.difficulty === 'basic'
                    ? '기본'
                    : currentQuestion.difficulty === 'intermediate'
                      ? '중급'
                      : '심화'}
                </span>
              )}
            </div>
          </div>

          {/* 진행 바 */}
          <div className="bg-bg-elevated h-1 w-full overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-all duration-500"
              style={{ width: `${(currentIndex / questions.length) * 100}%` }}
            />
          </div>

          {/* 질문 텍스트 */}
          <div
            className={`rounded-xl border p-5 transition-all ${
              isFollowUp ? 'bg-accent/5 border-accent/30' : 'bg-bg-card border-border'
            }`}
            style={{ borderLeft: '4px solid var(--color-accent, #d14558)' }}
          >
            {isFollowUp && followUpEvaluator ? (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-accent text-sm font-medium">{followUpEvaluator.name}</span>
                <span className="bg-accent/15 text-accent rounded-full px-2 py-0.5 text-xs">
                  꼬리질문
                </span>
              </div>
            ) : (
              <div className="mb-3">
                <span className="text-text-secondary text-sm font-medium">
                  {getQuestionAsker(currentQuestion, currentIndex)?.name}
                </span>
              </div>
            )}
            <p className="text-lg leading-relaxed font-semibold sm:text-xl">
              {isHardMode && isTyping ? (
                <>
                  {typingText}
                  <span className="bg-accent ml-0.5 inline-block h-5 w-0.5 animate-pulse" />
                </>
              ) : (
                displayQuestion
              )}
            </p>
            {/* 하드모드 타이머 */}
            {isHardMode && isRecording && timeLimit > 0 && (
              <div
                className={`mt-3 flex items-center gap-2 text-sm font-medium ${timeLeft <= 30 ? 'text-danger' : timeLeft <= 60 ? 'text-warning' : 'text-text-secondary'}`}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>
                  남은 시간 {Math.floor(timeLeft / 60)}:
                  {(timeLeft % 60).toString().padStart(2, '0')}
                </span>
                {timeLeft <= 30 && <span className="text-xs">(곧 종료됩니다)</span>}
              </div>
            )}
          </div>
        </div>

        {/* 캠 프리뷰 */}
        <div
          className="bg-bg-secondary border-border relative overflow-hidden rounded-2xl border"
          style={{ height: '55vh', maxHeight: '500px' }}
        >
          {mediaStatus === 'granted' ? (
            <>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* 답변 전 가이드 / 꼬리질문 생성 중 */}
              {phase === 'ready' && !isGenerating && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/50">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-white/60">
                    <div className="h-3 w-3 rounded-full bg-white/80" />
                  </div>
                  <p className="text-sm font-medium text-white">
                    {isHardMode && isTyping
                      ? '질문을 읽고 있습니다...'
                      : isHardMode
                        ? '답변이 곧 시작됩니다'
                        : '위 질문을 읽고 준비되면 답변을 시작하세요'}
                  </p>
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-xs text-white/60">마이크 테스트 - 말해보세요</p>
                    <div className="flex h-5 items-center gap-1">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full transition-all duration-75"
                          style={{
                            height: `${Math.max(4, audioLevel > i / 20 ? 20 : 4)}px`,
                            backgroundColor:
                              audioLevel > i / 20
                                ? i < 14
                                  ? '#22c55e'
                                  : i < 17
                                    ? '#f59e0b'
                                    : '#ef4444'
                                : '#ffffff20',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs"
                      style={{
                        color: audioLevel > 0.05 ? '#22c55e' : '#ffffff60',
                      }}
                    >
                      {audioLevel > 0.05 ? '마이크 정상' : '소리가 감지되지 않습니다'}
                    </p>
                  </div>
                  {retryMessage && (
                    <div className="bg-warning/20 border-warning/40 rounded-xl border px-4 py-2.5">
                      <p className="text-warning text-sm font-medium">{retryMessage}</p>
                    </div>
                  )}
                  <p className="text-xs text-white/60">
                    준비되면 아래 "답변 시작" 버튼을 눌러주세요
                  </p>
                </div>
              )}

              {/* 꼬리질문 생성 중 로딩 */}
              {isGenerating && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60">
                  <div className="flex gap-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="bg-accent h-2.5 w-2.5 rounded-full"
                        style={{
                          animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                          animationDelay: `${i * 0.2}s`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-sm text-white">면접관들이 답변을 검토하고 있습니다...</p>
                </div>
              )}

              {/* 하드모드 카운트다운 오버레이 */}
              {isHardMode && countdown > 0 && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/60">
                  <span
                    className="animate-pulse font-bold text-white"
                    style={{ fontSize: '8rem', lineHeight: 1 }}
                  >
                    {countdown}
                  </span>
                </div>
              )}

              {/* 녹화 중 테두리 */}
              {isRecording && (
                <div className="border-recording pointer-events-none absolute inset-0 rounded-2xl border-2" />
              )}
              {isRecording && frames.length > 0 && (
                <div className="absolute top-3 right-3 rounded-lg bg-black/60 px-2 py-1 text-xs text-white">
                  캡처 {frames.length}/6
                </div>
              )}
            </>
          ) : mediaStatus === 'requesting' ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary">카메라/마이크 권한을 요청 중...</p>
            </div>
          ) : mediaStatus === 'denied' ? (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <p className="text-danger font-medium">카메라/마이크 접근이 거부되었습니다</p>
              <p className="text-text-secondary text-sm">{mediaError}</p>
              <button
                onClick={requestPermission}
                className="bg-accent cursor-pointer rounded-lg px-4 py-2 text-sm text-white"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-text-secondary">카메라를 준비하고 있습니다...</p>
            </div>
          )}
        </div>

        {/* 하단 컨트롤 */}
        <div className="flex justify-center gap-4 py-2">
          <button
            onClick={handleExit}
            disabled={isRecording}
            className="border-border bg-bg-card text-text-secondary hover:border-accent/50 cursor-pointer rounded-xl border px-5 py-2.5 transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            나가기
          </button>

          {isGenerating ? (
            <button
              disabled
              className="bg-bg-elevated text-text-secondary cursor-not-allowed rounded-xl px-8 py-2.5"
            >
              검토 중...
            </button>
          ) : phase === 'ready' && !isRecording ? (
            isHardMode ? (
              <button
                disabled
                className="bg-bg-elevated text-text-secondary cursor-not-allowed rounded-xl px-8 py-2.5"
              >
                {isTyping ? '질문 표시 중...' : '답변 곧 시작'}
              </button>
            ) : (
              <button
                onClick={isFollowUp ? handleStartFollowUp : handleStartAnswer}
                disabled={mediaStatus !== 'granted'}
                className="bg-accent hover:bg-accent-hover cursor-pointer rounded-xl px-8 py-2.5 font-semibold text-white transition-all disabled:cursor-not-allowed disabled:opacity-40"
              >
                답변 시작
              </button>
            )
          ) : phase === 'recording' ? (
            <button
              onClick={isFollowUp ? handleStopFollowUp : handleStopAnswer}
              className="bg-recording cursor-pointer rounded-xl px-8 py-2.5 font-semibold text-white transition-all hover:bg-red-600"
            >
              답변 완료
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/* 커스텀 드롭다운 */
function DeviceDropdown({ label, items, currentId, onSelect, emptyText }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // 외부 클릭 시 닫기
  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const current = items.find((d) => d.deviceId === currentId)
  const displayLabel = current?.label || (items.length > 0 ? items[0].label : emptyText)

  return (
    <div className="space-y-2" ref={ref}>
      <label className="text-text-secondary text-xs font-medium">{label}</label>
      <div className="relative">
        <button
          onClick={() => items.length > 0 && setOpen(!open)}
          className={`bg-bg-card flex w-full cursor-pointer items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm transition-all ${
            open ? 'border-accent' : 'border-border hover:border-accent/50'
          }`}
        >
          <span className="truncate">{displayLabel || emptyText}</span>
          <svg
            className={`text-text-secondary h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && items.length > 0 && (
          <div className="bg-bg-card border-border absolute z-20 mt-1 w-full overflow-hidden rounded-xl border shadow-lg">
            {items.map((d) => (
              <button
                key={d.deviceId}
                onClick={() => {
                  onSelect(d.deviceId)
                  setOpen(false)
                }}
                className={`w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors ${
                  d.deviceId === currentId
                    ? 'bg-accent/10 text-accent'
                    : 'hover:bg-bg-elevated text-text-primary'
                }`}
              >
                {d.label || `${label} ${d.deviceId.slice(0, 8)}`}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
