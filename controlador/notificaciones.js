/* controlador de notificaciones
   Cada alerta que se manda por correo a un estudiante se guarda también aquí,
   para que el estudiante vea la MISMA notificación en la sección "Alertas" de su sistema. */
const conexion = require("../apis/conexion.js");

/* La tabla se crea sola la primera vez (no hay que hacer nada en Outerbase) */
let tablaLista = false;
async function asegurarTabla() {
  if (tablaLista) return;
  await conexion.query(`
    CREATE TABLE IF NOT EXISTS notificaciones (
      id_notificacion SERIAL PRIMARY KEY,
      nie varchar(20) NOT NULL,
      tipo varchar(30),
      asunto text,
      mensaje text,
      fecha timestamp NOT NULL DEFAULT now(),
      leida boolean NOT NULL DEFAULT false
    )`);
  await conexion.query(
    "CREATE INDEX IF NOT EXISTS idx_notificaciones_nie ON notificaciones (nie)",
  );
  tablaLista = true;
}

/* Lo usa rutas/profesores.js al enviar una alerta. Nunca lanza error:
   si falla, el correo se envía igual y solo se anota en la consola. */
async function guardarNotificacion({ nie, tipo, asunto, mensaje }) {
  try {
    const nieLimpio = String(nie ?? "").trim();
    if (!nieLimpio) return false;
    await asegurarTabla();
    await conexion.query(
      "INSERT INTO notificaciones (nie, tipo, asunto, mensaje) VALUES ($1, $2, $3, $4)",
      [nieLimpio, tipo || null, asunto || "", mensaje || ""],
    );
    return true;
  } catch (error) {
    console.error("No se pudo guardar la notificación:", error.message);
    return false;
  }
}

/* NIE del estudiante que tiene la sesión abierta */
async function nieDelUsuario(req) {
  const r = await conexion.query(
    "SELECT nie FROM estudiantes WHERE id_estudiante = $1",
    [req.usuario.id],
  );
  const nie = r.rows[0] && r.rows[0].nie;
  return nie ? String(nie).trim() : null;
}

/* GET /api/notificaciones  -> las notificaciones del estudiante (la más nueva primero) */
const misNotificaciones = async (req, res) => {
  try {
    await asegurarTabla();
    const nie = await nieDelUsuario(req);
    if (!nie)
      return res.json({ vinculado: false, notificaciones: [], noLeidas: 0 });

    const r = await conexion.query(
      `SELECT id_notificacion, tipo, asunto, mensaje, leida,
              to_char(fecha, 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha
       FROM notificaciones
       WHERE trim(nie) = $1
       ORDER BY fecha DESC, id_notificacion DESC
       LIMIT 100`,
      [nie],
    );
    res.json({
      vinculado: true,
      notificaciones: r.rows,
      noLeidas: r.rows.filter((n) => !n.leida).length,
    });
  } catch (error) {
    console.error("Error al obtener notificaciones:", error);
    res.status(500).json({ error: "No se pudieron cargar tus alertas" });
  }
};

/* PUT /api/notificaciones/leer-todas */
const leerTodas = async (req, res) => {
  try {
    await asegurarTabla();
    const nie = await nieDelUsuario(req);
    if (!nie) return res.json({ ok: true, marcadas: 0 });
    const r = await conexion.query(
      "UPDATE notificaciones SET leida = true WHERE trim(nie) = $1 AND leida = false",
      [nie],
    );
    res.json({ ok: true, marcadas: r.rowCount });
  } catch (error) {
    console.error("Error al marcar notificaciones:", error);
    res.status(500).json({ error: "No se pudieron marcar las alertas" });
  }
};

/* PUT /api/notificaciones/:id/leer  (solo si la notificación es del estudiante) */
const leerUna = async (req, res) => {
  try {
    await asegurarTabla();
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Alerta no válida" });
    }
    const nie = await nieDelUsuario(req);
    if (!nie) return res.status(404).json({ error: "Alerta no encontrada" });
    const r = await conexion.query(
      "UPDATE notificaciones SET leida = true WHERE id_notificacion = $1 AND trim(nie) = $2",
      [id, nie],
    );
    if (r.rowCount === 0) {
      return res.status(404).json({ error: "Alerta no encontrada" });
    }
    res.json({ ok: true });
  } catch (error) {
    console.error("Error al marcar notificación:", error);
    res.status(500).json({ error: "No se pudo marcar la alerta" });
  }
};

module.exports = { guardarNotificacion, misNotificaciones, leerTodas, leerUna };
