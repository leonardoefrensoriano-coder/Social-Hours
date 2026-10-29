/* Controlador genérico (CRUD) para las tablas que no tienen un controlador propio.
   Lee las columnas y la llave primaria de cada tabla desde la base de datos,
   así que funciona sin importar qué columnas tenga. */
const conexion = require("../apis/conexion.js");

/* Columnas que nunca se devuelven al navegador */
const COLUMNAS_OCULTAS = ["contraseña", "contrasena", "password", "clave"];

/* Guarda en memoria la estructura de cada tabla (se consulta una sola vez) */
const cacheEstructura = {};

async function obtenerEstructura(tabla) {
  if (cacheEstructura[tabla]) return cacheEstructura[tabla];

  const columnasRes = await conexion.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [tabla],
  );
  const columnas = columnasRes.rows.map((c) => c.column_name);

  if (columnas.length === 0) {
    throw new Error(`La tabla "${tabla}" no existe en la base de datos`);
  }

  const pkRes = await conexion.query(
    `SELECT a.attname AS columna
     FROM pg_index i
     JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
     WHERE i.indrelid = $1::regclass AND i.indisprimary`,
    [`public."${tabla}"`],
  );
  const llaves = pkRes.rows.map((r) => r.columna);

  /* Solo se permiten rutas /:id cuando hay una llave primaria simple */
  const estructura = { columnas, pk: llaves.length === 1 ? llaves[0] : null };
  cacheEstructura[tabla] = estructura;
  return estructura;
}

/* Quita columnas sensibles (contraseñas) de lo que se envía al navegador */
function limpiar(fila) {
  if (!fila) return fila;
  const copia = { ...fila };
  COLUMNAS_OCULTAS.forEach((c) => delete copia[c]);
  return copia;
}

/* Convierte errores de PostgreSQL en respuestas claras */
function responderError(res, error, mensaje) {
  console.error(mensaje, error);
  if (error.code === "23505")
    return res
      .status(409)
      .json({ error: "Ya existe un registro con esos datos" });
  if (error.code === "23503")
    return res.status(409).json({
      error:
        "Operación bloqueada: el registro está relacionado con otros datos",
    });
  if (error.code === "23502")
    return res
      .status(400)
      .json({ error: "Falta un campo obligatorio: " + (error.column || "") });
  if (error.code === "22P02")
    return res
      .status(400)
      .json({ error: "Alguno de los valores tiene un formato inválido" });
  return res.status(500).json({ error: mensaje });
}

/* Se queda solo con las claves del body que son columnas reales de la tabla */
function filtrarCampos(body, estructura, incluirPk) {
  const campos = {};
  Object.keys(body || {}).forEach((k) => {
    if (!estructura.columnas.includes(k)) return;
    if (!incluirPk && k === estructura.pk) return;
    campos[k] = body[k];
  });
  return campos;
}

/* Crea los 5 controladores para una tabla */
function crearCrud(tabla) {
  const t = `"${tabla}"`;

  /* GET /api/<tabla>  (acepta filtros: /api/<tabla>?columna=valor) */
  const listar = async (req, res) => {
    try {
      const est = await obtenerEstructura(tabla);
      const condiciones = [];
      const valores = [];

      Object.keys(req.query).forEach((k) => {
        if (est.columnas.includes(k)) {
          valores.push(String(req.query[k]));
          condiciones.push(`"${k}"::text = $${valores.length}`);
        }
      });

      const where = condiciones.length
        ? ` WHERE ${condiciones.join(" AND ")}`
        : "";
      const orden = est.pk ? ` ORDER BY "${est.pk}"` : "";
      const result = await conexion.query(
        `SELECT * FROM ${t}${where}${orden}`,
        valores,
      );
      res.json(result.rows.map(limpiar));
    } catch (error) {
      responderError(res, error, `Error al obtener ${tabla}`);
    }
  };

  /* GET /api/<tabla>/:id */
  const obtenerUno = async (req, res) => {
    try {
      const est = await obtenerEstructura(tabla);
      if (!est.pk)
        return res
          .status(400)
          .json({ error: `"${tabla}" no tiene una llave primaria simple` });
      const result = await conexion.query(
        `SELECT * FROM ${t} WHERE "${est.pk}" = $1`,
        [req.params.id],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Registro no encontrado" });
      res.json(limpiar(result.rows[0]));
    } catch (error) {
      responderError(res, error, `Error al obtener el registro de ${tabla}`);
    }
  };

  /* POST /api/<tabla> */
  const crear = async (req, res) => {
    try {
      const est = await obtenerEstructura(tabla);
      const campos = filtrarCampos(req.body, est, true);
      const nombres = Object.keys(campos);
      if (nombres.length === 0)
        return res.status(400).json({
          error:
            "Envía al menos un campo válido. Columnas: " +
            est.columnas.join(", "),
        });

      const columnasSql = nombres.map((n) => `"${n}"`).join(", ");
      const marcadores = nombres.map((_, i) => `$${i + 1}`).join(", ");
      const result = await conexion.query(
        `INSERT INTO ${t} (${columnasSql}) VALUES (${marcadores}) RETURNING *`,
        nombres.map((n) => campos[n]),
      );
      res
        .status(201)
        .json({
          message: "Registro creado",
          registro: limpiar(result.rows[0]),
        });
    } catch (error) {
      responderError(res, error, `Error al crear el registro en ${tabla}`);
    }
  };

  /* PUT /api/<tabla>/:id  (solo cambia los campos enviados) */
  const actualizar = async (req, res) => {
    try {
      const est = await obtenerEstructura(tabla);
      if (!est.pk)
        return res
          .status(400)
          .json({ error: `"${tabla}" no tiene una llave primaria simple` });
      const campos = filtrarCampos(req.body, est, false);
      const nombres = Object.keys(campos);
      if (nombres.length === 0)
        return res
          .status(400)
          .json({ error: "No hay campos válidos para actualizar" });

      const sets = nombres.map((n, i) => `"${n}" = $${i + 1}`).join(", ");
      const valores = nombres.map((n) => campos[n]);
      valores.push(req.params.id);
      const result = await conexion.query(
        `UPDATE ${t} SET ${sets} WHERE "${est.pk}" = $${valores.length} RETURNING *`,
        valores,
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Registro no encontrado" });
      res.json({
        message: "Registro actualizado",
        registro: limpiar(result.rows[0]),
      });
    } catch (error) {
      responderError(res, error, `Error al actualizar el registro de ${tabla}`);
    }
  };

  /* DELETE /api/<tabla>/:id */
  const eliminar = async (req, res) => {
    try {
      const est = await obtenerEstructura(tabla);
      if (!est.pk)
        return res
          .status(400)
          .json({ error: `"${tabla}" no tiene una llave primaria simple` });
      const result = await conexion.query(
        `DELETE FROM ${t} WHERE "${est.pk}" = $1 RETURNING *`,
        [req.params.id],
      );
      if (result.rows.length === 0)
        return res.status(404).json({ error: "Registro no encontrado" });
      res.json({ message: "Registro eliminado correctamente" });
    } catch (error) {
      responderError(res, error, `Error al eliminar el registro de ${tabla}`);
    }
  };

  return { listar, obtenerUno, crear, actualizar, eliminar };
}

module.exports = { crearCrud };
