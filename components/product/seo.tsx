import { config } from "@/lib/config";
export const siteOrigin = config.siteUrl;
export function socialMetadata(
  title: string,
  description: string,
  path: string,
) {
  return {
    openGraph: {
      title,
      description,
      url: path === "/" ? siteOrigin : `${siteOrigin}${path}`,
      type: "website" as const,
    },
    twitter: {
      title,
      description,
      card: "summary" as const,
    },
  };
}
export function JsonLd({ data }: { data: unknown }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
