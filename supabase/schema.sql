-- ============================================
-- AI 모의면접 서비스 DB 스키마
-- Supabase SQL Editor에서 실행
-- ============================================

-- 1. users 테이블
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  track text,
  cohort integer,
  role text not null default 'student' check (role in ('student', 'sub_admin', 'main_admin')),
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. admin_assignments 테이블
create table public.admin_assignments (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.users(id) on delete cascade,
  track text not null,
  cohort integer not null,
  assigned_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  unique(admin_id, track, cohort)
);

-- 3. interview_quotas 테이블
create table public.interview_quotas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade unique,
  total_quota integer not null default 0,
  used_count integer not null default 0,
  granted_by uuid references public.users(id),
  updated_at timestamptz not null default now()
);

-- 4. interview_sessions 테이블
create table public.interview_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  track text not null,
  question_count integer not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'abandoned')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

-- 5. interview_results 테이블
create table public.interview_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade unique,
  user_id uuid not null references public.users(id) on delete cascade,
  report_json jsonb not null,
  overall_score integer,
  grade text,
  overall_pass boolean,
  created_at timestamptz not null default now()
);

-- 6. user_documents 테이블
create table public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  doc_type text not null check (doc_type in ('resume', 'portfolio')),
  file_name text,
  file_path text not null,
  file_size integer,
  extracted_text text,
  uploaded_at timestamptz not null default now()
);

-- 7. 서브 어드민용 요약 뷰 (리포트 상세 제외)
create view public.interview_results_summary as
select
  ir.id,
  ir.session_id,
  ir.user_id,
  ir.overall_score,
  ir.grade,
  ir.overall_pass,
  ir.created_at,
  iss.track,
  iss.question_count,
  u.name as user_name,
  u.track as user_track,
  u.cohort as user_cohort
from public.interview_results ir
join public.interview_sessions iss on iss.id = ir.session_id
join public.users u on u.id = ir.user_id;

-- ============================================
-- RLS 정책
-- ============================================

alter table public.users enable row level security;
alter table public.admin_assignments enable row level security;
alter table public.interview_quotas enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.interview_results enable row level security;
alter table public.user_documents enable row level security;

-- users: 본인 읽기
create policy "users_select_own" on public.users
  for select using (auth.uid() = id);

-- users: main_admin 전체 읽기
create policy "users_select_main_admin" on public.users
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

-- users: sub_admin 할당 범위 읽기
create policy "users_select_sub_admin" on public.users
  for select using (
    exists (
      select 1 from public.admin_assignments aa
      join public.users me on me.id = auth.uid() and me.role = 'sub_admin'
      where aa.admin_id = auth.uid()
        and aa.track = public.users.track
        and aa.cohort = public.users.cohort
    )
  );

-- users: 본인 생성
create policy "users_insert_own" on public.users
  for insert with check (auth.uid() = id);

-- users: 본인 프로필 수정
create policy "users_update_own" on public.users
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- users: main_admin이 role 변경
create policy "users_update_main_admin" on public.users
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

-- interview_sessions: 본인
create policy "sessions_select_own" on public.interview_sessions
  for select using (auth.uid() = user_id);

create policy "sessions_select_admin" on public.interview_sessions
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('main_admin', 'sub_admin'))
  );

create policy "sessions_insert_own" on public.interview_sessions
  for insert with check (auth.uid() = user_id);

create policy "sessions_update_own" on public.interview_sessions
  for update using (auth.uid() = user_id);

-- interview_results: 본인 + main_admin만
create policy "results_select_own" on public.interview_results
  for select using (auth.uid() = user_id);

create policy "results_select_main_admin" on public.interview_results
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

create policy "results_insert_own" on public.interview_results
  for insert with check (auth.uid() = user_id);

-- interview_quotas: 본인 읽기
create policy "quotas_select_own" on public.interview_quotas
  for select using (auth.uid() = user_id);

-- interview_quotas: 어드민 읽기/쓰기
create policy "quotas_select_admin" on public.interview_quotas
  for select using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('main_admin', 'sub_admin'))
  );

create policy "quotas_insert_admin" on public.interview_quotas
  for insert with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('main_admin', 'sub_admin'))
  );

create policy "quotas_update_admin" on public.interview_quotas
  for update using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role in ('main_admin', 'sub_admin'))
  );

-- user_documents: 본인만
create policy "docs_select_own" on public.user_documents
  for select using (auth.uid() = user_id);

create policy "docs_insert_own" on public.user_documents
  for insert with check (auth.uid() = user_id);

create policy "docs_update_own" on public.user_documents
  for update using (auth.uid() = user_id);

create policy "docs_delete_own" on public.user_documents
  for delete using (auth.uid() = user_id);

-- admin_assignments: main_admin만 관리
create policy "assignments_select" on public.admin_assignments
  for select using (
    auth.uid() = admin_id
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

create policy "assignments_insert_main" on public.admin_assignments
  for insert with check (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

create policy "assignments_delete_main" on public.admin_assignments
  for delete using (
    exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'main_admin')
  );

-- ============================================
-- 인덱스
-- ============================================
create index idx_sessions_user_id on public.interview_sessions(user_id);
create index idx_results_user_id on public.interview_results(user_id);
create index idx_results_session_id on public.interview_results(session_id);
create index idx_users_track_cohort on public.users(track, cohort);
create index idx_docs_user_id on public.user_documents(user_id);

-- ============================================
-- 자동 user 생성 트리거 (Google 로그인 시)
-- ============================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );
  -- 쿼타 레코드도 자동 생성 (0회)
  insert into public.interview_quotas (user_id, total_quota, used_count)
  values (new.id, 0, 0);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
