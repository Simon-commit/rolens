/** Stylesheets imported as text for Shadow DOM (`import css from './x.css?raw'`). */
declare module '*.css?raw' {
  const css: string;
  export default css;
}
