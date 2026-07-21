import type { EmailBranding } from "./config";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Merchant-branded email shell (their logo / name / color, no "Edinio" footer) —
 * the store-email replacement for the Edinio `baseTemplate`. Used only when a store
 * has opted in (custom sender configured); otherwise the Edinio shell is kept.
 */
export function storeEmailShell(branding: EmailBranding, content: string, opts?: { editable?: boolean }): string {
  const name = esc(branding.storeName);
  const color = /^#[0-9a-fA-F]{3,8}$/.test(branding.color) ? branding.color : "#1AB554";
  const url = esc(branding.storeUrl);
  const host = esc(branding.storeUrl.replace(/^https?:\/\//, ""));
  const editable = !!opts?.editable;

  const logoInner = branding.logoUrl
    ? `<img src="${esc(branding.logoUrl)}" alt="${name}" style="max-height:48px;width:auto;border:0;display:inline-block;" />`
    : `<span style="font-size:20px;font-weight:800;color:${color};">${name}</span>`;
  // In edit mode the logo is a click target (opens the media picker in the parent)
  // and no link navigates the preview away.
  const header = editable
    ? `<span data-edit="logo" title="Apasa pentru a schimba logo-ul" style="display:inline-block;">${logoInner}</span>`
    : `<a href="${url}" style="text-decoration:none;">${logoInner}</a>`;
  const footerHost = editable ? `<span style="color:${color};">${host}</span>` : `<a href="${url}" style="color:${color};text-decoration:none;">${host}</a>`;
  const editStyle = editable
    ? `<style>[contenteditable]{outline:none;border-radius:4px;transition:outline .12s;}[contenteditable]:hover{outline:2px dashed ${color};outline-offset:3px;cursor:text;}[contenteditable]:focus{outline:2px solid ${color};outline-offset:3px;}[data-edit="logo"]{cursor:pointer;}[data-edit="logo"]:hover{outline:2px dashed ${color};outline-offset:4px;}</style>`
    : "";

  return `<!DOCTYPE html>
<html lang="ro"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${name}</title>${editStyle}</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 16px;"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td align="center" style="padding-bottom:24px;">${header}</td></tr>
<tr><td style="background:#ffffff;border-radius:16px;padding:32px;border:1px solid #e4e4e7;">${content}</td></tr>
<tr><td align="center" style="padding-top:20px;"><p style="margin:0;font-size:12px;color:#a1a1aa;">${name} &middot; ${footerHost}</p></td></tr>
</table></td></tr></table></body></html>`;
}
