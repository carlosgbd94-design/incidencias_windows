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
})();
