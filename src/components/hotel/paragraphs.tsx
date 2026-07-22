/**
 * Owner-written body text (site_sections.body). Blank-line splits become
 * paragraphs; a real markdown renderer arrives with the CMS workstream.
 */
export function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="mt-3 leading-relaxed text-slate-600 first:mt-0 dark:text-slate-400">
            {p}
          </p>
        ))}
    </>
  );
}
