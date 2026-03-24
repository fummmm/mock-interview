import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useMediaStream } from '../hooks/useMediaStream'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { useFrameCapture } from '../hooks/useFrameCapture'
import { useAudioLevel } from '../hooks/useAudioLevel'
import { transcribeAudio, preloadModel, isModelLoaded } from '../lib/whisper'
import { correctTranscript } from '../lib/api'
import { useEffect, useCallback, useRef } from 'react'

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

  const currentQuestion = questions[currentIndex]

  // 설정 없으면 홈으로
  useEffect(() => {
    if (!track || questions.length === 0) navigate('/')
  }, [track, questions, navigate])

  // 마운트 시 캠/마이크 권한 요청
  useEffect(() => {
    if (mediaStatus === 'idle') {
      requestPermission().then((s) => {
        if (s) { setMediaStream(s); setPhase('ready') }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleExit = useCallback(() => {
    stopStream()
    navigate('/')
  }, [stopStream, navigate])

  // 백그라운드 STT+교정 처리 추적
  const bgProcessing = useRef(new Set())

  // 모델 사전 로딩 (캠 권한 받은 후)
  useEffect(() => {
    if (mediaStatus === 'granted' && !isModelLoaded()) {
      preloadModel().catch((e) => console.warn('모델 사전 로딩 실패:', e.message))
    }
  }, [mediaStatus])

  // 백그라운드 STT + 교정 (답변 완료 즉시 비동기 시작)
  const processInBackground = useCallback((idx, blob, questionText) => {
    incPendingSTT()
    ;(async () => {
      try {
        console.log(`[백그라운드] Q${idx + 1} STT 시작`)
        const result = await transcribeAudio(blob)
        updateAnswer(idx, {
          rawTranscript: result.transcript,
          transcript: result.transcript,
          fillerWordCount: result.fillerWordCount,
          silenceSegments: result.silencePositions || [],
        })
        console.log(`[백그라운드] Q${idx + 1} 교정 시작`)
        const corrected = await correctTranscript(result.transcript, questionText)
        updateAnswer(idx, { transcript: corrected })
        console.log(`[백그라운드] Q${idx + 1} 완료`)
      } catch (e) {
        console.warn(`[백그라운드] Q${idx + 1} 실패:`, e.message)
      } finally {
        decPendingSTT()
      }
    })()
  }, [updateAnswer, incPendingSTT, decPendingSTT])

  // 답변 시작
  const handleStartAnswer = useCallback(() => {
    if (!stream) return
    clearFrames()
    startRecording()
    startCapture()
    setPhase('recording')
  }, [stream, clearFrames, startRecording, startCapture, setPhase])

  // 답변 완료 → 즉시 백그라운드 STT 시작 + 다음 질문
  const handleStopAnswer = useCallback(async () => {
    stopCapture()
    const result = await stopRecording()
    const idx = currentIndex
    const questionText = currentQuestion?.text || ''

    if (result) {
      updateAnswer(idx, {
        videoBlob: result.blob,
        videoBlobUrl: result.blobUrl,
        recordingDuration: result.duration,
        frames,
      })
      // 백그라운드에서 STT+교정 시작 (다음 질문과 병렬)
      processInBackground(idx, result.blob, questionText)
    }
    nextQuestion()
  }, [stopCapture, stopRecording, updateAnswer, currentIndex, currentQuestion, frames, processInBackground, nextQuestion])

  // processing → 분석 페이지 이동
  useEffect(() => {
    if (phase === 'processing') {
      stopStream()
      navigate('/analyzing')
    }
  }, [phase, stopStream, navigate])

  if (!currentQuestion) return null

  const formatTime = (sec) => {
    const m = Math.floor(sec / 60).toString().padStart(2, '0')
    const s = (sec % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 max-h-screen">
      <div className="max-w-4xl w-full mx-auto flex-1 flex flex-col gap-4">

        {/* 상단: 진행 상태 */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">
              질문 {currentIndex + 1} / {questions.length}
            </span>
            <div className="flex items-center gap-3">
              {isRecording && (
                <span className="flex items-center gap-2 text-sm text-recording font-medium">
                  <span className="w-2 h-2 rounded-full bg-recording animate-recording-pulse" />
                  REC {formatTime(duration)}
                  {/* 미니 마이크 레벨 */}
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
              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                currentQuestion.difficulty === 'basic' ? 'bg-success/15 text-success' :
                currentQuestion.difficulty === 'intermediate' ? 'bg-warning/15 text-warning' :
                'bg-danger/15 text-danger'
              }`}>
                {currentQuestion.difficulty === 'basic' ? '기본' :
                 currentQuestion.difficulty === 'intermediate' ? '중급' : '심화'}
              </span>
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
          <div className="bg-bg-card border border-border rounded-xl p-5">
            <p className="text-base sm:text-lg leading-relaxed">{currentQuestion.text}</p>
          </div>
        </div>

        {/* 캠 프리뷰 */}
        <div className="flex-1 relative min-h-[280px] rounded-2xl overflow-hidden bg-bg-secondary border border-border">
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

              {/* 답변 전 가이드 오버레이 */}
              {phase === 'ready' && (
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-4 pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-white/60 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/80" />
                  </div>
                  <p className="text-white text-sm font-medium">정면에서 카메라를 응시하고 답변해주세요</p>

                  {/* 마이크 레벨 테스트 */}
                  <div className="flex flex-col items-center gap-1.5">
                    <p className="text-white/60 text-xs">마이크 테스트 - 말해보세요</p>
                    <div className="flex items-center gap-1 h-5">
                      {Array.from({ length: 20 }).map((_, i) => (
                        <div
                          key={i}
                          className="w-1 rounded-full transition-all duration-75"
                          style={{
                            height: `${Math.max(4, (audioLevel > (i / 20) ? 20 : 4))}px`,
                            backgroundColor: audioLevel > (i / 20)
                              ? i < 14 ? '#22c55e' : i < 17 ? '#f59e0b' : '#ef4444'
                              : '#ffffff20',
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-xs" style={{ color: audioLevel > 0.05 ? '#22c55e' : '#ffffff60' }}>
                      {audioLevel > 0.05 ? '마이크 정상' : '소리가 감지되지 않습니다'}
                    </p>
                  </div>

                  <p className="text-white/60 text-xs">준비되면 아래 "답변 시작" 버튼을 눌러주세요</p>
                </div>
              )}

              {/* 녹화 중 테두리 */}
              {isRecording && (
                <div className="absolute inset-0 border-2 border-recording rounded-2xl pointer-events-none" />
              )}
              {/* 프레임 캡처 카운트 */}
              {isRecording && frames.length > 0 && (
                <div className="absolute top-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-lg">
                  캡처 {frames.length}/3
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

          {phase === 'ready' ? (
            <button
              onClick={handleStartAnswer}
              disabled={mediaStatus !== 'granted'}
              className="px-8 py-2.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              답변 시작
            </button>
          ) : phase === 'recording' ? (
            <button
              onClick={handleStopAnswer}
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
