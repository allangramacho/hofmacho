# Family Recipes setup and operation

## Requirements

- Home Assistant OS on an amd64 machine and a working Home Assistant administrator account.
- Enough space for the app image, database and recipe photos. The app builds its image locally during installation, so the first install takes longer and needs internet access to download its build dependencies.
- For use away from home, your existing Home Assistant Cloud/Nabu Casa remote access must already work. No additional public port or Google account is needed.

## Install

The source must first be available to your Home Assistant machine. These changes are local until you publish them; adding a GitHub repository will not make uncommitted local files available.

**Local app:** Copy the entire `family-recipes` directory, including `package-lock.json`, to your Home Assistant `local_apps` shared folder (also called `addons` on older versions). Do not copy `node_modules`, `dist`, or `server-dist`. The Samba share app can provide access to this folder. In **Settings > Apps**, reload the app store, locate Family Recipes under local apps, and install it. Home Assistant builds the included Dockerfile.

Alternatively, after the changes are committed and pushed to a GitHub repository, add that repository URL in the Home Assistant app store's repository settings, reload, and install Family Recipes.

## First administrator

1. In Home Assistant, open **Settings > People > Users** and select the `hofmacho` account. Enable Advanced Mode on your profile if the Users tab is hidden. Copy the account's **ID**, not its username or a long-lived access token.
2. Open the Family Recipes app's **Configuration** tab. Set `initial_admin_id` to that ID, save, and start or restart the app. This required setting is stored by Home Assistant on your HAOS installation; it has no default in the repository.
3. Open the web UI from the app page, or enable its sidebar entry. `hofmacho` must be signed into Home Assistant when opening it. The app reads the authenticated user ID from Supervisor ingress; it does not ask for a second password.
4. Open **Admin > Users > Allow user**. Enter each family member's Home Assistant user ID and a display name. Users must already have Home Assistant accounts. The displayed name may update from the identity supplied by Home Assistant when a user opens the app.

The configured initial admin is always re-enabled and assigned the app-admin role at startup. They cannot be disabled or demoted from inside the app. To recover access, stop the app, change `initial_admin_id` to another existing Home Assistant user ID, and start it again. The former initial administrator remains an app admin until explicitly demoted or disabled. Never share credentials or Home Assistant access tokens to grant recipe access.

The app's admin page only controls access to Family Recipes; create, disable, or delete Home Assistant accounts in Home Assistant itself. A disabled recipe-app user is denied on their next request. The initial admin and the currently signed-in admin cannot demote or disable themselves.

## Using the app

Add a recipe with ingredients and instructions, then open it to add photos. JPEG, PNG and WebP files are accepted, up to 5 MB each and five photos per recipe; images are converted to WebP. The owner and app admins can edit recipes and manage their photos. Every allowed user can view every recipe, like it and comment; a comment's author and admins can edit or remove it. Only app admins manage categories and tags. Deleting a category or tag removes it from recipes but does not delete the recipes.

To import a recipe, choose **Add recipe**, paste a public recipe-page URL, and select **Import recipe**. The app extracts the title, description, ingredients and instructions from schema.org Recipe JSON-LD when available. Review and complete the fields before saving; the import does not save automatically, import photos, or assign categories and tags. Sites that require a login, block automated access, or do not provide this structured data may not work. Only public HTTP(S) addresses on standard ports are supported; the app contacts the website directly, so the website can see its IP address. Do not include passwords, tokens, or other sensitive information in URLs. Import only content you have permission to use.

### Importing a recipe photo with Gemini

1. An administrator can create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey). Review Google's [pricing](https://ai.google.dev/gemini-api/docs/pricing), [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits), and [terms](https://ai.google.dev/gemini-api/terms) for the project's location and billing status. The app uses `gemini-3.8-flash`, which has a free tier where available; quotas and availability can change, and paid projects can incur charges. The app does not enforce a spending limit.
2. In **Settings > Apps > Family Recipes > Configuration**, set `gemini_api_key`, save, and restart the app. Do not put the key in chat, source files, or logs. Home Assistant administrators and backups containing app configuration may access it; remove the value and restart to disable photo import.
3. Choose **Add recipe**, select a single JPEG, PNG or WebP recipe photo (up to 5 MB), and choose **Send to Google and import**. The app sends a processed copy to Gemini and fills the form; it does not save the photo or recipe automatically. To attach a photo to a saved recipe, use **Add photo** separately.

All allowed users can use the shared Gemini key and quota. Google receives the image and prompt; free-tier content may be used to improve its products under Google's terms. Only upload images you have permission to use and are comfortable sharing with Google. AI can misread or invent information, especially quantities, units and cooking instructions: check every field against the photo and complete missing details before saving or cooking.

If Gemini returns HTTP 503, the app retries twice with short delays, sending the image again; this may use additional quota or incur charges on paid projects. Persistent 503 errors mean the service or model is unavailable for that request, not necessarily that the key is wrong. Try again later and check Google's service status. The app does not automatically retry rejected keys or quota errors.

**Sharing limitation:** All viewing requires an allowed Home Assistant account. Cross-user links are not yet available because Home Assistant ingress paths can contain session-specific values. Do not copy or share the raw ingress URL. Anonymous public access is not available.

## Experimental Cookidoo connection (Belgium, TM6)

This feature uses unofficial Cookidoo web interfaces; it is not supported by Vorwerk and may stop working. It has not yet been verified against a real Belgian account or TM6. A Cookidoo subscription may be required for created recipes.

An app administrator can configure one **shared** Cookidoo account. Every allowed Family Recipes user can send recipes to it and change the linked Cookidoo recipe and calendar. Only give app access to people you trust with that account.

1. On a private computer, sign into the intended account at `https://cookidoo.be` using Dutch (Belgium). Verify that you can open Created Recipes.
2. In your browser's developer tools, open the Network panel and select a request sent to `cookidoo.be` while opening Created Recipes. In its request headers, locate the `Cookie` header. Copy only its value, not other headers or cookies for other sites. Depending on the session it can contain several name/value pairs such as `_oauth2_proxy=…; v-authenticated=…`.
3. In Home Assistant, open **Settings > Apps > Family Recipes > Configuration**. Set `cookidoo_cookie` to the copied cookie-header value, save, and restart the app. Do not paste it into a chat, source file, issue, or log. It gives access to your Cookidoo account.
4. Open a Family Recipes recipe, check its ingredients and instructions, then choose **Send to Cookidoo for today**. The app uses the date on the device running the browser. Confirm that the recipe appears in Cookidoo's created recipes and today's calendar, and then check it on the TM6.

If Cookidoo redirects or rejects the session, sign in again and replace the cookie. The browser session can expire, and the precise required cookies or Belgian endpoint behavior may change. The cookie is stored in Home Assistant's app configuration, not the recipe database; Home Assistant administrators and backups containing app configuration may have access to it. Protect backups and remove the configuration value to disconnect the app. Never put passwords or cookies in this repository.

Each non-empty ingredient line and instruction line is sent as a separate item. Titles over 120 characters cannot be sent. The TM6 is selected, but the app sends **text-only steps**: it does not create machine settings or automatically set time, temperature, speed, or direction. Manually check the instructions and operate the appliance. Recipe descriptions, photos, tags, comments, and likes are not sent. Verify that your own recipes are appropriate and safe for the TM6; the app does not convert them.

The first send creates a Cookidoo created recipe. Subsequent sends for a different date update that linked recipe's name, ingredients, instructions, and model, replacing changes made to those fields directly in Cookidoo. Other fields are not intentionally changed. A second send for the same date is blocked to reduce duplicates; after checking the calendar, an administrator can choose **Allow scheduling again**. Deleting a Family Recipes recipe does **not** delete its Cookidoo copy. If you connect a different Cookidoo account, an administrator must forget each existing link before sending it to the new account.

Cookidoo does not provide an established idempotency guarantee. If a request times out, is interrupted, or returns an unconfirmable response, the app blocks further sends for that recipe. Open Cookidoo and check both Created Recipes and the date's calendar before an app administrator selects **Review complete: allow retry**. If the creation result was uncertain and a matching recipe already exists, use **Link existing Cookidoo recipe** and enter its ID from its Cookidoo URL; the app checks that the ID and title match before linking it. If no recipe was created, the administrator can allow a retry. If the calendar already contains the recipe, do not retry without first resolving the existing entry in Cookidoo. **Forget Cookidoo link** removes only the local link; sending again creates a new copy and can create duplicates. An interrupted operation after an app restart also requires review.

## Backups and recovery

Recipes, users, permissions, likes and comments are stored in `/data/recipes.db`; photos are stored in `/data/images`. Keep them together.

For a consistent backup, stop Family Recipes, create a Home Assistant backup that includes the app and its data, wait for the backup to finish, then start the app. Do not copy a live SQLite database and image directory separately as a backup. Keep at least one backup somewhere other than the laptop. For recovery, restore the app and its data together using Home Assistant, check the `initial_admin_id` configuration, start the app, and verify that both recipes and photos appear. Test restoration on a safe instance before relying on it; Home Assistant backup behavior has not yet been verified on the target device.

## Troubleshooting

- **Access denied:** Check the Home Assistant account's ID in the app allowlist. The user must access the app through Home Assistant ingress, not a direct container address. If Home Assistant does not provide an identity header, access is denied and this must be investigated in Home Assistant.
- **Initial admin cannot enter:** Verify `initial_admin_id` is the account's ID, save the configuration and restart the app. It is not the username `hofmacho`.
- **App does not start or an image fails:** Inspect the app's Log tab. Missing configuration, invalid images, storage errors, and unexpected server errors are reported there or in the UI.
- **Cookidoo fails:** Check the session and Belgian locale as described above. If an operation needs review, do not retry blindly; inspect Cookidoo first. A successful test in Family Recipes does not establish that guided cooking works on the appliance.
- **Back up before updating:** Stop the app and back it up before installing an update. The database schema is versioned; newer unsupported schema versions fail to start rather than being silently overwritten.
