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

/* 질문 상세 카드 (영상 재생 + 전사 + 모범 답안) */
function QuestionDetailCard({ data }) {
  const [open, setOpen] = useState(false)

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
              <video src={data.videoBlobUrl} controls className="w-full rounded-xl bg-black max-h-64" style={{ transform: 'scaleX(-1)' }} />
            </div>
          )}

          {/* 캡처 프레임 */}
          {data.frames.length > 0 && (
            <div>
              <p className="text-xs text-text-secondary font-medium mb-2">캡처 프레임</p>
              <div className="flex gap-2">
                {data.frames.map((f, i) => (
                  <img key={i} src={f} alt={`캡처 ${i + 1}`} className="w-28 h-20 rounded-lg object-cover border border-border" style={{ transform: 'scaleX(-1)' }} />
                ))}
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

          {/* 전사 텍스트 */}
          {data.transcript && (
            <div className="bg-bg-secondary rounded-xl p-3">
              <p className="text-xs text-text-secondary font-medium mb-1">내 답변 (음성 인식)</p>
              <p className="text-sm leading-relaxed text-text-secondary">{data.transcript}</p>
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
