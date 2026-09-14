import { publicRoutes } from "@/lib/content";
import { siteOrigin } from "@/components/product/seo";
export default function sitemap() {
  return publicRoutes.map((path) => ({
    url: `${siteOrigin}${path}`,
    changeFrequency: path.includes("guides")
      ? ("monthly" as const)
      : ("weekly" as const),
    priority: path === "/" ? 1 : path === "/bank-statement-to-pnl" ? 0.9 : 0.6,
  }));
}
