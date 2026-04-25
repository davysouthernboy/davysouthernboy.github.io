// 1% Club question bank. Difficulty = % of general population who answered correctly.
// Questions styled after the show's logic-and-common-sense format.
// Answers verified. Add or swap freely - the engine picks one per difficulty per game.

const QUESTIONS = {
  90: [
    {
      q: "What number is missing?  2, 4, 6, __, 10",
      choices: ["7", "8", "9", "11"],
      answer: 1, // 8
    },
    {
      q: "How many sides does a hexagon have?",
      choices: ["5", "6", "7", "8"],
      answer: 1, // 6
    },
  ],
  80: [
    {
      q: "Which of these is BOTH a fruit and a color?",
      choices: ["Apple", "Orange", "Grape", "Banana"],
      answer: 1, // Orange
    },
    {
      q: "Which one of these does NOT belong with the others?",
      choices: ["Tulip", "Rose", "Oak", "Daisy"],
      answer: 2, // Oak (tree, not flower)
    },
  ],
  70: [
    {
      q: "A farmer has 17 sheep. All but 9 run away. How many are left?",
      choices: ["8", "9", "17", "0"],
      answer: 1, // 9 ("all but 9" means all except 9)
    },
    {
      q: "How many months in a year have 28 days?",
      choices: ["1", "2", "11", "12"],
      answer: 3, // 12 — every month has at least 28 days
    },
  ],
  60: [
    {
      q: "What comes next?  J, F, M, A, M, J, J, __",
      choices: ["A", "S", "J", "O"],
      answer: 0, // August (months of the year)
    },
    {
      q: "Rearrange the letters CIFAIPC to spell a famous what?",
      choices: ["River", "Country", "Ocean", "Mountain"],
      answer: 2, // PACIFIC
    },
  ],
  50: [
    {
      q: "Rearrange the letters of LISTEN to spell a word meaning 'quiet'.",
      choices: ["TINSEL", "SILENT", "ENLIST", "INLETS"],
      answer: 1, // SILENT
    },
    {
      q: "Two fathers and two sons went fishing. Each caught one fish, and they brought home three fish total. How is this possible?",
      choices: ["One lied", "Grandfather, father, son", "They shared one", "One escaped"],
      answer: 1, // 3 people: grandfather + father + son = 2 fathers + 2 sons
    },
  ],
  40: [
    {
      q: "Which letter comes next?  O, T, T, F, F, S, S, __",
      choices: ["E", "N", "T", "F"],
      answer: 0, // One Two Three Four Five Six Seven Eight
    },
    {
      q: "If today is Wednesday, what day will it be 100 days from now?",
      choices: ["Monday", "Tuesday", "Friday", "Sunday"],
      answer: 2, // 100 mod 7 = 2; Wed + 2 = Friday
    },
  ],
  30: [
    {
      q: "Take away one letter from SEVEN and you get a word for an even number. Which letter?",
      choices: ["S", "E", "V", "N"],
      answer: 0, // SEVEN minus S = EVEN
    },
    {
      q: "Which number, written as a word in English, has its letters in alphabetical order?",
      choices: ["Forty", "Six", "Ten", "Eight"],
      answer: 0, // F-O-R-T-Y is in ascending alphabetical order
    },
  ],
  20: [
    {
      q: "Which 5-letter word becomes shorter when you add 2 letters to the end?",
      choices: ["Short", "Quick", "Brief", "Small"],
      answer: 0, // SHORT + ER = SHORTER
    },
    {
      q: "A clock reads 3:15. What is the angle between the hour and minute hands?",
      choices: ["0°", "7.5°", "15°", "22.5°"],
      answer: 1, // Hour hand at 97.5°, minute hand at 90°, difference = 7.5°
    },
  ],
  10: [
    {
      q: "A shape has 4 sides. Opposite sides are parallel and all angles are 90°, but the sides are not all the same length. What is it?",
      choices: ["Square", "Rhombus", "Rectangle", "Trapezoid"],
      answer: 2, // Rectangle
    },
    {
      q: 'A famous play asks: "2B || !2B". What is the question?',
      choices: ["A math problem", "To be or not to be", "A logic puzzle", "Binary trivia"],
      answer: 1, // Hamlet — || is "or", ! is "not"
    },
  ],
  5: [
    {
      q: "What two letters complete this sequence?  T, N, E, C, R, E, P, __, __",
      choices: ["E, N", "N, O", "T, S", "E, R"],
      answer: 0, // "ONE PERCENT" reversed: T-N-E-C-R-E-P-(gap)-E-N-O. Next two letters = E, N
    },
    {
      q: 'Which word reads the same forwards as backwards?',
      choices: ["LEVEL", "LEMON", "LIVER", "LATER"],
      answer: 0, // LEVEL is a palindrome
    },
  ],
  1: [
    {
      q: "On a digital 24-hour clock showing HH:MM:SS, at how many moments per day do ALL SIX digits change simultaneously?",
      choices: ["1", "2", "10", "60"],
      answer: 0, // Only at 23:59:59 → 00:00:00 do all six positions change at once
    },
    {
      q: "How many squares of any size can be found on a standard 8×8 chessboard?",
      choices: ["64", "101", "204", "256"],
      answer: 2, // 1² + 2² + 3² + ... + 8² = 204
    },
  ],
};

const DIFFICULTY_ORDER = [90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 1];

function pickQuestionsForGame() {
  // Pick one random question per difficulty level
  const selected = [];
  for (const level of DIFFICULTY_ORDER) {
    const pool = QUESTIONS[level];
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    selected.push({
      level,
      question: chosen.q,
      choices: chosen.choices,
      answerIndex: chosen.answer,
    });
  }
  return selected;
}

module.exports = { QUESTIONS, DIFFICULTY_ORDER, pickQuestionsForGame };
