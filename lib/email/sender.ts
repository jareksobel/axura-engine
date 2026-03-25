/**
 * Transactional email sender via Resend.
 * Required env vars:
 *   RESEND_API_KEY       — Resend API key
 *   EMAIL_FROM           — sender address, e.g. "Axura <no-reply@axura.pl>"
 */

import { Resend } from 'resend';
import { createLogger } from '@/lib/logger';

const log = createLogger('email.sender');

function getClient(): Resend {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }
  return new Resend(process.env.RESEND_API_KEY);
}

function getFrom(): string {
  return process.env.EMAIL_FROM ?? 'Axura <no-reply@axura.pl>';
}

// ── Templates ─────────────────────────────────────────────────────────────────

export interface PolicyConfirmationParams {
  to: string;
  customerName: string;
  policyNumber: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  startDate: string;
  endDate: string;
  premiumGrossPln: number;
  pdfDownloadUrl?: string;
}

function policyConfirmationHtml(p: PolicyConfirmationParams): string {
  const dateStr = (d: string) =>
    new Date(d).toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"><title>Potwierdzenie polisy Axura</title></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;color:#1a1a1a;">
  <div style="background:#0f172a;padding:20px 24px;border-radius:6px 6px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:22px;">AXURA</h1>
    <p style="color:#94a3b8;margin:4px 0 0;font-size:12px;">Ubezpieczenie mechaniczne pojazdu</p>
  </div>
  <div style="border:1px solid #e2e8f0;border-top:none;border-radius:0 0 6px 6px;padding:24px;">
    <h2 style="font-size:18px;margin-top:0;">Twoja polisa jest aktywna</h2>
    <p>Drogi/a <strong>${p.customerName}</strong>,</p>
    <p>Potwierdzamy, że Twoja polisa ubezpieczeniowa została pomyślnie wystawiona i jest aktywna.</p>

    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;">
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;color:#64748b;width:45%;">Numer polisy</td><td style="padding:8px 12px;font-weight:bold;">${p.policyNumber}</td></tr>
      <tr><td style="padding:8px 12px;color:#64748b;">Pojazd</td><td style="padding:8px 12px;">${p.make} ${p.model} (${p.year})</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;color:#64748b;">VIN</td><td style="padding:8px 12px;font-family:monospace;">${p.vin}</td></tr>
      <tr><td style="padding:8px 12px;color:#64748b;">Okres ochrony</td><td style="padding:8px 12px;">${dateStr(p.startDate)} – ${dateStr(p.endDate)}</td></tr>
      <tr style="background:#f8fafc;"><td style="padding:8px 12px;color:#64748b;">Składka brutto</td><td style="padding:8px 12px;font-weight:bold;">${p.premiumGrossPln.toFixed(2)} PLN</td></tr>
    </table>

    ${
      p.pdfDownloadUrl
        ? `<p><a href="${p.pdfDownloadUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 20px;border-radius:4px;text-decoration:none;font-weight:bold;">Pobierz polisę PDF</a></p>`
        : ''
    }

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">
    <p style="font-size:12px;color:#94a3b8;">
      Axura Sp. z o.o. • axura.pl<br>
      Wiadomość wygenerowana automatycznie — prosimy nie odpowiadać.
    </p>
  </div>
</body>
</html>
  `.trim();
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Sends a policy activation confirmation email to the customer.
 */
export async function sendPolicyConfirmation(params: PolicyConfirmationParams): Promise<void> {
  const resend = getClient();

  try {
    const { error } = await resend.emails.send({
      from: getFrom(),
      to: params.to,
      subject: `Polisa ${params.policyNumber} — potwierdzenie aktywacji`,
      html: policyConfirmationHtml(params),
    });

    if (error) {
      log.error('Failed to send policy confirmation email', { to: params.to, error });
    } else {
      log.info('Policy confirmation email sent', { to: params.to, policyNumber: params.policyNumber });
    }
  } catch (err) {
    // Non-fatal — log and continue
    log.error('Email send exception', err);
  }
}
