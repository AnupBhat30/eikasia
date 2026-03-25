import { ALL_LOOKS } from "@/components/editor/constants";
import type { AcrosChannel } from "@/components/editor/types";

const GRAIN_FILTERS = [
  {
    id: "grain-subtle",
    baseFrequency: "0.75",
    alpha: "0 0.18",
  },
  {
    id: "grain-medium",
    baseFrequency: "0.95",
    alpha: "0 0.26",
  },
  {
    id: "grain-heavy",
    baseFrequency: "1.2",
    alpha: "0 0.38",
  },
] as const;

export function EditorSvgDefs() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute h-0 w-0 overflow-hidden"
    >
      <defs>
        {ALL_LOOKS.flatMap((look) => {
          if (look.acrosChannels) {
            return (Object.entries(look.acrosChannels) as [
              AcrosChannel,
              string,
            ][]).map(([channel, matrix]) => (
              <filter
                id={`look-${look.id}-${channel}`}
                key={`look-${look.id}-${channel}`}
                colorInterpolationFilters="sRGB"
              >
                <feColorMatrix type="matrix" values={matrix} />
              </filter>
            ));
          }

          return (
            <filter
              id={`look-${look.id}`}
              key={`look-${look.id}`}
              colorInterpolationFilters="sRGB"
            >
              <feColorMatrix type="matrix" values={look.matrix} />
            </filter>
          );
        })}

        {GRAIN_FILTERS.map((filter) => (
          <filter
            id={filter.id}
            key={filter.id}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            colorInterpolationFilters="sRGB"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency={filter.baseFrequency}
              numOctaves="3"
              seed="7"
              stitchTiles="stitch"
              result="noise"
            />
            <feColorMatrix in="noise" type="saturate" values="0" result="mono" />
            <feComponentTransfer in="mono">
              <feFuncR type="table" tableValues="0.42 0.58" />
              <feFuncG type="table" tableValues="0.42 0.58" />
              <feFuncB type="table" tableValues="0.42 0.58" />
              <feFuncA type="table" tableValues={filter.alpha} />
            </feComponentTransfer>
          </filter>
        ))}
      </defs>
    </svg>
  );
}
