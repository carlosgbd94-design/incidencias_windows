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
  el.append(badge, texto);
  host.appendChild(el);
  const duracion = tipo === "update" ? 9000 : 3400;
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(.97)";
    setTimeout(() => el.remove(), 320);
  }, duracion);
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
    const textoOriginal = texto.textContent;
    badge.disabled = true;
    texto.textContent = "Actualizando…";
    try {
      // Si funciona, la ventana se cierra sola desde Python (dispara el
      // cierre normal, que instala y sale) -- no hay nada más que hacer
      // aquí en el caso exitoso.
      await llamar("actualizar_ahora");
    } catch (e) {
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
