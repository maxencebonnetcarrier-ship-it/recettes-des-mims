# 🍲 Recettes des Mim's

App web mobile-first pour planifier les repas de la semaine (3 personnes, 4 parts par plat), avec liste de courses automatique.

**👉 [Ouvrir l'app](https://maxencebonnetcarrier-ship-it.github.io/recettes-des-mims/)**

## Les 4 onglets
- **📅 Semaine** — le menu Lun→Dim généré automatiquement. Chaque plat affiche son temps (préparation + cuisson), ses modes de cuisson, ses ingrédients quantifiés, ses étapes et un lien vers la recette d'origine. Bouton « Changer ce plat » pour n'en régénérer qu'un.
- **🛒 Courses** — tous les ingrédients du menu, additionnés et rangés par rayon. Cases à cocher + copie en un clic.
- **📖 Recettes** — toute la base, avec recherche par nom ou ingrédient.
- **⚙️ Réglages** — ingrédients exclus (ajout/retrait libre) et historique.

## Ne plus jamais voir un ingrédient
Croix **✕** à côté de n'importe quel ingrédient → il rejoint les exclusions, et toute recette qui en contient disparaît du menu, immédiatement remplacée.

## Recettes
Toutes scrapées depuis **Marmiton**, **Saveurs Magazine** et **Cuisine Journal des Femmes**. Aucune recette inventée : quantités, temps et étapes viennent du site source, lié depuis chaque fiche.

## Règles de planification
Une catégorie par jour, et surtout : **jamais la même protéine deux jours de suite**. Détail dans `CLAUDE.md`.

## Développement
Aucun build pour l'app — ouvrir `index.html` suffit. Pour régénérer la base de recettes : `python build_data.py <dossier_des_lots> data.js`.
