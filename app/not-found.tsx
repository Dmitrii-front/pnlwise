import { Header, Footer } from "@/components/product/shared";
import { Button } from "@/components/ui/button";
export default function NotFound() {
  return (
    <>
      <Header />
      <main id="main" className="wrap error-page">
        <span className="eyebrow">404 — PAGE NOT FOUND</span>
        <h1>That page doesn’t add up.</h1>
        <p>The link may have changed. Let’s get you back to your numbers.</p>
        <Button asChild>
          <a href="/">Back to home</a>
        </Button>
      </main>
      <Footer />
    </>
  );
}
