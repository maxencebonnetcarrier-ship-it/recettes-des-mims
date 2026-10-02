"""Relit chaque page source Marmiton et ajoute aux lots ce que le site publie :
- "cout" : le niveau de prix affiché par Marmiton (« Bon marché », « Coût moyen », « Assez cher »…)
- "kcal_part" : les calories PAR PART du JSON-LD (nutrition.calories, rapportées à servingSize).
Rien n'est estimé : une page sans l'information laisse le champ absent.
Usage : python prix_kcal.py <dossier_lots> [--ecrire]   puis   python build_data.py <dossier_lots> data.js
Sans --ecrire, le script montre seulement ce qu'il relève."""
import hashlib, json, os, re, subprocess, sys, tempfile, time

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/128 Safari/537.36"
# pages lues gardées hors du dépôt (le dossier est public et publié tel quel)
CACHE = os.path.join(tempfile.gettempdir(), "mims_pages_sources")
os.makedirs(CACHE, exist_ok=True)


def get(url):
    f = os.path.join(CACHE, hashlib.md5(url.encode()).hexdigest() + ".html")
    if not os.path.exists(f):
        subprocess.run(["curl", "-sL", "--compressed", "-A", UA, url, "-o", f], check=True)
        time.sleep(1.0)
    return open(f, encoding="utf-8", errors="replace").read()


def ldjson(h):
    for b in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', h, re.S):
        try:
            d = json.loads(b)
        except Exception:
            continue
        for it in (d if isinstance(d, list) else d.get("@graph", [d])):
            if isinstance(it, dict) and "Recipe" in str(it.get("@type")):
                return it
    return {}


def infos(url, parts_app, accompagnement):
    """Calories : Marmiton les donne pour SA part (recipeYield parts). On les ramène aux parts
    de l'app (parts_origine) : kcal du plat entier ÷ parts de l'app. Écartées quand le site
    n'a manifestement pas pesé l'ingrédient principal (part trop légère) ou que le résultat
    est hors de toute assiette réelle."""
    h = get(url)
    out, ecart = {}, None
    textes = [t.strip() for t in re.findall(r'recipe-primary-properties__item--cost[^>]*>([^<]*)<', h) if t.strip()]
    if textes:
        out["cout"] = textes[0]
    ld = ldjson(h)
    nut = ld.get("nutrition") or {}
    k = re.match(r"\s*(\d+(?:[.,]\d+)?)", str(nut.get("calories") or ""))
    g = re.match(r"\s*(\d+(?:[.,]\d+)?)", str(nut.get("servingSize") or ""))
    y = re.search(r"\d+", str(ld.get("recipeYield") or ""))
    if k and g and y:
        facteur = int(y.group()) / (parts_app or 4)
        kcal = float(k.group(1).replace(",", ".")) * facteur
        grammes = float(g.group(1).replace(",", ".")) * facteur
        g_min, g_max = (40, 500) if accompagnement else (150, 1000)
        if grammes < g_min:
            ecart = f"part de {grammes:.0f} g : ingrédient principal non pesé par le site"
        elif grammes > g_max or kcal > 1500:
            ecart = f"{kcal:.0f} kcal pour {grammes:.0f} g par part : incohérent"
        else:
            out["kcal_part"] = int(round(kcal / 10.0) * 10)
    elif k:
        ecart = "calories sans taille de part"
    return out, ecart


dossier = sys.argv[1]
ecrire = "--ecrire" in sys.argv
bilan = {"marmiton": 0, "avec_cout": 0, "avec_kcal": 0, "autres_sources": []}
couts = {}
for nom in sorted(os.listdir(dossier)):
    if not nom.endswith(".json"):
        continue
    chemin = os.path.join(dossier, nom)
    lot = json.load(open(chemin, encoding="utf-8"))
    for r in lot:
        url = r.get("url", "")
        if "marmiton.org" not in url:
            bilan["autres_sources"].append(f'{r["nom"]} ({url.split("/")[2] if "//" in url else url})')
            continue
        bilan["marmiton"] += 1
        i, ecart = infos(url, r.get("parts_origine"), nom == "accompagnements.json")
        for cle in ("cout", "kcal_part"):
            if cle in i:
                r[cle] = i[cle]
            else:
                r.pop(cle, None)
        bilan["avec_cout"] += "cout" in i
        bilan["avec_kcal"] += "kcal_part" in i
        couts[i.get("cout")] = couts.get(i.get("cout"), 0) + 1
        if ecart:
            print("  calories écartées :", r["nom"], "—", ecart)
        elif "kcal_part" not in i:
            print("  pas de calories publiées :", r["nom"])
    if ecrire:
        texte = json.dumps(lot, ensure_ascii=False, indent=1).replace("\n", "\r\n")
        open(chemin, "wb").write(texte.encode("utf-8"))
print(json.dumps(bilan, ensure_ascii=False, indent=1))
print("niveaux de prix rencontrés :", couts)
