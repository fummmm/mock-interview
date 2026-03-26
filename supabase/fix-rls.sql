-- ============================================
-- RLS 재귀 문제 수정
-- users 테이블을 참조하는 정책을 단순화
-- ============================================

-- quotas: 기존 정책 삭제 후 단순화
drop policy if exists "quotas_select_own" on public.interview_quotas;
drop policy if exists "quotas_select_admin" on public.interview_quotas;
drop policy if exists "quotas_insert_admin" on public.interview_quotas;
drop policy if exists "quotas_update_admin" on public.interview_quotas;

create policy "quotas_select" on public.interview_quotas
  for select using (auth.uid() = user_id or auth.role() = 'authenticated');

create policy "quotas_modify" on public.interview_quotas
  for all using (auth.role() = 'authenticated');

-- sessions: 기존 정책 삭제 후 단순화
drop policy if exists "sessions_select_own" on public.interview_sessions;
drop policy if exists "sessions_select_admin" on public.interview_sessions;
drop policy if exists "sessions_insert_own" on public.interview_sessions;
drop policy if exists "sessions_update_own" on public.interview_sessions;

create policy "sessions_select" on public.interview_sessions
  for select using (auth.uid() = user_id or auth.role() = 'authenticated');

create policy "sessions_insert" on public.interview_sessions
  for insert with check (auth.uid() = user_id);

create policy "sessions_update" on public.interview_sessions
  for update using (auth.uid() = user_id);

-- results: 기존 정책 삭제 후 단순화
drop policy if exists "results_select_own" on public.interview_results;
drop policy if exists "results_select_main_admin" on public.interview_results;
drop policy if exists "results_insert_own" on public.interview_results;

create policy "results_select" on public.interview_results
  for select using (auth.uid() = user_id or auth.role() = 'authenticated');

create policy "results_insert" on public.interview_results
  for insert with check (auth.uid() = user_id);

-- assignments: 기존 정책 삭제 후 단순화
drop policy if exists "assignments_select" on public.admin_assignments;
drop policy if exists "assignments_insert_main" on public.admin_assignments;
drop policy if exists "assignments_delete_main" on public.admin_assignments;

create policy "assignments_select" on public.admin_assignments
  for select using (auth.role() = 'authenticated');

create policy "assignments_modify" on public.admin_assignments
  for all using (auth.role() = 'authenticated');
