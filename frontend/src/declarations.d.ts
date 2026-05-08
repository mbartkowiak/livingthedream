// Tell TypeScript that PNG/JPG/SVG imports are valid and resolve to strings (URLs)
declare module '*.png' { const src: string; export default src }
declare module '*.jpg' { const src: string; export default src }
declare module '*.jpeg' { const src: string; export default src }
declare module '*.svg' { const src: string; export default src }
