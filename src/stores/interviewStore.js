import { create } from 'zustand'

export const useInterviewStore = create((set, get) => ({
  // 상태 머신
  phase: 'setup', // setup | ready | recording | processing | analyzing | report

  // 질문
  questions: [],
  currentIndex: 0,

  // 미디어
  mediaStream: null,
  permissionStatus: 'pending', // pending | granted | denied

  // 질문별 답변 데이터
  answers: [],

  // 백그라운드 STT 처리 추적
  pendingSTT: 0, // 처리 중인 질문 수

  // 분석 결과
  report: null,
  analysisProgress: 0,

  // 액션
  loadQuestions: (questions) => set({
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
      followUp: null, // { question, transcript, rawTranscript, videoBlob, videoBlobUrl, frames, recordingDuration }
    })),
    phase: 'setup',
    report: null,
    analysisProgress: 0,
  }),

  setPhase: (phase) => set({ phase }),

  setMediaStream: (stream) => set({ mediaStream: stream, permissionStatus: stream ? 'granted' : 'denied' }),

  // 녹화 완료 시 답변 데이터 업데이트
  updateAnswer: (index, data) => set((state) => {
    const answers = [...state.answers]
    answers[index] = { ...answers[index], ...data }
    return { answers }
  }),

  // 다음 질문으로
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

  reset: () => set({
    phase: 'setup',
    questions: [],
    currentIndex: 0,
    mediaStream: null,
    permissionStatus: 'pending',
    answers: [],
    report: null,
    analysisProgress: 0,
    pendingSTT: 0,
  }),
}))
