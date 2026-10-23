-- ============================================================================
-- 0021_user_active.sql — ปิดใช้งานบัญชีคนที่ออกจากบริษัทแล้ว
--   • app.users.active : true=ใช้งานได้, false=ปิดใช้งาน (ล็อกอินไม่ได้)
--   • app_login        : บล็อกคนที่ active=false
--   • app_admin_link_employees : จับคู่ email แล้วปิดใช้งานอัตโนมัติถ้า dgs-core status='inactive'
--                                (ปิดอย่างเดียว ไม่เปิดคืนอัตโนมัติ — ให้ admin เปิดเอง)
--   • app_admin_set_active : admin เปิด/ปิดใช้งานเอง
--   • app_admin_list_users : คืน active + hr_status ด้วย
-- ============================================================================

alter table app.users add column if not exists active boolean not null default true;

-- ---------- login: บล็อกบัญชีที่ถูกปิดใช้งาน (ยังรองรับ salt+sha256 / bcrypt + ชื่อจาก HR) ----------
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
  if not v_user.active then raise exception 'account_disabled'; end if;
  insert into app.sessions (user_id, device_token, expires_at)
    values (v_user.id, p_device, now() + interval '8 hours') returning token into v_token;
  return json_build_object('token', v_token,
    'user', json_build_object('email', v_user.email, 'name', app._dname(v_user), 'role', v_user.role,
      'team_id', v_user.team_id, 'employee_id', v_user.employee_id,
      'teams', (select coalesce(json_agg(json_build_object('id',t.id,'name',t.name) order by t.sort), '[]')
                from app.teams t where t.id in (select app._teams(v_user)))));
end $$;

-- ---------- รายชื่อผู้ใช้: เพิ่ม active + hr_status ----------
create or replace function public.app_admin_list_users(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('id',id,'email',email,'name',name,'role',role,
            'team_id',team_id,'team',(select name from app.teams t where t.id = u.team_id),
            'teams',(select coalesce(json_agg(ut.team_id), '[]') from app.user_teams ut where ut.user_id = u.id),
            'employee_id', employee_id, 'active', active,
            'hr_name', (select coalesce(nullif(trim(e.name_th),''), nullif(trim(e.name_en),''), e.nickname)
                        from app.dgs_employees e where e.employee_id = u.employee_id),
            'hr_status', (select e.status from app.dgs_employees e where e.employee_id = u.employee_id),
            'created',created_at) order by email), '[]')
          from app.users u where (p_team is null or team_id = p_team
                                   or exists(select 1 from app.user_teams ut where ut.user_id=u.id and ut.team_id=p_team)));
end $$;

-- ---------- จับคู่ email + ปิดใช้งานคนที่ออกแล้วอัตโนมัติ ----------
create or replace function public.app_admin_link_employees(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; n_link int; n_off int;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  -- 1) จับคู่ด้วยอีเมล
  update app.users u set employee_id = e.employee_id
    from app.dgs_employees e
    where lower(u.email) = lower(e.email)
      and (u.employee_id is null or u.employee_id is distinct from e.employee_id);
  get diagnostics n_link = row_count;
  -- 2) ปิดใช้งานคนที่ออกแล้ว (dgs status='inactive') — ปิดอย่างเดียว ไม่เปิดคืนเอง / ไม่แตะ admin
  update app.users u set active = false
    from app.dgs_employees e
    where u.employee_id = e.employee_id and e.status = 'inactive'
      and u.active and u.role <> 'admin';
  get diagnostics n_off = row_count;
  return json_build_object('linked', n_link, 'deactivated', n_off,
    'total_linked', (select count(*) from app.users where employee_id is not null),
    'total_active', (select count(*) from app.users where active),
    'total_users',  (select count(*) from app.users));
end $$;

-- ---------- admin เปิด/ปิดใช้งานเอง ----------
create or replace function public.app_admin_set_active(p_token uuid, p_user_id uuid, p_active boolean)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  if p_user_id = v.id and not p_active then raise exception 'cannot_disable_self'; end if;
  update app.users set active = p_active where id = p_user_id;
  return json_build_object('ok', true, 'active', p_active);
end $$;

grant execute on function public.app_admin_set_active(uuid,uuid,boolean) to anon;

notify pgrst, 'reload schema';
