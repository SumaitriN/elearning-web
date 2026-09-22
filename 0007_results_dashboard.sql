-- ============================================================================
-- 0007_results_dashboard.sql — นำเข้าผลสอบเก่า + ฟังก์ชันข้อมูลแดชบอร์ด (admin)
-- ============================================================================

-- นำเข้าผลสอบทั้งชุด (idempotent ต่อ quiz: ล้างของเดิมแล้วใส่ใหม่)
create or replace function public.app_admin_import_attempts(
  p_token uuid, p_team text, p_quiz_title text, p_rows jsonb)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_team uuid; v_quiz uuid; r jsonb; uid uuid; n int := 0; skipped int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  select id into v_quiz from app.quizzes where team_id = v_team and title = p_quiz_title limit 1;
  if v_quiz is null then return json_build_object('quiz', p_quiz_title, 'error', 'quiz_not_found'); end if;
  delete from app.attempts where quiz_id = v_quiz;
  for r in select * from jsonb_array_elements(p_rows) loop
    select id into uid from app.users where lower(email) = lower(r->>'email');
    if uid is null then skipped := skipped + 1; continue; end if;
    insert into app.attempts (user_id, quiz_id, name, score, total, pct, pass, device, created_at)
      values (uid, v_quiz, r->>'name', nullif(r->>'score','')::int, nullif(r->>'total','')::int,
              nullif(r->>'pct','')::numeric, coalesce((r->>'pass')::boolean,false), 'migrated',
              coalesce(nullif(r->>'created','')::timestamptz, now()));
    n := n + 1;
  end loop;
  return json_build_object('quiz', p_quiz_title, 'imported', n, 'skipped', skipped);
end $$;

-- ข้อมูลแดชบอร์ดสำหรับแอดมิน (ทุก attempt + ชื่อ/ทีม/ชุดข้อสอบ)
create or replace function public.app_admin_results(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object(
            'name', a.name, 'email', u.email, 'team', t.name, 'quiz', z.title,
            'score', a.score, 'total', a.total, 'pct', a.pct, 'pass', a.pass,
            'device', a.device, 'created', a.created_at) order by a.created_at desc), '[]')
          from app.attempts a
          join app.users u on u.id = a.user_id
          join app.quizzes z on z.id = a.quiz_id
          left join app.teams t on t.id = u.team_id);
end $$;

grant execute on function public.app_admin_import_attempts(uuid,text,text,jsonb) to anon;
grant execute on function public.app_admin_results(uuid)                          to anon;
notify pgrst, 'reload schema';
