import DefaultTheme from "vitepress/theme";

// Pull in the shared design tokens so blog typography/colors match marketing.
import "@ff/design-system/tokens.css";
import "./custom.css";

export default DefaultTheme;
