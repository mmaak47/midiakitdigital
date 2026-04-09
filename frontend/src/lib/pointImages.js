function normalizeUrl(value) {
  const url = String(value || '').trim();
  return url || '';
}

export function getPointDisplayImages(point) {
  if (!point) return [];

  const candidates = [
    ...(Array.isArray(point.photos) ? point.photos : []),
    ...(Array.isArray(point.fotos) ? point.fotos : []),
    point.photo,
    point.photo2,
    point.foto,
    point.foto2,
    point.imagem2,
    point.imagem
  ];

  return candidates
    .map(normalizeUrl)
    .filter((image, index, images) => Boolean(image) && images.indexOf(image) === index);
}

export function getPrimaryPointScreenImage(point) {
  const images = getPointDisplayImages(point);
  return images[0] || '';
}

export function getPrimaryPointMediaKitImage(point) {
  const images = getPointDisplayImages(point);
  if (!images.length) return '';
  return images[0];
}

export function getPrimaryPointDisplayImage(point) {
  return getPrimaryPointMediaKitImage(point);
}