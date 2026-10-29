/* ASISTENCIA (vista del estudiante, estudiantes.html): sus días, entrada, salida y horas */
(function () {
  "use strict";

  const resumen = document.getElementById("resumenAsistencia");
  const tbody = document.getElementById("registroAsistencia");
  if (!tbody) return;

  function esc(v) {
    return String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }

  /* "2026-10-19" -> "19/10/2026" */
  function fechaCorta(f) {
    const [a, m, d] = String(f).split("-");
    return `${d}/${m}/${a}`;
  }

  /* "07:00" -> "7:00 AM", "16:00" -> "4:00 PM" */
  function hora12(h) {
    if (!h) return "—";
    const [hh, mm] = h.split(":").map(Number);
    const sufijo = hh >= 12 ? "PM" : "AM";
    return `${hh % 12 === 0 ? 12 : hh % 12}:${String(mm).padStart(2, "0")} ${sufijo}`;
  }

  function aviso(texto) {
    tbody.innerHTML = `<tr><td colspan="5">${esc(texto)}</td></tr>`;
  }

  async function cargar() {
    let est = null;
    try {
      est = JSON.parse(localStorage.getItem("estudiante"));
    } catch (e) {}
    if (!est || !est.token) return; /* estudiantes.js ya manda al login */

    try {
      const r = await fetch("/api/asistencia/mia", {
        headers: { Authorization: "Bearer " + est.token },
      });
      if (r.status === 401) return;
      const datos = await r.json();
      if (!r.ok) throw new Error(datos.error || "Error al cargar");

      if (!datos.vinculado) {
        return aviso("Tu cuenta aún no está vinculada a un NIE.");
      }
      if (datos.registros.length === 0) {
        return aviso("Todavía no tienes asistencia registrada.");
      }

      resumen.innerHTML = `
        <span class="chipAsistencia">Días asistidos: <b>${datos.resumen.dias_asistidos}</b></span>
        <span class="chipAsistencia">Faltas: <b>${datos.resumen.faltas}</b></span>
        <span class="chipAsistencia">Horas: <b>${datos.resumen.horas}</b></span>`;

      tbody.innerHTML = datos.registros
        .map(
          (x) => `<tr>
            <td>${esc(fechaCorta(x.fecha))}</td>
            <td>${x.asistio ? hora12(x.hora_entrada) : "—"}</td>
            <td>${x.asistio ? hora12(x.hora_salida) : "—"}</td>
            <td>${x.horas == null ? "—" : esc(x.horas) + " h"}</td>
            <td class="${x.asistio ? "asistioSi" : "asistioNo"}">${x.asistio ? "Asistió" : "No asistió"}</td>
          </tr>`,
        )
        .join("");
    } catch (error) {
      console.error("Error al cargar tu asistencia:", error);
      aviso("No se pudo cargar tu asistencia.");
    }
  }

  document.addEventListener("DOMContentLoaded", cargar);
})();
