
const SUPABASE_URL = "https://wvmevuamhnclhzfyztlq.supabase.co/rest/v1/";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_q_nQj2oVrHOUSrunbaLDGg_2hrYBqEf";

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

let currentUser = null;
let profile = null;
let todos = [];
let kpopEntries = [];
let calendars = {};
let invites = [];
let allUsers = [];
let weekOffset = 0;
let calendarViewOwner = null;

window.addEventListener("load", init);

async function init() {
  if (SUPABASE_URL.startsWith("DEINE_") || SUPABASE_PUBLISHABLE_KEY.startsWith("DEIN_")) {
    showSetupMessage();
    return;
  }

  const { data: { session } } = await db.auth.getSession();
  if (session?.user) {
    const ok = await loadProfile(session.user);
    if (ok) await enterApp();
    else await db.auth.signOut({ scope: "local" });
  } else {
    showAuth();
  }

  db.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user && !currentUser) {
      setTimeout(async () => {
        const ok = await loadProfile(session.user);
        if (ok) await enterApp();
      }, 0);
    }
  });
}

function showSetupMessage() {
  document.getElementById("loading-screen").innerHTML =
    '<div style="max-width:620px;text-align:center;padding:24px">' +
    '<h2 style="margin-bottom:10px">Supabase noch nicht eingerichtet</h2>' +
    '<p style="color:var(--muted);line-height:1.6">Öffne <b>script.js</b> und trage oben deine Supabase Project URL und deinen Publishable Key ein. Die Anleitung steht in der README.md.</p>' +
    '</div>';
}

function showAuth() {
  document.getElementById("loading-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
}

async function loadProfile(authUser) {
  const { data, error } = await db
    .from("profiles")
    .select("id,user_id,username,role,tabs")
    .eq("user_id", authUser.id)
    .single();

  if (error || !data) {
    console.error(error);
    showAuthError("login-error", "Profil konnte nicht geladen werden.");
    showAuth();
    return false;
  }

  currentUser = {
    id: data.id,
    user_id: data.user_id,
    username: data.username,
    role: data.role,
    tabs: data.tabs || {todo:true,kpop:true,calendar:true}
  };
  profile = data;
  return true;
}

function showRegister() {
  hideAuthErrors();
  document.getElementById("login-form").style.display = "none";
  document.getElementById("register-form").style.display = "block";
}
function showLogin() {
  hideAuthErrors();
  document.getElementById("register-form").style.display = "none";
  document.getElementById("login-form").style.display = "block";
}
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = "block";
}
function hideAuthErrors() {
  document.getElementById("login-error").style.display = "none";
  document.getElementById("register-error").style.display = "none";
}

async function handleLogin() {
  hideAuthErrors();
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  if (!email || !pass) {
    showAuthError("login-error", "Bitte E-Mail und Passwort eingeben.");
    return;
  }

  const { error } = await db.auth.signInWithPassword({ email, password: pass });
  if (error) {
    showAuthError("login-error", translateAuthError(error));
  }
}

async function handleRegister() {
  hideAuthErrors();
  const username = document.getElementById("reg-username").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const pass = document.getElementById("reg-pass").value;

  if (!username || !email || !pass) {
    showAuthError("register-error", "Bitte alle Felder ausfüllen.");
    return;
  }
  if (!/^[a-zA-Z0-9_äöüÄÖÜß.-]{3,30}$/.test(username)) {
    showAuthError("register-error", "Der Benutzername muss 3–30 Zeichen lang sein.");
    return;
  }
  if (pass.length < 8) {
    showAuthError("register-error", "Das Passwort muss mindestens 8 Zeichen haben.");
    return;
  }

  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .ilike("username", username)
    .maybeSingle();

  if (existing) {
    showAuthError("register-error", "Dieser Benutzername ist bereits vergeben.");
    return;
  }

  const { data, error } = await db.auth.signUp({
    email,
    password: pass,
    options: {
      data: { username },
      emailRedirectTo: window.location.origin + window.location.pathname
    }
  });

  if (error) {
    showAuthError("register-error", translateAuthError(error));
    return;
  }

  if (data.session) {
    await loadProfile(data.user);
    await enterApp();
  } else {
    showAuthError("register-error", "Konto erstellt! Prüfe deine E-Mails und bestätige dein Konto, bevor du dich anmeldest.");
  }
}

async function handleLogout() {
  await db.auth.signOut({ scope: "local" });
  currentUser = null;
  profile = null;
  document.getElementById("app-screen").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
  document.getElementById("login-email").value = "";
  document.getElementById("login-pass").value = "";
  hideAuthErrors();
  showLogin();
}

function translateAuthError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "E-Mail oder Passwort ist falsch.";
  if (m.includes("email not confirmed")) return "Bitte bestätige zuerst deine E-Mail-Adresse.";
  if (m.includes("user already registered")) return "Für diese E-Mail existiert bereits ein Konto.";
  if (m.includes("password should be at least")) return "Das Passwort ist zu kurz.";
  if (m.includes("rate limit")) return "Zu viele Versuche. Bitte kurz warten.";
  return error?.message || "Es ist ein Fehler aufgetreten.";
}

async function enterApp() {
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-screen").style.display = "block";
  document.getElementById("loading-screen").style.display = "none";

  weekOffset = 0;
  calendarViewOwner = null;

  const isDev = currentUser.role === "dev";
  document.getElementById("rail-username").textContent = currentUser.username;
  document.getElementById("rail-userid").textContent = "ID: " + currentUser.id;
  document.getElementById("dev-pill").style.display = isDev ? "block" : "none";
  document.getElementById("nav-users").style.display = isDev ? "flex" : "none";

  document.querySelector('[data-tab="todo"]').style.display = (isDev || currentUser.tabs.todo) ? "flex" : "none";
  document.querySelector('[data-tab="kpop"]').style.display = (isDev || currentUser.tabs.kpop) ? "flex" : "none";
  document.querySelector('[data-tab="kalender"]').style.display = (isDev || currentUser.tabs.calendar) ? "flex" : "none";

  document.getElementById("todo-form-card").style.display = isDev ? "block" : "none";
  document.getElementById("todo-readonly-note").style.display = isDev ? "none" : "block";
  document.getElementById("kpop-form-card").style.display = isDev ? "block" : "none";
  document.getElementById("kpop-readonly-note").style.display = isDev ? "none" : "block";

  await loadAllData();
  switchTab("home");
}

async function loadAllData() {
  const [todoRes, kpopRes, eventRes, inviteRes] = await Promise.all([
    db.from("todos").select("*").order("created_at", {ascending:true}),
    db.from("kpop_entries").select("*").order("created_at", {ascending:true}),
    db.from("calendar_events").select("*,owner_profile:profiles!calendar_events_owner_user_id_fkey(username)").order("date", {ascending:true}).order("start_time", {ascending:true}),
    db.from("calendar_invites").select("id,status,from_user_id,to_user_id,created_at,from_profile:profiles!calendar_invites_from_user_id_fkey(id,username),to_profile:profiles!calendar_invites_to_user_id_fkey(id,username)")
  ]);

  if (todoRes.error) console.error(todoRes.error);
  if (kpopRes.error) console.error(kpopRes.error);
  if (eventRes.error) console.error(eventRes.error);
  if (inviteRes.error) console.error(inviteRes.error);

  todos = (todoRes.data || []).map(t => ({
    id:t.id, title:t.title, description:t.description || "", priority:t.priority, status:t.status
  }));

  kpopEntries = (kpopRes.data || []).map(k => ({
    id:k.id, friend:k.friend, idol:k.idol, group:k.group_name || "", note:k.note || ""
  }));

  calendars = {};
  (eventRes.data || []).forEach(e => {
    const owner = e.owner_profile?.username || (e.owner_user_id === currentUser.user_id ? currentUser.username : null);
    if (!owner) return;
    if (!calendars[owner]) calendars[owner] = [];
    calendars[owner].push({
      id:e.id, title:e.title, date:e.date, start:e.start_time || "", end:e.end_time || "", description:e.description || "",
      ownerUserId:e.owner_user_id
    });
  });

  invites = (inviteRes.data || []).map(i => ({
    id:i.id,
    fromUsername:i.from_profile?.username || "",
    fromId:i.from_profile?.id || "",
    fromUserId:i.from_user_id,
    toUsername:i.to_profile?.username || "",
    toId:i.to_profile?.id || "",
    toUserId:i.to_user_id,
    status:i.status
  }));

  if (currentUser.role === "dev") {
    const usersRes = await db.from("profiles").select("id,user_id,username,role,tabs").order("username");
    if (usersRes.error) console.error(usersRes.error);
    allUsers = usersRes.data || [];
    renderUsersTab();
  } else {
    allUsers = [];
  }

  renderTodos();
  renderKpop();
  renderCalendarArea();
  renderHomeStats();
}

function switchTab(tab) {
  const button = document.querySelector(`[data-tab="${tab}"]`);
  if (!button || button.style.display === "none") tab = "home";
  document.querySelectorAll(".rail-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
  document.getElementById("panel-" + tab).classList.add("active");
  if (tab === "home") renderHomeStats();
}

// ---------- To-Do ----------
const statusInfo = {
  offen:{label:"Offen", color:"var(--muted)"},
  progress:{label:"In Bearbeitung", color:"var(--warning)"},
  done:{label:"Erledigt", color:"var(--success)"}
};

async function addTodo() {
  const title = document.getElementById("todo-title").value.trim();
  const desc = document.getElementById("todo-desc").value.trim();
  const prio = parseInt(document.getElementById("todo-prio").value, 10);
  const status = document.getElementById("todo-status").value;
  if (!title) return;

  const { data, error } = await db.from("todos").insert({
    title, description:desc, priority:prio, status
  }).select().single();

  if (error) { alert(error.message); return; }
  todos.push({id:data.id,title:data.title,description:data.description||"",priority:data.priority,status:data.status});
  document.getElementById("todo-title").value = "";
  document.getElementById("todo-desc").value = "";
  document.getElementById("todo-prio").value = "3";
  document.getElementById("todo-status").value = "offen";
  renderTodos(); renderHomeStats();
}

async function updateTodoStatus(id, newStatus) {
  const { error } = await db.from("todos").update({status:newStatus}).eq("id", id);
  if (error) { alert(error.message); return; }
  const t = todos.find(x => x.id === id);
  if (t) t.status = newStatus;
  renderTodos(); renderHomeStats();
}

async function deleteTodo(id) {
  const { error } = await db.from("todos").delete().eq("id", id);
  if (error) { alert(error.message); return; }
  todos = todos.filter(x => x.id !== id);
  renderTodos(); renderHomeStats();
}

function renderTodos() {
  const isDev = currentUser.role === "dev";
  const list = document.getElementById("todo-list");
  if (todos.length === 0) {
    list.innerHTML = '<div class="empty-state">Noch keine Aufgaben vorhanden.</div>';
    return;
  }
  const sorted = [...todos].sort((a,b) => a.priority - b.priority);
  list.innerHTML = sorted.map(t => {
    const st = statusInfo[t.status] || statusInfo.offen;
    const statusControl = isDev
      ? `<select class="status-select" onchange="updateTodoStatus('${t.id}', this.value)">
           <option value="offen" ${t.status==="offen"?"selected":""}>Offen</option>
           <option value="progress" ${t.status==="progress"?"selected":""}>In Bearbeitung</option>
           <option value="done" ${t.status==="done"?"selected":""}>Erledigt</option>
         </select>`
      : `<span class="status-pill"><span class="status-dot" style="background:${st.color}"></span>${st.label}</span>`;
    return `<div class="todo-item p${t.priority}">
      <div class="prio-num">${t.priority}</div>
      <div class="todo-body">
        <div class="todo-title">${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="todo-desc">${escapeHtml(t.description)}</div>` : ""}
        <div class="todo-meta">${statusControl}</div>
      </div>
      ${isDev ? `<button class="del-btn" onclick="deleteTodo('${t.id}')" title="Löschen">✕</button>` : ""}
    </div>`;
  }).join("");
}

// ---------- K-Pop ----------
async function addKpop() {
  const friend = document.getElementById("kpop-friend").value.trim();
  const idol = document.getElementById("kpop-idol").value.trim();
  const group = document.getElementById("kpop-group").value.trim();
  const note = document.getElementById("kpop-note").value.trim();
  if (!friend || !idol) return;

  const { data, error } = await db.from("kpop_entries").insert({
    friend, idol, group_name:group, note
  }).select().single();

  if (error) { alert(error.message); return; }
  kpopEntries.push({id:data.id,friend:data.friend,idol:data.idol,group:data.group_name||"",note:data.note||""});
  document.getElementById("kpop-friend").value = "";
  document.getElementById("kpop-idol").value = "";
  document.getElementById("kpop-group").value = "";
  document.getElementById("kpop-note").value = "";
  renderKpop(); renderHomeStats();
}

async function deleteKpop(id) {
  const { error } = await db.from("kpop_entries").delete().eq("id", id);
  if (error) { alert(error.message); return; }
  kpopEntries = kpopEntries.filter(x => x.id !== id);
  renderKpop(); renderHomeStats();
}

function renderKpop() {
  const isDev = currentUser.role === "dev";
  const grid = document.getElementById("kpop-list");
  if (kpopEntries.length === 0) {
    grid.innerHTML = '<div class="empty-state">Noch keine Einträge vorhanden.</div>';
    return;
  }
  grid.innerHTML = kpopEntries.map(k => `<div class="kpop-card">
    ${isDev ? `<button class="del-btn" style="position:absolute;top:8px;right:8px;" onclick="deleteKpop('${k.id}')" title="Löschen">✕</button>` : ""}
    <div class="kpop-friend">${escapeHtml(k.friend)}</div>
    <div class="kpop-idol">${escapeHtml(k.idol)}</div>
    ${k.group ? `<div class="kpop-group">${escapeHtml(k.group)}</div>` : ""}
    ${k.note ? `<div class="kpop-note">${escapeHtml(k.note)}</div>` : ""}
  </div>`).join("");
}

// ---------- Calendar ----------
function myEvents() {
  return calendars[currentUser.username] || [];
}
function eventsForOwner(owner) {
  return owner ? (calendars[owner] || []) : myEvents();
}
function toISODate(d) {
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
  return `${y}-${m}-${day}`;
}
function getMonday(dateObj) {
  const d = new Date(dateObj);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1-day;
  d.setDate(d.getDate()+diff);
  d.setHours(0,0,0,0);
  return d;
}
function currentMonday() {
  const base = getMonday(new Date());
  base.setDate(base.getDate()+weekOffset*7);
  return base;
}
function parseTimeToMinutes(t) {
  if (!t) return null;
  const parts=t.split(":").map(Number);
  return parts[0]*60+(parts[1]||0);
}
function formatEventDate(dateStr) {
  if (!dateStr) return "–";
  const [y,m,d]=dateStr.split("-");
  return `${d}.${m}.`;
}
const CAL_START_MIN=6*60, CAL_END_MIN=23*60, CAL_PX_PER_HOUR=48;
const CAL_HEIGHT=((CAL_END_MIN-CAL_START_MIN)/60)*CAL_PX_PER_HOUR;

function renderCalendarView() {
  const select=document.getElementById("cal-view-select");
  const sharedOwners=invites.filter(i =>
    i.toUserId===currentUser.user_id && i.status==="accepted"
  );

  if (calendarViewOwner && !sharedOwners.some(i=>i.fromUsername===calendarViewOwner)) calendarViewOwner=null;
  select.innerHTML='<option value="">Meine Termine</option>'+
    sharedOwners.map(i=>`<option value="${escapeHtml(i.fromUsername)}">${escapeHtml(i.fromUsername)}s Kalender</option>`).join("");
  select.value=calendarViewOwner||"";

  const monday=currentMonday(), sunday=new Date(monday);
  sunday.setDate(sunday.getDate()+6);
  document.getElementById("week-range-label").textContent=
    monday.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit"})+" – "+
    sunday.toLocaleDateString("de-DE",{day:"2-digit",month:"2-digit",year:"numeric"});

  const events=eventsForOwner(calendarViewOwner);
  buildWeekGrid(monday,events,!!calendarViewOwner);
  buildAgendaList(monday,events,!!calendarViewOwner);
  document.getElementById("agenda-heading").textContent=
    calendarViewOwner ? `Termine von ${calendarViewOwner} (diese Woche)` : "Meine Termine (diese Woche)";
  document.getElementById("add-event-section").style.display=calendarViewOwner?"none":"block";
}
function onViewChange(){ calendarViewOwner=document.getElementById("cal-view-select").value||null; renderCalendarView(); }
function changeWeek(delta){ weekOffset+=delta; renderCalendarView(); }
function goToday(){ weekOffset=0; renderCalendarView(); }

function buildWeekGrid(monday,events,readonly) {
  const dayNames=["Mo","Di","Mi","Do","Fr","Sa","So"], todayStr=toISODate(new Date());
  let hourLabels="";
  for(let h=CAL_START_MIN/60;h<CAL_END_MIN/60;h++) hourLabels+=`<div class="hour-label">${String(h).padStart(2,"0")}:00</div>`;

  let daysHtml="";
  for(let i=0;i<7;i++){
    const d=new Date(monday); d.setDate(d.getDate()+i);
    const dStr=toISODate(d), isToday=dStr===todayStr;
    const dayEvents=events.filter(e=>e.date===dStr);
    let eventsHtml="";
    dayEvents.forEach(e=>{
      let startMin=parseTimeToMinutes(e.start), endMin=parseTimeToMinutes(e.end);
      if(startMin===null) startMin=CAL_START_MIN;
      if(endMin===null||endMin<=startMin) endMin=startMin+30;
      startMin=Math.max(startMin,CAL_START_MIN); endMin=Math.min(endMin,CAL_END_MIN);
      if(endMin<=startMin)return;
      const top=(startMin-CAL_START_MIN)/60*CAL_PX_PER_HOUR;
      const height=Math.max((endMin-startMin)/60*CAL_PX_PER_HOUR,18);
      eventsHtml+=`<div class="week-event${readonly?" shared":""}" style="top:${top}px;height:${height}px;" title="${escapeHtml(e.title)} (${e.start||"–"}–${e.end||"–"})"><div class="we-title">${escapeHtml(e.title)}</div><div class="we-time">${e.start||"–"}–${e.end||"–"}</div></div>`;
    });
    daysHtml+=`<div class="week-day-col"><div class="week-day-header${isToday?" today":""}"><div>${dayNames[i]}</div><div class="dnum">${d.getDate()}</div></div><div class="week-day-body" style="height:${CAL_HEIGHT}px;">${eventsHtml}</div></div>`;
  }
  document.getElementById("week-grid").innerHTML=`<div class="week-gutter"><div class="week-gutter-header"></div>${hourLabels}</div>${daysHtml}`;
}

function buildAgendaList(monday,events,readonly) {
  const sunday=new Date(monday); sunday.setDate(sunday.getDate()+6);
  const mondayStr=toISODate(monday), sundayStr=toISODate(sunday);
  const weekEvents=events.filter(e=>e.date>=mondayStr&&e.date<=sundayStr).sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const list=document.getElementById("agenda-list");
  if(weekEvents.length===0){list.innerHTML='<div class="empty-state">Keine Termine in dieser Woche.</div>';return;}
  list.innerHTML=weekEvents.map(e=>`<div class="event-item">
    <div class="event-date-block">${formatEventDate(e.date)}</div>
    <div class="event-body"><div class="event-title">${escapeHtml(e.title)}</div><div class="event-time">${e.start||"–"} – ${e.end||"–"} Uhr</div>${e.description?`<div class="event-desc">${escapeHtml(e.description)}</div>`:""}</div>
    ${readonly?"":`<button class="del-btn" onclick="deleteEvent('${e.id}')" title="Löschen">✕</button>`}
  </div>`).join("");
}

async function addEvent() {
  const title=document.getElementById("event-title").value.trim();
  const date=document.getElementById("event-date").value;
  const start=document.getElementById("event-start").value;
  const end=document.getElementById("event-end").value;
  const desc=document.getElementById("event-desc").value.trim();
  if(!title||!date)return;

  const {data,error}=await db.from("calendar_events").insert({
    owner_user_id:currentUser.user_id,title,date,start_time:start||null,end_time:end||null,description:desc
  }).select().single();

  if(error){alert(error.message);return;}
  if(!calendars[currentUser.username])calendars[currentUser.username]=[];
  calendars[currentUser.username].push({id:data.id,title:data.title,date:data.date,start:data.start_time||"",end:data.end_time||"",description:data.description||""});
  document.getElementById("event-title").value="";
  document.getElementById("event-date").value="";
  document.getElementById("event-desc").value="";
  renderCalendarView();renderHomeStats();
}

async function deleteEvent(id) {
  const {error}=await db.from("calendar_events").delete().eq("id",id);
  if(error){alert(error.message);return;}
  calendars[currentUser.username]=(calendars[currentUser.username]||[]).filter(e=>e.id!==id);
  renderCalendarView();renderHomeStats();
}

function findUserByUsernameAndId(username,id) {
  return allUsers.find(u=>u.username.toLowerCase()===username.toLowerCase() && u.id===id);
}

async function sendInvite() {
  const targetUsername=document.getElementById("invite-username").value.trim();
  const targetId=document.getElementById("invite-userid").value.trim();
  if(!targetUsername||!targetId)return;

  const {data:target,error:findError}=await db.from("profiles").select("id,user_id,username").ilike("username",targetUsername).eq("id",targetId).maybeSingle();
  if(findError||!target){alert("Kein Nutzer mit diesem Benutzernamen und dieser Nutzer-ID gefunden.");return;}
  if(target.user_id===currentUser.user_id){alert("Du kannst dich nicht selbst einladen.");return;}

  const {data:already}=await db.from("calendar_invites").select("id").eq("from_user_id",currentUser.user_id).eq("to_user_id",target.user_id).eq("status","pending").maybeSingle();
  if(already){alert("Es gibt bereits eine offene Einladung an diese Person.");return;}

  const {error}=await db.from("calendar_invites").insert({
    from_user_id:currentUser.user_id,to_user_id:target.user_id,status:"pending"
  });
  if(error){alert(error.message);return;}

  document.getElementById("invite-username").value="";
  document.getElementById("invite-userid").value="";
  await loadAllData();
}

async function respondInvite(id,action) {
  if(!["accepted","rejected"].includes(action))return;
  const {error}=await db.from("calendar_invites").update({status:action}).eq("id",id).eq("to_user_id",currentUser.user_id);
  if(error){alert(error.message);return;}
  await loadAllData();
}

async function revokeAccess(id) {
  const {error}=await db.from("calendar_invites").delete().eq("id",id).eq("from_user_id",currentUser.user_id);
  if(error){alert(error.message);return;}
  await loadAllData();
}

function renderInbox() {
  const pending=invites.filter(i=>i.toUserId===currentUser.user_id&&i.status==="pending");
  const section=document.getElementById("inbox-section"),list=document.getElementById("inbox-list");
  if(pending.length===0)section.style.display="none";
  else{
    section.style.display="block";
    list.innerHTML=pending.map(i=>`<div class="invite-card"><div class="invite-text"><b>${escapeHtml(i.fromUsername)}</b> (ID: ${escapeHtml(i.fromId)}) möchte dir seinen/ihren Kalender zeigen.</div><div class="invite-actions"><button class="btn-accept" onclick="respondInvite('${i.id}','accepted')">Annehmen</button><button class="btn-reject" onclick="respondInvite('${i.id}','rejected')">Ablehnen</button></div></div>`).join("");
  }
  const badge=document.getElementById("inbox-badge");
  if(pending.length>0){badge.style.display="inline-flex";badge.textContent=pending.length;}else badge.style.display="none";
}

function renderAccessList() {
  const granted=invites.filter(i=>i.fromUserId===currentUser.user_id&&i.status==="accepted");
  const container=document.getElementById("access-list");
  if(granted.length===0){container.innerHTML="";return;}
  container.innerHTML=`<div class="section-sub" style="margin-top:16px;">Diese Personen können deinen Kalender sehen:</div>`+
    granted.map(i=>`<div class="access-row"><span>${escapeHtml(i.toUsername)} (ID: ${escapeHtml(i.toId)})</span><button class="mini-btn" onclick="revokeAccess('${i.id}')">Zugriff entziehen</button></div>`).join("");
}
function renderCalendarArea(){renderInbox();renderAccessList();renderCalendarView();}

// ---------- Nutzerverwaltung ----------
async function toggleUserTab(userId,key,value) {
  if(currentUser.role!=="dev")return;
  const u=allUsers.find(x=>x.user_id===userId);
  if(!u)return;
  const newTabs={...(u.tabs||{todo:true,kpop:true,calendar:true}),[key]:value};
  const {error}=await db.from("profiles").update({tabs:newTabs}).eq("user_id",userId);
  if(error){alert(error.message);return;}
  u.tabs=newTabs;
}
function renderUsersTab() {
  const container=document.getElementById("users-list");
  if(allUsers.length===0){container.innerHTML='<div class="empty-state">Noch keine registrierten Nutzer.</div>';return;}
  container.innerHTML=allUsers.map(u=>`<div class="user-row">
    <div><div class="user-row-name">${escapeHtml(u.username)}</div><div class="user-row-id">ID: ${escapeHtml(u.id)}</div></div>
    <label class="checkbox-label"><input type="checkbox" ${u.tabs?.todo?"checked":""} onchange="toggleUserTab('${u.user_id}','todo',this.checked)"> To-Do</label>
    <label class="checkbox-label"><input type="checkbox" ${u.tabs?.kpop?"checked":""} onchange="toggleUserTab('${u.user_id}','kpop',this.checked)"> K-Pop</label>
    <label class="checkbox-label"><input type="checkbox" ${u.tabs?.calendar?"checked":""} onchange="toggleUserTab('${u.user_id}','calendar',this.checked)"> Kalender</label>
  </div>`).join("");
}

// ---------- Home ----------
function renderHomeStats() {
  document.getElementById("stat-open").textContent=todos.filter(t=>t.status==="offen").length;
  document.getElementById("stat-progress").textContent=todos.filter(t=>t.status==="progress").length;
  document.getElementById("stat-done").textContent=todos.filter(t=>t.status==="done").length;
  document.getElementById("stat-kpop").textContent=kpopEntries.length;
  const today=toISODate(new Date());
  document.getElementById("stat-events").textContent=myEvents().filter(e=>e.date>=today).length;
}

function escapeHtml(str) {
  const div=document.createElement("div");
  div.textContent=str ?? "";
  return div.innerHTML;
}
