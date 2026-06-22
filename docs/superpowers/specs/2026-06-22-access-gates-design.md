# Access Gates Design

## Goal

When the site or a public page is disabled, visitors and ordinary users see a maintenance screen instead of the disabled page or the login form. Administrators and users explicitly given the existing maintenance bypass retain access.

## Rules

- Administrators bypass every visual access gate.
- A user with `maintenance_bypass: true` bypasses maintenance mode and public-page visibility.
- When maintenance mode is on, every non-bypassed route, including `/login`, renders the maintenance screen.
- When maintenance mode is off and global page bypass is on, all controlled public pages are open.
- When global page bypass is off, each controlled public route follows its individual ON/OFF switch. An OFF route renders the coming-soon screen, including `/login`.
- Routes outside the public page map remain available unless maintenance mode blocks them.

## Interface

`lib/pageVisibility.mjs` will expose `getPageAccessDecision`. It accepts administrator status, user bypass status, maintenance status, route page key, and page visibility settings; it returns `allow`, `maintenance`, or `coming_soon`.

`pages/_app.js` will fetch the existing `/api/me`, `/api/maintenance`, and public page-visibility endpoints, then render from that decision. No credentials, Supabase keys, APIs, strategy logic, or indicator licensing change.

## Admin Controls

The dashboard Pages panel will accurately state that global bypass ON opens all controlled pages and makes individual switches inactive until it is OFF. It will also expose the existing Guardian and Stream page flags.

## Testing

Node tests will prove all gate precedence: administrator bypass, selected-user bypass, maintenance blocking login, global bypass opening a disabled page, and individual page-off behavior when global bypass is off.

