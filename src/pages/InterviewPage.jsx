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
import { formatTime } from '../lib/utils'
import { useEffect, useCallback, useRef, useState } from 'react'
import BriefingPhase from '../components/interview/BriefingPhase'
import ReadyPhase from '../components/interview/ReadyPhase'

/**
 * 상태 머신:
 * briefing → ready → recording → reviewing →
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
  } = useMediaStream()
  const { isRecording, duration, startRecording, stopRecording } = useMediaRecorder(stream)
  const { frames, startCapture, stopCapture, clearFrames } = useFrameCapture(videoRef)
  const audioLevel = useAudioLevel(stream)

  // 꼬리질문 빈도 제어
  const followUpCountRef = useRef(0)
  const maxFollowUps = Math.min(3, Math.ceil(questions.length * 0.5))

  // 브리핑 + 꼬리질문 상태
  const [showBriefing, setShowBriefing] = useState(true)
  const [showSetup, setShowSetup] = useState(false)
  const [followUpQuestion, setFollowUpQuestion] = useState(null)
  const [followUpEvaluator, setFollowUpEvaluator] = useState(null)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [retryMessage, setRetryMessage] = useState(null)

  // reviewing 프로그레스 바 상태
  const [reviewProgress, setReviewProgress] = useState(0)
  const [reviewStage, setReviewStage] = useState(0) // 0: STT, 1: 검토
  const reviewTimerRef = useRef(null)

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

  // reviewing 프로그레스 바 시뮬레이션 시작/정지 (2단계: STT → 검토)
  const startReviewProgress = useCallback(() => {
    setReviewProgress(0)
    setReviewStage(0)
    const startTime = Date.now()
    reviewTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000
      let progress
      let stage
      if (elapsed < 15) {
        // 0~15초: 0% → 70% (Stage 0: STT 처리)
        progress = (elapsed / 15) * 70
        stage = 0
      } else {
        // 15초~: 70% → 느리게 증가 (최대 95%) (Stage 1: 검토)
        progress = Math.min(95, 70 + (elapsed - 15) * 1.5)
        stage = 1
      }
      setReviewProgress(progress)
      setReviewStage(stage)
    }, 100)
  }, [])

  const stopReviewProgress = useCallback(() => {
    if (reviewTimerRef.current) {
      clearInterval(reviewTimerRef.current)
      reviewTimerRef.current = null
    }
    setReviewProgress(100)
  }, [])

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
    if (phase !== 'ready') return
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
    followUpQuestion,
  ])

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

  const handleExit = useCallback(async () => {
    stopStream()
    const { abandonSession } = useInterviewStore.getState()
    await abandonSession()
    navigate('/')
  }, [stopStream, navigate])

  // === 백그라운드 STT+교정 헬퍼 ===
  const startBackgroundSTT = useCallback((idx, blob, questionText) => {
    const mySession = useInterviewStore.getState().sessionId
    incPendingSTT()
    ;(async () => {
      try {
        if (useInterviewStore.getState().sessionId !== mySession) return
        const sttResult = await transcribeAudio(blob)
        if (useInterviewStore.getState().sessionId !== mySession) return
        updateAnswer(idx, {
          rawTranscript: sttResult.transcript,
          transcript: sttResult.transcript, // 교정 전 임시 저장
          fillerWordCount: sttResult.fillerWordCount,
          silenceSegments: sttResult.silencePositions || [],
        })
        // 교정
        const corrected = await correctTranscript(sttResult.transcript, questionText, track)
        if (useInterviewStore.getState().sessionId !== mySession) return
        updateAnswer(idx, { transcript: corrected })
      } catch (e) {
        console.warn(`[백그라운드] Q${idx + 1} STT 실패:`, e.message)
      } finally {
        if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
      }
    })()
  }, [incPendingSTT, decPendingSTT, updateAnswer, track])

  // === 메인 답변 시작 ===
  const handleStartAnswer = useCallback(() => {
    if (!stream) return
    clearFrames()
    startRecording()
    startCapture()
    setRetryMessage(null)
    setPhase('recording')
  }, [stream, clearFrames, startRecording, startCapture, setPhase])

  // === 메인 답변 완료 → 녹음 시간 기반 4분기 파이프라인 ===
  const handleStopAnswer = useCallback(async () => {
    const finalFrames = stopCapture()
    const result = await stopRecording()
    if (!isMountedRef.current) return
    const idx = currentIndex
    const questionText = currentQuestion?.text || ''
    const questionId = currentQuestion?.id || ''

    // (1) 녹화 blob + 프레임 저장
    if (result) {
      updateAnswer(idx, {
        videoBlob: result.blob,
        videoBlobUrl: result.blobUrl,
        recordingDuration: result.duration,
        frames: finalFrames || frames,
      })
    }

    const recordingDuration = result?.duration || 0

    // ─── 분기 A: 사전 필터 ───
    // A-1: 5초 미만 → 즉시 다음 질문
    if (recordingDuration < 5) {
      setFollowUpQuestion(null)
      setIsFollowUp(false)
      nextQuestion()
      return
    }

    // A-2: 자기소개/마무리 → 즉시 다음 질문
    if (questionId === 'beh-intro' || questionId === 'beh-lastq') {
      setFollowUpQuestion(null)
      setIsFollowUp(false)
      nextQuestion()
      return
    }

    // A-3: 꼬리질문 횟수 소진 → 즉시 다음 질문 (STT는 AnalyzingPage에서 처리)
    if (followUpCountRef.current >= maxFollowUps) {
      setFollowUpQuestion(null)
      setIsFollowUp(false)
      nextQuestion()
      return
    }

    // ─── 분기 B: 5~15초 (incomplete, 즉시 꼬리질문) ───
    if (recordingDuration >= 5 && recordingDuration < 15) {
      const asker = evaluators[0]
      setFollowUpQuestion(
        '답변이 짧았는데, 비슷한 상황을 경험하지 못했더라도 어떻게 접근하실지 말씀해주시겠어요?',
      )
      setFollowUpEvaluator(asker)
      updateAnswer(idx, {
        followUp: {
          question:
            '답변이 짧았는데, 비슷한 상황을 경험하지 못했더라도 어떻게 접근하실지 말씀해주시겠어요?',
          evaluatorId: asker.id,
          evaluatorName: asker.name,
          deficiency: 'incomplete',
          c1: null,
          c2: null,
          c3: null,
          transcript: '',
          rawTranscript: '',
          videoBlob: null,
          videoBlobUrl: null,
          frames: [],
          recordingDuration: 0,
        },
      })
      setIsFollowUp(true)
      followUpCountRef.current++
      // STT는 AnalyzingPage에서 처리 (Whisper 큐 점유 방지)
      setPhase('ready')
      return
    }

    // ─── 분기 C: 15~35초 (reviewing: STT 25초 타임아웃 → Haiku raw 판단) ───
    if (recordingDuration >= 15 && recordingDuration < 35) {
      setPhase('reviewing')
      startReviewProgress()

      try {
        // Whisper STT (12초 타임아웃)
        let rawText = ''
        let fillerCount = 0
        let silenceSegs = []
        let sttResult = null

        try {
          sttResult = await Promise.race([
            transcribeAudio(result.blob),
            new Promise((_, reject) => setTimeout(() => reject(new Error('STT 타임아웃')), 25000)),
          ])
          rawText = sttResult?.transcript || ''
          fillerCount = sttResult?.fillerWordCount || 0
          silenceSegs = sttResult?.silencePositions || []
        } catch (sttErr) {
          console.warn('[reviewing] STT 실패/타임아웃:', sttErr.message)
          // STT 실패/타임아웃 → 다음 질문
          updateAnswer(idx, { sttFailed: true })
          stopReviewProgress()
          setFollowUpQuestion(null)
          setIsFollowUp(false)
          nextQuestion()
          return
        }

        // STT 결과 임시 저장 (raw)
        updateAnswer(idx, {
          rawTranscript: rawText,
          transcript: rawText, // 교정 전 임시
          fillerWordCount: fillerCount,
          silenceSegments: silenceSegs,
        })

        // Haiku 판단+생성 (raw transcript 기반, 교정 없음)
        let followUp = null
        try {
          followUp = await generateFollowUp(
            questionText,
            rawText,
            evaluators,
            questionId,
            recordingDuration,
          )
        } catch (haikuErr) {
          console.warn('[reviewing] Haiku 판단 실패:', haikuErr.message)
        }

        stopReviewProgress()

        // 꼬리질문 결과 처리
        if (followUp?.needed && followUp?.question) {
          const asker = evaluators.find((e) => e.id === followUp.evaluatorId) || evaluators[0]
          setFollowUpQuestion(followUp.question)
          setFollowUpEvaluator(asker)
          updateAnswer(idx, {
            followUp: {
              question: followUp.question,
              evaluatorId: asker.id,
              evaluatorName: asker.name,
              deficiency: followUp.deficiency || null,
              c1: followUp.c1 ?? null,
              c2: followUp.c2 ?? null,
              c3: followUp.c3 ?? null,
              transcript: '',
              rawTranscript: '',
              videoBlob: null,
              videoBlobUrl: null,
              frames: [],
              recordingDuration: 0,
            },
          })
          setIsFollowUp(true)
          followUpCountRef.current++
          setPhase('ready')
        } else {
          // 꼬리질문 불필요 → 다음 질문
          setFollowUpQuestion(null)
          setIsFollowUp(false)
          nextQuestion()
        }

        // 백그라운드: Sonnet 교정 (리포트용, 논블로킹)
        if (rawText) {
          const mySession = useInterviewStore.getState().sessionId
          incPendingSTT()
          ;(async () => {
            try {
              const corrected = await correctTranscript(rawText, questionText, track)
              if (useInterviewStore.getState().sessionId !== mySession) return
              updateAnswer(idx, { transcript: corrected })
            } catch (e) {
              console.warn(`[백그라운드] Q${idx + 1} 교정 실패:`, e.message)
            } finally {
              if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
            }
          })()
        }
      } catch (e) {
        console.warn('[reviewing] 예기치 않은 에러:', e.message)
        stopReviewProgress()
        setFollowUpQuestion(null)
        setIsFollowUp(false)
        nextQuestion()
      }
      return
    }

    // ─── 분기 D: 35초+ (충분한 답변, 즉시 다음 질문) ───
    // STT는 AnalyzingPage에서 처리 (Whisper 큐 점유 방지)
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
    nextQuestion,
    setPhase,
    startReviewProgress,
    stopReviewProgress,
    evaluators,
    track,
    startBackgroundSTT,
    maxFollowUps,
  ])

  // === 꼬리질문 답변 시작 ===
  const handleStartFollowUp = useCallback(() => {
    if (!stream) return
    clearFrames()
    startRecording()
    startCapture()
    setPhase('recording')
  }, [stream, clearFrames, startRecording, startCapture, setPhase])

  // === 꼬리질문 답변 완료 → 다음 메인 질문 ===
  const handleStopFollowUp = useCallback(async () => {
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

      // 꼬리질문 답변도 STT + 교정 수행 (백그라운드)
      const followUpText = followUpQuestion || ''
      const mySession = useInterviewStore.getState().sessionId
      const recDuration = result.duration
      if (recDuration && recDuration >= 3) {
        incPendingSTT()
        ;(async () => {
          try {
            if (useInterviewStore.getState().sessionId !== mySession) return
            const sttResult = await transcribeAudio(result.blob)
            if (useInterviewStore.getState().sessionId !== mySession) return
            const corrected = await correctTranscript(sttResult.transcript, followUpText, track)
            if (useInterviewStore.getState().sessionId !== mySession) return

            const latestState = useInterviewStore.getState()
            const latestAnswers = [...latestState.answers]
            if (latestAnswers[idx]) {
              latestAnswers[idx] = {
                ...latestAnswers[idx],
                followUp: {
                  ...latestAnswers[idx].followUp,
                  rawTranscript: sttResult.transcript,
                  transcript: corrected,
                  fillerWordCount: sttResult.fillerWordCount,
                },
              }
              useInterviewStore.setState({ answers: latestAnswers })
            }
          } catch (e) {
            console.warn(`[백그라운드] Q${idx + 1} 꼬리 실패:`, e.message)
          } finally {
            if (useInterviewStore.getState().sessionId === mySession) decPendingSTT()
          }
        })()
      }
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
    nextQuestion,
    incPendingSTT,
    decPendingSTT,
    track,
  ])

  // processing → 분석 페이지 이동
  useEffect(() => {
    if (phase === 'processing') {
      stopStream()
      navigate('/analyzing')
    }
  }, [phase, stopStream, navigate])

  if (!currentQuestion) return null

  // === 브리핑 화면 ===
  if (showBriefing) {
    return (
      <BriefingPhase
        isHardMode={isHardMode}
        questions={questions}
        evaluators={evaluators}
        mediaStatus={mediaStatus}
        onStart={() => {
          setShowBriefing(false)
          setShowSetup(true)
        }}
      />
    )
  }

  // === 캠/마이크 세팅 화면 ===
  if (showSetup) {
    return (
      <ReadyPhase
        videoRef={videoRef}
        mediaStatus={mediaStatus}
        audioLevel={audioLevel}
        devices={devices}
        stream={stream}
        switchDevice={switchDevice}
        onStart={() => {
          setShowSetup(false)
          setPhase('ready')
        }}
      />
    )
  }

  // 현재 표시할 질문 텍스트
  const displayQuestion = isFollowUp ? followUpQuestion : currentQuestion.text

  // reviewing 프로그레스 바 텍스트 (2단계: STT → 검토)
  const reviewStageText = [
    '답변을 분석하고 있습니다',
    '면접관이 답변을 검토하고 있습니다',
  ]

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
                className={`h-full w-full object-cover transition-all duration-500 ${phase === 'reviewing' ? 'blur-md scale-105' : ''}`}
                style={{ transform: 'scaleX(-1)' }}
              />

              {/* 답변 전 가이드 */}
              {phase === 'ready' && (
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

              {/* reviewing 오버레이 */}
              {phase === 'reviewing' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-5 bg-black/60">
                  {/* 프로그레스 바 */}
                  <div className="w-64">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                      <div
                        className="bg-accent h-full rounded-full transition-all duration-300"
                        style={{ width: `${reviewProgress}%` }}
                      />
                    </div>
                  </div>
                  {/* 점 애니메이션 */}
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
                  {/* 상태 텍스트 */}
                  <p className="text-sm text-white">
                    {reviewStageText[reviewStage]}
                    <span
                      style={{
                        animation: 'analyzing-dots 1.4s infinite ease-in-out both',
                      }}
                    >
                      ...
                    </span>
                  </p>
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
            disabled={isRecording || phase === 'reviewing'}
            className="border-border bg-bg-card text-text-secondary hover:border-accent/50 cursor-pointer rounded-xl border px-5 py-2.5 transition-all disabled:cursor-not-allowed disabled:opacity-40"
          >
            나가기
          </button>

          {phase === 'reviewing' ? (
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
