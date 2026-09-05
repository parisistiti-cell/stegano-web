# Stegano Web — cahier de direction

## Référence fonctionnelle
Stegano.exe est la source de vérité fonctionnelle. L’inspection passive de l’exécutable indique une application Windows empaquetée avec Python/Pillow, orientée stéganographie d’images, prenant en charge les formats PNG, BMP et JPG et utilisant une technique LSB (Least Significant Bit). La version web reproduira le flux principal sans exécuter l’EXE : charger une image, encoder un message texte dans les bits de poids faible, télécharger l’image résultante, puis décoder le message depuis une image porteuse. L’interface ajoutera une vérification de capacité et des états d’erreur clairs. Le traitement restera local au navigateur.

## Approche choisie : atelier de cryptographie éditoriale

### Design Movement
Une rencontre entre le modernisme éditorial suisse et l’esthétique des laboratoires d’archivage numérique : composition asymétrique, typographie nette, repères techniques et surfaces papier légèrement texturées.

### Core Principles
1. La confiance vient de la lisibilité : chaque action importante est visible, expliquée et réversible.
2. La précision technique est rendue chaleureuse par des surfaces ivoire, des annotations et des marqueurs de couleur.
3. L’interface privilégie un axe de travail en deux colonnes : aperçu visuel à gauche, opérations à droite.
4. Les états vides et les erreurs sont traités comme des moments pédagogiques, pas comme des impasses.

### Color Philosophy
Le fond ivoire évoque une feuille d’archive et réduit la fatigue visuelle. L’encre bleu-noir porte le texte et donne une impression d’outil sérieux. Le vert jade est la couleur propriétaire : il signale les opérations locales réussies et la confidentialité sans évoquer un simple bouton de validation. Un orange corail réservé aux alertes attire l’attention sans transformer toute l’interface en tableau de bord agressif.

### Layout Paradigm
Un cadre d’atelier avec une barre latérale étroite de contexte et une zone de travail décalée. L’aperçu de l’image n’est jamais une simple carte centrée : il s’inscrit dans un cadre de preuve avec dimensions, format et capacité. Les panneaux d’action suivent un parcours vertical : porter l’image, écrire ou lire, exporter.

### Signature Elements
- Un monogramme abstrait « S » composé de pixels carrés, utilisé comme repère de marque.
- Des annotations monospace en petites capitales : FORMAT, CAPACITÉ, LOCAL.
- Un motif de trame de points très discret dans les marges et les zones d’attente.

### Interaction Philosophy
Les interactions doivent donner l’impression de manipuler un instrument : sélection explicite, feedback immédiat, prévisualisation avant téléchargement et possibilité de basculer entre Encoder et Décoder sans perdre l’image chargée. Aucun fichier ne quitte le navigateur.

### Animation
Les apparitions utilisent des translations courtes et une opacité progressive, jamais plus de 240 ms. Les boutons compressent légèrement à l’activation. L’aperçu image se révèle par un fondu discret après lecture du fichier. Les animations non essentielles respectent prefers-reduced-motion.

### Typography System
Titres : Space Grotesk, poids 600–700, avec des intertitres compacts. Corps : DM Sans, 400–500, pour les instructions. Métadonnées : IBM Plex Mono, 11–12 px, capitales espacées. La hiérarchie oppose une grande accroche courte à des notes techniques très calibrées.

### Brand Essence
Un atelier de stéganographie local pour celles et ceux qui veulent dissimuler des messages dans des images sans envoyer leurs fichiers vers un serveur. Personnalité : précis, calme, ingénieux.

### Brand Voice
Les titres sont directs et évocateurs, les CTAs décrivent le résultat plutôt que l’action abstraite, et les microcopies rassurent sans promettre une sécurité absolue.

Exemple de titre : « Un message. Une image. Aucun détour. »

Exemple de CTA : « Inscrire le message dans l’image »

### Wordmark & Logo
Le symbole est un « S » angulaire construit avec trois modules carrés qui se décalent comme des bits. Le mot Stegano Web est composé en Space Grotesk avec une barre verticale jade entre les deux mots ; le symbole reste autonome pour l’icône.

### Signature Brand Color
Jade d’atelier : `#1E8F78`.

## Périmètre fonctionnel web

| Fonction | Comportement prévu |
|---|---|
| Charger une image | PNG, BMP et JPG lorsque le navigateur sait les décoder ; l’image est lue localement via FileReader. |
| Encoder | Insérer un message UTF-8 dans les bits LSB des canaux RGB, avec en-tête de longueur et marqueur de format. |
| Décoder | Lire l’en-tête puis extraire le message depuis l’image chargée. |
| Capacité | Calculer la capacité utile en caractères approximatifs et empêcher les messages trop longs. |
| Export | Télécharger un PNG porteuse, car le PNG conserve les bits LSB contrairement à une recompression JPEG. |
| Confidentialité | Afficher clairement que le traitement est local et ne nécessite aucun compte ni transfert. |
