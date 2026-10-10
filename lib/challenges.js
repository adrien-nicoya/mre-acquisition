// Un bloc par challenge. status : "live" (temps réel) ou "done" (terminé, peut être figé).
// awList : liste AWeber dédiée au challenge (inscrits + tags "[ch] …", classés dans lib/channels.js).
// emailList : liste AWeber d'où partent les emails d'invitation.
// Emails : tous les broadcasts envoyés depuis emailList entre startDate et endDate, numérotés dans l'ordre d'envoi
//   (Email #1 = premier envoi → tag « [ch] mail 1 »). emailExclude : mots des objets à écarter (newsletters…).
//   emailSequence : numéro d'UTM de chaque envoi, dans l'ordre (renvois = même numéro, regroupés sur une ligne).
//   emailSegment : optionnel, ne garder que les envois à ce segment AWeber.
// totalTags : tag(s) qui définissent le total d'inscrits, par ordre de priorité (le premier présent sur la liste est utilisé).
// startDate : début des pubs. endDate : fin de l'acquisition (J1 du challenge).
// targets : objectifs d'inscrits par canal → « % de l'objectif » ; objectif total = somme.
// excludeEmails : optionnel, numéros d'emails à masquer.
export default [
  {
    id: 'mre-5',
    name: 'MRE 5',
    awList: 'awlist6977108',
    emailList: 'awlist4018449',
    emailExclude: ['capsule immo'],
    emailSequence: [1, 2, 2, 3], // 9 oct. : mail 2 renvoyé en fin de journée
    totalTags: ['[ch] mre-inscrits', '[ch] nicoya-inscrits'],
    startDate: '2026-10-08',
    endDate: '2026-10-18',
    targets: { META: 2500, EMAIL: 800, ORGANIQUE: 50, AFFILIATION: 900, PARTENAIRES: 100 },
    status: 'live',
  },
];
