import { socket } from './socket.js'
import './style.css'

const suits = ['♣', '♠', '♥', '♦']
const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

let players = []
let caller = 0
let trumpSuit = null
let currentTurn = 0
let currentTrick = []
let teamScores = [0, 0]
let teamPiles = [[], []]
let collectingTeam = null
let gameFinished = false
let botTimer = null

// Онлайн-кімната
let currentRoomCode = null
let roomPlayers = []
let roomHostId = null
let roomPartnerId = null
let onlineGameInfo = null
let onlineHand = []
let playerName = localStorage.getItem('gila-player-name') || ''

// Команди онлайн-гри
let onlineTeamAssignments = []

// Онлайн-стан гри
let onlinePublicState = {
  currentTrick: [],
  currentTurn: null,
  handsCount: [9, 9, 9, 9],
  teamScores: [0, 0],
  dealTricks: [0, 0],
  teamPiles: [[], []],
  roundNumber: 1,
  callerIndex: null,
  gameFinished: false
}

let onlineStatusMessage = ''
let onlineGameResult = null
let onlineRoundResult = null
let onlinePlayPending = false

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

// ========================================
// ТЕСТОВА ГРА З БОТАМИ
// ========================================

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

function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  return deck
}

function dealCards() {
  const deck = shuffle(createDeck())

  players = [
    { name: 'Ти', hand: deck.slice(0, 9) },
    { name: 'Бот 1', hand: deck.slice(9, 18) },
    { name: 'Бот 2', hand: deck.slice(18, 27) },
    { name: 'Бот 3', hand: deck.slice(27, 36) }
  ]

  caller = players.findIndex(player =>
    player.hand.some(card =>
      card.rank === '9' && card.suit === '♦'
    )
  )

  players.forEach(player => {
    player.hand.sort((a, b) => {
      const difference =
        suits.indexOf(a.suit) - suits.indexOf(b.suit)

      if (difference !== 0) return difference

      return ranks.indexOf(a.rank) - ranks.indexOf(b.rank)
    })
  })
}

function isTrump(card) {
  return (
    card.rank === '7' ||
    card.rank === 'J' ||
    card.suit === trumpSuit
  )
}

function getCardPower(card) {
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

function getLegalCards(playerIndex) {
  const hand = players[playerIndex].hand

  if (currentTrick.length === 0) {
    return hand
  }

  const firstCard = currentTrick[0].card

  if (isTrump(firstCard)) {
    const trumps = hand.filter(isTrump)

    return trumps.length ? trumps : hand
  }

  const sameSuit = hand.filter(card =>
    card.suit === firstCard.suit && !isTrump(card)
  )

  return sameSuit.length ? sameSuit : hand
}

function getTrickWinner() {
  const firstCard = currentTrick[0].card

  const trumpCards = currentTrick.filter(item =>
    isTrump(item.card)
  )

  if (trumpCards.length > 0) {
    return trumpCards.reduce((best, item) =>
      getCardPower(item.card) > getCardPower(best.card)
        ? item
        : best
    )
  }

  return currentTrick.reduce((best, item) =>
    item.card.suit === firstCard.suit &&
    getCardPower(item.card) > getCardPower(best.card)
      ? item
      : best
  )
}

function getTeam(playerIndex) {
  return playerIndex % 2 === 0 ? 0 : 1
}

function startGame() {
  clearTimeout(botTimer)

  dealCards()

  currentTrick = []
  teamScores = [0, 0]
  teamPiles = [[], []]
  collectingTeam = null
  gameFinished = false

  if (caller === 0) {
    showTrumpPicker()
  } else {
    const counts = suits.map(suit =>
      players[caller].hand.filter(card =>
        card.suit === suit &&
        card.rank !== '7' &&
        card.rank !== 'J'
      ).length
    )

    trumpSuit = suits[counts.indexOf(Math.max(...counts))]

    initializeGame()
  }
}

function showTrumpPicker() {
  document.querySelector('#app').innerHTML = `
    <main class="trump-picker">
      <h1>ТИ ХВАЛИШ!</h1>
      <p>У тебе 9 бубнова.</p>
      <h2>Обери козирну масть</h2>

      <div class="suit-buttons">
        ${suits.map(suit => `
          <button
            class="suit-btn ${'♥♦'.includes(suit) ? 'red' : ''}"
            data-suit="${suit}"
          >
            ${suit}
          </button>
        `).join('')}
      </div>
    </main>
  `

  document.querySelectorAll('.suit-btn').forEach(button => {
    button.addEventListener('click', () => {
      trumpSuit = button.dataset.suit
      initializeGame()
    })
  })
}

function initializeGame() {
  currentTurn = caller
  currentTrick = []
  teamScores = [0, 0]
  teamPiles = [[], []]
  collectingTeam = null
  gameFinished = false

  showTable()
  processTurn()
}

function playCard(playerIndex, card) {
  if (gameFinished || playerIndex !== currentTurn) return

  const legalCards = getLegalCards(playerIndex)

  if (!legalCards.includes(card)) {
    alert('Ти повинен дотримуватися масті або козиря!')
    return
  }

  players[playerIndex].hand.splice(
    players[playerIndex].hand.indexOf(card),
    1
  )

  currentTrick.push({
    playerIndex,
    card
  })

  currentTurn = (currentTurn + 1) % 4

  showTable()

  if (currentTrick.length === 4) {
    botTimer = setTimeout(finishTrick, 1200)
  } else {
    processTurn()
  }
}

function processTurn() {
  if (gameFinished || currentTrick.length === 4) return

  if (currentTurn === 0) {
    showTable()
    return
  }

  botTimer = setTimeout(() => {
    const legalCards = getLegalCards(currentTurn)

    const card = [...legalCards].sort(
      (a, b) => getCardPower(a) - getCardPower(b)
    )[0]

    playCard(currentTurn, card)
  }, 1200)
}

function finishTrick() {
  const winner = getTrickWinner()
  const winningPlayer = winner.playerIndex
  const winningTeam = getTeam(winningPlayer)
  const winnerName = players[winningPlayer].name

  collectingTeam = winningTeam

  showTable()

  document.querySelector('#game-status').textContent =
    `${winnerName} забирає взятку!`

  botTimer = setTimeout(() => {
    teamScores[winningTeam]++

    teamPiles[winningTeam].push(
      ...currentTrick.map(item => item.card)
    )

    currentTrick = []
    currentTurn = winningPlayer
    collectingTeam = null

    if (players.every(player => player.hand.length === 0)) {
      gameFinished = true

      showTable()

      const result = teamScores[getTeam(caller)] >= 5
        ? 'Команда того, хто хвалив, виконала хвалу!'
        : 'Команда того, хто хвалив, не виконала хвалу.'

      document.querySelector('#game-status').textContent =
        `${result} Рахунок: ${teamScores[0]} : ${teamScores[1]}`

      return
    }

    showTable()

    document.querySelector('#game-status').textContent =
      `${winnerName} забрав взятку!`

    botTimer = setTimeout(() => {
      if (currentTurn !== 0) {
        processTurn()
      } else {
        showTable()
      }
    }, 1000)

  }, 900)
}

function showTable() {
  const player = players[0]

  const names = [
    'Ти',
    'Бот 1',
    'Бот 2',
    'Бот 3'
  ]

  document.querySelector('#app').innerHTML = `
    <main class="game">

      <header class="game-header">
        <h1>ГИЛА</h1>
        <button id="back">Вийти</button>
      </header>

      <div class="scoreboard">
        <span>Команда 1: ${teamScores[0]}</span>
        <span>Команда 2: ${teamScores[1]}</span>
      </div>

      <div class="table">

        <div class="team-pile left-pile">
          <div class="pile-cards">
            ${teamPiles[0].length > 0 ? `
              <div class="card-back"></div>
              <div class="card-back second"></div>
              <div class="card-back third"></div>
            ` : ''}
          </div>

          <div class="pile-label">ТВОЯ КОМАНДА</div>
          <div class="pile-score">${teamScores[0]} взяток</div>
        </div>

        <div class="team-pile right-pile">
          <div class="pile-cards">
            ${teamPiles[1].length > 0 ? `
              <div class="card-back"></div>
              <div class="card-back second"></div>
              <div class="card-back third"></div>
            ` : ''}
          </div>

          <div class="pile-label">СУПЕРНИКИ</div>
          <div class="pile-score">${teamScores[1]} взяток</div>
        </div>

        <div class="opponent top">
          <span>Бот 2</span>
          <span>${players[2].hand.length} карт</span>
        </div>

        <div class="opponent left">
          <span>Бот 1</span>
          <span>${players[1].hand.length} карт</span>
        </div>

        <div class="center">

          <div class="trump-info">
            Козир:
            <strong class="${'♥♦'.includes(trumpSuit) ? 'red' : ''}">
              ${trumpSuit}
            </strong>
          </div>

          <div class="played-cards">
            ${currentTrick.map((item, index) => `
              <div class="played-card
                ${item.card.red ? 'red' : ''}
                ${index === currentTrick.length - 1 ? 'newly-played' : ''}
                from-${item.playerIndex}
                ${collectingTeam !== null ? `collecting-team-${collectingTeam}` : ''}"
              >
                ${names[item.playerIndex]}<br>
                ${item.card.rank}${item.card.suit}
              </div>
            `).join('')}
          </div>

          <div class="turn-info">
            ${gameFinished ? 'ГРУ ЗАВЕРШЕНО' :
              currentTurn === 0 ? 'ТВІЙ ХІД!' :
              `Ходить ${names[currentTurn]}`}
          </div>

          <div id="game-status"></div>

        </div>

        <div class="opponent right">
          <span>Бот 3</span>
          <span>${players[3].hand.length} карт</span>
        </div>

        <div class="my-hand">
          <h3>ТВОЇ КАРТИ</h3>

          <div class="cards">
            ${player.hand.map((card, index) => `
              <button
                class="card ${card.red ? 'red' : ''}"
                data-index="${index}"
                ${currentTurn !== 0 || gameFinished ? 'disabled' : ''}
              >
                <span>${card.rank}</span>
                <span>${card.suit}</span>
              </button>
            `).join('')}
          </div>
        </div>

      </div>
    </main>
  `

  document.querySelector('#back').addEventListener('click', () => {
    clearTimeout(botTimer)
    showMenu()
  })

  document.querySelectorAll('.card').forEach(button => {
    button.addEventListener('click', () => {
      const card = players[0].hand[
        Number(button.dataset.index)
      ]

      playCard(0, card)
    })
  })
}

// ========================================
// ОНЛАЙН-ГРА
// ========================================

socket.on('room-updated', room => {
  if (room.code !== currentRoomCode) return

  roomPlayers = room.players
  roomHostId = room.hostId
  roomPartnerId = room.partnerId || null

  showRoomLobby()
})

socket.on('game-started', info => {
  if (info.roomCode !== currentRoomCode) return

  onlineGameInfo = info
  onlineHand = []

  onlineTeamAssignments = info.teamAssignments || []

  onlinePublicState = {
    currentTrick: [],
    currentTurn: info.callerIndex,
    handsCount: [9, 9, 9, 9],
    teamScores: [...(info.teamScores || [0, 0])],
    dealTricks: [...(info.dealTricks || [0, 0])],
    teamPiles: info.teamPiles || [[], []],
    roundNumber: info.roundNumber || 1,
    callerIndex: info.callerIndex,
    gameFinished: false,
    teamAssignments: info.teamAssignments || []
  }

  onlineStatusMessage =
    `Роздача №${onlinePublicState.roundNumber}. Новий хвалець: ${info.players[info.callerIndex].name}.`

  onlineGameResult = null
  onlineRoundResult = null
  onlinePlayPending = false

  showOnlineGame()
})

socket.on('private-hand', data => {
  if (data.roomCode !== currentRoomCode) return

  onlineHand = data.hand || []

  showOnlineGame()
})

socket.on('trump-chosen', data => {
  if (data.roomCode !== currentRoomCode) return

  if (onlineGameInfo) {
    onlineGameInfo.trumpSuit = data.trumpSuit
  }

  onlineStatusMessage = 'Козир вибрано! Гра починається.'

  showOnlineGame()
})

socket.on('card-played', data => {
  if (data.roomCode !== currentRoomCode) return

  onlinePublicState = data
  onlineStatusMessage = ''

  showOnlineGame()
})

socket.on('trick-finished', data => {
  if (data.roomCode !== currentRoomCode) return

  onlinePublicState = data

  onlineStatusMessage =
    `${data.winnerName} забирає взятку!`

  showOnlineGame()
})

socket.on('trick-cleared', data => {
  if (data.roomCode !== currentRoomCode) return

  onlinePublicState = data

  const winner = onlineGameInfo.players[data.winnerIndex]

  onlineStatusMessage =
    `${winner.name} починає наступну взятку.`

  showOnlineGame()
})

socket.on('round-finished', data => {
  if (data.roomCode !== currentRoomCode) return

  onlineRoundResult = data

  onlinePublicState.teamScores = [...data.teamScores]

  if (data.dealTricks) {
    onlinePublicState.dealTricks = [...data.dealTricks]
  }

  if (data.teamPiles) {
    onlinePublicState.teamPiles = data.teamPiles
  }

  onlinePublicState.gameFinished = data.gameFinished
  onlinePublicState.currentTrick = []

  onlineStatusMessage = data.message

  showOnlineGame()
})

socket.on('game-finished', data => {
  if (data.roomCode && data.roomCode !== currentRoomCode) return

  onlineGameResult = data
  onlineStatusMessage = data.message

  onlinePublicState.gameFinished = true
  onlinePublicState.teamScores = [...data.teamScores]

  showOnlineGame()
})

// ========================================
// СТВОРЕННЯ ТА ПРИЄДНАННЯ ДО КІМНАТИ
// ========================================

function createOnlineRoom() {
  const input = document.querySelector('#player-name')

  playerName = input.value.trim() || 'Гравець 1'

  localStorage.setItem('gila-player-name', playerName)

  socket.emit('create-room', playerName, result => {
    if (!result?.success) {
      alert(result?.message || 'Не вдалося створити кімнату')
      return
    }

    currentRoomCode = result.roomCode
    roomHostId = socket.id
    roomPartnerId = null

    roomPlayers = [
      {
        id: socket.id,
        name: playerName
      }
    ]

    showRoomLobby()
  })
}

function joinOnlineRoom() {
  const nameInput = document.querySelector('#player-name')
  const codeInput = document.querySelector('#room-code')

  playerName = nameInput.value.trim() || 'Гравець'
  const roomCode = codeInput.value.trim().toUpperCase()

  if (!roomCode) {
    alert('Введи код кімнати')
    return
  }

  localStorage.setItem('gila-player-name', playerName)

  socket.emit('join-room', {
    roomCode,
    playerName
  }, result => {
    if (!result?.success) {
      alert(result?.message || 'Не вдалося приєднатися')
      return
    }

    currentRoomCode = result.roomCode
    showRoomLobby()
  })
}

// ========================================
// ВИБІР НАПАРНИКА
// ========================================

function selectOnlinePartner(partnerId) {
  if (!currentRoomCode) return

  if (socket.id !== roomHostId) {
    alert('Тільки лідер кімнати може вибрати напарника.')
    return
  }

  socket.emit('select-partner', {
    roomCode: currentRoomCode,
    partnerId
  }, result => {
    if (!result?.success) {
      alert(result?.message || 'Не вдалося вибрати напарника')
    }
  })
}

// ========================================
// ЛОБІ
// ========================================

function showRoomLobby() {
  const isHost = socket.id === roomHostId
  const isFull = roomPlayers.length === 4

  const selectedPartner = roomPlayers.find(
    player => player.id === roomPartnerId
  )

  const myPartner = selectedPartner
    ? selectedPartner.name
    : null

  const opponents = roomPlayers.filter(player =>
    player.id !== roomHostId &&
    player.id !== roomPartnerId
  )

  document.querySelector('#app').innerHTML = `
    <main class="menu">
      <h1>ГИЛА</h1>
      <p class="subtitle">Ігрова кімната</p>

      <div style="
        width:min(90%,420px);
        margin:20px auto;
        padding:22px;
        border:1px solid #20d9ed;
        border-radius:16px;
        background:rgba(5,20,35,.8);
        box-shadow:0 0 20px rgba(32,217,237,.12);
      ">
        <p style="margin:0 0 8px;color:#9bb7c8">
          КОД КІМНАТИ
        </p>

        <div style="
          font-size:36px;
          font-weight:800;
          letter-spacing:8px;
          color:#20d9ed;
        ">
          ${currentRoomCode}
        </div>

        <button id="copy-room-code" style="margin-top:12px">
          Копіювати код
        </button>
      </div>

      <h2>Гравці: ${roomPlayers.length}/4</h2>

      <div style="width:min(90%,420px);margin:12px auto">

        ${roomPlayers.map((player, index) => {
          const isHostPlayer = player.id === roomHostId
          const isSelectedPartner = player.id === roomPartnerId

          const isOpponent =
            roomPartnerId &&
            !isHostPlayer &&
            !isSelectedPartner

          let teamLabel = ''

          if (isHostPlayer && roomPartnerId) {
            teamLabel = '🟢 КОМАНДА 1'
          } else if (isSelectedPartner) {
            teamLabel = '🟢 КОМАНДА 1'
          } else if (isOpponent) {
            teamLabel = '🔴 КОМАНДА 2'
          }

          return `
            <div style="
              padding:12px;
              margin:7px 0;
              border:1px solid ${
                isSelectedPartner
                  ? '#35d477'
                  : isOpponent
                    ? 'rgba(255,100,100,.55)'
                    : 'rgba(32,217,237,.35)'
              };
              border-radius:10px;
              color:#fff;
              background:${
                isSelectedPartner
                  ? 'rgba(30,120,65,.18)'
                  : 'rgba(255,255,255,.04)'
              };
              text-align:left;
            ">

              <div style="
                display:flex;
                justify-content:space-between;
                align-items:center;
                gap:8px;
                flex-wrap:wrap;
              ">
                <strong>
                  ${index + 1}. ${escapeHtml(player.name)}
                  ${isHostPlayer ? ' 👑' : ''}
                </strong>

                <span style="
                  font-size:11px;
                  font-weight:bold;
                  color:${
                    isSelectedPartner
                      ? '#35d477'
                      : isOpponent
                        ? '#ff8585'
                        : '#9bb7c8'
                  };
                ">
                  ${teamLabel}
                </span>
              </div>

              ${isHost && isFull && !isHostPlayer ? `
                <button
                  class="select-partner-btn"
                  data-player-id="${escapeHtml(player.id)}"
                  style="
                    width:100%;
                    margin-top:10px;
                    padding:9px;
                    border:1px solid ${
                      isSelectedPartner ? '#35d477' : '#20d9ed'
                    };
                    border-radius:8px;
                    background:${
                      isSelectedPartner
                        ? 'rgba(53,212,119,.2)'
                        : 'rgba(32,217,237,.1)'
                    };
                    color:${
                      isSelectedPartner ? '#35d477' : '#20d9ed'
                    };
                    font-weight:bold;
                    cursor:pointer;
                  "
                >
                  ${isSelectedPartner
                    ? '✓ ТВОЙ НАПАРНИК'
                    : 'ОБРАТИ НАПАРНИКОМ'}
                </button>
              ` : ''}
            </div>
          `
        }).join('')}

        ${[0, 1, 2, 3].slice(roomPlayers.length).map(index => `
          <div style="
            padding:12px;
            margin:7px 0;
            border:1px dashed rgba(32,217,237,.25);
            border-radius:10px;
            color:#8aa1b0;
          ">
            ${roomPlayers.length + index + 1}. Очікуємо гравця...
          </div>
        `).join('')}

      </div>

      ${
        isFull
          ? myPartner
            ? `
              <div style="
                width:min(90%,420px);
                margin:15px auto;
                padding:12px;
                border:1px solid #35d477;
                border-radius:10px;
                color:#35d477;
                background:rgba(30,120,65,.12);
              ">
                🟢 Твій напарник: <strong>${escapeHtml(myPartner)}</strong>
                <br>
                <small>Інші два гравці — суперники.</small>
              </div>
            `
            : `
              <p style="color:#20d9ed">
                ${isHost
                  ? 'Вибери одного гравця собі в напарники.'
                  : 'Очікуємо, поки лідер вибере напарника...'}
              </p>
            `
          : ''
      }

      <p class="subtitle">
        ${isFull
          ? 'Усі гравці на місці!'
          : 'Надішли друзям код кімнати, щоб вони приєдналися.'}
      </p>

      ${isHost && isFull ? `
        <button
          id="start-online-game"
          ${!roomPartnerId ? 'disabled' : ''}
          style="
            opacity:${roomPartnerId ? '1' : '.45'};
            cursor:${roomPartnerId ? 'pointer' : 'not-allowed'};
          "
        >
          ПОЧАТИ ГРУ
        </button>

        ${!roomPartnerId ? `
          <p class="subtitle">
            Спочатку потрібно вибрати напарника.
          </p>
        ` : ''}
      ` : ''}

      ${!isHost ? `
        <p class="subtitle">
          Очікуємо, поки творець кімнати почне гру...
        </p>
      ` : ''}

      <p class="version">Онлайн-режим GILA</p>
    </main>
  `

  document.querySelector('#copy-room-code').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(currentRoomCode)
      alert('Код кімнати скопійовано!')
    } catch {
      alert(`Код кімнати: ${currentRoomCode}`)
    }
  })

  // Кнопки вибору напарника
  document.querySelectorAll('.select-partner-btn').forEach(button => {
    button.addEventListener('click', () => {
      selectOnlinePartner(button.dataset.playerId)
    })
  })

  const startButton = document.querySelector('#start-online-game')

  if (startButton && roomPartnerId) {
    startButton.addEventListener('click', () => {
      socket.emit('start-game', {
        roomCode: currentRoomCode
      }, result => {
        if (!result?.success) {
          alert(result?.message || 'Не вдалося почати гру')
        }
      })
    })
  }
}

// ========================================
// ІГРОВІ ДІЇ ОНЛАЙН
// ========================================

function chooseOnlineTrump(suit) {
  socket.emit('choose-trump', {
    roomCode: currentRoomCode,
    suit
  }, result => {
    if (!result?.success) {
      alert(result?.message || 'Не вдалося вибрати козир')
      showOnlineGame()
    }
  })
}

function playOnlineCard(card) {
  if (onlinePlayPending) return
  if (!onlineGameInfo) return
  if (!onlineGameInfo.trumpSuit) return
  if (onlinePublicState.gameFinished) return

  const myIndex = onlineGameInfo.players.findIndex(
    player => player.id === socket.id
  )

  if (myIndex === -1) return

  if (onlinePublicState.currentTurn !== myIndex) {
    alert('Зараз не твоя черга!')
    return
  }

  onlinePlayPending = true

  showOnlineGame()

  socket.emit('play-card', {
    roomCode: currentRoomCode,
    card
  }, result => {
    onlinePlayPending = false

    if (!result?.success) {
      alert(result?.message || 'Не вдалося викласти карту')
    }

    showOnlineGame()
  })
}

// ========================================
// ВИЗНАЧЕННЯ КОМАНДИ В ОНЛАЙН-ГРІ
// ========================================

function getOnlinePlayerTeam(playerIndex) {
  const assignment = onlineTeamAssignments.find(
    item => item.playerIndex === playerIndex
  )

  return assignment ? assignment.team : null
}

function getOnlineTeamNames(teamIndex) {
  if (!onlineGameInfo) return ''

  return onlineGameInfo.players
    .filter((player, index) =>
      getOnlinePlayerTeam(index) === teamIndex
    )
    .map(player => player.name)
    .join(' + ')
}

// ========================================
// ВІДОБРАЖЕННЯ СТОПОК КАРТ
// ========================================

function renderOnlinePile(teamIndex, label) {
  const piles = onlinePublicState.teamPiles || [[], []]
  const tricks = piles[teamIndex] || []
  const trickCount = tricks.length

  const cards = trickCount > 0
    ? `
      <div style="
        position:relative;
        width:52px;
        height:65px;
        margin:0 auto 5px;
      ">
        <div style="
          position:absolute;
          left:7px;
          top:5px;
          width:42px;
          height:58px;
          border:2px solid #20d9ed;
          border-radius:7px;
          background:linear-gradient(135deg,#123d5b,#071827);
          transform:rotate(9deg);
        "></div>

        <div style="
          position:absolute;
          left:3px;
          top:2px;
          width:42px;
          height:58px;
          border:2px solid #20d9ed;
          border-radius:7px;
          background:linear-gradient(135deg,#123d5b,#071827);
          transform:rotate(-6deg);
        "></div>

        <div style="
          position:absolute;
          left:5px;
          top:0;
          width:42px;
          height:58px;
          border:2px solid #20d9ed;
          border-radius:7px;
          background:linear-gradient(135deg,#164d69,#071827);
          display:flex;
          align-items:center;
          justify-content:center;
          color:#20d9ed;
          font-size:20px;
          box-shadow:0 0 12px rgba(32,217,237,.2);
        ">✦</div>
      </div>
    `
    : `
      <div style="
        width:42px;
        height:58px;
        margin:0 auto 5px;
        border:1px dashed rgba(32,217,237,.3);
        border-radius:7px;
        display:flex;
        align-items:center;
        justify-content:center;
        color:rgba(32,217,237,.4);
        font-size:20px;
      ">—</div>
    `

  return `
    <div style="
      width:105px;
      padding:8px 5px;
      border:1px solid rgba(32,217,237,.35);
      border-radius:12px;
      background:rgba(3,17,29,.85);
      text-align:center;
      color:white;
      box-shadow:0 0 10px rgba(32,217,237,.08);
    ">
      ${cards}

      <div style="
        color:#20d9ed;
        font-size:11px;
        font-weight:800;
        white-space:nowrap;
      ">
        ${label}
      </div>

      <div style="
        font-size:12px;
        margin-top:3px;
      ">
        ${trickCount} взяток
      </div>
    </div>
  `
}

// ========================================
// ВІДОБРАЖЕННЯ ОНЛАЙН-ГРИ
// ========================================

function showOnlineGame() {
  if (!onlineGameInfo) return

  const myIndex = onlineGameInfo.players.findIndex(
    player => player.id === socket.id
  )

  if (myIndex === -1) return

  const myTeam = getOnlinePlayerTeam(myIndex)

  const caller = myIndex === onlineGameInfo.callerIndex
  const trumpChosen = Boolean(onlineGameInfo.trumpSuit)

  const myTurn =
    onlinePublicState.currentTurn === myIndex

  const trick = onlinePublicState.currentTrick || []

  const canPlay =
    myTurn &&
    trumpChosen &&
    !onlinePublicState.gameFinished &&
    trick.length < 4 &&
    !onlinePlayPending

  const sortedHand = [...onlineHand].sort((a, b) => {
    const suitOrder = ['♣', '♠', '♥', '♦']
    const rankOrder = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

    const suitDifference =
      suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit)

    if (suitDifference !== 0) return suitDifference

    return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
  })

  const teamScores = onlinePublicState.teamScores || [0, 0]
  const dealTricks = onlinePublicState.dealTricks || [0, 0]
  const handsCount = onlinePublicState.handsCount || [9, 9, 9, 9]

  // ========================================
  // ПІДСВІТКА ДОЗВОЛЕНИХ КАРТ
  // ========================================

  let highlightedCards = []

  if (
    myTurn &&
    !onlinePlayPending &&
    onlineHand.length > 0 &&
    trumpChosen &&
    !onlinePublicState.gameFinished &&
    trick.length < 4
  ) {
    if (trick.length === 0) {
      highlightedCards = [...onlineHand]
    } else {
      const firstCard = trick[0].card
      const currentTrump = onlineGameInfo.trumpSuit

      const isOnlineTrump = card =>
        card.rank === '7' ||
        card.rank === 'J' ||
        card.suit === currentTrump

      if (isOnlineTrump(firstCard)) {
        const trumps = onlineHand.filter(isOnlineTrump)

        highlightedCards = trumps.length > 0
          ? trumps
          : [...onlineHand]
      } else {
        const sameSuit = onlineHand.filter(card =>
          card.suit === firstCard.suit &&
          !isOnlineTrump(card)
        )

        highlightedCards = sameSuit.length > 0
          ? sameSuit
          : [...onlineHand]
      }
    }
  }

  const highlightedCardKeys = new Set(
    highlightedCards.map(card => `${card.rank}${card.suit}`)
  )

  // Порядок місць за годинниковою стрілкою:
  // ти знизу → наступний гравець зліва →
  // третій зверху → четвертий справа.
  const positions = ['bottom', 'left', 'top', 'right']

  const playerElements = onlineGameInfo.players.map((player, index) => {
    const relativePosition = (index - myIndex + 4) % 4
    const position = positions[relativePosition]

    const playerTeam = getOnlinePlayerTeam(index)
    const isMyTeam = playerTeam === myTeam

    return `
      <div class="online-player ${position} ${index === myIndex ? 'me' : ''} ${index === onlinePublicState.currentTurn ? 'active-player' : ''}"
        style="
          padding:10px 15px;
          border:1px solid ${index === onlinePublicState.currentTurn ? '#20d9ed' : 'rgba(32,217,237,.35)'};
          border-radius:12px;
          background:rgba(5,20,35,.92);
          color:white;
          text-align:center;
          box-shadow:${index === onlinePublicState.currentTurn ? '0 0 14px rgba(32,217,237,.4)' : 'none'};
        "
      >
        <strong>${escapeHtml(player.name)}</strong>

        ${index === onlineGameInfo.callerIndex ? ' 👑' : ''}

        ${index === myIndex ? '<br><small>Ти</small>' : ''}

        <br>

        <small>
          ${playerTeam !== null
            ? `Команда ${playerTeam + 1}${isMyTeam ? ' 🟢' : ' 🔴'}`
            : ''}
        </small>

        <br>

        <small>${handsCount[index] ?? 0} карт</small>
      </div>
    `
  }).join('')

  const playedCards = trick.map(item => {
    const relativePosition =
      (item.playerIndex - myIndex + 4) % 4

    const position = positions[relativePosition]

    return `
      <div class="online-played-card ${position} ${item.card.red || '♥♦'.includes(item.card.suit) ? 'red' : ''}"
        style="
          position:absolute;
          padding:12px 16px;
          min-width:52px;
          border:2px solid #20d9ed;
          border-radius:10px;
          background:#f8f8f8;
          color:${item.card.red || '♥♦'.includes(item.card.suit) ? '#d71936' : '#101820'};
          font-size:20px;
          font-weight:800;
          text-align:center;
          box-shadow:0 0 14px rgba(32,217,237,.25);
          transform:translate(-50%,-50%);
          ${position === 'bottom' ? 'left:50%;top:85%;' : ''}
          ${position === 'top' ? 'left:50%;top:15%;' : ''}
          ${position === 'left' ? 'left:15%;top:50%;' : ''}
          ${position === 'right' ? 'left:85%;top:50%;' : ''}
        "
      >
        ${item.card.rank}${item.card.suit}
        <div style="font-size:10px;margin-top:3px">
          ${escapeHtml(item.playerName)}
        </div>
      </div>
    `
  }).join('')

  let statusText = onlineStatusMessage

  if (onlineGameResult) {
    statusText = onlineGameResult.message
  } else if (onlineRoundResult) {
    statusText = onlineRoundResult.message
  } else if (!trumpChosen) {
    statusText = caller
      ? 'Ти маєш вибрати козир.'
      : 'Очікуємо вибір козиря від хвалця...'
  } else if (onlinePublicState.gameFinished) {
    statusText = 'ГРУ ЗАВЕРШЕНО'
  } else if (onlinePlayPending) {
    statusText = 'Надсилаємо карту...'
  } else if (myTurn) {
    statusText = 'ТВІЙ ХІД! ОБЕРИ КАРТУ.'
  } else if (!onlineStatusMessage) {
    statusText =
      `Хід гравця: ${onlineGameInfo.players[onlinePublicState.currentTurn]?.name || '...'}`
  }

  const roundPointsTeam = onlineRoundResult?.scoringTeam
  const roundPoints = onlineRoundResult?.pointsAdded

  document.querySelector('#app').innerHTML = `
    <main class="game online-game">

      <header class="game-header">
        <h1>ГИЛА</h1>

        <span style="color:#20d9ed">
          Кімната ${currentRoomCode}
        </span>
      </header>

      <div class="online-round">
        РОЗДАЧА №${onlinePublicState.roundNumber || 1}
      </div>

      <div class="scoreboard" style="
        display:flex;
        justify-content:center;
        gap:25px;
        margin:15px auto;
      ">
        <span>Команда 1: ${teamScores[0]}</span>
        <span>Команда 2: ${teamScores[1]}</span>
      </div>

      <div style="
        text-align:center;
        color:#b8dce5;
        font-size:12px;
        margin:5px auto 10px;
      ">
        🟢 ${escapeHtml(getOnlineTeamNames(0))}
        &nbsp; | &nbsp;
        🔴 ${escapeHtml(getOnlineTeamNames(1))}
      </div>

      <div class="online-deal-tricks">
        Взятки за роздачу: ${dealTricks[0]} : ${dealTricks[1]}
      </div>

      <div class="online-caller">
        ${caller
          ? 'ТИ ХВАЛИШ! 👑'
          : `Хвалить: ${escapeHtml(onlineGameInfo.players[onlineGameInfo.callerIndex].name)}`}
      </div>

      ${!trumpChosen && caller && !onlineGameResult ? `
        <h3 style="text-align:center;margin:3px">
          ОБЕРИ КОЗИРНУ МАСТЬ
        </h3>

        <div class="suit-buttons">
          ${suits.map(suit => `
            <button
              class="suit-btn ${'♥♦'.includes(suit) ? 'red' : ''}"
              data-suit="${suit}"
            >
              ${suit}
            </button>
          `).join('')}
        </div>
      ` : ''}

      ${trumpChosen ? `
        <div class="online-trump">
          КОЗИР: ${onlineGameInfo.trumpSuit}
        </div>
      ` : ''}

      <div class="online-table" style="
        position:relative;
        width:min(94vw,700px);
        height:400px;
        margin:20px auto;
        border:2px solid rgba(32,217,237,.45);
        border-radius:45%;
        background:radial-gradient(ellipse,#123c39 0%,#092a28 60%,#071c25 100%);
        box-shadow:0 0 25px rgba(32,217,237,.12);
      ">

        ${playerElements}

        <div class="online-pile online-pile-left">
          ${renderOnlinePile(0, 'КОМАНДА 1')}
        </div>

        <div class="online-pile online-pile-right">
          ${renderOnlinePile(1, 'КОМАНДА 2')}
        </div>

        <div class="online-center" style="
          position:absolute;
          left:50%;
          top:50%;
          width:100%;
          height:100%;
          transform:translate(-50%,-50%);
          pointer-events:none;
        ">
          ${playedCards}
        </div>

        <div style="
          position:absolute;
          left:50%;
          top:50%;
          transform:translate(-50%,-50%);
          color:#20d9ed;
          font-size:13px;
          font-weight:700;
          text-align:center;
          pointer-events:none;
          opacity:.8;
        ">
          ${trick.length === 0 ? 'GILA' : `${trick.length}/4`}
        </div>

      </div>

      <div id="game-status" class="online-status">
        ${escapeHtml(statusText)}
      </div>

      ${onlineRoundResult ? `
        <div style="
          text-align:center;
          padding:15px;
          margin:15px auto;
          border:1px solid #20d9ed;
          border-radius:12px;
          max-width:400px;
          background:rgba(5,20,35,.8);
        ">
          <h3>РЕЗУЛЬТАТ РОЗДАЧІ №${onlineRoundResult.roundNumber || onlinePublicState.roundNumber}</h3>

          <p>Взятки команди 1: ${onlineRoundResult.dealTricks?.[0] ?? onlinePublicState.dealTricks[0]}</p>

          <p>Взятки команди 2: ${onlineRoundResult.dealTricks?.[1] ?? onlinePublicState.dealTricks[1]}</p>

          <p>
            Очки отримує:
            <strong style="color:#20d9ed">
              ${roundPointsTeam === undefined
                ? '—'
                : `Команда ${roundPointsTeam + 1}`}
            </strong>
          </p>

          <h2 style="color:#20d9ed">
            +${roundPoints ?? 0} очок
          </h2>

          <h3>ЗАГАЛЬНИЙ РАХУНОК</h3>
          <p>${teamScores[0]} : ${teamScores[1]}</p>

          ${!onlineRoundResult.gameFinished ? `
            <p>Наступна роздача почнеться автоматично.</p>
          ` : ''}
        </div>
      ` : ''}

      ${onlineGameResult ? `
        <div style="
          text-align:center;
          padding:20px;
          margin:15px auto;
          border:2px solid #20d9ed;
          border-radius:12px;
          max-width:400px;
          background:rgba(5,20,35,.9);
        ">
          <h2>МАТЧ ЗАВЕРШЕНО!</h2>

          <h3>${onlineGameResult.specialLoss ? '🥚 ТУХЛІ ЯЙЦЯ!' : '🏆 РЕЗУЛЬТАТ ГРИ'}</h3>

          <p>Рахунок: ${teamScores[0]} : ${teamScores[1]}</p>

          <p>${escapeHtml(onlineGameResult.message)}</p>
        </div>
      ` : ''}

      <div class="my-hand" style="margin-top:25px">
        <h3 style="text-align:center">
          ТВОЇ КАРТИ — ${onlineHand.length}
        </h3>

        <div class="cards">
          ${sortedHand.map(card => {
            const cardKey = `${card.rank}${card.suit}`
            const isHighlighted = highlightedCardKeys.has(cardKey)

            return `
              <button
                class="card ${card.red || '♥♦'.includes(card.suit) ? 'red' : ''} ${isHighlighted ? 'suit-highlight' : ''}"
                data-rank="${card.rank}"
                data-suit="${card.suit}"
                ${!canPlay ? 'disabled' : ''}
                style="
                  cursor:${canPlay ? 'pointer' : 'default'};
                  opacity:${isHighlighted ? '1' : canPlay ? '1' : '.7'};
                "
              >
                <span>${card.rank}</span>
                <span>${card.suit}</span>
              </button>
            `
          }).join('')}
        </div>
      </div>

    </main>
  `

  document.querySelectorAll('.suit-btn').forEach(button => {
    button.addEventListener('click', () => {
      chooseOnlineTrump(button.dataset.suit)
    })
  })

  document.querySelectorAll('.my-hand .card').forEach(button => {
    button.addEventListener('click', () => {
      const card = {
        rank: button.dataset.rank,
        suit: button.dataset.suit,
        red: '♥♦'.includes(button.dataset.suit)
      }

      playOnlineCard(card)
    })
  })
}

// ========================================
// ЗАХИСТ ІМЕНІ
// ========================================

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character])
}

// ========================================
// ГОЛОВНЕ МЕНЮ GILA — PUB DESIGN
// ========================================

function showMenu() {
  const displayName = playerName.trim() || 'Гравець'

  document.querySelector('#app').innerHTML = `
    <main class="menu menu-pub">

      <div class="menu-decoration">
        <div class="menu-decoration-card">
          <span>7</span>
          <strong>♣</strong>
          <span>7</span>
        </div>
      </div>

      <!-- ПРОФІЛЬ -->

      <div class="profile-bar">

        <div class="profile-avatar">
          ${escapeHtml(displayName.charAt(0).toUpperCase())}
        </div>

        <input
          id="player-name"
          type="text"
          maxlength="20"
          placeholder="Твоє ім'я"
          value="${escapeHtml(playerName)}"
        >

      </div>

      <!-- ЛОГОТИП -->

      <div class="menu-sign">

        <div class="sign-ornament">❧ ❦ ❧</div>

        <h1>ГИЛА</h1>

        <div class="sign-divider"></div>

        <p>КАРТКОВА ГРА 2 НА 2</p>

        <div class="sign-ornament bottom-ornament">❧ ❦ ❧</div>

      </div>

      <!-- КНОПКИ -->

      <div class="menu-actions">

        <button id="play" class="pub-button">
          ГРАТИ З БОТАМИ (ТЕСТ)
        </button>

        <button id="room" class="pub-button">
          СТВОРИТИ КІМНАТУ
        </button>

      </div>

      <!-- ПРИЄДНАННЯ ДО КІМНАТИ -->

      <div class="join-panel">

        <h2>ВВЕСТИ КОД КІМНАТИ</h2>

        <input
          id="room-code"
          type="text"
          maxlength="5"
          placeholder="Введіть код кімнати"
          autocomplete="off"
        >

        <button id="join-room" class="pub-button join-button">
          ПРИЄДНАТИСЯ
        </button>

      </div>

      <p class="version">Онлайн-режим GILA</p>

    </main>
  `

  const nameInput = document.querySelector('#player-name')
  const avatar = document.querySelector('.profile-avatar')

  nameInput.addEventListener('input', () => {
    const name = nameInput.value.trim()

    avatar.textContent = name
      ? name.charAt(0).toUpperCase()
      : '?'

    playerName = name
    localStorage.setItem('gila-player-name', playerName)
  })

  document.querySelector('#play').addEventListener('click', startGame)

  document.querySelector('#room').addEventListener('click', createOnlineRoom)

  document.querySelector('#join-room').addEventListener('click', joinOnlineRoom)

  document.querySelector('#room-code').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      joinOnlineRoom()
    }
  })
}

showMenu()