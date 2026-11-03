# Changelog

## 0.3.1

- Fix double-encoded characters in recipe imports and clear import notices on the recipe list.
- Retry transient Gemini HTTP 503 errors and report persistent service unavailability clearly.

## 0.3.0

- Import recipe text from public recipe pages with schema.org JSON-LD, with review before saving.
- Optionally extract recipes from photos using a shared Gemini API key, with review before saving.

## 0.2.0

- Add an experimental shared Cookidoo Belgium connection for sending text-only TM6 recipes to today's calendar, with administrator review of uncertain operations.
- The connection is unofficial and has not been verified against a real account or appliance.

## 0.1.1

- Require the initial administrator ID to be configured on the Home Assistant installation rather than using a repository default.

## 0.1.0

- Initial Home Assistant ingress app with private recipes, photos, likes, comments, taxonomy and access administration.
- Cross-user recipe links and public sharing are not yet available.
