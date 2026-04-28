-- 가입 시 쿼타 0으로 생성 (관리자가 직접 부여)
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.users (id, email, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.interview_quotas (user_id, total_quota, used_count)
  values (new.id, 0, 0);

  return new;
end;
$$ language plpgsql security definer;
