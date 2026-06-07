import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  enableIndexedDbPersistence,
  getDocsFromCache,
  getDocsFromServer,
  getDocFromCache,
  getDocFromServer,
  Query,
  QuerySnapshot,
  DocumentReference,
  DocumentSnapshot
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);

// Enable long polling only in sandboxed environments (such as localhost or Google Cloud Run dev URL)
// to bypass sandboxed iframe restrictions. In production (mercado-luso.com), use the default transport
// (WebSockets / streaming) to prevent reverse proxies/CDNs from buffering long-polling chunks and timing out.
const isSandboxEnv = typeof window !== 'undefined' && (
  window.location.hostname.includes('localhost') ||
  window.location.hostname.includes('127.0.0.1') ||
  window.location.hostname.includes('run.app')
);

console.log('[Firebase] Initializing client-side app. Hostname:', typeof window !== 'undefined' ? window.location.hostname : 'Server-side', '| Sandbox Env (Force Long-Polling):', isSandboxEnv);

const firestoreOptions = isSandboxEnv ? { experimentalForceLongPolling: true } : {};

const dbId = firebaseConfig.firestoreDatabaseId === '(default)' ? undefined : firebaseConfig.firestoreDatabaseId;
export const db = dbId 
  ? initializeFirestore(app, firestoreOptions, dbId)
  : initializeFirestore(app, firestoreOptions);

// Ativação de Persistência Offline (Cache) via IndexedDb conforme pedido
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn('[Firebase] A persistência de dados falhou (múltiplas tabs abertas)');
    } else if (err.code === 'unimplemented') {
      console.warn('[Firebase] O browser atual não suporta persistência offline.');
    } else {
      console.warn('[Firebase] Erro ao ativar persistência offline:', err);
    }
  });
}

// Configura as buscas para tentarem ler primeiro do Servidor e apenas do Cache como Fallback (Offline) para garantir dados sempre atualizados em tempo real estando online
export async function getDocsWithCacheFallback(q: Query, pathLabel: string = 'unknown'): Promise<QuerySnapshot> {
  console.log(`[Firestore SERVER FETCH] 🌍 Tentando ler do Servidor para: ${pathLabel}`);
  try {
    const snap = await getDocsFromServer(q);
    console.log(`[Firestore Server Success] Recuperado com sucesso do Servidor (${snap.size} docs) para: ${pathLabel}`);
    return snap;
  } catch (err) {
    console.warn(`[Firestore Server Fallback] Falha ao ler do servidor para: ${pathLabel}. Tentando ler do Cache local...`, err);
    try {
      const snap = await getDocsFromCache(q);
      console.log(`[Firestore Cache HIT] Recuperado com sucesso do Cache local (${snap.size} docs) como fallback para: ${pathLabel}`);
      return snap;
    } catch (cacheErr) {
      console.error(`[Firestore Fatal Error] Falha de leitura e cache para: ${pathLabel}`, cacheErr);
      throw err;
    }
  }
}

export async function getDocWithCacheFallback(docRef: DocumentReference, pathLabel: string = 'unknown'): Promise<DocumentSnapshot> {
  console.log(`[Firestore SERVER FETCH] 🌍 Tentando ler do Servidor para o documento: ${pathLabel}`);
  try {
    const snap = await getDocFromServer(docRef);
    console.log(`[Firestore Server Success] Documento recuperado do Servidor para: ${pathLabel}`);
    return snap;
  } catch (err) {
    console.warn(`[Firestore Server Fallback] Falha ao ler documento do servidor para: ${pathLabel}. Tentando ler do Cache local...`, err);
    try {
      const snap = await getDocFromCache(docRef);
      console.log(`[Firestore Cache HIT] Documento recuperado do Cache local para: ${pathLabel}`);
      return snap;
    } catch (cacheErr) {
      console.error(`[Firestore Fatal Error] Falha de leitura e cache para documento: ${pathLabel}`, cacheErr);
      throw err;
    }
  }
}

export const auth = getAuth(app);
console.log('[Firebase] Initializing Storage with bucket url:', firebaseConfig.storageBucket || "gs://navlink-489413.firebasestorage.app");
export const storage = getStorage(app, "gs://navlink-489413.firebasestorage.app");

// Limit upload and operation retries of the Firebase Storage instance to prevent freezing loading states in case of network or CORS issues
storage.maxUploadRetryTime = 6000; // 6 seconds
storage.maxOperationRetryTime = 6000; // 6 seconds

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function parseFirestoreDate(field: any): Date | null {
  if (!field) return null;
  if (typeof field.toDate === 'function') {
    return field.toDate();
  }
  if (typeof field === 'object' && field !== null && 'seconds' in field) {
    return new Date(field.seconds * 1000);
  }
  if (field instanceof Date) {
    return field;
  }
  const parsed = new Date(field);
  return isNaN(parsed.getTime()) ? null : parsed;
}

export function withTimeout<T>(promise: Promise<T>, timeoutMs: number = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout connecting to database"));
    }, timeoutMs);
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

