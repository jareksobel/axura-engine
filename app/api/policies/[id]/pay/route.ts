import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getPolicyById, activatePolicy } from '@/lib/db/queries/policies';
import { registerTransaction, verifyTransaction, toGrosze } from '@/lib/payments/p24';
import { sendPolicyConfirmation } from '@/lib/email/sender';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.policies.pay');

/**
 * Two modes:
 *  1. action = "register"  → registers transaction with P24, returns redirect URL
 *  2. action = "confirm"   → verifies P24 notification and activates the policy
 */
const PaySchema = z.discriminatedUnion('action', [
  z.object({
    action:     z.literal('register'),
    return_url: z.url(),
    cancel_url: z.url(),
    notify_url: z.url(),
  }),
  z.object({
    action:           z.literal('confirm'),
    p24_order_id:     z.number().int(),
    p24_transaction_id: z.number().int(),
  }),
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.INSURANCE_SIMULATE);

    const { id } = await params;
    const policy = await getPolicyById(id);
    if (!policy) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${id} not found`);
    }
    if (policy.status !== 'pending_payment') {
      throw new ApiError(409, 'CONFLICT', `Policy is already in status: ${policy.status}`);
    }

    const body   = await req.json();
    const parsed = PaySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', parsed.error.flatten());
    }

    // ── Mode 1: register with P24 ─────────────────────────────────────────────
    if (parsed.data.action === 'register') {
      const { return_url, cancel_url, notify_url } = parsed.data;
      const amountGrosze = toGrosze(parseFloat(policy.premium_gross_pln));

      const result = await registerTransaction({
        orderId:       policy.id,
        policyNumber:  policy.policy_number,
        amountGrosze,
        email:         policy.customer_email,
        customerName:  `${policy.customer_first_name} ${policy.customer_last_name}`,
        returnUrl:     return_url,
        cancelUrl:     cancel_url,
        notifyUrl:     notify_url,
      });

      log.info('P24 registration initiated', { policyId: id, policyNumber: policy.policy_number });

      return NextResponse.json({
        data: {
          token:        result.token,
          redirect_url: result.redirectUrl,
          amount_grosze: amountGrosze,
        },
      });
    }

    // ── Mode 2: confirm (webhook / manual verify) ─────────────────────────────
    const { p24_order_id, p24_transaction_id } = parsed.data;
    const amountGrosze = toGrosze(parseFloat(policy.premium_gross_pln));

    const verified = await verifyTransaction({
      orderId:          p24_order_id,
      sessionId:        policy.id,
      amountGrosze,
      p24TransactionId: p24_transaction_id,
    });

    if (!verified) {
      throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'P24 transaction verification failed');
    }

    await activatePolicy(
      id,
      String(p24_order_id),
      String(p24_transaction_id),
    );

    log.info('Policy activated', { policyId: id, policyNumber: policy.policy_number });

    // Fire-and-forget confirmation email
    sendPolicyConfirmation({
      to:              policy.customer_email,
      customerName:    `${policy.customer_first_name} ${policy.customer_last_name}`,
      policyNumber:    policy.policy_number,
      vin:             policy.vin,
      make:            policy.make,
      model:           policy.model,
      year:            policy.year,
      startDate:       policy.start_date,
      endDate:         policy.end_date,
      premiumGrossPln: parseFloat(policy.premium_gross_pln),
    });

    return NextResponse.json({
      data: {
        id:            id,
        policy_number: policy.policy_number,
        status:        'active',
        paid_at:       new Date().toISOString(),
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
