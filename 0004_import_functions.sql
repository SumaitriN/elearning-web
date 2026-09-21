-- ============================================================================
-- 0004_import_functions.sql — ฟังก์ชันนำเข้าข้อสอบ + บทเรียน จากระบบเดิม (admin)
-- ============================================================================

-- นำเข้าข้อสอบทั้งชุด (idempotent: มีอยู่แล้ว = ล้างคำถามเก่าแล้วใส่ใหม่)
create or replace function public.app_admin_import_quiz_full(
  p_token uuid, p_team text, p_title text, p_minutes int, p_pass int, p_questions jsonb)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_team uuid; v_quiz uuid; q jsonb; i int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  select id into v_quiz from app.quizzes where team_id = v_team and title = p_title limit 1;
  if v_quiz is null then
    insert into app.quizzes (team_id, title, minutes, pass)
      values (v_team, p_title, coalesce(p_minutes,15), coalesce(p_pass,80)) returning id into v_quiz;
  else
    update app.quizzes set minutes = coalesce(p_minutes,15), pass = coalesce(p_pass,80) where id = v_quiz;
    delete from app.questions where quiz_id = v_quiz;
  end if;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    insert into app.questions (quiz_id, "order", question, choices, correct)
      values (v_quiz, i, q->>'q', coalesce(q->'choices','[]'::jsonb), coalesce((q->>'correct')::int, 0));
  end loop;
  return json_build_object('quiz', p_title, 'team', p_team, 'n', i);
end $$;

-- นำเข้าบทเรียนทั้งบท (idempotent ตาม team+title)
create or replace function public.app_admin_import_lesson_full(
  p_token uuid, p_team text, p_title text, p_section text, p_order int, p_blocks jsonb)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_team uuid; v_lesson uuid; b jsonb; i int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  select id into v_lesson from app.lessons where team_id = v_team and title = p_title limit 1;
  if v_lesson is null then
    insert into app.lessons (team_id, title, section, "order")
      values (v_team, p_title, p_section, coalesce(p_order,0)) returning id into v_lesson;
  else
    update app.lessons set section = p_section, "order" = coalesce(p_order,0) where id = v_lesson;
    delete from app.blocks where lesson_id = v_lesson;
  end if;
  for b in select * from jsonb_array_elements(p_blocks) loop
    i := i + 1;
    insert into app.blocks (lesson_id, "order", type, content, url, question, choices, answer, explain)
      values (v_lesson, i, coalesce(b->>'type','text'), b->>'content', b->>'url', b->>'question',
              coalesce(b->'choices','[]'::jsonb), nullif(b->>'answer','')::int, b->>'explain');
  end loop;
  return json_build_object('lesson', p_title, 'team', p_team, 'n', i);
end $$;

grant execute on function public.app_admin_import_quiz_full(uuid,text,text,int,int,jsonb)      to anon;
grant execute on function public.app_admin_import_lesson_full(uuid,text,text,text,int,jsonb)    to anon;
notify pgrst, 'reload schema';
