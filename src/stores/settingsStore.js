import { create } from 'zustand'

export const useSettingsStore = create((set) => ({
  companySize: 'medium',
  track: null,
  questionCount: 5,
  mode: 'general', // 'general' | 'hard' | 'job'

  setCompanySize: (companySize) => set({ companySize }),
  setTrack: (track) => set({ track }),
  setQuestionCount: (questionCount) => set({ questionCount }),
  setMode: (mode) => set({ mode }),
  reset: () =>
    set({
      companySize: 'medium',
      track: null,
      questionCount: 5,
      mode: 'general',
    }),
}))
