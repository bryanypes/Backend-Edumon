import mongoose from "mongoose";

// Loguear problemas de conexión que ocurran después del connect() inicial
// (ej. la BD se cae mientras el server sigue corriendo)
mongoose.connection.on("error", (error) => {
  console.error("Error de conexión MongoDB:", error);
});
mongoose.connection.on("disconnected", () => {
  console.warn("Desconectado de MongoDB");
});

// Reintenta la conexión inicial: en un contenedor, el arranque puede ganarle
// a un hipo de red pasajero hacia Atlas. Una vez conectado, la reconexión
// ante caídas posteriores ya la maneja el propio driver de Mongo.
const connectDB = async (intentos = 5, esperaMs = 3000) => {
  for (let intento = 1; intento <= intentos; intento++) {
    try {
      // Timeout corto por intento: 5 reintentos de 5s cubren un hipo de red
      // en ~30s totales, en vez de que cada intento fallido se demore él
      // solo los 30s que trae por defecto el driver.
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
