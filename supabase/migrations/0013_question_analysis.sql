-- ============================================================================
-- 0013_question_analysis.sql — "ใครทำผิดข้อไหน" (วิเคราะห์รายข้อ)
--   • เก็บคำตอบรายข้อของทุก attempt ลง app.question_answers
--   • attempt ใหม่จากเว็บ: บันทึกอัตโนมัติผ่าน app_submit_quiz
--   • ประวัติเก่า: นำเข้าผ่าน app_admin_import_answers (อ่านจากชีตผลสอบ)
--   • หน้าแอดมินอ่านผ่าน app_admin_qstats / app_admin_qdetail
-- ============================================================================

create table if not exists app.question_answers (
  id uuid primary key default gen_random_uuid(),
  team_id    uuid,
  quiz_title text,
  qno        int,
  question   text,
  email      text,
  name       text,
  chosen     text,
  is_correct boolean,
  taken_at   timestamptz default now()
);
create index if not exists qa_team_quiz_idx on app.question_answers (team_id, quiz_title, qno);
create index if not exists qa_email_idx      on app.question_answers (lower(email));

-- ---------------------------------------------------------------------------
-- ส่งคำตอบ (เขียนทับของเดิม + บันทึกคำตอบรายข้อลง question_answers)
-- ---------------------------------------------------------------------------
create or replace function public.app_submit_quiz(p_token uuid, p_quiz uuid, p_answers jsonb, p_device text default 'Computer')
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; r record; v_total int:=0; v_score int:=0; v_pick int; v_ok boolean;
        v_pass_pct int; v_pct numeric; v_pass boolean; v_review jsonb:='[]'::jsonb;
        v_title text; v_ord int:=0; v_chosen text;
begin
  v := app._auth(p_token);
  select pass, title into v_pass_pct, v_title from app.quizzes where id = p_quiz;
  -- ลบคำตอบรายข้อชุดก่อนหน้าของผู้ใช้คนนี้ในชุดนี้ (เก็บครั้งล่าสุด)
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

-- ---------------------------------------------------------------------------
-- นำเข้าคำตอบรายข้อจากประวัติเก่า (idempotent ต่อ team+quiz_title)
--   p_questions : { "1":"ข้อความคำถาม/เฉลย", ... }
--   p_rows      : [ { "e":email, "n":name, "t":iso,
--                     "a":[ [qno, is_correct(0/1), chosen_text ], ... ] }, ... ]
-- ---------------------------------------------------------------------------
create or replace function public.app_admin_import_answers(
  p_token uuid, p_team text, p_quiz_title text, p_questions jsonb, p_rows jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid; row jsonb; ans jsonb; n int:=0; k text;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  delete from app.question_answers where team_id = v_team and quiz_title = p_quiz_title;
  for row in select * from jsonb_array_elements(p_rows) loop
    for ans in select * from jsonb_array_elements(row->'a') loop
      k := (ans->>0);
      insert into app.question_answers (team_id, quiz_title, qno, question, email, name, chosen, is_correct, taken_at)
        values (v_team, p_quiz_title, (ans->>0)::int, coalesce(p_questions->>k, 'ข้อ '||k),
                lower(row->>'e'), row->>'n', ans->>2, (ans->>1)='1',
                coalesce(nullif(row->>'t','')::timestamptz, now()));
      n := n + 1;
    end loop;
  end loop;
  return json_build_object('quiz', p_quiz_title, 'team', p_team, 'rows', n);
end $$;

-- ---------------------------------------------------------------------------
-- สรุปรายข้อ (ทุกชุด หรือกรองทีม) : จำนวนตอบ / จำนวนถูก / %ถูก
-- ---------------------------------------------------------------------------
create or replace function public.app_admin_qstats(p_token uuid, p_team text default null)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        when 'Center' then '11111111-1111-1111-1111-111111111111'::uuid
                        else null end;
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
            group by t.name, qa.quiz_title, qa.qno
          ) s);
end $$;

-- ---------------------------------------------------------------------------
-- รายละเอียดรายคน x รายข้อ ของชุดสอบเดียว (สร้างตาราง/เจาะรายคน)
-- ---------------------------------------------------------------------------
create or replace function public.app_admin_qdetail(p_token uuid, p_team text, p_quiz_title text)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; v_team uuid;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  v_team := case p_team when 'Makro' then '22222222-2222-2222-2222-222222222222'::uuid
                        when 'Lotus' then '33333333-3333-3333-3333-333333333333'::uuid
                        else '11111111-1111-1111-1111-111111111111'::uuid end;
  return (select coalesce(json_agg(json_build_object(
            'email', email, 'name', name, 'qno', qno, 'question', question,
            'chosen', chosen, 'ok', is_correct) order by name, qno), '[]')
          from app.question_answers
          where team_id = v_team and quiz_title = p_quiz_title);
end $$;

grant execute on function public.app_admin_import_answers(uuid,text,text,jsonb,jsonb) to anon;
grant execute on function public.app_admin_qstats(uuid,text)                          to anon;
grant execute on function public.app_admin_qdetail(uuid,text,text)                    to anon;
notify pgrst, 'reload schema';
