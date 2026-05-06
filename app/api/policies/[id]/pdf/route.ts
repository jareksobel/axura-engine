import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext } from '@/lib/auth/context';
import { requirePermission, PERMISSIONS } from '@/lib/auth/permissions';
import { errorResponse, ApiError } from '@/lib/errors';
import { getPolicyById, setPolicyPdfKey } from '@/lib/db/queries/policies';
import { generatePolicyPdf } from '@/lib/pdf/policy-generator';
import { buildPolicyPdfKey, getPresignedDownloadUrl, r2 } from '@/lib/r2/client';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { createLogger } from '@/lib/logger';

const log = createLogger('api.policies.pdf');

const BUCKET = process.env.CLOUDFLARE_R2_BUCKET;
const R2_CONFIGURED = !!(BUCKET && process.env.CLOUDFLARE_R2_ENDPOINT);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getRequestContext();
    requirePermission(ctx, PERMISSIONS.VEHICLE_READ);

    const { id } = await params;
    const policy = await getPolicyById(id);
    if (!policy) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${id} not found`);
    }
    if (policy.status !== 'active') {
      throw new ApiError(422, 'BUSINESS_RULE_VIOLATION', 'PDF is only available for active policies');
    }

    // Dealer users can only access their own dealer's policies
    if (ctx.dealerId && policy.dealer_id !== ctx.dealerId) {
      throw new ApiError(403, 'FORBIDDEN', 'Access denied to this policy');
    }

    log.info('Generating policy PDF', { policyId: id, policyNumber: policy.policy_number, r2: R2_CONFIGURED });
    const pdfBuffer = await generatePolicyPdf(policy);

    // Local dev: R2 not configured — stream inline
    if (!R2_CONFIGURED) {
      return new NextResponse(new Uint8Array(pdfBuffer), {
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `attachment; filename="polisa-${policy.policy_number}.pdf"`,
        },
      });
    }

    // Production: upload to R2 on first request, return presigned URL
    const r2Key = buildPolicyPdfKey(id);

    if (!policy.pdf_r2_key) {
      await r2.send(
        new PutObjectCommand({
          Bucket:      BUCKET!,
          Key:         r2Key,
          Body:        pdfBuffer,
          ContentType: 'application/pdf',
        }),
      );
      await setPolicyPdfKey(id, r2Key);
      log.info('Policy PDF uploaded to R2', { policyId: id, r2Key });
    }

    const downloadUrl = await getPresignedDownloadUrl(policy.pdf_r2_key ?? r2Key, 3600);

    return NextResponse.json({
      data: {
        download_url:  downloadUrl,
        r2_key:        policy.pdf_r2_key ?? r2Key,
        generated_at:  policy.pdf_generated_at ?? new Date().toISOString(),
        expires_in_s:  3600,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
