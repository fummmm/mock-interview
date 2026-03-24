import { useNavigate } from 'react-router-dom'
import { useSettingsStore } from '../stores/settingsStore'
import { useInterviewStore } from '../stores/interviewStore'
import { useMediaStream } from '../hooks/useMediaStream'
import { useMediaRecorder } from '../hooks/useMediaRecorder'
import { useFrameCapture } from '../hooks/useFrameCapture'
import { useSpeechToText } from '../hooks/useSpeechToText'
import { useEffect, useCallback } from 'react'

export default function InterviewPage() {
  const navigate = useNavigate()
  const { track } = useSettingsStore()
  const {
    phase, questions, currentIndex,
    setPhase, updateAnswer, nextQuestion, setMediaStream,
  } = useInterviewStore()

  const { stream, videoRef, error: mediaError, status: mediaStatus, requestPermission, stopStream } = useMediaStream()
  const { isRecording, duration, startRecording, stopRecording } = useMediaRecorder(stream)
  const { frames, startCapture, stopCapture, clearFrames } = useFrameCapture(videoRef)
  const { transcript, interimText, isSupported: sttSupported, fillerCount, silenceCount, transcriptRef, fillerCountRef, silenceCountRef, start: startSTT, stop: stopSTT, reset: resetSTT } = useSpeechToText()

  const currentQuestion = questions[currentIndex]

  // 설정 없으면 홈으로
  useEffect(() => {
    if (!track || questions.length === 0) {
      navigate('/')
    }
  }, [track, questions, navigate])

  // 마운트 시 캠/마이크 권한 요청
  useEffect(() => {
    if (mediaStatus === 'idle') {
      requestPermission().then((s) => {
        if (s) {
          setMediaStream(s)
          setPhase('ready')
        }
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 나가기 시 정리
  const handleExit = useCallback(() => {
    stopSTT()
    stopStream()
    navigate('/')
  }, [stopSTT, stopStream, navigate])

  // 답변 시작 (녹화 + 프레임캡처 + STT 동시 시작)
  const handleStartAnswer = useCallback(() => {
    if (!stream) return
    clearFrames()
    resetSTT()
    startRecording()
    startCapture()
    startSTT()
    setPhase('recording')
  }, [stream, clearFrames, resetSTT, startRecording, startCapture, startSTT, setPhase])

  // 답변 완료 (녹화 + 프레임캡처 + STT 동시 중지)
  const handleStopAnswer = useCallback(async () => {
    stopSTT()
    stopCapture()
    const result = await stopRecording()

    // ref에서 최신값을 가져옴 (클로저 stale state 방지)
    const latestTranscript = transcriptRef.current
    const latestFillerCount = fillerCountRef.current
    const latestSilenceCount = silenceCountRef.current

    if (result) {
      updateAnswer(currentIndex, {
        videoBlob: result.blob,
        videoBlobUrl: result.blobUrl,
        recordingDuration: result.duration,
        frames,
        transcript: latestTranscript,
        fillerWordCount: latestFillerCount,
        silenceSegments: Array(latestSilenceCount).fill({ duration: 3 }),
      })
    }
    nextQuestion()
  }, [stopSTT, stopCapture, stopRecording, updateAnswer, currentIndex, frames, transcriptRef, fillerCountRef, silenceCountRef, nextQuestion])

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
                <span className="flex items-center gap-1.5 text-sm text-recording font-medium">
                  <span className="w-2 h-2 rounded-full bg-recording animate-recording-pulse" />
                  REC {formatTime(duration)}
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
                <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3 pointer-events-none">
                  <div className="w-16 h-16 rounded-full border-2 border-white/60 flex items-center justify-center">
                    <div className="w-3 h-3 rounded-full bg-white/80" />
                  </div>
                  <p className="text-white text-sm font-medium">정면에서 카메라를 응시하고 답변해주세요</p>
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

              {/* 실시간 자막 오버레이 */}
              {isRecording && (transcript || interimText) && (
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 max-h-24 overflow-y-auto">
                    <p className="text-sm text-white leading-relaxed">
                      {transcript && <span>{transcript} </span>}
                      {interimText && <span className="text-white/50">{interimText}</span>}
                    </p>
                  </div>
                </div>
              )}

              {/* STT 미지원 안내 */}
              {!sttSupported && isRecording && (
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="bg-warning/20 rounded-xl px-4 py-2 text-center">
                    <p className="text-xs text-warning">이 브라우저는 실시간 음성 인식을 지원하지 않습니다. Chrome을 사용해주세요.</p>
                  </div>
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
              <button
                onClick={requestPermission}
                className="px-4 py-2 rounded-lg bg-accent text-white text-sm cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-secondary">카메라를 준비하고 있습니다...</p>
            </div>
          )}
        </div>

        {/* 하단: STT 상태 + 컨트롤 */}
        <div className="space-y-3">
          {/* 말하기 상태 표시 */}
          {isRecording && (
            <div className="flex justify-center gap-4 text-xs text-text-secondary">
              <span>습관어(음, 어..): <span className={fillerCount > 3 ? 'text-warning' : 'text-text-primary'}>{fillerCount}회</span></span>
              <span>침묵: <span className={silenceCount > 2 ? 'text-warning' : 'text-text-primary'}>{silenceCount}구간</span></span>
            </div>
          )}

          {/* 버튼 */}
          <div className="flex justify-center gap-4 pb-2">
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
    </div>
  )
}
