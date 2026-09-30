#!/usr/bin/env python3
"""Envoi d'une campagne e-mail FemzLab en SMTP Gmail (hello@imfemz.com).

Pourquoi pas le connecteur Gmail : il réécrit le HTML (supprime toutes les
<img>, le <style>, les `background:` et fait passer chaque lien par
google.com/url sans signature → page « Redirect notice »). En SMTP, le HTML
part tel quel.

Mot de passe d'application lu dans le Trousseau macOS, jamais sur disque :
  security add-generic-password -s femzlab-smtp -a hello@imfemz.com -w
(sans valeur après -w : le mot de passe est demandé, pas d'historique shell)

Usage :
  send.py check                                  # teste la connexion SMTP
  send.py preview --to fraps81@gmail.com         # 1 aperçu « Salut Femz, »
  send.py send --recipients liste.json --log envoi.json [--limit N]
Les destinataires : [{"email": ..., "prenom": ...}], un e-mail individuel
chacun. Le journal permet de reprendre sans renvoyer aux déjà servis.
"""
import argparse, html, json, os, smtplib, subprocess, sys, time
from email.message import EmailMessage
from email.utils import formataddr, make_msgid, formatdate

ICI = os.path.dirname(os.path.abspath(__file__))
EXPEDITEUR = 'hello@imfemz.com'
NOM = 'Femz'
SUJET = 'MotionLAB V2 est là'
GABARIT = 'motionlab-v2'


def mot_de_passe():
    r = subprocess.run(['security', 'find-generic-password', '-s', 'femzlab-smtp',
                        '-a', EXPEDITEUR, '-w'], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("Mot de passe absent du Trousseau (service femzlab-smtp). Voir l'en-tête du script.")
    return r.stdout.strip().replace(' ', '')


def connexion():
    s = smtplib.SMTP('smtp.gmail.com', 587, timeout=30)
    s.starttls()
    s.login(EXPEDITEUR, mot_de_passe())
    return s


def message(dest, prenom, sujet):
    salut = f'Salut {prenom},' if prenom else 'Salut,'
    corps_html = open(os.path.join(ICI, GABARIT + '.html'), encoding='utf-8').read()
    corps_txt = open(os.path.join(ICI, GABARIT + '.txt'), encoding='utf-8').read()
    m = EmailMessage()
    m['From'] = formataddr((NOM, EXPEDITEUR))
    m['To'] = dest
    m['Subject'] = sujet
    m['Date'] = formatdate(localtime=True)
    m['Message-ID'] = make_msgid(domain='imfemz.com')
    m['List-Unsubscribe'] = f'<mailto:{EXPEDITEUR}?subject=stop>'
    m.set_content(corps_txt.replace('{{SALUT}}', salut))
    m.add_alternative(corps_html.replace('{{SALUT}}', html.escape(salut)), subtype='html')
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mode', choices=['check', 'preview', 'send'])
    ap.add_argument('--to')
    ap.add_argument('--label', default='APERÇU')
    ap.add_argument('--recipients')
    ap.add_argument('--log')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--pause', type=float, default=3.0)
    a = ap.parse_args()

    if a.mode == 'check':
        connexion().quit()
        print('SMTP OK :', EXPEDITEUR)
        return

    if a.mode == 'preview':
        s = connexion()
        s.send_message(message(a.to, 'Femz', f'[{a.label} — pas envoyé aux clients] {SUJET}'))
        s.quit()
        print('aperçu envoyé à', a.to)
        return

    liste = json.load(open(a.recipients, encoding='utf-8'))
    journal = json.load(open(a.log)) if a.log and os.path.exists(a.log) else {}
    a_faire = [r for r in liste if journal.get(r['email'].lower()) != 'envoyé']
    if a.limit:
        a_faire = a_faire[:a.limit]
    print(f'{len(liste)} destinataires, {len(liste) - len(a_faire)} déjà servis, {len(a_faire)} à envoyer')
    s = connexion()
    for i, r in enumerate(a_faire, 1):
        cle = r['email'].lower()
        try:
            s.send_message(message(r['email'], (r.get('prenom') or '').strip(), SUJET))
            journal[cle] = 'envoyé'
            print(f'{i:>3}/{len(a_faire)}  ok     {r["email"]}')
        except smtplib.SMTPServerDisconnected:
            s = connexion()
            s.send_message(message(r['email'], (r.get('prenom') or '').strip(), SUJET))
            journal[cle] = 'envoyé'
            print(f'{i:>3}/{len(a_faire)}  ok*    {r["email"]}')
        except Exception as e:
            journal[cle] = f'échec : {e}'
            print(f'{i:>3}/{len(a_faire)}  ÉCHEC  {r["email"]}  {e}')
        if a.log:
            json.dump(journal, open(a.log, 'w'), ensure_ascii=False, indent=1)
        time.sleep(a.pause)
    s.quit()
    ok = sum(1 for v in journal.values() if v == 'envoyé')
    print(f'terminé : {ok} envoyés au total, {len(journal) - ok} en échec')


if __name__ == '__main__':
    main()
