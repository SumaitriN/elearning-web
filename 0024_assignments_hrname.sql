-- ============================================================================
-- 0024_assignments_hrname.sql — หน้ามอบหมายงานใช้ชื่อจาก HR + employee_id
-- ============================================================================

create or replace function public.app_admin_assignments(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',app._dname(u),'team',t.name,
            'employee_id', u.employee_id,
            'item_type',a.item_type,
            'item',case when a.item_type='lesson' then (select title from app.lessons where id=a.item_id)
                        else (select title from app.quizzes where id=a.item_id) end,
            'due',a.due,'created',a.created_at) order by a.created_at desc), '[]')
          from app.assignments a join app.users u on u.id = a.user_id left join app.teams t on t.id = u.team_id
          where (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

notify pgrst, 'reload schema';
