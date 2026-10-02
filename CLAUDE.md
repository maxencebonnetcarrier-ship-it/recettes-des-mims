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
- `test_semaines.js` — même principe : bouton « Retirer » de l'historique, passage du Nouvel An, et règle
  des 3 semaines sans « Marquer fait »
  (une semaine = année ISO + numéro, champs `an` et `num`). `test_courses.js` — « Copier la liste »
  ne recopie que les articles non cochés, aucun doublon, filtre par jour, accompagnement pris.
  Tous deux remettent à zéro l'état de l'appareil testé.
- `test_infos.js` — prix (€ / €€ / €€€) et calories par part : affichés quand la source les donne,
  jamais inventés ; pas d'addition quand l'accompagnement remplace un féculent de la recette.
- `prix_kcal.py` — relève sur chaque page Marmiton le niveau de prix et les calories (champs `cout`,
  `kcal_part` des lots). À relancer avec `--ecrire` après un ajout de recette, avant `build_data.py`.
- `test_theme.js` — réglage Réglages › Apparence (Auto / Clair / Sombre) : à lancer téléphone en clair
  PUIS en sombre. L'apparence est un réglage de l'appareil (clé `mims_theme`), hors synchro ;
  `index.html` la relit avant la feuille de style. Le test remet « Auto » à la fin.

## Provenance des recettes
Scrapées via Firecrawl depuis **3 sites spécialisés uniquement** : marmiton.org, saveurs-magazine.fr,
cuisine.journaldesfemmes.fr. Chaque recette porte son `url` source réelle, affichée dans l'app.
Aucune recette n'est inventée : ingrédients, quantités, temps et étapes viennent du scrape.

**Exception — recettes DEMANDÉES** (`"demande": true`, cf. `lots/lot2_demandes.json`) : quand
l'utilisateur fournit lui-même un lien, **n'importe quelle source est acceptée** (ex. maspatule.com
pour les enchiladas). Ces recettes contournent deux contrôles : catégorie hors du CADRE, et présence
d'un ingrédient exclu par défaut. L'app le signale à l'écran quand le plat est imposé sur un jour.
La règle des 3 sites reste entière pour les recettes que Claude cherche de sa propre initiative.

### Ajouter une recette
1. Scraper l'URL (Firecrawl, schéma JSON dans `build_data.py`), écrire le résultat dans un `lotN.json`.
2. `python prix_kcal.py <dossier_des_lots> --ecrire` (prix et calories, Marmiton seulement)
3. `python build_data.py <dossier_des_lots> data.js`
4. Le script valide : URL réelle, ingrédients non vides, catégorie dans le CADRE, protéine renseignée,
   aucun ingrédient exclu par défaut, prix et calories exploitables. Il affiche la couverture par jour.

### Prix et calories (v33)
Relevés sur la page source, jamais estimés. Seul Marmiton publie les deux : niveau de prix (« Bon
marché » → €, « Moyen » → €€, « Assez cher » → €€€) et calories par part (JSON-LD `nutrition`). Le
Journal des Femmes affiche un chiffre en kcal sans dire s'il est par part ou pour 100 g : non repris.
Les calories Marmiton sont calculées pour SON nombre de parts : `prix_kcal.py` les ramène aux
`parts_origine` de la recette, et les écarte quand le site n'a pas pesé l'ingrédient principal
(part < 150 g pour un plat, < 40 g pour un accompagnement) ou que le total est hors de toute assiette
(> 1500 kcal ou part > 1 kg ; > 500 g pour un accompagnement).

## Règles métier
- **Jours** : Lun Volaille · Mar Légumineuses · Mer Porc · Jeu Poisson · Ven Express (retour du sport)
  · Sam Mijoté · Dim Mijoté ou Rôti.
- **Anti-répétition par PROTÉINE** (et non par nom de recette) : jamais la même protéine deux jours
  consécutifs, et pas plus de 2 fois dans la semaine. C'est la règle qui empêche « bavette / bourguignon /
  rôti de bœuf » trois soirs de suite.
- Pas deux fois la même recette sur 3 semaines. Le dernier menu affiché d'une semaine terminée compte
  d'office (champ `servis`, partagé par la synchro) : la règle ne dépend pas de « Marquer fait ».
  L'historique « Marquer fait » compte aussi, mais n'est jamais rempli automatiquement.
- Légumes de saison (saison déduite du mois courant).
- Pas deux fois la même saveur dominante dans la semaine.
- **Exclusions** : `EXCLUS_DEFAUT` (abats, tomate, champignon, sucré-salé) + celles que l'utilisateur
  ajoute dans Réglages ou via la croix ✕ sur un ingrédient. Une recette contenant un exclu n'est
  JAMAIS proposée, et disparaît du menu en cours si l'exclusion est ajoutée après coup.
- **Liste de courses** (v33) : un article = un ACHAT (singulier/pluriel, « gousses d'ail » = « ail »,
  variantes listées dans `MEME_ACHAT_BRUT` d'`app.js`), rangé dans son rayon le plus fréquent.
  Filtre par jour (réglage de l'appareil, clé `mims_courses_jours`, oublié au changement de semaine).
  Une case par article ET par jour : l'ail coché pour mercredi reste à acheter pour jeudi.
- **Accompagnement** (v33) : une PROPOSITION. Il n'entre dans les courses que si on le prend
  (« Ajouter aux courses », champ `sideChoisi` du plan, partagé par la synchro) ; pris, il remplace
  les féculents de la recette (pommes de terre, riz, pâtes…). Un plat dont le nom contient déjà
  son féculent (« Tajine… et pommes de terre », « Penne au poulet ») n'en reçoit pas.

## Décisions délibérées (ne pas re-signaler en review)
- Les quantités sont mises à l'échelle depuis `parts_origine` vers 4 parts à l'affichage et dans les courses.
- Aucune mention de congélation dans l'app (retiré à la demande de l'utilisateur).
- Aucun indicateur « poisson gras » en tête d'écran (retiré : incompris). Le tag reste sur la fiche recette.
- La liste de courses agrège par unité : un ingrédient en « g » et en « pièce » affiche les deux (`300 g + 2`).

## Orientation commerciale (long terme)
Si un jour commercialisé : cible particuliers / TPE-PME (familles, indépendants), jamais grands comptes.
Défaut, pas une contrainte dure.
