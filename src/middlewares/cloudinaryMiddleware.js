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

export const uploadArchivoCloudinary = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB máximo
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/jpg',
      'video/mp4', 
      'video/mpeg', 
      'video/webm' 
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Formato de archivo no permitido'), false);
    }
  }
});