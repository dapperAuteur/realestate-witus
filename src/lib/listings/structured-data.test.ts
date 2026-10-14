import { describe, expect, it } from "vitest";
import { listingJsonLd, serializeJsonLd } from "./structured-data";

const base = {
  url: "https://homes.example.com/en/listings/osu-heights-k3x9ab",
  title: "Osu Heights",
  description: "Light-filled three bedroom with a garden.",
  status: "for_sale" as const,
  kind: "single_family" as const,
  priceMinor: 125_000_000,
  currency: "USD",
  datePosted: new Date("2026-10-01T12:00:00Z"),
  images: ["https://img/1.jpg"],
  hideAddress: false,
  address: { addressLine1: "14 Ring Road", locality: "Accra", region: "Greater Accra", postalCode: "GA-1", countryCode: "GH" },
};

describe("listingJsonLd", () => {
  it("describes a listing with its offer", () => {
    const data = listingJsonLd(base);
    expect(data).toMatchObject({
      "@type": "RealEstateListing",
      name: "Osu Heights",
      datePosted: "2026-10-01",
      about: { "@type": "SingleFamilyResidence", address: { streetAddress: "14 Ring Road", addressCountry: "GH" } },
      offers: { "@type": "Offer", price: 1_250_000, priceCurrency: "USD", availability: "https://schema.org/InStock" },
    });
  });

  it("keeps a hidden street address out of the markup", () => {
    const data = listingJsonLd({ ...base, hideAddress: true });
    expect(JSON.stringify(data)).not.toContain("Ring Road");
    expect(JSON.stringify(data)).not.toContain("GA-1");
    expect(data.about).toMatchObject({ address: { addressLocality: "Accra" } });
  });

  it("omits the offer when the price is on request", () => {
    expect(listingJsonLd({ ...base, priceMinor: null }).offers).toBeUndefined();
  });

  it("marks sold listings sold out", () => {
    expect(listingJsonLd({ ...base, status: "sold" }).offers).toMatchObject({
      availability: "https://schema.org/SoldOut",
    });
  });
});

describe("serializeJsonLd", () => {
  it("cannot close the script tag", () => {
    const out = serializeJsonLd({ name: "</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out)).toEqual({ name: "</script><script>alert(1)</script>" });
  });
});
