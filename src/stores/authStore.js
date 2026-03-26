import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null,        // supabase auth user
  profile: null,     // public.users 레코드
  quota: null,       // interview_quotas 레코드
  loading: true,
  error: null,

  // 세션 초기화 (앱 시작 시)
  initialize: async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        set({ user: session.user })
        await get().loadProfile()
      }
    } catch (e) {
      console.error('Auth init failed:', e)
    } finally {
      set({ loading: false })
    }
  },

  // 프로필 로드
  loadProfile: async () => {
    const { user } = get()
    if (!user) return

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    const { data: quota } = await supabase
      .from('interview_quotas')
      .select('*')
      .eq('user_id', user.id)
      .single()

    set({ profile, quota })
  },

  // Google 로그인
  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) set({ error: error.message })
  },

  // 로그아웃
  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, quota: null })
  },

  // 온보딩 완료 (이름, 트랙, 기수 저장)
  completeOnboarding: async ({ name, track, cohort }) => {
    const { user } = get()
    if (!user) return

    const { error } = await supabase
      .from('users')
      .update({ name, track, cohort: parseInt(cohort), onboarding_completed: true, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (error) {
      set({ error: error.message })
      return false
    }

    await get().loadProfile()
    return true
  },

  // 쿼타 새로고침
  refreshQuota: async () => {
    const { user } = get()
    if (!user) return
    const { data } = await supabase
      .from('interview_quotas')
      .select('*')
      .eq('user_id', user.id)
      .single()
    set({ quota: data })
  },

  // 편의 getter
  isAuthenticated: () => !!get().user,
  isOnboarded: () => !!get().profile?.onboarding_completed,
  isAdmin: () => ['main_admin', 'sub_admin'].includes(get().profile?.role),
  isMainAdmin: () => get().profile?.role === 'main_admin',
  remainingQuota: () => {
    const q = get().quota
    return q ? Math.max(0, q.total_quota - q.used_count) : 0
  },
}))
