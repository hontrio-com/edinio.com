"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, CheckCircle, Plug, RefreshCw, Users, ExternalLink } from "lucide-react";
import {
  connectBrevo, disconnectBrevo, getBrevoLists,
  saveBrevoSettings, syncExistingCustomers,
} from "@/lib/actions/brevo.actions";
import type { BrevoPublicConfig, BrevoList } from "@/lib/brevo";

const inputCls =
  "w-full px-3 py-2.5 text-sm border border-border rounded-lg bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-colors";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className={`relative w-9 h-5 rounded-full transition-colors flex-shrink-0 ${checked ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

export function BrevoClient({ businessId, initialConfig }: { businessId: string; initialConfig: BrevoPublicConfig }) {
  const [config, setConfig] = useState<BrevoPublicConfig>(initialConfig);
  const [apiKey, setApiKey] = useState("");
  const [lists, setLists] = useState<BrevoList[]>([]);
  const [listsLoaded, setListsLoaded] = useState(false);

  // Editable draft (persisted on "Salveaza").
  const [listId, setListId] = useState(initialConfig.list_id != null ? String(initialConfig.list_id) : "");
  const [checkoutSource, setCheckoutSource] = useState(initialConfig.sources.checkout);
  const [ecommerceSync, setEcommerceSync] = useState(initialConfig.ecommerce_sync);

  const [connecting, startConnect] = useTransition();
  const [saving, startSave] = useTransition();
  const [syncing, startSync] = useTransition();
  const [loadingLists, startLists] = useTransition();

  function connect() {
    if (!apiKey.trim()) { toast.error("Introdu cheia API Brevo."); return; }
    startConnect(async () => {
      const res = await connectBrevo(businessId, apiKey.trim());
      if ("error" in res) { toast.error(res.error); return; }
      setConfig(res.config);
      setLists(res.lists);
      setListsLoaded(true);
      setApiKey("");
      toast.success(`Conectat la Brevo${res.config.account_name ? ` (${res.config.account_name})` : ""}.`);
    });
  }

  function reloadLists() {
    startLists(async () => {
      const res = await getBrevoLists(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      setLists(res.lists);
      setListsLoaded(true);
      if (res.lists.length === 0) toast.info("Contul nu are nicio lista. Creeaza una in Brevo.");
    });
  }

  function save() {
    startSave(async () => {
      const selected = lists.find((l) => String(l.id) === listId);
      const res = await saveBrevoSettings(businessId, {
        list_id: listId ? Number(listId) : undefined,
        list_name: selected?.name ?? config.list_name,
        sources: { checkout: checkoutSource },
        ecommerce_sync: ecommerceSync,
      });
      if ("error" in res) { toast.error(res.error); return; }
      setConfig(res.config);
      toast.success("Setari salvate.");
    });
  }

  function disconnect() {
    startSave(async () => {
      const res = await disconnectBrevo(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      setConfig({ ...config, enabled: false, connected: false, account_name: undefined, account_email: undefined, list_id: undefined, list_name: undefined });
      setLists([]);
      setListsLoaded(false);
      setListId("");
      toast.success("Cont Brevo deconectat.");
    });
  }

  function syncCustomers() {
    startSync(async () => {
      const res = await syncExistingCustomers(businessId);
      if ("error" in res) { toast.error(res.error); return; }
      if (res.total === 0) { toast.info("Nu exista clienti cu email de sincronizat."); return; }
      toast.success(`Sincronizare pornita pentru ${res.total} contacte. Apar in lista dupa procesarea in Brevo.`);
      setConfig({ ...config, last_sync_at: new Date().toISOString() });
    });
  }

  const hasList = config.list_id != null;

  return (
    <div className="p-6 max-w-2xl">
      <Link href="/dashboard/features" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" /> Inapoi la integrari
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="w-11 h-11 rounded-xl border border-border bg-surface flex items-center justify-center p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/integrations/brevo.svg" alt="Brevo" className="w-full h-full object-contain" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Brevo</h1>
          <p className="text-sm text-muted-foreground">Sincronizeaza contactele in contul tau si trimite campanii din Brevo.</p>
        </div>
      </div>

      <div className="mt-6 p-4 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground leading-relaxed">
        Conectezi <span className="font-medium text-foreground">contul tau</span> de Brevo. Contactele stranse din magazin ajung in lista ta,
        iar campaniile de email le compui si le trimiti direct in Brevo (pe contul si costul tau). Edinio nu trimite emailurile in locul tau.
      </div>

      {/* Connection */}
      {config.connected ? (
        <div className="mt-6 flex items-center justify-between gap-3 p-4 rounded-xl border border-green-200 bg-green-50">
          <div className="flex items-center gap-2.5 min-w-0">
            <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">Conectat</p>
              <p className="text-xs text-muted-foreground truncate">{config.account_name || config.account_email || "Cont Brevo"}</p>
            </div>
          </div>
          <button type="button" onClick={disconnect} disabled={saving}
            className="text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-50 flex-shrink-0">
            Deconecteaza
          </button>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Cheie API Brevo</label>
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
              placeholder="ex: xkeysib-..." className={inputCls} autoComplete="off" />
            <p className="text-[11px] text-muted-foreground mt-1.5 inline-flex items-center gap-1">
              O gasesti in Brevo la SMTP &amp; API &gt; API Keys.
              <a href="https://app.brevo.com/settings/keys/api" target="_blank" rel="noopener noreferrer"
                className="text-primary font-medium inline-flex items-center gap-0.5">Deschide <ExternalLink className="h-3 w-3" /></a>
            </p>
          </div>
          <button type="button" onClick={connect} disabled={connecting}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
            Conecteaza contul
          </button>
        </div>
      )}

      {/* Settings (only when connected) */}
      {config.connected && (
        <div className="mt-6 space-y-5">
          {/* List picker */}
          <div className="p-4 rounded-xl border border-border space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-foreground">Lista de contacte</label>
              <button type="button" onClick={reloadLists} disabled={loadingLists}
                className="text-xs font-medium text-primary inline-flex items-center gap-1 disabled:opacity-50">
                {loadingLists ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {listsLoaded ? "Reincarca" : "Incarca listele"}
              </button>
            </div>
            {listsLoaded && lists.length > 0 ? (
              <select value={listId} onChange={(e) => setListId(e.target.value)} className={inputCls}>
                <option value="">Alege o lista...</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>{l.name} ({l.member_count} contacte)</option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-muted-foreground">
                {hasList
                  ? `Lista curenta: ${config.list_name ?? ""}. Apasa Reincarca pentru a o schimba.`
                  : "Apasa Incarca listele pentru a alege lista in care se adauga contactele."}
              </p>
            )}
          </div>

          {/* Options */}
          <div className="p-4 rounded-xl border border-border space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Abonare la finalizarea comenzii</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Cand clientul bifeaza casuta de abonare la checkout, emailul lui intra in lista.</p>
              </div>
              <Toggle checked={checkoutSource} onChange={setCheckoutSource} />
            </div>

            <div className="flex items-start justify-between gap-3 pt-3 border-t border-border">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Sincronizare e-commerce (produse + comenzi)</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Trimite produsele si comenzile in Brevo pentru venit atribuit, segmentare dupa cumparaturi si retargeting de produs. Cosurile raman pe sistemul Edinio.</p>
              </div>
              <Toggle checked={ecommerceSync} onChange={setEcommerceSync} />
            </div>

            <div className="pt-3 border-t border-border">
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Contactele se adauga direct in lista. Pentru <span className="font-medium text-foreground">confirmare dubla (double opt-in)</span> GDPR,
                activeaz-o pe lista in contul tau Brevo. Adaugam automat atribute pentru segmentare: sursa, judet si valoarea comenzii.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <button type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-primary rounded-lg hover:bg-primary/90 disabled:opacity-60">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salveaza
            </button>
          </div>

          {/* Bulk sync */}
          <div className="p-4 rounded-xl border border-border">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Users className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Sincronizeaza clientii existenti</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Trimite in lista emailurile clientilor care au comandat deja (deduplicate). Foloseste doar daca ai consimtamantul lor de marketing.
                </p>
                {config.last_sync_at && (
                  <p className="text-[11px] text-muted-foreground mt-1">Ultima sincronizare: {new Date(config.last_sync_at).toLocaleString("ro-RO")}</p>
                )}
                <button type="button" onClick={syncCustomers} disabled={syncing || !hasList}
                  className="mt-2.5 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg border border-primary/30 text-primary hover:bg-primary/5 disabled:opacity-50">
                  {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sincronizeaza acum
                </button>
                {!hasList && <p className="text-[11px] text-amber-600 mt-1.5">Alege si salveaza o lista intai.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
