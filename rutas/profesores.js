/* Rutas para Profesores y Autenticación */
const express = require("express");
const router = express.Router();
const nodemailer = require("nodemailer");
const conexion = require("../apis/conexion.js");

/* Configuración del transporte de correo Nodemailer */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/* Importamos el controlador de profesores */
const profesorController = require("../controlador/profesor");
const { guardarNotificacion } = require("../controlador/notificaciones");
const { requireAuth, limitarIntentos } = require("../controlador/seguridad");

/*  RUTA CRÍTICA: Atiende la petición de login enviada desde js/login.js */
router.post("/login", limitarIntentos, profesorController.loginProfesor);

/* Otras rutas de autenticación */
/* Solo un profesor con sesión puede dar de alta a otro */
router.post(
  "/registrar",
  requireAuth("profesor"),
  profesorController.registrarProfesor,
);
/* Auto-registro público: cualquier correo que no sea NIE@clases.edu.sv */
router.post(
  "/registrarse",
  limitarIntentos,
  profesorController.registrarseProfesor,
);
router.post("/google", profesorController.loginGoogle);
router.get("/", requireAuth("profesor"), profesorController.obtenerProfesores);

/*  RUTA PARA ENVIAR ALERTAS POR CORREO */
router.post("/alertas/enviar", requireAuth("profesor"), async (req, res) => {
  const { destinatario, asunto, mensaje } = req.body;

  if (!destinatario) {
    return res
      .status(400)
      .json({ error: "El correo del destinatario es obligatorio." });
  }

  const mailOptions = {
    from: `"Social Hours" <${process.env.EMAIL_USER}>`,
    to: destinatario,
    subject: asunto || "Notificación de Horas Sociales - Social Hours",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #00b4d8; text-align: center; margin-top: 0;">Social Hours</h2>
        <p style="font-size: 15px; color: #333333; line-height: 1.5;">${mensaje || "Se ha generado un nuevo aviso en tu registro de servicio social."}</p>
        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888888; text-align: center;">Este es un mensaje automático generado por la plataforma Social Hours.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);

    /* Si el correo es de un estudiante, la misma alerta queda en su sistema */
    try {
      const est = await conexion.query(
        "SELECT nie FROM estudiantes WHERE lower(trim(correo)) = lower(trim($1)) AND nie IS NOT NULL LIMIT 1",
        [destinatario],
      );
      if (est.rows.length > 0) {
        await guardarNotificacion({
          nie: est.rows[0].nie,
          tipo: "aviso",
          asunto: mailOptions.subject,
          mensaje: String(
            mensaje ||
              "Se ha generado un nuevo aviso en tu registro de servicio social.",
          ).replace(/<[^>]*>/g, ""),
        });
      }
    } catch (e) {
      console.error("No se pudo guardar la notificación del aviso:", e.message);
    }

    res.json({ ok: true, mensaje: "¡Alerta enviada exitosamente al correo!" });
  } catch (error) {
    console.error("Error al enviar el correo:", error);
    res.status(500).json({ error: "No se pudo enviar el correo de alerta." });
  }
});

/* RUTA PARA ENVIAR ALERTAS A VARIOS ESTUDIANTES (los que el profesor dejó marcados)
   Recibe { tipo: "completas" | "incompletas", nies: ["1234567", ...] }.
   Busca el correo de cada NIE en la tabla estudiantes y manda un correo a cada uno por
   separado (así nadie ve los correos de los demás). */
const MAX_ALERTAS_POR_ENVIO = 100; /* tope por envío; Gmail también limita los correos por día */

const TEXTOS_ALERTA = {
  completas: {
    asunto: "Horas Sociales Completadas - Social Hours",
    mensaje:
      "¡Felicidades! Has completado con éxito tus horas de servicio social.",
  },
  incompletas: {
    asunto: "Aviso de Horas Pendientes - Social Hours",
    mensaje:
      "Recordatorio: Aún tienes horas pendientes en tu registro de servicio social. Por favor ponte al día.",
  },
};

/* Enlace al sistema que va en el correo. Se toma de APP_URL en el .env
   (ej. APP_URL=https://tu-dominio.com). Sin APP_URL el correo sale sin enlace. */
function urlDelSistema() {
  const base = String(process.env.APP_URL || "")
    .trim()
    .replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? `${base}/login.html` : "";
}

function escaparHTML(valor) {
  return String(valor ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}

router.post(
  "/alertas/enviar-lista",
  requireAuth("profesor"),
  async (req, res) => {
    const { tipo, nies } = req.body;
    const textos = TEXTOS_ALERTA[tipo];

    if (!textos) {
      return res.status(400).json({ error: "Tipo de alerta no válido." });
    }
    if (!Array.isArray(nies) || nies.length === 0) {
      return res
        .status(400)
        .json({ error: "Marca al menos un alumno para enviarle la alerta." });
    }

    /* NIEs sin espacios ni repetidos */
    const lista = [
      ...new Set(nies.map((n) => String(n ?? "").trim()).filter(Boolean)),
    ];
    if (lista.length > MAX_ALERTAS_POR_ENVIO) {
      return res.status(400).json({
        error: `Máximo ${MAX_ALERTAS_POR_ENVIO} alumnos por envío. Desmarca algunos y envía por partes.`,
      });
    }

    try {
      const result = await conexion.query(
        "SELECT nie, correo, nombre FROM estudiantes WHERE trim(nie::text) = ANY($1::text[])",
        [lista],
      );

      /* Un estudiante por NIE; si hay dos, se prefiere el que tiene correo */
      const porNie = new Map();
      result.rows.forEach((e) => {
        const clave = String(e.nie ?? "").trim();
        const actual = porNie.get(clave);
        if (!actual || (!actual.correo && e.correo)) porNie.set(clave, e);
      });

      const enlace = urlDelSistema();
      if (!enlace) {
        console.warn(
          "APP_URL no está definida en el .env: los correos salen sin enlace al sistema.",
        );
      }
      const botonEntrar = enlace
        ? `<p style="text-align: center; margin: 24px 0 8px;">
          <a href="${escaparHTML(enlace)}" style="background-color: #00b4d8; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; display: inline-block;">Entrar a Social Hours</a>
        </p>
        <p style="font-size: 12px; color: #888888; text-align: center; word-break: break-all;">Si el botón no funciona, copia este enlace en tu navegador:<br>${escaparHTML(enlace)}</p>`
        : "";

      const enviados = [];
      const sinCorreo = [];
      const fallidos = [];
      let notificados = 0;

      for (const nie of lista) {
        const est = porNie.get(nie);
        const correo = String(est?.correo ?? "").trim();

        /* La misma alerta que va al correo queda en la sección Alertas del estudiante
           (aunque no tenga correo o el correo falle) */
        const guardada = await guardarNotificacion({
          nie,
          tipo,
          asunto: textos.asunto,
          mensaje:
            est && est.nombre
              ? `Hola ${est.nombre},\n${textos.mensaje}`
              : textos.mensaje,
        });
        if (guardada) notificados++;

        if (!est || !/^\S+@\S+\.\S+$/.test(correo)) {
          sinCorreo.push(nie);
          continue;
        }

        const saludo = est.nombre
          ? `<p style="font-size: 15px; color: #333333;">Hola ${escaparHTML(est.nombre)},</p>`
          : "";

        try {
          await transporter.sendMail({
            from: `"Social Hours" <${process.env.EMAIL_USER}>`,
            to: correo,
            subject: textos.asunto,
            html: `
      <div style="font-family: Arial, sans-serif; max-width: 500px; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #00b4d8; text-align: center; margin-top: 0;">Social Hours</h2>
        ${saludo}
        <p style="font-size: 15px; color: #333333; line-height: 1.5;">${textos.mensaje}</p>
        ${botonEntrar}
        <hr style="border: 0; border-top: 1px solid #eeeeee; margin: 20px 0;">
        <p style="font-size: 12px; color: #888888; text-align: center;">Este es un mensaje automático generado por la plataforma Social Hours.</p>
      </div>
    `,
          });
          enviados.push(nie);
        } catch (error) {
          console.error("Error al enviar el correo a", nie, ":", error.message);
          fallidos.push(nie);
        }
      }

      res.json({
        ok: true,
        enviados: enviados.length,
        notificados,
        sinCorreo,
        fallidos,
      });
    } catch (error) {
      console.error("Error al enviar alertas:", error);
      res.status(500).json({ error: "No se pudieron enviar las alertas." });
    }
  },
);

module.exports = router;
