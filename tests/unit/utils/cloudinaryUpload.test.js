import { describe, it, expect, beforeEach } from 'vitest';
import {
  subirImagenCloudinary,
  subirArchivoCloudinary,
  eliminarArchivoCloudinary,
  obtenerInfoArchivo,
} from '../../../src/utils/cloudinaryUpload.js';
import {
  cloudinaryUploadMock,
  cloudinaryDestroyMock,
  cloudinaryResourceMock,
} from '../../setup/mocks.js';

describe('cloudinaryUpload (SDK de Cloudinary mockeado)', () => {
  beforeEach(() => {
    cloudinaryUploadMock.mockClear();
    cloudinaryDestroyMock.mockClear();
    cloudinaryResourceMock.mockClear();
  });

  it('subirImagenCloudinary sube el buffer como data URI y devuelve url + publicId', async () => {
    const buffer = Buffer.from('fake-image-bytes');
    const resultado = await subirImagenCloudinary(buffer, 'image/jpeg', 'fotos-perfil');

    expect(resultado.url).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    expect(resultado.publicId).toMatch(/^fotos-perfil\//);
    expect(cloudinaryUploadMock).toHaveBeenCalledTimes(1);

    const [dataUri, options] = cloudinaryUploadMock.mock.calls[0];
    expect(dataUri).toMatch(/^data:image\/jpeg;base64,/);
    expect(options.folder).toBe('fotos-perfil');
    expect(options.resource_type).toBe('auto');
  });

  it('subirImagenCloudinary propaga un error genérico si Cloudinary falla', async () => {
    cloudinaryUploadMock.mockRejectedValueOnce(new Error('timeout de red'));
    await expect(
      subirImagenCloudinary(Buffer.from('x'), 'image/png', 'general'),
    ).rejects.toThrow('Error al subir la imagen');
  });

  it('subirArchivoCloudinary detecta resource_type image/video/raw según el mimetype', async () => {
    await subirArchivoCloudinary(Buffer.from('x'), 'image/png', 'carpeta', 'foto.png');
    expect(cloudinaryUploadMock.mock.calls.at(-1)[1].resource_type).toBe('image');

    await subirArchivoCloudinary(Buffer.from('x'), 'video/mp4', 'carpeta', 'video.mp4');
    expect(cloudinaryUploadMock.mock.calls.at(-1)[1].resource_type).toBe('video');

    await subirArchivoCloudinary(Buffer.from('x'), 'application/pdf', 'carpeta', 'doc.pdf');
    expect(cloudinaryUploadMock.mock.calls.at(-1)[1].resource_type).toBe('raw');
  });

  it('subirArchivoCloudinary limpia caracteres especiales del nombre original en el public_id', async () => {
    await subirArchivoCloudinary(Buffer.from('x'), 'application/pdf', 'carpeta', 'Informe Final (v2).pdf');
    const options = cloudinaryUploadMock.mock.calls.at(-1)[1];
    expect(options.public_id).toMatch(/^\d+_Informe_Final__v2_$/);
  });

  it('eliminarArchivoCloudinary no llama a destroy si no hay publicId', async () => {
    await eliminarArchivoCloudinary(null, 'image');
    expect(cloudinaryDestroyMock).not.toHaveBeenCalled();
  });

  it('eliminarArchivoCloudinary llama a destroy con el resourceType e invalidate:true', async () => {
    await eliminarArchivoCloudinary('carpeta/archivo123', 'video');
    expect(cloudinaryDestroyMock).toHaveBeenCalledWith('carpeta/archivo123', {
      resource_type: 'video',
      invalidate: true,
    });
  });

  it('eliminarArchivoCloudinary no lanza si Cloudinary falla (no debe romper el flujo principal)', async () => {
    cloudinaryDestroyMock.mockRejectedValueOnce(new Error('no encontrado'));
    await expect(eliminarArchivoCloudinary('carpeta/x', 'image')).resolves.toBeUndefined();
  });

  it('obtenerInfoArchivo devuelve null si Cloudinary falla', async () => {
    cloudinaryResourceMock.mockRejectedValueOnce(new Error('no existe'));
    expect(await obtenerInfoArchivo('carpeta/x', 'image')).toBeNull();
  });
});
