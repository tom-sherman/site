/** A slug for a post's path, from its title: `Is a burrito a monad?` → `is-a-burrito-a-monad`. */
export function slugify(title: string, maxLength = 60): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[`'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= maxLength) return slug;
  const cut = slug.slice(0, maxLength + 1);
  return cut.slice(
    0,
    cut.lastIndexOf("-") > 0 ? cut.lastIndexOf("-") : maxLength,
  );
}
