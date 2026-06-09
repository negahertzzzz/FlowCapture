import { useEffect } from "react";
import {
  OG_IMAGE_HEIGHT,
  OG_IMAGE_URL,
  OG_IMAGE_WIDTH,
  SITE_DESCRIPTION,
} from "../lib/site";

type PageMeta = {
  title: string;
  description?: string;
  url?: string;
  image?: string;
};

function setMetaTag(attr: "name" | "property", key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function setLinkTag(rel: string, href: string) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function usePageMeta({
  title,
  description = SITE_DESCRIPTION,
  url,
  image = OG_IMAGE_URL,
}: PageMeta) {
  useEffect(() => {
    const pageUrl = url ?? `${window.location.origin}${window.location.pathname}`;

    document.title = title;
    setMetaTag("name", "description", description);
    setMetaTag("property", "og:type", "website");
    setMetaTag("property", "og:url", pageUrl);
    setMetaTag("property", "og:title", title);
    setMetaTag("property", "og:description", description);
    setMetaTag("property", "og:image", image);
    setMetaTag("property", "og:image:width", String(OG_IMAGE_WIDTH));
    setMetaTag("property", "og:image:height", String(OG_IMAGE_HEIGHT));
    setMetaTag("name", "twitter:card", "summary_large_image");
    setMetaTag("name", "twitter:url", pageUrl);
    setMetaTag("name", "twitter:title", title);
    setMetaTag("name", "twitter:description", description);
    setMetaTag("name", "twitter:image", image);
    setLinkTag("canonical", pageUrl);
  }, [title, description, url, image]);
}
