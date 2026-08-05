/// <reference types="vite/client" />

/**
 * The custom properties React styles are allowed to set, one by one — csstype
 * leaves `--*` unspecified so that each app declares exactly what it uses.
 */
declare module 'csstype' {
  interface Properties {
    /** The mirror's fit scale, countered by the inspect overlay's CSS. */
    '--fit-scale'?: number;
  }
}
