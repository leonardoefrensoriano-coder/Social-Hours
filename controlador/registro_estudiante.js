/*controlador de registro estudiante*/
const conexion = require("../apis/conexion.js");

/* REGISTRO DE NUEVO REGISTRO ESTUDIANTE - POST /api/registro_estudiante/registrar
   Si el NIE ya tiene registro, NO se crea otra fila: se suman las horas a la que ya existe
   y se agrega el servicio si es nuevo (igual que al registrar latas). */
const registrarEstudiante = async (req, res) => {
  try {
    const { nombre, nie, grado, seccion, servicio, horas, estado } = req.body;

    if (
      !nombre ||
      !nie ||
      !grado ||
      !seccion ||
      !servicio ||
      horas === undefined ||
      horas === null ||
      horas === ""
    ) {
      return res.status(400).json({ error: "Todos los campos son requeridos" });
    }

    /* ¿Ya existe este alumno (mismo NIE)? Entonces se actualiza su fila */
    const existente = await conexion.query(
      "SELECT * FROM registros_estudiantes WHERE trim(nie::text) = trim($1::text) ORDER BY id_registro_estudiante LIMIT 1",
      [nie],
    );
    if (existente.rows.length > 0) {
      const actual = existente.rows[0];
      const horasNuevas = parseFloat(horas);
      if (isNaN(horasNuevas)) {
        return res.status(400).json({ error: "Las horas deben ser un número" });
      }
      const totalHoras = (parseFloat(actual.horas) || 0) + horasNuevas;

      let servicioActual = actual.servicio || "";
      if (
        !servicioActual.toLowerCase().includes(String(servicio).toLowerCase())
      ) {
        servicioActual = servicioActual
          ? `${servicioActual}, ${servicio}`
          : servicio;
      }
      const nuevoEstado = totalHoras >= 150 ? "Completo" : actual.estado;

      const actualizado = await conexion.query(
        "UPDATE registros_estudiantes SET horas = $1, servicio = $2, estado = $3 WHERE id_registro_estudiante = $4 RETURNING *",
        [
          totalHoras,
          servicioActual,
          nuevoEstado,
          actual.id_registro_estudiante,
        ],
      );
      return res.json({
        message: "El alumno ya estaba registrado: se sumaron las horas",
        registro: actualizado.rows[0],
        actualizado: true,
        horasNuevas,
      });
    }

    /* Insertar registro estudiante */
    const registro = await conexion.insertarHorasEstudiante(
      nombre,
      nie,
      grado,
      seccion,
      servicio,
      horas,
      parseFloat(horas) >= 150 ? "Completo" : "Incompleto",
    );

    res.status(201).json({
      message: "Registro estudiante insertado exitosamente",
      registro,
    });
  } catch (error) {
    console.error("Error al registrar estudiante:", error);
    res
      .status(500)
      .json({ error: "Error al registrar estudiante: " + error.message });
  }
};

/* VER ALUMNOS DE UN GRADO Y SECCIÓN - GET /api/registro_estudiante/grado/:grado/seccion/:seccion
   Ejemplo: /api/registro_estudiante/grado/2°%20DS/seccion/A
   Devuelve DOS grupos juntos:
   1) los que ya tienen registro de horas (tabla registros_estudiantes, por texto de grado y sección)
   2) los estudiantes asignados a ese grado (estudiantes.id_grado -> grados) que todavía NO
      tienen registro: salen con 0 horas.
   Ignora mayúsculas/minúsculas y trata "º" y "°" como el mismo símbolo */
const obtenerPorGradoSeccion = async (req, res) => {
  try {
    const { grado, seccion } = req.params;

    /* 1) Alumnos con registro de horas.
       Al registrar solo se escribe "Nombre Apellido", pero aquí se muestra el nombre
       completo guardado en la tabla estudiantes (se une por NIE). Si el alumno aún no
       tiene cuenta o no tiene nombre completo, se deja el nombre del registro. */
    const conRegistro = await conexion.query(
      `SELECT r.*, e.nombre AS nombre_completo
       FROM registros_estudiantes r
       LEFT JOIN LATERAL (
         SELECT nombre FROM estudiantes
         WHERE trim(nie::text) = trim(r.nie::text)
           AND nombre IS NOT NULL AND trim(nombre) <> ''
         LIMIT 1
       ) e ON true
       WHERE translate(lower(trim(r.grado)), 'º', '°') = translate(lower(trim($1)), 'º', '°')
         AND lower(trim(r.seccion)) = lower(trim($2))
       ORDER BY COALESCE(e.nombre, r.nombre)`,
      [grado, seccion],
    );
    const lista = conRegistro.rows.map(({ nombre_completo, ...r }) => ({
      ...r,
      nombre: (nombre_completo || "").trim() || r.nombre,
    }));
    const niesConRegistro = new Set(
      lista.map((r) => String(r.nie ?? "").trim()).filter(Boolean),
    );

    /* 2) Estudiantes del grado que aún no tienen registro.
          Si esta parte falla (por ejemplo porque "grados" está vacía) no se rompe lo anterior. */
    try {
      const delGrado = await conexion.query(
        `SELECT e.id_estudiante, e.nombre, e.correo, e.nie
         FROM estudiantes e
         JOIN grados g ON g.id_grado = e.id_grado
         LEFT JOIN secciones s ON s.id_seccion = g.id_seccion
         WHERE translate(lower(trim(g.nombre)), 'º', '°') IN (
                 translate(lower(trim($1)), 'º', '°'),
                 translate(lower(trim($1 || ' ' || $2)), 'º', '°')
               )
           AND (
                 s.nombre IS NULL
                 OR regexp_replace(lower(trim(s.nombre)), '^secci[oó]n\\s*', '') = lower(trim($2))
               )
         ORDER BY e.nombre NULLS LAST, e.correo`,
        [grado, seccion],
      );

      delGrado.rows.forEach((e) => {
        const nie = String(e.nie ?? "").trim();
        if (nie && niesConRegistro.has(nie)) return; /* ya salió arriba */
        lista.push({
          id_registro_estudiante: null,
          nombre: e.nombre || e.correo,
          nie: e.nie ?? "",
          grado,
          seccion,
          servicio: "",
          horas: 0,
          estado: "Incompleto",
          sin_registro: true,
        });
      });
    } catch (error) {
      console.error(
        "No se pudieron leer los estudiantes asignados al grado:",
        error.message,
      );
    }

    res.json(lista);
  } catch (error) {
    console.error("Error al obtener alumnos por grado y sección:", error);
    res.status(500).json({ error: "Error al obtener alumnos del grado" });
  }
};

/* VER TODOS LOS REGISTROS - GET /api/registro_estudiante */
const obtenerTodos = async (req, res) => {
  try {
    const result = await conexion.query(
      "SELECT * FROM registros_estudiantes ORDER BY id_registro_estudiante",
    );
    res.json(result.rows);
  } catch (error) {
    console.error("Error al obtener registros:", error);
    res.status(500).json({ error: "Error al obtener registros" });
  }
};

/* VER UN REGISTRO ESPECÍFICO - GET /api/registro_estudiante/:id */
const obtenerPorId = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await conexion.query(
      "SELECT * FROM registros_estudiantes WHERE id_registro_estudiante = $1",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error al obtener registro:", error);
    res.status(500).json({ error: "Error al obtener registro" });
  }
};

/* ACTUALIZAR REGISTRO - PUT /api/registro_estudiante/:id */
const actualizar = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, nie, grado, seccion, servicio, horas, estado } = req.body;

    const result = await conexion.query(
      "UPDATE registros_estudiantes SET nombre = $1, nie = $2, grado = $3, seccion = $4, servicio = $5, horas = $6, estado = $7 WHERE id_registro_estudiante = $8 RETURNING *",
      [nombre, nie, grado, seccion, servicio, horas, estado, id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Error al actualizar registro:", error);
    res.status(500).json({ error: "Error al actualizar registro" });
  }
};

/* ELIMINAR REGISTRO - DELETE /api/registro_estudiante/:id */
const eliminar = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await conexion.query(
      "DELETE FROM registros_estudiantes WHERE id_registro_estudiante = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    res.json({ message: "Registro eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar registro:", error);
    res.status(500).json({ error: "Error al eliminar registro" });
  }
};

/* ACTUALIZAR HORAS POR NIE - PUT /api/registro_estudiante/actualizar-horas */
const actualizarHorasPorNie = async (req, res) => {
  try {
    const { nie, horasNuevas, servicio } = req.body;

    if (!nie || !horasNuevas) {
      return res
        .status(400)
        .json({ error: "NIE y horas nuevas son requeridos" });
    }

    // Obtener el registro actual
    const result = await conexion.query(
      "SELECT * FROM registros_estudiantes WHERE trim(nie::text) = trim($1::text)",
      [nie],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró un estudiante registrado con ese NIE" });
    }

    const registro = result.rows[0];
    const horasAnteriores = parseFloat(registro.horas) || 0;
    const totalHoras = horasAnteriores + parseFloat(horasNuevas);

    // Actualizar servicio si no incluye el nuevo servicio
    let servicioActual = registro.servicio || "";
    if (
      servicio &&
      !servicioActual.toLowerCase().includes(servicio.toLowerCase())
    ) {
      servicioActual = servicioActual
        ? `${servicioActual}, ${servicio}`
        : servicio;
    }

    // Actualizar estado si completa o supera 150 horas
    const nuevoEstado = totalHoras >= 150 ? "Completo" : registro.estado;

    // Actualizar el registro
    const updateResult = await conexion.query(
      "UPDATE registros_estudiantes SET horas = $1, servicio = $2, estado = $3 WHERE id_registro_estudiante = $4 RETURNING *",
      [
        totalHoras,
        servicioActual,
        nuevoEstado,
        registro.id_registro_estudiante,
      ],
    );

    res.json({
      message: "Horas actualizadas correctamente",
      registro: updateResult.rows[0],
      horasNuevas,
      totalHoras,
    });
  } catch (error) {
    console.error("Error al actualizar horas:", error);
    res
      .status(500)
      .json({ error: "Error al actualizar horas: " + error.message });
  }
};

/* ACTUALIZAR HORAS POR NOMBRE - PUT /api/registro_estudiante/actualizar-horas-nombre */
const actualizarHorasPorNombre = async (req, res) => {
  try {
    const { nombre, horasNuevas, servicio } = req.body;

    console.log("Datos recibidos:", { nombre, horasNuevas, servicio });

    if (!nombre || !horasNuevas) {
      return res
        .status(400)
        .json({ error: "Nombre y horas nuevas son requeridos" });
    }

    /* Búsqueda flexible: sin tildes ni mayúsculas. Se puede escribir
       - el nombre exacto,
       - solo algunas palabras del nombre (ej. "Waldemar Beltran" encuentra
         "Waldemar Antonio Abrego Beltran"),
       - o el NIE (solo números). */
    const norm = (t) =>
      String(t ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();

    const buscado = norm(nombre);
    const result = await conexion.query("SELECT * FROM registros_estudiantes");

    let coincidencias;
    if (/^\d{7,8}$/.test(buscado)) {
      coincidencias = result.rows.filter(
        (reg) => String(reg.nie ?? "").trim() === buscado,
      );
    } else {
      coincidencias = result.rows.filter((reg) => norm(reg.nombre) === buscado);
      if (coincidencias.length === 0) {
        const palabras = buscado.split(" ");
        coincidencias = result.rows.filter((reg) => {
          const delRegistro = norm(reg.nombre).split(" ");
          return palabras.every((p) => delRegistro.includes(p));
        });
      }
    }

    if (coincidencias.length === 0) {
      return res
        .status(404)
        .json({ error: "No se encontró estudiante con ese nombre" });
    }
    if (coincidencias.length > 1) {
      const lista = coincidencias
        .map((r) => `${r.nombre} (NIE ${r.nie})`)
        .join(", ");
      return res.status(409).json({
        error: `Hay varios estudiantes con ese nombre: ${lista}. Escribe más del nombre o usa el NIE.`,
      });
    }

    const registro = coincidencias[0];

    const horasAnteriores = parseFloat(registro.horas) || 0;
    const totalHoras = horasAnteriores + parseFloat(horasNuevas);

    console.log(
      "Horas - Anteriores:",
      horasAnteriores,
      "Nuevas:",
      horasNuevas,
      "Total:",
      totalHoras,
    );

    // Actualizar servicio si no incluye el nuevo servicio
    let servicioActual = registro.servicio || "";
    if (
      servicio &&
      !servicioActual.toLowerCase().includes(servicio.toLowerCase())
    ) {
      servicioActual = servicioActual
        ? `${servicioActual}, ${servicio}`
        : servicio;
    }

    // Actualizar estado si completa o supera 150 horas
    const nuevoEstado = totalHoras >= 150 ? "Completo" : registro.estado;

    console.log("Actualizando registro con:", {
      totalHoras,
      servicioActual,
      nuevoEstado,
    });

    // Actualizar el registro
    const updateResult = await conexion.query(
      "UPDATE registros_estudiantes SET horas = $1, servicio = $2, estado = $3 WHERE id_registro_estudiante = $4 RETURNING *",
      [
        totalHoras,
        servicioActual,
        nuevoEstado,
        registro.id_registro_estudiante,
      ],
    );

    console.log("Registro actualizado:", updateResult.rows[0]);

    res.json({
      message: "Horas actualizadas correctamente",
      registro: updateResult.rows[0],
      horasNuevas,
      totalHoras,
    });
  } catch (error) {
    console.error("Error al actualizar horas:", error);
    res
      .status(500)
      .json({ error: "Error al actualizar horas: " + error.message });
  }
};

module.exports = {
  registrarEstudiante,
  obtenerTodos,
  obtenerPorGradoSeccion,
  obtenerPorId,
  actualizar,
  eliminar,
  actualizarHorasPorNie,
  actualizarHorasPorNombre,
};
