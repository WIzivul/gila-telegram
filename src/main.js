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

// Анімація збирання взятки
let onlineCollectionAnimations = []
let onlineCollectedTrickKey = null
let onlineCollectionToken = 0

// ========================================
// АНІМАЦІЯ РОЗДАЧІ КАРТ
// ========================================

let onlineDealActive = false
let onlineDealStarted = false
let onlineDealToken = 0
let onlineDealOverlay = null

const DEAL_CARD_WIDTH = 43
const DEAL_CARD_HEIGHT = 61
const DEAL_CARD_INTERVAL = 85
const DEAL_CARD_DURATION = 480

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
// ОНОВЛЕННЯ DOM БЕЗ ПЕРЕЗАВАНТАЖЕННЯ
// ========================================

function morphDOM(oldNode, newNode) {
  if (!oldNode || !newNode) return

  if (
    oldNode.nodeType !== newNode.nodeType ||
    oldNode.nodeName !== newNode.nodeName
  ) {
    oldNode.replaceWith(newNode.cloneNode(true))
    return
  }

  if (oldNode.nodeType === Node.TEXT_NODE) {
    if (oldNode.textContent !== newNode.textContent) {
      oldNode.textContent = newNode.textContent
    }

    return
  }

  if (oldNode.nodeType !== Node.ELEMENT_NODE) return

  const oldAttributes = [...oldNode.attributes]
  const newAttributes = [...newNode.attributes]

  oldAttributes.forEach(attribute => {
    if (!newNode.hasAttribute(attribute.name)) {
      oldNode.removeAttribute(attribute.name)
    }
  })

  newAttributes.forEach(attribute => {
    if (oldNode.getAttribute(attribute.name) !== attribute.value) {
      oldNode.setAttribute(attribute.name, attribute.value)
    }
  })

  const oldChildren = [...oldNode.childNodes]
  const newChildren = [...newNode.childNodes]

  const maxLength = Math.max(
    oldChildren.length,
    newChildren.length
  )

  for (let i = 0; i < maxLength; i++) {
    const oldChild = oldChildren[i]
    const newChild = newChildren[i]

    if (!newChild && oldChild) {
      oldChild.remove()
      continue
    }

    if (newChild && !oldChild) {
      oldNode.appendChild(newChild.cloneNode(true))
      continue
    }

    morphDOM(oldChild, newChild)
  }
}

function updateOnlineDOM(html) {
  const app = document.querySelector('#app')

  if (!app) return

  const template = document.createElement('template')
  template.innerHTML = html.trim()

  const newContent = template.content
  const oldChildren = [...app.childNodes]
  const newChildren = [...newContent.childNodes]

  const maxLength = Math.max(
    oldChildren.length,
    newChildren.length
  )

  for (let i = 0; i < maxLength; i++) {
    const oldChild = oldChildren[i]
    const newChild = newChildren[i]

    if (!newChild && oldChild) {
      oldChild.remove()
      continue
    }

    if (newChild && !oldChild) {
      app.appendChild(newChild.cloneNode(true))
      continue
    }

    morphDOM(oldChild, newChild)
  }
}

// ========================================
// СТВОРЕННЯ КАРТИ ДЛЯ АНІМАЦІЇ
// ========================================

function createDealCard(card, isMine) {
  const element = document.createElement('div')

  element.style.cssText = `
    position:fixed;
    left:0;
    top:0;
    width:${DEAL_CARD_WIDTH}px;
    height:${DEAL_CARD_HEIGHT}px;
    z-index:1000000;
    pointer-events:none;
    perspective:700px;
    will-change:transform;
  `

  const red = card && '♥♦'.includes(card.suit)

  const back = document.createElement('div')

  back.className = 'online-deal-card-back'

  back.style.cssText = `
    position:absolute;
    inset:0;
    border:2px solid #f5f0df;
    border-radius:5px;

    background-color:#fffdf5;

    background-image:
      repeating-linear-gradient(
        45deg,
        transparent 0,
        transparent 3px,
        #bd3030 3px,
        #bd3030 5px,
        transparent 5px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent 0,
        transparent 3px,
        #287744 3px,
        #287744 5px,
        transparent 5px,
        transparent 8px
      );

    box-shadow:
      inset 0 0 0 2px #fffdf5,
      inset 0 0 0 3px rgba(50,50,35,.35),
      0 4px 12px rgba(0,0,0,.45);

    backface-visibility:hidden;
  `

  const front = document.createElement('div')

  front.style.cssText = `
    position:absolute;
    inset:0;
    display:flex;
    flex-direction:column;
    justify-content:space-between;
    padding:5px;
    border:2px solid #e2d3b8;
    border-radius:7px;
    background:linear-gradient(145deg,#fffdf5,#e8dfce);
    color:${red ? '#c52222' : '#17130f'};
    box-shadow:0 4px 12px rgba(0,0,0,.4);
    backface-visibility:hidden;
    transform:rotateY(180deg);
    font-family:Georgia,serif;
    font-size:14px;
    font-weight:bold;
  `

  if (card) {
    front.innerHTML = `
      <span>${card.rank}</span>
      <span style="
        align-self:center;
        font-size:21px;
      ">${card.suit}</span>
    `
  }

  const inner = document.createElement('div')

  inner.style.cssText = `
    position:absolute;
    inset:0;
    transform-style:preserve-3d;
    transform:rotateY(0deg);
  `

  inner.appendChild(back)
  inner.appendChild(front)

  element.appendChild(inner)

  if (!isMine) {
    element.dataset.cardType = 'back'
  }

  return { element, inner }
}

// ========================================
// СКИДАННЯ АНІМАЦІЇ РОЗДАЧІ
// ========================================

function resetOnlineDeal() {
  onlineDealToken++

  onlineDealActive = false
  onlineDealStarted = false

  if (onlineDealOverlay) {
    onlineDealOverlay.remove()
    onlineDealOverlay = null
  }
}

// ========================================
// ПАУЗА ДЛЯ АНІМАЦІЇ
// ========================================

function dealDelay(milliseconds) {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

// ========================================
// СТВОРЕННЯ КОЛОДИ В ЦЕНТРІ СТОЛУ
// ========================================

function createDealDeck(overlay, centerX, centerY) {
  const deck = document.createElement('div')

  deck.className = 'online-deal-deck'

  deck.style.cssText = `
    position:fixed;
    left:${centerX - 25}px;
    top:${centerY - 35}px;
    width:50px;
    height:70px;
    z-index:999999;

    border:2px solid #f5f0df;
    border-radius:6px;

    background-color:#fffdf5;

    background-image:
      repeating-linear-gradient(
        45deg,
        transparent 0,
        transparent 3px,
        #bd3030 3px,
        #bd3030 5px,
        transparent 5px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent 0,
        transparent 3px,
        #287744 3px,
        #287744 5px,
        transparent 5px,
        transparent 8px
      );

    box-shadow:
      inset 0 0 0 2px #fffdf5,
      inset 0 0 0 3px rgba(50,50,35,.35),
      0 5px 12px rgba(0,0,0,.5);

    display:flex;
    align-items:center;
    justify-content:center;
    pointer-events:none;
  `

  const secondCard = document.createElement('div')

  secondCard.style.cssText = `
    position:absolute;
    inset:0;

    border:2px solid #f5f0df;
    border-radius:6px;

    background-color:#fffdf5;

    background-image:
      repeating-linear-gradient(
        45deg,
        transparent 0,
        transparent 3px,
        #bd3030 3px,
        #bd3030 5px,
        transparent 5px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent 0,
        transparent 3px,
        #287744 3px,
        #287744 5px,
        transparent 5px,
        transparent 8px
      );

    box-shadow:
      inset 0 0 0 2px #fffdf5,
      inset 0 0 0 3px rgba(50,50,35,.35);

    transform:translate(3px,-3px) rotate(4deg);
    z-index:-1;
  `

  deck.appendChild(secondCard)
  overlay.appendChild(deck)

  deck.animate(
    [
      { transform: 'scale(.75)', opacity: 0 },
      { transform: 'scale(1.08)', opacity: 1 },
      { transform: 'scale(1)', opacity: 1 }
    ],
    {
      duration:450,
      easing:'cubic-bezier(.2,.8,.2,1)'
    }
  )

  return deck
}

// ========================================
// АНІМАЦІЯ ОДНІЄЇ КАРТИ
// ========================================

function animateDealCard({
  overlay,
  card,
  isMine,
  startX,
  startY,
  targetX,
  targetY,
  rotation,
  token
}) {
  if (token !== onlineDealToken) return null

  const { element, inner } = createDealCard(card, isMine)

  element.style.left = `${startX - DEAL_CARD_WIDTH / 2}px`
  element.style.top = `${startY - DEAL_CARD_HEIGHT / 2}px`

  overlay.appendChild(element)

  const moveX = targetX - startX
  const moveY = targetY - startY

  const animation = element.animate(
    [
      {
        transform: 'translate(0px,0px) rotate(0deg) scale(.8)',
        opacity: 0
      },
      {
        transform: `
          translate(${moveX * .18}px,${moveY * .18 - 24}px)
          rotate(${rotation * .35}deg)
          scale(1.08)
        `,
        opacity: 1,
        offset: .25
      },
      {
        transform: `
          translate(${moveX}px,${moveY}px)
          rotate(${rotation}deg)
          scale(1)
        `,
        opacity: 1
      }
    ],
    {
      duration: DEAL_CARD_DURATION,
      easing: 'cubic-bezier(.22,.75,.25,1)',
      fill: 'forwards'
    }
  )

  if (isMine && card) {
    animation.onfinish = () => {
      if (token !== onlineDealToken) return

      inner.animate(
        [
          { transform: 'rotateY(0deg)' },
          { transform: 'rotateY(180deg)' }
        ],
        {
          duration: 420,
          easing: 'ease-in-out',
          fill: 'forwards'
        }
      )
    }
  }

  return {
    element,
    animation
  }
}

// ========================================
// ЗАПУСК ПОВНОЇ РОЗДАЧІ 36 КАРТ
// ========================================

async function startOnlineDealAnimation() {
  if (onlineDealStarted || !onlineGameInfo) return
  if (onlineHand.length !== 9) return

  const table = document.querySelector('.online-table')

  if (!table) return

  onlineDealStarted = true
  onlineDealActive = true

  const token = ++onlineDealToken

  showOnlineGame()

  await new Promise(resolve => requestAnimationFrame(resolve))

  if (token !== onlineDealToken) return

  const myIndex = onlineGameInfo.players.findIndex(
    player => player.id === socket.id
  )

  if (myIndex === -1) {
    onlineDealActive = false
    showOnlineGame()
    return
  }

  const positions = Array(4).fill(null)

  positions[myIndex] = 'bottom'

  const myTeam = getOnlinePlayerTeam(myIndex)

  const teammateIndex = onlineGameInfo.players.findIndex(
    (player, index) =>
      index !== myIndex &&
      getOnlinePlayerTeam(index) === myTeam
  )

  if (teammateIndex !== -1) {
    positions[teammateIndex] = 'top'
  }

  const opponents = onlineGameInfo.players
    .map((player, index) => ({
      index,
      relativePosition: (index - myIndex + 4) % 4
    }))
    .filter(item =>
      item.index !== myIndex &&
      item.index !== teammateIndex
    )
    .sort((a, b) =>
      a.relativePosition - b.relativePosition
    )

  if (opponents[0]) {
    positions[opponents[0].index] = 'left'
  }

  if (opponents[1]) {
    positions[opponents[1].index] = 'right'
  }

  const tableRect = table.getBoundingClientRect()

  const centerX = tableRect.left + tableRect.width / 2
  const centerY = tableRect.top + tableRect.height / 2

  const overlay = document.createElement('div')

  overlay.className = 'online-deal-overlay'

  overlay.style.cssText = `
    position:fixed;
    inset:0;
    z-index:999998;
    pointer-events:none;
    overflow:hidden;
  `

  document.body.appendChild(overlay)
  onlineDealOverlay = overlay

  const deck = createDealDeck(
    overlay,
    centerX,
    centerY
  )

  await dealDelay(500)

  if (token !== onlineDealToken) return

  const targets = []

  for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
    if (playerIndex === myIndex) {
      const hand = document.querySelector(
        '.online-game .my-hand .cards'
      )

      if (!hand) continue

      const rect = hand.getBoundingClientRect()

      targets[playerIndex] = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
        rect
      }

      continue
    }

    const position = positions[playerIndex]

    const playerElement = document.querySelector(
      `.online-game .online-player.${position}`
    )

    if (!playerElement) continue

    const rect = playerElement.getBoundingClientRect()

    targets[playerIndex] = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      rect
    }
  }

  const sortedHand = [...onlineHand].sort((a, b) => {
    const suitOrder = ['♣', '♠', '♥', '♦']
    const rankOrder = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A']

    const suitDifference =
      suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit)

    if (suitDifference !== 0) return suitDifference

    return rankOrder.indexOf(a.rank) - rankOrder.indexOf(b.rank)
  })

  let myCardIndex = 0
  const flyingCards = []

  // Роздача йде по колу:
  // 1 карта кожному гравцеві, потім наступне коло.
  for (let cardNumber = 0; cardNumber < 9; cardNumber++) {
    for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
      if (token !== onlineDealToken) return

      const target = targets[playerIndex]

      if (!target) continue

      const isMine = playerIndex === myIndex

      let card = null
      let targetX = target.x
      let targetY = target.y

      if (isMine) {
        card = sortedHand[myCardIndex]

        // Розкладаємо карти в ряд у зоні руки.
        const handWidth = target.rect.width
        const spacing = handWidth / 9

        targetX =
          target.rect.left +
          spacing * (myCardIndex + .5)

        targetY =
          target.rect.top +
          target.rect.height / 2

        myCardIndex++
      } else {
        // Карти суперників летять сорочкою догори.
        const offset = cardNumber - 4

        targetX += offset * 3
        targetY += offset * 1.5
      }

      const rotation =
        (Math.random() - .5) * 18

      const result = animateDealCard({
        overlay,
        card,
        isMine,
        startX: centerX,
        startY: centerY,
        targetX,
        targetY,
        rotation,
        token
      })

      if (result) {
        flyingCards.push(result)
      }

      await dealDelay(DEAL_CARD_INTERVAL)
    }
  }

  // Чекаємо, поки останні карти долетять до гравців.
  await dealDelay(DEAL_CARD_DURATION + 150)

  if (token !== onlineDealToken) return

  // Прибираємо колоду та летючі карти.
  flyingCards.forEach(item => {
    item.animation.cancel()
    item.element.remove()
  })

  deck.remove()

  overlay.remove()
  onlineDealOverlay = null

  // Тепер показуємо справжні карти гравця.
  onlineDealActive = false

  onlineStatusMessage =
    onlineGameInfo.callerIndex === myIndex
      ? 'Роздачу завершено! Ти маєш 9♦. Обери козир.'
      : `Роздачу завершено! Хвалить ${onlineGameInfo.players[onlineGameInfo.callerIndex].name}.`

  showOnlineGame()
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
  trumpSuit = null

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
// ОНЛАЙН-ГРА: ПОДІЇ СЕРВЕРА
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

  resetOnlineDeal()
  resetOnlineCollection()

  onlineGameInfo = info
  onlineHand = []

  onlineDealActive = true
  onlineDealStarted = false

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

  onlineStatusMessage = 'Підготовка до роздачі карт...'

  onlineGameResult = null
  onlineRoundResult = null
  onlinePlayPending = false

  showOnlineGame()
})

socket.on('private-hand', data => {
  if (data.roomCode !== currentRoomCode) return

  onlineHand = data.hand || []

  showOnlineGame()

  // Запускаємо роздачу тільки після отримання власних карт.
  if (onlineHand.length === 9 && !onlineDealStarted) {
    requestAnimationFrame(() => {
      startOnlineDealAnimation()
    })
  }
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
  onlinePlayPending = false

  if ((data.currentTrick || []).length < 4) {
    onlineCollectedTrickKey = null
  }

  showOnlineGame()
})

// ========================================
// ЗАВЕРШЕННЯ ВЗЯТКИ ТА АНІМАЦІЯ
// ========================================

socket.on('trick-finished', data => {
  if (data.roomCode !== currentRoomCode) return

  onlinePublicState = data

  onlineStatusMessage =
    `${data.winnerName} забирає взятку!`

  showOnlineGame()

  requestAnimationFrame(() => {
    animateOnlineTrickCollection(data)
  })
})

socket.on('trick-cleared', data => {
  if (data.roomCode !== currentRoomCode) return

  onlinePublicState = data

  if ((data.currentTrick || []).length === 0) {
    onlineCollectedTrickKey = null
  }

  const winnerIndex = Number.isInteger(data.winnerIndex)
    ? data.winnerIndex
    : -1

  const winner = winnerIndex >= 0
    ? onlineGameInfo.players[winnerIndex]
    : null

  onlineStatusMessage = winner
    ? `${winner.name} починає наступну взятку.`
    : 'Наступна взятка.'

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

  onlineCollectedTrickKey = null

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
  if (onlineDealActive) return

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
  if (onlineDealActive) return
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

  document.querySelectorAll('.my-hand .card').forEach(button => {
    button.disabled = true
  })

  const status = document.querySelector('#game-status')

  if (status) {
    status.textContent = 'Надсилаємо карту...'
  }

  socket.emit('play-card', {
    roomCode: currentRoomCode,
    card
  }, result => {
    if (!result?.success) {
      onlinePlayPending = false

      alert(result?.message || 'Не вдалося викласти карту')

      showOnlineGame()
    }
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
// КЛЮЧ ВЗЯТКИ ДЛЯ КОНТРОЛЮ АНІМАЦІЇ
// ========================================

function getOnlineTrickKey(trick) {
  if (!Array.isArray(trick) || trick.length === 0) {
    return ''
  }

  return trick.map(item => {
    const playerIndex = Number.isInteger(item.playerIndex)
      ? item.playerIndex
      : item.playerName || ''

    return `${playerIndex}:${item.card?.rank || ''}${item.card?.suit || ''}`
  }).join('|')
}

// ========================================
// СКИДАННЯ АНІМАЦІЇ
// ========================================

function resetOnlineCollection() {
  onlineCollectionToken++

  onlineCollectionAnimations.forEach(item => {
    try {
      item.animation.cancel()
    } catch {}

    item.element?.remove()
  })

  onlineCollectionAnimations = []
  onlineCollectedTrickKey = null
}

// ========================================
// АНІМАЦІЯ ЗБИРАННЯ ВЗЯТКИ
// ========================================

function animateOnlineTrickCollection(data) {
  if (!onlineGameInfo) return

  const trick = data.currentTrick || []

  if (trick.length !== 4) return

  const trickKey = getOnlineTrickKey(trick)

  if (!trickKey || onlineCollectedTrickKey === trickKey) {
    return
  }

  const trickCards = document.querySelectorAll(
    '.online-game .online-played-card'
  )

  if (trickCards.length !== 4) return

  let winnerIndex = Number.isInteger(data.winnerIndex)
    ? data.winnerIndex
    : -1

  if (winnerIndex < 0 && data.winnerName) {
    winnerIndex = onlineGameInfo.players.findIndex(
      player => player.name === data.winnerName
    )
  }

  if (winnerIndex < 0 && data.winnerId) {
    winnerIndex = onlineGameInfo.players.findIndex(
      player => player.id === data.winnerId
    )
  }

  if (winnerIndex < 0) return

  const winningTeam = getOnlinePlayerTeam(winnerIndex)

  if (winningTeam !== 0 && winningTeam !== 1) return

  const pile = document.querySelector(
    winningTeam === 0
      ? '.online-pile-left'
      : '.online-pile-right'
  )

  if (!pile) return

  const pileRect = pile.getBoundingClientRect()

  const targetX = pileRect.left + pileRect.width / 2
  const targetY = pileRect.top + pileRect.height / 2

  const cards = [...trickCards]

  const animationToken = ++onlineCollectionToken

  onlineCollectedTrickKey = trickKey

  const flyingCards = []

  cards.forEach((originalCard, index) => {
    const rect = originalCard.getBoundingClientRect()

    if (!rect.width || !rect.height) return

    const flyingCard = originalCard.cloneNode(true)

    flyingCard.style.position = 'fixed'
    flyingCard.style.left = `${rect.left}px`
    flyingCard.style.top = `${rect.top}px`
    flyingCard.style.width = `${rect.width}px`
    flyingCard.style.height = `${rect.height}px`
    flyingCard.style.margin = '0'
    flyingCard.style.transform = 'none'
    flyingCard.style.zIndex = '999999'
    flyingCard.style.pointerEvents = 'none'
    flyingCard.style.opacity = '1'
    flyingCard.style.visibility = 'visible'
    flyingCard.style.willChange = 'transform, opacity'
    flyingCard.style.boxShadow = '0 0 18px rgba(32,217,237,.55)'
    flyingCard.style.transition = 'none'

    document.body.appendChild(flyingCard)

    const cardX = rect.left + rect.width / 2
    const cardY = rect.top + rect.height / 2

    flyingCards.push({
      element: flyingCard,
      original: originalCard,
      index,
      moveX: targetX - cardX,
      moveY: targetY - cardY
    })
  })

  if (flyingCards.length !== 4) {
    flyingCards.forEach(item => item.element.remove())
    onlineCollectedTrickKey = null
    return
  }

  cards.forEach(card => {
    card.style.visibility = 'hidden'
    card.style.opacity = '0'
    card.style.pointerEvents = 'none'
  })

  showOnlineGame()

  flyingCards.forEach(item => {
    const { element, index, moveX, moveY } = item

    const rotation = index % 2 === 0 ? 25 : -25

    const animation = element.animate(
      [
        {
          transform: 'translate(0px, 0px) rotate(0deg) scale(1)',
          opacity: 1,
          offset: 0
        },
        {
          transform: `
            translate(${moveX * 0.45}px, ${moveY * 0.45 - 35}px)
            rotate(${rotation * 0.5}deg)
            scale(0.85)
          `,
          opacity: 1,
          offset: 0.45
        },
        {
          transform: `
            translate(${moveX}px, ${moveY}px)
            rotate(${rotation}deg)
            scale(0.15)
          `,
          opacity: 0,
          offset: 1
        }
      ],
      {
        duration: 850,
        delay: index * 90,
        easing: 'cubic-bezier(0.22, 0.75, 0.3, 1)',
        fill: 'forwards'
      }
    )

    const animationItem = {
      animation,
      element
    }

    onlineCollectionAnimations.push(animationItem)

    animation.onfinish = () => {
      element.remove()

      onlineCollectionAnimations =
        onlineCollectionAnimations.filter(
          item => item !== animationItem
        )
    }

    animation.oncancel = () => {
      element.remove()

      onlineCollectionAnimations =
        onlineCollectionAnimations.filter(
          item => item !== animationItem
        )
    }
  })

  const totalDuration = 850 + 3 * 90

  setTimeout(() => {
    if (animationToken !== onlineCollectionToken) return

    flyingCards.forEach(item => {
      item.element.remove()
    })

    onlineCollectionAnimations =
      onlineCollectionAnimations.filter(item =>
        !flyingCards.some(card => card.element === item.element)
      )

    const currentKey = getOnlineTrickKey(
      onlinePublicState.currentTrick || []
    )

    if (currentKey === trickKey) {
      onlinePublicState.currentTrick = []
      showOnlineGame()
    }
  }, totalDuration + 150)
}

// ========================================
// ВІДОБРАЖЕННЯ СТОПОК КАРТ
// ========================================

function renderOnlinePile(teamIndex, label) {
  const piles = onlinePublicState.teamPiles || [[], []]
  const tricks = piles[teamIndex] || []
  const trickCount = tricks.length

  const cardStyle = `
    border:2px solid #f5f0df;
    border-radius:5px;

    background-color:#fffdf5;

    background-image:
      repeating-linear-gradient(
        45deg,
        transparent 0,
        transparent 3px,
        #bd3030 3px,
        #bd3030 5px,
        transparent 5px,
        transparent 8px
      ),
      repeating-linear-gradient(
        -45deg,
        transparent 0,
        transparent 3px,
        #287744 3px,
        #287744 5px,
        transparent 5px,
        transparent 8px
      );

    box-shadow:
      inset 0 0 0 2px #fffdf5,
      inset 0 0 0 3px rgba(50,50,35,.35),
      0 3px 7px rgba(0,0,0,.4);
  `

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
          ${cardStyle}
          transform:rotate(9deg);
        "></div>

        <div style="
          position:absolute;
          left:3px;
          top:2px;
          width:42px;
          height:58px;
          ${cardStyle}
          transform:rotate(-6deg);
        "></div>

        <div style="
          position:absolute;
          left:5px;
          top:0;
          width:42px;
          height:58px;
          ${cardStyle}
        "></div>
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

  const currentTrickKey = getOnlineTrickKey(trick)

  const isCollectedTrick =
    Boolean(onlineCollectedTrickKey) &&
    currentTrickKey === onlineCollectedTrickKey

  const canPlay =
    !onlineDealActive &&
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

  let highlightedCards = []

  if (
    !onlineDealActive &&
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

  const positionsByPlayer = Array(4).fill(null)

  positionsByPlayer[myIndex] = 'bottom'

  const teammateIndex = onlineGameInfo.players.findIndex(
    (player, index) =>
      index !== myIndex &&
      getOnlinePlayerTeam(index) === myTeam
  )

  if (teammateIndex !== -1) {
    positionsByPlayer[teammateIndex] = 'top'
  }

  const opponents = onlineGameInfo.players
    .map((player, index) => ({
      index,
      relativePosition: (index - myIndex + 4) % 4
    }))
    .filter(item =>
      item.index !== myIndex &&
      item.index !== teammateIndex
    )
    .sort((a, b) =>
      a.relativePosition - b.relativePosition
    )

  if (opponents[0]) {
    positionsByPlayer[opponents[0].index] = 'left'
  }

  if (opponents[1]) {
    positionsByPlayer[opponents[1].index] = 'right'
  }

  const playerElements = onlineGameInfo.players.map((player, index) => {
    const position = positionsByPlayer[index]
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

  const playedCards = `
    <div class="online-played-cards">
      ${trick.map((item, index) => {
        const playerIndex = Number.isInteger(item.playerIndex)
          ? item.playerIndex
          : onlineGameInfo.players.findIndex(
              player => player.name === item.playerName
            )

        const position =
          positionsByPlayer[playerIndex] || 'bottom'

        const isLastCard = index === trick.length - 1

        return `
          <div class="
            online-played-card
            ${item.card.red || '♥♦'.includes(item.card.suit) ? 'red' : ''}
            ${isLastCard ? 'newly-played' : ''}
            from-${position}
          "
            style="
              ${isCollectedTrick ? 'visibility:hidden;opacity:0;' : ''}
            "
          >
            <strong>${item.card.rank}${item.card.suit}</strong>
            <small>${escapeHtml(item.playerName)}</small>
          </div>
        `
      }).join('')}
    </div>
  `

  let statusText = onlineStatusMessage

  if (onlineDealActive) {
    statusText = '🂠 РОЗДАЧА КАРТ...'
  } else if (onlineGameResult) {
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

  const onlineHTML = `
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

      <div class="online-trump-area">
        ${!onlineDealActive && !trumpChosen && caller && !onlineGameResult ? `
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
      </div>

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

        <div class="online-center-label" style="
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

      <div class="online-round-result">
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
      </div>

      <div class="online-game-result">
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
      </div>

      <div class="my-hand" style="margin-top:25px">
        <h3 style="text-align:center">
          ТВОЇ КАРТИ — ${onlineHand.length}
        </h3>

        <div class="cards online-fan" style="
  ${onlineDealActive ? 'opacity:0;pointer-events:none;' : ''}
">
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

  updateOnlineDOM(onlineHTML)
}

// ========================================
// ЄДИНИЙ ОБРОБНИК НАТИСКАНЬ ОНЛАЙН-ГРИ
// ========================================

document.querySelector('#app').addEventListener('click', event => {
  const suitButton = event.target.closest(
    '.online-game .suit-btn'
  )

  if (suitButton) {
    chooseOnlineTrump(suitButton.dataset.suit)
    return
  }

  const cardButton = event.target.closest(
    '.online-game .my-hand .card'
  )

  if (cardButton && !cardButton.disabled) {
    const card = {
      rank: cardButton.dataset.rank,
      suit: cardButton.dataset.suit,
      red: '♥♦'.includes(cardButton.dataset.suit)
    }

    playOnlineCard(card)
  }
})

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
  resetOnlineDeal()
  resetOnlineCollection()

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

      <div class="menu-sign">

        <div class="sign-ornament">❧ ❦ ❧</div>

        <h1>ГИЛА</h1>

        <div class="sign-divider"></div>

        <p>КАРТКОВА ГРА 2 НА 2</p>

        <div class="sign-ornament bottom-ornament">❧ ❦ ❧</div>

      </div>

      <div class="menu-actions">

        <button id="play" class="pub-button">
          ГРАТИ З БОТАМИ (ТЕСТ)
        </button>

        <button id="room" class="pub-button">
          СТВОРИТИ КІМНАТУ
        </button>

      </div>

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