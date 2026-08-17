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
