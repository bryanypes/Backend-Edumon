// middlewares/cloudinaryMiddleware.js
import multer from 'multer';

const storage = multer.memoryStorage();

// Un fileFilter que llama cb(new Error(...)) sin más termina en el manejador
// global de app.js como 500 "Error interno del servidor" -- confuso para un
// padre que solo adjuntó una foto en un formato no soportado. status:400 hace
// que ese mismo Error caiga en la rama normal de "petición inválida".
const crearErrorDeArchivo = (mensaje) => {
  const error = new Error(mensaje);
  error.status = 400;
  return error;
};

// imágenes: cursos, perfiles
export const uploadImagenCloudinary = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    // heic/heif: formato por defecto de la cámara en iPhones (muy comunes acá)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(crearErrorDeArchivo('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP, HEIC)'), false);
    }
  }
});

// Permite .xlsx y .xlsm: el mimetype que reporta el navegador para .xlsm es
// poco confiable (a veces llega como application/octet-stream), así que la
// extensión del nombre de archivo es el fallback real, igual que antes con .csv.
const esExcel = (file) => {
  const tiposPermitidos = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel.sheet.macroEnabled.12',                    // .xlsm
  ];
  return tiposPermitidos.includes(file.mimetype) ||
    file.originalname.endsWith('.xlsx') ||
    file.originalname.endsWith('.xlsm');
};

// imágenes + Excel, sin validación estricta
export const uploadImagenYCSV = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedImages = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];

    if (allowedImages.includes(file.mimetype) || esExcel(file)) {
      cb(null, true);
    } else {
      cb(crearErrorDeArchivo('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP, HEIC) o archivos Excel (.xlsx, .xlsm)'), false);
    }
  }
});

// APK de Android: se valida por extensión (.apk); el navegador manda mimetypes
// poco fiables para este tipo. Límite alto porque un APK pesa mucho.
export const uploadApk = multer({
  storage: storage,
  limits: {
    fileSize: 200 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.apk')) {
      cb(null, true);
    } else {
      cb(crearErrorDeArchivo('Solo se permiten archivos .apk'), false);
    }
  }
});

export const uploadCSVCloudinary = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo — un .xlsx/.xlsm pesa más que el .csv equivalente
  },
  fileFilter: (req, file, cb) => {
    if (esExcel(file)) {
      cb(null, true);
    } else {
      cb(crearErrorDeArchivo('Solo se permiten archivos Excel (.xlsx, .xlsm)'), false);
    }
  }
});

// adjuntos de entregas: mismo criterio que tareas/foros (imágenes, vídeo .mov
// incluido, audio, PDF, Office, comprimidos)
export const uploadArchivoCloudinary = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain', 'text/csv',
      'video/mp4', 'video/mpeg', 'video/quicktime', 'video/webm', 'video/x-msvideo',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(crearErrorDeArchivo(`Formato de archivo no permitido: ${file.mimetype}`), false);
    }
  }
});