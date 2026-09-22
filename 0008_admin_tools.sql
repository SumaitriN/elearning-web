-- ============================================================================
-- 0008_admin_tools.sql — เครื่องมือแอดมินครบชุด
-- มอบหมายงาน · ความคืบหน้า · ใบประกาศ · จัดการบทเรียน · จัดการผู้ใช้ (เต็ม)
-- ============================================================================

-- ---------- รายชื่อผู้ใช้ (สำหรับมอบหมาย/จัดการ) ----------
create or replace function public.app_admin_list_users(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('id',id,'email',email,'name',name,'role',role,
            'team_id',team_id,'team',(select name from app.teams t where t.id = u.team_id)) order by email), '[]')
          from app.users u where (p_team is null or team_id = p_team));
end $$;

-- ---------- มอบหมายงาน ----------
create or replace function public.app_admin_assign(p_token uuid, p_item_type text, p_item_id uuid, p_user_ids jsonb, p_due date default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; uid jsonb; n int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  for uid in select * from jsonb_array_elements(p_user_ids) loop
    insert into app.assignments (user_id, item_type, item_id, assigned_by, due)
      values ((uid #>> '{}')::uuid, p_item_type, p_item_id, v.id, p_due)
    on conflict (user_id, item_type, item_id) do update set due = excluded.due, assigned_by = excluded.assigned_by;
    n := n + 1;
  end loop;
  return json_build_object('assigned', n);
end $$;

create or replace function public.app_admin_assignments(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',u.name,'team',t.name,
            'item_type',a.item_type,
            'item',case when a.item_type='lesson' then (select title from app.lessons where id=a.item_id)
                        else (select title from app.quizzes where id=a.item_id) end,
            'due',a.due,'created',a.created_at) order by a.created_at desc), '[]')
          from app.assignments a join app.users u on u.id = a.user_id left join app.teams t on t.id = u.team_id);
end $$;

-- ---------- ความคืบหน้า (เรียน + สอบ) ----------
create or replace function public.app_admin_progress(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',u.name,'team',t.name,
            'lessons_done',(select count(*) from app.lesson_progress lp where lp.user_id=u.id and lp.status='done'),
            'lessons_total',(select count(*) from app.lessons l where l.team_id=u.team_id),
            'quizzes_passed',(select count(distinct a.quiz_id) from app.attempts a where a.user_id=u.id and a.pass),
            'quizzes_total',(select count(*) from app.quizzes q where q.team_id=u.team_id)
          ) order by u.name), '[]')
          from app.users u left join app.teams t on t.id=u.team_id
          where u.role='agent' and (p_team is null or u.team_id=p_team));
end $$;

-- ---------- ใบประกาศ ----------
create or replace function public.app_admin_issue_cert(p_token uuid, p_user_id uuid, p_title text)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_no int; v_date date; v_name text;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  insert into app.certificates (user_id, title, issued_by) values (p_user_id, p_title, v.id)
    returning no, issued_date into v_no, v_date;
  select coalesce(name, email) into v_name from app.users where id = p_user_id;
  return json_build_object('no', v_no, 'name', v_name, 'title', p_title, 'date', v_date);
end $$;

create or replace function public.app_admin_certs(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('no',c.no,'name',coalesce(u.name,u.email),
            'email',u.email,'title',c.title,'date',c.issued_date) order by c.no desc), '[]')
          from app.certificates c join app.users u on u.id = c.user_id);
end $$;

-- ---------- จัดการผู้ใช้ (เต็ม) ----------
create or replace function public.app_admin_reset_password(p_token uuid, p_user_id uuid, p_new text)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  if length(coalesce(p_new,'')) < 6 then raise exception 'password_too_short'; end if;
  update app.users set pass_hash = crypt(p_new, gen_salt('bf')), salt = null where id = p_user_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.app_admin_delete_user(p_token uuid, p_user_id uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  if p_user_id = v.id then raise exception 'cannot_delete_self'; end if;
  delete from app.users where id = p_user_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.app_admin_set_user(p_token uuid, p_user_id uuid, p_name text, p_role text, p_team uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  update app.users set name = p_name, role = coalesce(p_role, role), team_id = p_team where id = p_user_id;
  return json_build_object('ok', true);
end $$;

-- ---------- จัดการบทเรียน ----------
create or replace function public.app_admin_update_lesson(p_token uuid, p_lesson_id uuid, p_title text, p_section text, p_order int)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  update app.lessons set title = p_title, section = p_section, "order" = coalesce(p_order,0) where id = p_lesson_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.app_admin_delete_lesson(p_token uuid, p_lesson_id uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  delete from app.lessons where id = p_lesson_id;
  return json_build_object('ok', true);
end $$;

grant execute on function public.app_admin_list_users(uuid,uuid)                       to anon;
grant execute on function public.app_admin_assign(uuid,text,uuid,jsonb,date)           to anon;
grant execute on function public.app_admin_assignments(uuid)                           to anon;
grant execute on function public.app_admin_progress(uuid,uuid)                         to anon;
grant execute on function public.app_admin_issue_cert(uuid,uuid,text)                  to anon;
grant execute on function public.app_admin_certs(uuid)                                 to anon;
grant execute on function public.app_admin_reset_password(uuid,uuid,text)              to anon;
grant execute on function public.app_admin_delete_user(uuid,uuid)                      to anon;
grant execute on function public.app_admin_set_user(uuid,uuid,text,text,uuid)          to anon;
grant execute on function public.app_admin_update_lesson(uuid,uuid,text,text,int)      to anon;
grant execute on function public.app_admin_delete_lesson(uuid,uuid)                    to anon;
notify pgrst, 'reload schema';
