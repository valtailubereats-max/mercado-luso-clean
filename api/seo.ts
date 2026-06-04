import { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import * as admin from 'firebase-admin';

// Helper interface for our dynamic parsing
interface VercelRequest extends IncomingMessage {
  query?: Record<string, string | string[]>;
}

// Function to escape HTML to prevent XSS or breaking attributes
function escapeHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default async function handler(req: VercelRequest, res: ServerResponse) {
  // 1. Extração do parâmetro ID de forma ultra-robusta (suporta slug e ID bruto)
  let idParam = '';
  const decodedUrl = decodeURIComponent(req.url || '');
  const urlObj = new URL(decodedUrl, 'http://localhost');
  const pathname = urlObj.pathname;
  
  if (req.query && typeof req.query.id === 'string') {
    idParam = req.query.id;
  } else if (req.query && typeof req.query.slugAndId === 'string') {
    idParam = req.query.slugAndId;
  } else {
    const pathSegments = pathname.split('/').filter(Boolean);
    if (pathSegments.length >= 2) {
      idParam = pathSegments[1];
    }
  }

  // O ID exato do Firestore é o último fragmento após o caractere '-'
  const segments = idParam.split('-');
  const adId = segments[segments.length - 1];

  // 2. Carregar o template de index.html base para injetar as tags ou para fallback rápido
  let htmlPath = path.join(process.cwd(), 'dist', 'index.html');
  let html = '';
  
  try {
    if (fs.existsSync(htmlPath)) {
      html = fs.readFileSync(htmlPath, 'utf8');
    } else {
      const rootHtmlPath = path.join(process.cwd(), 'index.html');
      if (fs.existsSync(rootHtmlPath)) {
        html = fs.readFileSync(rootHtmlPath, 'utf8');
      } else {
        html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Mercado Luso</title></head><body><div id="root"></div></body></html>`;
      }
    }
  } catch (err) {
    console.error("Erro ao ler index.html física:", err);
    html = `<!DOCTYPE html><html lang="pt"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Mercado Luso</title></head><body><div id="root"></div></body></html>`;
  }

  // Se o ID do anúncio não foi extraído corretamente, devolvemos o HTML padrão de imediato
  if (!adId) {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  try {
    // 3. Inicializar o Firebase Admin de forma segura (blindado e via variáveis de ambiente)
    let projectId = 'navlink-489413'; // fallback padrão do projeto
    let firestoreDatabaseId = 'ai-studio-68f2b08f-f2a5-4a0e-9c12-0146a4e48db1'; // fallback de cache

    const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (config.projectId) projectId = config.projectId;
        if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)') {
          firestoreDatabaseId = config.firestoreDatabaseId;
        }
      } catch (err) {
        console.error("Erro ao carregar configurações dinâmicas de firebase-applet-config.json:", err);
      }
    }

    if (!admin.apps.length) {
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: projectId,
          });
        } catch (e) {
          console.error("Falha ao analisar service account JSON do ambiente, usando inicialização padrão.");
          admin.initializeApp({ projectId: projectId });
        }
      } else {
        // Inicialização sem chaves diretas para fallback opcional em ambientes integrados
        admin.initializeApp({ projectId: projectId });
      }
    }

    const db = admin.firestore();
    if (firestoreDatabaseId) {
      db.settings({ databaseId: firestoreDatabaseId });
    }

    // 4. Buscar o anúncio no Firestore
    const adDocRef = db.collection('ads').doc(adId);
    const adSnap = await adDocRef.get();

    if (!adSnap.exists) {
      console.warn(`Anúncio ${adId} não existe no Firestore.`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    const adData = adSnap.data();
    if (!adData) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }

    // 5. Preparar as variáveis e os metadados dinâmicos para a injeção
    const title = escapeHtml(adData.title || 'Anúncio');
    const description = escapeHtml(
      (adData.description || 'Confira este anúncio no Mercado Luso!').substring(0, 160) + 
      ((adData.description || '').length > 160 ? '...' : '')
    );
    
    let adImage = 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=600&q=80';
    if (adData.images && Array.isArray(adData.images) && adData.images.length > 0 && adData.images[0]) {
      adImage = adData.images[0];
    } else if (adData.imageUrl) {
      adImage = adData.imageUrl;
    }

    const host = req.headers.host || 'mercadoluso.vercel.app';
    const protocol = (req.headers['x-forwarded-proto'] as string) || 'https';
    const adUrl = `${protocol}://${host}${pathname}`;

    // 6. Gerar e injetar as tags dinâmicas no Header da página
    const metaTags = `
  <title>${title} | Mercado Luso</title>
  <meta name="description" content="${description}" />
  <meta property="og:url" content="${adUrl}" />
  <meta property="og:title" content="${title} | Mercado Luso" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${adImage}" />
  <meta property="og:type" content="website" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title} | Mercado Luso" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image" content="${adImage}" />
`;

    // Remover tags antigas para evitar quaisquer duplicados na saída
    html = html.replace(/<title>[^]*?<\/title>/gi, '');
    html = html.replace(/<meta property="og:[^]*?\/>/gi, '');
    html = html.replace(/<meta name="twitter:[^]*?\/>/gi, '');

    // Inserir as novas tags imediatamente abaixo do cabeçalho inicial <head>
    html = html.replace(/<head>/i, `<head>${metaTags}`);

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);

  } catch (err) {
    console.error("Erro inesperado no Firestore do Dynamic SEO:", err);
    // Devolvemos o html padrão caso ocorra qualquer problema técnico no backend serverless
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }
}
