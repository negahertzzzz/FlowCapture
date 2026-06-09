import { BackgroundFx } from "../components/BackgroundFx";
import { Footer } from "../components/Footer";
import { Nav } from "../components/Nav";
import { AiReplay } from "../components/sections/AiReplay";
import { BeforeAfter } from "../components/sections/BeforeAfter";
import { DownloadCta } from "../components/sections/DownloadCta";
import { ExportFormats } from "../components/sections/ExportFormats";
import { Features } from "../components/sections/Features";
import { Hero } from "../components/sections/Hero";
import { HowItWorks } from "../components/sections/HowItWorks";
import { OpenSource } from "../components/sections/OpenSource";
import { Providers } from "../components/sections/Providers";
import { useAnimationFallback } from "../hooks/useAnimationFallback";
import { usePageMeta } from "../hooks/usePageMeta";
import { useScrollReveal } from "../hooks/useScrollReveal";
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from "../lib/site";

export default function LandingPage() {
  usePageMeta({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
  });
  useAnimationFallback();
  useScrollReveal();

  return (
    <>
      <BackgroundFx />
      <Nav />
      <main id="top">
        <Hero />
        <Providers />
        <BeforeAfter />
        <HowItWorks />
        <Features />
        <ExportFormats />
        <AiReplay />
        <OpenSource />
        <DownloadCta />
      </main>
      <Footer />
    </>
  );
}
