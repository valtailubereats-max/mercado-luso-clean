export const formatPrice = (price: number | undefined): string => {
  if (price === undefined || price === null) return 'Grátis';
  return new Intl.NumberFormat('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(price);
};
