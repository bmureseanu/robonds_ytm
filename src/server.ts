import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 7902);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: ${process.env.PORT ?? ""}`);
}

const app = express();
const publicDir = path.join(__dirname, "public");
const viewsDir = path.join(__dirname, "views");
const templateModel = {
  appTitle: "BVB – RON Titluri de stat YTM",
  appShortName: "BVB YTM",
  dataPath: "./data.json",
  iconPath: "icon.svg",
  manifestPath: "manifest.json",
  swPath: "./sw.js",
};

app.disable("x-powered-by");
app.set("view engine", "ejs");
app.set("views", viewsDir);

app.use(
  express.static(publicDir, {
    index: false,
    setHeaders(res, filePath) {
      const fileName = path.basename(filePath);
      if (fileName === "data.json" || fileName === "sw.js") {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        return;
      }
      res.setHeader("Cache-Control", "public, max-age=3600");
    },
  })
);

app.get(["/", "/index.html"], (_req, res) => {
  res.render("index", templateModel);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`bvb-web listening on http://0.0.0.0:${port}`);
});