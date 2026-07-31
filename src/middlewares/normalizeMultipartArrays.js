export function normalizeMultipartArrays(campos) {
  return (req, res, next) => {
    for (const campo of campos) {
      const valor = req.body[campo];

      if (typeof valor === 'string') {
        try {
          req.body[campo] = JSON.parse(valor);
        } catch (error) {
          // No hacemos nada; el validador marcará el campo como inválido
          // si no es un JSON válido.
        }
      }
    }
    next();
  };
}
