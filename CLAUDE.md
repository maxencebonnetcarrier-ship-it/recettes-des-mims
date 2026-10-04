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
- `ajouter_recette.py` — ajoute une recette à un lot : Glaneur lit la page, le script complète catégorie,
  protéine, saison, rayons et cuissons (voir « Ajouter une recette »). Testé par `test_ajouter_recette.py`.
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
- `test_exclusions.js` — « tomate crue » et « sucré-salé » (v35) : tomate cuite permise, tomate crue et
  sucré-salé écartés par leur champ, ancienne exclusion « tomate » = « tomate crue », champignons toujours
  écartés. Remet les exclusions de l'appareil à la fin.
- `test_theme.js` — réglage Réglages › Apparence (Auto / Clair / Sombre) : à lancer téléphone en clair
  PUIS en sombre. L'apparence est un réglage de l'appareil (clé `mims_theme`), hors synchro ;
  `index.html` la relit avant la feuille de style. Le test remet « Auto » à la fin.
- `test_suivante.js` — semaine suivante (S+1) : menu préparé d'avance sans les plats de la semaine, actions
  sur S+1 seulement, jours « S+1 » dans Courses, menu repris tel quel le lundi, cases datées par semaine.
- `test_envies.js` — envie d'un ingrédient : propositions, plat au menu le jour choisi (ou la semaine
  prochaine si le jour est passé), « Changer » garde l'ingrédient, un vrai nom de plat reste imposé,
  et un plat demandé pour un jour passé est imposé ce jour-là la semaine prochaine.

## Provenance des recettes
Récupérées depuis **3 sites spécialisés uniquement** : marmiton.org, saveurs-magazine.fr,
cuisine.journaldesfemmes.fr. Chaque recette porte son `url` source réelle, affichée dans l'app.
Les lots 1 à 4 viennent de Firecrawl (extraction par IA). Les ajouts suivants viennent de **Glaneur**
(`glaneur recettes`, dépôt voisin `../glaneur`), gratuit et sans IA : il lit la fiche recette schema.org
de la page et ne devine rien.
Écarts constatés le 2026-10-03 entre les lots Firecrawl et les pages sources (glaneur/bench/README.md §13-14) :
- 108 quantités « 1 pincée » ajoutées là où la page ne chiffre pas ;
- des temps et des nombres de parts différents ;
- étapes reformulées ;
- 4 recettes dont la page contient un ingrédient exclu par défaut, retiré du lot :
  - bourguignon, blanquette et coq au vin : les champignons. Le retrait est voulu, ces recettes portent
    l'étiquette « sans champignons » ;
  - émincé au basilic : la tomate, retirée sans étiquette. C'est fidèle : la page la donne en option (« Vous pouvez
    agrémenter d'ail émincé et de cubes de tomates »).

**Exception — recettes DEMANDÉES** (`"demande": true`, cf. `lots/lot2_demandes.json`) : quand
l'utilisateur fournit lui-même un lien, **n'importe quelle source est acceptée** (ex. maspatule.com
pour les enchiladas). Ces recettes contournent deux contrôles : catégorie hors du CADRE, et présence
d'un ingrédient exclu par défaut. L'app le signale à l'écran quand le plat est imposé sur un jour.
La règle des 3 sites reste entière pour les recettes que Claude cherche de sa propre initiative.

### Ajouter une recette
1. `python ajouter_recette.py <url> [<url>…] --lot lots/lot5_ajouts.json`
   - **Glaneur** lit la page : nom, temps, parts, ingrédients chiffrés (quantité + unité), étapes, niveau de prix,
     photo, vidéo. Il est cherché dans la variable `GLANEUR`, puis dans la commande `glaneur` installée, puis dans
     `../glaneur`.
   - **Le script complète** ce qu'aucune page n'écrit, par des règles fixes, et AFFICHE chaque déduction :
     - catégorie du CADRE, protéine (celle du titre d'abord) ;
     - saison : « Toute l'année » sauf légume de saison ou barbecue dans le titre ;
     - rayon de chaque ingrédient : celui qu'il a déjà dans les lots, sinon une liste de mots ;
     - modes de cuisson (lus dans les étapes), étiquettes poisson gras / maigre / végé.
   - **Options** : `--cat`, `--proteine` et `--saison` imposent une valeur, `--essai` montre sans écrire, et
     `--demande` marque une recette demandée (lien fourni par l'utilisateur).
   - **Refus** : il refuse ce que `build_data.py` refuserait, et les doublons. Les calories de Glaneur ne sont
     pas reprises.
   - Mesure sur les 69 plats des lots 1 à 4 : mêmes protéines 68/69, mêmes catégories 60/69 (les 9 autres :
     « Rapide (sport) » contre Volaille ou Poisson, un choix), mêmes rayons 473/475 sans même consulter les lots. Les apartés entre parenthèses de l'auteur sortent du nom d'achat.
2. `python prix_kcal.py <dossier_des_lots> --ecrire` (prix et calories, Marmiton seulement)
3. `python build_data.py <dossier_des_lots> data.js`
4. Le script valide : URL réelle, ingrédients non vides, catégorie dans le CADRE, protéine renseignée,
   aucun ingrédient exclu par défaut, pas de sucré-salé, prix et calories exploitables. Il affiche la
   couverture par jour.
`test_ajouter_recette.py` (sans réseau) vérifie la complétion, les refus et l'écriture du lot.
Usage permis : une recette à la fois, à la demande. Les conditions de Marmiton, du Journal des Femmes et de
Saveurs interdisent d'aspirer leur site entier pour le republier, ce que ferait ce dépôt public.

### Prix et calories (v33)
Relevés sur la page source, jamais estimés. Seul Marmiton publie les deux : niveau de prix (« Bon
marché » → €, « Moyen » → €€, « Assez cher » → €€€) et calories par part (JSON-LD `nutrition`). Le
Journal des Femmes affiche un chiffre en kcal sans dire s'il est par part ou pour 100 g : non repris.
Les calories Marmiton sont calculées pour SON nombre de parts : `prix_kcal.py` les ramène aux
`parts_origine` de la recette, et les écarte quand le site n'a pas pesé l'ingrédient principal
(part < 150 g pour un plat, < 40 g pour un accompagnement) ou que le total est hors de toute assiette
(> 1500 kcal ou part > 1 kg ; > 500 g pour un accompagnement).
En tête de la Semaine (v34), un résumé compte les plats €, €€, €€€ et donne les calories moyennes
par part des PLATS SEULS (un accompagnement ajouté remplace souvent un féculent dont la part dans
le chiffre de la source est inconnue). Il dit « N sans prix » et « sur N plats » quand il en manque.

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
- **Exclusions** : `EXCLUS_DEFAUT` (abats, **tomate crue**, champignon, sucré-salé) + celles que
  l'utilisateur ajoute dans Réglages ou via la croix ✕ sur un ingrédient. Une recette contenant un exclu
  n'est JAMAIS proposée, et disparaît du menu en cours si l'exclusion est ajoutée après coup.
  Une exclusion ordinaire est un MOT cherché dans les noms d'ingrédients (« champignon » écarte les
  champignons cuits comme crus).
  Deux exclusions ne sont le nom d'aucun ingrédient. `build_data.py` les reconnaît sur la recette entière
  (`exclus_par_defaut()`, reprise par `ajouter_recette.py`), refuse les plats concernés, et pour une recette
  demandée pose un champ que l'app lit : `tomate_crue` ou `sucre_sale`, avec la liste des ingrédients en cause.
  - **Tomate crue** (v35, choix de l'utilisateur du 2026-10-03 : « sans tomate crue mais sans champi ») :
    - la tomate **cuite** est permise : concentré, coulis, sauce, pelées, ou tomate fraîche cuite ensuite
      dans la recette ;
    - est crue une tomate fraîche dans un plat sans cuisson, ajoutée après la dernière cuisson, dite « crue »
      ou « au moment de servir », ou jamais citée dans les étapes ;
    - l'ancienne exclusion « tomate », enregistrée sur les téléphones et le hub, vaut « tomate crue » dans
      l'app (`EXCLUSIONS_RECETTE` d'`app.js`). Une croix ✕ sur un ingrédient « tomates » reste littérale.
  - **Sucré-salé** : avant le 2026-10-03, le mot était cherché dans les noms d'ingrédients, donc il n'écartait
    jamais rien.
    - `sucre_sale()` refuse un plat (ou un accompagnement) qui contient du miel, un sirop, une confiture, un
      chutney, du pain d'épices ou un fruit sucré (pomme, ananas, pruneau, abricot, orange…) ;
    - le **caramel et le sucre seul restent permis** (choix de l'utilisateur) ;
    - ne comptent pas : citron, coco, cidre, vinaigres, huiles, zeste, pomme de terre, poivron orange.
    - Vérifié sur Marmiton : « Escalopes de dinde au caramel » acceptée ; « Poulet soy mielleux », dinde à
      l'ananas, wrap à la pomme refusés.

  Une recette demandée (`"demande": true`) passe la construction, comme pour les autres exclusions. Aucune
  recette des lots 1 à 5 n'est touchée par ces deux règles. `test_exclusions.js` vérifie l'app,
  `test_ajouter_recette.py` la construction.
- **Liste de courses** (v33) : un article = un ACHAT (singulier/pluriel, « gousses d'ail » = « ail »,
  variantes listées dans `MEME_ACHAT_BRUT` d'`app.js`), rangé dans son rayon le plus fréquent.
  Filtre par jour (réglage de l'appareil, clé `mims_courses_jours`, oublié au changement de semaine).
  Une case par article ET par jour : l'ail coché pour mercredi reste à acheter pour jeudi.
  Depuis la v36, chaque case porte aussi le RANG de sa semaine : avant, rien ne remettait la liste à zéro,
  et l'ail coché un lundi paraissait acheté tous les lundis suivants.
- **Semaine suivante** (v36) : onglet Semaine › « Semaine prochaine » prépare le menu S+1 (champ `suivante`,
  partagé par la synchro). Il exclut les plats de la semaine courante, et inversement. Le lundi venu, il
  DEVIENT le menu au lieu d'un nouveau tirage, pour que les courses faites d'avance restent justes.
  Dans Courses, une 2e rangée de jours « S+1 » se combine avec la 1re.
- **Plat imposé pour un jour déjà passé** (v37) : une envie de plat avec un jour antérieur à aujourd'hui
  vise ce jour de la semaine PROCHAINE (épingle sous la clé `Mar+1`, envie avec `an`/`num`). Elle
  s'applique au menu S+1 (seul ce jour change s'il est déjà préparé), la semaine en cours n'est pas
  touchée, et le lundi venu elle devient l'épingle du jour. Avant, le plat s'imposait sur le jour passé,
  toute la semaine était re-tirée, et il n'était jamais servi.
- **Envie d'un ingrédient** (v36, Réglages › Mes envies) : un mot présent dans les ingrédients de la base
  (« poireaux ») met au menu un plat qui en contient, le jour choisi ou un des jours qui restent. Ce n'est
  pas une épingle : style du jour, anti-répétition et exclusions sont respectés (style relâché seulement
  si un jour précis est demandé et qu'aucun plat de son style n'en contient). Elle vise cette semaine si
  le jour n'est pas passé, sinon S+1, et s'efface après. Un titre exact, ou un nom de plusieurs mots
  qui ne désigne qu'un plat, reste une demande de plat (épingle), comme avant.
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
