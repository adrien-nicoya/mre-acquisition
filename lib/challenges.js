// Un bloc par challenge. status : "live" (temps réel) ou "done" (terminé, peut être figé).
// awList : liste AWeber dédiée au challenge (inscrits + tags "[ch] …", classés dans lib/channels.js).
// emailList : liste AWeber d'où partent les emails d'invitation.
// emailPrefix : début du nom des broadcasts du challenge (ex. "MRE5 - Email #1").
// startDate : début des pubs. endDate : fin de l'acquisition (J1 du challenge).
// excludeEmails : optionnel, numéros d'emails à masquer.
export default [
  {
    id: 'mre-5',
    name: 'MRE 5',
    awList: 'awlist6977108',
    emailList: 'awlist4018449',
    emailPrefix: 'MRE5',
    startDate: '2026-10-01',
    endDate: '2026-10-18',
    status: 'live',
  },
];
