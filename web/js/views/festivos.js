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
