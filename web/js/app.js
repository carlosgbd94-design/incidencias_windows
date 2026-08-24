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
  // basta con intentar en silencio, con espera creciente, sin desistir tan
  // pronto: en máquinas lentas (antivirus corporativo escaneando WebView2 en
  // el primer arranque, perfiles de red, etc.) el puente puede tardar varios
  // minutos en quedar listo, y antes esta función se rendía a los 30s y el
  // "Versión —" se quedaba pegado para siempre aunque el puente sí llegara.
  (function mostrarVersion() {
    const el = document.getElementById("app-version");
    let intentos = 0;
    const LIMITE_INTENTOS = 400; // ~30s rápidos + ~10min de reintento lento
    const intentar = () => {
      if (window.pywebview && window.pywebview.api && window.pywebview.api.version_actual) {
        window.pywebview.api.version_actual()
          .then((r) => { if (el && r && r.data) el.textContent = `Versión ${r.data}`; })
          .catch(() => {});
        return;
      }
      intentos += 1;
      if (intentos >= LIMITE_INTENTOS) return; // el puente nunca llegó, desiste
      const espera = intentos < 300 ? 100 : 1500; // primeros ~30s rápido, luego cada 1.5s
      setTimeout(intentar, espera);
    };
    intentar();
  })();
})();
