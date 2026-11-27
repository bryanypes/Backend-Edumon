import User from '../models/User.js';

// Versiones anteriores crearon un índice TTL sobre refreshTokens.expiraEn. Como el
// campo está dentro de un arreglo, MongoDB borraba el usuario completo cuando vencía
// su sesión más antigua. El esquema ya no lo declara, pero una base existente lo
// conserva: se elimina al arrancar. Si no existe, no hace nada.
export const INDICE_TTL_SESIONES = 'refreshTokens.expiraEn_1';

const NO_EXISTE = new Set(['IndexNotFound', 'NamespaceNotFound']);

export const eliminarIndiceTTLSesiones = async (coleccion = User.collection) => {
  try {
    await coleccion.dropIndex(INDICE_TTL_SESIONES);
    console.log(`[indices] Índice ${INDICE_TTL_SESIONES} eliminado`);
    return true;
  } catch (error) {
    if (NO_EXISTE.has(error?.codeName) || error?.code === 27 || error?.code === 26) return false;
    throw error;
  }
};
