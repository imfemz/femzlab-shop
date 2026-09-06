import { useEffect, useState } from 'react';
import { API } from '../lib/api';

const ERREURS: Record<string, string> = {
  oauth: 'La connexion a échoué chez le fournisseur. Réessaie.',
  email_non_verifie: 'Ton email n’est pas vérifié chez ce fournisseur : vérifie-le, puis reviens.',
  identite_deja_liee: 'Cette connexion est déjà rattachée à un autre compte. Connecte-toi avec elle, ou contacte Femz pour fusionner.',
  email_deja_utilise: 'Cette adresse e-mail est déjà rattachée à un autre compte. Connecte-toi avec ce compte-là, ou contacte Femz.',
};

export default function Login() {
  const [membres, setMembres] = useState<number | null>(null);
  const erreur = new URLSearchParams(location.search).get('erreur');
  useEffect(() => { fetch(`${API}/stats`).then((r) => r.json()).then((s) => setMembres(s.membres)).catch(() => {}); }, []);
  return (
    <main className="login wrap">
      <h1 className="login-h">Ton espace FemzLab</h1>
      <p className="login-p">Ton profil, la carte des créateurs, tes messages — et tes produits, réunis au même endroit.</p>
      {erreur && <p className="login-err" role="alert">{ERREURS[erreur] || 'Connexion impossible pour le moment.'}</p>}
      <div className="login-btns">
        <a className="btn btn-acc" href="/espace/auth/google">Continuer avec Google</a>
        <a className="btn" href="/espace/auth/discord">Continuer avec Discord</a>
      </div>
      {membres !== null && <p className="login-count">{membres} {membres > 1 ? 'créateurs' : 'créateur'} dans la communauté</p>}
      <p className="login-note">Aucune adresse e-mail n’est jamais affichée. Tu choisis toi-même si tu apparais sur la carte.</p>
    </main>
  );
}
