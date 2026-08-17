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

function mostrarToast(mensaje, tipo = "success") {
  const host = document.getElementById("toast-host");
  const el = document.createElement("div");
  el.className = `toast ${tipo}`;
  el.textContent = mensaje;
  host.appendChild(el);
  setTimeout(() => {
    el.style.transition = "opacity .3s, transform .3s";
    el.style.opacity = "0";
    el.style.transform = "translateY(6px) scale(.97)";
    setTimeout(() => el.remove(), 320);
  }, 3400);
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

window.Api = { llamar, mostrarToast, mostrarErrorVista };
