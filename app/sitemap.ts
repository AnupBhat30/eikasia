import type { MetadataRoute } from "next";

const SITE_URL = "https://eikasia.anupbhat.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
