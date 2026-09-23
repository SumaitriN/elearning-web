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
  if (['home', 'lessons', 'quizzes', 'typing', 'account', 'assign', 'progress', 'dashboard', 'questions', 'cert', 'managelessons', 'admin'].includes(name)) setActiveNav(name);
  v.classList.toggle('wide', ['dashboard', 'admin', 'progress', 'assign', 'managelessons', 'questions', 'cert'].includes(name));
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
  if (name === 'questions') return renderQuestions(v);
  if (name === 'cert') return renderCerts(v);
  if (name === 'managelessons') return renderManageLessons(v);
  if (name === 'admin') return renderAdmin(v);
}

// ---------- หน้าหลัก ----------
function renderHome(v) {
  const nl = (CATALOG.lessons || []).length, nq = (CATALOG.quizzes || []).length;
  const admin = ME.role === 'admin';
  const card = (nav, ic, color, title, desc, meta) => `<div class="tile lcard homecard" data-open="${nav}">
    <div class="thumb" style="background:${color}1a;color:${color}">${ic}</div>
    <div style="min-width:0;flex:1">
      <div class="t" style="font-size:16px">${title}</div>
      <div class="m" style="margin:3px 0 6px">${desc}</div>
      <div class="k" style="color:${color}">${meta}</div>
    </div>
    <div style="align-self:center;color:${color};font-size:20px">→</div></div>`;
  let cards = [
    card('lessons', '📚', '#198E8F', 'บทเรียน', 'เรียนรู้ผ่านวิดีโอ สไลด์ และเนื้อหา', `${nl} บทเรียน`),
    card('quizzes', '📝', '#F68920', 'แบบทดสอบ', 'ประเมินความรู้ของคุณ', `${nq} ชุด`),
    card('typing', '⌨️', '#8b5cf6', 'พิมพ์ดีด', 'ฝึกความเร็วและความแม่นยำในการพิมพ์', `4 ชุด`)
  ];
  if (admin) cards = cards.concat([
    card('dashboard', '📊', '#0ea5e9', 'แดชบอร์ดผลสอบ', 'ดูผลสอบและสถิติทั้งหมด', 'สำหรับผู้ดูแล'),
    card('assign', '📤', '#16a34a', 'มอบหมายงาน', 'มอบหมายบทเรียน/แบบทดสอบให้ทีม', 'สำหรับผู้ดูแล'),
    card('admin', '👤', '#d64545', 'จัดการผู้ใช้', 'เพิ่ม แก้ไข รีเซ็ตบัญชีผู้ใช้', 'สำหรับผู้ดูแล')
  ]);
  v.innerHTML = `
    <div class="hero">
      <div class="hero-logo"><img src="${window.LOGO_MARK}" alt="" style="height:52px"></div>
      <div style="min-width:0">
        <div style="font-size:12px;letter-spacing:.08em;opacity:.9;font-weight:600">DIGISERVE E-LEARNING</div>
        <h1 style="margin:5px 0;color:#fff;font-size:26px">สวัสดี ${esc(ME.name || ME.email)} 👋</h1>
        <div style="opacity:.95;font-size:14px">${admin ? 'ผู้ดูแลระบบ · ยินดีต้อนรับกลับมา' : 'ยินดีต้อนรับสู่ระบบอบรมและทดสอบออนไลน์'}</div>
      </div>
    </div>
    <div class="section-title" style="margin-top:20px">เมนูหลัก</div>
    <div class="cardgrid">${cards.join('')}</div>`;
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

// เลือกไอคอน+สีตามหมวด/ชื่อ ให้การ์ดบทเรียนน่าสนใจ
function topicIcon(txt) {
  const s = String(txt || '');
  if (/customer service|บริการ|ลูกค้า|call|chat/i.test(s)) return ['🎧', '#21BDBE'];
  if (/pdpa|compliance|risk|กฎ|ความเสี่ยง|ข้อมูลส่วนบุคคล/i.test(s)) return ['🛡️', '#F68920'];
  if (/orientation|foundation|day 1|ปฐมนิเทศ|เริ่ม/i.test(s)) return ['🚀', '#8b5cf6'];
  if (/soft skill|ทักษะ|communication|สื่อสาร/i.test(s)) return ['💬', '#16a34a'];
  if (/overview|pro app|makro|marketplace|shop|เครื่องมือ|tool/i.test(s)) return ['🧭', '#0ea5e9'];
  if (/pdpa law|กฎหมาย/i.test(s)) return ['⚖️', '#d64545'];
  return ['📘', '#198E8F'];
}
function renderList(v, kind) {
  const items = kind === 'lesson' ? CATALOG.lessons : CATALOG.quizzes;
  const title = kind === 'lesson' ? 'บทเรียน' : 'แบบทดสอบ';
  const thumb = (ic) => `<div class="thumb" style="background:${ic[1]}1a;color:${ic[1]}">${ic[0]}</div>`;
  const body = (!items || !items.length)
    ? `<div class="card muted">ยังไม่มีรายการ</div>`
    : `<div class="cardgrid">` + items.map(it => {
        if (kind === 'lesson') {
          const ic = topicIcon((it.section || '') + ' ' + it.title);
          return `<div class="tile lcard" data-id="${it.id}">${thumb(ic)}<div style="min-width:0"><div class="k">${esc(it.section || 'บทเรียน')}</div><div class="t">${esc(it.title)}</div><div class="m">▶ เริ่มเรียน</div></div></div>`;
        }
        const ic = topicIcon(it.title);
        return `<div class="tile lcard" data-id="${it.id}">${thumb(['📝', ic[1]])}<div style="min-width:0"><div class="k">แบบทดสอบ</div><div class="t">${esc(it.title)}</div><div class="m">${it.n} ข้อ · ${it.minutes} นาที · ผ่าน ${it.pass}%</div></div></div>`;
      }).join('') + `</div>`;
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
      if (state.left <= 0) { clearInterval(state.timer); submit(true); }
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
    $('#nextBtn').addEventListener('click', () => { if (last) submit(false); else { state.cur++; run(); } });
  }

  async function submit(auto) {
    if (!auto) {
      const missing = [];
      questions.forEach((q, i) => { if (state.ans[i] == null) missing.push(i + 1); });
      if (missing.length) {
        const msg = window.LANG === 'en'
          ? `You have ${missing.length} unanswered question(s): ${missing.join(', ')}.\nSubmit anyway?`
          : `คุณยังไม่ได้ตอบ ${missing.length} ข้อ: ข้อ ${missing.join(', ')}\nต้องการส่งคำตอบเลยหรือไม่?`;
        if (!confirm(msg)) { state.cur = missing[0] - 1; run(); return; }
      }
    }
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
// ---------- วิเคราะห์รายข้อ: ใครทำผิดข้อไหน ----------
async function renderQuestions(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>วิเคราะห์รายข้อ</h1><div class="muted">กำลังโหลด...</div>`;
  const keyOf = n => /Makro/i.test(n) ? 'Makro' : /Lotus/i.test(n) ? 'Lotus' : 'Center';
  let stats;
  try { stats = await rpc('app_admin_qstats', {}); } catch (e) { v.innerHTML = `<div class="card">โหลดข้อมูลไม่สำเร็จ</div>`; return; }
  if (!stats.length) { v.innerHTML = `<h1>วิเคราะห์รายข้อ</h1><div class="card">ยังไม่มีข้อมูลคำตอบรายข้อ — เมื่อมีผู้ทำข้อสอบผ่านเว็บ หรือหลังนำเข้าประวัติเก่า ข้อมูลจะแสดงที่นี่</div>`; return; }
  // รายการชุดสอบ (team ▸ quiz)
  const combos = [];
  stats.forEach(s => { const k = (s.team || '-') + ' ▸ ' + s.quiz; if (!combos.some(c => c.k === k)) combos.push({ k, team: s.team, quiz: s.quiz }); });
  const ss = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
  const state = { i: 0, sort: 'qno', person: null, detail: null, tab: 'q' };

  function bar(pct) {
    const c = pct >= 80 ? '#16a34a' : pct >= 50 ? '#F68920' : '#e05252';
    return `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:9px;background:#eef1f2;border-radius:6px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${c}"></div></div><b style="min-width:44px;text-align:right;color:${c}">${pct}%</b></div>`;
  }

  async function draw() {
    const combo = combos[state.i];
    const qrows = stats.filter(s => s.team === combo.team && s.quiz === combo.quiz);
    let qs = qrows.slice();
    if (state.sort === 'worst') qs.sort((a, b) => a.pct - b.pct);
    else qs.sort((a, b) => a.qno - b.qno);
    const nResp = qrows.length ? Math.max(...qrows.map(r => r.n)) : 0;
    const avgCorrect = qrows.length ? Math.round(qrows.reduce((a, r) => a + (+r.pct || 0), 0) / qrows.length * 10) / 10 : 0;
    const hard = qrows.filter(r => r.pct < 50).length;

    v.innerHTML = `<h1>วิเคราะห์รายข้อ</h1>
      <div class="muted" style="margin-top:-6px;margin-bottom:12px">ตรวจว่าแต่ละข้อคนตอบถูกกี่ % และใครทำผิดข้อไหน</div>
      <div class="card" style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
        <span class="muted">ชุดข้อสอบ:</span>
        <select id="qCombo" style="${ss};min-width:240px">${combos.map((c, i) => `<option value="${i}" ${i === state.i ? 'selected' : ''}>${esc(c.k)}</option>`).join('')}</select>
        <div style="flex:1"></div>
        <button class="btn ${state.tab === 'q' ? 'btn-teal' : 'btn-ghost'}" id="tabQ">สรุปรายข้อ</button>
        <button class="btn ${state.tab === 'p' ? 'btn-teal' : 'btn-ghost'}" id="tabP">รายคน</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:6px">
        <div class="tile" style="border-left:5px solid #198E8F"><div class="k">ผู้เข้าสอบ</div><div class="t" style="font-size:28px">${nResp}</div><div class="m">คนในชุดนี้</div></div>
        <div class="tile" style="border-left:5px solid #21BDBE"><div class="k">ตอบถูกเฉลี่ย</div><div class="t" style="font-size:28px">${avgCorrect}%</div><div class="m">ทุกข้อรวมกัน</div></div>
        <div class="tile" style="border-left:5px solid #e05252"><div class="k">ข้อที่ยาก</div><div class="t" style="font-size:28px">${hard}</div><div class="m">ถูกต่ำกว่า 50%</div></div>
      </div>
      <div id="qPanel"></div>`;

    $('#qCombo').addEventListener('change', e => { state.i = +e.target.value; state.person = null; state.detail = null; draw(); });
    $('#tabQ').addEventListener('click', () => { state.tab = 'q'; draw(); });
    $('#tabP').addEventListener('click', () => { state.tab = 'p'; draw(); });

    const panel = $('#qPanel');
    if (state.tab === 'q') {
      panel.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center">
          <span class="muted">เรียงตาม:</span>
          <select id="qSort" style="${ss}"><option value="qno" ${state.sort === 'qno' ? 'selected' : ''}>ลำดับข้อ</option><option value="worst" ${state.sort === 'worst' ? 'selected' : ''}>ยากที่สุดก่อน</option></select>
          <div style="flex:1"></div>
          <button class="btn btn-teal" id="qCsv">⬇ CSV</button>
        </div>
        <div class="card" style="padding:0;overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f0faf9;color:var(--teal-700)">
              <th style="padding:10px 12px;width:52px">ข้อ</th>
              <th style="text-align:left;padding:10px 12px">คำถาม / เฉลย</th>
              <th style="padding:10px 12px;width:90px">ตอบ</th>
              <th style="padding:10px 12px;width:200px">อัตราตอบถูก</th></tr></thead>
            <tbody>${qs.map(r => `<tr style="border-top:1px solid var(--line)">
              <td style="padding:8px 12px;text-align:center;font-weight:600">${r.qno}</td>
              <td style="padding:8px 12px">${esc(r.question || ('ข้อ ' + r.qno))}</td>
              <td style="padding:8px 12px;text-align:center">${r.n_correct}/${r.n}</td>
              <td style="padding:8px 12px">${bar(r.pct == null ? 0 : r.pct)}</td></tr>`).join('')}</tbody>
          </table>
        </div>`;
      $('#qSort').addEventListener('change', e => { state.sort = e.target.value; draw(); });
      $('#qCsv').addEventListener('click', () => {
        const head = ['ข้อ', 'คำถาม/เฉลย', 'ตอบถูก', 'ตอบทั้งหมด', '%ถูก'];
        const lines = [head.join(',')].concat(qs.map(r => [r.qno, `"${String(r.question || '').replace(/"/g, '""')}"`, r.n_correct, r.n, r.pct].join(',')));
        dl(lines.join('\n'), `รายข้อ_${combo.quiz}.csv`);
      });
    } else {
      panel.innerHTML = `<div class="card muted">กำลังโหลดรายคน...</div>`;
      if (!state.detail || state.detail.team !== combo.team || state.detail.quiz !== combo.quiz) {
        try {
          const rows = await rpc('app_admin_qdetail', { p_team: keyOf(combo.team), p_quiz_title: combo.quiz });
          state.detail = { team: combo.team, quiz: combo.quiz, rows };
        } catch (e) { panel.innerHTML = `<div class="card">โหลดรายคนไม่สำเร็จ</div>`; return; }
      }
      const rows = state.detail.rows;
      // จัดกลุ่มตามคน
      const byP = {};
      rows.forEach(r => { const k = r.email || r.name; (byP[k] = byP[k] || { name: r.name, email: r.email, items: [] }).items.push(r); });
      const people = Object.values(byP).map(p => {
        const wrong = p.items.filter(x => !x.ok).sort((a, b) => a.qno - b.qno);
        return { ...p, total: p.items.length, nwrong: wrong.length, wrong };
      }).sort((a, b) => b.nwrong - a.nwrong);

      panel.innerHTML = `
        <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <input id="pQ" placeholder="ค้นหาชื่อ / อีเมล..." style="${ss};flex:1;min-width:160px">
          <span class="muted">คลิกที่ชื่อเพื่อดูข้อที่ผิด</span>
          <div style="flex:1"></div>
          <button class="btn btn-teal" id="pCsv">⬇ CSV</button>
        </div>
        <div class="card" style="padding:0;overflow:auto">
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#f0faf9;color:var(--teal-700)">
              <th style="text-align:left;padding:10px 12px">ชื่อ</th>
              <th style="text-align:left;padding:10px 12px">อีเมล</th>
              <th style="padding:10px 12px;width:90px">ถูก</th>
              <th style="text-align:left;padding:10px 12px">ข้อที่ผิด</th></tr></thead>
            <tbody id="pBody"></tbody>
          </table>
        </div>`;

      function renderPeople(filter) {
        const list = people.filter(p => !filter || (p.name || '').toLowerCase().includes(filter) || (p.email || '').toLowerCase().includes(filter));
        $('#pBody').innerHTML = list.length ? list.map((p, idx) => {
          const wrongNos = p.wrong.map(w => w.qno).join(', ');
          const okc = p.total - p.nwrong;
          const detail = state.person === (p.email || p.name) ? `<tr style="background:#fff8f8"><td colspan="4" style="padding:0 12px 12px">
              <div style="font-size:12.5px;color:var(--muted);padding:8px 0">ข้อที่ตอบผิด (${p.nwrong} ข้อ):</div>
              ${p.wrong.length ? p.wrong.map(w => `<div style="padding:7px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px">
                <b>ข้อ ${w.qno}.</b> ${esc(w.question || '')}<br>
                <span style="color:#e05252">ตอบ: ${esc(w.chosen || '(ไม่ได้ตอบ)')}</span></div>`).join('') : '<div class="muted">ทำถูกทุกข้อ 🎉</div>'}
            </td></tr>` : '';
          return `<tr class="pRow" data-k="${esc(p.email || p.name)}" style="border-top:1px solid var(--line);cursor:pointer">
              <td style="padding:8px 12px;font-weight:500">${esc(p.name || '')}</td>
              <td style="padding:8px 12px;color:var(--muted)">${esc(p.email || '')}</td>
              <td style="padding:8px 12px;text-align:center"><span class="st ${okc === p.total ? 'ok' : ''}" style="${okc === p.total ? '' : 'background:#FBEAEA;color:var(--danger)'}">${okc}/${p.total}</span></td>
              <td style="padding:8px 12px;color:#e05252">${wrongNos || '—'}</td></tr>${detail}`;
        }).join('') : `<tr><td colspan="4" style="padding:20px;text-align:center;color:var(--muted)">ไม่พบ</td></tr>`;
        $('#pBody').querySelectorAll('.pRow').forEach(tr => tr.addEventListener('click', () => {
          const k = tr.getAttribute('data-k'); state.person = state.person === k ? null : k; renderPeople($('#pQ').value.trim().toLowerCase());
        }));
      }
      renderPeople('');
      $('#pQ').addEventListener('input', e => { renderPeople(e.target.value.trim().toLowerCase()); });
      $('#pCsv').addEventListener('click', () => {
        const head = ['ชื่อ', 'อีเมล', 'ตอบถูก', 'ตอบทั้งหมด', 'ข้อที่ผิด'];
        const lines = [head.join(',')].concat(people.map(p => [`"${(p.name || '').replace(/"/g, '""')}"`, p.email || '', p.total - p.nwrong, p.total, `"${p.wrong.map(w => w.qno).join(' ')}"`].join(',')));
        dl(lines.join('\n'), `รายคน_${combo.quiz}.csv`);
      });
    }
  }
  function dl(text, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click();
  }
  draw();
}

async function renderDashboard(v) {
  if (ME.role !== 'admin') { v.innerHTML = `<div class="card">เฉพาะผู้ดูแลระบบ</div>`; return; }
  v.innerHTML = `<h1>แดชบอร์ดผลสอบ</h1><div class="muted">กำลังโหลด...</div>`;
  let rows;
  try { rows = await rpc('app_admin_results'); } catch (e) { v.innerHTML = `<div class="card">โหลดข้อมูลไม่สำเร็จ</div>`; return; }
  const sel = { team: '', quiz: '', res: '', q: '', mteam: '', mq: '', aSort: 'date', aDir: 'desc', aPage: 0 };
  const fmtd = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toLocaleDateString('th-TH') + ' ' + d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }); };
  const dateOnly = (s) => { const d = new Date(s); return isNaN(d) ? '' : d.toISOString().slice(0, 10); };
  let curF = [];
  const teams = [...new Set(rows.map(r => r.team).filter(Boolean))];
  const quizzes = [...new Set(rows.map(r => r.quiz).filter(Boolean))];
  const PAL = ['#198E8F', '#21BDBE', '#F68920', '#FCBC17', '#8b5cf6', '#0ea5e9', '#16a34a', '#e05252'];
  const L = (th, en) => (window.LANG === 'en' ? en : th);
  const ss = 'padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px';
  const opt = (arr, cur) => arr.map(x => `<option value="${esc(x)}" ${cur === x ? 'selected' : ''}>${esc(x)}</option>`).join('');
  let charts = {};

  function bestAttempt(email, quiz) {
    const rs = rows.filter(r => r.email === email && r.quiz === quiz);
    if (!rs.length) return null;
    return rs.reduce((a, b) => (+b.pct > +a.pct ? b : a));
  }
  function matrixData() {
    const team = sel.mteam;
    const trows = rows.filter(r => r.team === team);
    const cols = [...new Set(trows.map(r => r.quiz).filter(Boolean))].sort();
    const byE = {};
    trows.forEach(r => { const k = r.email || r.name; if (!byE[k]) byE[k] = { name: r.name, email: r.email }; });
    let people = Object.values(byE);
    if (sel.mq) people = people.filter(p => (p.name || '').toLowerCase().includes(sel.mq) || (p.email || '').toLowerCase().includes(sel.mq));
    people.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    people.forEach(p => {
      p.cells = cols.map(c => bestAttempt(p.email, c));
      p.passed = p.cells.filter(b => b && b.pass).length;
    });
    return { cols, people };
  }
  function drawMatrix() {
    const wrap = $('#matrixWrap'); if (!wrap) return;
    const { cols, people } = matrixData(); const N = cols.length;
    const th = 'padding:10px 12px;white-space:nowrap';
    wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:#f0faf9;color:var(--teal-700)">
        <th style="text-align:left;${th};position:sticky;left:0;background:#f0faf9">ผู้เรียน</th>
        ${cols.map(c => `<th style="${th}">${esc(c)}</th>`).join('')}
        <th style="${th}">ผ่าน</th><th style="${th}">สถานะ</th></tr></thead>
      <tbody>${people.length ? people.map(p => {
        const done = N > 0 && p.passed === N;
        return `<tr style="border-top:1px solid var(--line)">
          <td style="padding:7px 12px;position:sticky;left:0;background:#fff;font-weight:500">${esc(p.name || p.email)}</td>
          ${p.cells.map(b => b
            ? `<td style="text-align:center;padding:7px 10px;font-weight:600;${b.pass ? 'background:#EAF7EE;color:#16a34a' : 'background:#FBEAEA;color:#e05252'}">${b.score}/${b.total}</td>`
            : `<td style="text-align:center;padding:7px 10px;color:var(--muted)">—</td>`).join('')}
          <td style="text-align:center;padding:7px 10px;font-weight:600">${p.passed}/${N}</td>
          <td style="text-align:center;padding:7px 10px"><span class="st ${done ? 'ok' : ''}" style="${done ? '' : 'background:#FFF3E6;color:#F68920'}">${done ? 'ผ่านทั้งหมด' : 'กำลังดำเนินการ'}</span></td></tr>`;
      }).join('') : `<tr><td colspan="${N + 3}" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีข้อมูล</td></tr>`}</tbody></table>`;
  }
  function exportMatrix() {
    const { cols, people } = matrixData(); const N = cols.length;
    const head = ['ผู้เรียน', 'อีเมล', ...cols, 'ผ่าน', 'สถานะ'];
    const lines = [head.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')].concat(
      people.map(p => [p.name || '', p.email || '', ...p.cells.map(b => b ? b.score + '/' + b.total : '-'),
        p.passed + '/' + N, (N > 0 && p.passed === N) ? 'ผ่านทั้งหมด' : 'กำลังดำเนินการ']
        .map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'results_by_trainee.csv'; a.click();
  }

  // ลิงก์ชีตต้นทางของแต่ละชุดสอบ (backend result sheets) แยกตามทีม
  const D = 'https://docs.google.com/spreadsheets/d/', MK = D + '12mDo-_EK8xqfIp6EFk7pCVUR8c-muBuP3uDx2IB4Qqs/edit?gid=',
        LT = D + '1tqsWOlQJDU4edgvMYzAV2shj4PuFOdJednvcIFeP2oE/edit?gid=', CT = D + '1nCdV49G1GG8DpSb5U5fiGy-3kdPbHnHNPt7c1x8mVKU/edit?gid=';
  const SHEETS = {
    Makro: [['QA', MK + '977570320'], ['Pro Apps', MK + '661088045'], ['Overview', MK + '1046236065'], ['Final Test', MK + '1695054400'], ['SOPs', MK + '640379399'], ['Internal Tools', MK + '20587673']],
    Lotus: [['Company Profile & BU 01', LT + '580684386'], ['Customer Service 01', LT + '478956290'], ['QA', LT + '845707605'], ['Shop Online', LT + '1046835350'], ['FastHelp5 - 01', LT + '1426165820'], ["My Lotus's - 01", D + '1_vCNpmNnw9i9W-Eab4fw2JTvwUdlBkqLVXpctwX647A/edit'], ['Marketplace - 01', D + '1IeYWITGRKx-2St6Fcd65HekvzoGA7Vh1csl6Cqf3qfs/edit'], ['GC Office - 01', D + '1Qh7o2VXY7Xo6znTBJCRO0yFzZue3ERl9tHkVgXy5FtI/edit']],
    Center: [['Soft Skill', CT + '577603034'], ['PDPA', CT + '1793217909'], ['Risk Management', CT + '1229715473']]
  };
  const groupKey = n => /Makro/i.test(n) ? 'Makro' : /Lotus/i.test(n) ? 'Lotus' : 'Center';
  const AKEY = { date: 'created', trainee: 'name', test: 'quiz', score: 'score', pct: 'pct', result: 'pass' };

  function drawAttempts() {
    const wrap = $('#attemptsWrap'); if (!wrap) return;
    const k = AKEY[sel.aSort] || 'created', dir = sel.aDir === 'asc' ? 1 : -1;
    const sorted = curF.slice().sort((a, b) => {
      let x, y;
      if (sel.aSort === 'date') { x = +new Date(a.created) || 0; y = +new Date(b.created) || 0; }
      else if (sel.aSort === 'trainee' || sel.aSort === 'test') return dir * String(a[k] || '').localeCompare(String(b[k] || ''));
      else if (sel.aSort === 'result') { x = a.pass ? 1 : 0; y = b.pass ? 1 : 0; }
      else { x = +a[k] || 0; y = +b[k] || 0; }
      return dir * (x - y);
    });
    const per = 12, pages = Math.max(1, Math.ceil(sorted.length / per));
    if (sel.aPage >= pages) sel.aPage = pages - 1; if (sel.aPage < 0) sel.aPage = 0;
    const page = sorted.slice(sel.aPage * per, sel.aPage * per + per);
    const arrow = key => sel.aSort === key ? (sel.aDir === 'asc' ? ' ▲' : ' ▼') : ' ⇅';
    const th = (key, label, extra) => `<th data-sort="${key}" style="padding:11px 14px;cursor:pointer;user-select:none;white-space:nowrap;${extra || 'text-align:left'}">${label}<span style="opacity:.6">${arrow(key)}</span></th>`;
    wrap.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead><tr style="background:var(--teal-700,#198E8F);color:#fff">
        ${th('date', 'วันที่')}${th('trainee', 'ชื่อ')}${th('test', 'ชุดข้อสอบ')}
        ${th('score', 'คะแนน', 'text-align:center')}${th('pct', '%', 'text-align:center')}${th('result', 'ผล', 'text-align:center')}</tr></thead>
      <tbody>${page.length ? page.map(r => `<tr style="border-top:1px solid var(--line)">
        <td style="padding:9px 14px;white-space:nowrap">${dateOnly(r.created)}</td>
        <td style="padding:9px 14px;font-weight:500">${esc(r.name || '')}</td>
        <td style="padding:9px 14px">${esc(r.quiz || '')}</td>
        <td style="padding:9px 14px;text-align:center">${r.score}/${r.total}</td>
        <td style="padding:9px 14px;text-align:center">${r.pct}%</td>
        <td style="padding:9px 14px;text-align:center"><span class="st ${r.pass ? 'ok' : ''}" style="${r.pass ? '' : 'background:#FBEAEA;color:var(--danger)'}">${r.pass ? 'ผ่าน' : 'ไม่ผ่าน'}</span></td>
      </tr>`).join('') : `<tr><td colspan="6" style="padding:22px;text-align:center;color:var(--muted)">ไม่มีข้อมูล</td></tr>`}</tbody></table>
      <div style="display:flex;justify-content:flex-end;align-items:center;gap:12px;padding:12px 14px;color:var(--muted);font-size:13px">
        <button class="btn btn-ghost" id="aPrev" style="padding:6px 12px" ${sel.aPage === 0 ? 'disabled' : ''}>‹ ก่อนหน้า</button>
        <span>หน้า ${sel.aPage + 1} / ${pages}</span>
        <button class="btn btn-ghost" id="aNext" style="padding:6px 12px" ${sel.aPage >= pages - 1 ? 'disabled' : ''}>ถัดไป ›</button>
      </div>`;
    wrap.querySelectorAll('[data-sort]').forEach(h => h.addEventListener('click', () => {
      const key = h.getAttribute('data-sort');
      if (sel.aSort === key) sel.aDir = sel.aDir === 'asc' ? 'desc' : 'asc';
      else { sel.aSort = key; sel.aDir = (key === 'trainee' || key === 'test') ? 'asc' : 'desc'; }
      sel.aPage = 0; drawAttempts();
    }));
    const p = $('#aPrev'), n = $('#aNext');
    if (p) p.addEventListener('click', () => { sel.aPage--; drawAttempts(); });
    if (n) n.addEventListener('click', () => { sel.aPage++; drawAttempts(); });
    const cnt = $('#attemptsCount'); if (cnt) { cnt.textContent = '· ' + curF.length + ' รายการ'; if (window.LANG === 'en' && window.translateEl) window.translateEl(cnt.parentNode); }
  }
  function exportResults() {
    const head = ['วันที่', 'ชื่อ', 'อีเมล', 'ทีม', 'ชุดข้อสอบ', 'คะแนน', 'เต็ม', '%', 'ผล'];
    const lines = [head.join(',')].concat(curF.map(r => [fmtd(r.created), r.name, r.email, r.team, r.quiz, r.score, r.total, r.pct, r.pass ? 'ผ่าน' : 'ไม่ผ่าน'].map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'results.csv'; a.click();
  }
  function drawLinks() {
    const wrap = $('#linksWrap'); if (!wrap) return;
    const AC = ['#F68920', '#21BDBE', '#8b5cf6', '#16a34a', '#e05252', '#0ea5e9'];
    const groups = sel.team ? [groupKey(sel.team)] : ['Makro', 'Lotus', 'Center'];
    wrap.innerHTML = groups.map(g => `<div class="card">
      <h2 style="font-size:16px;margin:0 0 2px">Tests &amp; links <span class="muted" style="font-weight:400;font-size:13px">— ชีตต้นทางผลสอบ · ${esc(g)}</span></h2>
      <div style="overflow:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:var(--teal-700,#198E8F);color:#fff"><th style="text-align:left;padding:10px 14px">ชุดข้อสอบ</th><th style="padding:10px 14px">ชีตต้นทาง (ผลข้อสอบ)</th></tr></thead>
        <tbody>${SHEETS[g].map(([name, url], i) => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:10px 14px;border-left:4px solid ${AC[i % AC.length]};font-weight:500">${esc(name)}</td>
          <td style="padding:10px 14px;text-align:center"><a class="btn btn-ghost" href="${esc(url)}" target="_blank" rel="noopener" style="padding:6px 14px;text-decoration:none">เปิดชีต ↗</a></td>
        </tr>`).join('')}</tbody></table></div></div>`).join('');
  }

  function draw() {
    if (!sel.mteam && teams.length) sel.mteam = teams[0];
    Object.values(charts).forEach(c => { try { c.destroy(); } catch (_) {} }); charts = {};
    const f = rows.filter(r => (!sel.team || r.team === sel.team) && (!sel.quiz || r.quiz === sel.quiz)
      && (!sel.res || (sel.res === 'pass' ? r.pass : !r.pass))
      && (!sel.q || String(r.name || '').toLowerCase().includes(sel.q)));
    curF = f; sel.aPage = 0;
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
      </div>
      <div class="grid" style="grid-template-columns:1.3fr 1fr;margin-bottom:16px">
        <div class="card"><h2 style="font-size:15px">อัตราสอบผ่านแต่ละชุด</h2><div style="position:relative;height:300px"><canvas id="cTest"></canvas></div></div>
        <div class="card"><h2 style="font-size:15px">ผลรวม ผ่าน/ไม่ผ่าน</h2><div style="position:relative;height:300px"><canvas id="cPie"></canvas></div></div>
      </div>
      <div class="card"><h2 style="font-size:15px">จำนวนครั้งสอบตามเดือน</h2><div style="position:relative;height:260px"><canvas id="cTime"></canvas></div></div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">
          <h2 style="font-size:16px;margin:0">ผลรายคน (ตาราง) <span class="muted" style="font-weight:400;font-size:13px">— คะแนนล่าสุดของแต่ละคนต่อชุด</span></h2>
          <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
            <span class="muted">ทีม:</span>
            <select id="mTeamSel" style="${ss}">${opt(teams, sel.mteam)}</select>
            <input id="mSearch" placeholder="ค้นหาชื่อ..." style="${ss};width:150px" value="${esc(sel.mq)}">
            <button class="btn btn-ghost" id="mCsv">⬇ CSV</button>
          </div>
        </div>
        <div id="matrixWrap" style="overflow:auto;border:1px solid var(--line);border-radius:12px"></div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <h2 style="font-size:16px;margin:0">รายการสอบทั้งหมด <span class="muted" style="font-weight:400;font-size:13px" id="attemptsCount">· ${f.length} รายการ</span></h2>
            <div class="muted" style="font-size:12.5px;margin-top:2px">คลิกหัวคอลัมน์เพื่อเรียงลำดับ · ดาวน์โหลด = ข้อมูลตามตัวกรองปัจจุบัน</div>
          </div>
          <button class="btn btn-ghost" id="aDl">⬇ ดาวน์โหลด CSV</button>
        </div>
        <div id="attemptsWrap" style="overflow:auto;border:1px solid var(--line);border-radius:12px;margin-top:12px"></div>
      </div>

      <div id="linksWrap"></div>`;
    const qs = quizzes.filter(q => f.some(r => r.quiz === q));
    const byQ = qs.map(q => { const rr = f.filter(r => r.quiz === q); const p = rr.filter(r => r.pass).length; return rr.length ? Math.round(p / rr.length * 1000) / 10 : 0; });
    if (window.Chart) {
      charts.cTest = new Chart($('#cTest'), { type: 'bar', data: { labels: qs, datasets: [{ data: byQ, backgroundColor: qs.map((_, i) => PAL[i % PAL.length]), borderRadius: 6, maxBarThickness: 46 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ' ' + c.raw + L('% ผ่าน', '% passed') } } }, scales: { y: { beginAtZero: true, max: 100, ticks: { callback: x => x + '%' } }, x: { grid: { display: false } } } } });
      charts.cPie = new Chart($('#cPie'), { type: 'doughnut', data: { labels: [L('ผ่าน', 'Passed'), L('ไม่ผ่าน', 'Not passed')], datasets: [{ data: [passed, attempts - passed], backgroundColor: ['#16a34a', '#e05252'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '62%', plugins: { legend: { position: 'bottom' } } } });
      const bk = {}; f.forEach(r => { const d = new Date(r.created); if (isNaN(d)) return; const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); bk[k] = bk[k] || { n: 0, p: 0 }; bk[k].n++; if (r.pass) bk[k].p++; });
      const keys = Object.keys(bk).sort();
      charts.cTime = new Chart($('#cTime'), { type: 'line', data: { labels: keys, datasets: [{ label: L('สอบ', 'Attempts'), data: keys.map(k => bk[k].n), borderColor: '#198E8F', backgroundColor: 'rgba(25,142,143,.1)', fill: true, tension: .3 }, { label: L('ผ่าน', 'Passed'), data: keys.map(k => bk[k].p), borderColor: '#16a34a', backgroundColor: 'rgba(22,163,74,.08)', fill: true, tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } } });
    }
    $('#fTeam').addEventListener('change', e => { sel.team = e.target.value; draw(); });
    $('#fQuiz').addEventListener('change', e => { sel.quiz = e.target.value; draw(); });
    $('#fRes').addEventListener('change', e => { sel.res = e.target.value; draw(); });
    $('#fQ').addEventListener('input', e => { sel.q = e.target.value.toLowerCase(); clearTimeout(window.__dq); window.__dq = setTimeout(draw, 350); });
    $('#fReset').addEventListener('click', () => { sel.team = sel.quiz = sel.res = sel.q = ''; draw(); });
    $('#aDl').addEventListener('click', exportResults);
    const qi = $('#fQ'); if (sel.q && qi) { qi.focus(); qi.setSelectionRange(qi.value.length, qi.value.length); }
    $('#mTeamSel').addEventListener('change', e => { sel.mteam = e.target.value; drawMatrix(); });
    $('#mSearch').addEventListener('input', e => { sel.mq = e.target.value.trim().toLowerCase(); drawMatrix(); });
    $('#mCsv').addEventListener('click', exportMatrix);
    drawMatrix(); drawAttempts(); drawLinks();
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
  const teams = CATALOG.teams || [];
  const st = { items: [], users: [], selItems: new Set(), selUsers: new Set(), isearch: '', usearch: '', due: '' };
  st.users = await rpc('app_admin_list_users', {});
  for (const t of teams) {
    try {
      const cat = await rpc('app_catalog', { p_team: t.id });
      (cat.lessons || []).forEach(l => st.items.push({ id: l.id, type: 'lesson', title: l.title, team: t.name }));
      (cat.quizzes || []).forEach(q => st.items.push({ id: q.id, type: 'quiz', title: q.title, team: t.name }));
    } catch (_) {}
  }
  const key = it => it.type + ':' + it.id;
  const dLabel = s => { const d = new Date(s); if (isNaN(d)) return ''; const n = Math.floor((Date.now() - d) / 86400000); return n <= 7 ? (n <= 0 ? 'วันนี้' : n === 1 ? 'เมื่อวาน' : n + ' วันก่อน') : 'สร้าง ' + d.toISOString().slice(0, 10); };
  const tkey = n => /Makro/i.test(n) ? 'Makro' : /Lotus/i.test(n) ? 'Lotus' : 'Center';

  function draw() {
    const lessons = st.items.filter(i => i.type === 'lesson' && (!st.isearch || i.title.toLowerCase().includes(st.isearch)));
    const quizzes = st.items.filter(i => i.type === 'quiz' && (!st.isearch || i.title.toLowerCase().includes(st.isearch)));
    const uq = st.usearch, fusers = st.users.filter(u => !uq || (u.name || '').toLowerCase().includes(uq) || (u.email || '').toLowerCase().includes(uq));
    const row = it => `<label class="pick" style="display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border-radius:8px;cursor:pointer;${st.selItems.has(key(it)) ? 'background:#edf9f9' : ''}"><input type="checkbox" class="ichk" data-k="${key(it)}" ${st.selItems.has(key(it)) ? 'checked' : ''} style="margin-top:3px"><span>${it.type === 'lesson' ? '📘' : '📝'} ${esc(it.title)} <span class="muted" style="font-size:12px">(${esc(it.team)})</span></span></label>`;
    const urow = u => `<label class="pick" style="display:flex;gap:9px;align-items:flex-start;padding:8px 10px;border-radius:8px;cursor:pointer;${st.selUsers.has(u.id) ? 'background:#edf9f9' : ''}"><input type="checkbox" class="uchk" value="${u.id}" ${st.selUsers.has(u.id) ? 'checked' : ''} style="margin-top:3px"><span>${esc(u.name || u.email)}<br><span class="muted" style="font-size:12px">${esc(u.email)} · ${esc(u.team || '')} · ${dLabel(u.created)}</span></span></label>`;
    const box = 'max-height:380px;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:8px';
    const qbtn = 'padding:6px 12px;font-size:13px';
    v.innerHTML = `<h1>มอบหมายงาน</h1>
      <div class="muted" style="margin-top:-6px;margin-bottom:16px">เลือกบทเรียน/แบบทดสอบ แล้วเลือกผู้รับ กดมอบหมายทีเดียวได้หลายรายการ</div>
      <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h2 style="margin:0;font-size:16px">📚 บทเรียน / แบบทดสอบ</h2>
            <span class="st ok" id="iBadge">${st.selItems.size} รายการ</span>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
            <input id="iSearch" placeholder="🔍 ค้นหาบทเรียน / แบบทดสอบ..." style="${SS};flex:1;min-width:150px" value="${esc(st.isearch)}">
            <button class="btn btn-ghost" id="iAll" style="${qbtn}">เลือกทั้งหมด</button>
            <button class="btn btn-ghost" id="iClear" style="${qbtn}">ล้าง</button>
          </div>
          <div style="${box}">
            <div class="muted" style="font-weight:600;margin:4px 0 4px;padding:0 6px">บทเรียน (วิดีโอ+เนื้อหา)</div>
            ${lessons.length ? lessons.map(row).join('') : '<div class="muted" style="padding:6px">—</div>'}
            <div class="muted" style="font-weight:600;margin:12px 0 4px;padding:0 6px">แบบทดสอบ</div>
            ${quizzes.length ? quizzes.map(row).join('') : '<div class="muted" style="padding:6px">—</div>'}
          </div>
        </div>
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <h2 style="margin:0;font-size:16px">👥 ผู้รับมอบหมาย</h2>
            <span class="st ok" id="uBadge">${st.selUsers.size} คน</span>
          </div>
          <input id="uSearch" placeholder="🔍 ค้นหาชื่อ / อีเมล..." style="${SS};width:100%;margin-bottom:10px" value="${esc(st.usearch)}">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">
            <button class="btn btn-ghost qf" data-f="today" style="${qbtn}">📅 สร้างวันนี้</button>
            <button class="btn btn-ghost qf" data-f="new7" style="${qbtn}">🆕 คนใหม่ 7 วัน</button>
            <button class="btn btn-ghost qf" data-f="Makro" style="${qbtn}">ทั้งทีม Makro</button>
            <button class="btn btn-ghost qf" data-f="Lotus" style="${qbtn}">ทั้งทีม Lotus</button>
            <button class="btn btn-ghost qf" data-f="Center" style="${qbtn}">ทีม Center</button>
            <button class="btn btn-ghost qf" data-f="all" style="${qbtn}">เลือกทั้งหมด</button>
            <button class="btn btn-ghost qf" data-f="clear" style="${qbtn}">ล้าง</button>
          </div>
          <div style="${box}">${fusers.length ? fusers.map(urow).join('') : '<div class="muted" style="padding:6px">ไม่พบ</div>'}</div>
        </div>
      </div>
      <div class="card" style="display:flex;gap:18px;align-items:center;flex-wrap:wrap">
        <div><label class="muted" style="font-weight:600">กำหนดส่ง (ไม่บังคับ)</label><br><input id="aDue" type="date" style="${SS};margin-top:4px" value="${esc(st.due)}"></div>
        <div style="flex:1;min-width:120px"></div>
        <div class="muted" id="aCount" style="font-size:14px">เลือกแล้ว: ${st.selItems.size} รายการ · ${st.selUsers.size} คน</div>
        <button class="btn btn-primary" id="aBtn" style="width:auto;padding:12px 34px">มอบหมายงาน</button>
      </div>
      <div class="login-err" id="aErr" style="margin:-6px 0 12px"></div>
      <div class="card"><h2>งานที่มอบหมายล่าสุด</h2><div id="aList" class="muted">กำลังโหลด...</div></div>`;
    v.querySelectorAll('.ichk').forEach(c => c.addEventListener('change', e => { const k = e.target.getAttribute('data-k'); if (e.target.checked) st.selItems.add(k); else st.selItems.delete(k); e.target.closest('.pick').style.background = e.target.checked ? '#edf9f9' : ''; redrawCount(); }));
    $('#iAll').addEventListener('click', () => { [...lessons, ...quizzes].forEach(it => st.selItems.add(key(it))); draw(); });
    $('#iClear').addEventListener('click', () => { st.selItems.clear(); draw(); });
    $('#iSearch').addEventListener('input', e => { st.isearch = e.target.value.trim().toLowerCase(); draw(); const s = $('#iSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    v.querySelectorAll('.uchk').forEach(c => c.addEventListener('change', e => { if (e.target.checked) st.selUsers.add(e.target.value); else st.selUsers.delete(e.target.value); e.target.closest('.pick').style.background = e.target.checked ? '#edf9f9' : ''; redrawCount(); }));
    $('#uSearch').addEventListener('input', e => { st.usearch = e.target.value.trim().toLowerCase(); draw(); const s = $('#uSearch'); s.focus(); s.setSelectionRange(s.value.length, s.value.length); });
    v.querySelectorAll('.qf').forEach(b => b.addEventListener('click', () => {
      const f = b.getAttribute('data-f');
      if (f === 'clear') st.selUsers.clear();
      else if (f === 'all') st.users.forEach(u => st.selUsers.add(u.id));
      else if (f === 'today') st.users.forEach(u => { const d = new Date(u.created); if (!isNaN(d) && Math.floor((Date.now() - d) / 86400000) <= 0) st.selUsers.add(u.id); });
      else if (f === 'new7') st.users.forEach(u => { const d = new Date(u.created); if (!isNaN(d) && Math.floor((Date.now() - d) / 86400000) <= 7) st.selUsers.add(u.id); });
      else st.users.forEach(u => { if (tkey(u.team || '') === f) st.selUsers.add(u.id); });
      draw();
    }));
    $('#aDue').addEventListener('change', e => { st.due = e.target.value; });
    $('#aBtn').addEventListener('click', async () => {
      const err = $('#aErr'); err.style.color = 'var(--danger)';
      if (!st.selItems.size) { err.textContent = 'กรุณาเลือกบทเรียน/แบบทดสอบอย่างน้อย 1 รายการ'; return; }
      const ids = [...st.selUsers];
      if (!ids.length) { err.textContent = 'กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน'; return; }
      const btn = $('#aBtn'); btn.disabled = true; err.textContent = '';
      try {
        for (const k of st.selItems) { const i = k.indexOf(':'); await rpc('app_admin_assign', { p_item_type: k.slice(0, i), p_item_id: k.slice(i + 1), p_user_ids: ids, p_due: st.due || null }); }
        err.style.color = 'var(--success)'; err.textContent = `มอบหมายเรียบร้อย ${st.selItems.size} รายการ × ${ids.length} คน ✓`; loadList();
      } catch (e) { err.textContent = 'มอบหมายไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    loadList();
  }
  function redrawCount() {
    const c = $('#aCount'); if (c) c.textContent = `เลือกแล้ว: ${st.selItems.size} รายการ · ${st.selUsers.size} คน`;
    const ib = $('#iBadge'); if (ib) ib.textContent = `${st.selItems.size} รายการ`;
    const ub = $('#uBadge'); if (ub) ub.textContent = `${st.selUsers.size} คน`;
    if (window.LANG === 'en' && window.translateEl) { [c, $('#iBadge'), $('#uBadge')].forEach(el => el && window.translateEl(el)); }
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
    <image href="${window.LOGO_MARK}" x="935" y="70" width="130" height="150" preserveAspectRatio="xMidYMid meet"/>
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
  const st = { tab: 'lesson', form: null }; // form: null | {mode:'add'} | {mode:'edit', id, title, section}
  const ip = 'width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px;box-sizing:border-box';
  async function draw() {
    const cat = await rpc('app_catalog', { p_team: team });
    team = cat.active_team;
    const tk = teamKeyOf(team);
    const tabBtn = (id, label) => `<button class="btn ${st.tab === id ? 'btn-teal' : 'btn-ghost'} mtab" data-t="${id}">${label}</button>`;
    const formCard = st.form ? `<div class="card" style="background:#f0faf9">
        <h2 style="font-size:15px;margin-top:0">${st.form.mode === 'add' ? '➕ เพิ่มบทเรียนใหม่' : '✏️ แก้ชื่อบทเรียน'}</h2>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:2;min-width:220px"><label class="muted" style="font-weight:600">ชื่อบทเรียน</label><input id="fTitle" style="${ip};margin-top:4px" value="${esc(st.form.title || '')}" placeholder="เช่น 01 การบริการลูกค้าที่ดี"></div>
          <div style="flex:1;min-width:160px"><label class="muted" style="font-weight:600">หมวด / Section</label><input id="fSec" style="${ip};margin-top:4px" value="${esc(st.form.section || '')}" placeholder="เช่น Customer Service, DAY 1"></div>
        </div>
        <div style="margin-top:12px;display:flex;gap:10px">
          <button class="btn btn-primary" id="fSave" style="width:auto;padding:10px 22px">${st.form.mode === 'add' ? 'สร้างแล้วแก้เนื้อหา' : 'บันทึกชื่อ'}</button>
          <button class="btn btn-ghost" id="fCancel">ยกเลิก</button>
        </div></div>` : '';
    let listCard;
    if (st.tab === 'lesson') {
      listCard = `<div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:var(--teal-700,#198E8F);color:#fff"><th style="text-align:left;padding:10px 12px">หมวด</th><th style="text-align:left;padding:10px 12px">ชื่อบทเรียน</th><th style="padding:10px 12px">จัดการ</th></tr></thead>
        <tbody>${cat.lessons.length ? cat.lessons.map(l => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px">${esc(l.section || '')}</td><td style="padding:8px 12px">${esc(l.title)}</td>
          <td style="padding:8px 12px;text-align:center;white-space:nowrap">
            <button class="btn btn-teal mBlocks" data-id="${l.id}" data-title="${esc(l.title)}" data-section="${esc(l.section || '')}" style="padding:6px 12px">แก้เนื้อหา</button>
            <button class="btn btn-ghost mEdit" data-id="${l.id}" data-title="${esc(l.title)}" data-section="${esc(l.section || '')}" style="padding:6px 12px">แก้ชื่อ</button>
            <button class="btn mDel" data-id="${l.id}" data-title="${esc(l.title)}" style="padding:6px 12px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('') : `<tr><td colspan="3" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีบทเรียน</td></tr>`}</tbody></table></div>`;
    } else {
      listCard = `<div class="card" style="padding:0;overflow:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:var(--teal-700,#198E8F);color:#fff"><th style="text-align:left;padding:10px 12px">ชื่อชุดข้อสอบ</th><th style="padding:10px 12px">จำนวนข้อ</th><th style="padding:10px 12px">เวลา</th><th style="padding:10px 12px">เกณฑ์ผ่าน</th><th style="padding:10px 12px">จัดการ</th></tr></thead>
        <tbody>${cat.quizzes.length ? cat.quizzes.map(z => `<tr style="border-top:1px solid var(--line)">
          <td style="padding:8px 12px">${esc(z.title)}</td>
          <td style="padding:8px 12px;text-align:center">${z.n} ข้อ</td>
          <td style="padding:8px 12px;text-align:center">${z.minutes} นาที</td>
          <td style="padding:8px 12px;text-align:center">${z.pass}%</td>
          <td style="padding:8px 12px;text-align:center;white-space:nowrap">
            <button class="btn btn-teal qEdit" data-id="${z.id}" style="padding:6px 12px">แก้ไขข้อสอบ</button>
            <button class="btn qDel" data-id="${z.id}" data-title="${esc(z.title)}" style="padding:6px 12px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('') : `<tr><td colspan="5" style="padding:20px;text-align:center;color:var(--muted)">ไม่มีแบบทดสอบ</td></tr>`}</tbody></table></div>`;
    }
    v.innerHTML = `<h1>จัดการบทเรียนและข้อสอบ</h1>
      <div class="card" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
        <span class="muted">ทีม:</span><select id="mTeam" style="${SS}">${teamOpts(team)}</select>
        <span style="width:14px"></span>${tabBtn('lesson', '📘 บทเรียน')}${tabBtn('quiz', '📝 แบบทดสอบ')}
        <button class="btn btn-primary" id="mAdd" style="margin-left:auto">${st.tab === 'lesson' ? '+ เพิ่มบทเรียนใหม่' : '+ เพิ่มแบบทดสอบใหม่'}</button>
      </div>
      ${formCard}${listCard}`;
    $('#mTeam').addEventListener('change', e => { team = e.target.value; st.form = null; draw(); });
    v.querySelectorAll('.mtab').forEach(b => b.addEventListener('click', () => { st.tab = b.getAttribute('data-t'); st.form = null; draw(); }));
    $('#mAdd').addEventListener('click', () => {
      if (st.tab === 'lesson') { st.form = { mode: 'add', title: '', section: '' }; draw(); }
      else renderQuizEditor(v, null, tk, () => { st.tab = 'quiz'; draw(); });
    });
    if (st.form) {
      $('#fCancel').addEventListener('click', () => { st.form = null; draw(); });
      $('#fSave').addEventListener('click', async () => {
        const t = $('#fTitle').value.trim(), s = $('#fSec').value.trim();
        if (!t) { $('#fTitle').focus(); return; }
        try {
          if (st.form.mode === 'add') {
            const r = await rpc('app_admin_create_lesson', { p_team: tk, p_title: t, p_section: s });
            st.form = null; renderBlockEditor(v, r.id, t, s, tk, () => draw());
          } else {
            await rpc('app_admin_update_lesson', { p_lesson_id: st.form.id, p_title: t, p_section: s, p_order: 0 });
            st.form = null; draw();
          }
        } catch (e) { alert('บันทึกไม่สำเร็จ'); }
      });
    }
    v.querySelectorAll('.mBlocks').forEach(b => b.addEventListener('click', () =>
      renderBlockEditor(v, b.getAttribute('data-id'), b.getAttribute('data-title'), b.getAttribute('data-section'), tk, () => draw())));
    v.querySelectorAll('.mEdit').forEach(b => b.addEventListener('click', () => {
      st.form = { mode: 'edit', id: b.getAttribute('data-id'), title: b.getAttribute('data-title'), section: b.getAttribute('data-section') }; draw();
    }));
    v.querySelectorAll('.mDel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('ลบบทเรียน "' + b.getAttribute('data-title') + '" ?\n(ลบเนื้อหาทั้งบท)')) return;
      await rpc('app_admin_delete_lesson', { p_lesson_id: b.getAttribute('data-id') }); draw();
    }));
    v.querySelectorAll('.qEdit').forEach(b => b.addEventListener('click', () =>
      renderQuizEditor(v, b.getAttribute('data-id'), tk, () => { st.tab = 'quiz'; draw(); })));
    v.querySelectorAll('.qDel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('ลบแบบทดสอบ "' + b.getAttribute('data-title') + '" ?\n(ลบคำถามและประวัติการสอบทั้งหมดของชุดนี้)')) return;
      await rpc('app_admin_quiz_delete', { p_quiz: b.getAttribute('data-id') }); draw();
    }));
  }
  draw();
}

// ---------- ตัวแก้ไขข้อสอบ (quiz editor) ----------
async function renderQuizEditor(v, quizId, teamKey, onBack) {
  v.innerHTML = `<div class="muted">กำลังโหลด...</div>`;
  let data = { title: '', minutes: 15, pass: 80, questions: [] };
  if (quizId) { try { data = await rpc('app_admin_quiz_get', { p_quiz: quizId }); } catch (_) {} }
  const st = { title: data.title || '', minutes: data.minutes || 15, pass: data.pass || 80,
    qs: (data.questions || []).map(q => ({ q: q.q || '', choices: q.choices || [], correct: q.correct || 0 })) };
  const ta = 'width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;font-family:inherit;font-size:14px;box-sizing:border-box';
  function sync() {
    st.title = $('#qzTitle').value; st.minutes = parseInt($('#qzMin').value) || 15; st.pass = parseInt($('#qzPass').value) || 80;
    st.qs = [...v.querySelectorAll('[data-q]')].map(el => ({
      q: el.querySelector('.qQ').value,
      choices: el.querySelector('.qC').value.split('\n').map(s => s.trim()).filter(Boolean),
      correct: (parseInt(el.querySelector('.qA').value) || 1) - 1
    }));
  }
  function draw() {
    v.innerHTML = `<a class="muted" style="cursor:pointer" id="qzBack">← กลับ</a>
      <h1>${quizId ? 'แก้ไขข้อสอบ' : 'เพิ่มข้อสอบใหม่'}</h1>
      <div class="card">
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <div style="flex:2;min-width:220px"><label class="muted" style="font-weight:600">ชื่อชุดข้อสอบ</label><input id="qzTitle" style="${ta};margin-top:4px" value="${esc(st.title)}" placeholder="เช่น แบบทดสอบ PDPA"></div>
          <div style="flex:1;min-width:110px"><label class="muted" style="font-weight:600">เวลา (นาที)</label><input id="qzMin" type="number" min="1" style="${ta};margin-top:4px" value="${st.minutes}"></div>
          <div style="flex:1;min-width:110px"><label class="muted" style="font-weight:600">เกณฑ์ผ่าน (%)</label><input id="qzPass" type="number" min="0" max="100" style="${ta};margin-top:4px" value="${st.pass}"></div>
        </div>
      </div>
      <div id="qzList">${st.qs.map((q, i) => `
        <div class="card" data-q data-idx="${i}">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <b class="muted">คำถามที่ ${i + 1}</b>
            <span>
              <button class="btn btn-ghost qUp" data-i="${i}" style="padding:4px 10px" ${i === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn btn-ghost qDown" data-i="${i}" style="padding:4px 10px" ${i === st.qs.length - 1 ? 'disabled' : ''}>↓</button>
              <button class="btn qDelQ" data-i="${i}" style="padding:4px 10px;background:#FBEAEA;color:var(--danger)">ลบ</button>
            </span></div>
          <input class="qQ" style="${ta};margin-bottom:6px" placeholder="คำถาม" value="${esc(q.q)}">
          <textarea class="qC" rows="4" style="${ta};margin-bottom:6px" placeholder="ตัวเลือก (บรรทัดละ 1 ข้อ)">${esc((q.choices || []).join('\n'))}</textarea>
          <div style="display:flex;gap:8px;align-items:center"><span class="muted">ข้อที่ถูก (ลำดับตัวเลือก 1-N):</span><input class="qA" type="number" min="1" style="${ta};width:120px" value="${(q.correct ?? 0) + 1}"></div>
        </div>`).join('')}</div>
      <div style="display:flex;gap:10px;margin-bottom:20px">
        <button class="btn btn-ghost" id="qzAdd">+ เพิ่มคำถาม</button>
        <button class="btn btn-primary" id="qzSave" style="margin-left:auto">💾 บันทึกข้อสอบ</button></div>
      <div class="login-err" id="qzMsg"></div>`;
    $('#qzBack').addEventListener('click', onBack);
    $('#qzAdd').addEventListener('click', () => { sync(); st.qs.push({ q: '', choices: [], correct: 0 }); draw(); });
    v.querySelectorAll('.qUp').forEach(b => b.addEventListener('click', () => { sync(); const i = +b.getAttribute('data-i'); [st.qs[i - 1], st.qs[i]] = [st.qs[i], st.qs[i - 1]]; draw(); }));
    v.querySelectorAll('.qDown').forEach(b => b.addEventListener('click', () => { sync(); const i = +b.getAttribute('data-i'); [st.qs[i + 1], st.qs[i]] = [st.qs[i], st.qs[i + 1]]; draw(); }));
    v.querySelectorAll('.qDelQ').forEach(b => b.addEventListener('click', () => { sync(); st.qs.splice(+b.getAttribute('data-i'), 1); draw(); }));
    $('#qzSave').addEventListener('click', async () => {
      sync(); const m = $('#qzMsg'); const btn = $('#qzSave');
      if (!st.title.trim()) { m.style.color = 'var(--danger)'; m.textContent = 'กรุณาใส่ชื่อชุดข้อสอบ'; return; }
      if (!st.qs.length) { m.style.color = 'var(--danger)'; m.textContent = 'ต้องมีอย่างน้อย 1 คำถาม'; return; }
      btn.disabled = true;
      try {
        await rpc('app_admin_quiz_save', { p_quiz: quizId, p_team: teamKey, p_title: st.title.trim(), p_minutes: st.minutes, p_pass: st.pass, p_questions: st.qs });
        m.style.color = 'var(--success)'; m.textContent = 'บันทึกข้อสอบเรียบร้อย ✓';
        setTimeout(onBack, 700);
      } catch (e) { m.style.color = 'var(--danger)'; m.textContent = 'บันทึกไม่สำเร็จ'; btn.disabled = false; }
    });
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
  const cell = 'padding:6px 9px;border:1px solid var(--line);border-radius:8px;font-family:inherit;font-size:13px';
  const emailOk = e => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
  function draw() {
    const nAdmin = users.filter(u => u.role === 'admin').length;
    v.innerHTML = `<h1>จัดการผู้ใช้</h1>
      <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start">
        <div class="card"><h2 style="font-size:16px">➕ สร้างบัญชีเดียว</h2>
          <div class="field"><label>อีเมล</label><input id="aEmail" type="email" placeholder="name@digiserve.work"></div>
          <div class="field"><label>ชื่อ-นามสกุล</label><input id="aName" placeholder="ชื่อที่จะแสดง"></div>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1"><label>ทีม</label><select id="aTeamSel" style="${inp}">${teamOpts()}</select></div>
            <div class="field" style="flex:1"><label>สิทธิ์</label><select id="aRole" style="${inp}"><option value="agent">ผู้เรียน (agent)</option><option value="admin">ผู้ดูแล (admin)</option></select></div>
          </div>
          <div class="field"><label>รหัสผ่านเริ่มต้น</label><input id="aPass" placeholder="อย่างน้อย 6 ตัว"></div>
          <div class="login-err" id="aErr" style="margin:0 0 10px"></div>
          <button class="btn btn-primary" id="aBtn" style="width:auto;padding:11px 24px">สร้างบัญชี</button></div>
        <div class="card"><h2 style="font-size:16px">📋 สร้างหลายบัญชีทีเดียว (Batch)</h2>
          <label class="muted" style="font-weight:600">อีเมล (1 บรรทัดต่อ 1 คน) — ใส่ชื่อได้โดยคั่นด้วยจุลภาค</label>
          <textarea id="bList" rows="7" placeholder="somchai@digiserve.work, สมชาย ใจดี&#10;somsri@digiserve.work, สมศรี มีสุข&#10;user3@digiserve.work" style="${inp};margin:6px 0 10px;resize:vertical"></textarea>
          <div style="display:flex;gap:10px">
            <div class="field" style="flex:1"><label>ทีม</label><select id="bTeam" style="${inp}">${teamOpts()}</select></div>
            <div class="field" style="flex:1"><label>รหัสผ่านเริ่มต้น (ใช้ร่วมกันทุกคน)</label><input id="bPass" placeholder="อย่างน้อย 6 ตัว"></div>
          </div>
          <div class="login-err" id="bErr" style="margin:0 0 10px"></div>
          <button class="btn btn-primary" id="bBtn" style="width:auto;padding:11px 24px">สร้างทั้งหมด</button>
          <div class="muted" style="margin-top:8px;font-size:12px">* ทุกบัญชีจะได้รหัสผ่านเริ่มต้นเดียวกัน — แนะนำให้แจ้งผู้ใช้เปลี่ยน/รีเซ็ตภายหลัง · ระบบข้ามอีเมลที่ซ้ำหรือไม่ถูกต้องให้อัตโนมัติ</div></div>
      </div>
      <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
        <h2 style="margin:0;font-size:16px">รายชื่อผู้ใช้ (${users.length}) <span class="muted" style="font-weight:400;font-size:13px">· ผู้ดูแล ${nAdmin} คน</span></h2>
        <select id="uTeam" style="${SS}"><option value="">ทุกทีม</option>${teamOpts(team)}</select></div>
        <div style="overflow:auto;margin-top:10px"><table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead><tr style="background:var(--teal-700,#198E8F);color:#fff"><th style="text-align:left;padding:9px 10px">อีเมล</th><th style="text-align:left;padding:9px 10px">ชื่อ</th><th style="padding:9px 10px">ทีม</th><th style="padding:9px 10px">สิทธิ์</th><th style="padding:9px 10px">รีเซ็ตรหัสผ่าน</th><th style="padding:9px 10px">ลบ</th></tr></thead>
          <tbody>${users.map(u => `<tr style="border-top:1px solid var(--line)">
            <td style="padding:7px 10px">${esc(u.email)}</td>
            <td style="padding:7px 10px;white-space:nowrap"><input class="nEdit" data-id="${u.id}" value="${esc(u.name || '')}" style="${cell};width:150px"> <button class="btn btn-ghost nSave" data-id="${u.id}" style="padding:5px 9px" title="บันทึกชื่อ">💾</button></td>
            <td style="padding:7px 10px;text-align:center">${esc(u.team || '—')}</td>
            <td style="padding:7px 10px;text-align:center"><select class="rEdit" data-id="${u.id}" data-name="${esc(u.name || '')}" data-team="${u.team_id || ''}" style="${cell}"><option value="agent" ${u.role !== 'admin' ? 'selected' : ''}>Agent</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
            <td style="padding:7px 10px;text-align:center;white-space:nowrap"><input class="pNew" data-id="${u.id}" placeholder="รหัสใหม่" style="${cell};width:110px"> <button class="btn btn-ghost pDo" data-id="${u.id}" style="padding:5px 10px">รีเซ็ต</button></td>
            <td style="padding:7px 10px;text-align:center"><button class="btn uDel" data-id="${u.id}" data-name="${esc(u.name || u.email)}" style="padding:5px 10px;background:#FBEAEA;color:var(--danger)">ลบ</button></td></tr>`).join('')}</tbody></table></div></div>`;

    $('#aBtn').addEventListener('click', async () => {
      const btn = $('#aBtn'); btn.disabled = true; $('#aErr').style.color = 'var(--danger)'; $('#aErr').textContent = '';
      const em = $('#aEmail').value.trim(), pw = $('#aPass').value;
      if (!emailOk(em)) { $('#aErr').textContent = 'อีเมลไม่ถูกต้อง'; btn.disabled = false; return; }
      if (pw.length < 6) { $('#aErr').textContent = 'รหัสผ่านอย่างน้อย 6 ตัว'; btn.disabled = false; return; }
      try {
        await rpc('app_admin_create_user', { p_email: em, p_password: pw, p_name: $('#aName').value.trim(), p_role: $('#aRole').value, p_team: $('#aTeamSel').value });
        $('#aName').value = $('#aEmail').value = $('#aPass').value = ''; await load(); draw();
      } catch (e) { $('#aErr').textContent = String(e.message || '').includes('duplicate') ? 'อีเมลนี้มีอยู่แล้ว' : 'สร้างไม่สำเร็จ'; } finally { btn.disabled = false; }
    });
    $('#bBtn').addEventListener('click', async () => {
      const btn = $('#bBtn'), err = $('#bErr'); err.style.color = 'var(--danger)';
      const pw = $('#bPass').value; if (pw.length < 6) { err.textContent = 'รหัสผ่านอย่างน้อย 6 ตัว'; return; }
      const seen = new Set(users.map(u => (u.email || '').toLowerCase()));
      const rows = $('#bList').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
        const i = l.indexOf(','); return i < 0 ? { e: l.trim(), n: '' } : { e: l.slice(0, i).trim(), n: l.slice(i + 1).trim() };
      });
      const valid = rows.filter(r => emailOk(r.e) && !seen.has(r.e.toLowerCase()));
      if (!valid.length) { err.textContent = 'ไม่มีอีเมลที่ถูกต้อง/ยังไม่ซ้ำ'; return; }
      btn.disabled = true; err.textContent = ''; let ok = 0;
      for (const r of valid) { try { await rpc('app_admin_create_user', { p_email: r.e, p_password: pw, p_name: r.n, p_role: 'agent', p_team: $('#bTeam').value }); ok++; } catch (_) {} }
      err.style.color = 'var(--success)'; err.textContent = `สร้างสำเร็จ ${ok} บัญชี (ข้าม ${rows.length - ok})`;
      $('#bList').value = ''; await load(); draw();
    });
    $('#uTeam').addEventListener('change', async e => { team = e.target.value; await load(); draw(); });
    v.querySelectorAll('.nSave').forEach(b => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id'), u = users.find(x => x.id === id);
      const nm = v.querySelector(`.nEdit[data-id="${id}"]`).value.trim();
      b.disabled = true; try { await rpc('app_admin_set_user', { p_user_id: id, p_name: nm, p_role: u.role, p_team: u.team_id }); b.textContent = '✓'; setTimeout(() => { b.textContent = '💾'; b.disabled = false; }, 1200); u.name = nm; } catch (e) { alert('บันทึกไม่สำเร็จ'); b.disabled = false; }
    }));
    v.querySelectorAll('.rEdit').forEach(s => s.addEventListener('change', async () => {
      const id = s.getAttribute('data-id'), newRole = s.value;
      if (!confirm(newRole === 'admin' ? 'ตั้งให้เป็นผู้ดูแล (Admin)?' : 'เปลี่ยนเป็นผู้เรียน (Agent)?')) { draw(); return; }
      try { await rpc('app_admin_set_user', { p_user_id: id, p_name: s.getAttribute('data-name'), p_role: newRole, p_team: s.getAttribute('data-team') || null }); await load(); draw(); } catch (e) { alert('เปลี่ยนสิทธิ์ไม่สำเร็จ'); }
    }));
    v.querySelectorAll('.pDo').forEach(b => b.addEventListener('click', async () => {
      const id = b.getAttribute('data-id'), np = v.querySelector(`.pNew[data-id="${id}"]`).value;
      if (np.length < 6) { alert('รหัสผ่านอย่างน้อย 6 ตัว'); return; }
      b.disabled = true; try { await rpc('app_admin_reset_password', { p_user_id: id, p_new: np }); alert('รีเซ็ตรหัสผ่านเรียบร้อย'); v.querySelector(`.pNew[data-id="${id}"]`).value = ''; } catch (e) { alert('ไม่สำเร็จ'); } finally { b.disabled = false; }
    }));
    v.querySelectorAll('.uDel').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('ลบผู้ใช้ "' + b.getAttribute('data-name') + '" ?')) return;
      try { await rpc('app_admin_delete_user', { p_user_id: b.getAttribute('data-id') }); await load(); draw(); }
      catch (e) { alert(String(e.message || '').includes('self') ? 'ลบบัญชีตัวเองไม่ได้' : 'ลบไม่สำเร็จ'); }
    }));
  }
  draw();
}
