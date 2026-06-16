import { LOGO, BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand"

const SRC = {
  horizontal: LOGO.horizontal,
  stacked:    LOGO.stacked,
  icon:       LOGO.icon,
}

const SRCSET = {
  horizontal: `${LOGO.horizontal400} 400w, ${LOGO.horizontal800} 800w, ${LOGO.horizontal1600} 1600w`,
  stacked:    `${LOGO.stacked192} 192w, ${LOGO.stacked} 386w`,
  icon:       `${LOGO.icon64} 64w, ${LOGO.icon128} 128w, ${LOGO.icon256} 256w`,
}

/**
 * Pelbu logo. Renders the gold logo (transparent background) from the CDN.
 *
 * @param {{ variant?: 'horizontal'|'stacked'|'icon', className?: string,
 *   sizes?: string, alt?: string }} props
 */
export function Logo({ variant = "horizontal", className = "", sizes, alt, ...props }) {
  return (
    <img
      src={SRC[variant]}
      srcSet={SRCSET[variant]}
      sizes={sizes}
      alt={alt ?? `${BRAND_NAME} — ${BRAND_TAGLINE}`}
      className={className}
      {...props}
    />
  )
}
