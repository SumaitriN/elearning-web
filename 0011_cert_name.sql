-- ============================================================================
-- 0011_cert_name.sql — ใบประกาศ: แก้ชื่อผู้รับได้ (เก็บชื่อบนใบประกาศแยกจากชื่อบัญชี)
-- ============================================================================
alter table app.certificates add column if not exists name text;

drop function if exists public.app_admin_issue_cert(uuid,uuid,text);
create or replace function public.app_admin_issue_cert(p_token uuid, p_user_id uuid, p_title text, p_name text default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_no int; v_date date; v_name text;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_name := coalesce(nullif(trim(p_name), ''), (select coalesce(name, email) from app.users where id = p_user_id));
  insert into app.certificates (user_id, title, name, issued_by)
    values (p_user_id, p_title, v_name, v.id) returning no, issued_date into v_no, v_date;
  return json_build_object('no', v_no, 'name', v_name, 'title', p_title, 'date', v_date);
end $$;

create or replace function public.app_admin_certs(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('no',c.no,'name',coalesce(c.name,u.name,u.email),
            'email',u.email,'title',c.title,'date',c.issued_date) order by c.no desc), '[]')
          from app.certificates c join app.users u on u.id = c.user_id);
end $$;

grant execute on function public.app_admin_issue_cert(uuid,uuid,text,text) to anon;
grant execute on function public.app_admin_certs(uuid)                    to anon;
notify pgrst, 'reload schema';
