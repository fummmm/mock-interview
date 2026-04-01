import { create } from 'zustand'

export const useSettingsStore = create((set) => ({
  companySize: 'medium',
  track: null,
  questionCount: 4,

  setCompanySize: (companySize) => set({ companySize }),
  setTrack: (track) => set({ track }),
  setQuestionCount: (questionCount) => set({ questionCount }),
  reset: () => set({ companySize: 'medium', track: null, questionCount: 4 }),
}))
