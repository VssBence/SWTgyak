/**
 * Kérdésbank - Vegyes kategóriájú kvízkérdések
 * Minden kérdéshez: text, options[], correctIndex, category, difficulty
 */

const questions = [
  // === TUDOMÁNY ===
  {
    text: "Melyik bolygó a Naprendszer legnagyobb bolygója?",
    options: ["Szaturnusz", "Jupiter", "Neptunusz", "Uránusz"],
    correctIndex: 1,
    category: "Tudomány",
    difficulty: "easy"
  },
  {
    text: "Mi a víz kémiai képlete?",
    options: ["CO2", "H2O", "NaCl", "O2"],
    correctIndex: 1,
    category: "Tudomány",
    difficulty: "easy"
  },
  {
    text: "Hány csont van egy felnőtt emberi testben?",
    options: ["186", "206", "226", "256"],
    correctIndex: 1,
    category: "Tudomány",
    difficulty: "medium"
  },
  {
    text: "Mi a fény sebessége vákuumban (km/s)?",
    options: ["150 000", "300 000", "450 000", "600 000"],
    correctIndex: 1,
    category: "Tudomány",
    difficulty: "medium"
  },
  {
    text: "Melyik elem a vegyjele 'Fe'?",
    options: ["Fluor", "Foszfor", "Vas", "Fermium"],
    correctIndex: 2,
    category: "Tudomány",
    difficulty: "easy"
  },

  // === TÖRTÉNELEM ===
  {
    text: "Melyik évben volt a francia forradalom kezdete?",
    options: ["1776", "1789", "1804", "1815"],
    correctIndex: 1,
    category: "Történelem",
    difficulty: "medium"
  },
  {
    text: "Ki volt Magyarország első királya?",
    options: ["Szent László", "Szent István", "Géza fejedelem", "Könyves Kálmán"],
    correctIndex: 1,
    category: "Történelem",
    difficulty: "easy"
  },
  {
    text: "Melyik évben ért véget a második világháború Európában?",
    options: ["1943", "1944", "1945", "1946"],
    correctIndex: 2,
    category: "Történelem",
    difficulty: "easy"
  },
  {
    text: "Melyik birodalom fővárosa volt Konstantinápoly?",
    options: ["Római Birodalom", "Perzsa Birodalom", "Bizánci Birodalom", "Oszmán Birodalom"],
    correctIndex: 2,
    category: "Történelem",
    difficulty: "medium"
  },
  {
    text: "Mikor volt a mohácsi csata?",
    options: ["1456", "1492", "1526", "1541"],
    correctIndex: 2,
    category: "Történelem",
    difficulty: "medium"
  },

  // === INFORMATIKA ===
  {
    text: "Melyik programozási nyelvet fejlesztette Brendan Eich 1995-ben?",
    options: ["Java", "Python", "JavaScript", "C++"],
    correctIndex: 2,
    category: "Informatika",
    difficulty: "easy"
  },
  {
    text: "Mit jelent a HTML rövidítés?",
    options: [
      "Hyper Text Markup Language",
      "High Tech Modern Language",
      "Hyper Transfer Markup Language",
      "Home Tool Markup Language"
    ],
    correctIndex: 0,
    category: "Informatika",
    difficulty: "easy"
  },
  {
    text: "Melyik adatstruktúra működik LIFO (Last In, First Out) elven?",
    options: ["Queue", "Stack", "Array", "LinkedList"],
    correctIndex: 1,
    category: "Informatika",
    difficulty: "medium"
  },
  {
    text: "Hány bit egy byte?",
    options: ["4", "8", "16", "32"],
    correctIndex: 1,
    category: "Informatika",
    difficulty: "easy"
  },
  {
    text: "Melyik protokoll használ alapértelmezetten 443-as portot?",
    options: ["HTTP", "FTP", "HTTPS", "SSH"],
    correctIndex: 2,
    category: "Informatika",
    difficulty: "medium"
  },

  // === FÖLDRAJZ ===
  {
    text: "Melyik a világ leghosszabb folyója?",
    options: ["Amazonas", "Nílus", "Jangce", "Mississippi"],
    correctIndex: 1,
    category: "Földrajz",
    difficulty: "medium"
  },
  {
    text: "Melyik ország fővárosa Canberra?",
    options: ["Új-Zéland", "Ausztrália", "Kanada", "Dél-Afrika"],
    correctIndex: 1,
    category: "Földrajz",
    difficulty: "medium"
  },
  {
    text: "Hány kontinens van a Földön?",
    options: ["5", "6", "7", "8"],
    correctIndex: 2,
    category: "Földrajz",
    difficulty: "easy"
  },
  {
    text: "Melyik a világ legmagasabb hegycsúcsa?",
    options: ["K2", "Kilimandzsáró", "Mont Blanc", "Mount Everest"],
    correctIndex: 3,
    category: "Földrajz",
    difficulty: "easy"
  },
  {
    text: "Melyik tenger határolja Magyarországot?",
    options: ["Adriai-tenger", "Fekete-tenger", "Egyik sem", "Balti-tenger"],
    correctIndex: 2,
    category: "Földrajz",
    difficulty: "easy"
  },

  // === KULTÚRA & SZÓRAKOZÁS ===
  {
    text: "Ki festette a Mona Lisát?",
    options: ["Michelangelo", "Raffaello", "Leonardo da Vinci", "Botticelli"],
    correctIndex: 2,
    category: "Kultúra",
    difficulty: "easy"
  },
  {
    text: "Melyik hangszer tartozik a rézfúvósok családjába?",
    options: ["Klarinét", "Trombita", "Fuvola", "Oboa"],
    correctIndex: 1,
    category: "Kultúra",
    difficulty: "medium"
  },
  {
    text: "Ki írta a Háború és béke című regényt?",
    options: ["Dosztojevszkij", "Tolsztoj", "Csehov", "Gogol"],
    correctIndex: 1,
    category: "Kultúra",
    difficulty: "medium"
  },
  {
    text: "Melyik országból származik a szushi?",
    options: ["Kína", "Korea", "Japán", "Thaiföld"],
    correctIndex: 2,
    category: "Kultúra",
    difficulty: "easy"
  },
  {
    text: "Hány szimfóniát írt Beethoven?",
    options: ["7", "9", "12", "15"],
    correctIndex: 1,
    category: "Kultúra",
    difficulty: "hard"
  },

  // === NEHÉZ KÉRDÉSEK ===
  {
    text: "Melyik algoritmus időbonyolultsága O(n log n) átlagos esetben?",
    options: ["Bubble Sort", "Merge Sort", "Selection Sort", "Insertion Sort"],
    correctIndex: 1,
    category: "Informatika",
    difficulty: "hard"
  },
  {
    text: "Mi a Planck-állandó nagyságrendje (J·s)?",
    options: ["10^-20", "10^-27", "10^-34", "10^-41"],
    correctIndex: 2,
    category: "Tudomány",
    difficulty: "hard"
  },
  {
    text: "Melyik évet nevezik a 'csodák évének' a fizikában (Einstein)?",
    options: ["1900", "1905", "1915", "1920"],
    correctIndex: 1,
    category: "Tudomány",
    difficulty: "hard"
  },
  {
    text: "Melyik magyar király vezette be az Aranybullát?",
    options: ["III. Béla", "II. András", "IV. Béla", "I. Lajos"],
    correctIndex: 1,
    category: "Történelem",
    difficulty: "hard"
  },
  {
    text: "Mi a TCP/IP modell hány rétegből áll?",
    options: ["3", "4", "5", "7"],
    correctIndex: 1,
    category: "Informatika",
    difficulty: "hard"
  }
];

module.exports = questions;
