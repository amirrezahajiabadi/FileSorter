import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PDFDocument, PageSizes } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { SaveImagesReport } from "./types";
import { fmt, getStrings, type Locale } from "./i18n";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface ImageItem {
  id: string;
  path: string;
  name: string;
  size: number;
  previewUrl: string;
}

interface PdfMetadata {
  path: string;
  name: string;
  size: number;
  numPages: number;
  bytes: Uint8Array;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n;
  let i = -1;
  do {
    v /= 1024;
    i++;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export default function PdfStudio({ lang }: { lang: Locale }) {
  const t = getStrings(lang);
  const [mode, setMode] = useState<"img2pdf" | "pdf2img">("img2pdf");

  // ── Images to PDF State ───────────────────────────────────────────
  const [images, setImages] = useState<ImageItem[]>([]);
  const [pageSize, setPageSize] = useState<"fit" | "a4-portrait" | "a4-landscape">("fit");
  const [margin, setMargin] = useState<number>(0);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfSuccess, setPdfSuccess] = useState<{ path: string; size: number } | null>(null);

  // ── PDF to Images State ───────────────────────────────────────────
  const [pdfMeta, setPdfMeta] = useState<PdfMetadata | null>(null);
  const [outputFolder, setOutputFolder] = useState<string>("");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [scale, setScale] = useState<number>(2.0);
  const [pageRange, setPageRange] = useState<string>("all");
  const [extracting, setExtracting] = useState(false);
  const [extractProgress, setExtractProgress] = useState<{ current: number; total: number } | null>(null);
  const [extractedReport, setExtractedReport] = useState<SaveImagesReport | null>(null);
  const [extractedThumbnails, setExtractedThumbnails] = useState<string[]>([]);

  const [error, setError] = useState<string>("");

  // Clean up object URLs on unmount
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => {
    return () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  // ── Action: Pick Images ───────────────────────────────────────────
  const pickImages = async () => {
    setError("");
    setPdfSuccess(null);
    try {
      const paths = await invoke<string[] | null>("pick_image_files");
      if (!paths || paths.length === 0) return;

      const newItems: ImageItem[] = [];
      for (const path of paths) {
        // Avoid duplicate paths in selection
        if (images.some((im) => im.path === path)) continue;

        try {
          const bytes = await invoke<number[]>("read_file_binary", { path });
          const u8 = new Uint8Array(bytes);
          const ext = path.split(".").pop()?.toLowerCase() || "png";
          const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
          const blob = new Blob([u8], { type: mime });
          const previewUrl = URL.createObjectURL(blob);
          const name = path.replace(/\\/g, "/").split("/").pop() || "image";

          newItems.push({
            id: `${path}_${Date.now()}_${Math.random()}`,
            path,
            name,
            size: u8.length,
            previewUrl,
          });
        } catch (e) {
          console.error("Failed reading image:", path, e);
        }
      }

      setImages((prev) => [...prev, ...newItems]);
    } catch (e) {
      setError(String(e));
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  };

  const moveImage = (index: number, direction: "up" | "down") => {
    setImages((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const clearAllImages = () => {
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    setImages([]);
    setPdfSuccess(null);
  };

  // ── Convert Images to PDF ─────────────────────────────────────────
  const convertImagesToPdf = async () => {
    if (images.length === 0) return;
    setError("");
    setGeneratingPdf(true);
    setPdfSuccess(null);

    try {
      const defaultName = images[0].name.replace(/\.[^.]+$/, "") + "_compiled.pdf";
      const savePath = await invoke<string | null>("pick_save_pdf", { defaultName });
      if (!savePath) {
        setGeneratingPdf(false);
        return;
      }

      const pdfDoc = await PDFDocument.create();

      for (const item of images) {
        const bytes = await invoke<number[]>("read_file_binary", { path: item.path });
        const u8 = new Uint8Array(bytes);
        const ext = item.path.split(".").pop()?.toLowerCase();

        let embeddedImage;
        if (ext === "jpg" || ext === "jpeg") {
          embeddedImage = await pdfDoc.embedJpg(u8);
        } else if (ext === "png") {
          try {
            embeddedImage = await pdfDoc.embedPng(u8);
          } catch {
            // If png embedding fails (e.g. non-standard colorspace), render via canvas
            embeddedImage = await renderImageViaCanvas(u8, pdfDoc);
          }
        } else {
          // WebP, BMP, GIF, etc. -> convert to JPEG/PNG via canvas
          embeddedImage = await renderImageViaCanvas(u8, pdfDoc);
        }

        const imgWidth = embeddedImage.width;
        const imgHeight = embeddedImage.height;

        let pageWidth = imgWidth;
        let pageHeight = imgHeight;

        if (pageSize === "a4-portrait") {
          pageWidth = PageSizes.A4[0];
          pageHeight = PageSizes.A4[1];
        } else if (pageSize === "a4-landscape") {
          pageWidth = PageSizes.A4[1];
          pageHeight = PageSizes.A4[0];
        }

        const page = pdfDoc.addPage([pageWidth, pageHeight]);
        const availWidth = pageWidth - margin * 2;
        const availHeight = pageHeight - margin * 2;

        // Scale image to fit inside available area preserving aspect ratio
        const scaleFactor = Math.min(availWidth / imgWidth, availHeight / imgHeight, 1);
        const finalWidth = imgWidth * scaleFactor;
        const finalHeight = imgHeight * scaleFactor;

        const x = margin + (availWidth - finalWidth) / 2;
        const y = margin + (availHeight - finalHeight) / 2;

        page.drawImage(embeddedImage, {
          x,
          y,
          width: finalWidth,
          height: finalHeight,
        });
      }

      const pdfBytes = await pdfDoc.save();
      await invoke("write_file_binary", {
        path: savePath,
        data: Array.from(pdfBytes),
      });

      setPdfSuccess({ path: savePath, size: pdfBytes.length });
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Helper to convert arbitrary image formats to embeddable JPEG
  const renderImageViaCanvas = async (u8: Uint8Array, pdfDoc: PDFDocument) => {
    const blob = new Blob([u8.buffer as ArrayBuffer]);
    const url = URL.createObjectURL(blob);
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = url;
    });
    URL.revokeObjectURL(url);

    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);

    const jpegBlob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/jpeg", 0.95));
    const ab = await jpegBlob.arrayBuffer();
    return await pdfDoc.embedJpg(new Uint8Array(ab));
  };

  // ── Action: Pick PDF ──────────────────────────────────────────────
  const pickPdf = async () => {
    setError("");
    setExtractedReport(null);
    setExtractedThumbnails([]);
    try {
      const path = await invoke<string | null>("pick_pdf_file");
      if (!path) return;

      const bytes = await invoke<number[]>("read_file_binary", { path });
      const u8 = new Uint8Array(bytes);

      // pdf.js transfers whatever buffer it is handed to its worker, which
      // detaches it. Keeping `u8` pristine means the true size is shown and
      // "Extract Pages" can still read the document later.
      const loadingTask = pdfjsLib.getDocument({ data: u8.slice() });
      const pdf = await loadingTask.promise;

      const name = path.replace(/\\/g, "/").split("/").pop() || "document.pdf";
      const dir = path.replace(/\\/g, "/").split("/").slice(0, -1).join("/") || "";

      setPdfMeta({
        path,
        name,
        size: u8.length,
        numPages: pdf.numPages,
        bytes: u8,
      });

      setOutputFolder(dir);
    } catch (e) {
      setError("Could not parse PDF: " + String(e));
    }
  };

  const pickFolder = async () => {
    try {
      const folder = await invoke<string | null>("pick_output_folder");
      if (folder) setOutputFolder(folder);
    } catch (e) {
      setError(String(e));
    }
  };

  // ── Extract Pages as Images ───────────────────────────────────────
  const extractPdfPages = async () => {
    if (!pdfMeta) return;
    setError("");
    setExtracting(true);
    setExtractedReport(null);
    setExtractedThumbnails([]);

    try {
      const targetDir = outputFolder || pdfMeta.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
      // Same transfer/detach rule as pickPdf: work on a copy so extracting
      // twice (or re-extracting after changing the range) still works.
      const loadingTask = pdfjsLib.getDocument({ data: pdfMeta.bytes.slice() });
      const pdf = await loadingTask.promise;

      // Parse page ranges (e.g. "all", or "1, 3-5")
      const pagesToExtract: number[] = [];
      if (pageRange.trim().toLowerCase() === "all" || !pageRange.trim()) {
        for (let i = 1; i <= pdf.numPages; i++) pagesToExtract.push(i);
      } else {
        const parts = pageRange.split(",");
        for (const part of parts) {
          const clean = part.trim();
          if (clean.includes("-")) {
            const [s, e] = clean.split("-").map((x) => parseInt(x.trim(), 10));
            if (!isNaN(s) && !isNaN(e)) {
              for (let i = Math.max(1, s); i <= Math.min(pdf.numPages, e); i++) {
                if (!pagesToExtract.includes(i)) pagesToExtract.push(i);
              }
            }
          } else {
            const p = parseInt(clean, 10);
            if (!isNaN(p) && p >= 1 && p <= pdf.numPages && !pagesToExtract.includes(p)) {
              pagesToExtract.push(p);
            }
          }
        }
      }

      if (pagesToExtract.length === 0) {
        throw new Error("No valid pages selected for extraction.");
      }

      const baseName = pdfMeta.name.replace(/\.[^.]+$/, "");
      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const ext = format === "png" ? "png" : "jpg";

      const imagesToSave: { filename: string; data: number[] }[] = [];
      const newThumbs: string[] = [];

      for (let idx = 0; idx < pagesToExtract.length; idx++) {
        const pageNum = pagesToExtract[idx];
        setExtractProgress({ current: idx + 1, total: pagesToExtract.length });

        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const ctx = canvas.getContext("2d")!;

        // Render page to canvas
        const renderContext = { canvasContext: ctx, canvas, viewport };
        await page.render(renderContext).promise;

        const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), mimeType, 0.95));
        const ab = await blob.arrayBuffer();

        // Thumbnail for preview (first 12 pages)
        if (newThumbs.length < 12) {
          newThumbs.push(canvas.toDataURL("image/jpeg", 0.7));
        }

        imagesToSave.push({
          filename: `${baseName}_page_${pageNum.toString().padStart(3, "0")}.${ext}`,
          data: Array.from(new Uint8Array(ab)),
        });
      }

      const report = await invoke<SaveImagesReport>("save_extracted_images", {
        targetDir,
        images: imagesToSave,
      });

      setExtractedReport(report);
      setExtractedThumbnails(newThumbs);
    } catch (e) {
      setError(String(e));
    } finally {
      setExtracting(false);
      setExtractProgress(null);
    }
  };

  const openPath = (path: string) => {
    invoke("open_in_file_manager", { path }).catch(console.error);
  };

  return (
    <div className="pdf-studio-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Top Mode Selector Tabs */}
      <section className="glass" style={{ padding: "18px 24px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>{t.ps_title}</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              {t.ps_desc}
            </p>
          </div>

          <div className="pdf-mode-switch" style={{ display: "flex", background: "rgba(255,255,255,0.06)", padding: "4px", borderRadius: "100px", border: "1px solid rgba(255,255,255,0.1)" }}>
            <button
              type="button"
              className={`capsule-tab ${mode === "img2pdf" ? "active" : ""}`}
              onClick={() => { setMode("img2pdf"); setError(""); }}
              style={{ padding: "8px 18px", borderRadius: "100px" }}
            >
              <span className="tab-icon">🖼️</span>
              <span className="tab-label">{t.ps_mode_img2pdf}</span>
            </button>
            <button
              type="button"
              className={`capsule-tab ${mode === "pdf2img" ? "active" : ""}`}
              onClick={() => { setMode("pdf2img"); setError(""); }}
              style={{ padding: "8px 18px", borderRadius: "100px" }}
            >
              <span className="tab-icon">📄</span>
              <span className="tab-label">{t.ps_mode_pdf2img}</span>
            </button>
          </div>
        </div>
      </section>

      {error && (
        <div className="error-bar" role="alert" onClick={() => setError("")} style={{ margin: 0 }}>
          <span>⚠️ {error}</span>
          <span style={{ fontSize: "12px", opacity: 0.8, cursor: "pointer" }}>✕</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODE 1: IMAGES TO PDF
      ══════════════════════════════════════════════════════════════════ */}
      {mode === "img2pdf" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Header Action Card */}
          <section className="glass" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <button
                  type="button"
                  className="hero-browse-btn"
                  onClick={pickImages}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 20px" }}
                >
                  <span>➕</span>
                  <span>{t.ps_add_images}</span>
                </button>
                {images.length > 0 && (
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={clearAllImages}
                    style={{ padding: "8px 14px" }}
                  >
                    <span>{t.ps_clear_all}</span>
                  </button>
                )}
              </div>

              {images.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "0.9rem" }}>
                  <span className="badge">
                    {images.length} {images.length === 1 ? t.ps_page_singular : t.ps_page_plural}
                  </span>
                  <span className="muted">
                    {t.ps_total} {formatBytes(images.reduce((acc, i) => acc + i.size, 0))}
                  </span>
                </div>
              )}
            </div>

            {/* Layout Options */}
            {images.length > 0 && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>{t.ps_page_size}</span>
                  <select
                    className="select-input"
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as any)}
                    
                  >
                    <option value="fit">{t.ps_page_fit}</option>
                    <option value="a4-portrait">{t.ps_page_a4p}</option>
                    <option value="a4-landscape">{t.ps_page_a4l}</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>{t.ps_margins}</span>
                  <select
                    className="select-input"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    
                  >
                    <option value={0}>{t.ps_margin_none}</option>
                    <option value={15}>{t.ps_margin_small}</option>
                    <option value={30}>{t.ps_margin_normal}</option>
                  </select>
                </div>

                <div style={{ marginLeft: "auto" }}>
                  <button
                    type="button"
                    className="hero-browse-btn"
                    onClick={convertImagesToPdf}
                    disabled={generatingPdf}
                    style={{
                      
                      padding: "10px 24px",
                      fontWeight: 600,
                    }}
                  >
                    {generatingPdf ? t.ps_building : t.ps_export}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Success Banner */}
          {pdfSuccess && (
            <section className="glass" style={{ padding: "18px 24px", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.08)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
                <div>
                  <h4 style={{ margin: 0, color: "#4ade80", fontSize: "1.05rem" }}>{t.ps_created}</h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem", wordBreak: "break-all" }}>
                    {t.ps_saved_to} <code style={{ color: "inherit" }}>{pdfSuccess.path}</code> ({formatBytes(pdfSuccess.size)})
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfSuccess.path)}
                    style={{ padding: "8px 16px" }}
                  >
                    <span>{t.ps_open_pdf}</span>
                  </button>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfSuccess.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/"))}
                    style={{ padding: "8px 16px" }}
                  >
                    <span>{t.ps_reveal}</span>
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* Images Grid */}
          {images.length === 0 ? (
            <section
              className="glass"
              onClick={pickImages}
              style={{
                padding: "60px 24px",
                textAlign: "center",
                cursor: "pointer",
                border: "2px dashed rgba(255,255,255,0.12)",
                borderRadius: "16px",
              }}
            >
              <div style={{ fontSize: "3rem", marginBottom: "12px", opacity: 0.8 }}>🖼️</div>
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>{t.ps_no_images_title}</h3>
              <p className="muted" style={{ margin: "6px auto 16px", maxWidth: "420px", fontSize: "0.88rem" }}>
                {t.ps_no_images_desc}
              </p>
              <button type="button" className="hero-browse-btn" style={{ padding: "10px 22px" }}>
                {t.ps_add_images}
              </button>
            </section>
          ) : (
            <section className="glass" style={{ padding: "20px 24px" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                  gap: "16px",
                }}
              >
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: "12px",
                      overflow: "hidden",
                      display: "flex",
                      flexDirection: "column",
                      position: "relative",
                    }}
                  >
                    {/* Page badge */}
                    <div
                      style={{
                        position: "absolute",
                        top: "8px",
                        left: "8px",
                        background: "rgba(0,0,0,0.65)",
                        backdropFilter: "blur(4px)",
                        color: "#fff",
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "100px",
                        fontWeight: 600,
                        zIndex: 2,
                      }}
                    >
                      #{idx + 1}
                    </div>

                    {/* Image Preview Container */}
                    <div style={{ width: "100%", height: "140px", background: "rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                      <img
                        src={img.previewUrl}
                        alt={img.name}
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      />
                    </div>

                    {/* Details & Actions */}
                    <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "8px", flex: 1, justifyContent: "space-between" }}>
                      <div>
                        <div
                          title={img.name}
                          style={{
                            fontSize: "0.82rem",
                            fontWeight: 600,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {img.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", opacity: 0.6, marginTop: "2px" }}>
                          {formatBytes(img.size)}
                        </div>
                      </div>

                      {/* Reorder & Delete Buttons */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: "6px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <button
                            type="button"
                            className="capsule-btn-icon"
                            onClick={() => moveImage(idx, "up")}
                            disabled={idx === 0}
                            title={t.ps_move_earlier}
                            style={{ width: "26px", height: "26px", fontSize: "0.75rem", opacity: idx === 0 ? 0.3 : 1 }}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className="capsule-btn-icon"
                            onClick={() => moveImage(idx, "down")}
                            disabled={idx === images.length - 1}
                            title={t.ps_move_later}
                            style={{ width: "26px", height: "26px", fontSize: "0.75rem", opacity: idx === images.length - 1 ? 0.3 : 1 }}
                          >
                            ▶
                          </button>
                        </div>

                        <button
                          type="button"
                          className="capsule-btn-icon"
                          onClick={() => removeImage(img.id)}
                          title={t.ps_remove_image}
                          style={{ width: "26px", height: "26px", fontSize: "0.8rem", color: "#f87171" }}
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          MODE 2: PDF TO IMAGES
      ══════════════════════════════════════════════════════════════════ */}
      {mode === "pdf2img" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* PDF Selector Card */}
          <section className="glass" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>{t.ps_select_pdf}</h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                  {t.ps_select_pdf_desc}
                </p>
              </div>

              <button
                type="button"
                className="hero-browse-btn"
                onClick={pickPdf}
                style={{ padding: "10px 22px" }}
              >
                <span>{t.ps_choose_pdf}</span>
              </button>
            </div>

            {/* Document Info Banner if chosen */}
            {pdfMeta && (
              <div
                style={{
                  marginTop: "20px",
                  padding: "16px 20px",
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: "12px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "12px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ fontSize: "2rem" }}>📄</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{pdfMeta.name}</div>
                    <div style={{ fontSize: "0.8rem", opacity: 0.7, marginTop: "2px" }}>
                      {pdfMeta.numPages} {pdfMeta.numPages === 1 ? t.ps_page_singular : t.ps_page_plural} · {formatBytes(pdfMeta.size)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfMeta.path)}
                    title={t.ps_open_pdf_doc}
                    style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                  >
                    <span>{t.ps_preview}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Extraction Settings */}
          {pdfMeta && (
            <section className="glass" style={{ padding: "24px" }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 600 }}>{t.ps_extract_settings}</h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                {/* Format selection */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    {t.ps_image_format}
                  </label>
                  <select
                    className="select-input"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  >
                    <option value="png">{t.ps_fmt_png}</option>
                    <option value="jpeg">{t.ps_fmt_jpeg}</option>
                  </select>
                </div>

                {/* Resolution / DPI */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    {t.ps_res_scale}
                  </label>
                  <select
                    className="select-input"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  >
                    <option value={1.5}>{t.ps_res_150}</option>
                    <option value={2.0}>{t.ps_res_200}</option>
                    <option value={3.0}>{t.ps_res_300}</option>
                  </select>
                </div>

                {/* Page range */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    {t.ps_page_range_label}
                  </label>
                  <input
                    type="text"
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    placeholder="all"
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  />
                </div>
              </div>

              {/* Destination folder */}
              <div style={{ marginTop: "20px" }}>
                <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                  {t.ps_dest_folder}
                </label>
                <div style={{ display: "flex", gap: "10px" }}>
                  <input
                    type="text"
                    readOnly
                    value={outputFolder}
                    style={{ flex: 1, background: "rgba(255,255,255,0.05)", color: "inherit", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  />
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={pickFolder}
                    style={{ padding: "8px 16px" }}
                  >
                    {t.common_change}
                  </button>
                </div>
              </div>

              {/* Extraction Trigger */}
              <div style={{ marginTop: "24px", display: "flex", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="hero-browse-btn"
                  onClick={extractPdfPages}
                  disabled={extracting}
                  style={{
                    
                    padding: "11px 26px",
                    fontWeight: 600,
                  }}
                >
                  {extracting
                    ? `${t.ps_extracting} ${extractProgress ? `(${extractProgress.current}/${extractProgress.total})` : "…"}`
                    : fmt(t.ps_extract_btn, { count: pdfMeta.numPages })}
                </button>
              </div>
            </section>
          )}

          {/* Success Banner & Extracted Gallery */}
          {extractedReport && (
            <section className="glass" style={{ padding: "20px 24px", border: "1px solid rgba(34,197,94,0.3)", background: "rgba(34,197,94,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <h4 style={{ margin: 0, color: "#4ade80", fontSize: "1.05rem" }}>
                    {fmt(t.ps_extracted_ok, { count: extractedReport.saved_count })}
                  </h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                    {fmt(t.ps_saved_size_to, { size: formatBytes(extractedReport.total_bytes) })} <code>{extractedReport.target_dir}</code>
                  </p>
                </div>
                <button
                  type="button"
                  className="hero-browse-btn"
                  onClick={() => openPath(extractedReport.target_dir)}
                  style={{ padding: "8px 18px", fontSize: "0.88rem" }}
                >
                  {t.ps_open_dest}
                </button>
              </div>

              {/* Extracted preview gallery */}
              {extractedThumbnails.length > 0 && (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: "12px",
                    marginTop: "16px",
                    paddingTop: "16px",
                    borderTop: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {extractedThumbnails.map((thumb, i) => (
                    <div
                      key={i}
                      style={{
                        borderRadius: "8px",
                        overflow: "hidden",
                        background: "rgba(0,0,0,0.3)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        height: "120px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <img
                        src={thumb}
                        alt={fmt(t.ps_page_alt, { n: i + 1 })}
                        style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
