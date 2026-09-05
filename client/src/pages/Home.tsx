/* Direction visuelle : atelier de cryptographie éditoriale — composition asymétrique, ivoire d’archive, encre bleu-noir, jade propriétaire, annotations monospace. */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileImage, LockKeyhole, Moon, ScanLine, Sun, Upload, WandSparkles } from "lucide-react";

const MAGIC = new TextEncoder().encode("STEGANO1");
const HEADER_BYTES = MAGIC.length + 4;
const HERO_IMAGE = `${import.meta.env.BASE_URL}hero.png`;


type Mode = "encode" | "decode";
type Status = { tone: "idle" | "success" | "error"; text: string };

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const FERNET_VERSION = 0x80;
const FERNET_SALT_BYTES = 16;
const FERNET_ITERATIONS = 200_000;
const FERNET_MARKER = encoder.encode("###FIN###");

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; }
  return output;
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function deriveFernetKeys(password: string, salt: Uint8Array) {
  const baseKey = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const derived = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: FERNET_ITERATIONS, hash: "SHA-256" }, baseKey, 256));
  const signingKey = await crypto.subtle.importKey("raw", derived.slice(0, 16), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
  const encryptionKey = await crypto.subtle.importKey("raw", derived.slice(16), { name: "AES-CBC" }, false, ["encrypt", "decrypt"]);
  return { signingKey, encryptionKey };
}

async function encryptLikeFernet(message: string, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(FERNET_SALT_BYTES));
  const { signingKey, encryptionKey } = await deriveFernetKeys(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const timestamp = new Uint8Array(8);
  new DataView(timestamp.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 1000)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, encryptionKey, encoder.encode(message)));
  const unsignedToken = concatBytes(new Uint8Array([FERNET_VERSION]), timestamp, iv, ciphertext);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, unsignedToken));
  return base64UrlEncode(concatBytes(salt, unsignedToken, signature));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function decryptLikeFernet(packet: string, password: string) {
  const decoded = base64UrlDecode(packet);
  if (decoded.length < FERNET_SALT_BYTES + 1 + 8 + 16 + 16 + 32) throw new Error("Paquet chiffré incomplet.");
  const salt = decoded.slice(0, FERNET_SALT_BYTES);
  const token = decoded.slice(FERNET_SALT_BYTES);
  const unsignedToken = token.slice(0, -32);
  const signature = token.slice(-32);
  if (unsignedToken[0] !== FERNET_VERSION) throw new Error("Version Fernet non reconnue.");
  const { signingKey, encryptionKey } = await deriveFernetKeys(password, salt);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", signingKey, unsignedToken));
  if (!constantTimeEqual(signature, expected)) throw new Error("Signature invalide.");
  const iv = unsignedToken.slice(9, 25);
  const ciphertext = unsignedToken.slice(25);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-CBC", iv }, encryptionKey, ciphertext);
  return decoder.decode(plaintext);
}

function readImage(file: File): Promise<{ image: HTMLImageElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Cette image ne peut pas être lue par le navigateur.")); };
    image.src = url;
  });
}

function collectRgbBits(data: Uint8ClampedArray) {
  const bits: number[] = [];
  for (let i = 0; i < data.length; i += 4) {
    bits.push(data[i] & 1, data[i + 1] & 1, data[i + 2] & 1);
  }
  return bits;
}

function bitsToBytes(bits: number[]) {
  const bytes = new Uint8Array(Math.floor(bits.length / 8));
  for (let i = 0; i < bytes.length; i += 1) {
    let value = 0;
    for (let bit = 0; bit < 8; bit += 1) value = (value << 1) | bits[i * 8 + bit];
    bytes[i] = value;
  }
  return bytes;
}

function bytesToBits(bytes: Uint8Array) {
  const bits: number[] = [];
  for (let index = 0; index < bytes.length; index += 1) { const byte = bytes[index]; for (let bit = 7; bit >= 0; bit -= 1) bits.push((byte >> bit) & 1); }
  return bits;
}

function canvasFromImage(image: HTMLImageElement) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Le contexte graphique n’est pas disponible.");
  context.drawImage(image, 0, 0);
  return { canvas, context, imageData: context.getImageData(0, 0, canvas.width, canvas.height) };
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("encode");
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [decodedMessage, setDecodedMessage] = useState("");
  const [textFilename, setTextFilename] = useState("message_decode");
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isDark, setIsDark] = useState(() => typeof window !== "undefined" && localStorage.getItem("stegano-theme") === "dark");
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Aucune image sélectionnée" });
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("stegano-theme", isDark ? "dark" : "light");
  }, [isDark]);

  function showToast(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 2600);
  }

  const capacity = useMemo(() => {
    if (!image) return 0;
    return Math.max(0, Math.floor((image.naturalWidth * image.naturalHeight * 3) / 8) - HEADER_BYTES);
  }, [image]);

  async function handleFile(nextFile?: File) {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("image/")) {
      setStatus({ tone: "error", text: "Choisissez un fichier image PNG, JPG ou BMP." });
      return;
    }
    try {
      const loaded = await readImage(nextFile);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFile(nextFile);
      setImage(loaded.image);
      setPreviewUrl(loaded.url);
      setDecodedMessage("");
      setStatus({ tone: "success", text: "Image prête pour une opération locale." });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Impossible de lire cette image." });
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void handleFile(event.target.files?.[0]); }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); void handleFile(event.dataTransfer.files?.[0]); }

  async function encode() {
    if (!image) return setStatus({ tone: "error", text: "Ajoutez d’abord une image porteuse." });
    if (!password) return setStatus({ tone: "error", text: "Choisissez une clé secrète avant l’encodage." });
    if (!message.trim()) return setStatus({ tone: "error", text: "Écrivez un message avant l’encodage." });
    setIsBusy(true);
    setProgress(8);
    setProgressLabel("Préparation du message");
    try {
      setProgress(24);
      setProgressLabel("Dérivation de la clé sécurisée");
      const encrypted = await encryptLikeFernet(message, password);
      setProgress(58);
      setProgressLabel("Chiffrement du message");
      const payload = encoder.encode(encrypted + "###FIN###");
      const rawCapacity = image.naturalWidth * image.naturalHeight * 3;
      if (payload.length * 8 > rawCapacity) return setStatus({ tone: "error", text: `Message chiffré trop long : ${formatBytes(payload.length)} pour ${formatBytes(Math.floor(rawCapacity / 8))} disponibles.` });
      setProgress(73);
      setProgressLabel("Lecture des pixels");
      const { canvas, context, imageData } = canvasFromImage(image);
      const bits = bytesToBits(payload);
      let bitIndex = 0;
      for (let i = 0; i < imageData.data.length && bitIndex < bits.length; i += 4) {
        for (let channel = 0; channel < 3 && bitIndex < bits.length; channel += 1) {
          imageData.data[i + channel] = (imageData.data[i + channel] & 0xfe) | bits[bitIndex++];
        }
      }
      setProgress(91);
      setProgressLabel("Écriture de l’image PNG");
      context.putImageData(imageData, 0, 0);
      const url = canvas.toDataURL("image/png");
      setPreviewUrl(url);
      setProgress(100);
      setProgressLabel("Traitement terminé");
      setStatus({ tone: "success", text: "Message chiffré et inscrit dans une copie PNG. Vous pouvez l’exporter." });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "L’encodage a échoué." });
    } finally {
      setIsBusy(false);
      window.setTimeout(() => { setProgress(0); setProgressLabel(""); }, 500);
    }
  }

  async function decode() {
    if (!image) return setStatus({ tone: "error", text: "Ajoutez d’abord une image à inspecter." });
    if (!password) return setStatus({ tone: "error", text: "Entrez la clé secrète pour lire le message." });
    setIsBusy(true);
    setProgress(12);
    setProgressLabel("Lecture des pixels");
    try {
      const { imageData } = canvasFromImage(image);
      setProgress(42);
      setProgressLabel("Recherche du paquet chiffré");
      const bytes = bitsToBytes(collectRgbBits(imageData.data));
      const encodedText = decoder.decode(bytes).split("###FIN###")[0];
      if (!encodedText) throw new Error("Aucune donnée cachée détectée dans cette image.");
      setProgress(67);
      setProgressLabel("Vérification de la clé");
      const extracted = await decryptLikeFernet(encodedText, password);
      setProgress(92);
      setProgressLabel("Décodage du texte");
      setDecodedMessage(extracted);
      setProgress(100);
      setProgressLabel("Traitement terminé");
      setStatus({ tone: "success", text: `Message déchiffré : ${formatBytes(encoder.encode(extracted).length)}.` });
    } catch (error) {
      setDecodedMessage("");
      setStatus({ tone: "error", text: error instanceof Error && error.message === "Signature invalide." ? "Clé incorrecte ou image sans message chiffré par cet outil." : error instanceof Error ? error.message : "Le décodage a échoué." });
    } finally {
      setIsBusy(false);
      window.setTimeout(() => { setProgress(0); setProgressLabel(""); }, 500);
    }
  }

  async function copyDecodedText() {
    if (!decodedMessage) return setStatus({ tone: "error", text: "Décodez d’abord un message avant de le copier." });
    try {
      await navigator.clipboard.writeText(decodedMessage);
      setStatus({ tone: "success", text: "Le message décodé a été copié dans le presse-papiers." });
      showToast("Message copié dans le presse-papiers");
    } catch {
      setStatus({ tone: "error", text: "La copie a échoué. Vérifiez les permissions du navigateur." });
    }
  }

  function download() {
    if (!previewUrl) return;
    const anchor = document.createElement("a");
    anchor.href = previewUrl;
    anchor.download = "stegano-message.png";
    anchor.click();
  }

  function saveDecodedText() {
    if (!decodedMessage) return setStatus({ tone: "error", text: "Décodez d’abord un message avant de l’enregistrer." });
    const blob = new Blob([decodedMessage], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeName = textFilename.trim().replace(/[^a-zA-Z0-9À-ÿ _-]/g, "_") || "message_decode";
    anchor.download = `${safeName.endsWith(".txt") ? safeName : `${safeName}.txt`}`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus({ tone: "success", text: `Le message décodé a été enregistré dans ${safeName.endsWith(".txt") ? safeName : `${safeName}.txt`}.` });
  }

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#atelier" aria-label="Stegano Web, retour à l’atelier">
          <img src={MARK_IMAGE} alt="" className="brand-mark" />
          <span>Stegano <i>Web</i></span>
        </a>
        <div className="top-actions"><div className="top-meta"><span className="status-dot" /> TRAITEMENT LOCAL <span className="meta-divider" /> AUCUN COMPTE</div><button className="theme-toggle" onClick={() => setIsDark((dark) => !dark)} aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}>{isDark ? <Sun size={16} /> : <Moon size={16} />}<span>{isDark ? "MODE CLAIR" : "MODE SOMBRE"}</span></button></div>
      </header>

      <section className="hero" id="atelier">
        <div className="hero-copy">
          <p className="eyebrow"><span>01</span> ATELIER DE STÉGANOGRAPHIE</p>
          <h1>Un message.<br /><em>Une image.</em><br />Une Clé.</h1>
          <p className="hero-lede">Dissimulez un texte dans les pixels d’une image, directement dans votre navigateur. Vos fichiers restent sur votre appareil.</p>
          <div className="hero-notes"><span>PNG / JPG / BMP</span><span>LSB · UTF-8</span><span>100% LOCAL</span></div>
        </div>
        <div className="hero-art"><img src={HERO_IMAGE} alt="Composition éditoriale autour d’une image et d’une grille de pixels" /><div className="art-label"></div></div>
      </section>

      <section className="workbench" aria-label="Atelier Stegano Web">
        <aside className="side-rail"><div className="rail-line" /><div><span className="rail-kicker">PROTOCOLE</span><strong>LSB / 01</strong><p>Chaque canal RVB reçoit un bit du message. L’image est ensuite exportée en PNG pour préserver l’information.</p></div><div className="rail-bottom">LOCAL ONLY<br /><span>v1.0 — BROWSER</span></div></aside>
        <div className="workspace">
          <div className="workspace-head"><div><p className="eyebrow"><span>02</span> ZONE DE TRAVAIL</p><h2>Porter ou inspecter<br /><em>une image.</em></h2></div><div className="mode-switch" role="tablist" aria-label="Mode de travail"><button className={mode === "encode" ? "active" : ""} onClick={() => setMode("encode")} role="tab" aria-selected={mode === "encode"}>INSCRIRE</button><button className={mode === "decode" ? "active" : ""} onClick={() => setMode("decode")} role="tab" aria-selected={mode === "decode"}>LIRE</button></div></div>
          <div className="workspace-grid">
            <div className="preview-column">
              <div className={`drop-zone ${image ? "has-image" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}>
                {previewUrl ? <img src={previewUrl} alt="Aperçu de l’image sélectionnée" /> : <><FileImage size={32} strokeWidth={1.2} /><strong>Déposez une image ici</strong><span>ou cliquez pour parcourir vos fichiers</span></>}
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/bmp" onChange={onFileChange} hidden />
              </div>
              <div className="image-facts"><div><span>FICHIER</span><strong>{file?.name || "—"}</strong></div><div><span>DIMENSIONS</span><strong>{image ? `${image.naturalWidth} × ${image.naturalHeight}` : "—"}</strong></div><div><span>CAPACITÉ UTILE</span><strong>{image ? formatBytes(capacity) : "—"}</strong></div></div>
            </div>
            <div className="operation-column">
              {mode === "encode" ? <>
                <label className="field-label" htmlFor="secret-message">MESSAGE À DISSIMULER <span>{new TextEncoder().encode(message).length} / {capacity || "—"} o</span></label>
                <textarea id="secret-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Écrivez ici le message qui voyagera dans l’image…" rows={8} />
                <label className="field-label key-label" htmlFor="encode-key">CLÉ SECRÈTE <span>PBKDF2 · FERNET</span></label>
                <div className="key-field"><input id="encode-key" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Choisissez une clé forte" /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "MASQUER" : "AFFICHER"}</button></div>
                <div className="operation-actions"><button className="primary-action" onClick={() => void encode()} disabled={isBusy}>{isBusy ? <><span className="loading-spinner" /> CHIFFREMENT EN COURS…</> : <><LockKeyhole size={17} /> CHIFFRER ET INSCRIRE</>}</button><button className="icon-action" onClick={() => void handleFile()} aria-label="Recharger une image"><Upload size={17} /></button></div>
                <p className="field-hint"><WandSparkles size={14} /> L’export sera un nouveau fichier PNG. L’image originale n’est jamais modifiée.</p>
              </> : <>
                <div className="decode-panel"><ScanLine size={22} /><div><strong>Inspecter les pixels</strong><p>Chargez une image porteuse puis lancez la lecture de son en-tête Stegano Web.</p></div></div>
                <label className="field-label key-label" htmlFor="decode-key">CLÉ SECRÈTE <span>MÊME CLÉ QUE L’ENCODAGE</span></label>
                <div className="key-field"><input id="decode-key" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Entrez la clé de déchiffrement" /><button type="button" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? "MASQUER" : "AFFICHER"}</button></div>
                <button className="primary-action full" onClick={() => void decode()} disabled={isBusy}>{isBusy ? <><span className="loading-spinner" /> DÉCHIFFREMENT EN COURS…</> : <><ScanLine size={17} /> LIRE ET DÉCHIFFRER</>}</button>
                <label className="field-label" htmlFor="decoded-message">MESSAGE EXTRAIT</label><textarea id="decoded-message" value={decodedMessage} readOnly placeholder="Le message décodé apparaîtra ici…" rows={6} />
                <div className="text-actions"><button className="download-action text-download" onClick={() => void copyDecodedText()} disabled={!decodedMessage || isBusy}><Upload size={16} /> COPIER LE MESSAGE</button><button className="download-action text-download" onClick={saveDecodedText} disabled={!decodedMessage || isBusy}><Download size={16} /> ENREGISTRER EN .TXT</button></div>
                <label className="field-label filename-label" htmlFor="text-filename">NOM DU FICHIER <span>.TXT</span></label><div className="filename-field"><input id="text-filename" value={textFilename} onChange={(event) => setTextFilename(event.target.value)} placeholder="message_decode" /><span>.txt</span></div>
              </>}
              {isBusy && <div className="progress-panel" role="status" aria-live="polite"><div className="progress-head"><span>{progressLabel}</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
              <div className={`status-message ${status.tone}`} aria-live="polite"><span className="status-pip" />{status.text}</div>
              {mode === "encode" && previewUrl && status.tone === "success" && <button className="download-action" onClick={download}><Download size={16} /> TÉLÉCHARGER L’IMAGE PORTEUSE</button>}
            </div>
          </div>
        </div>
      </section>

      {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
      <footer className="footer"><span>STEGANO WEB / ATELIER LOCAL</span><span>Les données ne quittent jamais votre navigateur.</span><span>© 2026</span></footer>
    </main>
  );
}
