export const formatPrice = (price: number | undefined, country?: string): string => {
  if (price === undefined || price === null) return 'Grátis';
  const isUK = country === 'Reino Unido';
  return new Intl.NumberFormat(isUK ? 'en-GB' : 'pt-PT', {
    style: 'currency',
    currency: isUK ? 'GBP' : 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};

export const generateSlug = (title: string): string => {
  if (!title) return '';
  return title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[-\s]+/g, '-');
};

export const getAdUrl = (ad: { id: string; title: string }): string => {
  const slug = generateSlug(ad.title);
  return `/anuncio/${slug ? `${slug}-` : ''}${ad.id}`;
};

export const extractIdFromSlug = (param: string | undefined): string => {
  if (!param) return '';
  const parts = param.split('-');
  return parts[parts.length - 1];
};
