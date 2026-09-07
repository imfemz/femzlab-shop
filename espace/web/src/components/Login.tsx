import { useEffect, useState } from 'react';
import { API } from '../lib/api';
import { erreurUrl, texteErreur } from '../lib/erreurs';

export default function Login() {
  const [membres, setMembres] = useState<number | null>(null);
  /* lu au chargement du module, qui a déjà nettoyé l'URL */
  const erreur = erreurUrl();
  useEffect(() => { fetch(`${API}/stats`).then((r) => r.json()).then((s) => setMembres(s.membres)).catch(() => {}); }, []);
  return (
    <main className="login wrap">
      <h1 className="login-h">Ton espace FemzLab</h1>
      <p className="login-p">Ton profil, la carte des créateurs, tes messages — et tes produits, réunis au même endroit.</p>
      {erreur && <p className="login-err" role="alert">{texteErreur(erreur)}</p>}
      <div className="login-btns">
        <a className="btn btn-acc" href="/espace/auth/google">Continuer avec Google</a>
        <a className="btn" href="/espace/auth/discord">Continuer avec Discord</a>
      </div>
      {membres !== null && <p className="login-count">{membres} {membres > 1 ? 'créateurs' : 'créateur'} dans la communauté</p>}
      <p className="login-note">Aucune adresse e-mail n’est jamais affichée. Tu choisis toi-même si tu apparais sur la carte.</p>
    </main>
  );
}
