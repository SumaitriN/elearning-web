-- ============================================================================
-- 0023_progress_empid.sql — เพิ่ม employee_id ในหน้าความคืบหน้า
-- ============================================================================

create or replace function public.app_admin_progress(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',app._dname(u),'team',t.name,
            'employee_id', u.employee_id,
            'lessons_done',(select count(*) from app.lesson_progress lp where lp.user_id=u.id and lp.status='done'),
            'lessons_total',(select count(*) from app.lessons l where l.team_id=u.team_id),
            'quizzes_passed',(select count(distinct a.quiz_id) from app.attempts a where a.user_id=u.id and a.pass),
            'quizzes_total',(select count(*) from app.quizzes q where q.team_id=u.team_id)
          ) order by u.name), '[]')
          from app.users u left join app.teams t on t.id=u.team_id
          where u.role='agent' and (p_team is null or u.team_id=p_team)
            and (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

notify pgrst, 'reload schema';
