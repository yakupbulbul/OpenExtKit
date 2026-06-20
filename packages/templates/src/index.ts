export const templateNames = [
  "vanilla",
  "react-popup",
  "focus-blocker",
  "content-script",
  "new-tab"
] as const;

export type TemplateName = (typeof templateNames)[number];
