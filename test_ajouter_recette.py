"""Test de ajouter_recette.py, sans réseau : une recette telle que Glaneur la rend (« glaneur recettes ») devient une
recette au format des lots, que build_data.py accepte. Usage : python test_ajouter_recette.py"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

import ajouter_recette as A
from build_data import valider

ICI = os.path.dirname(os.path.abspath(__file__))

# Sortie de « glaneur recettes » pour une recette Marmiton (champs et forme réels, 2026-10-03).
GLANEUR = {
    "nom": "Escalopes de poulet à la crème et moutarde : la meilleure recette",
    "source": "Marmiton",
    "url": "https://www.marmiton.org/recettes/recette_test-poulet_1.aspx",
    "prep_min": 10, "cuisson_min": 15, "total_min": 25, "parts_origine": 4,
    "ingredients": [
        {"nom": "escalopes de poulet", "qte": 4, "unite": "", "texte": "4 escalopes de poulet"},
        {"nom": "crème fraîche", "qte": 20, "unite": "cl", "texte": "20 cl de crème fraîche"},
        {"nom": "moutarde", "qte": 2, "unite": "cuillères à soupe", "texte": "2 cuillères à soupe de moutarde"},
        {"nom": "bouillon de volaille", "qte": 1, "unite": "cube", "texte": "1 cube de bouillon de volaille"},
        {"nom": "échalote", "qte": 1, "unite": "", "texte": "1 échalote"},
        {"nom": "sel", "qte": None, "unite": "", "texte": "sel"},
    ],
    "etapes": ["Faire revenir l'échalote dans une poêle.", "Ajouter le poulet, puis la crème et la moutarde."],
    "cout": "Bon marché", "kcal_part": 420,
    "photo": "https://assets.afcdn.com/recipe/1.jpg",
    "remarques": [],
}

echecs = []


def verifie(cond, message):
    if not cond:
        echecs.append(message)


# 1. Complétion : ce qu'aucune page n'écrit est déduit, le reste vient de Glaneur tel quel.
r, deduit, refus = A.completer(dict(GLANEUR), {})
verifie(refus is None, f"1. refus inattendu : {refus}")
verifie(r["nom"] == "Escalopes de poulet à la crème et moutarde", f"1. nom non nettoyé : {r['nom']}")
verifie((r["cat"], r["proteine"], r["saison"]) == ("Volaille", "volaille", "Toute l'année"),
        f"1. déductions : {r['cat']}, {r['proteine']}, {r['saison']}")
verifie(r["cuissons"] == ["poêle"], f"1. cuissons : {r['cuissons']}")
rayons = {i["nom"]: i["rayon"] for i in r["ingredients"]}
verifie(rayons == {"escalopes de poulet": "Boucherie", "crème fraîche": "Crèmerie", "moutarde": "Épicerie",
                   "bouillon de volaille": "Épicerie", "échalote": "Fruits & légumes", "sel": "Épicerie"},
        f"1. rayons : {rayons}")
verifie("kcal_part" not in r, "1. les calories de Glaneur doivent être laissées à prix_kcal.py")
verifie(all("texte" not in i for i in r["ingredients"]) and "remarques" not in r, "1. champs Glaneur en trop")
verifie(r["cout"] == "Bon marché" and r["photo"].endswith("1.jpg") and r["source"] == "Marmiton", "1. prix/photo/source")

# 2. build_data.py accepte la recette complétée.
ok, pbs = valider([json.loads(json.dumps(r))])
verifie(len(ok) == 1 and not pbs, f"2. build_data.py refuse : {pbs}")

# 3. Options : --cat, --proteine, --saison imposent leur valeur.
r3, _, _ = A.completer(dict(GLANEUR), {}, cat="Rapide (sport)", saison="Printemps-été")
verifie((r3["cat"], r3["saison"]) == ("Rapide (sport)", "Printemps-été"), "3. options non appliquées")

# 4. Refus : ingrédient exclu par défaut, site hors des 3 sources (sauf recette demandée).
g4 = dict(GLANEUR, ingredients=GLANEUR["ingredients"] + [{"nom": "champignons de Paris", "qte": 200, "unite": "g", "texte": ""}])
verifie("exclu" in (A.completer(g4, {})[2] or ""), "4. un champignon doit faire refuser la recette")
g4b = dict(GLANEUR, url="https://www.exemple-blog.fr/recette-poulet/")
verifie("hors des 3 sources" in (A.completer(g4b, {})[2] or ""), "4. site hors liste accepté")
r4c, _, refus4c = A.completer(g4b, {}, demande=True)
verifie(refus4c is None and r4c.get("demande") is True, "4. recette demandée refusée")

# 5. Règles : protéine du titre d'abord, plat long en cocotte = Mijoté, rôti au four = Rôti, saison du titre.
verifie(A.proteine_de("Petit salé aux lentilles", []) == "porc", "5. petit salé")
for plat in ("Filets de rougets rôtis au fenouil", "Rougail de morue", "Daube de congre", "Poulpe en daube"):
    verifie(A.proteine_de(plat, []) == "poisson", f"5. « {plat} » doit être du poisson : {A.proteine_de(plat, [])}")
verifie(A.proteine_de("Gratin", [{"nom": "bouillon de volaille", "qte": 1, "unite": ""}]) == "végé", "5. bouillon")
mij = {"nom": "Joues de porc au cidre", "total_min": 150, "cuisson_min": 120, "ingredients": []}
verifie(A.cat_de(mij, "porc", ["cocotte"]) == "Mijoté", "5. mijoté")
roti = {"nom": "Rôti de porc de Dijon", "total_min": 90, "cuisson_min": 75, "ingredients": []}
verifie(A.cat_de(roti, "porc", ["cocotte"]) == "Rôti", "5. rôti")
verifie(A.saison_de("Émincés de dinde aux poireaux") == "Automne-hiver", "5. saison poireau")
verifie(A.saison_de("Côtes de porc au barbecue") == "Été", "5. saison barbecue")
# Vus sur « Escalope de poulet à la cancoillotte » (Marmiton, 2026-10-03) : le produit décide du rayon, et l'aparté
# de l'auteur ne reste pas dans le nom d'achat.
verifie(A.rayon_de({"nom": "cancoillotte à l'ail", "unite": ""}, {}) == "Crèmerie", "5. cancoillotte à l'ail")
verifie(A.rayon_de({"nom": "poulet au citron", "unite": ""}, {}) == "Boucherie", "5. poulet au citron")
g5 = dict(GLANEUR, ingredients=[{"nom": "vin blanc (le Jura c'est meilleur !)", "qte": 4, "unite": "cl", "texte": ""}])
verifie(A.completer(g5, {})[0]["ingredients"][0]["nom"] == "vin blanc", "5. aparté entre parenthèses gardé")

# 5 bis. Sucré-salé (exclu par défaut) : miel et fruits sucrés refusés, caramel et sucre acceptés (choix de
#        l'utilisateur, 2026-10-03 : « caramel c'est ok »). Avant, rien n'était jamais détecté.
def ingr(*noms):
    return [{"nom": n, "qte": 1, "unite": "", "texte": n} for n in noms]


# Ingrédients réels de « Escalopes de dinde au caramel » (Marmiton, recette_escalopes-de-dinde-au-caramel_335958).
CARAMEL = dict(GLANEUR, nom="Escalopes de dinde au caramel", url="https://www.marmiton.org/recettes/recette_escalopes-de-dinde-au-caramel_335958.aspx",
               ingredients=ingr("oignons", "escalopes de dinde", "sucre en poudre", "sauce soja", "sauce nuoc mam", "eau",
                                "maïzena", "beurre demi-sel"))
rc, _, refus_c = A.completer(CARAMEL, {})
verifie(refus_c is None, f"5 bis. le caramel doit être accepté : {refus_c}")
verifie(valider([json.loads(json.dumps(rc))])[0], "5 bis. build_data.py refuse le caramel")
for intrus in ("miel", "2 cuillères de miel liquide", "sirop d'érable", "ananas", "pruneaux", "abricots secs",
               "raisins secs", "jus d'orange", "pommes", "mangue", "confiture d'oignons", "pain d'épices"):
    g = dict(GLANEUR, ingredients=GLANEUR["ingredients"] + ingr(intrus))
    refus_i = A.completer(g, {})[2] or ""
    verifie("sucré-salé" in refus_i, f"5 bis. « {intrus} » non détecté : {refus_i!r}")
    r_i, _, _ = A.completer(g, {}, demande=True)
    ok_i, pbs_i = valider([json.loads(json.dumps(dict(r_i, demande=False)))])
    verifie(not ok_i and any("sucré-salé" in p for p in pbs_i), f"5 bis. build_data.py accepte « {intrus} » : {pbs_i}")
for salé in ("pommes de terre", "cidre bouché brut", "vinaigre de framboise", "zeste d'orange ou de citron", "citron",
             "citron vert", "citrons confits", "lait de coco", "poireaux", "poivron orange", "sucre", "caramel",
             "eau de fleur d'oranger", "huile de pépins de raisin"):
    g = dict(GLANEUR, ingredients=GLANEUR["ingredients"] + ingr(salé))
    verifie(A.completer(g, {})[2] is None, f"5 bis. « {salé} » pris à tort pour du sucré-salé")
from build_data import sucre_sale
verifie(sucre_sale(ingr("tomates cerises", "tomate cerise")) == [], "5 bis. « tomates cerises » pris pour du sucré-salé (cerise)")
verifie(sucre_sale(ingr("cerises")) == ["cerises"], "5 bis. de vraies cerises ne sont plus vues comme sucrées")
verifie(sucre_sale(ingr("sauce aigre-douce", "sauce aigre douce")) == ["sauce aigre-douce", "sauce aigre douce"],
        "5 bis. la sauce aigre-douce n'est pas vue comme sucrée-salée")
verifie(sucre_sale(ingr("vinaigre de vin")) == [], "5 bis. le vinaigre pris pour de l'aigre-doux")
r_dem, _, refus_dem = A.completer(dict(GLANEUR, ingredients=GLANEUR["ingredients"] + ingr("miel")), {}, demande=True)
verifie(refus_dem is None, "5 bis. une recette demandée sucrée-salée doit passer, comme les autres exclusions")

# 5 ter. Tomate : exclue seulement CRUE (choix de l'utilisateur, 2026-10-03 : « sans tomate crue mais sans champi »).
#        Concentré, coulis, sauce, tomates cuites : permis. Champignons : toujours refusés.
from build_data import exclus_par_defaut, tomates_crues


def recette(ingredients, etapes, cuisson=20):
    return dict(GLANEUR, ingredients=ingr(*ingredients), etapes=etapes, cuisson_min=cuisson)


cuites = [
    recette(["concentré de tomates"], ["Ajouter le concentré de tomates et l'eau."]),
    recette(["coulis de tomate"], ["Verser le coulis."]),
    recette(["tomates pelées"], ["Ajouter les tomates pelées."]),
    # Enchiladas (maspatule) : tomates coupées, mises dans la poêle, puis le plat cuit
    recette(["tomates"], ["Coupez en petits morceaux le poulet, 2 tomates, mixez la dernière tomate.",
                          "Ajoutez les épices, puis les tomates et les poivrons.", "Couvrez et laissez cuire 10 minutes.",
                          "Parsemez de tomate mixée et de cheddar.", "Enfournez pour 20 minutes à 180°C."]),
    recette(["4 tomates"], ["Faire revenir les oignons.", "Ajouter les tomates et laisser mijoter 20 minutes."]),
]
for i, r5 in enumerate(cuites):
    verifie(tomates_crues(r5) == [] and A.completer(r5, {})[2] is None, f"5 ter. tomate cuite n°{i + 1} refusée")
crues = [
    recette(["tomates"], ["Couper les tomates en dés.", "Mélanger avec la vinaigrette."], cuisson=0),
    recette(["tomates cerises"], ["Cuire le poulet à la poêle.", "Servir avec les tomates cerises crues."]),
    recette(["tomate"], ["Cuire le poulet 10 minutes.", "Au moment de servir, ajouter la tomate en dés."]),
    recette(["tomates"], ["Cuire le poulet 10 minutes."]),  # tomate jamais citée dans les étapes : comptée crue
]
for i, r5 in enumerate(crues):
    refus5 = A.completer(r5, {})[2] or ""
    verifie(tomates_crues(r5) and "tomate crue" in refus5, f"5 ter. tomate crue n°{i + 1} acceptée : {refus5!r}")
    ok5, pbs5 = valider([json.loads(json.dumps(dict(A.completer(r5, {}, demande=True)[0], demande=False)))])
    verifie(not ok5 and any("tomate crue" in p for p in pbs5), f"5 ter. build_data.py accepte la tomate crue n°{i + 1}")
# une recette demandée garde sa tomate crue, signalée à l'appli par un drapeau
r_dem5 = A.completer(crues[0], {}, demande=True)[0]
ok_dem5, _ = valider([json.loads(json.dumps(r_dem5))])
verifie(ok_dem5 and ok_dem5[0].get("tomate_crue") == ["tomates"], f"5 ter. drapeau tomate_crue absent : {ok_dem5}")
verifie("champignon" in " ".join(exclus_par_defaut(recette(["champignons de Paris"], ["Cuire les champignons."]))),
        "5 ter. les champignons cuits doivent rester exclus")

# 6. De bout en bout, sans réseau : un faux Glaneur (variable GLANEUR) rend la recette ; le lot est écrit dans une
#    copie du dépôt, jamais dans lots/.
copie = tempfile.mkdtemp()
try:
    for f in ("ajouter_recette.py", "build_data.py"):
        shutil.copy(os.path.join(ICI, f), copie)
    shutil.copytree(os.path.join(ICI, "lots"), os.path.join(copie, "lots"))
    faux = os.path.join(copie, "faux_glaneur.py")
    open(faux, "w", encoding="utf-8").write(
        "import json, sys\nsys.stdout.reconfigure(encoding='utf-8')\n"
        f"print(json.dumps([{GLANEUR!r}], ensure_ascii=False))\n")
    lot = os.path.join(copie, "lots", "lot9_test.json")
    env = dict(os.environ, GLANEUR=f'"{sys.executable}" "{faux}"' if " " in sys.executable else f"{sys.executable} {faux}",
               PYTHONIOENCODING="utf-8")
    p = subprocess.run([sys.executable, os.path.join(copie, "ajouter_recette.py"), GLANEUR["url"], "--lot", lot],
                       capture_output=True, encoding="utf-8", env=env, cwd=copie)
    verifie(p.returncode == 0, f"6. code {p.returncode} : {p.stdout[-400:]} {p.stderr[-400:]}")
    ecrit = json.load(open(lot, encoding="utf-8")) if os.path.exists(lot) else []
    verifie(len(ecrit) == 1 and ecrit[0]["cat"] == "Volaille", f"6. lot écrit : {ecrit}")
    # une seconde fois : doublon refusé, lot inchangé
    p2 = subprocess.run([sys.executable, os.path.join(copie, "ajouter_recette.py"), GLANEUR["url"], "--lot", lot],
                        capture_output=True, encoding="utf-8", env=env, cwd=copie)
    verifie("déjà dans les lots" in p2.stdout and len(json.load(open(lot, encoding="utf-8"))) == 1, "6. doublon accepté")
finally:
    shutil.rmtree(copie, ignore_errors=True)

print(json.dumps({"echecs": echecs}, ensure_ascii=False, indent=1) if echecs else "OK : 6 groupes de vérifications")
sys.exit(1 if echecs else 0)
