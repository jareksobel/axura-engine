import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { PolicyRow } from '@/lib/db/queries/policies';

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 50,
    color: '#1a1a1a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 30,
    borderBottomWidth: 2,
    borderBottomColor: '#0f172a',
    paddingBottom: 12,
  },
  brandName: {
    fontSize: 22,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  brandTagline: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  policyRef: {
    textAlign: 'right',
  },
  policyNumber: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  policyLabel: {
    fontSize: 8,
    color: '#64748b',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 18,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
    paddingBottom: 3,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  label: {
    width: '40%',
    color: '#64748b',
  },
  value: {
    width: '60%',
    fontFamily: 'Helvetica-Bold',
  },
  premiumBox: {
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 4,
    padding: 14,
    marginTop: 18,
  },
  premiumTitle: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  premiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  premiumLabel: {
    color: '#64748b',
  },
  premiumValue: {
    fontFamily: 'Helvetica-Bold',
  },
  premiumDivider: {
    borderTopWidth: 0.5,
    borderTopColor: '#cbd5e1',
    marginVertical: 8,
  },
  premiumTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  premiumTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
  },
  premiumTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 50,
    right: 50,
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    fontSize: 7,
    color: '#94a3b8',
  },
  badge: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#86efac',
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginBottom: 14,
  },
  badgeText: {
    fontSize: 8,
    color: '#166534',
    fontFamily: 'Helvetica-Bold',
  },
  clauseText: {
    fontSize: 8,
    color: '#475569',
    lineHeight: 1.5,
    marginTop: 14,
  },
});

// ── Helper ─────────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatPln(amount: string | number): string {
  return `${Number(amount).toFixed(2)} PLN`;
}

// ── Document component ────────────────────────────────────────────────────────

function PolicyDocument({ policy }: { policy: PolicyRow }) {
  return React.createElement(
    Document,
    { title: `Polisa ${policy.policy_number}`, author: 'Axura' },
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(
          View,
          null,
          React.createElement(Text, { style: styles.brandName }, 'AXURA'),
          React.createElement(Text, { style: styles.brandTagline }, 'Ubezpieczenie mechaniczne pojazdu'),
        ),
        React.createElement(
          View,
          { style: styles.policyRef },
          React.createElement(Text, { style: styles.policyNumber }, policy.policy_number),
          React.createElement(Text, { style: styles.policyLabel }, 'Numer polisy'),
        ),
      ),

      // Status badge
      React.createElement(
        View,
        { style: styles.badge },
        React.createElement(Text, { style: styles.badgeText }, 'POLISA AKTYWNA'),
      ),

      // Policy period
      React.createElement(Text, { style: styles.sectionTitle }, 'Okres ubezpieczenia'),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Data początku:'),
        React.createElement(Text, { style: styles.value }, formatDate(policy.start_date)),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Data końca:'),
        React.createElement(Text, { style: styles.value }, formatDate(policy.end_date)),
      ),

      // Vehicle
      React.createElement(Text, { style: styles.sectionTitle }, 'Pojazd'),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Marka / Model:'),
        React.createElement(Text, { style: styles.value }, `${policy.make} ${policy.model} (${policy.year})`),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'VIN:'),
        React.createElement(Text, { style: styles.value }, policy.vin),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Nr rejestracyjny:'),
        React.createElement(Text, { style: styles.value }, policy.license_plate ?? '—'),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Przebieg przy inspekcji:'),
        React.createElement(Text, { style: styles.value }, `${policy.odo_at_inspection_km.toLocaleString('pl-PL')} km`),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Przebieg przy zakupie:'),
        React.createElement(Text, { style: styles.value }, `${policy.odo_at_policy_km.toLocaleString('pl-PL')} km`),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Tier przebiegu rocznego:'),
        React.createElement(Text, { style: styles.value }, policy.annual_mileage_tier.toUpperCase()),
      ),

      // Customer
      React.createElement(Text, { style: styles.sectionTitle }, 'Ubezpieczający'),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Imię i nazwisko:'),
        React.createElement(Text, { style: styles.value }, `${policy.customer_first_name} ${policy.customer_last_name}`),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'PESEL:'),
        React.createElement(Text, { style: styles.value }, policy.customer_pesel),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Adres:'),
        React.createElement(Text, { style: styles.value }, policy.customer_address),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'E-mail:'),
        React.createElement(Text, { style: styles.value }, policy.customer_email),
      ),
      React.createElement(
        View,
        { style: styles.row },
        React.createElement(Text, { style: styles.label }, 'Telefon:'),
        React.createElement(Text, { style: styles.value }, policy.customer_phone),
      ),

      // Premium
      React.createElement(
        View,
        { style: styles.premiumBox },
        React.createElement(Text, { style: styles.premiumTitle }, 'Składka ubezpieczeniowa'),
        React.createElement(
          View,
          { style: styles.premiumRow },
          React.createElement(Text, { style: styles.premiumLabel }, 'Stawka bazowa:'),
          React.createElement(Text, { style: styles.premiumValue }, formatPln(policy.base_rate_pln)),
        ),
        React.createElement(
          View,
          { style: styles.premiumRow },
          React.createElement(Text, { style: styles.premiumLabel }, 'Mnożnik oceny pojazdu:'),
          React.createElement(Text, { style: styles.premiumValue }, `× ${Number(policy.assessment_multiplier).toFixed(4)}`),
        ),
        React.createElement(
          View,
          { style: styles.premiumRow },
          React.createElement(Text, { style: styles.premiumLabel }, 'Mnożnik przebiegu:'),
          React.createElement(Text, { style: styles.premiumValue }, `× ${Number(policy.mileage_multiplier).toFixed(2)}`),
        ),
        React.createElement(View, { style: styles.premiumDivider }),
        React.createElement(
          View,
          { style: styles.premiumTotal },
          React.createElement(Text, { style: styles.premiumTotalLabel }, 'Składka brutto:'),
          React.createElement(Text, { style: styles.premiumTotalValue }, formatPln(policy.premium_gross_pln)),
        ),
      ),

      // Legal clause
      React.createElement(
        Text,
        { style: styles.clauseText },
        'Niniejsza polisa stanowi potwierdzenie zawarcia umowy ubezpieczenia mechanicznego pojazdu. ' +
        'Ubezpieczyciel ponosi odpowiedzialność za usterki mechaniczne objęte zakresem umowy zgodnie z OWU Axura. ' +
        'Ubezpieczenie nie obejmuje uszkodzeń wynikających z kolizji, pożaru ani działania sił zewnętrznych. ' +
        'Produkt ubezpieczeniowy jest zwolniony z podatku VAT na podstawie art. 43 ust. 1 pkt 37 ustawy o VAT.',
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, `Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}`),
        React.createElement(Text, { style: styles.footerText }, 'Axura Sp. z o.o. • axura.pl'),
        React.createElement(Text, { style: styles.footerText }, 'Dokument wygenerowany automatycznie'),
      ),
    ),
  );
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Renders the policy PDF to a Buffer.
 * Caller is responsible for uploading to R2 and updating the DB record.
 */
export async function generatePolicyPdf(policy: PolicyRow): Promise<Buffer> {
  const doc = React.createElement(PolicyDocument, { policy });
  const buffer = await renderToBuffer(doc as React.ReactElement);
  return Buffer.from(buffer);
}
