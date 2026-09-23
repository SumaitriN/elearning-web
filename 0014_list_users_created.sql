-- ============================================================================
-- 0014_list_users_created.sql — เพิ่มวันที่สร้างบัญชี (created) ในรายชื่อผู้ใช้
--   ใช้กับหน้ามอบหมายงาน: ปุ่มลัด "สร้างวันนี้" / "คนใหม่ 7 วัน"
-- ============================================================================
create or replace function public.app_admin_list_users(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('id',id,'email',email,'name',name,'role',role,
            'team_id',team_id,'team',(select name from app.teams t where t.id = u.team_id),
            'created',created_at) order by email), '[]')
          from app.users u where (p_team is null or team_id = p_team));
end $$;
grant execute on function public.app_admin_list_users(uuid,uuid) to anon;
notify pgrst, 'reload schema';
