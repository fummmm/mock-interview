import { create } from 'zustand'

export const useSettingsStore = create((set) => ({
  track: null,
  questionCount: 5,

  setTrack: (track) => set({ track }),
  setQuestionCount: (questionCount) => set({ questionCount }),
  reset: () => set({ track: null, questionCount: 5 }),
}))
