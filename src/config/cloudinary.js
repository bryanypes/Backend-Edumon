import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  // Sin esto, el SDK no tiene ningún límite propio de tiempo: si hay un
  // hipo de red entre Render y Cloudinary, uploader.upload() se queda
  // colgado indefinidamente y lo único que corta la conexión es el
  // timeout global de Express (server.js) — que mata la RESPUESTA al
  // navegador pero NO cancela la subida, que sigue corriendo en segundo
  // plano. Con esto, una subida que no avanza falla rápido y con un error
  // específico ("Timeout" desde el SDK), en vez de un "Response timeout"
  // genérico tras casi un minuto y medio de espera.
  timeout: 30000,
});

export default cloudinary;