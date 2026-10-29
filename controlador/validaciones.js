/* controlador de validaciones */

/* controlador de validaciones
   Una validación se puede emitir solo si el estudiante ya completó las horas sociales.
   La meta (150) es la misma que usa registro_estudiante.js para marcar "Completo". */
const conexion = require("../apis/conexion.js");

const META_HORAS = 150;

/* La tabla validaciones solo tenía estado y fecha_validacion. Para saber A QUIÉN
   pertenece cada validación se agregan las columnas nie y horas (una sola vez). */
let columnasListas = false;
async function asegurarColumnas() {
  if (columnasListas) return;
  await conexion.query(
    `ALTER TABLE validaciones
       ADD COLUMN IF NOT EXISTS nie varchar(20),
       ADD COLUMN IF NOT EXISTS horas numeric`,
  );
  columnasListas = true;
}

/* El valor de "estado" depende del tipo de columna: boolean -> true, texto -> "Validado" */
async function valorEstadoValidacion() {
  const r = await conexion.query(
    `SELECT data_type FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'validaciones' AND column_name = 'estado'`,
  );
  return r.rows[0] && r.rows[0].data_type === "boolean" ? true : "Validado";
}

/* Datos del alumno: el nombre sale completo de la tabla estudiantes (se une por NIE);
   si no existe ahí, se usa el nombre del registro */
async function buscarAlumno(nie) {
  const r = await conexion.query(
    `SELECT r.id_registro_estudiante, r.nie, r.grado, r.seccion, r.servicio, r.horas, r.estado,
            COALESCE(NULLIF(trim(e.nombre), ''), r.nombre) AS nombre
     FROM registros_estudiantes r
     LEFT JOIN LATERAL (
       SELECT nombre FROM estudiantes
       WHERE trim(nie::text) = trim(r.nie::text)
         AND nombre IS NOT NULL AND trim(nombre) <> ''
       LIMIT 1
     ) e ON true
     WHERE trim(r.nie::text) = trim($1::text)
     ORDER BY r.id_registro_estudiante
     LIMIT 1`,
    [nie],
  );
  return r.rows[0] || null;
}

function esNieValido(nie) {
  return /^\d{7,8}$/.test(nie);
}

/* GET /api/validaciones/completos
   Estudiantes que ya llegaron a la meta de horas (para el selector de la tarjeta) */
const listarCompletos = async (req, res) => {
  try {
    await asegurarColumnas();
    const r = await conexion.query(
      `SELECT * FROM (
         SELECT DISTINCT ON (trim(r.nie::text))
                trim(r.nie::text) AS nie,
                COALESCE(NULLIF(trim(e.nombre), ''), r.nombre) AS nombre,
                r.grado, r.seccion, r.horas,
                EXISTS (
                  SELECT 1 FROM validaciones v WHERE trim(v.nie::text) = trim(r.nie::text)
                ) AS validado
         FROM registros_estudiantes r
         LEFT JOIN LATERAL (
           SELECT nombre FROM estudiantes
           WHERE trim(nie::text) = trim(r.nie::text)
             AND nombre IS NOT NULL AND trim(nombre) <> ''
           LIMIT 1
         ) e ON true
         WHERE COALESCE(r.horas::numeric, 0) >= $1
         ORDER BY trim(r.nie::text), r.id_registro_estudiante
       ) t
       ORDER BY t.nombre`,
      [META_HORAS],
    );
    res.json(r.rows);
  } catch (error) {
    console.error("Error al listar estudiantes completos:", error);
    res
      .status(500)
      .json({ error: "No se pudo cargar la lista: " + error.message });
  }
};

/* GET /api/validaciones/estudiante/:nie
   Devuelve los datos del alumno y si ya cumplió la meta */
const obtenerEstudiante = async (req, res) => {
  try {
    const nie = String(req.params.nie || "").trim();
    if (!esNieValido(nie)) {
      return res.status(400).json({ error: "El NIE debe tener 7 u 8 dígitos" });
    }
    await asegurarColumnas();
    const alumno = await buscarAlumno(nie);
    if (!alumno) {
      return res
        .status(404)
        .json({ error: "No hay registro de horas para ese NIE" });
    }
    const horas = parseFloat(alumno.horas) || 0;
    const previa = await conexion.query(
      "SELECT fecha_validacion FROM validaciones WHERE trim(nie::text) = $1 ORDER BY fecha_validacion DESC LIMIT 1",
      [nie],
    );
    res.json({
      nombre: alumno.nombre,
      nie: String(alumno.nie).trim(),
      grado: alumno.grado,
      seccion: alumno.seccion,
      servicio: alumno.servicio,
      horas,
      meta: META_HORAS,
      faltan: Math.max(0, META_HORAS - horas),
      completo: horas >= META_HORAS,
      validado: previa.rows.length > 0,
      fecha_validacion: previa.rows[0] ? previa.rows[0].fecha_validacion : null,
    });
  } catch (error) {
    console.error("Error al consultar estudiante para validación:", error);
    res
      .status(500)
      .json({ error: "Error al consultar el estudiante: " + error.message });
  }
};

/* POST /api/validaciones/emitir   body: { nie }
   Solo emite si el alumno completó las horas. Si ya tenía validación, no crea otra
   (así se puede volver a imprimir sin duplicar registros). */
const emitir = async (req, res) => {
  try {
    const nie = String((req.body && req.body.nie) ?? "").trim();
    if (!esNieValido(nie)) {
      return res.status(400).json({ error: "El NIE debe tener 7 u 8 dígitos" });
    }
    await asegurarColumnas();

    const alumno = await buscarAlumno(nie);
    if (!alumno) {
      return res
        .status(404)
        .json({ error: "No hay registro de horas para ese NIE" });
    }

    const horas = parseFloat(alumno.horas) || 0;
    if (horas < META_HORAS) {
      return res.status(400).json({
        error: `Al estudiante le faltan ${META_HORAS - horas} horas para completar las ${META_HORAS}`,
        horas,
        faltan: META_HORAS - horas,
      });
    }

    const previa = await conexion.query(
      "SELECT * FROM validaciones WHERE trim(nie::text) = $1 ORDER BY fecha_validacion DESC LIMIT 1",
      [nie],
    );
    if (previa.rows.length > 0) {
      return res.json({
        message: "El estudiante ya tenía validación",
        yaExistia: true,
        validacion: previa.rows[0],
      });
    }

    const estado = await valorEstadoValidacion();
    const nueva = await conexion.query(
      `INSERT INTO validaciones (estado, fecha_validacion, nie, horas)
       VALUES ($1, CURRENT_DATE, $2, $3) RETURNING *`,
      [estado, nie, horas],
    );
    res.status(201).json({
      message: "Validación registrada",
      yaExistia: false,
      validacion: nueva.rows[0],
    });
  } catch (error) {
    console.error("Error al emitir validación:", error);
    res
      .status(500)
      .json({ error: "Error al emitir la validación: " + error.message });
  }
};

/* GET /api/validaciones/mi-validacion   (sesión de ESTUDIANTE)
   Devuelve los datos de SU validación solo si ya completó las horas.
   Si todavía no las completa, responde completo:false y no manda ningún dato. */
const miValidacion = async (req, res) => {
  try {
    const est = await conexion.query(
      "SELECT nie FROM estudiantes WHERE id_estudiante = $1",
      [req.usuario.id],
    );
    if (est.rows.length === 0) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }

    const nie = String(est.rows[0].nie ?? "").trim();
    if (!nie) return res.json({ vinculado: false, completo: false });

    await asegurarColumnas();
    const alumno = await buscarAlumno(nie);
    const horas = alumno ? parseFloat(alumno.horas) || 0 : 0;
    if (!alumno || horas < META_HORAS) {
      return res.json({ vinculado: true, completo: false });
    }

    const previa = await conexion.query(
      `SELECT to_char(fecha_validacion, 'YYYY-MM-DD') AS fecha
       FROM validaciones WHERE trim(nie::text) = $1
       ORDER BY fecha_validacion DESC LIMIT 1`,
      [nie],
    );

    res.json({
      vinculado: true,
      completo: true,
      nombre: alumno.nombre,
      nie: String(alumno.nie).trim(),
      grado: alumno.grado,
      seccion: alumno.seccion,
      servicio: alumno.servicio,
      horas,
      validado: previa.rows.length > 0,
      fecha_validacion: previa.rows[0] ? previa.rows[0].fecha : null,
    });
  } catch (error) {
    console.error("Error al consultar mi validación:", error);
    res.status(500).json({ error: "Error al consultar tu validación" });
  }
};

module.exports = {
  listarCompletos,
  obtenerEstudiante,
  emitir,
  miValidacion,
  META_HORAS,
};
