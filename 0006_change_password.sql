-- ============================================================================
-- 0006_change_password.sql — ให้ผู้ใช้เปลี่ยนรหัสผ่านเองได้
-- ตรวจรหัสเดิม (รองรับทั้งแบบเก่า salt+sha256 และ bcrypt) แล้วตั้งรหัสใหม่เป็น bcrypt
-- ============================================================================
create or replace function public.app_change_password(p_token uuid, p_old text, p_new text)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_ok boolean;
begin
  v := app._auth(p_token);
  if v.salt is not null and v.salt <> '' then
    v_ok := (v.pass_hash = encode(digest(v.salt || '::' || p_old, 'sha256'), 'hex'));
  else
    v_ok := (v.pass_hash = crypt(p_old, v.pass_hash));
  end if;
  if not v_ok then raise exception 'wrong_old_password'; end if;
  if length(coalesce(p_new,'')) < 6 then raise exception 'password_too_short'; end if;
  update app.users set pass_hash = crypt(p_new, gen_salt('bf')), salt = null where id = v.id;
  return json_build_object('ok', true);
end $$;
grant execute on function public.app_change_password(uuid,text,text) to anon;
notify pgrst, 'reload schema';
