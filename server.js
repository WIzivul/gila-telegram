import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*'
  }
})

const rooms = new Map()

const suits = ['♣', '♠', '♥', '♦']
const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

const permanentTrumps = [
  '7♣', '7♠', '7♥', '7♦',
  'J♣', 'J♠', 'J♥', 'J♦'
]

const normalPower = {
  '6': 1,
  '8': 2,
  '9': 3,
  '10': 4,
  'Q': 5,
  'K': 6,
  'A': 7
}

// Генерація коду кімнати
function generateRoomCode() {
  let code

  do {
    code = Math.random().toString(36).substring(2, 7).toUpperCase()
  } while (rooms.has(code))

  return code
}

// Створення колоди
function createDeck() {
  const deck = []

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        suit,
        rank,
        red: suit === '♥' || suit === '♦'
      })
    }
  }

  return deck
}

// Перемішування
function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  return deck
}

// ==========================================
// КОМАНДИ
// ==========================================

// Визначення команди гравця за його індексом
function getPlayerTeam(room, playerIndex) {
  if (!room.players[playerIndex]) return null

  const playerId = room.players[playerIndex].id

  if (!room.teamIds) return null

  if (room.teamIds[0].includes(playerId)) {
    return 0
  }

  if (room.teamIds[1].includes(playerId)) {
    return 1
  }

  return null
}

// Отримання індексу напарника
function getPartnerIndex(room, playerIndex) {
  if (!room.players[playerIndex] || !room.teamIds) {
    return null
  }

  const playerId = room.players[playerIndex].id
  const team = getPlayerTeam(room, playerIndex)

  if (team === null) return null

  const partnerId = room.teamIds[team].find(
    id => id !== playerId
  )

  return room.players.findIndex(
    player => player.id === partnerId
  )
}

// Команди для передачі клієнтам
function getTeamAssignments(room) {
  if (!room.teamIds) return null

  return room.players.map((player, index) => ({
    playerId: player.id,
    playerIndex: index,
    team: getPlayerTeam(room, index)
  }))
}

// ==========================================
// КАРТИ
// ==========================================

// Перевірка козиря
function isTrump(card, trumpSuit) {
  return (
    card.rank === '7' ||
    card.rank === 'J' ||
    card.suit === trumpSuit
  )
}

// Сила карти
function getCardPower(card, trumpSuit) {
  if (card.rank === '6' && card.suit === trumpSuit) {
    return 100
  }

  const index = permanentTrumps.indexOf(
    card.rank + card.suit
  )

  if (index !== -1) {
    return 99 - index
  }

  if (card.suit === trumpSuit) {
    return 80 + (normalPower[card.rank] || 0)
  }

  return normalPower[card.rank] || 0
}

// Дозволені карти
function getLegalCards(room, playerIndex) {
  const hand = room.hands[playerIndex]

  if (room.currentTrick.length === 0) {
    return hand
  }

  const firstCard = room.currentTrick[0].card

  if (isTrump(firstCard, room.trumpSuit)) {
    const trumps = hand.filter(card =>
      isTrump(card, room.trumpSuit)
    )

    return trumps.length ? trumps : hand
  }

  const sameSuit = hand.filter(card =>
    card.suit === firstCard.suit &&
    !isTrump(card, room.trumpSuit)
  )

  return sameSuit.length ? sameSuit : hand
}

// Визначення переможця взятки
function getTrickWinner(room) {
  const firstCard = room.currentTrick[0].card

  const trumpCards = room.currentTrick.filter(item =>
    isTrump(item.card, room.trumpSuit)
  )

  if (trumpCards.length > 0) {
    return trumpCards.reduce((best, item) =>
      getCardPower(item.card, room.trumpSuit) >
      getCardPower(best.card, room.trumpSuit)
        ? item
        : best
    )
  }

  return room.currentTrick.reduce((best, item) =>
    item.card.suit === firstCard.suit &&
    getCardPower(item.card, room.trumpSuit) >
    getCardPower(best.card, room.trumpSuit)
      ? item
      : best
  )
}

// Копія стопок для передачі гравцям
function copyTeamPiles(room) {
  return room.teamPiles.map(teamPile =>
    teamPile.map(trick =>
      trick.map(item => ({
        ...item,
        card: { ...item.card }
      }))
    )
  )
}

// Публічний стан гри
function getPublicGameState(roomCode, room) {
  return {
    roomCode,
    currentTrick: room.currentTrick,
    currentTurn: room.currentTurn,
    handsCount: room.hands.map(hand => hand.length),
    teamScores: [...room.teamScores],
    dealTricks: [...room.dealTricks],
    teamPiles: copyTeamPiles(room),
    callerIndex: room.callerIndex,
    roundNumber: room.roundNumber,
    gameFinished: room.gameFinished,
    teamAssignments: getTeamAssignments(room)
  }
}

// ==========================================
// ОНОВЛЕННЯ КІМНАТИ
// ==========================================

function updateRoom(roomCode) {
  const room = rooms.get(roomCode)

  if (!room) return

  io.to(roomCode).emit('room-updated', {
    code: roomCode,
    hostId: room.host,
    partnerId: room.partnerId,

    players: room.players.map(player => ({
      id: player.id,
      name: player.name
    })),

    teamAssignments: getTeamAssignments(room),

    isFull: room.players.length === 4,
    canStart:
      room.players.length === 4 &&
      room.partnerId !== null
  })
}

// ==========================================
// РОЗДАЧА КАРТ
// ==========================================

function dealCards(roomCode, room) {
  const deck = shuffle(createDeck())

  room.hands = [
    deck.slice(0, 9),
    deck.slice(9, 18),
    deck.slice(18, 27),
    deck.slice(27, 36)
  ]

  room.trumpSuit = null
  room.currentTrick = []
  room.currentTurn = room.callerIndex

  room.dealTricks = [0, 0]

  room.teamPiles = [[], []]

  room.roundFinishing = false

  const gameInfo = {
    roomCode,

    players: room.players.map(player => ({
      id: player.id,
      name: player.name
    })),

    callerIndex: room.callerIndex,
    trumpSuit: null,

    teamScores: [...room.teamScores],
    dealTricks: [...room.dealTricks],
    teamPiles: copyTeamPiles(room),

    roundNumber: room.roundNumber,
    teamAssignments: getTeamAssignments(room)
  }

  io.to(roomCode).emit('game-started', gameInfo)

  room.players.forEach((player, index) => {
    io.to(player.id).emit('private-hand', {
      roomCode,
      hand: room.hands[index]
    })
  })

  console.log(
    `Роздача №${room.roundNumber} у кімнаті ${roomCode}. Хвалить гравець ${room.callerIndex + 1}`
  )
}

// ==========================================
// НАРАХУВАННЯ ОЧОК
// ==========================================

function calculateRoundPoints(tricks, isCallerTeam) {
  if (tricks === 0) return 36
  if (tricks === 1) return 24
  if (tricks === 2) return 12

  if (isCallerTeam) {
    return 12
  }

  if (tricks === 3 || tricks === 4) return 6

  return 0
}

// ==========================================
// НАСТУПНИЙ ХВАЛЕЦЬ
// ==========================================

function getNextCaller(room, previousCaller, oldScores) {
  const score0 = room.teamScores[0]
  const score1 = room.teamScores[1]

  const callerTeam = getPlayerTeam(room, previousCaller)
  const opponentTeam = 1 - callerTeam

  // Будка: однаковий рахунок, кратний 12
  if (
    score0 > 0 &&
    score0 === score1 &&
    score0 % 12 === 0
  ) {
    return previousCaller
  }

  // Правило 30: команда вперше досягла 30 або більше
  const reached30 =
    (oldScores[0] < 30 && score0 >= 30) ||
    (oldScores[1] < 30 && score1 >= 30)

  if (reached30) {
    const partnerIndex = getPartnerIndex(room, previousCaller)

    if (partnerIndex !== -1 && partnerIndex !== null) {
      return partnerIndex
    }
  }

  // Команда хвалившого відстає — той самий гравець
  if (room.teamScores[callerTeam] < room.teamScores[opponentTeam]) {
    return previousCaller
  }

  // Команда хвалившого випереджає — наступний за годинниковою
  if (room.teamScores[callerTeam] > room.teamScores[opponentTeam]) {
    return (previousCaller + 1) % 4
  }

  // Рівний рахунок, але не Будка
  return (previousCaller + 1) % 4
}

// ==========================================
// ЗАВЕРШЕННЯ РОЗДАЧІ
// ==========================================

function finishRound(roomCode, room) {
  if (room.roundFinishing || room.gameFinished) {
    return
  }

  room.roundFinishing = true

  const callerIndex = room.callerIndex
  const callerTeam = getPlayerTeam(room, callerIndex)
  const opponentTeam = 1 - callerTeam

  const callerTricks = room.dealTricks[callerTeam]
  const opponentTricks = room.dealTricks[opponentTeam]

  const callerSucceeded = callerTricks <= 4

  let scoringTeam
  let pointsAdded

  if (callerSucceeded) {
    scoringTeam = callerTeam

    pointsAdded = calculateRoundPoints(
      callerTricks,
      true
    )
  } else {
    scoringTeam = opponentTeam

    pointsAdded = calculateRoundPoints(
      opponentTricks,
      false
    )
  }

  const oldScores = [...room.teamScores]

  room.teamScores[scoringTeam] += pointsAdded

  const roundResult = {
    roomCode,
    roundNumber: room.roundNumber,

    callerIndex,
    callerTeam,
    callerTricks,
    opponentTricks,

    scoringTeam,
    pointsAdded,

    teamScores: [...room.teamScores],
    dealTricks: [...room.dealTricks],
    teamPiles: copyTeamPiles(room),

    callerSucceeded,

    teamAssignments: getTeamAssignments(room),

    message: callerSucceeded
      ? `Хвала виконана! Команда ${callerTeam + 1} отримує +${pointsAdded} очок.`
      : `Хвала не виконана! Команда ${opponentTeam + 1} отримує +${pointsAdded} очок.`
  }

  console.log('Роздача завершена.')

  console.log(
    `Взятки: ${room.dealTricks[0]} : ${room.dealTricks[1]}`
  )

  console.log(
    `Очки отримує команда ${scoringTeam + 1}: +${pointsAdded}`
  )

  console.log(
    `Загальний рахунок: ${room.teamScores[0]} : ${room.teamScores[1]}`
  )

  // Перевірка завершення матчу
  const losingTeam = room.teamScores.findIndex(
    score => score >= 60
  )

  if (losingTeam !== -1) {
    room.gameFinished = true

    const winnerTeam = losingTeam === 0 ? 1 : 0

    const specialLoss =
      losingTeam === callerTeam && !callerSucceeded

    io.to(roomCode).emit('round-finished', {
      ...roundResult,
      gameFinished: true
    })

    io.to(roomCode).emit('game-finished', {
      roomCode,
      teamScores: [...room.teamScores],
      callerWon: callerSucceeded,
      winnerTeam,
      losingTeam,
      specialLoss,
      teamAssignments: getTeamAssignments(room),

      message: specialLoss
        ? 'ТУХЛІ ЯЙЦЯ! Команда програла, набравши 60 або більше очок!'
        : `Команда ${losingTeam + 1} програла! Команда ${winnerTeam + 1} перемогла!`
    })

    console.log('Матч завершено:', roomCode)

    return
  }

  io.to(roomCode).emit('round-finished', {
    ...roundResult,
    gameFinished: false
  })

  room.callerIndex = getNextCaller(
    room,
    callerIndex,
    oldScores
  )

  console.log(
    `Наступним хвалить гравець ${room.callerIndex + 1}`
  )

  room.trickTimer = setTimeout(() => {
    const currentRoom = rooms.get(roomCode)

    if (!currentRoom || currentRoom.gameFinished) {
      return
    }

    currentRoom.roundNumber++

    dealCards(roomCode, currentRoom)
  }, 4500)
}

// ==========================================
// SOCKET.IO
// ==========================================

io.on('connection', socket => {
  console.log('Підключився гравець:', socket.id)

  // ========================================
  // СТВОРЕННЯ КІМНАТИ
  // ========================================

  socket.on('create-room', (playerName, callback) => {
    const roomCode = generateRoomCode()

    const room = {
      host: socket.id,

      partnerId: null,
      teamIds: null,

      players: [
        {
          id: socket.id,
          name: playerName || 'Гравець 1'
        }
      ],

      started: false,
      hands: [],

      callerIndex: null,
      trumpSuit: null,

      currentTrick: [],
      currentTurn: null,

      teamScores: [0, 0],
      dealTricks: [0, 0],
      teamPiles: [[], []],

      roundNumber: 0,

      gameFinished: false,
      roundFinishing: false,
      trickTimer: null
    }

    rooms.set(roomCode, room)

    socket.join(roomCode)
    socket.data.roomCode = roomCode

    callback?.({
      success: true,
      roomCode
    })

    updateRoom(roomCode)
  })

  // ========================================
  // ПРИЄДНАННЯ ДО КІМНАТИ
  // ========================================

  socket.on('join-room', ({ roomCode, playerName }, callback) => {
    const code = String(roomCode || '').toUpperCase().trim()
    const room = rooms.get(code)

    if (!room) {
      callback?.({
        success: false,
        message: 'Кімнату не знайдено'
      })

      return
    }

    if (room.started) {
      callback?.({
        success: false,
        message: 'Гра вже розпочалася'
      })

      return
    }

    if (room.players.length >= 4) {
      callback?.({
        success: false,
        message: 'Кімната вже заповнена'
      })

      return
    }

    if (room.players.some(player => player.id === socket.id)) {
      callback?.({
        success: true,
        roomCode: code
      })

      return
    }

    room.players.push({
      id: socket.id,
      name: playerName || `Гравець ${room.players.length + 1}`
    })

    socket.join(code)
    socket.data.roomCode = code

    callback?.({
      success: true,
      roomCode: code
    })

    updateRoom(code)
  })

  // ========================================
  // ВИБІР НАПАРНИКА
  // ========================================

  socket.on('select-partner', ({ roomCode, partnerId }, callback) => {
    const code = String(roomCode || '').toUpperCase().trim()
    const room = rooms.get(code)

    if (!room) {
      callback?.({
        success: false,
        message: 'Кімнату не знайдено'
      })

      return
    }

    if (room.started) {
      callback?.({
        success: false,
        message: 'Гра вже розпочалася'
      })

      return
    }

    if (room.host !== socket.id) {
      callback?.({
        success: false,
        message: 'Напарника може вибрати тільки лідер кімнати'
      })

      return
    }

    if (room.players.length !== 4) {
      callback?.({
        success: false,
        message: 'Спочатку потрібно зібрати 4 гравців'
      })

      return
    }

    const hostPlayer = room.players.find(
      player => player.id === room.host
    )

    const partnerPlayer = room.players.find(
      player => player.id === partnerId
    )

    if (!partnerPlayer || partnerId === room.host) {
      callback?.({
        success: false,
        message: 'Неправильний вибір напарника'
      })

      return
    }

    // Два суперники
    const opponents = room.players.filter(
      player =>
        player.id !== room.host &&
        player.id !== partnerId
    )

    // Правильний порядок за годинниковою стрілкою:
    // 0 — лідер
    // 1 — суперник ліворуч
    // 2 — напарник навпроти
    // 3 — суперник праворуч
    room.players = [
      hostPlayer,
      opponents[0],
      partnerPlayer,
      opponents[1]
    ]

    room.partnerId = partnerId

    updateRoom(code)

    callback?.({
      success: true,
      message: 'Напарника вибрано'
    })

    console.log(
      `У кімнаті ${code} вибрано напарника: ${partnerId}`
    )

    console.log(
      'Порядок гравців:',
      room.players.map(player => player.name)
    )
  })

  // ========================================
  // ПОЧАТОК ГРИ
  // ========================================

  socket.on('start-game', ({ roomCode }, callback) => {
    const code = String(roomCode || '').toUpperCase().trim()
    const room = rooms.get(code)

    if (!room) {
      callback?.({
        success: false,
        message: 'Кімнату не знайдено'
      })

      return
    }

    if (room.host !== socket.id) {
      callback?.({
        success: false,
        message: 'Почати гру може тільки творець кімнати'
      })

      return
    }

    if (room.players.length !== 4) {
      callback?.({
        success: false,
        message: 'Для початку потрібні 4 гравці'
      })

      return
    }

    if (!room.partnerId) {
      callback?.({
        success: false,
        message: 'Спочатку вибери собі напарника'
      })

      return
    }

    if (room.players[2]?.id !== room.partnerId) {
      callback?.({
        success: false,
        message: 'Помилка розташування гравців. Вибери напарника ще раз.'
      })

      return
    }

    if (room.started) {
      callback?.({
        success: false,
        message: 'Гра вже розпочалася'
      })

      return
    }

    // Фіксуємо команди на весь матч
    const opponents = room.players
      .filter(player =>
        player.id !== room.host &&
        player.id !== room.partnerId
      )
      .map(player => player.id)

    room.teamIds = [
      [room.host, room.partnerId],
      opponents
    ]

    room.started = true

    room.teamScores = [0, 0]
    room.dealTricks = [0, 0]
    room.teamPiles = [[], []]

    room.roundNumber = 1
    room.gameFinished = false
    room.roundFinishing = false

    // Першим хвалить гравець із 9♦
    const deck = shuffle(createDeck())

    room.hands = [
      deck.slice(0, 9),
      deck.slice(9, 18),
      deck.slice(18, 27),
      deck.slice(27, 36)
    ]

    room.callerIndex = room.hands.findIndex(hand =>
      hand.some(card =>
        card.rank === '9' && card.suit === '♦'
      )
    )

    room.trumpSuit = null
    room.currentTrick = []
    room.currentTurn = room.callerIndex

    const gameInfo = {
      roomCode: code,

      players: room.players.map(player => ({
        id: player.id,
        name: player.name
      })),

      callerIndex: room.callerIndex,
      trumpSuit: null,

      teamScores: [...room.teamScores],
      dealTricks: [...room.dealTricks],
      teamPiles: copyTeamPiles(room),

      roundNumber: room.roundNumber,
      teamAssignments: getTeamAssignments(room)
    }

    io.to(code).emit('game-started', gameInfo)

    room.players.forEach((player, index) => {
      io.to(player.id).emit('private-hand', {
        roomCode: code,
        hand: room.hands[index]
      })
    })

    callback?.({
      success: true
    })

    console.log('Гра розпочалася:', code)

    console.log(
      'Команда 1:',
      room.teamIds[0]
    )

    console.log(
      'Команда 2:',
      room.teamIds[1]
    )
  })

  // ========================================
  // ВИБІР КОЗИРЯ
  // ========================================

  socket.on('choose-trump', ({ roomCode, suit }, callback) => {
    const code = String(roomCode || '').toUpperCase().trim()
    const room = rooms.get(code)

    if (!room || !room.started || room.gameFinished) {
      callback?.({
        success: false,
        message: 'Гру не знайдено'
      })

      return
    }

    if (!suits.includes(suit)) {
      callback?.({
        success: false,
        message: 'Неправильна масть'
      })

      return
    }

    const playerIndex = room.players.findIndex(
      player => player.id === socket.id
    )

    if (playerIndex !== room.callerIndex) {
      callback?.({
        success: false,
        message: 'Козир може вибрати тільки той, хто зараз хвалить'
      })

      return
    }

    if (room.trumpSuit !== null) {
      callback?.({
        success: false,
        message: 'Козир уже вибрано'
      })

      return
    }

    room.trumpSuit = suit
    room.currentTurn = room.callerIndex

    io.to(code).emit('trump-chosen', {
      roomCode: code,
      trumpSuit: suit
    })

    callback?.({
      success: true
    })

    console.log(`Козир у кімнаті ${code}: ${suit}`)
  })

  // ========================================
  // ВИКЛАДАННЯ КАРТИ
  // ========================================

  socket.on('play-card', ({ roomCode, card }, callback) => {
    const code = String(roomCode || '').toUpperCase().trim()
    const room = rooms.get(code)

    if (!room || !room.started) {
      callback?.({
        success: false,
        message: 'Гру не знайдено'
      })

      return
    }

    if (room.gameFinished || room.roundFinishing) {
      callback?.({
        success: false,
        message: 'Роздача вже завершується'
      })

      return
    }

    if (!room.trumpSuit) {
      callback?.({
        success: false,
        message: 'Спочатку потрібно вибрати козир'
      })

      return
    }

    if (room.currentTrick.length === 4) {
      callback?.({
        success: false,
        message: 'Зачекай завершення взятки'
      })

      return
    }

    const playerIndex = room.players.findIndex(
      player => player.id === socket.id
    )

    if (playerIndex === -1) {
      callback?.({
        success: false,
        message: 'Тебе немає в цій кімнаті'
      })

      return
    }

    if (playerIndex !== room.currentTurn) {
      callback?.({
        success: false,
        message: 'Зараз не твоя черга'
      })

      return
    }

    const hand = room.hands[playerIndex]

    const cardIndex = hand.findIndex(
      item =>
        item.rank === card?.rank &&
        item.suit === card?.suit
    )

    if (cardIndex === -1) {
      callback?.({
        success: false,
        message: 'Такої карти немає у твоїй руці'
      })

      return
    }

    const selectedCard = hand[cardIndex]

    const legalCards = getLegalCards(room, playerIndex)

    const isLegal = legalCards.some(
      item =>
        item.rank === selectedCard.rank &&
        item.suit === selectedCard.suit
    )

    if (!isLegal) {
      callback?.({
        success: false,
        message: 'Ти повинен дотримуватися масті або козиря'
      })

      return
    }

    hand.splice(cardIndex, 1)

    io.to(socket.id).emit('private-hand', {
      roomCode: code,
      hand: room.hands[playerIndex]
    })

    room.currentTrick.push({
      playerIndex,
      playerName: room.players[playerIndex].name,
      card: selectedCard
    })

    // Наступний гравець за годинниковою стрілкою
    room.currentTurn = (room.currentTurn + 1) % 4

    callback?.({
      success: true
    })

    io.to(code).emit('card-played', getPublicGameState(code, room))

    console.log(
      `${room.players[playerIndex].name} виклав ${selectedCard.rank}${selectedCard.suit}`
    )

    // Усі четверо зіграли
    if (room.currentTrick.length === 4) {
      const winner = getTrickWinner(room)

      const winningPlayer = winner.playerIndex
      const winningTeam = getPlayerTeam(room, winningPlayer)

      room.dealTricks[winningTeam]++

      const winnerName = room.players[winningPlayer].name

      io.to(code).emit('trick-finished', {
        ...getPublicGameState(code, room),

        winnerIndex: winningPlayer,
        winnerName,
        winningTeam
      })

      console.log(
        `${winnerName} забирає взятку. Взятки: ${room.dealTricks[0]} : ${room.dealTricks[1]}`
      )

      room.trickTimer = setTimeout(() => {
        const currentRoom = rooms.get(code)

        if (
          !currentRoom ||
          currentRoom.currentTrick.length !== 4
        ) {
          return
        }

        currentRoom.teamPiles[winningTeam].push(
          currentRoom.currentTrick.map(item => ({
            ...item,
            card: { ...item.card }
          }))
        )

        currentRoom.currentTrick = []

        // Наступну взятку починає переможець попередньої
        currentRoom.currentTurn = winningPlayer

        const finished = currentRoom.hands.every(
          playerHand => playerHand.length === 0
        )

        io.to(code).emit('trick-cleared', {
          ...getPublicGameState(code, currentRoom),
          winnerIndex: winningPlayer
        })

        if (finished) {
          finishRound(code, currentRoom)
        }
      }, 1800)
    }
  })

  // ========================================
  // ВІДКЛЮЧЕННЯ ГРАВЦЯ
  // ========================================

  socket.on('disconnect', () => {
    const roomCode = socket.data.roomCode

    if (!roomCode) return

    const room = rooms.get(roomCode)

    if (!room) return

    room.players = room.players.filter(
      player => player.id !== socket.id
    )

    if (room.players.length === 0) {
      if (room.trickTimer) {
        clearTimeout(room.trickTimer)
      }

      rooms.delete(roomCode)

      console.log('Кімната видалена:', roomCode)

      return
    }

    if (!room.started) {
      // Якщо вийшов лідер — передаємо лідерство
      // та скидаємо попередній вибір напарника
      if (room.host === socket.id) {
        room.host = room.players[0].id
        room.partnerId = null
      }

      // Якщо вийшов обраний напарник
      if (room.partnerId === socket.id) {
        room.partnerId = null
      }
    } else {
      // Після початку гри команди не змінюються
      if (room.host === socket.id) {
        room.host = room.players[0].id
      }
    }

    updateRoom(roomCode)
  })
})

// ==========================================
// ПЕРЕВІРКА СЕРВЕРА
// ==========================================

app.get('/', (req, res) => {
  res.send('GILA server is running!')
})

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`GILA server запущений на порті ${PORT}`)
})