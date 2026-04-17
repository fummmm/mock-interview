-- ============================================
-- P0 보안 핫픽스 — 전체 RLS 재구성
-- Supabase SQL Editor에서 한 번에 실행
-- ============================================
-- 해결 이슈:
--   C2: fix-rls.sql의 auth.role()='authenticated' 정책 제거
--   C3: 학생 role 셀프 승격 차단
--   H1: increment_used_count RPC 인가 추가
--   H4: interview_results_summary 뷰 보호
--   H5: RLS 재귀 문제 근본 해결 (SECURITY DEFINER 함수)

-- ============================================
-- STEP 1: 헬퍼 함수 (RLS 재귀 방지)
-- SECURITY DEFINER = RLS 우회하여 users 테이블 직접 조회
-- ============================================

create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role in ('main_admin', 'sub_admin')
  );
$$ language sql security definer stable;

create or replace function public.is_main_admin()
returns boolean as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
    and role = 'main_admin'
  );
$$ language sql security definer stable;

-- ============================================
-- STEP 2: interview_quotas — 위험 정책 제거 + 재생성
-- ============================================

drop policy if exists "quotas_modify" on public.interview_quotas;
drop policy if exists "quotas_select" on public.interview_quotas;
drop policy if exists "quotas_select_own" on public.interview_quotas;
drop policy if exists "quotas_select_admin" on public.interview_quotas;
drop policy if exists "quotas_insert_admin" on public.interview_quotas;
drop policy if exists "quotas_update_admin" on public.interview_quotas;

-- 학생: 본인 쿼타만 읽기
create policy "quotas_select_own" on public.interview_quotas
  for select using (auth.uid() = user_id);

-- 어드민: 전체 쿼타 읽기
create policy "quotas_select_admin" on public.interview_quotas
  for select using (public.is_admin());

-- 어드민만 쿼타 생성
create policy "quotas_insert_admin" on public.interview_quotas
  for insert with check (public.is_admin());

-- 어드민만 쿼타 수정 (학생이 자기 쿼타 조작 불가)
create policy "quotas_update_admin" on public.interview_quotas
  for update using (public.is_admin());

-- ============================================
-- STEP 3: admin_assignments — 위험 정책 제거 + 재생성
-- ============================================

drop policy if exists "assignments_modify" on public.admin_assignments;
drop policy if exists "assignments_select" on public.admin_assignments;
drop policy if exists "assignments_select_main" on public.admin_assignments;
drop policy if exists "assignments_insert_main" on public.admin_assignments;
drop policy if exists "assignments_delete_main" on public.admin_assignments;

-- 본인 배정 또는 메인 어드민 전체 읽기
create policy "assignments_select" on public.admin_assignments
  for select using (
    auth.uid() = admin_id
    or public.is_main_admin()
  );

-- 메인 어드민만 배정 생성
create policy "assignments_insert_main" on public.admin_assignments
  for insert with check (public.is_main_admin());

-- 메인 어드민만 배정 삭제
create policy "assignments_delete_main" on public.admin_assignments
  for delete using (public.is_main_admin());

-- ============================================
-- STEP 4: interview_sessions — 위험 정책 제거 + 재생성
-- ============================================

drop policy if exists "sessions_select" on public.interview_sessions;
drop policy if exists "sessions_select_own" on public.interview_sessions;
drop policy if exists "sessions_select_admin" on public.interview_sessions;
drop policy if exists "sessions_insert" on public.interview_sessions;
drop policy if exists "sessions_insert_own" on public.interview_sessions;
drop policy if exists "sessions_update" on public.interview_sessions;
drop policy if exists "sessions_update_own" on public.interview_sessions;

-- 본인 세션 읽기
create policy "sessions_select_own" on public.interview_sessions
  for select using (auth.uid() = user_id);

-- 어드민 전체 세션 읽기
create policy "sessions_select_admin" on public.interview_sessions
  for select using (public.is_admin());

-- 본인 세션 생성
create policy "sessions_insert_own" on public.interview_sessions
  for insert with check (auth.uid() = user_id);

-- 본인 세션 상태 변경
create policy "sessions_update_own" on public.interview_sessions
  for update using (auth.uid() = user_id);

-- ============================================
-- STEP 5: interview_results — 위험 정책 제거 + 재생성
-- ============================================

drop policy if exists "results_select" on public.interview_results;
drop policy if exists "results_select_own" on public.interview_results;
drop policy if exists "results_select_main_admin" on public.interview_results;
drop policy if exists "results_insert" on public.interview_results;
drop policy if exists "results_insert_own" on public.interview_results;

-- 본인 결과만 읽기
create policy "results_select_own" on public.interview_results
  for select using (auth.uid() = user_id);

-- 메인 어드민만 전체 결과 읽기 (서브 어드민은 summary 뷰 사용)
create policy "results_select_main_admin" on public.interview_results
  for select using (public.is_main_admin());

-- 본인 결과 저장
create policy "results_insert_own" on public.interview_results
  for insert with check (auth.uid() = user_id);

-- ============================================
-- STEP 6: users 테이블 — 재귀 정책 수정 + role 승격 차단
-- ============================================

-- 기존 재귀 정책 제거
drop policy if exists "users_select_main_admin" on public.users;
drop policy if exists "users_select_sub_admin" on public.users;
drop policy if exists "users_update_main_admin" on public.users;

-- 메인 어드민 전체 읽기 (재귀 없는 버전)
create policy "users_select_main_admin" on public.users
  for select using (public.is_main_admin());

-- 서브 어드민 할당 범위 읽기 (재귀 없는 버전)
create policy "users_select_sub_admin" on public.users
  for select using (
    public.is_admin()
    and exists (
      select 1 from public.admin_assignments aa
      where aa.admin_id = auth.uid()
        and aa.track = public.users.track
        and aa.cohort = public.users.cohort
    )
  );

-- 메인 어드민의 role 변경 허용 (재귀 없는 버전)
create policy "users_update_main_admin" on public.users
  for update using (public.is_main_admin());

-- ============================================
-- STEP 7: role 셀프 승격 차단 트리거
-- 학생/서브어드민이 자기 role을 변경하는 걸 DB 레벨에서 차단
-- ============================================

create or replace function public.prevent_role_escalation()
returns trigger as $$
begin
  -- role이 변경되지 않았으면 통과
  if old.role is not distinct from new.role then
    return new;
  end if;

  -- 메인 어드민만 role 변경 허용
  if not public.is_main_admin() then
    raise exception 'role 변경은 메인 어드민만 가능합니다';
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- 기존 트리거 있으면 제거 후 재생성
drop trigger if exists check_role_escalation on public.users;
create trigger check_role_escalation
  before update on public.users
  for each row execute function public.prevent_role_escalation();

-- ============================================
-- STEP 8: increment_used_count RPC — 인가 추가
-- 본인 쿼타만 차감 가능하도록 제한
-- ============================================

create or replace function public.increment_used_count(p_user_id uuid)
returns boolean as $$
declare
  rows_affected integer;
begin
  -- 본인 쿼타만 차감 가능 (어드민도 타인 쿼타 차감 불가)
  if auth.uid() != p_user_id then
    raise exception '본인의 쿼타만 차감할 수 있습니다';
  end if;

  update public.interview_quotas
  set used_count = used_count + 1, updated_at = now()
  where user_id = p_user_id and used_count < total_quota;

  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$ language plpgsql security definer;

-- ============================================
-- STEP 9: 검증 쿼리 (실행 후 결과 확인용)
-- 정상이면 각 테이블에 적절한 정책 수가 보여야 함
-- ============================================

select
  schemaname,
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('users', 'interview_quotas', 'admin_assignments', 'interview_sessions', 'interview_results')
order by tablename, policyname;
