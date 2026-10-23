-- ============================================================================
-- 0022_delete_cert.sql — ลบใบประกาศ (กรณีออกผิด)
--   admin ลบได้ทั้งหมด · team_leader ลบได้เฉพาะใบของคนในทีมตน
-- ============================================================================

create or replace function public.app_admin_delete_cert(p_token uuid, p_no int)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (
      select 1 from app.certificates c join app.users u on u.id = c.user_id
      where c.no = p_no and u.team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  delete from app.certificates where no = p_no;
  return json_build_object('ok', true, 'no', p_no);
end $$;

grant execute on function public.app_admin_delete_cert(uuid,int) to anon;

notify pgrst, 'reload schema';
