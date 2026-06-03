import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { initializeApp, cert, getApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import crypto from "crypto";
import { GoogleGenAI } from "@google/genai";

const isCommonJS = typeof module !== "undefined" && !!module.exports;
const resolvedFilename = isCommonJS ? __filename : fileURLToPath(import.meta.url);
const resolvedDirname = isCommonJS ? __dirname : path.dirname(resolvedFilename);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Read Firebase config
const firebaseConfigPath = path.join(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, "utf-8"));

// Initialize Firebase Admin
// In this environment, we might not have a service account key file, 
// but we can try to initialize with the project ID.
if (!getApps().length) {
  initializeApp({
    projectId: firebaseConfig.projectId,
    storageBucket: firebaseConfig.storageBucket || "navlink-489413.firebasestorage.app"
  });
}

const db = firebaseConfig.firestoreDatabaseId 
  ? getFirestore(getApp(), firebaseConfig.firestoreDatabaseId) 
  : getFirestore();

async function runAdExpirationJob() {
  console.log("[Job] Running ad expiration check...");
  try {
    const settingsDoc = await db.collection("settings").doc("global").get();
    if (!settingsDoc.exists) {
      console.log("[Job] Settings not found, initializing default settings...");
      await db.collection("settings").doc("global").set({
        id: "global",
        planDurations: {
          free: 30,
          intermediate: 180,
          premium: 365
        },
        expirationAction: "archive",
        warningDays: 3
      });
      return;
    }

    const settings = settingsDoc.data();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const warningDays = settings?.warningDays || 3;
    const expirationAction = settings?.expirationAction || "archive";

    const adsSnapshot = await db.collection("ads")
      .where("status", "==", "approved")
      .get();

    console.log(`[Job] Checking ${adsSnapshot.size} approved ads...`);

    for (const doc of adsSnapshot.docs) {
      const ad = doc.data();
      if (!ad.expirationDate) continue;

      const expirationDate = ad.expirationDate.toDate();
      const diffTime = expirationDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // 1. Check for expiration
      if (diffTime <= 0) {
        console.log(`[Job] Ad ${doc.id} expired.`);
        
        // Track ignore if it was near_expiration
        if (ad.adStatus === "near_expiration") {
          await db.collection("metrics").doc(todayStr).set({
            notifications: {
              ignoresAfterWarning: FieldValue.increment(1)
            }
          }, { merge: true });
        }

        if (expirationAction === "delete") {
          await doc.ref.delete();
          console.log(`[Job] Ad ${doc.id} deleted.`);
        } else {
          await doc.ref.update({
            status: "expired",
            adStatus: "expired"
          });
          console.log(`[Job] Ad ${doc.id} archived.`);
        }

        // Notify user
        await db.collection("notifications").add({
          id: `notif_${Date.now()}_${doc.id}`,
          userId: ad.sellerId,
          title: "Anúncio Expirado",
          message: `Seu anúncio "${ad.title}" expirou e foi ${expirationAction === "delete" ? "removido" : "arquivado"}.`,
          type: "ad_expired",
          adId: doc.id,
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      } 
      // 2. Check for warning
      else if (diffDays <= warningDays && ad.adStatus !== "near_expiration") {
        console.log(`[Job] Ad ${doc.id} is near expiration (${diffDays} days left).`);
        await doc.ref.update({
          adStatus: "near_expiration"
        });

        // Track warning sent
        await db.collection("metrics").doc(todayStr).set({
          notifications: {
            warningsSent: FieldValue.increment(1)
          }
        }, { merge: true });

        // Notify user
        await db.collection("notifications").add({
          id: `notif_${Date.now()}_${doc.id}`,
          userId: ad.sellerId,
          title: "Aviso de Expiração",
          message: `Seu anúncio "${ad.title}" expirará em ${diffDays} dias. Clique para renovar ou atualizar.`,
          type: "expiration_warning",
          adId: doc.id,
          read: false,
          createdAt: FieldValue.serverTimestamp()
        });
      }
    }
  } catch (error) {
    console.error("[Job] Error in ad expiration job:", error);
  }
}

async function runMetricsAggregationJob() {
  console.log("[Job] Running metrics aggregation...");
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // 1. Users
    const usersSnapshot = await db.collection("users").get();
    const totalUsers = usersSnapshot.size;
    const cityDistribution: { [city: string]: number } = {};
    let activeUsers = 0;

    usersSnapshot.forEach(doc => {
      const data = doc.data();
      if (data.city) {
        cityDistribution[data.city] = (cityDistribution[data.city] || 0) + 1;
      }
      // Simple active check: registered or accepted terms in last 7 days
      if (data.acceptedTermsAt && data.acceptedTermsAt.toDate() > sevenDaysAgo) {
        activeUsers++;
      }
    });

    // 2. Ads
    const adsSnapshot = await db.collection("ads").get();
    const totalAds = adsSnapshot.size;
    const adsByStatus: { [status: string]: number } = {};
    const adsByCategory: { [category: string]: number } = {};
    let adsCreatedToday = 0;
    let totalViews = 0;
    let totalClicks = 0;
    let totalRenewals = 0;

    adsSnapshot.forEach(doc => {
      const ad = doc.data();
      adsByStatus[ad.status] = (adsByStatus[ad.status] || 0) + 1;
      adsByCategory[ad.category] = (adsByCategory[ad.category] || 0) + 1;
      
      if (ad.createdAt && ad.createdAt.toDate().toISOString().split('T')[0] === todayStr) {
        adsCreatedToday++;
      }
      
      totalViews += (ad.views || 0);
      totalClicks += (ad.whatsappClicks || 0);
      
      if (ad.renewalHistory) {
        totalRenewals += ad.renewalHistory.length;
      }
    });

    // 3. Favorites
    const favoritesSnapshot = await db.collection("favorites").get();
    const totalFavorites = favoritesSnapshot.size;

    // 4. Notifications (already tracked incrementally in expiration job, 
    // but we can sync totals here if needed)
    const metricsDoc = await db.collection("metrics").doc(todayStr).get();
    const existingMetrics = metricsDoc.exists ? metricsDoc.data() : {};

    const metrics = {
      id: todayStr,
      date: FieldValue.serverTimestamp(),
      users: {
        total: totalUsers,
        activeLast7Days: activeUsers,
        distributionByCity: cityDistribution
      },
      ads: {
        total: totalAds,
        byStatus: adsByStatus,
        byCategory: adsByCategory,
        createdToday: adsCreatedToday
      },
      interactions: {
        whatsappClicks: totalClicks,
        views: totalViews,
        renewals: totalRenewals,
        favorites: totalFavorites
      },
      notifications: {
        warningsSent: existingMetrics?.notifications?.warningsSent || 0,
        renewalsAfterWarning: existingMetrics?.notifications?.renewalsAfterWarning || 0,
        ignoresAfterWarning: existingMetrics?.notifications?.ignoresAfterWarning || 0
      }
    };

    await db.collection("metrics").doc(todayStr).set(metrics);
    console.log(`[Job] Metrics aggregated for ${todayStr}`);

  } catch (error) {
    console.error("[Job] Error in metrics aggregation job:", error);
  }
}

async function startServer() {
  const app = express();

  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "25mb", extended: true }));

  // Create local folders and serve them statically
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  app.use("/uploads", express.static(uploadsDir));

  // Permissive Security and Content Security Policy (CSP) Headers Middleware
  app.use((req, res, next) => {
    // Loosen Content Security Policy temporarily to allow Firebase development/production runtimes,
    // including 'unsafe-inline', 'unsafe-eval', and all Google/Firebase service endpoints.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self' *; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.google.com https://*.gstatic.com https://*.firebaseapp.com https://*.googleapis.com https://apis.google.com https://www.gstatic.com; " +
      "connect-src 'self' * 'unsafe-inline' 'unsafe-eval' wss://*.firebaseapp.com wss://*.googleapis.com; " +
      "img-src 'self' data: blob: *; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' data: https://fonts.gstatic.com;"
    );

    // Dynamic clean CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, x-goog-meta-, Content-Disposition");
    
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Run heavy background aggregation jobs on startup only in production to protect Firebase quota in development
  if (process.env.NODE_ENV === "production") {
    console.log("[Jobs] Starting background automation and metrics aggregation...");
    runAdExpirationJob().catch(err => console.error("[Job] Ad Expiration Job failed:", err));
    runMetricsAggregationJob().catch(err => console.error("[Job] Metrics Aggregation Job failed:", err));
    
    setInterval(async () => {
      await runAdExpirationJob();
      await runMetricsAggregationJob();
    }, 24 * 60 * 60 * 1000);
  } else {
    console.log("[Jobs] Heavy background jobs deactivated in development mode to prevent excessive Firestore reads.");
  }

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/gemini/analyze", async (req, res) => {
    try {
      const { image, categories } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Falta a imagem do print." });
      }

      const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBewRCSZ-nNqXiaVCRzgpfI1ieWf5QEyq4";
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
        console.warn("Generating content with gemini-3.5-flash failed, attempting fallback:", err.message);
        // Fallback model
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

      return res.json({ success: true, data: extractedData });
    } catch (err: any) {
      console.error("Erro na análise do Gemini no servidor:", err);
      return res.status(200).json({ 
        success: false, 
        error: `Falha na IA no servidor: ${err.message || 'Verifique se há chaves configuradas'}` 
      });
    }
  });

  app.post("/api/upload", async (req, res) => {
    try {
      const { image, filename } = req.body;
      if (!image) {
        return res.status(400).json({ error: "Missing image data" });
      }
      
      // Parse base64
      let base64Data = image;
      if (image.includes(";base64,")) {
        const parts = image.split(";base64,");
        base64Data = parts[1];
      }
      
      const buffer = Buffer.from(base64Data, "base64");
      
      // Generate safe unique name
      const uniqueId = crypto.randomUUID().substring(0, 8);
      const sanitizedName = (filename || "image.jpg").replace(/[^a-zA-Z0-9.-]/g, "_");
      const localFilename = `${Date.now()}-${uniqueId}-${sanitizedName}`;
      
      const targetPath = path.join(uploadsDir, localFilename);
      
      await fs.promises.writeFile(targetPath, buffer);
      
      const publicUrl = `/uploads/${localFilename}`;
      console.log(`[API_Upload] Securely uploaded image inside server uploads folder: ${publicUrl}`);
      return res.json({ url: publicUrl });
    } catch (err: any) {
      console.error("[API_Upload] Error in local file upload:", err);
      return res.status(500).json({ error: err.message || "Failed to upload image to local storage" });
    }
  });

  // Service Worker and PWA Cache Kill Switch Routes
  const killSwitchSW = `
    self.addEventListener('install', function(e) {
      self.skipWaiting();
    });
    self.addEventListener('activate', function(e) {
      self.registration.unregister()
        .then(function() {
          return self.clients.claim();
        })
        .then(function() {
          return self.clients.matchAll();
        })
        .then(function(clients) {
          clients.forEach(function(client) {
            if (client.navigate) {
              client.navigate(client.url);
            }
          });
        });
    });
  `;

  app.get(["/sw.js", "/service-worker.js", "/firebase-messaging-sw.js", "/sw-register.js", "/registerSW.js"], (req, res) => {
    console.log(`[ServiceWorkerKillSwitch] serving self-unregistering SW for: ${req.path}`);
    res.setHeader("Content-Type", "application/javascript");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.send(killSwitchSW);
  });

  app.get(["/manifest.webmanifest", "/manifest.json"], (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
    res.json({
      name: "Remix Mercado Luso",
      short_name: "Mercado Luso",
      start_url: "/",
      display: "standalone"
    });
  });

  app.get("/api/debug-ads", async (req, res) => {
    try {
      const snapshot = await db.collection("ads").limit(5).get();
      const ads: any[] = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        ads.push({ id: doc.id, title: d.title, imageUrl: d.imageUrl, images: d.images });
      });
      res.json({ success: true, ads });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    
    // Serve static assets with custom Cache-Control headers
    app.use(express.static(distPath, {
      setHeaders: (res, filepath) => {
        if (filepath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      }
    }));

    app.get("*", (req, res) => {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0");
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
