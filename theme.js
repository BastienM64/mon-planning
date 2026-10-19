/* Thèmes de couleurs — chargé dans <head> pour éviter un flash au démarrage */
(function () {
  var T = {
    cobalt:   { name: "Cobalt",   l: ["#eef0fb", "#e2def7", "#3550d6", "#dfe4ff", "#8a7be8"], d: ["#12142a", "#1d1838", "#7d92ff", "#283166", "#a89cff"] },
    lavande:  { name: "Lavande",  l: ["#f3effb", "#e8dcf7", "#7a4fd6", "#ece2ff", "#c07be8"], d: ["#17122a", "#241638", "#b195ff", "#33255e", "#d39cff"] },
    ocean:    { name: "Océan",    l: ["#ebf5f8", "#d9eef2", "#0f7c9c", "#d4eef5", "#3aa6b9"], d: ["#0f1d24", "#10262e", "#4fc3e0", "#17404d", "#6fd3e0"] },
    foret:    { name: "Forêt",    l: ["#eef4ee", "#dfeadb", "#2f7d4f", "#d9eedf", "#8bb04a"], d: ["#111c15", "#17261a", "#5fcf8a", "#1d4430", "#a6d36a"] },
    corail:   { name: "Corail",   l: ["#fbf0ee", "#f7dfd9", "#d4513a", "#fde1da", "#e88a5b"], d: ["#22130f", "#2e1914", "#ff8a72", "#4d2219", "#ffae7a"] },
    rose:     { name: "Rose",     l: ["#fbeef4", "#f5dce9", "#c43d7f", "#fbdcec", "#9b6be0"], d: ["#22111a", "#2e1624", "#ff7fb8", "#4d1f36", "#c39cff"] },
    graphite: { name: "Graphite", l: ["#f1f2f4", "#e4e6ea", "#3d4451", "#e1e4ea", "#6b7a99"], d: ["#121417", "#1b1e23", "#c3cad6", "#2c313a", "#8d9bb5"] }
  };
  function get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } }
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function apply() {
    var id = get("planning-theme", "cobalt"), mode = get("planning-mode", "auto");
    var th = T[id] || T.cobalt;
    var dark = mode === "dark" || (mode === "auto" && mq && mq.matches);
    var c = dark ? th.d : th.l, r = document.documentElement;
    r.classList.toggle("dark", dark);
    r.style.setProperty("--bg", c[0]); r.style.setProperty("--bg2", c[1]);
    r.style.setProperty("--accent", c[2]); r.style.setProperty("--accent-soft", c[3]); r.style.setProperty("--lav", c[4]);
    r.style.setProperty("--accent-fg", dark ? "#10132b" : "#ffffff");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", c[0]);
  }
  if (mq && mq.addEventListener) mq.addEventListener("change", apply);
  window.PlanningThemes = { list: T, apply: apply };
  apply();
})();
