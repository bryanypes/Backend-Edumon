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

// mimetype -> resource_type de Cloudinary
export const resourceTypeDeMime = (mimetype = '') => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
};

// con { privado: true } sube como type=authenticated: la URL no sirve sin firma,
// solo se puede ver con una URL firmada temporal (firmarUrlArchivo)
export const subirArchivoCloudinary = async (fileBuffer, mimetype, folder = 'archivos', originalName = 'archivo', { privado = false } = {}) => {
  try {
    const b64 = Buffer.from(fileBuffer).toString('base64');
    const dataURI = `data:${mimetype};base64,${b64}`;

    const resourceType = resourceTypeDeMime(mimetype);
    const tipo = privado ? 'authenticated' : 'upload';

    const result = await cloudinary.uploader.upload(dataURI, {
      folder: folder,
      resource_type: resourceType,
      type: tipo,
      public_id: `${Date.now()}_${originalName.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_')}`,
      use_filename: true,
      unique_filename: true
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format || originalName.split('.').pop(),
      resourceType,
      tipo
    };

  } catch (error) {
    console.error('Error al subir archivo a Cloudinary:', error.message);
    throw new Error(`Error al subir el archivo: ${error.message}`);
  }
};

// URL firmada y con caducidad para un archivo authenticated; null si algo falla
export const firmarUrlArchivo = (publicId, { resourceType = 'raw', expiraEnSeg = 2 * 60 * 60 } = {}) => {
  try {
    if (!publicId) return null;
    return cloudinary.url(publicId, {
      type: 'authenticated',
      resource_type: resourceType,
      secure: true,
      sign_url: true,
      expires_at: Math.floor(Date.now() / 1000) + expiraEnSeg
    });
  } catch (error) {
    console.error('Error al firmar URL de Cloudinary:', error.message);
    return null;
  }
};

export const eliminarArchivoCloudinary = async (publicId, resourceType = 'image', tipo = 'upload') => {
  try {
    if (!publicId) return;

    return await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: tipo,
      invalidate: true
    });
  } catch (error) {
    console.error('Error al eliminar archivo de Cloudinary:', error.message);
    // no lanzar: no queremos que esto tumbe el flujo principal
  }
};