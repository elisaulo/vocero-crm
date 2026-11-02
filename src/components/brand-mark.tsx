import type { Branding } from "@/lib/branding";
import {
  BRAND_CYAN,
  BRAND_CYAN_ON_TILE,
  BRAND_MARK_BODY,
  BRAND_MARK_STROKE,
  BRAND_MARK_TAIL,
  isVoceroName,
  isJombeName,
  JOMBE_PURPLE,
  JOMBE_GREEN,
} from "@/lib/brand";
import { faviconHref, faviconInitial } from "@/lib/favicon";
import { cn } from "@/lib/utils";

/**
 * Lo que la marca necesita para dibujarse: el nombre, el acento y si hay
 * logo subido (el acento entra en la URL versionada del icono generado).
 */
export type BrandingMark = Pick<Branding, "name" | "accent" | "favicon">;

/**
 * El trazo de la marca: la "V" dinámica con onda de voz de Vocero CRM.
 * Brazo izquierdo: color del contexto (hereda acento). Brazo derecho + onda:
 * degradado de azul (#2563EB) a celeste (#38BDF8).
 */
export function BrandMark({
  className,
  cyan = BRAND_CYAN,
}: {
  className?: string;
  cyan?: string;
}) {
  const gradId = "vcr-grad";
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor={cyan} />
        </linearGradient>
      </defs>
      {/* Brazo izquierdo de la V — hereda currentColor (acento del tema) */}
      <path
        d={BRAND_MARK_BODY}
        stroke="currentColor"
        strokeWidth={BRAND_MARK_STROKE}
        strokeLinecap="round"
        fill="none"
      />
      {/* Brazo derecho + onda de voz — degradado azul→celeste */}
      <path
        d={BRAND_MARK_TAIL}
        stroke={`url(#${gradId})`}
        strokeWidth={BRAND_MARK_STROKE}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * El ícono SVG del logo Jombe: la J morada + burbuja de chat verde.
 * Fiel al logo oficial: J superior en morado (#5B5CE2), J inferior
 * (burbuja) en verde (#1DB980), punto verde y fondo transparente.
 */
export function JombeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className={className}
      fill="none"
    >
      {/* J superior — morado */}
      <rect x="20" y="3" width="8" height="18" rx="4" fill={JOMBE_PURPLE} />
      {/* Burbuja de chat inferior — verde */}
      <path
        d="M8 22 C8 16 14 12 22 12 L26 12 C34 12 40 16 40 22 L40 30 C40 36 34 40 26 40 L18 40 L12 46 L12 40 C10 40 8 38 8 36 Z"
        fill={JOMBE_GREEN}
      />
      {/* J interior — blanco sobre verde */}
      <rect x="22" y="18" width="5" height="12" rx="2.5" fill="white" opacity="0.9" />
      <rect x="17" y="27" width="8" height="4" rx="2" fill="white" opacity="0.9" />
      {/* Punto verde */}
      <circle cx="9" cy="42" r="3" fill={JOMBE_GREEN} />
    </svg>
  );
}


/**
 * Mosaico cuadrado con degradado del acento: es el favicon en grande. Con un
 * logo subido lleva el logo (el MISMO archivo y la MISMA URL versionada que
 * la pestaña, así lo que se sube en Ajustes → Marca se ve en los dos sitios);
 * sin él, la "v" de Vocero, el ícono de Jombe, o la inicial del nombre white-label.
 */
export function BrandTile({
  branding,
  className,
}: {
  branding: BrandingMark;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "brand-tile flex shrink-0 items-center justify-center overflow-hidden text-brand-fg",
        className
      )}
      aria-hidden
    >
      {branding.favicon ? (
        // Sin next/image a propósito: es un archivo de una ruta propia, ya
        // pequeño; pasarlo por el optimizador sería trabajo para no ahorrar.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={faviconHref(branding)}
          alt=""
          className="h-full w-full object-contain"
        />
      ) : isJombeName(branding.name) ? (
        <JombeMark className="h-[80%] w-[80%]" />
      ) : isVoceroName(branding.name) ? (
        <BrandMark className="h-[64%] w-[64%]" cyan={BRAND_CYAN_ON_TILE} />
      ) : (
        <span className="font-bold leading-none">{faviconInitial(branding.name)}</span>
      )}
    </span>
  );
}

const WORDMARK_SIZE = {
  md: "text-[21px]",
  lg: "text-[30px]",
} as const;

const MARK_SIZE = {
  md: "h-[24px] w-[24px]",
  lg: "h-[34px] w-[34px]",
} as const;

const TILE_SIZE = {
  md: "h-[30px] w-[30px] rounded-[9px] text-[15px]",
  lg: "h-[44px] w-[44px] rounded-[13px] text-[22px]",
} as const;

/**
 * La marca completa, como en la cabecera de la landing: trazo + wordmark.
 * Jombe: ícono Jombe + "Jombe" en negrita.
 * Vocero: trazo V + "vocero" en minúsculas y bien apretado.
 * White-label: mosaico con la inicial y el nombre propio.
 * Con logo subido gana el logo, se llame como se llame.
 */
export function BrandLogo({
  branding,
  size = "md",
  className,
}: {
  branding: BrandingMark;
  size?: keyof typeof WORDMARK_SIZE;
  className?: string;
}) {
  // Jombe con logo propio: imagen subida por el usuario.
  if (branding.favicon) {
    return (
      <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
        <BrandTile branding={branding} className={TILE_SIZE[size]} />
        <span
          className={cn(
            "truncate font-[750] leading-none tracking-tight",
            size === "lg" ? "text-[26px]" : "text-[17px]"
          )}
        >
          {branding.name}
        </span>
      </span>
    );
  }
  // Jombe sin logo subido: ícono SVG + wordmark "Jombe".
  if (isJombeName(branding.name)) {
    return (
      <span className={cn("flex items-center gap-2 text-foreground", className)}>
        <JombeMark className={cn("shrink-0", MARK_SIZE[size])} />
        <span
          className={cn(
            "font-[800] leading-none tracking-[-0.04em]",
            WORDMARK_SIZE[size]
          )}
        >
          Jombe
        </span>
      </span>
    );
  }
  // Vocero sin logo subido: trazo V + wordmark "vocero".
  if (isVoceroName(branding.name)) {
    return (
      <span className={cn("flex items-center gap-2 text-foreground", className)}>
        <BrandMark className={cn("shrink-0 text-brand", MARK_SIZE[size])} />
        <span
          className={cn(
            "font-[800] leading-none tracking-[-0.045em]",
            WORDMARK_SIZE[size]
          )}
        >
          vocero
        </span>
      </span>
    );
  }
  // White-label: mosaico con inicial + nombre del negocio.
  return (
    <span className={cn("flex min-w-0 items-center gap-2.5", className)}>
      <BrandTile branding={branding} className={TILE_SIZE[size]} />
      <span
        className={cn(
          "truncate font-[750] leading-none tracking-tight",
          size === "lg" ? "text-[26px]" : "text-[17px]"
        )}
      >
        {branding.name}
      </span>
    </span>
  );
}
