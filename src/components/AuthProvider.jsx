import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'

export default function AuthProvider({ children }) {
  const { initialize, loadProfile } = useAuthStore()

  useEffect(() => {
    initialize()

    // 인증 상태 변경 감지 (로그인/로그아웃/토큰 갱신)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          useAuthStore.setState({ user: session.user })
          await loadProfile()
        }
        if (event === 'SIGNED_OUT') {
          useAuthStore.setState({ user: null, profile: null, quota: null })
        }
      }
    )

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return children
}
