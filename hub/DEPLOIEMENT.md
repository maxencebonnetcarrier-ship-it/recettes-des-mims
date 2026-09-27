# Activer le partage entre Marine et toi

**Le hub est déjà créé, enregistré et déployé.** Il ne reste qu'une chose : poser le mot de passe.

- Adresse du hub (à coller dans l'app, sur les deux téléphones) :
  `https://script.google.com/macros/s/AKfycbxHFD9nePJRGVfBRTbLMkfs4Q4EdlBY62tcdmoV4xQnoN2HBAe_Kvk_UBDdEU_mlE8-NA/exec`
- Éditeur du script :
  https://script.google.com/home/projects/1qwZLFxXHYYUsMJphZMZGK8V-5sZ5FSH8Z3MRFgdgjAqQoFmUIXw3qr9J/edit

---

## 1. Poser le mot de passe (une seule fois, ~20 s)

Le mot de passe **ne vit pas dans le code** (le dépôt est public) : il est rangé dans les
réglages du script. C'est toi qui le tapes — c'est la seule action que Claude ne peut pas faire.

1. Ouvre l'éditeur (lien ci-dessus) → icône **⚙️ Paramètres du projet** (colonne de gauche).
2. Descends jusqu'à **Propriétés du script** → **Ajouter une propriété du script**.
3. *Propriété* : `SECRET_TOKEN` — *Valeur* : un mot de passe long de ton choix.
4. **Enregistrer les propriétés**.

Pas besoin de redéployer : le script relit la valeur à chaque appel. Changer le mot de passe
plus tard = refaire ces 4 étapes + reconnecter les deux téléphones.

## 2. Connecter les deux téléphones

Sur **chaque** téléphone (le tien et celui de Marine) :

5. Ouvre l'app → onglet **⚙️ Réglages** → section **🔗 Partage à deux**.
6. Champ *Adresse du hub (…/exec)* : colle l'adresse ci-dessus.
7. Champ *Mot de passe partagé* : tape le mot de passe de l'étape 3.
   ⚠️ **Exactement le même des deux côtés**, majuscules comprises.
8. **Connecter**. L'en-tête doit afficher **🔗 partagé**.

Le premier téléphone connecté pousse ses données dans le hub ; le second les récupère sans
écraser les siennes (fusion champ par champ, le plus récent gagne).

---

## Ce qui devient commun
Le menu de la semaine, la liste de courses (cochée en direct à deux), les notes ★, les favoris,
les exclusions, les promos, le cadre jour par jour, l'historique et les envies.

## Bon à savoir
- **Gratuit**, dans les quotas Google Apps Script (très loin d'être atteints à deux).
- La synchro se fait à l'ouverture de l'app, au retour dessus, et toutes les 20 secondes.
- **Hors-ligne** : l'app continue de marcher ; les modifications partent à la prochaine connexion.
- **Si vous modifiez la même chose en même temps** : le plus récent gagne. Sauf pour les cases de
  courses, fusionnées une par une — vous pouvez cocher à deux en magasin sans rien perdre (vérifié).
- L'URL est publique mais inutilisable sans le mot de passe : sans lui, le hub répond
  `{"ok":false,"error":"token"}` (vérifié).
- Pour repartir de zéro : lancer la fonction `_reinitialiser` depuis l'éditeur.
