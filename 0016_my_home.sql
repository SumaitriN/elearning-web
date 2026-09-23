-- ============================================================================
-- 0016_my_home.sql — ข้อมูลส่วนตัวของผู้เรียน (agent) สำหรับหน้าหลัก
--   งานที่ได้รับมอบหมาย + คะแนนที่ทำได้ + ใบประกาศที่ได้รับ
-- ============================================================================
create or replace function public.app_my_home(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  return json_build_object(
    'name', coalesce(v.name, v.email),
    'lessons_total',  (select count(*) from app.lessons  where team_id = v.team_id),
    'lessons_done',   (select count(*) from app.lesson_progress lp join app.lessons l on l.id = lp.lesson_id
                        where lp.user_id = v.id and lp.status = 'done' and l.team_id = v.team_id),
    'quizzes_total',  (select count(*) from app.quizzes where team_id = v.team_id),
    'quizzes_passed', (select count(distinct a.quiz_id) from app.attempts a join app.quizzes z on z.id = a.quiz_id
                        where a.user_id = v.id and a.pass and z.team_id = v.team_id),
    'assignments', (select coalesce(json_agg(json_build_object(
        'type', a.item_type, 'due', a.due,
        'title', case when a.item_type = 'lesson' then (select title from app.lessons where id = a.item_id)
                      else (select title from app.quizzes where id = a.item_id) end,
        'item_id', a.item_id,
        'done', case when a.item_type = 'lesson'
                     then exists(select 1 from app.lesson_progress lp where lp.user_id = v.id and lp.lesson_id = a.item_id and lp.status = 'done')
                     else exists(select 1 from app.attempts aa where aa.user_id = v.id and aa.quiz_id = a.item_id and aa.pass) end
      ) order by a.created_at desc), '[]') from app.assignments a where a.user_id = v.id),
    'scores', (select coalesce(json_agg(json_build_object(
        'quiz', z.title, 'score', a.score, 'total', a.total, 'pct', a.pct, 'pass', a.pass, 'created', a.created_at
      ) order by a.created_at desc), '[]')
      from app.attempts a join app.quizzes z on z.id = a.quiz_id where a.user_id = v.id),
    'certs', (select coalesce(json_agg(json_build_object(
        'no', no, 'title', title, 'date', issued_date
      ) order by no desc), '[]') from app.certificates where user_id = v.id)
  );
end $$;
grant execute on function public.app_my_home(uuid) to anon;
notify pgrst, 'reload schema';
