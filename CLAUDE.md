# Recettes des Mim's

App web mobile-first de planification de repas hebdomadaire (3 personnes, 4 parts par plat), avec base de recettes scrapée, liste de courses automatique et exclusions d'ingrédients personnalisables.

## Déploiement
- Repo : https://github.com/maxencebonnetcarrier-ship-it/recettes-des-mims (public)
- Live (GitHub Pages, branche main / racine) : **https://maxencebonnetcarrier-ship-it.github.io/recettes-des-mims/**
- Mettre à jour = `git push` sur main ; Pages rebuild automatiquement (~1 min).

## Stack
- HTML/CSS/JS pur, mono-page, **zéro build côté app**. Fonctionne en `file://` et sur GitHub Pages.
- État persisté en `localStorage` (clé `mims_state_v2`).
- Aucune dépendance, aucun framework, aucun appel réseau à l'exécution.

## Fichiers
- `data.js` — **généré, ne pas éditer à la main**. Base de recettes + `CADRE` + `EXCLUS_DEFAUT` + `SAVEURS`.
- `build_data.py` — assemble les lots scrapés en `data.js`, valide et rejette les recettes non conformes.
- `app.js` — générateur de menu, liste de courses, exclusions, rendu des 4 onglets.
- `index.html` / `style.css` — coquille + design.
- `test_generateur.js` — test automatisé du générateur (à exécuter dans la console navigateur).

## Provenance des recettes
Scrapées via Firecrawl depuis **3 sites spécialisés uniquement** : marmiton.org, saveurs-magazine.fr,
cuisine.journaldesfemmes.fr. Chaque recette porte son `url` source réelle, affichée dans l'app.
Aucune recette n'est inventée : ingrédients, quantités, temps et étapes viennent du scrape.

### Ajouter une recette
1. Scraper l'URL (Firecrawl, schéma JSON dans `build_data.py`), écrire le résultat dans un `lotN.json`.
2. `python build_data.py <dossier_des_lots> data.js`
3. Le script valide : URL réelle, ingrédients non vides, catégorie dans le CADRE, protéine renseignée,
   aucun ingrédient exclu par défaut. Il affiche la couverture par jour.

## Règles métier
- **Jours** : Lun Volaille · Mar Légumineuses · Mer Porc · Jeu Poisson · Ven Express (retour du sport)
  · Sam Mijoté · Dim Mijoté ou Rôti.
- **Anti-répétition par PROTÉINE** (et non par nom de recette) : jamais la même protéine deux jours
  consécutifs, et pas plus de 2 fois dans la semaine. C'est la règle qui empêche « bavette / bourguignon /
  rôti de bœuf » trois soirs de suite.
- Pas deux fois la même recette sur 3 semaines (via l'historique).
- Légumes de saison (saison déduite du mois courant).
- Pas deux fois la même saveur dominante dans la semaine.
- **Exclusions** : `EXCLUS_DEFAUT` (abats, tomate, champignon, sucré-salé) + celles que l'utilisateur
  ajoute dans Réglages ou via la croix ✕ sur un ingrédient. Une recette contenant un exclu n'est
  JAMAIS proposée, et disparaît du menu en cours si l'exclusion est ajoutée après coup.

## Décisions délibérées (ne pas re-signaler en review)
- Les quantités sont mises à l'échelle depuis `parts_origine` vers 4 parts à l'affichage et dans les courses.
- Aucune mention de congélation dans l'app (retiré à la demande de l'utilisateur).
- Aucun indicateur « poisson gras » en tête d'écran (retiré : incompris). Le tag reste sur la fiche recette.
- La liste de courses agrège par unité : un ingrédient en « g » et en « pièce » affiche les deux (`300 g + 2`).

## Orientation commerciale (long terme)
Si un jour commercialisé : cible particuliers / TPE-PME (familles, indépendants), jamais grands comptes.
Défaut, pas une contrainte dure.
