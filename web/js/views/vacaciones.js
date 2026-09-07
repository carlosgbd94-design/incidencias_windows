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
  inJefe.value = "Dra. Claudia Elizabeth Vázquez Robledo";
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
