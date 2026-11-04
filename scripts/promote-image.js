#!/usr/bin/env node
/**
 * MUNI Platform — ECR Image Tag Promoter
 *
 * Promotes a Docker image tag from one environment to another in AWS ECR.
 * Used in the CD pipeline to promote staging images to production without rebuilding.
 *
 * Usage:
 *   node scripts/promote-image.js --service=auth-service --from=staging --to=v1.2.3
 *   node scripts/promote-image.js --service=all --from=sha-abc1234 --to=stable
 *
 * Env vars required:
 *   AWS_REGION, ECR_REGISTRY (e.g. 123456789012.dkr.ecr.af-south-1.amazonaws.com)
 */

import { execSync } from 'node:child_process';

const SERVICES = [
  'api-gateway', 'auth-service', 'product-service', 'order-service',
  'payment-service', 'shipping-service', 'notification-service', 'analytics-service',
  'search-service', 'inventory-service', 'review-service', 'currency-service',
  'tax-service', 'discount-service', 'wishlist-service', 'cart-service',
  'media-service', 'fraud-service', 'return-service', 'dispute-service',
  'marketplace-service', 'fulfillment-service', 'checkout-service',
];

const args  = Object.fromEntries(
  process.argv.slice(2).map(arg => arg.replace('--', '').split('=')),
);

const SERVICE   = args.service;
const FROM_TAG  = args.from;
const TO_TAG    = args.to;
const REGION    = process.env.AWS_REGION    ?? 'af-south-1';
const REGISTRY  = process.env.ECR_REGISTRY  ?? '123456789012.dkr.ecr.af-south-1.amazonaws.com/muni';

if (!SERVICE || !FROM_TAG || !TO_TAG) {
  console.error('Usage: promote-image.js --service=<name|all> --from=<tag> --to=<tag>');
  process.exit(1);
}

const servicesToPromote = SERVICE === 'all' ? SERVICES : [SERVICE];

console.log(`\n🚀 Promoting ${servicesToPromote.length} service(s): ${FROM_TAG} → ${TO_TAG}\n`);

let failed = 0;
for (const svc of servicesToPromote) {
  const sourceUri = `${REGISTRY}/${svc}:${FROM_TAG}`;
  const targetUri = `${REGISTRY}/${svc}:${TO_TAG}`;

  try {
    // Pull the source image manifest and retag it in ECR
    // This copies the manifest without re-uploading layers
    const manifest = execSync(
      `aws ecr batch-get-image --region ${REGION} --repository-name muni/${svc} --image-ids imageTag=${FROM_TAG} --query "images[0].imageManifest" --output text`,
      { encoding: 'utf8' }
    ).trim();

    if (!manifest || manifest === 'None') {
      console.error(`  ❌ ${svc}: source image ${FROM_TAG} not found`);
      failed++;
      continue;
    }

    // Put the manifest back with the new tag
    execSync(
      `aws ecr put-image --region ${REGION} --repository-name muni/${svc} --image-tag ${TO_TAG} --image-manifest '${manifest.replace(/'/g, "'\\''")}' --output text`,
      { encoding: 'utf8' }
    );

    console.log(`  ✅ ${svc}: ${FROM_TAG} → ${TO_TAG}`);
  } catch (err) {
    console.error(`  ❌ ${svc}: ${err.message?.split('\n')[0]}`);
    failed++;
  }
}

console.log(`\n${servicesToPromote.length - failed}/${servicesToPromote.length} services promoted successfully`);

if (failed > 0) {
  console.error(`\n${failed} service(s) failed. Check AWS credentials and image tags.`);
  process.exit(1);
}
