import cloudinary from '../config/cloudinary.js';

/**
 * Sube una imagen a Cloudinary desde un buffer
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {String} mimetype - Tipo MIME del archivo
 * @param {String} folder - Carpeta en Cloudinary
 * @returns {Promise<Object>} - { url, publicId }
 */
export const subirImagenCloudinary = async (fileBuffer, mimetype, folder = 'general') => {
  try {
    // Convertir buffer a base64
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${mimetype};base64,${b64}`;

    // Subir a Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 1200, crop: 'limit' }, // Limitar ancho máximo a 1200px
        { quality: 'auto:good' } // Optimización automática
      ]
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };

  } catch (error) {
    console.error('Error al subir imagen a Cloudinary:', error);
    throw new Error('Error al subir la imagen');
  }
};

/**
 * Sube un archivo (PDF, DOC, etc.) a Cloudinary
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {String} mimetype - Tipo MIME del archivo
 * @param {String} folder - Carpeta en Cloudinary
 * @param {String} originalName - Nombre original del archivo
 * @returns {Promise<Object>} - { url, publicId, format }
 */
export const subirArchivoCloudinary = async (fileBuffer, mimetype, folder = 'archivos', originalName = 'archivo') => {
  try {
    console.log(` Subiendo archivo: ${originalName} (${mimetype})`);
    
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${mimetype};base64,${b64}`;

    // Determinar resource_type correcto
    let resourceType = 'raw'; // Por defecto para documentos
    if (mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (mimetype.startsWith('video/')) {
      resourceType = 'video';
    }

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: resourceType,
      public_id: `${Date.now()}_${originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')}`, // Limpiar nombre
      use_filename: true,
      unique_filename: true
    });

    console.log(` Archivo subido exitosamente: ${result.secure_url}`);

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format || originalName.split('.').pop()
    };

  } catch (error) {
    console.error(' Error al subir archivo a Cloudinary:', error);
    console.error('Detalles del error:', error.message);
    throw new Error(`Error al subir el archivo: ${error.message}`);
  }
};

/**
 * Elimina un archivo de Cloudinary
 * @param {String} publicId - Public ID del archivo en Cloudinary
 * @param {String} resourceType - Tipo de recurso ('image', 'video', 'raw')
 */
export const eliminarArchivoCloudinary = async (publicId, resourceType = 'image') => {
  try {
    if (!publicId) {
      console.log(' No se proporcionó publicId para eliminar');
      return;
    }
    
    console.log(` Eliminando archivo: ${publicId} (tipo: ${resourceType})`);
    
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true // Invalidar caché de CDN
    });
    
    console.log(` Archivo eliminado de Cloudinary: ${publicId}`, result);
    return result;
  } catch (error) {
    console.error(' Error al eliminar archivo de Cloudinary:', error);
    // No lanzar error para no interrumpir el flujo principal
  }
};

/**
 * Obtiene información de un archivo en Cloudinary
 * @param {String} publicId - Public ID del archivo
 * @param {String} resourceType - Tipo de recurso ('image', 'video', 'raw')
 * @returns {Promise<Object>} - Información del archivo
 */
export const obtenerInfoArchivo = async (publicId, resourceType = 'image') => {
  try {
    const result = await cloudinary.api.resource(publicId, {
      resource_type: resourceType
    });
    return result;
  } catch (error) {
    console.error('Error al obtener info del archivo:', error);
    return null;
  }
};