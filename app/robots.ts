import { siteOrigin } from "@/components/product/seo";
export default function robots() {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/generate", "/report/", "/checkout", "/api/"],
    },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
