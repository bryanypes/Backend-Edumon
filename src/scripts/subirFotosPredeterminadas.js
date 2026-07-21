import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Import dinámico: config/cloudinary.js lee process.env al cargarse, y los
// imports estáticos se elevan antes que dotenv.config() -- necesita ejecutarse después.
const { default: cloudinary } = await import('../config/cloudinary.js');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FOLDER_CLOUDINARY = 'fotos-perfil-predeterminadas';
const EXTENSIONES_VALIDAS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];

const subirFotosPredeterminadas = async () => {
  const fotosDir = path.join(__dirname, '../uploads/fotos-predeterminadas');
  const archivos = fs.readdirSync(fotosDir).filter(
    (archivo) => EXTENSIONES_VALIDAS.includes(path.extname(archivo).toLowerCase())
  );

  const publicIdsLocales = new Set(archivos.map((archivo) => path.parse(archivo).name));

  // Borrar de Cloudinary lo que ya no existe localmente
  const existentes = await cloudinary.api.resources({
    type: 'upload',
    prefix: `${FOLDER_CLOUDINARY}/`,
    max_results: 500
  });

  const obsoletos = existentes.resources
    .map((r) => r.public_id)
    .filter((publicId) => !publicIdsLocales.has(publicId.split('/').pop()));

  if (obsoletos.length > 0) {
    console.log(`Borrando ${obsoletos.length} foto(s) obsoleta(s) de Cloudinary...`);
    await cloudinary.api.delete_resources(obsoletos, { resource_type: 'image' });
    obsoletos.forEach((publicId) => console.log(`  Borrado: ${publicId}`));
  } else {
    console.log('No hay fotos obsoletas para borrar.');
  }

  // Subir las fotos locales actuales
  console.log(`\nSubiendo ${archivos.length} foto(s) predeterminada(s) a Cloudinary...`);

  const resultados = [];

  for (const archivo of archivos) {
    const rutaArchivo = path.join(fotosDir, archivo);

    try {
      const options = {
        folder: FOLDER_CLOUDINARY,
        public_id: path.parse(archivo).name,
        resource_type: 'image',
        format: 'webp'
      };

      if (path.extname(archivo).toLowerCase() !== '.svg') {
        options.transformation = [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto:good' }
        ];
      }

      const result = await cloudinary.uploader.upload(rutaArchivo, options);

      resultados.push({
        nombre: archivo,
        url: result.secure_url,
        publicId: result.public_id
      });

      console.log(`${archivo} subido correctamente -> ${result.secure_url}`);
    } catch (error) {
      console.error(`Error al subir ${archivo}:`, error.message);
    }
  }

  console.log('\nResumen de fotos subidas:');
  console.log(JSON.stringify(resultados, null, 2));

  return resultados;
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
