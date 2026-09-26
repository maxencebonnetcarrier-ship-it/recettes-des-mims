# Activer le partage entre Marine et toi (≈ 3 min de clics)

Même principe que ton hub de la todo. Je ne peux pas le faire à ta place : c'est **ton compte Google**.
Tu fais les clics ci-dessous, tu me donnes l'URL, je vérifie tout depuis ici.

---

## 1. Créer le script

1. Va sur **https://script.google.com** → **Nouveau projet**.
2. Renomme le projet en haut à gauche : `Hub Recettes des Mim's`.
3. Efface tout le contenu de `Code.gs`.
4. Copie-colle **tout** le contenu du fichier `hub/Code.gs` de ce dossier.

## 2. Choisir votre mot de passe

5. Tout en haut, ligne `var SECRET_TOKEN = "CHANGE_MOI_avec_un_secret_long";`
   Remplace par un mot de passe long, par exemple :
   `var SECRET_TOKEN = "mims-cuisine-4Kp92x";`
   **Retiens-le** : Marine et toi le taperez dans l'app.
6. Clique 💾 **Enregistrer**.

## 3. (Facultatif, 20 s) vérifier que ça marche

7. En haut, choisis la fonction **`_testHub`** → **Exécuter**.
8. Autorise l'accès quand Google le demande (ton propre compte, c'est normal).
9. Menu **Exécution / Journaux** : tu dois voir deux lignes contenant `"ok":true`.

## 4. Publier

10. Bouton **Déployer** → **Nouveau déploiement**.
11. Icône ⚙️ (à côté de « Sélectionner le type ») → **Application Web**.
12. Réglages :
    - *Description* : `hub recettes`
    - *Exécuter en tant que* : **Moi**
    - *Qui a accès* : **Tout le monde**
      (c'est le mot de passe qui protège, pas Google — l'URL seule ne suffit pas.)
13. **Déployer** → autorise si Google redemande.
14. Copie l'**URL de l'application Web** (elle finit par `/exec`).

## 5. Connecter vos deux téléphones

15. Sur **chaque** téléphone : ouvre l'app → onglet **⚙️ Réglages** → section **🔗 Partage à deux**.
16. Colle l'**URL** et le **mot de passe** (les mêmes des deux côtés) → **Connecter**.
17. L'en-tête doit afficher **🔗 partagé**.

**Envoie-moi l'URL et le mot de passe** : je teste depuis ici (écriture, lecture, refus sans mot de passe)
et je te confirme que c'est bon.

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
- Changer le mot de passe = éditer `SECRET_TOKEN`, **redéployer**, et reconnecter les deux téléphones.
- Pour repartir de zéro : lancer la fonction `_reinitialiser` depuis l'éditeur.
