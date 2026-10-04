"""Ajoute des recettes à un lot : Glaneur lit la page, ce script complète ce qu'aucune page n'écrit.

Usage : python ajouter_recette.py <url> [<url>…] --lot lots/lot5_ajouts.json
          [--cat Volaille] [--proteine volaille] [--saison "Toute l'année"] [--demande] [--essai]
Ensuite : python prix_kcal.py lots --ecrire   puis   python build_data.py lots data.js

1. Glaneur (gratuit, sans IA, https://github.com/maxencebonnetcarrier-ship-it/glaneur) lit la fiche recette
   schema.org de la page : nom, temps, parts, ingrédients chiffrés, étapes, niveau de prix, photo, vidéo.
   Il est cherché dans cet ordre : variable GLANEUR (commande complète), commande « glaneur » installée,
   dossier voisin ../glaneur (node ../glaneur/src/cli.ts).
2. Ce script déduit ce qu'aucune page n'écrit : catégorie du CADRE, protéine, saison, rayon de chaque ingrédient,
   modes de cuisson, étiquettes (poisson gras / maigre, végé). Chaque déduction est AFFICHÉE ; --cat, --proteine
   et --saison l'imposent (valables pour toutes les adresses de la commande).
3. Il refuse ce que build_data.py refuserait (site hors des 3 sources, ingrédient exclu par défaut, catégorie hors
   CADRE) et les doublons. --demande : recette demandée par l'utilisateur (« demande »: true, toute source).
Les calories ne sont PAS reprises de Glaneur : prix_kcal.py les relève et les vérifie (Marmiton seulement).
--essai : montre la recette complétée sans rien écrire.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict

from build_data import CADRE, COUTS, RAYONS, exclus_par_defaut, nettoyer_nom, norm

ICI = os.path.dirname(os.path.abspath(__file__))
SITES = {"www.marmiton.org": "Marmiton", "cuisine.journaldesfemmes.fr": "Journal des Femmes",
         "www.saveurs-magazine.fr": "Saveurs Magazine"}
SAISONS = ["Toute l'année", "Printemps-été", "Automne-hiver", "Été", "Hiver"]
CATS = [c for cadre in CADRE for c in cadre["cats"]]


def mots(s):
    """« Blancs de poulets » → {"blanc", "poulet"} : sans accents ni pluriel simple."""
    return {m[:-1] if len(m) > 3 and m[-1] in "sx" else m for m in re.findall(r"[a-z0-9]+", norm(s))}


def a_un(s, liste):
    """s contient-il un des termes de la liste (un terme de plusieurs mots doit y être en entier) ?"""
    m = mots(s)
    return any(mots(t) <= m for t in liste)


# ---------- protéine ----------
PROTEINES = [  # (valeur des lots, termes) — l'ordre départage un ingrédient qui en cite deux
    ("poisson", ["poisson", "cabillaud", "saumon", "thon", "colin", "merlu", "lieu", "maquereau", "hareng", "sardine",
                 "truite", "dorade", "daurade", "bar", "sole", "crevette", "gambas", "moule", "saint jacques",
                 "calamar", "encornet", "lotte", "eglefin", "haddock", "anchois"]),
    ("volaille", ["poulet", "dinde", "pintade", "canard", "volaille", "caille", "coquelet", "chapon", "coq", "magret"]),
    ("lapin", ["lapin"]),
    ("agneau", ["agneau", "gigot", "mouton"]),
    ("veau", ["veau", "osso bucco"]),
    ("bœuf", ["boeuf", "bavette", "entrecote", "rumsteck", "faux filet", "paleron", "macreuse", "steak hache",
              "bourguignon", "onglet", "hampe"]),
    ("porc", ["porc", "echine", "lardon", "jambon", "saucisse", "chipolata", "chorizo", "filet mignon", "travers",
              "petit sale", "crepinette", "bacon", "poitrine", "rouelle"]),
]
NON_PROTEINE = ["bouillon", "fond", "cube", "graisse", "sauce", "jus"]  # « bouillon de volaille » n'est pas du poulet
LEGUMINEUSES = ["lentille", "pois chiche", "haricot blanc", "haricot rouge", "pois casse", "feve", "flageolet",
                "haricot coco", "dal"]
POISSONS_GRAS = ["saumon", "thon", "maquereau", "hareng", "sardine", "truite", "anchois"]


def proteine_de(nom, ingredients):
    """La protéine citée dans le TITRE d'abord, sinon l'ingrédient carné le plus lourd, sinon « végé »."""
    for valeur, termes in PROTEINES:
        if a_un(nom, termes):
            return valeur
    candidats = []
    for i in ingredients:
        if a_un(i["nom"], NON_PROTEINE):
            continue
        for valeur, termes in PROTEINES:
            if a_un(i["nom"], termes):
                grammes = (i.get("qte") or 0) * {"kg": 1000, "g": 1}.get(norm(i.get("unite")), 0)
                candidats.append((grammes, valeur))
                break
    if candidats:
        return max(candidats, key=lambda c: c[0])[1]
    return "végé"


# ---------- modes de cuisson (lus dans les étapes) ----------
CUISSONS = [("air fryer", r"air ?fryer"), ("wok", r"\bwok"), ("cocotte", r"cocotte|faitout|fait tout|marmite|mijoteuse"),
            ("four", r"\bfour\b|enfourn|prechauff"), ("grill", r"barbecue|plancha|\bgril"), ("poêle", r"\bpoel"),
            ("sauteuse", r"sauteuse"), ("casserole", r"casserole|eau bouillante|faire bouillir"), ("vapeur", r"vapeur")]


def cuissons_de(etapes, cuisson_min):
    texte = norm(" ".join(etapes))
    trouves = sorted((m.start(), nom) for nom, motif in CUISSONS for m in [re.search(motif, texte)] if m)
    out = [nom for _, nom in trouves]
    return out or (["sans cuisson"] if not cuisson_min else [])


# ---------- catégorie du CADRE ----------
MIJOTES = ["mijote", "braise", "blanquette", "bourguignon", "tajine", "colombo", "ragout", "navarin", "daube",
           "pot au feu", "civet", "carbonnade", "confit", "curry", "osso bucco", "joue"]
ROTIS = ["roti", "rotie", "gigot", "au four", "epaule"]


def cat_de(r, proteine, cuissons):
    """Règles fixes, dans cet ordre. Rendre None = à préciser avec --cat."""
    total = r.get("total_min") or 0
    cuisson = r.get("cuisson_min") or 0
    noms = [i["nom"] for i in r["ingredients"]]
    if a_un(r["nom"], LEGUMINEUSES) or (proteine == "végé" and any(a_un(n, LEGUMINEUSES) for n in noms)):
        return "Légumineuses"
    if total >= 45 and a_un(r["nom"], ROTIS) and ("four" in cuissons or "cocotte" in cuissons):
        return "Rôti"
    if cuisson >= 60 and ("cocotte" in cuissons or a_un(r["nom"], MIJOTES)):
        return "Mijoté"
    if proteine == "poisson":
        return "Poisson"
    if proteine == "volaille":
        return "Volaille"
    if proteine == "porc":
        return "Porc"
    if total and total <= 35:
        return "Rapide (sport)"
    if cuisson >= 60:
        return "Mijoté"
    return None


# ---------- saison (légume de saison cité dans le titre) ----------
ETE = ["courgette", "aubergine", "poivron", "haricot vert", "petit pois", "asperge", "concombre", "feve"]
HIVER = ["poireau", "chou", "potiron", "potimarron", "butternut", "courge", "panais", "topinambour", "chataigne",
         "marron", "endive", "celeri", "navet", "rutabaga", "choucroute"]


def saison_de(nom):
    if a_un(nom, ["barbecue", "plancha"]):
        return "Été"
    ete, hiver = a_un(nom, ETE), a_un(nom, HIVER)
    if ete and not hiver:
        return "Printemps-été"
    if hiver and not ete:
        return "Automne-hiver"
    return "Toute l'année"


# ---------- rayon de chaque ingrédient ----------
RAYON_REGLES = [  # l'ordre compte : « lait de coco » est en Épicerie, « lait » en Crèmerie
    ("Épicerie", ["lait de coco", "bouillon", "fond", "sauce", "huile", "vinaigre", "moutarde", "poudre",
                  "moulu", "moulue", "confit", "conserve", "concentre", "pate de", "pesto", "farine", "sucre", "miel", "vin", "biere",
                  "cidre", "epice", "sel", "poivre", "riz", "pate", "semoule", "nouille", "olive"]),
    ("Poissonnerie", [t for t in PROTEINES[0][1] if t not in ("poisson",)]),
    ("Boucherie", [t for v, ts in PROTEINES[1:] for t in ts] + ["escalope", "aiguillette", "steak", "jarret",
                                                                "tendron", "os a moelle", "lard"]),
    ("Crèmerie", ["creme", "lait", "beurre", "fromage", "oeuf", "yaourt", "gruyere", "emmental", "parmesan",
                  "mozzarella", "feta", "comte", "chevre", "mascarpone", "ricotta", "cheddar", "raclette", "reblochon",
                  "gouda", "roquefort", "bleu", "cantal", "margarine", "toastinette", "cancoillotte", "morbier",
                  "maroille", "munster", "camembert", "brie", "tomme", "beaufort", "mimolette", "boursin"]),
    ("Boulangerie", ["pain", "baguette", "brioche", "biscotte"]),
    ("Fruits & légumes", ["oignon", "ail", "echalote", "carotte", "poireau", "courgette", "aubergine", "poivron",
                          "pomme de terre", "patate", "citron", "orange", "pomme", "persil", "coriandre", "basilic",
                          "ciboulette", "menthe", "aneth", "estragon", "thym", "romarin", "laurier", "sauge",
                          "bouquet garni", "gingembre frais", "epinard", "salade", "chou", "celeri", "navet", "radis",
                          "haricot vert", "petit pois", "brocoli", "champignon", "concombre", "avocat", "potiron",
                          "courge", "butternut", "fenouil", "legume", "endive", "panais", "betterave", "mais",
                          "tomate", "germe de soja", "salade", "roquette", "mache"]),
]


def rayons_connus():
    """Rayon le plus fréquent de chaque ingrédient déjà rangé dans les lots : la liste de courses reste cohérente."""
    vus = defaultdict(Counter)
    dossier = os.path.join(ICI, "lots")
    for f in sorted(os.listdir(dossier)):
        if f.endswith(".json"):
            for r in json.load(open(os.path.join(dossier, f), encoding="utf-8")):
                for i in r.get("ingredients") or []:
                    if i.get("rayon") in RAYONS:
                        vus[norm(i["nom"])][i["rayon"]] += 1
    return {k: c.most_common(1)[0][0] for k, c in vus.items()}


def tete(nom):
    """Le produit acheté, sans ses compléments : « cancoillotte à l'ail » → « cancoillotte »."""
    return re.split(r"\s+(?:à|a|au|aux|avec|ou|sans)\s+|\s*[,;]\s*", nom, maxsplit=1)[0]


def rayon_de(ingredient, connus):
    nom = ingredient["nom"]
    if norm(nom) in connus:
        return connus[norm(nom)]
    if norm(ingredient.get("unite")) in ("boite", "boites", "conserve", "bocal"):
        return "Épicerie"
    # le produit d'abord (« cancoillotte à l'ail » est un fromage, pas de l'ail), le nom entier ensuite
    for texte in (tete(nom), nom):
        for rayon, termes in RAYON_REGLES:
            if a_un(texte, termes):
                return rayon
    return "Épicerie"


# ---------- Glaneur ----------
def commande_glaneur():
    if os.environ.get("GLANEUR"):
        return os.environ["GLANEUR"].split()
    installe = shutil.which("glaneur")
    if installe:
        return [installe]
    voisin = os.path.join(ICI, "..", "glaneur", "src", "cli.ts")
    if os.path.exists(voisin):
        return ["node", voisin]
    sys.exit("Glaneur introuvable : installez-le (glaneur.zip, installer.cmd), ou réglez la variable GLANEUR.")


def lire_avec_glaneur(urls):
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write("\n".join(urls) + "\n")
    try:
        p = subprocess.run(commande_glaneur() + ["recettes", f.name, "--delay", "1"], capture_output=True,
                           encoding="utf-8", errors="replace")
    finally:
        os.unlink(f.name)
    sys.stderr.write(p.stderr)
    if p.returncode not in (0, 2) or not p.stdout.strip():
        sys.exit(f"Glaneur a échoué (code {p.returncode}).")
    return json.loads(p.stdout)


# ---------- complétion ----------
def completer(g, connus, cat=None, proteine=None, saison=None, demande=False):
    """Recette Glaneur → recette au format des lots. Rend (recette, déductions affichables, refus ou None)."""
    hote = g["url"].split("/")[2]
    r = {k: g[k] for k in ("nom", "url", "prep_min", "cuisson_min", "total_min", "parts_origine", "etapes")}
    r["nom"] = nettoyer_nom(r["nom"])  # même nettoyage que build_data.py (« : la meilleure recette », « facile »…)
    r["source"] = SITES.get(hote, g.get("source") or hote)
    # Nom d'ACHAT (liste de courses) : sans les apartés entre parenthèses de l'auteur (« vin blanc (le Jura c'est
    # meilleur !) » → « vin blanc »), sinon l'article ne se regroupe pas avec le même achat d'une autre recette.
    r["ingredients"] = [{"nom": re.sub(r"\s*\([^)]*\)", "", i["nom"]).strip() or i["nom"], "qte": i["qte"],
                         "unite": i["unite"]} for i in g["ingredients"]]
    if g.get("cout") in COUTS:
        r["cout"] = g["cout"]
    for k in ("photo", "video"):
        if g.get(k):
            r[k] = g[k]
    deduit = {}
    r["proteine"] = proteine or proteine_de(r["nom"], r["ingredients"])
    deduit["proteine"] = r["proteine"]
    r["cuissons"] = cuissons_de(r["etapes"], r["cuisson_min"])
    r["cat"] = cat or cat_de(r, r["proteine"], r["cuissons"])
    r["saison"] = saison or saison_de(r["nom"])
    tags = []
    if r["proteine"] == "poisson":
        tags.append("poisson gras" if any(a_un(i["nom"], POISSONS_GRAS) for i in r["ingredients"]) else "maigre")
    if r["proteine"] == "végé":
        tags.append("végé")
    r["tags"] = tags
    for i in r["ingredients"]:
        i["rayon"] = rayon_de(i, connus)
    if demande:
        r["demande"] = True
    deduit.update(cat=r["cat"], saison=r["saison"], cuissons=r["cuissons"], tags=tags)

    refus = None
    exclus = exclus_par_defaut(r)  # même règle que build_data.py : abats, tomate crue, champignon, sucré-salé
    if hote not in SITES and not demande:
        refus = f"site {hote} hors des 3 sources de l'appli (--demande si l'utilisateur a fourni le lien)"
    elif not r["ingredients"]:
        refus = "aucun ingrédient lu"
    elif exclus and not demande:
        refus = f"contient un ingrédient exclu par défaut : {', '.join(exclus)}"
    elif not r["cat"]:
        refus = "catégorie non déduite : précisez --cat"
    elif r["cat"] not in CATS and not demande:
        refus = f"catégorie « {r['cat']} » hors CADRE ({', '.join(dict.fromkeys(CATS))})"
    return r, deduit, refus


def deja_dans_les_lots():
    urls, noms = set(), set()
    dossier = os.path.join(ICI, "lots")
    for f in os.listdir(dossier):
        if f.endswith(".json"):
            for r in json.load(open(os.path.join(dossier, f), encoding="utf-8")):
                urls.add(r.get("url", "").rstrip("/"))
                noms.add(norm(nettoyer_nom(r.get("nom", ""))))
    return urls, noms


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("urls", nargs="+")
    ap.add_argument("--lot", required=True, help="lot à compléter (créé s'il n'existe pas), ex. lots/lot5_ajouts.json")
    ap.add_argument("--cat", choices=list(dict.fromkeys(CATS)))
    ap.add_argument("--proteine")
    ap.add_argument("--saison", choices=SAISONS)
    ap.add_argument("--demande", action="store_true", help="recette demandée par l'utilisateur : toute source acceptée")
    ap.add_argument("--essai", action="store_true", help="afficher sans écrire")
    a = ap.parse_args()

    urls_connues, noms_connus = deja_dans_les_lots()
    lot = json.load(open(a.lot, encoding="utf-8")) if os.path.exists(a.lot) else []
    connus = rayons_connus()
    ajouts = 0
    for g in lire_avec_glaneur(a.urls):
        r, deduit, refus = completer(g, connus, a.cat, a.proteine, a.saison, a.demande)
        if not refus and (r["url"].rstrip("/") in urls_connues or norm(r["nom"]) in noms_connus):
            refus = "déjà dans les lots (même adresse ou même nom)"
        print(f"\n{r['nom']} — {r['url']}")
        print(f"  {r['prep_min']} + {r['cuisson_min']} = {r['total_min']} min · {r['parts_origine']} parts · "
              f"{len(r['ingredients'])} ingrédients · {len(r['etapes'])} étapes · prix : {r.get('cout', '—')}")
        print(f"  déduit : catégorie {deduit['cat']} · protéine {deduit['proteine']} · saison {deduit['saison']} · "
              f"cuissons {', '.join(deduit['cuissons']) or '—'} · étiquettes {', '.join(deduit['tags']) or '—'}")
        print("  rayons : " + " ; ".join(f"{i['nom']} → {i['rayon']}" for i in r["ingredients"]))
        for rq in g.get("remarques") or []:
            print(f"  remarque de Glaneur : {rq}")
        if refus:
            print(f"  NON AJOUTÉE : {refus}")
            continue
        lot.append(r)
        urls_connues.add(r["url"].rstrip("/"))
        noms_connus.add(norm(r["nom"]))
        ajouts += 1
    if ajouts and not a.essai:
        texte = json.dumps(lot, ensure_ascii=False, indent=1).replace("\n", "\r\n")
        open(a.lot, "wb").write(texte.encode("utf-8"))
        print(f"\n{ajouts} recette(s) ajoutée(s) à {a.lot}. Ensuite : python prix_kcal.py lots --ecrire "
              f"puis python build_data.py lots data.js")
    elif a.essai:
        print(f"\nEssai : {ajouts} recette(s) acceptable(s), rien d'écrit.")
    return 0 if ajouts else 1


if __name__ == "__main__":
    sys.exit(main())
