/**
 * Short links: carsonlwagner.com/yt -> YouTube, etc.
 * Anything unmatched falls through to the static site (404 / index).
 */
const MAP = {
  yt: "https://www.youtube.com/@carsonwagner",
  youtube: "https://www.youtube.com/@carsonwagner",
  sub: "https://substack.com/@carsonwagner",
  substack: "https://substack.com/@carsonwagner",
  read: "https://substack.com/@carsonwagner",
  li: "https://www.linkedin.com/in/carsonlwagner/",
  linkedin: "https://www.linkedin.com/in/carsonlwagner/",
  pod: "https://podcasts.apple.com/us/podcast/the-carson-wagner-show/id1848040165",
  apple: "https://podcasts.apple.com/us/podcast/the-carson-wagner-show/id1848040165",
  listen: "https://open.spotify.com/show/2lNntFb4Z3DelNHmsg7Dtj",
  spotify: "https://open.spotify.com/show/2lNntFb4Z3DelNHmsg7Dtj",
  rumble: "https://rumble.com/c/c-7844518",
  medium: "https://medium.com/@carsonlwagner",
  books: "https://www.goodreads.com/carsonlwagner",
  goodreads: "https://www.goodreads.com/carsonlwagner",
  coffee: "https://buymeacoffee.com/carsonwagner",
  tip: "https://buymeacoffee.com/carsonwagner",
  support: "https://buymeacoffee.com/carsonwagner",
  email: "mailto:thecarsonwagnershow@gmail.com",
  contact: "mailto:thecarsonwagnershow@gmail.com",
};

export async function onRequest(context) {
  const slug = String(context.params.slug || "").toLowerCase();
  const target = MAP[slug];

  if (!target) {
    // not a short link — let Pages serve the static asset / 404
    return context.next();
  }

  return Response.redirect(target, 302);
}
