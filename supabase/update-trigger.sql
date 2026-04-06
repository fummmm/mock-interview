-- 모든 가입자에게 초기 쿼타 5회 부여
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
  values (new.id, 5, 0);

  return new;
end;
$$ language plpgsql security definer;
