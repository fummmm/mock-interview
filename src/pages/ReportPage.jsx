import { useNavigate } from 'react-router-dom'
import { useInterviewStore } from '../stores/interviewStore'
import { useSettingsStore } from '../stores/settingsStore'
import { useEffect, useRef, useState } from 'react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts'

const GRADE_COLOR = { S: 'text-yellow-400', A: 'text-success', B: 'text-info', C: 'text-warning', D: 'text-danger' }
const scoreColor = (s) => s >= 80 ? 'text-success' : s >= 60 ? 'text-warning' : 'text-danger'
const barColor = (s) => s >= 80 ? 'bg-success' : s >= 60 ? 'bg-warning' : 'bg-danger'

export default function ReportPage() {
  const navigate = useNavigate()
  const { report, reset: resetInterview } = useInterviewStore()
  const { reset: resetSettings } = useSettingsStore()

  useEffect(() => { if (!report) navigate('/') }, [report, navigate])
  if (!report) return null

  const handleRestart = () => { resetInterview(); resetSettings(); navigate('/') }

  const radarData = [
    { label: '답변 적합도', value: report.categoryScores.relevance },
    { label: '논리 구조', value: report.categoryScores.structure },
    { label: '기술 키워드', value: report.categoryScores.keywords },
    { label: '구체성', value: report.categoryScores.specificity },
    { label: '비언어', value: report.categoryScores.nonverbal },
  ]

  return (
    <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
      <div className="max-w-4xl mx-auto space-y-6 pb-10">

        {/* 헤더 */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">면접 분석 리포트</h1>
          <p className="text-sm text-text-secondary">{report.questionCount}개 질문 / 면접관 3명 독립 평가</p>
        </div>

        {/* 종합 결과 + 레이더 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-bg-card border border-border rounded-2xl p-6 flex flex-col items-center justify-center gap-2">
            <p className="text-sm text-text-secondary">종합 점수 (3명 평균)</p>
            <div className="animate-score-reveal">
              <span className={`text-6xl font-bold ${GRADE_COLOR[report.grade]}`}>{report.overallScore}</span>
              <span className="text-2xl text-text-secondary ml-1">/100</span>
            </div>
            <span className={`text-3xl font-bold ${GRADE_COLOR[report.grade]}`}>{report.grade}</span>
            <div className={`mt-2 px-4 py-1.5 rounded-full text-sm font-medium ${report.overallPass ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
              {report.overallPass ? `합격 (${report.passCount}/3 통과)` : `불합격 (${report.passCount}/3 통과)`}
            </div>
          </div>

          <div className="bg-bg-card border border-border rounded-2xl p-4">
            <p className="text-sm text-text-secondary text-center mb-2">카테고리별 점수</p>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#2a3042" />
                <PolarAngleAxis dataKey="label" tick={{ fill: '#8b92a5', fontSize: 11 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#8b92a5', fontSize: 10 }} />
                <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3명 평가자 카드 */}
        <div className="space-y-3">
          <h2 className="font-semibold text-lg">면접관별 평가</h2>
          {report.evaluators.map((ev) => (
            <EvaluatorCard key={ev.id} evaluator={ev} questionData={report.questionData} />
          ))}
        </div>

        {/* 말하기 분석 */}
        {report.speechFeedback && (
          <div className="bg-bg-card border border-border rounded-2xl p-5 space-y-2">
            <h2 className="font-semibold text-sm text-text-secondary">말하기 분석</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
              {report.speechFeedback.fillerWordComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary text-xs mb-1">습관어 (음, 어..)</p>
                  <p>{report.speechFeedback.fillerWordComment}</p>
                </div>
              )}
              {report.speechFeedback.silenceComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary text-xs mb-1">침묵 구간</p>
                  <p>{report.speechFeedback.silenceComment}</p>
                </div>
              )}
              {report.speechFeedback.paceComment && (
                <div className="bg-bg-secondary rounded-xl p-3">
                  <p className="text-text-secondary text-xs mb-1">답변 속도</p>
                  <p>{report.speechFeedback.paceComment}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 비언어 팁 */}
        {report.visionTips.length > 0 && (
          <div className="bg-bg-card border border-border rounded-2xl p-5">
            <h2 className="font-semibold text-info text-sm mb-3">비언어적 커뮤니케이션 팁</h2>
            <ul className="space-y-2">
              {report.visionTips.map((t, i) => (
                <li key={i} className="text-sm flex gap-2"><span className="text-info shrink-0">*</span><span>{t}</span></li>
              ))}
            </ul>
          </div>
        )}

        {/* 질문별 상세 (영상 재생 + 모범 답안) */}
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">질문별 상세</h2>
          {report.questionData.map((qd) => (
            <QuestionDetailCard key={qd.questionIndex} data={qd} />
          ))}
        </div>

        <button onClick={handleRestart} className="w-full py-4 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-all cursor-pointer">
          다시 시작하기
        </button>
      </div>
    </div>
  )
}

/* 평가자 카드 */
function EvaluatorCard({ evaluator, questionData }) {
  const [open, setOpen] = useState(false)
  const ev = evaluator

  const roleIcon = ev.id === 'hr' ? '👔' : ev.id === 'expert_a' ? '🎮' : '🛠️'

  return (
    <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-5 text-left flex items-center gap-4 cursor-pointer hover:bg-bg-elevated/30 transition-colors">
        <span className="text-2xl">{roleIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold">{ev.name}</span>
            <span className="text-xs text-text-secondary">{ev.role}</span>
          </div>
          <p className="text-sm text-text-secondary mt-0.5 truncate">{ev.overallComment?.slice(0, 60)}...</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`text-2xl font-bold ${GRADE_COLOR[ev.grade]}`}>{ev.avgScore}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ev.pass ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
            {ev.pass ? '합격' : '불합격'}
          </span>
          <span className="text-text-secondary">{open ? '−' : '+'}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-border p-5 space-y-4">
          {/* 총평 */}
          <div className="bg-bg-secondary rounded-xl p-4">
            <p className="text-sm leading-relaxed">{ev.overallComment}</p>
          </div>

          {/* 강점 / 개선점 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-success font-medium mb-1.5">강점</p>
              <ul className="space-y-1">
                {ev.strengths.map((s, i) => (
                  <li key={i} className="text-sm flex gap-1.5"><span className="text-success shrink-0">+</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs text-warning font-medium mb-1.5">개선 포인트</p>
              <ul className="space-y-1">
                {ev.improvements.map((s, i) => (
                  <li key={i} className="text-sm flex gap-1.5"><span className="text-warning shrink-0">-</span><span>{s}</span></li>
                ))}
              </ul>
            </div>
          </div>

          {/* 질문별 코멘트 + 점수 */}
          <div className="space-y-3">
            <p className="text-xs text-text-secondary font-medium">질문별 평가</p>
            {ev.questionFeedbacks.map((fb) => {
              const qd = questionData[fb.questionIndex]
              const avg = Math.round((fb.scores.relevance + fb.scores.structure + fb.scores.keywords + fb.scores.specificity) / 4)
              return (
                <div key={fb.questionIndex} className="bg-bg-secondary rounded-xl p-3 space-y-2">
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-xs text-text-secondary flex-1">Q{fb.questionIndex + 1}. {qd?.questionText?.slice(0, 50)}...</p>
                    <span className={`text-lg font-bold shrink-0 ${scoreColor(avg)}`}>{avg}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: '적합', score: fb.scores.relevance },
                      { label: '구조', score: fb.scores.structure },
                      { label: '키워드', score: fb.scores.keywords },
                      { label: '구체성', score: fb.scores.specificity },
                    ].map((item) => (
                      <div key={item.label} className="text-center">
                        <p className="text-[10px] text-text-secondary">{item.label}</p>
                        <p className={`text-xs font-medium ${scoreColor(item.score)}`}>{item.score}</p>
                      </div>
                    ))}
                  </div>
                  {fb.comment && <p className="text-sm text-text-secondary">{fb.comment}</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/* 질문 상세 카드 (하이라이트 답변 + 영상 재생 + 비언어) */
function QuestionDetailCard({ data }) {
  const [open, setOpen] = useState(false)
  const videoRef = useRef(null)

  // 영상을 특정 시점부터 재생
  const seekAndPlay = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = seconds
      videoRef.current.play()
    }
  }

  // 프레임 인덱스 → 대략적 타임스탬프 (7초 간격 캡처 기준)
  const frameToTime = (frameIndex) => frameIndex * 7

  return (
    <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
      <button onClick={() => setOpen(!open)} className="w-full p-4 text-left flex items-center justify-between cursor-pointer hover:bg-bg-elevated/30 transition-colors">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-secondary mb-0.5">질문 {data.questionIndex + 1}</p>
          <p className="text-sm truncate">{data.questionText}</p>
        </div>
        <span className="text-text-secondary ml-3">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-4">
          {/* 녹화 영상 */}
          {data.videoBlobUrl && (
            <div>
              <p className="text-xs text-text-secondary font-medium mb-2">녹화 영상 ({data.recordingDuration}초)</p>
              <video ref={videoRef} src={data.videoBlobUrl} controls className="w-full rounded-xl bg-black max-h-64" style={{ transform: 'scaleX(-1)' }} />
            </div>
          )}

          {/* 내 답변 - 문제 구절 하이라이트 */}
          {data.transcript && (
            <div className="bg-bg-secondary rounded-xl p-3">
              <p className="text-xs text-text-secondary font-medium mb-2">내 답변</p>
              <p className="text-sm leading-relaxed">
                <HighlightedTranscript
                  text={data.transcript}
                  problemPhrases={data.problemPhrases || []}
                />
              </p>
              {/* 문제 구절 범례 */}
              {data.problemPhrases?.length > 0 && (
                <div className="mt-3 space-y-1.5 border-t border-border/50 pt-2">
                  {data.problemPhrases.map((pp, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className={`shrink-0 ${pp.severity === 'error' ? 'text-danger' : 'text-warning'}`}>
                        {pp.severity === 'error' ? '!!' : '!'}
                      </span>
                      <span>
                        <span className={pp.severity === 'error' ? 'text-danger' : 'text-warning'}>"{pp.text}"</span>
                        <span className="text-text-secondary ml-1">- {pp.reason}</span>
                        {pp.evaluator && <span className="text-text-secondary/60 ml-1">({pp.evaluator})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 캡처 프레임 + 문제 프레임 표시 */}
          {data.frames.length > 0 && (
            <div>
              <p className="text-xs text-text-secondary font-medium mb-2">캡처 프레임</p>
              <div className="flex gap-2">
                {data.frames.map((f, i) => {
                  const problemFrame = data.vision?.problemFrames?.find((pf) => pf.frameIndex === i)
                  return (
                    <div key={i} className="relative group">
                      <img
                        src={f} alt={`캡처 ${i + 1}`}
                        className={`w-28 h-20 rounded-lg object-cover border cursor-pointer transition-all ${
                          problemFrame ? 'border-warning border-2' : 'border-border'
                        }`}
                        style={{ transform: 'scaleX(-1)' }}
                        onClick={() => seekAndPlay(frameToTime(i))}
                      />
                      {problemFrame && (
                        <div className="absolute -bottom-1 left-0 right-0 text-center">
                          <span className="bg-warning text-black text-[9px] px-1 rounded">{problemFrame.issue}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                        <span className="text-white text-xs">재생</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 비언어 분석 */}
          {data.vision && (
            <div className="bg-bg-secondary rounded-xl p-3">
              <p className="text-xs text-text-secondary font-medium mb-2">비언어적 분석</p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-text-secondary">시선</p>
                  <p className={`font-medium ${scoreColor(data.vision.eyeContact?.score || 0)}`}>{data.vision.eyeContact?.score || 0}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{data.vision.eyeContact?.comment}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary">표정</p>
                  <p className={`font-medium ${scoreColor(data.vision.expression?.score || 0)}`}>{data.vision.expression?.score || 0}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{data.vision.expression?.comment}</p>
                </div>
                <div>
                  <p className="text-[10px] text-text-secondary">자세</p>
                  <p className={`font-medium ${scoreColor(data.vision.posture?.score || 0)}`}>{data.vision.posture?.score || 0}</p>
                  <p className="text-xs text-text-secondary mt-0.5">{data.vision.posture?.comment}</p>
                </div>
              </div>
            </div>
          )}

          {/* 모범 답안 */}
          {data.sampleAnswer && (
            <div className="bg-info/5 border border-info/20 rounded-xl p-3">
              <p className="text-xs text-info font-medium mb-1">모범 답안 예시</p>
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
    a.severity === 'error' ? -1 : b.severity === 'error' ? 1 : 0
  )

  // 각 문제 구절의 위치 찾기
  const marks = []
  sorted.forEach((pp) => {
    const idx = text.indexOf(pp.text)
    if (idx !== -1) {
      marks.push({ start: idx, end: idx + pp.text.length, severity: pp.severity, reason: pp.reason })
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
    segments.push({ text: text.slice(m.start, m.end), type: m.severity, reason: m.reason })
    pos = m.end
  })
  if (pos < text.length) {
    segments.push({ text: text.slice(pos), type: 'normal' })
  }

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'normal') {
          return <span key={i} className="text-text-secondary">{seg.text}</span>
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
