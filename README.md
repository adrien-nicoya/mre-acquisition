# Dashboard acquisition — Challenges MRE (Sébastien Ascon)

- `/` : liste des challenges. `/challenge.html?c=<id>` : dashboard d'un challenge.
- Sources : AWeber (inscrits par tag sur la liste du challenge + broadcasts d'invitation) et Meta.
- Challenge `live` : données en direct. Challenge `done` : « Figer les données » → instantané dans Vercel Blob.

## Mise en route
1. Variables Vercel : voir `.env.example`. Connecter un store Blob.
2. Déployer, puis ouvrir `/api/aweber-auth` et autoriser le compte AWeber (une seule fois).

## Nouveau challenge
Un bloc dans `lib/challenges.js` (liste AWeber, préfixe des broadcasts, dates), puis push.
Nouveau tag affilié ou sous-source : l'ajouter dans `lib/channels.js`.
En fin de challenge : `status: "done"`, push, puis « Figer les données ».
