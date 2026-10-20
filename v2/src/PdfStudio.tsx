import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PDFDocument, PageSizes } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { SaveImagesReport } from "./types";

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

export default function PdfStudio() {
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

      const loadingTask = pdfjsLib.getDocument({ data: u8 });
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
      const loadingTask = pdfjsLib.getDocument({ data: pdfMeta.bytes });
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
            <h2 style={{ margin: 0, fontSize: "1.3rem", fontWeight: 700, letterSpacing: "-0.02em" }}>📑 PDF Studio</h2>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.88rem" }}>
              Convert images into PDF documents or extract all pages as high-resolution image files.
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
              <span className="tab-label">Images to PDF</span>
            </button>
            <button
              type="button"
              className={`capsule-tab ${mode === "pdf2img" ? "active" : ""}`}
              onClick={() => { setMode("pdf2img"); setError(""); }}
              style={{ padding: "8px 18px", borderRadius: "100px" }}
            >
              <span className="tab-icon">📄</span>
              <span className="tab-label">PDF to Images</span>
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
                  <span>Add Images</span>
                </button>
                {images.length > 0 && (
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={clearAllImages}
                    style={{ padding: "8px 14px" }}
                  >
                    <span>🗑️ Clear All</span>
                  </button>
                )}
              </div>

              {images.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "0.9rem" }}>
                  <span className="badge" style={{ padding: "6px 12px", borderRadius: "100px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)" }}>
                    {images.length} {images.length === 1 ? "page" : "pages"}
                  </span>
                  <span className="muted">
                    Total: {formatBytes(images.reduce((acc, i) => acc + i.size, 0))}
                  </span>
                </div>
              )}
            </div>

            {/* Layout Options */}
            {images.length > 0 && (
              <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Page Size:</span>
                  <select
                    className="select-input"
                    value={pageSize}
                    onChange={(e) => setPageSize(e.target.value as any)}
                    style={{ background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 12px", outline: "none" }}
                  >
                    <option value="fit">Fit to Image Size</option>
                    <option value="a4-portrait">Standard A4 Portrait</option>
                    <option value="a4-landscape">Standard A4 Landscape</option>
                  </select>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <span style={{ fontSize: "0.85rem", opacity: 0.8 }}>Margins:</span>
                  <select
                    className="select-input"
                    value={margin}
                    onChange={(e) => setMargin(Number(e.target.value))}
                    style={{ background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "6px 12px", outline: "none" }}
                  >
                    <option value={0}>None (Full Bleed)</option>
                    <option value={15}>Small (15 pt)</option>
                    <option value={30}>Normal (30 pt)</option>
                  </select>
                </div>

                <div style={{ marginLeft: "auto" }}>
                  <button
                    type="button"
                    className="hero-browse-btn"
                    onClick={convertImagesToPdf}
                    disabled={generatingPdf}
                    style={{
                      background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
                      color: "#fff",
                      boxShadow: "0 4px 16px rgba(99,102,241,0.4)",
                      padding: "10px 24px",
                      fontWeight: 600,
                    }}
                  >
                    {generatingPdf ? "⏳ Building PDF…" : "⚡ Export to PDF"}
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
                  <h4 style={{ margin: 0, color: "#4ade80", fontSize: "1.05rem" }}>✓ PDF Successfully Created!</h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem", wordBreak: "break-all" }}>
                    Saved to: <code style={{ color: "inherit" }}>{pdfSuccess.path}</code> ({formatBytes(pdfSuccess.size)})
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfSuccess.path)}
                    style={{ padding: "8px 16px" }}
                  >
                    <span>👁️ Open PDF</span>
                  </button>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfSuccess.path.replace(/\\/g, "/").split("/").slice(0, -1).join("/"))}
                    style={{ padding: "8px 16px" }}
                  >
                    <span>📁 Reveal in Folder</span>
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
              <h3 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 600 }}>No images added yet</h3>
              <p className="muted" style={{ margin: "6px auto 16px", maxWidth: "420px", fontSize: "0.88rem" }}>
                Click to browse JPG, PNG, WebP or BMP images to compile into a single PDF document.
              </p>
              <button type="button" className="hero-browse-btn" style={{ padding: "10px 22px" }}>
                Add Images
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
                            title="Move Earlier"
                            style={{ width: "26px", height: "26px", fontSize: "0.75rem", opacity: idx === 0 ? 0.3 : 1 }}
                          >
                            ◀
                          </button>
                          <button
                            type="button"
                            className="capsule-btn-icon"
                            onClick={() => moveImage(idx, "down")}
                            disabled={idx === images.length - 1}
                            title="Move Later"
                            style={{ width: "26px", height: "26px", fontSize: "0.75rem", opacity: idx === images.length - 1 ? 0.3 : 1 }}
                          >
                            ▶
                          </button>
                        </div>

                        <button
                          type="button"
                          className="capsule-btn-icon"
                          onClick={() => removeImage(img.id)}
                          title="Remove Image"
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
                <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 600 }}>Select PDF Document</h3>
                <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                  Choose any PDF to render and extract each page as high-res PNG or JPEG image.
                </p>
              </div>

              <button
                type="button"
                className="hero-browse-btn"
                onClick={pickPdf}
                style={{ padding: "10px 22px" }}
              >
                <span>📂 Choose PDF</span>
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
                      {pdfMeta.numPages} {pdfMeta.numPages === 1 ? "page" : "pages"} · {formatBytes(pdfMeta.size)}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <button
                    type="button"
                    className="capsule-btn-pill"
                    onClick={() => openPath(pdfMeta.path)}
                    title="Open PDF Document"
                    style={{ padding: "6px 14px", fontSize: "0.82rem" }}
                  >
                    <span>👁️ Preview</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Extraction Settings */}
          {pdfMeta && (
            <section className="glass" style={{ padding: "24px" }}>
              <h4 style={{ margin: "0 0 16px", fontSize: "1rem", fontWeight: 600 }}>Extraction Settings</h4>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "20px" }}>
                {/* Format selection */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    Image Format:
                  </label>
                  <select
                    className="select-input"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  >
                    <option value="png">PNG (Lossless High Quality)</option>
                    <option value="jpeg">JPEG (Compact File Size)</option>
                  </select>
                </div>

                {/* Resolution / DPI */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    Resolution Scale:
                  </label>
                  <select
                    className="select-input"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    style={{ width: "100%", background: "rgba(255,255,255,0.08)", color: "inherit", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "8px", padding: "8px 12px", outline: "none" }}
                  >
                    <option value={1.5}>Standard Quality (150 DPI)</option>
                    <option value={2.0}>High Quality (200 DPI - Recommended)</option>
                    <option value={3.0}>Ultra Crisp (300 DPI - Print Ready)</option>
                  </select>
                </div>

                {/* Page range */}
                <div>
                  <label style={{ display: "block", fontSize: "0.85rem", opacity: 0.8, marginBottom: "8px" }}>
                    Page Range (e.g. <code>all</code> or <code>1-3, 5</code>):
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
                  Destination Folder:
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
                    📁 Change
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
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    color: "#fff",
                    boxShadow: "0 4px 16px rgba(16,185,129,0.35)",
                    padding: "11px 26px",
                    fontWeight: 600,
                  }}
                >
                  {extracting
                    ? `⏳ Extracting ${extractProgress ? `(${extractProgress.current}/${extractProgress.total})` : "…"}`
                    : `⚡ Extract Pages (${pdfMeta.numPages})`}
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
                    ✓ Successfully Extracted {extractedReport.saved_count} Images!
                  </h4>
                  <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.85rem" }}>
                    Saved {formatBytes(extractedReport.total_bytes)} to: <code>{extractedReport.target_dir}</code>
                  </p>
                </div>
                <button
                  type="button"
                  className="hero-browse-btn"
                  onClick={() => openPath(extractedReport.target_dir)}
                  style={{ padding: "8px 18px", fontSize: "0.88rem" }}
                >
                  📁 Open Destination Folder
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
                        alt={`Page ${i + 1}`}
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
