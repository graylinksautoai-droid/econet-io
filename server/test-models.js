import Groq from "groq-sdk"
import dotenv from "dotenv"

dotenv.config()

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const models = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "mixtral-8x7b-32768"
]

async function testModels() {
  for (const model of models) {
    try {
      console.log(`\n🔍 Testing ${model}...`)
      const completion = await groq.chat.completions.create({
        model: model,
        messages: [{ role: "user", content: "Say 'working' in one word" }],
        max_tokens: 10
      })
      console.log(`✅ ${model} works! Response:`, completion.choices[0].message.content)
    } catch (error) {
      console.log(`❌ ${model} failed:`, error.message)
    }
  }
}

testModels()