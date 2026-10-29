/* CONTROLADOR DE ESTUDIANTES - registro, login y gestión */
const conexion = require("../apis/conexion.js");
const {
  hashContrasena,
  verificarContrasena,
  limpiarUsuario,
  crearToken,
  normalizarCorreo,
  nieDeCorreo,
} = require("./seguridad.js");

function datosSesion(estudiante, extra = {}) {
  return {
    ...limpiarUsuario(estudiante),
    ...extra,
    token: crearToken(estudiante.id_estudiante, "estudiante"),
  };
}

/* REGISTRO - POST /api/estudiantes/registrar
   Solo correos de estudiante: NIE de 7 dígitos + @clases.edu.sv.
   El NIE se toma del correo, así sus horas quedan vinculadas desde el inicio. */
const registrarEstudiante = async (req, res) => {
  try {
    const correo = normalizarCorreo(req.body.correo);
    const { contraseña } = req.body;
    if (!correo || !contraseña) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son requeridos" });
    }

    const nie = nieDeCorreo(correo);
    if (!nie) {
      return res.status(400).json({
        error:
          "Los estudiantes deben registrarse con su correo institucional: NIE de 7 dígitos + @clases.edu.sv (ej. 4658411@clases.edu.sv)",
      });
    }

    const existe = await conexion.query(
      "SELECT 1 FROM estudiantes WHERE lower(trim(correo)) = $1 OR trim(nie::text) = $2",
      [correo, nie],
    );
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const result = await conexion.query(
      "INSERT INTO estudiantes (correo, contraseña, nie) VALUES ($1, $2, $3) RETURNING *",
      [correo, hashContrasena(contraseña), nie],
    );
    const estudiante = result.rows[0];

    res.status(201).json({
      message: "Estudiante registrado exitosamente",
      estudiante: datosSesion(estudiante),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }
    console.error("Error al registrar estudiante:", error);
    res.status(500).json({ error: "Error al registrar estudiante" });
  }
};

/* LOGIN - POST /api/estudiantes/login */
const loginEstudiante = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;
    if (!correo || !contraseña) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son requeridos" });
    }

    /* Se puede entrar con el correo o con el NIE */
    const result = await conexion.query(
      `SELECT * FROM estudiantes
       WHERE lower(trim(correo)) = lower(trim($1)) OR trim(nie::text) = trim($1)
       ORDER BY (lower(trim(correo)) = lower(trim($1))) DESC
       LIMIT 1`,
      [correo],
    );
    const estudiante = result.rows[0];
    const v = estudiante
      ? verificarContrasena(contraseña, estudiante.contraseña)
      : { ok: false };

    if (!v.ok) return res.status(401).json({ error: "Credenciales inválidas" });

    if (v.actualizar) {
      try {
        await conexion.query(
          "UPDATE estudiantes SET contraseña = $1 WHERE id_estudiante = $2",
          [v.actualizar, estudiante.id_estudiante],
        );
      } catch (e) {
        console.error("No se pudo cifrar la contraseña:", e.message);
      }
    }

    res.json({ message: "Login exitoso", estudiante: datosSesion(estudiante) });
  } catch (error) {
    console.error("Error al hacer login:", error);
    res.status(500).json({ error: "Error al hacer login" });
  }
};

/* LISTA - GET /api/estudiantes (solo profesores) */
const obtenerTodos = async (req, res) => {
  try {
    const result = await conexion.query(
      "SELECT * FROM estudiantes ORDER BY id_estudiante",
    );
    res.json(result.rows.map(limpiarUsuario));
  } catch (error) {
    console.error("Error al obtener estudiantes:", error);
    res.status(500).json({ error: "Error al obtener estudiantes" });
  }
};

/* Un estudiante solo puede tocar su propia cuenta; un profesor puede con todas */
function puedeAcceder(req) {
  return (
    req.usuario.rol === "profesor" ||
    String(req.usuario.id) === String(req.params.id)
  );
}

/* UNO - GET /api/estudiantes/:id */
const obtenerPorId = async (req, res) => {
  try {
    if (!puedeAcceder(req))
      return res.status(403).json({ error: "No tienes permiso para esto" });
    const result = await conexion.query(
      "SELECT * FROM estudiantes WHERE id_estudiante = $1",
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    res.json(limpiarUsuario(result.rows[0]));
  } catch (error) {
    console.error("Error al obtener estudiante:", error);
    res.status(500).json({ error: "Error al obtener estudiante" });
  }
};

/* ACTUALIZAR - PUT /api/estudiantes/:id (solo cambia lo que se envía)
   El estudiante puede cambiar correo, contraseña, nombre y teléfono.
   Solo un profesor puede cambiar nie e id_grado (es lo que vincula al
   estudiante con sus horas). */
const actualizar = async (req, res) => {
  try {
    if (!puedeAcceder(req))
      return res.status(403).json({ error: "No tienes permiso para esto" });

    const esProfesor = req.usuario.rol === "profesor";
    const permitidos = ["correo", "nombre", "telefono"];
    if (esProfesor) permitidos.push("nie", "id_grado");

    const sets = [];
    const valores = [];
    permitidos.forEach((c) => {
      if (req.body[c] !== undefined) {
        valores.push(req.body[c]);
        sets.push(`"${c}" = $${valores.length}`);
      }
    });
    if (req.body.contraseña) {
      valores.push(hashContrasena(req.body.contraseña));
      sets.push(`"contraseña" = $${valores.length}`);
    }
    if (sets.length === 0)
      return res
        .status(400)
        .json({ error: "No hay campos válidos para actualizar" });

    valores.push(req.params.id);
    const result = await conexion.query(
      `UPDATE estudiantes SET ${sets.join(", ")} WHERE id_estudiante = $${valores.length} RETURNING *`,
      valores,
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    res.json(limpiarUsuario(result.rows[0]));
  } catch (error) {
    console.error("Error al actualizar estudiante:", error);
    res.status(500).json({ error: "Error al actualizar estudiante" });
  }
};

/* ELIMINAR - DELETE /api/estudiantes/:id (solo profesores) */
const eliminar = async (req, res) => {
  try {
    const result = await conexion.query(
      "DELETE FROM estudiantes WHERE id_estudiante = $1 RETURNING id_estudiante",
      [req.params.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Estudiante no encontrado" });
    }
    res.json({ message: "Estudiante eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar estudiante:", error);
    res.status(500).json({ error: "Error al eliminar estudiante" });
  }
};

/* MIS HORAS - GET /api/estudiantes/mis-horas
   Busca en registros_estudiantes las filas con el mismo NIE del estudiante. */
const misHoras = async (req, res) => {
  try {
    const est = await conexion.query(
      "SELECT nie FROM estudiantes WHERE id_estudiante = $1",
      [req.usuario.id],
    );
    if (est.rows.length === 0)
      return res.status(404).json({ error: "Estudiante no encontrado" });

    const nie = est.rows[0].nie;
    if (!nie) return res.json({ vinculado: false, registros: [] });

    const result = await conexion.query(
      "SELECT * FROM registros_estudiantes WHERE trim(nie::text) = trim($1::text) ORDER BY id_registro_estudiante",
      [nie],
    );
    /* Historial por día: una fila por cada día que el estudiante asistió (tabla registros) */
    let dias = [];
    try {
      const d = await conexion.query(
        `SELECT to_char(r.fecha, 'YYYY-MM-DD') AS fecha,
                to_char(r.hora_entrada, 'HH24:MI') AS hora_entrada,
                to_char(r.hora_salida, 'HH24:MI') AS hora_salida,
                COALESCE(
                  r.horas_registradas,
                  CASE WHEN r.hora_entrada IS NOT NULL AND r.hora_salida IS NOT NULL
                       THEN ROUND((EXTRACT(EPOCH FROM (r.hora_salida - r.hora_entrada)) / 3600.0)::numeric, 2)
                       ELSE 0 END
                )::float AS horas,
                COALESCE(p.nombre, '') AS servicio
         FROM registros r
         LEFT JOIN proyectos p ON p.id_proyecto = r.id_proyecto
         WHERE r.id_estudiante = $1
           AND lower(trim(r.estado)) IN ('asistió','asistio')
         ORDER BY r.fecha DESC, r.id_registro DESC`,
        [req.usuario.id],
      );
      dias = d.rows;
    } catch (e) {
      console.error("Error al obtener el historial por día:", e);
    }

    res.json({ vinculado: true, nie, registros: result.rows, dias });
  } catch (error) {
    console.error("Error al obtener mis horas:", error);
    res.status(500).json({ error: "Error al obtener tus horas" });
  }
};

/* LOGIN CON GOOGLE - POST /api/estudiantes/google (crea la cuenta de estudiante si no existe) */
const loginGoogle = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "El token de Google es requerido" });
    }

    const googleRes = await fetch(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!googleRes.ok) {
      return res.status(401).json({ error: "Token de Google inválido" });
    }

    const { email, picture, email_verified } = await googleRes.json();
    if (!email || email_verified === false) {
      return res.status(401).json({ error: "Correo de Google no verificado" });
    }

    const buscar = await conexion.query(
      "SELECT * FROM estudiantes WHERE lower(correo) = lower($1)",
      [email],
    );

    let estudiante;
    if (buscar.rows.length === 0) {
      /* Solo se crea cuenta de estudiante con correo NIE@clases.edu.sv */
      const nie = nieDeCorreo(email);
      if (!nie) {
        return res.status(403).json({
          error:
            "Los estudiantes deben entrar con su correo institucional (NIE@clases.edu.sv)",
        });
      }
      const nuevo = await conexion.query(
        "INSERT INTO estudiantes (correo, contraseña, nie) VALUES ($1, $2, $3) RETURNING *",
        [normalizarCorreo(email), "GOOGLE_OAUTH_USER", nie],
      );
      estudiante = nuevo.rows[0];
    } else {
      estudiante = buscar.rows[0];
    }

    return res.status(200).json({
      message: "Autenticación con Google exitosa",
      estudiante: datosSesion(estudiante, { foto: picture || null }),
    });
  } catch (error) {
    console.error("Error en loginGoogle:", error);
    return res
      .status(500)
      .json({ error: "Error de servidor al autenticar con Google" });
  }
};

module.exports = {
  registrarEstudiante,
  loginEstudiante,
  obtenerTodos,
  obtenerPorId,
  actualizar,
  eliminar,
  misHoras,
  loginGoogle,
};
