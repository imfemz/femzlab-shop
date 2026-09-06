export default function ErrorScreen() {
  return (
    <main className="errscreen wrap" role="alert">
      <h1 className="login-h">L’espace est momentanément indisponible</h1>
      <p className="login-p">Le serveur ne répond pas. Rien n’est perdu : ton profil vit sur nos serveurs, pas dans ce navigateur. Réessaie dans un instant.</p>
      <button className="btn btn-acc" onClick={() => location.reload()}>Réessayer</button>
    </main>
  );
}
