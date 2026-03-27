-- 쿼타 atomic 차감 (race condition 방지)
create or replace function public.increment_used_count(p_user_id uuid)
returns boolean as $$
declare
  rows_affected integer;
begin
  update public.interview_quotas
  set used_count = used_count + 1, updated_at = now()
  where user_id = p_user_id and used_count < total_quota;

  get diagnostics rows_affected = row_count;
  return rows_affected > 0;
end;
$$ language plpgsql security definer;
