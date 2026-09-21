-- ============================================================================
-- 0003_migrate_users.sql — รองรับรหัสผ่านเดิม + ฟังก์ชันนำเข้าผู้ใช้ + ทีม Makro/Lotus
-- รหัสผ่านเดิมใช้สูตร  SHA-256( salt || '::' || password )  (hex ตัวเล็ก)
-- ผู้ใช้เดิมจึงล็อกอินด้วยรหัสเดิมได้ ไม่ต้องรีเซ็ต
-- ============================================================================

-- คอลัมน์ salt (ว่าง = ใช้ bcrypt แบบใหม่)
alter table app.users add column if not exists salt text;

-- ทีมเพิ่ม (Center มีแล้วจาก 0002)
insert into app.teams (id, name, sort) values
  ('22222222-2222-2222-2222-222222222222', 'Makro', 2),
  ('33333333-3333-3333-3333-333333333333', 'Lotus', 3)
on conflict (id) do nothing;

-- app_login รองรับทั้งรหัสเดิม (salt+sha256) และรหัสใหม่ (bcrypt)
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
    'user', json_build_object('email', v_user.email, 'name', v_user.name, 'role', v_user.role, 'team_id', v_user.team_id));
end $$;

-- นำเข้าผู้ใช้จากระบบเดิม (admin เท่านั้น) — เก็บ salt+hash เดิมไว้ตรง ๆ
create or replace function public.app_admin_import_user(p_token uuid, p_email text, p_name text, p_salt text, p_hash text, p_team text)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token);
  if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case
    when p_team = 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
    when p_team = 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
    else '11111111-1111-1111-1111-111111111111'::uuid end;
  insert into app.users (email, pass_hash, salt, name, role, team_id)
    values (lower(p_email), p_hash, p_salt, coalesce(nullif(p_name,''), split_part(p_email,'@',1)), 'agent', v_team)
  on conflict (email) do update set
    pass_hash = excluded.pass_hash, salt = excluded.salt,
    name = excluded.name, team_id = excluded.team_id;   -- ไม่แตะ role ของแอดมินเดิม
  return json_build_object('email', lower(p_email), 'team', p_team);
end $$;

grant execute on function public.app_login(text,text,text)                                     to anon;
grant execute on function public.app_admin_import_user(uuid,text,text,text,text,text)           to anon;

notify pgrst, 'reload schema';
