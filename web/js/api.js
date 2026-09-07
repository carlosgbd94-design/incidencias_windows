/* Wrapper delgado sobre el puente QWebChannel (window.puente, ver
   app/webchannel_bridge.py) con espera de disponibilidad y manejo uniforme
   de errores. Toda respuesta del backend viene como {ok, error, data}.
   Reemplaza al window.pywebview.api de la versión anterior (pywebview) --
   ver la memoria del proyecto para el porqué del cambio de motor. */

let listo = null;

function apiLista() {
  if (listo) return listo;
  listo = new Promise((resolve) => {
    if (window.puente) { resolve(); return; }
    // qwebchannel.js (qrc:///qtwebchannel/qwebchannel.js, ver index.html)
    // establece el canal de forma asíncrona -- QWebChannel entrega los
    // objetos registrados por Python (Puente, ver webchannel_bridge.py) en
    // este callback.
    new QWebChannel(qt.webChannelTransport, (canal) => {
      window.puente = canal.objects.puente;
      resolve();
    });
  });
  return listo;
}

function _llamarPuente(metodo, argsJson) {
  // QWebChannel expone los métodos Python vía callback, no como Promise
  // nativa (la llamada real viaja de forma asíncrona por el canal, nunca
  // de forma síncrona sobre el hilo de la ventana -- a diferencia del
  // puente COM de pywebview, aquí no hay forma de que esto bloquee el
  // hilo de UI esperando el GIL).
  return new Promise((resolve) => {
    window.puente.llamar(metodo, argsJson, resolve);
  });
}

async function llamar(metodo, ...args) {
  await apiLista();
  const respuestaJson = await _llamarPuente(metodo, JSON.stringify(args));
  const respuesta = JSON.parse(respuestaJson);
  if (respuesta && respuesta.ok === false) {
    mostrarToast(respuesta.error || "Ocurrió un error inesperado.", "error");
    throw new Error(respuesta.error || metodo);
  }
  return respuesta ? respuesta.data : undefined;
}

const TOAST_ICONOS = {
  success: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  error: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v6M12 16.5h.01"/></svg>',
  // "update" es un tipo aparte (no reutiliza success) para que un aviso de
  // actualización se distinga a simple vista de un "guardado correctamente"
  // cualquiera -- se queda más tiempo en pantalla y con más presencia visual.
  update: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 11l6-6 6 6"/><path d="M5 20h14"/></svg>',
};

// Sonidos sintetizados con Web Audio (osciladores simples) -- nada de
// archivos de audio ni librerías externas que descargar/empacar, y así
// tampoco pesan nada en el instalador. Volumen bajo a propósito, pensado
// para notarse sin ser molesto en una oficina.
let _audioCtx = null;
function _contextoAudio() {
  if (!_audioCtx) {
    try { _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
    catch (e) { return null; }
  }
  return _audioCtx;
}
function _tono(ctx, frecuencia, inicio, duracion, volumen) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frecuencia;
  gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
  gain.gain.linearRampToValueAtTime(volumen, ctx.currentTime + inicio + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + inicio + duracion);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + inicio);
  osc.stop(ctx.currentTime + inicio + duracion + 0.02);
}
function reproducirSonido(tipo) {
  const ctx = _contextoAudio();
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    if (tipo === "error") {
      _tono(ctx, 220, 0, 0.16, 0.07);
      _tono(ctx, 185, 0.09, 0.18, 0.07);
    } else if (tipo === "update") {
      _tono(ctx, 587, 0, 0.09, 0.06);
      _tono(ctx, 740, 0.08, 0.09, 0.06);
      _tono(ctx, 988, 0.16, 0.2, 0.07);
    } else {
      _tono(ctx, 740, 0, 0.09, 0.06);
      _tono(ctx, 988, 0.07, 0.15, 0.06);
    }
  } catch (e) { /* el sonido nunca debe romper el flujo de la app */ }
}

function mostrarToast(mensaje, tipo = "success") {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;

  const badge = document.createElement("span");
  badge.className = "toast-icon";
  badge.innerHTML = TOAST_ICONOS[tipo] || TOAST_ICONOS.success;

  const texto = document.createElement("span");
  texto.className = "toast-msg";
  texto.textContent = mensaje;

  const cerrar = document.createElement("button");
  cerrar.type = "button";
  cerrar.className = "toast-cerrar";
  cerrar.setAttribute("aria-label", "Cerrar aviso");
  cerrar.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

  const barraWrap = document.createElement("div");
  barraWrap.className = "toast-progreso-wrap";
  const barra = document.createElement("div");
  barra.className = "toast-progreso";
  barraWrap.appendChild(barra);

  el.append(badge, texto, cerrar, barraWrap);
  host.appendChild(el);

  let restante = tipo === "update" ? 9000 : 3400;
  let inicioCuenta = 0;
  let temporizador = null;

  const salir = () => {
    clearTimeout(temporizador);
    el.classList.add("toast-saliendo");
    setTimeout(() => el.remove(), 210);
  };

  const iniciarCuenta = () => {
    barra.style.transitionDuration = `${restante}ms`;
    requestAnimationFrame(() => { barra.style.width = "0%"; });
    inicioCuenta = Date.now();
    temporizador = setTimeout(salir, restante);
  };

  // Se pausa mientras el mouse está encima -- una notificación que se
  // cierra sola justo cuando la estás leyendo se siente mal hecha.
  el.addEventListener("mouseenter", () => {
    clearTimeout(temporizador);
    restante = Math.max(restante - (Date.now() - inicioCuenta), 0);
    barra.style.transitionDuration = "0ms";
    barra.style.width = getComputedStyle(barra).width;
  });
  el.addEventListener("mouseleave", () => {
    if (restante > 150) iniciarCuenta(); else salir();
  });
  cerrar.addEventListener("click", salir);

  reproducirSonido(tipo);
  // Doble rAF: garantiza que el navegador ya pintó width:100% antes de
  // animar hacia 0%, si no, a veces se salta la transición por completo.
  requestAnimationFrame(() => requestAnimationFrame(iniciarCuenta));
}

// Chip pasivo "Tienes la última versión" -- nunca se usa para avisar que hay
// algo pendiente (eso es trabajo de mostrarDialogoActualizacion). No es
// interactivo, así que no necesita ningún listener.
function mostrarEstadoAlDia() {
  const badge = document.getElementById("update-badge");
  if (!badge) return;
  badge.hidden = false;
}

function mostrarProgresoActualizacion(texto) {
  const overlay = document.getElementById("update-overlay");
  const textoEl = document.getElementById("update-overlay-texto");
  if (!overlay) return;
  if (texto && textoEl) textoEl.textContent = texto;
  overlay.classList.remove("oculto");
}

function ocultarProgresoActualizacion() {
  const overlay = document.getElementById("update-overlay");
  if (overlay) overlay.classList.add("oculto");
}

let _versionDialogoMostrado = null;

// Diálogo modal "hay una actualización lista": el usuario decide el momento
// (Instalar ahora / Después), nunca se instala mientras trabaja sin
// avisarle. Puede llamarse más de una vez en la misma sesión (una vez al
// conectar el puente y otra si updater.py encuentra la actualización un poco
// después) -- si ya se mostró para esta misma versión, no hace nada de nuevo.
function mostrarDialogoActualizacion(version) {
  if (_versionDialogoMostrado === version) return;
  _versionDialogoMostrado = version;

  const overlay = document.getElementById("update-dialog-overlay");
  const texto = document.getElementById("update-dialog-texto");
  let btnInstalar = document.getElementById("update-dialog-instalar");
  let btnDespues = document.getElementById("update-dialog-despues");
  if (!overlay || !texto || !btnInstalar || !btnDespues) return;

  texto.textContent = `Hay una nueva versión (${version}) lista para instalar.`;

  // Clona y reemplaza los botones para partir de cero sin listeners
  // acumulados, en vez de llevar la cuenta de si ya se engancharon antes.
  btnInstalar = btnInstalar.cloneNode(true);
  document.getElementById("update-dialog-instalar").replaceWith(btnInstalar);
  btnDespues = btnDespues.cloneNode(true);
  document.getElementById("update-dialog-despues").replaceWith(btnDespues);

  overlay.classList.remove("oculto");
  reproducirSonido("update");

  btnDespues.addEventListener("click", () => {
    overlay.classList.add("oculto");
  });
  btnInstalar.addEventListener("click", async () => {
    btnInstalar.disabled = true;
    btnDespues.disabled = true;
    overlay.classList.add("oculto");
    mostrarProgresoActualizacion();
    try {
      // Si funciona, Python cierra la ventana (dispara el cierre normal, que
      // instala y sale) -- no hay nada más que hacer aquí en el caso exitoso.
      await llamar("actualizar_ahora");
    } catch (e) {
      ocultarProgresoActualizacion();
      btnInstalar.disabled = false;
      btnDespues.disabled = false;
      overlay.classList.remove("oculto");
    }
  });
}

function mostrarErrorVista(container, mensaje) {
  container.innerHTML = `
    <div class="glass-card" style="max-width:520px;">
      <h3 class="section-title" style="color:var(--danger);">No se pudo cargar esta sección</h3>
      <p style="font-size:13.5px; color:var(--text-secondary); line-height:1.5;">${mensaje}</p>
      <button class="btn btn-ghost" id="btn-reintentar" style="margin-top:10px;">Reintentar</button>
    </div>`;
  container.querySelector("#btn-reintentar").onclick = () => location.reload();
}

window.Api = {
  llamar, mostrarToast, mostrarErrorVista,
  mostrarEstadoAlDia, mostrarDialogoActualizacion,
  mostrarProgresoActualizacion, ocultarProgresoActualizacion,
};
