/* Direction visuelle : atelier de cryptographie éditoriale — composition asymétrique, ivoire d’archive, encre bleu-noir, jade propriétaire, annotations monospace. */
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, Eye, EyeOff, FileAudio, FileImage, FileVideo, LockKeyhole, Moon, ScanLine, Sun, Upload, WandSparkles } from "lucide-react";
import AdminPanel from "./Admin";

const MAGIC = new TextEncoder().encode("STEGANO1");
const HEADER_BYTES = MAGIC.length + 4;
const HERO_IMAGE = `${import.meta.env.BASE_URL}hero.png`;

// Images de démonstration servies depuis client/public. Un lien du type
// "?demo=<nom-du-fichier>" précharge l'image correspondante et bascule sur
// le mode LIRE, pour que le visiteur n'ait plus qu'à saisir la clé. Le nom
// de fichier suffit : aucune modification de code n'est nécessaire pour
// ajouter une nouvelle image, voir la page /admin pour générer le lien.
// DEMO_ALIASES permet de garder des liens plus courts pour certaines images.
const DEMO_ALIASES: Record<string, string> = {
  "ford-focus": "ford focus.png",
};

type Mode = "encode" | "decode";
type Status = { tone: "idle" | "success" | "error"; text: string };

// Type de contenu que l'on peut dissimuler dans l'image porteuse. Le
// premier octet du paquet chiffré indique le type, ce qui permet au
// décodage de reconstituer le bon fichier (aperçu + téléchargement).
type PayloadKind = "text" | "image" | "audio" | "video";
const PAYLOAD_KIND_CODES: Record<PayloadKind, number> = { text: 0, image: 1, audio: 2, video: 3 };
const PAYLOAD_KIND_FROM_CODE: Record<number, PayloadKind> = { 0: "text", 1: "image", 2: "audio", 3: "video" };
const PAYLOAD_KIND_LABELS: Record<PayloadKind, string> = { text: "un texte", image: "une image", audio: "un fichier audio (MP3)", video: "une vidéo (MP4)" };
const PAYLOAD_KIND_ACCEPT: Record<PayloadKind, string> = { text: "", image: "image/*", audio: "audio/mpeg,audio/mp3,.mp3", video: "video/mp4,.mp4" };
const PAYLOAD_KIND_EXT: Record<PayloadKind, string> = { text: "txt", image: "png", audio: "mp3", video: "mp4" };

type DecodedFile = { url: string; filename: string; kind: Exclude<PayloadKind, "text">; size: number; mime: string };

function guessMimeFromFilename(filename: string, kind: PayloadKind) {
  const lower = filename.toLowerCase();
  if (kind === "image") {
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".bmp")) return "image/bmp";
    if (lower.endsWith(".webp")) return "image/webp";
    return "image/png";
  }
  if (kind === "audio") return "audio/mpeg";
  if (kind === "video") return "video/mp4";
  return "text/plain";
}

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

async function encryptLikeFernet(messageBytes: Uint8Array, password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(FERNET_SALT_BYTES));
  const { signingKey, encryptionKey } = await deriveFernetKeys(password, salt);
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const timestamp = new Uint8Array(8);
  new DataView(timestamp.buffer).setBigUint64(0, BigInt(Math.floor(Date.now() / 1000)));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv }, encryptionKey, messageBytes));
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

async function decryptLikeFernet(packet: string, password: string): Promise<Uint8Array> {
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
  return new Uint8Array(plaintext);
}

// Le contenu à dissimuler est précédé d'un petit en-tête (type + nom de
// fichier) avant chiffrement, afin que le décodage puisse reconstituer le
// bon type de fichier (image / audio / vidéo) et proposer le bon nom.
function buildHeaderedPayload(kind: PayloadKind, filename: string, content: Uint8Array) {
  const nameBytes = encoder.encode(filename).slice(0, 255);
  const header = new Uint8Array(2 + nameBytes.length);
  header[0] = PAYLOAD_KIND_CODES[kind];
  header[1] = nameBytes.length;
  header.set(nameBytes, 2);
  return concatBytes(header, content);
}

function parseHeaderedPayload(bytes: Uint8Array) {
  if (bytes.length < 2) throw new Error("Paquet déchiffré invalide.");
  const kind = PAYLOAD_KIND_FROM_CODE[bytes[0]] ?? "text";
  const nameLength = bytes[1];
  const filename = decoder.decode(bytes.slice(2, 2 + nameLength));
  const content = bytes.slice(2 + nameLength);
  return { kind, filename, content };
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
  const [showAdmin] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("admin"));
  const [mode, setMode] = useState<Mode>("encode");
  const [file, setFile] = useState<File | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [payloadKind, setPayloadKind] = useState<PayloadKind>("text");
  const [payloadFile, setPayloadFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [decodedMessage, setDecodedMessage] = useState("");
  const [decodedFile, setDecodedFile] = useState<DecodedFile | null>(null);
  const [textFilename, setTextFilename] = useState("message_decode");
  const [isBusy, setIsBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") return false;
    const saved = localStorage.getItem("stegano-theme");
    if (saved) return saved === "dark";
    // Sur smartphone, le mode sombre est activé par défaut tant que
    // l'utilisateur n'a jamais choisi explicitement un thème.
    return window.matchMedia("(max-width: 860px)").matches;
  });
  const [toast, setToast] = useState("");
  const [status, setStatus] = useState<Status>({ tone: "idle", text: "Aucune image sélectionnée" });
  const inputRef = useRef<HTMLInputElement>(null);
  const payloadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("stegano-theme", isDark ? "dark" : "light");
  }, [isDark]);

  useEffect(() => {
    const demoKey = new URLSearchParams(window.location.search).get("demo");
    if (!demoKey) return;
    const demoFile = DEMO_ALIASES[demoKey] ?? demoKey;
    (async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}${encodeURIComponent(demoFile)}`);
        if (!response.ok) throw new Error("Image de démonstration introuvable.");
        const blob = await response.blob();
        const file = new File([blob], demoFile, { type: blob.type || "image/png" });
        setMode("decode");
        await handleFile(file);
        setStatus({ tone: "idle", text: "Image de démonstration chargée. Entrez la clé pour révéler le message caché." });
      } catch (error) {
        setStatus({ tone: "error", text: error instanceof Error ? error.message : "Impossible de charger l’image de démonstration." });
      }
    })();
    // Exécuté une seule fois au chargement de la page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      if (decodedFile) URL.revokeObjectURL(decodedFile.url);
      setFile(nextFile);
      setImage(loaded.image);
      setPreviewUrl(loaded.url);
      setDecodedMessage("");
      setDecodedFile(null);
      setStatus({ tone: "success", text: "Image prête pour une opération locale." });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "Impossible de lire cette image." });
    }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) { void handleFile(event.target.files?.[0]); }
  function onDrop(event: DragEvent<HTMLDivElement>) { event.preventDefault(); void handleFile(event.dataTransfer.files?.[0]); }

  function onPayloadFileChange(event: ChangeEvent<HTMLInputElement>) {
    setPayloadFile(event.target.files?.[0] ?? null);
  }
  function onPayloadDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) setPayloadFile(dropped);
  }

  async function encode() {
    if (!image) return setStatus({ tone: "error", text: "Ajoutez d’abord une image porteuse." });
    if (!password) return setStatus({ tone: "error", text: "Choisissez une clé secrète avant l’encodage." });
    if (payloadKind === "text") {
      if (!message.trim()) return setStatus({ tone: "error", text: "Écrivez un message avant l’encodage." });
    } else if (!payloadFile) {
      return setStatus({ tone: "error", text: `Choisissez ${PAYLOAD_KIND_LABELS[payloadKind]} à dissimuler.` });
    }
    setIsBusy(true);
    setProgress(8);
    setProgressLabel("Préparation du contenu");
    try {
      const rawContent = payloadKind === "text" ? encoder.encode(message) : new Uint8Array(await payloadFile!.arrayBuffer());
      const filename = payloadKind === "text" ? "" : payloadFile!.name;
      const headeredPayload = buildHeaderedPayload(payloadKind, filename, rawContent);
      setProgress(24);
      setProgressLabel("Dérivation de la clé sécurisée");
      const encrypted = await encryptLikeFernet(headeredPayload, password);
      setProgress(58);
      setProgressLabel("Chiffrement du contenu");
      const payload = encoder.encode(encrypted + "###FIN###");
      const rawCapacity = image.naturalWidth * image.naturalHeight * 3;
      if (payload.length * 8 > rawCapacity) return setStatus({ tone: "error", text: `Contenu chiffré trop volumineux : ${formatBytes(payload.length)} pour ${formatBytes(Math.floor(rawCapacity / 8))} disponibles. Utilisez une image porteuse plus grande.` });
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
      setStatus({ tone: "success", text: payloadKind === "text" ? "Message chiffré et inscrit dans une copie PNG. Vous pouvez l’exporter." : `${filename} chiffré et inscrit dans une copie PNG. Vous pouvez l’exporter.` });
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
      const extractedBytes = await decryptLikeFernet(encodedText, password);
      setProgress(85);
      setProgressLabel("Reconstitution du contenu");
      const { kind, filename, content } = parseHeaderedPayload(extractedBytes);
      if (decodedFile) URL.revokeObjectURL(decodedFile.url);
      if (kind === "text") {
        const text = decoder.decode(content);
        setDecodedMessage(text);
        setDecodedFile(null);
        setProgress(100);
        setProgressLabel("Traitement terminé");
        setStatus({ tone: "success", text: `Message déchiffré : ${formatBytes(content.length)}.` });
      } else {
        const mime = guessMimeFromFilename(filename, kind);
        const blob = new Blob([content], { type: mime });
        const url = URL.createObjectURL(blob);
        const safeFilename = filename || `fichier_decode.${PAYLOAD_KIND_EXT[kind]}`;
        setDecodedMessage("");
        setDecodedFile({ url, filename: safeFilename, kind, size: content.length, mime });
        setProgress(100);
        setProgressLabel("Traitement terminé");
        setStatus({ tone: "success", text: `Fichier déchiffré : ${safeFilename} (${formatBytes(content.length)}).` });
      }
    } catch (error) {
      setDecodedMessage("");
      setDecodedFile(null);
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

  function downloadDecodedFile() {
    if (!decodedFile) return;
    const anchor = document.createElement("a");
    anchor.href = decodedFile.url;
    anchor.download = decodedFile.filename;
    anchor.click();
    setStatus({ tone: "success", text: `Le fichier a été enregistré sous ${decodedFile.filename}.` });
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

  if (showAdmin) return <AdminPanel />;

  return (
    <main className="site-shell">
      <header className="topbar">
        <a className="brand" href="#atelier" aria-label="Stegano Web, retour à l’atelier">
          <span>Stegano <i>Web</i></span>
        </a>
        <div className="top-actions"><div className="top-meta"><span className="status-dot" /> TRAITEMENT LOCAL <span className="meta-divider" /> AUCUN COMPTE</div><button className="theme-toggle" onClick={() => setIsDark((dark) => !dark)} aria-label={isDark ? "Activer le mode clair" : "Activer le mode sombre"}>{isDark ? <Sun size={16} /> : <Moon size={16} />}<span>{isDark ? "MODE CLAIR" : "MODE SOMBRE"}</span></button></div>
      </header>

      <section className="hero" id="atelier">
        <div className="hero-copy">
          <h1>Un message.<br /><em>Une image.</em><br />Une Clé.</h1>
          <p className="hero-lede">Dissimulez un texte dans les pixels d’une image, directement dans votre navigateur. Vos fichiers restent sur votre appareil.</p>
        </div>
        <div className="hero-art"><img src={HERO_IMAGE} alt="Composition éditoriale autour d’une image et d’une grille de pixels" /><div className="art-label"></div></div>
      </section>

      <section className="workbench" aria-label="Atelier Stegano Web">
        <div className="workspace">
          <div className="workspace-head"><div><h2>Porter ou inspecter<br /><em>une image.</em></h2></div><div className="mode-switch" role="tablist" aria-label="Mode de travail"><button className={mode === "encode" ? "active" : ""} onClick={() => setMode("encode")} role="tab" aria-selected={mode === "encode"}>INSCRIRE</button><button className={mode === "decode" ? "active" : ""} onClick={() => setMode("decode")} role="tab" aria-selected={mode === "decode"}>LIRE</button></div></div>
          <div className="workspace-grid">
            <div className="preview-column">
              <div className={`drop-zone ${image ? "has-image" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && inputRef.current?.click()}>
                {previewUrl ? <img src={previewUrl} alt="Aperçu de l’image sélectionnée" /> : <><FileImage size={32} strokeWidth={1.2} /><strong>Déposez une image ici</strong><span>ou cliquez pour parcourir vos fichiers</span></>}
                <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/bmp" onChange={onFileChange} hidden />
              </div>
            </div>
            <div className="operation-column">
              {mode === "encode" ? <>
                <label className="field-label">TYPE DE CONTENU À CACHER</label>
                <div className="payload-switch" role="tablist" aria-label="Type de contenu à cacher">
                  <button type="button" className={payloadKind === "text" ? "active" : ""} onClick={() => setPayloadKind("text")} role="tab" aria-selected={payloadKind === "text"}>TEXTE</button>
                  <button type="button" className={payloadKind === "image" ? "active" : ""} onClick={() => setPayloadKind("image")} role="tab" aria-selected={payloadKind === "image"}><FileImage size={14} /> IMAGE</button>
                  <button type="button" className={payloadKind === "audio" ? "active" : ""} onClick={() => setPayloadKind("audio")} role="tab" aria-selected={payloadKind === "audio"}><FileAudio size={14} /> AUDIO MP3</button>
                  <button type="button" className={payloadKind === "video" ? "active" : ""} onClick={() => setPayloadKind("video")} role="tab" aria-selected={payloadKind === "video"}><FileVideo size={14} /> VIDÉO MP4</button>
                </div>
                {payloadKind === "text" ? <>
                  <label className="field-label" htmlFor="secret-message">MESSAGE À DISSIMULER <span>{new TextEncoder().encode(message).length} / {capacity || "—"} o</span></label>
                  <textarea id="secret-message" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Écrivez ici le message qui voyagera dans l’image…" rows={8} />
                </> : <>
                  <label className="field-label">{payloadKind === "image" ? "IMAGE" : payloadKind === "audio" ? "FICHIER MP3" : "FICHIER MP4"} À DISSIMULER <span>{payloadFile ? formatBytes(payloadFile.size) : "—"} / {capacity ? formatBytes(capacity) : "—"}</span></label>
                  <div className={`drop-zone payload-drop ${payloadFile ? "has-image" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={onPayloadDrop} onClick={() => payloadInputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => event.key === "Enter" && payloadInputRef.current?.click()}>
                    {payloadFile ? <>{payloadKind === "image" ? <FileImage size={28} strokeWidth={1.2} /> : payloadKind === "audio" ? <FileAudio size={28} strokeWidth={1.2} /> : <FileVideo size={28} strokeWidth={1.2} />}<strong>{payloadFile.name}</strong><span>{formatBytes(payloadFile.size)}</span></> : <><Upload size={28} strokeWidth={1.2} /><strong>Déposez {PAYLOAD_KIND_LABELS[payloadKind]} ici</strong><span>ou cliquez pour parcourir vos fichiers</span></>}
                    <input ref={payloadInputRef} type="file" accept={PAYLOAD_KIND_ACCEPT[payloadKind]} onChange={onPayloadFileChange} hidden />
                  </div>
                </>}
                <label className="field-label key-label" htmlFor="encode-key">CLÉ SECRÈTE <span>PBKDF2 · FERNET</span></label>
                <div className="key-field"><input id="encode-key" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Entrez la clé de chiffrement" /><button type="button" className="key-eye" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer la clé" : "Afficher la clé"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                <div className="operation-actions"><button className="primary-action" onClick={() => void encode()} disabled={isBusy}>{isBusy ? <><span className="loading-spinner" /> CHIFFREMENT EN COURS…</> : <><LockKeyhole size={17} /> CHIFFRER ET INSCRIRE</>}</button><button className="icon-action" onClick={() => void handleFile()} aria-label="Recharger une image"><Upload size={17} /></button></div>
                <p className="field-hint"><WandSparkles size={14} /> L’export sera un nouveau fichier PNG. L’image originale n’est jamais modifiée.</p>
              </> : <>
                <div className="decode-panel"><ScanLine size={22} /><div><strong>Décoder</strong></div></div>
                <label className="field-label key-label" htmlFor="decode-key">CLÉ SECRÈTE <span>MÊME CLÉ QUE L’ENCODAGE</span></label>
                <div className="key-field"><input id="decode-key" type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Entrez la clé de déchiffrement" /><button type="button" className="key-eye" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer la clé" : "Afficher la clé"}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div>
                <button className="primary-action full" onClick={() => void decode()} disabled={isBusy}>{isBusy ? <><span className="loading-spinner" /> DÉCHIFFREMENT EN COURS…</> : <><ScanLine size={17} /> LIRE ET DÉCHIFFRER</>}</button>
                {decodedFile ? <div className="decoded-file-preview">
                  {decodedFile.kind === "image" && <img src={decodedFile.url} alt="Image décodée" />}
                  {decodedFile.kind === "audio" && <audio controls src={decodedFile.url} />}
                  {decodedFile.kind === "video" && <video controls src={decodedFile.url} />}
                  <div className="decoded-file-meta"><span>{decodedFile.filename}</span><span>{formatBytes(decodedFile.size)}</span></div>
                </div> : <textarea id="decoded-message" className="decoded-message-area" value={decodedMessage} readOnly placeholder="Le message décodé apparaîtra ici…" rows={16} />}
                <div className="text-actions">
                  {decodedFile ? <button className="download-action text-download" onClick={downloadDecodedFile} disabled={isBusy}><Download size={16} /> TÉLÉCHARGER LE FICHIER</button> : <>
                    <button className="download-action text-download" onClick={() => void copyDecodedText()} disabled={!decodedMessage || isBusy}><Upload size={16} /> COPIER LE MESSAGE</button>
                    <button className="download-action text-download" onClick={saveDecodedText} disabled={!decodedMessage || isBusy}><Download size={16} /> ENREGISTRER EN .TXT</button>
                  </>}
                </div>
                {!decodedFile && <><label className="field-label filename-label" htmlFor="text-filename">NOM DU FICHIER <span>.TXT</span></label><div className="filename-field"><input id="text-filename" value={textFilename} onChange={(event) => setTextFilename(event.target.value)} placeholder="message_decode" /><span>.txt</span></div></>}
              </>}
              {isBusy && <div className="progress-panel" role="status" aria-live="polite"><div className="progress-head"><span>{progressLabel}</span><strong>{progress}%</strong></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div></div>}
              <div className={`status-message ${status.tone}`} aria-live="polite"><span className="status-pip" />{status.text}</div>
              {mode === "encode" && previewUrl && status.tone === "success" && <button className="download-action" onClick={download}><Download size={16} /> TÉLÉCHARGER L’IMAGE PORTEUSE</button>}
            </div>
          </div>
        </div>
      </section>

      {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
      <footer className="footer"><span>STEGANO WEB / ATELIER LOCAL</span><span>Les données ne quittent jamais votre navigateur.</span><a href="?admin=1" style={{ opacity: 0.35 }}>admin</a><span>© 2026</span></footer>
    </main>
  );
}
