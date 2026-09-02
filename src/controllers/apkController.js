import Apk from '../models/Apk.js';
import cloudinary from '../config/cloudinary.js';
import { eliminarArchivoCloudinary } from '../utils/cloudinaryUpload.js';
import { getFileBuffer } from '../utils/fileUploadHelper.js';

// fl_attachment fuerza que el navegador descargue el archivo en vez de intentar abrirlo
const urlDescarga = (url) =>
  typeof url === 'string' && url.includes('/raw/upload/')
    ? url.replace('/raw/upload/', '/raw/upload/fl_attachment/')
    : url;

const publico = (apk) => ({
  id: apk._id,
  version: apk.version,
  versionCode: apk.versionCode ?? null,
  notas: apk.notas ?? null,
  url: apk.url,
  urlDescarga: urlDescarga(apk.url),
  tamano: apk.tamano,
  nombreArchivo: apk.nombreArchivo ?? null,
  obligatoria: apk.obligatoria,
  activa: apk.activa,
  fecha: apk.createdAt
});

// Sube el .apk a Cloudinary como raw. Timeout amplio: un APK pesa bastante más
// que el resto de adjuntos del sistema.
const subirApkACloudinary = async (fileBuffer) => {
  const b64 = Buffer.from(fileBuffer).toString('base64');
  const dataURI = `data:application/vnd.android.package-archive;base64,${b64}`;
  const publicId = `apks/edumon_${Date.now()}.apk`;

  const result = await cloudinary.uploader.upload(dataURI, {
    resource_type: 'raw',
    type: 'upload',
    public_id: publicId,
    use_filename: false,
    unique_filename: false,
    timeout: 120000
  });

  return { url: result.secure_url, publicId: result.public_id };
};

export const getApkActual = async (req, res) => {
  try {
    const apk = await Apk.findOne({ activa: true }).sort({ createdAt: -1 });
    if (!apk) {
      return res.status(404).json({ message: 'Todavía no hay ninguna versión disponible para descargar' });
    }
    res.json({ apk: publico(apk) });
  } catch (error) {
    console.error('Error al obtener el APK actual:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const listarApks = async (req, res) => {
  try {
    const apks = await Apk.find().sort({ createdAt: -1 }).populate('subidaPor', 'nombre apellido correo');
    res.json({ apks: apks.map((a) => ({ ...publico(a), subidaPor: a.subidaPor || null })) });
  } catch (error) {
    console.error('Error al listar APKs:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const subirApk = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Adjunta el archivo .apk en el campo "apk"' });
    }

    const { version, versionCode, notas, obligatoria } = req.body;
    if (!version || !String(version).trim()) {
      return res.status(400).json({ message: 'La versión es obligatoria (ej. 1.4.2)' });
    }

    const fileBuffer = await getFileBuffer(req.file);
    if (!fileBuffer) {
      return res.status(400).json({ message: 'No se pudo leer el archivo' });
    }

    let subido;
    try {
      subido = await subirApkACloudinary(fileBuffer);
    } catch (error) {
      console.error('Error al subir el APK a Cloudinary:', error.message);
      return res.status(503).json({ message: 'No se pudo subir el archivo. Revisa la conexión e inténtalo de nuevo.' });
    }

    const nueva = new Apk({
      version: String(version).trim(),
      versionCode: versionCode !== undefined && versionCode !== '' ? Number(versionCode) : undefined,
      notas: notas ? String(notas).trim() : undefined,
      url: subido.url,
      publicId: subido.publicId,
      tamano: req.file.size,
      nombreArchivo: req.file.originalname,
      obligatoria: obligatoria === true || obligatoria === 'true',
      activa: true,
      subidaPor: req.user.userId
    });

    let guardada;
    try {
      guardada = await nueva.save();
    } catch (saveError) {
      await eliminarArchivoCloudinary(subido.publicId, 'raw', 'upload');
      if (saveError.name === 'ValidationError') {
        return res.status(400).json({ message: 'Errores de validación', errors: Object.values(saveError.errors).map((e) => ({ path: e.path, msg: e.message })) });
      }
      throw saveError;
    }

    // solo una versión activa a la vez
    await Apk.updateMany({ _id: { $ne: guardada._id }, activa: true }, { activa: false });

    res.status(201).json({ message: 'APK subido correctamente', apk: publico(guardada) });
  } catch (error) {
    console.error('Error al subir el APK:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const actualizarApk = async (req, res) => {
  try {
    const { id } = req.params;
    const apk = await Apk.findById(id);
    if (!apk) return res.status(404).json({ message: 'Versión no encontrada' });

    const { version, versionCode, notas, obligatoria, activa } = req.body;

    if (version !== undefined) apk.version = String(version).trim();
    if (versionCode !== undefined) apk.versionCode = versionCode === '' ? undefined : Number(versionCode);
    if (notas !== undefined) apk.notas = notas ? String(notas).trim() : undefined;
    if (obligatoria !== undefined) apk.obligatoria = obligatoria === true || obligatoria === 'true';
    if (activa !== undefined) apk.activa = activa === true || activa === 'true';

    await apk.save();

    if (apk.activa) {
      await Apk.updateMany({ _id: { $ne: apk._id }, activa: true }, { activa: false });
    }

    res.json({ message: 'Versión actualizada', apk: publico(apk) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Errores de validación', errors: Object.values(error.errors).map((e) => ({ path: e.path, msg: e.message })) });
    }
    console.error('Error al actualizar el APK:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};

export const eliminarApk = async (req, res) => {
  try {
    const { id } = req.params;
    const apk = await Apk.findById(id);
    if (!apk) return res.status(404).json({ message: 'Versión no encontrada' });

    await eliminarArchivoCloudinary(apk.publicId, 'raw', 'upload');
    await apk.deleteOne();

    // si se borró la activa, se promueve la más reciente que quede
    if (apk.activa) {
      const siguiente = await Apk.findOne().sort({ createdAt: -1 });
      if (siguiente && !siguiente.activa) {
        siguiente.activa = true;
        await siguiente.save();
      }
    }

    res.json({ message: 'Versión eliminada' });
  } catch (error) {
    console.error('Error al eliminar el APK:', error);
    res.status(500).json({ message: 'Error interno del servidor' });
  }
};
