import mongoose from "mongoose";

// problemas de conexión después del connect() inicial (ej. la BD se cae en caliente)
mongoose.connection.on("error", (error) => {
  console.error("Error de conexión MongoDB:", error);
});
mongoose.connection.on("disconnected", () => {
  console.warn("Desconectado de MongoDB");
});

// reintenta la conexión inicial (un hipo de red hacia Atlas al arrancar el contenedor);
// reconexiones posteriores ya las maneja el driver de Mongo
const connectDB = async (intentos = 5, esperaMs = 3000) => {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      // timeout corto por intento: 5 reintentos de 5s en vez de un solo intento de 30s
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      console.log("Conectado a MongoDB");
      return;
    } catch (error) {
      const esUltimoIntento = intento === intentos;
      console.error(`Error al conectar a MongoDB (intento ${intento}/${intentos}):`, error.message);
      if (esUltimoIntento) {
        process.exit(1);
      }
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
};

export default connectDB;
