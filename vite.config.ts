import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'local-api-emulator',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/gemini/analyze') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { image, categories } = JSON.parse(body);
                  if (!image) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Falta a imagem do print." }));
                    return;
                  }

                  // Importação lazy e dinâmica do GoogleGenAI do SDK @google/genai
                  const { GoogleGenAI } = await import("@google/genai");
                  const apiKey = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY || "AIzaSyBewRCSZ-nNqXiaVCRzgpfI1ieWf5QEyq4";
                  
                  const ai = new GoogleGenAI({
                    apiKey: apiKey,
                    httpOptions: {
                      headers: {
                        'User-Agent': 'aistudio-build',
                      }
                    }
                  });

                  const base64Data = image.includes(",") ? image.split(",")[1] : image;
                  
                  const prompt = `Você é um assistente especializado em extrair informações de anúncios de classificados.
Extraia as seguintes informações da imagem fornecida e retorne APENAS um objeto JSON válido:
- title: Título do produto
- price: Preço (apenas o número)
- description: Descrição detalhada
- city: Escolha a mais próxima de: Todas, Lisboa, Porto, Braga, Coimbra, Faro, Funchal, Ponta Delgada
- category: Escolha a mais próxima de: ${categories ? categories.join(', ') : 'Outros'}

Estrutura JSON esperada:
{
  "title": "string",
  "price": number,
  "description": "string",
  "city": "string",
  "category": "string"
}`;

                  const imagePart = {
                    inlineData: {
                      mimeType: "image/jpeg",
                      data: base64Data
                    }
                  };

                  const textPart = {
                    text: prompt
                  };

                  let response;
                  try {
                    response = await ai.models.generateContent({
                      model: "gemini-3.5-flash",
                      contents: { parts: [imagePart, textPart] },
                      config: {
                        responseMimeType: "application/json"
                      }
                    });
                  } catch (err: any) {
                    console.warn("[Emulator] falha gemini-3.5-flash, tentando fallback gemini-2.5-flash-image:", err.message);
                    response = await ai.models.generateContent({
                      model: "gemini-2.5-flash-image",
                      contents: { parts: [imagePart, textPart] }
                    });
                  }

                  const text = response.text;
                  if (!text) {
                    throw new Error("A IA retornou uma resposta vazia.");
                  }

                  const cleanJson = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
                  const extractedData = JSON.parse(cleanJson);

                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: extractedData }));
                } catch (err: any) {
                  console.error("[Emulator] Erro na requisição do Gemini:", err);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message || 'Erro inesperado' }));
                }
              });
            } else if (req.url?.startsWith('/api/email/send') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { template, to, data } = JSON.parse(body);
                  const { default: handler } = await import('./api/email/send.ts');
                  
                  const mockRes = {
                    status(code: number) {
                      res.writeHead(code, { 'Content-Type': 'application/json' });
                      return this;
                    },
                    json(payload: any) {
                      res.end(JSON.stringify(payload));
                      return this;
                    },
                    setHeader() {},
                    end() {
                      res.end();
                    }
                  };
                  
                  await handler({ method: 'POST', body: { template, to, data } }, mockRes);
                } catch (err: any) {
                  console.error("[Emulator] Erro no emulador de email:", err);
                  res.writeHead(500, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: err.message || 'Erro no emulador de email' }));
                }
              });
            } else if (req.url?.startsWith('/api/import-ad') && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => { body += chunk; });
              req.on('end', async () => {
                try {
                  const { url, userRole } = JSON.parse(body);
                  if (userRole !== 'admin' && userRole !== 'moderator') {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: 'Acesso negado. Apenas administradores ou moderadores podem realizar a importação.' }));
                    return;
                  }

                  if (!url) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: "Falta o link do anúncio." }));
                    return;
                  }

                  const lowerUrl = url.toLowerCase();
                  const isOlx = lowerUrl.includes('olx.pt');
                  const isTestUrl = lowerUrl.includes('teste.mercadoluso.com') || lowerUrl.includes('teste.mercadoluso');

                  if (!isOlx && !isTestUrl) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                      success: false,
                      error: 'Esta plataforma ainda não é suportada. No momento, suportamos apenas OLX.'
                    }));
                    return;
                  }

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

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, data: { title, description, price, category, city, images } }));
                    return;
                  }

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

                  const cleanTitle = (title: string): string => {
                    if (!title) return '';
                    let temp = decodeHtmlEntities(title)
                      .replace(/\s*-\s*à venda\s*-\s*.*$/gi, '')
                      .replace(/\s*-\s*OLX\s*Portugal.*$/gi, '')
                      .replace(/\s*-\s*OLX.*$/gi, '')
                      .replace(/\|.*$/gi, '')
                      .trim();

                    // Remove uncommon visual emojis or symbols to keep it clean, but keep alphanumeric + basic punctuation
                    temp = temp.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
                    
                    // Replace duplicate spaces
                    temp = temp.replace(/\s+/g, ' ');

                    return temp.trim();
                  };

                  const cleanDescription = (desc: string): string => {
                    if (!desc) return '';
                    let temp = decodeHtmlEntities(desc);
                    
                    // Remove HTML tags, if any
                    temp = temp.replace(/<[^>]*>/g, '');

                    // Remove non-printable control characters, preserving normal whitespace/linebreaks
                    temp = temp.replace(/[\x00-\x09\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '');

                    temp = temp.replace(/\r/g, '');
                    temp = temp.replace(/\n{3,}/g, '\n\n'); // Allow maximum 2 consecutive newlines
                    temp = temp.split('\n').map(line => line.trim()).join('\n');
                    temp = temp.split('\n').map(line => line.replace(/[ \t]{2,}/g, ' ')).join('\n'); // No visual spacing slop

                    return temp.trim();
                  };

                  const parsePrice = (priceStr: string | number | undefined | null): number => {
                    if (priceStr === undefined || priceStr === null) return 0;
                    if (typeof priceStr === 'number') return priceStr;
                    
                    let str = String(priceStr).trim();
                    if (!str) return 0;

                    // Remove currency symbols and spaces
                    str = str.replace(/[€$£\s]/g, '');

                    // Inspect decimal style
                    const lastComma = str.lastIndexOf(',');
                    const lastDot = str.lastIndexOf('.');
                    
                    if (lastComma > lastDot && (lastComma === str.length - 3 || lastComma === str.length - 2)) {
                      // European decimal comma: 1.250,50 or 1250,5
                      str = str.replace(/\./g, '').replace(',', '.');
                    } else if (lastDot > lastComma && (lastDot === str.length - 3 || lastDot === str.length - 2)) {
                      // US style decimal dot: 1,250.50
                      str = str.replace(/,/g, '');
                    } else {
                      // No explicit decimal fraction, like "1.250" or "1,250"
                      // Replace both signs to treat it as an integer, common in Portuguese OLX prices
                      str = str.replace(/[.,]/g, '');
                    }

                    // Match first sequence of digits potentially with a single decimal dot
                    const match = str.match(/\d+(?:\.\d+)?/);
                    if (match) {
                      const parsed = parseFloat(match[0]);
                      return isNaN(parsed) ? 0 : parsed;
                    }
                    return 0;
                  };

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
                        // ignore invalid JSON-LD
                      }
                    }
                    return results;
                  };

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
                    console.error("[Scraper] Error fetching OLX URL:", fetchErr);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                      success: false,
                      error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.'
                    }));
                    return;
                  }

                  const jsonLdList = extractJsonLd(responseText);
                  const productNode = extractFromJsonLdList(jsonLdList);

                  // 1. Title extraction
                  let rawTitle = extractMetaContent(responseText, 'og:title');
                  if (!rawTitle) {
                    rawTitle = productNode?.name || productNode?.title || extractMetaContent(responseText, 'twitter:title') || '';
                  }
                  if (!rawTitle) {
                    const titleMatch = responseText.match(/<title>([^<]+)<\/title>/i);
                    rawTitle = titleMatch ? titleMatch[1] : '';
                  }
                  const title = cleanTitle(rawTitle);

                  // Validate minimum required fields
                  if (!title) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                      success: false,
                      error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.'
                    }));
                    return;
                  }

                  // 2. Description extraction
                  let foundDescription = extractMetaContent(responseText, 'og:description');
                  if (!foundDescription) {
                    foundDescription = productNode?.description || extractMetaContent(responseText, 'twitter:description') || extractMetaContent(responseText, 'description') || '';
                  }
                  const description = cleanDescription(foundDescription);

                  // 3. Price extraction
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

                  // 4. Category mapping
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

                  if (lowerParsedCat.includes('carro') || lowerParsedCat.includes('moto') || lowerParsedCat.includes('barco') || lowerParsedCat.includes('veiculo') || lowerParsedCat.includes('auto') || lowerParsedCat.includes('peças') || lowerParsedCat.includes('pneus') || lowerParsedCat.includes('jantes') || lowerParsedCat.includes('motociclo')) {
                    category = 'Carros, motos e barcos';
                  } else if (lowerParsedCat.includes('imovel') || lowerParsedCat.includes('apartamento') || lowerParsedCat.includes('casa') || lowerParsedCat.includes('moradia') || lowerParsedCat.includes('quarto') || lowerParsedCat.includes('terreno') || lowerParsedCat.includes('loja') || lowerParsedCat.includes('garagem') || lowerParsedCat.includes('escritório') || lowerParsedCat.includes('prédio')) {
                    category = 'Imóveis';
                  } else if (lowerParsedCat.includes('telemovel') || lowerParsedCat.includes('iphone') || lowerParsedCat.includes('samsung') || lowerParsedCat.includes('computador') || lowerParsedCat.includes('tecnologia') || lowerParsedCat.includes('eletronica') || lowerParsedCat.includes('tablet') || lowerParsedCat.includes('tv') || lowerParsedCat.includes('laptop') || lowerParsedCat.includes('smartphone') || lowerParsedCat.includes('consola') || lowerParsedCat.includes('playstation') || lowerParsedCat.includes('nintendo') || lowerParsedCat.includes('xbox')) {
                    category = 'Tecnologia';
                  } else if (lowerParsedCat.includes('jardim') || lowerParsedCat.includes('moveis') || lowerParsedCat.includes('móveis') || lowerParsedCat.includes('decoracao') || lowerParsedCat.includes('decoração') || lowerParsedCat.includes('eletrodomestico') || lowerParsedCat.includes('eletrodoméstico') || lowerParsedCat.includes('diy') || lowerParsedCat.includes('ferramenta') || lowerParsedCat.includes('bricolage') || lowerParsedCat.includes('sofá') || lowerParsedCat.includes('mesa') || lowerParsedCat.includes('cadeira') || lowerParsedCat.includes('cama')) {
                    category = 'Casa e Jardim';
                  } else if (lowerParsedCat.includes('moda') || lowerParsedCat.includes('acessorio') || lowerParsedCat.includes('acessório') || lowerParsedCat.includes('vestuario') || lowerParsedCat.includes('vestuário') || lowerParsedCat.includes('calcado') || lowerParsedCat.includes('calçado') || lowerParsedCat.includes('roupa') || lowerParsedCat.includes('sapatilha') || lowerParsedCat.includes('sapato') || lowerParsedCat.includes('mala') || lowerParsedCat.includes('relogio') || lowerParsedCat.includes('relógio') || lowerParsedCat.includes('óculos')) {
                    category = 'Moda e Acessórios';
                  } else if (lowerParsedCat.includes('lazer') || lowerParsedCat.includes('desporto') || lowerParsedCat.includes('bicicleta') || lowerParsedCat.includes('hobby') || lowerParsedCat.includes('livro') || lowerParsedCat.includes('musica') || lowerParsedCat.includes('música') || lowerParsedCat.includes('instrumento') || lowerParsedCat.includes('ginásio') || lowerParsedCat.includes('filme') || lowerParsedCat.includes('jogo') || lowerParsedCat.includes('brinquedo')) {
                    category = 'Lazer e Desporto';
                  } else if (lowerParsedCat.includes('bebe') || lowerParsedCat.includes('bebé') || lowerParsedCat.includes('crianca') || lowerParsedCat.includes('criança') || lowerParsedCat.includes('carrinho de bebé') || lowerParsedCat.includes('fralda') || lowerParsedCat.includes('roupa de bebé')) {
                    category = 'Bebés e Crianças';
                  } else if (lowerParsedCat.includes('imigracao') || lowerParsedCat.includes('imigração') || lowerParsedCat.includes('visto') || lowerParsedCat.includes('nacionalidade') || lowerParsedCat.includes('sef') || lowerParsedCat.includes('aima')) {
                    category = 'Imigração';
                  } else if (lowerParsedCat.includes('outro') || lowerParsedCat.includes('outros')) {
                    category = 'Outros';
                  }

                  // 5. City mapping
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
                    const allPortugalCities = ['Lisboa', 'Porto', 'Braga', 'Faro', 'Coimbra', 'Aveiro', 'Setúbal', 'Leiria', 'Madeira', 'Açores', 'Outra'];
                    
                    const matched = allPortugalCities.find(c => c.toLowerCase() === normCity || normCity.includes(c.toLowerCase()));
                    if (matched) {
                      city = matched;
                    } else {
                      // Common municipality/neighborhood fallback mappings for Portugal
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
                        // Keep the extracted city as a fallback for custom/personalized city
                        city = decodeHtmlEntities(String(foundCity)).trim();
                      }
                    }
                  }

                  // 6. Image extraction
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

                  const countryResult = isOlx ? 'Portugal' : null;
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: true, data: { title, description, price, category, city, country: countryResult, images } }));
                } catch (err: any) {
                  console.error("[Scraper] Unexpected import error:", err);
                  res.writeHead(200, { 'Content-Type': 'application/json' });
                  res.end(JSON.stringify({ success: false, error: 'Não foi possível importar os dados deste anúncio. Preencha manualmente.' }));
                }
              });
            } else if (req.url?.startsWith('/api/health')) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ status: "ok" }));
            } else {
              next();
            }
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
