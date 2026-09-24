# Recettes des Mim's

App web mobile-first de planification de repas hebdomadaire (3 pers, 4 parts/plat), à partir d'une base de recettes curée et d'un cadre de règles nutritionnelles.

## Déploiement
- Repo : https://github.com/maxencebonnetcarrier-ship-it/recettes-des-mims (public)
- Live (GitHub Pages, branche main / racine) : **https://maxencebonnetcarrier-ship-it.github.io/recettes-des-mims/**
- Mettre à jour = `git push` sur main ; Pages rebuild automatiquement (~1 min).

## Stack
- HTML/CSS/JS pur, mono-page, **zéro build**. Fonctionne en `file://` et sur GitHub Pages.
- État persisté en `localStorage` (clé `mims_state_v1`).
- Pas de dépendance externe, pas de framework.

## Fichiers
- `data.js` — base des 44 recettes + `CADRE` (contraintes par jour) + `EXCLUS` + `SAVEURS`. **Source de vérité = le Google Sheet.**
- `app.js` — générateur de menu + rendu des 3 onglets + navigation.
- `index.html` / `style.css` — coquille + design.

## Règles métier (à préserver)
- Jours : Lun Volaille ≤30min · Mar Légumineuses · Mer Porc ≤30min · Jeu Poisson · Ven Rapide ≤20min · Sam Mijoté · Dim Mijoté/Rôti.
- ≥1 poisson gras / semaine (bascule Jeudi puis Mardi si absent).
- Pas 2× la même recette sur 3 semaines (via historique).
- Légumes de saison (saison courante déduite du mois).
- Pas 2× la même saveur dominante / semaine (moutarde, cidre, curry, coco, vin…).
- Exclus : abats, tomate, champignons, sucré-salé.

## Ajouter une recette
Ajouter un objet dans `window.RECIPES` (data.js) avec : `nom, cat, piece, type, min, saison, tags[], ingr[]`.
`cat` doit correspondre à une catégorie du `CADRE` pour être planifiable.

## Orientation commerciale (long terme)
Si un jour commercialisé : cible particuliers / TPE-PME (familles, indépendants), jamais grands comptes. Défaut, pas une contrainte dure.

# TODO : à compléter à mesure que le projet évolue (déploiement GitHub Pages, ajout liste de courses, sync Sheet).
