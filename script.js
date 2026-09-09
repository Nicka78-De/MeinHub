// ---------- Konstanten ----------
  const DEV_USERNAME = "niclas";
  const DEV_PASSWORD = "JissoDaGoat09!_";
  const DEV_ID = "000001";
  const STORAGE_PREFIX = "meinhub_";

  let currentUser = null; // {username, id, role, tabs}
  let todos = [];
  let kpopEntries = [];
  let calendars = {};       // { username: [events] }
  let invites = [];         // [{id, fromUsername, fromId, toUsername, toId, status}]
  let allUsers = [];        // users-db cache

  // ---------- Storage Helfer (lokaler Browser-Speicher) ----------
  async function storageGet(key, fallback){
    try{
      const raw = localStorage.getItem(STORAGE_PREFIX + key);
      return raw !== null ? JSON.parse(raw) : fallback;
    }catch(e){ console.error("storageGet fehlgeschlagen:", key, e); return fallback; }
  }
  async function storageSet(key, value){
    try{ localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value)); return true; }
    catch(e){ console.error("storageSet fehlgeschlagen:", key, e); return false; }
  }
  async function storageDelete(key){
    try{ localStorage.removeItem(STORAGE_PREFIX + key); }catch(e){}
  }

  // ---------- Init / Session ----------
  window.addEventListener('load', init);

  async function init(){
    const session = await storageGet('session', null);
    if(session){
      if(session.type === 'dev'){
        currentUser = {username: "Niclas", id: DEV_ID, role: "dev"};
        await enterApp();
        document.getElementById('loading-screen').style.display = 'none';
        return;
      }
      if(session.type === 'user'){
        const users = await storageGet('users-db', []);
        const u = users.find(x => x.username.toLowerCase() === session.username.toLowerCase());
        if(u){
          currentUser = {username: u.username, id: u.id, role: "user", tabs: u.tabs};
          await enterApp();
          document.getElementById('loading-screen').style.display = 'none';
          return;
        }
      }
    }
    document.getElementById('loading-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
  }

  function generateUserId(existingUsers){
    let id;
    const taken = new Set(existingUsers.map(u => u.id).concat([DEV_ID]));
    do{ id = String(Math.floor(100000 + Math.random() * 900000)); }while(taken.has(id));
    return id;
  }

  // ---------- Auth UI ----------
  function showRegister(){ document.getElementById('login-form').style.display = 'none'; document.getElementById('register-form').style.display = 'block'; }
  function showLogin(){ document.getElementById('register-form').style.display = 'none'; document.getElementById('login-form').style.display = 'block'; }
  function showAuthError(id, msg){ const el = document.getElementById(id); el.textContent = msg; el.style.display = 'block'; }
  function hideAuthErrors(){ document.getElementById('login-error').style.display = 'none'; document.getElementById('register-error').style.display = 'none'; }

  async function handleLogin(){
    hideAuthErrors();
    const username = document.getElementById('login-username').value.trim();
    const pass = document.getElementById('login-pass').value;
    if(!username || !pass){ showAuthError('login-error', 'Bitte Benutzername und Passwort eingeben.'); return; }

    if(username.toLowerCase() === DEV_USERNAME && pass === DEV_PASSWORD){
      currentUser = {username: "Niclas", id: DEV_ID, role: "dev"};
      await storageSet('session', {type: 'dev'});
      await enterApp();
      return;
    }
    const users = await storageGet('users-db', []);
    const match = users.find(u => u.username.toLowerCase() === username.toLowerCase() && u.password === pass);
    if(!match){ showAuthError('login-error', 'Benutzername oder Passwort ist falsch.'); return; }
    currentUser = {username: match.username, id: match.id, role: "user", tabs: match.tabs};
    await storageSet('session', {type: 'user', username: match.username});
    await enterApp();
  }

  async function handleRegister(){
    hideAuthErrors();
    const username = document.getElementById('reg-username').value.trim();
    const pass = document.getElementById('reg-pass').value;
    if(!username || !pass){ showAuthError('register-error', 'Bitte Benutzername und Passwort eingeben.'); return; }
    if(username.toLowerCase() === DEV_USERNAME){ showAuthError('register-error', 'Dieser Benutzername ist reserviert.'); return; }

    const users = await storageGet('users-db', []);
    if(users.some(u => u.username.toLowerCase() === username.toLowerCase())){
      showAuthError('register-error', 'Dieser Benutzername ist bereits vergeben.');
      return;
    }
    const newUser = {username, password: pass, id: generateUserId(users), tabs: {todo: true, kpop: true, calendar: true}};
    users.push(newUser);
    await storageSet('users-db', users);

    currentUser = {username: newUser.username, id: newUser.id, role: "user", tabs: newUser.tabs};
    await storageSet('session', {type: 'user', username: newUser.username});
    await enterApp();
  }

  async function handleLogout(){
    await storageDelete('session');
    currentUser = null;
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('login-username').value = '';
    document.getElementById('login-pass').value = '';
    hideAuthErrors();
    showLogin();
  }

  // ---------- App ----------
  async function enterApp(){
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-screen').style.display = 'block';

    weekOffset = 0;
    calendarViewOwner = null;

    const isDev = currentUser.role === 'dev';
    document.getElementById('rail-username').textContent = currentUser.username;
    document.getElementById('rail-userid').textContent = 'ID: ' + currentUser.id;
    document.getElementById('dev-pill').style.display = isDev ? 'block' : 'none';
    document.getElementById('nav-users').style.display = isDev ? 'flex' : 'none';

    document.querySelector('[data-tab="todo"]').style.display = (isDev || currentUser.tabs.todo) ? 'flex' : 'none';
    document.querySelector('[data-tab="kpop"]').style.display = (isDev || currentUser.tabs.kpop) ? 'flex' : 'none';
    document.querySelector('[data-tab="kalender"]').style.display = (isDev || currentUser.tabs.calendar) ? 'flex' : 'none';

    document.getElementById('todo-form-card').style.display = isDev ? 'block' : 'none';
    document.getElementById('todo-readonly-note').style.display = isDev ? 'none' : 'block';
    document.getElementById('kpop-form-card').style.display = isDev ? 'block' : 'none';
    document.getElementById('kpop-readonly-note').style.display = isDev ? 'none' : 'block';

    todos = await storageGet('todos', []);
    kpopEntries = await storageGet('kpop-list', []);
    calendars = await storageGet('calendars', {});
    invites = await storageGet('calendar-invites', []);
    allUsers = await storageGet('users-db', []);

    renderTodos();
    renderKpop();
    renderCalendarArea();
    if(isDev) renderUsersTab();
    renderHomeStats();
    switchTab('home');
  }

  function switchTab(tab){
    document.querySelectorAll('.rail-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + tab).classList.add('active');
    if(tab === 'home') renderHomeStats();
  }

  // ---------- To-Do ----------
  const statusInfo = {
    offen:{label:"Offen", color:"var(--muted)"},
    progress:{label:"In Bearbeitung", color:"var(--warning)"},
    done:{label:"Erledigt", color:"var(--success)"}
  };
  async function addTodo(){
    const title = document.getElementById('todo-title').value.trim();
    const desc = document.getElementById('todo-desc').value.trim();
    const prio = parseInt(document.getElementById('todo-prio').value, 10);
    const status = document.getElementById('todo-status').value;
    if(!title) return;
    todos.push({id: Date.now().toString(36), title, description: desc, priority: prio, status});
    await storageSet('todos', todos);
    document.getElementById('todo-title').value = '';
    document.getElementById('todo-desc').value = '';
    document.getElementById('todo-prio').value = '3';
    document.getElementById('todo-status').value = 'offen';
    renderTodos(); renderHomeStats();
  }
  async function updateTodoStatus(id, newStatus){
    const t = todos.find(x => x.id === id);
    if(!t) return;
    t.status = newStatus;
    await storageSet('todos', todos);
    renderTodos(); renderHomeStats();
  }
  async function deleteTodo(id){
    todos = todos.filter(x => x.id !== id);
    await storageSet('todos', todos);
    renderTodos(); renderHomeStats();
  }
  function renderTodos(){
    const isDev = currentUser.role === 'dev';
    const list = document.getElementById('todo-list');
    if(todos.length === 0){ list.innerHTML = '<div class="empty-state">Noch keine Aufgaben vorhanden.</div>'; return; }
    const sorted = [...todos].sort((a,b) => a.priority - b.priority);
    list.innerHTML = sorted.map(t => {
      const st = statusInfo[t.status] || statusInfo.offen;
      const statusControl = isDev
        ? `<select class="status-select" onchange="updateTodoStatus('${t.id}', this.value)">
             <option value="offen" ${t.status==='offen'?'selected':''}>Offen</option>
             <option value="progress" ${t.status==='progress'?'selected':''}>In Bearbeitung</option>
             <option value="done" ${t.status==='done'?'selected':''}>Erledigt</option>
           </select>`
        : `<span class="status-pill"><span class="status-dot" style="background:${st.color}"></span>${st.label}</span>`;
      return `
        <div class="todo-item p${t.priority}">
          <div class="prio-num">${t.priority}</div>
          <div class="todo-body">
            <div class="todo-title">${escapeHtml(t.title)}</div>
            ${t.description ? `<div class="todo-desc">${escapeHtml(t.description)}</div>` : ''}
            <div class="todo-meta">${statusControl}</div>
          </div>
          ${isDev ? `<button class="del-btn" onclick="deleteTodo('${t.id}')" title="Löschen">✕</button>` : ''}
        </div>`;
    }).join('');
  }

  // ---------- K-Pop ----------
  async function addKpop(){
    const friend = document.getElementById('kpop-friend').value.trim();
    const idol = document.getElementById('kpop-idol').value.trim();
    const group = document.getElementById('kpop-group').value.trim();
    const note = document.getElementById('kpop-note').value.trim();
    if(!friend || !idol) return;
    kpopEntries.push({id: Date.now().toString(36), friend, idol, group, note});
    await storageSet('kpop-list', kpopEntries);
    document.getElementById('kpop-friend').value = '';
    document.getElementById('kpop-idol').value = '';
    document.getElementById('kpop-group').value = '';
    document.getElementById('kpop-note').value = '';
    renderKpop(); renderHomeStats();
  }
  async function deleteKpop(id){
    kpopEntries = kpopEntries.filter(x => x.id !== id);
    await storageSet('kpop-list', kpopEntries);
    renderKpop(); renderHomeStats();
  }
  function renderKpop(){
    const isDev = currentUser.role === 'dev';
    const grid = document.getElementById('kpop-list');
    if(kpopEntries.length === 0){ grid.innerHTML = '<div class="empty-state">Noch keine Einträge vorhanden.</div>'; return; }
    grid.innerHTML = kpopEntries.map(k => `
      <div class="kpop-card">
        ${isDev ? `<button class="del-btn" style="position:absolute;top:8px;right:8px;" onclick="deleteKpop('${k.id}')" title="Löschen">✕</button>` : ''}
        <div class="kpop-friend">${escapeHtml(k.friend)}</div>
        <div class="kpop-idol">${escapeHtml(k.idol)}</div>
        ${k.group ? `<div class="kpop-group">${escapeHtml(k.group)}</div>` : ''}
        ${k.note ? `<div class="kpop-note">${escapeHtml(k.note)}</div>` : ''}
      </div>
    `).join('');
  }

  // ---------- Kalender ----------
  let weekOffset = 0;
  let calendarViewOwner = null; // null = eigener Kalender, sonst Username

  function myEvents(){ return calendars[currentUser.username] || []; }
  function eventsForOwner(owner){ return owner ? (calendars[owner] || []) : myEvents(); }

  function toISODate(d){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function getMonday(dateObj){
    const d = new Date(dateObj);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
  }
  function currentMonday(){
    const base = getMonday(new Date());
    base.setDate(base.getDate() + weekOffset*7);
    return base;
  }
  function parseTimeToMinutes(t){
    if(!t) return null;
    const parts = t.split(':').map(Number);
    return parts[0]*60 + (parts[1]||0);
  }
  function formatEventDate(dateStr){
    if(!dateStr) return '–';
    const [y,m,d] = dateStr.split('-');
    return `${d}.${m}.`;
  }

  const CAL_START_MIN = 6*60;
  const CAL_END_MIN = 23*60;
  const CAL_PX_PER_HOUR = 48;
  const CAL_HEIGHT = ((CAL_END_MIN - CAL_START_MIN)/60) * CAL_PX_PER_HOUR;

  function renderCalendarView(){
    const select = document.getElementById('cal-view-select');
    const sharedOwners = invites.filter(i => i.toUsername.toLowerCase() === currentUser.username.toLowerCase() && i.status === 'accepted');

    if(calendarViewOwner && !sharedOwners.some(i => i.fromUsername === calendarViewOwner)){
      calendarViewOwner = null;
    }
    select.innerHTML = '<option value="">Meine Termine</option>' +
      sharedOwners.map(i => `<option value="${escapeHtml(i.fromUsername)}">${escapeHtml(i.fromUsername)}s Kalender</option>`).join('');
    select.value = calendarViewOwner || '';

    const monday = currentMonday();
    const sunday = new Date(monday); sunday.setDate(sunday.getDate()+6);
    document.getElementById('week-range-label').textContent =
      monday.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'}) + ' – ' +
      sunday.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'});

    const events = eventsForOwner(calendarViewOwner);
    buildWeekGrid(monday, events, !!calendarViewOwner);
    buildAgendaList(monday, events, !!calendarViewOwner);

    document.getElementById('agenda-heading').textContent =
      calendarViewOwner ? `Termine von ${calendarViewOwner} (diese Woche)` : 'Meine Termine (diese Woche)';
    document.getElementById('add-event-section').style.display = calendarViewOwner ? 'none' : 'block';
  }

  function onViewChange(){
    calendarViewOwner = document.getElementById('cal-view-select').value || null;
    renderCalendarView();
  }
  function changeWeek(delta){ weekOffset += delta; renderCalendarView(); }
  function goToday(){ weekOffset = 0; renderCalendarView(); }

  function buildWeekGrid(monday, events, readonly){
    const dayNames = ['Mo','Di','Mi','Do','Fr','Sa','So'];
    const todayStr = toISODate(new Date());

    let hourLabels = '';
    for(let h = CAL_START_MIN/60; h < CAL_END_MIN/60; h++){
      hourLabels += `<div class="hour-label">${String(h).padStart(2,'0')}:00</div>`;
    }

    let daysHtml = '';
    for(let i = 0; i < 7; i++){
      const d = new Date(monday); d.setDate(d.getDate()+i);
      const dStr = toISODate(d);
      const isToday = dStr === todayStr;
      const dayEvents = events.filter(e => e.date === dStr);

      let eventsHtml = '';
      dayEvents.forEach(e => {
        let startMin = parseTimeToMinutes(e.start);
        let endMin = parseTimeToMinutes(e.end);
        if(startMin === null) startMin = CAL_START_MIN;
        if(endMin === null || endMin <= startMin) endMin = startMin + 30;
        startMin = Math.max(startMin, CAL_START_MIN);
        endMin = Math.min(endMin, CAL_END_MIN);
        if(endMin <= startMin) return;
        const top = (startMin - CAL_START_MIN) / 60 * CAL_PX_PER_HOUR;
        const height = Math.max((endMin - startMin) / 60 * CAL_PX_PER_HOUR, 18);
        eventsHtml += `<div class="week-event${readonly ? ' shared' : ''}" style="top:${top}px;height:${height}px;" title="${escapeHtml(e.title)} (${e.start||'–'}–${e.end||'–'})">
          <div class="we-title">${escapeHtml(e.title)}</div>
          <div class="we-time">${e.start||'–'}–${e.end||'–'}</div>
        </div>`;
      });

      daysHtml += `
        <div class="week-day-col">
          <div class="week-day-header${isToday ? ' today' : ''}"><div>${dayNames[i]}</div><div class="dnum">${d.getDate()}</div></div>
          <div class="week-day-body" style="height:${CAL_HEIGHT}px;">${eventsHtml}</div>
        </div>`;
    }

    document.getElementById('week-grid').innerHTML = `
      <div class="week-gutter"><div class="week-gutter-header"></div>${hourLabels}</div>
      ${daysHtml}
    `;
  }

  function buildAgendaList(monday, events, readonly){
    const sunday = new Date(monday); sunday.setDate(sunday.getDate()+6);
    const mondayStr = toISODate(monday), sundayStr = toISODate(sunday);
    const weekEvents = events.filter(e => e.date >= mondayStr && e.date <= sundayStr)
      .sort((a,b) => (a.date+a.start).localeCompare(b.date+b.start));

    const list = document.getElementById('agenda-list');
    if(weekEvents.length === 0){ list.innerHTML = '<div class="empty-state">Keine Termine in dieser Woche.</div>'; return; }
    list.innerHTML = weekEvents.map(e => `
      <div class="event-item">
        <div class="event-date-block">${formatEventDate(e.date)}</div>
        <div class="event-body">
          <div class="event-title">${escapeHtml(e.title)}</div>
          <div class="event-time">${e.start || '–'} – ${e.end || '–'} Uhr</div>
          ${e.description ? `<div class="event-desc">${escapeHtml(e.description)}</div>` : ''}
        </div>
        ${readonly ? '' : `<button class="del-btn" onclick="deleteEvent('${e.id}')" title="Löschen">✕</button>`}
      </div>
    `).join('');
  }

  async function addEvent(){
    const title = document.getElementById('event-title').value.trim();
    const date = document.getElementById('event-date').value;
    const start = document.getElementById('event-start').value;
    const end = document.getElementById('event-end').value;
    const desc = document.getElementById('event-desc').value.trim();
    if(!title || !date) return;
    if(!calendars[currentUser.username]) calendars[currentUser.username] = [];
    calendars[currentUser.username].push({id: Date.now().toString(36), title, date, start, end, description: desc});
    await storageSet('calendars', calendars);
    document.getElementById('event-title').value = '';
    document.getElementById('event-date').value = '';
    document.getElementById('event-desc').value = '';
    renderCalendarView(); renderHomeStats();
  }
  async function deleteEvent(id){
    calendars[currentUser.username] = (calendars[currentUser.username] || []).filter(e => e.id !== id);
    await storageSet('calendars', calendars);
    renderCalendarView(); renderHomeStats();
  }

  function findUserByUsernameAndId(username, id){
    if(username.toLowerCase() === DEV_USERNAME && id === DEV_ID) return {username:"Niclas", id: DEV_ID};
    return allUsers.find(u => u.username.toLowerCase() === username.toLowerCase() && u.id === id);
  }

  async function sendInvite(){
    const targetUsername = document.getElementById('invite-username').value.trim();
    const targetId = document.getElementById('invite-userid').value.trim();
    if(!targetUsername || !targetId) return;

    allUsers = await storageGet('users-db', []);
    const target = findUserByUsernameAndId(targetUsername, targetId);
    if(!target){ alert('Kein Nutzer mit diesem Benutzernamen und dieser Nutzer-ID gefunden.'); return; }
    if(target.username.toLowerCase() === currentUser.username.toLowerCase()){ alert('Du kannst dich nicht selbst einladen.'); return; }

    const already = invites.find(i => i.fromUsername.toLowerCase() === currentUser.username.toLowerCase()
      && i.toUsername.toLowerCase() === target.username.toLowerCase() && i.status === 'pending');
    if(already){ alert('Es gibt bereits eine offene Einladung an diese Person.'); return; }

    invites.push({id: Date.now().toString(36), fromUsername: currentUser.username, fromId: currentUser.id, toUsername: target.username, toId: target.id, status: 'pending'});
    await storageSet('calendar-invites', invites);

    document.getElementById('invite-username').value = '';
    document.getElementById('invite-userid').value = '';
    renderAccessList();
  }

  async function respondInvite(id, action){
    const inv = invites.find(i => i.id === id);
    if(!inv) return;
    inv.status = action;
    await storageSet('calendar-invites', invites);
    renderCalendarArea();
  }
  async function revokeAccess(id){
    invites = invites.filter(i => i.id !== id);
    await storageSet('calendar-invites', invites);
    renderCalendarArea();
  }

  function renderInbox(){
    const pending = invites.filter(i => i.toUsername.toLowerCase() === currentUser.username.toLowerCase() && i.status === 'pending');
    const section = document.getElementById('inbox-section');
    const list = document.getElementById('inbox-list');
    if(pending.length === 0){ section.style.display = 'none'; }
    else{
      section.style.display = 'block';
      list.innerHTML = pending.map(i => `
        <div class="invite-card">
          <div class="invite-text"><b>${escapeHtml(i.fromUsername)}</b> (ID: ${escapeHtml(i.fromId)}) möchte dir seinen/ihren Kalender zeigen.</div>
          <div class="invite-actions">
            <button class="btn-accept" onclick="respondInvite('${i.id}','accepted')">Annehmen</button>
            <button class="btn-reject" onclick="respondInvite('${i.id}','rejected')">Ablehnen</button>
          </div>
        </div>
      `).join('');
    }
    const badge = document.getElementById('inbox-badge');
    if(pending.length > 0){ badge.style.display = 'inline-flex'; badge.textContent = pending.length; }
    else{ badge.style.display = 'none'; }
  }

  function renderAccessList(){
    const granted = invites.filter(i => i.fromUsername.toLowerCase() === currentUser.username.toLowerCase() && i.status === 'accepted');
    const container = document.getElementById('access-list');
    if(granted.length === 0){ container.innerHTML = ''; return; }
    container.innerHTML = `<div class="section-sub" style="margin-top:16px;">Diese Personen können deinen Kalender sehen:</div>` +
      granted.map(i => `
        <div class="access-row">
          <span>${escapeHtml(i.toUsername)} (ID: ${escapeHtml(i.toId)})</span>
          <button class="mini-btn" onclick="revokeAccess('${i.id}')">Zugriff entziehen</button>
        </div>
      `).join('');
  }

  function renderCalendarArea(){
    renderInbox();
    renderAccessList();
    renderCalendarView();
  }

  // ---------- Nutzerverwaltung (Dev) ----------
  async function toggleUserTab(username, key, value){
    allUsers = await storageGet('users-db', []);
    const u = allUsers.find(x => x.username === username);
    if(!u) return;
    u.tabs[key] = value;
    await storageSet('users-db', allUsers);
  }
  function renderUsersTab(){
    const container = document.getElementById('users-list');
    if(allUsers.length === 0){ container.innerHTML = '<div class="empty-state">Noch keine registrierten Nutzer.</div>'; return; }
    container.innerHTML = allUsers.map(u => `
      <div class="user-row">
        <div><div class="user-row-name">${escapeHtml(u.username)}</div><div class="user-row-id">ID: ${escapeHtml(u.id)}</div></div>
        <label class="checkbox-label"><input type="checkbox" ${u.tabs.todo ? 'checked' : ''} onchange="toggleUserTab('${u.username}','todo',this.checked)"> To-Do</label>
        <label class="checkbox-label"><input type="checkbox" ${u.tabs.kpop ? 'checked' : ''} onchange="toggleUserTab('${u.username}','kpop',this.checked)"> K-Pop</label>
        <label class="checkbox-label"><input type="checkbox" ${u.tabs.calendar ? 'checked' : ''} onchange="toggleUserTab('${u.username}','calendar',this.checked)"> Kalender</label>
      </div>
    `).join('');
  }

  // ---------- Home ----------
  function renderHomeStats(){
    document.getElementById('stat-open').textContent = todos.filter(t => t.status === 'offen').length;
    document.getElementById('stat-progress').textContent = todos.filter(t => t.status === 'progress').length;
    document.getElementById('stat-done').textContent = todos.filter(t => t.status === 'done').length;
    document.getElementById('stat-kpop').textContent = kpopEntries.length;
    const today = toISODate(new Date());
    document.getElementById('stat-events').textContent = myEvents().filter(e => e.date >= today).length;
  }

  // ---------- Utils ----------
  function escapeHtml(str){
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
