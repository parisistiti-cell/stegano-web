# Stegano Web

Stegano Web est une reproduction côté navigateur du flux principal de `Stegano.exe` : charger une image, inscrire un message texte dans ses bits LSB, exporter une nouvelle image PNG, puis lire un message caché depuis une image porteuse. Aucun fichier n’est envoyé vers un serveur.

## Fonctionnalités

| Fonction | Détail |
|---|---|
| Inscrire | Chiffre le texte avec une clé puis l’inscrit dans les canaux RGB d’une image selon le protocole Fernet de `stegano_gui.py`. |
| Lire | Extrait le paquet chiffré, vérifie la clé et restitue le texte uniquement si la signature Fernet est valide. |
| Capacité | Calcule l’espace utile disponible selon les dimensions de l’image. |
| Export | Produit un fichier PNG téléchargeable afin d’éviter la recompression destructive du JPEG. |
| Formats | Le navigateur accepte PNG, JPG et BMP lorsqu’ils sont décodables nativement. |
| Confidentialité | Toute l’opération est effectuée dans le navigateur, sans compte ni API. La clé n’est jamais stockée. |

## Développement

```bash
pnpm install
pnpm dev
```

La vérification TypeScript et le build de production sont disponibles avec :

```bash
pnpm run check
pnpm run build
```

## Mettre le projet sur GitHub

```bash
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/<votre-utilisateur>/<nom-du-depot>.git
git push -u origin main
```

## Publication GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` construit `dist/public` à chaque push sur `main`, puis le publie via GitHub Pages. Dans les réglages du dépôt, sélectionnez **Settings → Pages → Source → GitHub Actions**.

Le site est une application 100 % statique (aucun backend requis pour l'hébergement sur Pages). Le chemin `base` de Vite est calculé automatiquement à partir du nom du dépôt (variable `GITHUB_REPOSITORY`, fournie par GitHub Actions), donc aucune modification manuelle n'est nécessaire pour un dépôt de projet classique (`https://<utilisateur>.github.io/<depot>/`).

Cas particuliers :
- **Page utilisateur/organisation** (`https://<utilisateur>.github.io/`) ou **domaine personnalisé** : définissez la variable d'environnement `VITE_BASE_PATH=/` dans le workflow avant l'étape de build.
- **Build local** (`pnpm run build` sur votre machine) : le chemin `base` reste `/` par défaut puisque `GITHUB_REPOSITORY` n'est pas défini hors GitHub Actions.

## Limites importantes

Cette version reproduit le protocole visible dans `stegano_gui.py` : PBKDF2-HMAC-SHA256 avec 200 000 itérations, sel aléatoire de 16 octets, clé Fernet dérivée de 32 octets et marqueur `###FIN###`. La clé saisie n’est jamais conservée après le rechargement de la page. L’export de référence est PNG : enregistrer l’image porteuse en JPEG peut altérer les bits cachés. Le navigateur doit fonctionner dans un contexte sécurisé (`https` ou `localhost`) pour exposer Web Crypto.
