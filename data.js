/* Base de recettes + cadre de règles — source : Google Sheet "Recettes des Mim's" */
window.RECIPES = [
  // Volaille
  { nom: "Poulet à la moutarde", cat: "Volaille", piece: "Hauts de cuisse / suprêmes", type: "Poêlé", min: 25, saison: "Toute l'année", tags: [], ingr: ["poulet","moutarde","crème","oignon"] },
  { nom: "Poulet curry coco", cat: "Volaille", piece: "Hauts de cuisse", type: "Sauté", min: 30, saison: "Toute l'année", tags: [], ingr: ["poulet","lait de coco","curry","oignon"] },
  { nom: "Émincé de dinde crème & poireaux", cat: "Volaille", piece: "Escalope de dinde", type: "Poêlé", min: 20, saison: "Automne-hiver", tags: [], ingr: ["dinde","poireaux","crème"] },
  { nom: "Cuisses de poulet rôties, légumes racines", cat: "Volaille", piece: "Cuisses de poulet", type: "Four", min: 45, saison: "Automne-hiver", tags: [], ingr: ["poulet","carottes","panais","pommes de terre","oignon"] },
  { nom: "Suprêmes de pintade au cidre", cat: "Volaille", piece: "Suprêmes de pintade", type: "Poêlé", min: 30, saison: "Automne", tags: [], ingr: ["pintade","cidre brut","crème","oignon"] },
  { nom: "Escalopes de poulet panées", cat: "Volaille", piece: "Filets de poulet", type: "Poêlé", min: 20, saison: "Toute l'année", tags: [], ingr: ["poulet","chapelure","œuf","citron"] },
  // Légumineuses
  { nom: "Lentilles tièdes au maquereau fumé", cat: "Légumineuses", piece: "Maquereau fumé", type: "Rapide", min: 25, saison: "Toute l'année", tags: ["poisson gras"], ingr: ["lentilles","maquereau fumé","échalote","moutarde","mâche"] },
  { nom: "Dahl de lentilles corail coco", cat: "Légumineuses", piece: "—", type: "Mijoté court", min: 30, saison: "Toute l'année", tags: ["végé"], ingr: ["lentilles corail","lait de coco","oignon","ail","gingembre","curry"] },
  { nom: "Petit salé aux lentilles", cat: "Légumineuses", piece: "Palette / échine demi-sel", type: "Mijoté", min: 90, saison: "Hiver", tags: ["charcuterie"], ingr: ["porc demi-sel","saucisse","lentilles","carottes","oignon"] },
  { nom: "Curry de pois chiches coco-épinards", cat: "Légumineuses", piece: "—", type: "Sauté", min: 30, saison: "Toute l'année", tags: ["végé"], ingr: ["pois chiches","épinards","lait de coco","curry","oignon"] },
  { nom: "Salade pois chiches & sardines", cat: "Légumineuses", piece: "Sardines à l'huile", type: "Rapide", min: 15, saison: "Été", tags: ["poisson gras"], ingr: ["pois chiches","sardines","oignon rouge","persil","citron"] },
  // Porc
  { nom: "Filet mignon moutarde à l'ancienne", cat: "Porc", piece: "Filet mignon", type: "Poêlé", min: 30, saison: "Toute l'année", tags: [], ingr: ["porc","moutarde","crème"] },
  { nom: "Côtes de porc charcutière", cat: "Porc", piece: "Côtes premières / échine", type: "Poêlé", min: 25, saison: "Toute l'année", tags: [], ingr: ["porc","oignon","cornichons","moutarde","vin blanc"] },
  { nom: "Échine de porc au four & pommes de terre", cat: "Porc", piece: "Échine", type: "Four", min: 60, saison: "Automne-hiver", tags: [], ingr: ["porc","pommes de terre","oignon","thym"] },
  { nom: "Échine de porc grillée aux herbes", cat: "Porc", piece: "Échine en tranches", type: "Grill", min: 20, saison: "Toute l'année", tags: [], ingr: ["porc","thym","romarin","ail"] },
  { nom: "Saucisses de Toulouse & purée", cat: "Porc", piece: "Saucisse de Toulouse", type: "Poêlé", min: 25, saison: "Toute l'année", tags: ["charcuterie"], ingr: ["saucisse","pommes de terre","lait","beurre"] },
  { nom: "Sauté de porc au cidre brut", cat: "Porc", piece: "Échine", type: "Sauté", min: 35, saison: "Automne", tags: [], ingr: ["porc","cidre brut","oignon","crème"] },
  // Poisson
  { nom: "Maquereaux au four moutarde", cat: "Poisson", piece: "Maquereaux / filets", type: "Four", min: 25, saison: "Toute l'année", tags: ["poisson gras"], ingr: ["maquereau","moutarde","citron"] },
  { nom: "Saumon en papillote", cat: "Poisson", piece: "Pavé de saumon", type: "Four", min: 20, saison: "Toute l'année", tags: ["poisson gras"], ingr: ["saumon","citron","aneth","poireau"] },
  { nom: "Sardines grillées", cat: "Poisson", piece: "Sardines fraîches", type: "Grill", min: 15, saison: "Été", tags: ["poisson gras"], ingr: ["sardines","citron","persil"] },
  { nom: "Harengs pommes à l'huile", cat: "Poisson", piece: "Harengs fumés", type: "Rapide", min: 20, saison: "Automne-hiver", tags: ["poisson gras"], ingr: ["harengs fumés","pommes de terre","oignon"] },
  { nom: "Cabillaud en papillote citron-fenouil", cat: "Poisson", piece: "Dos de cabillaud", type: "Four", min: 25, saison: "Toute l'année", tags: ["maigre"], ingr: ["cabillaud","fenouil","citron"] },
  { nom: "Lieu noir beurre citronné", cat: "Poisson", piece: "Filet de lieu noir", type: "Poêlé", min: 20, saison: "Toute l'année", tags: ["maigre"], ingr: ["lieu noir","beurre","citron","câpres"] },
  { nom: "Parmentier de poisson", cat: "Poisson", piece: "Cabillaud / lieu", type: "Four", min: 45, saison: "Automne-hiver", tags: ["maigre"], ingr: ["cabillaud","pommes de terre","lait","beurre"] },
  // Rapide (sport)
  { nom: "Bavette à l'échalote", cat: "Rapide (sport)", piece: "Bavette d'aloyau", type: "Poêlé", min: 15, saison: "Toute l'année", tags: [], ingr: ["bœuf","échalote","beurre","vin rouge"] },
  { nom: "Tartare de bœuf", cat: "Rapide (sport)", piece: "Tende de tranche / rumsteck", type: "Cru", min: 15, saison: "Toute l'année", tags: [], ingr: ["bœuf","échalote","câpres","cornichons","œuf","moutarde"] },
  { nom: "Wok de bœuf & légumes", cat: "Rapide (sport)", piece: "Rumsteck / araignée", type: "Wok", min: 20, saison: "Toute l'année", tags: [], ingr: ["bœuf","poivrons","carottes","oignon","sauce soja","gingembre"] },
  { nom: "Burger maison", cat: "Rapide (sport)", piece: "Haché de paleron", type: "Poêlé", min: 20, saison: "Toute l'année", tags: [], ingr: ["bœuf haché","pain burger","cheddar","salade","oignon"] },
  { nom: "Brochettes d'agneau, semoule", cat: "Rapide (sport)", piece: "Gigot", type: "Grill", min: 20, saison: "Printemps-été", tags: [], ingr: ["agneau","semoule","poivron","oignon","cumin"] },
  { nom: "Entrecôte grillée, frites au four", cat: "Rapide (sport)", piece: "Entrecôte", type: "Grill", min: 20, saison: "Toute l'année", tags: [], ingr: ["bœuf","pommes de terre"] },
  // Mijoté
  { nom: "Bœuf bourguignon", cat: "Mijoté", piece: "Paleron / joue", type: "Mijoté", min: 180, saison: "Automne-hiver", tags: ["sans champignons"], ingr: ["bœuf","vin rouge","lardons","oignons grelots","carottes"] },
  { nom: "Blanquette de veau", cat: "Mijoté", piece: "Tendron / épaule", type: "Mijoté", min: 120, saison: "Toute l'année", tags: ["sans champignons"], ingr: ["veau","carottes","poireau","crème","œuf"] },
  { nom: "Tajine d'agneau citron confit & olives", cat: "Mijoté", piece: "Collier / épaule", type: "Mijoté", min: 120, saison: "Automne-hiver", tags: [], ingr: ["agneau","citron confit","olives vertes","oignon","épices"] },
  { nom: "Joues de porc au cidre", cat: "Mijoté", piece: "Joues de porc", type: "Mijoté", min: 150, saison: "Automne-hiver", tags: [], ingr: ["porc","cidre brut","oignon","carottes"] },
  { nom: "Bœuf aux carottes", cat: "Mijoté", piece: "Gîte / paleron", type: "Mijoté", min: 180, saison: "Automne-hiver", tags: [], ingr: ["bœuf","carottes","oignon","vin blanc"] },
  { nom: "Pot-au-feu", cat: "Mijoté", piece: "Plat de côtes, jarret, gîte, os à moelle", type: "Mijoté", min: 210, saison: "Hiver", tags: [], ingr: ["bœuf","carottes","poireaux","navets","pommes de terre","os à moelle"] },
  { nom: "Chou farci", cat: "Mijoté", piece: "Chair à saucisse / échine hachée", type: "Mijoté", min: 120, saison: "Hiver", tags: [], ingr: ["porc","chou vert","carottes","oignon","lardons"] },
  { nom: "Jarret de veau braisé au vin blanc", cat: "Mijoté", piece: "Jarret de veau", type: "Mijoté", min: 120, saison: "Automne-hiver", tags: [], ingr: ["veau","vin blanc","carottes","oignon","citron"] },
  { nom: "Coq au vin", cat: "Mijoté", piece: "Coq / cuisses de poulet", type: "Mijoté", min: 150, saison: "Automne-hiver", tags: ["volaille","sans champignons"], ingr: ["coq","vin rouge","lardons","oignons grelots","carottes"] },
  { nom: "Poule au pot", cat: "Mijoté", piece: "Poule", type: "Mijoté", min: 180, saison: "Automne-hiver", tags: ["volaille"], ingr: ["poule","carottes","poireaux","navets","riz"] },
  // Rôti
  { nom: "Épaule d'agneau confite", cat: "Rôti", piece: "Épaule d'agneau", type: "Four", min: 240, saison: "Toute l'année", tags: [], ingr: ["agneau","ail","thym","pommes de terre"] },
  { nom: "Rôti de porc ail & romarin", cat: "Rôti", piece: "Longe / échine", type: "Four", min: 90, saison: "Toute l'année", tags: [], ingr: ["porc","ail","romarin","pommes de terre"] },
  { nom: "Poulet rôti du dimanche", cat: "Rôti", piece: "Poulet fermier", type: "Four", min: 90, saison: "Toute l'année", tags: ["volaille"], ingr: ["poulet","pommes de terre","ail","thym"] },
  { nom: "Rôti de veau", cat: "Rôti", piece: "Noix / quasi", type: "Four", min: 75, saison: "Toute l'année", tags: [], ingr: ["veau","carottes","oignon"] },
];

/* Cadre : contrainte par jour */
window.CADRE = [
  { jour: "Lun", cats: ["Volaille"], maxMin: 30, note: "Rapide (≤ 30 min)" },
  { jour: "Mar", cats: ["Légumineuses"], maxMin: null, note: "Légumineuses / semi-végé — porte le poisson gras si jeudi maigre" },
  { jour: "Mer", cats: ["Porc"], maxMin: 30, note: "≤ 30 min" },
  { jour: "Jeu", cats: ["Poisson"], maxMin: null, note: "Poisson (gras ou maigre)" },
  { jour: "Ven", cats: ["Rapide (sport)"], maxMin: 20, note: "≤ 20 min, riche en protéines (retour du sport)" },
  { jour: "Sam", cats: ["Mijoté"], maxMin: null, note: "8 parts : 4 au congel" },
  { jour: "Dim", cats: ["Mijoté","Rôti"], maxMin: null, note: "8 parts : 4 au congel" },
];

/* Ingrédients exclus (mot-clé recherché dans les ingrédients) */
window.EXCLUS = ["abats", "tomate", "champignon", "sucré-salé"];

/* Saveurs dominantes détectées pour l'anti-répétition intra-semaine */
window.SAVEURS = ["moutarde", "cidre", "curry", "coco", "vin rouge", "vin blanc"];
