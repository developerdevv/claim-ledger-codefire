import mongoose from 'mongoose'
import { config } from './config.js'

export async function connectDb() {
  mongoose.set('strictQuery', true)
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10000 })
  } catch (err) {
    console.error(`[db] Could not connect to MongoDB: ${err.message}`)
    throw err
  }
  console.log('[db] Connected to MongoDB')
}

/** 'connected' | 'disconnected' — for GET /api/health. */
export function dbState() {
  return mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
}

export async function disconnectDb() {
  await mongoose.disconnect()
}
