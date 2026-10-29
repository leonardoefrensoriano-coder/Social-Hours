/* Base de la API apuntando directamente a Express */
const API_BASE = ""; /* misma dirección del servidor que sirve la página */

/* fetch que envía el token de sesión del profesor; si venció, vuelve al login */
async function fetchAuth(url, opciones = {}) {
  let token = "";
  try {
    token = (JSON.parse(localStorage.getItem("profesor")) || {}).token || "";
  } catch (e) {}
  const respuesta = await fetch(url, {
    ...opciones,
    headers: { ...(opciones.headers || {}), Authorization: "Bearer " + token },
  });
  if (respuesta.status === 401) {
    localStorage.removeItem("profesor");
    window.location.href = "login.html";
  }
  return respuesta;
}

/* Evita que un nombre con código (<script>, <img ...>) se ejecute en la página */
function escaparHTML(valor) {
  return String(valor ?? "").replace(
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

// Array global para almacenar los alumnos de la base de datos
let listaAlumnosGlobal = [];

// Equivalencia de conversión (ej: 1 libra de latas = 1 hora social)
const LIBRAS_POR_HORA = 1;

/* ==========================================================================
   1. INICIALIZACIÓN Y EVENTOS DOMCONTENTLOADED */
document.addEventListener("DOMContentLoaded", function () {
  /* Verificar autenticación y cargar datos del usuario */
  const profesorGuardado = localStorage.getItem("profesor");
  if (!profesorGuardado) {
    window.location.href = "login.html";
    return;
  }

  try {
    const profesor = JSON.parse(profesorGuardado);
    const correoProfesor = document.getElementById("correoProfesor");
    const fotoPerfil = document.getElementById("fotoPerfil");

    if (correoProfesor && profesor && profesor.correo) {
      correoProfesor.textContent = profesor.correo;
    }

    /*  Si hay foto de Google se muestra en lugar del icono de usuario */
    const urlFoto = profesor && (profesor.foto || profesor.picture);
    if (fotoPerfil && urlFoto) {
      const iconoPerfil = document.getElementById("iconoPerfil");
      fotoPerfil.onload = () => {
        fotoPerfil.style.display = "inline-block";
        if (iconoPerfil) iconoPerfil.style.display = "none";
      };
      /* Si la foto no carga, se queda el icono de usuario */
      fotoPerfil.onerror = () => {
        fotoPerfil.style.display = "none";
        if (iconoPerfil) iconoPerfil.style.display = "";
      };
      fotoPerfil.src = urlFoto;
    }
  } catch (e) {
    localStorage.removeItem("profesor");
    window.location.href = "login.html";
    return;
  }

  /*  Lógica del Menú Desplegable con Foto de Perfil */
  const btnPerfil = document.getElementById("btnPerfil");
  const menuDesplegable = document.getElementById("menuDesplegable");

  if (btnPerfil && menuDesplegable) {
    btnPerfil.addEventListener("click", (e) => {
      e.stopPropagation(); // Evita que se cierre en el mismo clic
      const abierto = menuDesplegable.classList.toggle("activo");
      btnPerfil.setAttribute("aria-expanded", abierto);
    });

    // Cerrar el menú si se hace clic en cualquier otra parte de la pantalla
    document.addEventListener("click", (e) => {
      if (!menuDesplegable.contains(e.target)) {
        menuDesplegable.classList.remove("activo");
        btnPerfil.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* Modo oscuro: se guarda la preferencia en el navegador */
  const btnModoOscuro = document.getElementById("btnModoOscuro");
  const iconoModo = document.getElementById("iconoModo");

  function aplicarModo(oscuro) {
    document.body.classList.toggle("modo-oscuro", oscuro);
    if (iconoModo) iconoModo.className = oscuro ? "fas fa-sun" : "fas fa-moon";
    if (btnModoOscuro) {
      btnModoOscuro.setAttribute("aria-pressed", oscuro);
      btnModoOscuro.title = oscuro ? "Modo claro" : "Modo oscuro";
    }
  }

  let modoOscuroGuardado = false;
  try {
    modoOscuroGuardado = localStorage.getItem("modoOscuro") === "1";
  } catch (e) {}
  aplicarModo(modoOscuroGuardado);

  if (btnModoOscuro) {
    btnModoOscuro.addEventListener("click", () => {
      const oscuro = !document.body.classList.contains("modo-oscuro");
      aplicarModo(oscuro);
      try {
        localStorage.setItem("modoOscuro", oscuro ? "1" : "0");
      } catch (e) {}
    });
  }

  /* Cerrar sesión */
  const btnCerrarSesion = document.getElementById("btnCerrarSesion");
  if (btnCerrarSesion) {
    btnCerrarSesion.addEventListener("click", () => {
      localStorage.removeItem("profesor");
      window.location.href = "login.html";
    });
  }

  /* Navegación por menú lateral principal */
  const botonesMenu = document.querySelectorAll(".barraElemento");

  mostrarSeccion("Asistencia");

  // Agregar clase active al botón inicial (Validaciones)
  const botonInicial = document.querySelector(
    '.barraElemento[data-target="Asistencia"]',
  );
  if (botonInicial) {
    botonInicial.classList.add("active");
  }

  botonesMenu.forEach(function (boton) {
    boton.addEventListener("click", async function (e) {
      e.preventDefault();

      // Remover clase active de todos los botones
      botonesMenu.forEach(function (b) {
        b.classList.remove("active");
      });

      // Agregar clase active al botón clickeado
      boton.classList.add("active");

      const destino = boton.getAttribute("data-target");
      await mostrarSeccion(destino);
    });
  });

  /* LÓGICA DE GRADOS (Cambio de vista al hacer clic) */
  const gridGrados = document.querySelector("#Grados .grid-tarjetas");
  const btnVolverGrados = document.getElementById("btnVolverGrados");

  if (gridGrados) {
    gridGrados.addEventListener("click", async (e) => {
      const tarjeta = e.target.closest(".tarjeta-grado");
      if (tarjeta) {
        const grado = tarjeta.getAttribute("data-grado");
        const seccion = tarjeta.getAttribute("data-seccion");

        await cargarTablaGrado(grado, seccion);
        mostrarSubvistaGrados("detalle");
      }
    });
  }

  if (btnVolverGrados) {
    btnVolverGrados.addEventListener("click", () => {
      mostrarSubvistaGrados("tarjetas");
    });
  }

  /* LÓGICA DE ALERTAS */
  const btnHorasCompletas = document.getElementById("btnHorasCompletas");
  const btnHorasIncompletas = document.getElementById("btnHorasIncompletas");
  const botonesVolverAlertas = document.querySelectorAll(".btnVolverAlertas");

  if (btnHorasCompletas) {
    btnHorasCompletas.addEventListener("click", async () => {
      await cargarTablaAlertas("completas");
      mostrarSubvistaAlertas("completas");
    });
  }

  if (btnHorasIncompletas) {
    btnHorasIncompletas.addEventListener("click", async () => {
      await cargarTablaAlertas("incompletas");
      mostrarSubvistaAlertas("incompletas");
    });
  }

  botonesVolverAlertas.forEach((btn) => {
    btn.addEventListener("click", () => {
      mostrarSubvistaAlertas("tarjetas");
    });
  });

  /* Formulario registrar alumno - Ya tiene onsubmit en el HTML */
  // const formularioAlumno = document.getElementById("formularioAlumno");
  // if (formularioAlumno) {
  //   formularioAlumno.addEventListener("submit", registrarAlumno);
  // }

  /* Formulario registrar latas */
  const formularioLatas = document.getElementById("formularioLatas");
  if (formularioLatas) {
    formularioLatas.addEventListener("submit", registrarLatas);
  }

  /* Evento para calcular horas en vivo al ingresar peso */
  const inputPeso = document.getElementById("pesoLatas");
  if (inputPeso) {
    inputPeso.addEventListener("input", function () {
      const peso = parseFloat(this.value) || 0;
      const horas = (peso / LIBRAS_POR_HORA).toFixed(1);
      document.getElementById("horasCalculadas").value = `${horas} hrs`;
    });
  }

  /* Modal Añadir Grado */
  const btnAnadir = document.getElementById("btnAnadirGrado");
  const modal = document.getElementById("modalGrado");
  const btnCerrar = document.getElementById("btnCerrarModal");
  const formularioGrado = document.getElementById("formularioGrado");

  if (btnAnadir) {
    btnAnadir.addEventListener("click", () => {
      modal.style.display = "flex";
    });
  }

  if (btnCerrar) {
    btnCerrar.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === modal) modal.style.display = "none";
  });

  if (formularioGrado) {
    formularioGrado.addEventListener("submit", (e) => {
      e.preventDefault();

      const grado = document.getElementById("nombreGrado").value.trim();
      const seccion = document.getElementById("seccionGrado").value.trim();
      const iconoSelect = document.getElementById("iconoGrado");
      const rutaIcono = iconoSelect ? iconoSelect.value : "../img/ABIERTO.png";

      const nuevaTarjeta = document.createElement("div");
      nuevaTarjeta.className = "tarjeta-opcion tarjeta-grado";
      nuevaTarjeta.style.cursor = "pointer";
      nuevaTarjeta.setAttribute("data-grado", grado);
      nuevaTarjeta.setAttribute("data-seccion", seccion);

      nuevaTarjeta.innerHTML = `
        <div class="tarjeta-icono">
          <img src="${rutaIcono}" alt="Grado">
        </div>
        <div class="tarjeta-texto">${grado} "${seccion}"</div>
      `;

      if (gridGrados) gridGrados.appendChild(nuevaTarjeta);

      formularioGrado.reset();
      modal.style.display = "none";
    });
  }

  cargarAlumnos();
});

/*2. NAVEGACIÓN Y VISTAS PRINCIPALES*/

async function mostrarSeccion(id) {
  const secciones = document.querySelectorAll("main section");
  secciones.forEach(function (seccion) {
    if (seccion.id === id) {
      seccion.style.display = "block";
    } else {
      seccion.style.display = "none";
    }
  });

  if (id === "Alertas") mostrarSubvistaAlertas("tarjetas");
  if (id === "Grados") mostrarSubvistaGrados("tarjetas");
  if (id === "Proyectos") await cargarProyectos();
}

/* 3. SECCIÓN: ALUMNOS (CARGA, REGISTRO Y BÚSQUEDA) */

/* La tabla de Alumnos arranca vacía cada día y solo muestra a los alumnos
   registrados hoy (con asistencia hoy, o registrados/latas desde este panel).
   Al escribir en "Buscar registro" se buscan entre TODOS los alumnos. */
function fechaHoyLocal() {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function leerNiesHoy() {
  try {
    const g = JSON.parse(localStorage.getItem("alumnosHoy"));
    if (g && g.fecha === fechaHoyLocal() && Array.isArray(g.nies)) {
      return new Set(g.nies);
    }
  } catch (e) {}
  return new Set();
}

function marcarAlumnoHoy(nie) {
  const nies = leerNiesHoy();
  nies.add(String(nie).trim());
  try {
    localStorage.setItem(
      "alumnosHoy",
      JSON.stringify({ fecha: fechaHoyLocal(), nies: [...nies] }),
    );
  } catch (e) {}
}

function dibujarFilasAlumnos(lista, mensajeVacio) {
  const tbody = document.getElementById("tablaAlumnos");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (lista.length === 0) {
    const fila = document.createElement("tr");
    fila.innerHTML = `<td colspan="7">${escaparHTML(mensajeVacio)}</td>`;
    tbody.appendChild(fila);
    return;
  }

  lista.forEach((registro) => {
    const row = document.createElement("tr");
    const estadoClass =
      registro.estado === "Completo" ? "estado-completo" : "estado-incompleto";
    row.innerHTML = `
      <td>${escaparHTML(registro.nombre)}</td>
      <td>${escaparHTML(registro.nie)}</td>
      <td>${escaparHTML(registro.grado)}</td>
      <td>${escaparHTML(registro.seccion)}</td>
      <td>${escaparHTML(registro.servicio)}</td>
      <td>${escaparHTML(registro.horas)}</td>
      <td class="${estadoClass}">${escaparHTML(registro.estado)}</td>
    `;
    tbody.appendChild(row);
  });
}

/* Botón "Acciones" de cada alumno en la vista de Grados: da a elegir Cambiar o Eliminar */
let listaGradoActual = [];
let gradoVistaActual = null;

document.addEventListener("click", function (e) {
  const boton = e.target.closest("button[data-accion]");
  if (!boton) return;
  accionesAlumno(boton.getAttribute("data-id"));
});

function buscarAlumnoPorId(id) {
  return listaGradoActual.find(
    (a) => String(a.id_registro_estudiante) === String(id),
  );
}

async function recargarVistaGrado() {
  await cargarAlumnos();
  if (gradoVistaActual) {
    await cargarTablaGrado(gradoVistaActual.grado, gradoVistaActual.seccion);
  }
}

async function accionesAlumno(id) {
  const reg = buscarAlumnoPorId(id);
  if (!reg) return;

  const r = await Swal.fire({
    title: "Acciones",
    text: `${reg.nombre} (${reg.nie})`,
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: "Cambiar grado o sección",
    denyButtonText: "Eliminar alumno",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#0623ff",
    denyButtonColor: "#d33",
  });

  if (r.isConfirmed) await cambiarGradoSeccion(id);
  else if (r.isDenied) await eliminarAlumno(id);
}

async function cambiarGradoSeccion(id) {
  let reg = buscarAlumnoPorId(id);
  if (!reg) return;

  /* Se trae el registro original para no sobrescribir su nombre con el nombre completo */
  try {
    const original = await fetchAuth(
      API_BASE + "/api/registro_estudiante/" + encodeURIComponent(id),
    );
    if (original.ok) reg = await original.json();
  } catch (e) {}

  const opciones = (lista, actual) => {
    const valores = [...lista];
    if (actual && !valores.includes(actual)) valores.unshift(actual);
    return valores
      .map(
        (v) =>
          `<option value="${escaparHTML(v)}"${v === actual ? " selected" : ""}>${escaparHTML(v)}</option>`,
      )
      .join("");
  };

  const { isConfirmed, value } = await Swal.fire({
    title: "Cambiar grado o sección",
    html: `
      <p style="margin-bottom:12px">${escaparHTML(reg.nombre)} (${escaparHTML(reg.nie)})</p>
      <select id="swGrado" class="swal2-select" style="display:flex;margin:8px auto">${opciones(["2° DS", "2° G"], reg.grado)}</select>
      <select id="swSeccion" class="swal2-select" style="display:flex;margin:8px auto">${opciones(["A", "B"], reg.seccion)}</select>`,
    showCancelButton: true,
    confirmButtonText: "Guardar",
    cancelButtonText: "Cancelar",
    preConfirm: () => ({
      grado: document.getElementById("swGrado").value,
      seccion: document.getElementById("swSeccion").value,
    }),
  });
  if (!isConfirmed) return;

  if (value.grado === reg.grado && value.seccion === reg.seccion) return;

  try {
    const response = await fetchAuth(
      API_BASE + "/api/registro_estudiante/" + encodeURIComponent(id),
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: reg.nombre,
          nie: reg.nie,
          grado: value.grado,
          seccion: value.seccion,
          servicio: reg.servicio,
          horas: reg.horas,
          estado: reg.estado,
        }),
      },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo guardar");

    await Swal.fire({
      icon: "success",
      title: "Cambio guardado",
      text: `${reg.nombre} ahora está en ${value.grado} ${value.seccion}.`,
      timer: 2000,
      showConfirmButton: false,
    });
    await recargarVistaGrado();
  } catch (error) {
    console.error("Error al cambiar grado/sección:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo cambiar: " + error.message,
    });
  }
}

async function eliminarAlumno(id) {
  const reg = buscarAlumnoPorId(id);
  if (!reg) return;

  const { isConfirmed } = await Swal.fire({
    icon: "warning",
    title: "¿Eliminar alumno?",
    text: `Se eliminará a ${reg.nombre} (${reg.nie}) con sus horas. Esta acción no se puede deshacer.`,
    showCancelButton: true,
    confirmButtonText: "Sí, eliminar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#d33",
  });
  if (!isConfirmed) return;

  try {
    const response = await fetchAuth(
      API_BASE + "/api/registro_estudiante/" + encodeURIComponent(id),
      { method: "DELETE" },
    );
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "No se pudo eliminar");

    await Swal.fire({
      icon: "success",
      title: "Alumno eliminado",
      timer: 1500,
      showConfirmButton: false,
    });
    await recargarVistaGrado();
    if (window.recargarRegistrosDia) window.recargarRegistrosDia();
  } catch (error) {
    console.error("Error al eliminar alumno:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "No se pudo eliminar: " + error.message,
    });
  }
}

function mostrarAlumnosDeHoy() {
  const nies = leerNiesHoy();
  (window.niesAsistieronHoy || []).forEach((n) => nies.add(n));
  const deHoy = listaAlumnosGlobal.filter((a) =>
    nies.has(String(a.nie).trim()),
  );
  dibujarFilasAlumnos(deHoy, "Aún no hay registros de hoy.");
}

async function cargarAlumnos() {
  const tbody = document.getElementById("tablaAlumnos");
  if (!tbody) return;

  try {
    const response = await fetchAuth(API_BASE + "/api/registro_estudiante");
    listaAlumnosGlobal = await response.json();

    /* Alumnos con asistencia hoy (de la tabla registros) */
    window.niesAsistieronHoy = [];
    try {
      const rDia = await fetchAuth(
        API_BASE +
          "/api/asistencia/dia?fecha=" +
          encodeURIComponent(fechaHoyLocal()),
      );
      if (rDia.ok) {
        const dDia = await rDia.json();
        window.niesAsistieronHoy = (dDia.registros || []).map((x) =>
          String(x.nie).trim(),
        );
      }
    } catch (e) {
      console.error("Error al cargar los registros de hoy:", e);
    }

    const campo = document.getElementById("busquedaRegistro");
    if (campo && campo.value.trim() !== "") buscarRegistro();
    else mostrarAlumnosDeHoy();
  } catch (error) {
    console.error("Error al cargar alumnos:", error);
  }

  cargarProyectos();
}

function renderizarTablaAlumnos() {
  const tabla = document.getElementById("tablaAlumnos");
  if (!tabla) return;
  tabla.innerHTML = "";

  listaAlumnosGlobal.forEach((alumno) => {
    agregarFilaAlumno(alumno);
  });
}

function agregarFilaAlumno(registro) {
  const tabla = document.getElementById("tablaAlumnos");
  if (!tabla) return;

  const fila = document.createElement("tr");
  const valores = [
    registro.nombre,
    registro.nie,
    registro.grado,
    registro.seccion,
    registro.servicio,
    registro.horas,
    registro.estado,
  ];

  valores.forEach(function (valor, index) {
    const celda = document.createElement("td");

    if (index === 6) {
      const span = document.createElement("span");
      span.className = obtenerClaseEstado(valor);
      span.textContent = valor ?? "";
      celda.appendChild(span);
    } else {
      celda.textContent = valor ?? "";
    }

    fila.appendChild(celda);
  });

  tabla.appendChild(fila);
}

function abrirFormulario(evento) {
  const panelDia = document.getElementById("registroDia");
  if (panelDia && panelDia.style.display === "block") {
    panelDia.style.display = "none";
    const bd = document.getElementById("btnRegistrosDia");
    if (bd) bd.textContent = "Registros del día";
  }
  const registro = document.getElementById("registro");
  const registroLatas = document.getElementById("registroLatas");
  const boton = evento.target;

  if (registroLatas) registroLatas.style.display = "none";

  if (registro.style.display === "flex") {
    registro.style.display = "none";
    boton.textContent = "Registrar Alumno";
  } else {
    registro.style.display = "flex";
    boton.textContent = "Cerrar Formulario";
  }
}

async function registrarAlumno(e) {
  e.preventDefault();

  /* Solo se pide un nombre y un apellido; se guardan juntos como "Nombre Apellido" */
  const primerNombre = document.getElementById("nombre").value.trim();
  const apellido = document.getElementById("apellido").value.trim();
  const nombre = `${primerNombre} ${apellido}`.replace(/\s+/g, " ").trim();
  const nie = document.getElementById("nie").value.trim();
  const grado = document.getElementById("grado").value.trim();
  const seccion = document.getElementById("seccion").value.trim();
  const servicio = document.getElementById("servicio").value.trim();
  const horas = document.getElementById("horas").value.trim();
  const estado = document.getElementById("estado").value.trim();

  /* Hora de entrada/salida de este servicio (opcionales, van juntas) */
  const valorDe = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : "";
  };
  const horaEntrada = valorDe("horaEntradaRegistro");
  const horaSalida = valorDe("horaSalidaRegistro");
  // Usar fecha actual si se proporcionan horas
  const fechaSesion =
    horaEntrada && horaSalida ? new Date().toISOString().split("T")[0] : "";

  // Validar el NIE: solo números, de 7 u 8 dígitos
  if (!/^\d{7,8}$/.test(nie)) {
    await Swal.fire({
      icon: "error",
      title: "Error en NIE",
      text: "El NIE debe tener 7 u 8 dígitos (solo números)",
    });
    return;
  }

  if (horaEntrada || horaSalida) {
    const problema =
      !horaEntrada || !horaSalida
        ? "Escribe la hora de entrada y también la de salida."
        : horaSalida <= horaEntrada
          ? "La hora de salida debe ser después de la de entrada."
          : "";
    if (problema) {
      await Swal.fire({
        icon: "warning",
        title: "Revisa el horario",
        text: problema,
      });
      return;
    }
  }

  try {
    const response = await fetchAuth(
      API_BASE + "/api/registro_estudiante/registrar",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nombre,
          nie,
          grado,
          seccion,
          servicio,
          horas,
          estado,
        }),
      },
    );

    const data = await response.json();

    if (response.ok) {
      /* Si trae horario, se guarda la entrada y salida en "registros" (no pasa con las latas) */
      let avisoHorario = "";
      if (horaEntrada && horaSalida) {
        try {
          const rh = await fetchAuth(API_BASE + "/api/asistencia/horario", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              nie,
              fecha: fechaSesion,
              hora_entrada: horaEntrada,
              hora_salida: horaSalida,
              servicio,
            }),
          });
          const dh = await rh.json();
          if (!rh.ok)
            avisoHorario = dh.error || "no se pudo guardar el horario";
        } catch (errorHorario) {
          console.error("Error al guardar el horario:", errorHorario);
          avisoHorario = "error de conexión al guardar el horario";
        }
      }

      if (window.recargarRegistrosDia) window.recargarRegistrosDia();

      /* Si el NIE ya existía, el servidor sumó las horas a su fila (no crea otra) */
      const yaExistia = !!data.actualizado;
      const textoBase = yaExistia
        ? `${data.registro.nombre} ya estaba registrado: se sumaron ${horas} horas (total ${data.registro.horas}).`
        : "El registro se ha guardado exitosamente";
      await Swal.fire({
        icon: avisoHorario ? "warning" : "success",
        title: "Registro guardado",
        text: avisoHorario
          ? `${textoBase} Pero la hora de entrada y salida no se guardó: ${avisoHorario}.`
          : horaEntrada && horaSalida
            ? `${textoBase} La hora de entrada y salida también se guardó.`
            : textoBase,
        timer: avisoHorario ? undefined : 2000,
        showConfirmButton: !!avisoHorario,
      });

      e.target.reset();

      const registro = document.getElementById("registro");
      if (registro) registro.style.display = "none";

      const botonRegistrar = document.querySelector(".btnRegistrar");
      if (botonRegistrar) botonRegistrar.textContent = "Registrar Alumno";

      // El alumno queda en la tabla de hoy; se recarga desde la API
      marcarAlumnoHoy(nie);
      await cargarAlumnos();
    } else {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: "Error al guardar: " + data.error,
      });
    }
  } catch (error) {
    console.error("Error al guardar registro:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "Error al guardar registro",
    });
  }
}

/* Abrir/Cerrar formulario de Latas */
function abrirFormularioLatas(evento) {
  const panelDia = document.getElementById("registroDia");
  if (panelDia && panelDia.style.display === "block") {
    panelDia.style.display = "none";
    const bd = document.getElementById("btnRegistrosDia");
    if (bd) bd.textContent = "Registros del día";
  }
  const registroLatas = document.getElementById("registroLatas");
  const registro = document.getElementById("registro");
  const boton = evento.target;

  if (registro) registro.style.display = "none";

  if (registroLatas.style.display === "flex") {
    registroLatas.style.display = "none";
    boton.textContent = "Registrar Latas";
  } else {
    registroLatas.style.display = "flex";
    boton.textContent = "Cerrar Formulario Latas";
  }
}

/* Lógica para registrar horas por Latas buscando por NOMBRE */
async function registrarLatas(e) {
  e.preventDefault();

  const nie = document.getElementById("nieLatas").value.trim();
  const peso = parseFloat(document.getElementById("pesoLatas").value) || 0;
  const horasNuevas = parseFloat((peso / LIBRAS_POR_HORA).toFixed(1));

  if (!/^\d{7,8}$/.test(nie)) {
    await Swal.fire({
      icon: "error",
      title: "Error en NIE",
      text: "El NIE debe tener 7 u 8 dígitos (solo números)",
    });
    return;
  }

  try {
    const response = await fetchAuth(
      API_BASE + "/api/registro_estudiante/actualizar-horas",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          nie,
          horasNuevas,
          servicio: "Reciclaje",
        }),
      },
    );

    const data = await response.json();

    if (response.ok) {
      await Swal.fire({
        icon: "success",
        title: "Horas actualizadas",
        text: `Se agregaron ${data.horasNuevas} hrs a ${escaparHTML(data.registro.nombre)}. Total acumulado: ${data.totalHoras} hrs.`,
        timer: 2000,
        showConfirmButton: false,
      });

      marcarAlumnoHoy(nie);
      e.target.reset();
      document.getElementById("horasCalculadas").value = "";
      document.getElementById("registroLatas").style.display = "none";

      // Recargar la tabla desde la API para asegurar sincronización
      await cargarAlumnos();
    } else {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: data.error || "Error al actualizar horas",
      });
    }
  } catch (error) {
    console.error("Error al actualizar horas:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "Error al actualizar horas",
    });
  }
}

/* Busca entre TODOS los alumnos; con el campo vacío vuelve a la tabla de hoy */
function buscarRegistro() {
  const campo = document.getElementById("busquedaRegistro");
  const busqueda = (campo ? campo.value : "").toLowerCase().trim();

  if (busqueda === "") {
    mostrarAlumnosDeHoy();
    return;
  }

  const encontrados = listaAlumnosGlobal.filter((a) =>
    [a.nombre, a.nie, a.grado, a.seccion, a.servicio, a.horas, a.estado].some(
      (v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(busqueda),
    ),
  );
  dibujarFilasAlumnos(encontrados, "No se encontraron alumnos.");
}

function buscarAlumno() {
  buscarRegistro();
}

/*4. SECCIÓN: GRADOS */

/* Alternar subvistas dentro de Grados */
function mostrarSubvistaGrados(vista) {
  const vistaTarjetas = document.getElementById("vistaTarjetasGrados");
  const vistaDetalle = document.getElementById("vistaDetalleGrado");

  if (!vistaTarjetas || !vistaDetalle) return;

  vistaTarjetas.style.display = vista === "tarjetas" ? "flex" : "none";
  vistaDetalle.style.display = vista === "detalle" ? "block" : "none";
}

/* Llenar tabla de alumnos por Grado y Sección */
async function cargarTablaGrado(gradoTarget, seccionTarget) {
  const titulo = document.getElementById("tituloGradoSeleccionado");
  const tbody = document.getElementById("tablaAlumnosGrado");

  if (titulo)
    titulo.textContent = `Alumnos de ${gradoTarget} "${seccionTarget}"`;
  if (!tbody) return;

  tbody.innerHTML = "";
  gradoVistaActual = { grado: gradoTarget, seccion: seccionTarget };
  listaGradoActual = [];

  try {
    /* La API ya devuelve solo los alumnos de ese grado y sección */
    const response = await fetchAuth(
      `${API_BASE}/api/registro_estudiante/grado/${encodeURIComponent(gradoTarget)}/seccion/${encodeURIComponent(seccionTarget)}`,
    );
    const filtrados = await response.json();

    if (!response.ok || !Array.isArray(filtrados)) {
      throw new Error(filtrados.error || "Respuesta inválida del servidor");
    }

    listaGradoActual = filtrados;
    filtrados.forEach((alumno) => {
      const claseEstado = obtenerClaseEstado(alumno.estado);
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${escaparHTML(alumno.nombre ?? "")}</td>
        <td>${escaparHTML(alumno.nie ?? "")}</td>
        <td>${escaparHTML(alumno.servicio ?? "")}</td>
        <td>${escaparHTML(alumno.horas ?? "0")}</td>
        <td><span class="${claseEstado}">${escaparHTML(alumno.estado ?? "")}</span></td>
        <td class="celdaAcciones">${
          alumno.id_registro_estudiante
            ? `<button type="button" class="btnFila btnFilaAcciones" data-accion="acciones" data-id="${escaparHTML(alumno.id_registro_estudiante)}">Acciones ▾</button>`
            : ""
        }</td>
      `;
      tbody.appendChild(fila);
    });
  } catch (error) {
    console.error("Error al cargar tabla de grado:", error);
  }
}

/* 5. SECCIÓN: ALERTAS */

/* Alternar subvistas en Alertas */
function mostrarSubvistaAlertas(vista) {
  const vistaTarjetas = document.getElementById("vistaTarjetasAlertas");
  const vistaCompletas = document.getElementById("vistaHorasCompletas");
  const vistaIncompletas = document.getElementById("vistaHorasIncompletas");

  if (!vistaTarjetas || !vistaCompletas || !vistaIncompletas) return;

  vistaTarjetas.style.display = vista === "tarjetas" ? "flex" : "none";
  vistaCompletas.style.display = vista === "completas" ? "block" : "none";
  vistaIncompletas.style.display = vista === "incompletas" ? "block" : "none";
}

async function cargarTablaAlertas(tipo) {
  const tbody = document.getElementById(
    tipo === "completas"
      ? "tablaAlumnosCompletados"
      : "tablaAlumnosIncompletos",
  );
  if (!tbody) return;

  tbody.innerHTML = "";

  try {
    const response = await fetchAuth(API_BASE + "/api/registro_estudiante");
    const data = await response.json();

    const filtrados = data.filter((alumno) => {
      const horas = parseFloat(alumno.horas) || 0;

      if (tipo === "completas") {
        return horas >= 150;
      } else {
        return horas < 150;
      }
    });

    listaGradoActual = filtrados;
    filtrados.forEach((alumno) => {
      const claseEstado = obtenerClaseEstado(alumno.estado);
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td><input type="checkbox" class="chkAlerta" data-nie="${escaparHTML(alumno.nie ?? "")}" data-nombre="${escaparHTML(alumno.nombre ?? "")}" checked /></td>
        <td>${escaparHTML(alumno.nombre ?? "")}</td>
        <td>${escaparHTML(alumno.nie ?? "")}</td>
        <td>${escaparHTML(alumno.horas ?? "0")}</td>
        <td>${escaparHTML(alumno.grado ?? "")}</td>
        <td>${escaparHTML(alumno.seccion ?? "")}</td>
        <td><span class="${claseEstado}">${escaparHTML(alumno.estado ?? "")}</span></td>
        <td class="celdaAcciones">${
          alumno.id_registro_estudiante
            ? `<button type="button" class="btnFila btnFilaAcciones" data-accion="acciones" data-id="${escaparHTML(alumno.id_registro_estudiante)}">Acciones ▾</button>`
            : ""
        }</td>
      `;
      tbody.appendChild(fila);
    });

    const marcaTodos = document.querySelector(
      `.chkTodos[data-tabla="${tbody.id}"]`,
    );
    if (marcaTodos) marcaTodos.checked = true;
  } catch (error) {
    console.error("Error al cargar tabla de alertas:", error);
  }
}

/* 6. SECCIÓN: PROYECTOS */

/* Llenar proyectos */
async function cargarProyectos() {
  const tarjetasProyectos = document.querySelectorAll(".tarjeta-proyecto");

  try {
    const response = await fetchAuth(API_BASE + "/api/registro_estudiante");
    const data = await response.json();

    tarjetasProyectos.forEach((tarjeta) => {
      const tituloEl = tarjeta.querySelector(".titulo-proyecto");
      const tbody = tarjeta.querySelector("tbody");

      if (!tituloEl || !tbody) return;

      const nombreProyecto = normalizarTexto(tituloEl.textContent);
      tbody.innerHTML = "";

      const alumnosFiltrados = data.filter((alumno) => {
        const servicioAlumno = normalizarTexto(alumno.servicio);
        return (
          servicioAlumno.includes(nombreProyecto) ||
          nombreProyecto.includes(servicioAlumno)
        );
      });

      // Mostrar solo los primeros 3 en la tarjeta mini
      alumnosFiltrados.slice(0, 3).forEach((alumno) => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
          <td>${escaparHTML(alumno.nombre ?? "")}</td>
          <td>${escaparHTML(alumno.horas ?? "0")}</td>
          <td>${escaparHTML(alumno.grado ?? "")}</td>
          <td>${escaparHTML(alumno.seccion ?? "")}</td>
        `;
        tbody.appendChild(fila);
      });

      // Agregar event listener para abrir modal con todos los estudiantes
      tarjeta.style.cursor = "pointer";
      tarjeta.onclick = () =>
        mostrarModalProyecto(tituloEl.textContent, alumnosFiltrados);
    });
  } catch (error) {
    console.error("Error al cargar proyectos:", error);
  }
}

/* Mostrar modal con todos los estudiantes de un proyecto */
async function mostrarModalProyecto(nombreProyecto, alumnos) {
  let tablaHTML = `
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background-color: #00b4d8; color: white;">
          <th style="padding: 10px; border: 1px solid #ddd;">Estudiante</th>
          <th style="padding: 10px; border: 1px solid #ddd;">Horas</th>
          <th style="padding: 10px; border: 1px solid #ddd;">Grado</th>
          <th style="padding: 10px; border: 1px solid #ddd;">Sección</th>
        </tr>
      </thead>
      <tbody>
  `;

  alumnos.forEach((alumno) => {
    tablaHTML += `
      <tr>
        <td style="padding: 10px; border: 1px solid #ddd;">${escaparHTML(alumno.nombre ?? "")}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escaparHTML(alumno.horas ?? "0")}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escaparHTML(alumno.grado ?? "")}</td>
        <td style="padding: 10px; border: 1px solid #ddd;">${escaparHTML(alumno.seccion ?? "")}</td>
      </tr>
    `;
  });

  tablaHTML += `
      </tbody>
    </table>
  `;

  if (alumnos.length === 0) {
    tablaHTML = "<p>No hay estudiantes registrados en este proyecto.</p>";
  }

  await Swal.fire({
    title: `Estudiantes en ${nombreProyecto}`,
    html: tablaHTML,
    width: "800px",
    showCloseButton: true,
    confirmButtonText: "Cerrar",
    confirmButtonColor: "#00b4d8",
  });
}

/* 7. FUNCIONES AUXILIARES / HELPERS */

/* Helper para normalizar texto */
function normalizarTexto(texto) {
  return (texto || "")
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/* Función helper para obtener la clase CSS según el estado */
function obtenerClaseEstado(estado) {
  return normalizarTexto(estado) === "completo"
    ? "estado-completo"
    : "estado-incompleto";
}

// Función reutilizable para enviar correo mediante la API
async function enviarCorreoAlerta(tipoAlerta) {
  /* Alumnos que el profesor dejó marcados en la tabla de esa alerta */
  const idTabla =
    tipoAlerta === "completas"
      ? "tablaAlumnosCompletados"
      : "tablaAlumnosIncompletos";
  const marcados = [
    ...document.querySelectorAll(`#${idTabla} .chkAlerta:checked`),
  ];

  if (marcados.length === 0) {
    await Swal.fire({
      title: "Nadie marcado",
      text: "Marca al menos un alumno para enviarle la alerta.",
      icon: "warning",
      confirmButtonColor: "#00b4d8",
    });
    return;
  }

  const confirmacion = await Swal.fire({
    title: "¿Enviar alerta?",
    text: `Se enviará un correo a ${marcados.length} alumno(s).`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Sí, enviar",
    cancelButtonText: "Cancelar",
    confirmButtonColor: "#00b4d8",
  });
  if (!confirmacion.isConfirmed) return;

  /* NIE -> nombre, para mostrar a quién no se pudo enviar */
  const nombres = {};
  marcados.forEach((c) => {
    nombres[c.dataset.nie] = c.dataset.nombre;
  });
  const nies = marcados.map((c) => c.dataset.nie).filter(Boolean);
  const nombreDe = (nie) => nombres[nie] || nie;

  // Mostrar alerta de carga
  Swal.fire({
    title: "Enviando alertas...",
    text: "Enviando notificaciones a los correos de los estudiantes",
    allowOutsideClick: false,
    didOpen: () => {
      Swal.showLoading();
    },
  });

  try {
    const response = await fetchAuth(
      API_BASE + "/api/profesores/alertas/enviar-lista",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ tipo: tipoAlerta, nies }),
      },
    );

    const data = await response.json();

    if (response.ok) {
      let texto = `Se enviaron ${data.enviados} correo(s).`;
      if (data.notificados > 0) {
        texto += ` La alerta también aparece en el sistema de ${data.notificados} estudiante(s).`;
      }
      if (data.sinCorreo.length) {
        texto += ` Sin correo registrado (solo la ven en el sistema): ${data.sinCorreo.map(nombreDe).join(", ")}.`;
      }
      if (data.fallidos.length) {
        texto += ` No se pudo enviar a: ${data.fallidos.map(nombreDe).join(", ")}.`;
      }
      const hayProblemas = data.sinCorreo.length || data.fallidos.length;

      Swal.fire({
        title:
          data.enviados > 0
            ? "¡Correos enviados!"
            : data.notificados > 0
              ? "Alerta publicada en el sistema"
              : "No se envió ninguno",
        text: texto,
        icon:
          data.enviados === 0 && !(data.notificados > 0)
            ? "error"
            : hayProblemas || data.enviados === 0
              ? "warning"
              : "success",
        confirmButtonColor: "#00b4d8",
      });
    } else {
      Swal.fire({
        title: "Error",
        text: data.error || "No se pudieron enviar los correos",
        icon: "error",
        confirmButtonColor: "#00b4d8",
      });
    }
  } catch (error) {
    console.error("Error al conectar:", error);
    Swal.fire({
      title: "Error de conexión",
      text: "No se pudo conectar con el servidor local",
      icon: "error",
      confirmButtonColor: "#00b4d8",
    });
  }
}

/* Casillas de las tablas de Alertas: "seleccionar todos" y su estado según las filas */
document.addEventListener("change", (e) => {
  const chk = e.target;
  if (!(chk instanceof HTMLInputElement)) return;

  if (chk.classList.contains("chkTodos")) {
    document
      .querySelectorAll(`#${chk.dataset.tabla} .chkAlerta`)
      .forEach((c) => {
        c.checked = chk.checked;
      });
  } else if (chk.classList.contains("chkAlerta")) {
    const tbody = chk.closest("tbody");
    if (!tbody) return;
    const todos = tbody.querySelectorAll(".chkAlerta");
    const marcados = tbody.querySelectorAll(".chkAlerta:checked");
    const general = document.querySelector(
      `.chkTodos[data-tabla="${tbody.id}"]`,
    );
    if (general) general.checked = todos.length === marcados.length;
  }
});

// Event Listeners para los botones de tu HTML
document.addEventListener("DOMContentLoaded", () => {
  const btnCompletados = document.getElementById("btnEnviarAlertaCompletados");
  const btnIncompletos = document.getElementById("btnEnviarAlertaIncompletos");

  if (btnCompletados) {
    btnCompletados.addEventListener("click", () =>
      enviarCorreoAlerta("completas"),
    );
  }

  if (btnIncompletos) {
    btnIncompletos.addEventListener("click", () =>
      enviarCorreoAlerta("incompletas"),
    );
  }
});

// Función para cargar proyectos
cargarProyectos();

/* Formulario de asistencia manual */
const btnAbrirFormAsistencia = document.getElementById(
  "btnAbrirFormAsistencia",
);
const formularioAsistenciaManual = document.getElementById(
  "formularioAsistenciaManual",
);

if (btnAbrirFormAsistencia) {
  btnAbrirFormAsistencia.addEventListener("click", () => {
    if (formularioAsistenciaManual.style.display === "flex") {
      formularioAsistenciaManual.style.display = "none";
      btnAbrirFormAsistencia.textContent = "Tomar Asistencia";
    } else {
      formularioAsistenciaManual.style.display = "flex";
      // Poner fecha actual por defecto
      const fechaInput = document.getElementById("asistManualFecha");
      if (fechaInput) fechaInput.value = fechaHoyLocal();
      btnAbrirFormAsistencia.textContent = "Cerrar";
    }
  });
}

async function registrarAsistenciaManual(e) {
  e.preventDefault();

  const nombre = document.getElementById("asistManualNombre").value.trim();
  const nie = document.getElementById("asistManualNIE").value.trim();
  const fecha = document.getElementById("asistManualFecha").value;
  const horaEntrada = document.getElementById("asistManualEntrada").value;
  const horaSalida = document.getElementById("asistManualSalida").value;
  const grado = document.getElementById("asistManualGrado").value;
  const seccion = document.getElementById("asistManualSeccion").value;
  const servicio = document.getElementById("asistManualServicio").value;

  // Validar NIE
  if (!/^\d{7,8}$/.test(nie)) {
    await Swal.fire({
      icon: "error",
      title: "Error en NIE",
      text: "El NIE debe tener 7 u 8 dígitos (solo números)",
    });
    return;
  }

  // Validar horas
  if (horaSalida <= horaEntrada) {
    await Swal.fire({
      icon: "warning",
      title: "Horas inválidas",
      text: "La hora de salida debe ser después de la de entrada.",
    });
    return;
  }

  try {
    // Guardar horario en asistencia
    const rh = await fetchAuth(API_BASE + "/api/asistencia/horario", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nie,
        fecha,
        hora_entrada: horaEntrada,
        hora_salida: horaSalida,
        servicio,
      }),
    });

    const dh = await rh.json();

    if (!rh.ok) {
      await Swal.fire({
        icon: "error",
        title: "Error",
        text: dh.error || "Error al guardar el horario",
      });
      return;
    }

    // Guardar en tabla registros
    await fetchAuth(API_BASE + "/api/registro_estudiante/registrar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nombre,
        nie,
        grado,
        seccion,
        servicio,
        horas: "0",
        estado: "Asistencia registrada",
      }),
    });

    await Swal.fire({
      icon: "success",
      title: "Asistencia registrada",
      text: "La asistencia se ha guardado exitosamente.",
      timer: 2000,
      showConfirmButton: false,
    });

    e.target.reset();
    formularioAsistenciaManual.style.display = "none";
    if (btnAbrirFormAsistencia)
      btnAbrirFormAsistencia.textContent = "Tomar Asistencia";

    // Recargar la tabla de Alumnos para mostrar el nuevo registro
    if (window.cargarTablaAlumnos) {
      window.cargarTablaAlumnos();
    }

    // Seleccionar automáticamente la fecha y grado en la sección de Asistencia
    const fechaAsistInput = document.getElementById("asistFecha");
    const gradoAsistSelect = document.getElementById("asistGrado");

    if (fechaAsistInput) {
      fechaAsistInput.value = fecha;
    }

    if (gradoAsistSelect) {
      // Buscar si el grado existe en el select
      let gradoEncontrado = false;
      for (let option of gradoAsistSelect.options) {
        if (option.value === grado) {
          gradoAsistSelect.value = grado;
          gradoEncontrado = true;
          break;
        }
      }

      // Si se encontró el grado, cargar la asistencia
      if (gradoEncontrado && window.cargarAsistencia) {
        window.cargarAsistencia(fecha, grado);
      }
    }
  } catch (error) {
    console.error("Error al registrar asistencia:", error);
    await Swal.fire({
      icon: "error",
      title: "Error",
      text: "Error de conexión al registrar asistencia",
    });
  }
}
/* ---------- VALIDACIÓN DE HORAS SOCIALES ---------- */
const tarjetaValidacion = document.getElementById("tarjetaValidacion");
const selectValidacion = document.getElementById("selectValidacion");
const mensajeValidacion = document.getElementById("mensajeValidacion");
const btnCrearWord = document.getElementById("btnCrearWord");
let datosValidacion = null; /* alumno elegido en el selector */

function fechaLarga(d = new Date()) {
  return d.toLocaleDateString("es-SV", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function limpiarTarjetaValidacion() {
  datosValidacion = null;
  ["valNombre", "valNie", "valHoras", "valFecha", "valServicio"].forEach(
    (id) => (document.getElementById(id).textContent = ""),
  );
  mensajeValidacion.textContent = "";
  btnCrearWord.disabled = true;
}

/* Llena el selector solo con estudiantes que ya completaron las horas */
async function cargarCompletosValidacion(nieSeleccionado) {
  selectValidacion.innerHTML = '<option value="">Cargando...</option>';
  try {
    const r = await fetchAuth(API_BASE + "/api/validaciones/completos");
    const lista = await r.json();
    if (!r.ok) throw new Error(lista.error || "Error al cargar la lista");

    if (lista.length === 0) {
      selectValidacion.innerHTML =
        '<option value="">Aún no hay estudiantes con las horas completas</option>';
      return;
    }
    selectValidacion.innerHTML =
      '<option value="">Selecciona un estudiante...</option>' +
      lista
        .map(
          (e) =>
            `<option value="${escaparHTML(e.nie)}">${escaparHTML(e.nombre)} — ${escaparHTML(e.nie)}${e.validado ? " (ya validado)" : ""}</option>`,
        )
        .join("");
    if (nieSeleccionado) selectValidacion.value = nieSeleccionado;
  } catch (e) {
    selectValidacion.innerHTML =
      '<option value="">No se pudo cargar la lista</option>';
    mensajeValidacion.textContent = e.message;
  }
}

/* Al elegir un estudiante se rellena la tarjeta con sus datos reales */
async function seleccionarEstudianteValidacion() {
  limpiarTarjetaValidacion();
  const nie = selectValidacion.value;
  if (!nie) return;

  try {
    const r = await fetchAuth(
      API_BASE + "/api/validaciones/estudiante/" + encodeURIComponent(nie),
    );
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "No se pudo consultar el estudiante");

    datosValidacion = d;
    document.getElementById("valNombre").textContent = d.nombre;
    document.getElementById("valNie").textContent = d.nie;
    document.getElementById("valHoras").textContent = d.horas + " horas";
    document.getElementById("valServicio").textContent = d.servicio || "";
    document.getElementById("valFecha").textContent = fechaLarga();

    if (d.completo) {
      btnCrearWord.disabled = false;
      mensajeValidacion.textContent = d.validado
        ? "Este estudiante ya tiene validación; puedes volver a descargarla."
        : "";
    } else {
      mensajeValidacion.textContent = `Todavía no cumple: le faltan ${d.faltan} horas.`;
    }
  } catch (e) {
    mensajeValidacion.textContent = e.message;
  }
}

function AbrirTarjeta(tipo) {
  limpiarTarjetaValidacion();
  tarjetaValidacion.style.display = "flex";
  cargarCompletosValidacion();
}

function CerrarTarjeta() {
  tarjetaValidacion.style.display = "none";
}

/* Registra la validación en la base de datos y descarga el documento ya lleno */
async function abrirArchivoWord() {
  if (!datosValidacion || !datosValidacion.completo) return;
  const d = datosValidacion;

  try {
    const r = await fetchAuth(API_BASE + "/api/validaciones/emitir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nie: d.nie }),
    });
    const resp = await r.json();
    if (!r.ok)
      throw new Error(resp.error || "No se pudo registrar la validación");
  } catch (e) {
    await Swal.fire({
      icon: "error",
      title: "No se pudo validar",
      text: e.message,
    });
    return;
  }

  const contenido = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset="utf-8">
      <title>Validación de Horas Sociales</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
        h1 { color: #0623ff; text-align: center; margin-bottom: 30px; }
        .info { margin: 20px 0; }
        .info p { margin: 15px 0; font-size: 16px; }
        .campo { border-bottom: 2px solid #000; display: inline-block; min-width: 200px; padding: 0 10px; }
        .firma { margin-top: 80px; }
      </style>
    </head>
    <body>
      <h1>VALIDACIÓN DE HORAS SOCIALES</h1>
      <div class="info">
        <p><strong>Nombre del estudiante:</strong> <span class="campo">${escaparHTML(d.nombre)}</span></p>
        <p><strong>NIE:</strong> <span class="campo">${escaparHTML(d.nie)}</span></p>
        <p><strong>Horas completadas:</strong> <span class="campo">${escaparHTML(d.horas)}</span></p>
        <p><strong>Fecha de finalización:</strong> <span class="campo">${escaparHTML(fechaLarga())}</span></p>
        <p><strong>Proyecto/Servicio Social:</strong> <span class="campo">${escaparHTML(d.servicio || "")}</span></p>
      </div>
      <div class="firma">
        <p>_________________________</p>
        <p><strong>Firma del Coordinador</strong></p>
        <p>Fecha: <span class="campo"></span></p>
      </div>
      <div style="margin-top: 40px; border-top: 2px solid #000; padding-top: 20px;">
        <p>Este documento certifica que el estudiante ha completado satisfactoriamente sus horas sociales.</p>
      </div>
    </body>
    </html>`;

  const blob = new Blob(["\ufeff", contenido], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Validacion_Horas_Sociales_" + d.nie + ".doc";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  /* refresca la lista para que salga marcado "(ya validado)" */
  cargarCompletosValidacion(d.nie);
}

// Event Listeners para la tarjeta de validación
document
  .getElementById("btnCerrarTarjeta")
  .addEventListener("click", CerrarTarjeta);
document
  .getElementById("btnCrearWord")
  .addEventListener("click", abrirArchivoWord);
selectValidacion.addEventListener("change", seleccionarEstudianteValidacion);
/* Cerrar la ventana al hacer clic fuera del documento o con Esc */
tarjetaValidacion.addEventListener("click", (e) => {
  if (e.target === tarjetaValidacion) CerrarTarjeta();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") CerrarTarjeta();
});

/* ---------- FORMULARIOS EMERGENTES en teléfonos y tablets ----------
   Registrar Alumno, Registrar Latas y Tomar Asistencia se abren como ventana emergente
   (el diseño lo hace el CSS). En computadora se quedan como siempre. */
(function () {
  const consulta = window.matchMedia(
    "(max-width: 1024px), (hover: none) and (pointer: coarse)",
  );
  const esEmergente = () => consulta.matches;

  /* Cierra el formulario y deja el botón que lo abre con su texto de siempre */
  const BOTONES = {
    registro: [
      '.btnRegistrar[onclick^="abrirFormulario("]',
      "Registrar Alumno",
    ],
    registroLatas: [
      '.btnRegistrar[onclick^="abrirFormularioLatas("]',
      "Registrar Latas",
    ],
    formularioAsistenciaManual: ["#btnAbrirFormAsistencia", "Tomar Asistencia"],
  };
  function cerrarFormularioEmergente(contenedor) {
    contenedor.style.display = "none";
    const datos = BOTONES[contenedor.id];
    if (!datos) return;
    const boton = document.querySelector(datos[0]);
    if (boton) boton.textContent = datos[1];
  }

  document.querySelectorAll(".sistemaRegistro").forEach((contenedor) => {
    const form = contenedor.querySelector("form");
    if (!form || form.querySelector(".cerrarFormularioEmergente")) return;

    /* Botón X (solo se ve en teléfono y tablet) */
    const x = document.createElement("button");
    x.type = "button";
    x.className = "cerrarFormularioEmergente";
    x.setAttribute("aria-label", "Cerrar formulario");
    x.innerHTML = "&times;";
    x.addEventListener("click", () => cerrarFormularioEmergente(contenedor));
    form.insertBefore(x, form.firstChild);

    /* Clic en el fondo oscuro, fuera del formulario */
    contenedor.addEventListener("click", (e) => {
      if (e.target === contenedor && esEmergente()) {
        cerrarFormularioEmergente(contenedor);
      }
    });
  });

  /* Tecla Esc (tablets con teclado) */
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !esEmergente()) return;
    document.querySelectorAll(".sistemaRegistro").forEach((c) => {
      if (c.style.display === "flex") cerrarFormularioEmergente(c);
    });
  });
})();
