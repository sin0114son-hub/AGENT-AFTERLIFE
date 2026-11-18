import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Astryx neutral theme with the Hallmark graphite and amber tokens (see :root in globals.css).
 * Only the colors and font that Astryx components read are overridden. The theme is applied to
 * the Playground mode selector only, so it does not restyle the rest of the app.
 */
export const labTheme = defineTheme({
  name: "afterlife-lab",
  extends: neutralTheme,
  tokens: {
    "--color-background-body": "#101619",
    "--color-background-surface": "#1a2225",
    "--color-background-card": "#1a2225",
    "--color-background-muted": "#242e31",
    "--color-accent": "#eec477",
    "--color-accent-muted": "#3b3524",
    "--color-on-accent": "#101619",
    "--color-text-primary": "#eef2ef",
    "--color-text-secondary": "#b8c6c5",
    "--color-text-accent": "#eec477",
    "--color-icon-accent": "#eec477",
    "--color-border": "#718387",
    "--color-border-emphasized": "#718387",
    "--font-family-body": "system-ui, sans-serif",
  },
});
