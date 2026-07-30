import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

dotenv.config();

// Diagnóstico de solo lectura: no modifica nada.
// Uso: node src/scripts/debugPrimerInicio.js [telefono]
const telefonoBuscado = process.argv[2] || null;

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  if (telefonoBuscado) {
    const user = await User.findOne({ telefono: telefonoBuscado })
      .select('nombre apellido telefono rol estado primerInicioSesion fechaRegistro ultimoAcceso')
      .lean();

    if (!user) {
      console.log(`No existe ningún usuario con telefono=${telefonoBuscado}`);
    } else {
      console.log(JSON.stringify(user, null, 2));
    }
  } else {
    const total = await User.countDocuments();
    const primerInicioTrue = await User.countDocuments({ primerInicioSesion: true });
    const primerInicioFalse = await User.countDocuments({ primerInicioSesion: false });

    console.log(`Total usuarios: ${total}`);
    console.log(`primerInicioSesion=true:  ${primerInicioTrue}`);
    console.log(`primerInicioSesion=false: ${primerInicioFalse}`);

    const conFalse = await User.find({ primerInicioSesion: false })
      .select('telefono rol fechaRegistro ultimoAcceso')
      .sort({ ultimoAcceso: -1 })
      .limit(20)
      .lean();

    console.log('\nÚltimos 20 con primerInicioSesion=false (deberían ser cuentas que YA cambiaron su contraseña):');
    console.table(conFalse.map(u => ({
      telefono: u.telefono,
      rol: u.rol,
      fechaRegistro: u.fechaRegistro?.toISOString().slice(0, 16),
      ultimoAcceso: u.ultimoAcceso?.toISOString().slice(0, 16),
    })));
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
