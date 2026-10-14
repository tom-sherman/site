/**
 * Mastodon aliases, like `@tom@tom-sherman.com`, for my Fosstodon account.
 * They were the old site's; tom-sherman.com redirects lookups here now.
 */
const RESOURCES = ["me", "tom", "tomsherman", "mastodon", "social"].map(
  (username) => `acct:${username}@tom-sherman.com`,
);

export function GET(request: Request) {
  const resource = new URL(request.url).searchParams.get("resource");
  if (!resource) {
    return new Response("Missing resource query parameter", { status: 400 });
  }
  if (!RESOURCES.includes(resource)) {
    return new Response("Not found", { status: 404 });
  }

  return Response.json(
    {
      subject: "acct:tomsherman@fosstodon.org",
      aliases: [
        "https://fosstodon.org/@tomsherman",
        "https://fosstodon.org/users/tomsherman",
      ],
      links: [
        {
          rel: "http://webfinger.net/rel/profile-page",
          type: "text/html",
          href: "https://fosstodon.org/@tomsherman",
        },
        {
          rel: "self",
          type: "application/activity+json",
          href: "https://fosstodon.org/users/tomsherman",
        },
        {
          rel: "http://ostatus.org/schema/1.0/subscribe",
          template: "https://fosstodon.org/authorize_interaction?uri={uri}",
        },
      ],
    },
    { headers: { "content-type": "application/jrd+json" } },
  );
}
