export function getPointDisplayImages(point) {
  if (!point) return [];

  const primaryImage = point.tipo === 'Elevador' && point.imagem2
    ? point.imagem2
    : point.imagem;
  const secondaryImage = primaryImage === point.imagem
    ? point.imagem2
    : point.imagem;

  return [primaryImage, secondaryImage].filter((image, index, images) => Boolean(image) && images.indexOf(image) === index);
}

export function getPrimaryPointDisplayImage(point) {
  return getPointDisplayImages(point)[0] || '';
}