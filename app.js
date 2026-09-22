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
  $('#userMenuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#userMenu').classList.toggle('hidden'); });
  $('#menuPass').addEventListener('click', () => { $('#userMenu').classList.add('hidden'); go('account'); });
  document.addEventListener('click', () => $('#userMenu').classList.add('hidden'));
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
  if (['home', 'lessons', 'quizzes', 'typing', 'account', 'assign', 'progress', 'dashboard', 'cert', 'managelessons', 'admin'].includes(name)) setActiveNav(name);
  if (name === 'home') return renderHome(v);
  if (name === 'lessons') return renderList(v, 'lesson');
  if (name === 'quizzes') return renderList(v, 'quiz');
  if (name === 'typing') return renderTyping(v);
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
  const sel = { team: '', quiz: '', res: '', q: '' };
  const fmtd = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); };
  const teams = [...new Set(rows.map(r => r.team).filter(Boolean))];
  const quizzes = [...new Set(rows.map(r => r.quiz).filter(Boolean))];
  const PAL = ['#198E8F', '#21BDBE', '#F68920', '#FCBC17', '#8b5cf6', '#0ea5e9', '#16a34a', '#e05252'];
  const ss = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
  const opt = (arr, cur) => arr.map(x => `<option value="${esc(x)}" ${cur === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
  let charts = {};

  function draw() {
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (_) {} }); charts = {};
    const f = rows.filter(r => (!sel.team || r.team === sel.team) && (!sel.quiz || r.quiz === sel.quiz)
      && (!sel.res || (sel.res === 'pass' ? r.pass : !r.pass))
      && (!sel.q || String(r.name || '').toLowerCase().includes(sel.q)));
    const attempts = f.length, trainees = new Set(f.map(r => r.email)).size, passed = f.filter(r => r.pass).length;
    const rate = attempts ? Math.round(passed / attempts * 1000) / 10 : 0;
    const avg = attempts ? Math.round(f.reduce((a, b) => a + (+b.pct || 0), 0) / attempts * 10) / 10 : 0;
    const kpi = (k, val, d, c) => `<div class="tile" style="border-left:5px solid ${c}"><div class="k">${k}</div><div class="t" style="font-size:28px">${val}</div><div class="m">${d}</div></div>`;
    v.innerHTML = `<h1>แดชบอร์ดผลสอบ</h1>
      <div class="grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:6px">
        ${kpi('จำนวนครั้งสอบ', attempts, 'ในช่วงที่เลือก', '#198E8F')}
        ${kpi('ผู้เข้าสอบ', trainees, 'จำนวนคน', '#21BDBE')}
        ${kpi('อัตราสอบผ่าน', rate + '%', passed + ' / ' + attempts + ' ผ่าน', rate >= 80 ? '#16a34a' : rate >= 60 ? '#F68920' : '#e05252')}
        ${kpi('คะแนนเฉลี่ย', avg + '%', 'เฉลี่ยทุกครั้ง', '#8b5cf6')}
      </div>
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <select id="fTeam" style="${ss}"><option value="">ทุกทีม</option>${opt(teams, sel.team)}</select>
        <select id="fQuiz" style="${ss}"><option value="">ทุกชุดข้อสอบ</option>${opt(quizzes, sel.quiz)}</select>
        <select id="fRes" style="${ss}"><option value="">ทุกผล</option><option value="pass" ${sel.res==='pass'?'selected':''}>ผ่าน</option><option value="fail" ${sel.res==='fail'?'selected':''}>ไม่ผ่าน</option></select>
        <input id="fQ" placeholder="ค้นหาชื่อ..." style="${ss};flex:1;min-width:140px" value="${esc(sel.q)}">
        <button class="btn btn-ghost" id="fReset">ล้างตัวกรอง</button>
        <button class="btn btn-teal" id="dCsv">⬇ CSV</button>
      </div>
      <div class="grid" style="grid-template-columns:1.3fr 1fr;margin-bottom:16px">
        <div class="card"><h2 style="font-size:15px">อัตราสอบผ่านแต่ละชุด</h2><div style="position:relative;height:300px"><canvas id="cTest"></canvas></div></div>
        <div class="card"><h2 style="font-size:15px">ผลรวม ผ่าน/ไม่ผ่าน</h2><div style="position:relative;height:300px"><canvas id="cPie"></canvas></div></div>
      </div>
      <div class="card"><h2 style="font-size:15px">จำนวนครั้งสอบตามเดือน</h2><div style="position:relative;height:260px"><canvas id="cTime"></canvas></div></div>
      <div class="card" style="padding:0;overflow:auto">
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:#f0faf9;color:var(--teal-700)">
            <th style="text-align:left;padding:10px 12px">วันที่</th><th style="text-align:left;padding:10px 12px">ชื่อ</th>
            <th style="text-align:left;padding:10px 12px">ทีม</th><th style="text-align:left;padding:10px 12px">ชุดข้อสอบ</th>
            <th style="padding:10px 12px">คะแนน</th><th style="padding:10px 12px">%</th><th style="padding:10px 12px">ผล</th></tr></thead>
          <tbody>${f.length ? f.slice(0, 300).map(r => `<tr style="border-top:1px solid var(--line)">
            <td style="padding:8px 12px;white-space:nowrap">${fmtd(r.created)}</td>
            <td style="padding:8px 12px">${esc(r.name || '')}</td><td style="padding:8px 12px">${esc(r.team || '')}</td>
            <td style="padding:8px 12px">${esc(r.quiz || '')}</td>
            <td style="padding:8px 12px;text-align:center">${r.score}/${r.total}</td>
            <td style="padding:8px 12px;text-align:center">${r.pct}</td>
            <td style="padding:8px 12px;text-align:center"><span class="st ${r.pass ? 'ok' : ''}" style="${r.pass ? '' : 'background:#FBEAEA;color:var(--danger)'}">${r.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</span></td>
          </tr>`).join('') : `<tr><td colspan="7" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีข้อมูล</td></tr>`}</tbody>
        </table>
        ${f.length > 300 ? `<div class="muted" style="padding:10px;text-align:center">แสดง 300 แถวแรก · ดาวน์โหลด CSV เพื่อดูทั้งหมด</div>` : ''}
      </div>`;
    const qs = quizzes.filter(q => f.some(r => r.quiz === q));
    const byQ = qs.map(q => { const rr = f.filter(r => r.quiz === q); const p = rr.filter(r => r.pass).length; return rr.length ? Math.round(p / rr.length * 1000) / 10 : 0; });
    if (window.Chart) {
      charts.cTest = new Chart($('#cTest'), { type: 'bar', data: { labels: qs, datasets: [{ data: byQ, backgroundColor: qs.map((_, i) => PAL[i % PAL.length]), borderRadius: 6, maxBarThickness: 46 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.raw + '% ผ่าน' } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: x => x + '%' } }, x: { grid: { display: false } } } } });
      charts.cPie = new Chart($('#cPie'), { type: 'doughnut', data: { labels: ['ผ่าน', 'ไม่ผ่าน'], datasets: [{ data: [passed, attempts - passed], backgroundColor: ['#16a34a', '#e05252'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
      const bk = {}; f.forEach(r => { const d = new Date(r.created); if (isNaN(d)) return; const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); bk[k] = bk[k] || { n: 0, p: 0 }; bk[k].n++; if (r.pass) bk[k].p++; });
      const keys = Object.keys(bk).sort();
      charts.cTime = new Chart($('#cTime'), { type: 'line', data: { labels: keys, datasets: [{ label: 'สอบ', data: keys.map(k => bk[k].n), borderColor: '#198E8F', backgroundColor: 'rgba(25,142,143,.1)', fill: true, tension: .3 }, { label: 'ผ่าน', data: keys.map(k => bk[k].p), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.08)', fill: true, tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    }
    $('#fTeam').addEventListener('change', e => { sel.team = e.target.value; draw(); });
    $('#fQuiz').addEventListener('change', e => { sel.quiz = e.target.value; draw(); });
    $('#fRes').addEventListener('change', e => { sel.res = e.target.value; draw(); });
    $('#fQ').addEventListener('input', e => { sel.q = e.target.value.toLowerCase(); clearTimeout(window.__dq); window.__dq = setTimeout(draw, 350); });
    $('#fReset').addEventListener('click', () => { sel.team = sel.quiz = sel.res = sel.q = ''; draw(); });
    $('#dCsv').addEventListener('click', () => {
      const head = ['วันที่', 'ชื่อ', 'อีเมล', 'ทีม', 'ชุดข้อสอบ', 'คะแนน', 'เต็ม', '%', 'ผล'];
      const lines = [head.join(',')].concat(f.map(r => [fmtd(r.created), r.name, r.email, r.team, r.quiz, r.score, r.total, r.pct, r.pass ? 'ผ่าน' : 'ไม่ผ่าน'].map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'results.csv'; a.click();
    });
    const qi = $('#fQ'); if (sel.q && qi) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
  }
  draw();
}

const SS = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
const teamName = (id) => (CATALOG.teams.find(t => t.id === id) || {}).name || '';
const teamOpts = (cur) => (CATALOG.teams || []).map(t => `<option value="${t.id}" ${cur === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('');
const teamKeyOf = (id) => { const n = teamName(id); return /Makro/i.test(n) ? 'Makro' : /Lotus/i.test(n) ? 'Lotus' : 'Center'; };

// ---------- ข้อสอบพิมพ์ดีด ----------
const TYPING_SECS = 60;
const TYPING = [
  { id: 'th1', lang: 'th', title: 'พิมพ์ดีดไทย — ชุดที่ 1', text: 'การพิมพ์ดีดเป็นทักษะสำคัญในการทำงานยุคปัจจุบัน การฝึกฝนอย่างสม่ำเสมอจะช่วยให้พิมพ์ได้เร็วและแม่นยำมากขึ้น ควรวางนิ้วให้ถูกตำแหน่งและมองที่หน้าจอแทนการมองแป้นพิมพ์' },
  { id: 'th2', lang: 'th', title: 'พิมพ์ดีดไทย — ชุดที่ 2', text: 'บริษัท ดิจิเซิร์ฟ คอร์ปอเรชัน มุ่งมั่นพัฒนาบุคลากรให้มีความสามารถรอบด้าน การสื่อสารที่รวดเร็วและถูกต้องเป็นหัวใจของงานบริการลูกค้า พนักงานทุกคนควรฝึกพิมพ์ให้คล่องเพื่อเพิ่มประสิทธิภาพในการทำงาน' },
  { id: 'en1', lang: 'en', title: 'Typing Test (English) — Set 1', text: 'The quick brown fox jumps over the lazy dog. Practice typing every day to improve your speed and accuracy. Good posture and correct finger placement are the keys to becoming a fast and confident typist.' },
  { id: 'en2', lang: 'en', title: 'Typing Test (English) — Set 2', text: 'Digiserve Corporation is committed to developing skilled and reliable teams. Clear and quick communication is the heart of great customer service. Keep practicing to type faster while keeping your accuracy high.' }
];
async function renderTyping(v) {
  v.innerHTML = `<h1>ข้อสอบพิมพ์ดีด</h1><div class="muted">กำลังโหลด...</div>`;
  let best = {};
  try { (await rpc('app_typing_mine')).forEach(r => best[r.set] = r); } catch (_) {}
  v.innerHTML = `<h1>ข้อสอบพิมพ์ดีด</h1>
    <p class="muted">พิมพ์ตามข้อความให้เร็วและแม่นยำที่สุดใน ${TYPING_SECS} วินาที · วัดผลเป็น WPM (คำ/นาที) และความแม่นยำ</p>
    <div class="grid">${TYPING.map(t => `<div class="tile" data-id="${t.id}"><div class="k">${t.lang === 'th' ? 'ภาษาไทย' : 'English'}</div><div class="t">${esc(t.title)}</div>
      <div class="m">${best[t.id] ? `สถิติดีสุด: ${best[t.id].wpm} WPM · แม่นยำ ${best[t.id].acc}%` : 'ยังไม่เคยทำ'}</div></div>`).join('')}</div>`;
  v.querySelectorAll('[data-id]').forEach(el => el.addEventListener('click', () => runTyping(v, TYPING.find(t => t.id === el.getAttribute('data-id')))));
}
function runTyping(v, set) {
  const target = set.text; let t0 = null, done = false, iv = null;
  function calc(val) {
    let correct = 0; for (let i = 0; i < val.length && i < target.length; i++) if (val[i] === target[i]) correct++;
    const el = t0 ? Math.min((Date.now() - t0) / 1000, TYPING_SECS) : 0;
    const wpm = el > 0 ? Math.round((correct / 5) / (el / 60)) : 0;
    const acc = val.length ? Math.round(correct / Math.min(val.length, target.length) * 100) : 100;
    return { el, wpm, acc, correct };
  }
  function finish() {
    if (done) return; done = true; clearInterval(iv);
    const c = calc($('#tyInput').value);
    rpc('app_typing_submit', { p_set: set.id, p_lang: set.lang, p_wpm: c.wpm, p_acc: c.acc, p_chars: c.correct, p_secs: Math.round(c.el) }).catch(() => {});
    v.innerHTML = `<div class="card" style="text-align:center">
      <div class="eyebrow">${esc(set.title)}</div>
      <div style="font-size:54px;font-weight:700;color:var(--teal-700)">${c.wpm} <span style="font-size:22px">WPM</span></div>
      <div class="muted">ความแม่นยำ ${c.acc}% · เวลา ${Math.round(c.el)} วินาที</div>
      <p style="font-weight:600;color:var(--success)">บันทึกผลเรียบร้อย ✓</p></div>
      <div style="text-align:center;display:flex;gap:10px;justify-content:center">
        <button class="btn btn-ghost" id="tyBack">กลับ</button>
        <button class="btn btn-primary" id="tyRetry">ทำอีกครั้ง</button></div>`;
    $('#tyBack').addEventListener('click', () => renderTyping(v));
    $('#tyRetry').addEventListener('click', () => runTyping(v, set));
  }
  v.innerHTML = `<a class="muted" style="cursor:pointer" id="tyExit">← กลับ</a>
    <h1>${esc(set.title)}</h1>
    <div style="display:flex;gap:16px;margin-bottom:10px">
      <span class="timer" id="tyTime">${TYPING_SECS}.0</span>
      <span class="timer" style="background:#fff">WPM: <b id="tyWpm">0</b></span>
      <span class="timer" style="background:#fff">แม่นยำ: <b id="tyAcc">100</b>%</span></div>
    <div class="lessontext" style="line-height:2;font-size:17px;user-select:none" id="tyTarget">${esc(target)}</div>
    <textarea id="tyInput" rows="4" placeholder="เริ่มพิมพ์ที่นี่ (จับเวลาเมื่อพิมพ์ตัวแรก)" style="width:100%;padding:12px 14px;border:1px solid var(--line);border-radius:10px;font-family:inherit;font-size:16px;box-sizing:border-box"></textarea>
    <div style="text-align:right;margin-top:10px"><button class="btn btn-teal" id="tyDone">ส่งผล</button></div>`;
  $('#tyExit').addEventListener('click', () => renderTyping(v));
  $('#tyDone').addEventListener('click', finish);
  const inp = $('#tyInput'); inp.focus();
  inp.addEventListener('input', () => {
    if (!t0) {
      t0 = Date.now();
      iv = setInterval(() => {
        const c = calc(inp.value); const left = Math.max(0, TYPING_SECS - c.el);
        $('#tyTime').textContent = left.toFixed(1); $('#tyWpm').textContent = c.wpm; $('#tyAcc').textContent = c.acc;
        if (left <= 0) finish();
      }, 100);
    }
    const c = calc(inp.value); $('#tyWpm').textContent = c.wpm; $('#tyAcc').textContent = c.acc;
    if (inp.value.length >= target.length) finish();
  });
}

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

// ---------- ใบประกาศ (ดีไซน์เดิม SVG) ----------
function fmtMonthYear(dateStr) { const d = new Date(dateStr); if (isNaN(d)) return dateStr || ''; return d.toLocaleDateString('en-US', { month: 'long' }) + ', ' + d.getFullYear(); }
function certSvg(c) {
  const GOLD = '#C19A43', GOLD2 = '#B8902F', CHAR = '#3B3B3B', NAVY = '#2B3640', BLACK = '#1d1d1d', TEAL = '#5AA7B8', TEALD = '#3E8DA0', ORANGE = '#EC8B3C';
  const corner = `<path d="M 372,0 C 392,340 278,592 0,672 L 0,556 C 256,476 328,300 276,0 Z" fill="${TEAL}" opacity="0.85"/><path d="M 256,0 C 274,306 178,528 0,590 L 0,518 C 154,462 214,298 172,0 Z" fill="${ORANGE}"/><path d="M 150,0 C 164,250 96,432 0,474 L 0,424 C 96,388 142,256 112,0 Z" fill="${TEALD}" opacity="0.5"/>`;
  return `<svg viewBox="0 0 2000 1414" xmlns="http://www.w3.org/2000/svg" font-family="Georgia, serif" style="width:100%;height:auto;display:block;box-shadow:0 6px 22px rgba(0,0,0,.14);border-radius:4px;background:#fff">
    <rect width="2000" height="1414" fill="#ffffff"/>
    <g>${corner}</g><g transform="rotate(180 1000 707)">${corner}</g>
    <path d="M 845,72 L 1928,72 L 1928,648" fill="none" stroke="${GOLD}" stroke-width="7"/>
    <path d="M 1155,1342 L 72,1342 L 72,766" fill="none" stroke="${GOLD}" stroke-width="7"/>
    <g transform="translate(892 44) scale(0.545)">
      <path d="M 150,20 C 210,40 268,84 304,138 C 316,157 313,170 297,186 C 238,230 180,262 132,293 C 146,200 149,110 150,20 Z" fill="#26B6BE"/>
      <path d="M 132,293 C 96,220 82,135 108,66 C 116,44 138,36 150,52 C 150,120 149,205 132,293 Z" fill="#F2871E"/>
      <path d="M 150,50 C 151,120 150,205 133,292 C 141,205 139,120 140,52 C 143,49 147,49 150,50 Z" fill="#FBB315"/></g>
    <text x="1000" y="292" text-anchor="middle" font-size="46" font-weight="700" fill="${NAVY}" letter-spacing="3">DIGISERVE</text>
    <text x="1000" y="326" text-anchor="middle" font-size="20" fill="#5A6670" letter-spacing="9">CORPORATION</text>
    <text x="1000" y="442" text-anchor="middle" font-size="38" font-weight="700" fill="${GOLD2}">${esc(c.monthYear)}</text>
    <text x="1000" y="528" text-anchor="middle" font-size="50" font-weight="700" fill="${CHAR}" letter-spacing="2">${esc(c.title1)}</text>
    <text x="1000" y="638" text-anchor="middle" font-size="86" font-weight="700" fill="${GOLD}">${esc(c.title2)}</text>
    <text x="1000" y="716" text-anchor="middle" font-size="32" font-weight="700" fill="${BLACK}" letter-spacing="2">THIS CERTIFICATE IS PRESENTED TO</text>
    <text x="1000" y="840" text-anchor="middle" font-size="62" font-style="italic" fill="${NAVY}">${esc(c.name)}</text>
    <line x1="360" y1="884" x2="1640" y2="884" stroke="${GOLD}" stroke-width="3"/>
    <line x1="820" y1="1116" x2="1180" y2="1116" stroke="${GOLD}" stroke-width="3"/>
    <text x="1000" y="1176" text-anchor="middle" font-size="36" font-weight="700" fill="${NAVY}">Anuchit Khamnoi</text>
    <text x="1000" y="1228" text-anchor="middle" font-size="30" fill="#333333">Chief Executive Officer</text>
    <text x="1000" y="1272" text-anchor="middle" font-size="28" fill="${NAVY}" letter-spacing="1">DIGISERVE CORPORATION CO., LTD.</text>
    <text x="96" y="1378" font-size="20" fill="#a7a7a7" letter-spacing="1">${esc(String(c.no))}</text></svg>`;
}
async function renderCerts(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>ใบประกาศ</h1><div class="muted">กำลังโหลด...</div>`;
  const users = await rpc('app_admin_list_users', {});
  const inp = 'width:100%;padding:11px 13px;border:1px solid var(--line);border-radius:10px;font-family:inherit';
  function draw() {
    v.innerHTML = `<h1>ใบประกาศ</h1>
      <div class="card" style="max-width:600px"><h2>ออกใบประกาศ</h2>
        <div class="field"><label>ผู้รับ (บัญชี)</label><select id="cUser" style="${inp}">${users.map(u => `<option value="${u.id}">${esc(u.name || u.email)} (${esc(u.email)})</option>`).join('')}</select></div>
        <div class="field"><label>ชื่อบนใบประกาศ (แก้ได้)</label><input id="cName" style="${inp}" value="${esc(users[0] ? (users[0].name || users[0].email) : '')}"></div>
        <div class="field"><label>บรรทัดที่ 1 (หัวข้อ)</label><input id="cT1" style="${inp}" value="CERTIFICATE OF COMPLETION"></div>
        <div class="field"><label>บรรทัดที่ 2 (หลักสูตร/รางวัล — ตัวใหญ่สีทอง)</label><input id="cT2" style="${inp}" value="ผ่านการอบรมปฐมนิเทศ (Orientation)"></div>
        <div class="login-err" id="cErr" style="margin:0 0 10px"></div>
        <button class="btn btn-primary" id="cBtn">ออกใบประกาศ</button>
      </div>
      <div id="cView"></div>
      <div class="card"><h2>ใบประกาศที่ออกแล้ว</h2><div id="cList" class="muted">กำลังโหลด...</div></div>`;
    $('#cUser').addEventListener('change', (e) => { const u = users.find(x => x.id === e.target.value); $('#cName').value = u ? (u.name || u.email) : ''; });
    $('#cBtn').addEventListener('click', async () => {
      const btn = $('#cBtn'); btn.disabled = true;
      const t1 = $('#cT1').value.trim(), t2 = $('#cT2').value.trim();
      try {
        const r = await rpc('app_admin_issue_cert', { p_user_id: $('#cUser').value, p_title: t1 + '|||' + t2, p_name: $('#cName').value.trim() });
        showCert({ no: r.no, name: r.name, title1: t1, title2: t2, monthYear: fmtMonthYear(r.date) }); loadList();
      } catch (e) { $('#cErr').textContent = 'ออกใบประกาศไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    loadList();
  }
  function showCert(c) {
    $('#cView').innerHTML = `<div class="card" style="padding:16px">${certSvg(c)}</div>
      <div style="text-align:center;margin-bottom:16px"><button class="btn btn-teal" id="cPrint">🖨 พิมพ์ / บันทึกเป็น PDF</button></div>`;
    $('#cPrint').addEventListener('click', () => {
      const w = window.open('', '_blank');
      w.document.write(`<html><head><title>Certificate ${esc(String(c.no))}</title><style>@page{size:landscape}body{margin:0}svg{width:100%;height:auto}</style></head><body>${certSvg(c)}</body></html>`);
      w.document.close(); setTimeout(() => w.print(), 300);
    });
    $('#cView').scrollIntoView({ behavior: 'smooth' });
  }
  async function loadList() {
    const rows = await rpc('app_admin_certs'); const el = $('#cList'); if (!el) return;
    el.innerHTML = rows.length ? `<div style="overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="padding:8px 10px">เลขที่</th><th style="text-align:left;padding:8px 10px">ชื่อ</th><th style="text-align:left;padding:8px 10px">หลักสูตร</th><th style="padding:8px 10px">วันที่</th><th style="padding:8px 10px"></th></tr></thead>
      <tbody>${rows.map(r => { const p = String(r.title || '').split('|||'); return `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 10px;text-align:center">${r.no}</td><td style="padding:7px 10px">${esc(r.name)}</td><td style="padding:7px 10px">${esc(p[1] || p[0] || '')}</td><td style="padding:7px 10px;text-align:center">${r.date}</td><td style="padding:7px 10px;text-align:center"><button class="btn btn-ghost cOpen" data-no="${r.no}" data-name="${esc(r.name)}" data-t1="${esc(p[0] || '')}" data-t2="${esc(p[1] || '')}" data-date="${r.date}" style="padding:5px 10px">เปิด</button></td></tr>`; }).join('')}</tbody></table></div>` : `<div class="muted">ยังไม่มีใบประกาศ</div>`;
    v.querySelectorAll('.cOpen').forEach(b => b.addEventListener('click', () => showCert({ no: b.getAttribute('data-no'), name: b.getAttribute('data-name'), title1: b.getAttribute('data-t1'), title2: b.getAttribute('data-t2'), monthYear: fmtMonthYear(b.getAttribute('data-date')) })));
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
        <select id="mTeam" style="${SS}">${teamOpts(team)}</select>
        <button class="btn btn-primary" id="mAdd" style="margin-left:auto">+ เพิ่มบทเรียนใหม่</button></div>
      <div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f0faf9;color:var(--teal-700)"><th style="text-align:left;padding:10px 12px">หมวด</th><th style="text-align:left;padding:10px 12px">ชื่อบทเรียน</th><th style="padding:10px 12px">จัดการ</th></tr></thead>
        <tbody>${cat.lessons.length ? cat.lessons.map(l => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px">${esc(l.section || '')}</td><td style="padding:8px 12px">${esc(l.title)}</td>
          <td style="padding:8px 12px;text-align:center;white-space:nowrap">
            <button class="btn btn-teal mBlocks" data-id="${l.id}" data-title="${esc(l.title)}" data-section="${esc(l.section || '')}" style="padding:6px 12px">แก้เนื้อหา</button>
            <button class="btn btn-ghost mEdit" data-id="${l.id}" data-title="${esc(l.title)}" data-section="${esc(l.section || '')}" style="padding:6px 12px">แก้ชื่อ</button>
            <button class="btn mDel" data-id="${l.id}" data-title="${esc(l.title)}" style="padding:6px 12px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('') : `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีบทเรียน</td></tr>`}</tbody></table></div>`;
    $('#mTeam').addEventListener('change', e => { team = e.target.value; draw(); });
    $('#mAdd').addEventListener('click', async () => {
      const title = prompt('ชื่อบทเรียนใหม่:'); if (!title || !title.trim()) return;
      const section = prompt('หมวด/Section (เช่น Orientation, DAY 1):') || '';
      try {
        const r = await rpc('app_admin_create_lesson', { p_team: teamKeyOf(team), p_title: title.trim(), p_section: section.trim() });
        renderBlockEditor(v, r.id, title.trim(), section.trim(), teamKeyOf(team), () => draw());
      } catch (e) { alert('สร้างบทเรียนไม่สำเร็จ'); }
    });
    v.querySelectorAll('.mBlocks').forEach(b => b.addEventListener('click', () =>
      renderBlockEditor(v, b.getAttribute('data-id'), b.getAttribute('data-title'), b.getAttribute('data-section'), teamKeyOf(team), () => draw())));
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

// ---------- ตัวแก้เนื้อหาบทเรียน (block editor) ----------
async function renderBlockEditor(v, lessonId, title, section, teamKey, onBack) {
  v.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  const d = await rpc('app_lesson', { p_lesson: lessonId });
  const state = { blocks: (d.blocks || []).map(b => ({ type: b.type, content: b.content || '', url: b.url || '', question: b.question || '', choices: b.choices || [], answer: b.answer, explain: b.explain || '' })) };
  const ta = 'width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px;box-sizing:border-box';
  function sync() {
    state.blocks = [...v.querySelectorAll('[data-blk]')].map(el => {
      const type = el.querySelector('.bType').value; const b = { type };
      if (type === 'text') b.content = el.querySelector('.bContent').value;
      else if (['video', 'image', 'slides'].includes(type)) b.url = el.querySelector('.bUrl').value;
      else if (type === 'check') {
        b.question = el.querySelector('.bQ').value;
        b.choices = el.querySelector('.bChoices').value.split('\n').map(s => s.trim()).filter(Boolean);
        b.answer = (parseInt(el.querySelector('.bAns').value) || 1) - 1;
        b.explain = el.querySelector('.bExplain').value;
      }
      return b;
    });
  }
  function fields(b) {
    const to = (t) => `<option value="${t}" ${b.type === t ? 'selected' : ''}>`;
    const sel = `<select class="bType" style="${SS};margin-bottom:8px">${to('text')}ข้อความ</option>${to('video')}วิดีโอ (YouTube)</option>${to('image')}รูปภาพ (URL)</option>${to('slides')}สไลด์ (Google Slides)</option>${to('check')}เช็คความเข้าใจ</option></select>`;
    let f = '';
    if (b.type === 'text') f = `<textarea class="bContent" rows="4" style="${ta}" placeholder="เนื้อหาข้อความ">${esc(b.content)}</textarea>`;
    else if (b.type === 'video') f = `<input class="bUrl" style="${ta}" placeholder="ลิงก์ YouTube" value="${esc(b.url)}">`;
    else if (b.type === 'image') f = `<input class="bUrl" style="${ta}" placeholder="URL รูปภาพ" value="${esc(b.url)}">`;
    else if (b.type === 'slides') f = `<input class="bUrl" style="${ta}" placeholder="ลิงก์ Google Slides" value="${esc(b.url)}">`;
    else if (b.type === 'check') f = `
      <input class="bQ" style="${ta};margin-bottom:6px" placeholder="คำถาม" value="${esc(b.question)}">
      <textarea class="bChoices" rows="3" style="${ta};margin-bottom:6px" placeholder="ตัวเลือก (บรรทัดละ 1 ข้อ)">${esc((b.choices || []).join('\n'))}</textarea>
      <div style="display:flex;gap:8px"><input class="bAns" type="number" min="1" style="${SS};width:150px" placeholder="ข้อที่ถูก (1-N)" value="${(b.answer ?? 0) + 1}">
      <input class="bExplain" style="${ta}" placeholder="คำอธิบายเฉลย" value="${esc(b.explain)}"></div>`;
    return sel + f;
  }
  function draw() {
    v.innerHTML = `<a class="muted" style="cursor:pointer" id="beBack">← กลับ</a>
      <h1>แก้เนื้อหา: ${esc(title)}</h1>
      <div id="beList">${state.blocks.map((b, i) => `
        <div class="card" data-blk data-idx="${i}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b class="muted">บล็อก ${i + 1}</b>
            <span>
              <button class="btn btn-ghost bUp" data-i="${i}" style="padding:4px 10px" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-ghost bDown" data-i="${i}" style="padding:4px 10px" ${i === state.blocks.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn bDelBlk" data-i="${i}" style="padding:4px 10px;background:#FBEAEA;color:var(--danger)">ลบ</button>
            </span></div>
          ${fields(b)}
        </div>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-ghost" id="beAdd">+ เพิ่มบล็อก</button>
        <button class="btn btn-primary" id="beSave" style="margin-left:auto">💾 บันทึกเนื้อหา</button></div>
      <div class="login-err" id="beMsg"></div>`;
    $('#beBack').addEventListener('click', onBack);
    $('#beAdd').addEventListener('click', () => { sync(); state.blocks.push({ type: 'text', content: '', choices: [] }); draw(); });
    v.querySelectorAll('.bType').forEach((s, i) => s.addEventListener('change', () => { sync(); state.blocks[i].type = s.value; draw(); }));
    v.querySelectorAll('.bUp').forEach(b => b.addEventListener('click', () => { sync(); const i = +b.getAttribute('data-i'); [state.blocks[i - 1], state.blocks[i]] = [state.blocks[i], state.blocks[i - 1]]; draw(); }));
    v.querySelectorAll('.bDown').forEach(b => b.addEventListener('click', () => { sync(); const i = +b.getAttribute('data-i'); [state.blocks[i + 1], state.blocks[i]] = [state.blocks[i], state.blocks[i + 1]]; draw(); }));
    v.querySelectorAll('.bDelBlk').forEach(b => b.addEventListener('click', () => { sync(); state.blocks.splice(+b.getAttribute('data-i'), 1); draw(); }));
    $('#beSave').addEventListener('click', async () => {
      sync(); const btn = $('#beSave'); btn.disabled = true; const m = $('#beMsg');
      try { await rpc('app_admin_save_blocks', { p_lesson_id: lessonId, p_blocks: state.blocks }); m.style.color = 'var(--success)'; m.textContent = 'บันทึกเรียบร้อย ✓'; }
      catch (e) { m.style.color = 'var(--danger)'; m.textContent = 'บันทึกไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
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
