"""Tests du guetteur des envies (sans réseau) : python -m unittest -q test_guetteur

Couvre : quelles envies chercher, recherche par nom dans les plans de site, choix et refus d'une
recette (mêmes règles que ajouter_recette.py), note des lecteurs, montée de version, lecture du hub
(faux hub local test_hub.py)."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import types
import unittest
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
# journal et plans de site du test dans un dossier jetable : jamais dans le vrai journal du guetteur
os.environ["MIMS_GUETTEUR_DONNEES"] = tempfile.mkdtemp(prefix="mims-guetteur-test-")
import guetteur as G  # noqa: E402
A = G.A  # ajouter_recette, tel que le guetteur l'utilise

M = "https://www.marmiton.org/recettes/recette_"


def octets(chemin):
    with open(chemin, "rb") as f:
        return f.read()


def recette_glaneur(nom, url, ingredients):
    """Recette au format de sortie de « glaneur recettes »."""
    return {"nom": nom, "url": url, "prep_min": 15, "cuisson_min": 40, "total_min": 55, "parts_origine": 4,
            "etapes": ["Faire revenir la viande.", "Ajouter le reste et laisser mijoter 40 minutes."],
            "ingredients": [{"nom": n, "qte": 1, "unite": ""} for n in ingredients], "cout": "Bon marché"}


class Envies(unittest.TestCase):
    BASE = [{"nom": "Tendron de veau printanier"}, {"nom": "Émincés de dinde aux poireaux"},
            {"nom": "Émincés de poulet sauce moutarde"}, {"nom": "Enchiladas au poulet"}]

    def test_trouver_recette_comme_l_app(self):
        # même règle que trouverRecette d'app.js : titre exact, texte inclus, ou tous les mots
        self.assertEqual(G.trouver_recette("Tendron de veau", self.BASE)["nom"], "Tendron de veau printanier")
        self.assertEqual(G.trouver_recette("emincés de", self.BASE)["nom"], "Émincés de dinde aux poireaux")
        self.assertEqual(G.trouver_recette("poulet enchiladas", self.BASE)["nom"], "Enchiladas au poulet")
        self.assertIsNone(G.trouver_recette("porc au caramel", self.BASE))
        self.assertIsNone(G.trouver_recette("ab", self.BASE))

    def test_envies_a_chercher(self):
        envies = ["Enchiladas au poulet",                                   # ancien format, déjà en base
                  {"nom": "poireaux", "type": "ingredient", "jour": "Jeu"},  # ingrédient : la base suffit
                  {"nom": "Tendron de veau", "jour": "Mar"},                # déjà en base (nom partiel)
                  {"nom": "Porc au caramel", "jour": "Mar"},
                  {"nom": "Gratin de ravioles", "url": "https://exemple.fr/ravioles"}]
        todo = G.envies_a_chercher(envies, self.BASE, {}, time.time())
        self.assertEqual([e["nom"] for e in todo], ["Porc au caramel", "Gratin de ravioles"])
        self.assertEqual(todo[1]["url"], "https://exemple.fr/ravioles")

    def test_apercu_des_envies(self):
        maintenant = time.time()
        journal = {G.norm("Gratin de ravioles"): {"dernier": maintenant - 3600, "resultat": "introuvable"}}
        envies = [{"nom": "poireaux", "type": "ingredient", "jour": "Jeu"}, {"nom": "Tendron de veau", "jour": "Mar"},
                  {"nom": "Porc au caramel", "jour": "Mar"}, {"nom": "Gratin de ravioles"},
                  {"nom": "porc au caramel"}]                                   # doublon, autre casse
        lignes = G.etat_envies(envies, self.BASE, journal, maintenant)
        self.assertEqual([l[0] for l in lignes], ["poireaux (pour Jeu)", "Tendron de veau (pour Mar)",
                                                  "Porc au caramel (pour Mar)", "Gratin de ravioles"])
        self.assertEqual([l[2] for l in lignes], [False, False, True, False])
        self.assertIn("Tendron de veau printanier", lignes[1][1])
        self.assertIn("nouvel essai", lignes[3][1])

    def test_pas_de_nouvel_essai_trop_tot(self):
        maintenant = time.time()
        journal = {G.norm("Porc au caramel"): {"dernier": maintenant - 3600, "resultat": "introuvable"}}
        self.assertEqual(G.envies_a_chercher([{"nom": "Porc au caramel"}], self.BASE, journal, maintenant), [])
        journal[G.norm("Porc au caramel")]["dernier"] = maintenant - 25 * 3600
        self.assertEqual(len(G.envies_a_chercher([{"nom": "Porc au caramel"}], self.BASE, journal, maintenant)), 1)


class Recherche(unittest.TestCase):
    def test_mots_de_l_adresse(self):
        self.assertEqual(G.mots_adresse(M + "porc-au-caramel_23456.aspx"), ["porc", "caramel"])
        self.assertEqual(G.mots_adresse("https://cuisine.journaldesfemmes.fr/recette/312345-porc-au-caramel"),
                         ["porc", "caramel"])
        self.assertEqual(G.mots_adresse("https://www.saveurs-magazine.fr/recettes/porcs-aux-caramels/"),
                         ["porc", "caramel"])

    def test_candidats_classes_par_proximite(self):
        plan = [M + "poulet-au-caramel_1.aspx", M + "travers-de-porc-au-caramel_2.aspx",
                M + "porc-au-caramel-facile_3.aspx", M + "porc-caramel-et-ananas_4.aspx",
                M + "porc-au-caramel_5.aspx", M + "caramel-beurre-sale_6.aspx"]
        c = G.candidats("Porc au caramel", {"marmiton": plan})
        urls = [x["url"] for x in c]
        self.assertNotIn(M + "poulet-au-caramel_1.aspx", urls)
        self.assertNotIn(M + "caramel-beurre-sale_6.aspx", urls)
        # « facile » n'est pas un mot du plat : les deux adresses exactes passent devant
        self.assertEqual(set(urls[:2]), {M + "porc-au-caramel_5.aspx", M + "porc-au-caramel-facile_3.aspx"})
        self.assertEqual(c[0]["en_trop"], 0)
        self.assertEqual(c[-1]["en_trop"], 1)

    def test_note_des_lecteurs(self):
        page = ('<script type="application/ld+json">{"@graph":[{"@type":"Recipe","name":"X",'
                '"aggregateRating":{"ratingValue":"4,7","reviewCount":"128"}}]}</script>')
        self.assertEqual(G.note_de_la_page(page), (4.7, 128))
        self.assertEqual(G.note_de_la_page("<html></html>"), (None, 0))
        # beaucoup d'avis à 4,6 passent devant 2 avis à 5
        self.assertGreater(G.score(4.6, 200), G.score(5.0, 2))


class Choix(unittest.TestCase):
    def setUp(self):
        self.connus = {}

    def test_premiere_recette_qui_respecte_les_regles(self):
        lues = [recette_glaneur("Porc au caramel et au miel", M + "porc-au-caramel-et-miel_1.aspx",
                                ["échine de porc", "miel", "sauce soja"]),
                recette_glaneur("Porc au caramel : la meilleure recette", M + "porc-au-caramel_2.aspx",
                                ["échine de porc", "sucre", "sauce soja", "oignon"])]
        r, refus = G.choisir_parmi("Porc au caramel", lues, self.connus, set(), set())
        self.assertIsNotNone(r)
        self.assertEqual(r["nom"], "Porc au caramel")          # titre nettoyé
        self.assertEqual(r["url"], M + "porc-au-caramel_2.aspx")
        self.assertTrue(any("sucré-salé" in x or "miel" in x for x in refus))

    def test_titre_qui_ne_retrouve_pas_l_envie(self):
        lues = [recette_glaneur("Travers laqués", M + "porc-au-caramel_9.aspx", ["travers de porc", "sucre"])]
        r, refus = G.choisir_parmi("Porc au caramel", lues, self.connus, set(), set())
        self.assertIsNone(r)
        self.assertTrue(any("titre" in x for x in refus))

    def test_titres_nettoyes(self):
        # cas réels du 05/10 : « Ramen : la recette » (Journal des Femmes), titre Marmiton en minuscules
        self.assertEqual(G.A.nettoyer_nom("Ramen : la recette"), "Ramen")
        self.assertEqual(G.A.nettoyer_nom("gratin de ravioles et courgettes"), "Gratin de ravioles et courgettes")
        self.assertEqual(G.A.nettoyer_nom("Porc au caramel : la meilleure recette"), "Porc au caramel")
        self.assertEqual(G.A.nettoyer_nom("Émincés de poulet sauce moutarde"), "Émincés de poulet sauce moutarde")
        # cas réels du 07/10 (enrichissement de la base)
        self.assertEqual(G.A.nettoyer_nom("Gigot de 7 heures : la recette incontournable"), "Gigot de 7 heures")
        self.assertEqual(G.A.nettoyer_nom("Chili con carne de Marmiton"), "Chili con carne")
        # le nom nettoyé est toujours retrouvé par l'envie écrite sur le téléphone
        self.assertIsNotNone(G.trouver_recette("Gratin ravioles", [{"nom": "Gratin de ravioles et courgettes"}]))

    def test_lien_fourni_prend_le_nom_de_l_envie(self):
        # lien donné par l'utilisateur avec SON nom : l'épingle du jour doit retrouver la recette
        lue = recette_glaneur("Porc au caramel", M + "porc-au-caramel_2.aspx", ["échine de porc", "sucre"])
        ancien = G.lire_pages
        G.lire_pages = lambda urls: [lue]
        try:
            r, resultat, _ = G.chercher({"nom": "Porc au caramel de mamie", "url": M + "porc-au-caramel_2.aspx"},
                                        self.connus, set(), set(), {})
        finally:
            G.lire_pages = ancien
        self.assertEqual(resultat, "ajoutee")
        self.assertEqual(r["nom"], "Porc au caramel de mamie")
        self.assertTrue(r.get("demande"))
        self.assertEqual(r["url"], M + "porc-au-caramel_2.aspx")

    def test_deja_dans_les_lots(self):
        lues = [recette_glaneur("Porc au caramel", M + "porc-au-caramel_2.aspx", ["échine de porc", "sucre"])]
        r, refus = G.choisir_parmi("Porc au caramel", lues, self.connus, {M + "porc-au-caramel_2.aspx"}, set())
        self.assertIsNone(r)


def page_html(url, ingredients, note=4.5, avis=40):
    """Page de recette minimale (JSON-LD) pour les lectures de pages remplacées dans les tests."""
    fiche = {"@type": "Recipe", "name": url, "recipeIngredient": ingredients,
             "aggregateRating": {"ratingValue": note, "reviewCount": avis}}
    return '<script type="application/ld+json">' + json.dumps(fiche) + "</script>"


class Elargir(unittest.TestCase):
    """Cas réel du 05/10 : « Riz poivrons chorizos » n'avait qu'UNE adresse avec les 3 mots (riz au chorizo,
    poivrons et ANANAS), refusée, et le guetteur s'arrêtait là."""
    R = M + "riz-au-chorizo-poivrons-et-ananas_1.aspx"
    MEX = M + "riz-a-la-mexicaine-au-chorizo_2.aspx"
    HAR = M + "riz-au-chorizo-et-haricots-rouges_3.aspx"
    PATES = M + "pates-au-poivron-et-chorizo_4.aspx"
    PLAN = {"marmiton": [R, MEX, HAR, PATES, M + "chips-de-chorizo_5.aspx", M + "salade-de-riz-et-poivrons_6.aspx"]}

    def setUp(self):
        self.anciens = (G.telecharger, G.lire_pages, G.PAUSE)
        G.PAUSE = 0

    def tearDown(self):
        G.telecharger, G.lire_pages, G.PAUSE = self.anciens

    def test_pluriels_comme_l_app(self):
        base = [{"nom": "Riz au chorizo, poivrons et ananas"}, {"nom": "Escalopes de poulet panées"}]
        self.assertEqual(G.trouver_recette("Riz poivrons chorizos", base)["nom"], "Riz au chorizo, poivrons et ananas")
        self.assertEqual(G.trouver_recette("Escalopes poulets panées", base)["nom"], "Escalopes de poulet panées")

    def test_mots_dans_le_desordre_un_dans_les_ingredients(self):
        # v43, cas du 07/10 : « Riz chorizo poivrons » imposé jeudi, « Riz au chorizo » (poivrons) dans la base
        base = [{"nom": "Riz au chorizo", "ingredients": [{"nom": "chorizo"}, {"nom": "poivron rouge"}, {"nom": "riz"}]},
                {"nom": "Paella", "ingredients": [{"nom": "riz"}, {"nom": "chorizo"}, {"nom": "poivron"}]}]
        self.assertEqual(G.trouver_recette("Riz chorizo poivrons", base)["nom"], "Riz au chorizo")
        self.assertEqual(G.recette_liee("Riz chorizo poivrons", base)["nom"], "Riz au chorizo")
        self.assertIsNone(G.trouver_recette("Riz poivrons", base))            # 2 mots : pas d'élargissement
        self.assertIsNone(G.trouver_recette("Riz chorizo courgettes", base))  # mot manquant absent des ingrédients
        self.assertIsNone(G.trouver_recette("Riz courgettes aubergines", base))  # deux mots manquants

    def test_adresses_a_un_mot_pres(self):
        c = G.candidats_larges("Riz poivrons chorizos", self.PLAN)
        urls = [x["url"] for x in c]
        self.assertNotIn(self.R, urls)                          # les 3 mots : déjà dans la 1re recherche
        self.assertNotIn(M + "chips-de-chorizo_5.aspx", urls)   # 1 mot sur 3
        self.assertEqual(set(urls), {self.MEX, self.HAR, self.PATES, M + "salade-de-riz-et-poivrons_6.aspx"})
        self.assertTrue(urls[0] in (self.MEX, self.HAR))        # le plat de base (« riz ») d'abord
        self.assertEqual(G.candidats_larges("Gratin ravioles", self.PLAN), [])   # 2 mots : pas d'élargissement

    def test_correspond_par_le_titre_ou_les_ingredients(self):
        r = {"nom": "Riz à la mexicaine au chorizo", "ingredients": [{"nom": "riz long"}, {"nom": "poivrons verts"}]}
        self.assertTrue(G.correspond("Riz poivrons chorizos", r))
        r["ingredients"] = [{"nom": "riz"}, {"nom": "haricots rouges"}]
        self.assertFalse(G.correspond("Riz poivrons chorizos", r))

    def test_ingredients_de_la_page(self):
        self.assertEqual(G.ingredients_de_la_page(page_html("x", ["200 g de riz", "1 poivron rouge"])),
                         ["200 g de riz", "1 poivron rouge"])
        self.assertEqual(G.ingredients_de_la_page("<html></html>"), [])

    def lectures(self, glaneur):
        """Pages : riz/chorizo/poivron selon l'adresse ; Glaneur : les recettes données."""
        ingr = {self.R: ["riz", "chorizo", "poivron", "ananas en cube"], self.MEX: ["riz long", "chorizo", "poivron vert"],
                self.HAR: ["riz", "chorizo", "haricots rouges"], self.PATES: ["pâtes", "chorizo", "poivron"]}
        G.telecharger = lambda url: page_html(url, ingr.get(url, []))
        G.lire_pages = lambda urls: [glaneur[u] for u in urls if u in glaneur]

    def test_essaie_d_autres_recettes(self):
        self.lectures({self.R: recette_glaneur("Riz au chorizo, poivrons et ananas", self.R, ["riz", "chorizo", "poivron", "ananas en cube"]),
                       self.MEX: recette_glaneur("Riz à la mexicaine au chorizo", self.MEX, ["riz long", "chorizo", "poivron vert"]),
                       self.HAR: recette_glaneur("Riz au chorizo et haricots rouges", self.HAR, ["riz", "chorizo", "haricots rouges"])})
        r, resultat, detail = G.chercher({"nom": "Riz poivrons chorizos"}, {}, set(), set(), self.PLAN)
        self.assertEqual(resultat, "ajoutee")
        self.assertEqual(r["url"], self.MEX)                    # contient bien des poivrons ; pas les haricots rouges
        self.assertFalse(r.get("demande"))

    def test_sinon_propose_la_recette_malgre_les_exclusions(self):
        self.lectures({self.R: recette_glaneur("Riz au chorizo, poivrons et ananas", self.R, ["riz", "chorizo", "poivron", "ananas en cube"]),
                       self.HAR: recette_glaneur("Riz au chorizo et haricots rouges", self.HAR, ["riz", "chorizo", "haricots rouges"])})
        G.telecharger = lambda url: page_html(url, ["riz", "chorizo", "poivron", "ananas en cube"] if url == self.R else ["riz", "chorizo"])
        r, resultat, detail = G.chercher({"nom": "Riz poivrons chorizos"}, {}, set(), set(), self.PLAN)
        self.assertEqual((resultat, r["url"]), ("ajoutee", self.R))
        self.assertTrue(r.get("demande"))                       # acceptée par build_data, signalée par l'app
        self.assertIn("ananas", detail)

    def test_rien_de_proche_reste_refusee(self):
        self.lectures({self.R: recette_glaneur("Travers", self.R, ["travers de porc"])})
        G.telecharger = lambda url: page_html(url, [])
        r, resultat, _ = G.chercher({"nom": "Riz poivrons chorizos"}, {}, set(), set(), {"marmiton": [self.R]})
        self.assertIsNone(r)
        self.assertEqual(resultat, "refusee")


class SansConsole(unittest.TestCase):
    """pythonw (tâche planifiée) : sys.stdout et sys.stderr valent None. Avant la v43, la lecture Glaneur
    écrivait dans sys.stderr et la passe plantait (« 'NoneType' object has no attribute 'write' »)."""

    def setUp(self):
        self.flux = (sys.stdout, sys.stderr)
        self.run, self.cmd = A.subprocess.run, A.commande_glaneur

    def tearDown(self):
        sys.stdout, sys.stderr = self.flux
        A.subprocess.run, A.commande_glaneur = self.run, self.cmd

    def test_lecture_glaneur_sans_console(self):
        vus = {}

        def faux_run(cmd, **kw):
            vus.update(kw)
            return types.SimpleNamespace(returncode=0, stdout='[{"nom": "x"}]', stderr="[1/1] 200 1 ingrédient\n")
        A.subprocess.run = faux_run
        A.commande_glaneur = lambda: ["glaneur"]
        sys.stdout, sys.stderr = None, None
        G.sans_console()
        self.assertEqual(A.lire_avec_glaneur(["https://www.marmiton.org/x.aspx"]), [{"nom": "x"}])
        if os.name == "nt":
            self.assertEqual(vus.get("creationflags"), 0x08000000)  # node sans fenêtre


class Suivi(unittest.TestCase):
    """Résultat de chaque envie écrit sur le hub (champ « guetteur »), lu par l'app (Mes envies)."""
    BASE = [{"nom": "Tendron de veau printanier"}, {"nom": "Porc caramel"}]

    def test_nettoyage_garde_les_envies_de_plats_encore_notees(self):
        ancien = {G.norm("Porc au caramel"): {"nom": "Porc au caramel", "etat": "en_cours"},
                  G.norm("Gratin"): {"nom": "Gratin", "etat": "introuvable"},     # envie retirée du téléphone
                  G.norm("poireaux"): {"nom": "poireaux", "etat": "introuvable"}}  # ingrédient : pas suivi
        envies = [{"nom": "porc au caramel", "jour": "Mar"}, {"nom": "poireaux", "type": "ingredient"}]
        self.assertEqual(set(G.statuts_nettoyes(ancien, envies)), {G.norm("Porc au caramel")})

    def test_envie_retrouvee_dans_la_base_devient_ajoutee(self):
        # recette trouvée à une passe, envoyée seulement à la suivante (envoi en attente rattrapé)
        statuts = {G.norm("porc caramel"): {"nom": "porc caramel", "etat": "attente", "t": 1}}
        G.statuts_retrouves(statuts, [{"nom": "porc caramel"}], self.BASE, 2000.0)
        s = statuts[G.norm("porc caramel")]
        self.assertEqual((s["etat"], s["recette"]), ("ajoutee", "Porc caramel"))
        self.assertEqual(s["t"], 2000000)

    def test_statut_et_prochain_essai(self):
        s = G.statut("Gratin", "introuvable", maintenant=1000.0)
        self.assertEqual(s["prochain"], (1000 + 24 * 3600) * 1000)
        self.assertNotIn("prochain", G.statut("Porc", "ajoutee", recette="Porc caramel", maintenant=1000.0))

    def test_raison_de_refus_lisible(self):
        detail = ("Porc au miel (https://x) : contient un ingrédient exclu par défaut : sucré-salé (miel); "
                  "Porc laqué (https://y) : contient un ingrédient exclu par défaut : sucré-salé (miel); "
                  "Porc (https://z) : titre « Porc » : l'envie « Porc au caramel » ne le retrouverait pas")
        r = G.raison_courte(detail)
        self.assertIn("sucré-salé (miel)", r)
        self.assertEqual(r.count("sucré-salé"), 1)
        self.assertLessEqual(len(r), 160)

    def test_adresse_du_site_depuis_le_depot(self):
        self.assertEqual(G.site_en_ligne("git@github-maxence:maxencebonnetcarrier-ship-it/recettes-des-mims.git"),
                         "https://maxencebonnetcarrier-ship-it.github.io/recettes-des-mims/")
        self.assertEqual(G.site_en_ligne("https://github.com/moi/app"), "https://moi.github.io/app/")
        self.assertIsNone(G.site_en_ligne("C:/temp/remote.git"))

    def test_ecrit_les_statuts_sur_le_faux_hub_sans_toucher_aux_envies(self):
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        hub = subprocess.Popen([sys.executable, os.path.join(ICI, "test_hub.py"), str(port)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            url = f"http://127.0.0.1:{port}/"
            envies = {"envies": {"v": [{"nom": "Porc au caramel", "jour": "Mar"}], "t": 5}}
            for _ in range(50):
                try:
                    corps = json.dumps({"token": "test-token", "patch": envies}).encode()
                    urllib.request.urlopen(urllib.request.Request(url, data=corps, method="POST"), timeout=2).read()
                    break
                except OSError:
                    time.sleep(0.1)
            statuts = {G.norm("Porc au caramel"): G.statut("Porc au caramel", "en_cours", maintenant=1000.0)}
            G.ecrire_statuts(url, "test-token", statuts)
            etat = G.lire_hub(url, "test-token")
            self.assertEqual(G.statuts_du_hub(etat), statuts)
            self.assertGreater(etat["guetteur"]["v"]["passe"], 0)
            self.assertEqual(G.envies_du_hub(etat), [{"nom": "Porc au caramel", "jour": "Mar"}])
            with self.assertRaises(Exception):
                G.ecrire_statuts(url, "mauvais", statuts)
        finally:
            hub.terminate()
            hub.wait()


class Version(unittest.TestCase):
    def test_monte_les_trois_fichiers_sans_toucher_aux_fins_de_ligne(self):
        d = tempfile.mkdtemp()
        try:
            fichiers = {"app.js": b'(function () {\r\n  const VERSION_APP = 37;\r\n})();\r\n',
                        "index.html": b'<link href="style.css?v=37" />\r\n<script src="app.js?v=37"></script>\r\n',
                        "sw.js": b'const CACHE = "mims-v37";\r\n'}
            for n, b in fichiers.items():
                with open(os.path.join(d, n), "wb") as f:
                    f.write(b)
            self.assertEqual(G.monter_version(d), 38)
            app = octets(os.path.join(d, "app.js"))
            self.assertIn(b"VERSION_APP = 38;\r\n", app)
            self.assertEqual(octets(os.path.join(d, "index.html")).count(b"?v=38"), 2)
            self.assertIn(b'"mims-v38"', octets(os.path.join(d, "sw.js")))
            for n in fichiers:
                b = octets(os.path.join(d, n))
                self.assertEqual(b.count(b"\r\n"), b.count(b"\n"), n)
        finally:
            shutil.rmtree(d)


class Hub(unittest.TestCase):
    def test_lit_les_envies_du_faux_hub(self):
        s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
        hub = subprocess.Popen([sys.executable, os.path.join(ICI, "test_hub.py"), str(port)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            url = f"http://127.0.0.1:{port}/"
            corps = json.dumps({"token": "test-token", "patch": {"envies": {"v": [{"nom": "Porc au caramel", "jour": "Mar"}],
                                                                             "t": 1}}}).encode()
            for _ in range(50):
                try:
                    urllib.request.urlopen(urllib.request.Request(url, data=corps, method="POST"), timeout=2).read()
                    break
                except OSError:
                    time.sleep(0.1)
            envies = G.envies_du_hub(G.lire_hub(url, "test-token"))
            self.assertEqual(envies, [{"nom": "Porc au caramel", "jour": "Mar"}])
            with self.assertRaises(Exception):
                G.lire_hub(url, "mauvais-mot-de-passe")
        finally:
            hub.terminate()
            hub.wait()


if __name__ == "__main__":
    unittest.main()
