(function () {
  "use strict";

  /* ================= Constantes ================= */
  const GARDE_REF = Date.UTC(2026, 9, 10); // samedi 10 octobre 2026 = 1er week-end de garde
  const LS_EVENTS = "planning-events-v1";
  const LS_TYPES = "planning-types-v1";
  const LS_KEY = "planning-gemini-key";
  const LS_MODEL = "planning-gemini-model";
  const LS_GARDE_REMIND = "planning-garde-remind";
  const LS_EXPORTED = "planning-exported-v1";
  const APP_VERSION = "3";
  const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];

  const DEFAULT_TYPES = [
    { id: "jour", label: "Jour", short: "J", color: "#e9a227", start: "07:00", end: "19:00", remind: 60 },
    { id: "nuit", label: "Nuit", short: "N", color: "#4b4fc4", start: "19:00", end: "07:00", remind: 120 },
    { id: "smur", label: "SMUR", short: "SMUR", color: "#d1435b", start: "", end: "", remind: 60 },
    { id: "repos", label: "Repos", short: "R", color: "#7d8aa3", start: "", end: "", remind: -1 },
    { id: "conge", label: "Congé", short: "CA", color: "#1f9c8f", start: "", end: "", remind: -1 },
    { id: "perso", label: "Perso", short: "•", color: "#c25bb5", start: "", end: "", remind: 60 },
    { id: "autre", label: "Autre", short: "•", color: "#6a6f93", start: "", end: "", remind: -1 }
  ];
  const SYS_TYPES = {
    garde: { id: "garde", label: "Garde en plus", short: "Fils", color: "var(--accent)", start: "", end: "", remind: -1 },
    garde_off: { id: "garde_off", label: "Pas de garde", short: "✕", color: "var(--c-autre)", start: "", end: "", remind: -1 }
  };
  const REMIND_OPTS = [
    [-1, "Aucun rappel"], [0, "À l'heure"], [15, "15 min avant"], [30, "30 min avant"], [60, "1 h avant"],
    [120, "2 h avant"], [180, "3 h avant"], [720, "12 h avant"], [1440, "La veille (24 h avant)"]
  ];

  /* ================= Outils ================= */
  const $ = (id) => document.getElementById(id);
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const fmtLong = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const fmtLongY = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const fmtMonth = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } };
  const lsJson = (k, d) => { try { const v = JSON.parse(lsGet(k, "null")); return v ?? d; } catch (e) { return d; } };
  const newId = (p) => (p || "e") + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const remindLabel = (m) => (REMIND_OPTS.find((o) => o[0] === Number(m)) || [0, Number(m) + " min avant"])[1];

  /* ================= État ================= */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = ymd(today);
  let events = lsJson(LS_EVENTS, []);
  let types = lsJson(LS_TYPES, null) || DEFAULT_TYPES.map((t) => ({ ...t }));
  if (!Array.isArray(events)) events = [];

  function save() {
    if (!lsSet(LS_EVENTS, JSON.stringify(events))) showMsg("Impossible d'enregistrer sur ce téléphone (stockage plein ou bloqué).", true);
  }
  const saveTypes = () => lsSet(LS_TYPES, JSON.stringify(types));
  function getType(id) {
    return SYS_TYPES[id] || types.find((t) => t.id === id) || types.find((t) => t.id === "autre") || DEFAULT_TYPES[6];
  }
  const userTypes = () => types;
  function eventRemind(e) {
    if (e.remind !== undefined && e.remind !== null && e.remind !== "") return Number(e.remind);
    return Number(getType(e.type).remind ?? -1);
  }

  /* ================= Garde ================= */
  function baseGarde(d) {
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) return false;
    const sat = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - (wd === 0 ? 864e5 : 0);
    const weeks = Math.round((sat - GARDE_REF) / (7 * 864e5));
    return ((weeks % 2) + 2) % 2 === 0;
  }
  function isGarde(d) {
    const k = ymd(d), evs = events.filter((e) => e.date === k);
    if (evs.some((e) => e.type === "garde_off")) return false;
    if (evs.some((e) => e.type === "garde")) return true;
    return baseGarde(d);
  }

  /* ================= Rendu ================= */
  function render() { renderNext(); renderMonth(); renderDay(); }

  function renderNext() {
    const d = new Date(today);
    for (let i = 0; i < 120 && !isGarde(d); i++) d.setDate(d.getDate() + 1);
    const diff = Math.round((d - today) / 864e5);
    const tom = new Date(today); tom.setDate(tom.getDate() + 1);
    const soon = [[today, "Aujourd'hui"], [tom, "Demain"]].map(([day, lbl]) => {
      const evs = events.filter((e) => e.date === ymd(day) && !SYS_TYPES[e.type]);
      if (!evs.length) return "";
      return `<span class="soon"><b>${lbl} :</b> ${evs.map((e) => esc((e.label || getType(e.type).label) + (e.start ? " " + e.start : ""))).join(", ")}</span>`;
    }).join("");
    $("next").innerHTML = `<span class="lbl">Prochaine garde de ton fils</span><b>${esc(fmtLong.format(d))}</b><span>${diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : "dans " + diff + " jours"}</span>${soon}`;
  }

  function renderMonth() {
    $("mtitle").textContent = fmtMonth.format(view);
    const off = (view.getDay() + 6) % 7;
    const start = new Date(view); start.setDate(1 - off);
    let html = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== view.getMonth()) break;
      const k = ymd(d), wd = d.getDay();
      let c = "cell";
      if (d.getMonth() !== view.getMonth()) c += " out";
      if (wd === 0 || wd === 6) c += " we";
      if (isGarde(d)) c += " g";
      if (d.getTime() === today.getTime()) c += " today";
      if (k === selected) c += " sel";
      const tags = events
        .filter((e) => e.date === k && !SYS_TYPES[e.type])
        .map((e) => {
          const t = getType(e.type);
          const txt = t.short && t.short !== "•" ? t.short : (e.label || t.label).slice(0, 6);
          return `<span class="tag" style="background:${esc(t.color)}">${esc(txt)}</span>`;
        }).join("");
      html += `<button class="${c}" data-k="${k}" aria-label="${esc(fmtLongY.format(d))}"><span class="n">${d.getDate()}</span><span class="tags">${tags}</span></button>`;
    }
    $("grid").innerHTML = html;
    $("legend").innerHTML = `<span><i style="background:var(--accent)"></i>Garde</span>` +
      userTypes().filter((t) => t.id !== "autre").map((t) => `<span><i style="background:${esc(t.color)}"></i>${esc(t.label)}</span>`).join("");
  }

  function renderDay() {
    const d = parse(selected);
    const evs = events.filter((e) => e.date === selected).sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    const g = isGarde(d), we = d.getDay() === 0 || d.getDay() === 6;
    let h = `<h3>${esc(fmtLongY.format(d))}</h3>`;
    if (g) h += `<div class="gnote">Week-end avec ton fils</div>`;
    const shown = evs.filter((e) => e.type !== "garde" || !g);
    h += shown.length
      ? `<div class="evs">${shown.map((e) => {
          const t = getType(e.type);
          const time = [e.start, e.end].filter(Boolean).join(" – ");
          const r = SYS_TYPES[e.type] ? -1 : eventRemind(e);
          const editable = !SYS_TYPES[e.type];
          return `<div class="ev"><span class="dot" style="background:${esc(t.color)}"></span>
            <${editable ? `button class="t evedit" data-edit="${esc(e.id)}"` : `span class="t"`}>${esc(e.label || t.label)}<small>${esc(t.label)}${time ? " · " + esc(time) : ""}${r >= 0 ? " · 🔔 " + esc(remindLabel(r)) : ""}</small></${editable ? "button" : "span"}>
            <button data-del="${esc(e.id)}">Retirer</button></div>`;
        }).join("")}</div>`
      : `<p class="empty">Rien de prévu ce jour-là.</p>`;
    h += `<div class="quick">${userTypes().filter((t) => t.id !== "autre").map((t) => `<button class="chipbtn" data-quick="${esc(t.id)}">+ ${esc(t.label)}</button>`).join("")}`;
    if (we) h += g ? `<button class="chipbtn" data-quick="garde_off">Pas de garde</button>` : `<button class="chipbtn" data-quick="garde">+ Garde</button>`;
    h += `<button class="chipbtn" data-form="1">+ Autre…</button></div>`;
    if (shown.some((e) => !SYS_TYPES[e.type])) h += `<p class="hintline">Touche un événement pour le modifier.</p>`;
    $("day").innerHTML = h;
  }

  /* ================= Données ================= */
  function normEvent(raw) {
    const date = String(raw.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const type = SYS_TYPES[raw.type] || types.some((t) => t.id === raw.type) ? raw.type : "autre";
    const e = { id: raw.id || newId(), date, type, label: String(raw.label || ""), start: String(raw.start || ""), end: String(raw.end || "") };
    if (raw.remind !== undefined && raw.remind !== null && raw.remind !== "") e.remind = Number(raw.remind);
    return e;
  }
  function addEvents(list) {
    let n = 0;
    for (const raw of list) { const e = normEvent({ ...raw, id: undefined }); if (e) { events.push(e); n++; } }
    save(); render();
    return n;
  }
  function removeEvents(ids) {
    const set = new Set(ids.map(String));
    const before = events.length;
    events = events.filter((e) => !set.has(e.id));
    save(); render();
    return before - events.length;
  }
  function updateEvent(id, patch) {
    const i = events.findIndex((e) => e.id === id); if (i < 0) return;
    const e = normEvent({ ...events[i], ...patch, id });
    if (!e) return;
    if (patch.remind === "" || patch.remind === null) delete e.remind;
    events[i] = e; save(); render();
  }

  /* ================= Interactions calendrier ================= */
  function goMonth(delta) { view = new Date(view.getFullYear(), view.getMonth() + delta, 1); renderMonth(); }
  $("grid").addEventListener("click", (e) => {
    const b = e.target.closest("[data-k]"); if (!b) return;
    selected = b.dataset.k;
    const d = parse(selected);
    if (d.getMonth() !== view.getMonth()) view = new Date(d.getFullYear(), d.getMonth(), 1);
    renderMonth(); renderDay();
  });
  $("prev").onclick = () => goMonth(-1);
  $("nextm").onclick = () => goMonth(1);
  $("gotoday").onclick = () => { view = new Date(today.getFullYear(), today.getMonth(), 1); selected = ymd(today); render(); };
  $("day").addEventListener("click", (e) => {
    const del = e.target.closest("[data-del]"), q = e.target.closest("[data-quick]"), f = e.target.closest("[data-form]"), ed = e.target.closest("[data-edit]");
    if (del) removeEvents([del.dataset.del]);
    else if (ed) openEventForm(events.find((x) => x.id === ed.dataset.edit));
    else if (q) { const t = getType(q.dataset.quick); addEvents([{ date: selected, type: q.dataset.quick, start: t.start || "", end: t.end || "" }]); }
    else if (f) openEventForm(null);
  });
  let sx = null;
  $("grid").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  $("grid").addEventListener("touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) goMonth(dx < 0 ? 1 : -1);
  });

  /* ================= Feuilles ================= */
  function openSheet(html) { $("panel").innerHTML = html; $("sheet").hidden = false; $("panel").scrollTop = 0; }
  function closeSheet() { $("sheet").hidden = true; $("panel").innerHTML = ""; }
  $("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });
  const remindSelect = (id, val, withDefault) =>
    `<select id="${id}">${withDefault ? `<option value="">Comme le type</option>` : ""}${REMIND_OPTS.map(([v, l]) => `<option value="${v}"${String(val) === String(v) ? " selected" : ""}>${l}</option>`).join("")}</select>`;

  /* --- Événement : ajout ou modification --- */
  function openEventForm(ev) {
    const isNew = !ev;
    const typeId = ev ? ev.type : userTypes()[0].id;
    const t0 = getType(typeId);
    openSheet(`<h3>${isNew ? "Ajouter un événement" : "Modifier l'événement"}</h3>
      <div class="form">
        <label>Type<select id="f-type">${userTypes().map((t) => `<option value="${esc(t.id)}"${t.id === typeId ? " selected" : ""}>${esc(t.label)}</option>`).join("")}</select></label>
        <label>Date<input id="f-date" type="date" value="${ev ? ev.date : selected}"></label>
        <label class="full">Libellé<input id="f-label" type="text" value="${esc(ev ? ev.label : "")}" placeholder="Ex. : rendez-vous notaire"></label>
        <label>Début<input id="f-start" type="time" value="${esc(ev ? ev.start : t0.start)}"></label>
        <label>Fin<input id="f-end" type="time" value="${esc(ev ? ev.end : t0.end)}"></label>
        <label class="full">Rappel${remindSelect("f-remind", ev && ev.remind !== undefined ? ev.remind : "", true)}</label>
      </div>
      <div class="actions"><button class="btn" id="f-cancel">Annuler</button><button class="btn primary" id="f-ok">${isNew ? "Ajouter" : "Enregistrer"}</button></div>`);
    if (isNew) $("f-type").onchange = () => { const t = getType($("f-type").value); $("f-start").value = t.start || ""; $("f-end").value = t.end || ""; };
    $("f-cancel").onclick = closeSheet;
    $("f-ok").onclick = () => {
      const data = { type: $("f-type").value, date: $("f-date").value, label: $("f-label").value.trim(), start: $("f-start").value, end: $("f-end").value, remind: $("f-remind").value };
      if (!data.date) return;
      closeSheet(); selected = data.date;
      const d = parse(selected); view = new Date(d.getFullYear(), d.getMonth(), 1);
      if (isNew) addEvents([data]); else updateEvent(ev.id, data);
    };
  }

  /* --- Types (choses à prévoir) --- */
  function typesList() {
    return userTypes().map((t) => `<div class="ev"><span class="dot" style="background:${esc(t.color)}"></span>
      <button class="t evedit" data-tedit="${esc(t.id)}">${esc(t.label)}<small>${t.start ? esc(t.start + " – " + (t.end || "?")) : "Sans horaire"} · ${esc(remindLabel(t.remind ?? -1))}</small></button></div>`).join("");
  }
  function openTypeForm(t) {
    const isNew = !t;
    t = t || { id: "", label: "", short: "", color: "#3550d6", start: "", end: "", remind: -1 };
    const used = isNew ? 0 : events.filter((e) => e.type === t.id).length;
    openSheet(`<h3>${isNew ? "Nouveau type" : "Modifier « " + esc(t.label) + " »"}</h3>
      <p>Les horaires et le rappel servent de valeurs par défaut quand tu ajoutes ce type.</p>
      <div class="form">
        <label>Nom<input id="t-label" type="text" value="${esc(t.label)}" placeholder="Ex. : Formation"></label>
        <label>Code court<input id="t-short" type="text" maxlength="4" value="${esc(t.short)}" placeholder="Ex. : F"></label>
        <label>Début<input id="t-start" type="time" value="${esc(t.start)}"></label>
        <label>Fin<input id="t-end" type="time" value="${esc(t.end)}"></label>
        <label>Couleur<input id="t-color" type="color" value="${esc(t.color)}"></label>
        <label>Rappel${remindSelect("t-remind", t.remind ?? -1, false)}</label>
      </div>
      ${!isNew && used ? `<p><label class="checkline"><input type="checkbox" id="t-apply"> Mettre aussi ces horaires sur les ${used} événement(s) déjà prévus</label></p>` : ""}
      <div class="actions">
        ${!isNew && t.id !== "autre" ? `<button class="btn danger" id="t-del">Supprimer</button>` : ""}
        <span style="flex:1"></span>
        <button class="btn" id="t-cancel">Retour</button><button class="btn primary" id="t-ok">${isNew ? "Ajouter" : "Enregistrer"}</button>
      </div><p id="t-msg"></p>`);
    $("t-cancel").onclick = openSettings;
    $("t-ok").onclick = () => {
      const label = $("t-label").value.trim();
      if (!label) { $("t-msg").textContent = "Donne un nom à ce type."; return; }
      const data = { label, short: $("t-short").value.trim() || label.slice(0, 3), color: $("t-color").value, start: $("t-start").value, end: $("t-end").value, remind: Number($("t-remind").value) };
      if (isNew) types.push({ id: newId("t"), ...data });
      else {
        Object.assign(types.find((x) => x.id === t.id), data);
        if ($("t-apply") && $("t-apply").checked) {
          events.forEach((e) => { if (e.type === t.id) { e.start = data.start; e.end = data.end; } });
          save();
        }
      }
      saveTypes(); render(); openSettings();
    };
    if ($("t-del")) $("t-del").onclick = () => {
      const btn = $("t-del");
      if (!btn.dataset.confirm) {
        btn.dataset.confirm = "1";
        btn.textContent = "Confirmer la suppression";
        $("t-msg").textContent = used ? `Les ${used} événement(s) de ce type seront aussi retirés.` : "";
        return;
      }
      types = types.filter((x) => x.id !== t.id);
      events = events.filter((e) => e.type !== t.id);
      saveTypes(); save(); render(); openSettings();
    };
  }

  /* --- Aperçu des propositions de l'assistant --- */
  function openPreview(res) {
    const adds = (Array.isArray(res.add) ? res.add : []).filter((a) => a && /^\d{4}-\d{2}-\d{2}$/.test(String(a.date)));
    const rmEvs = (Array.isArray(res.remove) ? res.remove : []).map(String).map((id) => events.find((e) => e.id === id)).filter(Boolean);
    const upds = (Array.isArray(res.update) ? res.update : []).map((u) => ({ u, e: u && events.find((e) => e.id === String(u.id)) })).filter((x) => x.e);
    if (!adds.length && !rmEvs.length && !upds.length) { showMsg(esc(res.message || "Je n'ai rien trouvé à ajouter ou retirer."), false); return; }
    const row = (i, kind, e, prefix) => {
      const t = getType(e.type), time = [e.start, e.end].filter(Boolean).join(" – ");
      return `<label class="prow ${kind}"><input type="checkbox" checked data-kind="${kind}" data-i="${i}"><span class="dot" style="background:${esc(t.color)}"></span><span class="t">${esc(fmtLongY.format(parse(e.date)))}<small>${prefix}${esc(e.label || t.label)} · ${esc(t.label)}${time ? " · " + esc(time) : ""}</small></span></label>`;
    };
    openSheet(`<h3>À vérifier avant d'enregistrer</h3>${res.message ? `<p>${esc(res.message)}</p>` : ""}
      ${adds.map((a, i) => row(i, "add", a, "")).join("")}
      ${upds.map((x, i) => row(i, "up", { ...x.e, ...x.u }, "Modifier : ")).join("")}
      ${rmEvs.map((e, i) => row(i, "rm", e, "Retirer : ")).join("")}
      <div class="actions"><button class="btn" id="p-cancel">Annuler</button><button class="btn primary" id="p-ok">Valider</button></div>`);
    $("p-cancel").onclick = closeSheet;
    $("p-ok").onclick = () => {
      const boxes = [...$("panel").querySelectorAll("input[type=checkbox]")];
      const pick = (k) => boxes.filter((b) => b.checked && b.dataset.kind === k).map((b) => +b.dataset.i);
      const A = pick("add").map((i) => adds[i]);
      const R = pick("rm").map((i) => rmEvs[i].id);
      const U = pick("up").map((i) => upds[i]);
      closeSheet();
      U.forEach(({ u, e }) => { const p = { ...u }; delete p.id; updateEvent(e.id, p); });
      const r = removeEvents(R), a = addEvents(A);
      const first = (A[0] || (U[0] && { date: U[0].u.date || U[0].e.date }));
      if (first && first.date) { selected = first.date; const d = parse(selected); view = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
      const parts = [];
      if (a) parts.push(a + " ajout" + (a > 1 ? "s" : ""));
      if (U.length) parts.push(U.length + " modification" + (U.length > 1 ? "s" : ""));
      if (r) parts.push(r + " retrait" + (r > 1 ? "s" : ""));
      showMsg("C'est fait : " + (parts.join(", ") || "rien de changé") + ".", false);
    };
  }

  /* --- Réglages --- */
  function openSettings() {
    const key = lsGet(LS_KEY, ""), model = lsGet(LS_MODEL, MODELS[0]);
    const gr = lsGet(LS_GARDE_REMIND, "360");
    openSheet(`<div class="sheethead"><h3>Réglages</h3><button class="btn" id="s-close">Fermer</button></div>

      <h4>Ce que je prévois</h4>
      <p>Touche un type pour changer son nom, sa couleur, ses horaires ou son rappel.</p>
      <div class="evs">${typesList()}</div>
      <div class="actions" style="justify-content:flex-start"><button class="btn" id="s-addtype">+ Ajouter un type</button></div>

      <h4>Rappels</h4>
      <p>L'appli envoie tes événements dans l'agenda de ton téléphone, avec leurs alarmes. C'est l'agenda qui te prévient, même appli fermée.</p>
      <div class="form">
        <label class="full">Rappel des week-ends avec ton fils
          <select id="s-gr"><option value="-1"${gr === "-1" ? " selected" : ""}>Ne pas les mettre dans l'agenda</option><option value="0"${gr === "0" ? " selected" : ""}>Dans l'agenda, sans rappel</option><option value="360"${gr === "360" ? " selected" : ""}>La veille à 18 h</option><option value="720"${gr === "720" ? " selected" : ""}>La veille à midi</option></select></label>
        <label class="full checkline"><input type="checkbox" id="s-onlynew" checked> Seulement ce qui n'a pas encore été envoyé (évite les doublons)</label>
      </div>
      <div class="actions" style="justify-content:flex-start"><button class="btn primary" id="s-ics">Envoyer vers mon agenda</button></div>
      <p id="s-icsmsg"></p>

      <h4>Assistant (Gemini, gratuit)</h4>
      <p>Colle ici ta clé API Gemini, créée gratuitement sur <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. Elle reste uniquement sur ce téléphone.</p>
      <div class="form">
        <label class="full">Clé API<input id="s-key" type="password" autocomplete="off" value="${esc(key)}" placeholder="AIza…"></label>
        <label class="full">Modèle<input id="s-model" type="text" value="${esc(model)}"></label>
      </div>
      <div class="actions"><button class="btn" id="s-test">Tester</button><button class="btn primary" id="s-save">Enregistrer</button></div>
      <p id="s-msg"></p>

      <h4>Sauvegarde</h4>
      <p>Ton planning est enregistré sur ce téléphone. Exporte-le de temps en temps pour le garder en lieu sûr ou le passer sur un autre appareil.</p>
      <div class="actions" style="justify-content:flex-start">
        <button class="btn" id="s-export">Exporter</button>
        <button class="btn" id="s-import">Importer</button>
        <input type="file" id="s-file" accept="application/json,.json" hidden>
      </div>
      <p id="s-bmsg"></p>
      <p class="hintline">Version ${APP_VERSION}</p>`);

    $("s-close").onclick = closeSheet;
    $("panel").querySelectorAll("[data-tedit]").forEach((b) => { b.onclick = () => openTypeForm(types.find((t) => t.id === b.dataset.tedit)); });
    $("s-addtype").onclick = () => openTypeForm(null);
    $("s-gr").onchange = () => lsSet(LS_GARDE_REMIND, $("s-gr").value);
    $("s-ics").onclick = () => exportIcs($("s-onlynew").checked);

    const keep = () => { lsSet(LS_KEY, $("s-key").value.trim()); lsSet(LS_MODEL, $("s-model").value.trim() || MODELS[0]); };
    $("s-save").onclick = () => { keep(); $("s-msg").textContent = "Enregistré."; updateBanner(); };
    $("s-test").onclick = async () => {
      keep(); $("s-msg").textContent = "Test en cours…";
      try { const r = await gemini([{ text: 'Réponds uniquement {"ok":true}' }]); $("s-msg").textContent = r && r.ok ? "La clé fonctionne." : "Réponse inattendue, mais la clé est acceptée."; }
      catch (e) { $("s-msg").textContent = e.message; }
      updateBanner();
    };
    $("s-export").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "mon-planning", version: 2, events, types }, null, 2)], { type: "application/json" });
      giveFile(blob, "planning-" + ymd(today) + ".json", "Sauvegarde du planning");
    };
    $("s-import").onclick = () => $("s-file").click();
    $("s-file").onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : data.events;
        if (!Array.isArray(list)) throw new Error();
        if (Array.isArray(data.types)) for (const t of data.types) if (t && t.id && !types.some((x) => x.id === t.id)) types.push(t);
        saveTypes();
        const known = new Set(events.map((x) => x.id));
        let n = 0;
        for (const x of list) if (x && x.id && !known.has(x.id)) { const ev = normEvent(x); if (ev) { events.push(ev); n++; } }
        save(); render(); $("s-bmsg").textContent = n + " événement(s) importé(s).";
      } catch (err) { $("s-bmsg").textContent = "Ce fichier n'est pas une sauvegarde du planning."; }
    };
  }
  $("settingsBtn").onclick = openSettings;

  /* ================= Fichiers & agenda (.ics) ================= */
  async function giveFile(blob, name, title) {
    const file = new File([blob], name, { type: blob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return "shared"; }
    } catch (e) { if (e && e.name === "AbortError") return "cancelled"; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return "downloaded";
  }
  const icsDate = (d) => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const icsDT = (dateStr, hhmm) => dateStr.replace(/-/g, "") + "T" + hhmm.replace(":", "") + "00";
  const icsText = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  function fold(line) {
    const out = []; let s = line;
    while (s.length > 74) { out.push(s.slice(0, 74)); s = " " + s.slice(74); }
    out.push(s); return out.join("\r\n");
  }
  function alarm(minutes, desc) {
    return ["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + icsText(desc), "TRIGGER:-PT" + Math.max(0, minutes) + "M", "END:VALARM"];
  }
  function exportIcs(onlyNew) {
    const sent = new Set(lsJson(LS_EXPORTED, []));
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BastienM64//Mon planning//FR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    const newSent = [];
    let n = 0;
    const todayStr = ymd(today);

    for (const e of events) {
      if (SYS_TYPES[e.type] || e.date < todayStr) continue;
      const sig = e.id + "|" + e.date + "|" + e.start + "|" + e.end + "|" + e.label + "|" + e.type + "|" + eventRemind(e);
      if (onlyNew && sent.has(sig)) continue;
      const t = getType(e.type), title = e.label ? (e.label === t.label ? t.label : t.label + " – " + e.label) : t.label;
      L.push("BEGIN:VEVENT", "UID:" + e.id + "@mon-planning", "DTSTAMP:" + stamp, "SUMMARY:" + icsText(title));
      if (e.start) {
        L.push("DTSTART:" + icsDT(e.date, e.start));
        if (e.end) {
          let endDate = e.date;
          if (e.end <= e.start) { const d = parse(e.date); d.setDate(d.getDate() + 1); endDate = ymd(d); }
          L.push("DTEND:" + icsDT(endDate, e.end));
        }
      } else {
        const d2 = parse(e.date); d2.setDate(d2.getDate() + 1);
        L.push("DTSTART;VALUE=DATE:" + e.date.replace(/-/g, ""), "DTEND;VALUE=DATE:" + icsDate(d2));
      }
      const r = eventRemind(e);
      if (r >= 0) L.push(...alarm(e.start ? r : 360, title)); // sans horaire : la veille à 18 h
      L.push("END:VEVENT");
      newSent.push(sig); n++;
    }

    const gr = Number(lsGet(LS_GARDE_REMIND, "360"));
    if (gr >= 0) {
      const d = new Date(today);
      while (d.getDay() !== 6) d.setDate(d.getDate() + 1);
      for (let w = 0; w < 26; w++, d.setDate(d.getDate() + 7)) {
        const sun = new Date(d); sun.setDate(sun.getDate() + 1);
        const sat = isGarde(d), su = isGarde(sun);
        if (!sat && !su) continue;
        const start = sat ? d : sun, end = new Date(su ? sun : d); end.setDate(end.getDate() + 1);
        const sig = "garde|" + ymd(start) + "|" + ymd(end) + "|" + gr;
        if (onlyNew && sent.has(sig)) continue;
        L.push("BEGIN:VEVENT", "UID:garde-" + ymd(start) + "@mon-planning", "DTSTAMP:" + stamp, "SUMMARY:Week-end avec mon fils",
          "DTSTART;VALUE=DATE:" + icsDate(start), "DTEND;VALUE=DATE:" + icsDate(end), "TRANSP:TRANSPARENT");
        if (gr > 0) L.push(...alarm(gr, "Week-end avec ton fils demain"));
        L.push("END:VEVENT");
        newSent.push(sig); n++;
      }
    }
    L.push("END:VCALENDAR");

    const msg = $("s-icsmsg");
    if (!n) { msg.textContent = onlyNew ? "Rien de nouveau à envoyer : tout est déjà dans ton agenda." : "Aucun événement à venir."; return; }
    const blob = new Blob([L.map(fold).join("\r\n") + "\r\n"], { type: "text/calendar" });
    giveFile(blob, "planning-" + ymd(today) + ".ics", "Mon planning").then((how) => {
      if (how === "cancelled") { msg.textContent = "Envoi annulé."; return; }
      lsSet(LS_EXPORTED, JSON.stringify([...sent, ...newSent].slice(-3000)));
      msg.textContent = how === "shared"
        ? `${n} événement(s) prêts. Choisis ton agenda dans la liste pour les ajouter.`
        : `${n} événement(s) dans le fichier téléchargé. Ouvre-le pour les ajouter à ton agenda.`;
    });
  }

  /* ================= Gemini ================= */
  async function gemini(parts) {
    const key = lsGet(LS_KEY, "");
    if (!key) throw new Error("Ajoute ta clé Gemini dans les réglages (roue dentée en haut).");
    const chosen = lsGet(LS_MODEL, MODELS[0]);
    const tryList = [chosen, ...MODELS.filter((m) => m !== chosen)];
    let lastErr;
    for (const model of tryList) {
      let r;
      try {
        r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { responseMimeType: "application/json", temperature: 0.1 } })
        });
      } catch (e) { throw new Error("Pas de connexion internet."); }
      if (r.status === 404) { lastErr = new Error(`Le modèle « ${model} » n'existe pas.`); continue; }
      if (r.status === 400 || r.status === 401 || r.status === 403) {
        const t = await r.text();
        if (/API key|API_KEY|permission/i.test(t)) throw new Error("La clé Gemini est refusée. Vérifie-la dans les réglages.");
        throw new Error("Demande refusée par Gemini (" + r.status + ").");
      }
      if (r.status === 429) throw new Error("Limite gratuite atteinte pour le moment. Réessaie dans une minute (ou demain si c'est la limite du jour).");
      if (!r.ok) { lastErr = new Error("Gemini ne répond pas (" + r.status + "). Réessaie dans un instant."); continue; }
      const data = await r.json();
      const txt = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
        .filter((p) => p.text && !p.thought).map((p) => p.text).join("");
      if (model !== chosen) lsSet(LS_MODEL, model);
      return parseJson(txt);
    }
    throw lastErr || new Error("Aucun modèle Gemini disponible.");
  }
  function parseJson(txt) {
    try { return JSON.parse(txt); } catch (e) {}
    const m = txt.match(/[\[{][\s\S]*[\]}]/);
    if (m) { try { return JSON.parse(m[0]); } catch (e) {} }
    throw new Error("Je n'ai pas compris la réponse. Reformule et réessaie.");
  }

  function context() {
    const wk = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"][today.getDay()];
    const evs = events.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => ({ id: e.id, date: e.date, type: e.type, label: e.label, start: e.start, end: e.end }));
    const typeList = userTypes().map((t) => `"${t.id}" (${t.label}${t.start ? `, par défaut ${t.start}-${t.end}` : ""})`).join(", ");
    return `Tu gères le planning personnel de Bastien, ambulancier à Pau. Aujourd'hui nous sommes ${wk} ${ymd(today)} (format AAAA-MM-JJ).
Il a son fils en garde un week-end sur deux (samedi + dimanche) à partir du samedi 2026-10-10 ; ces week-ends sont calculés automatiquement, ne les ajoute pas sauf exception demandée.
Types possibles : ${typeList}, "garde" (garde exceptionnelle de son fils un jour donné), "garde_off" (week-end de garde habituel annulé ou échangé, une entrée par jour). Une garde de nuit est notée sur le jour où elle commence. Si rien ne correspond, utilise "autre" avec un libellé.
Événements déjà enregistrés (avec leur id) : ${JSON.stringify(evs)}
Règles : une date sans année = la prochaine occurrence à partir d'aujourd'hui. Une plage de dates = une entrée par jour. Pour modifier un événement existant (horaire, date, libellé), utilise "update" avec son id et seulement les champs qui changent. Pour retirer, donne les id existants concernés. N'invente rien que la demande ne dit pas.
Réponds uniquement avec un objet JSON de cette forme :
{"add":[{"date":"AAAA-MM-JJ","type":"nuit","label":"","start":"19:00","end":"07:00"}],"update":[{"id":"...","start":"20:00"}],"remove":["id"],"message":"une phrase courte en français qui résume ce que tu proposes ou ce qui reste incertain"}`;
  }

  /* ================= Barre de commande ================= */
  function showMsg(html, err) { const m = $("cmdmsg"); m.hidden = !html; m.className = "cmdmsg" + (err ? " err" : ""); m.innerHTML = html || ""; }
  function busy(on, label) {
    ["sendBtn", "photoBtn", "micBtn"].forEach((id) => { $(id).disabled = on; });
    if (on) showMsg(`<span class="spin"></span>${esc(label)}`, false);
  }
  function autosize() { const t = $("cmd"); t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 110) + "px"; }

  async function runText() {
    const txt = $("cmd").value.trim(); if (!txt) return;
    busy(true, "Je regarde…");
    try {
      const res = await gemini([{ text: context() + `\n\nDemande de Bastien : « ${txt} »` }]);
      showMsg("", false); $("cmd").value = ""; autosize(); openPreview(res || {});
    } catch (e) { showMsg(esc(e.message), true); }
    finally { busy(false); }
  }

  async function shrink(file) {
    try {
      const bmp = await createImageBitmap(file);
      const s = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const c = document.createElement("canvas");
      c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
      c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.88));
      return { blob, mime: "image/jpeg" };
    } catch (e) { return { blob: file, mime: file.type || "image/jpeg" }; }
  }
  const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });

  async function runPhoto(file) {
    const extra = $("cmd").value.trim();
    busy(true, "Je lis ton planning… (ça peut prendre une minute)");
    try {
      const { blob, mime } = await shrink(file);
      const data = await toB64(blob);
      const prompt = context() + `\n\nL'image jointe est une photo du planning de travail de Bastien (tableau ou calendrier de son entreprise d'ambulances). Repère la ligne ou la colonne qui le concerne (Bastien, ou son nom), lis chaque jour et traduis les codes en types ci-dessus (J ou jour = "jour", N = "nuit", S ou SMUR = "smur", R ou RH = "repos", CA/RTT = "conge"). Reprends les horaires s'ils sont écrits. Ignore les jours vides. Si le mois ou l'année ne sont pas visibles, prends le mois le plus probable à partir d'aujourd'hui. Si un code est ambigu, mets-le en "autre" avec le code en label et signale-le dans le message.${extra ? `\nPrécision de Bastien : « ${extra} »` : ""}`;
      const res = await gemini([{ text: prompt }, { inline_data: { mime_type: mime, data } }]);
      showMsg("", false); $("cmd").value = ""; autosize(); openPreview(res || {});
    } catch (e) { showMsg(esc(e.message), true); }
    finally { busy(false); $("photo").value = ""; }
  }

  $("sendBtn").onclick = runText;
  $("cmd").addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runText(); } });
  $("cmd").addEventListener("input", autosize);
  $("photoBtn").onclick = () => $("photo").click();
  $("photo").addEventListener("change", (e) => { const f = e.target.files && e.target.files[0]; if (f) runPhoto(f); });

  /* ================= Micro (reconnaissance vocale du navigateur) ================= */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, heard = "";
  if (!SR) {
    $("micBtn").hidden = true;
  } else {
    $("micBtn").onclick = () => {
      if (listening) { rec && rec.stop(); return; }
      rec = new SR();
      rec.lang = "fr-FR"; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      heard = "";
      rec.onstart = () => { listening = true; $("micBtn").classList.add("rec"); showMsg("Je t'écoute… parle puis attends une seconde.", false); };
      rec.onresult = (ev) => {
        let txt = "";
        for (let i = 0; i < ev.results.length; i++) txt += ev.results[i][0].transcript;
        heard = txt.trim(); $("cmd").value = heard; autosize();
      };
      rec.onerror = (ev) => {
        const m = { "not-allowed": "Autorise le micro pour ce site dans les réglages du navigateur.", "no-speech": "Je n'ai rien entendu. Réessaie.", "network": "La dictée a besoin d'internet." }[ev.error];
        showMsg(m || "La dictée n'a pas marché. Tu peux aussi utiliser le micro du clavier.", true);
      };
      rec.onend = () => {
        listening = false; $("micBtn").classList.remove("rec");
        if (heard) { showMsg("", false); runText(); }
        else if (!$("cmdmsg").classList.contains("err")) showMsg("", false);
      };
      try { rec.start(); } catch (e) { showMsg("La dictée n'a pas pu démarrer.", true); }
    };
  }

  /* ================= Démarrage ================= */
  function updateBanner() {
    const b = $("banner");
    if (!lsGet(LS_KEY, "")) {
      b.hidden = false;
      b.innerHTML = `Pour dicter et lire les photos, ajoute ta clé Gemini gratuite. <button id="bannerGo">Ouvrir les réglages</button>`;
      $("bannerGo").onclick = openSettings;
    } else b.hidden = true;
  }
  render(); updateBanner();
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if ("serviceWorker" in navigator) {
    // Mise à jour automatique : on vérifie à chaque ouverture et on recharge quand une nouvelle version est prête
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadController && !reloaded) { reloaded = true; location.reload(); } });
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then((reg) => {
        reg.update().catch(() => {});
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
      }).catch(() => {});
    });
  }
})();
