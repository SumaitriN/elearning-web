-- ============================================================================
-- 0020_dgs_employees.sql — ชื่อพนักงานจาก dgs-core (import ครั้งเดียว) + จับคู่ด้วย email
--   • app.users.employee_id : รหัสพนักงาน (key เดียวกับ dgs-core)
--   • app.dgs_employees      : สำเนาชื่อพนักงานจาก dgs-core (employee_id, name_th/en, email, status)
--   • app_admin_sync_employees : upsert ข้อมูลพนักงาน (admin)
--   • app_admin_link_employees : จับคู่ผู้ใช้ LMS ↔ พนักงาน ด้วย email (admin)
--   • ชื่อที่แสดงในระบบ ให้ความสำคัญกับชื่อจาก dgs-core (app._dname)
-- ============================================================================

alter table app.users add column if not exists employee_id text;

create table if not exists app.dgs_employees (
  employee_id text primary key,
  email       text,
  name_th     text,
  name_en     text,
  nickname    text,
  status      text,
  synced_at   timestamptz default now()
);
alter table app.dgs_employees enable row level security;
create index if not exists dgs_employees_email_idx on app.dgs_employees (lower(email));

-- ชื่อที่จะแสดง: ให้ความสำคัญกับชื่อจาก dgs-core (th → en → ชื่อเล่น) ไม่เจอค่อย fallback ชื่อเดิม
create or replace function app._dname(v app.users)
returns text language sql security definer set search_path = app stable as $$
  select coalesce(
    (select nullif(trim(e.name_th),'')   from app.dgs_employees e where e.employee_id = v.employee_id),
    (select nullif(trim(e.name_en),'')   from app.dgs_employees e where e.employee_id = v.employee_id),
    (select nullif(trim(e.nickname),'')  from app.dgs_employees e where e.employee_id = v.employee_id),
    nullif(trim(v.name),''), v.email)
$$;

-- ---------- login: ใช้ชื่อจาก dgs-core (ยังรองรับทั้ง salt+sha256 และ bcrypt) ----------
create or replace function public.app_login(p_device text, p_email text, p_password text)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v_user app.users; v_token uuid; v_ok boolean;
begin
  select * into v_user from app.users where lower(email) = lower(p_email);
  if v_user.id is null then raise exception 'invalid_credentials'; end if;
  if v_user.salt is not null and v_user.salt <> '' then
    v_ok := (v_user.pass_hash = encode(digest(v_user.salt || '::' || p_password, 'sha256'), 'hex'));
  else
    v_ok := (v_user.pass_hash = crypt(p_password, v_user.pass_hash));
  end if;
  if not v_ok then raise exception 'invalid_credentials'; end if;
  insert into app.sessions (user_id, device_token, expires_at)
    values (v_user.id, p_device, now() + interval '8 hours') returning token into v_token;
  return json_build_object('token', v_token,
    'user', json_build_object('email', v_user.email, 'name', app._dname(v_user), 'role', v_user.role,
      'team_id', v_user.team_id, 'employee_id', v_user.employee_id,
      'teams', (select coalesce(json_agg(json_build_object('id',t.id,'name',t.name) order by t.sort), '[]')
                from app.teams t where t.id in (select app._teams(v_user)))));
end $$;

create or replace function public.app_me(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin v := app._auth(p_token);
  return json_build_object('email', v.email, 'name', app._dname(v), 'role', v.role, 'team_id', v.team_id,
    'employee_id', v.employee_id,
    'teams', (select coalesce(json_agg(json_build_object('id',t.id,'name',t.name) order by t.sort), '[]')
              from app.teams t where t.id in (select app._teams(v))));
end $$;

-- ---------- รายชื่อผู้ใช้: เพิ่ม employee_id + ชื่อจาก HR ----------
create or replace function public.app_admin_list_users(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('id',id,'email',email,'name',name,'role',role,
            'team_id',team_id,'team',(select name from app.teams t where t.id = u.team_id),
            'teams',(select coalesce(json_agg(ut.team_id), '[]') from app.user_teams ut where ut.user_id = u.id),
            'employee_id', employee_id,
            'hr_name', (select coalesce(nullif(trim(e.name_th),''), nullif(trim(e.name_en),''), e.nickname)
                        from app.dgs_employees e where e.employee_id = u.employee_id),
            'created',created_at) order by email), '[]')
          from app.users u where (p_team is null or team_id = p_team
                                   or exists(select 1 from app.user_teams ut where ut.user_id=u.id and ut.team_id=p_team)));
end $$;

-- ---------- ความคืบหน้า: ใช้ชื่อจาก HR ----------
create or replace function public.app_admin_progress(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',app._dname(u),'team',t.name,
            'lessons_done',(select count(*) from app.lesson_progress lp where lp.user_id=u.id and lp.status='done'),
            'lessons_total',(select count(*) from app.lessons l where l.team_id=u.team_id),
            'quizzes_passed',(select count(distinct a.quiz_id) from app.attempts a where a.user_id=u.id and a.pass),
            'quizzes_total',(select count(*) from app.quizzes q where q.team_id=u.team_id)
          ) order by u.name), '[]')
          from app.users u left join app.teams t on t.id=u.team_id
          where u.role='agent' and (p_team is null or u.team_id=p_team)
            and (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

-- ---------- import ข้อมูลพนักงานจาก dgs-core (admin) ----------
-- p_rows = array ของ {employee_id, email, name_th, name_en, nickname, status}
create or replace function public.app_admin_sync_employees(p_token uuid, p_rows jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; r jsonb; n int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    insert into app.dgs_employees (employee_id, email, name_th, name_en, nickname, status, synced_at)
      values (r->>'employee_id', lower(r->>'email'), r->>'name_th', r->>'name_en', r->>'nickname', r->>'status', now())
    on conflict (employee_id) do update set
      email=excluded.email, name_th=excluded.name_th, name_en=excluded.name_en,
      nickname=excluded.nickname, status=excluded.status, synced_at=now();
    n := n + 1;
  end loop;
  return json_build_object('upserted', n, 'total', (select count(*) from app.dgs_employees));
end $$;

-- ---------- จับคู่ผู้ใช้ LMS ↔ พนักงาน ด้วย email (admin) ----------
create or replace function public.app_admin_link_employees(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; n int;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  update app.users u set employee_id = e.employee_id
    from app.dgs_employees e
    where lower(u.email) = lower(e.email)
      and (u.employee_id is null or u.employee_id is distinct from e.employee_id);
  get diagnostics n = row_count;
  return json_build_object('linked', n,
    'total_linked', (select count(*) from app.users where employee_id is not null),
    'total_users',  (select count(*) from app.users));
end $$;

grant execute on function public.app_admin_sync_employees(uuid,jsonb) to anon;
grant execute on function public.app_admin_link_employees(uuid)       to anon;

notify pgrst, 'reload schema';
