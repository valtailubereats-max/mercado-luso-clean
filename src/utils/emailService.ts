import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Servidor centralizado de emails para o Mercado Luso
 * 
 * Permite desparar emails automáticos enviando solicitações para o backend (/api/email/send)
 * Trata falhas de forma silenciosa para nunca quebrar as operações principais da BD (Zero Disruptions).
 */

export interface EmailData {
  anuncio_aprovado: {
    sellerName: string;
    adTitle: string;
    adId: string;
  };
  anuncio_rejeitado: {
    sellerName: string;
    adTitle: string;
    reason: string;
  };
  anuncio_pendente_staff: {
    staffEmails: string[];
    adTitle: string;
    adId: string;
    sellerName: string;
  };
  interesse_contacto: {
    sellerName: string;
    adTitle: string;
    interestedName: string;
    adId: string;
  };
  review_recebida: {
    sellerName: string;
    reviewerName: string;
    rating: number;
    comment: string;
    adTitle: string;
  };
  compra_concluida: {
    sellerName: string;
    buyerName: string;
    adTitle: string;
  };
  boas_vindas: {
    userName: string;
  };
}

/**
 * Envia uma requisição de email para o endpoint backend.
 */
export async function sendEmailGeneric<T extends keyof EmailData>(
  template: T,
  to: string | string[],
  data: EmailData[T]
): Promise<{ success: boolean; error?: string }> {
  try {
    const isEnabled = localStorage.getItem('emails_enabled') !== 'false';
    if (!isEnabled) {
      console.log(`[EmailService] Envio de e-mails desativado via configuração local para o template: ${template}`);
      return { success: true };
    }

    const response = await fetch('/api/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        template,
        to,
        data,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ao enviar email`);
    }

    const resJson = await response.json();
    return resJson;
  } catch (err: any) {
    console.warn(`[EmailService] Falha não impeditiva ao disparar email (${template}):`, err?.message || err);
    return { success: false, error: err?.message || String(err) };
  }
}

/**
 * Helper para obter o email de um vendedor a partir do sellerId
 */
export async function getSellerEmail(sellerId: string): Promise<string | null> {
  if (!sellerId) return null;
  try {
    const userDocSnap = await getDoc(doc(db, 'users', sellerId));
    if (userDocSnap.exists()) {
      const userData = userDocSnap.data();
      return userData?.email || null;
    }
  } catch (err) {
    console.warn(`[EmailService] Não foi possível consultar o email do vendedor ${sellerId}:`, err);
  }
  return null;
}
