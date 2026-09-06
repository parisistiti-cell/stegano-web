import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, ImageOff, ImagePlus, Loader2, Lock, Trash2 } from "lucide-react";

const ACCESS_CODE = "1257";
const UNLOCK_KEY = "stegano-admin-unlocked";

type CheckState = "idle" | "checking" | "found" | "missing";
type HistoryEntry = { filename: string; link: string; createdAt: number };

const HISTORY_KEY = "stegano-admin-history";

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
}

export default function AdminPanel() {
  const [unlocked, setUnlocked] = useState(() => typeof window !== "undefined" && sessionStorage.getItem(UNLOCK_KEY) === "1");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [filename, setFilename] = useState("");
  const [checkState, setCheckState] = useState<CheckState>("idle");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  const siteOrigin = `${window.location.origin}${import.meta.env.BASE_URL}`;

  async function checkAndGenerate() {
    const trimmed = filename.trim();
    if (!trimmed) return;
    setCheckState("checking");
    setLink("");
    setCopied(false);
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}${encodeURIComponent(trimmed)}`, { method: "HEAD", cache: "no-store" });
      if (!response.ok) throw new Error("not found");
      const generated = `${siteOrigin}?demo=${encodeURIComponent(trimmed)}`;
      setLink(generated);
      setCheckState("found");
      const entry: HistoryEntry = { filename: trimmed, link: generated, createdAt: Date.now() };
      const next = [entry, ...history.filter((item) => item.filename !== trimmed)].slice(0, 20);
      setHistory(next);
      saveHistory(next);
    } catch {
      setCheckState("missing");
    }
  }

  async function copyLink(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard indisponible, l’utilisateur peut copier manuellement */
    }
  }

  function removeEntry(target: string) {
    const next = history.filter((item) => item.filename !== target);
    setHistory(next);
    saveHistory(next);
  }

  function checkCode() {
    if (codeInput.trim() === ACCESS_CODE) {
      sessionStorage.setItem(UNLOCK_KEY, "1");
      setUnlocked(true);
      setCodeError(false);
    } else {
      setCodeError(true);
    }
  }

  if (!unlocked) {
    return (
      <main style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ maxWidth: 320, width: "100%", textAlign: "center" }}>
          <Lock size={28} style={{ marginBottom: 16, opacity: 0.6 }} />
          <h1 style={{ fontSize: 18, marginBottom: 16 }}>Accès restreint</h1>
          <input
            type="password"
            inputMode="numeric"
            value={codeInput}
            onChange={(event) => { setCodeInput(event.target.value); setCodeError(false); }}
            onKeyDown={(event) => event.key === "Enter" && checkCode()}
            placeholder="Code d’accès"
            autoFocus
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${codeError ? "#f85149" : "#30363d"}`, background: "#161b22", color: "#e6edf3", fontSize: 14, textAlign: "center", marginBottom: 12, boxSizing: "border-box" }}
          />
          <button
            onClick={checkCode}
            style={{ width: "100%", padding: "10px 16px", borderRadius: 8, border: "none", background: "#238636", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
          >
            Valider
          </button>
          {codeError && <p style={{ color: "#f85149", fontSize: 13, marginTop: 12 }}>Code incorrect.</p>}
          <a href="?" style={{ display: "block", marginTop: 20, color: "#8b949e", fontSize: 13, textDecoration: "none" }}>← Retour à l’atelier</a>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", background: "#0d1117", color: "#e6edf3", fontFamily: "system-ui, sans-serif", padding: "48px 20px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <a href="?" style={{ color: "#8b949e", fontSize: 13, textDecoration: "none" }}>← Retour à l’atelier</a>

        <h1 style={{ fontSize: 24, marginTop: 20, marginBottom: 4 }}>Générateur de liens de démonstration</h1>
        <p style={{ color: "#8b949e", fontSize: 14, lineHeight: 1.6, marginBottom: 28 }}>
          Déposez d’abord votre image déjà codée dans <code style={{ background: "#161b22", padding: "1px 6px", borderRadius: 4 }}>client/public</code> (via l’interface GitHub, dossier du dépôt).
          Indiquez ensuite ici le nom exact du fichier pour obtenir le lien à partager. La personne n’aura plus qu’à saisir la clé.
        </p>

        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void checkAndGenerate()}
            placeholder="ex: ford focus.png"
            style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #30363d", background: "#0d1117", color: "#e6edf3", fontSize: 14 }}
          />
          <button
            onClick={() => void checkAndGenerate()}
            disabled={!filename.trim() || checkState === "checking"}
            style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#238636", color: "white", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
          >
            {checkState === "checking" ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            Générer
          </button>
        </div>

        {checkState === "missing" && (
          <p style={{ color: "#f85149", fontSize: 13, display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
            <ImageOff size={15} /> Image introuvable. Vérifiez l’orthographe exacte (majuscules, espaces, extension) et qu’elle a bien été uploadée dans <code>client/public</code>, puis que le déploiement est terminé.
          </p>
        )}

        {checkState === "found" && link && (
          <div style={{ background: "#161b22", border: "1px solid #30363d", borderRadius: 10, padding: 16, marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: "#3fb950", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <Check size={15} /> Image trouvée, lien prêt à partager :
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <input readOnly value={link} style={{ flex: 1, padding: "8px 10px", borderRadius: 6, border: "1px solid #30363d", background: "#0d1117", color: "#e6edf3", fontSize: 13 }} />
              <button onClick={() => void copyLink(link)} style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#21262d", color: "#e6edf3", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copié" : "Copier"}
              </button>
              <a href={link} target="_blank" rel="noreferrer" style={{ padding: "8px 12px", borderRadius: 6, border: "1px solid #30363d", background: "#21262d", color: "#e6edf3", display: "flex", alignItems: "center" }}>
                <ExternalLink size={14} />
              </a>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <>
            <h2 style={{ fontSize: 15, color: "#8b949e", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 }}>Liens déjà générés</h2>
            <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {history.map((item) => (
                <li key={item.filename} style={{ display: "flex", alignItems: "center", gap: 8, background: "#161b22", border: "1px solid #30363d", borderRadius: 8, padding: "8px 10px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.filename}</div>
                    <div style={{ fontSize: 12, color: "#8b949e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.link}</div>
                  </div>
                  <button onClick={() => void copyLink(item.link)} title="Copier" style={{ padding: 6, borderRadius: 6, border: "1px solid #30363d", background: "#21262d", color: "#e6edf3", cursor: "pointer" }}>
                    <Copy size={14} />
                  </button>
                  <button onClick={() => removeEntry(item.filename)} title="Retirer de l’historique" style={{ padding: 6, borderRadius: 6, border: "1px solid #30363d", background: "#21262d", color: "#f85149", cursor: "pointer" }}>
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <p style={{ color: "#6e7681", fontSize: 12, marginTop: 32, lineHeight: 1.6 }}>
          Note : ce site étant statique (GitHub Pages), cette page ne fait qu’assembler un lien à partir d’un nom de fichier déjà présent dans le dépôt —
          elle n’envoie ni ne modifie aucune image. L’historique est stocké uniquement dans votre navigateur.
        </p>
      </div>
    </main>
  );
}
