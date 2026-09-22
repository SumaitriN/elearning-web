-- ============================================================================
-- 0009_save_blocks.sql — บันทึกบล็อกเนื้อหาของบทเรียน (ตัวแก้เนื้อหาในเว็บ)
-- แทนบล็อกทั้งหมดของบทนั้นด้วยชุดใหม่ (ไม่แตะชื่อ/ลำดับบทเรียน)
-- ============================================================================
create or replace function public.app_admin_save_blocks(p_token uuid, p_lesson_id uuid, p_blocks jsonb)
returns json language plpgsql security definer set search_path = app, public as $$
declare v app.users; b jsonb; i int := 0;
begin
  v := app._auth(p_token); if v.role <> 'admin' then raise exception 'not_admin'; end if;
  delete from app.blocks where lesson_id = p_lesson_id;
  for b in select * from jsonb_array_elements(p_blocks) loop
    i := i + 1;
    insert into app.blocks (lesson_id, "order", type, content, url, question, choices, answer, explain)
      values (p_lesson_id, i, coalesce(b->>'type','text'), b->>'content', b->>'url', b->>'question',
              coalesce(b->'choices','[]'::jsonb), nullif(b->>'answer','')::int, b->>'explain');
  end loop;
  return json_build_object('ok', true, 'n', i);
end $$;
grant execute on function public.app_admin_save_blocks(uuid,uuid,jsonb) to anon;
notify pgrst, 'reload schema';
