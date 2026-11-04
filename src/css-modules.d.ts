/** Asset types compiled by the DSH client bundler. */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}
declare module '*.png' {
  const url: string
  export default url
}
