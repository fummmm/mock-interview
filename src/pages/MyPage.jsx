import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import { extractTextFromPdf } from '../lib/pdfExtract'

const TRACK_LABELS = { unity: 'Unity', unreal: 'Unreal Engine', pm: 'PM', design: '게임기획' }

export default function MyPage() {
  const { profile, quota, completeOnboarding } = useAuthStore()
  const navigate = useNavigate()
  const [tab, setTab] = useState('history')
  const [results, setResults] = useState([])
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  // 편집
  const [editName, setEditName] = useState(profile?.name || '')
  const [editTrack, setEditTrack] = useState(profile?.track || '')
  const [editCohort, setEditCohort] = useState(profile?.cohort?.toString() || '')
  const [saving, setSaving] = useState(false)

  // 업로드
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    const userId = profile?.id
    if (!userId) { setLoading(false); return }

    // 병렬 로드
    const [resResult, docsResult] = await Promise.all([
      supabase
        .from('interview_results')
        .select('id, overall_score, grade, overall_pass, created_at, interview_sessions(track, question_count)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('user_documents')
        .select('id, doc_type, file_name, file_path, file_size, uploaded_at')
        .eq('user_id', userId),
    ])

    setResults(resResult.data || [])
    setDocuments(docsResult.data || [])
    setLoading(false)
  }

  // 프로필 저장
  async function handleSaveProfile() {
    setSaving(true)
    await completeOnboarding({ name: editName, track: editTrack, cohort: editCohort })
    setSaving(false)
  }

  // PDF 업로드
  async function handleUpload(docType) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf'
    input.onchange = async (e) => {
      const file = e.target.files[0]
      if (!file) return
      if (file.size > 10 * 1024 * 1024) { alert('10MB 이하 파일만 업로드 가능합니다.'); return }

      setUploading(true)
      const filePath = `${profile.id}/${docType}_${Date.now()}.pdf`

      // Storage 업로드
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file)

      if (uploadError) {
        console.error('업로드 실패:', uploadError.message)
        setUploading(false)
        return
      }

      // 기존 같은 타입 문서 삭제
      const existing = documents.find((d) => d.doc_type === docType)
      if (existing) {
        await supabase.storage.from('documents').remove([existing.file_path])
        await supabase.from('user_documents').delete().eq('id', existing.id)
      }

      // DB 레코드 생성 (extracted_text는 별도 처리)
      const { error: insertError } = await supabase.from('user_documents').insert({
        user_id: profile.id,
        doc_type: docType,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      })

      if (insertError) {
        console.error('문서 레코드 생성 실패:', insertError)
        alert('파일은 업로드되었지만 기록 저장에 실패했습니다: ' + insertError.message)
      } else {
        // 레코드 생성 성공 후 PDF 텍스트 추출 (실패해도 무시)
        try {
          const text = await extractTextFromPdf(file)
          if (text && text.length > 50) {
            await supabase.from('user_documents')
              .update({ extracted_text: text })
              .eq('user_id', profile.id)
              .eq('doc_type', docType)
          }
        } catch (e) { console.warn('PDF 텍스트 추출 스킵:', e.message) }
      }

      await loadData()
      setUploading(false)
    }
    input.click()
  }

  // 문서 삭제
  async function handleDeleteDoc(doc) {
    await supabase.storage.from('documents').remove([doc.file_path])
    await supabase.from('user_documents').delete().eq('id', doc.id)
    await loadData()
  }

  // 성장 차트 데이터
  const chartData = [...results].reverse().map((r, i) => ({
    index: i + 1,
    score: r.overall_score || 0,
    date: new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
  }))

  const tabs = [
    { id: 'history', label: '면접 이력' },
    { id: 'profile', label: '내 정보' },
  ]

  return (
    <div className="flex-1 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold">마이페이지</h1>

        {/* 이력서/포폴 등록 상태 */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-text-secondary mb-3">이력서/포트폴리오</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {['resume', 'portfolio'].map((docType) => {
              const doc = documents.find((d) => d.doc_type === docType)
              const label = docType === 'resume' ? '이력서' : '포트폴리오'
              return (
                <div key={docType} className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${doc ? 'bg-success' : 'bg-text-secondary/30'}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      {doc ? (
                        <p className="text-xs text-text-secondary truncate">{doc.file_name}</p>
                      ) : (
                        <p className="text-xs text-text-secondary/60">미등록</p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-2">
                    {doc && (
                      <button onClick={() => handleDeleteDoc(doc)}
                        className="px-2.5 py-1 rounded-lg border border-border text-xs text-text-secondary hover:text-danger transition-all cursor-pointer">
                        삭제
                      </button>
                    )}
                    <button onClick={() => handleUpload(docType)} disabled={uploading}
                      className="px-2.5 py-1 rounded-lg bg-accent text-white text-xs cursor-pointer disabled:opacity-50">
                      {uploading ? '...' : doc ? '교체' : '등록'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {documents.some((d) => d.doc_type === 'resume' || d.doc_type === 'portfolio') && (
            <p className="text-xs text-text-secondary mt-3">등록된 문서는 면접 시 맞춤형 질문 생성에 활용됩니다.</p>
          )}
        </div>

        {/* 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-accent">{results.length}</p>
            <p className="text-xs text-text-secondary mt-1">총 면접 횟수</p>
          </div>
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-success">{results.filter((r) => r.overall_pass).length}</p>
            <p className="text-xs text-text-secondary mt-1">합격</p>
          </div>
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold">{results.length > 0 ? Math.round(results.reduce((a, r) => a + (r.overall_score || 0), 0) / results.length) : '-'}</p>
            <p className="text-xs text-text-secondary mt-1">평균 점수</p>
          </div>
          <div className="bg-bg-card border border-border rounded-xl p-4 text-center">
            <p className="text-2xl font-bold">{quota ? `${Math.max(0, quota.total_quota - quota.used_count)}` : '-'}</p>
            <p className="text-xs text-text-secondary mt-1">남은 횟수</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex gap-2 border-b border-border">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-all cursor-pointer ${
                tab === t.id ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-text-secondary text-center py-8">로딩 중...</p>
        ) : (
          <>
            {/* 면접 이력 */}
            {tab === 'history' && (
              <div className="space-y-4">
                {/* 성장 차트 */}
                {chartData.length >= 2 && (
                  <div className="bg-bg-card border border-border rounded-2xl p-4">
                    <p className="text-sm text-text-secondary mb-3">점수 추이</p>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={chartData}>
                        <CartesianGrid stroke="#e5e7eb" strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fill: '#6e6e82', fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: '#6e6e82', fontSize: 11 }} />
                        <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #d4d4de', borderRadius: '8px', color: '#1a1a2e' }} />
                        <Line type="monotone" dataKey="score" stroke="#E8344E" strokeWidth={2} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* 이력 목록 */}
                {results.length === 0 ? (
                  <p className="text-text-secondary text-center py-8">아직 면접 기록이 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {results.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => navigate(`/report/${r.id}`)}
                        className="w-full bg-bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:border-accent/50 transition-all cursor-pointer text-left"
                      >
                        <div className="space-y-1">
                          <p className="text-sm">{new Date(r.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                          <p className="text-xs text-text-secondary">
                            {r.interview_sessions?.track === 'behavioral' ? '인성면접' : TRACK_LABELS[r.interview_sessions?.track] || r.interview_sessions?.track} / {r.interview_sessions?.question_count}문항
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`text-xl font-bold ${r.overall_score >= 70 ? 'text-success' : r.overall_score >= 50 ? 'text-warning' : 'text-danger'}`}>
                            {r.overall_score}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${r.overall_pass ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'}`}>
                            {r.overall_pass ? '합격' : '불합격'}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 내 정보 */}
            {tab === 'profile' && (
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">이메일</label>
                  <p className="px-4 py-3 rounded-xl bg-bg-elevated text-text-secondary">{profile?.email}</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">이름</label>
                  <input value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-bg-card border border-border text-text-primary focus:border-accent focus:outline-none" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">트랙</label>
                  <p className="px-4 py-3 rounded-xl bg-bg-elevated text-text-secondary">{TRACK_LABELS[profile?.track] || profile?.track || '-'}</p>
                  <p className="text-xs text-text-secondary">트랙/기수 변경은 관리자에게 문의해주세요.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm text-text-secondary">기수</label>
                  <p className="px-4 py-3 rounded-xl bg-bg-elevated text-text-secondary">{profile?.cohort ? `${profile.cohort}기` : '-'}</p>
                </div>
                <button onClick={handleSaveProfile} disabled={saving}
                  className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold cursor-pointer disabled:opacity-50">
                  {saving ? '저장 중...' : '이름 저장'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
