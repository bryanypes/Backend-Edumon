import multer from 'multer';

// Notas de voz (apagado por defecto: IA_NOTAS_VOZ=true para activarlo).
// El audio queda solo en memoria mientras se transcribe; nunca se guarda.
//   IA_AUDIO_MAX_MB        tamaño máximo (por defecto 10)
//   IA_AUDIO_MAX_SEGUNDOS  duración máxima (por defecto 120; se valida con la
//                          duración que reporta la transcripción)

export const notasVozActivas = () => process.env.IA_NOTAS_VOZ === 'true';
export const maxSegundosAudio = () => (Number(process.env.IA_AUDIO_MAX_SEGUNDOS) > 0 ? Number(process.env.IA_AUDIO_MAX_SEGUNDOS) : 120);
// multer necesita un entero de bytes
const maxBytes = () => Math.max(1, Math.floor((Number(process.env.IA_AUDIO_MAX_MB) > 0 ? Number(process.env.IA_AUDIO_MAX_MB) : 10) * 1024 * 1024));

export const TIPOS_AUDIO = ['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/aac'];

export const requireNotasVoz = (req, res, next) => {
  if (!notasVozActivas()) {
    return res.status(404).json({ message: 'Las notas de voz no están activadas en este servidor', code: 'NOTAS_VOZ_DESACTIVADAS' });
  }
  next();
};

// multer se crea por petición para leer el límite vigente de la variable de entorno
export const recibirAudio = (req, res, next) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxBytes(), files: 1 },
  fileFilter: (_req, file, cb) => {
    // el tipo puede venir con parámetros ("audio/webm;codecs=opus")
    const tipo = String(file.mimetype).split(';')[0].trim().toLowerCase();
    if (TIPOS_AUDIO.includes(tipo)) return cb(null, true);
    const error = new Error(`Tipo de audio no permitido (${tipo}). Usa webm, ogg, mp3, m4a, wav o aac.`);
    error.status = 400;
    return cb(error, false);
  },
}).single('audio')(req, res, (error) => {
  if (!error) return next();
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: `El audio supera ${Number(process.env.IA_AUDIO_MAX_MB) > 0 ? process.env.IA_AUDIO_MAX_MB : 10} MB`, code: 'AUDIO_DEMASIADO_GRANDE' });
  }
  return res.status(error.status || 400).json({ message: error.message, code: 'AUDIO_INVALIDO' });
});
