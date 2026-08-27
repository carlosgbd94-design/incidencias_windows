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

  // Pantalla de arranque + versión en el pie del menú, ambas atadas a
  // cuándo el puente window.puente (QWebChannel, ver webchannel_bridge.py)
  // queda listo. No usa Api.llamar (ese muestra un toast de error si el
  // puente no responde) -- aquí basta con intentar en silencio, con
  // mensajes de estado progresivos para que una espera larga (antivirus
  // corporativo, máquina lenta, etc.) se sienta como "cargando" y no como
  // una app rota o congelada mostrando un guion suelto. La pantalla de
  // arranque se desvanece en cuanto conecta.
  (function conectarConPuente() {
    const overlay = document.getElementById("boot-overlay");
    const textoEstado = document.getElementById("boot-text");
    const elVersion = document.getElementById("app-version");
    const MENSAJES = [
      { desde: 0, texto: "Iniciando…" },
      { desde: 40, texto: "Preparando la interfaz…" },       // ~4s
      { desde: 120, texto: "Esto está tardando más de lo normal…" }, // ~12s
      { desde: 300, texto: "Seguimos intentando conectar…" }, // ~30s+
    ];
    let intentos = 0;
    const LIMITE_INTENTOS = 400; // ~30s rápidos + ~10min de reintento lento

    function actualizarMensaje() {
      if (!textoEstado) return;
      let texto = MENSAJES[0].texto;
      for (const m of MENSAJES) if (intentos >= m.desde) texto = m.texto;
      textoEstado.textContent = texto;
    }

    function ocultarOverlay() {
      if (overlay) overlay.classList.add("oculto");
    }

    const intentar = () => {
      if (window.puente) {
        ocultarOverlay();
        Api.llamar("version_actual")
          .then((version) => { if (elVersion && version) elVersion.textContent = `Versión ${version}`; })
          .catch(() => {});
        // Estado real de la actualización (no solo el aviso puntual de
        // updater.py) -- así la insignia refleja la verdad incluso si esta
        // pestaña conectó después de que ya se encontró la actualización, o
        // si por lo que sea el aviso puntual no llegó a tiempo.
        Api.llamar("actualizacion_lista")
          .then((datos) => {
            if (datos && datos.version) {
              Api.mostrarBadgeActualizacion(`Actualización ${datos.version} lista — se instala al cerrar`);
            }
          })
          .catch(() => {});
        return;
      }
      intentos += 1;
      actualizarMensaje();
      // El puente nunca llegó: no se deja la pantalla de arranque tapando la
      // app para siempre, aunque en ese caso probablemente nada funcione.
      if (intentos >= LIMITE_INTENTOS) { ocultarOverlay(); return; }
      const espera = intentos < 300 ? 100 : 1500; // primeros ~30s rápido, luego cada 1.5s
      setTimeout(intentar, espera);
    };
    intentar();
  })();
})();
