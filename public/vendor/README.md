# Local motion bundle

`motion.js` contains only the DOM `animate` export from Motion 14.4.0, bundled with esbuild 0.28.2 (IIFE, global `ReestrMotion`, ES2020). It has no runtime CDN dependency.

`../arc-motion.js` adapts UIArc's shared motion presets and accordion behavior to the registry's existing HTML interface:

- Source: https://github.com/kuratlielia/arc-library/blob/main/registry/motion-tokens.ts
- Guide: https://uiarc.dev/guides/react-motion-springs-reduced-motion
- Component behavior: https://uiarc.dev/components/accordion

Third-party notices are in `LICENSES.txt`.

To rebuild, install `motion@14.4.0` and `esbuild@0.28.2` in an isolated working directory, create an entry file containing `export { animate } from 'motion';`, and run:

```
esbuild motion-entry.js --bundle --minify --format=iife --global-name=ReestrMotion --target=es2020 --outfile=motion.js
```

When changing a static asset, refresh its content hash in the script/link URL in `project.html` and `index.html`.
