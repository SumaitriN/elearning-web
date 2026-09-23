/* i18n.js — สลับภาษา TH/EN โดยไม่แตะโค้ดหน้าอื่น
   วิธี: แปล DOM ที่ render แล้วเป็นอังกฤษแบบสด ๆ ผ่าน MutationObserver
   ต้นฉบับคือภาษาไทย → กด TH จะ reload กลับเป็นไทย, กด EN จะแปลทับ */
(function () {
  window.LANG = localStorage.getItem('lang') || 'th';

  // ---- พจนานุกรม: ข้อความไทย (trim แล้ว) -> อังกฤษ ----
  const DICT = {
    // ทั่วไป
    'กำลังโหลด...': 'Loading...', 'เฉพาะผู้ดูแลระบบ': 'Admins only',
    'โหลดข้อมูลไม่สำเร็จ': 'Failed to load data', 'ไม่มีข้อมูล': 'No data',
    'ยังไม่มีรายการ': 'No items yet', 'ทีม:': 'Team:', 'เลือกทีม:': 'Select team:',
    'ทุกทีม': 'All teams', '← กลับ': '← Back', 'กลับ': 'Back',
    'บันทึกเรียบร้อย ✓': 'Saved ✓', 'บันทึกไม่สำเร็จ': 'Save failed', 'ไม่พบ': 'Not found',
    // แถบบน / เมนู
    'สวัสดี': 'Hi', '🔑 เปลี่ยนรหัสผ่าน': '🔑 Change password', 'ออกจากระบบ': 'Sign out',
    // เมนูซ้าย
    'หน้าหลัก': 'Home', 'บทเรียน': 'Lessons', 'แบบทดสอบ': 'Quizzes', 'พิมพ์ดีด': 'Typing',
    'มอบหมายงาน': 'Assignments', 'ความคืบหน้า': 'Progress', 'แดชบอร์ดผลสอบ': 'Results Dashboard',
    'ใบประกาศ': 'Certificates', 'จัดการบทเรียน': 'Manage Lessons', 'จัดการผู้ใช้': 'Manage Users',
    // ล็อกอิน
    'ระบบอบรมและทดสอบออนไลน์': 'Online training & testing system',
    'อีเมล': 'Email', 'รหัสผ่าน': 'Password', 'เข้าสู่ระบบ': 'Sign in',
    'อีเมลหรือรหัสผ่านไม่ถูกต้อง': 'Incorrect email or password',
    'เข้าสู่ระบบไม่สำเร็จ ลองใหม่อีกครั้ง': 'Sign in failed, please try again',
    // หน้าหลัก
    'ยินดีต้อนรับ': 'Welcome',
    'เลือกเรียนบทเรียน หรือทำแบบทดสอบเพื่อประเมินความรู้ของคุณ': 'Choose a lesson or take a quiz to assess your knowledge.',
    'เริ่มเรียนรู้': 'Start learning', 'ทำข้อสอบ': 'Take a quiz', '▶ เริ่มเรียน': '▶ Start',
    // บทเรียน
    'เช็คความเข้าใจ': 'Check your understanding',
    '✅ เรียนจบบทนี้แล้ว': '✅ You have completed this lesson',
    'ดูเนื้อหาครบแล้ว กดปุ่มเพื่อบันทึกว่าเรียนจบ': 'Finished the content? Click to mark as complete.',
    '✓ เรียนจบบทนี้': '✓ Mark lesson complete',
    // ข้อสอบ
    'ยังไม่มีข้อสอบในชุดนี้': 'No questions in this quiz yet', 'เริ่มทำข้อสอบ': 'Start quiz',
    '← ย้อนกลับ': '← Previous', 'ส่งคำตอบ': 'Submit', 'ถัดไป →': 'Next →',
    'กำลังส่งคำตอบ...': 'Submitting...', 'ส่งคำตอบไม่สำเร็จ ลองใหม่อีกครั้ง': 'Submit failed, please try again',
    'ผ่าน ✓': 'Passed ✓', 'ผ่าน': 'Passed', 'ไม่ผ่าน': 'Not passed',
    'ยินดีด้วยค่ะ คุณสอบผ่านแล้ว 🎉': 'Congratulations, you passed 🎉',
    'ยังไม่ผ่าน ลองอีกครั้งนะคะ 💪': 'Not passed yet, try again 💪',
    'ถูก': 'Correct', 'ผิด': 'Wrong', '(ไม่ได้ตอบ)': '(no answer)', 'กลับหน้าหลัก': 'Back to home',
    // เปลี่ยนรหัสผ่าน
    'เปลี่ยนรหัสผ่าน': 'Change password', 'รหัสผ่านปัจจุบัน': 'Current password',
    'รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)': 'New password (min 6 chars)', 'ยืนยันรหัสผ่านใหม่': 'Confirm new password',
    'บันทึกรหัสผ่านใหม่': 'Save new password',
    'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร': 'New password must be at least 6 characters',
    'รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน': 'New passwords do not match',
    'เปลี่ยนรหัสผ่านเรียบร้อย ✓': 'Password changed ✓',
    'รหัสผ่านปัจจุบันไม่ถูกต้อง': 'Current password is incorrect', 'เปลี่ยนไม่สำเร็จ ลองใหม่': 'Change failed, try again',
    // แดชบอร์ด
    'แดชบอร์ดผลสอบ': 'Results Dashboard', 'จำนวนครั้งสอบ': 'Attempts', 'ในช่วงที่เลือก': 'In selection',
    'ผู้เข้าสอบ': 'Test takers', 'จำนวนคน': 'people', 'อัตราสอบผ่าน': 'Pass rate',
    'คะแนนเฉลี่ย': 'Avg. score', 'เฉลี่ยทุกครั้ง': 'Across attempts',
    'ทุกชุดข้อสอบ': 'All quizzes', 'ทุกผล': 'All results', 'ค้นหาชื่อ...': 'Search name...',
    'ล้างตัวกรอง': 'Clear filters', 'อัตราสอบผ่านแต่ละชุด': 'Pass rate by quiz',
    'ผลรวม ผ่าน/ไม่ผ่าน': 'Pass / Fail total', 'จำนวนครั้งสอบตามเดือน': 'Attempts by month',
    'วันที่': 'Date', 'ชื่อ': 'Name', 'ทีม': 'Team', 'ชุดข้อสอบ': 'Quiz', 'คะแนน': 'Score', 'ผล': 'Result',
    'แสดง 300 แถวแรก · ดาวน์โหลด CSV เพื่อดูทั้งหมด': 'Showing first 300 rows · Download CSV for all',
    'ผลรายคน (ตาราง)': 'Results by trainee', 'ผู้เรียน': 'Trainee', 'สถานะ': 'Status',
    'ผ่านทั้งหมด': 'All passed', 'กำลังดำเนินการ': 'In progress',
    '— คะแนนล่าสุดของแต่ละคนต่อชุด': "— each person's latest score per test",
    'รายการสอบทั้งหมด': 'All attempts',
    'คลิกหัวคอลัมน์เพื่อเรียงลำดับ · ดาวน์โหลด = ข้อมูลตามตัวกรองปัจจุบัน': 'Click a column header to sort · Download = data for current filter',
    '⬇ ดาวน์โหลด CSV': '⬇ Download CSV', '‹ ก่อนหน้า': '‹ Prev', 'ถัดไป ›': 'Next ›',
    '— ชีตต้นทางผลสอบ': '— backend result sheets', 'ชีตต้นทาง (ผลข้อสอบ)': 'Backend sheet (results)', 'เปิดชีต ↗': 'Open sheet ↗',
    // พิมพ์ดีด
    'ข้อสอบพิมพ์ดีด': 'Typing Test', 'ภาษาไทย': 'Thai', 'ยังไม่เคยทำ': 'Not attempted',
    'พิมพ์ตามข้อความให้เร็วและแม่นยำที่สุดใน 60 วินาที · วัดผลเป็น WPM (คำ/นาที) และความแม่นยำ':
      'Type the text as fast and accurately as you can in 60 seconds · Measured in WPM and accuracy',
    'พิมพ์ดีดไทย — ชุดที่ 1': 'Thai Typing — Set 1', 'พิมพ์ดีดไทย — ชุดที่ 2': 'Thai Typing — Set 2',
    'เริ่มพิมพ์ที่นี่ (จับเวลาเมื่อพิมพ์ตัวแรก)': 'Start typing here (timer starts on first key)',
    'ส่งผล': 'Submit', 'แม่นยำ:': 'Accuracy:', 'แม่นยำ': 'Accuracy',
    'บันทึกผลเรียบร้อย ✓': 'Result saved ✓', 'ทำอีกครั้ง': 'Try again',
    // มอบหมายงาน
    'ประเภท': 'Type', 'รายการ': 'Item', '— เลือก —': '— Select —', 'กำหนดส่ง': 'Due date',
    'มอบหมายให้ผู้ที่เลือก': 'Assign to selected', 'งานที่มอบหมายล่าสุด': 'Recent assignments',
    'เลือกบทเรียน / แบบทดสอบ': 'Select lessons / quizzes', '(เลือกได้หลายรายการ)': '(select multiple)',
    'เลือกทั้งหมด': 'Select all', 'ล้าง': 'Clear', 'ค้นหา...': 'Search...',
    'บทเรียน (วิดีโอ+เนื้อหา)': 'Lessons (video + content)', 'กำหนดส่ง (ไม่บังคับ)': 'Due date (optional)',
    'มอบหมายให้': 'Assign to', '📅 สร้างวันนี้': '📅 Created today', '🆕 คนใหม่ 7 วัน': '🆕 New in 7 days',
    'ทั้งทีม Makro': 'All Makro', 'ทั้งทีม Lotus': 'All Lotus', 'ทีม Center': 'Center team',
    'วันนี้': 'today', 'เมื่อวาน': 'yesterday',
    'กรุณาเลือกบทเรียน/แบบทดสอบอย่างน้อย 1 รายการ': 'Please select at least 1 lesson/quiz',
    'กรุณาเลือกรายการ': 'Please select an item', 'กรุณาเลือกผู้รับมอบหมายอย่างน้อย 1 คน': 'Select at least 1 recipient',
    'มอบหมายไม่สำเร็จ': 'Assignment failed', 'ยังไม่มีการมอบหมาย': 'No assignments yet',
    // ความคืบหน้า
    'ความคืบหน้า (เรียน + สอบ)': 'Progress (Learning + Quizzes)', 'เรียนจบ': 'Lessons done', 'สอบผ่าน': 'Quizzes passed',
    // ใบประกาศ
    'ออกใบประกาศ': 'Issue certificate', 'ผู้รับ (บัญชี)': 'Recipient (account)',
    'ชื่อบนใบประกาศ (แก้ได้)': 'Name on certificate (editable)', 'บรรทัดที่ 1 (หัวข้อ)': 'Line 1 (heading)',
    'บรรทัดที่ 2 (หลักสูตร/รางวัล — ตัวใหญ่สีทอง)': 'Line 2 (course/award — large gold)',
    'ใบประกาศที่ออกแล้ว': 'Issued certificates', 'ออกใบประกาศไม่สำเร็จ': 'Failed to issue',
    '🖨 พิมพ์ / บันทึกเป็น PDF': '🖨 Print / Save as PDF', 'เลขที่': 'No.', 'หลักสูตร': 'Course',
    'เปิด': 'Open', 'ยังไม่มีใบประกาศ': 'No certificates yet',
    // จัดการบทเรียน
    '+ เพิ่มบทเรียนใหม่': '+ Add new lesson', 'หมวด': 'Category', 'ชื่อบทเรียน': 'Lesson name',
    'จัดการ': 'Actions', 'แก้เนื้อหา': 'Edit content', 'แก้ชื่อ': 'Rename', 'ลบ': 'Delete', 'ไม่มีบทเรียน': 'No lessons',
    // block editor
    '+ เพิ่มบล็อก': '+ Add block', '💾 บันทึกเนื้อหา': '💾 Save content',
    'ข้อความ': 'Text', 'วิดีโอ (YouTube)': 'Video (YouTube)', 'รูปภาพ (URL)': 'Image (URL)',
    'สไลด์ (Google Slides)': 'Slides (Google Slides)', 'เนื้อหาข้อความ': 'Text content',
    'ลิงก์ YouTube': 'YouTube link', 'URL รูปภาพ': 'Image URL', 'ลิงก์ Google Slides': 'Google Slides link',
    'คำถาม': 'Question', 'ตัวเลือก (บรรทัดละ 1 ข้อ)': 'Choices (one per line)',
    'ข้อที่ถูก (1-N)': 'Correct choice (1-N)', 'คำอธิบายเฉลย': 'Answer explanation',
    // จัดการผู้ใช้
    'สร้างบัญชีใหม่': 'Create new account', 'ชื่อ-สกุล': 'Full name', 'รหัสผ่านตั้งต้น': 'Initial password',
    'สิทธิ์': 'Role', 'ผู้เรียน (agent)': 'Learner (agent)', 'ผู้ดูแล (admin)': 'Admin',
    'สร้างบัญชี': 'Create account', 'รีเซ็ตรหัส': 'Reset password',
    'อีเมลนี้มีอยู่แล้ว': 'This email already exists', 'สร้างไม่สำเร็จ': 'Create failed'
  };

  // ---- กฎแบบมีตัวเลข/ชื่อแทรก ----
  const RULES = [
    [/^สวัสดี (.+)$/, 'Hi $1'],
    [/^(\d+)\s*บทเรียน$/, '$1 lessons'],
    [/^(\d+)\s*ชุด$/, '$1 sets'],
    [/^(\d+) ข้อ · (\d+) นาที · ผ่าน (\d+)%$/, '$1 questions · $2 min · pass $3%'],
    [/^(\d+) ข้อ · เวลา (\d+) นาที · เกณฑ์ผ่าน (\d+)%$/, '$1 questions · Time $2 min · Pass $3%'],
    [/^ข้อ (\d+) \/ (\d+)$/, 'Question $1 / $2'],
    [/^ข้อ (\d+)$/, 'Question $1'],
    [/^📋 เฉลย \((\d+)\/(\d+)\)$/, '📋 Answers ($1/$2)'],
    [/^(\d+) \/ (\d+) ผ่าน$/, '$1 / $2 passed'],
    [/^สถิติดีสุด: (\d+) WPM · แม่นยำ (\d+)%$/, 'Best: $1 WPM · Acc $2%'],
    [/^ความแม่นยำ (\d+)% · เวลา (\d+) วินาที$/, 'Accuracy $1% · Time $2 sec'],
    [/^เลือกทั้งทีม \((\d+) คน\)$/, 'Select whole team ($1 people)'],
    [/^มอบหมายเรียบร้อย (\d+) คน ✓$/, 'Assigned to $1 ✓'],
    [/^รายชื่อผู้ใช้ \((\d+)\)$/, 'Users ($1)'],
    [/^บล็อก (\d+)$/, 'Block $1'],
    [/^· (\d+) รายการ$/, '· $1 shown'],
    [/^หน้า (\d+) \/ (\d+)$/, 'Page $1 / $2'],
    [/^(\d+) วันก่อน$/, '$1 days ago'],
    [/^สร้าง (\d{4}-\d{2}-\d{2})$/, 'Created $1'],
    [/^เลือกแล้ว: (\d+) รายการ · (\d+) คน$/, 'Selected: $1 items · $2 people'],
    [/^(\d+) รายการ$/, '$1 items'],
    [/^(\d+) คน$/, '$1 people'],
    [/^มอบหมายเรียบร้อย (\d+) รายการ × (\d+) คน ✓$/, 'Assigned $1 items × $2 people ✓'],
    [/^แก้เนื้อหา: (.+)$/, 'Edit content: $1'],
    // prefix (คงส่วนเนื้อหาไทยไว้ด้านหลัง)
    [/^✓ ถูกต้อง/, '✓ Correct'],
    [/^✗ คำตอบที่ถูกคือข้อ (\d+)/, '✗ Correct answer is #$1'],
    [/^คำตอบของคุณ:/, 'Your answer:'],
    [/^✅ เฉลย:/, '✅ Answer:']
  ];

  function tr(s) {
    const t = String(s).trim(); if (!t) return null;
    if (DICT[t] != null) return DICT[t];
    for (const [re, rep] of RULES) if (re.test(t)) return t.replace(re, rep);
    return null;
  }

  function translateEl(root) {
    if (window.LANG !== 'en' || !root) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
    nodes.forEach(n => {
      const raw = n.nodeValue; const t = raw.trim(); if (!t) return;
      const out = tr(t); if (out != null && out !== t) n.nodeValue = raw.replace(t, out);
    });
    root.querySelectorAll && root.querySelectorAll('[placeholder]').forEach(el => {
      const out = tr(el.placeholder); if (out != null) el.placeholder = out;
    });
  }
  window.translateEl = translateEl;

  // ---- เฝ้าดู DOM: เมื่อหน้า render ใหม่ ให้แปลอัตโนมัติ ----
  let obs = null;
  function startObserver() {
    obs = new MutationObserver(muts => {
      if (window.LANG !== 'en') return;
      obs.disconnect();
      try { translateEl(document.body); } finally { obs.observe(document.body, { childList: true, subtree: true }); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ---- ปุ่มสลับภาษา ----
  function paintToggle() {
    document.querySelectorAll('#langToggle [data-lang]').forEach(s => {
      const on = s.getAttribute('data-lang') === window.LANG;
      s.style.fontWeight = on ? '700' : '400';
      s.style.color = on ? 'var(--teal-700, #198E8F)' : 'var(--muted, #98a2a8)';
    });
  }
  function setLang(l) { if (l === window.LANG) return; localStorage.setItem('lang', l); location.reload(); }

  window.addEventListener('DOMContentLoaded', () => {
    const tgl = document.getElementById('langToggle');
    if (tgl) tgl.querySelectorAll('[data-lang]').forEach(s =>
      s.addEventListener('click', () => setLang(s.getAttribute('data-lang'))));
    paintToggle();
    startObserver();
    if (window.LANG === 'en') translateEl(document.body);
  });
})();
