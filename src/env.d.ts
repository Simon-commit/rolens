/** Stylesheets imported as text for Shadow DOM (`import css from './x.css?raw'`). */
declare module '*.css?raw' {
  const css: string;
  export default css;
}

/** HTML fixtures imported as text in tests (`import page from './x.html?raw'`). */
declare module '*.html?raw' {
  const html: string;
  export default html;
}
