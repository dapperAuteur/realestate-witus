import type { TemplateDef } from "@/lib/templates";

/** Consistent landmark + heading chrome, styled by the tenant's template. */
export function SectionShell({
  id,
  title,
  tpl,
  children,
}: {
  id: string;
  title: string;
  tpl: TemplateDef;
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section id={id} aria-labelledby={headingId} className={tpl.t.section}>
      {tpl.t.eyebrow ? (
        <span
          aria-hidden="true"
          className={tpl.t.eyebrow}
          style={{ background: "var(--brand-accent)" }}
        />
      ) : null}
      <h2 id={headingId} className={tpl.t.h2}>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
