import { useEffect, useState } from 'react';
import { profileStore, type ProfileReel } from '../lib/profile';
import { API, getMe, initSession, saveConsent, setMeAvatar, logout } from '../lib/api';
import { initCreatorsFromApi } from '../lib/creators';
import { getPurchases, getLinkStatus, submitLinkRequest, type Purchase } from '../lib/purchases';
import { Pencil } from './Icons';

/** Réduit une image côté navigateur (max 512 px, WebP) avant envoi — pas de traitement serveur. */
async function shrink(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d')!.drawImage(bmp, 0, 0, cv.width, cv.height);
  return new Promise((res) => cv.toBlob((b) => res(b!), 'image/webp', 0.86));
}
async function upload(path: string, blob: Blob): Promise<string> {
  const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': blob.type }, body: blob });
  if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as any).error || `upload ${r.status}`);
  return ((await r.json()) as { url: string }).url;
}

export default function ProfilePanel({ onClose }: { onClose: () => void }) {
  const p = profileStore.load();
  const me = getMe();
  const [name, setName] = useState(p?.display_name || me?.display_name || '');
  const [city, setCity] = useState(p?.city || '');
  const [ig, setIg] = useState(p?.socials.ig || '');
  const [tt, setTt] = useState(p?.socials.tt || '');
  const [yt, setYt] = useState(p?.socials.yt || '');
  const [av, setAv] = useState<string | null>(p?.av || me?.avatar || null);
  const [reels, setReels] = useState<ProfileReel[]>(() => [0, 1, 2].map((i) => p?.reels[i] || { url: '', thumb: null }));
  const [visible, setVisible] = useState(!!me?.visible);
  const [dmsOpen, setDmsOpen] = useState(!!me?.dms_open);
  const [label, setLabel] = useState('Enregistrer');
  const [err, setErr] = useState('');
  const [pending, setPending] = useState(false);
  const [produits, setProduits] = useState<Purchase[]>([]);
  const [lienStatut, setLienStatut] = useState<'pending' | 'aucune' | null>(null);
  const [lienEmail, setLienEmail] = useState('');
  const [lienMsg, setLienMsg] = useState('');
  useEffect(() => profileStore.subscribe((d) => setAv(d.av)), []);
  useEffect(() => { getPurchases().then(setProduits).catch(() => {}); getLinkStatus().then(setLienStatut).catch(() => {}); }, []);

  async function pickAvatar(f: File) {
    try { const url = await upload(`${API}/media/avatar`, await shrink(f)); setAv(url); profileStore.setAvatar(url); setMeAvatar(url); }
    catch (e: any) { setErr(e.message); }
  }
  async function pickThumb(i: number, f: File) {
    try { const url = await upload(`${API}/media/reel/${i}`, await shrink(f, 720)); setReels((rs) => rs.map((x, j) => (j === i ? { ...x, thumb: url } : x))); profileStore.setReelThumb(i, url); }
    catch (e: any) { setErr(e.message); }
  }
  async function save() {
    setErr('');
    try {
      await profileStore.save({ display_name: name, city, socials: { ig: ig.trim(), tt: tt.trim(), yt: yt.trim() }, reels });
      await initCreatorsFromApi().catch(() => {});
      setLabel('Enregistré'); setTimeout(() => { setLabel('Enregistrer'); onClose(); }, 900);
    } catch (e: any) { setErr('Enregistrement refusé : ' + e.message); }
  }
  const toggle = (which: 'visible' | 'dms') => async () => {
    if (pending) return;
    setPending(true);
    const v = which === 'visible' ? !visible : visible, d = which === 'dms' ? !dmsOpen : dmsOpen;
    setVisible(v); setDmsOpen(d);
    try {
      await saveConsent(v, d);
    } catch {
      await initSession().catch(() => {});
      const m = getMe();
      setVisible(!!m?.visible); setDmsOpen(!!m?.dms_open);
      setErr('Réglage de confidentialité non enregistré — réessaie.');
    } finally {
      setPending(false);
    }
  };
  async function envoyerLiaison() {
    setLienMsg('');
    try { await submitLinkRequest(lienEmail); setLienStatut('pending'); setLienEmail(''); }
    catch (e: any) { setLienMsg(e.message); }
  }

  return (
    <>
      <div className="pf-head">
        <label className="pf-av" title="Changer la photo de profil" style={av ? { backgroundImage: `url(${av})` } : undefined}>
          {av ? '' : (name || '?').slice(0, 2).toUpperCase()}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAvatar(f); }} />
          <span className="pf-av-edit"><Pencil /></span>
        </label>
        <div><b>{name || 'Ton profil'}</b><span>{me?.founder ? 'Fondateur · FemzLab' : 'Membre FemzLab'}</span></div>
      </div>
      <div className="pf-right">
        <label>Nom affiché <input type="text" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Ville <input type="text" maxLength={80} value={city} placeholder="Paris" onChange={(e) => setCity(e.target.value)} /></label>
        <label>Instagram <input type="text" placeholder="@pseudo" value={ig} onChange={(e) => setIg(e.target.value)} /></label>
        <label>TikTok <input type="text" placeholder="@pseudo" value={tt} onChange={(e) => setTt(e.target.value)} /></label>
        <label>YouTube <input type="text" placeholder="@chaîne" value={yt} onChange={(e) => setYt(e.target.value)} /></label>
      </div>
      <div className="pf-reels">
        <span className="pf-sub">Mes 3 reels <em>— ils s'affichent sur ta carte du globe</em></span>
        {reels.map((r, i) => (
          <div className="pf-reel" key={i}>
            <label className={'pf-thumb' + (r.thumb ? ' filled' : '')} style={r.thumb ? { backgroundImage: `url(${r.thumb})` } : undefined}>
              <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickThumb(i, f); }} />
              +
            </label>
            <input type="url" placeholder={i === 0 ? 'Lien du reel 1 (Instagram / TikTok)' : `Lien du reel ${i + 1}`} value={r.url}
              onChange={(e) => setReels((rs) => rs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="pf-products">
        <span className="pf-sub">Mes produits</span>
        {produits.length === 0 && <p className="pf-sub" style={{ opacity: .7 }}>Aucun produit rattaché pour l'instant.</p>}
        {produits.map((p) => (
          <a key={p.product} className="pf-badge" href="https://www.femzlab.shop" target="_blank" rel="noopener">{p.product}</a>
        ))}
      </div>
      <div className="pf-privacy">
        <span className="pf-sub">Confidentialité</span>
        <button className="pf-tgrow" type="button" aria-busy={pending} onClick={() => void toggle('visible')()}><span>Apparaître sur le globe</span><span className={'tg' + (visible ? ' on' : '')} aria-hidden="true"><i /></span></button>
        <button className="pf-tgrow" type="button" aria-busy={pending} onClick={() => void toggle('dms')()}><span>Recevoir des messages</span><span className={'tg' + (dmsOpen ? ' on' : '')} aria-hidden="true"><i /></span></button>
        <p className="pf-sub" style={{ marginTop: 10 }}>Connexions : {(me?.providers || []).join(' · ') || '—'}
          {!me?.providers.includes('google') && <> · <a href="/espace/auth/google">ajouter Google</a></>}
          {!me?.providers.includes('discord') && <> · <a href="/espace/auth/discord">ajouter Discord</a></>}
        </p>
        {lienStatut === 'pending' ? (
          <p className="pf-sub" style={{ marginTop: 10 }}>Demande de liaison envoyée — en attente de validation par Femz.</p>
        ) : (
          <div className="pf-link-row" style={{ marginTop: 10 }}>
            <input type="email" placeholder="Email utilisé pour l'achat" value={lienEmail} onChange={(e) => setLienEmail(e.target.value)} />
            <button className="btn" type="button" onClick={() => void envoyerLiaison()}>Relier une autre adresse</button>
          </div>
        )}
        {lienMsg && <p className="login-err" role="alert">{lienMsg}</p>}
      </div>
      {err && <p className="login-err" role="alert">{err}</p>}
      <button className="btn btn-acc pf-save" onClick={() => void save()}>{label}</button>
      <button className="btn pf-save" type="button" onClick={() => void logout()}>Se déconnecter</button>
    </>
  );
}
