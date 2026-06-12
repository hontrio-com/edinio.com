"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Megaphone, Plus, Pencil, Trash2, Pin, PinOff, Eye, EyeOff, ArrowLeft,
  ArrowUp, ArrowDown, X, Loader2, Type, Heading1, Image as ImageIcon,
  Video, MousePointerClick, Minus, Upload, Monitor, Smartphone,
} from "lucide-react";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { AnnouncementArticle } from "@/components/dashboard/AnnouncementArticle";
import { uploadImage } from "@/lib/upload";
import {
  createAnnouncement, updateAnnouncement, deleteAnnouncement,
  togglePublishAnnouncement, togglePinAnnouncement,
} from "@/lib/actions/announcement.actions";
import type { Announcement, AnnouncementBlock } from "@/lib/announcements";

type EditState = {
  id: string | null;
  title: string;
  excerpt: string;
  cover_url: string;
  blocks: AnnouncementBlock[];
  is_pinned: boolean;
  is_published: boolean;
};

const EMPTY: EditState = { id: null, title: "", excerpt: "", cover_url: "", blocks: [], is_pinned: false, is_published: false };

const BLOCK_BUTTONS: { type: AnnouncementBlock["type"]; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { type: "text", label: "Text", icon: Type },
  { type: "heading", label: "Titlu", icon: Heading1 },
  { type: "image", label: "Imagine", icon: ImageIcon },
  { type: "video", label: "Video", icon: Video },
  { type: "button", label: "Buton", icon: MousePointerClick },
  { type: "divider", label: "Separator", icon: Minus },
];

const inputCls = "w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900/20";

export function AdminAnnouncementsClient({ initial }: { initial: Announcement[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [saving, startSave] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  function startNew() { setEditing({ ...EMPTY, blocks: [{ type: "text", html: "" }] }); }
  function startEdit(a: Announcement) {
    setEditing({
      id: a.id, title: a.title, excerpt: a.excerpt ?? "", cover_url: a.cover_url ?? "",
      blocks: Array.isArray(a.blocks) ? a.blocks : [], is_pinned: a.is_pinned, is_published: a.is_published,
    });
  }

  async function upload(file: File): Promise<string | null> {
    if (!file.type.startsWith("image/")) { toast.error("Doar imagini."); return null; }
    if (file.size > 10 * 1024 * 1024) { toast.error("Imaginea depaseste 10MB."); return null; }
    const res = await uploadImage(file, "gallery", "announcements");
    if ("error" in res) { toast.error(res.error); return null; }
    return res.url;
  }

  // ── Block helpers ──
  function addBlock(type: AnnouncementBlock["type"]) {
    const nb: AnnouncementBlock =
      type === "heading" ? { type: "heading", text: "" } :
      type === "text" ? { type: "text", html: "" } :
      type === "image" ? { type: "image", url: "", caption: "" } :
      type === "video" ? { type: "video", url: "" } :
      type === "button" ? { type: "button", label: "", url: "" } :
      { type: "divider" };
    setEditing(e => e ? { ...e, blocks: [...e.blocks, nb] } : e);
  }
  function patchBlock(i: number, patch: Record<string, unknown>) {
    setEditing(e => e ? { ...e, blocks: e.blocks.map((b, idx) => idx === i ? ({ ...b, ...patch } as AnnouncementBlock) : b) } : e);
  }
  function moveBlock(i: number, dir: -1 | 1) {
    setEditing(e => {
      if (!e) return e;
      const j = i + dir;
      if (j < 0 || j >= e.blocks.length) return e;
      const blocks = [...e.blocks];
      [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
      return { ...e, blocks };
    });
  }
  function removeBlock(i: number) {
    setEditing(e => e ? { ...e, blocks: e.blocks.filter((_, idx) => idx !== i) } : e);
  }

  function handleSave() {
    if (!editing) return;
    if (!editing.title.trim()) { toast.error("Adauga un titlu."); return; }
    startSave(async () => {
      const payload = {
        title: editing.title, excerpt: editing.excerpt, blocks: editing.blocks,
        cover_url: editing.cover_url, is_pinned: editing.is_pinned, is_published: editing.is_published,
      };
      const res = editing.id
        ? await updateAnnouncement(editing.id, payload)
        : await createAnnouncement(payload);
      if ("error" in res) { toast.error(res.error); return; }
      toast.success(editing.id ? "Anunt actualizat." : "Anunt creat.");
      setEditing(null);
      router.refresh();
    });
  }

  async function runListAction(id: string, fn: () => Promise<{ error: string } | { success: true }>, okMsg: string) {
    setBusyId(id);
    const res = await fn();
    setBusyId(null);
    if ("error" in res) { toast.error(res.error); return; }
    toast.success(okMsg);
    router.refresh();
  }

  // ── Editor view ──
  if (editing) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <button type="button" onClick={() => setEditing(null)}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 mb-5">
          <ArrowLeft className="h-4 w-4" /> Inapoi la noutati
        </button>

        <div className="space-y-5">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Titlu</label>
            <input type="text" value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })}
              placeholder="ex: Am lansat sistemul de notificari" className={inputCls} />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Rezumat scurt (optional)</label>
            <textarea value={editing.excerpt} onChange={e => setEditing({ ...editing, excerpt: e.target.value })} rows={2}
              placeholder="Apare sub titlu in lista de noutati" className={inputCls + " resize-none"} />
          </div>

          {/* Cover */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1">Imagine de copertă (optional)</label>
            <p className="text-[11px] text-zinc-400 mb-2">Recomandat: 1600×900 px (raport 16:9) — se afiseaza complet, la fel pe toate dispozitivele.</p>
            {editing.cover_url ? (
              <div className="relative w-full max-w-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={editing.cover_url} alt="" className="w-full rounded-xl border border-zinc-200" />
                <button type="button" onClick={() => setEditing({ ...editing, cover_url: "" })}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg cursor-pointer hover:bg-zinc-50">
                {uploadTarget === "cover" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                Incarca coperta
                <input type="file" accept="image/*" className="hidden"
                  onChange={async e => {
                    const f = e.target.files?.[0]; e.target.value = "";
                    if (!f) return;
                    setUploadTarget("cover");
                    const url = await upload(f);
                    setUploadTarget(null);
                    if (url) setEditing(prev => prev ? { ...prev, cover_url: url } : prev);
                  }} />
              </label>
            )}
          </div>

          {/* Blocks */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-2">Continut</label>
            <div className="space-y-3">
              {editing.blocks.map((block, i) => (
                <div key={i} className="border border-zinc-200 rounded-xl p-3 bg-zinc-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                      {BLOCK_BUTTONS.find(b => b.type === block.type)?.label ?? block.type}
                    </span>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveBlock(i, -1)} disabled={i === 0}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-900 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => moveBlock(i, 1)} disabled={i === editing.blocks.length - 1}
                        className="p-1 rounded text-zinc-400 hover:text-zinc-900 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                      <button type="button" onClick={() => removeBlock(i)}
                        className="p-1 rounded text-zinc-400 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>

                  {block.type === "heading" && (
                    <input type="text" value={block.text} onChange={e => patchBlock(i, { text: e.target.value })}
                      placeholder="Titlu sectiune" className={inputCls} />
                  )}
                  {block.type === "text" && (
                    <RichTextEditor content={block.html} onChange={html => patchBlock(i, { html })} placeholder="Scrie textul..." />
                  )}
                  {block.type === "image" && (
                    <div className="space-y-2">
                      {block.url ? (
                        <div className="relative w-full max-w-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={block.url} alt="" className="w-full rounded-lg border border-zinc-200" />
                          <button type="button" onClick={() => patchBlock(i, { url: "" })}
                            className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/60 text-white hover:bg-black/80"><X className="h-4 w-4" /></button>
                        </div>
                      ) : (
                        <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-zinc-300 rounded-lg cursor-pointer hover:bg-zinc-50">
                          {uploadTarget === `b${i}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          Incarca imagine
                          <input type="file" accept="image/*" className="hidden"
                            onChange={async e => {
                              const f = e.target.files?.[0]; e.target.value = "";
                              if (!f) return;
                              setUploadTarget(`b${i}`);
                              const url = await upload(f);
                              setUploadTarget(null);
                              if (url) patchBlock(i, { url });
                            }} />
                        </label>
                      )}
                      <input type="text" value={block.caption ?? ""} onChange={e => patchBlock(i, { caption: e.target.value })}
                        placeholder="Descriere imagine (optional)" className={inputCls} />
                    </div>
                  )}
                  {block.type === "video" && (
                    <div>
                      <input type="text" value={block.url} onChange={e => patchBlock(i, { url: e.target.value })}
                        placeholder="Link YouTube, Vimeo, Loom sau .mp4" className={inputCls} />
                      <p className="text-[11px] text-zinc-400 mt-1">Lipeste link-ul; YouTube/Vimeo/Loom se afiseaza ca player.</p>
                    </div>
                  )}
                  {block.type === "button" && (
                    <div className="grid grid-cols-2 gap-2">
                      <input type="text" value={block.label} onChange={e => patchBlock(i, { label: e.target.value })}
                        placeholder="Text buton" className={inputCls} />
                      <input type="text" value={block.url} onChange={e => patchBlock(i, { url: e.target.value })}
                        placeholder="Link (https://...)" className={inputCls} />
                    </div>
                  )}
                  {block.type === "divider" && <hr className="border-zinc-200" />}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {BLOCK_BUTTONS.map(({ type, label, icon: Icon }) => (
                <button key={type} type="button" onClick={() => addBlock(type)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-zinc-300 rounded-lg text-zinc-600 hover:bg-zinc-50">
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Options */}
          <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-zinc-200">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.is_pinned} onChange={e => setEditing({ ...editing, is_pinned: e.target.checked })}
                className="h-4 w-4 accent-zinc-900" />
              <span className="text-sm text-zinc-700">Fixeaza sus (important)</span>
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={editing.is_published} onChange={e => setEditing({ ...editing, is_published: e.target.checked })}
                className="h-4 w-4 accent-zinc-900" />
              <span className="text-sm text-zinc-700">Publica (vizibil utilizatorilor)</span>
            </label>
          </div>

          <div className="flex flex-col sm:flex-row justify-between gap-2">
            <button type="button" onClick={() => setShowPreview(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50">
              <Eye className="h-4 w-4" /> Previzualizare
            </button>
            <div className="flex gap-2 sm:justify-end">
              <button type="button" onClick={() => setEditing(null)}
                className="px-4 py-2 text-sm font-medium border border-zinc-300 rounded-lg hover:bg-zinc-50">Anuleaza</button>
              <button type="button" onClick={handleSave} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 disabled:opacity-50">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing.is_published ? "Salveaza si publica" : "Salveaza ca draft"}
              </button>
            </div>
          </div>
        </div>

        {/* Responsive preview — exactly how users see it (desktop + mobile) */}
        {showPreview && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col" onClick={() => setShowPreview(false)}>
            <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-zinc-200" onClick={(e) => e.stopPropagation()}>
              <span className="text-sm font-semibold text-zinc-900">Previzualizare</span>
              <div className="flex items-center gap-2">
                <div className="flex bg-zinc-100 rounded-lg p-1 gap-0.5">
                  <button type="button" onClick={() => setPreviewDevice("desktop")}
                    className={`p-1.5 rounded-md transition-colors ${previewDevice === "desktop" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><Monitor className="h-4 w-4" /></button>
                  <button type="button" onClick={() => setPreviewDevice("mobile")}
                    className={`p-1.5 rounded-md transition-colors ${previewDevice === "mobile" ? "bg-white shadow text-zinc-900" : "text-zinc-500"}`}><Smartphone className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setShowPreview(false)} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100"><X className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto bg-[#FAFAFA] p-4 sm:p-8 flex justify-center" onClick={(e) => e.stopPropagation()}>
              <div className={previewDevice === "mobile" ? "w-[390px] max-w-full" : "w-full max-w-3xl"}>
                <AnnouncementArticle
                  data={{ title: editing.title, excerpt: editing.excerpt, cover_url: editing.cover_url, blocks: editing.blocks, is_pinned: editing.is_pinned }}
                  dateLabel="Acum"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-zinc-900" />
          <h1 className="text-xl font-semibold text-zinc-900">Noutati</h1>
        </div>
        <button type="button" onClick={startNew}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-zinc-900 rounded-lg hover:bg-zinc-800">
          <Plus className="h-4 w-4" /> Anunt nou
        </button>
      </div>

      {initial.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-zinc-200 rounded-2xl">
          <Megaphone className="h-8 w-8 text-zinc-300 mx-auto mb-3" />
          <p className="font-medium text-zinc-900 mb-1">Niciun anunt</p>
          <p className="text-sm text-zinc-500">Creeaza primul anunt despre platforma.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {initial.map((a) => (
            <div key={a.id} className="flex items-center gap-3 p-3 border border-zinc-200 rounded-xl bg-white">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-900 truncate">{a.title}</span>
                  {a.is_pinned && <Pin className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${a.is_published ? "bg-green-100 text-green-700" : "bg-zinc-100 text-zinc-500"}`}>
                    {a.is_published ? "Publicat" : "Draft"}
                  </span>
                </div>
                {a.excerpt && <p className="text-xs text-zinc-500 truncate mt-0.5">{a.excerpt}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button type="button" title={a.is_pinned ? "Anuleaza fixarea" : "Fixeaza sus"} disabled={busyId === a.id}
                  onClick={() => runListAction(a.id, () => togglePinAnnouncement(a.id, !a.is_pinned), a.is_pinned ? "Anulat." : "Fixat.")}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100">
                  {a.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                </button>
                <button type="button" title={a.is_published ? "Retrage" : "Publica"} disabled={busyId === a.id}
                  onClick={() => runListAction(a.id, () => togglePublishAnnouncement(a.id, !a.is_published), a.is_published ? "Retras." : "Publicat.")}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100">
                  {a.is_published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
                <button type="button" title="Editeaza" onClick={() => startEdit(a)}
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100"><Pencil className="h-4 w-4" /></button>
                {confirmDelete === a.id ? (
                  <button type="button" disabled={busyId === a.id}
                    onClick={() => { setConfirmDelete(null); runListAction(a.id, () => deleteAnnouncement(a.id), "Sters."); }}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700">Confirma</button>
                ) : (
                  <button type="button" title="Sterge" onClick={() => setConfirmDelete(a.id)}
                    className="p-2 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
