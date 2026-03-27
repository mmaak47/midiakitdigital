export function getPrimaryPointScreenImage(point) {
  if (!point) return '';
  return point.imagem || point.imagem2 || '';
}

export function getPrimaryPointMediaKitImage(point) {
  if (!point) return '';
  return point.imagem2 || point.imagem || '';
}

export function getPointDisplayImages(point) {
  if (!point) return [];

  const primaryImage = getPrimaryPointMediaKitImage(point);
  const secondaryImage = primaryImage === point.imagem
    ? point.imagem2
    : point.imagem;

  return [primaryImage, secondaryImage].filter((image, index, images) => Boolean(image) && images.indexOf(image) === index);
}

export function getPrimaryPointDisplayImage(point) {
  return getPrimaryPointMediaKitImage(point);
}