import cloudinary from '../config/cloudinary.js';

export const subirImagenCloudinary = async (fileBuffer, mimetype, folder = 'general') => {
  try {
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${mimetype};base64,${b64}`;

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: 'auto',
      transformation: [
        { width: 1200, crop: 'limit' },
        { quality: 'auto:good' }
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

export const subirArchivoCloudinary = async (fileBuffer, mimetype, folder = 'archivos', originalName = 'archivo') => {
  try {
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${mimetype};base64,${b64}`;

    let resourceType = 'raw';
    if (mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (mimetype.startsWith('video/')) {
      resourceType = 'video';
    }

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: resourceType,
      public_id: `${Date.now()}_${originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')}`,
      use_filename: true,
      unique_filename: true
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format || originalName.split('.').pop()
    };

  } catch (error) {
    console.error('Error al subir archivo a Cloudinary:', error.message);
    throw new Error(`Error al subir el archivo: ${error.message}`);
  }
};

export const eliminarArchivoCloudinary = async (publicId, resourceType = 'image') => {
  try {
    if (!publicId) return;

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      invalidate: true
    });
  } catch (error) {
    console.error('Error al eliminar archivo de Cloudinary:', error.message);
    // no lanzar: no queremos que esto tumbe el flujo principal
  }
};

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