/* app.js — ตรรกะทั้งหมด (vanilla JS)
   เบราว์เซอร์คุยกับ Supabase ผ่านฟังก์ชัน public.app_* เท่านั้น
   บัตรผ่าน: device token (อยู่ถาวรในเครื่อง) + session token (อายุสั้น) */

const sb = supabase.createClient(window.SUPA_URL, window.SUPA_ANON);
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- โทเคน ----------
function deviceToken() {
  let d = localStorage.getItem('device_token');
  if (!d) { d = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())); localStorage.setItem('device_token', d); }
  return d;
}
const getSession = () => localStorage.getItem('session_token');
const setSession = (t) => localStorage.setItem('session_token', t);
const clearSession = () => localStorage.removeItem('session_token');

// เรียกฟังก์ชัน app_* โดยแนบ session token เป็นอาร์กิวเมนต์แรกอัตโนมัติ
async function rpc(fn, args = {}) {
  const { data, error } = await sb.rpc(fn, { p_token: getSession(), ...args });
  if (error) throw error;
  return data;
}

let ME = null;
let CATALOG = null;

// ---------- บูต ----------
window.addEventListener('DOMContentLoaded', async () => {
  $('#loginForm').addEventListener('submit', doLogin);
  $('#logoutBtn').addEventListener('click', doLogout);
  document.querySelectorAll('[data-nav]').forEach(a =>
    a.addEventListener('click', () => go(a.getAttribute('data-nav'))));
  if (getSession()) {
    try { ME = await rpc('app_me'); await enterApp(); return; } catch (_) { clearSession(); }
  }
  showLogin();
});

function showLogin() { $('#app').classList.add('hidden'); $('#login').classList.remove('hidden'); }

async function doLogin(e) {
  e.preventDefault();
  const btn = $('#loginBtn'); btn.disabled = true; $('#loginErr').textContent = '';
  try {
    const { data, error } = await sb.rpc('app_login', {
      p_device: deviceToken(), p_email: $('#email').value.trim(), p_password: $('#password').value });
    if (error) throw error;
    setSession(data.token); ME = data.user; await enterApp();
  } catch (err) {
    $('#loginErr').textContent = (String(err.message || '').includes('invalid_credentials'))
      ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' : 'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง';
  } finally { btn.disabled = false; }
}

async function doLogout() {
  try { await rpc('app_logout'); } catch (_) {}
  clearSession(); ME = null; location.reload();
}

async function enterApp() {
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#whoName').textContent = ME.name || ME.email;
  $('#navAdmin').style.display = (ME.role === 'admin') ? 'block' : 'none';
  $('#navDash').style.display = (ME.role === 'admin') ? 'block' : 'none';
  CATALOG = await rpc('app_catalog');
  go('home');
}

function setActiveNav(name) {
  document.querySelectorAll('[data-nav]').forEach(a =>
    a.classList.toggle('active', a.getAttribute('data-nav') === name));
}

// ---------- เราเตอร์ ----------
async function go(name, arg) {
  const v = $('#view');
  if (['home', 'lessons', 'quizzes', 'account', 'dashboard', 'admin'].includes(name)) setActiveNav(name);
  if (name === 'home') return renderHome(v);
  if (name === 'lessons') return renderList(v, 'lesson');
  if (name === 'quizzes') return renderList(v, 'quiz');
  if (name === 'lesson') return renderLesson(v, arg);
  if (name === 'quiz') return renderQuiz(v, arg);
  if (name === 'account') return renderAccount(v);
  if (name === 'dashboard') return renderDashboard(v);
  if (name === 'admin') return renderAdmin(v);
}

// ---------- หน้าหลัก ----------
function renderHome(v) {
  const nl = (CATALOG.lessons || []).length, nq = (CATALOG.quizzes || []).length;
  v.innerHTML = `
    <div class="eyebrow">ยินดีต้อนรับ</div>
    <h1>สวัสดี ${esc(ME.name || ME.email)}</h1>
    <p class="muted">เลือกเรียนบทเรียน หรือทำแบบทดสอบเพื่อประเมินความรู้ของคุณ</p>
    <div class="grid" style="margin-top:16px">
      <div class="tile" data-open="lessons"><div class="k">บทเรียน</div><div class="t">เริ่มเรียนรู้</div><div class="m">${nl} บทเรียน</div></div>
      <div class="tile" data-open="quizzes"><div class="k">แบบทดสอบ</div><div class="t">ทำข้อสอบ</div><div class="m">${nq} ชุด</div></div>
    </div>`;
  v.querySelectorAll('[data-open]').forEach(t => t.addEventListener('click', () => go(t.getAttribute('data-open'))));
}

// ---------- รายการบทเรียน / ข้อสอบ ----------
function renderList(v, kind) {
  const items = kind === 'lesson' ? CATALOG.lessons : CATALOG.quizzes;
  const title = kind === 'lesson' ? 'บทเรียน' : 'แบบทดสอบ';
  if (!items || !items.length) { v.innerHTML = `<h1>${title}</h1><div class="card muted">ยังไม่มีรายการ</div>`; return; }
  v.innerHTML = `<h1>${title}</h1><div class="grid">` + items.map(it => kind === 'lesson'
    ? `<div class="tile" data-id="${it.id}"><div class="k">${esc(it.section || 'บทเรียน')}</div><div class="t">${esc(it.title)}</div></div>`
    : `<div class="tile" data-id="${it.id}"><div class="k">แบบทดสอบ</div><div class="t">${esc(it.title)}</div><div class="m">${it.n} ข้อ · ${it.minutes} นาที · ผ่าน ${it.pass}%</div></div>`
  ).join('') + `</div>`;
  v.querySelectorAll('[data-id]').forEach(t =>
    t.addEventListener('click', () => go(kind === 'lesson' ? 'lesson' : 'quiz', t.getAttribute('data-id'))));
}

// ---------- บทเรียน ----------
function ytId(u) { const m = String(u || '').match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/); return m ? m[1] : ''; }

async function renderLesson(v, id) {
  v.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  const d = await rpc('app_lesson', { p_lesson: id });
  const back = `<a class="muted" style="cursor:pointer" id="backL">← กลับ</a>`;
  let html = `${back}<h1>${esc(d.lesson.title)}</h1>`;
  (d.blocks || []).forEach((b, i) => {
    if (b.type === 'text') html += `<div class="lessontext">${esc(b.content)}</div>`;
    else if (b.type === 'image' && b.url) html += `<img src="${esc(b.url)}" style="max-width:100%;border-radius:12px;margin:12px 0;border:1px solid var(--line)">`;
    else if (b.type === 'video') { const y = ytId(b.url); html += y ? `<div class="vwrap"><iframe src="https://www.youtube.com/embed/${y}" allowfullscreen></iframe></div>` : `<div class="vwrap"></div>`; }
    else if (b.type === 'slides' && b.url) { const m = String(b.url).match(/[-\w]{25,}/); if (m) html += `<div class="vwrap"><iframe src="https://docs.google.com/presentation/d/${m[0]}/embed" allowfullscreen></iframe></div>`; }
    else if (b.type === 'check') html += renderCheck(b, i);
  });
  html += `<div class="card" style="text-align:center;margin-top:16px" id="doneBox"></div>`;
  v.innerHTML = html;
  $('#backL').addEventListener('click', () => go('lessons'));
  wireChecks(v);
  const box = $('#doneBox');
  const paint = (done) => {
    box.innerHTML = done ? `<div class="st ok" style="font-size:14px">✅ เรียนจบบทนี้แล้ว</div>`
      : `<p class="muted" style="margin:0 0 10px">ดูเนื้อหาครบแล้ว กดปุ่มเพื่อบันทึกว่าเรียนจบ</p><button class="btn btn-primary" id="doneBtn">✓ เรียนจบบทนี้</button>`;
    if (!done) $('#doneBtn').addEventListener('click', async () => { await rpc('app_lesson_done', { p_lesson: id }); paint(true); });
  };
  paint(!!d.done);
}

function renderCheck(b, i) {
  const opts = (b.choices || []).map((c, j) => `<div class="opt" data-c="${j}"><span class="dot"></span><span>${esc(c)}</span></div>`).join('');
  return `<div class="lcheck" data-check="${i}" data-ans="${b.answer}" data-explain="${esc(b.explain || '')}">
    <div class="eyebrow">เช็คความเข้าใจ</div>
    <div style="font-weight:600;margin:4px 0 8px">${esc(b.question)}</div>${opts}
    <div class="chk-fb" style="display:none;margin-top:8px;font-size:14px;background:#fff;border:1px dashed var(--line);border-radius:10px;padding:10px 12px"></div></div>`;
}

function wireChecks(v) {
  v.querySelectorAll('[data-check]').forEach(box => {
    const ans = +box.getAttribute('data-ans'), explain = box.getAttribute('data-explain');
    box.querySelectorAll('.opt').forEach(opt => opt.addEventListener('click', () => {
      if (box.dataset.done) return; box.dataset.done = '1';
      const pick = +opt.getAttribute('data-c');
      box.querySelectorAll('.opt').forEach((o, j) => { if (j === ans) o.classList.add('ok'); else if (j === pick) o.classList.add('bad'); });
      const fb = box.querySelector('.chk-fb'); fb.style.display = 'block';
      fb.textContent = (pick === ans ? '✓ ถูกต้อง ' : `✗ คำตอบที่ถูกคือข้อ ${ans + 1} `) + explain;
    }));
  });
}

// ---------- ข้อสอบ ----------
async function renderQuiz(v, id) {
  const meta = (CATALOG.quizzes || []).find(q => q.id === id) || { title: 'แบบทดสอบ', minutes: 15, pass: 80 };
  v.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  const questions = await rpc('app_quiz_questions', { p_quiz: id });
  if (!questions.length) { v.innerHTML = `<div class="card">ยังไม่มีข้อสอบในชุดนี้</div>`; return; }

  const state = { cur: 0, ans: {}, left: meta.minutes * 60, timer: null };

  function start() {
    v.innerHTML = `<a class="muted" style="cursor:pointer" id="backQ">← กลับ</a>
      <div class="card"><div class="eyebrow">แบบทดสอบ</div><h1>${esc(meta.title)}</h1>
      <div style="background:#EDF9F9;border:1px solid #D3F0F0;border-radius:12px;padding:12px 14px;color:var(--teal-700);margin:10px 0 18px">
        ${questions.length} ข้อ · เวลา ${meta.minutes} นาที · เกณฑ์ผ่าน ${meta.pass}%</div>
      <button class="btn btn-primary" id="startBtn">เริ่มทำข้อสอบ</button></div>`;
    $('#backQ').addEventListener('click', () => go('quizzes'));
    $('#startBtn').addEventListener('click', run);
  }

  function run() {
    if (!state.timer) state.timer = setInterval(() => {
      state.left--; const t = $('#timer');
      if (t) { t.textContent = fmt(state.left); t.classList.toggle('warn', state.left <= 60); }
      if (state.left <= 0) { clearInterval(state.timer); submit(); }
    }, 1000);
    const q = questions[state.cur], last = state.cur === questions.length - 1;
    v.innerHTML = `
      <div style="text-align:right;margin-bottom:8px"><span class="timer ${state.left <= 60 ? 'warn' : ''}" id="timer">${fmt(state.left)}</span></div>
      <div class="q"><div style="font-weight:700;color:var(--teal-700);font-size:13px">ข้อ ${state.cur + 1} / ${questions.length}</div>
        <div style="font-weight:500;margin:6px 0 12px">${esc(q.question)}</div>
        ${(q.choices || []).map((c, j) => `<div class="opt ${state.ans[state.cur] === j ? 'sel' : ''}" data-c="${j}"><span class="dot"></span><span>${esc(c)}</span></div>`).join('')}</div>
      <div class="rowbtns">
        <button class="btn btn-ghost" id="prevBtn" style="visibility:${state.cur === 0 ? 'hidden' : 'visible'}">← ย้อนกลับ</button>
        <button class="btn ${last ? 'btn-primary' : 'btn-teal'}" id="nextBtn">${last ? 'ส่งคำตอบ' : 'ถัดไป →'}</button></div>`;
    v.querySelectorAll('.opt').forEach(o => o.addEventListener('click', () => { state.ans[state.cur] = +o.getAttribute('data-c'); run(); }));
    $('#prevBtn').addEventListener('click', () => { if (state.cur > 0) { state.cur--; run(); } });
    $('#nextBtn').addEventListener('click', () => { if (last) submit(); else { state.cur++; run(); } });
  }

  async function submit() {
    clearInterval(state.timer); state.timer = null;
    const payload = {}; questions.forEach((q, i) => { if (state.ans[i] != null) payload[q.id] = state.ans[i]; });
    v.innerHTML = `<div class="muted">กำลังส่งคำตอบ...</div>`;
    let r; try { r = await rpc('app_submit_quiz', { p_quiz: id, p_answers: payload, p_device: 'Computer' }); }
    catch (e) { v.innerHTML = `<div class="card">ส่งคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง</div>`; return; }
    result(r);
  }

  function result(r) {
    const color = r.pass ? 'var(--success)' : 'var(--danger)';
    let html = `<div class="card" style="text-align:center">
      <div class="eyebrow">${esc(meta.title)}</div>
      <div style="font-size:54px;font-weight:700;color:${color}">${r.score} / ${r.total}</div>
      <div class="muted">${r.pct}%</div>
      <div class="tag ${r.pass ? 'pass' : 'fail'}">${r.pass ? 'ผ่าน ✓' : 'ไม่ผ่าน'}</div>
      <p style="font-weight:600;color:${color}">${r.pass ? 'ยินดีด้วยค่ะ คุณสอบผ่านแล้ว 🎉' : 'ยังไม่ผ่าน ลองอีกครั้งนะคะ 💪'}</p></div>
      <div class="card"><h2>📋 เฉลย (${r.score}/${r.total})</h2>`;
    (r.review || []).forEach((x, i) => {
      html += `<div style="border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-bottom:10px">
        <div style="font-weight:700;color:var(--teal-700);font-size:13px">ข้อ ${i + 1}
          <span class="st ${x.ok ? 'ok' : ''}" style="margin-left:6px;${x.ok ? '' : 'background:#FBEAEA;color:var(--danger)'}">${x.ok ? 'ถูก' : 'ผิด'}</span></div>
        <div style="margin:4px 0;font-weight:500">${esc(x.question)}</div>
        <div style="font-size:14px;${x.ok ? '' : 'color:var(--danger)'}">คำตอบของคุณ: ${x.picked == null ? '(ไม่ได้ตอบ)' : esc(x.choices[x.picked])}</div>
        ${x.ok ? '' : `<div style="color:var(--success);font-weight:600;margin-top:3px;font-size:14px">✅ เฉลย: ${esc(x.choices[x.correct])}</div>`}</div>`;
    });
    html += `</div><div style="text-align:center"><button class="btn btn-ghost" id="doneQ">กลับหน้าหลัก</button></div>`;
    v.innerHTML = html;
    $('#doneQ').addEventListener('click', () => go('quizzes'));
  }

  start();
}
function fmt(s) { const m = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(s % 60).padStart(2, '0'); return `${m}:${ss}`; }

// ---------- เปลี่ยนรหัสผ่าน ----------
function renderAccount(v) {
  v.innerHTML = `<h1>เปลี่ยนรหัสผ่าน</h1>
    <div class="card" style="max-width:420px">
      <div class="field"><label>รหัสผ่านปัจจุบัน</label><input id="pOld" type="password" autocomplete="current-password"></div>
      <div class="field"><label>รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)</label><input id="pNew" type="password" autocomplete="new-password"></div>
      <div class="field"><label>ยืนยันรหัสผ่านใหม่</label><input id="pNew2" type="password" autocomplete="new-password"></div>
      <div class="login-err" id="pErr" style="margin:0 0 10px"></div>
      <button class="btn btn-primary" id="pBtn">บันทึกรหัสผ่านใหม่</button>
    </div>`;
  $('#pBtn').addEventListener('click', async () => {
    const err = $('#pErr'); err.style.color = 'var(--danger)';
    const o = $('#pOld').value, n = $('#pNew').value, n2 = $('#pNew2').value;
    if (n.length < 6) { err.textContent = 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร'; return; }
    if (n !== n2) { err.textContent = 'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน'; return; }
    const btn = $('#pBtn'); btn.disabled = true; err.textContent = '';
    try {
      await rpc('app_change_password', { p_old: o, p_new: n });
      err.style.color = 'var(--success)'; err.textContent = 'เปลี่ยนรหัสผ่านเรียบร้อย ✓';
      $('#pOld').value = $('#pNew').value = $('#pNew2').value = '';
    } catch (e) {
      err.textContent = String(e.message || '').includes('wrong_old') ? 'รหัสผ่านปัจจุบันไม่ถูกต้อง' : 'เปลี่ยนไม่สำเร็จ ลองใหม่';
    } finally { btn.disabled = false; }
  });
}

// ---------- แดชบอร์ดผลสอบ (แอดมิน) ----------
async function renderDashboard(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>แดชบอร์ดผลสอบ</h1><div class="muted">กำลังโหลด...</div>`;
  let rows;
  try { rows = await rpc('app_admin_results'); } catch (e) { v.innerHTML = `<div class="card">โหลดข้อมูลไม่สำเร็จ</div>`; return; }
  const sel = { team: '', quiz: '', res: '' };
  const fmtd = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); };
  const teams = [...new Set(rows.map(r => r.team).filter(Boolean))];
  const quizzes = [...new Set(rows.map(r => r.quiz).filter(Boolean))];

  function draw() {
    const f = rows.filter(r => (!sel.team || r.team === sel.team) && (!sel.quiz || r.quiz === sel.quiz)
      && (!sel.res || (sel.res === 'pass' ? r.pass : !r.pass)));
    const trainees = new Set(f.map(r => r.email)).size;
    const passed = f.filter(r => r.pass).length;
    const rate = f.length ? Math.round(passed / f.length * 100) : 0;
    const opt = (arr, cur) => arr.map(x => `<option value="${esc(x)}" ${cur === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const ss = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
    v.innerHTML = `<h1>แดชบอร์ดผลสอบ</h1>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:8px">
        <div class="tile"><div class="k">จำนวนครั้งที่สอบ</div><div class="t" style="font-size:26px">${f.length}</div></div>
        <div class="tile"><div class="k">ผู้เข้าสอบ (คน)</div><div class="t" style="font-size:26px">${trainees}</div></div>
        <div class="tile"><div class="k">อัตราสอบผ่าน</div><div class="t" style="font-size:26px;color:${rate>=80?'var(--success)':'var(--orange)'}">${rate}%</div></div>
      </div>
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="fTeam" style="${ss}"><option value="">ทุกทีม</option>${opt(teams, sel.team)}</select>
        <select id="fQuiz" style="${ss}"><option value="">ทุกชุดข้อสอบ</option>${opt(quizzes, sel.quiz)}</select>
        <select id="fRes" style="${ss}"><option value="">ทุกผล</option><option value="pass" ${sel.res==='pass'?'selected':''}>ผ่าน</option><option value="fail" ${sel.res==='fail'?'selected':''}>ไม่ผ่าน</option></select>
        <button class="btn btn-ghost" id="fReset">ล้างตัวกรอง</button>
        <button class="btn btn-teal" id="dCsv" style="margin-left:auto">⬇ ดาวน์โหลด CSV</button>
      </div>
      <div class="card" style="padding:0;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f0faf9;color:var(--teal-700)">
            <th style="text-align:left;padding:10px 12px">วันที่</th><th style="text-align:left;padding:10px 12px">ชื่อ</th>
            <th style="text-align:left;padding:10px 12px">ทีม</th><th style="text-align:left;padding:10px 12px">ชุดข้อสอบ</th>
            <th style="padding:10px 12px">คะแนน</th><th style="padding:10px 12px">%</th><th style="padding:10px 12px">ผล</th></tr></thead>
          <tbody>${f.length ? f.map(r => `<tr style="border-top:1px solid var(--line)">
            <td style="padding:8px 12px;white-space:nowrap">${fmtd(r.created)}</td>
            <td style="padding:8px 12px">${esc(r.name || '')}</td>
            <td style="padding:8px 12px">${esc(r.team || '')}</td>
            <td style="padding:8px 12px">${esc(r.quiz || '')}</td>
            <td style="padding:8px 12px;text-align:center">${r.score}/${r.total}</td>
            <td style="padding:8px 12px;text-align:center">${r.pct}</td>
            <td style="padding:8px 12px;text-align:center"><span class="st ${r.pass ? 'ok' : ''}" style="${r.pass ? '' : 'background:#FBEAEA;color:var(--danger)'}">${r.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</span></td>
          </tr>`).join('') : `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีข้อมูล</td></tr>`}</tbody>
        </table>
      </div>`;
    $('#fTeam').addEventListener('change', e => { sel.team = e.target.value; draw(); });
    $('#fQuiz').addEventListener('change', e => { sel.quiz = e.target.value; draw(); });
    $('#fRes').addEventListener('change', e => { sel.res = e.target.value; draw(); });
    $('#fReset').addEventListener('click', () => { sel.team = sel.quiz = sel.res = ''; draw(); });
    $('#dCsv').addEventListener('click', () => {
      const head = ['วันที่', 'ชื่อ', 'อีเมล', 'ทีม', 'ชุดข้อสอบ', 'คะแนน', 'เต็ม', '%', 'ผล'];
      const lines = [head.join(',')].concat(f.map(r => [fmtd(r.created), r.name, r.email, r.team, r.quiz, r.score, r.total, r.pct, r.pass ? 'ผ่าน' : 'ไม่ผ่าน']
        .map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'results.csv'; a.click();
    });
  }
  draw();
}

// ---------- แอดมิน: สร้างผู้ใช้ ----------
function renderAdmin(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  const teams = (CATALOG.teams || []).map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
  v.innerHTML = `<h1>จัดการผู้ใช้</h1>
    <div class="card" style="max-width:460px">
      <h2>สร้างบัญชีผู้ใช้ใหม่</h2>
      <div class="field"><label>ชื่อ-สกุล</label><input id="aName"></div>
      <div class="field"><label>อีเมล</label><input id="aEmail" type="email"></div>
      <div class="field"><label>รหัสผ่านตั้งต้น</label><input id="aPass"></div>
      <div class="field"><label>สิทธิ์</label>
        <select id="aRole" style="width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-family:inherit">
          <option value="agent">ผู้เรียน (agent)</option><option value="admin">ผู้ดูแล (admin)</option></select></div>
      <div class="field"><label>ทีม</label>
        <select id="aTeam" style="width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-family:inherit">${teams}</select></div>
      <div class="login-err" id="aErr" style="margin:0 0 10px"></div>
      <button class="btn btn-primary" id="aBtn">สร้างบัญชี</button>
    </div>`;
  $('#aBtn').addEventListener('click', async () => {
    const btn = $('#aBtn'); btn.disabled = true; $('#aErr').style.color = 'var(--danger)'; $('#aErr').textContent = '';
    try {
      await rpc('app_admin_create_user', {
        p_email: $('#aEmail').value.trim(), p_password: $('#aPass').value, p_name: $('#aName').value.trim(),
        p_role: $('#aRole').value, p_team: $('#aTeam').value });
      $('#aErr').style.color = 'var(--success)'; $('#aErr').textContent = 'สร้างบัญชีเรียบร้อย ✓';
      $('#aName').value = $('#aEmail').value = $('#aPass').value = '';
    } catch (e) {
      $('#aErr').textContent = String(e.message || '').includes('duplicate') ? 'อีเมลนี้มีอยู่แล้ว' : 'สร้างไม่สำเร็จ ลองใหม่';
    } finally { btn.disabled = false; }
  });
}
