UPDATE tenants
SET policy = jsonb_set(
  policy,
  '{allowedProviders}',
  COALESCE(policy->'allowedProviders', '[]'::jsonb) || '"gemini"'::jsonb
)
WHERE NOT COALESCE(policy->'allowedProviders', '[]'::jsonb) @> '["gemini"]'::jsonb;
