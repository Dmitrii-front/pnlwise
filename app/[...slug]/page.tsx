import { config } from "@/lib/config";
import { notFound } from "next/navigation";
import { Header, Footer, UploadLink, Faq } from "@/components/product/shared";
import { contentPages } from "@/lib/content";
import { siteOrigin, JsonLd } from "@/components/product/seo";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = slug.join("/"),
    page = contentPages[path];
  if (!page) return {};
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/${path}` },
    openGraph: {
      title: page.title,
      description: page.description,
      url: `${siteOrigin}/${path}`,
    },
    twitter: {
      title: page.title,
      description: page.description,
      card: "summary",
    },
  };
}
export function generateStaticParams() {
  return Object.keys(contentPages).map((path) => ({ slug: path.split("/") }));
}
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const path = slug.join("/"),
    page = contentPages[path];
  if (!page) notFound();
  return (
    <>
      <Header />
      <main id="main">
        <div className="content-hero wrap">
          <nav aria-label="Breadcrumb">
            <a href="/">Home</a>
            <span>/</span>
            <span>{page.guide ? "Guides" : "P&L generator"}</span>
          </nav>
          <span className="eyebrow">
            {page.eyebrow.replace("CLEARLEDGER", config.name.toUpperCase())}
          </span>
          <h1>{page.heading}</h1>
          <p>{page.intro}</p>
          <UploadLink />
          <small>Free preview · PDF, CSV, XLSX · No signup required</small>
        </div>
        <div className="content-layout wrap">
          <article className="prose-content">
            {page.sections.map(([title, text], i) => (
              <section key={title} id={`section-${i}`}>
                <h2>{title}</h2>
                <p>{text}</p>
              </section>
            ))}
            {page.guide && (
              <p className="source-note">
                Further reading:{" "}
                <a
                  href="https://www.irs.gov/publications/p583"
                  target="_blank"
                  rel="noreferrer"
                >
                  IRS Publication 583: Starting a Business and Keeping Records
                </a>{" "}
                and{" "}
                <a
                  href="https://www.irs.gov/publications/p538"
                  target="_blank"
                  rel="noreferrer"
                >
                  Publication 538: Accounting Periods and Methods
                </a>
                . This guide is general information, not tax advice.
              </p>
            )}
            <section>
              <h2>Your next step is a statement.</h2>
              <p>
                Upload your business bank statements, review the categories, and
                preview your P&L before paying.
              </p>
              <UploadLink />
            </section>
          </article>
          <aside className="content-aside">
            <span className="eyebrow">ON THIS PAGE</span>
            <nav>
              {page.sections.map(([title], i) => (
                <a
                  key={title}
                  href={`section-${i}`.replace("section", "#section")}
                >
                  {title}
                </a>
              ))}
            </nav>
            <div>
              <h3>A little more clarity</h3>
              <a href="/guides/what-is-a-profit-and-loss-statement">
                What is a P&L statement?
              </a>
              <a href="/guides/how-to-create-pnl-from-bank-statements">
                Create a P&L from bank statements
              </a>
              <a href="/bank-statement-to-pnl">Bank statement to P&L</a>
              <a href="/profit-and-loss-generator">
                Profit and loss generator
              </a>
              <a href="/security">How we handle your data</a>
            </div>
          </aside>
        </div>
        {!page.guide && (
          <section className="section wrap content-faq">
            <h2>Common questions</h2>
            <Faq />
          </section>
        )}
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: siteOrigin,
              },
              {
                "@type": "ListItem",
                position: 2,
                name: page.title,
                item: `${siteOrigin}/${path}`,
              },
            ],
          }}
        />
        {page.guide ? (
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "Article",
              headline: page.heading,
              description: page.description,
              author: { "@type": "Organization", name: config.name },
              mainEntityOfPage: `${siteOrigin}/${path}`,
            }}
          />
        ) : (
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: config.name,
              applicationCategory: "FinanceApplication",
              operatingSystem: "Web",
              description: page.description,
              offers: {
                "@type": "Offer",
                price: (config.priceCents / 100).toFixed(2),
                priceCurrency: "USD",
              },
            }}
          />
        )}
      </main>
      <Footer />
    </>
  );
}
