/* Router simple entre las vistas de la app. */
(function () {
  const VISTAS = ["perfil", "pases", "vacaciones", "exportar", "festivos", "respaldo"];

  function activar(nombre) {
    if (!VISTAS.includes(nombre)) nombre = "perfil";
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === nombre);
    });
    const cont = document.getElementById("content-area");
    cont.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "view";
    cont.appendChild(wrapper);
    window.Vistas[nombre](wrapper);
    try { localStorage.setItem("ultimaVista", nombre); } catch (e) { /* ignorar */ }
  }

  document.querySelectorAll(".nav-item").forEach((el) => {
    el.addEventListener("click", () => activar(el.dataset.view));
  });

  let inicial = "perfil";
  try { inicial = localStorage.getItem("ultimaVista") || "perfil"; } catch (e) { /* ignorar */ }
  activar(inicial);

  // Versión visible en el pie del menú. No usa Api.llamar (ese muestra un
  // toast de error y espera hasta 30s si el puente no responde) -- aquí
  // basta con intentar unas cuantas veces en silencio y desistir.
  (function mostrarVersion() {
    const el = document.getElementById("app-version");
    let intentos = 0;
    const intentar = () => {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.version_actual) {
        window.pywebview.api.version_actual()
          .then((r) => { if (el && r && r.data) el.textContent = `Versión ${r.data}`; })
          .catch(() => {});
        return;
      }
      intentos += 1;
      if (intentos < 300) setTimeout(intentar, 100); // ~30s máx (el puente puede tardar 8-9s en máquinas lentas), luego desiste en silencio
    };
    intentar();
  })();
})();
