-- ============================================================================
-- 0010_typing.sql — ข้อสอบพิมพ์ดีด (typing test): ตาราง + ฟังก์ชัน + นำเข้าผลเก่า
-- ============================================================================
create table if not exists app.typing_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references app.users(id) on delete cascade,
  set_id text, lang text, wpm int, acc int, chars int, secs numeric, name text,
  created_at timestamptz default now());
alter table app.typing_results enable row level security;

-- ผู้ใช้ส่งผลพิมพ์ดีด
create or replace function public.app_typing_submit(p_token uuid, p_set text, p_lang text, p_wpm int, p_acc int, p_chars int, p_secs numeric)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_best int;
begin
  v := app._auth(p_token);
  insert into app.typing_results (user_id, set_id, lang, wpm, acc, chars, secs, name)
    values (v.id, p_set, p_lang, greatest(p_wpm,0), greatest(least(p_acc,100),0), p_chars, p_secs, coalesce(v.name,v.email));
  select max(wpm) into v_best from app.typing_results where user_id = v.id and set_id = p_set;
  return json_build_object('best', v_best);
end $$;

-- ผลที่ดีที่สุดของฉัน (ต่อชุด)
create or replace function public.app_typing_mine(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  return (select coalesce(json_agg(r), '[]') from
    (select set_id as "set", max(wpm) as wpm, max(acc) as acc, count(*) as tries
     from app.typing_results where user_id = v.id group by set_id) r);
end $$;

-- ผลทั้งหมด (แอดมิน)
create or replace function public.app_admin_typing(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('name',coalesce(u.name,u.email),'email',u.email,
            'set',t.set_id,'lang',t.lang,'wpm',t.wpm,'acc',t.acc,'created',t.created_at) order by t.created_at desc), '[]')
          from app.typing_results t join app.users u on u.id = t.user_id);
end $$;

-- นำเข้าผลพิมพ์ดีดเก่า (แอดมิน, idempotent)
create or replace function public.app_admin_import_typing(p_token uuid, p_rows jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; r jsonb; uid uuid; n int := 0; skipped int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  delete from app.typing_results;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into uid from app.users where lower(email) = lower(r->>'email');
    if uid is null then skipped := skipped + 1; continue; end if;
    insert into app.typing_results (user_id, set_id, lang, wpm, acc, chars, secs, name, created_at)
      values (uid, r->>'set', r->>'lang', nullif(r->>'wpm','')::int, nullif(r->>'acc','')::int,
              nullif(r->>'chars','')::int, nullif(r->>'secs','')::numeric, r->>'name',
              coalesce(nullif(r->>'created','')::timestamptz, now()));
    n := n + 1;
  end loop;
  return json_build_object('imported', n, 'skipped', skipped);
end $$;

grant execute on function public.app_typing_submit(uuid,text,text,int,int,int,numeric) to anon;
grant execute on function public.app_typing_mine(uuid)                                  to anon;
grant execute on function public.app_admin_typing(uuid)                                 to anon;
grant execute on function public.app_admin_import_typing(uuid,jsonb)                    to anon;
notify pgrst, 'reload schema';
