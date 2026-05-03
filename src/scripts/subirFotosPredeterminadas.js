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

      // Validar extensiones
      if (
        !['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']
          .includes(path.extname(archivo).toLowerCase())
      ) {
        console.log(`Saltando ${archivo} (no es imagen)`);
        continue;
      }

      try {
        const options = {
          folder: FOLDER_CLOUDINARY,
          public_id: path.parse(archivo).name,
          resource_type: 'image',
          format: 'webp'
        };

        // Solo aplicar transformaciones si NO es svg
        if (path.extname(archivo).toLowerCase() !== '.svg') {
          options.transformation = [
            { width: 400, height: 400, crop: 'fill', gravity: 'face' },
            { quality: 'auto:good' }
          ];
        }

        const result = await cloudinary.uploader.upload(
          rutaArchivo,
          options
        );

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

    console.log('\nResumen de fotos subidas:');
    console.log(JSON.stringify(resultados, null, 2));

    return resultados;

  } catch (error) {
    console.error('Error general:', error);
    throw error;
  }
};

subirFotosPredeterminadas()
  .then(() => {
    console.log('\nProceso completado');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error fatal:', error);
    process.exit(1);
  });