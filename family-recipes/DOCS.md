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
2. Open the Family Recipes app's **Configuration** tab. Set `initial_admin_id` to that ID, save, and start or restart the app.
3. Open the web UI from the app page, or enable its sidebar entry. `hofmacho` must be signed into Home Assistant when opening it. The app reads the authenticated user ID from Supervisor ingress; it does not ask for a second password.
4. Open **Admin > Users > Allow user**. Enter each family member's Home Assistant user ID and a display name. Users must already have Home Assistant accounts. The displayed name may update from the identity supplied by Home Assistant when a user opens the app.

The configured initial admin is always re-enabled and assigned the app-admin role at startup. They cannot be disabled or demoted from inside the app. To recover access, stop the app, change `initial_admin_id` to another existing Home Assistant user ID, and start it again. The former initial administrator remains an app admin until explicitly demoted or disabled. Never share credentials or Home Assistant access tokens to grant recipe access.

The app's admin page only controls access to Family Recipes; create, disable, or delete Home Assistant accounts in Home Assistant itself. A disabled recipe-app user is denied on their next request. The initial admin and the currently signed-in admin cannot demote or disable themselves.

## Using the app

Add a recipe with ingredients and instructions, then open it to add photos. JPEG, PNG and WebP files are accepted, up to 5 MB each and five photos per recipe; images are converted to WebP. The owner and app admins can edit recipes and manage their photos. Every allowed user can view every recipe, like it and comment; a comment's author and admins can edit or remove it. Only app admins manage categories and tags. Deleting a category or tag removes it from recipes but does not delete the recipes.

**Sharing limitation:** All viewing requires an allowed Home Assistant account. Cross-user links are not yet available because Home Assistant ingress paths can contain session-specific values. Do not copy or share the raw ingress URL. Anonymous public access is not available.

## Backups and recovery

Recipes, users, permissions, likes and comments are stored in `/data/recipes.db`; photos are stored in `/data/images`. Keep them together.

For a consistent backup, stop Family Recipes, create a Home Assistant backup that includes the app and its data, wait for the backup to finish, then start the app. Do not copy a live SQLite database and image directory separately as a backup. Keep at least one backup somewhere other than the laptop. For recovery, restore the app and its data together using Home Assistant, check the `initial_admin_id` configuration, start the app, and verify that both recipes and photos appear. Test restoration on a safe instance before relying on it; Home Assistant backup behavior has not yet been verified on the target device.

## Troubleshooting

- **Access denied:** Check the Home Assistant account's ID in the app allowlist. The user must access the app through Home Assistant ingress, not a direct container address. If Home Assistant does not provide an identity header, access is denied and this must be investigated in Home Assistant.
- **Initial admin cannot enter:** Verify `initial_admin_id` is the account's ID, save the configuration and restart the app. It is not the username `hofmacho`.
- **App does not start or an image fails:** Inspect the app's Log tab. Missing configuration, invalid images, storage errors, and unexpected server errors are reported there or in the UI.
- **Back up before updating:** Stop the app and back it up before installing an update. The database schema is versioned; newer unsupported schema versions fail to start rather than being silently overwritten.
