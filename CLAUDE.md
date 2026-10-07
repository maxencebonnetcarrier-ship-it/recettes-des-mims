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
- `test_guetteur.py` — guetteur des envies (sans réseau) : quelles envies chercher, recherche dans les plans de
  site, choix et refus, note des lecteurs, montée de version, lecture du hub (faux hub `test_hub.py`), suivi
  écrit sur le hub.
- `test_suivi_envies.js` — suivi du guetteur dans Réglages › Mes envies : un état par envie de plat, dernier
  passage du PC, champ « guetteur » reçu mais JAMAIS renvoyé par le téléphone. v41 : envie reliée par le PC à
  une recette au titre différent (statut et menu), ingrédient exclu signalé, pluriels. Noms de plats FICTIFS exprès :
  un vrai nom finirait par entrer dans la base (ajouté par le guetteur) et le test, devenu rouge, bloquerait
  toute publication du guetteur (constaté le 05/10).
- `test_envies.js` — envie d'un ingrédient : propositions, plat au menu le jour choisi (ou la semaine
  prochaine si le jour est passé), « Changer » garde l'ingrédient, un vrai nom de plat reste imposé,
  et un plat demandé pour un jour passé est imposé ce jour-là la semaine prochaine.
- `test_demandes.js` — plat demandé pour un jour qui arrive dans la base (v45) : imposé ce jour-là seul, reste du
  menu et cases cochées intacts, jour passé non touché. `test_promos.js` — promos (v45) : patate douce proposée
  en accompagnement à chaque tirage et étiquetée « Promo », ajout sur un menu existant, ↻, jour passé.
- `test_accompagnement.js` — « Version avec … » de l'accompagnement (v46) : féculents du plat barrés, ingrédients
  pour 4 parts et étapes, bouton pour la prendre. `test_fait_le.js` — « Je l'ai fait » avec une date dans
  Recettes (v46) : historique, note, doublon et date à venir refusés, plat prévu du jour non marqué à tort.
- `test_doublons.js` — jamais deux fois le même plat dans la semaine (v47) : styles qui se recoupent (volaille
  lundi, sport vendredi), repli quand un style n'a plus rien de neuf, « ↻ Changer », S+1 devenue le menu avec un
  plat imposé déjà prévu un autre jour.
- v48 : `test_changer.js` (« ↻ Changer » sans revenir sur un plat déjà proposé, « Peu importe » compris ; nouveaux menus
  variés ; un favori noté 5/5 sort plus souvent), `test_retrait.js` (✕ = retiré de la recette seule, « Remettre »,
  alerte d'exclusion levée, partage avec l'autre téléphone par un faux hub), `test_quantites.js` (règle d'arrondi, et
  toutes les quantités de l'onglet Recettes : 426 mal arrondies en v47), `test_boucher.js` (morceau conseillé ou
  repris, rien pour la charcuterie, conseil dans les courses et la liste copiée).

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
     - catégorie du CADRE, protéine (celle du titre d'abord ; rouget, morue, congre, poulpe… comptent comme
       poisson depuis la v44) ;
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
`lots/lot7_enrichissement.json` (07/10, demande « scrap moi beaucoup plus de recettes […] dans toutes les
catégories ») : un ajout BORNÉ, pas une aspiration. Par catégorie du cadre, au plus 70 pages lues dans les plans
de site (plus anciennes fiches d'abord, noms rapides d'abord pour les jours limités en durée). On n'a gardé que
les fiches notées au moins 4,2 sur 5 avis et plus, dans la durée du jour, qui passent les règles de
`ajouter_recette.py` et ne sont pas une variante d'un plat déjà en base. Relues à la main ensuite : entrées
(citrons farcis, pain de thon, flan…), charcuterie, gibier et omelettes en trop retirés. Bilan : 66 recettes,
base 73 → 139 (Volaille 10, Porc 9, Poisson 11, Légumineuses 12, Express 8, Mijoté 8, Rôti 8), toutes Marmiton.
`lots/lot8_glaneur.json` (07/10, « je veux que tu scrap bcp avec glaneur ») : même méthode, plus large. Au plus
250 pages lues par catégorie, aucune page relue d'une passe à l'autre. La note des lecteurs est lue sur la page
(Glaneur ne la rend pas), puis Glaneur extrait chaque recette retenue. Nouveaux filtres : pas d'entrée, de gibier
ni d'accompagnement de légumes, et au plus 3 plats du même genre (« côtes de… », « omelette… ») par catégorie.
Relues à la main : apéritifs, entrées et accompagnements retirés (20) ; deux tajines passés en Mijoté. Bilan :
96 recettes (91 Marmiton, 5 Journal des Femmes), base 139 → 235. Le porc rapide du mercredi est le plus maigre
(29 plats) : les fiches de porc en 35 min notées 4,2 et plus sont rares.

### Guetteur des envies (`guetteur.py`, 2026-10-04)
Choix de l'utilisateur : « il lit mes envies du téléphone, cherche la recette par son nom, l'ajoute et met en
ligne tout seul ». Une passe toutes les 30 min (tâche planifiée « Recettes des Mims - guetteur », posée par
`installer_guetteur.ps1`, retirée par `-Retirer`), lancée par pythonw, sans fenêtre :
- **lit les envies de PLATS** sur le hub (les envies d'ingrédient sont ignorées : la base les sert) et ne
  cherche que celles que la base ne retrouve pas déjà (même règle que `trouverRecette` d'`app.js`) ;
- **cherche le nom dans les plans de site** des 3 sites (les pages de recherche sont interdites aux robots),
  gardés 7 jours, puis lit au plus 6 pages candidates et prend la mieux notée par les lecteurs qui passe les
  règles de `ajouter_recette.py` ET dont le titre sera retrouvé par l'épingle du jour. Un lien fourni dans
  l'envie est pris tel quel (« recette demandée ») ; si son titre ne contient pas le nom écrit, la recette
  prend ce nom ;
- **plusieurs essais** (v41, choix du 05/10 : « faut essayer plusieurs recettes […] sinon mettre qu'il y a des
  ingrédients à exclure mais proposer la recette ») :
  1. adresses qui contiennent tous les mots du plat ;
  2. si aucune ne passe, et pour un nom d'au moins 3 mots, adresses à UN mot près (plat de base en tête
     d'abord) : au plus 12 pages lues, gardées seulement si le titre ou les ingrédients contiennent tous les
     mots, la mieux notée d'abord (« riz poivrons chorizos » → « Riz au chorizo », poivrons dans la fiche) ;
  3. toujours rien : la mieux placée des recettes refusées SEULEMENT pour un ingrédient exclu est ajoutée
     comme recette demandée (`"demande": true`), le statut dit « contient … ». L'app affiche « ⚠️ contient X,
     normalement exclu » sous l'envie : une telle recette n'est jamais tirée au sort, elle n'arrive au menu
     qu'imposée sur un jour.
  Le titre retenu peut donc différer du nom écrit : le statut `recette` du hub fait le lien
  (`recette_liee()` du guetteur, `trouverRecette()` de l'app, même ordre : titre exact, recette liée, nom).
  Les deux comparent les mots au singulier (« Escalopes poulets panées »). Pour un nom d'au moins 3 mots, ils
  acceptent aussi un titre à UN mot près si ce mot est dans les ingrédients (v43 : « Riz chorizo poivrons » →
  « Riz au chorizo ») ;
- **ajoute** à `lots/lot6_envies.json`, relève prix et calories, reconstruit `data.js`, monte la version,
  lance TOUS les tests, commite puis pousse. Un test rouge = rien de publié, fichiers remis en l'état ;
- **ne publie jamais** si le dossier a des modifications en cours (un humain ou un autre outil y travaille) ;
- **lancé par pythonw, sans console** : `sans_console()` envoie les sorties dans le vide. Avant la v43, la
  lecture Glaneur écrivait dans `sys.stderr` (`None`) et chaque passe planta les 06 et 07/10. Glaneur tourne
  sans fenêtre ;
- un plat introuvable ou refusé est retenté 24 h plus tard. Journal, plans et log :
  `%LOCALAPPDATA%\mims-guetteur` ;
- **écrit où en est chaque envie** sur le hub (v38), champ `guetteur` : `{ passe, envies: { nom normalisé :
  { etat, detail, recette, t, prochain } } }`, états `en_cours`, `attente`, `ajoutee`, `introuvable`,
  `refusee`, `erreur`. Il en est le SEUL auteur : `sync.js` le range dans `CHAMPS_LECTURE`, reçu mais jamais
  renvoyé. Réglages › Mes envies l'affiche sous chaque plat, avec « le PC a regardé tes envies il y a … »
  (alerte au-delà de 2 h ; le guetteur réécrit au moins toutes les 50 min tant qu'il y a des envies de plats).
  Il n'annonce « ajoutée » qu'une fois la nouvelle version servie par GitHub Pages (6 min au plus) ; le
  téléphone qui la voit sans avoir la recette se met à jour tout seul (`recupererAjouts`, un essai par 2 min) ;
- **réglages du PC**, jamais dans le dépôt public : `MIMS_HUB_URL` et `MIMS_HUB_TOKEN` (setx). Sans eux, il
  ne fait rien. Les envies n'arrivent au hub que si « Partage à deux » est activé sur le téléphone.
`python guetteur.py --plat "porc au caramel" --essai` cherche sans rien écrire. Tests : `test_guetteur.py`.
**Raccourci « Guetteur des Mim's »** du Bureau (`regler_guetteur.ps1`, posé par `installer_guetteur.ps1`) : la
1re fois, demande le mot de passe de partage (masqué), le vérifie auprès du hub et l'enregistre dans les deux
réglages ; l'adresse vient de `hub/DEPLOIEMENT.md`. Ensuite, montre les envies du hub et ce que le guetteur en
fera (`guetteur.py --apercu`), et propose de lancer la recherche tout de suite.

### Lancer les tests
- Navigateur : `node lancer_tests.mjs` (tous les `test_*.js`, `--sombre` pour clair PUIS sombre). playwright-core
  vient de Glaneur (`../glaneur` ou `%LOCALAPPDATA%\Glaneur\app`), le navigateur est Chrome ou Edge du PC.
- Python : `python test_ajouter_recette.py` (un SCRIPT, pas unittest : il se termine par sys.exit) et
  `python -m unittest -q test_guetteur`.

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
- **Anti-répétition par PROTÉINE** (et non par nom de recette) : pas plus de 2 fois dans la semaine. C'est la
  règle qui empêche « bavette / bourguignon / rôti de bœuf » trois soirs de suite. Deux jours de suite avec la
  même protéine sont PERMIS, sans avertissement (v43, choix du 07/10 : « on s'en fiche 2 jours de suite poisson
  par exemple, pas besoin d'alerter »).
- Pas deux fois la même recette sur 3 semaines. Le dernier menu affiché d'une semaine terminée compte
  d'office (champ `servis`, partagé par la synchro) : la règle ne dépend pas de « Marquer fait ».
  L'historique « Marquer fait » compte aussi, mais n'est jamais rempli automatiquement.
  Un plat déjà cuisiné CETTE semaine (« Marquer fait », « Je l'ai fait ») ne revient pas non plus dans un nouveau
  tirage de la même semaine (`interditesPour`, v48 ; avant, la fenêtre ne couvrait que les semaines passées).
- **Jamais deux fois le même plat dans la semaine** (v47) : `choisir` écarte les plats déjà posés les autres jours,
  repli compris. Avant, deux jours dont les styles se recoupent (volaille lundi, sport vendredi) pouvaient servir
  le même plat (cas du 07/10 : « Volaille aux endives et au curry » lundi et vendredi). Seule exception : deux
  jours où l'utilisateur a imposé le même plat.
- **Tirage varié** (v48, choix du 07/10 : « je tombe quasi toujours sur la même chose même quand je mets n'importe
  quoi ») : `choisir` tire AU SORT avec des chances pondérées (`tirerAuSort`) au lieu de prendre le mieux classé.
  Poids de base 1 ; promo +4, favori +2, note 4 et plus +2 (3 et plus +1), de saison +1, saveur pas encore servie
  +0,5 ; une note sous 2 divise les chances par 3. « ↻ Changer » ne revient pas sur un plat déjà proposé ce jour-là
  (champ `proposes` du plan, remis à zéro quand tout a été proposé) ; « Générer un nouveau menu » fait passer les
  plats du menu remplacé après les autres (`eviter`, jamais une interdiction).
- **Croix ✕ d'un ingrédient** (v48, choix du 07/10 : « ne devrait pas exclure complètement la recette mais juste
  l'enlever de la recette ») : l'ingrédient est retiré de CETTE recette (`state.retraits`, partagé par la synchro) :
  barré avec « Remettre », hors des courses, et il ne compte plus pour les exclusions (retirer les olives exclues du
  riz au chorizo lève son alerte). Exclure partout se fait dans Réglages › Exclusions.
- **Quantités arrondies** (v48, « 0,7 poivron ça veut rien dire ») : `arrondirQte`. À la pièce : entier, au moins 1 ;
  cuillères, verres, bouteilles : au demi ; g et ml : au 5 près au-delà de 50, 1 200 g affichés 1,2 kg ; cl : entier ;
  kg, l, dl : au dixième. Virgule décimale.
- **Chez le boucher** (v48, « toujours proposer la pièce du boucher quand c'est de la viande, comme le sauté de
  bœuf ») : `conseilBoucher`. Pièce principale = la viande du rayon Boucherie hors charcuterie, la plus lourde ;
  morceau nommé → repris ; sinon le morceau que nomme le titre suivi de sa viande (« Rouelle de porc »), sinon un
  conseil selon l'espèce et la cuisson (bœuf : rumsteck ou bavette pour saisir, paleron/macreuse/joue pour mijoter ;
  veau : noix ou sous-noix, épaule ou tendron, noix ou quasi ; porc : filet mignon ou filet, échine ou épaule ;
  agneau : côtelettes ou gigot, épaule ou collier ; pot-au-feu, tartare, haché à part). Sur la fiche du jour, dans
  Recettes, et dans les courses (« demande du rumsteck… »), liste copiée comprise.
- **Note depuis Recettes** (v48) : les étoiles sont sur chaque fiche, cuisinée ou non.
- Légumes de saison (saison déduite du mois courant).
- Pas deux fois la même saveur dominante dans la semaine.
- **Exclusions** : `EXCLUS_DEFAUT` (abats, **tomate crue**, champignon, sucré-salé) + celles que
  l'utilisateur ajoute dans Réglages (depuis la v48, la croix ✕ d'un ingrédient ne l'exclut plus : elle le retire
  de CETTE recette seulement, voir plus bas). Une recette contenant un exclu
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
      l'app (`EXCLUSIONS_RECETTE` d'`app.js`). Une exclusion « tomates » tapée dans Réglages reste littérale.
  - **Sucré-salé** : avant le 2026-10-03, le mot était cherché dans les noms d'ingrédients, donc il n'écartait
    jamais rien.
    - `sucre_sale()` refuse un plat (ou un accompagnement) qui contient du miel, un sirop, une confiture, un
      chutney, du pain d'épices, une sauce aigre-douce (v44) ou un fruit sucré (pomme, ananas, pruneau, abricot, orange…) ;
    - le **caramel et le sucre seul restent permis** (choix de l'utilisateur) ;
    - ne comptent pas : citron, coco, cidre, vinaigres, huiles, zeste, pomme de terre, poivron orange, tomates
      cerises (v43 : refusées à tort pour le mot « cerise » ; la règle de la tomate crue s'applique).
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
- **Plat demandé jamais servi** (v40) : au changement de semaine, l'épingle d'un plat qui vient d'une envie de
  plat encore notée pour ce jour, et qui n'a été ni servi (`servis`, menu) ni cuisiné (historique), est
  REPORTÉE (`purgerEpingles`) : ce jour cette semaine s'il n'est pas passé, sinon `Jour+1`. L'envie prend la
  semaine visée. Cas du 05/10 : « Gratin ravioles pour mardi » demandé un dimanche depuis une version
  antérieure à la v37, recette ajoutée par le guetteur le lundi ; la demande était effacée.
- **Plat demandé qui arrive dans la base** (v45, choix du 07/10) : un plat imposé sur un jour (envie de plat avec un
  jour, ou épingle reçue de l'autre téléphone) s'impose TOUT SEUL ce jour-là dès que sa recette est dans la base
  (`appliquerDemandesArrivees`, à l'affichage de Semaine et de Courses, et à la synchro), sans retirer au sort le
  reste du menu : les courses cochées restent justes. Jours passés et jours « fait » non touchés. Si le plat était
  déjà prévu un autre jour à venir, seul cet autre jour change. Ajouter une envie de plat pour un jour de cette
  semaine ne retire plus non plus toute la semaine au sort (`imposerJour`). `test_demandes.js`.
- **Promos** (v45, choix du 07/10 : « me les proposer obli dans la semaine même si c'est pour accompagnement […] en
  mettant que c'est promo dans l'affichage ») : chaque promo est proposée au moins une fois dans la semaine.
  Comparée comme un achat (« Patate douce » trouve « patates douces » ; avant, non). Dans l'ordre : un plat ou un
  accompagnement du menu qui en contient déjà (le tirage favorise les plats en promo, `pickSide` les accompagnements
  en promo), sinon un accompagnement qui en contient proposé un jour dont le plat l'accepte (ni le menu ni les
  courses ne changent), sinon un plat qui en contient sur un jour libre. Une promo ajoutée s'applique tout de suite à
  la semaine en cours. Étiquette « Promo » sur le plat et sur l'accompagnement ; Réglages › Promos dit où chacune
  est au menu, ou qu'aucun plat ni accompagnement n'en contient. `promosVues` (dans la semaine) : changer
  l'accompagnement à la main ne la fait pas revenir de force. `test_promos.js`.
- **Version avec l'accompagnement** (v46, choix du 07/10 : « recette alternative avec l'accompagnement en idée en
  ajustant avec la recette de base ») : dans « Ingrédients, étapes & source » d'un jour, une « Version avec … »
  dépliable barre les féculents du plat qu'il remplace (avec leur quantité), donne ses ingrédients pour 4 parts
  (« aussi dans le plat » quand l'achat est commun) et ses étapes, et un bouton la prend (courses). Prise, elle est
  affichée d'office.
  Féculent (ce que l'accompagnement remplace, dans la version et dans les courses) : plus « pâte de curry »,
  « purée de tomate », « fécule » ni « pâte feuilletée » (`PAS_FECULENT`, v46) ; avant, prendre l'accompagnement
  les retirait des courses.
- **« Je l'ai fait » dans Recettes** (v46, choix du 07/10 : « mettre déjà fait avec la date si je l'ai pas fait
  dans la semaine comme le gratin ravioles, puis pouvoir le noter ») : chaque fiche a un champ de date (aujourd'hui
  par défaut, jamais dans le futur) et « ✓ Je l'ai fait ». L'entrée va dans l'historique (année, semaine, jour de
  cette date), puis la fiche dit « Cuisiné le mardi 6 oct. » et montre les étoiles. Le plat ne revient pas avant
  3 semaines. L'historique reconnaît désormais un plat cuisiné à son NOM (`estFait(semaine, jour, nom)`) : un autre
  plat noté le même jour ne fait plus paraître cuisiné le plat prévu.
- **Titres** : `nettoyer_nom` (build_data.py) retire aussi « : la recette » (Journal des Femmes) et met une
  majuscule initiale (fiches Marmiton en minuscules). Aucun nom déjà en base n'en a été changé (05/10).
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
  Depuis la v48, CHOISIR un autre accompagnement (↻, ou la liste « Choisir un autre accompagnement ») le prend :
  il entre dans la recette (une seule liste d'ingrédients, ses étapes dans la préparation) et dans les courses.

## Décisions délibérées (ne pas re-signaler en review)
- Les quantités sont mises à l'échelle depuis `parts_origine` vers 4 parts à l'affichage et dans les courses.
- Aucune mention de congélation dans l'app (retiré à la demande de l'utilisateur).
- Aucun indicateur « poisson gras » en tête d'écran (retiré : incompris). Le tag reste sur la fiche recette.
- La liste de courses agrège par unité : un ingrédient en « g » et en « pièce » affiche les deux (`300 g + 2`).

## Orientation commerciale (long terme)
Si un jour commercialisé : cible particuliers / TPE-PME (familles, indépendants), jamais grands comptes.
Défaut, pas une contrainte dure.
