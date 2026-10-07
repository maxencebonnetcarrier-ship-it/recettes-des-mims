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

# « tomate crue » : la tomate n'est exclue que CRUE (choix de l'utilisateur, 2026-10-03 : « sans tomate crue mais sans
# champi »). Avant, l'exclusion « tomate » refusait aussi la sauce tomate et le concentré. Les champignons restent
# exclus cuits ou crus. « tomate crue » et « sucré-salé » ne sont le nom d'aucun ingrédient : ils sont reconnus sur
# la recette entière (tomates_crues, sucre_sale) et l'appli reçoit leurs ingrédients dans r.tomate_crue / r.sucre_sale.
EXCLUS_DEFAUT = ["abats", "tomate crue", "champignon", "sucré-salé"]

# « sucré-salé » n'est le nom d'aucun ingrédient : comparé aux noms comme les autres exclusions, il n'écartait jamais
# rien (constaté le 2026-10-03). Un plat est sucré-salé s'il contient du miel (ou un sucre de même usage : sirop,
# confiture, chutney, pain d'épices, fait au miel) ou un fruit sucré. Le CARAMEL et le sucre seul restent permis
# (choix de l'utilisateur, 2026-10-03 : « caramel c'est ok »). Pas sucrés : citron, coco, cidre, vinaigres et huiles
# de fruit, un zeste (il parfume), la pomme de terre, le poivron orange.
SUCRES = ["miel", "sirop", "confiture", "chutney", "gelée de", "pain d'épices", "aigre douce", "aigre doux"]
FRUITS_SUCRES = ["pomme", "poire", "ananas", "mangue", "abricot", "pruneau", "raisin", "figue", "datte", "pêche",
                 "nectarine", "banane", "cerise", "fraise", "framboise", "myrtille", "mûre", "cassis", "groseille",
                 "canneberge", "cranberry", "cranberries", "airelle", "litchi", "grenade", "coing", "kiwi", "melon",
                 "pastèque", "rhubarbe", "clémentine", "mandarine", "orange", "pamplemousse", "fruit sec", "fruits secs"]
# « tomates cerises » : une tomate, pas une cerise (refus à tort constaté le 07/10) ; la règle tomate crue s'applique
PAS_SUCRES = ["pomme de terre", "vinaigre", "cidre", "zeste", "huile", "fleur d'oranger", "poivron", "tomate"]


def _mots(s):
    """« Abricots secs » → "abricot sec" : sans accents, pluriel simple retiré, un mot par espace."""
    return " ".join(m[:-1] if len(m) > 3 and m[-1] in "sx" else m for m in _re.findall(r"[a-z0-9]+", norm(s)))


def _cite(nom, termes):
    n = f" {_mots(nom)} "
    return any(f" {_mots(t)} " in n for t in termes)


def sucre_sale(ingredients):
    """Les ingrédients qui rendent le plat sucré-salé (liste vide sinon)."""
    return [i["nom"] for i in ingredients or []
            if not _cite(i.get("nom", ""), PAS_SUCRES) and _cite(i.get("nom", ""), SUCRES + FRUITS_SUCRES)]


# Produits de tomate toujours cuits.
TOMATE_CUITE = ["concentré", "coulis", "sauce", "purée", "pulpe", "pelée", "pelées", "concassée", "concassées",
                "passata", "ketchup", "séchée", "séchées", "confite", "confites", "cuisinée", "boîte", "conserve"]
_CUIT = (r"\bcui[rst]|cuisson|mijot|revenir|rissol|fondre|compot|brais|redui|saisi|gril|roti|frire|bouill|poel|"
         r"\bfour\b|enfourn|casserole|cocotte|sauteuse|\bwok\b|\bfeu\b|chauff|dore[rz]?\b|gratin|etuv")
_CRU = r"\bcrue?s?\b|en salade|au moment de servir|decor|\bfraiche?s? en des"


def tomates_crues(r):
    """Les ingrédients tomate qui restent CRUS : tomate fraîche dans un plat sans cuisson, ajoutée après la dernière
    cuisson, ou dite crue. Une tomate jamais citée dans les étapes compte crue : rien ne dit qu'elle cuit."""
    tomates = [i for i in r.get("ingredients") or []
               if _cite(i.get("nom", ""), ["tomate"]) and not _cite(i.get("nom", ""), TOMATE_CUITE)
               and norm(i.get("unite")) not in ("boite", "boites", "conserve")]
    if not tomates:
        return []
    etapes = [norm(e) for e in r.get("etapes") or []]
    citees = [k for k, e in enumerate(etapes) if "tomate" in e]
    cuite = (bool(citees) and (r.get("cuisson_min") or 0) > 0
             and not any(_re.search(_CRU, etapes[k]) for k in citees)
             and any(_re.search(_CUIT, e) for e in etapes[citees[-1]:]))
    return [] if cuite else [i["nom"] for i in tomates]


def exclus_par_defaut(r):
    """Ce qui fait refuser la recette par EXCLUS_DEFAUT : « ingrédient (exclusion) », liste vide sinon."""
    out = []
    for e in EXCLUS_DEFAUT:
        if norm(e) == "tomate crue":
            out += [f"{n} (tomate crue)" for n in tomates_crues(r)]
        elif norm(e) == "sucre-sale":
            out += [f"{n} (sucré-salé)" for n in sucre_sale(r.get("ingredients"))]
        else:
            out += [f"{i['nom']} ({e})" for i in r.get("ingredients") or [] if norm(e) in norm(i.get("nom"))]
    return out
# Niveaux de prix affichés par Marmiton (champ facultatif "cout", relevé sur la page source)
COUTS = ["Très bon marché", "Bon marché", "Moyen", "Assez cher", "Cher"]


def infos_facultatives(r):
    """"cout" et "kcal_part" sont facultatifs (absents quand la source ne les publie pas, ou que
    ses calories sont incohérentes) ; présents, ils doivent être exploitables par l'app."""
    pbs = []
    if "cout" in r and r["cout"] not in COUTS:
        pbs.append(f"niveau de prix inconnu « {r['cout']} »")
    if "kcal_part" in r and not (isinstance(r["kcal_part"], int) and 0 < r["kcal_part"] <= 1500):
        pbs.append(f"calories par part invalides ({r['kcal_part']})")
    return pbs
SAVEURS = ["moutarde", "cidre", "curry", "coco", "vin rouge", "vin blanc", "citron confit", "soja"]
RAYONS = {"Boucherie", "Poissonnerie", "Fruits & légumes", "Crèmerie", "Boulangerie", "Épicerie"}


def norm(s):
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


import re as _re
# mentions de difficulté / marketing à retirer des titres
_MENTIONS = [
    "la meilleure recette", "la recette", "recette originale", "tres facile", "rapide et facile",
    "simple et rapide", "succulente et rapide", "tout simple et parfume",
    "tout simple", "ultra simple", "pour les nuls", "inratable", "succulente", "express",
    "facile", "parfaite", "parfait", "originale", "simple",
    # 07/10 : « Gigot de 7 heures : la recette incontournable », « Chili con carne de Marmiton »
    "incontournable", "de marmiton",
]


def nettoyer_nom(nom):
    """Retire les mentions de difficulté/marketing en fin (ou après virgule ou deux-points) de titre.
    Les mentions ciblées sont ASCII → l'index dans la version dé-accentuée == index dans l'original.
    Deux-points : Marmiton titre ses fiches « Escalopes de poulet : la meilleure recette »."""
    if not nom:
        return nom
    s = _re.sub(r"\s+", " ", nom).strip(" ,.-:")
    change = True
    while change:
        change = False
        low = norm(s)  # même longueur que s (les suffixes ciblés sont ascii)
        for m in _MENTIONS:
            match = _re.search(r"[\s,:]+(et\s+)?" + _re.escape(m) + r"$", low)
            if match:
                s = s[: match.start()].strip(" ,.-:")
                change = True
                break
    # titre écrit en majuscules (« LENTILLES à L'ESPAGNOLE », « BOEUF EN DAUBE », 07/10) : mis en minuscules.
    # Vérifié le 07/10 : aucun nom déjà en base n'a plus de majuscules que de minuscules.
    lettres = [c for c in s if c.isalpha()]
    if lettres and sum(c.isupper() for c in lettres) > len(lettres) / 2:
        s = s.lower()
    # majuscule initiale : certaines fiches Marmiton sont titrées tout en minuscules (« gratin de ravioles »).
    # Vérifié le 05/10 : aucun nom déjà en base ne commençait par une minuscule (notes et favoris intacts).
    return s[:1].upper() + s[1:]


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
        # Une recette DEMANDÉE explicitement par l'utilisateur ("demande": true) entre dans
        # la base même si elle sort du cadre ou contient un ingrédient exclu : c'est un choix
        # assumé, et l'app le signale à l'écran quand elle est imposée sur un jour. Les
        # recettes trouvées automatiquement restent soumises à toutes les règles.
        demandee = bool(r.get("demande"))
        if not (r.get("cat") or "").strip():
            # même demandée, une recette doit porter une catégorie : sinon l'onglet Recettes
            # affiche une rubrique au titre vide.
            pbs.append(f"{nom}: catégorie manquante")
            continue
        if r.get("cat") not in cats_cadre and not demandee:
            pbs.append(f"{nom}: catégorie '{r.get('cat')}' hors cadre")
            continue
        if not r.get("proteine"):
            pbs.append(f"{nom}: protéine manquante")
            continue
        facult = infos_facultatives(r)
        if facult:
            pbs.append(f"{nom}: {', '.join(facult)}")
            continue
        # une recette contenant un exclu par défaut ne doit pas entrer dans la base
        touche = exclus_par_defaut(r)
        if touche and not demandee:
            pbs.append(f"{nom}: contient un ingrédient exclu ({', '.join(touche)})")
            continue
        # recette demandée : elle entre, et l'appli reçoit les ingrédients que ses exclusions ne savent pas lire
        for champ, noms in (("tomate_crue", tomates_crues(r)), ("sucre_sale", sucre_sale(ingr))):
            if noms:
                r[champ] = noms
            else:
                r.pop(champ, None)
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
        if not a.get("url", "").startswith("http") or not a.get("ingredients") or infos_facultatives(a):
            continue
        if sucre_sale(a["ingredients"]):  # un accompagnement sucré-salé ferait du plat entier un sucré-salé
            print(f"  - accompagnement écarté, sucré-salé : {a['nom']} ({', '.join(sucre_sale(a['ingredients']))})")
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
