// Plantilla única de correos de Edumon, con la identidad de la web: franja de colores
// de la marca, azul Edumon, la mascota, tipografía Nunito y un botón para abrir la app.
//
// Escrita para clientes de correo (Gmail, Outlook, iOS Mail): tablas y estilos en
// línea, sin posiciones ni difuminados que ellos ignoran. Si el cliente bloquea las
// imágenes, se sigue leyendo bien (alt, colores y botón son HTML).
//
// Todo texto que viene de personas (nombres, mensajes del colegio) se escapa.

const MARCA = {
  azul: '#0C6AC4',
  azulOscuro: '#0B3A6E',
  texto: '#1F2D3D',
  suave: '#5B6B7F',
  fondo: '#EEF4FA',
  borde: '#DCE6F0',
  franja: ['#F23D7F', '#05C7F2', '#FCBD00', '#41D958', '#0C6AC4'],
};

const FUENTE = "'Nunito', 'Segoe UI', Helvetica, Arial, sans-serif";

// cada tipo de notificación con su color de la marca y su etiqueta
const TIPOS = {
  tarea: { etiqueta: 'Nuevo reto', titulo: 'Tienes un reto nuevo', color: '#0C6AC4', fondo: '#E7F1FB' },
  entrega: { etiqueta: 'Nueva entrega', titulo: 'Recibiste una entrega', color: '#1E8E3E', fondo: '#E8F7EC' },
  calificacion: { etiqueta: 'Valoración', titulo: 'Tu entrega fue valorada', color: '#B7791F', fondo: '#FFF6DD' },
  foro: { etiqueta: 'Foro', titulo: 'Hay un mensaje nuevo en el foro', color: '#0284A8', fondo: '#E3F7FC' },
  evento: { etiqueta: 'Evento', titulo: 'Tienes un evento próximo', color: '#D42B68', fondo: '#FDE8F0' },
  sistema: { etiqueta: 'Aviso', titulo: 'Tienes un aviso del colegio', color: '#0B3A6E', fondo: '#E7EDF5' },
};

export const escaparHtml = (texto = '') => String(texto)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Dirección pública de la web (para enlaces e imágenes). */
export function urlWeb(ruta = '/') {
  const base = (process.env.URL_WEB
    || (process.env.FRONTEND_URL || '').split(',').map((u) => u.trim()).find(Boolean)
    || 'https://edumon.uniautonoma.edu.co').replace(/\/+$/, '');
  return `${base}${ruta.startsWith('/') ? ruta : `/${ruta}`}`;
}

// párrafos: respeta los saltos de línea que escribió el colegio
const parrafosHtml = (parrafos) => parrafos
  .filter(Boolean)
  .map((p) => `<p style="margin:0 0 14px;font-family:${FUENTE};font-size:16px;line-height:1.6;color:${MARCA.texto};">${escaparHtml(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

const franja = () => `<tr><td style="padding:0;font-size:0;line-height:0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    ${MARCA.franja.map((c) => `<td height="6" style="height:6px;background:${c};font-size:0;line-height:0;">&nbsp;</td>`).join('')}
  </tr></table></td></tr>`;

const boton = ({ texto, url }, color = MARCA.azul) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 6px;">
    <tr><td align="center" bgcolor="${color}" style="border-radius:999px;background:${color};">
      <a href="${escaparHtml(url)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:${FUENTE};font-size:16px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:999px;">${escaparHtml(texto)}</a>
    </td></tr>
  </table>`;

/**
 * Arma el correo completo.
 * @param {object} o
 * @param {string} o.titulo        título grande
 * @param {string} [o.etiqueta]    chip de categoría (ej. "Nuevo reto")
 * @param {string} [o.color]       color de la categoría
 * @param {string} [o.fondoEtiqueta]
 * @param {string} [o.saludo]      nombre de la persona
 * @param {string[]} [o.parrafos]  texto (se escapa)
 * @param {string} [o.destacado]   bloque grande (ej. código de verificación)
 * @param {{texto:string,url:string}} [o.boton]
 * @param {string} [o.nota]        texto pequeño bajo el botón
 * @param {string} [o.preheader]   vista previa en la bandeja
 */
export function plantillaCorreo({ titulo, etiqueta, color = MARCA.azul, fondoEtiqueta = '#E7F1FB', saludo, parrafos = [], destacado, boton: btn, nota, preheader = '' }) {
  const anio = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="es" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${escaparHtml(titulo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap" rel="stylesheet">
<style>
  @media (max-width: 620px) {
    .e-contenedor { width: 100% !important; }
    .e-pad { padding-left: 22px !important; padding-right: 22px !important; }
    .e-titulo { font-size: 22px !important; }
  }
  a { color: ${MARCA.azul}; }
</style>
</head>
<body style="margin:0;padding:0;background:${MARCA.fondo};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escaparHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MARCA.fondo};">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" class="e-contenedor" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${MARCA.borde};border-radius:20px;overflow:hidden;">
    ${franja()}
    <tr><td align="center" style="padding:26px 24px 6px;">
      <a href="${escaparHtml(urlWeb('/'))}" target="_blank" style="text-decoration:none;">
        <img src="${escaparHtml(urlWeb('/static/correo/edumon-letras.png'))}" width="190" alt="Edumon" style="display:block;width:190px;max-width:190px;height:auto;border:0;font-family:${FUENTE};font-size:28px;font-weight:900;color:${MARCA.azul};">
      </a>
    </td></tr>

    <tr><td class="e-pad" style="padding:10px 40px 8px;">
      ${etiqueta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr>
        <td style="background:${fondoEtiqueta};border-radius:999px;padding:6px 14px;font-family:${FUENTE};font-size:13px;font-weight:800;color:${color};letter-spacing:.02em;">${escaparHtml(etiqueta)}</td>
      </tr></table>` : ''}
      <h1 class="e-titulo" style="margin:0 0 18px;font-family:${FUENTE};font-size:26px;line-height:1.25;font-weight:900;color:${MARCA.azulOscuro};">${escaparHtml(titulo)}</h1>

      <!-- Edumon "habla", como en el chat de la web -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 6px;"><tr>
        <td width="64" valign="top" style="width:64px;padding:2px 14px 0 0;">
          <img src="${escaparHtml(urlWeb('/static/correo/edumon-mascota.png'))}" width="56" alt="" style="display:block;width:56px;height:auto;border:0;">
        </td>
        <td valign="top">
          ${saludo ? `<p style="margin:0 0 12px;font-family:${FUENTE};font-size:17px;font-weight:800;color:${MARCA.texto};">Hola, ${escaparHtml(saludo)} 👋</p>` : ''}
          ${parrafosHtml(parrafos)}
        </td>
      </tr></table>

      ${destacado ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 18px;"><tr>
        <td align="center" style="background:#E7F1FB;border:2px dashed #9CC9F0;border-radius:16px;padding:18px 10px;font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:${MARCA.azulOscuro};">${escaparHtml(destacado)}</td>
      </tr></table>` : ''}

      ${btn ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">${boton(btn, color === MARCA.azulOscuro ? MARCA.azul : color)}</td></tr></table>` : ''}
      ${nota ? `<p style="margin:12px 0 0;font-family:${FUENTE};font-size:13.5px;line-height:1.55;color:${MARCA.suave};text-align:center;">${escaparHtml(nota)}</p>` : ''}
    </td></tr>

    <tr><td class="e-pad" style="padding:26px 40px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-top:1px solid ${MARCA.borde};padding-top:18px;font-family:${FUENTE};font-size:12.5px;line-height:1.6;color:${MARCA.suave};text-align:center;">
          Recibes este correo porque tienes una cuenta en <a href="${escaparHtml(urlWeb('/'))}" target="_blank" style="color:${MARCA.azul};font-weight:700;text-decoration:none;">Edumon</a>.<br>
          Es un correo automático: por favor no lo respondas.<br>
          © ${anio} Edumon · Acompañamos a las familias en la crianza y la vida escolar.
        </td>
      </tr></table>
    </td></tr>
  </table>

</td></tr>
</table>
</body>
</html>`;
}

/** Texto plano equivalente (mejora la entrega y lo leen los relojes y lectores). */
const textoPlano = ({ titulo, saludo, parrafos = [], destacado, boton: btn, nota }) => [
  titulo, '',
  saludo ? `Hola, ${saludo}` : null,
  ...parrafos, destacado ? `\n${destacado}\n` : null,
  btn ? `${btn.texto}: ${btn.url}` : null,
  nota, '', '— Edumon · correo automático, no respondas',
].filter((l) => l !== null && l !== undefined).join('\n');

// a dónde lleva el botón según el tipo y el rol de quien recibe
function enlaceNotificacion(usuario, notificacion) {
  const ref = notificacion.referenciaId ? String(notificacion.referenciaId._id ?? notificacion.referenciaId) : null;
  const esFamilia = ['padre', 'padre/tutor'].includes(usuario.rol);
  if (notificacion.tipo === 'tarea' && ref) return esFamilia ? urlWeb(`/familia/entregas/${ref}`) : urlWeb('/tareas');
  if (notificacion.tipo === 'evento') return urlWeb('/calendario');
  if (notificacion.tipo === 'foro') return urlWeb(esFamilia ? '/familia/foros' : '/foros');
  if (notificacion.tipo === 'calificacion' && esFamilia) return urlWeb('/familia/entregas');
  return urlWeb('/notificaciones');
}

const BOTONES = {
  tarea: 'Ver el reto', entrega: 'Ver la entrega', calificacion: 'Ver mi valoración',
  foro: 'Ir al foro', evento: 'Ver en el calendario', sistema: 'Abrir Edumon',
};

/** Correo de una notificación (reto, entrega, foro, evento, aviso del colegio...). */
export function correoNotificacion(usuario, notificacion) {
  const tipo = TIPOS[notificacion.tipo] ?? TIPOS.sistema;
  const titulo = notificacion.metadata?.titulo || tipo.titulo;
  const datos = {
    titulo,
    etiqueta: tipo.etiqueta,
    color: tipo.color,
    fondoEtiqueta: tipo.fondo,
    saludo: usuario.nombre,
    parrafos: [notificacion.mensaje],
    boton: { texto: BOTONES[notificacion.tipo] ?? BOTONES.sistema, url: enlaceNotificacion(usuario, notificacion) },
    preheader: notificacion.mensaje,
  };
  return { subject: `${titulo} · Edumon`, html: plantillaCorreo(datos), text: textoPlano(datos) };
}

/** Correo con el código para restablecer la contraseña. */
export function correoRecuperacion(usuario, codigo) {
  const datos = {
    titulo: 'Restablece tu contraseña',
    etiqueta: 'Seguridad de tu cuenta',
    saludo: usuario.nombre,
    parrafos: ['Recibimos una solicitud para restablecer la contraseña de tu cuenta. Escribe este código en Edumon para continuar:'],
    destacado: String(codigo),
    nota: 'El código vence en 15 minutos. Si no lo pediste, ignora este correo: tu contraseña no cambia.',
    preheader: 'Tu código para restablecer la contraseña',
  };
  return { subject: 'Tu código para restablecer la contraseña · Edumon', html: plantillaCorreo(datos), text: textoPlano(datos) };
}
