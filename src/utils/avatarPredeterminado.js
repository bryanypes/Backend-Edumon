// Único lugar donde vive la URL del avatar predeterminado — antes había dos
// constantes distintas (authController.js y userController.js) apuntando a
// URLs diferentes (una con "avatar1.webp" en minúscula, obsoleta/rota, y otra
// con "Avatar1.webp"). El public_id real en Cloudinary es case-sensitive y lo
// define el nombre del archivo local (ver scripts/subirFotosPredeterminadas.js),
// que es "Avatar1.svg" — así que esta es la URL válida.
export const AVATAR_PREDETERMINADO =
  'https://res.cloudinary.com/djvilfslm/image/upload/v1784650360/fotos-perfil-predeterminadas/Avatar1.webp';
