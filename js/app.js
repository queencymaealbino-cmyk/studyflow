(() => {
  'use strict';
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const KEY = { tasks: 'studyflow.tasks', profile: 'studyflow.profile', settings: 'studyflow.settings' };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const localDate = s => { const [y, m, d] = String(s || '').split('-').map(Number); return new Date(y, m - 1, d); };
  const fmtDate = (s, opts = { month: 'long', day: 'numeric', year: 'numeric' }) => localDate(s).toLocaleDateString('en-US', opts);
  const timeLabel = t => { if (!t) return ''; const [h, m] = t.split(':').map(Number); return `${(h % 12) || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const safe = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (key, fallback) => { try { const x = localStorage.getItem(key); return x === null ? fallback : JSON.parse(x); } catch { return fallback; } };
  const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  // The earlier build seeded this exact three-task bundle. Remove only that recognizable bundle;
  // keep every other task, including user-created tasks with similar titles.
  let storedTasks = get(KEY.tasks, []);
  if (!Array.isArray(storedTasks)) storedTasks = [];
  const demoSpec = [
    ['Finish Capstone', 'Capstone', '19:00', 'High'],
    ['Networking Quiz', 'Networking', '21:00', 'Medium'],
    ['HCI Activity', 'HCI', '10:00', 'Low']
  ];
  const demoMatches = demoSpec.map(([title, subject, time, priority]) =>
    storedTasks.filter(t => t && t.title === title && t.subject === subject && t.time === time && t.priority === priority));
  const demoBaseDate = demoMatches[0]?.[0]?.date;
  const demoNextDate = demoBaseDate ? (() => { const d = localDate(demoBaseDate); d.setDate(d.getDate() + 1); return dateKey(d); })() : null;
  const looksLikeDemo = storedTasks.length >= 3 && demoMatches.every(matches => matches.length === 1) &&
    demoMatches[0][0].date === demoMatches[1][0].date && demoMatches[2][0].date === demoNextDate;
  let tasks = looksLikeDemo ? storedTasks.filter(t => !demoSpec.some(([title, subject, time, priority]) =>
    t.title === title && t.subject === subject && t.time === time && t.priority === priority)) : storedTasks;
  if (get(KEY.tasks, null) === null || looksLikeDemo) persist(KEY.tasks, tasks);

  let profileData = get(KEY.profile, null);
  let profile = profileData && typeof profileData === 'object'
    ? { name: String(profileData.name || 'Student Planner').trim() || 'Student Planner' }
    : null;
  if (profile && JSON.stringify(profileData) !== JSON.stringify(profile)) persist(KEY.profile, profile);
  let settings = get(KEY.settings, { notifications: true, darkMode: false });
  if (!settings || typeof settings !== 'object') settings = { notifications: true, darkMode: false };
  settings = { notifications: settings.notifications !== false, darkMode: settings.darkMode === true };
  persist(KEY.settings, settings);

  let current = 'home', filter = 'All', selectedDate = dateKey(today);
  let monthView = new Date(today.getFullYear(), today.getMonth(), 1);
  let activeTask = null, editId = null, priority = 'High', toastTimer;
  document.documentElement.classList.toggle('dark', settings.darkMode);

  function showToast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }
  function activeScreen(name) {
    current = name;
    $$('.screen').forEach(x => { const on = x.id === `${name}Screen`; x.hidden = !on; x.classList.toggle('is-active', on); });
    $('#bottomNav').hidden = ['form', 'details', 'setup'].includes(name);
    $$('[data-nav]').forEach(b => { b.classList.toggle('active', b.dataset.nav === name); if (b.dataset.nav === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    window.scrollTo(0, 0);
  }
  const sorted = arr => arr.slice().sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  function taskCard(t, { checkbox = false, compact = false } = {}) {
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const dateText = t.date === dateKey(today) ? 'Today' : t.date === dateKey(tomorrow) ? 'Tomorrow' : fmtDate(t.date, { month: 'short', day: 'numeric' });
    const p = ['High', 'Medium', 'Low'].includes(t.priority) ? t.priority : 'Medium';
    return `<article class="task-card ${t.completed ? 'task-completed' : ''}" data-open-task="${safe(t.id)}" tabindex="0" role="button" aria-label="${safe(t.title)}, ${safe(dateText)} at ${safe(timeLabel(t.time))}"><div class="task-top"><span class="task-category">${safe(t.subject)}</span><span class="task-time">${compact ? timeLabel(t.time) : `${dateText} · ${timeLabel(t.time)}`}</span></div><div class="task-bottom">${checkbox ? `<button class="task-check" data-toggle-task="${safe(t.id)}" role="checkbox" aria-checked="${!!t.completed}" aria-label="Mark ${safe(t.title)} ${t.completed ? 'incomplete' : 'complete'}">${t.completed ? '✓' : ''}</button>` : ''}<span class="task-name">${safe(t.title)}</span><span class="priority priority-${p.toLowerCase()}">${p}</span></div></article>`;
  }
  function renderHome() {
    const total = tasks.length, done = tasks.filter(t => t.completed).length, pct = total ? Math.round(done / total * 100) : 0;
    const date = dateKey(today), list = sorted(tasks.filter(t => !t.completed && t.date >= date)).slice(0, 3);
    const empty = tasks.length === 0;
    $('#homeScreen').innerHTML = `<header class="greeting"><h1 id="homeTitle">Good morning! 👋</h1><p class="date">${fmtDate(date)}</p><p class="quote">“A little progress is still progress. ✨”</p></header><section class="card progress-card" aria-label="Today's progress"><div class="card-top"><h2>TODAY'S PROGRESS</h2></div><div class="card-top progress-values"><span>${done}/${total}</span><span class="progress-percent">${pct}%</span></div><div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Task completion"><div class="progress-fill" style="width:${pct}%"></div></div></section><div class="section-title"><h2>Upcoming tasks</h2>${empty ? '' : '<button class="text-button" data-action="all-tasks">View all</button>'}</div><div class="task-list">${empty ? '<div class="card empty-state">No tasks yet<br>Add your first task to get started! ✨</div>' : list.length ? list.map(t => taskCard(t, { compact: true })).join('') : '<div class="card empty-state">No upcoming tasks.</div>'}</div>${empty ? '<button type="button" class="primary add-button" data-action="add-task">＋ Add Task</button>' : ''}`;
  }
  function renderTasks() {
    let list = sorted(tasks), d = dateKey(today);
    if (filter === 'Today') list = list.filter(t => t.date === d);
    if (filter === 'Upcoming') list = list.filter(t => t.date > d && !t.completed);
    if (filter === 'Completed') list = list.filter(t => t.completed);
    const emptyMessage = tasks.length === 0 ? 'No tasks yet<br>Add your first task to get started! ✨' : `No ${filter.toLowerCase()} tasks.`;
    $('#tasksScreen').innerHTML = `<header class="page-head"><h1 id="tasksTitle">My Tasks</h1></header><div class="filter-row" role="group" aria-label="Filter tasks">${['All', 'Today', 'Upcoming', 'Completed'].map(f => `<button type="button" class="filter-button ${filter === f ? 'active' : ''}" data-filter="${f}" aria-pressed="${filter === f}">${f}</button>`).join('')}</div><div class="task-list">${list.length ? list.map(t => taskCard(t, { checkbox: true })).join('') : `<div class="card empty-state">${emptyMessage}</div>`}</div><button type="button" class="primary add-button" data-action="add-task">＋ Add New Task</button>`;
  }
  function renderCalendar() {
    const y = monthView.getFullYear(), m = monthView.getMonth(), first = new Date(y, m, 1), offset = first.getDay(), count = new Date(y, m + 1, 0).getDate();
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    let cells = weekdays.map(x => `<div class="weekday">${x}</div>`).join('');
    const prevCount = new Date(y, m, 0).getDate();
    for (let i = 0; i < 42; i++) {
      let day = i - offset + 1, date, outside = false;
      if (day < 1) { date = new Date(y, m - 1, prevCount + day); outside = true; }
      else if (day > count) { date = new Date(y, m + 1, day - count); outside = true; }
      else date = new Date(y, m, day);
      const key = dateKey(date), has = tasks.some(t => t.date === key);
      cells += `<button class="day ${outside ? 'outside' : ''} ${key === selectedDate ? 'selected' : ''} ${key === dateKey(today) ? 'today' : ''} ${has ? 'has-tasks' : ''}" data-date="${key}" aria-label="${fmtDate(key)}${has ? ', has tasks' : ''}" aria-pressed="${key === selectedDate}">${date.getDate()}</button>`;
      if (i >= 34 && day > count) break;
    }
    const list = sorted(tasks.filter(t => t.date === selectedDate));
    $('#calendarScreen').innerHTML = `<header class="page-head"><h1 id="calendarTitle">Calendar</h1></header><div class="month-picker"><button type="button" data-month="-1" aria-label="Previous month">‹</button><span>${monthView.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span><button type="button" data-month="1" aria-label="Next month">›</button></div><div class="card calendar-card"><div class="calendar-grid">${cells}</div></div><div class="section-title"><h2 class="selected-day-title">${fmtDate(selectedDate)}</h2><span class="day-count">${list.length} ${list.length === 1 ? 'Task' : 'Tasks'}</span></div><div class="task-list">${list.length ? list.map(t => taskCard(t, { compact: true })).join('') : '<div class="card empty-state">No tasks scheduled</div>'}</div>`;
  }
  function renderForm() {
    const task = editId ? tasks.find(t => t.id === editId) : null;
    $('#formScreen').innerHTML = `<button class="back-link" data-action="back">‹ &nbsp;Back</button><header class="page-head"><h1 id="formTitle">${task ? 'Edit Task' : 'Add New Task'}</h1></header><form class="card form-card" id="taskForm" novalidate><label class="field"><span>Task Title</span><input name="title" maxlength="90" placeholder="Enter task title" required value="${safe(task?.title || '')}"></label><label class="field"><span>Date</span><input name="date" type="date" required value="${safe(task?.date || selectedDate)}"></label><label class="field"><span>Time</span><input name="time" type="time" required value="${safe(task?.time || '')}"></label><label class="field"><span>Subject</span><input name="subject" maxlength="50" placeholder="Select subject" required value="${safe(task?.subject || '')}"></label><fieldset class="field" style="border:0;padding:0"><legend style="font-size:10px;font-weight:650;margin-bottom:5px">Priority</legend><div class="priority-choices">${['High', 'Medium', 'Low'].map(p => `<button type="button" class="priority-choice" data-priority="${p}" aria-pressed="${(task?.priority || priority) === p}">${p}</button>`).join('')}</div></fieldset><label class="field"><span>Notes <small>(optional)</small></span><textarea name="notes" placeholder="Add notes">${safe(task?.notes || '')}</textarea></label><p class="form-error" id="formError" role="alert" hidden></p><button class="primary" type="submit">Save Task</button></form>`;
    priority = task?.priority || 'High';
  }
  function renderDetails() {
    const t = tasks.find(x => x.id === activeTask); if (!t) { activeScreen('tasks'); return; }
    const p = ['High', 'Medium', 'Low'].includes(t.priority) ? t.priority : 'Medium';
    $('#detailsScreen').innerHTML = `<button class="back-link" data-action="back">‹ &nbsp;Back to tasks</button><header class="page-head"><h1 id="detailsTitle">Task Details</h1></header><article class="card details-card"><h2>${safe(t.title)}</h2><div class="detail-row"><span>Date</span><strong>${fmtDate(t.date)}</strong></div><div class="detail-row"><span>Time</span><strong>${timeLabel(t.time)}</strong></div><div class="detail-row"><span>Subject</span><strong>${safe(t.subject)}</strong></div><div class="detail-row"><span>Priority</span><span class="priority priority-${p.toLowerCase()}">${p}</span></div>${t.notes ? `<p class="notes">${safe(t.notes)}</p>` : '<p class="notes">No notes added.</p>'}<div class="button-row"><button class="primary" data-action="complete-detail">${t.completed ? 'Undo' : 'Complete'}</button><button class="secondary" data-action="edit-task">Edit</button><button class="danger" data-action="delete-task">Delete</button></div></article>`;
  }
  function streak() {
    const dates = new Set(tasks.filter(t => t.completed).map(t => t.completedOn || t.date));
    let n = 0, d = new Date(today); if (!dates.has(dateKey(d))) d.setDate(d.getDate() - 1);
    while (dates.has(dateKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function initials(name) { return name.trim().split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase() || 'S'; }
  function renderProfile() {
    const name = profile?.name || 'Student Planner';
    const done = tasks.filter(t => t.completed).length;
    const subjects = new Set(tasks.map(t => String(t.subject || '').trim().toLowerCase()).filter(Boolean)).size;
    $('#profileScreen').innerHTML = `<header class="page-head"><h1 id="profileTitle">My Profile</h1></header><section class="card profile-card"><div class="avatar">${safe(initials(name))}</div><h2>${safe(name)}</h2></section><div class="profile-stats"><div class="card stat-card"><strong>${done}</strong><span>Tasks Done</span></div><div class="card stat-card"><strong>${subjects}</strong><span>Subjects</span></div><div class="card stat-card"><strong>${streak()}d</strong><span>Streak</span></div></div><div class="card settings-card"><div class="setting-row"><span>♧ &nbsp; Notifications</span><button class="toggle" role="switch" aria-checked="${settings.notifications}" aria-label="Notifications" data-setting="notifications"></button></div><div class="setting-row"><span>☾ &nbsp; Dark Mode</span><button class="toggle" role="switch" aria-checked="${settings.darkMode}" aria-label="Dark Mode" data-setting="darkMode"></button></div><button class="setting-row" data-action="about" style="width:100%;border:0;background:transparent;text-align:left"><span>ⓘ &nbsp; About StudyFlow</span><span>›</span></button><div class="setting-row"><span>♧ &nbsp; Version</span><span>1.0.0</span></div></div><button class="primary profile-edit" data-action="edit-profile">Edit Profile</button>`;
  }
  function renderSetup() {
    $('#setupScreen').innerHTML = `<div class="setup-screen"><h1 id="setupTitle">Welcome to StudyFlow ✨</h1><p class="subhead">A little more organized, one day at a time.</p><form class="card form-card" id="profileForm" novalidate><label class="field"><span>Name</span><input name="name" placeholder="Enter your name" value="" required></label><p class="form-error" id="profileError" role="alert" hidden></p><button class="primary" type="submit">Save Profile</button><button class="text-button" type="button" data-action="skip-setup" style="display:block;margin:10px auto 0">Skip for now</button></form></div>`;
  }
  function renderAll() { renderHome(); renderTasks(); renderCalendar(); renderProfile(); renderForm(); renderDetails(); renderSetup(); }
  function go(name) { if (name === 'tasks') renderTasks(); if (name === 'calendar') renderCalendar(); if (name === 'home') renderHome(); if (name === 'profile') renderProfile(); activeScreen(name); }
  function openForm(id = null) { editId = id; renderForm(); activeScreen('form'); }
  function openDetails(id) { activeTask = id; renderDetails(); activeScreen('details'); }
  function taskBy(id) { return tasks.find(t => t.id === id); }
  function toggle(id) {
    const t = taskBy(id); if (!t) return;
    t.completed = !t.completed; if (t.completed) t.completedOn = dateKey(today); else delete t.completedOn;
    persist(KEY.tasks, tasks); renderAll(); if (current === 'details') renderDetails(); showToast(t.completed ? 'Task completed' : 'Task marked incomplete');
  }
  function deleteDialog() {
    const layer = $('#modalLayer');
    layer.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="deleteTitle"><h2 id="deleteTitle">Delete this task?</h2><p>Are you sure you want to delete this task?</p><div class="modal-actions"><button type="button" data-action="cancel-delete">Cancel</button><button type="button" class="confirm-delete" data-action="confirm-delete">Delete</button></div></div>`;
    layer.hidden = false; $('[data-action="cancel-delete"]', layer).focus();
  }
  function editProfile() {
    $('#profileScreen').innerHTML = `<button class="back-link" data-action="profile-back">‹ &nbsp;Back</button><header class="page-head"><h1 id="profileTitle">Edit Profile</h1></header><form class="card form-card" id="profileForm" novalidate><label class="field"><span>Name</span><input name="name" maxlength="70" placeholder="Enter your name" required value="${safe(profile?.name || 'Student Planner')}"></label><p class="form-error" id="profileError" role="alert" hidden></p><button class="primary" type="submit">Save Profile</button></form>`;
  }
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]'); if (nav) { go(nav.dataset.nav); return; }
    const check = e.target.closest('[data-toggle-task]'); if (check) { e.stopPropagation(); toggle(check.dataset.toggleTask); return; }
    const pri = e.target.closest('[data-priority]'); if (pri) { priority = pri.dataset.priority; $$('[data-priority]').forEach(b => b.setAttribute('aria-pressed', String(b === pri))); return; }
    const day = e.target.closest('[data-date]'); if (day) { selectedDate = day.dataset.date; renderCalendar(); return; }
    const mon = e.target.closest('[data-month]'); if (mon) { monthView.setMonth(monthView.getMonth() + Number(mon.dataset.month)); renderCalendar(); return; }
    const filt = e.target.closest('[data-filter]'); if (filt) { filter = filt.dataset.filter; renderTasks(); return; }
    const setting = e.target.closest('[data-setting]');
    if (setting) { const k = setting.dataset.setting; settings[k] = !settings[k]; persist(KEY.settings, settings); document.documentElement.classList.toggle('dark', settings.darkMode); renderProfile(); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action) {
      if (action === 'all-tasks') go('tasks');
      if (action === 'add-task') openForm();
      if (action === 'back') { if (editId) { editId = null; go('details'); } else go('tasks'); }
      if (action === 'profile-back') go('profile');
      if (action === 'complete-detail') toggle(activeTask);
      if (action === 'edit-task') openForm(activeTask);
      if (action === 'delete-task') deleteDialog();
      if (action === 'cancel-delete') $('#modalLayer').hidden = true;
      if (action === 'confirm-delete') { tasks = tasks.filter(t => t.id !== activeTask); persist(KEY.tasks, tasks); $('#modalLayer').hidden = true; go('tasks'); showToast('Task deleted'); }
      if (action === 'edit-profile') editProfile();
      if (action === 'skip-setup') { profile = { name: 'Student Planner' }; persist(KEY.profile, profile); renderProfile(); go('home'); }
      if (action === 'about') showToast('StudyFlow · Your personal offline planner · Version 1.0.0');
      return;
    }
    const card = e.target.closest('[data-open-task]'); if (card) openDetails(card.dataset.openTask);
  });
  document.addEventListener('keydown', e => {
    const card = e.target.closest('[data-open-task]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetails(card.dataset.openTask); }
    if (e.key === 'Escape' && !$('#modalLayer').hidden) $('#modalLayer').hidden = true;
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'taskForm') {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()), err = $('#formError');
      if (!data.title.trim() || !data.date || !data.time || !data.subject.trim() || !priority) { err.textContent = 'Please fill in the title, date, time, subject, and priority.'; err.hidden = false; return; }
      if (Number.isNaN(localDate(data.date).getTime())) { err.textContent = 'Please choose a valid date.'; err.hidden = false; return; }
      if (editId) { const t = taskBy(editId); if (!t) return; Object.assign(t, { title: data.title.trim(), date: data.date, time: data.time, subject: data.subject.trim(), priority, notes: data.notes.trim() }); }
      else tasks.push({ id: crypto.randomUUID(), title: data.title.trim(), date: data.date, time: data.time, subject: data.subject.trim(), priority, notes: data.notes.trim(), completed: false });
      persist(KEY.tasks, tasks); editId = null; filter = 'All'; renderAll(); go('tasks'); showToast('Task saved');
    }
    if (e.target.id === 'profileForm') {
      e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries()), err = $('#profileError');
      if (!data.name.trim()) { err.textContent = 'Please enter your name, or skip for now.'; err.hidden = false; return; }
      profile = { name: data.name.trim() }; persist(KEY.profile, profile); renderProfile(); go('profile'); showToast('Profile saved');
    }
  });

  renderAll();
  if (!profile) { renderSetup(); activeScreen('setup'); } else go('home');
})();

