/**
 * The application's own name, in one place.
 *
 * The header and the login screen both show it, and it was written out
 * separately in each — so renaming the product meant finding every copy and
 * hoping none was missed. Here it is a single edit.
 *
 * The `<title>` in `index.html` is the one copy that cannot import this,
 * because that file is served before any JavaScript runs. Keep the two in
 * step by hand.
 */
export const APP_NAME = 'Team Progress Tracker'

/** Sits above the name in the header, saying what kind of thing this is. */
export const APP_EYEBROW = 'Team workspace'
