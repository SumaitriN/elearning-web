-- ============================================================================
-- 0015_quiz_editor.sql — ให้แอดมิน/ทีมแก้ไข+เพิ่มข้อสอบผ่านหน้าเว็บ
--   • app_admin_quiz_get    : โหลดข้อสอบพร้อมเฉลย (เฉพาะแอดมิน)
--   • app_admin_quiz_save   : สร้าง/แก้ไขข้อสอบ + แทนที่คำถามทั้งชุด
--   • app_admin_quiz_delete : ลบข้อสอบ
-- ============================================================================

create or replace function public.app_admin_quiz_get(p_token uuid, p_quiz uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select json_build_object('id', z.id, 'title', z.title, 'minutes', z.minutes, 'pass', z.pass,
            'questions', (select coalesce(json_agg(json_build_object(
                 'q', question, 'choices', choices, 'correct', correct) order by "order", id), '[]')
               from app.questions where quiz_id = z.id))
          from app.quizzes z where z.id = p_quiz);
end $$;

create or replace function public.app_admin_quiz_save(
  p_token uuid, p_quiz uuid, p_team text, p_title text, p_minutes int, p_pass int, p_questions jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid; v_id uuid := p_quiz; q jsonb; i int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  if v_id is null then
    insert into app.quizzes (team_id, title, minutes, pass)
      values (v_team, p_title, coalesce(p_minutes,15), coalesce(p_pass,80)) returning id into v_id;
  else
    update app.quizzes set title = p_title, minutes = coalesce(p_minutes,15), pass = coalesce(p_pass,80) where id = v_id;
  end if;
  delete from app.questions where quiz_id = v_id;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    insert into app.questions (quiz_id, "order", question, choices, correct)
      values (v_id, i, q->>'q', coalesce(q->'choices','[]'::jsonb), coalesce((q->>'correct')::int, 0));
  end loop;
  return json_build_object('id', v_id, 'n', i);
end $$;

create or replace function public.app_admin_quiz_delete(p_token uuid, p_quiz uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  delete from app.quizzes where id = p_quiz;
  return json_build_object('ok', true);
end $$;

grant execute on function public.app_admin_quiz_get(uuid,uuid)                          to anon;
grant execute on function public.app_admin_quiz_save(uuid,uuid,text,text,int,int,jsonb) to anon;
grant execute on function public.app_admin_quiz_delete(uuid,uuid)                       to anon;
notify pgrst, 'reload schema';
