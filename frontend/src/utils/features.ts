/**
 * TRY-ON-PAUSED: the Virtual Try-On is switched off for now and will be added
 * back later. Every place that offers it (product cards, quick view, product
 * page, menus, account pages, articles, guides, campaigns, beauty assistant)
 * checks this flag and simply doesn't render its try-on control, and
 * openVirtualTryOn in App.tsx refuses to open the modal.
 *
 * To restore: set this to true. Search "TRY-ON-PAUSED" to see every gated spot.
 */
export const TRY_ON_ENABLED = false;
