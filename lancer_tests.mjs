// Lance les tests navigateur de l'app (test_*.js) dans Chrome ou Edge sans fenêtre, chacun dans un
// onglet neuf, et rend le code 0 seulement si TOUS passent, sans erreur dans la page.
//   node lancer_tests.mjs                     tous les tests, téléphone en clair
//   node lancer_tests.mjs --sombre            tous les tests, en clair PUIS en sombre
//   node lancer_tests.mjs test_courses.js     un ou plusieurs tests précis
// playwright-core vient de Glaneur : dépôt voisin ../glaneur, Glaneur installé (%LOCALAPPDATA%\Glaneur\app),
// ou dossier donné par la variable GLANEUR_APP. Navigateur : GLANEUR_CHROME_PATH, sinon Chrome ou Edge du PC.
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const ICI = path.dirname(fileURLToPath(import.meta.url));

function playwright() {
  const lieux = [process.env.GLANEUR_APP, path.join(ICI, "..", "glaneur"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Glaneur", "app")].filter(Boolean);
  for (const l of lieux) {
    try { return createRequire(path.join(l, "package.json"))("playwright-core"); } catch (e) { /* lieu suivant */ }
  }
  throw new Error("playwright-core introuvable : installez Glaneur, ou réglez GLANEUR_APP");
}

function navigateur() {
  const pf = process.env.ProgramFiles || "C:/Program Files", pf86 = process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)";
  const lieux = [process.env.GLANEUR_CHROME_PATH,
    path.join(pf, "Google/Chrome/Application/chrome.exe"), path.join(pf86, "Google/Chrome/Application/chrome.exe"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
    path.join(pf86, "Microsoft/Edge/Application/msedge.exe"), path.join(pf, "Microsoft/Edge/Application/msedge.exe")];
  const trouve = lieux.find((l) => l && fs.existsSync(l));
  if (!trouve) throw new Error("ni Chrome ni Edge trouvés : réglez GLANEUR_CHROME_PATH");
  return trouve;
}

const args = process.argv.slice(2);
const themes = args.includes("--sombre") ? ["clair", "sombre"] : ["clair"];
let tests = args.filter((a) => !a.startsWith("--"));
if (!tests.length) tests = fs.readdirSync(ICI).filter((f) => /^test_.*\.js$/.test(f)).sort();

const { chromium } = playwright();
const browser = await chromium.launch({ executablePath: navigateur(), headless: true });
let rouge = 0;
try {
  for (const theme of themes) {
    for (const t of tests) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: theme === "sombre" ? "dark" : "light" });
      const page = await ctx.newPage();
      const erreurs = [];
      page.on("pageerror", (e) => erreurs.push(String(e)));
      let echecs;
      try {
        await page.goto(pathToFileURL(path.join(ICI, "index.html")).href);
        await page.waitForFunction(() => window.__mims && window.RECIPES, null, { timeout: 30000 });
        const res = await page.evaluate((code) => (0, eval)(code), fs.readFileSync(path.join(ICI, t), "utf8"));
        echecs = (res && res.echecs) || [];
      } catch (e) {
        echecs = ["exception : " + String(e).slice(0, 300)];
      }
      const ok = !echecs.length && !erreurs.length;
      if (!ok) rouge = 1;
      console.log(`${ok ? "ok    " : "ÉCHEC "} ${theme.padEnd(6)} ${t}${echecs.length ? " — " + echecs.slice(0, 5).join(" | ") : ""}${erreurs.length ? " — erreur page : " + erreurs[0] : ""}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(rouge ? "Des tests échouent." : `Tous les tests passent (${tests.length} × ${themes.length}).`);
process.exit(rouge);
