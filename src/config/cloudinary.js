import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  // sin esto el SDK no tiene límite propio: una subida colgada solo la corta
  // el timeout global de Express, y sigue corriendo en segundo plano igual
  timeout: 30000,
});

export default cloudinary;