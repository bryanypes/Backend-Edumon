// Diagnóstico de solo lectura: busca ids de usuario que siguen referenciados en otras
// colecciones pero ya no existen en users (por ejemplo, cuentas borradas por el índice
// TTL que tenía refreshTokens.expiraEn). No modifica nada.
//
// Uso:
//   npm run diagnostico:usuarios
//   npm run diagnostico:usuarios -- --json   → salida en JSON
//
// Si a esas personas se les vuelve a registrar, reciben un _id nuevo: sus entregas,
// cursos y mensajes NO se vuelven a enlazar solos. Solo se recuperan desde un respaldo
// anterior que todavía tenga esos usuarios.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { pathToFileURL } from 'node:url';

// colección y ruta del campo con el id del usuario
export const REFERENCIAS = [
  ['cursos', 'participantes.usuarioId'],
  ['cursos', 'docenteId'],
  ['entregas', 'padreId'],
  ['tareas', 'docenteId'],
  ['perfilfamiliars', 'titularId'],
  ['mensajeforos', 'usuarioId'],
  ['notificacions', 'usuarioId'],
  ['institucions', 'adminId'],
];

const clave = (id) => String(id);

async function idsReferenciados(db, coleccion, campo) {
  const filas = await db
    .collection(coleccion)
    .aggregate([
      ...(campo.includes('.') ? [{ $unwind: `$${campo.split('.')[0]}` }] : []),
      { $match: { [campo]: { $type: 'objectId' } } },
      { $group: { _id: `$${campo}`, documentos: { $addToSet: '$_id' } } },
    ])
    .toArray();
  return filas;
}

export async function diagnosticarUsuariosHuerfanos(db = mongoose.connection.db) {
  const huerfanos = new Map();

  for (const [coleccion, campo] of REFERENCIAS) {
    const filas = await idsReferenciados(db, coleccion, campo);
    if (!filas.length) continue;
    const existentes = new Set(
      (
        await db
          .collection('users')
          .find({ _id: { $in: filas.map((f) => f._id) } }, { projection: { _id: 1 } })
          .toArray()
      ).map((u) => clave(u._id)),
    );
    for (const fila of filas) {
      if (existentes.has(clave(fila._id))) continue;
      const item = huerfanos.get(clave(fila._id)) ?? {
        usuarioId: clave(fila._id),
        referencias: 0,
        porCampo: {},
        docs: [],
      };
      item.referencias += fila.documentos.length;
      item.porCampo[`${coleccion}.${campo}`] = fila.documentos.length;
      item.docs.push({ coleccion, ids: fila.documentos });
      huerfanos.set(clave(fila._id), item);
    }
  }

  const resultado = [];
  for (const item of huerfanos.values()) {
    const idsDe = (col) => item.docs.filter((d) => d.coleccion === col).flatMap((d) => d.ids);

    // cursos donde aparece: directo, por sus tareas, por sus entregas y por sus mensajes de foro
    const cursoIds = new Set(idsDe('cursos').map(clave));
    const tareaIds = [...idsDe('tareas')];
    const entregas = await db
      .collection('entregas')
      .find({ _id: { $in: idsDe('entregas') } }, { projection: { tareaId: 1 } })
      .toArray();
    tareaIds.push(...entregas.map((e) => e.tareaId));
    const tareas = await db
      .collection('tareas')
      .find({ _id: { $in: tareaIds } }, { projection: { cursoId: 1 } })
      .toArray();
    tareas.forEach((t) => t.cursoId && cursoIds.add(clave(t.cursoId)));
    const mensajes = await db
      .collection('mensajeforos')
      .find({ _id: { $in: idsDe('mensajeforos') } }, { projection: { foroId: 1 } })
      .toArray();
    const foros = await db
      .collection('foros')
      .find({ _id: { $in: mensajes.map((m) => m.foroId) } }, { projection: { cursoId: 1 } })
      .toArray();
    foros.forEach((f) => f.cursoId && cursoIds.add(clave(f.cursoId)));

    const cursos = await db
      .collection('cursos')
      .find(
        { _id: { $in: [...cursoIds].map((id) => new mongoose.Types.ObjectId(id)) } },
        { projection: { nombre: 1, institucionId: 1 } },
      )
      .toArray();
    const institucionIds = new Set(
      cursos
        .map((c) => c.institucionId)
        .filter(Boolean)
        .map(clave),
    );
    idsDe('institucions').forEach((id) => institucionIds.add(clave(id)));
    const instituciones = await db
      .collection('institucions')
      .find(
        { _id: { $in: [...institucionIds].map((id) => new mongoose.Types.ObjectId(id)) } },
        { projection: { nombre: 1 } },
      )
      .toArray();

    resultado.push({
      usuarioId: item.usuarioId,
      referencias: item.referencias,
      porCampo: item.porCampo,
      cursos: cursos.map((c) => ({ id: clave(c._id), nombre: c.nombre })),
      instituciones: instituciones.map((i) => ({ id: clave(i._id), nombre: i.nombre })),
    });
  }

  return resultado.sort((a, b) => b.referencias - a.referencias);
}

async function main() {
  dotenv.config();
  const json = process.argv.includes('--json');
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const resultado = await diagnosticarUsuariosHuerfanos();
    if (json) {
      console.log(JSON.stringify(resultado, null, 2));
      return;
    }
    console.log(`Usuarios referenciados que ya no existen en users: ${resultado.length}\n`);
    for (const r of resultado) {
      console.log(`${r.usuarioId}  (${r.referencias} referencias)`);
      for (const [campo, n] of Object.entries(r.porCampo)) console.log(`   ${campo}: ${n}`);
      if (r.cursos.length) console.log(`   cursos: ${r.cursos.map((c) => c.nombre).join(', ')}`);
      if (r.instituciones.length) console.log(`   instituciones: ${r.instituciones.map((i) => i.nombre).join(', ')}`);
    }
    if (resultado.length) {
      console.log('\nSi se vuelve a registrar a estas personas, reciben un _id nuevo y sus datos no se');
      console.log('vuelven a enlazar solos: solo se recuperan desde un respaldo anterior.');
    }
  } catch (error) {
    console.error('Error en el diagnóstico:', error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
