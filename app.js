(function () {
  "use strict";

  /* ================= Constantes ================= */
  const GARDE_REF = Date.UTC(2026, 9, 10); // samedi 10 octobre 2026 = 1er week-end de garde
  const LS_EVENTS = "planning-events-v1";
  const LS_KEY = "planning-gemini-key";
  const LS_MODEL = "planning-gemini-model";
  const MODELS = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite"];
  const TYPES = {
    jour: { label: "Jour", short: "J", color: "var(--c-jour)" },
    nuit: { label: "Nuit", short: "N", color: "var(--c-nuit)" },
    smur: { label: "SMUR", short: "SMUR", color: "var(--c-smur)" },
    repos: { label: "Repos", short: "R", color: "var(--c-repos)" },
    conge: { label: "Congé", short: "CA", color: "var(--c-conge)" },
    perso: { label: "Perso", short: "•", color: "var(--c-perso)" },
    garde: { label: "Garde en plus", short: "Fils", color: "var(--accent)" },
    garde_off: { label: "Pas de garde", short: "✕", color: "var(--c-autre)" },
    autre: { label: "Autre", short: "•", color: "var(--c-autre)" }
  };
  const DEFAULT_HOURS = { jour: ["07:00", "19:00"], nuit: ["19:00", "07:00"] };

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

  /* ================= État ================= */
  const today = new Date(); today.setHours(0, 0, 0, 0);
  let view = new Date(today.getFullYear(), today.getMonth(), 1);
  let selected = ymd(today);
  let events = [];
  try { events = JSON.parse(lsGet(LS_EVENTS, "[]")) || []; } catch (e) { events = []; }

  function save() {
    if (!lsSet(LS_EVENTS, JSON.stringify(events))) showMsg("Impossible d'enregistrer sur ce téléphone (stockage plein ou bloqué).", true);
  }
  const newId = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

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
    $("next").innerHTML = `<span class="lbl">Prochaine garde de ton fils</span><b>${esc(fmtLong.format(d))}</b><span>${diff === 0 ? "aujourd'hui" : diff === 1 ? "demain" : "dans " + diff + " jours"}</span>`;
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
        .filter((e) => e.date === k && e.type !== "garde" && e.type !== "garde_off")
        .map((e) => {
          const t = TYPES[e.type] || TYPES.autre;
          const txt = e.type === "perso" || e.type === "autre" ? (e.label || t.short).slice(0, 6) : t.short;
          return `<span class="tag" style="background:${t.color}">${esc(txt)}</span>`;
        }).join("");
      html += `<button class="${c}" data-k="${k}" aria-label="${esc(fmtLongY.format(d))}"><span class="n">${d.getDate()}</span><span class="tags">${tags}</span></button>`;
    }
    $("grid").innerHTML = html;
    $("legend").innerHTML = `<span><i style="background:var(--accent)"></i>Garde</span>` +
      ["jour", "nuit", "smur", "repos", "conge", "perso"].map((t) => `<span><i style="background:${TYPES[t].color}"></i>${TYPES[t].label}</span>`).join("");
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
          const t = TYPES[e.type] || TYPES.autre;
          const time = [e.start, e.end].filter(Boolean).join(" – ");
          return `<div class="ev"><span class="dot" style="background:${t.color}"></span><span class="t">${esc(e.label || t.label)}<small>${esc(t.label)}${time ? " · " + esc(time) : ""}</small></span><button data-del="${esc(e.id)}">Retirer</button></div>`;
        }).join("")}</div>`
      : `<p class="empty">Rien de prévu ce jour-là.</p>`;
    h += `<div class="quick">${["jour", "nuit", "smur", "repos", "conge"].map((t) => `<button class="chipbtn" data-quick="${t}">+ ${TYPES[t].label}</button>`).join("")}`;
    if (we) h += g ? `<button class="chipbtn" data-quick="garde_off">Pas de garde</button>` : `<button class="chipbtn" data-quick="garde">+ Garde</button>`;
    h += `<button class="chipbtn" data-form="1">+ Autre…</button></div>`;
    $("day").innerHTML = h;
  }

  /* ================= Données ================= */
  function addEvents(list) {
    let n = 0;
    for (const raw of list) {
      const date = String(raw.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const type = TYPES[raw.type] ? raw.type : "autre";
      events.push({ id: newId(), date, type, label: String(raw.label || ""), start: String(raw.start || ""), end: String(raw.end || "") });
      n++;
    }
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
    const del = e.target.closest("[data-del]"), q = e.target.closest("[data-quick]"), f = e.target.closest("[data-form]");
    if (del) removeEvents([del.dataset.del]);
    if (q) { const t = q.dataset.quick, hrs = DEFAULT_HOURS[t] || ["", ""]; addEvents([{ date: selected, type: t, start: hrs[0], end: hrs[1] }]); }
    if (f) openForm();
  });
  let sx = null;
  $("grid").addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; }, { passive: true });
  $("grid").addEventListener("touchend", (e) => {
    if (sx === null) return;
    const dx = e.changedTouches[0].clientX - sx; sx = null;
    if (Math.abs(dx) > 60) goMonth(dx < 0 ? 1 : -1);
  });

  /* ================= Feuilles ================= */
  function openSheet(html) { $("panel").innerHTML = html; $("sheet").hidden = false; }
  function closeSheet() { $("sheet").hidden = true; $("panel").innerHTML = ""; }
  $("sheet").addEventListener("click", (e) => { if (e.target.id === "sheet") closeSheet(); });

  function openForm() {
    openSheet(`<h3>Ajouter un événement</h3>
      <div class="form">
        <label>Type<select id="f-type">${Object.entries(TYPES).filter(([k]) => k !== "garde_off").map(([k, t]) => `<option value="${k}">${t.label}</option>`).join("")}</select></label>
        <label>Date<input id="f-date" type="date" value="${selected}"></label>
        <label class="full">Libellé<input id="f-label" type="text" placeholder="Ex. : rendez-vous notaire"></label>
        <label>Début<input id="f-start" type="time"></label>
        <label>Fin<input id="f-end" type="time"></label>
      </div>
      <div class="actions"><button class="btn" id="f-cancel">Annuler</button><button class="btn primary" id="f-ok">Ajouter</button></div>`);
    $("f-cancel").onclick = closeSheet;
    $("f-ok").onclick = () => {
      const ev = { type: $("f-type").value, date: $("f-date").value, label: $("f-label").value.trim(), start: $("f-start").value, end: $("f-end").value };
      if (!ev.date) return;
      closeSheet(); selected = ev.date; addEvents([ev]);
    };
  }

  function openPreview(res) {
    const adds = (Array.isArray(res.add) ? res.add : []).filter((a) => a && /^\d{4}-\d{2}-\d{2}$/.test(String(a.date)));
    const rmEvs = (Array.isArray(res.remove) ? res.remove : []).map(String).map((id) => events.find((e) => e.id === id)).filter(Boolean);
    if (!adds.length && !rmEvs.length) { showMsg(esc(res.message || "Je n'ai rien trouvé à ajouter ou retirer."), false); return; }
    const row = (i, kind, e) => {
      const t = TYPES[e.type] || TYPES.autre, time = [e.start, e.end].filter(Boolean).join(" – ");
      return `<label class="prow ${kind}"><input type="checkbox" checked data-kind="${kind}" data-i="${i}"><span class="dot" style="background:${t.color}"></span><span class="t">${esc(fmtLongY.format(parse(e.date)))}<small>${kind === "rm" ? "Retirer : " : ""}${esc(e.label || t.label)} · ${esc(t.label)}${time ? " · " + esc(time) : ""}</small></span></label>`;
    };
    openSheet(`<h3>À vérifier avant d'enregistrer</h3>${res.message ? `<p>${esc(res.message)}</p>` : ""}
      ${adds.map((a, i) => row(i, "add", a)).join("")}${rmEvs.map((e, i) => row(i, "rm", e)).join("")}
      <div class="actions"><button class="btn" id="p-cancel">Annuler</button><button class="btn primary" id="p-ok">Valider</button></div>`);
    $("p-cancel").onclick = closeSheet;
    $("p-ok").onclick = () => {
      const boxes = [...$("panel").querySelectorAll("input[type=checkbox]")];
      const A = boxes.filter((b) => b.checked && b.dataset.kind === "add").map((b) => adds[+b.dataset.i]);
      const R = boxes.filter((b) => b.checked && b.dataset.kind === "rm").map((b) => rmEvs[+b.dataset.i].id);
      closeSheet();
      const r = removeEvents(R), a = addEvents(A);
      if (A[0]) { selected = A[0].date; const d = parse(selected); view = new Date(d.getFullYear(), d.getMonth(), 1); render(); }
      showMsg(`C'est fait : ${a} ajout${a > 1 ? "s" : ""}, ${r} retrait${r > 1 ? "s" : ""}.`, false);
    };
  }

  function openSettings() {
    const key = lsGet(LS_KEY, ""), model = lsGet(LS_MODEL, MODELS[0]);
    openSheet(`<h3>Réglages</h3>
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
      <div class="actions"><button class="btn" id="s-close">Fermer</button></div>`);
    const keep = () => { lsSet(LS_KEY, $("s-key").value.trim()); lsSet(LS_MODEL, $("s-model").value.trim() || MODELS[0]); };
    $("s-save").onclick = () => { keep(); $("s-msg").textContent = "Enregistré."; updateBanner(); };
    $("s-test").onclick = async () => {
      keep(); $("s-msg").textContent = "Test en cours…";
      try { const r = await gemini([{ text: 'Réponds uniquement {"ok":true}' }]); $("s-msg").textContent = r && r.ok ? "La clé fonctionne." : "Réponse inattendue, mais la clé est acceptée."; }
      catch (e) { $("s-msg").textContent = e.message; }
      updateBanner();
    };
    $("s-close").onclick = closeSheet;
    $("s-export").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "mon-planning", version: 1, events }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "planning-" + ymd(today) + ".json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    $("s-import").onclick = () => $("s-file").click();
    $("s-file").onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const list = Array.isArray(data) ? data : data.events;
        if (!Array.isArray(list)) throw new Error();
        const known = new Set(events.map((x) => x.id));
        let n = 0;
        for (const x of list) if (x && x.id && !known.has(x.id) && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) { events.push(x); n++; }
        save(); render(); $("s-msg").textContent = n + " événement(s) importé(s).";
      } catch (err) { $("s-msg").textContent = "Ce fichier n'est pas une sauvegarde du planning."; }
    };
  }
  $("settingsBtn").onclick = openSettings;

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
    return `Tu gères le planning personnel de Bastien, ambulancier à Pau. Aujourd'hui nous sommes ${wk} ${ymd(today)} (format AAAA-MM-JJ).
Il a son fils en garde un week-end sur deux (samedi + dimanche) à partir du samedi 2026-10-10 ; ces week-ends sont calculés automatiquement, ne les ajoute pas sauf exception demandée.
Types possibles : "jour" (garde de jour, par défaut 07:00-19:00), "nuit" (garde de nuit, par défaut 19:00-07:00, notée sur le jour où elle commence), "smur", "repos", "conge" (congés, CA, RTT), "perso" (rendez-vous, activité perso), "garde" (garde exceptionnelle de son fils un jour donné), "garde_off" (week-end de garde habituel annulé ou échangé, une entrée par jour), "autre".
Événements déjà enregistrés (avec leur id) : ${JSON.stringify(evs)}
Règles : une date sans année = la prochaine occurrence à partir d'aujourd'hui. Une plage de dates = une entrée par jour. Pour retirer, donne les id existants concernés. N'invente rien que la demande ne dit pas.
Réponds uniquement avec un objet JSON de cette forme :
{"add":[{"date":"AAAA-MM-JJ","type":"nuit","label":"","start":"19:00","end":"07:00"}],"remove":["id"],"message":"une phrase courte en français qui résume ce que tu proposes ou ce qui reste incertain"}`;
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
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
})();
