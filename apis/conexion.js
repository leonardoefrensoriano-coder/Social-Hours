/* Importar las dependencias */
const pg = require("pg");
const dotenv = require("dotenv");
const path = require("path");

/*  1: Carga segura de variables de entorno (.env) */
const envPath = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: envPath });

const { Pool } = pg;

/* Verificar que la cadena de conexión exista */
if (!process.env.DATABASE_URL) {
  throw new Error(
    "Falta la variable DATABASE_URL. Crea un archivo .env en la raíz del proyecto.",
  );
}

/*  2: Configuración del Pool de conexiones y seguridad SSL */
const conexion = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // Indispensable para conectar con Neon PostgreSQL
  },
});

/* Capturar errores inesperados del pool */
conexion.on("error", (err) => {
  console.error("Error inesperado en el pool de conexiones:", err);
});

/*  3: Función auxiliar para inserción directa en la base de datos */
async function insertarProfesor(correo, contraseña, id_grado) {
  try {
    const query =
      "INSERT INTO profesores (correo, contraseña, id_grado) VALUES ($1, $2, $3) RETURNING *";
    const values = [correo, contraseña, id_grado];
    const result = await conexion.query(query, values);
    console.log("Profesor insertado exitosamente:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("Error al insertar profesor:", error);
    throw error;
  }
}

async function insertarEstudiante(correo, contraseña) {
  try{
    const query =
      "INSERT INTO estudiantes (correo, contraseña) VALUES ($1, $2) RETURNING *";
    const values = [correo, contraseña];
    const result = await conexion.query(query, values);
    console.log("Estudiante insertado exitosamente:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("Error al insertar estudiante:", error);
    throw error;
  }
}

/*insertar datos de horas de estudiante*/
async function insertarHorasEstudiante(nombre, nie, grado, seccion, servicio, horas, estado) {
  try{
    const query =
      "INSERT INTO registros_estudiantes (nombre,nie,grado,seccion,servicio,horas,estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *";
    const values = [nombre, nie, grado, seccion, servicio, horas, estado];
    const result = await conexion.query(query, values);
    console.log("Horas de estudiante insertadas exitosamente:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("Error al insertar horas de estudiante:", error);
    throw error;
  }
}
/*insertar datos de las validaciones */
async function InsertarValidacion(estado,fecha_validacion){
  try{
    const query =
      "INSERT INTO validaciones (estado,fecha_validacion) VALUES ($1, $2) RETURNING *";
    const values = [estado, fecha_validacion];
    const result = await conexion.query(query, values);
    console.log("Validación insertada exitosamente:", result.rows[0]);
    return result.rows[0];
  } catch (error) {
    console.error("Error al insertar validación:", error);
    throw error;
  }
}

/*  4: Exportación del pool para que lo consuma el controlador */
module.exports = conexion;
module.exports.insertarProfesor = insertarProfesor;
module.exports.insertarEstudiante = insertarEstudiante;
module.exports.insertarHorasEstudiante = insertarHorasEstudiante;
module.exports.InsertarValidacion = InsertarValidacion;
/*outerbase*/