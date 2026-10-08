"""Guetteur des envies de Recettes des Mim's.

Une passe : lit les envies de PLATS notées sur les téléphones (hub de partage), cherche chaque plat encore
absent de la base dans les plans de site de Marmiton, Saveurs et du Journal des Femmes, ajoute la recette
la mieux notée qui respecte les règles de l'app (mêmes contrôles que ajouter_recette.py), reconstruit
data.js, monte la version, rejoue TOUS les tests, puis met l'app en ligne (git push). Si un test échoue,
rien n'est publié et les fichiers sont remis dans leur état d'avant.

Usage :
  python guetteur.py                               une passe (tâche planifiée, toutes les 30 min)
  python guetteur.py --essai                       cherche et affiche, sans rien écrire ni publier
  python guetteur.py --plat "porc au caramel" --essai   un plat précis, sans lire le hub

Réglages de CE PC (variables d'environnement de l'utilisateur, jamais dans le dépôt, qui est public) :
  MIMS_HUB_URL    adresse du hub (…/exec), la même que dans l'app, Réglages › Partage à deux
  MIMS_HUB_TOKEN  mot de passe partagé du hub
  MIMS_GUETTEUR_DONNEES (facultatif) dossier du journal et des plans de site
                  (défaut : %LOCALAPPDATA%\\mims-guetteur : journal.json, guetteur.log, plans\\)

Usage permis : une recette à la fois, celle qu'un utilisateur a demandée. Les pages de recherche des trois
sites sont interdites aux robots (robots.txt) ; leurs plans de site sont publiés pour être lus.
Les envies d'INGRÉDIENT (« poireaux ») sont ignorées : l'app les sert avec la base existante.
"""
import argparse
import gzip
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.parse
import urllib.request
from datetime import datetime

ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ICI)
import ajouter_recette as A  # noqa: E402  lecture Glaneur, complétion, règles de l'app

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
LOT = os.path.join("lots", "lot6_envies.json")      # recettes ajoutées par le guetteur
FICHIERS_PUBLIES = [LOT, "data.js", "app.js", "index.html", "sw.js"]
PAS_DE_FENETRE = 0x08000000 if os.name == "nt" else 0  # CREATE_NO_WINDOW : lancé par pythonw, sans console
PLANS_VALIDITE = 7 * 86400
RELANCE = {"introuvable": 24 * 3600, "refusee": 24 * 3600, "erreur": 2 * 3600}
MAX_PAR_PASSE = 3
MAX_PAGES_LUES = 6
MAX_PAGES_LARGES = 12   # recherche élargie : pages lues pour vérifier leurs ingrédients
PAUSE = 1.0             # entre deux pages d'un même site (0 dans les tests)
# Partage (hub Google Apps Script) : Google renvoie parfois une page d'erreur HTML (404) au lieu de la réponse du
# script. Mesuré le 08/10 : 1 lecture sur 10, la suivante passe. Avant, la passe entière était perdue.
ESSAIS_HUB = 3
PAUSES_HUB = (5, 15)    # secondes avant le 2e, puis le 3e essai (0 dans les tests)
SITES = [  # ordre = préférence à égalité ; plans de site déclarés par les sites eux-mêmes
    {"id": "marmiton", "index": "https://www.marmiton.org/wsitemap_recipes_index.xml",
     "fichier": r"wsitemap_recipes_\d+", "recette": r"/recettes/recette_[^/]+\.aspx$"},
    {"id": "jdf", "index": "https://cuisine.journaldesfemmes.fr/sitemap/",
     "fichier": r"code=cuisine_jdf_recipe&page=", "recette": r"/recette/\d+-[^/]+$"},
    {"id": "saveurs", "index": "https://www.saveurs-magazine.fr/sitemap.xml",
     "fichier": r"-recipe\.xml", "recette": r"/recettes/[^/]+/?$"},
]
# mots d'une adresse qui ne disent rien du plat
VIDES = {"de", "du", "des", "la", "le", "les", "au", "aux", "a", "et", "en", "l", "d", "un", "une", "sa", "son",
         "ses", "sur", "avec", "pour", "facon", "recette", "recettes", "maison", "facile", "rapide", "simple",
         "express", "meilleure", "inratable", "originale", "parfait", "parfaite", "succulente", "tout", "tres",
         "ma", "mon", "minute", "classique", "traditionnelle", "traditionnel"}


def donnees():
    d = os.environ.get("MIMS_GUETTEUR_DONNEES") or os.path.join(
        os.environ.get("LOCALAPPDATA") or tempfile.gettempdir(), "mims-guetteur")
    os.makedirs(os.path.join(d, "plans"), exist_ok=True)
    return d


def log(msg):
    ligne = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
    try:
        print(ligne)
    except (OSError, ValueError):
        pass  # pythonw : pas de console
    chemin = os.path.join(donnees(), "guetteur.log")
    if os.path.exists(chemin) and os.path.getsize(chemin) > 1_000_000:
        garde = open(chemin, "rb").read()[-500_000:]
        open(chemin, "wb").write(garde)
    with open(chemin, "a", encoding="utf-8") as f:
        f.write(ligne + "\n")


# ---------- comparaison des noms : MÊME règle que l'app (app.js, norm et trouverRecette) ----------
def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn").strip()


def trouver_recette(nom, recettes):
    """Port de trouverRecette() d'app.js : sans ça, le guetteur pourrait ajouter une recette que l'épingle
    du téléphone ne retrouverait pas (le jour resterait « en attente » pour toujours)."""
    if not nom:
        return None
    for r in recettes:
        if r.get("nom") == nom:
            return r
    d = norm(nom)
    if len(d) < 3:
        return None
    cand = [r for r in recettes if d in norm(r.get("nom"))]
    # chaque mot au singulier (v41) : « Riz poivrons chorizos » retrouve « Riz au chorizo, poivrons… »
    mots = [singulier(m) for m in re.split(r"\s+", d) if len(m) > 2]
    if not cand:
        if not mots:
            return None
        cand = [r for r in recettes if all(m in norm(r.get("nom")) for m in mots)]
    if not cand and len(mots) >= 3:
        # à un mot près, le mot manquant dans les ingrédients (v43) : « Riz chorizo poivrons » → « Riz au
        # chorizo », poivrons dans la fiche. Même règle que la recherche élargie, et que trouverRecette() d'app.js.
        def a_un_mot_pres(r):
            t = norm(r.get("nom"))
            manque = [m for m in mots if m not in t]
            return len(manque) == 1 and any(manque[0] in norm(i.get("nom")) for i in r.get("ingredients") or [])
        cand = [r for r in recettes if a_un_mot_pres(r)]
    if not cand:
        return None
    return sorted(cand, key=lambda r: len(r["nom"]))[0]


def recette_liee(nom, recettes, statuts=None):
    """La recette d'une envie : son titre exact, sinon celle que le guetteur lui a ASSOCIÉE (statut
    « recette » sur le hub : recherche élargie, titre de la page différent du nom écrit), sinon par le nom.
    Même ordre que trouverRecette() d'app.js."""
    for r in recettes:
        if r.get("nom") == nom:
            return r
    s = (statuts or {}).get(norm(nom))
    if s and s.get("recette"):
        lie = next((r for r in recettes if r.get("nom") == s["recette"]), None)
        if lie:
            return lie
    return trouver_recette(nom, recettes)


# ---------- envies ----------
def envies_du_hub(state):
    v = (state.get("envies") or {}).get("v") or []
    out = []
    for e in v:
        if isinstance(e, str):
            out.append({"nom": e})
        elif isinstance(e, dict) and e.get("nom"):
            out.append({k: e[k] for k in ("nom", "url", "jour", "type") if e.get(k)})
    return out


def url_cle(u):
    """Adresse comparable : sans protocole, paramètres, ancre ni barre finale, en minuscules."""
    u = str(u or "").strip().lower()
    u = re.sub(r"^https?://", "", u)
    return re.sub(r"[?#].*$", "", u).rstrip("/")


def meme_url(a, b):
    return bool(a) and bool(b) and url_cle(a) == url_cle(b)


def recette_envie(e, recettes, statuts=None):
    """La recette qui satisfait une envie. v50 (choix du 08/10 : « un lien que je donne passe toujours devant la recette
    de même nom déjà dans la base ») : une envie AVEC un lien n'est satisfaite que par la recette de CE lien. Avant,
    « Chili con carne » avec un lien Marmiton était tenue pour trouvée parce qu'un autre chili portait ce nom, et le
    lien n'était jamais lu. Sans lien : titre exact, recette liée par le PC, puis le nom (recette_liee)."""
    if isinstance(e, str):
        e = {"nom": e}
    if e.get("url"):
        return next((r for r in recettes if meme_url(r.get("url"), e["url"])), None)
    return recette_liee(e.get("nom") or "", recettes, statuts)


def envies_a_chercher(envies, recettes, journal, maintenant, statuts=None):
    """Plats demandés, absents de la base, pas déjà tentés trop récemment."""
    todo, vus = [], set()
    for e in envies:
        if isinstance(e, str):
            e = {"nom": e}
        nom = (e.get("nom") or "").strip()
        if not nom or e.get("type") == "ingredient" or norm(nom) in vus:
            continue
        vus.add(norm(nom))
        if recette_envie(e, recettes, statuts):
            continue
        j = journal.get(norm(nom))
        if j and maintenant - j.get("dernier", 0) < RELANCE.get(j.get("resultat"), 0):
            continue
        todo.append({k: e[k] for k in ("nom", "url", "jour") if e.get(k)})
    return todo


def etat_envies(envies, recettes, journal, maintenant, statuts=None):
    """Pour l'aperçu (raccourci « Guetteur des Mim's ») : chaque envie et ce que le guetteur en fera.
    Rend [(libellé, statut, à_chercher)]."""
    out, vus = [], set()
    for e in envies:
        if isinstance(e, str):
            e = {"nom": e}
        nom = (e.get("nom") or "").strip()
        if not nom or norm(nom) in vus:
            continue
        vus.add(norm(nom))
        lib = nom + (f" (pour {e['jour']})" if e.get("jour") else "")
        if e.get("type") == "ingredient":
            out.append((lib, "ingrédient : l'app choisit elle-même un plat de ta base qui en contient", False))
            continue
        r = recette_envie(e, recettes, statuts)
        if r:
            out.append((lib, f"déjà dans ta base : {r['nom']}", False))
            continue
        j = journal.get(norm(nom))
        if j and maintenant - j.get("dernier", 0) < RELANCE.get(j.get("resultat"), 0):
            prochain = datetime.fromtimestamp(j["dernier"] + RELANCE[j["resultat"]])
            out.append((lib, f"déjà cherchée ({j['resultat']}), nouvel essai vers le {prochain:%d/%m à %H:%M}", False))
            continue
        out.append((lib, "à chercher" + (" (lien fourni)" if e.get("url") else ""), True))
    return out


# ---------- suivi des envies, écrit sur le hub (v38) ----------
# Champ « guetteur » du hub : { v: { passe: ms, envies: { nom normalisé: statut } }, t: ms }. Le guetteur en
# est le SEUL auteur : les téléphones le lisent (Réglages › Mes envies) et ne le renvoient jamais (sync.js).
# États : en_cours · attente (réessai à la prochaine passe) · ajoutee · introuvable · refusee · erreur.
def statuts_du_hub(state):
    v = (state.get("guetteur") or {}).get("v") or {}
    return dict(v.get("envies") or {}) if isinstance(v, dict) else {}


def statuts_nettoyes(statuts, envies):
    """Ne garde que les envies de PLATS encore notées sur les téléphones."""
    gardees = {norm(e["nom"] if isinstance(e, dict) else e) for e in envies
               if (isinstance(e, str) or (e.get("nom") and e.get("type") != "ingredient"))}
    return {k: v for k, v in statuts.items() if k in gardees}


def statut(nom, etat, detail="", recette=None, maintenant=None):
    maintenant = maintenant or time.time()
    s = {"nom": nom, "etat": etat, "t": int(maintenant * 1000)}
    if detail:
        s["detail"] = detail[:200]
    if recette:
        s["recette"] = recette
    if etat in RELANCE:
        s["prochain"] = int((maintenant + RELANCE[etat]) * 1000)
    return s


def statuts_retrouves(statuts, envies, recettes, maintenant):
    """Une envie suivie que la base retrouve maintenant (envoi rattrapé, ajout à la main) est « ajoutée »."""
    for e in envies:
        nom = e["nom"] if isinstance(e, dict) else e
        s = statuts.get(norm(nom))
        r = recette_envie(e, recettes, statuts)
        if s and r and s.get("etat") != "ajoutee":
            statuts[norm(nom)] = statut(s.get("nom") or nom, "ajoutee", recette=r["nom"], maintenant=maintenant)


def raison_courte(detail):
    """« Nom (url) : raison; … » → les raisons distinctes, lisibles sur un téléphone."""
    raisons = []
    for morceau in (detail or "").split("; "):
        r = morceau.split(") : ", 1)[-1].strip()
        r = re.sub(r"^titre « .* » : ", "", r)
        if r.startswith("l'envie"):
            r = "titre trop différent du nom demandé"
        if r and r not in raisons:
            raisons.append(r)
    return " · ".join(raisons)[:160]


class ReponseHorsScript(Exception):
    """Ce qui revient du hub n'est pas la réponse du script : page d'erreur de Google, coupure réseau."""


def appel_hub(requete, quoi):
    """Envoie une requête au hub et rend sa réponse JSON. `requete` fabrique la requête (une neuve par essai).
    Réessaie ESSAIS_HUB fois quand la réponse n'est pas celle du script (page d'erreur HTML de Google, connexion
    coupée) : c'est passager côté Google. Un REFUS du script lui-même (JSON « ok: false », mauvais mot de passe)
    est rendu tel quel, jamais réessayé. Réenvoyer une écriture est sans risque : le hub garde, champ par champ,
    la valeur à l'horodatage le plus récent, et le patch réenvoyé porte le même horodatage."""
    for n in range(1, ESSAIS_HUB + 1):
        try:
            try:
                rep = urllib.request.urlopen(requete(), timeout=60)
                code, corps = rep.status, rep.read()
            except urllib.error.HTTPError as e:
                code, corps = e.code, e.read()
            try:
                return json.loads(corps.decode("utf-8"))
            except ValueError:
                raise ReponseHorsScript(f"le hub a renvoyé une page d'erreur de Google (code {code}) au lieu de ses données")
        except (ReponseHorsScript, urllib.error.URLError, TimeoutError, ConnectionError) as err:
            # jamais l'adresse dans le message : elle porte le mot de passe en lecture
            motif = str(err.reason) if isinstance(err, urllib.error.URLError) else str(err) or type(err).__name__
            if n >= ESSAIS_HUB:
                raise RuntimeError(f"{quoi} impossible après {ESSAIS_HUB} essais : {motif}") from None
            pause = PAUSES_HUB[min(n - 1, len(PAUSES_HUB) - 1)]
            log(f"{quoi} : {motif}, nouvel essai dans {pause} s")
            if pause:
                time.sleep(pause)


def ecrire_statuts(url, token, statuts):
    """Écrit le suivi sur le hub. Ne touche à aucun autre champ (le hub fusionne champ par champ)."""
    t = int(time.time() * 1000)
    corps = json.dumps({"token": token, "patch": {"guetteur": {"v": {"passe": t, "envies": statuts}, "t": t}}},
                       ensure_ascii=False).encode("utf-8")
    j = appel_hub(lambda: urllib.request.Request(url, data=corps, method="POST", headers={
        "Content-Type": "text/plain;charset=utf-8", "User-Agent": UA}), "écriture du suivi sur le partage")
    if not j.get("ok"):
        raise RuntimeError("le hub refuse l'écriture (" + str(j.get("error") or "refus") + ")")


def site_en_ligne(remote):
    """Adresse GitHub Pages du dépôt (git@hôte:propriétaire/dépôt.git ou https://github.com/…), sinon None."""
    m = re.search(r"(?:github[^:/]*[:/])([^/]+)/([^/]+?)(?:\.git)?/?$", remote or "")
    return f"https://{m.group(1)}.github.io/{m.group(2)}/" if m else None


def attendre_en_ligne(version, delai=360, pas=15):
    """Après l'envoi, GitHub Pages met environ une minute à servir la nouvelle version. On l'attend avant
    d'annoncer « ajoutée » : sinon le téléphone chercherait la mise à jour avant qu'elle existe."""
    code, remote = git("remote", "get-url", "origin")
    site = site_en_ligne(remote.strip()) if not code else None
    if not site:
        return True
    fin = time.time() + delai
    while time.time() < fin:
        try:
            if f'"mims-v{version}"' in telecharger(site + "sw.js?guetteur=" + str(int(time.time()))):
                return True
        except Exception:
            pass
        time.sleep(pas)
    return False


def reglage(nom):
    """Variable d'environnement, sinon celle enregistrée par setx (registre) : une tâche planifiée ne
    voit pas toujours un réglage posé après l'ouverture de session."""
    v = os.environ.get(nom)
    if v or os.name != "nt":
        return v
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as k:
            return winreg.QueryValueEx(k, nom)[0]
    except OSError:
        return None


def lire_hub(url, token):
    sep = "&" if "?" in url else "?"
    j = appel_hub(lambda: urllib.request.Request(url + sep + "token=" + urllib.parse.quote(token),
                                                 headers={"User-Agent": UA}), "lecture du partage")
    if not j.get("ok"):
        raise RuntimeError("le hub refuse la lecture (" + str(j.get("error") or "refus") + ")")
    return j.get("state") or {}


# ---------- recherche par nom dans les plans de site ----------
def telecharger(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    b = urllib.request.urlopen(req, timeout=120).read()
    if b[:2] == b"\x1f\x8b":
        b = gzip.decompress(b)
    return b.decode("utf-8", "replace")


def plan_du_site(site, pause=1.0):
    """Adresses des recettes du site, gardées 7 jours sur ce PC (une lecture par semaine)."""
    cache = os.path.join(donnees(), "plans", site["id"] + ".txt")
    if os.path.exists(cache) and time.time() - os.path.getmtime(cache) < PLANS_VALIDITE:
        return open(cache, encoding="utf-8").read().split()
    try:
        locs = lambda h: [l.replace("&amp;", "&").strip() for l in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", h)]
        enfants = [u for u in locs(telecharger(site["index"])) if re.search(site["fichier"], u)]
        urls = []
        for u in enfants:
            time.sleep(pause)
            urls += [x for x in locs(telecharger(u)) if re.search(site["recette"], x)]
        if not urls:
            raise RuntimeError("aucune recette dans le plan de site")
        urls = list(dict.fromkeys(urls))
        open(cache, "w", encoding="utf-8").write("\n".join(urls))
        log(f"plan de site {site['id']} : {len(urls)} recettes")
        return urls
    except Exception as e:
        if os.path.exists(cache):
            log(f"plan de site {site['id']} illisible ({e}) : ancienne copie utilisée")
            return open(cache, encoding="utf-8").read().split()
        log(f"plan de site {site['id']} illisible ({e})")
        return []


def singulier(m):
    return m[:-1] if len(m) > 3 and m[-1] in "sx" else m


def mots_utiles(texte):
    return [singulier(m) for m in re.findall(r"[a-z0-9]+", norm(texte).replace("œ", "oe")) if m not in VIDES]


def mots_adresse(url):
    dernier = urllib.parse.urlparse(url).path.rstrip("/").split("/")[-1]
    dernier = re.sub(r"\.aspx$", "", dernier)
    dernier = re.sub(r"^recette_", "", dernier)
    dernier = re.sub(r"_\d+$", "", dernier)
    dernier = re.sub(r"^\d+-", "", dernier)
    return mots_utiles(dernier.replace("-", " ").replace("_", " "))


def candidats(nom, plans):
    """Adresses dont le nom contient TOUS les mots du plat demandé, les plus proches d'abord
    (« en_trop » = mots de l'adresse qui ne sont pas dans la demande)."""
    voulus = set(mots_utiles(nom))
    if not voulus:
        return []
    out = []
    for rang_site, site in enumerate(SITES):
        for url in plans.get(site["id"], []):
            m = mots_adresse(url)
            if voulus <= set(m):
                out.append({"url": url, "en_trop": len(set(m) - voulus), "site": rang_site})
    return sorted(out, key=lambda c: (c["en_trop"], c["site"], len(c["url"])))


def candidats_larges(nom, plans):
    """Recherche ÉLARGIE (v41) : adresses qui contiennent tous les mots du plat SAUF UN, pour un nom d'au moins
    3 mots. Cas du 05/10 : « Riz poivrons chorizos » n'avait qu'une adresse avec les 3 mots (« riz au chorizo,
    poivrons et ananas », refusée) et 24 avec « riz » et « chorizo ». Le plat de base (1er mot demandé) en tête
    de l'adresse passe devant. Le mot manquant devra être dans les ingrédients (voir classer_larges)."""
    voulus = list(dict.fromkeys(mots_utiles(nom)))
    if len(voulus) < 3:
        return []
    out = []
    for rang_site, site in enumerate(SITES):
        for url in plans.get(site["id"], []):
            m = mots_adresse(url)
            communs = set(voulus) & set(m)
            if len(communs) == len(voulus) - 1:
                out.append({"url": url, "en_trop": len(set(m) - set(voulus)), "site": rang_site,
                            "tete": bool(m) and m[0] == voulus[0]})
    return sorted(out, key=lambda c: (not c["tete"], c["en_trop"], c["site"], len(c["url"])))


def fiche_de_la_page(html):
    """Le bloc JSON-LD de type Recipe de la page, ou {}."""
    for bloc in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            d = json.loads(bloc)
        except ValueError:
            continue
        pile = [d]
        while pile:
            x = pile.pop()
            if isinstance(x, list):
                pile += x
            elif isinstance(x, dict):
                t = x.get("@type")
                if t == "Recipe" or (isinstance(t, list) and "Recipe" in t) or "recipeIngredient" in x:
                    return x
                pile += list(x.values())
    return {}


def ingredients_de_la_page(html):
    v = fiche_de_la_page(html).get("recipeIngredient") or []
    return [str(i) for i in v] if isinstance(v, list) else []


def mots_manquants(nom, r):
    """Mots du plat demandé absents du titre ET des ingrédients de la recette (au singulier ; un mot compte
    aussi s'il commence un mot de la recette : « caramel » dans « caramélisé »)."""
    texte = " ".join([r.get("nom") or ""] + [str(i.get("nom") or "") for i in r.get("ingredients") or []])
    present = set(mots_utiles(texte))
    return [m for m in dict.fromkeys(mots_utiles(nom))
            if m not in present and not any(len(m) >= 4 and t.startswith(m) for t in present)]


def correspond(nom, r):
    """La recette est-elle bien le plat demandé ? Tous ses mots dans le titre ou les ingrédients."""
    return not mots_manquants(nom, r)


def classer_larges(nom, cands, pause=None):
    """Lit les pages de la recherche élargie (au plus MAX_PAGES_LARGES, une par seconde) et ne garde que celles
    dont le titre ou les ingrédients contiennent TOUS les mots du plat, la mieux notée d'abord."""
    pause = PAUSE if pause is None else pause
    gardes = []
    for i, c in enumerate(cands[:MAX_PAGES_LARGES]):
        if i and pause:
            time.sleep(pause)
        try:
            html = telecharger(c["url"])
        except Exception:
            continue
        fiche = {"nom": " ".join(mots_adresse(c["url"])), "ingredients": [{"nom": x} for x in ingredients_de_la_page(html)]}
        if correspond(nom, fiche):
            c["note"], c["avis"] = note_de_la_page(html)
            gardes.append(c)
    return sorted(gardes, key=lambda c: (-score(c["note"], c["avis"]), c["en_trop"]))[:MAX_PAGES_LUES]


def note_de_la_page(html):
    """Note des lecteurs (JSON-LD aggregateRating) : (valeur, nombre d'avis), ou (None, 0)."""
    for bloc in re.findall(r'<script[^>]*application/ld\+json[^>]*>(.*?)</script>', html, re.S):
        try:
            d = json.loads(bloc)
        except ValueError:
            continue
        pile = [d]
        while pile:
            x = pile.pop()
            if isinstance(x, list):
                pile += x
            elif isinstance(x, dict):
                ar = x.get("aggregateRating")
                if isinstance(ar, dict) and ar.get("ratingValue") is not None:
                    try:
                        v = float(str(ar["ratingValue"]).replace(",", "."))
                        n = int(float(str(ar.get("ratingCount") or ar.get("reviewCount") or 0).replace(",", ".")))
                        return v, n
                    except ValueError:
                        pass
                pile += list(x.values())
    return None, 0


def score(valeur, avis):
    """Note pondérée par le nombre d'avis : 4,6 sur 200 avis passe devant 5 sur 2 avis."""
    return (valeur or 0) * (1 - math.exp(-(avis or 0) / 15))


def classer_par_note(cands, pause=None):
    """Parmi les adresses les plus proches du nom (au plus 1 mot de plus que la meilleure), la mieux notée
    d'abord. Lit au plus MAX_PAGES_LUES pages, une par seconde."""
    if not cands:
        return []
    pause = PAUSE if pause is None else pause
    meilleur = cands[0]["en_trop"]
    proches = [c for c in cands if c["en_trop"] <= meilleur + 1][:MAX_PAGES_LUES]
    for i, c in enumerate(proches):
        if i and pause:
            time.sleep(pause)
        try:
            c["note"], c["avis"] = note_de_la_page(telecharger(c["url"]))
        except Exception:
            c["note"], c["avis"] = None, 0
    return sorted(proches, key=lambda c: (-score(c["note"], c["avis"]), c["en_trop"]))


def trouver_glaneur():
    """ajouter_recette.py cherche « glaneur » dans le PATH. Un programme lancé avant l'installation de
    Glaneur (ou une tâche planifiée) ne voit pas encore son dossier : on l'ajoute s'il est installé."""
    if os.environ.get("GLANEUR") or shutil.which("glaneur"):
        return
    installe = os.path.join(os.environ.get("LOCALAPPDATA") or "", "Glaneur", "bin")
    if os.path.exists(os.path.join(installe, "glaneur.cmd")):
        os.environ["PATH"] = installe + os.pathsep + os.environ.get("PATH", "")


def lire_pages(urls):
    """Lecture par Glaneur (ajouter_recette.py), sans arrêter le guetteur si Glaneur échoue."""
    trouver_glaneur()
    try:
        return A.lire_avec_glaneur(urls)
    except SystemExit as e:
        raise RuntimeError(str(e))


def choisir_parmi(nom, lues, connus, urls_connues, noms_connus, demande=False, exclues=None):
    """Première recette lue qui respecte les règles de l'app ET qui est bien le plat demandé (tous ses mots
    dans le titre ou les ingrédients). Rend (recette au format des lots ou None, raisons des refus).
    `exclues` (liste) reçoit les fiches refusées SEULEMENT pour un ingrédient exclu : repli de chercher()."""
    refus = []
    for g in lues:
        r, _, raison = A.completer(g, connus, demande=demande)
        doublon = r["url"].rstrip("/") in urls_connues or norm(r["nom"]) in noms_connus
        manque = [] if demande else mots_manquants(nom, r)
        if not raison and doublon:
            raison = "déjà dans les lots"
        if not raison and manque:
            raison = f"titre « {r['nom']} » : ni le titre ni les ingrédients ne contiennent « {', '.join(manque)} »"
        if (exclues is not None and raison and raison.startswith("contient un ingrédient exclu")
                and not doublon and not manque):
            exclues.append(g)
        if raison:
            refus.append(f"{r['nom']} ({r['url']}) : {raison}")
            continue
        return r, refus
    return None, refus


# ---------- base, lot, version ----------
def recettes_de_la_base(dossier=ICI):
    out, dedans = [], False
    for ligne in open(os.path.join(dossier, "data.js"), encoding="utf-8"):
        if ligne.startswith("window.RECIPES = ["):
            dedans = True
            continue
        if dedans:
            if ligne.startswith("];"):
                break
            out.append(json.loads(ligne.strip().rstrip(",")))
    return out


def ecrire_lot(chemin, lot):
    texte = json.dumps(lot, ensure_ascii=False, indent=1).replace("\n", "\r\n")
    open(chemin, "wb").write(texte.encode("utf-8"))


def remplacer(chemin, motif, rempl, minimum=1):
    b = open(chemin, "rb").read().decode("utf-8")
    nouveau, n = re.subn(motif, rempl, b)
    if n < minimum:
        raise RuntimeError(f"{os.path.basename(chemin)} : version introuvable")
    open(chemin, "wb").write(nouveau.encode("utf-8"))


def monter_version(dossier=ICI):
    """VERSION_APP (app.js), ?v= (index.html) et CACHE (sw.js) : la règle de CLAUDE.md à chaque livraison,
    sans quoi les téléphones gardent leur copie en cache."""
    app = os.path.join(dossier, "app.js")
    v = int(re.search(r"const VERSION_APP = (\d+);", open(app, encoding="utf-8").read()).group(1)) + 1
    remplacer(app, r"const VERSION_APP = \d+;", f"const VERSION_APP = {v};")
    remplacer(os.path.join(dossier, "index.html"), r'\?v=\d+"', f'?v={v}"')
    remplacer(os.path.join(dossier, "sw.js"), r'const CACHE = "mims-v\d+";', f'const CACHE = "mims-v{v}";')
    return v


# ---------- programmes externes ----------
def lancer(cmd, cwd=ICI, delai=1800):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0", PYTHONIOENCODING="utf-8")
    p = subprocess.run(cmd, cwd=cwd, capture_output=True, encoding="utf-8", errors="replace", env=env,
                       timeout=delai, creationflags=PAS_DE_FENETRE)
    return p.returncode, (p.stdout or "") + (p.stderr or "")


def git(*args):
    return lancer(["git", *args])


def preparer_git():
    """Le dossier doit être PROPRE (sinon une autre personne ou un autre outil y travaille : on ne
    publie pas son travail à sa place) et à jour avec GitHub. Rend un motif d'arrêt, ou None."""
    code, sortie = git("status", "--porcelain")
    if code:
        return "git status a échoué : " + sortie.strip()[:200]
    if sortie.strip():
        return "le dossier contient des modifications en cours : je réessaie à la prochaine passe"
    code, sortie = git("pull", "--ff-only", "-q")
    if code:
        return "mise à jour depuis GitHub impossible : " + sortie.strip()[:200]
    code, sortie = git("rev-list", "--count", "@{u}..HEAD")
    if not code and sortie.strip() not in ("", "0"):
        code, sortie = git("push", "-q")
        if code:
            return "un envoi précédent attend encore et échoue : " + sortie.strip()[:200]
        log("envoi en attente rattrapé")
    return None


def tests():
    """Tous les tests du dépôt : Python (ajout de recette, guetteur) et navigateur (lancer_tests.mjs).
    Chacun dans SON programme : test_ajouter_recette.py est un script qui se termine par sys.exit, et
    « unittest test_ajouter_recette test_guetteur » s'arrêtait là sans jamais lancer test_guetteur."""
    code1, s1 = lancer([sys.executable, "test_ajouter_recette.py"])
    code2, s2 = lancer([sys.executable, "-m", "unittest", "-q", "test_guetteur"])
    code3, s3 = lancer(["node", "lancer_tests.mjs"])
    dernier = lambda s: (s.strip().splitlines() or [""])[-1]
    return (code1 == 0 and code2 == 0 and code3 == 0,
            f"ajout de recette : {dernier(s1)} · guetteur : {dernier(s2)}", s3)


# ---------- une passe ----------
def charger_journal():
    chemin = os.path.join(donnees(), "journal.json")
    try:
        return json.load(open(chemin, encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def sauver_journal(journal):
    json.dump(journal, open(os.path.join(donnees(), "journal.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


def chercher(envie, connus, urls_connues, noms_connus, plans):
    """Rend (recette ou None, résultat, détail)."""
    nom = envie["nom"]
    if envie.get("url"):  # lien fourni par l'utilisateur : toute source acceptée (« recette demandée »)
        if any(meme_url(u, envie["url"]) for u in urls_connues):
            return None, "refusee", "lien déjà dans les lots"
        # v50 : le lien passe devant une recette de même nom. Le nom n'est donc pas un motif de refus (noms connus
        # non passés) : il est rendu unique plus bas. Seule l'adresse identifie un doublon.
        r, refus = choisir_parmi(nom, lire_pages([envie["url"]]), connus, urls_connues, set(), demande=True)
        if not r:
            return None, "refusee", "; ".join(refus) or "page illisible"
        if not trouver_recette(nom, [r]):
            # Lien fourni avec SON nom de plat : sans ce nom, l'épingle du jour (posée avec le texte de
            # l'envie) ne retrouverait jamais la recette. Ingrédients, étapes et source restent ceux de la page.
            log(f"« {nom} » : titre de la page « {r['nom']} » remplacé par le nom de l'envie")
            r["nom"] = A.nettoyer_nom(nom)
        if norm(r["nom"]) in noms_connus:
            # même nom qu'une recette de la base (cas du 08/10 : « Chili con carne ») : « (ton lien) » la distingue,
            # et survit au nettoyage des titres de build_data.py. L'app la retrouve par son adresse.
            base, k = r["nom"], 1
            while norm(r["nom"]) in noms_connus:
                r["nom"] = f"{base} (ton lien{'' if k == 1 else ' ' + str(k)})"
                k += 1
            log(f"« {nom} » : une autre recette s'appelle déjà « {base} », celle de ton lien devient « {r['nom']} »")
        return r, "ajoutee", r["url"]
    exclues, tous_refus = [], []
    # 1) adresses avec TOUS les mots du plat
    cands = candidats(nom, plans)
    if cands:
        classes = classer_par_note(cands)
        log(f"« {nom} » : {len(cands)} adresse(s), lues : " + ", ".join(
            f"{c['url']} ({c['note'] or '—'}/{c['avis']})" for c in classes))
        r, refus = choisir_parmi(nom, lire_pages([c["url"] for c in classes]), connus, urls_connues, noms_connus,
                                 exclues=exclues)
        for x in refus:
            log("  refusée : " + x)
        tous_refus += refus
        if r:
            return r, "ajoutee", r["url"]
    # 2) rien ne convient : adresses à un mot près, si la fiche contient quand même tous les mots
    larges = candidats_larges(nom, plans)
    if larges:
        classes = classer_larges(nom, larges)
        log(f"« {nom} » : recherche élargie, {len(larges)} adresse(s) à un mot près, {len(classes)} avec tous les "
            "mots dans la fiche : " + ", ".join(f"{c['url']} ({c['note'] or '—'}/{c['avis']})" for c in classes))
        if classes:
            r, refus = choisir_parmi(nom, lire_pages([c["url"] for c in classes]), connus, urls_connues,
                                     noms_connus, exclues=exclues)
            for x in refus:
                log("  refusée : " + x)
            tous_refus += refus
            if r:
                return r, "ajoutee", r["url"]
    # 3) toujours rien : la mieux placée des recettes refusées SEULEMENT pour un ingrédient exclu est
    #    proposée quand même, comme une recette demandée. L'app signale l'ingrédient (choix du 05/10).
    for g in exclues:
        r, _, raison = A.completer(g, connus, demande=True)
        if raison:
            continue
        detail = "contient " + ", ".join(A.exclus_par_defaut(r)) + " : proposée quand même, l'app le signale"
        log(f"« {nom} » : aucune recette sans ingrédient exclu, {r['nom']} proposée ({detail})")
        return r, "ajoutee", detail
    if not cands and not larges:
        return None, "introuvable", "aucune recette de ce nom dans les plans de site"
    return None, "refusee", "; ".join(tous_refus)[:500] or "aucune page lisible"


def passe(essai=False, plat=None):
    journal = charger_journal()
    maintenant = time.time()
    url = token = None
    statuts, ecrits = {}, {}
    if plat:
        envies = [{"nom": plat}]
    else:
        url, token = reglage("MIMS_HUB_URL"), reglage("MIMS_HUB_TOKEN")
        if not url or not token:
            jour = datetime.now().strftime("%Y-%m-%d")
            if journal.get("_reglages_signales") != jour:
                log("réglages manquants : MIMS_HUB_URL et MIMS_HUB_TOKEN (voir l'en-tête de guetteur.py)")
                journal["_reglages_signales"] = jour
                sauver_journal(journal)
            return 0
        etat_hub = lire_hub(url, token)
        envies = envies_du_hub(etat_hub)
        ecrits = statuts_du_hub(etat_hub)
        statuts = statuts_nettoyes(ecrits, envies)
    v_hub = ((etat_hub.get("guetteur") or {}).get("v") or {}) if not plat else {}
    passe_hub = v_hub.get("passe") or 0 if isinstance(v_hub, dict) else 0
    a_suivre = any(isinstance(e, str) or e.get("type") != "ingredient" for e in envies)

    def publier_statuts():
        """Écrit le suivi sur le hub s'il a changé, ou toutes les 50 min tant qu'il y a des envies de plats
        (l'app affiche « le PC a regardé tes envies il y a … » et alerte au-delà de 2 h). Jamais en essai
        ni pour --plat."""
        nonlocal ecrits, passe_hub
        if essai or plat:
            return
        signe_de_vie = a_suivre and time.time() * 1000 - passe_hub > 50 * 60 * 1000
        if statuts == ecrits and not signe_de_vie:
            return
        try:
            ecrire_statuts(url, token, statuts)
            ecrits = json.loads(json.dumps(statuts))
            passe_hub = time.time() * 1000
        except Exception as err:
            log("suivi non écrit sur le hub : " + str(err)[:200])

    def marquer(e, etat, detail="", recette=None):
        statuts[norm(e["nom"])] = statut(e["nom"], etat, detail, recette, time.time())

    recettes = recettes_de_la_base()
    statuts_retrouves(statuts, envies, recettes, maintenant)
    todo = envies_a_chercher(envies, recettes, {} if plat else journal, maintenant, statuts)[:MAX_PAR_PASSE]
    if not todo:
        publier_statuts()
        return 0
    if not essai:
        motif = preparer_git()
        if motif:
            log("pas de publication : " + motif)
            for e in todo:
                marquer(e, "attente", "le PC termine un autre travail, nouvel essai dans 30 min")
            publier_statuts()
            return 0
        recettes = recettes_de_la_base()            # la base a pu changer avec la mise à jour
        statuts_retrouves(statuts, envies, recettes, maintenant)
        todo = [e for e in todo if not recette_envie(e, recettes, statuts)]
        if not todo:
            publier_statuts()
            return 0
        for e in todo:
            marquer(e, "en_cours")
        publier_statuts()
    log(f"envies à chercher : {', '.join(e['nom'] for e in todo)}")
    plans = {} if all(e.get("url") for e in todo) else {s["id"]: plan_du_site(s) for s in SITES}
    urls_connues, noms_connus = A.deja_dans_les_lots()
    connus = A.rayons_connus()
    chemin_lot = os.path.join(ICI, LOT)
    sauvegarde = {f: (open(os.path.join(ICI, f), "rb").read() if os.path.exists(os.path.join(ICI, f)) else None)
                  for f in FICHIERS_PUBLIES}
    ajouts = []
    for e in todo:
        try:
            r, resultat, detail = chercher(e, connus, urls_connues, noms_connus, plans)
        except Exception as err:
            r, resultat, detail = None, "erreur", str(err)[:300]
        quoi = ("retenue (essai : rien n'est écrit)" if essai else "retenue") if r else resultat
        log(f"« {e['nom']} » → {quoi} : {r['nom'] + ' — ' + r['url'] if r else detail}")
        if not plat:
            journal[norm(e["nom"])] = {"dernier": maintenant, "resultat": resultat, "detail": detail}
        if r:
            ajouts.append((e, r))
            urls_connues.add(r["url"].rstrip("/"))
            noms_connus.add(norm(r["nom"]))
            marquer(e, "en_cours", f"recette trouvée : {r['nom']} ({r['source']}), vérifications puis mise en ligne")
        elif resultat == "introuvable":
            marquer(e, "introuvable")
        elif resultat == "refusee":
            marquer(e, "refusee", raison_courte(detail))
        else:
            marquer(e, "erreur")
    publier_statuts()
    if essai or not ajouts:
        if not plat:
            sauver_journal(journal)
        return 0
    try:
        lot = json.load(open(chemin_lot, encoding="utf-8")) if os.path.exists(chemin_lot) else []
        ecrire_lot(chemin_lot, lot + [r for _, r in ajouts])
        # prix et calories : sur ce lot seulement (prix_kcal.py relit chaque page Marmiton du dossier)
        tmp = tempfile.mkdtemp()
        try:
            shutil.copy(chemin_lot, tmp)
            code, sortie = lancer([sys.executable, "prix_kcal.py", tmp, "--ecrire"])
            if code:
                raise RuntimeError("prix_kcal.py a échoué : " + sortie[-300:])
            shutil.copy(os.path.join(tmp, os.path.basename(chemin_lot)), chemin_lot)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)
        code, sortie = lancer([sys.executable, "build_data.py", "lots", "data.js"])
        m = re.search(r"(\d+) recettes chargées -> (\d+) valides", sortie)
        if code or not m or m.group(1) != m.group(2):
            raise RuntimeError("build_data.py refuse une recette : " + sortie[-400:])
        base = recettes_de_la_base()
        for e, r in ajouts:
            # le nom EXACT dans data.js : c'est lui que l'app associe à l'envie (statut « recette »)
            x = next((b for b in base if norm(b.get("nom")) == norm(r["nom"])), None)
            if not x:
                raise RuntimeError(f"« {r['nom']} » absente de data.js après reconstruction")
            r["nom"] = x["nom"]
        version = monter_version()
        ok, resume_py, sortie_nav = tests()
        if not ok:
            # les lignes des tests en échec, pas la fin de la sortie (qui ne montrait que des tests verts)
            rouges = [l.strip() for l in sortie_nav.splitlines() if l.startswith("ÉCHEC")]
            raise RuntimeError("tests en échec : " + resume_py + " | " + (" ; ".join(rouges) or sortie_nav[-600:])[:700])
        git("add", *FICHIERS_PUBLIES)
        message = (f"v{version} : envie{'s' if len(ajouts) > 1 else ''} "
                   + ", ".join(f"« {e['nom']} » → {r['nom']}" for e, r in ajouts)
                   + "\n\nAjouté par guetteur.py depuis les envies des téléphones :\n"
                   + "\n".join(f"- {r['nom']} ({r['source']}) {r['url']}" for _, r in ajouts)
                   + "\nTous les tests passaient avant l'envoi.")
        code, sortie = git("commit", "-q", "-m", message)
        if code:
            raise RuntimeError("commit impossible : " + sortie[-300:])
        code, sortie = git("push", "-q")
        if code:
            log("commit fait mais envoi impossible (rattrapé à la prochaine passe) : " + sortie.strip()[:300])
            for e, r in ajouts:
                marquer(e, "attente", f"recette trouvée : {r['nom']}, mise en ligne à la prochaine passe",
                        recette=r["nom"])
        else:
            servie = attendre_en_ligne(version)
            log(f"en ligne : v{version}, " + ", ".join(r["nom"] for _, r in ajouts)
                + ("" if servie else " (le site ne la servait pas encore après 6 min)"))
            for e, r in ajouts:
                ex = A.exclus_par_defaut(r)
                marquer(e, "ajoutee", ("contient " + ", ".join(ex)) if ex else "", recette=r["nom"])
        publier_statuts()
    except Exception as err:
        # rien n'est publié : les fichiers reviennent à leur état d'avant la passe
        for f, contenu in sauvegarde.items():
            chemin = os.path.join(ICI, f)
            if contenu is None:
                if os.path.exists(chemin):
                    os.remove(chemin)
            else:
                open(chemin, "wb").write(contenu)
        log("ANNULÉ, rien publié : " + str(err)[:800])
        for e, _ in ajouts:
            journal[norm(e["nom"])] = {"dernier": maintenant, "resultat": "erreur", "detail": str(err)[:300]}
            marquer(e, "erreur", "recette trouvée mais une vérification a échoué")
        publier_statuts()
        sauver_journal(journal)
        return 1
    sauver_journal(journal)
    return 0


def apercu():
    """Envies du hub et ce que le guetteur en fera. Code : 0 = au moins un plat à chercher, 3 = rien à
    chercher, 2 = réglages manquants."""
    url, token = reglage("MIMS_HUB_URL"), reglage("MIMS_HUB_TOKEN")
    if not url or not token:
        print("Réglages manquants : MIMS_HUB_URL et MIMS_HUB_TOKEN.")
        return 2
    etat_hub = lire_hub(url, token)
    envies = envies_du_hub(etat_hub)
    if not envies:
        print("Aucune envie sur le partage. Note-les sur le téléphone (Réglages › Mes envies), avec « Partage à deux »"
              " activé : sinon elles restent sur le téléphone.")
        return 3
    lignes = etat_envies(envies, recettes_de_la_base(), charger_journal(), time.time(), statuts_du_hub(etat_hub))
    print(f"{len(lignes)} envie(s) sur le partage :")
    for lib, statut, _ in lignes:
        print(f"  • {lib} — {statut}")
    return 0 if any(x[2] for x in lignes) else 3


def sans_console():
    """pythonw (la tâche planifiée) n'a pas de console : sys.stdout et sys.stderr valent None, et le premier
    write() faisait planter la passe (« 'NoneType' object has no attribute 'write' », 06 et 07/10 : aucune page
    lue depuis la v41). Les sorties partent alors dans le vide ; le journal guetteur.log reste écrit."""
    for nom in ("stdout", "stderr"):
        if getattr(sys, nom) is None:
            setattr(sys, nom, open(os.devnull, "w", encoding="utf-8", newline=""))


def main():
    sans_console()
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--essai", action="store_true", help="chercher et afficher, sans rien écrire ni publier")
    ap.add_argument("--plat", help="chercher ce plat au lieu de lire les envies du hub")
    ap.add_argument("--apercu", action="store_true", help="montrer les envies du hub et ce qui en sera fait")
    a = ap.parse_args()
    if a.apercu:
        try:
            return apercu()
        except Exception as err:
            print("Lecture du partage impossible : " + str(err)[:300])
            return 1
    verrou = os.path.join(donnees(), "verrou")
    if os.path.exists(verrou) and time.time() - os.path.getmtime(verrou) < 3600:
        print("Une recherche est déjà en cours (tâche planifiée) : réessaie dans quelques minutes.")
        return 0  # une passe tourne déjà
    open(verrou, "w").write(str(os.getpid()))
    try:
        return passe(essai=a.essai, plat=a.plat)
    except Exception as err:
        log("erreur : " + str(err)[:500])
        return 1
    finally:
        try:
            os.remove(verrou)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main())
