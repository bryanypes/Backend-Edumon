// src/scripts/normalizarTelefonos.js
//
// Migración única: deja TODOS los teléfonos ya guardados en el formato del
// sistema (+57XXXXXXXXXX). Hace falta porque, antes de unificar los formularios,
// algunos flujos (participantes de curso) guardaban el número tal cual lo
// escribía el docente ("3001234567"), y como el login busca por teléfono exacto
// esos usuarios no podían iniciar sesión desde la web.
//
// Uso:
//   node src/scripts/normalizarTelefonos.js            → simulación (no escribe)
//   node src/scripts/normalizarTelefonos.js --aplicar  → aplica los cambios

import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Institucion from "../models/Institucion.js";
import { normalizarTelefono } from "../utils/normalizarTelefono.js";

dotenv.config();

const APLICAR = process.argv.includes("--aplicar");

async function normalizarColeccion(Modelo, etiqueta) {
  const docs = await Modelo.find({ telefono: { $nin: [null, ""] } }).select("telefono nombre apellido");

  let yaOk = 0;
  const cambios = [];
  const invalidos = [];

  for (const doc of docs) {
    const actual = doc.telefono;
    if (/^\+57\d{10}$/.test(actual)) { yaOk++; continue; }

    const normalizado = normalizarTelefono(actual);
    if (!normalizado) { invalidos.push({ _id: doc._id, actual }); continue; }

    cambios.push({ _id: doc._id, actual, normalizado });
  }

  console.log(`\n── ${etiqueta} ──`);
  console.log(`   Con teléfono          : ${docs.length}`);
  console.log(`   Ya en formato +57     : ${yaOk}`);
  console.log(`   Por normalizar        : ${cambios.length}`);
  console.log(`   No reconocidos        : ${invalidos.length}`);

  for (const c of cambios.slice(0, 20)) {
    console.log(`     ${c.actual}  →  ${c.normalizado}`);
  }
  if (cambios.length > 20) console.log(`     … y ${cambios.length - 20} más`);

  for (const i of invalidos) {
    console.log(`     ⚠️  sin normalizar (revisar a mano): ${i.actual}  [${i._id}]`);
  }

  if (APLICAR && cambios.length) {
    // Un teléfono duplicado tras normalizar significa dos cuentas con el mismo
    // número: se informa y se deja intacto en vez de romper el login de ambas.
    for (const c of cambios) {
      const choque = await Modelo.findOne({ telefono: c.normalizado, _id: { $ne: c._id } }).select("_id");
      if (choque) {
        console.log(`     ⚠️  ${c.actual} → ${c.normalizado} ya lo usa ${choque._id}: se deja sin cambiar`);
        continue;
      }
      await Modelo.updateOne({ _id: c._id }, { $set: { telefono: c.normalizado } });
    }
    console.log(`   ✅ Cambios aplicados`);
  }

  return { total: docs.length, cambios: cambios.length, invalidos: invalidos.length };
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB");
    console.log(APLICAR
      ? "MODO: aplicar cambios"
      : "MODO: simulación (usa --aplicar para escribir en la base)");

    await normalizarColeccion(User, "Usuarios");
    await normalizarColeccion(Institucion, "Instituciones");

    console.log("\nListo.\n");
  } catch (error) {
    console.error("Error en la migración:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
