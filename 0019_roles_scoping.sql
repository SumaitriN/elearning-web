-- ============================================================================
-- 0019_roles_scoping.sql — 4 ระดับผู้ใช้ + ผูกได้หลายทีม + กรองสิทธิ์ตามทีม
--   roles: admin (ทุกอย่าง) · team_leader (เหมือน admin ยกเว้นจัดการผู้ใช้ + เฉพาะทีมตน)
--          agent (ผู้เรียน) · customer (ผู้สังเกต ดูอย่างเดียว เฉพาะทีมตน)
--   • app.user_teams : ผูกผู้ใช้กับทีมแบบหลายต่อหลาย (customer/team_leader เลือกได้หลายทีม)
--   • helper app._teams(v) : คืนทีมที่ผู้ใช้เข้าถึงได้
--   • ปรับ RPC วิว/จัดการให้รองรับ role ใหม่ + กรองทีม
-- ============================================================================

-- ---------- 1) รองรับ role ใหม่ ----------
alter table app.users drop constraint if exists users_role_check;
alter table app.users add constraint users_role_check
  check (role in ('admin','agent','team_leader','customer'));

-- ---------- 2) ตารางผูกผู้ใช้–หลายทีม + backfill จากทีมเดิม ----------
create table if not exists app.user_teams (
  user_id uuid references app.users(id) on delete cascade,
  team_id uuid references app.teams(id) on delete cascade,
  primary key (user_id, team_id));
alter table app.user_teams enable row level security;
insert into app.user_teams (user_id, team_id)
  select id, team_id from app.users where team_id is not null
  on conflict do nothing;

-- ---------- 3) helper: ทีมที่ผู้ใช้เข้าถึงได้ ----------
create or replace function app._teams(v app.users)
returns setof uuid language sql security definer set search_path = app stable as $$
  select t.id from app.teams t where v.role = 'admin'
  union
  select ut.team_id from app.user_teams ut where v.role <> 'admin' and ut.user_id = v.id
  union
  select v.team_id where v.role <> 'admin' and v.team_id is not null
$$;

create or replace function app._has_team(v app.users, t uuid)
returns boolean language sql security definer set search_path = app stable as $$
  select v.role = 'admin' or (t is not null and t in (select app._teams(v)))
$$;

-- ============================================================================
-- 4) ตัวตน / แคตตาล็อก
-- ============================================================================

-- login: ส่ง role + teams กลับไปด้วย
create or replace function public.app_login(p_device text, p_email text, p_password text)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v_user app.users; v_token uuid;
begin
  select * into v_user from app.users where lower(email) = lower(p_email);
  if v_user.id is null or v_user.pass_hash <> crypt(p_password, v_user.pass_hash) then
    raise exception 'invalid_credentials';
  end if;
  insert into app.sessions (user_id, device_token, expires_at)
    values (v_user.id, p_device, now() + interval '8 hours') returning token into v_token;
  return json_build_object('token', v_token,
    'user', json_build_object('email', v_user.email, 'name', v_user.name, 'role', v_user.role,
      'team_id', v_user.team_id,
      'teams', (select coalesce(json_agg(json_build_object('id',t.id,'name',t.name) order by t.sort), '[]')
                from app.teams t where t.id in (select app._teams(v_user)))));
end $$;

create or replace function public.app_me(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin v := app._auth(p_token);
  return json_build_object('email', v.email, 'name', v.name, 'role', v.role, 'team_id', v.team_id,
    'teams', (select coalesce(json_agg(json_build_object('id',t.id,'name',t.name) order by t.sort), '[]')
              from app.teams t where t.id in (select app._teams(v))));
end $$;

-- catalog: ผู้ที่ไม่ใช่ admin เห็นเฉพาะทีมของตน
create or replace function public.app_catalog(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token);
  if p_team is null then
    select id into v_team from app.teams where id in (select app._teams(v)) order by sort limit 1;
  else
    v_team := p_team;
  end if;
  if not app._has_team(v, v_team) then raise exception 'not_allowed'; end if;
  return json_build_object(
    'active_team', v_team,
    'teams',   (select coalesce(json_agg(json_build_object('id',id,'name',name) order by sort), '[]')
                from app.teams where id in (select app._teams(v))),
    'lessons', (select coalesce(json_agg(json_build_object('id',id,'title',title,'section',section) order by "order"), '[]')
                from app.lessons where team_id = v_team),
    'quizzes', (select coalesce(json_agg(json_build_object('id',id,'title',title,'minutes',minutes,'pass',pass,
                 'n',(select count(*) from app.questions q where q.quiz_id = z.id)) order by created_at), '[]')
                from app.quizzes z where team_id = v_team));
end $$;

-- lesson: กันข้ามทีม + บันทึกความคืบหน้าเฉพาะ agent (customer เป็นผู้สังเกต)
create or replace function public.app_lesson(p_token uuid, p_lesson uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role <> 'admin' and not exists (
        select 1 from app.lessons l where l.id = p_lesson and l.team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  if v.role = 'agent' then
    insert into app.lesson_progress (user_id, lesson_id, status) values (v.id, p_lesson, 'in-progress')
      on conflict (user_id, lesson_id) do nothing;
  end if;
  return json_build_object(
    'lesson', (select json_build_object('id',id,'title',title,'section',section) from app.lessons where id = p_lesson),
    'blocks', (select coalesce(json_agg(json_build_object('type',type,'content',content,'url',url,
                'question',question,'choices',choices,'answer',answer,'explain',explain) order by "order"), '[]')
               from app.blocks where lesson_id = p_lesson),
    'done',   (select status = 'done' from app.lesson_progress where user_id = v.id and lesson_id = p_lesson));
end $$;

-- ส่งข้อสอบ: ห้าม customer (ผู้สังเกต)
create or replace function public.app_submit_quiz(p_token uuid, p_quiz uuid, p_answers jsonb, p_device text default 'Computer')
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; r record; v_total int:=0; v_score int:=0; v_pick int; v_ok boolean;
        v_pass_pct int; v_pct numeric; v_pass boolean; v_review jsonb:='[]'::jsonb;
        v_title text; v_ord int:=0; v_chosen text;
begin
  v := app._auth(p_token);
  if v.role = 'customer' then raise exception 'not_allowed'; end if;
  select pass, title into v_pass_pct, v_title from app.quizzes where id = p_quiz;
  delete from app.question_answers
    where quiz_title = v_title and team_id is not distinct from v.team_id and lower(email) = lower(v.email);
  for r in select * from app.questions where quiz_id = p_quiz order by "order", id loop
    v_total := v_total + 1; v_ord := v_ord + 1;
    v_pick := nullif(p_answers ->> r.id::text, '')::int;
    v_ok := (v_pick is not null and v_pick = r.correct);
    if v_ok then v_score := v_score + 1; end if;
    v_chosen := case when v_pick is not null then (r.choices ->> v_pick) else null end;
    insert into app.question_answers (team_id, quiz_title, qno, question, email, name, chosen, is_correct)
      values (v.team_id, v_title, v_ord, r.question, lower(v.email), coalesce(v.name, v.email), v_chosen, v_ok);
    v_review := v_review || jsonb_build_object('question', r.question, 'choices', r.choices,
                 'correct', r.correct, 'picked', v_pick, 'ok', v_ok);
  end loop;
  v_pct := case when v_total > 0 then round(v_score::numeric / v_total * 100, 1) else 0 end;
  v_pass := v_pct >= coalesce(v_pass_pct, 80);
  insert into app.attempts (user_id, quiz_id, name, score, total, pct, pass, device, answers)
    values (v.id, p_quiz, coalesce(v.name, v.email), v_score, v_total, v_pct, v_pass, p_device, p_answers);
  return json_build_object('score', v_score, 'total', v_total, 'pct', v_pct, 'pass', v_pass, 'review', v_review);
end $$;

-- ============================================================================
-- 5) วิว/ติดตามผล — admin + team_leader + customer (กรองทีม)
-- ============================================================================

create or replace function public.app_admin_progress(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',u.name,'team',t.name,
            'lessons_done',(select count(*) from app.lesson_progress lp where lp.user_id=u.id and lp.status='done'),
            'lessons_total',(select count(*) from app.lessons l where l.team_id=u.team_id),
            'quizzes_passed',(select count(distinct a.quiz_id) from app.attempts a where a.user_id=u.id and a.pass),
            'quizzes_total',(select count(*) from app.quizzes q where q.team_id=u.team_id)
          ) order by u.name), '[]')
          from app.users u left join app.teams t on t.id=u.team_id
          where u.role='agent' and (p_team is null or u.team_id=p_team)
            and (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

create or replace function public.app_admin_results(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object(
            'name', a.name, 'email', u.email, 'team', t.name, 'quiz', z.title,
            'score', a.score, 'total', a.total, 'pct', a.pct, 'pass', a.pass,
            'device', a.device, 'created', a.created_at) order by a.created_at desc), '[]')
          from app.attempts a
          join app.users u on u.id = a.user_id
          join app.quizzes z on z.id = a.quiz_id
          left join app.teams t on t.id = u.team_id
          where (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

create or replace function public.app_admin_qstats(p_token uuid, p_team text default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        when 'Center' then '11111111-1111-1111-1111-111111111111'::uuid
                        else null end;
  if v_team is not null and not app._has_team(v, v_team) then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(x order by (x->>'quiz'), (x->>'qno')::int), '[]') from (
            select json_build_object(
              'team', t.name, 'quiz', qa.quiz_title, 'qno', qa.qno,
              'question', max(qa.question),
              'n', count(*), 'n_correct', count(*) filter (where qa.is_correct),
              'pct', round(100.0 * count(*) filter (where qa.is_correct) / nullif(count(*),0), 1)
            ) x
            from app.question_answers qa
            left join app.teams t on t.id = qa.team_id
            where (v_team is null or qa.team_id = v_team)
              and (v.role='admin' or qa.team_id in (select app._teams(v)))
            group by t.name, qa.quiz_title, qa.qno
          ) s);
end $$;

create or replace function public.app_admin_qdetail(p_token uuid, p_team text, p_quiz_title text)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader','customer') then raise exception 'not_allowed'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  if not app._has_team(v, v_team) then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object(
            'email', email, 'name', name, 'qno', qno, 'question', question,
            'chosen', chosen, 'ok', is_correct) order by name, qno), '[]')
          from app.question_answers
          where team_id = v_team and quiz_title = p_quiz_title);
end $$;

-- ============================================================================
-- 6) จัดการ — admin + team_leader (กรองทีม), ห้าม customer/agent
-- ============================================================================

create or replace function public.app_admin_assignments(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('email',u.email,'name',u.name,'team',t.name,
            'item_type',a.item_type,
            'item',case when a.item_type='lesson' then (select title from app.lessons where id=a.item_id)
                        else (select title from app.quizzes where id=a.item_id) end,
            'due',a.due,'created',a.created_at) order by a.created_at desc), '[]')
          from app.assignments a join app.users u on u.id = a.user_id left join app.teams t on t.id = u.team_id
          where (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

create or replace function public.app_admin_assign(p_token uuid, p_item_type text, p_item_id uuid, p_user_ids jsonb, p_due date default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; uid jsonb; n int := 0; v_uid uuid;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  for uid in select * from jsonb_array_elements(p_user_ids) loop
    v_uid := (uid #>> '{}')::uuid;
    if v.role <> 'admin' and not exists (
        select 1 from app.users u where u.id = v_uid and u.team_id in (select app._teams(v)))
      then raise exception 'user_out_of_scope'; end if;
    insert into app.assignments (user_id, item_type, item_id, assigned_by, due)
      values (v_uid, p_item_type, p_item_id, v.id, p_due)
    on conflict (user_id, item_type, item_id) do update set due = excluded.due, assigned_by = excluded.assigned_by;
    n := n + 1;
  end loop;
  return json_build_object('assigned', n);
end $$;

-- บทเรียน: สร้าง/แก้/ลบ/บันทึกบล็อก — team_leader เฉพาะทีมตน
create or replace function public.app_admin_create_lesson(p_token uuid, p_team text, p_title text, p_section text)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid; v_id uuid;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  if not app._has_team(v, v_team) then raise exception 'not_allowed'; end if;
  insert into app.lessons (team_id, title, section, "order")
    values (v_team, p_title, p_section, (select coalesce(max("order"),0)+1 from app.lessons where team_id = v_team))
    returning id into v_id;
  return json_build_object('id', v_id, 'title', p_title);
end $$;

create or replace function public.app_admin_update_lesson(p_token uuid, p_lesson_id uuid, p_title text, p_section text, p_order int)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.lessons where id=p_lesson_id and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  update app.lessons set title = p_title, section = p_section, "order" = coalesce(p_order,0) where id = p_lesson_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.app_admin_delete_lesson(p_token uuid, p_lesson_id uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.lessons where id=p_lesson_id and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  delete from app.lessons where id = p_lesson_id;
  return json_build_object('ok', true);
end $$;

create or replace function public.app_admin_save_blocks(p_token uuid, p_lesson_id uuid, p_blocks jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; b jsonb; i int := 0;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.lessons where id=p_lesson_id and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  delete from app.blocks where lesson_id = p_lesson_id;
  for b in select * from jsonb_array_elements(p_blocks) loop
    i := i + 1;
    insert into app.blocks (lesson_id, "order", type, content, url, question, choices, answer, explain)
      values (p_lesson_id, i, coalesce(b->>'type','text'), b->>'content', b->>'url', b->>'question',
              coalesce(b->'choices','[]'::jsonb), nullif(b->>'answer','')::int, b->>'explain');
  end loop;
  return json_build_object('ok', true, 'n', i);
end $$;

-- ข้อสอบ: โหลด/บันทึก/ลบ — team_leader เฉพาะทีมตน
create or replace function public.app_admin_quiz_get(p_token uuid, p_quiz uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.quizzes where id=p_quiz and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  return (select json_build_object('id', z.id, 'title', z.title, 'minutes', z.minutes, 'pass', z.pass,
            'questions', (select coalesce(json_agg(json_build_object(
                 'q', question, 'choices', choices, 'correct', correct,
                 'image', image_url, 'video', video_url) order by "order", id), '[]')
               from app.questions where quiz_id = z.id))
          from app.quizzes z where z.id = p_quiz);
end $$;

create or replace function public.app_admin_quiz_save(
  p_token uuid, p_quiz uuid, p_team text, p_title text, p_minutes int, p_pass int, p_questions jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid; v_id uuid := p_quiz; q jsonb; i int := 0;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  if not app._has_team(v, v_team) then raise exception 'not_allowed'; end if;
  if v_id is not null and v.role <> 'admin'
     and not exists (select 1 from app.quizzes where id=v_id and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  if v_id is null then
    insert into app.quizzes (team_id, title, minutes, pass)
      values (v_team, p_title, coalesce(p_minutes,15), coalesce(p_pass,80)) returning id into v_id;
  else
    update app.quizzes set title = p_title, minutes = coalesce(p_minutes,15), pass = coalesce(p_pass,80) where id = v_id;
  end if;
  delete from app.questions where quiz_id = v_id;
  for q in select * from jsonb_array_elements(p_questions) loop
    i := i + 1;
    insert into app.questions (quiz_id, "order", question, choices, correct, image_url, video_url)
      values (v_id, i, q->>'q', coalesce(q->'choices','[]'::jsonb), coalesce((q->>'correct')::int, 0),
              nullif(q->>'image',''), nullif(q->>'video',''));
  end loop;
  return json_build_object('id', v_id, 'n', i);
end $$;

create or replace function public.app_admin_quiz_delete(p_token uuid, p_quiz uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.quizzes where id=p_quiz and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  delete from app.quizzes where id = p_quiz;
  return json_build_object('ok', true);
end $$;

-- ใบประกาศ: ดู/ออก — admin + team_leader (กรองทีม)
create or replace function public.app_admin_certs(p_token uuid)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  return (select coalesce(json_agg(json_build_object('no',c.no,'name',coalesce(c.name,u.name,u.email),
            'email',u.email,'title',c.title,'date',c.issued_date) order by c.no desc), '[]')
          from app.certificates c join app.users u on u.id = c.user_id
          where (v.role='admin' or u.team_id in (select app._teams(v))));
end $$;

create or replace function public.app_admin_issue_cert(p_token uuid, p_user_id uuid, p_title text, p_name text default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_no int; v_date date; v_name text;
begin
  v := app._auth(p_token);
  if v.role not in ('admin','team_leader') then raise exception 'not_allowed'; end if;
  if v.role <> 'admin' and not exists (select 1 from app.users where id=p_user_id and team_id in (select app._teams(v)))
    then raise exception 'not_allowed'; end if;
  v_name := coalesce(nullif(trim(p_name), ''), (select coalesce(name, email) from app.users where id = p_user_id));
  insert into app.certificates (user_id, title, name, issued_by)
    values (p_user_id, p_title, v_name, v.id) returning no, issued_date into v_no, v_date;
  return json_build_object('no', v_no, 'name', v_name, 'title', p_title, 'date', v_date);
end $$;

-- ============================================================================
-- 7) จัดการผู้ใช้ — admin เท่านั้น + รองรับหลายทีม (p_teams = array ของ team uuid)
-- ============================================================================

create or replace function public.app_admin_list_users(p_token uuid, p_team uuid default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  return (select coalesce(json_agg(json_build_object('id',id,'email',email,'name',name,'role',role,
            'team_id',team_id,'team',(select name from app.teams t where t.id = u.team_id),
            'teams',(select coalesce(json_agg(ut.team_id), '[]') from app.user_teams ut where ut.user_id = u.id),
            'created',created_at) order by email), '[]')
          from app.users u where (p_team is null or team_id = p_team
                                   or exists(select 1 from app.user_teams ut where ut.user_id=u.id and ut.team_id=p_team)));
end $$;

drop function if exists public.app_admin_set_user(uuid,uuid,text,text,uuid);
create or replace function public.app_admin_set_user(p_token uuid, p_user_id uuid, p_name text, p_role text, p_teams jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; x jsonb;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  update app.users set name = p_name, role = coalesce(p_role, role),
    team_id = (p_teams->>0)::uuid where id = p_user_id;
  delete from app.user_teams where user_id = p_user_id;
  for x in select * from jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) loop
    insert into app.user_teams (user_id, team_id) values (p_user_id, (x#>>'{}')::uuid) on conflict do nothing;
  end loop;
  return json_build_object('ok', true);
end $$;

drop function if exists public.app_admin_create_user(uuid,text,text,text,text,uuid);
create or replace function public.app_admin_create_user(p_token uuid, p_email text, p_password text, p_name text, p_role text, p_teams jsonb)
returns json language plpgsql security definer set search_path = app, public, extensions as $$
declare v app.users; v_new uuid; x jsonb;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  insert into app.users (email, pass_hash, name, role, team_id)
    values (lower(p_email), crypt(p_password, gen_salt('bf')), p_name, coalesce(p_role,'agent'), (p_teams->>0)::uuid)
    returning id into v_new;
  for x in select * from jsonb_array_elements(coalesce(p_teams,'[]'::jsonb)) loop
    insert into app.user_teams (user_id, team_id) values (v_new, (x#>>'{}')::uuid) on conflict do nothing;
  end loop;
  return json_build_object('id', v_new, 'email', lower(p_email));
end $$;

-- ---------- สิทธิ์ให้ anon (เฉพาะประตูที่เปลี่ยน signature) ----------
grant execute on function public.app_admin_set_user(uuid,uuid,text,text,jsonb)                   to anon;
grant execute on function public.app_admin_create_user(uuid,text,text,text,text,jsonb)           to anon;
-- (ฟังก์ชันอื่น ๆ ชื่อ/signature เดิม สิทธิ์ anon ยังอยู่)

notify pgrst, 'reload schema';
