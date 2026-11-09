import { io } from 'socket.io-client'

export const socket = io('http://localhost:3001')

socket.on('connect', () => {
  console.log('GILA: підключено до сервера!', socket.id)
})

socket.on('disconnect', () => {
  console.log('GILA: з’єднання із сервером втрачено')
})

socket.on('connect_error', (error) => {
  console.log('Помилка підключення:', error.message)
})