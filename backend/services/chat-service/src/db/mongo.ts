import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/muni_chat';

export async function connectMongo(): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(MONGO_URI);
}

export async function disconnectMongo(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

export function isMongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}
