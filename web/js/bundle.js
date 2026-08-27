/* GENERADO por scripts/bundle_web.py -- no editar a mano.
   Fuente: js/api.js, js/components/segmented.js, js/components/glass-select.js, js/components/smart-date-input.js, js/components/smart-time-input.js, js/views/perfil.js, js/views/pases.js, js/views/vacaciones.js, js/views/exportar.js, js/views/festivos.js, js/views/respaldo.js, js/app.js */

/* ---- js/api.js ---- */
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

/* ---- js/components/segmented.js ---- */
/* Control segmentado estilo iOS: un "thumb" claro que se desliza exactamente
   bajo el botón activo (medido en píxeles reales, no con trucos de %). */

function montarSegmented(el, { valores, valorInicial, onChange = () => {} }) {
  const thumb = document.createElement("div");
  thumb.className = "thumb";
  el.insertBefore(thumb, el.firstChild);

  let valor = valorInicial;

  function pintar() {
    el.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.v === valor));
    const activo = el.querySelector(`button[data-v="${valor}"]`);
    if (activo) {
      thumb.style.width = activo.offsetWidth + "px";
      thumb.style.transform = `translateX(${activo.offsetLeft - 2}px)`;
    }
  }

  el.querySelectorAll("button").forEach((b) => {
    b.addEventListener("click", () => {
      valor = b.dataset.v;
      pintar();
      onChange(valor);
    });
  });

  // Reposicionar tras el primer layout (fuentes/anchos ya calculados).
  requestAnimationFrame(pintar);

  return {
    getValue: () => valor,
    setValue: (v) => { valor = v; pintar(); },
  };
}

window.Segmented = { montarSegmented };

/* ---- js/components/glass-select.js ---- */
/* Dropdown de vidrio: reemplaza al <select> nativo. options: [{value,label}] */

function crearGlassSelect(container, { opciones = [], valorInicial = null, onChange = () => {}, placeholder = "Selecciona…" } = {}) {
  const root = document.createElement("div");
  root.className = "glass-select";

  const trigger = document.createElement("div");
  trigger.className = "glass-input trigger";
  trigger.tabIndex = 0;
  const labelSpan = document.createElement("span");
  const chev = document.createElement("span");
  chev.className = "chev";
  chev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>';
  trigger.appendChild(labelSpan);
  trigger.appendChild(chev);
  root.appendChild(trigger);

  const menu = document.createElement("div");
  menu.className = "menu";
  root.appendChild(menu);

  let valor = valorInicial;
  let lista = opciones;

  function etiquetaDe(v) {
    const o = lista.find((x) => x.value === v);
    return o ? o.label : placeholder;
  }

  function render() {
    labelSpan.textContent = etiquetaDe(valor);
    menu.innerHTML = "";
    lista.forEach((op) => {
      const item = document.createElement("div");
      item.className = "opt" + (op.value === valor ? " selected" : "");
      item.textContent = op.label;
      item.onclick = () => {
        valor = op.value;
        render();
        cerrar();
        onChange(valor);
      };
      menu.appendChild(item);
    });
  }

  function abrir() { root.classList.add("open"); }
  function cerrar() { root.classList.remove("open"); }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    root.classList.contains("open") ? cerrar() : abrir();
  });
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); abrir(); }
    if (e.key === "Escape") cerrar();
  });
  document.addEventListener("click", (e) => { if (!root.contains(e.target)) cerrar(); });

  render();
  container.appendChild(root);

  return {
    getValue: () => valor,
    setValue: (v) => { valor = v; render(); },
    setOpciones: (nuevas) => { lista = nuevas; render(); },
    el: root,
  };
}

window.GlassSelect = { crearGlassSelect };

/* ---- js/components/smart-date-input.js ---- */
/* Campo de fecha inteligente: el usuario solo teclea dígitos (17072026) y el
   componente inserta "/" automáticamente (17/07/2026). Incluye un calendario
   flotante de vidrio como alternativa a teclear. Expone valores en ISO
   (YYYY-MM-DD) para hablar con el backend, y muestra DD/MM/AAAA al usuario. */

const MESES_CAL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio",
  "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DOW_CAL = ["L", "M", "M", "J", "V", "S", "D"];

function diasEnMes(anio, mes) { return new Date(anio, mes + 1, 0).getDate(); }

function isoADisplay(iso) {
  if (!iso) return "";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

function displayAIso(display) {
  const limpio = display.replace(/\D/g, "");
  if (limpio.length !== 8) return null;
  const dia = limpio.slice(0, 2), mes = limpio.slice(2, 4), anio = limpio.slice(4, 8);
  const d = parseInt(dia, 10), m = parseInt(mes, 10), a = parseInt(anio, 10);
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > diasEnMes(a, m - 1)) return null;
  return `${anio}-${mes}-${dia}`;
}

function formatearMientrasEscribe(valorCrudo) {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 8);
  let out = digitos.slice(0, 2);
  if (digitos.length > 2) out += "/" + digitos.slice(2, 4);
  if (digitos.length > 4) out += "/" + digitos.slice(4, 8);
  return out;
}

function crearCampoFecha(container, { valorInicial = "", onChange = () => {}, placeholder = "DD/MM/AAAA" } = {}) {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.inputMode = "numeric";
  input.value = isoADisplay(valorInicial);
  wrap.appendChild(input);

  const btnCal = document.createElement("button");
  btnCal.type = "button";
  btnCal.setAttribute("aria-label", "Abrir calendario");
  btnCal.style.cssText = "position:absolute; right:8px; top:50%; transform:translateY(-50%); border:none; background:transparent; cursor:pointer; padding:4px; color:var(--text-secondary);";
  btnCal.innerHTML = '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>';
  wrap.appendChild(btnCal);

  const pop = document.createElement("div");
  pop.className = "date-popover";
  wrap.appendChild(pop);

  let iso = valorInicial || null;
  let vistaAnio, vistaMes;
  const hoy = new Date();

  function sincronizarVista() {
    if (iso) {
      const [a, m] = iso.split("-").map(Number);
      vistaAnio = a; vistaMes = m - 1;
    } else {
      vistaAnio = hoy.getFullYear(); vistaMes = hoy.getMonth();
    }
  }

  function marcarValidez() {
    if (!input.value) { input.classList.remove("valid", "invalid"); return; }
    if (iso) { input.classList.add("valid"); input.classList.remove("invalid"); }
    else { input.classList.add("invalid"); input.classList.remove("valid"); }
  }

  function renderCalendario() {
    const primerDiaSemana = (new Date(vistaAnio, vistaMes, 1).getDay() + 6) % 7; // lunes=0
    const totalDias = diasEnMes(vistaAnio, vistaMes);
    let celdas = "";
    for (const d of DOW_CAL) celdas += `<div class="cal-dow">${d}</div>`;
    for (let i = 0; i < primerDiaSemana; i++) celdas += `<div class="cal-day muted"></div>`;
    for (let d = 1; d <= totalDias; d++) {
      const esHoy = d === hoy.getDate() && vistaMes === hoy.getMonth() && vistaAnio === hoy.getFullYear();
      const isoDia = `${vistaAnio}-${String(vistaMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const esSel = isoDia === iso;
      celdas += `<div class="cal-day${esHoy ? " today" : ""}${esSel ? " selected" : ""}" data-dia="${d}">${d}</div>`;
    }
    pop.innerHTML = `
      <div class="cal-head">
        <button type="button" data-nav="-1">‹</button>
        <span class="cal-title">${MESES_CAL[vistaMes]} ${vistaAnio}</span>
        <button type="button" data-nav="1">›</button>
      </div>
      <div class="cal-grid">${celdas}</div>`;
    pop.querySelector('[data-nav="-1"]').onclick = () => { vistaMes--; if (vistaMes < 0) { vistaMes = 11; vistaAnio--; } renderCalendario(); };
    pop.querySelector('[data-nav="1"]').onclick = () => { vistaMes++; if (vistaMes > 11) { vistaMes = 0; vistaAnio++; } renderCalendario(); };
    pop.querySelectorAll(".cal-day[data-dia]").forEach((el) => {
      el.onclick = () => {
        const d = parseInt(el.dataset.dia, 10);
        iso = `${vistaAnio}-${String(vistaMes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        input.value = isoADisplay(iso);
        marcarValidez();
        cerrarPop();
        onChange(iso);
      };
    });
  }

  function abrirPop() { sincronizarVista(); renderCalendario(); pop.classList.add("open"); }
  function cerrarPop() { pop.classList.remove("open"); }

  btnCal.addEventListener("click", (e) => {
    e.stopPropagation();
    pop.classList.contains("open") ? cerrarPop() : abrirPop();
  });
  document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) cerrarPop(); });

  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const antes = input.value.length;
    input.value = formatearMientrasEscribe(input.value);
    const despues = input.value.length;
    input.selectionStart = input.selectionEnd = Math.max(0, pos + (despues - antes));
    iso = displayAIso(input.value);
    marcarValidez();
    if (iso) onChange(iso);
  });

  marcarValidez();

  container.appendChild(wrap);
  return {
    getValue: () => iso,
    setValue: (nuevoIso) => { iso = nuevoIso; input.value = isoADisplay(nuevoIso); marcarValidez(); },
    el: wrap,
    input,
  };
}

window.SmartDate = { crearCampoFecha, isoADisplay, displayAIso };

/* ---- js/components/smart-time-input.js ---- */
/* Campo de hora inteligente: el usuario teclea solo dígitos (1430) y el
   componente inserta ":" automáticamente (14:30). Valida 00-23 / 00-59. */

function formatearHoraMientrasEscribe(valorCrudo) {
  const digitos = valorCrudo.replace(/\D/g, "").slice(0, 4);
  let out = digitos.slice(0, 2);
  if (digitos.length > 2) out += ":" + digitos.slice(2, 4);
  return out;
}

function horaValida(valor) {
  const m = /^([0-2][0-9]):([0-5][0-9])$/.exec(valor);
  if (!m) return false;
  return parseInt(m[1], 10) <= 23;
}

function crearCampoHora(container, { valorInicial = "", onChange = () => {}, placeholder = "HH:MM" } = {}) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.inputMode = "numeric";
  input.value = valorInicial || "";

  function marcarValidez() {
    if (!input.value) { input.classList.remove("valid", "invalid"); return; }
    if (horaValida(input.value)) { input.classList.add("valid"); input.classList.remove("invalid"); }
    else { input.classList.add("invalid"); input.classList.remove("valid"); }
  }

  input.addEventListener("input", () => {
    const pos = input.selectionStart;
    const antes = input.value.length;
    input.value = formatearHoraMientrasEscribe(input.value);
    const despues = input.value.length;
    input.selectionStart = input.selectionEnd = Math.max(0, pos + (despues - antes));
    marcarValidez();
    if (horaValida(input.value)) onChange(input.value);
  });

  marcarValidez();
  container.appendChild(input);
  return {
    getValue: () => (horaValida(input.value) ? input.value : null),
    setValue: (v) => { input.value = v || ""; marcarValidez(); },
    el: input,
    input,
  };
}

window.SmartTime = { crearCampoHora, horaValida };

/* ---- js/views/perfil.js ---- */
window.Vistas = window.Vistas || {};

const TURNOS_OPC = ["MATUTINO", "VESPERTINO", "MIXTO", "NOCTURNO"].map((v) => ({ value: v, label: v }));
const RECURSOS_OPC = ["Base Federal", "Base Estatal", "Regularizado", "Formalizado", "Confianza"]
  .map((v) => ({ value: v, label: v }));
const RIESGO_OPC = [
  { value: "Ninguno", label: "Ninguno" },
  { value: "Bajo", label: "Bajo (5 días)" },
  { value: "Mediano", label: "Mediano (8 días)" },
  { value: "Alto", label: "Alto (12 días)" },
];
const DIAS_SEMANA = ["LUN", "MAR", "MIE", "JUE", "VIE", "SAB", "DOM"];

function campoDDMM(container, valorInicial) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "glass-input";
  input.placeholder = "DD/MM";
  input.inputMode = "numeric";
  input.value = valorInicial || "";
  input.addEventListener("input", () => {
    const digitos = input.value.replace(/\D/g, "").slice(0, 4);
    input.value = digitos.length > 2 ? `${digitos.slice(0, 2)}/${digitos.slice(2)}` : digitos;
  });
  container.appendChild(input);
  return input;
}

window.Vistas.perfil = async function (container) {
  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Perfil del Trabajador</h1>
      <p class="page-subtitle">Estos datos se usan para calcular tus límites de pases, tus vacaciones y para generar los PDF de exportación.</p>
    </div>
    <div class="glass-card" style="max-width:1040px;">
      <div class="grid-2">
        <div class="stack">
          <div class="field"><label class="field-label">Nombre completo</label><div id="f-nombre"></div></div>
          <div class="row">
            <div class="field"><label class="field-label">Número de empleado</label><div id="f-no-empleado"></div></div>
            <div class="field"><label class="field-label">Turno</label><div id="f-turno"></div></div>
          </div>
          <div class="field"><label class="field-label">Centro de trabajo</label><div id="f-centro"></div></div>
          <div class="field"><label class="field-label">Área y Dirección a la que pertenece</label><div id="f-area"></div></div>
        </div>
        <div class="stack">
          <div class="row">
            <div class="field"><label class="field-label">Hora de entrada</label><div id="f-hora-entrada"></div></div>
            <div class="field"><label class="field-label">Hora de fin de turno</label><div id="f-hora-fin"></div></div>
          </div>
          <div class="field"><label class="field-label">Recurso</label><div id="f-recurso"></div></div>
          <div class="field">
            <label class="field-label">Días laborables</label>
            <div id="f-dias" style="display:flex; gap:6px; flex-wrap:wrap;"></div>
          </div>
          <div class="field"><label class="field-label">Nivel de riesgo</label><div id="f-riesgo" style="max-width:260px;"></div></div>
        </div>
      </div>
      <hr class="divider">
      <div class="row" style="align-items:flex-start;">
        <div class="field" style="flex:1;">
          <label class="field-label">Día de cumpleaños o santoral (Art. 141 Fracción I CGT)</label>
          <div id="f-tipo-dia" style="margin-bottom:10px;"></div>
        </div>
        <div class="field" style="max-width:140px;">
          <label class="field-label">Fecha (DD/MM)</label>
          <div id="f-fecha-dia"></div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-guardar-perfil" style="margin-top:8px;">Guardar Perfil</button>
    </div>
  `;

  try {
    await montarFormulario(container);
  } catch (e) {
    Api.mostrarErrorVista(container, e.message || "Ocurrió un error inesperado.");
  }
};

async function montarFormulario(container) {
  const perfil = await Api.llamar("perfil_obtener");

  const inNombre = document.createElement("input");
  inNombre.className = "glass-input"; inNombre.value = perfil.nombre || "";
  container.querySelector("#f-nombre").appendChild(inNombre);

  const inNoEmp = document.createElement("input");
  inNoEmp.className = "glass-input"; inNoEmp.value = perfil.no_empleado || "";
  container.querySelector("#f-no-empleado").appendChild(inNoEmp);

  const selTurno = GlassSelect.crearGlassSelect(container.querySelector("#f-turno"), {
    opciones: TURNOS_OPC, valorInicial: perfil.turno || "MATUTINO",
  });

  const inCentro = document.createElement("input");
  inCentro.className = "glass-input";
  inCentro.value = perfil.centro_trabajo || "JURISDICCION SANITARIA NO. 1";
  container.querySelector("#f-centro").appendChild(inCentro);

  const inArea = document.createElement("input");
  inArea.className = "glass-input";
  inArea.value = perfil.area_direccion || "OFICINAS DE LA JURISDICCION SANITARIA I, J1";
  container.querySelector("#f-area").appendChild(inArea);

  const horaEntrada = SmartTime.crearCampoHora(container.querySelector("#f-hora-entrada"), { valorInicial: perfil.hora_entrada || "09:00" });
  const horaFin = SmartTime.crearCampoHora(container.querySelector("#f-hora-fin"), { valorInicial: perfil.hora_fin_turno || "14:30" });
  const selRecurso = GlassSelect.crearGlassSelect(container.querySelector("#f-recurso"), {
    opciones: RECURSOS_OPC, valorInicial: perfil.recurso || "Regularizado",
  });

  const diasSeleccionados = new Set((perfil.dias_laborables || "LUN,MAR,MIE,JUE,VIE").split(","));
  const diasWrap = container.querySelector("#f-dias");
  DIAS_SEMANA.forEach((dia) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "btn btn-sm " + (diasSeleccionados.has(dia) ? "btn-primary" : "btn-ghost");
    chip.textContent = dia;
    chip.onclick = () => {
      if (diasSeleccionados.has(dia)) diasSeleccionados.delete(dia); else diasSeleccionados.add(dia);
      chip.className = "btn btn-sm " + (diasSeleccionados.has(dia) ? "btn-primary" : "btn-ghost");
    };
    diasWrap.appendChild(chip);
  });

  const selRiesgo = GlassSelect.crearGlassSelect(container.querySelector("#f-riesgo"), {
    opciones: RIESGO_OPC, valorInicial: perfil.nivel_riesgo || "Ninguno",
  });

  const segTipoDia = document.createElement("div");
  segTipoDia.className = "segmented";
  segTipoDia.innerHTML = `
    <button type="button" data-v="Cumpleaños">Cumpleaños</button>
    <button type="button" data-v="Santoral">Santoral</button>`;
  container.querySelector("#f-tipo-dia").appendChild(segTipoDia);
  const ctrlTipoDia = Segmented.montarSegmented(segTipoDia, {
    valorInicial: perfil.tipo_dia_especial || "Cumpleaños",
  });

  const inFechaDia = campoDDMM(container.querySelector("#f-fecha-dia"), perfil.fecha_dia_especial);

  container.querySelector("#btn-guardar-perfil").onclick = async () => {
    try {
      await Api.llamar("perfil_guardar", {
        nombre: inNombre.value, no_empleado: inNoEmp.value, centro_trabajo: inCentro.value,
        area_direccion: inArea.value, turno: selTurno.getValue(), recurso: selRecurso.getValue(),
        hora_entrada: horaEntrada.getValue(), hora_fin_turno: horaFin.getValue(),
        dias_laborables: Array.from(diasSeleccionados),
        nivel_riesgo: selRiesgo.getValue(), tipo_dia_especial: ctrlTipoDia.getValue(), fecha_dia_especial: inFechaDia.value,
      });
      Api.mostrarToast("Perfil guardado correctamente.", "success");
    } catch (e) { /* el toast de error ya se mostró */ }
  };
}

/* ---- js/views/pases.js ---- */
window.Vistas = window.Vistas || {};

const MESES_PASES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
  "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function opcionesAnios() {
  const actual = new Date().getFullYear();
  const out = [];
  for (let y = actual - 2; y <= actual + 2; y++) out.push({ value: String(y), label: String(y) });
  return out;
}
function opcionesMeses() { return MESES_PASES.map((m, i) => ({ value: String(i + 1), label: m })); }

window.Vistas.pases = async function (container) {
  const hoy = new Date();
  let anio = hoy.getFullYear();
  let mes = hoy.getMonth() + 1;
  let seccion = "particulares";

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Pases de Salida</h1>
      <p class="page-subtitle">Límite: 6 horas al mes, máximo 2 horas por día (Art. 92 fracciones I, III CGT).</p>
    </div>
    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:18px;">
      <div class="segmented" id="seg-tipo">
        <button type="button" data-v="particulares">Particulares</button>
        <button type="button" data-v="oficiales">Oficiales</button>
      </div>
      <div style="display:flex; gap:8px;">
        <div id="sel-mes" style="width:150px;"></div>
        <div id="sel-anio" style="width:100px;"></div>
      </div>
    </div>
    <div id="pases-body"></div>
  `;

  const selMes = GlassSelect.crearGlassSelect(container.querySelector("#sel-mes"), {
    opciones: opcionesMeses(), valorInicial: String(mes), onChange: (v) => { mes = parseInt(v, 10); render(); },
  });
  const selAnio = GlassSelect.crearGlassSelect(container.querySelector("#sel-anio"), {
    opciones: opcionesAnios(), valorInicial: String(anio), onChange: (v) => { anio = parseInt(v, 10); render(); },
  });

  Segmented.montarSegmented(container.querySelector("#seg-tipo"), {
    valorInicial: seccion, onChange: (v) => { seccion = v; render(); },
  });

  const body = container.querySelector("#pases-body");

  async function render() {
    try {
      if (seccion === "particulares") await renderParticulares(); else await renderOficiales();
    } catch (e) {
      Api.mostrarErrorVista(body, e.message || "Ocurrió un error inesperado.");
    }
  }

  async function renderParticulares() {
    const { pases, resumen } = await Api.llamar("pases_listar", anio, mes);
    const totalMin = resumen.usado_min + resumen.restante_min;
    const pctMes = totalMin > 0 ? Math.min(100, Math.round((resumen.usado_min / totalMin) * 100)) : 0;
    const claseAnillo = pctMes >= 100 ? "danger" : pctMes > 70 ? "warn" : "";
    const RADIO = 52, CIRC = 2 * Math.PI * RADIO;
    const dashoffset = CIRC * (1 - pctMes / 100);
    let editId = null;

    body.innerHTML = `
      <div class="grid-2">
        <div class="glass-card">
          <h3 class="section-title" id="np-titulo">Registrar pase particular</h3>
          <div class="field"><label class="field-label">Fecha</label><div id="np-fecha"></div></div>
          <div class="field"><label class="field-label">Hora de salida</label><div id="np-salida"></div></div>
          <div class="field">
            <label class="field-label">¿Regresa a trabajar ese día?</label>
            <div class="segmented" id="np-regresa" style="margin-top:4px;">
              <button type="button" data-v="si">Sí</button>
              <button type="button" data-v="no">No</button>
            </div>
          </div>
          <div class="field"><label class="field-label">Hora de regreso</label><div id="np-regreso"></div></div>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-primary" id="np-guardar">Registrar Pase</button>
            <button class="btn btn-ghost" id="np-cancelar" style="display:none;">Cancelar</button>
          </div>
        </div>
        <div class="glass-card">
          <h3 class="section-title">Resumen del mes</h3>
          <div class="stat-row">
            <div class="stat-ring-wrap">
              <svg class="stat-ring" viewBox="0 0 128 128">
                <circle class="ring-track" cx="64" cy="64" r="${RADIO}"></circle>
                <circle class="ring-fill ${claseAnillo}" cx="64" cy="64" r="${RADIO}"
                        stroke-dasharray="${CIRC}" stroke-dashoffset="${dashoffset}"></circle>
              </svg>
              <div class="ring-center">
                <div class="ring-value">${pctMes}%</div>
                <div class="ring-label">usado</div>
              </div>
            </div>
            <div class="stat-tiles">
              <div class="stat-tile"><span class="stat-tile-label">Usado este mes</span><span class="stat-tile-value">${resumen.usado_texto}</span></div>
              <div class="stat-tile"><span class="stat-tile-label">Disponible</span><span class="stat-tile-value">${resumen.restante_texto}</span></div>
              <div class="stat-tile"><span class="stat-tile-label">Pases registrados</span><span class="stat-tile-value">${pases.length}</span></div>
            </div>
          </div>
          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:14px;">
            Límite: ${resumen.limite_dia_texto} por día, ${resumen.limite_mes_texto} al mes (Art. 92 CGT).
          </div>
        </div>
      </div>
      <div class="glass-card" style="margin-top:16px;">
        <h3 class="section-title">Pases de ${MESES_PASES[mes - 1]} ${anio}</h3>
        <div id="tabla-particulares"></div>
      </div>
    `;

    const fFecha = SmartDate.crearCampoFecha(body.querySelector("#np-fecha"), {});
    const fSalida = SmartTime.crearCampoHora(body.querySelector("#np-salida"), {});
    const fRegreso = SmartTime.crearCampoHora(body.querySelector("#np-regreso"), {});
    function actualizarRegreso(v) {
      const activo = v === "si";
      fRegreso.input.disabled = !activo;
      fRegreso.input.style.opacity = activo ? "1" : ".45";
    }
    const ctrlRegresa = Segmented.montarSegmented(body.querySelector("#np-regresa"), {
      valorInicial: "si", onChange: actualizarRegreso,
    });
    actualizarRegreso("si");

    const btnGuardar = body.querySelector("#np-guardar");
    const btnCancelar = body.querySelector("#np-cancelar");
    const titulo = body.querySelector("#np-titulo");

    function entrarModoEdicion(p) {
      editId = p.id;
      titulo.textContent = "Editar pase particular";
      btnGuardar.textContent = "Guardar cambios";
      btnCancelar.style.display = "";
      fFecha.setValue(p.fecha);
      fSalida.setValue(p.hora_salida);
      ctrlRegresa.setValue(p.regresa ? "si" : "no");
      actualizarRegreso(p.regresa ? "si" : "no");
      fRegreso.setValue(p.hora_regreso || "");
      body.querySelector(".glass-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function salirModoEdicion() {
      editId = null;
      titulo.textContent = "Registrar pase particular";
      btnGuardar.textContent = "Registrar Pase";
      btnCancelar.style.display = "none";
    }

    btnCancelar.onclick = () => { salirModoEdicion(); renderParticulares(); };

    btnGuardar.onclick = async () => {
      const regresa = ctrlRegresa.getValue() === "si";
      const datos = {
        fecha: fFecha.getValue(), hora_salida: fSalida.getValue(),
        regresa, hora_regreso: regresa ? fRegreso.getValue() : null,
      };
      const editando = editId !== null;
      if (editando) {
        const original = pases.find((p) => p.id === editId);
        if (original && original.exportado && !confirm(
          "Este pase ya fue exportado en un PDF. Corregirlo aquí no actualiza ese PDF ya generado. ¿Continuar?"
        )) return;
      }
      try {
        const r = editando
          ? await Api.llamar("pases_editar", editId, datos)
          : await Api.llamar("pases_registrar", datos);
        Api.mostrarToast(`${editando ? "Pase actualizado" : "Pase registrado"}: ${r.duracion_texto}.`, "success");
        renderParticulares();
      } catch (e) { /* toast ya mostrado */ }
    };

    const tabla = body.querySelector("#tabla-particulares");
    if (!pases.length) {
      tabla.innerHTML = `<div class="empty-hint">Aún no hay pases registrados este mes.</div>`;
    } else {
      tabla.innerHTML = `<div style="overflow-x:auto;"><table class="glass-table">
        <thead><tr><th>#</th><th>Fecha</th><th>Salida</th><th>Regresa</th><th>Regreso</th><th>Tiempo</th><th>Exportado</th><th></th></tr></thead>
        <tbody>${pases.map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${SmartDate.isoADisplay(p.fecha)}</td>
            <td>${p.hora_salida}</td>
            <td>${p.regresa ? "Sí" : "No"}</td>
            <td>${p.hora_regreso || "—"}</td>
            <td>${p.duracion_texto}</td>
            <td>${p.exportado ? '<span class="badge badge-ok">Sí</span>' : '<span class="badge badge-muted">No</span>'}</td>
            <td style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" data-edit="${p.id}">Editar</button>
              <button class="btn btn-ghost btn-sm" data-del="${p.id}">Eliminar</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
      tabla.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const p = pases.find((x) => x.id === parseInt(btn.dataset.edit, 10));
          if (p) entrarModoEdicion(p);
        };
      });
      tabla.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          const p = pases.find((x) => x.id === parseInt(btn.dataset.del, 10));
          if (p && p.exportado && !confirm(
            "Este pase ya fue exportado en un PDF. Eliminarlo aquí no actualiza ese PDF ya generado. ¿Continuar?"
          )) return;
          try { await Api.llamar("pases_eliminar", parseInt(btn.dataset.del, 10)); renderParticulares(); }
          catch (e) { /* toast ya mostrado */ }
        };
      });
    }
  }

  async function renderOficiales() {
    const oficiales = await Api.llamar("oficiales_listar", anio, mes);
    let editId = null;
    body.innerHTML = `
      <div class="glass-card">
        <h3 class="section-title" id="no-titulo">Registrar comisión oficial</h3>
        <div class="row">
          <div class="field"><label class="field-label">Fecha</label><div id="no-fecha"></div></div>
          <div class="field"><label class="field-label">Horario de comisión</label><div id="no-horario"></div></div>
        </div>
        <div class="field"><label class="field-label">Asunto</label><div id="no-asunto"></div></div>
        <div class="field"><label class="field-label">Dependencia a la que asiste</label><div id="no-dependencia"></div></div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary" id="no-guardar">Registrar Comisión</button>
          <button class="btn btn-ghost" id="no-cancelar" style="display:none;">Cancelar</button>
        </div>
      </div>
      <div class="glass-card" style="margin-top:16px;">
        <h3 class="section-title">Comisiones de ${MESES_PASES[mes - 1]} ${anio}</h3>
        <div id="tabla-oficiales"></div>
      </div>
    `;
    const fFecha = SmartDate.crearCampoFecha(body.querySelector("#no-fecha"), {});
    const inHorario = document.createElement("input");
    inHorario.className = "glass-input"; inHorario.placeholder = "09:00-13:00";
    body.querySelector("#no-horario").appendChild(inHorario);
    const inAsunto = document.createElement("input");
    inAsunto.className = "glass-input";
    body.querySelector("#no-asunto").appendChild(inAsunto);
    const inDependencia = document.createElement("input");
    inDependencia.className = "glass-input";
    body.querySelector("#no-dependencia").appendChild(inDependencia);

    const btnGuardar = body.querySelector("#no-guardar");
    const btnCancelar = body.querySelector("#no-cancelar");
    const titulo = body.querySelector("#no-titulo");

    function entrarModoEdicion(o) {
      editId = o.id;
      titulo.textContent = "Editar comisión oficial";
      btnGuardar.textContent = "Guardar cambios";
      btnCancelar.style.display = "";
      fFecha.setValue(o.fecha);
      inHorario.value = o.horario_comision;
      inAsunto.value = o.asunto;
      inDependencia.value = o.dependencia;
      body.querySelector(".glass-card").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function salirModoEdicion() {
      editId = null;
      titulo.textContent = "Registrar comisión oficial";
      btnGuardar.textContent = "Registrar Comisión";
      btnCancelar.style.display = "none";
    }

    btnCancelar.onclick = () => { salirModoEdicion(); renderOficiales(); };

    btnGuardar.onclick = async () => {
      const datos = {
        fecha: fFecha.getValue(), asunto: inAsunto.value, dependencia: inDependencia.value,
        horario_comision: inHorario.value,
      };
      const editando = editId !== null;
      if (editando) {
        const original = oficiales.find((o) => o.id === editId);
        if (original && original.exportado && !confirm(
          "Esta comisión ya fue exportada en un PDF. Corregirla aquí no actualiza ese PDF ya generado. ¿Continuar?"
        )) return;
      }
      try {
        if (editando) await Api.llamar("oficiales_editar", editId, datos);
        else await Api.llamar("oficiales_registrar", datos);
        Api.mostrarToast(editando ? "Comisión oficial actualizada." : "Comisión oficial guardada.", "success");
        renderOficiales();
      } catch (e) { /* toast ya mostrado */ }
    };

    const tabla = body.querySelector("#tabla-oficiales");
    if (!oficiales.length) {
      tabla.innerHTML = `<div class="empty-hint">Aún no hay comisiones registradas este mes.</div>`;
    } else {
      tabla.innerHTML = `<div style="overflow-x:auto;"><table class="glass-table">
        <thead><tr><th>Fecha</th><th>Asunto</th><th>Dependencia</th><th>Horario</th><th>Exportado</th><th></th></tr></thead>
        <tbody>${oficiales.map((o) => `
          <tr>
            <td>${SmartDate.isoADisplay(o.fecha)}</td><td>${o.asunto}</td><td>${o.dependencia}</td><td>${o.horario_comision}</td>
            <td>${o.exportado ? '<span class="badge badge-ok">Sí</span>' : '<span class="badge badge-muted">No</span>'}</td>
            <td style="display:flex; gap:6px;">
              <button class="btn btn-ghost btn-sm" data-edit="${o.id}">Editar</button>
              <button class="btn btn-ghost btn-sm" data-del="${o.id}">Eliminar</button>
            </td>
          </tr>`).join("")}</tbody>
      </table></div>`;
      tabla.querySelectorAll("[data-edit]").forEach((btn) => {
        btn.onclick = () => {
          const o = oficiales.find((x) => x.id === parseInt(btn.dataset.edit, 10));
          if (o) entrarModoEdicion(o);
        };
      });
      tabla.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          const o = oficiales.find((x) => x.id === parseInt(btn.dataset.del, 10));
          if (o && o.exportado && !confirm(
            "Esta comisión ya fue exportada en un PDF. Eliminarla aquí no actualiza ese PDF ya generado. ¿Continuar?"
          )) return;
          try { await Api.llamar("oficiales_eliminar", parseInt(btn.dataset.del, 10)); renderOficiales(); }
          catch (e) { /* toast ya mostrado */ }
        };
      });
    }
  }

  render();
};

/* ---- js/views/vacaciones.js ---- */
window.Vistas = window.Vistas || {};

const TIPO_ETIQUETA_JS = {
  primero: "Primero (ordinario)", segundo: "Segundo (ordinario)",
  riesgo_alto: "Alto Riesgo (12 días)", riesgo_mediano: "Mediano Riesgo (8 días)", riesgo_bajo: "Bajo Riesgo (5 días)",
  extraordinario: "Extraordinarias",
};
const RIESGO_A_TIPO_JS = { Alto: "riesgo_alto", Mediano: "riesgo_mediano", Bajo: "riesgo_bajo" };
const DIAS_ORDINARIO = 10;

window.Vistas.vacaciones = async function (container) {
  const hoy = new Date();
  let anio = hoy.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Vacaciones e Incidencias</h1>
      <p class="page-subtitle">Periodos ordinarios, de riesgo, extraordinarios y día de cumpleaños/santoral — todo dentro del mismo formato oficial anual.</p>
    </div>
    <div style="display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; margin-bottom:18px;">
      <div style="width:120px;"><label class="field-label">Año</label><div id="sel-anio-vac"></div></div>
      <div style="flex:1; min-width:220px;"><label class="field-label">Autorización Nombre y Firma Jefe Inmediato</label><div id="vac-jefe"></div></div>
      <button class="btn btn-primary" id="vac-exportar">Exportar PDF de ${anio}</button>
    </div>
    <div class="stack" id="vac-body"></div>
  `;

  const opcionesAnios = [];
  for (let y = hoy.getFullYear() - 2; y <= hoy.getFullYear() + 2; y++) opcionesAnios.push({ value: String(y), label: String(y) });
  GlassSelect.crearGlassSelect(container.querySelector("#sel-anio-vac"), {
    opciones: opcionesAnios, valorInicial: String(anio),
    onChange: (v) => {
      anio = parseInt(v, 10);
      container.querySelector("#vac-exportar").textContent = `Exportar PDF de ${anio}`;
      render();
    },
  });

  const inJefe = document.createElement("input");
  inJefe.className = "glass-input";
  inJefe.value = "DRA. CLAUDIA ELIZABETH VÁZQUEZ ROBLEDO";
  container.querySelector("#vac-jefe").appendChild(inJefe);

  container.querySelector("#vac-exportar").onclick = async () => {
    if (!inJefe.value.trim()) { Api.mostrarToast("Ingresa el nombre del jefe inmediato.", "error"); return; }
    try {
      const r = await Api.llamar("exportar_vacaciones", anio, inJefe.value, true);
      if (r.cancelado) return;
      Api.mostrarToast(`PDF generado y abierto: ${r.ruta}`, "success");
      render();
    } catch (e) { /* toast ya mostrado */ }
  };

  const body = container.querySelector("#vac-body");

  async function render() {
    try {
      await pintarVacaciones();
    } catch (e) {
      Api.mostrarErrorVista(body, e.message || "Ocurrió un error inesperado.");
    }
  }

  async function pintarVacaciones() {
    const datos = await Api.llamar("vacaciones_listar", anio);
    body.innerHTML = `
      <div class="glass-card" id="card-ordinarios">
        <h3 class="section-title">Periodos ordinarios (${DIAS_ORDINARIO} días hábiles cada uno — se pueden tomar fraccionados)</h3>
        <div class="stack" id="filas-ordinarios"></div>
      </div>
      <div class="glass-card" id="card-riesgo">
        <h3 class="section-title">Periodo de riesgo</h3>
        <div id="filas-riesgo"></div>
      </div>
      <div class="glass-card" id="card-extra">
        <h3 class="section-title">Periodos extraordinarios</h3>
        <div class="stack" id="filas-extra" style="margin-bottom:12px;"></div>
        <div class="row">
          <div class="field"><label class="field-label">Del</label><div id="ex-inicio"></div></div>
          <div class="field"><label class="field-label">Al</label><div id="ex-fin"></div></div>
        </div>
        <div class="field"><label class="field-label">Motivo / justificación</label><div id="ex-motivo"></div></div>
        <button class="btn btn-primary" id="ex-guardar">Registrar extraordinario</button>
      </div>
      <div class="glass-card" id="card-dia-especial">
        <h3 class="section-title">Día de cumpleaños o santoral</h3>
        <div id="dia-especial-body"></div>
      </div>
    `;

    // ---- Ordinarios (con fraccionamiento) ----
    const filasOrd = body.querySelector("#filas-ordinarios");
    filasOrd.innerHTML = "";
    ["primero", "segundo"].forEach((tipo) => {
      const fragmentos = datos.periodos[tipo] || [];
      const diasUsados = fragmentos.reduce((acc, p) => acc + p.dias_habiles, 0);
      const diasRestantes = DIAS_ORDINARIO - diasUsados;

      const bloque = document.createElement("div");
      bloque.className = "glass-card";
      bloque.style.cssText = "padding:14px 16px; background:var(--row-hover);";

      let filasHtml = `<div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:${fragmentos.length ? "10px" : "0"};">
        <b>${TIPO_ETIQUETA_JS[tipo]}</b>
        <span class="badge ${diasRestantes === 0 ? "badge-ok" : "badge-muted"}">${diasUsados}/${DIAS_ORDINARIO} días usados</span>
      </div>`;
      fragmentos.forEach((p) => {
        filasHtml += `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:6px 0; border-top:1px solid var(--divider);">
          <span style="font-size:13px;">${SmartDate.isoADisplay(p.fecha_inicio)} al ${SmartDate.isoADisplay(p.fecha_fin)} (${p.dias_habiles} días hábiles)</span>
          ${p.exportado ? '<span class="badge badge-ok">Exportado</span>' : `<button class="btn btn-ghost btn-sm" data-del="${p.id}">Eliminar</button>`}
        </div>`;
      });
      bloque.innerHTML = filasHtml;

      if (diasRestantes > 0) {
        const form = document.createElement("div");
        form.style.cssText = "display:flex; align-items:flex-end; gap:8px; flex-wrap:wrap; margin-top:10px; padding-top:10px; border-top:1px solid var(--divider);";
        form.innerHTML = `
          <div><label class="field-label">Del</label><div class="c-inicio" style="width:140px;"></div></div>
          <div><label class="field-label">Al</label><div class="c-fin" style="width:140px;"></div></div>
          <button class="btn btn-primary btn-sm c-registrar">Registrar fragmento</button>`;
        bloque.appendChild(form);

        const campoInicio = SmartDate.crearCampoFecha(form.querySelector(".c-inicio"), {});
        const campoFin = SmartDate.crearCampoFecha(form.querySelector(".c-fin"), {});

        campoInicio.input.addEventListener("blur", async () => {
          const iniIso = campoInicio.getValue();
          if (!iniIso || campoFin.getValue()) return;
          try {
            const sugerido = await Api.llamar("vacaciones_sugerir_fin_ordinario", tipo, anio, iniIso);
            campoFin.setValue(sugerido.fecha_fin);
          } catch (e) { /* si falla, el usuario lo captura a mano */ }
        });

        form.querySelector(".c-registrar").onclick = async () => {
          const ini = campoInicio.getValue(), fin = campoFin.getValue();
          if (!ini || !fin) { Api.mostrarToast("Captura fecha de inicio y fin del fragmento.", "error"); return; }
          try {
            const r = await Api.llamar("vacaciones_registrar_ordinario", tipo, anio, ini, fin);
            Api.mostrarToast(`Fragmento registrado: ${r.dias_habiles} días hábiles. Quedan ${r.dias_restantes}.`, "success");
            render();
          } catch (e) { /* toast ya mostrado */ }
        };
      }

      filasOrd.appendChild(bloque);
      bloque.querySelectorAll("[data-del]").forEach((btn) => {
        btn.onclick = async () => {
          try { await Api.llamar("vacaciones_eliminar_periodo", parseInt(btn.dataset.del, 10)); render(); }
          catch (e) { /* toast ya mostrado */ }
        };
      });
    });

    // ---- Riesgo ----
    const cajaRiesgo = body.querySelector("#filas-riesgo");
    if (datos.nivel_riesgo === "Ninguno" || !datos.nivel_riesgo) {
      cajaRiesgo.innerHTML = `<div class="empty-hint">Configura tu nivel de riesgo (Bajo/Mediano/Alto) en la pestaña Perfil para habilitar esta sección.</div>`;
    } else {
      const tipoRiesgo = RIESGO_A_TIPO_JS[datos.nivel_riesgo];
      const existentes = datos.periodos[tipoRiesgo] || [];
      if (existentes.length) {
        const p = existentes[0];
        cajaRiesgo.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <span><b>${TIPO_ETIQUETA_JS[tipoRiesgo]}:</b> ${SmartDate.isoADisplay(p.fecha_inicio)} al ${SmartDate.isoADisplay(p.fecha_fin)} (${p.dias_habiles} días hábiles)</span>
            ${p.exportado ? '<span class="badge badge-ok">Exportado</span>' : `<button class="btn btn-danger btn-sm" data-del-riesgo="${p.id}">Eliminar</button>`}
          </div>`;
        const btnDel = cajaRiesgo.querySelector("[data-del-riesgo]");
        if (btnDel) btnDel.onclick = async () => {
          try { await Api.llamar("vacaciones_eliminar_periodo", parseInt(btnDel.dataset.delRiesgo, 10)); render(); }
          catch (e) { /* toast ya mostrado */ }
        };
      } else {
        cajaRiesgo.innerHTML = `
          <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
            <b>Nivel ${datos.nivel_riesgo} — Fecha inicio:</b>
            <div id="riesgo-fecha" style="width:150px;"></div>
            <button class="btn btn-primary btn-sm" id="riesgo-registrar">Registrar</button>
          </div>`;
        const campo = SmartDate.crearCampoFecha(cajaRiesgo.querySelector("#riesgo-fecha"), {});
        cajaRiesgo.querySelector("#riesgo-registrar").onclick = async () => {
          const iso = campo.getValue();
          if (!iso) { Api.mostrarToast("Captura una fecha de inicio válida.", "error"); return; }
          try {
            const r = await Api.llamar("vacaciones_registrar_riesgo", anio, iso);
            Api.mostrarToast(`Registrado hasta el ${SmartDate.isoADisplay(r.fecha_fin)} (${r.dias_habiles} días hábiles).`, "success");
            render();
          } catch (e) { /* toast ya mostrado */ }
        };
      }
    }

    // ---- Extraordinarias ----
    const filasExtra = body.querySelector("#filas-extra");
    const extras = datos.periodos.extraordinario || [];
    filasExtra.innerHTML = extras.length ? "" : `<div class="empty-hint">Sin periodos extraordinarios registrados.</div>`;
    extras.forEach((p) => {
      const fila = document.createElement("div");
      fila.className = "glass-card";
      fila.style.cssText = "padding:12px 16px; background:var(--row-hover);";
      fila.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
          <span>${SmartDate.isoADisplay(p.fecha_inicio)} al ${SmartDate.isoADisplay(p.fecha_fin)} (${p.dias_habiles} días hábiles) — ${p.motivo || "sin motivo"}</span>
          ${p.exportado ? '<span class="badge badge-ok">Exportado</span>' : `<button class="btn btn-danger btn-sm" data-del-extra="${p.id}">Eliminar</button>`}
        </div>`;
      filasExtra.appendChild(fila);
      const btnDel = fila.querySelector("[data-del-extra]");
      if (btnDel) btnDel.onclick = async () => {
        try { await Api.llamar("vacaciones_eliminar_periodo", parseInt(btnDel.dataset.delExtra, 10)); render(); }
        catch (e) { /* toast ya mostrado */ }
      };
    });
    const exInicio = SmartDate.crearCampoFecha(body.querySelector("#ex-inicio"), {});
    const exFin = SmartDate.crearCampoFecha(body.querySelector("#ex-fin"), {});
    const exMotivo = document.createElement("input");
    exMotivo.className = "glass-input"; exMotivo.placeholder = "Motivo / justificación";
    body.querySelector("#ex-motivo").appendChild(exMotivo);
    body.querySelector("#ex-guardar").onclick = async () => {
      const ini = exInicio.getValue(), fin = exFin.getValue();
      if (!ini || !fin) { Api.mostrarToast("Captura las fechas de inicio y fin.", "error"); return; }
      try {
        await Api.llamar("vacaciones_registrar_extraordinario", anio, ini, fin, exMotivo.value);
        Api.mostrarToast("Periodo extraordinario registrado.", "success");
        render();
      } catch (e) { /* toast ya mostrado */ }
    };

    // ---- Día especial ----
    const cajaDia = body.querySelector("#dia-especial-body");
    if (!datos.tipo_dia_especial) {
      cajaDia.innerHTML = `<div class="empty-hint">Configura tu elección de cumpleaños/santoral en la pestaña Perfil.</div>`;
    } else {
      let estadoHtml;
      if (datos.dia_especial) {
        estadoHtml = datos.dia_especial.aplico
          ? `Solicitado para ${anio}: ${SmartDate.isoADisplay(datos.dia_especial.fecha_otorgada)}.`
          : `No aplica en ${anio} (cae en fin de semana o festivo oficial).`;
      }
      cajaDia.innerHTML = `
        <div style="margin-bottom:10px;">Tu elección: <b>${datos.tipo_dia_especial}</b>, día ${datos.fecha_dia_especial} (Art. 141 Fracción I CGT).</div>
        ${datos.dia_especial
          ? `<div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
               <span>${estadoHtml}</span>
               ${datos.dia_especial.exportado ? '<span class="badge badge-ok">Exportado</span>' : '<button class="btn btn-danger btn-sm" id="btn-quitar-dia">Quitar solicitud</button>'}
             </div>`
          : `<button class="btn btn-primary btn-sm" id="btn-solicitar-dia">Solicitar día para ${anio}</button>`}
      `;
      const btnSolicitar = cajaDia.querySelector("#btn-solicitar-dia");
      if (btnSolicitar) btnSolicitar.onclick = async () => {
        try {
          const r = await Api.llamar("dia_especial_solicitar", anio);
          Api.mostrarToast(r.aplica ? `Día especial solicitado para el ${SmartDate.isoADisplay(r.fecha)}.` : r.motivo, r.aplica ? "success" : "error");
          render();
        } catch (e) { /* toast ya mostrado */ }
      };
      const btnQuitar = cajaDia.querySelector("#btn-quitar-dia");
      if (btnQuitar) btnQuitar.onclick = async () => {
        try { await Api.llamar("dia_especial_quitar", datos.dia_especial.id); render(); }
        catch (e) { /* toast ya mostrado */ }
      };
    }
  }

  render();
};

/* ---- js/views/exportar.js ---- */
window.Vistas = window.Vistas || {};

function isoLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

window.Vistas.exportar = async function (container) {
  const hoy = new Date();
  let tipo = "Pases";
  let anio = hoy.getFullYear();
  let fechaInicio = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  let fechaFin = isoLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 15));
  let incluirExportados = false;

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Exportar a PDF</h1>
      <p class="page-subtitle">El único dato que se pide aquí es el nombre del jefe inmediato que autoriza. La plantilla oficial no se modifica, solo se llena con tus datos.</p>
    </div>
    <div class="glass-card" style="max-width:560px;">
      <div class="segmented" id="seg-exp-tipo" style="margin-bottom:18px;">
        <button type="button" data-v="Pases">Pases</button>
        <button type="button" data-v="Vacaciones">Vacaciones</button>
      </div>
      <div id="campo-rango" style="margin-bottom:14px;">
        <div class="row" style="margin-bottom:10px;">
          <div class="field"><label class="field-label">Del</label><div id="exp-desde"></div></div>
          <div class="field"><label class="field-label">Al</label><div id="exp-hasta"></div></div>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-ghost btn-sm" id="exp-q1">Quincena 1 (1-15)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="exp-q2">Quincena 2 (16-fin)</button>
          <button type="button" class="btn btn-ghost btn-sm" id="exp-mescompleto">Mes completo</button>
        </div>
        <p style="font-size:11.5px; color:var(--text-secondary); margin-top:8px;">
          El formato oficial es mensual, así que "Del" y "Al" deben caer dentro del mismo mes.
        </p>
      </div>
      <div class="field" id="campo-anio" style="margin-bottom:14px;"><label class="field-label">Año</label><div id="exp-anio"></div></div>
      <div class="empty-hint" id="exp-pendientes" style="margin-bottom:10px;"></div>
      <label style="display:flex; align-items:center; gap:10px; margin-bottom:18px; cursor:pointer; font-size:13px; color:var(--text-secondary);">
        <span class="toggle"><input type="checkbox" id="exp-incluir"><span class="track"><span class="thumb"></span></span></span>
        Incluir ya exportados (para reimprimir)
      </label>
      <div class="field">
        <label class="field-label">Autorización Nombre y Firma Jefe Inmediato</label>
        <div id="exp-jefe"></div>
      </div>
      <button class="btn btn-primary" id="exp-generar" style="margin-top:8px;">Generar PDF</button>
    </div>
  `;

  const opcionesAnios = [];
  for (let y = hoy.getFullYear() - 2; y <= hoy.getFullYear() + 2; y++) opcionesAnios.push({ value: String(y), label: String(y) });

  const fDesde = SmartDate.crearCampoFecha(container.querySelector("#exp-desde"), {
    valorInicial: fechaInicio, onChange: (v) => { fechaInicio = v; actualizarPendientes(); },
  });
  const fHasta = SmartDate.crearCampoFecha(container.querySelector("#exp-hasta"), {
    valorInicial: fechaFin, onChange: (v) => { fechaFin = v; actualizarPendientes(); },
  });
  const selAnio = GlassSelect.crearGlassSelect(container.querySelector("#exp-anio"), {
    opciones: opcionesAnios, valorInicial: String(anio), onChange: (v) => { anio = parseInt(v, 10); actualizarPendientes(); },
  });
  const inJefe = document.createElement("input");
  inJefe.className = "glass-input";
  inJefe.value = "DRA. CLAUDIA ELIZABETH VÁZQUEZ ROBLEDO";
  container.querySelector("#exp-jefe").appendChild(inJefe);

  function aplicarRango(desde, hasta) {
    fechaInicio = isoLocal(desde); fechaFin = isoLocal(hasta);
    fDesde.setValue(fechaInicio); fHasta.setValue(fechaFin);
    actualizarPendientes();
  }
  container.querySelector("#exp-q1").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 1), new Date(base.getFullYear(), base.getMonth(), 15));
  };
  container.querySelector("#exp-q2").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 16), new Date(base.getFullYear(), base.getMonth(), ultimoDia));
  };
  container.querySelector("#exp-mescompleto").onclick = () => {
    const base = fDesde.getValue() ? new Date(fDesde.getValue() + "T00:00:00") : hoy;
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    aplicarRango(new Date(base.getFullYear(), base.getMonth(), 1), new Date(base.getFullYear(), base.getMonth(), ultimoDia));
  };

  function actualizarVisibilidad() {
    container.querySelector("#campo-rango").style.display = tipo === "Pases" ? "" : "none";
    container.querySelector("#campo-anio").style.display = tipo === "Vacaciones" ? "" : "none";
  }
  Segmented.montarSegmented(container.querySelector("#seg-exp-tipo"), {
    valorInicial: tipo,
    onChange: (v) => { tipo = v; actualizarVisibilidad(); actualizarPendientes(); },
  });
  actualizarVisibilidad();

  container.querySelector("#exp-incluir").addEventListener("change", (e) => {
    incluirExportados = e.target.checked; actualizarPendientes();
  });

  async function actualizarPendientes() {
    const el = container.querySelector("#exp-pendientes");
    try {
      if (tipo === "Pases") {
        if (!fechaInicio || !fechaFin) { el.textContent = "Captura un rango de fechas válido."; return; }
        if (fechaFin < fechaInicio) { el.textContent = "La fecha final debe ser posterior a la inicial."; return; }
        if (fechaInicio.slice(0, 7) !== fechaFin.slice(0, 7)) { el.textContent = "El rango debe caer dentro del mismo mes."; return; }
        const [anioIni, mesIni] = fechaInicio.split("-").map(Number);
        const { pases } = await Api.llamar("pases_listar", anioIni, mesIni);
        const oficiales = await Api.llamar("oficiales_listar", anioIni, mesIni);
        const enRango = (f) => f >= fechaInicio && f <= fechaFin;
        const pendPart = pases.filter((p) => enRango(p.fecha) && (incluirExportados || !p.exportado)).length;
        const pendOf = oficiales.filter((o) => enRango(o.fecha) && (incluirExportados || !o.exportado)).length;
        el.textContent = `${pendPart} pase(s) particular(es) y ${pendOf} comisión(es) oficial(es) por exportar en ese rango.`;
      } else {
        const datos = await Api.llamar("vacaciones_listar", anio);
        let n = 0;
        Object.values(datos.periodos).forEach((lista) => { n += incluirExportados ? lista.length : lista.filter((p) => !p.exportado).length; });
        el.textContent = `${n} periodo(s) vacacional(es) por exportar en ${anio}.`;
      }
    } catch (e) {
      el.textContent = "No se pudo consultar lo pendiente por exportar.";
    }
  }
  actualizarPendientes();

  container.querySelector("#exp-generar").onclick = async () => {
    if (!inJefe.value.trim()) { Api.mostrarToast("Ingresa el nombre del jefe inmediato.", "error"); return; }
    if (tipo === "Pases" && (!fechaInicio || !fechaFin)) {
      Api.mostrarToast("Captura un rango de fechas válido.", "error"); return;
    }
    try {
      const r = tipo === "Pases"
        ? await Api.llamar("exportar_pases", fechaInicio, fechaFin, inJefe.value, incluirExportados)
        : await Api.llamar("exportar_vacaciones", anio, inJefe.value, incluirExportados);
      if (r.cancelado) return;
      Api.mostrarToast(`PDF generado y abierto: ${r.ruta}`, "success");
      actualizarPendientes();
    } catch (e) { /* toast ya mostrado */ }
  };
};

/* ---- js/views/festivos.js ---- */
window.Vistas = window.Vistas || {};

window.Vistas.festivos = async function (container) {
  const hoy = new Date();
  let anio = hoy.getFullYear();

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Calendario de Festivos</h1>
      <p class="page-subtitle">Festivos oficiales precargados (Art. 74 LFT), usados para validar el día de cumpleaños/santoral. Puedes agregar festivos adicionales (estatales, etc.).</p>
    </div>
    <div style="margin-bottom:16px; width:120px;" id="fe-anio"></div>
    <div class="glass-card" style="margin-bottom:16px;"><div id="fe-tabla"></div></div>
    <div class="glass-card" style="max-width:560px;">
      <h3 class="section-title">Agregar festivo personalizado</h3>
      <div class="row">
        <div class="field"><label class="field-label">Fecha</label><div id="fe-fecha"></div></div>
        <div class="field"><label class="field-label">Descripción</label><div id="fe-desc"></div></div>
      </div>
      <button class="btn btn-primary" id="fe-agregar">Agregar</button>
    </div>
  `;

  const opcionesAnios = [];
  for (let y = hoy.getFullYear() - 2; y <= hoy.getFullYear() + 2; y++) opcionesAnios.push({ value: String(y), label: String(y) });
  GlassSelect.crearGlassSelect(container.querySelector("#fe-anio"), {
    opciones: opcionesAnios, valorInicial: String(anio), onChange: (v) => { anio = parseInt(v, 10); render(); },
  });

  const campoFecha = SmartDate.crearCampoFecha(container.querySelector("#fe-fecha"), {});
  const inDesc = document.createElement("input");
  inDesc.className = "glass-input"; inDesc.placeholder = "Ej. Puente estatal";
  container.querySelector("#fe-desc").appendChild(inDesc);

  container.querySelector("#fe-agregar").onclick = async () => {
    const iso = campoFecha.getValue();
    if (!iso) { Api.mostrarToast("Captura una fecha válida.", "error"); return; }
    if (!inDesc.value.trim()) { Api.mostrarToast("Escribe una descripción.", "error"); return; }
    try {
      await Api.llamar("festivos_agregar", iso, inDesc.value);
      Api.mostrarToast("Festivo agregado.", "success");
      inDesc.value = "";
      render();
    } catch (e) { /* toast ya mostrado */ }
  };

  async function render() {
    const tabla = container.querySelector("#fe-tabla");
    let festivos;
    try {
      festivos = await Api.llamar("festivos_listar", anio);
    } catch (e) {
      Api.mostrarErrorVista(tabla, e.message || "Ocurrió un error inesperado.");
      return;
    }
    tabla.innerHTML = `<table class="glass-table">
      <thead><tr><th>Fecha</th><th>Descripción</th><th>Origen</th><th></th></tr></thead>
      <tbody>${festivos.map((f) => `
        <tr>
          <td>${SmartDate.isoADisplay(f.fecha)}</td>
          <td>${f.descripcion}</td>
          <td>${f.origen === "oficial" ? '<span class="badge badge-muted">Oficial</span>' : '<span class="badge badge-ok">Personalizado</span>'}</td>
          <td>${f.origen === "oficial" ? "" : `<button class="btn btn-ghost btn-sm" data-del="${f.fecha}">Eliminar</button>`}</td>
        </tr>`).join("")}</tbody>
    </table>`;
    tabla.querySelectorAll("[data-del]").forEach((btn) => {
      btn.onclick = async () => {
        try { await Api.llamar("festivos_eliminar", btn.dataset.del); render(); }
        catch (e) { /* toast ya mostrado */ }
      };
    });
  }
  render();
};

/* ---- js/views/respaldo.js ---- */
window.Vistas = window.Vistas || {};

window.Vistas.respaldo = async function (container) {
  container.innerHTML = `<div class="empty-hint">Cargando…</div>`;
  let ruta;
  try {
    ruta = await Api.llamar("obtener_ruta_bd");
  } catch (e) {
    Api.mostrarErrorVista(container, e.message || "Ocurrió un error inesperado.");
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">Respaldo de Información</h1>
      <p class="page-subtitle">Tu información vive solo en esta computadora. Genera un respaldo periódicamente (por ejemplo, en tu USB o OneDrive) por si formateas el equipo o cambias de máquina.</p>
    </div>
    <div class="glass-card" style="max-width:560px;">
      <div style="font-size:12.5px; color:var(--text-secondary); margin-bottom:20px; word-break:break-all;">
        Base de datos actual:<br>${ruta}
      </div>
      <button class="btn btn-primary" id="rb-generar" style="margin-right:10px;">Generar respaldo (.db)</button>
      <button class="btn btn-ghost" id="rb-restaurar">Restaurar desde un respaldo (.db)</button>
    </div>
  `;

  container.querySelector("#rb-generar").onclick = async () => {
    try {
      const r = await Api.llamar("respaldo_generar");
      if (r.cancelado) return;
      Api.mostrarToast(`Respaldo guardado en: ${r.ruta}`, "success");
    } catch (e) { /* toast ya mostrado */ }
  };

  container.querySelector("#rb-restaurar").onclick = async () => {
    if (!confirm("Esto reemplazará toda la información actual con la del respaldo seleccionado. ¿Deseas continuar?")) return;
    try {
      const r = await Api.llamar("respaldo_restaurar");
      if (r && r.cancelado) return;
      Api.mostrarToast("Información restaurada correctamente.", "success");
    } catch (e) { /* toast ya mostrado */ }
  };
};

/* ---- js/app.js ---- */
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
