import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useAuthStore = create((set, get) => ({
  user: null, // supabase auth user
  profile: null, // public.users 레코드
  quota: null, // interview_quotas 레코드
  loading: true,
  error: null,

  // 세션 초기화 (앱 시작 시)
  initialize: async () => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
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

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('프로필 로드 실패:', profileError.message)
      // 프로필이 없으면 수동 생성 (트리거 미작동 대비)
      if (profileError.code === 'PGRST116') {
        const { error: insertError } = await supabase.from('users').insert({
          id: user.id,
          email: user.email,
          avatar_url: user.user_metadata?.avatar_url || null,
        })
        if (insertError) console.error('프로필 생성 실패:', insertError.message)

        // 쿼타 생성 (모든 가입자 3회 - 일반/맞춤형/하드모드 각 1회 체험)
        const initialQuota = 5
        await supabase.from('interview_quotas').insert({
          user_id: user.id,
          total_quota: initialQuota,
          used_count: 0,
        })

        // 다시 로드
        const { data: retryProfile } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .single()
        const { data: retryQuota } = await supabase
          .from('interview_quotas')
          .select('*')
          .eq('user_id', user.id)
          .single()
        set({ profile: retryProfile, quota: retryQuota })
        return
      }
    }

    const { data: quota } = await supabase
      .from('interview_quotas')
      .select('*')
      .eq('user_id', user.id)
      .single()

    set({ profile: profile || null, quota: quota || null })
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
      .update({
        name,
        track,
        cohort: parseInt(cohort),
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      })
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

  // 어드민 배정 범위 로드
  adminAssignments: [],
  loadAdminAssignments: async () => {
    const { profile } = get()
    if (!profile || !['main_admin', 'sub_admin'].includes(profile.role)) return
    const { data } = await supabase
      .from('admin_assignments')
      .select('track, cohort')
      .eq('admin_id', profile.id)
    set({ adminAssignments: data || [] })
  },

  // 특정 수강생이 내 관리 범위에 있는지 확인
  canManageStudent: (studentTrack, studentCohort) => {
    const { profile, adminAssignments } = get()
    if (profile?.role === 'main_admin') {
      // 메인 어드민: 배정된 트랙의 전 기수 (cohort=0), 배정 없으면 전체
      if (adminAssignments.length === 0) return true
      return adminAssignments.some(
        (a) => a.track === studentTrack && (a.cohort === 0 || a.cohort === studentCohort),
      )
    }
    if (profile?.role === 'sub_admin') {
      // 서브 어드민: 배정된 트랙+기수만
      return adminAssignments.some((a) => a.track === studentTrack && a.cohort === studentCohort)
    }
    return false
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
