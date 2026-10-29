/* CONTROLADOR DE PROFESORES - login, registro y lista */
const conexion = require("../apis/conexion.js");
const {
  hashContrasena,
  verificarContrasena,
  limpiarUsuario,
  crearToken,
  normalizarCorreo,
  nieDeCorreo,
  RE_CORREO_VALIDO,
} = require("./seguridad.js");

/* Datos que se envían al navegador: sin contraseña y con el token de sesión */
function datosSesion(profesor, extra = {}) {
  return {
    ...limpiarUsuario(profesor),
    ...extra,
    token: crearToken(profesor.id_profesor, "profesor"),
  };
}

/* LOGIN - POST /api/profesores/login */
const loginProfesor = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;
    if (!correo || !contraseña) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son requeridos" });
    }

    const result = await conexion.query(
      "SELECT * FROM profesores WHERE lower(trim(correo)) = lower(trim($1))",
      [correo],
    );
    const profesor = result.rows[0];
    const v = profesor
      ? verificarContrasena(contraseña, profesor.contraseña)
      : { ok: false };

    if (!v.ok) return res.status(401).json({ error: "Credenciales inválidas" });

    /* Si estaba en texto plano, se guarda cifrada la primera vez que entra */
    if (v.actualizar) {
      try {
        await conexion.query(
          "UPDATE profesores SET contraseña = $1 WHERE id_profesor = $2",
          [v.actualizar, profesor.id_profesor],
        );
      } catch (e) {
        console.error(
          "No se pudo cifrar la contraseña del profesor:",
          e.message,
        );
      }
    }

    res.json({ message: "Login exitoso", profesor: datosSesion(profesor) });
  } catch (error) {
    console.error("Error al hacer login:", error);
    res.status(500).json({ error: "Error al hacer login" });
  }
};

/* REGISTRO - POST /api/profesores/registrar (solo un profesor con sesión puede crear otro) */
const registrarProfesor = async (req, res) => {
  try {
    const { correo, contraseña } = req.body;
    if (!correo || !contraseña) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son requeridos" });
    }

    const existe = await conexion.query(
      "SELECT 1 FROM profesores WHERE correo = $1",
      [correo],
    );
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const result = await conexion.query(
      "INSERT INTO profesores (correo, contraseña) VALUES ($1, $2) RETURNING *",
      [correo, hashContrasena(contraseña)],
    );

    res.status(201).json({
      message: "Profesor registrado exitosamente",
      profesor: limpiarUsuario(result.rows[0]),
    });
  } catch (error) {
    console.error("Error al registrar profesor:", error);
    res.status(500).json({ error: "Error al registrar profesor" });
  }
};

/* AUTO-REGISTRO - POST /api/profesores/registrarse (público)
   Cualquier correo que NO sea de estudiante (NIE@clases.edu.sv) crea cuenta de profesor. */
const registrarseProfesor = async (req, res) => {
  try {
    const correo = normalizarCorreo(req.body.correo);
    const { contraseña } = req.body;
    if (!correo || !contraseña) {
      return res
        .status(400)
        .json({ error: "Correo y contraseña son requeridos" });
    }
    if (!RE_CORREO_VALIDO.test(correo)) {
      return res.status(400).json({ error: "El correo no es válido" });
    }
    if (nieDeCorreo(correo)) {
      return res.status(400).json({
        error:
          "Los correos NIE@clases.edu.sv son de estudiantes. Se registran como estudiante.",
      });
    }

    const existe = await conexion.query(
      `SELECT 1 FROM profesores WHERE lower(trim(correo)) = $1
       UNION ALL
       SELECT 1 FROM estudiantes WHERE lower(trim(correo)) = $1`,
      [correo],
    );
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }

    const result = await conexion.query(
      "INSERT INTO profesores (correo, contraseña) VALUES ($1, $2) RETURNING *",
      [correo, hashContrasena(contraseña)],
    );

    res.status(201).json({
      message: "Profesor registrado exitosamente",
      profesor: datosSesion(result.rows[0]),
    });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "El correo ya está registrado" });
    }
    console.error("Error al registrarse como profesor:", error);
    res.status(500).json({ error: "Error al registrar profesor" });
  }
};

/* LOGIN CON GOOGLE - POST /api/profesores/google
   - Correo ya registrado como profesor: entra.
   - Correo de estudiante (NIE@clases.edu.sv) o que ya es una cuenta de estudiante:
     responde 403 noEsProfesor y el login lo manda al sistema de estudiantes.
   - Cualquier otro correo nuevo: se crea como profesor. */
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
      "SELECT * FROM profesores WHERE lower(correo) = lower($1)",
      [email],
    );
    let profesor = buscar.rows[0];

    if (!profesor) {
      const esEstudiante = await conexion.query(
        "SELECT 1 FROM estudiantes WHERE lower(trim(correo)) = lower(trim($1))",
        [email],
      );
      if (nieDeCorreo(email) || esEstudiante.rows.length > 0) {
        return res.status(403).json({
          error: "Este correo no está registrado como profesor",
          noEsProfesor: true,
        });
      }
      const nuevo = await conexion.query(
        "INSERT INTO profesores (correo, contraseña) VALUES ($1, $2) RETURNING *",
        [normalizarCorreo(email), "GOOGLE_OAUTH_USER"],
      );
      profesor = nuevo.rows[0];
    }

    return res.status(200).json({
      message: "Autenticación con Google exitosa",
      profesor: datosSesion(profesor, { foto: picture || null }),
    });
  } catch (error) {
    console.error("Error en loginGoogle:", error);
    return res
      .status(500)
      .json({ error: "Error de servidor al autenticar con Google" });
  }
};

/* LISTA - GET /api/profesores (sin contraseñas) */
const obtenerProfesores = async (req, res) => {
  try {
    const result = await conexion.query(
      "SELECT * FROM profesores ORDER BY id_profesor",
    );
    res.json(result.rows.map(limpiarUsuario));
  } catch (error) {
    console.error("Error al obtener profesores:", error);
    res.status(500).json({ error: "Error al obtener profesores" });
  }
};

module.exports = {
  loginProfesor,
  registrarProfesor,
  registrarseProfesor,
  loginGoogle,
  obtenerProfesores,
};