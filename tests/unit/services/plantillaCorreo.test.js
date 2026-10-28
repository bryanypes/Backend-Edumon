import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { correoNotificacion, correoRecuperacion, urlWeb, escaparHtml } from '../../../src/services/plantillaCorreo.js';

describe('plantilla de correos', () => {
  beforeEach(() => vi.stubEnv('URL_WEB', 'https://edumon.colegio.test/'));
  afterEach(() => vi.unstubAllEnvs());

  it('escapa el texto que escriben las personas', () => {
    const { html } = correoNotificacion({ nombre: '<b>Ana</b>', rol: 'padre' }, { tipo: 'sistema', mensaje: 'Hola <script>alert(1)</script> & chao' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;Ana&lt;/b&gt;');
    expect(escaparHtml(`"'`)).toBe('&quot;&#39;');
  });

  it('usa la identidad de la web y las imágenes servidas por el colegio', () => {
    const { html } = correoNotificacion({ nombre: 'Ana', rol: 'padre' }, { tipo: 'evento', mensaje: 'Encuentro' });
    for (const color of ['#F23D7F', '#05C7F2', '#FCBD00', '#41D958', '#0C6AC4']) expect(html).toContain(color);
    expect(html).toContain('https://edumon.colegio.test/static/correo/edumon-letras.png');
    expect(html).toContain('https://edumon.colegio.test/static/correo/edumon-mascota.png');
  });

  it('el botón lleva a la pantalla correcta según el rol', () => {
    const ref = '6ad7e61b14bbcba0b5ae2fbe';
    expect(correoNotificacion({ nombre: 'A', rol: 'padre' }, { tipo: 'tarea', referenciaId: ref, mensaje: 'x' }).html)
      .toContain(`https://edumon.colegio.test/familia/entregas/${ref}`);
    expect(correoNotificacion({ nombre: 'A', rol: 'docente' }, { tipo: 'tarea', referenciaId: ref, mensaje: 'x' }).html)
      .toContain('https://edumon.colegio.test/tareas');
    expect(correoNotificacion({ nombre: 'A', rol: 'padre' }, { tipo: 'sistema', mensaje: 'x' }).html)
      .toContain('https://edumon.colegio.test/notificaciones');
  });

  it('un aviso del colegio usa su título y trae versión en texto plano', () => {
    const c = correoNotificacion({ nombre: 'Ana', rol: 'padre' }, { tipo: 'sistema', metadata: { titulo: 'Aviso del colegio' }, mensaje: 'No hay clases' });
    expect(c.subject).toBe('Aviso del colegio · Edumon');
    expect(c.text).toContain('No hay clases');
    expect(c.text).toContain('https://edumon.colegio.test/notificaciones');
  });

  it('la recuperación muestra el código y es el primer número de 6 dígitos del correo', () => {
    const { html, text } = correoRecuperacion({ nombre: 'Milena' }, '483920');
    expect(html.match(/(\d{6})/)[1]).toBe('483920');
    expect(text).toContain('483920');
  });

  it('sin URL_WEB usa FRONTEND_URL y, si falta, el dominio del colegio', () => {
    vi.stubEnv('URL_WEB', '');
    vi.stubEnv('FRONTEND_URL', 'https://a.test, https://b.test');
    expect(urlWeb('/x')).toBe('https://a.test/x');
    vi.stubEnv('FRONTEND_URL', '');
    expect(urlWeb('/x')).toBe('https://edumon.uniautonoma.edu.co/x');
  });
});
