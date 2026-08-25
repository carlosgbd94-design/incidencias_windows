/* Wrapper delgado sobre window.pywebview.api con espera de disponibilidad y
   manejo uniforme de errores. Toda respuesta del backend viene como
   {ok, error, data}. */

let listo = null;

function apiLista() {
  if (listo) return listo;
  listo = new Promise((resolve) => {
    if (window.pywebview && window.pywebview.api) { resolve(); return; }
    let resuelto = false;
    const terminar = () => {
      if (resuelto) return;
      resuelto = true;
      clearInterval(intervalo);
      resolve();
    };
    // El puente pywebview.api se inyecta de forma asíncrona; el evento
    // "pywebviewready" normalmente lo avisa, pero por si llega antes de que
    // este listener quede registrado (o no llega), también se sondea.
    window.addEventListener("pywebviewready", terminar, { once: true });
    const intervalo = setInterval(() => {
      if (window.pywebview && window.pywebview.api) terminar();
    }, 60);
  });
  return listo;
}

async function llamar(metodo, ...args) {
  await apiLista();
  let fn = window.pywebview.api[metodo];
  // El objeto pywebview.api puede existir un instante antes de que todos sus
  // métodos queden enlazados (más notorio en el primer arranque, cuando
  // WebView2 todavía está inicializando su entorno); reintentar en vez de
  // fallar de una vez. Hasta ~30s de margen para ese arranque en frío.
  for (let intentos = 0; !fn && intentos < 300; intentos++) {
    await new Promise((r) => setTimeout(r, 100));
    fn = window.pywebview.api[metodo];
  }
  if (!fn) throw new Error(`Método de API no encontrado: ${metodo}`);
  const respuesta = await fn(...args);
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

let _badgeClicListo = false;

function mostrarBadgeActualizacion(mensaje) {
  const badge = document.getElementById("update-badge");
  const texto = document.getElementById("update-badge-texto");
  if (!badge || !texto) return;
  texto.textContent = mensaje;
  badge.hidden = false;

  // El listener se engancha una sola vez (mostrarBadgeActualizacion puede
  // llamarse más de una vez en la misma sesión: al conectar el puente y de
  // nuevo si updater.py encuentra la actualización un poco después).
  if (_badgeClicListo) return;
  _badgeClicListo = true;
  badge.addEventListener("click", async () => {
    const overlay = document.getElementById("update-overlay");
    const textoOriginal = texto.textContent;
    badge.disabled = true;
    texto.textContent = "Actualizando…";
    // Se muestra la pantalla de "instalando" y se espera un instante ANTES
    // de pedirle a Python que cierre la ventana -- así el usuario alcanza a
    // ver la transición con nuestro propio diseño, en vez de que la ventana
    // desaparezca de golpe apenas se hace clic.
    if (overlay) overlay.classList.remove("oculto");
    await new Promise((r) => setTimeout(r, 900));
    try {
      // Si funciona, la ventana se cierra sola desde Python (dispara el
      // cierre normal, que instala y sale) -- no hay nada más que hacer
      // aquí en el caso exitoso.
      await llamar("actualizar_ahora");
    } catch (e) {
      if (overlay) overlay.classList.add("oculto");
      badge.disabled = false;
      texto.textContent = textoOriginal;
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

window.Api = { llamar, mostrarToast, mostrarErrorVista, mostrarBadgeActualizacion };
