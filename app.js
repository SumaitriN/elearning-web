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
  document.querySelectorAll('.adminNav').forEach(a => a.style.display = (ME.role === 'admin') ? 'block' : 'none');
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
  if (['home', 'lessons', 'quizzes', 'account', 'assign', 'progress', 'dashboard', 'cert', 'managelessons', 'admin'].includes(name)) setActiveNav(name);
  if (name === 'home') return renderHome(v);
  if (name === 'lessons') return renderList(v, 'lesson');
  if (name === 'quizzes') return renderList(v, 'quiz');
  if (name === 'lesson') return renderLesson(v, arg);
  if (name === 'quiz') return renderQuiz(v, arg);
  if (name === 'account') return renderAccount(v);
  if (name === 'assign') return renderAssign(v);
  if (name === 'progress') return renderProgress(v);
  if (name === 'dashboard') return renderDashboard(v);
  if (name === 'cert') return renderCerts(v);
  if (name === 'managelessons') return renderManageLessons(v);
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
// แถบเลือกทีม (เฉพาะแอดมิน — เห็นเนื้อหาได้ทุกทีม)
function teamBar() {
  if (ME.role !== 'admin' || !CATALOG.teams || CATALOG.teams.length < 2) return '';
  const opts = CATALOG.teams.map(t => `<option value="${t.id}" ${CATALOG.active_team === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
  return `<div class="card" style="display:flex;gap:10px;align-items:center;margin-bottom:14px">
    <span class="muted">เลือกทีม:</span>
    <select id="teamSel" style="padding:8px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px">${opts}</select></div>`;
}

function renderList(v, kind) {
  const items = kind === 'lesson' ? CATALOG.lessons : CATALOG.quizzes;
  const title = kind === 'lesson' ? 'บทเรียน' : 'แบบทดสอบ';
  const body = (!items || !items.length)
    ? `<div class="card muted">ยังไม่มีรายการ</div>`
    : `<div class="grid">` + items.map(it => kind === 'lesson'
        ? `<div class="tile" data-id="${it.id}"><div class="k">${esc(it.section || 'บทเรียน')}</div><div class="t">${esc(it.title)}</div></div>`
        : `<div class="tile" data-id="${it.id}"><div class="k">แบบทดสอบ</div><div class="t">${esc(it.title)}</div><div class="m">${it.n} ข้อ · ${it.minutes} นาที · ผ่าน ${it.pass}%</div></div>`
      ).join('') + `</div>`;
  v.innerHTML = `<h1>${title}</h1>` + teamBar() + body;
  const tsel = $('#teamSel');
  if (tsel) tsel.addEventListener('change', async (e) => { CATALOG = await rpc('app_catalog', { p_team: e.target.value }); renderList(v, kind); });
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

const SS = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
const teamName = (id) => (CATALOG.teams.find(t => t.id === id) || {}).name || '';
const teamOpts = (cur) => (CATALOG.teams || []).map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');

// ---------- มอบหมายงาน ----------
async function renderAssign(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>มอบหมายงาน</h1><div class="muted">กำลังโหลด...</div>`;
  const st = { team: CATALOG.active_team || (CATALOG.teams[0] || {}).id, type: 'lesson', item: '', cat: null, users: [], picked: {} };
  async function loadTeam() { st.cat = await rpc('app_catalog', { p_team: st.team }); st.users = await rpc('app_admin_list_users', { p_team: st.team }); st.item = ''; st.picked = {}; }
  await loadTeam();
  function draw() {
    const items = st.type === 'lesson' ? st.cat.lessons : st.cat.quizzes;
    v.innerHTML = `<h1>มอบหมายงาน</h1>
      <div class="card" style="max-width:640px">
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">
          <div><label class="muted">ทีม</label><br><select id="aTeam" style="${SS}">${teamOpts(st.team)}</select></div>
          <div><label class="muted">ประเภท</label><br><select id="aType" style="${SS}"><option value="lesson" ${st.type==='lesson'?'selected':''}>บทเรียน</option><option value="quiz" ${st.type==='quiz'?'selected':''}>แบบทดสอบ</option></select></div>
          <div style="flex:1;min-width:200px"><label class="muted">รายการ</label><br><select id="aItem" style="${SS};width:100%"><option value="">— เลือก —</option>${items.map(it => `<option value="${it.id}" ${st.item===it.id?'selected':''}>${esc(it.title)}</option>`).join('')}</select></div>
          <div><label class="muted">กำหนดส่ง</label><br><input id="aDue" type="date" style="${SS}"></div>
        </div>
        <div style="margin-bottom:8px"><label style="font-weight:600"><input type="checkbox" id="aAll"> เลือกทั้งทีม (${st.users.length} คน)</label></div>
        <div style="max-height:230px;overflow:auto;border:1px solid var(--line);border-radius:10px;padding:8px 12px">
          ${st.users.map(u => `<label style="display:block;padding:3px 0"><input type="checkbox" class="uchk" value="${u.id}" ${st.picked[u.id]?'checked':''}> ${esc(u.name || u.email)} <span class="muted" style="font-size:12px">${esc(u.email)}</span></label>`).join('')}
        </div>
        <div class="login-err" id="aErr" style="margin:10px 0"></div>
        <button class="btn btn-primary" id="aBtn">มอบหมายให้ผู้ที่เลือก</button>
      </div>
      <div class="card"><h2>งานที่มอบหมายล่าสุด</h2><div id="aList" class="muted">กำลังโหลด...</div></div>`;
    $('#aTeam').addEventListener('change', async e => { st.team = e.target.value; await loadTeam(); draw(); });
    $('#aType').addEventListener('change', e => { st.type = e.target.value; st.item = ''; draw(); });
    $('#aItem').addEventListener('change', e => { st.item = e.target.value; });
    $('#aAll').addEventListener('change', e => { v.querySelectorAll('.uchk').forEach(c => { c.checked = e.target.checked; st.picked[c.value] = e.target.checked; }); });
    v.querySelectorAll('.uchk').forEach(c => c.addEventListener('change', e => { st.picked[e.target.value] = e.target.checked; }));
    $('#aBtn').addEventListener('click', async () => {
      const ids = [...v.querySelectorAll('.uchk:checked')].map(c => c.value);
      const err = $('#aErr'); err.style.color = 'var(--danger)';
      if (!st.item) { err.textContent = 'กรุณาเลือกรายการ'; return; }
      if (!ids.length) { err.textContent = 'กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน'; return; }
      const btn = $('#aBtn'); btn.disabled = true; err.textContent = '';
      try {
        const r = await rpc('app_admin_assign', { p_item_type: st.type, p_item_id: st.item, p_user_ids: ids, p_due: $('#aDue').value || null });
        err.style.color = 'var(--success)'; err.textContent = `มอบหมายเรียบร้อย ${r.assigned} คน ✓`; loadList();
      } catch (e) { err.textContent = 'มอบหมายไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    loadList();
  }
  async function loadList() {
    const rows = await rpc('app_admin_assignments');
    const el = $('#aList'); if (!el) return;
    el.innerHTML = rows.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="text-align:left;padding:8px 10px">ชื่อ</th><th style="text-align:left;padding:8px 10px">ทีม</th><th style="text-align:left;padding:8px 10px">ประเภท</th><th style="text-align:left;padding:8px 10px">รายการ</th><th style="padding:8px 10px">กำหนดส่ง</th></tr></thead>
      <tbody>${rows.map(r => `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 10px">${esc(r.name || '')}</td><td style="padding:7px 10px">${esc(r.team || '')}</td><td style="padding:7px 10px">${r.item_type === 'lesson' ? 'บทเรียน' : 'แบบทดสอบ'}</td><td style="padding:7px 10px">${esc(r.item || '')}</td><td style="padding:7px 10px;text-align:center">${r.due || '-'}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted">ยังไม่มีการมอบหมาย</div>`;
  }
  draw();
}

// ---------- ความคืบหน้า (เรียน + สอบ) ----------
async function renderProgress(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>ความคืบหน้า</h1><div class="muted">กำลังโหลด...</div>`;
  let team = '';
  async function draw() {
    const rows = await rpc('app_admin_progress', team ? { p_team: team } : {});
    v.innerHTML = `<h1>ความคืบหน้า (เรียน + สอบ)</h1>
      <div class="card" style="display:flex;gap:10px;align-items:center"><span class="muted">ทีม:</span>
        <select id="pTeam" style="${SS}"><option value="">ทุกทีม</option>${teamOpts(team)}</select></div>
      <div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="text-align:left;padding:10px 12px">ชื่อ</th><th style="text-align:left;padding:10px 12px">ทีม</th><th style="padding:10px 12px">เรียนจบ</th><th style="padding:10px 12px">สอบผ่าน</th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px">${esc(r.name || r.email)}</td><td style="padding:8px 12px">${esc(r.team || '')}</td>
          <td style="padding:8px 12px;text-align:center">${r.lessons_done}/${r.lessons_total}</td>
          <td style="padding:8px 12px;text-align:center">${r.quizzes_passed}/${r.quizzes_total}</td></tr>`).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีข้อมูล</td></tr>`}</tbody></table></div>`;
    $('#pTeam').addEventListener('change', e => { team = e.target.value; draw(); });
  }
  draw();
}

// ---------- ใบประกาศ ----------
async function renderCerts(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>ใบประกาศ</h1><div class="muted">กำลังโหลด...</div>`;
  const users = await rpc('app_admin_list_users', {});
  function draw() {
    v.innerHTML = `<h1>ใบประกาศ</h1>
      <div class="card" style="max-width:560px"><h2>ออกใบประกาศ</h2>
        <div class="field"><label>ผู้รับ</label><select id="cUser" style="${SS};width:100%">${users.map(u => `<option value="${u.id}">${esc(u.name || u.email)} (${esc(u.email)})</option>`).join('')}</select></div>
        <div class="field"><label>หัวข้อ/หลักสูตร</label><input id="cTitle" value="ผ่านการอบรมปฐมนิเทศ (Orientation)"></div>
        <div class="login-err" id="cErr" style="margin:0 0 10px"></div>
        <button class="btn btn-primary" id="cBtn">ออกใบประกาศ</button>
      </div>
      <div id="cView"></div>
      <div class="card"><h2>ใบประกาศที่ออกแล้ว</h2><div id="cList" class="muted">กำลังโหลด...</div></div>`;
    $('#cBtn').addEventListener('click', async () => {
      const btn = $('#cBtn'); btn.disabled = true;
      try {
        const r = await rpc('app_admin_issue_cert', { p_user_id: $('#cUser').value, p_title: $('#cTitle').value.trim() });
        showCert(r); loadList();
      } catch (e) { $('#cErr').textContent = 'ออกใบประกาศไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    loadList();
  }
  function showCert(r) {
    const d = new Date(r.date); const ds = isNaN(d) ? r.date : d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    $('#cView').innerHTML = `<div class="card" style="text-align:center;border:3px solid var(--teal);padding:34px" id="certBox">
      <div style="color:var(--orange);font-weight:700;letter-spacing:.1em">CERTIFICATE · ใบประกาศนียบัตร</div>
      <h2 style="font-size:22px;margin:16px 0 6px">ขอมอบให้เพื่อแสดงว่า</h2>
      <div style="font-size:28px;font-weight:700;color:var(--teal-700);margin:8px 0">${esc(r.name)}</div>
      <div style="margin:6px 0 14px">${esc(r.title)}</div>
      <div class="muted">เลขที่ ${r.no} · ออกให้ ณ วันที่ ${ds}</div>
      <div style="margin-top:22px"><b>E-Learning Platform</b></div></div>
      <div style="text-align:center;margin-bottom:16px"><button class="btn btn-teal" onclick="window.print()">🖨 พิมพ์ / บันทึกเป็น PDF</button></div>`;
    $('#cView').scrollIntoView({ behavior: 'smooth' });
  }
  async function loadList() {
    const rows = await rpc('app_admin_certs'); const el = $('#cList'); if (!el) return;
    el.innerHTML = rows.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="padding:8px 10px">เลขที่</th><th style="text-align:left;padding:8px 10px">ชื่อ</th><th style="text-align:left;padding:8px 10px">หลักสูตร</th><th style="padding:8px 10px">วันที่</th></tr></thead>
      <tbody>${rows.map(r => `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 10px;text-align:center">${r.no}</td><td style="padding:7px 10px">${esc(r.name)}</td><td style="padding:7px 10px">${esc(r.title || '')}</td><td style="padding:7px 10px;text-align:center">${r.date}</td></tr>`).join('')}</tbody></table></div>` : `<div class="muted">ยังไม่มีใบประกาศ</div>`;
  }
  draw();
}

// ---------- จัดการบทเรียน ----------
async function renderManageLessons(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  let team = CATALOG.active_team;
  async function draw() {
    const cat = await rpc('app_catalog', { p_team: team });
    team = cat.active_team;
    v.innerHTML = `<h1>จัดการบทเรียน</h1>
      <div class="card" style="display:flex;gap:10px;align-items:center"><span class="muted">ทีม:</span>
        <select id="mTeam" style="${SS}">${teamOpts(team)}</select></div>
      <div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="text-align:left;padding:10px 12px">หมวด</th><th style="text-align:left;padding:10px 12px">ชื่อบทเรียน</th><th style="padding:10px 12px">จัดการ</th></tr></thead>
        <tbody>${cat.lessons.length ? cat.lessons.map(l => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px">${esc(l.section || '')}</td><td style="padding:8px 12px">${esc(l.title)}</td>
          <td style="padding:8px 12px;text-align:center;white-space:nowrap">
            <button class="btn btn-ghost mEdit" data-id="${l.id}" data-title="${esc(l.title)}" data-section="${esc(l.section || '')}" style="padding:6px 12px">แก้ชื่อ</button>
            <button class="btn mDel" data-id="${l.id}" data-title="${esc(l.title)}" style="padding:6px 12px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('') : `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีบทเรียน</td></tr>`}</tbody></table></div>
      <p class="muted" style="font-size:13px">* แก้ไขเนื้อหาในบท (สไลด์/วิดีโอ/ข้อความ) ทำผ่านคลังบทเรียนเดิมแล้วนำเข้าซ้ำได้ หรือแจ้งผมเพิ่มตัวแก้บล็อกในเว็บ</p>`;
    $('#mTeam').addEventListener('change', e => { team = e.target.value; draw(); });
    v.querySelectorAll('.mEdit').forEach(b => b.addEventListener('click', async () => {
      const nt = prompt('ชื่อบทเรียน:', b.getAttribute('data-title')); if (nt === null) return;
      const ns = prompt('หมวด/Section:', b.getAttribute('data-section')); if (ns === null) return;
      await rpc('app_admin_update_lesson', { p_lesson_id: b.getAttribute('data-id'), p_title: nt.trim(), p_section: ns.trim(), p_order: 0 }); draw();
    }));
    v.querySelectorAll('.mDel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('ลบบทเรียน "' + b.getAttribute('data-title') + '" ?\n(ลบเนื้อหาทั้งบท)')) return;
      await rpc('app_admin_delete_lesson', { p_lesson_id: b.getAttribute('data-id') }); draw();
    }));
  }
  draw();
}

// ---------- แอดมิน: จัดการผู้ใช้ (เต็ม) ----------
async function renderAdmin(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>จัดการผู้ใช้</h1><div class="muted">กำลังโหลด...</div>`;
  let team = '', users = [];
  async function load() { users = await rpc('app_admin_list_users', team ? { p_team: team } : {}); }
  await load();
  const inp = 'width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-family:inherit';
  function draw() {
    v.innerHTML = `<h1>จัดการผู้ใช้</h1>
      <div class="card" style="max-width:500px"><h2>สร้างบัญชีใหม่</h2>
        <div class="field"><label>ชื่อ-สกุล</label><input id="aName"></div>
        <div class="field"><label>อีเมล</label><input id="aEmail" type="email"></div>
        <div class="field"><label>รหัสผ่านตั้งต้น</label><input id="aPass"></div>
        <div class="field"><label>สิทธิ์</label><select id="aRole" style="${inp}"><option value="agent">ผู้เรียน (agent)</option><option value="admin">ผู้ดูแล (admin)</option></select></div>
        <div class="field"><label>ทีม</label><select id="aTeamSel" style="${inp}">${teamOpts()}</select></div>
        <div class="login-err" id="aErr" style="margin:0 0 10px"></div>
        <button class="btn btn-primary" id="aBtn">สร้างบัญชี</button></div>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0">รายชื่อผู้ใช้ (${users.length})</h2>
        <select id="uTeam" style="${SS}"><option value="">ทุกทีม</option>${teamOpts(team)}</select></div>
        <div style="overflow:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="text-align:left;padding:8px 10px">ชื่อ</th><th style="text-align:left;padding:8px 10px">อีเมล</th><th style="padding:8px 10px">ทีม</th><th style="padding:8px 10px">สิทธิ์</th><th style="padding:8px 10px">จัดการ</th></tr></thead>
          <tbody>${users.map(u => `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 10px">${esc(u.name || '')}</td><td style="padding:7px 10px">${esc(u.email)}</td><td style="padding:7px 10px;text-align:center">${esc(u.team || '')}</td><td style="padding:7px 10px;text-align:center">${u.role === 'admin' ? '👑 admin' : 'agent'}</td>
            <td style="padding:7px 10px;text-align:center;white-space:nowrap">
              <button class="btn btn-ghost uReset" data-id="${u.id}" style="padding:5px 10px">รีเซ็ตรหัส</button>
              <button class="btn uDel" data-id="${u.id}" data-name="${esc(u.name || u.email)}" style="padding:5px 10px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#aBtn').addEventListener('click', async () => {
      const btn = $('#aBtn'); btn.disabled = true; $('#aErr').style.color = 'var(--danger)'; $('#aErr').textContent = '';
      try {
        await rpc('app_admin_create_user', { p_email: $('#aEmail').value.trim(), p_password: $('#aPass').value, p_name: $('#aName').value.trim(), p_role: $('#aRole').value, p_team: $('#aTeamSel').value });
        $('#aName').value = $('#aEmail').value = $('#aPass').value = ''; await load(); draw();
      } catch (e) { $('#aErr').textContent = String(e.message || '').includes('duplicate') ? 'อีเมลนี้มีอยู่แล้ว' : 'สร้างไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    $('#uTeam').addEventListener('change', async e => { team = e.target.value; await load(); draw(); });
    v.querySelectorAll('.uReset').forEach(b => b.addEventListener('click', async () => {
      const np = prompt('ตั้งรหัสผ่านใหม่ (อย่างน้อย 6 ตัว):'); if (!np) return;
      if (np.length < 6) { alert('รหัสผ่านสั้นเกินไป'); return; }
      try { await rpc('app_admin_reset_password', { p_user_id: b.getAttribute('data-id'), p_new: np }); alert('รีเซ็ตรหัสผ่านเรียบร้อย'); } catch (e) { alert('ไม่สำเร็จ'); }
    }));
    v.querySelectorAll('.uDel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('ลบผู้ใช้ "' + b.getAttribute('data-name') + '" ?')) return;
      try { await rpc('app_admin_delete_user', { p_user_id: b.getAttribute('data-id') }); await load(); draw(); }
      catch (e) { alert(String(e.message || '').includes('self') ? 'ลบบัญชีตัวเองไม่ได้' : 'ลบไม่สำเร็จ'); }
    }));
  }
  draw();
}
