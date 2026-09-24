export async function saveImage({ blob, filename, fallbackUrl }) {
  try {
    const file = new File([blob], filename, { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "PLENA SNAP" });
      return;
    }
  } catch (e) {
    if (e.name === "AbortError") return;
  }
  const a = document.createElement("a");
  a.href = fallbackUrl;
  a.rel = "noopener";
  a.click();
}

export function slugify(name) {
  return (name || "plena-snap").replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "") || "plena-snap";
}
