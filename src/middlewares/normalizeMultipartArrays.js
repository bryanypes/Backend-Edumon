export function normalizeMultipartArrays(campos) {
  return (req, res, next) => {
    for (const campo of campos) {
      const valor = req.body[campo];
      if (typeof valor === 'string') {
        try {
          req.body[campo] = JSON.parse(valor);
        } catch {
          // El valor no es JSON válido. Dejamos que los validadores existentes
          // rechacen el campo si corresponde.
        }
      }
    }
    next();
  };
}
