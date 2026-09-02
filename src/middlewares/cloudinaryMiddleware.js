// middlewares/cloudinaryMiddleware.js
import multer from 'multer';

const storage = multer.memoryStorage();

// imágenes: cursos, perfiles
export const uploadImagenCloudinary = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP)'), false);
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
    const allowedImages = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];

    if (allowedImages.includes(file.mimetype) || esExcel(file)) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes (JPEG, PNG, GIF, WEBP) o archivos Excel (.xlsx, .xlsm)'), false);
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
      cb(new Error('Solo se permiten archivos .apk'), false);
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
      cb(new Error('Solo se permiten archivos Excel (.xlsx, .xlsm)'), false);
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
      'image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp',
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
      cb(new Error(`Formato de archivo no permitido: ${file.mimetype}`), false);
    }
  }
});