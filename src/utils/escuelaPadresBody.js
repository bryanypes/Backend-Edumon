// Los formularios de retos y eventos mandan el tema de escuela de padres en
// campos planos (son FormData): escuelaPadresEje / Subtema / Tema.
// Devuelve undefined si el body no toca el tema, null si lo quita (eje vacío)
// y el objeto si lo asigna. Limpia esos campos del body para que no se cuelen.
export function extraerEscuelaPadres(body) {
  const { escuelaPadresEje, escuelaPadresSubtema, escuelaPadresTema } = body;
  const tocaElTema = Object.prototype.hasOwnProperty.call(body, 'escuelaPadresEje');

  delete body.escuelaPadres;
  delete body.escuelaPadresEje;
  delete body.escuelaPadresSubtema;
  delete body.escuelaPadresTema;

  if (!tocaElTema) return undefined;
  if (!escuelaPadresEje) return null;
  return {
    eje: escuelaPadresEje,
    subtema: escuelaPadresSubtema || null,
    tema: escuelaPadresTema || null,
  };
}
