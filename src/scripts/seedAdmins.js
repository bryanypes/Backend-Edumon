import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User.js";
import Institucion from "../models/Institucion.js";

dotenv.config();

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Conectado a MongoDB\n");

    // ── 1. Institución ──────────────────────────────────────────────
    let institucion = await Institucion.findOne({ nit: "891234567-8" });

    if (institucion) {
      console.log(`⚠️  Institución ya existe → ${institucion.nombre}`);
    } else {
      institucion = new Institucion({
        nombre: "Institución Educativa Niño Jesús de Praga",
        nit: "891234567-8",
        direccion: "Calle 15 #8-42, Popayán, Cauca",
        telefono: "3124567890",
        correo: "contacto@ninodejesuspraga.edu.co",
      });
      await institucion.save();
      console.log(`✅ Institución creada → ${institucion.nombre}`);
      console.log(`   Código generado    → ${institucion.codigo}\n`);
    }

    // ── 2. Usuarios ─────────────────────────────────────────────────
    const usuarios = [
      {
        nombre: "Carlos Alberto",
        apellido: "Mendoza Ruiz",
        cedula: "76423891",
        correo: "carlos.mendoza@ninodejesuspraga.edu.co",
        contraseña: "Admin2024*",
        rol: "administrador",
        telefono: "+573187654321",
        institucionId: institucion._id,
      },
      {
        nombre: "Lucía Fernanda",
        apellido: "Torres Ospina",
        cedula: "31958274",
        correo: "lucia.torres@eduplatform.co",
        contraseña: "Super2024*",
        rol: "superadmin",
        telefono: "+573209871234",
        institucionId: null,
      },
    ];

    for (const data of usuarios) {
      const existe = await User.findOne({ cedula: data.cedula });

      if (existe) {
        console.log(`⚠️  Ya existe → ${existe.rol} (${existe.cedula})`);
        continue;
      }

      const user = new User(data);
      await user.save();
      console.log(`✅ Creado: ${data.rol}`);
      console.log(`   Nombre  → ${data.nombre} ${data.apellido}`);
      console.log(`   Correo  → ${data.correo}`);
      console.log(`   Cédula  → ${data.cedula}`);
      console.log(`   Clave   → ${data.contraseña}\n`);
    }

    // ── 3. Vincular admin a la institución ──────────────────────────
    const admin = await User.findOne({ cedula: "76423891" });
    if (admin && !institucion.adminId) {
      institucion.adminId = admin._id;
      await institucion.save();
      console.log(`✅ Admin vinculado a la institución\n`);
    }

    console.log("🎉 Seed completado");
  } catch (err) {
    console.error("❌ Error:", err.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Desconectado");
  }
}

seed();