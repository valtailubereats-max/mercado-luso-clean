import { Request, Response } from 'express';

// Decodificador de HTML Entities
const decodeHtmlEntities = (str: string): string => {
  if (!str) return '';
  let temp = str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  
  try {
    temp = temp.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  } catch (e) {
    // ignore
  }
  return temp;
};

// Limpador do título
const cleanTitle = (title: string): string => {
  if (!title) return '';
  let temp = decodeHtmlEntities(title)
    .replace(/\s*-\s*à venda\s*-\s*.*$/gi, '')
    .replace(/\s*-\s*OLX\s*Portugal.*$/gi, '')
    .replace(/\s*-\s*OLX.*$/gi, '')
    .replace(/\s*[|]\s*Gumtree.*$/gi, '')
    .replace(/\s*-\s*Gumtree.*$/gi, '')
    .replace(/\s*in\s+[^|]+[|]\s*Gumtree.*$/gi, '')
    .replace(/\|.*$/gi, '')
    .trim();

  // Remove emojis raros para manter o design clean
  temp = temp.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
  
  // Substitui espacos duplicados
  temp = temp.replace(/\s+/g, ' ');

  return temp.trim();
};

// Limpador da descrição
const cleanDescription = (desc: string): string => {
  if (!desc) return '';
  let temp = decodeHtmlEntities(desc);
  
  // Remove tags HTML se houver
  temp = temp.replace(/<[^>]*>/g, '');

  // Remove caracteres de controle mantendo normais o carriage return e quebras de linha
  temp = temp.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

  temp = temp.replace(/\r/g, '');
  temp = temp.replace(/\n{3,}/g, '\n\n'); // Permite no máximo 2 novas linhas consecutivas
  temp = temp.split('\n').map(line => line.trim()).join('\n');
  temp = temp.split('\n').map(line => line.replace(/[ \t]{2,}/g, ' ')).join('\n'); // Evita visual spacing slop

  return temp.trim();
};

// Parseador de preço
const parsePrice = (priceStr: string | number | undefined | null): number => {
  if (priceStr === undefined || priceStr === null) return 0;
  if (typeof priceStr === 'number') return priceStr;
  
  let str = String(priceStr).trim();
  if (!str) return 0;

  // Remove símbolos monetários e espaços
  str = str.replace(/[€$£\s]/g, '');

  // Analisa o estilo decimal
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');
  
  if (lastComma > lastDot && (lastComma === str.length - 3 || lastComma === str.length - 2)) {
    // Virgula decimal europeia: 1.250,50 ou 1250,5
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma && (lastDot === str.length - 3 || lastDot === str.length - 2)) {
    // Ponto decimal americano: 1,250.50
    str = str.replace(/,/g, '');
  } else {
    // Sem fração decimal explicita
    str = str.replace(/[.,]/g, '');
  }

  // Captura o primeiro digito correspondente
  const match = str.match(/\d+(?:\.\d+)?/);
  if (match) {
    const parsed = parseFloat(match[0]);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// Extrair tag Meta de HTML
const extractMetaContent = (html: string, nameOrProperty: string): string | null => {
  const regexes = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${nameOrProperty}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${nameOrProperty}["']`, 'i')
  ];
  for (const regex of regexes) {
    const match = html.match(regex);
    if (match) {
      return decodeHtmlEntities(match[1]);
    }
  }
  return null;
};

// Extrair JsonLd de HTML
const extractJsonLd = (html: string): any[] => {
  const results: any[] = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (parsed) {
        results.push(parsed);
      }
    } catch (e) {
      // ignore
    }
  }
  return results;
};

// Extrair dados do Produto do JsonLd listado
const extractFromJsonLdList = (jsonLdList: any[]): any => {
  for (const obj of jsonLdList) {
    if (!obj) continue;
    const searchProduct = (item: any): any => {
      if (!item) return null;
      if (typeof item !== 'object') return null;
      if (Array.isArray(item)) {
        for (const child of item) {
          const res = searchProduct(child);
          if (res) return res;
        }
      } else {
        const typeStr = String(item['@type'] || '').toLowerCase();
        if (typeStr === 'product' || typeStr === 'productmodel') {
          return item;
        }
        if (item['@graph']) {
          const res = searchProduct(item['@graph']);
          if (res) return res;
        }
        for (const k of Object.keys(item)) {
          const res = searchProduct(item[k]);
          if (res) return res;
        }
      }
      return null;
    };
    const productNode = searchProduct(obj);
    if (productNode) {
      return productNode;
    }
  }
  return null;
};

// Encontrar localidade em JsonLd
const findLocationInJsonLd = (obj: any): string | null => {
  if (!obj) return null;
  if (typeof obj !== 'object') return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const loc = findLocationInJsonLd(item);
      if (loc) return loc;
    }
  } else {
    if (obj.addressLocality) {
      return String(obj.addressLocality);
    }
    if (obj.addressRegion) {
      return String(obj.addressRegion);
    }
    for (const k of Object.keys(obj)) {
      const loc = findLocationInJsonLd(obj[k]);
      if (loc) return loc;
    }
  }
  return null;
};

// Handler Serverless Function da Vercel para Produção
export default async function handler(req: any, res: any) {
  // Configuração rápida de CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { url, userRole } = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    // Verificação de segurança (apenas admin ou moderador)
    if (userRole !== 'admin' && userRole !== 'moderator') {
      return res.status(403).json({ 
        success: false, 
        error: 'Acesso negado. Apenas administradores ou moderadores podem realizar a importação.' 
      });
    }

    if (!url) {
      return res.status(400).json({ error: "Falta o link do anúncio." });
    }

    const lowerUrl = url.toLowerCase();
    const isOlx = lowerUrl.includes('olx.pt');
    const isGumtree = lowerUrl.includes('gumtree.com');
    const isTestUrl = lowerUrl.includes('teste.mercadoluso.com') || lowerUrl.includes('teste.mercadoluso');

    if (!isOlx && !isGumtree && !isTestUrl) {
      return res.status(200).json({
        success: false,
        error: 'Esta plataforma ainda não é suportada. No momento, suportamos apenas OLX e Gumtree.'
      });
    }

    // Suporte a URLs de teste para simulação e homologação local/preview
    if (isTestUrl) {
      let title = "iPhone 15 Pro Max 256GB - Excelente Estado";
      let description = "Vendo iPhone 15 Pro Max de 256GB em estado imaculado (como novo). Sem qualquer risco no ecrã ou traseira. Sempre usado com capa e película de vidro temperado protetora. Saúde de bateria a 98%.\n\nInclui caixa original, cabo USB-C original e fatura de compra. Ainda dentro da garantia original.\n\nMotivo de venda: Upgrade para modelo mais recente.\nNão aceito retomas ou trocas.";
      let price = 950;
      let category = "Tecnologia";
      let city = "Lisboa";
      let images = ["https://images.unsplash.com/photo-1695048133142-1a20484d2569?w=800&auto=format&fit=crop&q=60"];

      if (lowerUrl.includes("carro") || lowerUrl.includes("auto") || lowerUrl.includes("veiculo")) {
        title = "Volkswagen Golf VII 1.6 TDi Style (110cv)";
        description = "VW Golf VII 1.6 TDi em excelente estado geral de conservação. Viatura nacional, com histórico completo de revisões efetuadas na marca. Consumos fantásticos de 4.5l/100km.\n\nEquipamento em destaque:\n- Sensores de estacionamento traseiros e dianteiros\n- Ecrã tátil multimédia Bluetooth\n- Jantes especiais de liga leve 16 polegadas\n- Controlo de velocidade de cruzeiro\n- Estofos desportivos em tecido refinado\n- IUC pago e inspeção periódica válida até 2027. Duas chaves originais disponíveis.";
        price = 14800;
        category = "Carros, Motos e Barcos";
        city = "Porto";
        images = ["https://images.unsplash.com/photo-1541899481282-d53bffe3c35d?w=800&auto=format&fit=crop&q=60"];
      } else if (lowerUrl.includes("casa") || lowerUrl.includes("apartamento") || lowerUrl.includes("imovel") || lowerUrl.includes("moradia")) {
        title = "Apartamento T2 em Pleno Centro da Cidade com Garagem";
        description = "Magnífico apartamento T2 totalmente remodelado, situado no coração comercial da cidade. Excelente exposição solar com bastante luz natural direta. Prédio com elevador e portaria eletrónica.\n\nCaracterísticas:\n- Cozinha equipada com eletrodomésticos encastrados topo de gama\n- Duas casas de banho completas com materiais nobres\n- Sala comum com lareira moderna e recuperador de calor\n- Box fechada para um veículo de grandes dimensões e arrecadação de apoio\n\nPróximo de todos os serviços essenciais (transportes públicos à porta, escolas e supermercados). Excelente oportunidade para habitação própria ou investimento para rendimento garantido.";
        price = 285000;
        category = "Imóveis";
        city = "Braga";
        images = ["https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?w=800&auto=format&fit=crop&q=60"];
      }

      return res.status(200).json({ success: true, data: { title, description, price, category, city, images } });
    }

    let responseText = '';
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const fetchRes = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'pt-PT,pt;q=0.9,en;q=0.8,en-US;q=0.7',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      clearTimeout(timeoutId);

      if (!fetchRes.ok) {
        throw new Error(`HTTP error! status: ${fetchRes.status}`);
      }

      responseText = await fetchRes.text();
    } catch (fetchErr: any) {
      console.error("[Scraper API] Error fetching OLX URL:", fetchErr);
      return res.status(200).json({
        success: false,
        error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.'
      });
    }

    const jsonLdList = extractJsonLd(responseText);
    const productNode = extractFromJsonLdList(jsonLdList);

    // 1. Extração de Título
    let rawTitle = extractMetaContent(responseText, 'og:title');
    if (!rawTitle) {
      rawTitle = productNode?.name || productNode?.title || extractMetaContent(responseText, 'twitter:title') || '';
    }
    if (!rawTitle) {
      const titleMatch = responseText.match(/<title>([^<]+)<\/title>/i);
      rawTitle = titleMatch ? titleMatch[1] : '';
    }
    const title = cleanTitle(rawTitle);

    if (!title) {
      return res.status(200).json({
        success: false,
        error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.'
      });
    }

    // 2. Extração de Descrição
    let foundDescription = extractMetaContent(responseText, 'og:description');
    if (!foundDescription) {
      foundDescription = productNode?.description || extractMetaContent(responseText, 'twitter:description') || extractMetaContent(responseText, 'description') || '';
    }
    const description = cleanDescription(foundDescription);

    // 3. Extração de Preço
    let price = 0;
    const ogPriceAmount = extractMetaContent(responseText, 'product:price:amount');
    if (ogPriceAmount) {
      price = parsePrice(ogPriceAmount);
    }
    if (price === 0) {
      if (productNode?.offers?.price !== undefined) {
        price = parsePrice(productNode.offers.price);
      } else if (productNode?.offers?.[0]?.price !== undefined) {
        price = parsePrice(productNode.offers[0].price);
      }
    }
    if (price === 0 && rawTitle) {
      const priceMatch = rawTitle.match(/(\d+(?:\s*\d+)?)\s*€/);
      if (priceMatch) {
        price = parsePrice(priceMatch[1]);
      }
    }

    // 4. Mapeamento de Categorias
    let parsedCategory = productNode?.category || '';
    if (!parsedCategory) {
      for (const obj of jsonLdList) {
        if (obj?.itemListElement && Array.isArray(obj.itemListElement)) {
          const sortedItems = [...obj.itemListElement].sort((a,b) => (a.position || 0) - (b.position || 0));
          if (sortedItems.length > 1) {
            parsedCategory = sortedItems[1].name || sortedItems[1].item?.name || '';
          }
        }
      }
    }
    if (!parsedCategory) {
      parsedCategory = extractMetaContent(responseText, 'category') || '';
    }

    let category = '';
    const lowerParsedCat = String(parsedCategory).toLowerCase() + ' ' + title.toLowerCase() + ' ' + description.toLowerCase();

    if (lowerParsedCat.includes('carro') || lowerParsedCat.includes('moto') || lowerParsedCat.includes('barco') || lowerParsedCat.includes('veiculo') || lowerParsedCat.includes('auto') || lowerParsedCat.includes('peças') || lowerParsedCat.includes('pneus') || lowerParsedCat.includes('jantes') || lowerParsedCat.includes('motociclo') || lowerParsedCat.includes('car ') || lowerParsedCat.includes('cars ') || lowerParsedCat.includes('vehicle') || lowerParsedCat.includes('motor') || lowerParsedCat.includes('van') || lowerParsedCat.includes('wheel') || lowerParsedCat.includes('tyre')) {
      category = 'Carros, motos e barcos';
    } else if (lowerParsedCat.includes('imovel') || lowerParsedCat.includes('apartamento') || lowerParsedCat.includes('casa') || lowerParsedCat.includes('moradia') || lowerParsedCat.includes('quarto') || lowerParsedCat.includes('terreno') || lowerParsedCat.includes('loja') || lowerParsedCat.includes('garagem') || lowerParsedCat.includes('escritório') || lowerParsedCat.includes('prédio') || lowerParsedCat.includes('property') || lowerParsedCat.includes('flat') || lowerParsedCat.includes('house') || lowerParsedCat.includes('rent') || lowerParsedCat.includes('room') || lowerParsedCat.includes('studio')) {
      category = 'Imóveis';
    } else if (lowerParsedCat.includes('telemovel') || lowerParsedCat.includes('iphone') || lowerParsedCat.includes('samsung') || lowerParsedCat.includes('computador') || lowerParsedCat.includes('tecnologia') || lowerParsedCat.includes('eletronica') || lowerParsedCat.includes('tablet') || lowerParsedCat.includes('tv') || lowerParsedCat.includes('laptop') || lowerParsedCat.includes('smartphone') || lowerParsedCat.includes('consola') || lowerParsedCat.includes('playstation') || lowerParsedCat.includes('nintendo') || lowerParsedCat.includes('xbox') || lowerParsedCat.includes('phone') || lowerParsedCat.includes('computer') || lowerParsedCat.includes('tv ') || lowerParsedCat.includes('console') || lowerParsedCat.includes('camera') || lowerParsedCat.includes('electronics')) {
      category = 'Tecnologia';
    } else if (lowerParsedCat.includes('jardim') || lowerParsedCat.includes('moveis') || lowerParsedCat.includes('móveis') || lowerParsedCat.includes('decoracao') || lowerParsedCat.includes('decoração') || lowerParsedCat.includes('eletrodomestico') || lowerParsedCat.includes('eletrodoméstico') || lowerParsedCat.includes('diy') || lowerParsedCat.includes('ferramenta') || lowerParsedCat.includes('bricolage') || lowerParsedCat.includes('sofá') || lowerParsedCat.includes('mesa') || lowerParsedCat.includes('cadeira') || lowerParsedCat.includes('cama') || lowerParsedCat.includes('garden') || lowerParsedCat.includes('furniture') || lowerParsedCat.includes('home') || lowerParsedCat.includes('sofa') || lowerParsedCat.includes('table') || lowerParsedCat.includes('chair') || lowerParsedCat.includes('bed') || lowerParsedCat.includes('appliance')) {
      category = 'Casa e Jardim';
    } else if (lowerParsedCat.includes('moda') || lowerParsedCat.includes('acessorio') || lowerParsedCat.includes('acessório') || lowerParsedCat.includes('vestuario') || lowerParsedCat.includes('vestuário') || lowerParsedCat.includes('calcado') || lowerParsedCat.includes('calçado') || lowerParsedCat.includes('roupa') || lowerParsedCat.includes('sapatilha') || lowerParsedCat.includes('sapato') || lowerParsedCat.includes('mala') || lowerParsedCat.includes('relogio') || lowerParsedCat.includes('relógio') || lowerParsedCat.includes('óculos') || lowerParsedCat.includes('clothes') || lowerParsedCat.includes('fashion') || lowerParsedCat.includes('shoe') || lowerParsedCat.includes('bag') || lowerParsedCat.includes('watch') || lowerParsedCat.includes('glasses') || lowerParsedCat.includes('apparel')) {
      category = 'Moda e Acessórios';
    } else if (lowerParsedCat.includes('lazer') || lowerParsedCat.includes('desporto') || lowerParsedCat.includes('bicicleta') || lowerParsedCat.includes('hobby') || lowerParsedCat.includes('livro') || lowerParsedCat.includes('musica') || lowerParsedCat.includes('música') || lowerParsedCat.includes('instrumento') || lowerParsedCat.includes('ginásio') || lowerParsedCat.includes('filme') || lowerParsedCat.includes('jogo') || lowerParsedCat.includes('brinquedo') || lowerParsedCat.includes('sport') || lowerParsedCat.includes('leisure') || lowerParsedCat.includes('bike') || lowerParsedCat.includes('bicycle') || lowerParsedCat.includes('book') || lowerParsedCat.includes('music') || lowerParsedCat.includes('movie') || lowerParsedCat.includes('toy') || lowerParsedCat.includes('game')) {
      category = 'Lazer e Desporto';
    } else if (lowerParsedCat.includes('bebe') || lowerParsedCat.includes('bebé') || lowerParsedCat.includes('crianca') || lowerParsedCat.includes('criança') || lowerParsedCat.includes('carrinho de bebé') || lowerParsedCat.includes('fralda') || lowerParsedCat.includes('roupa de bebé') || lowerParsedCat.includes('baby') || lowerParsedCat.includes('kids') || lowerParsedCat.includes('child')) {
      category = 'Bebés e Crianças';
    } else if (lowerParsedCat.includes('imigracao') || lowerParsedCat.includes('imigração') || lowerParsedCat.includes('visto') || lowerParsedCat.includes('nacionalidade') || lowerParsedCat.includes('sef') || lowerParsedCat.includes('aima') || lowerParsedCat.includes('immigration') || lowerParsedCat.includes('visa')) {
      category = 'Imigração';
    } else if (lowerParsedCat.includes('trabalho') || lowerParsedCat.includes('emprego') || lowerParsedCat.includes('serviço') || lowerParsedCat.includes('vaga') || lowerParsedCat.includes('recrutamento') || lowerParsedCat.includes('job') || lowerParsedCat.includes('work') || lowerParsedCat.includes('career') || lowerParsedCat.includes('employment') || lowerParsedCat.includes('hiring') || lowerParsedCat.includes('recruitment')) {
      category = 'Trabalho/Empregos';
    } else if (lowerParsedCat.includes('outro') || lowerParsedCat.includes('outros') || lowerParsedCat.includes('other')) {
      category = 'Outros';
    }

    // 5. Extração e mapeamento de Cidade
    let city = null;
    let foundCity = findLocationInJsonLd(jsonLdList) || extractMetaContent(responseText, 'og:locality') || extractMetaContent(responseText, 'geo.placename');
    
    if (!foundCity) {
      const localityMatch = responseText.match(/"addressLocality"\s*:\s*"([^"]+)"/i);
      const regionMatch = responseText.match(/"addressRegion"\s*:\s*"([^"]+)"/i);
      if (regionMatch) {
        foundCity = regionMatch[1];
      } else if (localityMatch) {
        foundCity = localityMatch[1];
      }
    }

    if (!foundCity) {
      const cityNameMatch = responseText.match(/"cityName"\s*:\s*"([^"]+)"/i);
      if (cityNameMatch) {
        foundCity = cityNameMatch[1];
      }
    }

    if (!foundCity) {
      const regionNameMatch = responseText.match(/"regionName"\s*:\s*"([^"]+)"/i);
      if (regionNameMatch) {
        foundCity = regionNameMatch[1];
      }
    }

    if (foundCity) {
      const normCity = decodeHtmlEntities(String(foundCity)).trim().toLowerCase();
      if (isGumtree) {
        const allUkCities = [
          'London', 'Manchester', 'Birmingham', 'Liverpool', 'Leeds', 'Bristol', 
          'Southampton', 'Portsmouth', 'Bournemouth', 'Reading', 'Milton Keynes', 
          'Leicester', 'Coventry', 'Nottingham', 'Glasgow', 'Edinburgh', 'Cardiff', 
          'Belfast', 'Weymouth', 'Aberdeen', 'Ayr', 'Bangor', 'Blackpool'
        ];
        const matched = allUkCities.find(c => c.toLowerCase() === normCity || normCity.includes(c.toLowerCase()));
        if (matched) {
          city = matched;
        } else {
          if (normCity.includes('london')) {
            city = 'London';
          } else if (normCity.includes('manchester')) {
            city = 'Manchester';
          } else if (normCity.includes('birmingham')) {
            city = 'Birmingham';
          } else {
            const decodedCity = decodeHtmlEntities(String(foundCity)).trim();
            city = decodedCity.charAt(0).toUpperCase() + decodedCity.slice(1);
          }
        }
      } else {
        const allPortugalCities = ['Lisboa', 'Porto', 'Braga', 'Faro', 'Coimbra', 'Aveiro', 'Setúbal', 'Leiria', 'Madeira', 'Açores', 'Outra'];
        
        const matched = allPortugalCities.find(c => c.toLowerCase() === normCity || normCity.includes(c.toLowerCase()));
        if (matched) {
          city = matched;
        } else {
          if (normCity.includes('lisbon') || normCity.includes('sintra') || normCity.includes('cascais') || normCity.includes('loures') || normCity.includes('odivelas') || normCity.includes('amadora') || normCity.includes('oeiras') || normCity.includes('vila franca de xira') || normCity.includes('mafra')) {
            city = 'Lisboa';
          } else if (normCity.includes('oporto') || normCity.includes('gaia') || normCity.includes('matosinhos') || normCity.includes('maia') || normCity.includes('gondomar') || normCity.includes('póvoa de varzim')) {
            city = 'Porto';
          } else if (normCity.includes('guimarães') || normCity.includes('barcelos') || normCity.includes('famalicão')) {
            city = 'Braga';
          } else if (normCity.includes('albufeira') || normCity.includes('portimão') || normCity.includes('loulé') || normCity.includes('lagos')) {
            city = 'Faro';
          } else if (normCity.includes('funchal') || normCity.includes('porto santo')) {
            city = 'Madeira';
          } else if (normCity.includes('ponta delgada') || normCity.includes('angra') || normCity.includes('horta')) {
            city = 'Açores';
          } else {
            city = decodeHtmlEntities(String(foundCity)).trim();
          }
        }
      }
    }

    // 6. Extração de Imagens
    let images: string[] = [];
    const ogImage = extractMetaContent(responseText, 'og:image');
    if (ogImage) {
      images.push(ogImage);
    }
    if (productNode?.image) {
      if (Array.isArray(productNode.image)) {
        productNode.image.forEach((img: any) => {
          const urlStr = typeof img === 'string' ? img : (typeof img === 'object' && img?.url ? img.url : '');
          if (urlStr) {
            images.push(urlStr);
          }
        });
      } else if (typeof productNode.image === 'string') {
        images.push(productNode.image);
      } else if (typeof productNode.image === 'object' && productNode.image?.url) {
        images.push(productNode.image.url);
      }
    }
    const twitterImg = extractMetaContent(responseText, 'twitter:image');
    if (twitterImg) {
      images.push(twitterImg);
    }
    
    const htmlImgMatches = responseText.match(/https?:\/\/[^\s"'>]+?\.olx\.pt\/v1\/files\/[a-zA-Z0-9_-]+\/image;[^\s"'>\)]*/gi) || [];
    for (const mUrl of htmlImgMatches) {
      images.push(mUrl);
    }

    const srcMatches = responseText.match(/(?:src|data-src|srcset|content)=["'](https?:\/\/img\.olx\.pt\/[^"']+)["']/gi);
    if (srcMatches) {
      for (const match of srcMatches) {
        const urlMatch = match.match(/(https?:\/\/img\.olx\.pt\/[^\s"';,>]+)/i);
        if (urlMatch) {
          images.push(urlMatch[1]);
        }
      }
    }

    if (isGumtree) {
      const ebayImgMatches = responseText.match(/https?:\/\/(?:i\.ebayimg\.com|img\.gumtree\.com)[^\s"';,>]+/gi) || [];
      for (const mUrl of ebayImgMatches) {
        images.push(mUrl);
      }
    }

    const isValidImageUrl = (imgUrl: string): boolean => {
      if (!imgUrl || typeof imgUrl !== 'string') return false;
      try {
        const decoded = decodeHtmlEntities(imgUrl).trim();
        if (!decoded.startsWith('http://') && !decoded.startsWith('https://')) return false;
        const parsed = new URL(decoded);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:';
      } catch (e) {
        return false;
      }
    };

    images = Array.from(new Set(images.map(img => decodeHtmlEntities(img).trim())))
      .filter(img => isValidImageUrl(img))
      .slice(0, 10);

    const countryResult = isGumtree ? 'Reino Unido' : isOlx ? 'Portugal' : null;
    return res.status(200).json({ success: true, data: { title, description, price, category, city, country: countryResult, images } });
  } catch (err: any) {
    console.error("[Scraper API Exception] Unexpected import error:", err);
    return res.status(200).json({ success: false, error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.' });
  }
}
