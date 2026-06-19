import { formatPrice } from '../utils';

export interface ShareOptions {
  type: 'home' | 'anuncio' | 'vitrine' | 'links' | 'sorteio' | 'generic';
  title?: string;
  price?: number;
  country?: string;
  city?: string;
  description?: string;
  prize?: string;
  url?: string;
}

export function generateShareText(options: ShareOptions): { text: string; url: string; title: string } {
  const baseOrigin = window.location.origin;
  const officialHomeUrl = 'https://www.mercado-luso.com';
  
  let shareUrl = options.url || window.location.href;
  let title = options.title || 'Mercado Luso';
  let formattedText = '';

  switch (options.type) {
    case 'home':
      title = 'Mercado Luso';
      formattedText = `🚀 Conheça o Mercado Luso\n\nUma plataforma criada para unir a comunidade de língua portuguesa através de anúncios, negócios e oportunidades.`;
      shareUrl = officialHomeUrl;
      break;

    case 'anuncio':
      const priceText = (options.price !== undefined && options.price !== null)
        ? formatPrice(options.price, options.country)
        : '';
      
      formattedText = `📢 *${options.title || 'Anúncio'}*\n`;
      if (priceText && priceText !== 'Grátis') {
        formattedText += `💰 Preço: ${priceText}\n`;
      }
      if (options.city) {
        formattedText += `📍 Cidade: ${options.city}\n`;
      }
      formattedText += `\nConfira todos os detalhes no Mercado Luso:`;
      break;

    case 'vitrine':
      formattedText = `🛍️ *${options.title || 'Vitrine Digital'}*\n`;
      if (options.description) {
        formattedText += `📝 ${options.description}\n`;
      }
      formattedText += `\nConheça a nossa vitrine digital no Mercado Luso:`;
      break;

    case 'links':
      formattedText = `ℹ️ *${options.title || 'Links Úteis'}*\n`;
      if (options.description) {
        formattedText += `📝 ${options.description}\n`;
      }
      formattedText += `\nAceda diretamente através do Mercado Luso:`;
      break;

    case 'sorteio':
      formattedText = `🍀 Sorteio: *${options.title || 'Sorteio Gratuito'}*\n`;
      if (options.prize) {
        formattedText += `🎁 Prémio: ${options.prize}\n`;
      }
      formattedText += `\nParticipe gratuitamente e garanta a sua chance no Mercado Luso:`;
      break;

    default:
      formattedText = options.description || `Confira no Mercado Luso!`;
      break;
  }

  return {
    text: formattedText,
    url: shareUrl,
    title
  };
}

export function triggerShare(options: ShareOptions): void {
  const event = new CustomEvent('open-share-modal', { detail: options });
  window.dispatchEvent(event);
}
