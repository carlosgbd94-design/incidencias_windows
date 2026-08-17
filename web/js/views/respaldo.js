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
