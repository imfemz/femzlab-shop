# Suivi des CTA — dataLayer

Conteneur GTM : `GTM-5ZD8M8DC` (installé sur femzlab.shop, /portfolio, /avis, imfemz.com, imfemz.com/kit).

Chaque clic sur un élément `data-track` pousse dans le dataLayer :

```js
{ event: 'cta_click', cta_name: '<data-track>', cta_text: '<texte du lien>' }
```

`cta_pf_reel` et `cta_pf_clip` sont **volontairement partagés** entre plusieurs
éléments : c'est `cta_text` qui identifie le reel ou le clip précis.

Les suffixes `_2` désignent le doublon en pied de page d'un lien déjà présent en haut.

## femzlab.shop  (22 CTA)

- `cta_shop_nav_portfolio` — Portfolio
- `cta_shop_login` — Se connecter
- `cta_shop_signup` — Rejoindre
- `cta_shop_metavision_hero` — Découvrir MetaVision
- `cta_shop_metavision_pack` — Voir la formation
- `cta_shop_ultimate_ios` — Voir le pack
- `cta_shop_ghost_fx` — Voir le pack
- `cta_shop_fade_pack` — Télécharger
- `cta_shop_vortex` — Voir le pack
- `cta_shop_whoosh` — Voir le pack
- `cta_shop_asset_flash` — Effect · After Effects Flash Effec
- `cta_shop_asset_explosion` — Effect · After Effects Explosion E
- `cta_shop_asset_jump` — Effect · After Effects Jump Effect
- `cta_shop_discord` — (icône)
- `cta_shop_youtube` — (icône)
- `cta_shop_instagram` — (icône)
- `cta_shop_nav_portfolio_2` — Portfolio
- `cta_shop_cgv` — Conditions générales de vente
- `cta_shop_confidentialite` — Politique de confidentialité
- `cta_shop_instagram_2` — (icône)
- `cta_shop_youtube_2` — (icône)
- `cta_shop_email` — (icône)

## femzlab.shop/portfolio  (28 CTA)

- `cta_pf_nav_shop` — Boutique
- `cta_pf_nav_assets` — Assets
- `cta_pf_nav_profil` — À propos
- `cta_pf_instagram` — Instagram
- `cta_pf_reel` — Voir sur Instagram
- `cta_pf_reel` — Voir sur Instagram
- `cta_pf_reel` — Voir sur TikTok
- `cta_pf_reel` — Voir sur Instagram
- `cta_pf_reel` — Voir sur Instagram
- `cta_pf_reel` — Voir sur Instagram
- `cta_pf_clip` — Fresh LaDouille Fresh LaDouille - 
- `cta_pf_clip` — AnasOfficielVEVO Anas - Quelle lif
- `cta_pf_clip` — Naps Officiel Naps
- `cta_pf_clip` — DA Uzi DA Uzi - On se reverra plus
- `cta_pf_clip` — Denzo Officiel Denzo - Trop Dedans
- `cta_pf_clip` — winnterzuko winnterzuko & Skuna - 
- `cta_pf_clip` — Fresh LaDouille Fresh LaDouille - 
- `cta_pf_clip` — Afro S 667 Afro S 667 ft. Freeze C
- `cta_pf_clip` — NAKRY Nakry - Y'a plus one
- `cta_pf_clip` — ISK Officiel ISK - Acharné 11
- `cta_pf_clip` — Caballero & JeanJass High & Fines 
- `cta_pf_clip` — Favé Favé - GMAIL
- `cta_pf_nav_shop_2` — Boutique
- `cta_pf_nav_assets_2` — Assets
- `cta_pf_nav_profil_2` — À propos
- `cta_pf_instagram_2` — (icône)
- `cta_pf_youtube` — (icône)
- `cta_pf_email` — (icône)

## femzlab.shop/avis  (12 CTA)

- `cta_avis_nav_portfolio` — Portfolio
- `cta_avis_nav_shop` — Boutique
- `cta_avis_nav_assets` — Assets
- `cta_avis_nav_profil` — À propos
- `cta_avis_instagram` — Instagram
- `cta_avis_envoyer` — Envoyer mon avis
- `cta_avis_nav_shop_2` — Boutique
- `cta_avis_nav_assets_2` — Assets
- `cta_avis_nav_profil_2` — À propos
- `cta_avis_instagram_2` — (icône)
- `cta_avis_youtube` — (icône)
- `cta_avis_email` — (icône)

## imfemz.com  (11 CTA)

- `cta_bio_tab_shop` — Shop
- `cta_bio_metavision` — After Effects VFX Course MetaVisio
- `cta_bio_video` — Latest video How to make videos wi
- `cta_bio_assets` — My Assets The effects from my vide
- `cta_bio_game` — The game I made (prototype) Playab
- `cta_bio_discord` — Discord Join the community
- `cta_bio_kit` — My Gear Camera, laptop &amp; setup
- `cta_bio_instagram` — (icône)
- `cta_bio_tiktok` — (icône)
- `cta_bio_youtube` — (icône)
- `cta_bio_email` — (icône)

## imfemz.com/kit  (16 CTA)

- `cta_kit_tab_shop` — Shop
- `cta_kit_sony_zve1` — Sony ZV-E1
- `cta_kit_smallrig` — SmallRig ZV-E1 Cage Protects the c
- `cta_kit_dji_mic2` — DJI Mic 2 Wireless mic — clean sou
- `cta_kit_amaran` — amaran Pano 60c My key light — ful
- `cta_kit_iphone` — iPhone 13 Pro Max B-roll &amp; on-
- `cta_kit_macbook` — MacBook Pro M4 Max Silver — editin
- `cta_kit_after_effects` — After Effects All my VFX — the too
- `cta_kit_premiere` — Premiere Pro Editing &amp; final c
- `cta_kit_higgsfield` — Higgsfield AI video generation — m
- `cta_kit_claude_code` — Claude Code My AI editing engine b
- `cta_kit_lg_oled` — LG OLED 27″ 2K My main monitor — p
- `cta_kit_clavier` — Royal Kludge M75 Mechanical keyboa
- `cta_kit_mx_master` — Logitech MX Master 4 Black — my ev
- `cta_kit_logic_pro` — Logic Pro Sound design &amp; music
- `cta_kit_discord` — A question about my setup? Ask me 
