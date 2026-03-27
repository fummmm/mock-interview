import { create } from 'zustand'
import { supabase } from '../lib/supabase'

let sessionCounter = 0

export const useInterviewStore = create((set, get) => ({
  sessionId: 0,
  dbSessionId: null, // Supabase interview_sessions.id

  phase: 'setup',
  questions: [],
  currentIndex: 0,

  mediaStream: null,
  permissionStatus: 'pending',

  answers: [],
  pendingSTT: 0,

  report: null,
  analysisProgress: 0,

  loadQuestions: (questions) => {
    sessionCounter++
    return set({
      sessionId: sessionCounter,
      dbSessionId: null,
      questions,
      currentIndex: 0,
      answers: questions.map((q) => ({
        questionId: q.id,
        questionText: q.text,
        transcript: '',
        rawTranscript: '',
        videoBlob: null,
        videoBlobUrl: null,
        frames: [],
        recordingDuration: 0,
        fillerWordCount: 0,
        silenceSegments: [],
        wordTimestamps: [],
        followUp: null,
      })),
      phase: 'setup',
      report: null,
      analysisProgress: 0,
      pendingSTT: 0,
    })
  },

  // 면접 시작: DB 세션 생성 + 쿼타 차감
  startSession: async (userId, track, questionCount) => {
    try {
      // 세션 생성
      const { data: session, error: sessionError } = await supabase
        .from('interview_sessions')
        .insert({ user_id: userId, track, question_count: questionCount })
        .select()
        .single()

      if (sessionError) throw sessionError

      // 쿼타 atomic 차감 (race condition 방지)
      // used_count < total_quota 조건으로 초과 사용도 방지
      const { data: updated, error: quotaErr } = await supabase.rpc('increment_used_count', { p_user_id: userId })
      if (quotaErr) {
        // RPC 없으면 직접 UPDATE (폴백)
        const { data: q } = await supabase.from('interview_quotas').select('used_count, total_quota').eq('user_id', userId).single()
        if (q && q.used_count < q.total_quota) {
          await supabase.from('interview_quotas').update({ used_count: q.used_count + 1, updated_at: new Date().toISOString() }).eq('user_id', userId)
        }
      }

      set({ dbSessionId: session.id })
      return session.id
    } catch (e) {
      console.error('세션 시작 실패:', e)
      return null
    }
  },

  // 면접 완료: 결과 DB 저장
  saveResult: async (reportData) => {
    const { dbSessionId } = get()
    if (!dbSessionId) return null

    try {
      // 영상 blob은 저장 불가하므로 제거
      const cleanReport = JSON.parse(JSON.stringify(reportData, (key, val) => {
        if (key === 'videoBlob' || key === 'videoBlobUrl') return undefined
        if (key === 'frames') return [] // base64 프레임도 DB에는 안 넣음 (용량)
        return val
      }))

      const { data, error } = await supabase
        .from('interview_results')
        .insert({
          session_id: dbSessionId,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          report_json: cleanReport,
          overall_score: reportData.overallScore,
          grade: reportData.grade,
          overall_pass: reportData.overallPass,
        })
        .select()
        .single()

      if (error) throw error

      // 세션 상태 완료
      await supabase
        .from('interview_sessions')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', dbSessionId)

      return data.id
    } catch (e) {
      console.error('결과 저장 실패:', e)
      return null
    }
  },

  // 면접 이탈
  abandonSession: async () => {
    const { dbSessionId } = get()
    if (!dbSessionId) return
    try {
      await supabase
        .from('interview_sessions')
        .update({ status: 'abandoned', completed_at: new Date().toISOString() })
        .eq('id', dbSessionId)
    } catch (e) {
      console.error('세션 이탈 처리 실패:', e)
    }
  },

  setPhase: (phase) => set({ phase }),
  setMediaStream: (stream) => set({ mediaStream: stream, permissionStatus: stream ? 'granted' : 'denied' }),

  updateAnswer: (index, data) => set((state) => {
    const answers = [...state.answers]
    answers[index] = { ...answers[index], ...data }
    return { answers }
  }),

  nextQuestion: () => {
    const { currentIndex, questions } = get()
    if (currentIndex < questions.length - 1) {
      set({ currentIndex: currentIndex + 1, phase: 'ready' })
    } else {
      set({ phase: 'processing' })
    }
  },

  incPendingSTT: () => set((s) => ({ pendingSTT: s.pendingSTT + 1 })),
  decPendingSTT: () => set((s) => ({ pendingSTT: Math.max(0, s.pendingSTT - 1) })),

  setReport: (report) => set({ report, phase: 'report' }),
  setAnalysisProgress: (progress) => set({ analysisProgress: progress }),

  reset: () => {
    sessionCounter++
    return set({
      sessionId: sessionCounter,
      dbSessionId: null,
      phase: 'setup',
      questions: [],
      currentIndex: 0,
      mediaStream: null,
      permissionStatus: 'pending',
      answers: [],
      report: null,
      analysisProgress: 0,
      pendingSTT: 0,
    })
  },
}))
