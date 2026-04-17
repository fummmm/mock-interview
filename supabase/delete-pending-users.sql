-- ============================================
-- 온보딩 미완료 계정 삭제 허용 정책
-- Supabase SQL Editor에서 실행
-- ============================================
-- 배경: AdminStudents에서 온보딩 미완료 계정을 정리할 수 있도록
-- 메인 어드민이 onboarding_completed=false 행을 DELETE 가능하게 허용.
-- 삭제된 계정은 해당 사용자가 재로그인 시 트리거에 의해 재생성됨.

-- 기존 정책이 있을 경우 제거 (idempotent)
drop policy if exists "users_delete_main_admin_pending" on public.users;

create policy "users_delete_main_admin_pending" on public.users
  for delete using (
    -- 본인은 완료 상태와 무관하게 항상 삭제 가능 (회원 탈퇴)
    auth.uid() = id
    -- 또는 메인 어드민이 온보딩 미완료 계정을 삭제할 때만 허용
    or (
      exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
      and onboarding_completed = false
    )
  );
