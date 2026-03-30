# cbio-oncoprint-mcp

mcp app server for cbioportal oncoprint + study summary visualizations. renders interactive react UIs inside ai chat clients via the mcp apps spec.

## setup

```
npm install
npm run build
npm run start:server
```

server starts at `http://localhost:3001/mcp`. point claude desktop, vscode, or the ext-apps basic-host at it.

## tools

- `show_oncoprint` — gene × sample alteration grid (live data from cbioportal rest api)
- `show_study_summary` — study metadata card with molecular profile coverage
