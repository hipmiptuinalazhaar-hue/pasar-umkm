# Desktop Bottom Dock V4

This change corrects the desktop interaction contract after the P5 responsive release.

## User-visible fixes
- Laptop and desktop keep the five-item primary navigation as a centered bottom dock instead of converting it into a left rail.
- The fixed header spans the viewport and the home hero starts below it.
- Home discovery uses a centered wide canvas.
- Category cards use an auto-fitting grid so small category counts do not bunch up on the left.
- Feed width is increased to stay visually related to the hero while retaining a readable social-feed measure.

## Safety
- No API, auth, commerce, database, or production data behavior is changed.
- Mobile behavior below 768px remains owned by the mobile layers.
- Real-browser release verification now rejects a left-side desktop rail, hero/header overlap, overly narrow desktop feed, and clustered desktop categories.

## Temporary CSS structure
`tablet-desktop-v2.css` imports the prior P5 owner from `tablet-desktop-v2-base.css` and then applies the corrected desktop contract. This keeps the fix isolated and reversible while the responsive stylesheet is consolidated in technical-debt work.
