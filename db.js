import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_PASSWORD;
const client = new MongoClient(uri);

async function connectDB() {
  try {
    await client.connect();
    console.log("Connected to MongoDB");
    return client.db("nova-voice-agent");
  } catch (error) {
    console.error("Error connecting to MongoDB:", error);
  }
}

export default connectDB;
