import mongoose from "mongoose";

// Loguear problemas de conexión que ocurran después del connect() inicial
// (ej. la BD se cae mientras el server sigue corriendo)
mongoose.connection.on("error", (error) => {
  console.error("Error de conexión MongoDB:", error);
});
mongoose.connection.on("disconnected", () => {
  console.warn("Desconectado de MongoDB");
});

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Conectado a MongoDB");
  } catch (error) {
    console.error("Error al conectar MongoDB:", error);
    process.exit(1);
  }
};

export default connectDB;
