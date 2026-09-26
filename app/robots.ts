import { siteOrigin } from "@/components/product/seo";
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
