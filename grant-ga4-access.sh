#!/bin/bash
TOKEN=$(gcloud auth print-access-token)
URL="https://analyticsadmin.googleapis.com/v1beta/properties/534867380/userLinks"
EMAIL="ga4-mcp-reader@optimizalk.iam.gserviceaccount.com"

curl -s -X POST "$URL" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"emailAddress\":\"$EMAIL\",\"directRoles\":[\"predefinedRoles/viewer\"]}"
