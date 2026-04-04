import { useNavigate, useParams } from 'react-router-dom'
import { useInterviewStore } from '../stores/interviewStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useAuthStore } from '../stores/authStore'
import { useEffect, useRef, useState } from 'react'
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

const GRADE_COLOR = {
  S: 'text-yellow-400',
  A: 'text-success',
  B: 'text-info',
  C: 'text-warning',
  D: 'text-danger',
}
const scoreColor = (s) => (s >= 80 ? 'text-success' : s >= 60 ? 'text-warning' : 'text-danger')
const barColor = (s) => (s >= 80 ? 'bg-success' : s >= 60 ? 'bg-warning' : 'bg-danger')

function downloadSTTData(report) {
  const data = {
    timestamp: new Date().toISOString(),
    questions: report.questionData.map((qd) => ({
      questionIndex: qd.questionIndex + 1,
      question: qd.questionText,
      rawTranscript: qd.rawTranscript || '',
      correctedTranscript: qd.transcript || '',
      recordingDuration: qd.recordingDuration,
    })),
    evaluatorScores: report.evaluators.map((ev) => ({
      name: ev.name,
      role: ev.role,
      avgScore: ev.avgScore,
      pass: ev.pass,
    })),
    overallScore: report.overallScore,
    grade: report.grade,
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stt-data-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportPage() {
  const navigate = useNavigate()
  const { id: reportId } = useParams()
  const { report: memoryReport, reset: resetInterview } = useInterviewStore()
  const { reset: resetSettings } = useSettingsStore()
  const { profile } = useAuthStore()
  const [report, setReport] = useState(null)
  const [isOwnReport, setIsOwnReport] = useState(true) // 본인 리포트인지
  const [loading, setLoading] = useState(true)
  const memoryReportRef = useRef(memoryReport)
  memoryReportRef.current = memoryReport

  useEffect(() => {
    if (reportId) {
      setLoading(true)
      import('../lib/supabase').then(({ supabase }) => {
        supabase
          .from('interview_results')
          .select('report_json, user_id')
          .eq('id', reportId)
          .single()
          .then(({ data, error }) => {
            if (error || !data) {
              navigate('/')
              return
            }
            setIsOwnReport(data.user_id === profile?.id)
            let dbReport = data.report_json

            // 본인 리포트일 때만 현재 세션 메모리의 영상/프레임 머지
            const isOwn = data.user_id === profile?.id
            const memReport = memoryReportRef.current
            if (isOwn && memReport?.questionData) {
              dbReport = {
                ...dbReport,
                questionData: (dbReport.questionData || []).map((qd, i) => {
                  const memQ = memReport.questionData?.[i]
                  if (!memQ) return qd
                  return {
                    ...qd,
                    videoBlobUrl: memQ.videoBlobUrl || qd.videoBlobUrl,
                    frames: memQ.frames?.length > 0 ? memQ.frames : qd.frames,
                  }
                }),
              }
            }

            setReport(dbReport)
            setLoading(false)
          })
      })
      return
    }

    if (memoryReport) {
      setReport(memoryReport)
      setLoading(false)
    } else {
      navigate('/')
    }
  }, [reportId, navigate])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-text-secondary">리포트 로딩 중...</p>
      </div>
    )
  }
  if (!report) return null

  const handleRestart = () => {
    resetInterview()
    resetSettings()
    navigate('/')
  }

  const radarData = [
    { label: '답변 적합도', value: report.categoryScores.relevance },
    { label: '논리 구조', value: report.categoryScores.structure },
    { label: '기술 키워드', value: report.categoryScores.keywords },
    { label: '구체성', value: report.categoryScores.specificity },
    { label: '비언어', value: report.categoryScores.nonverbal },
  ]

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-6 pb-10">
        {/* 헤더 */}
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold">면접 분석 리포트</h1>
          <p className="text-text-secondary text-sm">
            {report.questionCount}개 질문 / 면접관 {report.evaluators?.length || 0}명 독립 평가
          </p>
        </div>

        {/* 종합 결과 + 레이더 */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="bg-bg-card border-border flex flex-col items-center justify-center gap-2 rounded-2xl border p-6">
            <p className="text-text-secondary text-sm">
              종합 점수 ({report.evaluators?.length || 0}명 평균)
            </p>
            <div className="animate-score-reveal">
              <span className={`text-6xl font-bold ${GRADE_COLOR[report.grade]}`}>
                {report.overallScore}
              </span>
              <span className="text-text-secondary ml-1 text-2xl">/100</span>
            </div>
            <span className={`text-3xl font-bold ${GRADE_COLOR[report.grade]}`}>
              {report.grade}
            </span>
            <div
              className={`mt-2 rounded-full px-4 py-1.5 text-sm font-medium ${report.overallPass ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
            >
              {report.overallPass
                ? `합격 (${report.passCount}/3 통과)`
                : `불합격 (${report.passCount}/3 통과)`}
            </div>
          </div>

          <div className="bg-bg-card border-border rounded-2xl border p-4">
            <p className="text-text-secondary mb-2 text-center text-sm">카테고리별 점수</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#d4d4de" />
                <PolarAngleAxis dataKey="label" tick={{ fill: '#6e6e82', fontSize: 11 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: '#6e6e82', fontSize: 10 }}
                />
                <Radar
                  dataKey="value"
                  stroke="#E8344E"
                  fill="#E8344E"
                  fillOpacity={0.25}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 면접관별 평가 — 점수 + 총평만 간결하게 */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">면접관별 평가</h2>
          {report.evaluators?.length > 0 ? (
            <div className="grid grid-cols-1 gap-3">
              {report.evaluators.map((ev) => (
                <EvaluatorSummaryCard key={ev.id} evaluator={ev} />
              ))}
            </div>
          ) : (
            <p className="text-text-secondary bg-bg-card border-border rounded-xl border p-4 text-sm">
              면접관별 상세 평가 데이터가 없습니다.
            </p>
          )}
        </div>

        {/* 말하기 분석 */}
        {report.speechFeedback && (
          <div className="bg-bg-card border-border space-y-2 rounded-2xl border p-5">
            <h2 className="text-text-secondary text-sm font-semibold">말하기 분석</h2>
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              {report.speechFeedback.fillerWordComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary mb-1 text-xs">습관어 (음, 어..)</p>
                  <p>{report.speechFeedback.fillerWordComment}</p>
                </div>
              )}
              {report.speechFeedback.silenceComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary mb-1 text-xs">침묵 구간</p>
                  <p>{report.speechFeedback.silenceComment}</p>
                </div>
              )}
              {report.speechFeedback.paceComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary mb-1 text-xs">답변 속도</p>
                  <p>{report.speechFeedback.paceComment}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 질문별 평가 — 메인 상세 섹션 */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">질문별 평가</h2>
          {report.questionData.map((qd) => (
            <QuestionDetailCard
              key={qd.questionIndex}
              data={qd}
              evaluators={report.evaluators || []}
            />
          ))}
        </div>

        {/* 비언어 팁 */}
        {report.visionTips?.length > 0 && (
          <div className="bg-bg-card border-border rounded-2xl border p-5">
            <h2 className="text-info mb-3 text-sm font-semibold">비언어적 커뮤니케이션 종합 팁</h2>
            <ul className="space-y-2">
              {report.visionTips.map((t, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-info shrink-0">*</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3">
          {isOwnReport ? (
            <button
              onClick={handleRestart}
              className="bg-accent hover:bg-accent-hover flex-1 cursor-pointer rounded-xl py-4 font-semibold text-white transition-all"
            >
              다시 시작하기
            </button>
          ) : (
            <button
              onClick={() => navigate(-1)}
              className="bg-bg-card border-border hover:border-accent/50 text-text-primary flex-1 cursor-pointer rounded-xl border py-4 font-semibold transition-all"
            >
              돌아가기
            </button>
          )}
          <button
            onClick={() => downloadSTTData(report)}
            className="border-border bg-bg-card text-text-secondary hover:border-accent/50 cursor-pointer rounded-xl border px-6 py-4 text-sm transition-all"
          >
            STT 데이터 저장
          </button>
        </div>
      </div>
    </div>
  )
}

/* 면접관 요약 카드 — 점수 + 총평 + 강점/개선점 */
function EvaluatorSummaryCard({ evaluator }) {
  const ev = evaluator
  return (
    <div className="bg-bg-card border-border rounded-2xl border p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="font-semibold">{ev.name}</span>
            <span className="text-text-secondary text-xs">{ev.role}</span>
            <span
              className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${ev.pass ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}
            >
              {ev.pass ? '합격' : '불합격'}
            </span>
          </div>
          <p className="text-text-secondary text-sm leading-relaxed">{ev.overallComment}</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ev.strengths?.length > 0 && (
              <div>
                <p className="text-success mb-1 text-xs font-medium">강점</p>
                <ul className="space-y-0.5">
                  {ev.strengths.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-xs">
                      <span className="text-success shrink-0">+</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {ev.improvements?.length > 0 && (
              <div>
                <p className="text-warning mb-1 text-xs font-medium">개선 포인트</p>
                <ul className="space-y-0.5">
                  {ev.improvements.map((s, i) => (
                    <li key={i} className="flex gap-1.5 text-xs">
                      <span className="text-warning shrink-0">-</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        <span className={`shrink-0 text-3xl font-bold ${GRADE_COLOR[ev.grade]}`}>
          {ev.avgScore}
        </span>
      </div>
    </div>
  )
}

/* 질문별 평가 카드 — 질문 중심으로 모든 정보 통합 */
function QuestionDetailCard({ data, evaluators }) {
  const [open, setOpen] = useState(false)
  const videoRef = useRef(null)
  const [playingClip, setPlayingClip] = useState(null)

  const frameToTime = (frameIndex) => frameIndex * 5
  const playClip = (startSec, durationSec = 7, label = '') => {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.max(0, startSec)
    video.play()
    setPlayingClip({ start: startSec, end: startSec + durationSec, label })
    const checkEnd = () => {
      if (video.currentTime >= startSec + durationSec) {
        video.pause()
        setPlayingClip(null)
        video.removeEventListener('timeupdate', checkEnd)
      }
    }
    video.addEventListener('timeupdate', checkEnd)
  }

  // 이 질문에 대한 각 면접관의 피드백 수집
  const evFeedbacks = evaluators
    .map((ev) => {
      const fb = ev.questionFeedbacks?.find((f) => f.questionIndex === data.questionIndex)
      if (!fb) return null
      const avg = Math.round(
        (fb.scores.relevance + fb.scores.structure + fb.scores.keywords + fb.scores.specificity) /
          4,
      )
      return {
        name: ev.name,
        role: ev.role,
        scores: fb.scores,
        avg,
        comment: fb.comment,
      }
    })
    .filter(Boolean)

  // 면접관 평균 점수
  const avgScore =
    evFeedbacks.length > 0
      ? Math.round(evFeedbacks.reduce((sum, f) => sum + f.avg, 0) / evFeedbacks.length)
      : null

  return (
    <div className="bg-bg-card border-border overflow-hidden rounded-2xl border">
      {/* 접힌 상태: 질문 풀텍스트 + 면접관 평균 점수 */}
      <button
        onClick={() => setOpen(!open)}
        className="hover:bg-bg-elevated/30 flex w-full cursor-pointer items-start gap-3 p-5 text-left transition-colors"
      >
        <span className="text-text-secondary mt-0.5 shrink-0 text-xs font-medium">
          Q{data.questionIndex + 1}
        </span>
        <p className="flex-1 text-sm leading-relaxed">{data.questionText}</p>
        <div className="ml-2 flex shrink-0 items-center gap-2">
          {avgScore !== null && (
            <span className={`text-xl font-bold ${scoreColor(avgScore)}`}>{avgScore}</span>
          )}
          <span className="text-text-secondary text-lg">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <div className="border-border space-y-5 border-t p-5">
          {/* 녹화 영상 */}
          {data.videoBlobUrl && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-text-secondary text-xs font-medium">
                  내 답변 영상 ({data.recordingDuration}초)
                </p>
                {playingClip && (
                  <span className="text-accent animate-recording-pulse text-xs">
                    {playingClip.label} 재생 중...
                  </span>
                )}
              </div>
              <video
                ref={videoRef}
                src={data.videoBlobUrl}
                controls
                className="max-h-64 w-full rounded-xl bg-black"
                onPause={() => setPlayingClip(null)}
                onLoadedMetadata={(e) => {
                  // Blob 비디오 duration 수정 (MediaRecorder 메타데이터 누락 대응)
                  const v = e.target
                  if (v.duration === Infinity || isNaN(v.duration)) {
                    v.currentTime = 1e10
                    v.addEventListener('timeupdate', function fix() {
                      v.removeEventListener('timeupdate', fix)
                      v.currentTime = 0
                    })
                  }
                }}
              />
            </div>
          )}

          {/* 내 답변 텍스트 */}
          {data.transcript && (
            <div className="bg-bg-secondary rounded-xl p-4">
              <p className="text-text-secondary mb-2 text-xs font-medium">내 답변</p>
              <p className="text-sm leading-relaxed">
                <HighlightedTranscript
                  text={data.transcript}
                  problemPhrases={data.problemPhrases || []}
                />
              </p>
              {data.problemPhrases?.length > 0 && (
                <div className="border-border/50 mt-3 space-y-1.5 border-t pt-2">
                  {data.problemPhrases.map((pp, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span
                        className={`shrink-0 ${pp.severity === 'error' ? 'text-danger' : 'text-warning'}`}
                      >
                        {pp.severity === 'error' ? '!!' : '!'}
                      </span>
                      <span>
                        <span className={pp.severity === 'error' ? 'text-danger' : 'text-warning'}>
                          "{pp.text}"
                        </span>
                        <span className="text-text-secondary ml-1">- {pp.reason}</span>
                        {pp.evaluator && (
                          <span className="text-text-secondary/60 ml-1">({pp.evaluator})</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 면접관별 점수 + 코멘트 */}
          {evFeedbacks.length > 0 && (
            <div className="space-y-3">
              <p className="text-text-secondary text-xs font-medium">면접관별 평가</p>
              {evFeedbacks.map((fb, i) => (
                <div key={i} className="bg-bg-secondary space-y-2 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{fb.name}</span>
                      <span className="text-text-secondary text-xs">{fb.role}</span>
                    </div>
                    <span className={`text-lg font-bold ${scoreColor(fb.avg)}`}>{fb.avg}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '적합', score: fb.scores.relevance },
                      { label: '구조', score: fb.scores.structure },
                      { label: '키워드', score: fb.scores.keywords },
                      { label: '구체성', score: fb.scores.specificity },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-text-secondary text-[10px]">{item.label}</p>
                        <div className="bg-bg-primary mt-0.5 mb-0.5 h-1 w-full rounded-full">
                          <div
                            className={`h-1 rounded-full ${barColor(item.score)}`}
                            style={{ width: `${item.score}%` }}
                          />
                        </div>
                        <p className={`text-xs font-medium ${scoreColor(item.score)}`}>
                          {item.score}
                        </p>
                      </div>
                    ))}
                  </div>
                  {fb.comment && (
                    <p className="text-text-secondary text-sm leading-relaxed">{fb.comment}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 비언어 분석 */}
          {data.vision && (
            <div className="space-y-3">
              <p className="text-text-secondary text-xs font-medium">비언어적 분석</p>
              <div className="bg-bg-secondary rounded-xl p-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-text-secondary text-[10px]">시선</p>
                    <p className={`font-medium ${scoreColor(data.vision.eyeContact?.score || 0)}`}>
                      {data.vision.eyeContact?.score || 0}
                    </p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      {data.vision.eyeContact?.comment}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-secondary text-[10px]">표정</p>
                    <p className={`font-medium ${scoreColor(data.vision.expression?.score || 0)}`}>
                      {data.vision.expression?.score || 0}
                    </p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      {data.vision.expression?.comment}
                    </p>
                  </div>
                  <div>
                    <p className="text-text-secondary text-[10px]">자세</p>
                    <p className={`font-medium ${scoreColor(data.vision.posture?.score || 0)}`}>
                      {data.vision.posture?.score || 0}
                    </p>
                    <p className="text-text-secondary mt-0.5 text-xs">
                      {data.vision.posture?.comment}
                    </p>
                  </div>
                </div>
              </div>

              {/* 문제 프레임 */}
              {data.frames?.length > 0 && data.vision.problemFrames?.length > 0 && (
                <div>
                  <p className="text-text-secondary mb-2 text-xs">
                    문제 감지 구간 (클릭 시 해당 시점 재생)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {data.vision.problemFrames.map((pf) => {
                      const frame = data.frames[pf.frameIndex]
                      if (!frame) return null
                      const time = frameToTime(pf.frameIndex)
                      return (
                        <button
                          key={pf.frameIndex}
                          className="group relative cursor-pointer"
                          onClick={() => playClip(time, 5, pf.issue)}
                        >
                          <img
                            src={frame}
                            alt={pf.issue}
                            className="border-warning hover:border-danger h-22 w-32 rounded-lg border-2 object-cover transition-all"
                          />
                          <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[9px] text-white">
                            {Math.floor(time / 60)}:{(time % 60).toString().padStart(2, '0')}
                          </span>
                          <span className="bg-warning/90 absolute top-0 right-0 left-0 rounded-t-lg px-1.5 py-0.5 text-center text-[9px] font-medium text-black">
                            {pf.issue}
                          </span>
                          <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <svg
                              className="h-6 w-6 text-white"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 꼬리질문 */}
          {data.followUp?.question && (
            <div className="bg-accent/5 border-accent/20 space-y-2 rounded-xl border p-4">
              <p className="text-accent text-xs font-medium">꼬리질문: {data.followUp.question}</p>
              {data.followUp.transcript ? (
                <p className="text-sm leading-relaxed">{data.followUp.transcript}</p>
              ) : (
                <p className="text-text-secondary text-xs">꼬리질문 답변이 기록되지 않았습니다.</p>
              )}
            </div>
          )}

          {/* 모범 답안 */}
          {data.sampleAnswer && (
            <div className="bg-info/5 border-info/20 rounded-xl border p-4">
              <p className="text-info mb-1 text-xs font-medium">모범 답안 예시</p>
              <p className="text-sm leading-relaxed">{data.sampleAnswer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* 답변 텍스트에서 문제 구절을 하이라이트 */
function HighlightedTranscript({ text, problemPhrases }) {
  if (!problemPhrases || problemPhrases.length === 0) {
    return <span className="text-text-secondary">{text}</span>
  }

  // 문제 구절의 위치를 찾아서 마킹
  const segments = []
  let remaining = text
  let offset = 0

  // severity 높은 순으로 정렬 (error 먼저)
  const sorted = [...problemPhrases].sort((a, b) =>
    a.severity === 'error' ? -1 : b.severity === 'error' ? 1 : 0,
  )

  // 각 문제 구절의 위치 찾기
  const marks = []
  sorted.forEach((pp) => {
    const idx = text.indexOf(pp.text)
    if (idx !== -1) {
      marks.push({
        start: idx,
        end: idx + pp.text.length,
        severity: pp.severity,
        reason: pp.reason,
      })
    }
  })

  // 겹치는 구간 제거 (먼저 찾은 것 우선)
  marks.sort((a, b) => a.start - b.start)
  const filtered = []
  let lastEnd = -1
  marks.forEach((m) => {
    if (m.start >= lastEnd) {
      filtered.push(m)
      lastEnd = m.end
    }
  })

  // 세그먼트 분할
  let pos = 0
  filtered.forEach((m) => {
    if (m.start > pos) {
      segments.push({ text: text.slice(pos, m.start), type: 'normal' })
    }
    segments.push({
      text: text.slice(m.start, m.end),
      type: m.severity,
      reason: m.reason,
    })
    pos = m.end
  })
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), type: 'normal' })
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'normal') {
          return (
            <span key={i} className="text-text-secondary">
              {seg.text}
            </span>
          )
        }
        return (
          <span
            key={i}
            className={`relative cursor-help border-b-2 ${
              seg.type === 'error'
                ? 'text-danger border-danger/60 bg-danger/10'
                : 'text-warning border-warning/60 bg-warning/10'
            }`}
            title={seg.reason}
          >
            {seg.text}
          </span>
        )
      })}
    </>
  )
}
