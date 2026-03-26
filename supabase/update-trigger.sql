-- 기존 트리거 함수 교체: @teamsparta.co 이메일이면 쿼타 3, 나머지 0
create or replace function public.handle_new_user()
returns trigger as $$
declare
  initial_quota integer := 0;
begin
  -- @teamsparta.co 이메일이면 3회 부여
  if new.email like '%@teamsparta.co' then
    initial_quota := 3;
  end if;

  insert into public.users (id, email, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.interview_quotas (user_id, total_quota, used_count)
  values (new.id, initial_quota, 0);

  return new;
end;
$$ language plpgsql security definer;
