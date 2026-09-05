# Protocole relevé dans stegano_gui.py

Le programme utilise PBKDF2-HMAC-SHA256 avec 200 000 itérations pour dériver 32 octets depuis le mot de passe et un sel aléatoire de 16 octets. La clé dérivée est encodée en base64 URL-safe puis utilisée par Fernet. Le paquet caché est `base64url(sel + token_fernet)`, suivi du marqueur ASCII `###FIN###`. L’image reçoit ensuite les bits du texte UTF-8 dans les LSB des canaux R, G et B, dans l’ordre ligne par ligne, sans en-tête additionnel. L’export est toujours PNG.

Pour la compatibilité navigateur, Fernet est reproduit avec Web Crypto : clé HMAC = les 16 premiers octets de la dérivation, clé AES-CBC = les 16 derniers octets, token composé de la version Fernet `0x80`, timestamp 64 bits, IV 16 octets, ciphertext PKCS#7 et HMAC-SHA256 du token sans signature. Le navigateur ne peut pas s’appuyer directement sur une primitive Fernet native.
