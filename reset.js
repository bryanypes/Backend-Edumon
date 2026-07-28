import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// Script destructivo: borra TODA la base de datos apuntada por MONGO_URI.
// Salvaguardas: nunca corre si NODE_ENV=production, y exige --confirm explícito.
const resetDB = async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Abortado: NODE_ENV=production. Este script no puede correr en producción.");
    process.exit(1);
  }

  if (!process.argv.includes("--confirm")) {
    console.error(
      "Abortado: esto borra TODA la base de datos en MONGO_URI.\n" +
      "Si estás seguro, vuelve a ejecutar: npm run reset-db -- --confirm"
    );
    process.exit(1);
  }

  try {
    // Conexión a la base
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log("Conectado a MongoDB...");

    // Esto borra toda la base de datos actual
    await mongoose.connection.dropDatabase();

    console.log("Base de datos reseteada con éxito.");
    process.exit(0);
  } catch (error) {
    console.error("Error al resetear DB:", error.message);
    process.exit(1);
  }
};

resetDB();
