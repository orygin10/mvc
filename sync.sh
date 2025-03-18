#!/bin/bash
set -euo pipefail

VERSION=$(date +%Y%m%d%H%M%S)
# aws s3 rm s3://ppm-static-eu-central-1/vendor/js/libppm --recursive
aws s3 cp dist/ "s3://ppm-static-eu-central-1/vendor/js/libppm/${VERSION}/" --recursive
# aws cloudfront create-invalidation --distribution-id EE1GPFZWOCI0S --paths "/*"