"""Assemble les lots scrapés (lotN.json) en data.js.

Usage : python build_data.py <dossier_des_lots>
Chaque lot est un tableau d'objets recette produits par le scraping.
"""
import json
import os
import sys
import unicodedata

CADRE = [
    {"jour": "Lun", "cats": ["Volaille"], "maxMin": 35, "note": "Volaille, rapide"},
    {"jour": "Mar", "cats": ["Légumineuses"], "maxMin": None, "note": "Légumineuses / semi-végé"},
    {"jour": "Mer", "cats": ["Porc"], "maxMin": 35, "note": "Porc, rapide"},
    {"jour": "Jeu", "cats": ["Poisson"], "maxMin": None, "note": "Poisson"},
    {"jour": "Ven", "cats": ["Rapide (sport)"], "maxMin": 25, "note": "Express, riche en protéines (retour du sport)"},
    {"jour": "Sam", "cats": ["Mijoté"], "maxMin": None, "note": "Mijoté, on a le temps"},
    {"jour": "Dim", "cats": ["Mijoté", "Rôti"], "maxMin": None, "note": "Mijoté ou rôti du dimanche"},
]

# Préréglages de cadre sélectionnables dans l'app (le 1er = défaut)
CADRE_PRESETS = [
    {
        "id": "equilibre", "nom": "Équilibré (défaut)",
        "desc": "Une catégorie par jour, poisson le jeudi, mijoté le week-end.",
        "cadre": CADRE,
    },
    {
        "id": "rapide", "nom": "Rapide tous les soirs",
        "desc": "Tout ≤ 30 min : semaine chargée, zéro plat long.",
        "cadre": [
            {"jour": "Lun", "cats": ["Volaille"], "maxMin": 30, "note": "Volaille express"},
            {"jour": "Mar", "cats": ["Légumineuses"], "maxMin": 30, "note": "Légumineuses express"},
            {"jour": "Mer", "cats": ["Porc"], "maxMin": 30, "note": "Porc express"},
            {"jour": "Jeu", "cats": ["Poisson"], "maxMin": 30, "note": "Poisson express"},
            {"jour": "Ven", "cats": ["Rapide (sport)"], "maxMin": 25, "note": "Express protéiné"},
            {"jour": "Sam", "cats": ["Rapide (sport)", "Volaille"], "maxMin": 35, "note": "Rapide"},
            {"jour": "Dim", "cats": ["Rôti", "Volaille"], "maxMin": None, "note": "Rôti tranquille"},
        ],
    },
    {
        "id": "vege", "nom": "Plus de végé",
        "desc": "Trois jours légumineuses/végé, moins de viande.",
        "cadre": [
            {"jour": "Lun", "cats": ["Légumineuses"], "maxMin": None, "note": "Légumineuses / végé"},
            {"jour": "Mar", "cats": ["Poisson"], "maxMin": None, "note": "Poisson"},
            {"jour": "Mer", "cats": ["Légumineuses"], "maxMin": None, "note": "Légumineuses / végé"},
            {"jour": "Jeu", "cats": ["Volaille"], "maxMin": 35, "note": "Volaille"},
            {"jour": "Ven", "cats": ["Rapide (sport)"], "maxMin": 25, "note": "Express"},
            {"jour": "Sam", "cats": ["Légumineuses", "Poisson"], "maxMin": None, "note": "Légumineuses ou poisson"},
            {"jour": "Dim", "cats": ["Mijoté", "Rôti"], "maxMin": None, "note": "Mijoté ou rôti"},
        ],
    },
    {
        "id": "sportif", "nom": "Sportif protéiné",
        "desc": "Priorité viande et poisson, riche en protéines.",
        "cadre": [
            {"jour": "Lun", "cats": ["Rapide (sport)"], "maxMin": 25, "note": "Express protéiné"},
            {"jour": "Mar", "cats": ["Volaille"], "maxMin": 35, "note": "Volaille"},
            {"jour": "Mer", "cats": ["Porc"], "maxMin": 35, "note": "Porc"},
            {"jour": "Jeu", "cats": ["Poisson"], "maxMin": None, "note": "Poisson"},
            {"jour": "Ven", "cats": ["Rapide (sport)"], "maxMin": 25, "note": "Express protéiné"},
            {"jour": "Sam", "cats": ["Mijoté", "Rôti"], "maxMin": None, "note": "Viande mijotée / rôtie"},
            {"jour": "Dim", "cats": ["Rôti", "Mijoté"], "maxMin": None, "note": "Rôti du dimanche"},
        ],
    },
]

EXCLUS_DEFAUT = ["abats", "tomate", "champignon", "sucré-salé"]
SAVEURS = ["moutarde", "cidre", "curry", "coco", "vin rouge", "vin blanc", "citron confit", "soja"]
RAYONS = {"Boucherie", "Poissonnerie", "Fruits & légumes", "Crèmerie", "Boulangerie", "Épicerie"}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


import re as _re
# mentions de difficulté / marketing à retirer des titres
_MENTIONS = [
    "la meilleure recette", "recette originale", "tres facile", "rapide et facile",
    "simple et rapide", "succulente et rapide", "tout simple et parfume",
    "tout simple", "pour les nuls", "inratable", "succulente", "express",
    "facile", "parfaite", "parfait", "originale", "simple",
]


def nettoyer_nom(nom):
    """Retire les mentions de difficulté/marketing en fin (ou après virgule) de titre.
    Les mentions ciblées sont ASCII → l'index dans la version dé-accentuée == index dans l'original."""
    if not nom:
        return nom
    s = _re.sub(r"\s+", " ", nom).strip(" ,.-")
    change = True
    while change:
        change = False
        low = norm(s)  # même longueur que s (les suffixes ciblés sont ascii)
        for m in _MENTIONS:
            match = _re.search(r"[\s,]+(et\s+)?" + _re.escape(m) + r"$", low)
            if match:
                s = s[: match.start()].strip(" ,.-")
                change = True
                break
    return s


def charger(dossier):
    recettes, vus = [], set()
    for nom in sorted(os.listdir(dossier)):
        if not (nom.startswith("lot") and nom.endswith(".json")):
            continue
        with open(os.path.join(dossier, nom), encoding="utf-8") as f:
            lot = json.load(f)
        for r in lot:
            r["nom"] = nettoyer_nom(r.get("nom", ""))
            cle = norm(r.get("nom", ""))
            if not cle or cle in vus:
                continue
            vus.add(cle)
            recettes.append(r)
    return recettes


VIANDES = {"bœuf", "boeuf", "veau", "porc", "agneau", "volaille"}
# mots indiquant un plat réconfortant / riche
RICHE = ["crème", "creme", "lardons", "purée", "puree", "gratin", "beurre", "fromage", "chapelure"]


# « Le p'tit plus » : ingrédient bonus concret à rajouter, par protéine puis catégorie.
PLUS_PAR_PROTEINE = {
    "boeuf": ["un beurre maison aux herbes", "quelques oignons frits", "une pointe de poivre concassé"],
    "bœuf": ["un beurre maison aux herbes", "quelques oignons frits", "une pointe de poivre concassé"],
    "veau": ["un trait de crème et de l'estragon", "des câpres poêlées", "un zeste de citron"],
    "porc": ["quelques cornichons", "de la moutarde à l'ancienne", "des oignons caramélisés"],
    "agneau": ["un yaourt à la menthe", "de l'ail confit", "quelques olives"],
    "volaille": ["des amandes effilées grillées", "un trait de crème", "des herbes fraîches"],
    "poisson": ["un filet de citron", "un peu d'aneth frais", "une noisette de beurre citronné"],
    "vege": ["de la feta émiettée", "un œuf poché", "des graines torréfiées"],
    "végé": ["de la feta émiettée", "un œuf poché", "des graines torréfiées"],
}
PLUS_PAR_CAT = {
    "Mijoté": ["des lardons fumés", "une gremolata (persil-ail-citron)"],
    "Rôti": ["un jus déglacé au vin blanc", "de l'ail en chemise"],
    "Légumineuses": ["un filet d'huile d'olive et du cumin", "de la coriandre fraîche"],
}


def petit_plus(r, prot):
    import hashlib
    cle = norm(r.get("nom", ""))
    h = int(hashlib.md5(cle.encode("utf-8")).hexdigest(), 16)
    cat = r.get("cat")
    # override par catégorie (ex: lardons pour un mijoté) seulement si compatible avec la protéine
    cat_ok = cat in PLUS_PAR_CAT and prot in {"boeuf", "bœuf", "veau", "volaille", "porc"} and cat != "Légumineuses"
    if cat_ok and (h % 2 == 0):
        opts = PLUS_PAR_CAT[cat]
    else:
        opts = PLUS_PAR_PROTEINE.get(prot) or PLUS_PAR_PROTEINE.get(norm(prot)) or ["un filet d'huile d'olive et des herbes"]
    return opts[h % len(opts)]


def enrichir(r):
    """Ajoute morceau (angle boucher), bulles nutrition, et flag air fryer."""
    ingr = r["ingredients"]
    prot = norm(r.get("proteine", ""))

    # morceau de viande : ingrédient principal du rayon Boucherie
    morceau = None
    if prot in {norm(v) for v in VIANDES}:
        bouch = [i for i in ingr if i.get("rayon") == "Boucherie"]
        if bouch:
            # le plus « lourd » d'abord (souvent la pièce principale)
            bouch.sort(key=lambda i: -(i.get("qte") or 0))
            morceau = bouch[0]["nom"]
    r["morceau"] = morceau

    # « le p'tit plus » : un ingrédient bonus concret à rajouter, adapté au plat.
    r["bonus"] = petit_plus(r, prot)

    # air fryer : les plats au four sont adaptables air fryer
    cu = [norm(c) for c in r.get("cuissons", [])]
    r["air_fryer"] = ("four" in cu) or ("air fryer" in cu)
    return r


def valider(recettes):
    """Retourne (recettes_valides, problemes)."""
    ok, pbs = [], []
    cats_cadre = {c for cadre in CADRE for c in cadre["cats"]}
    for r in recettes:
        nom = r.get("nom", "?")
        if not r.get("url", "").startswith("http"):
            pbs.append(f"{nom}: URL source manquante")
            continue
        ingr = r.get("ingredients") or []
        if not ingr:
            pbs.append(f"{nom}: aucun ingrédient")
            continue
        if r.get("cat") not in cats_cadre:
            pbs.append(f"{nom}: catégorie '{r.get('cat')}' hors cadre")
            continue
        if not r.get("proteine"):
            pbs.append(f"{nom}: protéine manquante")
            continue
        # une recette contenant un exclu par défaut ne doit pas entrer dans la base
        touche = [i["nom"] for i in ingr
                  if any(ex in norm(i.get("nom", "")) for ex in (norm(e) for e in EXCLUS_DEFAUT))]
        if touche:
            pbs.append(f"{nom}: contient un ingrédient exclu ({', '.join(touche)})")
            continue
        # normalise le rayon
        for i in ingr:
            if i.get("rayon") not in RAYONS:
                i["rayon"] = "Épicerie"
        r.setdefault("tags", [])
        r.setdefault("cuissons", [])
        r.setdefault("parts_origine", 4)
        r.setdefault("saison", "Toute l'année")
        if not r.get("total_min"):
            r["total_min"] = (r.get("prep_min") or 0) + (r.get("cuisson_min") or 0)
        ok.append(enrichir(r))
    return ok, pbs


def charger_accompagnements(dossier):
    """Charge accompagnements.json (facultatif), valide URL + ingrédients."""
    chemin = os.path.join(dossier, "accompagnements.json")
    if not os.path.exists(chemin):
        return []
    with open(chemin, encoding="utf-8") as f:
        lot = json.load(f)
    out = []
    for a in lot:
        a["nom"] = nettoyer_nom(a.get("nom", ""))
        if not a.get("url", "").startswith("http") or not a.get("ingredients"):
            continue
        for i in a["ingredients"]:
            if i.get("rayon") not in RAYONS:
                i["rayon"] = "Épicerie"
        a.setdefault("suits", ["Volaille", "Porc", "Poisson", "Rapide (sport)", "Mijoté", "Rôti"])
        a.setdefault("parts_origine", 4)
        out.append(a)
    return out


def ecrire(recettes, accompagnements, chemin):
    j = lambda o: json.dumps(o, ensure_ascii=False)
    lignes = [
        "/* Base de recettes — SCRAPÉE depuis Marmiton / Saveurs / Journal des Femmes.",
        "   Généré par build_data.py — ne pas éditer à la main. */",
        "window.RECIPES = [",
    ]
    for r in recettes:
        lignes.append("  " + j(r) + ",")
    lignes += [
        "];",
        "",
        "/* Contrainte par jour (cadre par défaut = 1er preset) */",
        "window.CADRE = " + json.dumps(CADRE, ensure_ascii=False, indent=2) + ";",
        "",
        "/* Préréglages de cadre sélectionnables dans Réglages */",
        "window.CADRE_PRESETS = " + json.dumps(CADRE_PRESETS, ensure_ascii=False) + ";",
        "",
        "/* Ingrédients exclus par défaut (l'utilisateur peut en ajouter dans Réglages) */",
        "window.EXCLUS_DEFAUT = " + j(EXCLUS_DEFAUT) + ";",
        "",
        "/* Saveurs dominantes — évite deux plats de même saveur dans la semaine */",
        "window.SAVEURS = " + j(SAVEURS) + ";",
        "",
        "/* Accompagnements scrapés (l'app en pioche un, variable, par plat) */",
        "window.ACCOMPAGNEMENTS = [",
    ] + ["  " + j(a) + "," for a in accompagnements] + [
        "];",
        "",
    ]
    with open(chemin, "w", encoding="utf-8") as f:
        f.write("\n".join(lignes))


def main():
    dossier = sys.argv[1]
    sortie = sys.argv[2] if len(sys.argv) > 2 else "data.js"
    brutes = charger(dossier)
    recettes, pbs = valider(brutes)

    print(f"{len(brutes)} recettes chargées -> {len(recettes)} valides")
    if pbs:
        print("\nRejetées / à corriger :")
        for p in pbs:
            print("  -", p)

    # couverture du cadre : chaque jour doit avoir des candidats
    print("\nCouverture par jour :")
    manques = []
    for c in CADRE:
        n = [r for r in recettes if r["cat"] in c["cats"]
             and (not c["maxMin"] or r["total_min"] <= c["maxMin"])]
        prots = sorted({r["proteine"] for r in n})
        print(f"  {c['jour']:4} {len(n):2} candidats  protéines: {', '.join(prots) or '—'}")
        if len(n) < 2:
            manques.append(c["jour"])
    if manques:
        print(f"\nATTENTION : jours avec moins de 2 candidats : {', '.join(manques)}")

    accs = charger_accompagnements(dossier)
    print(f"\nAccompagnements : {len(accs)}")
    ecrire(recettes, accs, sortie)
    print(f"Écrit : {sortie}")


if __name__ == "__main__":
    main()
