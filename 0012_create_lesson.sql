-- ============================================================================
-- 0012_create_lesson.sql — สร้างบทเรียนใหม่ (แอดมิน/ทีมเพิ่มเนื้อหาได้)
-- ============================================================================
create or replace function public.app_admin_create_lesson(p_token uuid, p_team text, p_title text, p_section text)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid; v_id uuid;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  insert into app.lessons (team_id, title, section, "order")
    values (v_team, p_title, p_section, (select coalesce(max("order"),0)+1 from app.lessons where team_id = v_team))
    returning id into v_id;
  return json_build_object('id', v_id, 'title', p_title);
end $$;
grant execute on function public.app_admin_create_lesson(uuid,text,text,text) to anon;
notify pgrst, 'reload schema';
