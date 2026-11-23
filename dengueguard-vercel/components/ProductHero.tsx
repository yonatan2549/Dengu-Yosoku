import type { LucideIcon } from "lucide-react";

export type ProductHeroStat = {
  label: string;
  value: string;
  detail: string;
};

type ProductHeroProps = {
  eyebrow: string;
  title: string;
  description: string;
  status: string;
  statusTone?: "ready" | "warning" | "blocked";
  icon: LucideIcon;
  iconPosition?: "side" | "top";
  stats?: ProductHeroStat[];
};

export function ProductHero({
  eyebrow,
  title,
  description,
  status,
  statusTone = "warning",
  icon: Icon,
  iconPosition = "side",
  stats = [],
}: ProductHeroProps) {
  return (
    <section className={`dy-product-hero dy-product-hero--${statusTone} dy-product-hero--icon-${iconPosition}`} aria-labelledby="dy-product-hero-title">
      <div className="dy-product-hero-top">
        {iconPosition === "top" && (
          <div className="dy-product-hero-brand-top">
            <div className="dy-product-hero-brand-lockup">
              <span className="brand-mark" aria-label="DengueYosoku">DY</span>
              <div>
                <span className="dy-product-eyebrow">{eyebrow}</span>
                <small>INTELLIGENT DENGUE HEALTH PLATFORM</small>
              </div>
            </div>
            <div className="dy-product-hero-top-icon" aria-hidden="true">
              <Icon size={30} strokeWidth={1.7} />
            </div>
          </div>
        )}
        <div className="dy-product-hero-copy">
          {iconPosition === "side" && <span className="dy-product-eyebrow">{eyebrow}</span>}
          <h1 id="dy-product-hero-title">{title}</h1>
          <p>{description}</p>
          <div className={`dy-product-status dy-product-status--${statusTone}`} role="status">
            <span aria-hidden="true" />
            {status}
          </div>
        </div>
        {iconPosition === "side" && (
          <div className="dy-product-hero-mark" aria-hidden="true">
            <Icon size={58} strokeWidth={1.35} />
          </div>
        )}
      </div>
      {stats.length > 0 && (
        <div className="dy-product-hero-stats">
          {stats.map((stat) => (
            <article className="dy-product-hero-stat" key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
              <small>{stat.detail}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
