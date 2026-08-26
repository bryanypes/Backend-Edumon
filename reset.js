import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const resetDB = async () => {
  if (process.env.NODE_ENV === "production") {
    console.error("Abortado: NODE_ENV=production. Este script no puede correr en producción.");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("Conectado a MongoDB...");
    await mongoose.connection.dropDatabase();
    console.log("Base de datos reseteada con éxito.");
    process.exit(0);
  } catch (error) {
    console.error("Error al resetear DB:", error.message);
    process.exit(1);
  }
};

resetDB();