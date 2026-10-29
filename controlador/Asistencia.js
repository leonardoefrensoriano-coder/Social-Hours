/* CONTROLADOR DE ASISTENCIA - usa la tabla "registros" que ya existe en la base de datos:
     id_registro, fecha, hora_entrada, hora_salida, estado, id_estudiante,
     id_proyecto, horas_registradas
   Una fila de asistencia = un estudiante en un día (ligada a su proyecto por el nombre del servicio). En "estado" se guarda
   "Asistió" o "No asistió"; las demás filas de "registros" (con otros estados)
   no se tocan ni se muestran aquí.
   - La hora de entrada y de salida se escribe en el formulario "Registrar Alumno"
     (PUT /api/asistencia/horario).
   - La pestaña Asistencia solo marca si asistió o no ese día (PUT /api/asistencia/lote);
     al marcar "Asistió" no se borran las horas que ya tenga ese día. */
const conexion = require("../apis/conexion.js");

const ESTADO_SI = "Asistió";
const ESTADO_NO = "No asistió";

/* Solo cuentan como asistencia las filas con uno de estos dos estados */
const ES_ASISTENCIA = `lower(trim(r.estado)) IN ('asistió','asistio','no asistió','no asistio')`;
const FUE = `lower(trim(r.estado)) IN ('asistió','asistio')`;

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_NIE = /^\d{7,8}$/;
const MAX_REGISTROS = 500;

function fechaValida(f) {
  if (!RE_FECHA.test(f)) return false;
  const d = new Date(f + "T00:00:00Z");
  return !isNaN(d) && d.toISOString().slice(0, 10) === f;
}

function aMinutos(h) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}

/* Columnas ya formateadas (sin problemas de zona horaria en el navegador) */
const COLUMNAS = `trim(e.nie::text) AS nie,
  to_char(r.fecha, 'YYYY-MM-DD') AS fecha,
  to_char(r.hora_entrada, 'HH24:MI') AS hora_entrada,
  to_char(r.hora_salida, 'HH24:MI') AS hora_salida,
  (${FUE}) AS asistio,
  CASE WHEN ${FUE} AND r.hora_entrada IS NOT NULL AND r.hora_salida IS NOT NULL
       THEN ROUND((EXTRACT(EPOCH FROM (r.hora_salida - r.hora_entrada)) / 3600.0)::numeric, 2)::float
       ELSE NULL END AS horas`;

/* Convierte los errores de la base de datos en un aviso claro (solo para el profesor).
   Si es otro tipo de error, se muestra el mensaje real de la base de datos para poder arreglarlo. */
function responderError(res, error, mensajeBase, detalle = false) {
  if (error.code === "23502" && error.column) {
    return res.status(409).json({
      error: `La columna "${error.column}" de la tabla ${error.table || "registros"} no acepta valores vacíos y el sistema no la llena sola. Dime cómo es esa tabla para ajustarlo.`,
    });
  }
  if (error.code === "23514") {
    return res.status(409).json({
      error:
        `La tabla ${error.table || "registros"} rechazó el dato por la regla "${error.constraint}". ${error.detail || ""}`.trim(),
    });
  }
  if (error.code === "23503") {
    return res.status(409).json({
      error:
        `Falta un dato relacionado (regla "${error.constraint}"). ${error.detail || ""}`.trim(),
    });
  }
  console.error(mensajeBase, error);
  return res.status(500).json({
    error: detalle ? `${mensajeBase}: ${error.message}` : mensajeBase,
  });
}

/* GET /api/asistencia?fecha=YYYY-MM-DD  (profesor)
   Devuelve la asistencia de ese día y los NIE que ya tienen cuenta de estudiante
   (la asistencia se guarda por id_estudiante, así que solo se puede marcar a quien tiene cuenta). */
const listarPorFecha = async (req, res) => {
  try {
    const fecha = String(req.query.fecha || "");
    if (!fechaValida(fecha)) {
      return res
        .status(400)
        .json({ error: "Fecha no válida (use AAAA-MM-DD)" });
    }
    const registros = await conexion.query(
      `SELECT ${COLUMNAS}
       FROM registros r
       JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
       WHERE r.fecha = $1 AND ${ES_ASISTENCIA}
       ORDER BY trim(e.nie::text)`,
      [fecha],
    );
    const cuentas = await conexion.query(
      `SELECT DISTINCT trim(nie::text) AS nie FROM estudiantes
       WHERE nie IS NOT NULL AND trim(nie::text) <> ''`,
    );
    res.json({
      registros: registros.rows,
      con_cuenta: cuentas.rows.map((c) => c.nie),
    });
  } catch (error) {
    responderError(res, error, "Error al obtener la asistencia", true);
  }
};

/* UPDATE de la fila de asistencia de ese alumno y día; devuelve cuántas filas cambió */
async function actualizarFila(cliente, idEstudiante, fecha, sets, valores) {
  const n = valores.length;
  const r = await cliente.query(
    `UPDATE registros SET ${sets}
     WHERE id_registro = (
       SELECT r.id_registro FROM registros r
       WHERE r.id_estudiante = $${n + 1} AND r.fecha = $${n + 2} AND ${ES_ASISTENCIA}
       ORDER BY r.id_registro LIMIT 1)`,
    [...valores, idEstudiante, fecha],
  );
  return r.rowCount;
}

/* Proyecto del alumno: se busca en la tabla "proyectos" por nombre.
   - Si viene un servicio (formulario Registrar Alumno) se usa ese.
   - Si no, se toma el servicio que el alumno tiene en su registro de horas
     (si tiene varios separados por coma, el primero que exista como proyecto).
   Devuelve el id_proyecto o null si no hay coincidencia. */
async function idProyecto(db, nie, servicio) {
  let candidatos = [];
  if (servicio && String(servicio).trim()) {
    candidatos = [String(servicio)];
  } else {
    const r = await db.query(
      `SELECT servicio FROM registros_estudiantes
       WHERE trim(nie::text) = $1 AND servicio IS NOT NULL AND trim(servicio) <> ''
       ORDER BY id_registro_estudiante DESC`,
      [nie],
    );
    candidatos = r.rows.flatMap((x) => String(x.servicio).split(","));
  }
  for (const c of candidatos) {
    const nombre = c.trim().toLowerCase();
    if (!nombre) continue;
    const p = await db.query(
      `SELECT id_proyecto FROM proyectos WHERE lower(trim(nombre)) = $1 ORDER BY id_proyecto LIMIT 1`,
      [nombre],
    );
    if (p.rows.length > 0) return p.rows[0].id_proyecto;
  }
  return null;
}

/* La tabla registros exige que el alumno esté inscrito en el proyecto
   (FOREIGN KEY (id_estudiante, id_proyecto) -> estudiantes_proyectos).
   Si todavía no lo está, se inscribe aquí. */
async function asegurarInscripcion(db, idEstudiante, proyecto) {
  if (!proyecto) return;
  await db.query(
    `INSERT INTO estudiantes_proyectos (id_estudiante, id_proyecto)
     SELECT $1::int, $2::int
     WHERE NOT EXISTS (
       SELECT 1 FROM estudiantes_proyectos
       WHERE id_estudiante = $1::int AND id_proyecto = $2::int)`,
    [idEstudiante, proyecto],
  );
}

/* Marca "Asistió" / "No asistió" sin tocar las horas, salvo al marcar falta (se limpian).
   El proyecto solo se completa si la fila no lo tenía. */
async function marcarAsistencia(
  cliente,
  idEstudiante,
  fecha,
  asistio,
  proyecto,
) {
  await asegurarInscripcion(cliente, idEstudiante, proyecto);
  const cambiadas = asistio
    ? await actualizarFila(
        cliente,
        idEstudiante,
        fecha,
        "estado = $1, id_proyecto = COALESCE(id_proyecto, $2)",
        [ESTADO_SI, proyecto],
      )
    : await actualizarFila(
        cliente,
        idEstudiante,
        fecha,
        "estado = $1, hora_entrada = NULL, hora_salida = NULL, horas_registradas = 0, id_proyecto = COALESCE(id_proyecto, $2)",
        [ESTADO_NO, proyecto],
      );
  if (cambiadas === 0) {
    await cliente.query(
      `INSERT INTO registros (fecha, estado, id_estudiante, horas_registradas, id_proyecto)
       VALUES ($1, $2, $3, 0, $4)`,
      [fecha, asistio ? ESTADO_SI : ESTADO_NO, idEstudiante, proyecto],
    );
  }
}

/* Guarda la hora de entrada y salida de ese día (y lo deja como "Asistió") */
async function guardarSesion(
  cliente,
  idEstudiante,
  fecha,
  entrada,
  salida,
  proyecto,
) {
  const horas =
    Math.round(((aMinutos(salida) - aMinutos(entrada)) / 60) * 100) / 100;
  await asegurarInscripcion(cliente, idEstudiante, proyecto);
  const cambiadas = await actualizarFila(
    cliente,
    idEstudiante,
    fecha,
    "hora_entrada = $1, hora_salida = $2, estado = $3, horas_registradas = $4, id_proyecto = COALESCE($5, id_proyecto)",
    [entrada, salida, ESTADO_SI, horas, proyecto],
  );
  if (cambiadas === 0) {
    await cliente.query(
      `INSERT INTO registros (fecha, hora_entrada, hora_salida, estado, id_estudiante, horas_registradas, id_proyecto)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fecha, entrada, salida, ESTADO_SI, idEstudiante, horas, proyecto],
    );
  }
}

/* NIE -> id_estudiante (la asistencia se guarda por id_estudiante) */
async function idsPorNie(cliente, nies) {
  const ids = await cliente.query(
    `SELECT DISTINCT ON (trim(nie::text)) trim(nie::text) AS nie, id_estudiante
     FROM estudiantes
     WHERE trim(nie::text) = ANY($1::text[])
     ORDER BY trim(nie::text), id_estudiante`,
    [nies],
  );
  return new Map(ids.rows.map((r) => [r.nie, r.id_estudiante]));
}

/* PUT /api/asistencia/lote  (profesor)
   Body: { fecha, registros: [{ nie, asistio }] }
   Marca la asistencia del día completa (asistió / no asistió) en una sola transacción. */
const guardarLote = async (req, res) => {
  const { fecha, registros } = req.body || {};
  if (!fechaValida(String(fecha || ""))) {
    return res.status(400).json({ error: "Fecha no válida" });
  }
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ error: "No hay alumnos para guardar" });
  }
  if (registros.length > MAX_REGISTROS) {
    return res
      .status(400)
      .json({ error: `Máximo ${MAX_REGISTROS} alumnos por envío` });
  }

  const limpios = [];
  for (const r of registros) {
    const nie = String((r && r.nie) ?? "").trim();
    if (!RE_NIE.test(nie)) {
      return res.status(400).json({ error: `NIE no válido: "${nie}"` });
    }
    limpios.push({ nie, asistio: r.asistio === true });
  }

  let cliente;
  try {
    cliente = await conexion.connect();
    await cliente.query("BEGIN");
    const idPorNie = await idsPorNie(
      cliente,
      limpios.map((r) => r.nie),
    );

    const sinCuenta = [];
    const sinProyecto = [];
    let guardados = 0;
    for (const r of limpios) {
      const idEstudiante = idPorNie.get(r.nie);
      if (!idEstudiante) {
        sinCuenta.push(r.nie);
        continue;
      }
      const proyecto = await idProyecto(cliente, r.nie, null);
      if (!proyecto) {
        /* Su servicio no existe como proyecto: no se puede ligar el registro */
        sinProyecto.push(r.nie);
        continue;
      }
      await marcarAsistencia(cliente, idEstudiante, fecha, r.asistio, proyecto);
      guardados++;
    }
    await cliente.query("COMMIT");
    res.json({
      message: "Asistencia guardada",
      guardados,
      sin_cuenta: sinCuenta,
      sin_proyecto: sinProyecto,
    });
  } catch (error) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    responderError(res, error, "No se pudo guardar la asistencia", true);
  } finally {
    if (cliente) cliente.release();
  }
};

/* PUT /api/asistencia/horario  (profesor)
   Body: { nie, fecha, hora_entrada, hora_salida }
   Lo usa el formulario "Registrar Alumno": guarda la hora de entrada y de salida del día. */
const guardarHorario = async (req, res) => {
  const {
    fecha,
    hora_entrada: entrada,
    hora_salida: salida,
    servicio,
  } = req.body || {};
  const nie = String((req.body && req.body.nie) ?? "").trim();
  if (!RE_NIE.test(nie)) {
    return res.status(400).json({ error: "NIE no válido" });
  }
  if (!fechaValida(String(fecha || ""))) {
    return res.status(400).json({ error: "Fecha no válida" });
  }
  if (
    !RE_HORA.test(String(entrada || "")) ||
    !RE_HORA.test(String(salida || ""))
  ) {
    return res
      .status(400)
      .json({ error: "Escribe la hora de entrada y la de salida" });
  }
  if (aMinutos(salida) <= aMinutos(entrada)) {
    return res
      .status(400)
      .json({ error: "La salida debe ser después de la entrada" });
  }

  let cliente;
  try {
    cliente = await conexion.connect();
    await cliente.query("BEGIN");
    const idPorNie = await idsPorNie(cliente, [nie]);
    const idEstudiante = idPorNie.get(nie);
    if (!idEstudiante) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({
        error: "Ese alumno aún no tiene cuenta de estudiante",
        sin_cuenta: true,
      });
    }
    const proyecto = await idProyecto(cliente, nie, servicio);
    if (!proyecto) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        error: `no existe un proyecto llamado "${servicio || "(sin servicio)"}" en la tabla proyectos (el servicio debe llamarse igual que el proyecto)`,
        sin_proyecto: true,
      });
    }
    await guardarSesion(
      cliente,
      idEstudiante,
      fecha,
      entrada,
      salida,
      proyecto,
    );
    await cliente.query("COMMIT");
    res.json({ message: "Hora de entrada y salida guardada" });
  } catch (error) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    responderError(
      res,
      error,
      "No se pudo guardar la hora de entrada y salida",
      true,
    );
  } finally {
    if (cliente) cliente.release();
  }
};

/* GET /api/asistencia/mia  (estudiante) - su propia asistencia, de la más nueva a la más vieja */
const mia = async (req, res) => {
  try {
    const r = await conexion.query(
      `SELECT ${COLUMNAS}
       FROM registros r
       JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
       WHERE r.id_estudiante = $1 AND ${ES_ASISTENCIA}
       ORDER BY r.fecha DESC, r.id_registro DESC`,
      [req.usuario.id],
    );
    const registros = r.rows;
    const asistidos = registros.filter((x) => x.asistio);
    const resumen = {
      dias_asistidos: asistidos.length,
      faltas: registros.length - asistidos.length,
      horas:
        Math.round(asistidos.reduce((s, x) => s + (x.horas || 0), 0) * 100) /
        100,
    };
    res.json({ vinculado: true, registros, resumen });
  } catch (error) {
    responderError(res, error, "Error al obtener tu asistencia");
  }
};

/* GET /api/asistencia/dia?fecha=YYYY-MM-DD  (profesor)
   Registros del día: quién asistió ese día, con su grado, servicio, entrada, salida y horas del día.
   Cualquier fecha (hoy o anterior) funciona; cada día arranca vacío porque se filtra por fecha. */
const listarDia = async (req, res) => {
  try {
    const fecha = String(req.query.fecha || "");
    if (!fechaValida(fecha)) {
      return res
        .status(400)
        .json({ error: "Fecha no válida (use AAAA-MM-DD)" });
    }
    const r = await conexion.query(
      `SELECT ${COLUMNAS},
         COALESCE(re.nombre, '') AS nombre,
         COALESCE(re.grado, '') AS grado,
         COALESCE(re.seccion, '') AS seccion,
         COALESCE(p.nombre, re.servicio, '') AS servicio
       FROM registros r
       JOIN estudiantes e ON e.id_estudiante = r.id_estudiante
       LEFT JOIN LATERAL (
         SELECT nombre, grado, seccion, servicio FROM registros_estudiantes x
         WHERE trim(x.nie::text) = trim(e.nie::text)
         ORDER BY x.id_registro_estudiante LIMIT 1
       ) re ON true
       LEFT JOIN proyectos p ON p.id_proyecto = r.id_proyecto
       WHERE r.fecha = $1 AND ${FUE}
       ORDER BY r.hora_entrada NULLS LAST, r.id_registro`,
      [fecha],
    );
    const total = r.rows.reduce((t, x) => t + (x.horas || 0), 0);
    res.json({
      fecha,
      registros: r.rows,
      total_horas: Math.round(total * 100) / 100,
    });
  } catch (error) {
    responderError(res, error, "Error al obtener los registros del día", true);
  }
};

module.exports = {
  listarPorFecha,
  listarDia,
  guardarLote,
  guardarHorario,
  mia,
};
