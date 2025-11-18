import cloudinary from '../config/cloudinary.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOLDER_CLOUDINARY = 'fotos-perfil-predeterminadas';

const subirFotosPredeterminadas = async () => {
  try {
    const fotosDir = path.join(__dirname, '../uploads/fotos-predeterminadas');
    const archivos = fs.readdirSync(fotosDir);

    console.log(`Subiendo ${archivos.length} fotos predeterminadas a Cloudinary...`);

    const resultados = [];

    for (const archivo of archivos) {
      const rutaArchivo = path.join(fotosDir, archivo);
      
      // Verificar que sea una imagen
      if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(path.extname(archivo).toLowerCase())) {
        console.log(`⏭Saltando ${archivo} (no es una imagen)`);
        continue;
      }

      try {
        const result = await cloudinary.uploader.upload(rutaArchivo, {
          folder: FOLDER_CLOUDINARY,
          public_id: path.parse(archivo).name, // Nombre sin extensión
          resource_type: 'image',
          transformation: [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' }
          ]
        });

        resultados.push({
          nombre: archivo,
          url: result.secure_url,
          publicId: result.public_id
        });

        console.log(`${archivo} subido correctamente`);
      } catch (error) {
        console.error(`Error al subir ${archivo}:`, error.message);
      }
    }

    console.log('\n Resumen de fotos subidas:');
    console.log(JSON.stringify(resultados, null, 2));
    
    return resultados;
  } catch (error) {
    console.error('Error general:', error);
    throw error;
  }
};

// Ejecutar si se llama directamente
subirFotosPredeterminadas()
  .then(() => {
    console.log('\nProceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });