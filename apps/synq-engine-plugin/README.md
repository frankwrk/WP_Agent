# SYNQ Engine WordPress Plugin

## Engineering Checklist

- Use capability checks (`manage_options` or equivalent) on admin mutation endpoints.
- Verify WP REST nonces on admin REST requests.
- Sanitize and validate all input; escape admin-rendered output.
- Never log secrets, key material, or bootstrap tokens.
- Preserve backward compatibility for option/schema changes.
- Avoid deprecated WordPress APIs and prefer current WordPress best practices.

## Version Policy

- Bump plugin patch version on every plugin code or bundled admin asset change.
- Keep `apps/synq-engine-plugin/plugin.php` header version and `apps/synq-engine-plugin/includes/constants.php` `PLUGIN_VERSION` in sync.
- Run `npm run check:synq-engine-plugin-version` before packaging or shipping plugin changes.

## Packaging

- Build and package a distributable zip with `synq-engine/` as the root plugin folder:

```bash
npm run package:synq-engine-plugin
```

- Output artifact: `dist/synq-engine.zip`.

## Backend URL Smoke Checklist

- Local dev default: leave Backend URL unset and verify Connect shows `http://localhost:3001`.
- Production target: set Backend URL to `https://api.synqengine.com`, save, then run pairing.
- Validation: enter an invalid scheme (for example `ftp://example.com`) and verify save is rejected.
